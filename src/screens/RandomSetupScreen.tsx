import { useState, useEffect } from "react";
import { db } from "../db";

const UNCATEGORIZED = "미분류";
const ALL = "__all__";

interface Props {
  onStart: (n: number, category: string | null) => void;
  onBack: () => void;
}

interface CategoryOption {
  key: string; // ALL 또는 카테고리 이름
  label: string;
  count: number; // 문항 수
}

export function RandomSetupScreen({ onStart, onBack }: Props) {
  const [options, setOptions] = useState<CategoryOption[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [n, setN] = useState(10);

  useEffect(() => {
    (async () => {
      const [sets, cats] = await Promise.all([
        db.examSets.toArray(),
        db.categories.toArray(),
      ]);
      const catMap = Object.fromEntries(cats.map((c) => [c.examId, c.category]));

      const total = sets.reduce((s, e) => s + e.data.questions.length, 0);
      const perCategory: Record<string, number> = {};
      for (const s of sets) {
        const cat = catMap[s.examId] ?? UNCATEGORIZED;
        perCategory[cat] = (perCategory[cat] ?? 0) + s.data.questions.length;
      }

      const catKeys = Object.keys(perCategory).sort((a, b) => {
        if (a === UNCATEGORIZED) return 1;
        if (b === UNCATEGORIZED) return -1;
        return a.localeCompare(b, "ko");
      });

      const opts: CategoryOption[] = [
        { key: ALL, label: "전체", count: total },
        ...catKeys.map((c) => ({ key: c, label: c, count: perCategory[c] })),
      ];
      setOptions(opts);
      setN(Math.min(10, total));
    })();
  }, []);

  const selectedCount = options.find((o) => o.key === selected)?.count ?? 0;

  // 선택한 카테고리 문항 수에 맞춰 n 보정
  useEffect(() => {
    setN((prev) => Math.max(1, Math.min(prev, selectedCount)));
  }, [selected, selectedCount]);

  return (
    <div className="screen setup-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={onBack}>‹</button>
        <h2>랜덤 빠른 풀기</h2>
      </header>

      <div className="setup-body">
        {options.length > 1 && (
          <div className="setup-field">
            <span className="setup-field-label">출제 범위</span>
            <div className="category-chips">
              {options.map((o) => (
                <button
                  key={o.key}
                  className={`category-chip ${selected === o.key ? "category-chip--active" : ""}`}
                  onClick={() => setSelected(o.key)}
                >
                  {o.label} <span className="chip-count">{o.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="setup-desc">
          {selected === ALL ? "전체" : options.find((o) => o.key === selected)?.label} {selectedCount}문항 중에서 랜덤으로 출제합니다.
        </p>

        <label className="setup-label">
          문항 수
          <input
            type="number"
            className="setup-input"
            value={n}
            min={1}
            max={selectedCount}
            onChange={(e) => setN(Math.max(1, Math.min(selectedCount, Number(e.target.value))))}
          />
        </label>

        <input
          type="range"
          className="setup-range"
          value={n}
          min={1}
          max={selectedCount}
          onChange={(e) => setN(Number(e.target.value))}
        />

        <button
          className="btn-start"
          disabled={selectedCount === 0}
          onClick={() => onStart(n, selected === ALL ? null : selected)}
        >
          시작
        </button>
      </div>
    </div>
  );
}
