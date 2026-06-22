import { Link } from "@/i18n/navigation";
import { ProjectItem } from "@/types";
import { ArrowUpRight } from "@carbon/icons-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProjectBoxProps extends ProjectItem {
  className?: string;
}

export function ProjectBox({
  title,
  description,
  link,
  image,
  span = 4,
  className,
}: ProjectBoxProps) {
  return (
    <Link
      href={link}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-bento)] aspect-[4/3]",
        "bg-carbon-gray-10 dark:bg-carbon-gray-90 border border-carbon-gray-20 dark:border-zinc-800",
        "transition-all duration-200",
        "focus-visible:ring-2 focus-visible:ring-carbon-blue focus-visible:outline-none",
        "hover:border-carbon-blue dark:hover:border-carbon-blue hover:shadow-sm",
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
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800" />

      {image && (
        <Image
          src={image}
          alt={title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
        <div className="text-white">
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            {title}
            <ArrowUpRight size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </h3>
          <p className="text-sm text-white/90">{description}</p>
        </div>
      </div>

      {/* Title visible by default (on bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent group-hover:opacity-0 transition-opacity">
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>
    </Link>
  );
}
