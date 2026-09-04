import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  Upload,
  Warehouse,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadImportTemplate } from "@/lib/importTemplates";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import {
  useCatalogForImport,
  useCommitCatalogStockImport,
} from "@/hooks/useCatalogStockImport";
import {
  parseCatalogStockMatrix,
  type CatalogStockImportMode,
  type ParsedCatalogStockImport,
} from "@/lib/catalogStockImport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

import { useStoreScope } from "@/hooks/useStoreScope";

type Step = 1 | 2 | 3;

interface CatalogStockImportProps {
  onSuccess?: () => void;
  className?: string;
  /** daily: chỉ file TỔNG HỢP TỒN KHO, ẩn tab danh mục */
  variant?: "full" | "daily";
}

async function fileToMatrix(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    if (parsed.errors?.length && !parsed.data?.length) {
      throw new Error(parsed.errors[0]?.message || "Không đọc được CSV.");
    }
    return (parsed.data as unknown[][]) || [];
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => /t[oôồ]n\s*kho|ton\s*kho/i.test(n)) ||
    wb.SheetNames[0];
  if (!sheetName) throw new Error("File Excel không có sheet.");
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  }) as unknown[][];
}

const STEP_LABELS: Record<Step, string> = {
  1: "Chọn file",
  2: "Xem trước",
  3: "Xác nhận",
};

