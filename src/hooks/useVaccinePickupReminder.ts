/**
 * Nhắc lấy vaccine ngay trên máy (Notification API + toast trong app) khi tới giờ
 * 11:00 / 12:30 VN, nếu tài khoản admin đang mở web. Mỗi slot chỉ nhắc 1 lần / ngày
 * (lưu localStorage), có cửa sổ 90 phút để web mở muộn vẫn được nhắc.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  fetchVaccinePickupHits,
  formatVaccineReminder,
  getDueVaccineSlot,
  vnNow,
  VACCINE_PICKUP_SLOTS,
  type VaccineSlot,
} from "@/lib/vaccinePickup";

const FIRED_KEY = "k9.vaccineReminder.fired";
const CHECK_EVERY_MS = 30_000;

export type NotifyPermission = NotificationPermission | "unsupported";

function readFired(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function markFired(key: string) {
  const all = readFired();
  all[key] = new Date().toISOString();
  // giữ gọn: bỏ key cũ hơn 7 ngày
  const cutoff = Date.now() - 7 * 86_400_000;
  for (const [k, v] of Object.entries(all)) {
    if (new Date(v).getTime() < cutoff) delete all[k];
  }
  try {
    window.localStorage.setItem(FIRED_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

function getPermission(): NotifyPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function useVaccinePickupReminder(enabled: boolean) {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotifyPermission>(getPermission);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<{
    slot: VaccineSlot;
    count: number;
    at: Date;
  } | null>(null);
  const busyRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return "unsupported" as NotifyPermission;
    }
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  }, []);

  const notify = useCallback(
    (slot: VaccineSlot, hits: Awaited<ReturnType<typeof fetchVaccinePickupHits>>) => {
      const { title, body } = formatVaccineReminder(slot, hits);
      toast({
        title,
        description: body.split("\n").slice(0, 6).join(" · "),
        duration: 15 * 60_000,
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(title, {
            body,
            tag: `vaccine-${slot.key}`,
            requireInteraction: true,
            icon: "/1564804129_k9-logo-ps.png",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          /* một số trình duyệt chặn Notification ngoài Service Worker */
        }
      }
      const prev = document.title;
      if (!prev.startsWith("💉")) {
        document.title = `💉 ${prev}`;
        window.setTimeout(() => {
          if (document.title.startsWith("💉 ")) document.title = prev;
        }, 15 * 60_000);
      }
    },
    [toast],
  );

  /** Kiểm tra slot đang tới giờ; force = bỏ qua "đã nhắc" và cửa sổ giờ (nút Kiểm tra ngay) */
  const check = useCallback(
    async (opts?: { force?: boolean; slot?: VaccineSlot }) => {
      if (busyRef.current) return;
      const now = new Date();
      const { date } = vnNow(now);
      const slot = opts?.slot || getDueVaccineSlot(now);
      if (!slot) {
        if (opts?.force) {
          toast({
            title: "Chưa tới giờ nhắc vaccine",
            description: `Khung giờ: ${VACCINE_PICKUP_SLOTS.map((s) => `${s.time} (${s.label})`).join(" · ")}. Chọn slot để xem phiếu hôm nay.`,
          });
        }
        return;
      }
      const key = `${date}:${slot.key}`;
      if (!opts?.force && readFired()[key]) return;

      busyRef.current = true;
      setChecking(true);
      try {
        const hits = await fetchVaccinePickupHits(slot, date);
        setLastResult({ slot, count: hits.length, at: now });
        if (hits.length) {
          notify(slot, hits);
        } else if (opts?.force) {
          toast({
            title: `Không có phiếu vaccine ${slot.time} (${slot.label})`,
            description: `Ngày soạn ${date} — không phiếu DH/DT/DC nào chờ soạn có mã VAC.`,
          });
        }
        if (!opts?.force) markFired(key);
      } catch (e) {
        if (opts?.force) {
          toast({
            title: "Không kiểm tra được phiếu vaccine",
            description: e instanceof Error ? e.message : "Lỗi",
            variant: "destructive",
          });
        }
      } finally {
        busyRef.current = false;
        setChecking(false);
      }
    },
    [notify, toast],
  );

  useEffect(() => {
    if (!enabled) return;
    void check();
    const id = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, check]);

  return { permission, requestPermission, check, checking, lastResult };
}
