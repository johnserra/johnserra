"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Checkmark } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { InlineNotification } from "@/components/ui/InlineNotification";
import { TextInput } from "@/components/ui/TextInput";
import {
  ASSESSMENT_VERSION,
  EMPLOYEE_BANDS,
  FLAG_IDS,
  FLAG_RESPONSES,
  OUTCOMES,
  PILLARS,
  QUESTION_CATALOG,
  REVENUE_BANDS,
  ROLES,
  SCORED_RESPONSES,
  type BusinessContext,
  type FlagId,
  type FlagResponse,
  type Pillar,
  type ScoredQuestionId,
  type ScoredResponse,
  dataAuditCtaPath,
  isFlagId,
  isFlagResponse,
  isScoredQuestionId,
  isScoredResponse,
  scoreAssessment,
} from "@/lib/data-audit";

const STORAGE_KEY = ASSESSMENT_VERSION;
const ASSESSMENT_STEPS = ["context", ...PILLARS, "flags"] as const;
type AssessmentStep = (typeof ASSESSMENT_STEPS)[number];
type Screen = "landing" | AssessmentStep | "results" | "lead" | "plan";
type ContextDraft = Partial<BusinessContext>;

type AnalyticsEvent =
  | "assessment_started"
  | "context_completed"
  | "pillar_completed"
  | "red_flags_completed"
  | "results_viewed"
  | "lead_form_viewed"
  | "lead_submitted"
  | "lead_submission_failed"
  | "detailed_plan_viewed"
  | "primary_cta_clicked"
  | "secondary_cta_clicked";

function trackAssessmentEvent(
  event: AnalyticsEvent,
  parameters: Partial<Record<"pillar" | "maturity" | "cta_route", string>> = {},
) {
  if (typeof window === "undefined") return;
  const analyticsWindow = window as Window & {
    gtag?: (command: "event", name: string, values: Record<string, string>) => void;
  };
  analyticsWindow.gtag?.("event", event, parameters);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function completeContext(context: ContextDraft): context is BusinessContext {
  return ROLES.includes(context.role as BusinessContext["role"])
    && EMPLOYEE_BANDS.includes(context.employeeBand as BusinessContext["employeeBand"])
    && REVENUE_BANDS.includes(context.revenueBand as BusinessContext["revenueBand"])
    && OUTCOMES.includes(context.primaryOutcome as BusinessContext["primaryOutcome"]);
}

function readSavedSession(): {
  screen: Exclude<Screen, "plan" | "lead">;
  context: ContextDraft;
  answers: Partial<Record<ScoredQuestionId, ScoredResponse>>;
  redFlags: Partial<Record<FlagId, FlagResponse>>;
} | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!isRecord(parsed) || parsed.version !== ASSESSMENT_VERSION) return null;
    const rawContext = isRecord(parsed.context) ? parsed.context : {};
    const context: ContextDraft = {
      role: typeof rawContext.role === "string" && ROLES.includes(rawContext.role as BusinessContext["role"])
        ? rawContext.role as BusinessContext["role"] : undefined,
      employeeBand: typeof rawContext.employeeBand === "string" && EMPLOYEE_BANDS.includes(rawContext.employeeBand as BusinessContext["employeeBand"])
        ? rawContext.employeeBand as BusinessContext["employeeBand"] : undefined,
      revenueBand: typeof rawContext.revenueBand === "string" && REVENUE_BANDS.includes(rawContext.revenueBand as BusinessContext["revenueBand"])
        ? rawContext.revenueBand as BusinessContext["revenueBand"] : undefined,
      primaryOutcome: typeof rawContext.primaryOutcome === "string" && OUTCOMES.includes(rawContext.primaryOutcome as BusinessContext["primaryOutcome"])
        ? rawContext.primaryOutcome as BusinessContext["primaryOutcome"] : undefined,
    };
    const answers: Partial<Record<ScoredQuestionId, ScoredResponse>> = {};
    if (isRecord(parsed.answers)) {
      for (const [id, response] of Object.entries(parsed.answers)) {
        if (isScoredQuestionId(id) && isScoredResponse(response)) answers[id] = response;
      }
    }
    const redFlags: Partial<Record<FlagId, FlagResponse>> = {};
    if (isRecord(parsed.redFlags)) {
      for (const [id, response] of Object.entries(parsed.redFlags)) {
        if (isFlagId(id) && isFlagResponse(response)) redFlags[id] = response;
      }
    }

    const savedScreen = typeof parsed.screen === "string" ? parsed.screen : "context";
    const validScreen = (["context", ...PILLARS, "flags", "results"] as string[]).includes(savedScreen)
      ? savedScreen as Exclude<Screen, "landing" | "plan" | "lead">
      : "context";
    const firstIncompletePillar = PILLARS.find((pillar) =>
      QUESTION_CATALOG.some((question) => question.pillar === pillar && !answers[question.id]));
    const flagsComplete = FLAG_IDS.every((id) => Boolean(redFlags[id]));
    const furthestValidScreen: Exclude<Screen, "landing" | "plan" | "lead"> = !completeContext(context)
      ? "context"
      : firstIncompletePillar ?? (flagsComplete ? "results" : "flags");
    const screenOrder = ["context", ...PILLARS, "flags", "results"] as const;
    const screen = screenOrder.indexOf(validScreen) <= screenOrder.indexOf(furthestValidScreen)
      ? validScreen
      : furthestValidScreen;
    return { screen, context, answers, redFlags };
  } catch {
    return null;
  }
}

