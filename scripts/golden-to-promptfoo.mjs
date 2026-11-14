import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve(process.cwd(), "BE/evals/golden_dataset.jsonl");
const outputPath = resolve(process.cwd(), ".promptfoo/golden-tests.json");

const lines = (await readFile(sourcePath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const tests = lines.map((line, index) => {
  const record = JSON.parse(line);
  if (!record.id || !record.question || !record.category) {
    throw new Error(`Golden dataset record ${index + 1} is missing id, question, or category.`);
  }
  return {
    description: `${record.id}: ${record.category}`,
    vars: {
      prompt: record.question,
    },
    metadata: {
      golden_id: record.id,
      category: record.category,
      knowledge_scope: record.knowledge_scope,
      expected_route: record.expected_route,
      required_sources: record.required_sources,
      required_filters: record.required_filters,
      expected_answer_points: record.expected_answer_points,
      must_cite: record.must_cite,
      unanswerable: record.unanswerable,
      expected_numeric_result: record.expected_numeric_result,
      numeric_tolerance: record.numeric_tolerance,
      required_units: record.required_units,
      forbidden_claims: record.forbidden_claims,
      evaluation_notes: record.evaluation_notes,
    },
  };
});

await mkdir(resolve(process.cwd(), ".promptfoo"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(tests, null, 2)}\n`, "utf8");
console.log(`Generated ${tests.length} Promptfoo tests from ${sourcePath}`);
