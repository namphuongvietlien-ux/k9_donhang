import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  ArrowRight,
  FolderOpen,
} from "lucide-react";
import { downloadImportTemplate } from "@/lib/importTemplates";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import { useImportCatalogAndStock } from "@/hooks/useOrderImport";
import type { DuplicatePreSaveResult } from "@/hooks/useOrderImport";
import { useCommitTransferImport } from "@/hooks/useTransferImport";
import {
  parseTransferImportMatrix,
  type ParsedTransferImport,
} from "@/lib/transferImport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

const PREVIEW_ROWS = 10;

interface TransferExcelImportProps {
  onSuccess?: () => void;
  className?: string;
  /** Ẩn Card bọc ngoài khi nhúng trong layout khác */
  embedded?: boolean;
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
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("File Excel không có sheet.");
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];
}

const STEP_LABELS: Record<Step, string> = {
  1: "Chọn file",
  2: "Xem trước",
  3: "Xác nhận Import",
};

export default function TransferExcelImport({
  onSuccess,
  className,
  embedded = false,
}: TransferExcelImportProps) {
  const { warehouses, loading: whLoading } = useWarehouses();
  const { data: catalogStock, isLoading: catalogLoading } =
    useImportCatalogAndStock();
  const commit = useCommitTransferImport();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [sourceWh, setSourceWh] = useState("");
  const [destWh, setDestWh] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedTransferImport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{
    percent: number;
    message: string;
  } | null>(null);
  const [showAllPreview, setShowAllPreview] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupInfo, setDupInfo] = useState<DuplicatePreSaveResult | null>(null);

  useEffect(() => {
    if (!warehouses.length) return;
    const q7 = warehouses.find((w) => w.code === "Q7");
    if (!sourceWh) setSourceWh(q7?.id || warehouses[0].id);
    if (!destWh) {
      setDestWh(
        warehouses.find((w) => w.code !== "Q7")?.id || warehouses[0].id,
      );
    }
  }, [warehouses, sourceWh, destWh]);

  const whRefs = useMemo(
    () => warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    [warehouses],
  );

  const runParse = useCallback(
    async (file: File) => {
      setParsing(true);
      setParseError(null);
      setParsed(null);
      setProgress(null);
      setShowAllPreview(false);
      setFileName(file.name);
      try {
        if (!catalogStock) {
          throw new Error("Đang tải danh mục sản phẩm, thử lại sau vài giây.");
        }
        const matrix = await fileToMatrix(file);
        const result = parseTransferImportMatrix(matrix, {
          catalog: catalogStock.catalog,
          warehouses: whRefs,
          defaultSourceWarehouseId: sourceWh || null,
          defaultDestWarehouseId: destWh || null,
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
    [catalogStock, whRefs, sourceWh, destWh],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void runParse(file);
  };

  const errorLineCount = useMemo(
    () => parsed?.lines.filter((l) => l.errorNote).length ?? 0,
    [parsed],
  );

  const uniqueSkuCount = useMemo(() => {
    if (!parsed) return 0;
    return new Set(
      parsed.vouchers.flatMap((v) => v.lines.map((l) => l.maHang)),
    ).size;
  }, [parsed]);

  const previewLines = useMemo(() => {
    if (!parsed) return [];
    if (showAllPreview) return parsed.lines.slice(0, 100);
    return parsed.lines.slice(0, PREVIEW_ROWS);
  }, [parsed, showAllPreview]);

  const canConfirm = !!parsed && parsed.vouchers.length > 0 && !commit.isPending;

  const runImport = async (acknowledgeDuplicate: boolean) => {
    if (!parsed) return;
    setProgress({ percent: 2, message: "Bắt đầu import…" });
    try {
      const res = await commit.mutateAsync({
        parsed,
        acknowledgeDuplicate,
        onProgress: (p) =>
          setProgress({ percent: p.percent, message: p.message }),
      });
      toast({
        title: "Import thành công",
        description: `Tạo thành công lệnh điều chuyển với ${res.uniqueSkuCount} mã hàng (${res.vouchersCreated} phiếu, ${res.itemsCreated} dòng${res.loiMaCount ? `, ${res.loiMaCount} dòng cảnh báo` : ""}).`,
      });
      setParsed(null);
      setFileName("");
      setProgress(null);
      setDupOpen(false);
      setDupInfo(null);
      setStep(1);
      onSuccess?.();
    } catch (e) {
      const dup = (e as Error & { duplicate?: DuplicatePreSaveResult })
        ?.duplicate;
      if (dup?.isDuplicate && !acknowledgeDuplicate) {
        setDupInfo(dup);
        setDupOpen(true);
        setProgress(null);
        return;
      }
      toast({
        title: "Import thất bại",
        description: e instanceof Error ? e.message.replace(/^DUP:[^:]+:/, "") : "Lỗi không xác định",
        variant: "destructive",
      });
      setProgress(null);
    }
  };

  const handleImport = async () => {
    await runImport(false);
  };

  const loadingBase = whLoading || catalogLoading;
  const resetFile = () => {
    setParsed(null);
    setFileName("");
    setParseError(null);
    setProgress(null);
    setDupOpen(false);
    setDupInfo(null);
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const body = (
    <div className={cn("space-y-4", className)}>
      {!embedded && (
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
              {s < 3 && (
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadImportTemplate("transferDc")}
        >
          <Download className="w-4 h-4 mr-2" />
          Tải mẫu điều chuyển
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kho xuất mặc định (nếu file thiếu cột)</Label>
          <Select
            value={sourceWh}
            onValueChange={setSourceWh}
            disabled={loadingBase || commit.isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn kho xuất" />
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
        <div className="space-y-1.5">
          <Label>Kho nhận mặc định (nếu file thiếu cột)</Label>
          <Select
            value={destWh}
            onValueChange={setDestWh}
            disabled={loadingBase || commit.isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn kho nhận" />
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
      </div>

      {/* Step 1 — Dropzone + Chọn file */}
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
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            id="transfer-excel-input"
            onChange={(e) => onFiles(e.target.files)}
            disabled={parsing || loadingBase}
          />
          <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">
            {parsing ? "Đang đọc file…" : "Kéo thả file Excel/CSV vào đây"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Cột hỗ trợ: Mã hàng, Mã vạch, Tên hàng, ĐVT, SL xuất, Kho
            xuất/nhận, Mã lệnh.
            xuất/nhận, Ghi chú, Mã lệnh
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing || loadingBase}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Chọn file
            </Button>
          </div>
          {fileName && (
            <p className="text-xs text-primary mt-3 font-mono">{fileName}</p>
          )}
          {parsing && (
            <div className="mt-4 max-w-sm mx-auto space-y-2">
              <Progress value={35} className="h-2" />
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Đang phân tích sheet đầu tiên…
              </p>
            </div>
          )}
        </div>
      )}

      {parseError && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi đọc file</AlertTitle>
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Step 2 — Preview */}
      {parsed && step >= 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{parsed.lines.length} dòng</Badge>
            <Badge variant="secondary">{uniqueSkuCount} mã SKU</Badge>
            <Badge variant="secondary">{parsed.vouchers.length} phiếu</Badge>
              {parsed.loiMaCount > 0 && (
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                  {parsed.loiMaCount} cảnh báo mã (vẫn import)
                </Badge>
              )}
              {errorLineCount > 0 && (
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                  {errorLineCount} dòng cảnh báo
                </Badge>
              )}
            <span className="text-muted-foreground text-xs self-center">
              File: {fileName}
            </span>
          </div>

          {parsed.vouchers.length === 0 && (
            <Alert variant="destructive">
              <AlertTitle>Không gom được phiếu</AlertTitle>
              <AlertDescription>
                Kiểm tra cột Kho xuất / Kho nhận / Ghi chú (hoặc chọn kho mặc
                định) và số lượng.
              </AlertDescription>
            </Alert>
          )}

          {parsed.vouchers.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phiếu / Lệnh</TableHead>
                    <TableHead>Kho xuất</TableHead>
                    <TableHead>Kho nhận</TableHead>
                    <TableHead className="text-right">Dòng</TableHead>
                    <TableHead className="text-right">Tổng SL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.vouchers.map((v) => (
                    <TableRow key={v.key}>
                      <TableCell className="font-mono text-sm">
                        {v.maLenh || "(tự sinh DC-)"}
                      </TableCell>
                      <TableCell>{v.sourceLabel}</TableCell>
                      <TableCell>{v.destLabel}</TableCell>
                      <TableCell className="text-right">
                        {v.lines.length}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.totalQty}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">
              Xem trước {previewLines.length}/{parsed.lines.length} dòng đầu
            </p>
            <div className="rounded-md border overflow-x-auto max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Mã hàng</TableHead>
                    <TableHead>Tên hàng</TableHead>
                    <TableHead>ĐVT</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead>Xuất → Nhận</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewLines.map((l) => (
                    <TableRow
                      key={`${l.rowIndex}-${l.maHang}`}
                      className={cn(
                        (l.hasSoftError || l.errorNote) && "bg-amber-50",
                      )}
                    >
                      <TableCell className="text-muted-foreground text-xs">
                        {l.rowIndex}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {l.maHang}
                        {l.isLoiMa && (
                          <Badge
                            className="ml-1 text-[10px] px-1 py-0 bg-amber-100 text-amber-900 hover:bg-amber-100"
                          >
                            cảnh báo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {l.tenHang}
                      </TableCell>
                      <TableCell className="text-sm">{l.dvt || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.quantity}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {l.khoXuatRaw || "—"} → {l.khoNhanRaw || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-amber-800 max-w-[140px] truncate">
                        {l.lineNotes || l.errorNote || l.ghiChuRaw || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.lines.length > PREVIEW_ROWS && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0 mt-1"
                onClick={() => setShowAllPreview((v) => !v)}
              >
                {showAllPreview
                  ? "Thu gọn (10 dòng)"
                  : `Xem thêm (tối đa 100/${parsed.lines.length})`}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetFile}>
              Chọn file khác
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={parsed.vouchers.length === 0}
            >
              Tiếp tục xác nhận
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Confirm + Progress */}
      {parsed && step === 3 && (
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <Alert>
            <AlertTitle>Xác nhận import điều chuyển</AlertTitle>
            <AlertDescription>
              Tạo <strong>{parsed.vouchers.length}</strong> phiếu (
              <strong>{uniqueSkuCount}</strong> mã).{" "}
              {parsed.loiMaCount > 0 ? (
                <>
                  <strong>{parsed.loiMaCount}</strong> dòng có cảnh báo mã/SL/ĐVT
                  (soft — vẫn lưu, gắn has_error).{" "}
                </>
              ) : null}
              Không chặn kho xuất = nhận. Check trùng ≤5 phút trước khi ghi.
            </AlertDescription>
          </Alert>

          {progress && (
            <div className="space-y-2">
              <Progress value={progress.percent} className="h-2.5" />
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                {progress.message} ({progress.percent}%)
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              disabled={commit.isPending}
            >
              Quay lại xem trước
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
        </div>
      )}
    </div>
  );

  const dupDialog = (
    <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Phát hiện đơn trùng lặp</AlertDialogTitle>
          <AlertDialogDescription>
            Phát hiện đơn trùng lặp cách đây {dupInfo?.minutesAgo ?? "?"} phút
            {dupInfo?.peerOrderCode
              ? ` (phiếu ${dupInfo.peerOrderCode})`
              : ""}
            {dupInfo?.reason ? ` — Lý do: ${dupInfo.reason}` : ""}. Bạn có muốn
            tiếp tục lưu?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDupInfo(null)}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void runImport(true);
            }}
          >
            Chấp nhận lưu
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (embedded) {
    return (
      <>
        {body}
        {dupDialog}
      </>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          Import Excel / CSV điều chuyển
        </CardTitle>
      </CardHeader>
      <CardContent>
        {body}
        {dupDialog}
      </CardContent>
    </Card>
  );
}
