import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { preprocessMath } from "../lib/math";

interface Props {
  children: string;
  className?: string;
}

export function MathMarkdown({ children, className }: Props) {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {preprocessMath(children)}
    </ReactMarkdown>
  );
}
