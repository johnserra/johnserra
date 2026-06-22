"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { TextArea } from "@/components/ui/TextArea";
import { InlineNotification } from "@/components/ui/InlineNotification";

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");
  const t = useTranslations("Contact.form");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to send");
      setState("success");
      form.reset();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <TextInput
            label={t("name")}
            id="contact-name"
            name="name"
            placeholder={t("namePlaceholder")}
            required
            disabled={state === "submitting" || state === "success"}
          />
          <TextInput
            label={t("email")}
            id="contact-email"
            name="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            required
            disabled={state === "submitting" || state === "success"}
          />
        </div>
        <TextArea
          label={t("message")}
          id="contact-message"
          name="message"
          placeholder={t("messagePlaceholder")}
          required
          rows={5}
          disabled={state === "submitting" || state === "success"}
        />

        <Button
          type="submit"
          disabled={state === "submitting" || state === "success"}
          className="self-start min-w-[120px]"
        >
          {state === "submitting" ? t("submitting") : t("submit")}
        </Button>
      </form>

      {state === "success" && (
        <InlineNotification
          kind="success"
          title="Success"
          subtitle={t("success")}
          onClose={() => setState("idle")}
        />
      )}
      {state === "error" && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={t("error")}
          onClose={() => setState("idle")}
        />
      )}
    </div>
  );
}
