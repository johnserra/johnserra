import { Link } from "@/i18n/navigation";
import { ArrowRight, Compass } from "@carbon/icons-react";
import { getLocale, getTranslations } from "next-intl/server";
import { aboutPath } from "@/lib/routes";

export async function AboutTeaserBox() {
  const locale = await getLocale();
  const t = await getTranslations("AboutTeaser");

  return (
    <div className="col-span-1 md:col-span-6 lg:col-span-12 relative overflow-hidden rounded-2xl border border-hair bg-panel shadow-sm">
      <div
        className="h-1 w-full bg-gradient-to-r from-[#006b9e] via-[#38a3d6] to-[#22c55e]"
        aria-hidden="true"
      />
      <div className="p-6 md:p-10 lg:p-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 mb-4">
          <Compass size={14} className="text-accent" />
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-accent">
            {t("eyebrow")}
          </span>
        </div>

        <h2 className="font-serif text-3xl sm:text-4xl text-ink leading-tight max-w-3xl mb-6">
          {t("title")}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-5">
            <p className="text-base md:text-lg text-muted leading-relaxed">
              {t("content")}
            </p>
            <div>
              <Link
                href={aboutPath(locale)}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 font-sans text-sm font-medium text-on-accent transition-colors hover:bg-accent-dim no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span>{t("ctaText")}</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-xl border border-hair bg-ground p-6">
            <p className="font-mono text-xs uppercase tracking-wider text-accent font-semibold mb-3">
              {t("heading")}
            </p>
            <div className="space-y-2.5 border-t border-hair pt-4 font-mono text-[11px] text-ink">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t("metaRoleLabel")}</span>
                <span className="text-right font-medium">{t("metaRoleValue")}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t("metaMethodLabel")}</span>
                <span className="text-right font-medium">{t("metaMethodValue")}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t("metaCommunityLabel")}</span>
                <span className="text-right font-medium text-accent">{t("metaCommunityValue")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
