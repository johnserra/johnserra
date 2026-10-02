"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PROJECT_DISCOVERY_LIMITS,
  buildProjectSummary,
  canonicalProjectDiscoveryUrl,
  type ProjectDiscoveryInput,
  type ProjectDiscoveryLocale,
  type ProjectDiscoverySource,
  validateProjectDiscoveryStep,
} from "@/lib/chat/project-discovery";

interface ProjectDiscoveryFlowProps {
  locale: ProjectDiscoveryLocale;
  contactHref: string;
  getSessionId: () => string;
  onReturn: () => void;
  onContact: () => void;
}

interface ProjectDiscoveryReviewProps {
  summary: string;
  related: ProjectDiscoverySource[] | null;
  isLoading: boolean;
  lookupError: string | null;
  copyStatus: "idle" | "success" | "failure";
  contactHref: string;
  onSummaryChange: (value: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  onRestart: () => void;
  onReturn: () => void;
  onContact: () => void;
}

export async function copyProjectSummary(
  summary: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(summary);
    return true;
  } catch {
    return false;
  }
}

const controlClass = "rounded-field border border-hair px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const secondaryButtonClass = `${controlClass} bg-panel text-ink hover:border-accent disabled:opacity-50`;
const primaryButtonClass = `${controlClass} bg-accent text-on-accent hover:bg-accent-dim disabled:opacity-50`;

