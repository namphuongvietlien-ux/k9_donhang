import * as React from "react";
import { cn } from "@/lib/utils";

const SPINNER_HIDE =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export type QtyInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "onChange" | "value"
> & {
  value: number | string;
  onValueChange?: (n: number) => void;
  /** Compact Excel cell look */
  compact?: boolean;
};

/**
 * Ô số kiểu Excel: focus → select all, không spinner, paste số bình thường.
 * Khi focus giữ draft nội bộ; blur mới sync value prop.
 */
const QtyInput = React.forwardRef<HTMLInputElement, QtyInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      onFocus,
      onBlur,
      compact = true,
      min = 0,
      ...props
    },
    ref,
  ) => {
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState(String(value ?? 0));

    React.useEffect(() => {
      if (!focused) setDraft(String(value ?? 0));
    }, [value, focused]);

    return (
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={min}
        value={draft}
        className={cn(
          "w-full rounded-sm border border-input bg-background text-right tabular-nums",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          SPINNER_HIDE,
          compact ? "h-7 px-1.5 py-0 text-sm" : "h-9 px-2 text-sm",
          className,
        )}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw === "") {
            onValueChange?.(0);
            return;
          }
          const n = Number(raw);
          if (!Number.isNaN(n)) onValueChange?.(n);
        }}
        onBlur={(e) => {
          setFocused(false);
          const n = Number(e.currentTarget.value);
          const final = Number.isNaN(n) ? 0 : n;
          setDraft(String(final));
          onValueChange?.(final);
          onBlur?.(e);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").trim().replace(/,/g, "");
          if (!text) return;
          const n = Number(text);
          if (!Number.isNaN(n)) {
            e.preventDefault();
            setDraft(String(n));
            onValueChange?.(n);
          }
        }}
        {...props}
      />
    );
  },
);
QtyInput.displayName = "QtyInput";

/** Class bảng Excel-like: compact + border + sticky header */
export const excelTableWrap =
  "rounded-md border border-gray-300 overflow-auto max-h-[min(70vh,720px)] relative border-collapse";

export const excelTh =
  "sticky top-0 z-20 border border-gray-300 bg-slate-100 p-1 px-1.5 text-[13px] font-semibold h-8 whitespace-nowrap shadow-[0_1px_0_#cbd5e1]";

export const excelTd =
  "border border-gray-300 p-1 px-1.5 text-[13px] h-8 align-middle";

export const excelTr = "hover:bg-slate-50";

export { QtyInput };
export default QtyInput;
