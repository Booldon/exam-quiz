import Dexie, { type EntityTable } from "dexie";
import type { ExamSet } from "../schema/examSchema";

export type QuizMode = "exam" | "retry" | "random";

export interface ExamSetRecord {
  key: string; // `${examId}/${round}`
  examId: string;
  round: string;
  data: ExamSet;
  uploadedAt: number;
}

export interface QuestionRecord {
  key: string; // `${examId}/${round}/${questionId}`
  examId: string;
  round: string;
  questionId: string;
  wrongCount: number;
  starred: boolean;
  updatedAt: number;
}

export interface SessionRecord {
  id: 1;
  mode: QuizMode;
  examId: string;
  round: string;
  questionKeys: string[];
  answers: Record<string, number | string>;
  currentIndex: number;
  startedAt: number;
  deadlineAt?: number;
}

class AppDB extends Dexie {
  examSets!: EntityTable<ExamSetRecord, "key">;
  questionRecords!: EntityTable<QuestionRecord, "key">;
  sessions!: EntityTable<SessionRecord, "id">;

  constructor() {
    super("exam-quiz-db");
    this.version(1).stores({
      examSets: "key, examId, round, uploadedAt",
      questionRecords: "key, examId, round, questionId",
      sessions: "id",
    });
  }
}

export const db = new AppDB();

export function splitQuestionKey(key: string) {
  const first = key.indexOf("/");
  const second = key.indexOf("/", first + 1);
  return {
    examId: key.slice(0, first),
    round: key.slice(first + 1, second),
    questionId: key.slice(second + 1),
  };
}
