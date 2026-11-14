import { webcrypto } from "node:crypto";

const crypto = globalThis.crypto ?? webcrypto;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const apiUrl = (process.env.PROMPTFOO_API_URL ?? "http://localhost:8001/api").replace(/\/$/, "");
const email = process.env.PROMPTFOO_EMAIL;
const password = process.env.PROMPTFOO_PASSWORD;
const pinned = process.env.PROMPTFOO_SIGNING_PUBKEY;

if (!email || !password) {
  throw new Error("Set PROMPTFOO_EMAIL and PROMPTFOO_PASSWORD for live agent evaluation.");
}

const bytes = (value) => value instanceof Uint8Array ? value : new Uint8Array(value);
const b64 = (value) => Buffer.from(value).toString("base64");
const unb64 = (value) => bytes(Buffer.from(value, "base64"));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const u32 = (value) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
};
const pack = (meta, body) => {
  const encoded = encoder.encode(JSON.stringify(meta));
  return concat(u32(encoded.length), encoded, body);
};
const unpack = (blob) => {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const size = view.getUint32(0);
  return {
    meta: JSON.parse(decoder.decode(blob.slice(4, 4 + size))),
    body: blob.slice(4 + size),
  };
};
const hex = (value) => Buffer.from(value).toString("hex");
const importAes = (raw, usages) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);

async function open(key, blob, aad) {
  return bytes(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.slice(0, 12), additionalData: aad, tagLength: 128 },
    key,
    blob.slice(12),
  ));
}

async function handshake() {
  if (!pinned) {
    throw new Error("Set PROMPTFOO_SIGNING_PUBKEY to the backend's pinned public signing key.");
  }
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const clientPub = bytes(await crypto.subtle.exportKey("raw", pair.publicKey));
  const response = await fetch(`${apiUrl}/secure/handshake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_pub: b64(clientPub) }),
  });
  if (!response.ok) throw new Error(`Secure handshake failed with HTTP ${response.status}.`);
  const data = await response.json();
  const serverPub = unb64(data.server_pub);
  const salt = unb64(data.salt);
  const verifier = await crypto.subtle.importKey(
    "raw",
    unb64(pinned),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifier,
    unb64(data.sig),
    concat(clientPub, serverPub, salt, encoder.encode(data.sid)),
  );
  if (!signatureValid) throw new Error("Backend signing key does not match PROMPTFOO_SIGNING_PUBKEY.");
  const peer = await crypto.subtle.importKey("raw", serverPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, pair.privateKey, 256);
  const hkdf = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  const material = bytes(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(`novaforge-transport-v1|${data.sid}`) },
    hkdf,
    512,
  ));
  return {
    sid: data.sid,
    c2s: await importAes(material.slice(0, 32), ["encrypt"]),
    s2c: await importAes(material.slice(32), ["decrypt"]),
    skewMs: data.server_time - Date.now(),
  };
}

async function sealedFetch(session, method, path, body, headers = {}) {
  const timestamp = String(Date.now() + session.skewMs);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = bytes(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: encoder.encode(`nf1|req|${session.sid}|${timestamp}`),
      tagLength: 128,
    },
    session.c2s,
    pack({ m: method, p: `${new URL(apiUrl).pathname}${path}`, h: headers }, body),
  ));
  const response = await fetch(`${apiUrl}/secure/call`, {
    method: "POST",
    headers: {
      "x-nf-sid": session.sid,
      "x-nf-ts": timestamp,
      "content-type": "application/octet-stream",
    },
    body: concat(nonce, encrypted),
  });
  const kind = response.headers.get("x-nf-enc");
  if (!kind) {
    const detail = await response.text();
    throw new Error(`Encrypted API call failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  if (kind === "1") {
    const decoded = unpack(await open(session.s2c, bytes(await response.arrayBuffer()), encoder.encode(`nf1|res|${session.sid}|${hex(nonce)}`)));
    return { status: decoded.meta.s, headers: decoded.meta.h, body: decoded.body };
  }
  const reader = response.body.getReader();
  let buffer = "";
  let sequence = 0;
  const chunks = [];
  let status = 500;
  let firstFrame = true;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const dataLine = line.split("\n").find((entry) => entry.startsWith("data: "));
      if (!dataLine) continue;
      const frame = await open(
        session.s2c,
        unb64(dataLine.slice(6)),
        concat(encoder.encode(`nf1|str|${session.sid}|${hex(nonce)}|`), u32(sequence++)),
      );
      if (firstFrame) {
        const decoded = unpack(frame);
        if (decoded.meta.s) status = decoded.meta.s;
        if (decoded.body.length) chunks.push(decoder.decode(decoded.body));
        firstFrame = false;
      } else {
        chunks.push(decoder.decode(frame));
      }
    }
  }
  return { status, headers: {}, body: encoder.encode(chunks.join("")) };
}

async function plainFetch(method, path, body, headers = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body,
  });
  return { status: response.status, headers: Object.fromEntries(response.headers), body: bytes(await response.arrayBuffer()) };
}

async function getTransportMode() {
  const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Backend health check failed with HTTP ${response.status}.`);
  return (await response.json()).secure_transport ?? "required";
}

function parseFinal(stream) {
  let event = "";
  for (const line of decoder.decode(stream).split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    if (event === "final" && line.startsWith("data: ")) return JSON.parse(line.slice(6));
    if (event === "error" && line.startsWith("data: ")) throw new Error(JSON.parse(line.slice(6)).message);
  }
  throw new Error("The agent stream ended without a final response.");
}

export async function callApi(prompt) {
  const mode = await getTransportMode();
  const session = mode === "off" ? null : await handshake();
  const loginBody = encoder.encode(JSON.stringify({ email, password }));
  const loginHeaders = { "content-type": "application/json" };
  const login = session
    ? await sealedFetch(session, "POST", "/auth/login", loginBody, loginHeaders)
    : await plainFetch("POST", "/auth/login", loginBody, loginHeaders);
  if (login.status !== 200) throw new Error(`Evaluation login failed with HTTP ${login.status}.`);
  const auth = JSON.parse(decoder.decode(login.body));
  const chatBody = encoder.encode(JSON.stringify({
    message: prompt,
    kb_scope: "all",
    attachment_ids: [],
    filters: [],
  }));
  const chatHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${auth.token}`,
  };
  const result = session
    ? await sealedFetch(session, "POST", "/chat/stream", chatBody, chatHeaders)
    : await plainFetch("POST", "/chat/stream", chatBody, chatHeaders);
  if (result.status !== 200) throw new Error(`Evaluation chat request failed with HTTP ${result.status}.`);
  const final = parseFinal(result.body);
  return {
    output: JSON.stringify({
      message: final.message,
      intent: final.intent,
      citations: final.citations,
      widgets: final.widgets,
      blocked: final.blocked,
    }),
  };
}

export default class NovaForgeProvider {
  id() {
    return "novaforge-chat-agent";
  }

  async callApi(prompt) {
    return callApi(prompt);
  }
}
