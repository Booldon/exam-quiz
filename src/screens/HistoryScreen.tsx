import { useState, useEffect } from "react";
import { db, type AttemptRecord } from "../db";

interface Props {
  onOpen: (attempt: AttemptRecord) => void;
  onBack: () => void;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoryScreen({ onOpen, onBack }: Props) {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);

  async function load() {
    const list = await db.attempts.orderBy("finishedAt").reverse().toArray();
    setAttempts(list);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("이 결과 기록을 삭제할까요?")) return;
    await db.attempts.delete(id);
    load();
  }

  async function handleClearAll() {
    if (!confirm("모든 결과 기록을 삭제할까요?")) return;
    await db.attempts.clear();
    load();
  }

  return (
    <div className="screen history-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={onBack}>‹</button>
        <h2>지난 결과</h2>
        {attempts.length > 0 && (
          <button className="btn-clear-all" onClick={handleClearAll}>전체 삭제</button>
        )}
      </header>

      {attempts.length === 0 ? (
        <div className="empty-state">
          <p>채점 기록이 없습니다.</p>
          <p className="empty-sub">문제를 풀고 채점하면 여기에 기록됩니다.</p>
        </div>
      ) : (
        <div className="history-list">
          {attempts.map((a) => {
            const pct = a.maxScore > 0 ? Math.round((a.totalScore / a.maxScore) * 100) : 0;
            return (
              <div key={a.id} className="history-card" onClick={() => onOpen(a)}>
                <div className="history-card-main">
                  <div className="history-title">{a.title}</div>
                  <div className="history-meta">
                    {formatDate(a.finishedAt)} · {a.correctCount}/{a.questionCount}문항
                  </div>
                </div>
                <div className="history-score">
                  <span className="history-score-num">{a.totalScore}</span>
                  <span className="history-score-max">/{a.maxScore}</span>
                  <span className="history-score-pct">{pct}%</span>
                </div>
                <button className="history-delete" onClick={(e) => handleDelete(a.id!, e)}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