export default function CatalogStockImport({
  onSuccess,
  className,
  variant = "full",
}: CatalogStockImportProps) {
  const { warehouses, loading: whLoading } = useWarehouses();
  const { data: catalog, isLoading: catalogLoading } = useCatalogForImport();
  const commit = useCommitCatalogStockImport();
  const { toast } = useToast();
  const { isStoreScoped, warehouseCode } = useStoreScope();
  const daily = variant === "daily";

  const [mode, setMode] = useState<CatalogStockImportMode>("stockQ7");
  const [warehouseId, setWarehouseId] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCatalogStockImport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newProductSelection, setNewProductSelection] = useState<Record<string, boolean>>({});
  const [newProductReviewDone, setNewProductReviewDone] = useState(false);

  useEffect(() => {
    if (!warehouses.length || warehouseId) return;
    const q7 = warehouses.find((w) => w.code === "Q7");
    setWarehouseId(q7?.id || warehouses[0].id);
  }, [warehouses, warehouseId]);

  const runParse = useCallback(
    async (file: File) => {
      setParsing(true);
      setParseError(null);
      setParsed(null);
      setFileName(file.name);
      setNewProductReviewDone(false);
      setConfirmOpen(false);
      setNewProductSelection({});
      try {
        if (!catalog) throw new Error("Đang tải danh mục, thử lại sau vài giây.");
        const matrix = await fileToMatrix(file);
        const existingBySlug = new Map(
          [...catalog.bySlug.entries()].map(([k, v]) => [
            k,
            { id: v.id, name: v.name, unit: v.unit, slug: v.slug || k },
          ]),
        );
        const existingByBarcode = new Map(
          [...(catalog.byBarcode?.entries() || [])].map(([k, v]) => [
            k,
            { id: v.id, name: v.name, unit: v.unit, slug: v.slug || k },
          ]),
        );
        const result = parseCatalogStockMatrix(matrix, {
          mode,
          existingBySlug,
          existingByBarcode,
          allowedWarehouseCodes:
            isStoreScoped && warehouseCode ? [warehouseCode] : null,
        });
        setParsed(result);
        setStep(2);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Không đọc được file.");
        setStep(1);
      } finally {
        setParsing(false);
      }
    },
    [catalog, mode, isStoreScoped, warehouseCode],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void runParse(file);
  };

  const handleModeChange = (v: string) => {
    setMode(v as CatalogStockImportMode);
    setParsed(null);
    setFileName("");
    setParseError(null);
    setStep(1);
  };

  const existingProducts = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines.filter((line) => !line.willCreate);
  }, [parsed]);

  const newProducts = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines.filter((line) => line.willCreate);
  }, [parsed]);

  const canConfirm =
    !!parsed &&
    parsed.validCount > 0 &&
    !commit.isPending &&
    (!newProducts.length || newProductReviewDone);

  const getNewProductKey = (line: { productSlug?: string | null; maHang?: string | null }) =>
    normalizeOrderCodeText(line.productSlug || line.maHang || "");

  const handleImport = async () => {
    if (!parsed) return;
    try {
      const selection = Object.fromEntries(
        newProducts.map((line) => {
          const key = getNewProductKey(line);
          return [key, !!newProductSelection[key]];
        }),
      );
      const res = await commit.mutateAsync({ parsed, warehouseId, newProductSelection: selection });
      const msg =
        res.mode === "catalogFast"
          ? `Đã nhập khẩu danh mục: tạo ${res.productsCreated} mã, cập nhật ${res.productsUpdated} mã (như GAS catalogFast → Data_Excel).`
          : parsed.layout === "misaSummary"
            ? `Đã cập nhật tồn hàng ngày: ${res.stockUpserted} dòng theo cột Cửa hàng (Cuối kỳ).`
            : `Đã import tồn: ${res.stockUpserted} dòng stock_on_hand theo mã+ĐVT (như GAS MH:|DV:), tạo thêm ${res.productsCreated} mã hàng.`;
      toast({ title: "Import thành công", description: msg });
      setParsed(null);
      setFileName("");
      setStep(1);
      onSuccess?.();
    } catch (e) {
      toast({
        title: "Import thất bại",
        description: e instanceof Error ? e.message : "Lỗi không xác định",
        variant: "destructive",
      });
    }
  };

  const loadingBase = whLoading || catalogLoading;
  const selectedWh = warehouses.find((w) => w.id === warehouseId);
  const whLabel = selectedWh ? warehouseLabel(selectedWh) : "—";
  const misa = parsed?.layout === "misaSummary";

  const previewLines = useMemo(() => parsed?.lines.slice(0, 80) ?? [], [parsed]);

  const toggleNewProduct = (key: string, checked: boolean) => {
    setNewProductSelection((prev) => ({ ...prev, [key]: checked }));
  };

  useEffect(() => {
    if (!parsed || !newProducts.length || newProductReviewDone) return;
    setConfirmOpen(true);
  }, [parsed, newProducts.length, newProductReviewDone]);

  useEffect(() => {
    if (!parsed) return;
    const next: Record<string, boolean> = {};
    for (const line of parsed.lines) {
      if (!line.willCreate) continue;
      const key = getNewProductKey(line);
      if (!key) continue;
      next[key] = false;
    }
    setNewProductSelection((prev) => ({ ...prev, ...next }));
  }, [parsed]);

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3 space-y-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          {daily
            ? "Cập nhật tồn hàng ngày"
            : "Import danh mục & tồn kho (GAS)"}
        </CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          {daily ? (
            <>
              Kéo file <strong>TỔNG HỢP TỒN KHO</strong> (MISA). Hệ thống đọc{" "}
              <strong>Cuối kỳ</strong> theo từng <strong>Cửa hàng</strong>, bỏ
              dòng tổng và Tổng công ty.
            </>
          ) : (
            <>
              Port từ <code className="text-xs">nhapKhauCapNhatThongTin</code>:{" "}
              <strong>catalogFast</strong> →{" "}
              <code className="text-xs">products</code>,{" "}
              <strong>stockQ7</strong> →{" "}
              <code className="text-xs">stock_on_hand</code>.
            </>
          )}
        </p>

        {!daily && (
        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="stockQ7" className="gap-1.5">
              <Warehouse className="w-3.5 h-3.5" />
              File tồn kho
            </TabsTrigger>
            <TabsTrigger value="catalogFast" className="gap-1.5">
              <Package className="w-3.5 h-3.5" />
              File nhập khẩu
            </TabsTrigger>
          </TabsList>
        </Tabs>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <Badge
                variant={step === s ? "default" : step > s ? "secondary" : "outline"}
                className={cn(
                  "rounded-md",
                  step > s && "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
                )}
              >
                {step > s ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : null}
                {s}. {STEP_LABELS[s]}
              </Badge>
              {s < 3 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {mode === "stockQ7" && !daily && !misa && (
            <div className="space-y-1.5 max-w-sm flex-1 min-w-[200px]">
              <Label>Kho ghi tồn (mặc định Q7 như TON_Q7)</Label>
              <Select
                value={warehouseId}
                onValueChange={setWarehouseId}
                disabled={loadingBase}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kho" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {warehouseLabel(w)} — {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadImportTemplate(
                mode === "stockQ7" ? "stockQ7" : "catalogFast",
              )
            }
          >
            <Download className="w-4 h-4 mr-2" />
            Tải file mẫu
          </Button>
        </div>

        {(step === 1 || !parsed) && (
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50",
              (parsing || loadingBase) && "opacity-60 pointer-events-none",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => onFiles(e.target.files)}
              disabled={parsing || loadingBase}
            />
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">
              {parsing
                ? "Đang đọc file…"
                : mode === "stockQ7"
                  ? "Kéo thả TỔNG HỢP TỒN KHO (.xlsx)"
                  : "Kéo thả file nhập khẩu danh mục"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "stockQ7"
                ? "Cột: Tên hàng hóa, Mã hàng hóa, Đơn vị tính, Cuối kỳ, Cửa hàng"
                : "Cột: Mã hàng, Mã vạch, Tên hàng, ĐVT, Parent_SKU (như Data_Excel)"}
            </p>
            {fileName && (
              <p className="text-xs text-primary mt-2 font-mono">{fileName}</p>
            )}
            {parsing && (
              <Loader2 className="w-5 h-5 animate-spin mx-auto mt-3 text-primary" />
            )}
          </div>
        )}

        {parseError && (
          <Alert variant="destructive">
            <AlertTitle>Lỗi đọc file</AlertTitle>
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {parsed && step >= 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{parsed.lines.length} dòng</Badge>
              <Badge variant="secondary">{parsed.validCount} hợp lệ</Badge>
              {existingProducts.length > 0 && (
                <Badge variant="outline">{existingProducts.length} mã đã có</Badge>
              )}
              {newProducts.length > 0 && (
                <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">
                  {newProducts.length} mã mới cần xác nhận
                </Badge>
              )}
              {mode === "stockQ7" && (
                <Badge className="bg-violet-100 text-violet-900 hover:bg-violet-100">
                  {misa
                    ? `${parsed.validCount} dòng ghi theo cửa hàng`
                    : `${parsed.withStockCount} có tồn → ${whLabel}`}
                </Badge>
              )}
              {misa &&
                Object.entries(parsed.warehouseCounts).map(([code, n]) => (
                  <Badge key={code} variant="outline">
                    {code}: {n}
                  </Badge>
                ))}
              {misa && parsed.skippedTotals > 0 && (
                <Badge variant="outline">Bỏ {parsed.skippedTotals} dòng tổng</Badge>
              )}
            </div>

            <div className="rounded-md border overflow-x-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>STT</TableHead>
                    <TableHead>Mã hàng</TableHead>
                    <TableHead>Mã vạch</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>ĐVT</TableHead>
                    {mode === "stockQ7" && (
                      <TableHead className="text-right">Cuối kỳ</TableHead>
                    )}
                    {misa && <TableHead>Cửa hàng</TableHead>}
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewLines.map((l) => (
                    <TableRow
                      key={`${l.rowIndex}-${l.maHang}`}
                      className={cn(l.errorNote && "bg-destructive/5")}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {l.rowIndex}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {l.maHang}
                        {l.willCreate && (
                          <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-sky-400 text-sky-800">
                            mới
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {l.maVach || (misa ? "—" : (
                          <span className="text-amber-700">thiếu</span>
                        ))}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {l.tenHang}
                      </TableCell>
                      <TableCell>{l.dvt || "—"}</TableCell>
                      {mode === "stockQ7" && (
                        <TableCell className="text-right tabular-nums">
                          {l.tonKho ?? "—"}
                        </TableCell>
                      )}
                      {misa && (
                        <TableCell className="text-xs whitespace-nowrap">
                          {l.warehouseCode || l.khoRaw || "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-destructive">
                        {l.errorNote || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setParsed(null);
                  setFileName("");
                  setStep(1);
                }}
              >
                Chọn file khác
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={parsed.validCount === 0}
              >
                Tiếp tục xác nhận
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {parsed && step === 3 && (
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <Alert>
              <AlertTitle>Xác nhận import</AlertTitle>
              <AlertDescription>
                {mode === "catalogFast" ? (
                  <>
                    UPSERT <strong>{parsed.validCount}</strong> dòng vào{" "}
                    <code>products</code>: tạo{" "}
                    <strong>{parsed.newProductCount}</strong> mã mới (gắn cờ{" "}
                    <em>is_new</em> + highlight soạn hàng), cập nhật tên/ĐVT/mã
                    vạch cho mã đã có (ô mã vạch trống → giữ MV cũ). File thiếu
                    cột Mã vạch sẽ hiện &quot;thiếu&quot; ở preview.
                  </>
                ) : misa ? (
                  <>
                    Ghi <strong>{parsed.validCount}</strong> dòng <em>Cuối kỳ</em>{" "}
                    vào đúng kho theo cột Cửa hàng. Dòng tổng và Tổng công ty đã
                    bỏ. Mã không có trong danh mục không được tạo mới.
                  </>
                ) : (
                  <>
                    Ghi <strong>{parsed.withStockCount}</strong> dòng tồn vào kho{" "}
                    <strong>{whLabel}</strong>. Mã chưa có được tạo mới; nếu file
                    có mã vạch sẽ cập nhật MV.
                  </>
                )}
              </AlertDescription>
            </Alert>
            {newProducts.length > 0 && (
              <div className="rounded-lg border bg-background p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Danh sách mã mới cần xác nhận</p>
                    <p className="text-xs text-muted-foreground">
                      Mặc định chưa chọn, an toàn cho hàng cũ. Tick chọn nếu đây là hàng mới thật sự.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                    Xem / chỉnh lựa chọn
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={commit.isPending}>
                Quay lại
              </Button>
              <Button onClick={() => void handleImport()} disabled={!canConfirm}>
                {commit.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang import…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Xác nhận Import
                  </>
                )}
              </Button>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Danh sách mã mới cần xác nhận</DialogTitle>
                  <DialogDescription>
                    Chọn các mã mới thật sự để gắn is_new = true. Các mã còn lại sẽ được import với is_new = false.
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">✓</TableHead>
                        <TableHead>Mã hàng</TableHead>
                        <TableHead>Tên hàng</TableHead>
                        <TableHead>ĐVT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newProducts.map((line) => {
                        const key = normalizeOrderCodeText(line.productSlug || line.maHang || "");
                        const checked = !!newProductSelection[key];
                        return (
                          <TableRow key={key || `${line.rowIndex}-${line.maHang}`}>
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleNewProduct(key, !!value)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{line.maHang}</TableCell>
                            <TableCell>{line.tenHang}</TableCell>
                            <TableCell>{line.dvt || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    onClick={() => {
                      setNewProductReviewDone(true);
                      setConfirmOpen(false);
                    }}
                  >
                    Xác nhận lựa chọn
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
