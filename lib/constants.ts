// サーバー・フロント双方から参照する共通定数

// 生成部（①）で使うモデル。指定どおり claude-sonnet-4-20250514 を使う。
export const MODEL = "claude-sonnet-4-20250514";

// 検査部門（②品質検査・③校閲・④ルビ検査）で使うモデル。
// Haiku では誤字脱字の見落としが多かったため、精度重視で Sonnet を使う。
export const REVIEW_MODEL = "claude-sonnet-4-20250514";

// 編集判断部（⑤）で使うモデル。指摘の統合・取捨選択は精度重視で Sonnet。
export const EDITOR_MODEL = "claude-sonnet-4-20250514";

// 検査・編集判断の出力トークン上限。
export const REVIEW_MAX_TOKENS = 8000;

// 目標文字数。プログレスバーの分母にも使う。
export const TARGET_CHARS = 40000;

// 1回のAPI呼び出しあたりの最大トークン数。
// 40,000字は1回では収まらないため、分割（継続）生成で積み上げる。
export const MAX_TOKENS_PER_PASS = 16000;

// 継続生成の最大回数。max_tokens で打ち切られた場合のみ継続する。
export const MAX_PASSES = 6;

// 生成テキストの安全上限。これを超えたら継続生成を打ち切る。
export const MAX_TOTAL_CHARS = 60000;

// Streaming の途中でエラーが起きたときにサーバーが流し込む制御マーカー。
// 通常の台本テキストには現れない記号列を使い、誤検出を防ぐ。
// 形式は `${ERROR_MARKER}<ErrorCode>` となる。
export const ERROR_MARKER = "<<<NARRATION_STREAM_ERROR>>>:";

// レート制限時に自動再試行するまでの待機秒数。
export const RETRY_DELAY_SECONDS = 60;
