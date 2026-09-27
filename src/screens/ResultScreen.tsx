import { useState } from "react";
import type { GradingResult, GradedQuestion } from "../lib/grading";
import { MathMarkdown } from "../components/MathMarkdown";

interface Props {
  result: GradingResult;
  onHome: () => void;
  onRetry: () => void;
  review?: boolean;
}

export function ResultScreen({ result, onHome, onRetry, review }: Props) {
  const { questions, totalScore, maxScore } = result;
  const correctCount = questions.filter((q) => q.isCorrect).length;
  const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const hasWrong = correctCount < questions.length;

  return (
    <div className="screen result-screen">
      <header className="screen-header">
        <h2>{review ? "지난 결과" : "결과"}</h2>
      </header>

      <div className="result-score-card">
        <div className="score-big">{totalScore}<span className="score-max">/{maxScore}</span><span className="score-unit">점</span></div>
        <div className="score-sub">{correctCount} / {questions.length}문항 정답 ({pct}%)</div>
        <div className="score-bar">
          <div className="score-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="result-list">
        {questions.map((gq, i) => (
          <ResultItem key={gq.key} gq={gq} index={i} />
        ))}
      </div>

      <div className="result-actions">
        {hasWrong && (
          <button className="btn-secondary" onClick={onRetry}>오답 다시 풀기</button>
        )}
        <button className="btn-primary" onClick={onHome}>{review ? "목록으로" : "홈으로"}</button>
      </div>
    </div>
  );
}

function ResultItem({ gq, index }: { gq: GradedQuestion; index: number }) {
  const [open, setOpen] = useState(false);
  const q = gq.question;

  // 선택지 번호(1부터)를 "N번 내용" 형태로. 이미지 선택지는 내용 대신 표시 문구
  const choiceLabel = (n: number): string => {
    if (q.type !== "choice") return `${n}번`;
    const c = q.choices[n - 1];
    if (c === undefined) return `${n}번`;
    const text = typeof c === "string" ? c : c.text ?? (c.image ? "(이미지)" : "");
    return text ? `${n}번 ${text}` : `${n}번`;
  };

  const correctAnswerLabel =
    q.type === "choice"
      ? q.answers.map(choiceLabel).join(", ")
      : q.answers.join(" / ");

  const userAnswerLabel =
    gq.userAnswer === undefined
      ? "미응답"
      : q.type === "choice" && typeof gq.userAnswer === "number"
      ? choiceLabel(gq.userAnswer)
      : String(gq.userAnswer);

  return (
    <div className={`result-item ${gq.isCorrect ? "result-item--correct" : "result-item--wrong"}`}>
      <div className="result-item-header" onClick={() => setOpen(!open)}>
        <span className="result-mark">{gq.isCorrect ? "✓" : "✗"}</span>
        <span className="result-q-num">{index + 1}.</span>
        <span className="result-stem-preview">{q.stem.slice(0, 60)}{q.stem.length > 60 ? "…" : ""}</span>
        <span className="result-chevron">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="result-item-body">
          <MathMarkdown className="result-stem">{q.stem}</MathMarkdown>
          {q.image && <img src={q.image} alt="" className="result-image" />}

          <div className="result-answer-row">
            <span className={`answer-label ${gq.isCorrect ? "answer-label--correct" : "answer-label--wrong"}`}>
              내 답: {userAnswerLabel}
            </span>
            {!gq.isCorrect && (
              <span className="answer-label answer-label--correct">
                정답: {correctAnswerLabel}
              </span>
            )}
          </div>

          {q.explanation && (
            <div className="result-explanation">
              <MathMarkdown>{q.explanation}</MathMarkdown>
            </div>
          )}
          {q.explanationImage && (
            <img src={q.explanationImage} alt="" className="result-image" />
          )}
        </div>
      )}
    </div>
  );
}
