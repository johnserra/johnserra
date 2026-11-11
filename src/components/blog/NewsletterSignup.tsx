"use client";

import { useId, useState } from "react";
import { Email } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { InlineNotification } from "@/components/ui/InlineNotification";

interface NewsletterSignupProps {
  sourcePath?: string;
}

export function NewsletterSignup({ sourcePath = "/blog" }: NewsletterSignupProps) {
  const t = useTranslations("Blog.newsletter");
  const locale = useLocale();
  const headingId = useId();
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || status === "submitting") return;

    setStatus("submitting");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          locale,
          topic: "analytics",
          sourcePath,
        }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-hair bg-panel p-6 md:p-8 shadow-sm"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-2">
            <Email size={16} aria-hidden="true" />
            <span>{t("eyebrow")}</span>
          </div>
          <h2 id={headingId} className="font-serif text-2xl sm:text-3xl text-ink tracking-tight leading-snug text-balance mb-2">
            {t("title")}
          </h2>
          <p className="text-sm sm:text-base text-muted leading-relaxed">
            {t("description")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full md:w-auto md:min-w-[22rem]">
          <label
            htmlFor={inputId}
            className="block font-mono text-xs uppercase tracking-wider text-muted mb-1.5"
          >
            {t("emailLabel")}
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id={inputId}
              type="email"
              name="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder={t("placeholder")}
              required
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              disabled={status === "submitting"}
              className="flex-1 min-h-10 rounded-field border border-hair bg-ground-2 px-3.5 py-2 text-base sm:text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={status === "submitting"}
              className="shrink-0 justify-center"
            >
              {status === "submitting" ? t("submitting") : t("submit")}
            </Button>
          </div>
          <p className="mt-2 font-mono text-xs text-faint">
            {t("privacyNote")}
          </p>
        </form>
      </div>

      {status === "success" && (
        <div className="mt-4">
          <InlineNotification
            kind="success"
            title={t("successTitle")}
            subtitle={t("success")}
            onClose={() => setStatus("idle")}
          />
        </div>
      )}

      {status === "error" && (
        <div className="mt-4">
          <InlineNotification
            kind="error"
            title={t("errorTitle")}
            subtitle={t("error")}
            onClose={() => setStatus("idle")}
          />
        </div>
      )}
    </section>
  );
}
