"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "@carbon/icons-react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextInput } from "@/components/ui/TextInput";
import { InlineNotification } from "@/components/ui/InlineNotification";

type FormState = "idle" | "submitting" | "success" | "error";

export function ServicesInquiryForm() {
  const t = useTranslations("Services.form");
  const [state, setState] = useState<FormState>("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "services" }),
      });
      if (!response.ok) throw new Error("Request failed");
      form.reset();
      setState("success");
    } catch {
      setState("error");
    }
  }

  const disabled = state === "submitting" || state === "success";
  const selectClassName = "h-10 w-full rounded-field border border-hair bg-ground-2 px-4 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput label={t("name")} name="name" id="inquiry-name" required disabled={disabled} />
        <TextInput label={t("email")} name="email" id="inquiry-email" type="email" required disabled={disabled} />
        <TextInput label={t("company")} name="company" id="inquiry-company" disabled={disabled} />
        <label className="flex flex-col gap-1.5 font-sans text-left">
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("service")}</span>
          <select name="service" required disabled={disabled} className={selectClassName} defaultValue="">
            <option value="" disabled>{t("chooseService")}</option>
            <option value="dashboard">{t("dashboard")}</option>
            <option value="analysis">{t("analysis")}</option>
            <option value="automation">{t("automation")}</option>
            <option value="data-foundation">{t("dataFoundation")}</option>
            <option value="other">{t("other")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-sans text-left">
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("budget")}</span>
          <select name="budget" disabled={disabled} className={selectClassName} defaultValue="">
            <option value="">{t("notSure")}</option>
            <option value="under-1k">{t("under1k")}</option>
            <option value="1k-3k">$1,000–$3,000</option>
            <option value="3k-7k">$3,000–$7,000</option>
            <option value="7k-plus">$7,000+</option>
          </select>
        </label>
        <TextInput label={t("timeline")} name="timeline" id="inquiry-timeline" placeholder={t("timelinePlaceholder")} disabled={disabled} />
      </div>
      <TextArea label={t("message")} name="message" id="inquiry-message" rows={5} placeholder={t("messagePlaceholder")} required disabled={disabled} />
      <Button type="submit" size="lg" className="self-start gap-2" disabled={disabled}>
        {state === "submitting" ? t("submitting") : t("submit")}
        {state !== "submitting" && <ArrowRight size={18} />}
      </Button>
      {state === "success" && <InlineNotification kind="success" title={t("successTitle")} subtitle={t("success")} onClose={() => setState("idle")} />}
      {state === "error" && <InlineNotification kind="error" title={t("errorTitle")} subtitle={t("error")} onClose={() => setState("idle")} />}
    </form>
  );
}
