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
      {icon && <div className="mb-4 text-muted">{icon}</div>}
      <h3 className="text-xl md:text-2xl font-medium tracking-tight text-ink mb-3">
        {title}
      </h3>
      <p className="text-base text-ink-soft leading-relaxed">
        {description}
      </p>
    </div>
  );
}
