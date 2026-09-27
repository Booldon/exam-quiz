import { useState, useEffect, useRef } from "react";
import { useSwipeable } from "react-swipeable";
import { db, type SessionRecord, splitQuestionKey } from "../db";
import type { ExamSet, Question, ChoiceQuestion } from "../schema/examSchema";
import { gradeSession, type GradingResult } from "../lib/grading";
import { MathMarkdown } from "../components/MathMarkdown";
import { formatMs } from "../lib/math";

interface Props {
  onResult: (r: GradingResult) => void;
  onHome: () => void;
}

function getQuestion(key: string, map: Map<string, ExamSet>): Question | undefined {
  const { examId, round, questionId } = splitQuestionKey(key);
  return map.get(`${examId}/${round}`)?.questions.find((q) => q.id === questionId);
}

export function QuizScreen({ onResult, onHome }: Props) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [examSetMap, setExamSetMap] = useState<Map<string, ExamSet>>(new Map());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerOn, setTimerOn] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [shortInput, setShortInput] = useState("");
  const [starred, setStarred] = useState(false);
  const submittingRef = useRef(false);
  // 현재 활성 카운트다운의 절대 마감 시각(ms). 남은 시간 = deadlineRef - now
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const [s, sets] = await Promise.all([db.sessions.get(1), db.examSets.toArray()]);
      if (!s) return;
      setSession(s);
      setExamSetMap(new Map(sets.map((e) => [e.key, e.data])));
      if (s.remainingMs != null) {
        // 저장된 남은 시간부터 다시 카운트다운 시작
        deadlineRef.current = Date.now() + s.remainingMs;
        setTimerOn(true);
      }
    })();
  }, []);

  /** 현재 남은 시간을 세션에 반영한 객체를 돌려준다(타이머 없으면 그대로) */
  function withFreshRemaining(s: SessionRecord): SessionRecord {
    if (deadlineRef.current == null) return s;
    return { ...s, remainingMs: Math.max(0, deadlineRef.current - Date.now()) };
  }

  /** 남은 시간을 DB에 저장(중단·백그라운드 진입 시 호출) */
  async function persistRemaining() {
    if (deadlineRef.current == null) return;
    const s = await db.sessions.get(1);
    if (s) await db.sessions.put(withFreshRemaining(s));
  }

  const currentKey = session?.questionKeys[session.currentIndex];

  // sync shortInput and star when question changes
  useEffect(() => {
    if (!currentKey || !session) return;
    const ans = session.answers[currentKey];
    setShortInput(typeof ans === "string" ? ans : "");
    db.questionRecords.get(currentKey).then((r) => setStarred(r?.starred ?? false));
  }, [currentKey]);

  // 카운트다운: deadlineRef를 기준으로 남은 시간을 표시하고, 0이 되면 자동 제출
  useEffect(() => {
    if (!timerOn) return;
    const tick = () => {
      const left = (deadlineRef.current ?? 0) - Date.now();
      if (left <= 0) {
        setTimeLeft(0);
        if (!submittingRef.current) handleSubmit();
      } else {
        setTimeLeft(left);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerOn]);

  // 앱 백그라운드 진입/종료 또는 화면 이탈 시 남은 시간 저장(시간 정지)
  useEffect(() => {
    if (!timerOn) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistRemaining();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", persistRemaining);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", persistRemaining);
      persistRemaining(); // 화면 언마운트(홈 이동 등) 시에도 저장
    };
  }, [timerOn]);

  async function saveAnswer(key: string, value: number | string) {
    if (!session) return;
    const next = { ...session, answers: { ...session.answers, [key]: value } };
    await db.sessions.put(withFreshRemaining(next));
    setSession(next);
  }

  async function navigate(delta: number) {
    if (!session) return;
    const idx = session.currentIndex + delta;
    if (idx < 0 || idx >= session.questionKeys.length) return;
    if (currentKey) {
      const q = getQuestion(currentKey, examSetMap);
      if (q?.type === "short") await saveAnswer(currentKey, shortInput);
    }
    const next = { ...session, currentIndex: idx };
    await db.sessions.put(withFreshRemaining(next));
    setSession(next);
  }

  async function handleSubmit() {
    if (!session || submittingRef.current) return;
    submittingRef.current = true;
    if (currentKey) {
      const q = getQuestion(currentKey, examSetMap);
      if (q?.type === "short" && shortInput) await saveAnswer(currentKey, shortInput);
    }
    const fresh = await db.sessions.get(1);
    if (!fresh) return;
    const result = gradeSession(fresh, examSetMap);
    for (const gq of result.questions) {
      const existing = await db.questionRecords.get(gq.key);
      const { examId, round, questionId } = splitQuestionKey(gq.key);
      await db.questionRecords.put({
        key: gq.key,
        examId,
        round,
        questionId,
        wrongCount: (existing?.wrongCount ?? 0) + (gq.isCorrect ? 0 : 1),
        starred: existing?.starred ?? false,
        updatedAt: Date.now(),
      });
    }
    await db.sessions.delete(1);
    onResult(result);
  }

  async function toggleStar() {
    if (!currentKey) return;
    const existing = await db.questionRecords.get(currentKey);
    const { examId, round, questionId } = splitQuestionKey(currentKey);
    const next = !starred;
    setStarred(next);
    await db.questionRecords.put({
      key: currentKey,
      examId,
      round,
      questionId,
      wrongCount: existing?.wrongCount ?? 0,
      starred: next,
      updatedAt: Date.now(),
    });
  }

  async function handleHome() {
    if (!confirm("풀이를 중단하고 홈으로 돌아갈까요?\n진행 상황은 저장되어 이어풀기로 재개할 수 있습니다.")) return;
    onHome();
  }

  // iOS edge swipe workaround: preventScrollOnSwipe + touch area exclusion handled by CSS
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => navigate(1),
    onSwipedRight: () => navigate(-1),
    preventScrollOnSwipe: true,
    delta: 50,
    swipeDuration: 500,
    touchEventOptions: { passive: false },
  });

  if (!session) return <div className="loading">로딩 중…</div>;

  const question = currentKey ? getQuestion(currentKey, examSetMap) : undefined;
  const totalCount = session.questionKeys.length;
  const answeredCount = Object.keys(session.answers).length;
  const unanswered = totalCount - answeredCount;
  const currentAnswer = currentKey ? session.answers[currentKey] : undefined;
  const pct = Math.round((session.currentIndex / Math.max(totalCount - 1, 1)) * 100);

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <button className="btn-icon" onClick={handleHome}>✕</button>
        <div className="quiz-progress">
          <span className="quiz-counter">{session.currentIndex + 1} / {totalCount}</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {timeLeft !== null && (
          <span className={`quiz-timer ${timeLeft < 60_000 ? "quiz-timer--urgent" : ""}`}>
            {formatMs(timeLeft)}
          </span>
        )}
        <button
          className={`btn-star ${starred ? "btn-star--on" : ""}`}
          onClick={toggleStar}
        >
          {starred ? "★" : "☆"}
        </button>
      </header>

      <div className="quiz-body" {...swipeHandlers}>
        {question ? (
          <>
            <div className="question-stem-wrap">
              <MathMarkdown className="question-stem">{question.stem}</MathMarkdown>
            </div>
            {question.image && (
              <img src={question.image} alt="" className="question-image" />
            )}

            {question.type === "choice" ? (
              <ChoiceOptions
                question={question}
                selected={typeof currentAnswer === "number" ? currentAnswer : undefined}
                onSelect={(n) => currentKey && saveAnswer(currentKey, n)}
              />
            ) : (
              <div className="short-answer-wrap">
                <input
                  type="text"
                  className="short-input"
                  value={shortInput}
                  onChange={(e) => setShortInput(e.target.value)}
                  onBlur={() => currentKey && saveAnswer(currentKey, shortInput)}
                  placeholder="답을 입력하세요"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}
          </>
        ) : (
          <div className="loading">문제 로딩 중…</div>
        )}
      </div>

      <footer className="quiz-footer">
        <button
          className="btn-nav"
          onClick={() => navigate(-1)}
          disabled={session.currentIndex === 0}
        >
          ‹
        </button>
        <button className="btn-submit" onClick={() => setShowConfirm(true)}>
          제출
          {unanswered > 0 && <span className="submit-badge">{unanswered}</span>}
        </button>
        <button
          className="btn-nav"
          onClick={() => navigate(1)}
          disabled={session.currentIndex === totalCount - 1}
        >
          ›
        </button>
      </footer>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>채점하기</h3>
            {unanswered > 0 ? (
              <p>{unanswered}문항을 아직 풀지 않았습니다.<br />그래도 제출할까요?</p>
            ) : (
              <p>모든 문항에 답했습니다. 제출하시겠습니까?</p>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowConfirm(false)}>취소</button>
              <button className="btn-confirm" onClick={handleSubmit}>제출</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceOptions({
  question,
  selected,
  onSelect,
}: {
  question: ChoiceQuestion;
  selected: number | undefined;
  onSelect: (n: number) => void;
}) {
  return (
    <ul className="choice-list">
      {question.choices.map((choice, i) => {
        const num = i + 1;
        return (
          <li
            key={i}
            className={`choice-item ${selected === num ? "choice-item--selected" : ""}`}
            onClick={() => onSelect(num)}
          >
            <span className="choice-num">{num}</span>
            {typeof choice === "string" ? (
              <MathMarkdown className="choice-text">{choice}</MathMarkdown>
            ) : (
              <span className="choice-text">
                {choice.text && <MathMarkdown>{choice.text}</MathMarkdown>}
                {choice.image && <img src={choice.image} alt="" className="choice-image" />}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
