import { z } from "zod";

/**
 * 기출 문제 세트 JSON 양식 (schemaVersion 1)
 *
 * 텍스트 필드(stem, choices, explanation)는 Markdown으로 렌더링한다.
 *  - 표: GFM 표 문법
 *  - 수식: 인라인 \( ... \), 블록 \[ ... \]
 *    (금액 표기와 충돌하지 않도록 달러 기호 구분자는 사용하지 않음)
 */
export const SCHEMA_VERSION = 1;

// ─── 이미지 ────────────────────────────────────────────
const DATA_URI =
  /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

/** base64 문자열 기준 약 2MB (원본 약 1.5MB) */
const MAX_IMAGE_CHARS = 2_000_000;

const imageSchema = z
  .string()
  .max(MAX_IMAGE_CHARS, "이미지가 너무 큽니다 (원본 약 1.5MB 이하로 줄여주세요)")
  .regex(DATA_URI, "이미지는 data:image/<형식>;base64,... 형태여야 합니다");

// ─── 선택지 ────────────────────────────────────────────
/** 텍스트만 있으면 문자열, 그래프형 선택지면 이미지 포함 객체 */
const choiceSchema = z.union([
  z.string().min(1, "빈 선택지가 있습니다"),
  z.object({
    text: z.string().optional(),
    image: imageSchema,
  }),
]);

// ─── 문항 공통 필드 ─────────────────────────────────────
const baseQuestion = {
  /** 세트 안에서 고유. 오답·별표 기록의 키로 쓰이므로 한 번 정하면 바꾸지 않는다 */
  id: z.string().min(1, "id가 비어 있습니다"),
  /** 과목명. 현재 모드에서는 표시용, 추후 과목별 풀기 대비 */
  subject: z.string().min(1).optional(),
  stem: z.string().min(1, "문제 본문(stem)이 비어 있습니다"),
  image: imageSchema.optional(),
  explanation: z.string().optional(),
  explanationImage: imageSchema.optional(),
  /** 배점. 생략 시 1점 */
  points: z.number().positive().optional(),
};

const choiceQuestionSchema = z.object({
  type: z.literal("choice"),
  ...baseQuestion,
  choices: z
    .array(choiceSchema)
    .min(4, "선택지는 4개 이상이어야 합니다")
    .max(5, "선택지는 5개 이하여야 합니다"),
  /** 1부터 시작하는 정답 번호. 복수 정답 인정 문항은 여러 개 */
  answers: z.array(z.number().int().min(1)).min(1, "정답이 없습니다"),
});

const shortQuestionSchema = z.object({
  type: z.literal("short"),
  ...baseQuestion,
  /** 인정 정답 목록. 공백·대소문자·전각/반각 차이는 채점 시 무시됨 */
  answers: z.array(z.string().min(1)).min(1, "정답이 없습니다"),
});

export const questionSchema = z.discriminatedUnion("type", [
  choiceQuestionSchema,
  shortQuestionSchema,
]);

// ─── 문제 세트 (업로드 파일 1개 = 1회차) ─────────────────
export const examSetSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** 영소문자·숫자·하이픈. 예: invest-manager */
    examId: z
      .string()
      .regex(/^[a-z0-9-]+$/, "examId는 영소문자, 숫자, 하이픈만 쓸 수 있습니다"),
    examName: z.string().min(1),
    /** 예: 2024-1회 */
    round: z.string().min(1),
    /** 실전 모드 제한 시간(분). 생략 시 타이머 없음 */
    timeLimitMin: z.number().int().positive().optional(),
    questions: z.array(questionSchema).min(1, "문항이 없습니다"),
  })
  .superRefine((set, ctx) => {
    const seen = new Set<string>();

    set.questions.forEach((q, i) => {
      if (seen.has(q.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "id"],
          message: `중복된 id "${q.id}"`,
        });
      }
      seen.add(q.id);

      if (q.type === "choice") {
        q.answers.forEach((a, j) => {
          if (a > q.choices.length) {
            ctx.addIssue({
              code: "custom",
              path: ["questions", i, "answers", j],
              message: `정답 번호 ${a}가 선택지 개수(${q.choices.length})를 넘습니다`,
            });
          }
        });
      }
    });
  });

// ─── 타입 ─────────────────────────────────────────────
export type ExamSet = z.infer<typeof examSetSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ChoiceQuestion = z.infer<typeof choiceQuestionSchema>;
export type ShortQuestion = z.infer<typeof shortQuestionSchema>;
export type Choice = z.infer<typeof choiceSchema>;

// ─── 헬퍼 ─────────────────────────────────────────────
/** 오답·별표·이어풀기 기록에 쓰는 전역 고유 키 */
export const questionKey = (set: ExamSet, q: Question) =>
  `${set.examId}/${set.round}/${q.id}`;

export const pointsOf = (q: Question) => q.points ?? 1;

/** 주관식 비교용 정규화: 전각→반각(NFKC), 소문자화, 공백 제거 */
export function normalizeAnswer(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function isShortAnswerCorrect(input: string, answers: string[]): boolean {
  const n = normalizeAnswer(input);
  return n.length > 0 && answers.some((a) => normalizeAnswer(a) === n);
}

// ─── 업로드 파일 검증 ──────────────────────────────────
export type ParseResult =
  | { ok: true; data: ExamSet }
  | { ok: false; errors: string[] };

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  if (path[0] === "questions" && typeof path[1] === "number") {
    const rest = path.slice(2).map(String).join(".");
    return `${path[1] + 1}번 문항${rest ? " > " + rest : ""}`;
  }
  return path.map(String).join(".") || "(최상위)";
}

/** 업로드된 파일 텍스트를 파싱·검증해 사람이 읽을 수 있는 오류 목록을 돌려준다 */
export function parseExamSetFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON 형식 오류: ${(e as Error).message}`] };
  }

  const r = examSetSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };

  return {
    ok: false,
    errors: r.error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`),
  };
}
