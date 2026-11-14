import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  encoder,
  email,
  getTransportMode,
  handshake,
  plainFetch,
  password,
  sealedFetch,
} from "../evals/promptfoo-provider.mjs";

const sourceDir = resolve(process.cwd(), "BE/nasa_datasets");
const files = (await readdir(sourceDir))
  .filter((name) => /\.(csv|tsv|xlsx|xlsm|xls|json|jsonl)$/i.test(name))
  .sort();
if (!files.length) throw new Error("No supported NASA tabular files were found.");

const boundary = `----novaforge-nasa-datasets-${crypto.randomUUID()}`;
const chunks = [];
for (const filename of files) {
  const content = await readFile(resolve(sourceDir, filename));
  chunks.push(
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    encoder.encode("\r\n"),
  );
}
chunks.push(encoder.encode(`--${boundary}--\r\n`));
const body = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
let offset = 0;
for (const chunk of chunks) {
  body.set(chunk, offset);
  offset += chunk.length;
}

const mode = await getTransportMode();
const session = mode === "off" ? null : await handshake();
const decoder = new TextDecoder();
const loginBody = encoder.encode(JSON.stringify({ email, password }));
const loginHeaders = { "content-type": "application/json" };
const login = session
  ? await sealedFetch(session, "POST", "/auth/login", loginBody, loginHeaders)
  : await plainFetch("POST", "/auth/login", loginBody, loginHeaders);
if (login.status !== 200) throw new Error(`NASA dataset upload login failed with HTTP ${login.status}.`);
const auth = JSON.parse(decoder.decode(login.body));
const uploadHeaders = {
  "content-type": `multipart/form-data; boundary=${boundary}`,
  authorization: `Bearer ${auth.token}`,
};
const query = "?visibility=global";
const result = session
  ? await sealedFetch(session, "POST", `/sources/upload${query}`, body, uploadHeaders)
  : await plainFetch("POST", `/sources/upload${query}`, body, uploadHeaders);
if (result.status !== 200) {
  throw new Error(`NASA dataset upload failed with HTTP ${result.status}: ${decoder.decode(result.body)}`);
}
const payload = JSON.parse(decoder.decode(result.body));
console.log(`Submitted ${payload.sources?.length ?? 0} NASA tabular files for global ingestion.`);
if (payload.rejected?.length) console.log(JSON.stringify(payload.rejected, null, 2));
