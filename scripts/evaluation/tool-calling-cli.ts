import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { evaluateToolCallingCorpus } from "./tool-calling-evaluator";
import { loadToolCallingCorpus } from "./tool-calling-schema";
import { createToolCallingReport, writeToolCallingReport } from "./tool-calling-report";

const execFileAsync = promisify(execFile);

export interface ToolCallingCliOptions {
  repositoryRoot?: string;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  now?: () => Date;
  gitMetadata?: () => Promise<{ revision: string; dirty: boolean | null }>;
}

function parseArgs(argv: string[]): { validate: boolean; offline: boolean; outputDirectory?: string; caseId?: string } {
  let validate = false;
  let offline = false;
  let outputDirectory: string | undefined;
  let caseId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--validate" || arg === "--validate-only") validate = true;
    else if (arg === "--offline") offline = true;
    else if (arg === "--live") throw new Error("Live Gemini mode is intentionally unavailable for this task; use --offline.");
    else if (arg === "--output-dir") outputDirectory = argv[++index];
    else if (arg === "--case") caseId = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!validate && !offline) throw new Error("Choose --validate-only or --offline.");
  if (validate && offline) throw new Error("--validate-only and --offline are mutually exclusive.");
  return { validate, offline, outputDirectory, caseId };
}

async function defaultGitMetadata(repositoryRoot: string): Promise<{ revision: string; dirty: boolean | null }> {
  try {
    const [{ stdout: revision }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: repositoryRoot }),
    ]);
    return { revision: revision.trim(), dirty: Boolean(status.trim()) };
  } catch {
    return { revision: "unavailable", dirty: null };
  }
}

export async function runToolCallingCli(argv: string[], options: ToolCallingCliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr(error instanceof Error ? error.message : "Invalid arguments.");
    return 2;
  }
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const corpusPath = path.join(repositoryRoot, "evals/tool-calling/cases.json");
  let corpus;
  try {
    corpus = await loadToolCallingCorpus(corpusPath);
  } catch (error) {
    stderr(error instanceof Error ? error.message : "Tool-calling corpus validation failed.");
    return 2;
  }
  if (args.validate) {
    stdout(`Validated ${corpus.cases.length} bounded multi-tool cases for corpus ${corpus.corpusVersion}; no report was written.`);
    return 0;
  }
  let selected = corpus.cases;
  if (args.caseId) {
    const found = selected.find((item) => item.id === args.caseId);
    if (!found) {
      stderr(`Unknown tool-calling case ID: ${args.caseId}.`);
      return 2;
    }
    selected = [found];
  }
  const selectedCorpus = { ...corpus, cases: selected };
  const evaluation = evaluateToolCallingCorpus(selectedCorpus);
  const completedAt = (options.now ?? (() => new Date()))().toISOString();
  const git = await (options.gitMetadata ?? (() => defaultGitMetadata(repositoryRoot)))();
  const report = createToolCallingReport(selectedCorpus, evaluation, { completedAt, gitRevision: git.revision, gitDirty: git.dirty });
  const outputDirectory = path.resolve(repositoryRoot, args.outputDirectory ?? "evals/tool-calling/reports");
  const paths = await writeToolCallingReport(report, outputDirectory, completedAt);
  stdout(`Wrote sanitized JSON report: ${path.relative(repositoryRoot, paths.jsonPath)}`);
  stdout(`Wrote sanitized Markdown report: ${path.relative(repositoryRoot, paths.markdownPath)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  process.exitCode = await runToolCallingCli(process.argv.slice(2));
}
