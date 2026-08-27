"use client";

import { useState, memo, useEffect } from "react";

type Props = {
  onSearch: (query: string) => void;
  onSubmit?: (query: string) => void;
  loading?: boolean;
  onClear?: () => void;
};

const SearchBar = memo(function SearchBar({ onSearch, onSubmit, loading, onClear }: Props) {
  const [value, setValue] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // ハイドレーション後に実行
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onSubmit?.(value);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setValue(newValue);
    onSearch(newValue);

    // 検索キーワードが完全に消された場合、リセット処理を実行
    if (newValue === "") {
      onClear?.();
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="relative w-2/3 max-w-[66%] md:w-full md:max-w-none flex-none md:flex-1">
        <svg
          className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 text-gray-400"
          width="14"
          height="14"
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
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={mounted && isMobile ? "現場名・住所・地名で検索" : "現場名・住所・地名で検索 (Enterで場所を検索)"}
          // iOS Safariはinputのfont-sizeが16px未満だとフォーカス時に自動ズームしてしまうため、
          // 見た目の高さはpaddingで小さく保ちつつ、文字サイズは16px(text-base)以上を確保する
          className="w-full border border-gray-300 rounded-lg pl-7 pr-2 py-1 text-base md:pl-9 md:pr-3 md:py-2 md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />
      </div>
      {loading && (
        <span className="text-[10px] md:text-xs text-gray-400 flex-shrink-0">検索中...</span>
      )}
    </div>
  );
});

export default SearchBar;
