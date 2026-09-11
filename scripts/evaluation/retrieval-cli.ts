import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RetrievalResult } from "../../src/lib/chat/core";
import type { HybridRpcRequest, HybridRpcResult } from "../../src/lib/chat/retrieval";
import { loadAndValidateRetrievalCorpus, runRetrievalEvaluation, type ValidatedRetrievalCorpus } from "./retrieval";

export const RETRIEVAL_EVAL_MAX_CASES = 20;

export interface RetrievalCliArguments {
  mode: "validate" | "live";
  limit?: number;
  caseId?: string;
  output?: string;
}

export function parseRetrievalArguments(argv: string[]): RetrievalCliArguments {
  let mode: RetrievalCliArguments["mode"] | undefined;
  let limit: number | undefined;
  let caseId: string | undefined;
  let output: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!["--validate", "--live", "--limit", "--case", "--output"].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}.`);
    }
    if (seen.has(arg)) throw new Error(`Duplicate argument: ${arg}.`);
    seen.add(arg);
    if (arg === "--validate" || arg === "--live") {
      if (mode) throw new Error("Choose exactly one of --validate or --live.");
      mode = arg === "--live" ? "live" : "validate";
    } else {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      i++;
      if (arg === "--limit") {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > RETRIEVAL_EVAL_MAX_CASES) {
          throw new Error(`--limit must be between 1 and ${RETRIEVAL_EVAL_MAX_CASES}.`);
        }
        limit = Number(value);
      } else if (arg === "--case") {
        caseId = value;
      } else {
        output = value;
      }
    }
  }
  if (!mode) throw new Error("Choose exactly one of --validate or --live.");
  if (limit && caseId) throw new Error("--limit and --case cannot be combined.");
  if (mode === "validate" && (limit || caseId || output)) throw new Error("--validate cannot be combined with execution options.");
  return { mode, ...(limit ? { limit } : {}), ...(caseId ? { caseId } : {}), ...(output ? { output } : {}) };
}

async function runLive(
  corpus: ValidatedRetrievalCorpus,
  selectedCaseIds: string[],
  outputDir?: string,
): Promise<void> {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local", quiet: true });
  for (const key of ["GEMINI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]?.trim()) throw new Error(`Missing ${key}.`);
  }
  const [{ embedQuery }, { createAdminClient }, { createGeminiRewriteAdapter }] = await Promise.all([
    import("../../src/lib/knowledge/embeddings"),
    import("../../src/lib/supabase"),
    import("../../src/lib/chat/rewrite"),
  ]);
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const supabase = createAdminClient();
  const report = await runRetrievalEvaluation(corpus, {
    embedQuery,
    async invokeHybridRpc(request: HybridRpcRequest, signal?: AbortSignal) {
      const rpc = supabase.rpc("match_career_context_hybrid", request);
      const result = signal ? await rpc.abortSignal(signal) : await rpc;
      return result as HybridRpcResult;
    },
    async invokeFilteredRpc(name, request, signal) {
      const rpc = supabase.rpc(name, request);
      const result = signal ? await rpc.abortSignal(signal) : await rpc;
      return result as RetrievalResult;
    },
    rewriteAdapter: createGeminiRewriteAdapter(async (req) => {
      const response = await ai.models.generateContent(req);
      return { text: response.text };
    }),
  }, { caseIds: selectedCaseIds });
  const reportJson = JSON.stringify(report, null, 2);
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const timestamp = report.timestamp.replace(/[:.]/g, "-");
    const filepath = path.join(outputDir, `retrieval-${timestamp}.json`);
    await writeFile(filepath, `${reportJson}\n`);
    console.log(`Wrote retrieval report: ${path.relative(process.cwd(), filepath)}`);
  }
  console.log(reportJson);
  if (!report.complete) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = parseRetrievalArguments(process.argv.slice(2));
  const root = process.cwd();
  const corpus = await loadAndValidateRetrievalCorpus(
    path.join(root, "evals/retrieval/cases.json"),
    path.join(root, "evals/retrieval/sources.json"),
  );
  if (args.mode === "validate") {
    console.log(`Validated ${corpus.caseFile.cases.length} retrieval cases and ${corpus.sourceManifest.sources.length} sources offline for corpus ${corpus.caseFile.corpusVersion}; no credentials, provider modules, or network calls were used.`);
    return;
  }
  let selected = corpus.caseFile.cases;
  if (args.caseId) {
    selected = selected.filter((c) => c.id === args.caseId);
    if (!selected.length) throw new Error(`Unknown retrieval case ID: ${args.caseId}.`);
  } else if (args.limit) {
    selected = selected.slice(0, args.limit);
  }
  await runLive(corpus, selected.map((testCase) => testCase.id), args.output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Retrieval evaluation failed.");
    process.exitCode = 1;
  });
}
