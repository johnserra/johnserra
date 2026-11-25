/**
 * One-way offline sync from the primary Career Ops cv.md into the Digital Twin's
 * strictly validated public CV JSON and rendered Markdown artifact.
 *
 * Reads ONLY cv.md (never private profile/search files), preserves public
 * boundaries (strips contact info and current-employer regional location),
 * and never loads credentials or writes to Supabase.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CV_PUBLIC_RELATIVE_PATH,
  CV_SOURCE_RELATIVE_PATH,
  cvApprovalDigest,
  renderCvMarkdown,
} from "@/lib/knowledge/cv";
import {
  CV_SUPPLEMENTS_RELATIVE_PATH,
  parseCvSyncArguments,
  syncCvFromCareerOpsMarkdown,
  validateCvPublicSupplements,
} from "@/lib/knowledge/cv-sync";

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseCvSyncArguments(process.argv.slice(2));
  const root = process.cwd();
  const supplementsPath = path.join(root, CV_SUPPLEMENTS_RELATIVE_PATH);
  const canonicalJsonPath = path.join(root, CV_SOURCE_RELATIVE_PATH);
  const publicMarkdownPath = path.join(root, CV_PUBLIC_RELATIVE_PATH);

  const [sourceMarkdown, rawSupplements, currentJson, currentMarkdown] = await Promise.all([
    readFile(args.sourcePath, "utf8"),
    readFile(supplementsPath, "utf8"),
    readIfExists(canonicalJsonPath),
    readIfExists(publicMarkdownPath),
  ]);

  const supplements = validateCvPublicSupplements(JSON.parse(rawSupplements));
  const syncedDocument = syncCvFromCareerOpsMarkdown(sourceMarkdown, supplements);
  const nextJson = `${JSON.stringify(syncedDocument, null, 2)}\n`;
  const nextMarkdown = renderCvMarkdown(syncedDocument);
  const approvalDigest = cvApprovalDigest(syncedDocument);

  const jsonChanged = currentJson !== nextJson;
  const markdownChanged = currentMarkdown !== nextMarkdown;

  if (args.check) {
    if (jsonChanged || markdownChanged) {
      console.error("Digital Twin public CV is out of sync with Career Ops cv.md.");
      if (jsonChanged) console.error(`- Out of sync: ${CV_SOURCE_RELATIVE_PATH}`);
      if (markdownChanged) console.error(`- Out of sync: ${CV_PUBLIC_RELATIVE_PATH}`);
      console.error("Run `npm run sync:cv` to regenerate offline artifacts for review.");
      process.exitCode = 1;
      return;
    }
    console.log(`Digital Twin public CV matches Career Ops cv.md (${syncedDocument.sections.length} sections).`);
    console.log(`Canonical approval SHA-256: ${approvalDigest}`);
    return;
  }

  if (!args.dryRun) {
    await mkdir(path.dirname(canonicalJsonPath), { recursive: true });
    await mkdir(path.dirname(publicMarkdownPath), { recursive: true });
    if (jsonChanged) await writeFile(canonicalJsonPath, nextJson, "utf8");
    if (markdownChanged) await writeFile(publicMarkdownPath, nextMarkdown, "utf8");
  }

  const modeLabel = args.dryRun ? "Dry-run" : "Synced";
  console.log(`${modeLabel} from ${args.sourcePath}`);
  console.log(`- ${CV_SOURCE_RELATIVE_PATH}: ${jsonChanged ? (args.dryRun ? "would update" : "updated") : "unchanged"}`);
  console.log(`- ${CV_PUBLIC_RELATIVE_PATH}: ${markdownChanged ? (args.dryRun ? "would update" : "updated") : "unchanged"}`);
  console.log(`- Sections (${syncedDocument.sections.length}):`);
  for (const section of syncedDocument.sections) {
    console.log(`  - ${section.id}: ${section.title}`);
  }
  console.log(`Canonical approval SHA-256: ${approvalDigest}`);
  console.log("Offline only: review git diff, run tests, then enqueue live indexing explicitly with:");
  console.log(`  npm run seed:cv -- --apply --approved-sha256 ${approvalDigest}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "CV sync failed.");
  process.exitCode = 1;
});
