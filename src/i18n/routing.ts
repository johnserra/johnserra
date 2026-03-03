import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "@/types";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});
