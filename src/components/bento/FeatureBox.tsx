import { FeatureHighlight } from "@/types";

interface FeatureBoxProps extends FeatureHighlight {
  className?: string;
}

export function FeatureBox({
  title,
  description,
  icon,
  className,
}: FeatureBoxProps) {
  return (
    <div
      className={className}
    >
      {icon && <div className="mb-4 text-blue-600 dark:text-blue-400">{icon}</div>}
      <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
        {title}
      </h3>
      <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
