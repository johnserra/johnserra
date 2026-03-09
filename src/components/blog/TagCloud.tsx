"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface TagCloudProps {
  tags: { name: string; count: number }[];
}

export function TagCloud({ tags }: TagCloudProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag");

  const maxCount = Math.max(...tags.map((t) => t.count));
  const minCount = Math.min(...tags.map((t) => t.count));

  function getSize(count: number): string {
    if (maxCount === minCount) return "text-sm";
    const ratio = (count - minCount) / (maxCount - minCount);
    if (ratio < 0.2) return "text-xs";
    if (ratio < 0.4) return "text-sm";
    if (ratio < 0.6) return "text-base";
    if (ratio < 0.8) return "text-lg";
    return "text-xl";
  }

  function getWeight(count: number): string {
    if (maxCount === minCount) return "font-medium";
    const ratio = (count - minCount) / (maxCount - minCount);
    if (ratio < 0.5) return "font-medium";
    return "font-bold";
  }

  function handleClick(tagName: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTag === tagName) {
      params.delete("tag");
    } else {
      params.set("tag", tagName);
    }
    const query = params.toString();
    router.push(query ? `?${query}` : ".", { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-10">
      {tags.map((tag) => {
        const isActive = activeTag === tag.name;
        return (
          <button
            key={tag.name}
            onClick={() => handleClick(tag.name)}
            className={`${getSize(tag.count)} ${getWeight(tag.count)} transition-colors cursor-pointer ${
              isActive
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            {tag.name}
            {isActive && (
              <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">&times;</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
