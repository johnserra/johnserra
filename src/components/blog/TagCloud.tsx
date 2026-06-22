"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tag } from "@/components/ui/Tag";
import { FilterGroup } from "@/components/ui/FilterGroup";

interface TagCloudProps {
  tags: { name: string; count: number }[];
}

export function TagCloud({ tags }: TagCloudProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag");

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
    <FilterGroup label="Filter by Topic" className="mb-10">
      {tags.map((tag) => {
        const isActive = activeTag === tag.name;
        return (
          <Tag
            key={tag.name}
            type={isActive ? "blue" : "gray"}
            onClick={() => handleClick(tag.name)}
            onClose={isActive ? () => handleClick(tag.name) : undefined}
          >
            {tag.name} ({tag.count})
          </Tag>
        );
      })}
    </FilterGroup>
  );
}
