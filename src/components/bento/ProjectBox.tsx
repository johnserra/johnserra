import { Link } from "@/i18n/navigation";
import { ProjectItem } from "@/types";
import { ArrowUpRight } from "@carbon/icons-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProjectBoxProps extends ProjectItem {
  badge?: string;
  ctaLabel?: string;
  className?: string;
  priority?: boolean;
}

const PROJECT_IMAGE_SIZES: Record<number, string> = {
  3: "(min-width: 1280px) 284px, (min-width: 1024px) calc(25vw - 36px), (min-width: 768px) calc(50vw - 34px), calc(100vw - 34px)",
  4: "(min-width: 1280px) 387px, (min-width: 1024px) calc(33.333vw - 39.333px), (min-width: 768px) calc(50vw - 34px), calc(100vw - 34px)",
  5: "(min-width: 1280px) 491px, (min-width: 1024px) calc(41.667vw - 42.667px), (min-width: 768px) calc(50vw - 34px), calc(100vw - 34px)",
  6: "(min-width: 1280px) 594px, (min-width: 1024px) calc(50vw - 46px), (min-width: 768px) calc(100vw - 50px), calc(100vw - 34px)",
  8: "(min-width: 1280px) 801px, (min-width: 1024px) calc(66.667vw - 52.667px), (min-width: 768px) calc(100vw - 50px), calc(100vw - 34px)",
  12: "(min-width: 1280px) 1214px, (min-width: 1024px) calc(100vw - 66px), (min-width: 768px) calc(100vw - 50px), calc(100vw - 34px)",
};

export function ProjectBox({
  title,
  description,
  link,
  image,
  badge,
  ctaLabel,
  span = 4,
  className,
  priority = false,
}: ProjectBoxProps) {
  return (
    <Link
      href={link}
      className={cn(
        "group flex flex-col justify-between overflow-hidden rounded-xl",
        "bg-panel border border-hair shadow-sm",
        "transition-all duration-200 no-underline",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        "hover:border-accent/50 hover:shadow-md",
        "col-span-1",
        span === 3 && "md:col-span-3 lg:col-span-4",
        span === 4 && "md:col-span-3 lg:col-span-4",
        span === 5 && "md:col-span-3 lg:col-span-4",
        span === 6 && "md:col-span-6 lg:col-span-6",
        span === 8 && "md:col-span-6 lg:col-span-8",
        span === 12 && "md:col-span-6 lg:col-span-12",
        className
      )}
    >
      <div>
        {/* Image Header with 3px Brand Divider */}
        <div className="relative aspect-[16/10] w-full overflow-hidden border-b-[3px] border-brand bg-panel-2">
          {image && (
            <Image
              src={image}
              alt={title}
              fill
              sizes={PROJECT_IMAGE_SIZES[span] ?? PROJECT_IMAGE_SIZES[4]}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              className="object-cover transition-transform duration-300 group-hover:scale-105 group-focus-visible:scale-105"
            />
          )}
        </div>

        {/* Editorial Body */}
        <div className="p-6">
          {badge && (
            <div className="mb-3">
              <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-accent">
                {badge}
              </span>
            </div>
          )}

          <h3 className="font-serif text-2xl text-ink group-hover:text-accent transition-colors leading-snug mb-2">
            {title}
          </h3>

          <p className="text-sm text-muted leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {ctaLabel && (
        <div className="px-6 pb-6 pt-3 border-t border-hair/70 flex items-center justify-between font-mono text-xs font-semibold uppercase tracking-wider text-accent group-hover:text-accent-dim">
          <span>{ctaLabel}</span>
          <ArrowUpRight size={16} />
        </div>
      )}
    </Link>
  );
}
