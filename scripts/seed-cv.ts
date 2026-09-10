/**
 * Validate and render the registered public CV. Live queueing is explicit and
 * is bound to the complete validated canonical document and readable artifact.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CV_PUBLIC_RELATIVE_PATH,
  loadRegisteredCv,
} from "@/lib/knowledge/cv";
import { parseCvSeedArguments, prepareCvSeed } from "@/lib/knowledge/cv-seed";

async function syncPublicArtifact(markdown: string): Promise<"created" | "updated" | "verified"> {
  const outputPath = path.join(process.cwd(), CV_PUBLIC_RELATIVE_PATH);
  let current: string | undefined;
  try {
    current = await readFile(outputPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current === markdown) return "verified";
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return current === undefined ? "created" : "updated";
}

async function applyQueueJob(job: NonNullable<ReturnType<typeof prepareCvSeed>["job"]>): Promise<void> {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local", quiet: true });
  const { createAdminClient } = await import("@/lib/supabase");
  const supabase = createAdminClient();
  const { data: contractVersion, error: contractError } = await supabase.rpc("cv_indexing_contract_version");
  if (contractError || contractVersion !== 1) {
    throw new Error("CV indexing SQL contract v1 is unavailable; refusing to enqueue. This check does not verify deployed worker code.");
  }
  const { error } = await supabase.rpc("enqueue_content_indexing_job", {
    job: { event_id: randomUUID(), ...job },
  });
  if (error) throw new Error(`Failed to enqueue the approved CV: ${error.message}`);
}

async function main(): Promise<void> {
  const args = parseCvSeedArguments(process.argv.slice(2));
  const document = await loadRegisteredCv();
  const prepared = prepareCvSeed(document, args);
  const artifactStatus = await syncPublicArtifact(prepared.markdown);
  console.log(`Public CV ${artifactStatus}: ${CV_PUBLIC_RELATIVE_PATH}`);
  console.log(`Canonical approval SHA-256: ${prepared.approvalDigest}`);
  for (const section of document.sections) console.log(`- ${section.id}: ${section.title}`);
  if (!args.apply) {
    console.log("Offline dry-run only: no credentials loaded, providers imported, queue accessed, or database writes attempted.");
    return;
  }
  await applyQueueJob(prepared.job!);
  console.log("Enqueued one approved CV upsert. No WordPress jobs were processed by this command.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "CV seed failed.");
  process.exitCode = 1;
});