export function ProjectDiscoveryReview({
  summary,
  related,
  isLoading,
  lookupError,
  copyStatus,
  contactHref,
  onSummaryChange,
  onCopy,
  onEdit,
  onRestart,
  onReturn,
  onContact,
}: ProjectDiscoveryReviewProps) {
  const t = useTranslations("Chat.projectDiscovery");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="project-discovery-summary" className="mb-1 block text-sm font-semibold text-ink">
          {t("summaryLabel")}
        </label>
        <p className="mb-2 text-xs leading-relaxed text-muted">{t("summaryHelp")}</p>
        <textarea
          id="project-discovery-summary"
          value={summary}
          maxLength={PROJECT_DISCOVERY_LIMITS.summary}
          rows={7}
          onChange={(event) => onSummaryChange(event.target.value)}
          className={`${controlClass} w-full resize-y bg-ground-2 text-ink`}
        />
      </div>

      <section aria-labelledby="project-discovery-related">
        <h4 id="project-discovery-related" className="text-sm font-semibold text-ink">{t("relatedLabel")}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t("relatedHelp")}</p>
        {isLoading ? <p role="status" className="mt-2 text-sm text-ink-soft">{t("lookingUp")}</p> : null}
        {lookupError ? <p role="alert" className="mt-2 text-sm text-red-600">{lookupError}</p> : null}
        {!isLoading && !lookupError && related?.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t("noMatches")}</p>
        ) : null}
        {related && related.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {related.map((source) => (
              <li key={source.url} className="rounded-field border border-hair bg-ground-2 p-3">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {source.title}<span className="sr-only"> {t("opensNewTab")}</span>
                </a>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-soft">{source.snippet}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div aria-live="polite" className="min-h-5 text-xs text-ink-soft">
        {copyStatus === "success" ? t("copySuccess") : copyStatus === "failure" ? t("copyFailure") : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={onCopy} className={primaryButtonClass} aria-label={t("copySummary")}>{t("copySummary")}</button>
        <Link href={contactHref} onClick={onContact} className={`${secondaryButtonClass} text-center`} aria-label={t("openContact")}>{t("openContact")}</Link>
        <button type="button" onClick={onEdit} className={secondaryButtonClass} aria-label={t("edit")}>{t("edit")}</button>
        <button type="button" onClick={onRestart} className={secondaryButtonClass} aria-label={t("restart")}>{t("restart")}</button>
        <button type="button" onClick={onReturn} className={`${secondaryButtonClass} sm:col-span-2`} aria-label={t("returnToChat")}>{t("returnToChat")}</button>
      </div>
    </div>
  );
}

export function ProjectDiscoveryFlow({ locale, contactHref, getSessionId, onReturn, onContact }: ProjectDiscoveryFlowProps) {
  const t = useTranslations("Chat.projectDiscovery");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [draft, setDraft] = useState<ProjectDiscoveryInput>({ goal: "", current: "", constraints: "" });
  const [validationError, setValidationError] = useState(false);
  const [summary, setSummary] = useState("");
  const [related, setRelated] = useState<ProjectDiscoverySource[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failure">("idle");
  const requestRef = useRef<AbortController | null>(null);

  function abortLookup() {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsLoading(false);
  }

  useEffect(() => () => requestRef.current?.abort(), []);

  function updateDraft(field: keyof ProjectDiscoveryInput, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationError(false);
  }

  function nextStep() {
    const value = step === 0 ? draft.goal : draft.current;
    if ((step !== 0 && step !== 1) || !validateProjectDiscoveryStep(step, value)) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setStep((step + 1) as 1 | 2);
  }

  async function review(reviewDraft: ProjectDiscoveryInput = draft) {
    if (!validateProjectDiscoveryStep(2, reviewDraft.constraints)) {
      setValidationError(true);
      return;
    }
    abortLookup();
    const nextSummary = buildProjectSummary(reviewDraft, locale);
    setSummary(nextSummary);
    setRelated(null);
    setLookupError(null);
    setCopyStatus("idle");
    setValidationError(false);
    setStep(3);
    setIsLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/project-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Chat-Session": getSessionId() },
        body: JSON.stringify({ goal: reviewDraft.goal.trim(), current: reviewDraft.current.trim(), locale }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let code = "SERVICE_UNAVAILABLE";
        try {
          code = ((await response.json()) as { error?: { code?: string } }).error?.code ?? code;
        } catch {
          // A proxy response may not contain JSON; keep the localized generic message.
        }
        throw new Error(code);
      }
      const payload = await response.json() as { related?: unknown };
      const safeRelated = Array.isArray(payload.related)
        ? payload.related.flatMap((item): ProjectDiscoverySource[] => {
            if (!item || typeof item !== "object") return [];
            const source = item as Record<string, unknown>;
            const url = canonicalProjectDiscoveryUrl(source.url);
            return url && typeof source.title === "string" && typeof source.snippet === "string"
              ? [{ title: source.title.slice(0, 200), snippet: source.snippet.slice(0, 350), url }]
              : [];
          }).slice(0, 3)
        : [];
      if (requestRef.current === controller) setRelated(safeRelated);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestRef.current === controller) {
        const code = error instanceof Error ? error.message : "SERVICE_UNAVAILABLE";
        setLookupError(code === "RATE_LIMITED" ? t("rateLimited") : code === "PREPARATION_TIMEOUT" ? t("timeout") : t("lookupFailure"));
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }

  function editInputs() {
    abortLookup();
    setRelated(null);
    setLookupError(null);
    setCopyStatus("idle");
    setStep(0);
  }

  function restart() {
    abortLookup();
    setDraft({ goal: "", current: "", constraints: "" });
    setSummary("");
    setRelated(null);
    setLookupError(null);
    setCopyStatus("idle");
    setValidationError(false);
    setStep(0);
  }

  function returnToChat() {
    abortLookup();
    onReturn();
  }

  async function copySummary() {
    setCopyStatus(await copyProjectSummary(summary) ? "success" : "failure");
  }

  if (step === 3) {
    return (
      <ProjectDiscoveryReview
        summary={summary}
        related={related}
        isLoading={isLoading}
        lookupError={lookupError}
        copyStatus={copyStatus}
        contactHref={contactHref}
        onSummaryChange={(value) => { setSummary(value); setCopyStatus("idle"); }}
        onCopy={copySummary}
        onEdit={editInputs}
        onRestart={restart}
        onReturn={returnToChat}
        onContact={() => { restart(); onContact(); }}
      />
    );
  }

  const field = step === 0 ? "goal" : step === 1 ? "current" : "constraints";
  const limit = PROJECT_DISCOVERY_LIMITS[field];
  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-4">
        <h4 className="text-base font-semibold text-ink">{t("title")}</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t("intro")}</p>
        <p className="mt-2 font-mono text-xs text-muted">{t("step", { current: step + 1, total: 3 })}</p>
      </div>
      <label htmlFor={`project-discovery-${field}`} className="mb-2 text-sm font-semibold text-ink">
        {t(field)}{step < 2 ? ` ${t("required")}` : ` ${t("optional")}`}
      </label>
      <textarea
        id={`project-discovery-${field}`}
        value={draft[field]}
        maxLength={limit}
        rows={6}
        autoFocus
        onChange={(event) => updateDraft(field, event.target.value)}
        aria-invalid={validationError}
        aria-describedby={validationError ? "project-discovery-validation" : undefined}
        className={`${controlClass} w-full resize-y bg-ground-2 text-ink`}
      />
      <p className="mt-1 text-right text-xs text-muted">{draft[field].length}/{limit}</p>
      {validationError ? <p id="project-discovery-validation" role="alert" className="mt-2 text-sm text-red-600">{t(step === 2 ? "tooLong" : "requiredError")}</p> : null}
      {step === 1 ? (
        <button type="button" onClick={() => updateDraft("current", t("notSureValue"))} className="mt-2 self-start text-sm text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {t("notSure")}
        </button>
      ) : null}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        {step > 0 ? <button type="button" onClick={() => { setValidationError(false); setStep((step - 1) as 0 | 1); }} className={secondaryButtonClass} aria-label={t("back")}>{t("back")}</button> : <button type="button" onClick={returnToChat} className={secondaryButtonClass} aria-label={t("returnToChat")}>{t("returnToChat")}</button>}
        {step < 2 ? <button type="button" onClick={nextStep} className={primaryButtonClass} aria-label={t("next")}>{t("next")}</button> : <button type="button" onClick={() => void review()} className={primaryButtonClass} aria-label={t("review")}>{t("review")}</button>}
        {step === 2 ? <button type="button" onClick={() => { const skipped = { ...draft, constraints: "" }; setDraft(skipped); void review(skipped); }} className={`${secondaryButtonClass} col-span-2`} aria-label={t("skip")}>{t("skip")}</button> : null}
      </div>
    </div>
  );
}
