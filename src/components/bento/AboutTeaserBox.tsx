import { Link } from "@/i18n/navigation";
import { ArrowRight } from "@carbon/icons-react";
import { getLocale, getTranslations } from "next-intl/server";
import { aboutPath } from "@/lib/routes";

export async function AboutTeaserBox() {
  const locale = await getLocale();
  const t = await getTranslations("AboutTeaser");

  return (
    <div className="col-span-1 md:col-span-6 lg:col-span-8">
      <div className="flex flex-col gap-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
          {t("heading")}
        </h2>
        <p className="text-base md:text-lg text-ink-soft leading-relaxed">
          {t("content")}
        </p>
        <div>
          <Link
            href={aboutPath(locale)}
            className="inline-flex items-center gap-2 rounded-field font-medium text-accent transition-colors hover:text-accent-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:text-accent-dim"
          >
            {t("ctaText")}
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
