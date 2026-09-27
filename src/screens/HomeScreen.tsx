import { useState, useEffect, useRef } from "react";
import { db, type ExamSetRecord, type QuizMode } from "../db";
import { parseExamSetFile } from "../schema/examSchema";

const UNCATEGORIZED = "미분류";

interface Props {
  onStartSession: (mode: QuizMode, examKey: string) => void;
  onResume: () => void;
  hasSession: boolean;
  onRandomSetup: () => void;
  onHistory: () => void;
}

export function HomeScreen({ onStartSession, onResume, hasSession, onRandomSetup, onHistory }: Props) {
  const [examSets, setExamSets] = useState<ExamSetRecord[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [retryCounts, setRetryCounts] = useState<Record<string, number>>({});
  const [uploadTab, setUploadTab] = useState<"file" | "text">("file");
  const [pasteText, setPasteText] = useState("");
  const [clipboardPrompt, setClipboardPrompt] = useState<string | null>(null);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [categoryModalExamId, setCategoryModalExamId] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    const sets = await db.examSets.orderBy("uploadedAt").reverse().toArray();
    setExamSets(sets);

    const cats = await db.categories.toArray();
    setCategoryMap(Object.fromEntries(cats.map((c) => [c.examId, c.category])));

    const counts: Record<string, number> = {};
    for (const s of sets) {
      const n = await db.questionRecords
        .where("examId").equals(s.examId)
        .and((r) => r.round === s.round && (r.wrongCount > 0 || r.starred))
        .count();
      counts[s.key] = n;
    }
    setRetryCounts(counts);
  }

  async function handleSetCategory(examId: string, category: string) {
    const trimmed = category.trim();
    if (trimmed) {
      await db.categories.put({ examId, category: trimmed });
    } else {
      await db.categories.delete(examId);
    }
    setCategoryModalExamId(null);
    setCategoryInput("");
    loadData();
  }

  useEffect(() => { loadData(); }, []);

  async function saveExamText(text: string) {
    const result = parseExamSetFile(text);
    if (!result.ok) {
      setUploadErrors(result.errors);
      return;
    }
    const key = `${result.data.examId}/${result.data.round}`;
    await db.examSets.put({
      key,
      examId: result.data.examId,
      round: result.data.round,
      data: result.data,
      uploadedAt: Date.now(),
    });
    setUploadSuccess(`${result.data.examName} (${result.data.round}) — ${result.data.questions.length}문항 등록 완료`);
    setPasteText("");
    loadData();
  }

  async function handleFile(file: File) {
    setUploadErrors([]);
    setUploadSuccess(null);
    await saveExamText(await file.text());
  }

  async function handlePaste() {
    setUploadErrors([]);
    setUploadSuccess(null);
    await saveExamText(pasteText);
  }

  async function handleDelete(key: string) {
    if (!confirm("이 회차를 삭제할까요? 관련 기록도 모두 삭제됩니다.")) return;
    const [examId, round] = key.split("/", 2);
    await db.examSets.delete(key);
    await db.questionRecords.where("examId").equals(examId).and((r) => r.round === round).delete();
    // 이 시험(examId)의 남은 회차가 없으면 카테고리 태그도 정리
    const remaining = await db.examSets.where("examId").equals(examId).count();
    if (remaining === 0) await db.categories.delete(examId);
    loadData();
  }

  function handleDownload(s: ExamSetRecord) {
    const blob = new Blob([JSON.stringify(s.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.examId}-${s.round}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // examId 단위로 묶은 뒤, 카테고리별로 다시 묶는다
  const byExamId = examSets.reduce<Record<string, ExamSetRecord[]>>((acc, s) => {
    (acc[s.examId] ??= []).push(s);
    return acc;
  }, {});

  const byCategory = Object.entries(byExamId).reduce<Record<string, [string, ExamSetRecord[]][]>>(
    (acc, [examId, rounds]) => {
      const cat = categoryMap[examId] ?? UNCATEGORIZED;
      (acc[cat] ??= []).push([examId, rounds]);
      return acc;
    },
    {}
  );

  // 카테고리 정렬: 이름순, "미분류"는 항상 마지막
  const sortedCategories = Object.keys(byCategory).sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b, "ko");
  });

  const existingCategories = [...new Set(Object.values(categoryMap))].sort((a, b) =>
    a.localeCompare(b, "ko")
  );

  return (
    <div className="screen home-screen">
      <header className="app-header">
        <h1 className="app-title">기출 풀이</h1>
      </header>

      {hasSession && (
        <div className="resume-card" onClick={onResume}>
          <span className="resume-icon">▶</span>
          <div>
            <div className="resume-title">이어풀기</div>
            <div className="resume-sub">중단된 풀이가 있습니다</div>
          </div>
        </div>
      )}

      <div className="upload-area">
        <div className="upload-tabs">
          <button
            className={`upload-tab ${uploadTab === "file" ? "upload-tab--active" : ""}`}
            onClick={() => { setUploadTab("file"); setUploadErrors([]); setUploadSuccess(null); }}
          >
            파일 업로드
          </button>
          <button
            className={`upload-tab ${uploadTab === "text" ? "upload-tab--active" : ""}`}
            onClick={async () => {
              setUploadErrors([]); setUploadSuccess(null);
              try {
                const text = await navigator.clipboard.readText();
                if (text.trim().startsWith("{")) {
                  setClipboardPrompt(text); // 클립보드에 JSON이 있을 때만 팝업
                  return;
                }
              } catch { /* 권한 없으면 조용히 무시 */ }
              setUploadTab("text"); // JSON 없으면 바로 탭 전환
            }}
          >
            텍스트 붙여넣기
          </button>
        </div>

        {uploadTab === "file" ? (
          <>
            <button className="btn-upload" onClick={() => fileRef.current?.click()}>
              + JSON 파일 선택
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="sr-only"
              onChange={(e) => { e.target.files?.[0] && handleFile(e.target.files[0]); e.target.value = ""; }}
            />
          </>
        ) : (
          <div className="paste-area">
            <div className="paste-toolbar">
              <span className="paste-toolbar-hint">
                {pasteText ? `${pasteText.length.toLocaleString()}자` : "JSON 붙여넣기"}
              </span>
              <div className="paste-toolbar-actions">
                {pasteText && (
                  <button className="btn-paste-action" onClick={() => { setPasteText(""); setUploadErrors([]); setUploadSuccess(null); }}>
                    전체 삭제
                  </button>
                )}
                <button
                  className="btn-paste-action"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text.trim().startsWith("{")) setClipboardPrompt(text);
                      else if (text.trim()) { setPasteText(text); setUploadErrors([]); setUploadSuccess(null); }
                      else alert("클립보드가 비어 있습니다.");
                    } catch {
                      alert("클립보드 접근 권한이 필요합니다.");
                    }
                  }}
                >
                  클립보드
                </button>
              </div>
            </div>
            <textarea
              className="paste-textarea"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Claude가 생성한 JSON을 여기에 붙여넣으세요"
              spellCheck={false}
              autoCorrect="off"
            />
            <button
              className="btn-upload"
              disabled={!pasteText.trim()}
              onClick={handlePaste}
            >
              등록
            </button>
          </div>
        )}

        {uploadSuccess && <p className="upload-success">{uploadSuccess}</p>}
        {uploadErrors.length > 0 && (
          <ul className="upload-errors">
            {uploadErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
      </div>

      <div className="home-actions">
        {examSets.length > 0 && (
          <button className="btn-home-action" onClick={onRandomSetup}>
            🎲 랜덤 N문제
          </button>
        )}
        <button className="btn-home-action" onClick={onHistory}>
          📊 지난 결과
        </button>
      </div>

      <div className="exam-list">
        {sortedCategories.map((cat) => (
          <section key={cat} className="category-section">
            <h2 className="category-title">{cat}</h2>
            {byCategory[cat].map(([examId, rounds]) => (
              <div key={examId} className="exam-group">
                <h3 className="exam-group-title">{rounds[0].data.examName}</h3>
                {rounds.map((s) => (
                  <div
                    key={s.key}
                    className={`exam-card ${selectedKey === s.key ? "exam-card--selected" : ""}`}
                    onClick={() => setSelectedKey(s.key === selectedKey ? null : s.key)}
                  >
                    <div className="exam-card-info">
                      <span className="exam-round">{s.data.round}</span>
                      <span className="exam-meta">
                        {s.data.questions.length}문항
                        {s.data.timeLimitMin && ` · ${s.data.timeLimitMin}분`}
                      </span>
                      {retryCounts[s.key] > 0 && (
                        <span className="exam-retry-badge">{retryCounts[s.key]}개 복습</span>
                      )}
                    </div>

                    {selectedKey === s.key && (
                      <div className="exam-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-mode btn-mode--exam"
                          onClick={() => onStartSession("exam", s.key)}
                        >
                          ▶ 실전 풀기
                          {s.data.timeLimitMin && <span className="mode-time">{s.data.timeLimitMin}분</span>}
                        </button>
                        <button
                          className="btn-mode btn-mode--retry"
                          disabled={!retryCounts[s.key]}
                          onClick={() => retryCounts[s.key] && onStartSession("retry", s.key)}
                        >
                          ↺ 오답·별표 다시 풀기
                          <span className="mode-count">{retryCounts[s.key] ?? 0}문항</span>
                        </button>
                        <button
                          className="btn-mode btn-mode--retry"
                          onClick={() => {
                            setCategoryInput(categoryMap[examId] ?? "");
                            setCategoryModalExamId(examId);
                          }}
                        >
                          🏷 카테고리 설정
                          {categoryMap[examId] && <span className="mode-count">{categoryMap[examId]}</span>}
                        </button>
                        <button
                          className="btn-mode btn-mode--retry"
                          onClick={() => handleDownload(s)}
                        >
                          ⬇ JSON 내려받기
                        </button>
                        <button
                          className="btn-mode btn-mode--delete"
                          onClick={() => handleDelete(s.key)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>

      {clipboardPrompt && (
        <div className="modal-overlay" onClick={() => { setClipboardPrompt(null); setUploadTab("text"); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>클립보드에 내용이 있습니다</h3>
            <p>붙여넣겠습니까?</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setClipboardPrompt(null); setUploadTab("text"); }}>
                직접 입력
              </button>
              <button className="btn-confirm" onClick={() => {
                setPasteText(clipboardPrompt);
                setClipboardPrompt(null);
                setUploadTab("text");
              }}>
                붙여넣기
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryModalExamId && (
        <div className="modal-overlay" onClick={() => setCategoryModalExamId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>카테고리 설정</h3>
            <p>{byExamId[categoryModalExamId]?.[0]?.data.examName}</p>
            <input
              type="text"
              className="short-input category-input"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              placeholder="예: 금융 자격증"
              autoFocus
            />
            {existingCategories.length > 0 && (
              <div className="category-chips">
                {existingCategories.map((c) => (
                  <button key={c} className="category-chip" onClick={() => setCategoryInput(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => handleSetCategory(categoryModalExamId, "")}
              >
                미분류로
              </button>
              <button
                className="btn-confirm"
                onClick={() => handleSetCategory(categoryModalExamId, categoryInput)}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {examSets.length === 0 && (
        <div className="empty-state">
          <p>업로드된 문제 파일이 없습니다.</p>
          <p className="empty-sub">JSON 파일을 업로드해 시작하세요.</p>
        </div>
      )}
    </div>
  );
}
