"use client";

import type {
  ReviewCandidate,
  ReviewStage,
  ReviewSummary,
  StageStatus,
} from "@/types";

const STAGE_LABELS: Record<ReviewStage, string> = {
  compliance: "品質検査部",
  proofread: "校閲部",
  ruby: "ルビ検査部",
  editor: "編集判断部",
};

const STAGE_ORDER: ReviewStage[] = ["compliance", "proofread", "ruby", "editor"];

const DEPT_BADGE: Record<string, string> = {
  compliance: "bg-purple-100 text-purple-700",
  proofread: "bg-blue-100 text-blue-700",
  ruby: "bg-teal-100 text-teal-700",
};

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const SEVERITY_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "done") {
    return <span className="text-green-600">✓</span>;
  }
  if (status === "running") {
    return <span className="spinner-dark" aria-hidden />;
  }
  return <span className="text-gray-300">○</span>;
}

interface ReviewPanelProps {
  reviewing: boolean;
  status: Record<ReviewStage, StageStatus>;
  counts: Partial<Record<ReviewStage, number>>;
  candidates: ReviewCandidate[] | null;
  summary: ReviewSummary | null;
  approvedIds: Set<string>;
  error: string | null;
  appliedMessage: string | null;
  onToggle: (id: string) => void;
  onSelectAll: (selectAll: boolean) => void;
  onApply: () => void;
  onDismiss: () => void;
  onRerun: () => void;
}

export default function ReviewPanel({
  reviewing,
  status,
  counts,
  candidates,
  summary,
  approvedIds,
  error,
  appliedMessage,
  onToggle,
  onSelectAll,
  onApply,
  onDismiss,
  onRerun,
}: ReviewPanelProps) {
  const applicableCandidates = candidates?.filter((c) => c.applicable) ?? [];
  const advisoryCandidates = candidates?.filter((c) => !c.applicable) ?? [];
  const approvedCount = applicableCandidates.filter((c) =>
    approvedIds.has(c.id),
  ).length;

  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-navy">校閲・品質チェック</h2>
        {!reviewing && (
          <button
            type="button"
            onClick={onRerun}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            もう一度チェック
          </button>
        )}
      </div>

      {/* 部門ごとの進捗 */}
      <ol className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGE_ORDER.map((stage) => (
          <li
            key={stage}
            className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
          >
            <StatusIcon status={status[stage]} />
            <span className="font-medium text-gray-700">
              {STAGE_LABELS[stage]}
            </span>
            {status[stage] === "done" && counts[stage] !== undefined && (
              <span className="ml-auto text-xs text-gray-500">
                {counts[stage]}件
              </span>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {appliedMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {appliedMessage}
        </div>
      )}

      {reviewing && (
        <p className="text-sm text-gray-500">各部門が確認しています…</p>
      )}

      {/* 修正候補 */}
      {!reviewing && candidates && (
        <div>
          {summary && (
            <p className="mb-3 text-sm text-gray-600">
              指摘の合計：品質検査 {summary.compliance}件・校閲 {summary.proofread}
              件・ルビ {summary.ruby}件 →{" "}
              <span className="font-medium text-navy">
                修正候補 {candidates.length}件
              </span>
            </p>
          )}

          {candidates.length === 0 && (
            <p className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
              修正が必要な候補は見つかりませんでした。
            </p>
          )}

          {applicableCandidates.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                自動反映できる候補：{approvedCount} / {applicableCandidates.length}{" "}
                件を選択中
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onSelectAll(true)}
                  className="rounded border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-100"
                >
                  すべて選択
                </button>
                <button
                  type="button"
                  onClick={() => onSelectAll(false)}
                  className="rounded border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-100"
                >
                  すべて解除
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {applicableCandidates.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 p-3 text-sm"
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={approvedIds.has(c.id)}
                    onChange={() => onToggle(c.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-navy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          DEPT_BADGE[c.dept] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STAGE_LABELS[c.dept]}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          SEVERITY_BADGE[c.severity]
                        }`}
                      >
                        重要度 {SEVERITY_LABEL[c.severity]}
                      </span>
                      <span className="text-xs text-gray-500">{c.category}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">
                        {c.before}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">
                        {c.after || "（削除）"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{c.reason}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>

          {/* 自動反映できない助言（手動対応） */}
          {advisoryCandidates.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-gray-500">
                自動反映できない指摘（手動でご確認ください）
              </p>
              <ul className="space-y-2">
                {advisoryCandidates.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          DEPT_BADGE[c.dept] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STAGE_LABELS[c.dept]}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          SEVERITY_BADGE[c.severity]
                        }`}
                      >
                        重要度 {SEVERITY_LABEL[c.severity]}
                      </span>
                      <span className="text-xs text-gray-500">{c.category}</span>
                    </div>
                    {c.excerpt && (
                      <p className="text-xs text-gray-700">対象：{c.excerpt}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-600">{c.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onApply}
                disabled={approvedCount === 0}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                承認した修正を反映（{approvedCount}件）
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                修正せずに確定
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
