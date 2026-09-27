import { useState, useEffect } from "react";
import { db, type QuizMode, type AttemptRecord, splitQuestionKey } from "./db";
import type { SessionRecord } from "./db";
import { questionKey } from "./schema/examSchema";
import { HomeScreen } from "./screens/HomeScreen";
import { RandomSetupScreen } from "./screens/RandomSetupScreen";
import { QuizScreen } from "./screens/QuizScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { gradeSession, type GradingResult } from "./lib/grading";
import { useRegisterSW } from "virtual:pwa-register/react";

type Screen =
  | { name: "home" }
  | { name: "random-setup" }
  | { name: "quiz" }
  | { name: "result"; result: GradingResult; review?: boolean }
  | { name: "history" };

function useDarkMode() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (e: MediaQueryList | MediaQueryListEvent) =>
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    apply(mq);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [hasSession, setHasSession] = useState(false);
  useDarkMode();

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    db.sessions.get(1).then((s) => setHasSession(!!s));
  }, [screen]);

  async function startSession(mode: QuizMode, examKey: string) {
    const setRecord = await db.examSets.get(examKey);
    if (!setRecord) return;

    let keys: string[];

    if (mode === "exam") {
      keys = setRecord.data.questions.map((q) => questionKey(setRecord.data, q));
    } else {
      // retry: only wrong or starred questions
      const records = await db.questionRecords
        .where("examId").equals(setRecord.examId)
        .and((r) => r.round === setRecord.round && (r.wrongCount > 0 || r.starred))
        .toArray();
      keys = records.map((r) => r.key);
      if (keys.length === 0) return;
    }

    const remainingMs =
      mode === "exam" && setRecord.data.timeLimitMin
        ? setRecord.data.timeLimitMin * 60_000
        : undefined;

    const session: SessionRecord = {
      id: 1,
      mode,
      examId: setRecord.examId,
      round: setRecord.round,
      questionKeys: keys,
      answers: {},
      currentIndex: 0,
      startedAt: Date.now(),
      remainingMs,
    };

    await db.sessions.put(session);
    setScreen({ name: "quiz" });
  }

  async function startRandom(n: number, category: string | null) {
    const [allSets, cats] = await Promise.all([
      db.examSets.toArray(),
      db.categories.toArray(),
    ]);
    const catMap = Object.fromEntries(cats.map((c) => [c.examId, c.category]));

    // category가 지정되면 해당 카테고리(미분류 포함)의 시험만 대상으로 한다
    const targetSets = category === null
      ? allSets
      : allSets.filter((s) => (catMap[s.examId] ?? "미분류") === category);

    const allKeys: string[] = [];
    for (const s of targetSets) {
      for (const q of s.data.questions) {
        allKeys.push(questionKey(s.data, q));
      }
    }
    // Fisher-Yates shuffle and take first n
    for (let i = allKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allKeys[i], allKeys[j]] = [allKeys[j], allKeys[i]];
    }
    const keys = allKeys.slice(0, n);

    const { examId, round } = splitQuestionKey(keys[0]);
    const session: SessionRecord = {
      id: 1,
      mode: "random",
      examId,
      round,
      questionKeys: keys,
      answers: {},
      currentIndex: 0,
      startedAt: Date.now(),
    };

    await db.sessions.put(session);
    setScreen({ name: "quiz" });
  }

  async function startRetryFromResult(result: GradingResult) {
    const wrongKeys = result.questions.filter((q) => !q.isCorrect).map((q) => q.key);
    if (wrongKeys.length === 0) {
      alert("오답이 없습니다!");
      setScreen({ name: "home" });
      return;
    }
    const { examId, round } = splitQuestionKey(wrongKeys[0]);
    const session: SessionRecord = {
      id: 1,
      mode: "retry",
      examId,
      round,
      questionKeys: wrongKeys,
      answers: {},
      currentIndex: 0,
      startedAt: Date.now(),
    };
    await db.sessions.put(session);
    setScreen({ name: "quiz" });
  }

  async function openAttempt(attempt: AttemptRecord) {
    const sets = await db.examSets.toArray();
    const map = new Map(sets.map((e) => [e.key, e.data]));
    const result = gradeSession(
      { questionKeys: attempt.questionKeys, answers: attempt.answers },
      map
    );
    if (result.questions.length === 0) {
      alert("이 결과의 문제 데이터가 삭제되어 상세를 볼 수 없습니다.");
      return;
    }
    setScreen({ name: "result", result, review: true });
  }

  return (
    <div className="app">
      {needRefresh && (
        <div className="pwa-update">
          앱 업데이트가 있습니다.{" "}
          <button onClick={() => updateServiceWorker(true)}>지금 업데이트</button>
        </div>
      )}

      {screen.name === "home" && (
        <HomeScreen
          hasSession={hasSession}
          onResume={() => setScreen({ name: "quiz" })}
          onStartSession={startSession}
          onRandomSetup={() => setScreen({ name: "random-setup" })}
          onHistory={() => setScreen({ name: "history" })}
        />
      )}

      {screen.name === "history" && (
        <HistoryScreen
          onOpen={openAttempt}
          onBack={() => setScreen({ name: "home" })}
        />
      )}

      {screen.name === "random-setup" && (
        <RandomSetupScreen
          onStart={startRandom}
          onBack={() => setScreen({ name: "home" })}
        />
      )}

      {screen.name === "quiz" && (
        <QuizScreen
          onResult={(r) => setScreen({ name: "result", result: r })}
          onHome={() => setScreen({ name: "home" })}
        />
      )}

      {screen.name === "result" && (
        <ResultScreen
          result={screen.result}
          review={screen.review}
          onHome={() => setScreen(screen.review ? { name: "history" } : { name: "home" })}
          onRetry={() => startRetryFromResult(screen.result)}
        />
      )}
    </div>
  );
}
