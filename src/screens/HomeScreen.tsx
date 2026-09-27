import { useState, useEffect, useRef } from "react";
import { db, type ExamSetRecord, type QuizMode } from "../db";
import { parseExamSetFile } from "../schema/examSchema";

interface Props {
  onStartSession: (mode: QuizMode, examKey: string) => void;
  onResume: () => void;
  hasSession: boolean;
  onRandomSetup: () => void;
}

export function HomeScreen({ onStartSession, onResume, hasSession, onRandomSetup }: Props) {
  const [examSets, setExamSets] = useState<ExamSetRecord[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [retryCounts, setRetryCounts] = useState<Record<string, number>>({});
  const [uploadTab, setUploadTab] = useState<"file" | "text">("file");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    const sets = await db.examSets.orderBy("uploadedAt").reverse().toArray();
    setExamSets(sets);

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
    loadData();
  }

  async function handleExport() {
    const [sets, records] = await Promise.all([
      db.examSets.toArray(),
      db.questionRecords.toArray(),
    ]);
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: Date.now(), examSets: sets, questionRecords: records }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exam-quiz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      if (raw.version !== 1) throw new Error("지원하지 않는 백업 버전");
      await db.transaction("rw", db.examSets, db.questionRecords, async () => {
        for (const s of raw.examSets ?? []) await db.examSets.put(s);
        for (const r of raw.questionRecords ?? []) await db.questionRecords.put(r);
      });
      setUploadSuccess("백업 복원 완료");
      loadData();
    } catch (e) {
      setUploadErrors([(e as Error).message]);
    }
  }

  const grouped = examSets.reduce<Record<string, ExamSetRecord[]>>((acc, s) => {
    (acc[s.examId] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="screen home-screen">
      <header className="app-header">
        <h1 className="app-title">기출 풀이</h1>
        <div className="header-actions">
          <button className="btn-icon" title="백업 내보내기" onClick={handleExport}>⬇</button>
          <label className="btn-icon" title="백업 불러오기">
            ⬆
            <input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
            />
          </label>
        </div>
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
            onClick={() => { setUploadTab("text"); setUploadErrors([]); setUploadSuccess(null); }}
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

      {examSets.length > 0 && (
        <button className="btn-random" onClick={onRandomSetup}>
          🎲 랜덤 N문제
        </button>
      )}

      <div className="exam-list">
        {Object.entries(grouped).map(([examId, rounds]) => (
          <div key={examId} className="exam-group">
            <h2 className="exam-group-title">{rounds[0].data.examName}</h2>
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
      </div>

      {examSets.length === 0 && (
        <div className="empty-state">
          <p>업로드된 문제 파일이 없습니다.</p>
          <p className="empty-sub">JSON 파일을 업로드해 시작하세요.</p>
        </div>
      )}
    </div>
  );
}
