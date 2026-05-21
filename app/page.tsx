"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NameInput from "@/components/NameInput";
import ReviewPanel from "@/components/ReviewPanel";
import {
  loadAll,
  saveNarration,
  deleteNarration,
  getByName,
  getLastName,
  setLastName,
} from "@/lib/storage";
import { ERROR_MARKER, TARGET_CHARS, RETRY_DELAY_SECONDS } from "@/lib/constants";
import type {
  ErrorCode,
  ReviewCandidate,
  ReviewEvent,
  ReviewStage,
  ReviewSummary,
  SavedNarration,
  StageStatus,
} from "@/types";

const IDLE_STAGES: Record<ReviewStage, StageStatus> = {
  compliance: "idle",
  proofread: "idle",
  ruby: "idle",
  editor: "idle",
};

class AppError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

function messageForCode(code: ErrorCode): string {
  switch (code) {
    case "AUTH":
      return ".env.local に ANTHROPIC_API_KEY を設定してください。";
    case "RATE_LIMIT":
      return "APIのレート制限に達しました。しばらく待ってから再試行してください。";
    case "NETWORK":
      return "通信エラーが発生しました。接続を確認して再試行してください。";
    default:
      return "生成中にエラーが発生しました。もう一度お試しください。";
  }
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}秒`;
  return `${m}分${s}秒`;
}

export default function Home() {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [savedList, setSavedList] = useState<SavedNarration[]>([]);
  const [copied, setCopied] = useState(false);
  const [retryIn, setRetryIn] = useState(0);

  // 校閲パイプライン関連
  const [reviewing, setReviewing] = useState(false);
  const [reviewStatus, setReviewStatus] =
    useState<Record<ReviewStage, StageStatus>>(IDLE_STAGES);
  const [reviewCounts, setReviewCounts] = useState<
    Partial<Record<ReviewStage, number>>
  >({});
  const [candidates, setCandidates] = useState<ReviewCandidate[] | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reviewAbortRef = useRef<AbortController | null>(null);

  // 初回マウント時に履歴と最後の生成結果を復元する。
  useEffect(() => {
    setSavedList(loadAll());
    const last = getLastName();
    if (last) {
      const saved = getByName(last);
      if (saved) {
        setName(saved.name);
        setCurrentName(saved.name);
        setText(saved.text);
        setIsComplete(true);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setRetryIn(0);
  }, []);

  // 校閲パイプライン（②〜⑤）を実行する。NDJSON で進捗を受け取る。
  const startReview = useCallback(async (reviewText: string) => {
    if (!reviewText || reviewText.trim().length < 50) return;
    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;

    setReviewError(null);
    setAppliedMessage(null);
    setCandidates(null);
    setReviewSummary(null);
    setReviewCounts({});
    setApprovedIds(new Set());
    setReviewStatus({
      compliance: "running",
      proofread: "running",
      ruby: "running",
      editor: "idle",
    });
    setReviewing(true);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reviewText }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const code: ErrorCode = data?.error === "MISSING_API_KEY" ? "AUTH" : "UNKNOWN";
        throw new AppError(code, messageForCode(code));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new AppError("UNKNOWN", messageForCode("UNKNOWN"));
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ReviewEvent;

          if (event.type === "stage_start") {
            setReviewStatus((prev) => ({ ...prev, [event.stage]: "running" }));
          } else if (event.type === "stage_done") {
            setReviewStatus((prev) => ({ ...prev, [event.stage]: "done" }));
            setReviewCounts((prev) => ({ ...prev, [event.stage]: event.issueCount }));
          } else if (event.type === "result") {
            setCandidates(event.candidates);
            setReviewSummary(event.summary);
            setApprovedIds(
              new Set(
                event.candidates.filter((c) => c.applicable).map((c) => c.id),
              ),
            );
          } else if (event.type === "error") {
            throw new AppError(event.code, messageForCode(event.code));
          }
        }
      }
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        controller.signal.aborted
      ) {
        // ユーザー操作による中断。エラー表示は出さない。
      } else if (err instanceof AppError) {
        setReviewError(err.message);
      } else {
        setReviewError(messageForCode("NETWORK"));
      }
    } finally {
      setReviewing(false);
      reviewAbortRef.current = null;
    }
  }, []);

  const runGeneration = useCallback(
    async (targetName: string) => {
      cancelRetry();
      reviewAbortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setText("");
      setIsComplete(false);
      setReviewing(false);
      setReviewStatus(IDLE_STAGES);
      setReviewCounts({});
      setCandidates(null);
      setReviewSummary(null);
      setApprovedIds(new Set());
      setReviewError(null);
      setAppliedMessage(null);
      setIsGenerating(true);
      setCurrentName(targetName);
      setElapsedSeconds(0);

      startTimeRef.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      let full = "";

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: targetName }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data?.error === "MISSING_API_KEY") {
            throw new AppError("AUTH", messageForCode("AUTH"));
          }
          throw new AppError("UNKNOWN", messageForCode("UNKNOWN"));
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new AppError("UNKNOWN", messageForCode("UNKNOWN"));
        }
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });

          const markerStart = full.indexOf("<<<");
          if (markerStart === -1) {
            setText(full);
          } else {
            // マーカー候補が現れたら、その手前までを表示する。
            setText(full.slice(0, markerStart));
            const idx = full.indexOf(ERROR_MARKER);
            if (idx !== -1) {
              const code = (full.slice(idx + ERROR_MARKER.length).trim() ||
                "UNKNOWN") as ErrorCode;
              throw new AppError(code, messageForCode(code));
            }
          }
        }

        // 正常完了
        setText(full);
        setIsComplete(true);

        const narration: SavedNarration = {
          name: targetName,
          text: full,
          generatedAt: new Date().toISOString(),
          charCount: full.length,
        };
        const updated = saveNarration(narration);
        setLastName(targetName);
        setSavedList(updated);

        // 生成完了後、検査パイプラインを自動で連続実行する。
        startReview(full);
      } catch (err) {
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          controller.signal.aborted
        ) {
          setError("生成を中断しました。");
          // 中断時点までのテキストは残しておく。
          if (full) setText(full);
        } else if (err instanceof AppError) {
          setError(err.message);
          if (err.code === "RATE_LIMIT") {
            scheduleRetry(targetName);
          }
        } else {
          setError(messageForCode("NETWORK"));
        }
      } finally {
        stopTimer();
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancelRetry, stopTimer, startReview],
  );

  // レート制限時に一定時間後へ自動再試行をスケジュールする。
  function scheduleRetry(targetName: string) {
    setRetryIn(RETRY_DELAY_SECONDS);
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    retryTimerRef.current = setInterval(() => {
      setRetryIn((prev) => {
        if (prev <= 1) {
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
          runGeneration(targetName);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function beginGeneration(targetName: string) {
    const trimmed = targetName.trim();
    if (!trimmed) return;
    const existing = savedList.find((n) => n.name === trimmed);
    if (existing) {
      const ok = window.confirm(`${trimmed}はすでに生成済みです。再生成しますか？`);
      if (!ok) return;
    }
    runGeneration(trimmed);
  }

  function handleSubmit() {
    beginGeneration(name);
  }

  function handleCancel() {
    cancelRetry();
    abortRef.current?.abort();
  }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("クリップボードへのコピーに失敗しました。");
    }
  }

  async function handleDownload() {
    if (!text || !currentName) return;
    const { generateDocx } = await import("@/lib/generateDocx");
    await generateDocx(currentName, text);
  }

  function resetReview() {
    reviewAbortRef.current?.abort();
    setReviewing(false);
    setReviewStatus(IDLE_STAGES);
    setReviewCounts({});
    setCandidates(null);
    setReviewSummary(null);
    setApprovedIds(new Set());
    setReviewError(null);
    setAppliedMessage(null);
  }

  function handleLoad(saved: SavedNarration) {
    if (isGenerating) return;
    cancelRetry();
    resetReview();
    setName(saved.name);
    setCurrentName(saved.name);
    setText(saved.text);
    setIsComplete(true);
    setError(null);
    setLastName(saved.name);
  }

  function handleDelete(targetName: string) {
    const updated = deleteNarration(targetName);
    setSavedList(updated);
  }

  function toggleApprove(id: string) {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllApproved(selectAll: boolean) {
    if (!candidates) return;
    if (selectAll) {
      setApprovedIds(
        new Set(candidates.filter((c) => c.applicable).map((c) => c.id)),
      );
    } else {
      setApprovedIds(new Set());
    }
  }

  function applyApproved() {
    if (!candidates) return;
    let updated = text;
    let applied = 0;
    for (const c of candidates) {
      if (!c.applicable || !approvedIds.has(c.id)) continue;
      if (updated.includes(c.before)) {
        updated = updated.replace(c.before, c.after);
        applied++;
      }
    }
    setText(updated);
    if (currentName) {
      const narration: SavedNarration = {
        name: currentName,
        text: updated,
        generatedAt: new Date().toISOString(),
        charCount: updated.length,
      };
      setSavedList(saveNarration(narration));
      setLastName(currentName);
    }
    setCandidates(null);
    setReviewSummary(null);
    setReviewStatus(IDLE_STAGES);
    setReviewCounts({});
    setAppliedMessage(`${applied}件の修正を反映しました。`);
  }

  function dismissReview() {
    setCandidates(null);
    setReviewSummary(null);
    setReviewStatus(IDLE_STAGES);
    setReviewCounts({});
    setAppliedMessage("修正なしで確定しました。");
  }

  function rerunReview() {
    setAppliedMessage(null);
    startReview(text);
  }

  const charCount = text.length;
  const progress = Math.min(100, Math.round((charCount / TARGET_CHARS) * 100));
  const showDownload = isComplete && !isGenerating && text.length > 0;
  const showReviewPanel =
    reviewing ||
    candidates !== null ||
    reviewError !== null ||
    appliedMessage !== null;
  const showReviewButton =
    isComplete &&
    !isGenerating &&
    text.length > 0 &&
    !showReviewPanel;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-navy sm:text-3xl">
          ぐっすり眠れる歴史 台本ジェネレーター
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          偉人名を入力すると、約40,000字のナレーション台本を生成し、Wordファイルとして書き出せます。
        </p>
      </header>

      {/* 入力カード */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <NameInput
          value={name}
          onChange={setName}
          onSubmit={handleSubmit}
          disabled={isGenerating || retryIn > 0}
        />

        {savedList.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-gray-500">
              生成済み偉人リスト（クリックで読み込み）
            </p>
            <ul className="flex flex-wrap gap-2">
              {savedList.map((item) => (
                <li
                  key={item.name}
                  className="flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 py-1 pl-3 pr-1 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(item)}
                    disabled={isGenerating}
                    className="font-medium text-navy hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
                    title={`${item.charCount.toLocaleString()}字 / ${new Date(
                      item.generatedAt,
                    ).toLocaleDateString("ja-JP")}`}
                  >
                    {item.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.name)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                    aria-label={`${item.name} を削除`}
                    title="削除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 進捗表示 */}
      {isGenerating && (
        <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-navy">
              <span className="spinner" aria-hidden />
              生成中... {charCount.toLocaleString()}字 / 約
              {TARGET_CHARS.toLocaleString()}字
            </span>
            <span className="text-gray-500">
              経過時間：{formatElapsed(elapsedSeconds)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-navy transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              生成を中断
            </button>
          </div>
        </section>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          {retryIn > 0 && (
            <p className="mt-2 flex items-center gap-3">
              <span>{retryIn}秒後に自動で再試行します。</span>
              <button
                type="button"
                onClick={cancelRetry}
                className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                自動再試行をやめる
              </button>
            </p>
          )}
        </div>
      )}

      {/* 結果カード */}
      {text && (
        <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-navy">{currentName}</span> ・{" "}
              {charCount.toLocaleString()}字
              {isComplete && !isGenerating && (
                <span className="ml-2 text-green-600">生成完了</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!text}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
              >
                {copied ? "コピーしました" : "テキストをコピー"}
              </button>
              {showReviewButton && (
                <button
                  type="button"
                  onClick={() => startReview(text)}
                  className="rounded-lg border border-navy px-4 py-2 text-sm font-medium text-navy transition hover:bg-navy/5"
                >
                  校閲・品質チェック
                </button>
              )}
              {showDownload && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-light"
                >
                  Wordファイルをダウンロード
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">
            {text}
          </div>
        </section>
      )}

      {showReviewPanel && (
        <ReviewPanel
          reviewing={reviewing}
          status={reviewStatus}
          counts={reviewCounts}
          candidates={candidates}
          summary={reviewSummary}
          approvedIds={approvedIds}
          error={reviewError}
          appliedMessage={appliedMessage}
          onToggle={toggleApprove}
          onSelectAll={selectAllApproved}
          onApply={applyApproved}
          onDismiss={dismissReview}
          onRerun={rerunReview}
        />
      )}
    </main>
  );
}
