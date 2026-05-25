// localStorage を使った生成履歴の保存・読み込み。
// 生成済み偉人リストと、生成テキスト本文の両方をここで一元管理する。

import type { SavedNarration } from "@/types";

const HISTORY_KEY = "narration_history";
const LAST_NAME_KEY = "narration_last_name";

// 保存する最大件数。localStorage の容量上限（約5MB）に収まるよう、
// 新しい順にこの件数まで保持し、古いものから自動で落とす。
const MAX_SAVED = 30;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadAll(): SavedNarration[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedNarration[];
  } catch {
    return [];
  }
}

// 履歴を新しい順に MAX_SAVED 件まで保持して書き込む。
// 容量を超えた場合は古いものから落として再試行する。
function persist(list: SavedNarration[]): SavedNarration[] {
  if (!isBrowser()) return list.slice(0, MAX_SAVED);
  let working = list.slice(0, MAX_SAVED);
  while (working.length > 0) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(working));
      return working;
    } catch {
      working = working.slice(0, -1);
    }
  }
  window.localStorage.removeItem(HISTORY_KEY);
  return [];
}

// 同名があれば上書き、なければ追加する。新しい順に並べ替えて返す。
export function saveNarration(narration: SavedNarration): SavedNarration[] {
  const all = loadAll().filter((n) => n.name !== narration.name);
  all.unshift(narration);
  return persist(all);
}

export function deleteNarration(name: string): SavedNarration[] {
  const all = loadAll().filter((n) => n.name !== name);
  const saved = persist(all);
  if (isBrowser() && getLastName() === name) {
    window.localStorage.removeItem(LAST_NAME_KEY);
  }
  return saved;
}

export function getByName(name: string): SavedNarration | undefined {
  return loadAll().find((n) => n.name === name);
}

export function getLastName(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(LAST_NAME_KEY);
}

export function setLastName(name: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(LAST_NAME_KEY, name);
}
