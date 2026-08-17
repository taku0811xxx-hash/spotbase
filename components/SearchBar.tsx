"use client";

import { useState } from "react";

type Props = {
  onSearch: (query: string) => void;
  onSubmit?: (query: string) => void;
  loading?: boolean;
};

export default function SearchBar({ onSearch, onSubmit, loading }: Props) {
  const [value, setValue] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onSubmit?.(value);
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onSearch(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="現場名・住所・地名で検索(Enterで場所を検索)"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />
      </div>
      {loading && (
        <span className="text-xs text-gray-400 flex-shrink-0">検索中...</span>
      )}
    </div>
  );
}
