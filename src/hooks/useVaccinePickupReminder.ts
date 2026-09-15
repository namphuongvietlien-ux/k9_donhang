/**
 * Nhắc lấy vaccine ngay trên máy khi tài khoản admin đang mở web:
 * - Trước giờ hẹn 15 phút: nháy 1 lần thông báo desktop (Notification API) + toast nhỏ.
 * - Tới giờ hẹn: thông báo desktop lần 2 + popup giữa màn hình (AlertDialog) liệt kê phiếu.
 * Mỗi pha chỉ nhắc 1 lần / slot / ngày (localStorage); có cửa sổ 90 phút để web mở muộn vẫn nhắc.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  fetchVaccinePickupHits,
  formatVaccineReminder,
  getActiveVaccinePhases,
  vnNow,
  VACCINE_PICKUP_SLOTS,
  type VaccinePickupHit,
  type VaccineReminderPhase,
  type VaccineSlot,
} from "@/lib/vaccinePickup";

const FIRED_KEY = "k9.vaccineReminder.fired";
const CHECK_EVERY_MS = 30_000;

export type NotifyPermission = NotificationPermission | "unsupported";

export interface VaccineDueAlert {
  slot: VaccineSlot;
  phase: VaccineReminderPhase;
  hits: VaccinePickupHit[];
  at: Date;
}

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

function showDesktopNotification(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const n = new Notification(title, {
      body,
      tag,
      requireInteraction: true,
      icon: "/1564804129_k9-logo-ps.png",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
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
  /** Popup giữa màn hình khi tới giờ (null = đóng) */
  const [dueAlert, setDueAlert] = useState<VaccineDueAlert | null>(null);
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
    (slot: VaccineSlot, phase: VaccineReminderPhase, hits: VaccinePickupHit[]) => {
      const { title, body } = formatVaccineReminder(slot, hits, phase);
      showDesktopNotification(title, body, `vaccine-${slot.key}-${phase}`);
      if (phase === "pre") {
        toast({
          title,
          description: body.split("\n").slice(0, 4).join(" · "),
          duration: 5 * 60_000,
        });
        return;
      }
      setDueAlert({ slot, phase, hits, at: new Date() });
    },
    [toast],
  );

  /**
   * Kiểm tra mọi khung nhắc đang hiệu lực (có thể vừa "due" 11:00 vừa "pre" 12:30).
   * force + slot = menu "Xem phiếu": bỏ qua "đã nhắc"/khung giờ, chỉ hiện popup, không mark.
   */
  const check = useCallback(
    async (opts?: { force?: boolean; slot?: VaccineSlot }) => {
      if (busyRef.current) return;
      const now = new Date();
      const { date } = vnNow(now);
      const targets: { slot: VaccineSlot; phase: VaccineReminderPhase }[] = opts?.slot
        ? [{ slot: opts.slot, phase: "due" }]
        : getActiveVaccinePhases(now).filter(
            (p) => opts?.force || !readFired()[`${date}:${p.slot.key}:${p.phase}`],
          );
      if (!targets.length) {
        if (opts?.force) {
          toast({
            title: "Chưa tới giờ nhắc vaccine",
            description: `Khung giờ: ${VACCINE_PICKUP_SLOTS.map((s) => `${s.time} (${s.label})`).join(" · ")}. Chọn slot để xem phiếu hôm nay.`,
          });
        }
        return;
      }

      busyRef.current = true;
      setChecking(true);
      try {
        for (const { slot, phase } of targets) {
          const key = `${date}:${slot.key}:${phase}`;
          const hits = await fetchVaccinePickupHits(slot, date);
          setLastResult({ slot, count: hits.length, at: now });
          if (hits.length) {
            if (opts?.force) {
              setDueAlert({ slot, phase: "due", hits, at: now });
            } else {
              notify(slot, phase, hits);
            }
          } else if (opts?.force) {
            toast({
              title: `Không có phiếu vaccine ${slot.time} (${slot.label})`,
              description: `Ngày soạn ${date} — không phiếu DH/DT/DC nào chờ soạn có mã VAC.`,
            });
          }
          if (!opts?.force) markFired(key);
        }
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

  const dismissDueAlert = useCallback(() => setDueAlert(null), []);

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

  return {
    permission,
    requestPermission,
    check,
    checking,
    lastResult,
    dueAlert,
    dismissDueAlert,
  };
}
