"use client";

// 「ここトレ！」撮影準備タブ専用: 撮影カテゴリごとの機材・持ち物チェックリスト。
// カテゴリを選ぶとプリセット項目が並び、チェック状態・追加した独自項目は
// 端末内(Capacitor Preferences経由)に保存し、次回起動時も保持する。
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { readJson, writeJson } from "@/lib/photoStorage";

const STORAGE_KEY = "kokotore_equipment_checklist";

const CATEGORY_PRESETS: Record<string, string[]> = {
  "風景/夜景": ["カメラ本体", "予備バッテリー", "SDカード", "三脚", "NDフィルター", "レリーズ", "懐中電灯", "清掃用品"],
  "ポートレート": ["カメラ本体", "予備バッテリー", "SDカード", "予備レンズ", "レフ板", "メイク直しセット"],
  "スナップ": ["カメラ本体", "予備バッテリー", "SDカード", "予備レンズ", "清掃用品"],
};

const CATEGORIES = Object.keys(CATEGORY_PRESETS);

type CategoryState = {
  items: string[];
  checked: string[];
};

type StoredChecklist = Record<string, CategoryState>;

export default function EquipmentChecklist() {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [store, setStore] = useState<StoredChecklist>({});
  const [loaded, setLoaded] = useState(false);
  const [newItemText, setNewItemText] = useState("");

  useEffect(() => {
    readJson<StoredChecklist>(STORAGE_KEY, {}).then((data) => {
      setStore(data);
      setLoaded(true);
    });
  }, []);

  const current: CategoryState = store[category] ?? { items: CATEGORY_PRESETS[category], checked: [] };

  async function persist(next: StoredChecklist) {
    setStore(next);
    await writeJson(STORAGE_KEY, next);
  }

  function toggleChecked(item: string) {
    const isChecked = current.checked.includes(item);
    const nextChecked = isChecked ? current.checked.filter((i) => i !== item) : [...current.checked, item];
    persist({ ...store, [category]: { items: current.items, checked: nextChecked } });
  }

  function addItem() {
    const text = newItemText.trim();
    if (!text || current.items.includes(text)) return;
    persist({ ...store, [category]: { items: [...current.items, text], checked: current.checked } });
    setNewItemText("");
  }

  function removeItem(item: string) {
    persist({
      ...store,
      [category]: {
        items: current.items.filter((i) => i !== item),
        checked: current.checked.filter((i) => i !== item),
      },
    });
  }

  if (!loaded) {
    return <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>;
  }

  const checkedCount = current.checked.length;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              category === c
                ? "bg-orange-500 border-orange-500 text-white"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        {checkedCount} / {current.items.length} 項目チェック済み
      </p>

      <ul className="space-y-1.5">
        {current.items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2"
          >
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input
                type="checkbox"
                checked={current.checked.includes(item)}
                onChange={() => toggleChecked(item)}
                className="rounded border-gray-300"
              />
              <span className={`text-sm ${current.checked.includes(item) ? "text-gray-400 line-through" : "text-gray-800"}`}>
                {item}
              </span>
            </label>
            <button
              onClick={() => removeItem(item)}
              className="text-gray-300 hover:text-red-500 flex-shrink-0"
              aria-label={`${item}を削除`}
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="持ち物を追加(例: 偏光フィルター)"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={addItem}
          className="flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg bg-gray-800 text-white"
        >
          <Plus size={14} strokeWidth={2} />
          追加
        </button>
      </div>
    </div>
  );
}
