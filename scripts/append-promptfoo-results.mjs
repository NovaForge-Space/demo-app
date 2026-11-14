import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve(process.cwd(), ".promptfoo/latest-eval.json");
const reportPath = resolve(process.cwd(), "PROMPTFOO_TEST_RESULTS.md");

const formatScore = (score) =>
  typeof score === "number" ? `${(score * 100).toFixed(1)}%` : "n/a";
const formatSriLankaTime = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");

try {
  const evaluation = JSON.parse(await readFile(outputPath, "utf8"));
  const results = evaluation.results?.results ?? [];
  const passed = results.filter((result) => result.success === true).length;
  const failed = results.filter(
    (result) => result.success === false && !result.error,
  ).length;
  const errors = results.filter((result) => Boolean(result.error)).length;
  const total = results.length;
  const scoredResults = results.filter((result) => typeof result.score === "number");
  const averageScore = scoredResults.length
    ? scoredResults.reduce((sum, result) => sum + result.score, 0) / scoredResults.length
    : null;
  const categories = [...new Set(results
    .map((result) => result.testCase?.metadata?.category)
    .filter(Boolean))];
  const resultTokens = results.reduce(
    (total, result) => total + (result.gradingResult?.tokensUsed?.total ?? 0),
    0,
  );
  const totalTokens = evaluation.results?.stats?.tokenUsage?.total
    ?? evaluation.results?.stats?.tokensUsed?.total
    ?? (resultTokens || "n/a");
  const lines = [
    `\n## Promptfoo run — ${formatSriLankaTime()}`,
    "",
    `- **Evaluation ID:** \`${evaluation.evalId ?? "unknown"}\``,
    `- **Cases:** ${total}`,
    `- **Passed:** ${passed}`,
    `- **Failed:** ${failed}`,
    `- **Errors:** ${errors}`,
    `- **Total judge tokens:** ${totalTokens}`,
    "",
    "| Case | Status | Score | Latency |",
    "|---|---:|---:|---:|",
  ];

  for (const result of results) {
    const description = result.testCase?.description
      ?? result.description
      ?? `Case ${result.testIdx + 1}`;
    const status = result.error ? "ERROR" : result.success ? "PASS" : "FAIL";
    const latency = typeof result.latencyMs === "number"
      ? `${(result.latencyMs / 1000).toFixed(1)}s`
      : "n/a";
    lines.push(
      `| ${description.replaceAll("|", "\\|")} | ${status} | ${formatScore(result.score)} | ${latency} |`,
    );
  }

  lines.push(
    "",
    "> Generated locally. This report records aggregate evaluation metadata only; it does not include credentials or full model responses.",
    "",
  );
  const existing = await readFile(reportPath, "utf8").catch(() => "");
  const history = existing.replace(/^# Promptfoo Evaluation Summary[\s\S]*?(?=\n## Promptfoo run|$)/, "").trimStart();
  const summary = [
    "# Promptfoo Evaluation Summary",
    "",
    `**Latest run:** ${formatSriLankaTime()}`,
    "",
    "| Metric | Result |",
    "|---|---:|",
    `| Overall agent score | ${formatScore(averageScore)} |`,
    `| Pass rate | ${total ? `${((passed / total) * 100).toFixed(1)}%` : "n/a"} |`,
    `| Cases evaluated | ${total} |`,
    `| Failed cases | ${failed} |`,
    `| Evaluation errors | ${errors} |`,
    `| Categories covered | ${categories.length ? categories.join(", ") : "n/a"} |`,
    "",
    "> All report timestamps use Sri Lanka time (Asia/Colombo, UTC+05:30).",
    "",
    "> Overall agent score is the mean Promptfoo judge score for the latest run. It is an evaluation signal, not a scientific accuracy percentage.",
    "",
  ].join("\n");
  await writeFile(reportPath, `${summary}\n${history}${lines.join("\n")}\n`, "utf8");
  console.log(`Appended Promptfoo results to ${reportPath}`);
} catch (error) {
  console.error(`Could not append Promptfoo results: ${error.message}`);
  process.exitCode = 1;
}
