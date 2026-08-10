/**
 * Ô tìm SP + dropdown gợi ý — dùng chung Create / Detail / BanKem.
 */
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CatalogSuggestItem,
  CatalogSuggestList,
  type CatalogSuggestRow,
} from "@/components/admin/CatalogSuggestDropdown";

export type ProductSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestions: CatalogSuggestRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (product: CatalogSuggestRow) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  inputClassName?: string;
  listClassName?: string;
  /** Khi true: hiện list chỉ cần value.trim() (không cần prop open) — tương thích Create cũ */
  showWhenTyping?: boolean;
  renderExtraMeta?: (product: CatalogSuggestRow) => ReactNode;
  unitLabel?: (product: CatalogSuggestRow) => string | undefined;
  barcodeLabel?: (product: CatalogSuggestRow) => string | undefined;
  emptyText?: ReactNode;
  loadingText?: ReactNode;
};

export function ProductSearchInput({
  value,
  onChange,
  suggestions,
  open,
  onOpenChange,
  onPick,
  onKeyDown,
  placeholder = "Quét mã vạch, gõ mã hàng hoặc tên…",
  label,
  hint,
  inputRef,
  disabled,
  loading,
  className,
  inputClassName,
  listClassName,
  showWhenTyping,
  renderExtraMeta,
  unitLabel,
  barcodeLabel,
  emptyText = "Không tìm thấy sản phẩm phù hợp.",
  loadingText = "Đang tải danh mục…",
}: ProductSearchInputProps) {
  const showList =
    !disabled &&
    !!value.trim() &&
    (showWhenTyping ? true : open);

  return (
    <div className={className ?? "flex-1 min-w-[200px] space-y-1 relative"}>
      {label ? (
        typeof label === "string" ? (
          <Label className="text-xs">{label}</Label>
        ) : (
          label
        )
      ) : null}
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          onOpenChange(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (value.trim()) onOpenChange(true);
        }}
        placeholder={placeholder}
        className={
          inputClassName ??
          "h-10 text-sm font-semibold border-2 border-primary"
        }
        autoComplete="off"
      />
      {hint}
      {showList ? (
        <CatalogSuggestList className={listClassName}>
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingText}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            suggestions.map((p) => (
              <CatalogSuggestItem
                key={p.id}
                product={p}
                unitLabel={unitLabel?.(p)}
                barcodeLabel={barcodeLabel?.(p)}
                extraMeta={renderExtraMeta?.(p)}
                onSelect={() => onPick(p)}
              />
            ))
          )}
        </CatalogSuggestList>
      ) : null}
    </div>
  );
}

export default ProductSearchInput;
