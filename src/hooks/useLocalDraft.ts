import { useCallback, useEffect, useRef } from "react";

export type UseLocalDraftOptions<T> = {
  /** localStorage key, e.g. k9_draft_order_transfer */
  storageKey: string;
  /** Snapshot hiện tại của form */
  value: T;
  /**
   * true khi có dữ liệu chưa lưu cần bảo vệ (F5 / đóng tab).
   * Thường: có ≥1 dòng hàng hoặc field quan trọng đã nhập.
   */
  isDirty: boolean;
  /** Debounce ghi localStorage (ms). Mặc định 1000. */
  debounceMs?: number;
  /**
   * Gọi 1 lần khi mount nếu tìm thấy bản nháp hợp lệ.
   * Trả về false nếu bỏ qua (draft lỗi / không dùng).
   */
  onRestore?: (draft: T) => boolean | void;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode — bỏ qua
  }
}

/** Đọc nháp đồng bộ (dùng lazy useState initializer). */
export function peekLocalDraft<T>(storageKey: string): T | null {
  if (typeof window === "undefined") return null;
  return readJson<T>(storageKey);
}

export function clearLocalDraft(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

/**
 * Auto-save form → localStorage + beforeunload khi dirty.
 * Form dùng useState (không bắt buộc react-hook-form).
 */
export function useLocalDraft<T>({
  storageKey,
  value,
  isDirty,
  debounceMs = 1000,
  onRestore,
}: UseLocalDraftOptions<T>) {
  const restoredRef = useRef(false);
  const skipSaveRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Restore 1 lần khi mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const draft = readJson<T>(storageKey);
    if (!draft || !onRestore) return;
    skipSaveRef.current = true;
    const ok = onRestore(draft);
    // Cho phép state settle rồi mới bật lại auto-save
    window.setTimeout(() => {
      skipSaveRef.current = false;
    }, 50);
    if (ok === false) return;
  }, [storageKey, onRestore]);

  // Debounced auto-save
  useEffect(() => {
    if (skipSaveRef.current) return;
    if (!isDirty) return;
    const t = window.setTimeout(() => {
      writeJson(storageKey, valueRef.current);
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [storageKey, value, isDirty, debounceMs]);

  // beforeunload — F5 / đóng tab
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const clearDraft = useCallback(() => {
    clearLocalDraft(storageKey);
  }, [storageKey]);

  const saveDraftNow = useCallback(() => {
    writeJson(storageKey, valueRef.current);
  }, [storageKey]);

  return { clearDraft, saveDraftNow };
}

/** Keys chuẩn K9 */
export const K9_DRAFT_ORDER_TRANSFER = "k9_draft_order_transfer";
export const K9_DRAFT_ORDER_SALES = "k9_draft_order_sales";
