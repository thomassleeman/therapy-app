"use client";

import { Button } from "@/components/ui/button";

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface ListPageFiltersProps<T extends string> {
  options: FilterOption<T>[];
  value: T | "all";
  onChange: (value: T | "all") => void;
  allLabel?: string;
}

export function ListPageFilters<T extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
}: ListPageFiltersProps<T>) {
  return (
    <div className="hidden md:flex flex-wrap gap-2">
      <Button
        onClick={() => onChange("all")}
        size="sm"
        variant={value === "all" ? "default" : "outline"}
      >
        {allLabel}
      </Button>
      {options.map((option) => (
        <Button
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          variant={value === option.value ? "default" : "outline"}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
