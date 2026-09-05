import { Link } from "@/i18n/navigation";
import { ProjectItem } from "@/types";
import { ArrowUpRight } from "@carbon/icons-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProjectBoxProps extends ProjectItem {
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
  span = 4,
  className,
  priority = false,
}: ProjectBoxProps) {
  return (
    <Link
      href={link}
      className={cn(
        "group relative overflow-hidden rounded-card aspect-[4/3]",
        "bg-panel border border-hair",
        "transition-colors duration-200",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        "hover:border-line-strong",
        "col-span-1",
        span === 3 && "md:col-span-3 lg:col-span-3",
        span === 4 && "md:col-span-3 lg:col-span-4",
        span === 5 && "md:col-span-3 lg:col-span-5",
        span === 6 && "md:col-span-6 lg:col-span-6",
        span === 8 && "md:col-span-6 lg:col-span-8",
        span === 12 && "md:col-span-6 lg:col-span-12",
        className
      )}
    >
      {/* Placeholder for image */}
      <div className="absolute inset-0 bg-panel-2" />

      {image && (
        <Image
          src={image}
          alt={title}
          fill
          sizes={PROJECT_IMAGE_SIZES[span] ?? PROJECT_IMAGE_SIZES[4]}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-ground/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-ink mb-2 flex items-center gap-2">
            {title}
            <ArrowUpRight size={20} className="text-muted transition-colors group-hover:text-accent" />
          </h2>
          <p className="text-sm text-ink-soft">{description}</p>
        </div>
      </div>

      {/* Title visible by default (on bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-ground/80 group-hover:opacity-0 transition-opacity">
        <span aria-hidden="true" className="text-lg font-medium tracking-tight text-ink">
          {title}
        </span>
      </div>
    </Link>
  );
}
