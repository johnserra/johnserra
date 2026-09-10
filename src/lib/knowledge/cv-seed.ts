import {
  CV_DOCUMENT_ID,
  CV_LOCALE,
  cvApprovalDigest,
  renderCvMarkdown,
  validateCvDocument,
  type CvDocument,
} from "./cv";
import type { CvIndexingJob } from "./cv-indexer";

export interface CvSeedArguments {
  apply: boolean;
  approvedSha256?: string;
}

export function parseCvSeedArguments(argv: string[]): CvSeedArguments {
  const result: CvSeedArguments = { apply: false };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--apply" && argument !== "--approved-sha256") throw new Error(`Unknown argument: ${argument}.`);
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`);
    seen.add(argument);
    if (argument === "--apply") result.apply = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--approved-sha256 requires a value.");
      result.approvedSha256 = value;
      index += 1;
    }
  }
  if (!result.apply && result.approvedSha256) throw new Error("--approved-sha256 is valid only with --apply.");
  if (result.apply && !result.approvedSha256) throw new Error("--apply requires --approved-sha256.");
  if (result.approvedSha256 && !/^[a-f0-9]{64}$/.test(result.approvedSha256)) {
    throw new Error("--approved-sha256 must be a lowercase SHA-256 digest.");
  }
  return result;
}

export function prepareCvSeed(document: CvDocument, args: CvSeedArguments): {
  markdown: string;
  approvalDigest: string;
  job?: Omit<CvIndexingJob, "event_id">;
} {
  const validated = validateCvDocument(document);
  const markdown = renderCvMarkdown(validated);
  const approvalDigest = cvApprovalDigest(validated);
  if (args.apply && args.approvedSha256 !== approvalDigest) {
    throw new Error("Approved SHA-256 does not match the current canonical CV approval digest.");
  }
  return {
    markdown,
    approvalDigest,
    ...(args.apply ? {
      job: {
        document_type: "cv",
        cv_id: CV_DOCUMENT_ID,
        locale: CV_LOCALE,
        operation: "upsert",
        content_sha256: approvalDigest,
      },
    } : {}),
  };
}
