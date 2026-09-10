import {
  CV_DOCUMENT_ID,
  CV_DOCUMENT_TYPE,
  CV_LOCALE,
  cvApprovalDigest,
  cvChunks,
  loadRegisteredCv,
  validateCvDocument,
  type CvChunk,
  type CvDocument,
} from "./cv";

const JOB_KEYS = new Set(["event_id", "document_type", "cv_id", "locale", "operation", "content_sha256"]);

export interface CvIndexingJob {
  event_id: string;
  document_type: "cv";
  cv_id: "john-serra";
  locale: "en";
  operation: "upsert" | "delete";
  content_sha256: string;
}

export interface CvReplacementRow extends CvChunk {
  embedding: number[];
}

export interface CvIndexingDependencies {
  loadDocument(): Promise<CvDocument>;
  embedDocument(content: string, title: string): Promise<number[]>;
  replaceCvContext(input: {
    documentId: "john-serra";
    locale: "en";
    approvalDigest: string;
    rows: CvReplacementRow[];
  }): Promise<void>;
}

export function parseCvIndexingJob(value: unknown): CvIndexingJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid CV indexing job payload.");
  }
  const job = value as Record<string, unknown>;
  const unknown = Object.keys(job).filter((key) => !JOB_KEYS.has(key));
  if (unknown.length) throw new Error("Invalid CV indexing job fields.");
  if (typeof job.event_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.event_id)) {
    throw new Error("Invalid CV indexing event ID.");
  }
  if (job.document_type !== CV_DOCUMENT_TYPE || job.cv_id !== CV_DOCUMENT_ID || job.locale !== CV_LOCALE) {
    throw new Error("Unregistered CV indexing target.");
  }
  if (job.operation !== "upsert" && job.operation !== "delete") {
    throw new Error("Unsupported CV indexing operation.");
  }
  if (typeof job.content_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(job.content_sha256)) {
    throw new Error("Invalid CV approval digest.");
  }
  return job as unknown as CvIndexingJob;
}

export async function processCvIndexingJob(
  value: unknown,
  dependencies: CvIndexingDependencies,
): Promise<{ sections: number; approvalDigest: string }> {
  const job = parseCvIndexingJob(value);
  const document = validateCvDocument(await dependencies.loadDocument());
  const deployedApprovalDigest = cvApprovalDigest(document);
  if (job.content_sha256 !== deployedApprovalDigest) {
    throw new Error("Stale CV indexing job: approval digest does not match the deployed registered CV.");
  }
  const chunks = job.operation === "delete" ? [] : cvChunks(document);
  const rows: CvReplacementRow[] = [];
  for (const chunk of chunks) {
    rows.push({
      ...chunk,
      embedding: await dependencies.embedDocument(chunk.content, chunk.metadata.title),
    });
  }
  await dependencies.replaceCvContext({
    documentId: CV_DOCUMENT_ID,
    locale: CV_LOCALE,
    approvalDigest: deployedApprovalDigest,
    rows,
  });
  return { sections: rows.length, approvalDigest: deployedApprovalDigest };
}

export function registeredCvIndexingDependencies(
  embedDocument: CvIndexingDependencies["embedDocument"],
  replaceCvContext: CvIndexingDependencies["replaceCvContext"],
): CvIndexingDependencies {
  return { loadDocument: loadRegisteredCv, embedDocument, replaceCvContext };
}
