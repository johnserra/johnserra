import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ABOUT_TEASER } from "@/lib/constants";
import { ArrowRight } from "lucide-react";

export function AboutTeaserBox() {
  return (
    <div className="col-span-1 md:col-span-6 lg:col-span-8">
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          About Me
        </h2>
        <p className="text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {ABOUT_TEASER.content}
        </p>
        <div>
          <Link href={ABOUT_TEASER.ctaLink}>
            <Button variant="secondary" className="inline-flex items-center gap-2">
              {ABOUT_TEASER.ctaText}
              <ArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
