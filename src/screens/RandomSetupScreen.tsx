import { useState, useEffect } from "react";
import { db } from "../db";

interface Props {
  onStart: (n: number) => void;
  onBack: () => void;
}

export function RandomSetupScreen({ onStart, onBack }: Props) {
  const [total, setTotal] = useState(0);
  const [n, setN] = useState(10);

  useEffect(() => {
    db.examSets.toArray().then((sets) => {
      const count = sets.reduce((s, e) => s + e.data.questions.length, 0);
      setTotal(count);
      setN(Math.min(10, count));
    });
  }, []);

  return (
    <div className="screen setup-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={onBack}>‹</button>
        <h2>랜덤 빠른 풀기</h2>
      </header>

      <div className="setup-body">
        <p className="setup-desc">전체 {total}문항 중에서 랜덤으로 출제합니다.</p>

        <label className="setup-label">
          문항 수
          <input
            type="number"
            className="setup-input"
            value={n}
            min={1}
            max={total}
            onChange={(e) => setN(Math.max(1, Math.min(total, Number(e.target.value))))}
          />
        </label>

        <input
          type="range"
          className="setup-range"
          value={n}
          min={1}
          max={total}
          onChange={(e) => setN(Number(e.target.value))}
        />

        <button
          className="btn-start"
          disabled={total === 0}
          onClick={() => onStart(n)}
        >
          시작
        </button>
      </div>
    </div>
  );
}