const selectClassName = "h-11 w-full rounded-field border border-hair bg-ground-2 px-4 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50";

function Progress({ step, label }: { step: AssessmentStep; label: (key: string, values?: Record<string, number>) => string }) {
  const current = ASSESSMENT_STEPS.indexOf(step) + 1;
  return (
    <div
      className="mb-8"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={ASSESSMENT_STEPS.length}
      aria-valuenow={current}
      aria-label={label("progress.label", { current, total: ASSESSMENT_STEPS.length })}
    >
      <div className="mb-2 flex justify-between font-mono text-xs uppercase tracking-[0.1em] text-muted">
        <span>{label("progress.step", { current })}</span>
        <span>{label("progress.total", { total: ASSESSMENT_STEPS.length })}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-line">
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(current / ASSESSMENT_STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function RadioQuestion<T extends string>({
  id,
  legend,
  options,
  value,
  onChange,
  label,
}: {
  id: string;
  legend: string;
  options: readonly T[];
  value?: T;
  onChange: (value: T) => void;
  label: (key: string) => string;
}) {
  return (
    <fieldset className="rounded-card border border-hair bg-ground-2 p-5">
      <legend className="px-1 text-base font-medium leading-relaxed text-ink">{legend}</legend>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-3 rounded-field border border-line bg-panel px-4 py-3 text-sm text-ink-soft transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:text-ink focus-within:ring-2 focus-within:ring-accent motion-reduce:transition-none"
          >
            <input
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            {label(`responses.${option}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DataAuditAssessment() {
  const t = useTranslations("DataAudit");
  const locale = useLocale();
  const [screen, setScreen] = useState<Screen>("landing");
  const [context, setContext] = useState<ContextDraft>({});
  const [answers, setAnswers] = useState<Partial<Record<ScoredQuestionId, ScoredResponse>>>({});
  const [redFlags, setRedFlags] = useState<Partial<Record<FlagId, FlagResponse>>>({});
  const [error, setError] = useState("");
  const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const trackedScreens = useRef(new Set<string>());
  const result = useMemo(() => scoreAssessment(answers, redFlags), [answers, redFlags]);

  useEffect(() => {
    const saved = readSavedSession();
    if (saved) {
      setScreen(saved.screen);
      setContext(saved.context);
      setAnswers(saved.answers);
      setRedFlags(saved.redFlags);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || screen === "lead" || screen === "plan") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: ASSESSMENT_VERSION,
      screen,
      context,
      answers,
      redFlags,
    }));
  }, [answers, context, hydrated, redFlags, screen]);

  useEffect(() => {
    if (!hydrated || trackedScreens.current.has(screen)) return;
    trackedScreens.current.add(screen);
    if (screen === "results" && result.complete) {
      trackAssessmentEvent("results_viewed", { maturity: result.displayedMaturity });
    } else if (screen === "lead") {
      trackAssessmentEvent("lead_form_viewed");
    } else if (screen === "plan" && result.complete) {
      trackAssessmentEvent("detailed_plan_viewed", { cta_route: result.ctaRoute });
    }
  }, [hydrated, result, screen]);

  const goBack = () => {
    setError("");
    if (screen === "context") setScreen("landing");
    else if (screen === "flags") setScreen("ownership");
    else if (PILLARS.includes(screen as Pillar)) {
      const index = PILLARS.indexOf(screen as Pillar);
      setScreen(index === 0 ? "context" : PILLARS[index - 1]);
    } else if (screen === "results") setScreen("flags");
    else if (screen === "lead" || screen === "plan") setScreen("results");
  };

  const continueFromContext = () => {
    if (!completeContext(context)) {
      setError(t("errors.context"));
      return;
    }
    setError("");
    trackAssessmentEvent("context_completed");
    setScreen("metrics");
  };

  const continueFromPillar = (pillar: Pillar) => {
    const questions = QUESTION_CATALOG.filter((question) => question.pillar === pillar);
    if (questions.some((question) => !answers[question.id])) {
      setError(t("errors.questions"));
      return;
    }
    setError("");
    trackAssessmentEvent("pillar_completed", { pillar });
    const index = PILLARS.indexOf(pillar);
    setScreen(index === PILLARS.length - 1 ? "flags" : PILLARS[index + 1]);
  };

  const continueFromFlags = () => {
    if (FLAG_IDS.some((id) => !redFlags[id])) {
      setError(t("errors.flags"));
      return;
    }
    const completedResult = scoreAssessment(answers, redFlags);
    if (!completedResult.complete) {
      setError(t("errors.incomplete"));
      return;
    }
    setError("");
    trackAssessmentEvent("red_flags_completed");
    setScreen("results");
  };

  const startAssessment = () => {
    trackAssessmentEvent("assessment_started");
    setScreen("context");
  };

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result.complete || !completeContext(context)) {
      setSubmissionState("error");
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmissionState("submitting");
    try {
      const response = await fetch("/api/data-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.get("firstName"),
          email: formData.get("email"),
          company: formData.get("company"),
          website: formData.get("website"),
          consent: formData.get("consent") === "on",
          locale,
          context,
          result: { ...result, answers, redFlags },
        }),
      });
      if (!response.ok) throw new Error("submission_failed");
      setSubmissionState("idle");
      trackAssessmentEvent("lead_submitted", { maturity: result.displayedMaturity });
      setScreen("plan");
    } catch {
      setSubmissionState("error");
      trackAssessmentEvent("lead_submission_failed");
    }
  }

  const shell = (children: React.ReactNode) => (
    <section className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16 lg:px-8 lg:py-20">
      {children}
      <p className="sr-only" aria-live="polite">{error || (submissionState === "error" ? t("lead.error") : "")}</p>
    </section>
  );

  if (screen === "landing") {
    return shell(
      <div className="grid items-end gap-10 lg:grid-cols-[1.35fr_.65fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("landing.eyebrow")}</p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl uppercase leading-[.95] tracking-tight sm:text-6xl lg:text-7xl">{t("landing.headline")}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">{t("landing.intro")}</p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-xs uppercase tracking-[0.08em] text-muted">
            <span className="flex items-center gap-2"><Checkmark className="text-good" size={18} />{t("landing.duration")}</span>
            <span className="flex items-center gap-2"><Checkmark className="text-good" size={18} />{t("landing.ungated")}</span>
          </div>
          <Button size="lg" className="mt-9 gap-2" onClick={startAssessment}>
            {t("landing.start")} <ArrowRight size={18} />
          </Button>
        </div>
        <aside className="rounded-card border border-hair bg-panel p-6">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("landing.privacyLabel")}</p>
          <p className="mt-3 leading-relaxed text-ink-soft">{t("landing.privacy")}</p>
        </aside>
      </div>,
    );
  }

  if (screen === "context") {
    return shell(
      <div className="mx-auto max-w-3xl">
        <Progress step="context" label={t} />
        <fieldset>
          <legend className="font-display text-4xl uppercase tracking-tight sm:text-5xl">{t("context.title")}</legend>
          <p className="mt-4 leading-relaxed text-ink-soft">{t("context.intro")}</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {([
              ["role", ROLES],
              ["employeeBand", EMPLOYEE_BANDS],
              ["revenueBand", REVENUE_BANDS],
              ["primaryOutcome", OUTCOMES],
            ] as const).map(([field, options]) => (
              <label key={field} className="flex flex-col gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t(`context.${field}.label`)}</span>
                <select
                  required
                  value={context[field] ?? ""}
                  onChange={(event) => setContext((current) => ({ ...current, [field]: event.target.value }))}
                  className={selectClassName}
                >
                  <option value="" disabled>{t("context.choose")}</option>
                  {options.map((option) => <option key={option} value={option}>{t(`context.${field}.options.${option}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <InlineNotification kind="error" title={t("errors.title")} subtitle={error} />}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={goBack} className="gap-2"><ArrowLeft size={18} />{t("buttons.back")}</Button>
          <Button onClick={continueFromContext} className="gap-2">{t("buttons.next")}<ArrowRight size={18} /></Button>
        </div>
      </div>,
    );
  }

  if (PILLARS.includes(screen as Pillar)) {
    const pillar = screen as Pillar;
    const questions = QUESTION_CATALOG.filter((question) => question.pillar === pillar);
    return shell(
      <div className="mx-auto max-w-4xl">
        <Progress step={pillar} label={t} />
        <h1 className="font-display text-4xl uppercase tracking-tight sm:text-5xl">{t(`pillars.${pillar}.title`)}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">{t(`pillars.${pillar}.intro`)}</p>
        <div className="mt-8 space-y-5">
          {questions.map((question) => (
            <RadioQuestion
              key={question.id}
              id={question.id}
              legend={t(`questions.${question.id}`)}
              options={SCORED_RESPONSES}
              value={answers[question.id]}
              onChange={(response) => setAnswers((current) => ({ ...current, [question.id]: response }))}
              label={t}
            />
          ))}
        </div>
        {error && <InlineNotification kind="error" title={t("errors.title")} subtitle={error} />}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={goBack} className="gap-2"><ArrowLeft size={18} />{t("buttons.back")}</Button>
          <Button onClick={() => continueFromPillar(pillar)} className="gap-2">{t("buttons.next")}<ArrowRight size={18} /></Button>
        </div>
      </div>,
    );
  }

  if (screen === "flags") {
    return shell(
      <div className="mx-auto max-w-4xl">
        <Progress step="flags" label={t} />
        <h1 className="font-display text-4xl uppercase tracking-tight sm:text-5xl">{t("flags.title")}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">{t("flags.intro")}</p>
        <div className="mt-8 space-y-5">
          {FLAG_IDS.map((id) => (
            <RadioQuestion
              key={id}
              id={id}
              legend={t(`flags.questions.${id}`)}
              options={FLAG_RESPONSES}
              value={redFlags[id]}
              onChange={(response) => setRedFlags((current) => ({ ...current, [id]: response }))}
              label={t}
            />
          ))}
        </div>
        {error && <InlineNotification kind="error" title={t("errors.title")} subtitle={error} />}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={goBack} className="gap-2"><ArrowLeft size={18} />{t("buttons.back")}</Button>
          <Button onClick={continueFromFlags} className="gap-2">{t("buttons.results")}<ArrowRight size={18} /></Button>
        </div>
      </div>,
    );
  }

  if (!result.complete) {
    return shell(
      <div className="mx-auto max-w-2xl">
        <InlineNotification kind="error" title={t("errors.title")} subtitle={t("errors.incomplete")} />
        <Button onClick={() => setScreen("context")}>{t("buttons.return")}</Button>
      </div>,
    );
  }

  if (screen === "results") {
    return shell(
      <div>
        <Button variant="ghost" className="mb-7 gap-2" onClick={goBack}><ArrowLeft size={18} />{t("buttons.back")}</Button>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("results.eyebrow")}</p>
        <h1 className="mt-4 font-display text-5xl uppercase tracking-tight sm:text-6xl">{t("results.title")}</h1>
        <div className="mt-8 grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
          <div className="rounded-card border border-hair bg-panel p-7">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("results.scoreLabel")}</p>
            <p className="mt-2 font-display text-7xl text-accent">{result.overallScore}<span className="text-3xl text-muted">/100</span></p>
            <p className="mt-5 text-xl font-medium">{t(`maturity.${result.displayedMaturity}`)}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t(`profiles.${result.profile}`)}</p>
          </div>
          <div className="rounded-card border border-hair bg-ground-2 p-7">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
              {t(result.opportunityKind === "growth_opportunity" ? "results.growthOpportunityLabel" : "results.barrierLabel")}
            </p>
            <h2 className="mt-3 text-2xl font-medium">{t(`barriers.${result.barrierPillar}`)}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{t(`barrierDescriptions.${result.barrierPillar}`)}</p>
          </div>
        </div>
        {result.triggeredFlagIds.length > 0 && (
          <InlineNotification kind="warning" title={t("results.warningTitle")} subtitle={t("results.warningBody")} />
        )}
        <section className="mt-10" aria-labelledby="pillar-scores-title">
          <h2 id="pillar-scores-title" className="font-display text-3xl uppercase tracking-tight">{t("results.pillarsTitle")}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar) => (
              <div key={pillar} className="rounded-card border border-hair bg-panel p-5">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted">{t(`pillars.${pillar}.title`)}</p>
                <p className="mt-3 text-3xl font-medium">{Math.round(result.pillarScores[pillar])}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-10 rounded-card border border-accent/30 bg-accent/5 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent">{t("results.firstRecommendation")}</p>
          <h2 className="mt-3 text-2xl font-medium">{t(`actions.${result.firstRecommendation}.title`)}</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-ink-soft">{t(`actions.${result.firstRecommendation}.whatToDo`)}</p>
        </section>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">{t("results.disclaimer")}</p>
        <section className="mt-10 grid items-center gap-6 rounded-card border border-hair bg-panel p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-medium">{t("results.unlockTitle")}</h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{t("results.unlockBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Button onClick={() => setScreen("lead")} className="gap-2">{t("results.unlockButton")}<ArrowRight size={18} /></Button>
          </div>
        </section>
      </div>,
    );
  }

  if (screen === "lead") {
    return shell(
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => setScreen("results")} className="mb-7 inline-flex items-center gap-2 rounded-field text-sm text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft size={18} />{t("lead.continueWithoutPlan")}
        </button>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{result.overallScore}/100 · {t(`maturity.${result.displayedMaturity}`)}</p>
        <h1 className="mt-4 font-display text-5xl uppercase tracking-tight">{t("lead.title")}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">{t("lead.intro")}</p>
        <form onSubmit={submitLead} className="mt-8 rounded-card border border-hair bg-panel p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput id="audit-first-name" name="firstName" label={t("lead.firstName")} required maxLength={80} autoComplete="given-name" />
            <TextInput id="audit-email" name="email" label={t("lead.email")} type="email" required maxLength={254} autoComplete="email" />
            <TextInput id="audit-company" name="company" label={t("lead.company")} required maxLength={120} autoComplete="organization" />
            <TextInput id="audit-website" name="website" label={t("lead.website")} type="url" maxLength={240} placeholder={t("lead.websitePlaceholder")} autoComplete="url" />
          </div>
          <label className="mt-6 flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
            <input name="consent" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-accent" />
            <span>{t("lead.consent")}</span>
          </label>
          {submissionState === "error" && <InlineNotification kind="error" title={t("errors.title")} subtitle={t("lead.error")} />}
          <div className="mt-7 flex flex-wrap gap-3">
            <Button type="submit" disabled={submissionState === "submitting"} className="gap-2">
              {submissionState === "submitting" ? t("lead.submitting") : t("lead.submit")}
              {submissionState !== "submitting" && <ArrowRight size={18} />}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setScreen("results")}>{t("lead.continueWithoutPlan")}</Button>
          </div>
        </form>
      </div>,
    );
  }

  return shell(
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("plan.eyebrow")}</p>
      <h1 className="mt-4 max-w-4xl font-display text-5xl uppercase tracking-tight sm:text-6xl">{t("plan.title")}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{t("plan.intro")}</p>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {result.actionIds.map((actionId, index) => (
          <article key={actionId} className="rounded-card border border-hair bg-panel p-6">
            <span className="font-mono text-xs text-accent">0{index + 1}</span>
            <h2 className="mt-4 text-xl font-medium">{t(`actions.${actionId}.title`)}</h2>
            <dl className="mt-6 space-y-5 text-sm leading-relaxed">
              <div><dt className="font-mono text-xs uppercase tracking-[0.08em] text-muted">{t("plan.why")}</dt><dd className="mt-2 text-ink-soft">{t(`actions.${actionId}.why`)}</dd></div>
              <div><dt className="font-mono text-xs uppercase tracking-[0.08em] text-muted">{t("plan.do")}</dt><dd className="mt-2 text-ink-soft">{t(`actions.${actionId}.whatToDo`)}</dd></div>
              <div><dt className="font-mono text-xs uppercase tracking-[0.08em] text-muted">{t("plan.verify")}</dt><dd className="mt-2 text-ink-soft">{t(`actions.${actionId}.verify`)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <section className="mt-10 rounded-card border border-accent/30 bg-accent/5 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent">{t("plan.ctaTitle")}</p>
        <h2 className="mt-3 text-2xl font-medium">{t(`plan.cta.${result.ctaRoute}.title`)}</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-ink-soft">{t(`plan.cta.${result.ctaRoute}.description`)}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={dataAuditCtaPath(result.ctaRoute, locale)}
            onClick={() => trackAssessmentEvent("primary_cta_clicked", { cta_route: result.ctaRoute })}
            className="inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 font-medium text-on-accent transition-colors hover:bg-accent-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            {t(`plan.cta.${result.ctaRoute}.button`)} <ArrowRight size={18} />
          </Link>
          <a
            href="mailto:john@serra.us"
            onClick={() => trackAssessmentEvent("secondary_cta_clicked", { cta_route: result.ctaRoute })}
            className="inline-flex items-center rounded-pill border border-line px-6 py-3 font-medium text-ink transition-colors hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            {t("plan.secondaryCta")}
          </a>
        </div>
      </section>
      <Button variant="ghost" className="mt-6 gap-2" onClick={goBack}><ArrowLeft size={18} />{t("buttons.backToResults")}</Button>
    </div>,
  );
}
