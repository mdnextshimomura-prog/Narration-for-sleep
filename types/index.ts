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
