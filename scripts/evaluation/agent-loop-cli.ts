import path from "node:path";
import { evaluateAgentLoopCorpus } from "./agent-loop-evaluator";
import { loadAgentLoopCorpus } from "./agent-loop-schema";
import { createAgentLoopReport, writeAgentLoopReport } from "./agent-loop-report";

function parseArgs(argv: string[]): { validate: boolean; offline: boolean; outputDirectory?: string; caseId?: string } {
  let validate = false;
  let offline = false;
  let outputDirectory: string | undefined;
  let caseId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--validate" || arg === "--validate-only") validate = true;
    else if (arg === "--offline") offline = true;
    else if (arg === "--output-dir") outputDirectory = argv[++index];
    else if (arg === "--case") caseId = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (validate === offline) throw new Error("Choose exactly one of --validate-only or --offline.");
  if (offline && !outputDirectory) throw new Error("Offline reports require an explicit --output-dir.");
  return { validate, offline, outputDirectory, caseId };
}

export async function runAgentLoopCli(argv: string[], repositoryRoot = process.cwd()): Promise<number> {
  let args;
  try { args = parseArgs(argv); } catch (error) { console.error(error instanceof Error ? error.message : "Invalid arguments."); return 2; }
  const corpusPath = path.join(repositoryRoot, "evals/agent-loop/cases.json");
  let corpus;
  try { corpus = await loadAgentLoopCorpus(corpusPath); } catch (error) { console.error(error instanceof Error ? error.message : "Agent-loop corpus validation failed."); return 2; }
  if (args.validate) {
    console.log(`Validated ${corpus.cases.length} bounded evidence-agent cases for corpus ${corpus.corpusVersion}; no report was written.`);
    return 0;
  }
  const selected = args.caseId ? corpus.cases.filter((item) => item.id === args.caseId) : corpus.cases;
  if (!selected.length) { console.error(`Unknown agent-loop case ID: ${args.caseId}.`); return 2; }
  const evaluation = evaluateAgentLoopCorpus({ ...corpus, cases: selected });
  const completedAt = new Date().toISOString();
  const report = createAgentLoopReport({ ...corpus, cases: selected }, evaluation, completedAt);
  const paths = await writeAgentLoopReport(report, path.resolve(args.outputDirectory!), completedAt);
  console.log(`Wrote sanitized JSON report: ${path.relative(repositoryRoot, paths.jsonPath)}`);
  console.log(`Wrote sanitized Markdown report: ${path.relative(repositoryRoot, paths.markdownPath)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) process.exitCode = await runAgentLoopCli(process.argv.slice(2));
