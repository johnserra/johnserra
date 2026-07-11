import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "@carbon/icons-react";
import { getTranslations } from "next-intl/server";

export async function AboutTeaserBox() {
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
          <Link href="/about">
            <Button variant="secondary" className="inline-flex items-center gap-2">
              {t("ctaText")}
              <ArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
