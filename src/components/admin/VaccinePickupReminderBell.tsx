/**
 * Nút chuông trên header — chỉ hiện cho tài khoản admin (super_admin / manager).
 * Bật thông báo máy tính cho nhắc lấy vaccine; xem nhanh phiếu vaccine theo slot.
 */
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVaccinePickupReminder } from "@/hooks/useVaccinePickupReminder";
import { VACCINE_PICKUP_SLOTS } from "@/lib/vaccinePickup";
import { cn } from "@/lib/utils";

export function VaccinePickupReminderBell({ enabled }: { enabled: boolean }) {
  const { permission, requestPermission, check, checking, lastResult } =
    useVaccinePickupReminder(enabled);

  if (!enabled) return null;

  const granted = permission === "granted";
  const denied = permission === "denied";
  const Icon = checking ? Loader2 : granted ? BellRing : denied ? BellOff : Bell;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="vaccine-reminder-bell"
          className={cn(
            "border-slate-500 text-slate-100 hover:bg-slate-800 hover:text-white",
            granted && "border-emerald-400 text-emerald-200",
            denied && "border-amber-400 text-amber-200",
          )}
          title={
            granted
              ? "Nhắc lấy vaccine trên máy: đang bật (11:00 · 12:30)"
              : denied
                ? "Trình duyệt đã chặn thông báo — bật lại trong cài đặt trang"
                : "Bật nhắc lấy vaccine trên máy tính"
          }
        >
          <Icon className={cn("h-4 w-4 mr-1.5", checking && "animate-spin")} />
          Nhắc vaccine
          {lastResult && lastResult.count > 0 ? (
            <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
              {lastResult.count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Khi tới giờ, web đang mở sẽ hiện thông báo trên máy + trong app (chỉ tài khoản admin).
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {permission === "unsupported" ? (
          <DropdownMenuItem disabled>Trình duyệt không hỗ trợ thông báo</DropdownMenuItem>
        ) : granted ? (
          <DropdownMenuItem disabled className="text-emerald-700">
            <BellRing className="h-4 w-4 mr-2" /> Thông báo máy tính: đang bật
          </DropdownMenuItem>
        ) : denied ? (
          <DropdownMenuItem disabled className="text-amber-700">
            <BellOff className="h-4 w-4 mr-2" /> Đã chặn — mở cài đặt trang (ổ khóa cạnh URL) để cho phép
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void requestPermission()}>
            <Bell className="h-4 w-4 mr-2" /> Bật thông báo trên máy tính
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Xem phiếu vaccine hôm nay</DropdownMenuLabel>
        {VACCINE_PICKUP_SLOTS.map((slot) => (
          <DropdownMenuItem
            key={slot.key}
            onClick={() => void check({ force: true, slot })}
            disabled={checking}
          >
            {slot.time} · {slot.label}
          </DropdownMenuItem>
        ))}
        {lastResult ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Lần kiểm tra cuối {lastResult.at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}:{" "}
              {lastResult.slot.time} — {lastResult.count} phiếu vaccine
            </DropdownMenuLabel>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default VaccinePickupReminderBell;
