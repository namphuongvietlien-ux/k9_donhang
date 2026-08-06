import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { downloadImportTemplate } from "@/lib/importTemplates";
import { useWarehouses } from "@/hooks/useWarehouses";
import {
  checkDuplicateBeforeSave,
  useCommitOrderImport,
  useImportCatalogAndStock,
} from "@/hooks/useOrderImport";
import {
  parseOrderImportMatrix,
  type ParsedImportFile,
  type PhieuLoai,
} from "@/lib/importOrders";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DataImportProps {
  onSuccess?: () => void;
  className?: string;
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
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

export default function DataImport({ onSuccess, className }: DataImportProps) {
  const { warehouses, loading: whLoading } = useWarehouses();
  const { data: catalogStock, isLoading: baseLoading } = useImportCatalogAndStock();
  const commit = useCommitOrderImport();
  const { toast } = useToast();

  const [loaiPhieu, setLoaiPhieu] = useState<PhieuLoai>("DonHang");
  const [sourceWh, setSourceWh] = useState<string>("");
  const [destWh, setDestWh] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dupInfo, setDupInfo] = useState<{
    isDuplicate: boolean;
    peerOrderCode: string | null;
    reason: string | null;
    minutesAgo: number | null;
  } | null>(null);
  const [dupOpen, setDupOpen] = useState(false);

  useEffect(() => {
    if (!warehouses.length) return;
    const q7 = warehouses.find((w) => w.code === "Q7");
    if (loaiPhieu === "DonHang" && q7) {
      setSourceWh(q7.id);
    } else if (!sourceWh) {
      setSourceWh(q7?.id || catalogStock?.warehouseId || warehouses[0].id);
    }
    if (!destWh) {
      setDestWh(
        warehouses.find((w) => w.code !== "Q7")?.id || warehouses[0].id,
      );
    }
  }, [warehouses, loaiPhieu, catalogStock?.warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shortageCount = useMemo(
    () => parsed?.lines.filter((l) => l.stockLabel === "THIẾU").length ?? 0,
    [parsed],
  );
  const errorLineCount = useMemo(
    () =>
      parsed?.lines.filter((l) => l.hasSoftError || l.errorNote || l.lineNotes)
        .length ?? 0,
    [parsed],
  );

  const runParse = useCallback(
    async (file: File) => {
      setParsing(true);
      setParseError(null);
      setParsed(null);
      setDupInfo(null);
      setDupOpen(false);
      setFileName(file.name);
      try {
        if (!catalogStock)
          throw new Error("Đang tải danh mục / tồn kho, thử lại sau vài giây.");
        const matrix = await fileToMatrix(file);
        const result = parseOrderImportMatrix(
          matrix,
          catalogStock.catalog,
          catalogStock.bySlug,
        );
        setParsed(result);

        if (destWh) {
          const dup = await checkDuplicateBeforeSave(
            destWh,
            result.totalQty,
            result.skuSignature,
          );
          setDupInfo({
            isDuplicate: dup.isDuplicate,
            peerOrderCode: dup.peerOrderCode,
            reason: dup.reason,
            minutesAgo: dup.minutesAgo,
          });
        }
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Không đọc được file.");
      } finally {
        setParsing(false);
      }
    },
    [catalogStock, destWh],
  );

  // Re-check duplicate when dest warehouse changes after parse
  useEffect(() => {
    if (!parsed || !destWh) return;
    let cancelled = false;
    checkDuplicateBeforeSave(destWh, parsed.totalQty, parsed.skuSignature).then(
      (dup) => {
        if (!cancelled) {
          setDupInfo({
            isDuplicate: dup.isDuplicate,
            peerOrderCode: dup.peerOrderCode,
            reason: dup.reason,
            minutesAgo: dup.minutesAgo,
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [destWh, parsed]);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void runParse(file);
  };

  const canImport =
    !!parsed &&
    parsed.lines.length > 0 &&
    !!destWh &&
    !commit.isPending;

  const doImport = async (acknowledgeDuplicate: boolean) => {
    if (!parsed || !destWh) return;
    try {
      const res = await commit.mutateAsync({
        loaiPhieu,
        warehouseId: destWh,
        sourceWarehouseId: sourceWh || catalogStock?.warehouseId || null,
        lines: parsed.lines,
        acknowledgeDuplicate,
        totalQty: parsed.totalQty,
        skuSignature: parsed.skuSignature,
      });
      toast({
        title: "Import thành công",
        description: `Đã tạo ${res.orderCode} với ${res.itemCount} dòng.`,
      });
      setParsed(null);
      setFileName("");
      setDupInfo(null);
      setDupOpen(false);
      onSuccess?.();
    } catch (e) {
      const dup = (e as Error & { duplicate?: { isDuplicate: boolean } })
        ?.duplicate;
      if (dup?.isDuplicate && !acknowledgeDuplicate) {
        setDupOpen(true);
        return;
      }
      toast({
        title: "Import thất bại",
        description: e instanceof Error ? e.message : "Lỗi không xác định",
        variant: "destructive",
      });
    }
  };

  const handleImport = async () => {
    if (dupInfo?.isDuplicate) {
      setDupOpen(true);
      return;
    }
    await doImport(false);
  };

  const loadingBase = whLoading || baseLoading;
  const sourceLocked = loaiPhieu === "DonHang";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadImportTemplate("orderDhDc")}
        >
          <Download className="w-4 h-4 mr-2" />
          Tải mẫu Excel phiếu
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Loại phiếu</Label>
          <Select value={loaiPhieu} onValueChange={(v) => setLoaiPhieu(v as PhieuLoai)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DonHang">Đơn hàng (DH-)</SelectItem>
              <SelectItem value="DieuChuyen">Điều chuyển (DC-)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Kho xuất (soạn)</Label>
          <Select
            value={sourceWh}
            onValueChange={setSourceWh}
            disabled={loadingBase || sourceLocked}
          >
            <SelectTrigger>
              <SelectValue placeholder="Q7" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Kho nhận</Label>
          <Select value={destWh} onValueChange={setDestWh} disabled={loadingBase}>
            <SelectTrigger>
              <SelectValue placeholder="Chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        className={cn(
          "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
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
        <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Kéo thả file CSV / Excel vào đây</p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Mỗi file = 1 đơn · map cột theo thuật toán GAS (Mã hàng, SL, ĐVT…)
        </p>
        <div className="mt-3">
          <input
            id="data-import-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button type="button" variant="outline" asChild>
            <label htmlFor="data-import-file" className="cursor-pointer inline-flex items-center">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Chọn file
            </label>
          </Button>
        </div>
        {fileName && (
          <p className="text-xs text-muted-foreground mt-3 font-mono">{fileName}</p>
        )}
      </div>

      {(parsing || loadingBase) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {parsing ? "Đang đọc & map cột…" : "Đang tải danh mục / tồn Q7…"}
        </div>
      )}

      {parseError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lỗi file</AlertTitle>
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {dupInfo?.isDuplicate && (
        <Alert className="border-amber-500 bg-amber-50 text-amber-950 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cảnh báo đơn trùng (≤5 phút)</AlertTitle>
          <AlertDescription>
            Nghi trùng với{" "}
            <span className="font-mono font-medium">
              {dupInfo.peerOrderCode || "đơn gần đây"}
            </span>
            {dupInfo.minutesAgo != null
              ? ` — cách đây ${dupInfo.minutesAgo} phút`
              : ""}
            {dupInfo.reason ? ` — Lý do: ${dupInfo.reason}` : ""}. Sẽ hỏi xác
            nhận khi bấm Import.
          </AlertDescription>
        </Alert>
      )}

      {parsed && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{parsed.lines.length} dòng</Badge>
            <Badge variant="secondary">Tổng SL {parsed.totalQty}</Badge>
            {shortageCount > 0 && (
              <Badge variant="destructive">THIẾU tồn Q7: {shortageCount} SKU</Badge>
            )}
            {errorLineCount > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-800">
                {errorLineCount} dòng có cảnh báo mã/ĐVT
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Bỏ junk {parsed.skippedJunk} · trống {parsed.skippedEmpty}
            </span>
          </div>

          <div className="rounded-md border max-h-[360px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Mã hàng</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>ĐVT</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">Tồn Q7</TableHead>
                  <TableHead>Cảnh báo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.lines.map((l) => (
                  <TableRow
                    key={`${l.rowIndex}-${l.maHang}`}
                    className={cn(
                      l.stockLabel === "THIẾU" && "bg-red-50",
                      l.errorNote && "bg-amber-50/60",
                    )}
                  >
                    <TableCell className="text-xs text-muted-foreground">{l.rowIndex}</TableCell>
                    <TableCell className="font-mono text-xs">{l.maHang || l.maVach}</TableCell>
                    <TableCell className="text-sm">{l.tenHang}</TableCell>
                    <TableCell className="text-xs">{l.dvt || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.stockQty === null ? "—" : l.stockQty}
                    </TableCell>
                    <TableCell>
                      {l.stockLabel === "THIẾU" ? (
                        <Badge variant="destructive">THIẾU</Badge>
                      ) : l.stockLabel === "Chưa có TON" ? (
                        <Badge variant="outline">Chưa có TON</Badge>
                      ) : l.errorNote ? (
                        <Badge variant="outline" className="border-amber-400">
                          {l.errorNote}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-200">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3">
            {errorLineCount > 0 && (
              <Alert className="border-amber-400 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertTitle>Cảnh báo mềm (không chặn import)</AlertTitle>
                <AlertDescription>
                  {errorLineCount} dòng có Lỗi SL / Lỗi ĐVT / Mã không tồn tại —
                  vẫn lưu với has_error = true.
                </AlertDescription>
              </Alert>
            )}
            <Button
              onClick={() => void handleImport()}
              disabled={!canImport}
              className="w-full sm:w-auto"
            >
              {commit.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Import vào hệ thống
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Phát hiện đơn trùng lặp</AlertDialogTitle>
            <AlertDialogDescription>
              Phát hiện đơn trùng lặp cách đây {dupInfo?.minutesAgo ?? "?"} phút
              {dupInfo?.peerOrderCode
                ? ` (phiếu ${dupInfo.peerOrderCode})`
                : ""}
              {dupInfo?.reason ? ` — Lý do: ${dupInfo.reason}` : ""}. Bạn có
              muốn tiếp tục lưu?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doImport(true);
              }}
            >
              Chấp nhận lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
