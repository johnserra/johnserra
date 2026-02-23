"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Name" name="name" type="text" placeholder="Your name" required />
        <Field label="Email" name="email" type="email" placeholder="your@email.com" required />
      </div>
      <Field
        label="Message"
        name="message"
        type="textarea"
        placeholder="What's on your mind?"
        required
      />

      <div className="flex items-center gap-4">
        <Button
          type="submit"
          disabled={state === "submitting" || state === "success"}
          className="self-start"
        >
          {state === "submitting" ? "Sending…" : "Send Message"}
        </Button>

        {state === "success" && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Message sent! I'll be in touch soon.
          </p>
        )}
        {state === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Something went wrong. Try emailing directly.
          </p>
        )}
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type: "text" | "email" | "textarea";
  placeholder?: string;
  required?: boolean;
}

function Field({ label, name, type, placeholder, required }: FieldProps) {
  const base = cn(
    "w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800",
    "border border-zinc-200 dark:border-zinc-700",
    "text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400",
    "outline-none focus:ring-2 focus:ring-blue-600 transition"
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          name={name}
          placeholder={placeholder}
          required={required}
          rows={5}
          className={base}
        />
      ) : (
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          required={required}
          className={base}
        />
      )}
    </div>
  );
}
