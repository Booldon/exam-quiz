import type { ExamSet, Question } from "../schema/examSchema";
import { isShortAnswerCorrect, pointsOf } from "../schema/examSchema";
import type { SessionRecord } from "../db";
import { splitQuestionKey } from "../db";

export interface GradedQuestion {
  key: string;
  question: Question;
  examName: string;
  round: string;
  userAnswer: number | string | undefined;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
}

export interface GradingResult {
  questions: GradedQuestion[];
  totalScore: number;
  maxScore: number;
}

export function gradeSession(
  session: SessionRecord,
  examSetMap: Map<string, ExamSet>
): GradingResult {
  const questions: GradedQuestion[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const key of session.questionKeys) {
    const { examId, round, questionId } = splitQuestionKey(key);
    const examSet = examSetMap.get(`${examId}/${round}`);
    if (!examSet) continue;

    const question = examSet.questions.find((q) => q.id === questionId);
    if (!question) continue;

    const userAnswer = session.answers[key];
    const maxPoints = pointsOf(question);
    let isCorrect = false;

    if (question.type === "choice") {
      if (typeof userAnswer === "number") {
        isCorrect = question.answers.includes(userAnswer);
      }
    } else {
      if (typeof userAnswer === "string") {
        isCorrect = isShortAnswerCorrect(userAnswer, question.answers);
      }
    }

    const earnedPoints = isCorrect ? maxPoints : 0;
    totalScore += earnedPoints;
    maxScore += maxPoints;

    questions.push({
      key,
      question,
      examName: examSet.examName,
      round: examSet.round,
      userAnswer,
      isCorrect,
      earnedPoints,
      maxPoints,
    });
  }

  return { questions, totalScore, maxScore };
}
