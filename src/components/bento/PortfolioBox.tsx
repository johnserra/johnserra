import Link from "next/link";
import Image from "next/image";
import { PortfolioProject } from "@/types";
import { ArrowUpRight } from "lucide-react";

interface PortfolioBoxProps extends PortfolioProject {
  className?: string;
}

export function PortfolioBox({
  title,
  description,
  image,
  link,
  className,
}: PortfolioBoxProps) {
  return (
    <Link href={link} className={className}>
      <div className="group relative overflow-hidden rounded-2xl aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
        {/* Placeholder for image */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950" />

        {/* Uncomment when you have actual images */}
        {/* <Image
          src={image}
          alt={title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        /> */}

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
      </div>
    </Link>
  );
}
