// アプリ全体で使う型定義

export interface GenerationState {
  isGenerating: boolean;
  text: string;
  charCount: number;
  elapsedSeconds: number;
  isComplete: boolean;
  error: string | null;
}

export interface SavedNarration {
  name: string;
  text: string;
  generatedAt: string; // ISO 8601形式
  charCount: number;
}

// 生成時のエラー種別。サーバーとフロントで共有する。
export type ErrorCode = "RATE_LIMIT" | "AUTH" | "NETWORK" | "UNKNOWN";

// 校閲パイプラインの各部門。
export type ReviewDept = "compliance" | "proofread" | "ruby";

// 進捗表示で使う工程（検査3部門 + 編集判断）。
export type ReviewStage = ReviewDept | "editor";

export type StageStatus = "idle" | "running" | "done";

// 各検査部門が返す指摘1件。
export interface ReviewIssue {
  dept: ReviewDept;
  category: string;
  severity: "high" | "medium" | "low";
  excerpt: string; // 該当箇所を含む原文の抜粋
  before: string; // 置換対象の語句（置換不可なら空文字）
  after: string; // 修正案（置換不可なら空文字）
  reason: string;
}

// 編集判断部が統合し、人の確認に回す修正候補。
export interface ReviewCandidate extends ReviewIssue {
  id: string;
  applicable: boolean; // before が原文に存在し、自動置換できるか
}

export interface ReviewSummary {
  compliance: number;
  proofread: number;
  ruby: number;
}

// /api/review が NDJSON で流すイベント。
export type ReviewEvent =
  | { type: "stage_start"; stage: ReviewStage }
  | { type: "stage_done"; stage: ReviewStage; issueCount: number }
  | { type: "result"; candidates: ReviewCandidate[]; summary: ReviewSummary }
  | { type: "error"; code: ErrorCode };
