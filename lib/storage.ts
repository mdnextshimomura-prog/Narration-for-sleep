// localStorage を使った生成履歴の保存・読み込み。
// 生成済み偉人リストと、生成テキスト本文の両方をここで一元管理する。

import type { SavedNarration } from "@/types";

const HISTORY_KEY = "narration_history";
const LAST_NAME_KEY = "narration_last_name";

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

// 同名があれば上書き、なければ追加する。新しい順に並べ替えて返す。
export function saveNarration(narration: SavedNarration): SavedNarration[] {
  const all = loadAll().filter((n) => n.name !== narration.name);
  all.unshift(narration);
  if (isBrowser()) {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  }
  return all;
}

export function deleteNarration(name: string): SavedNarration[] {
  const all = loadAll().filter((n) => n.name !== name);
  if (isBrowser()) {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    if (getLastName() === name) {
      window.localStorage.removeItem(LAST_NAME_KEY);
    }
  }
  return all;
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
