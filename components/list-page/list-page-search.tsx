"use client";

import { Input } from "@/components/ui/input";

interface ListPageSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function ListPageSearch({
  value,
  onChange,
  placeholder,
}: ListPageSearchProps) {
  return (
    <Input
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type="search"
      value={value}
    />
  );
}
