import { useMemo, useState } from "react";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";
import {
  type GiftLimitKind,
  useProductGifts,
} from "@/hooks/useProductGifts";
import { useProducts } from "@/hooks/useProducts";
import { filterCatalogSuggestions, type CatalogSearchItem } from "@/lib/catalogSearch";
import {
  formatGiftLimitLabel,
  isGiftRuleLive,
} from "@/lib/productGifts";
import { ProductSearchInput } from "@/components/admin/ProductSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const LIMIT_OPTIONS: { id: GiftLimitKind; title: string; hint: string }[] = [
  {
    id: "long_term",
    title: "Tặng dài hạn",
    hint: "Luôn tặng khi chọn mã A, không hết hạn.",
  },
  {
    id: "timeline",
    title: "Theo timeline",
    hint: "Chỉ tặng trong khoảng ngày (giờ VN).",
  },
  {
    id: "qty_limit",
    title: "Giới hạn số lượng",
    hint: "Ngừng tặng khi đạt tổng SL quà trên mọi phiếu.",
  },
];

export default function ProductGiftsPanel() {
  const { data: rules = [], isLoading, save, remove } = useProductGifts();
  const { products } = useProducts();
  const { toast } = useToast();
  const [mainId, setMainId] = useState("");
  const [giftId, setGiftId] = useState("");
  const [mainSearch, setMainSearch] = useState("");
  const [giftSearch, setGiftSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [limitKind, setLimitKind] = useState<GiftLimitKind>("long_term");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [maxTotalQty, setMaxTotalQty] = useState(100);

  const available = useMemo(
    () => products.filter((p) => p.is_active !== false && p.slug),
    [products],
  );
  const mainSuggestions = useMemo(
    () => filterCatalogSuggestions(available as unknown as CatalogSearchItem[], mainSearch, 10),
    [available, mainSearch],
  );
  const giftSuggestions = useMemo(
    () => filterCatalogSuggestions(available as unknown as CatalogSearchItem[], giftSearch, 10),
    [available, giftSearch],
  );

  const handleAdd = async () => {
    if (!mainId || !giftId) {
      toast({ title: "Chọn sản phẩm chính và hàng tặng", variant: "destructive" });
      return;
    }
    if (mainId === giftId) {
      toast({ title: "Hàng tặng phải khác sản phẩm chính", variant: "destructive" });
      return;
    }
    if (limitKind === "timeline") {
      if (!startsOn && !endsOn) {
        toast({ title: "Chọn ngày bắt đầu hoặc ngày kết thúc", variant: "destructive" });
        return;
      }
      if (startsOn && endsOn && endsOn < startsOn) {
        toast({ title: "Ngày kết thúc phải sau ngày bắt đầu", variant: "destructive" });
        return;
      }
    }
    if (limitKind === "qty_limit" && !(Number(maxTotalQty) > 0)) {
      toast({ title: "Nhập tổng SL tặng tối đa", variant: "destructive" });
      return;
    }
    try {
      await save.mutateAsync({
        mainProductId: mainId,
        giftProductId: giftId,
        quantity: qty || 1,
        limitKind,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        maxTotalQty: maxTotalQty || null,
      });
      setMainId("");
      setGiftId("");
      setMainSearch("");
      setGiftSearch("");
      setQty(1);
      toast({ title: "Đã lưu quy tắc tặng kèm" });
    } catch (error) {
      toast({
        title: "Không lưu được",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Gift className="h-4 w-4 text-rose-600" />
          Hàng tặng kèm
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Khi tạo phiếu DH/DC hoặc đề nghị xuất có sản phẩm A, form tự thêm sản phẩm B
          (giá 0, nhãn TẶNG) nếu quy tắc còn hiệu lực.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProductSearchInput
          label="Sản phẩm chính (A)"
          value={mainSearch}
          onChange={(value) => {
            setMainSearch(value);
            setMainId("");
          }}
          suggestions={mainSuggestions}
          open={!!mainSearch.trim()}
          onOpenChange={() => {}}
          showWhenTyping
          onPick={(p) => {
            setMainId(p.id);
            setMainSearch(p.slug || p.name);
          }}
          placeholder="Gõ mã hoặc tên sản phẩm A..."
        />
        <ProductSearchInput
          label="Hàng tặng (B)"
          value={giftSearch}
          onChange={(value) => {
            setGiftSearch(value);
            setGiftId("");
          }}
          suggestions={giftSuggestions}
          open={!!giftSearch.trim()}
          onOpenChange={() => {}}
          showWhenTyping
          onPick={(p) => {
            setGiftId(p.id);
            setGiftSearch(p.slug || p.name);
          }}
          placeholder="Gõ mã hoặc tên quà tặng B..."
        />
      </div>

      <div>
        <Label className="text-xs">Cách áp dụng</Label>
        <RadioGroup
          className="mt-2 grid gap-2 sm:grid-cols-3"
          value={limitKind}
          onValueChange={(value) => setLimitKind(value as GiftLimitKind)}
        >
          {LIMIT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer gap-2 rounded-md border p-2 text-left",
                limitKind === opt.id ? "border-rose-400 bg-rose-50/70" : "bg-background",
              )}
            >
              <RadioGroupItem className="mt-0.5" value={opt.id} id={`gift-${opt.id}`} />
              <span>
                <span className="block text-sm font-medium">{opt.title}</span>
                <span className="block text-[11px] text-muted-foreground leading-snug">
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {limitKind === "timeline" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs" htmlFor="gift-starts-on">Ngày bắt đầu</Label>
            <Input
              id="gift-starts-on"
              className="mt-1 h-9 w-[11.5rem]"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="gift-ends-on">Ngày kết thúc</Label>
            <Input
              id="gift-ends-on"
              className="mt-1 h-9 w-[11.5rem]"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {limitKind === "qty_limit" ? (
        <div>
          <Label className="text-xs" htmlFor="gift-max-qty">Tổng SL tặng tối đa</Label>
          <Input
            id="gift-max-qty"
            className="mt-1 h-9 w-32"
            type="number"
            min="0.001"
            step="0.001"
            value={maxTotalQty}
            onChange={(e) => setMaxTotalQty(Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Đếm trên mọi phiếu DH/DC và đề nghị xuất (trừ phiếu hủy / từ chối).
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">SL tặng / 1 SP chính</Label>
          <Input
            className="mt-1 h-9 w-24"
            type="number"
            min="0.001"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
          />
        </div>
        <Button size="sm" onClick={() => void handleAdd()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
          Thêm quy tắc
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto max-h-[48vh]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SP chính</TableHead>
              <TableHead>Hàng tặng</TableHead>
              <TableHead>SL</TableHead>
              <TableHead>Áp dụng</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center">
                  <Loader2 className="inline h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rules.length ? (
              rules.map((rule) => {
                const live = isGiftRuleLive(rule);
                return (
                  <TableRow key={rule.id} className={live ? undefined : "opacity-60"}>
                    <TableCell>
                      <span className="font-mono text-xs">{rule.main?.slug}</span>
                      <div className="text-sm">{rule.main?.name}</div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{rule.gift?.slug}</span>
                      <div className="text-sm">{rule.gift?.name}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{rule.quantity}</TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{formatGiftLimitLabel(rule)}</div>
                      {!live ? (
                        <div className="text-[11px] text-rose-700">Không còn hiệu lực</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Xóa quy tắc"
                        onClick={() => void remove.mutateAsync(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Chưa có quy tắc tặng kèm.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
