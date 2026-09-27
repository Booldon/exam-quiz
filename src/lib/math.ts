/**
 * \(...\) → $...$,  \[...\] → $$...$$
 * Markdown 파서가 \( 를 이스케이프된 괄호로 처리해 백슬래시를 제거하기 때문에,
 * remark-math에 넘기기 전에 달러 구분자로 변환한다.
 */
export function preprocessMath(text: string): string {
  let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, m: string) => `$$${m}$$`);
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, m: string) => `$${m}$`);
  return result;
}

export function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
