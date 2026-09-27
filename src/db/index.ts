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
  /**
   * 실전 모드 남은 시간(ms). 풀이 화면을 벗어나거나 앱을 닫으면 남은 시간을 저장하고,
   * 이어풀기로 재개하면 저장된 남은 시간부터 다시 카운트다운한다(중단 중에는 시간이 멈춤).
   * 타이머가 없는 모드/시험이면 undefined.
   */
  remainingMs?: number;
}

/** 시험(examId) 단위 카테고리 태그. 기기 내에만 저장 */
export interface CategoryRecord {
  examId: string;
  category: string;
}

class AppDB extends Dexie {
  examSets!: EntityTable<ExamSetRecord, "key">;
  questionRecords!: EntityTable<QuestionRecord, "key">;
  sessions!: EntityTable<SessionRecord, "id">;
  categories!: EntityTable<CategoryRecord, "examId">;

  constructor() {
    super("exam-quiz-db");
    this.version(1).stores({
      examSets: "key, examId, round, uploadedAt",
      questionRecords: "key, examId, round, questionId",
      sessions: "id",
    });
    this.version(2).stores({
      categories: "examId, category",
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
