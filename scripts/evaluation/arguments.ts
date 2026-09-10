export interface EvaluationArguments {
  validate: boolean;
  limit?: number;
  caseId?: string;
  outputDir?: string;
  qualityGate: boolean;
}

export function parseArguments(argv: string[]): EvaluationArguments {
  const result: EvaluationArguments = { validate: false, qualityGate: false };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--validate", "--limit", "--case", "--output", "--quality-gate"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}.`);
    }
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`);
    seen.add(argument);
    if (argument === "--validate") result.validate = true;
    else if (argument === "--quality-gate") result.qualityGate = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--limit") {
        if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error("--limit must be a positive integer.");
        result.limit = Number(value);
      } else if (argument === "--case") result.caseId = value;
      else result.outputDir = value;
    }
  }
  if (result.caseId && result.limit !== undefined) throw new Error("--case and --limit cannot be combined.");
  if (result.validate && (result.caseId || result.limit !== undefined || result.outputDir || result.qualityGate)) {
    throw new Error("--validate cannot be combined with execution options.");
  }
  return result;
}
