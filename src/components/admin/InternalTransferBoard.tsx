import { AlertTriangle, ArrowRightLeft, Loader2, RefreshCw } from "lucide-react";
import { useInternalTransfers } from "@/hooks/useInternalTransfers";
import {
  TRANSFER_STATUS_BADGE,
  TRANSFER_STATUS_LABELS,
} from "@/lib/internalTransfers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface InternalTransferBoardProps {
  className?: string;
  compact?: boolean;
}

export default function InternalTransferBoard({
  className,
  compact = false,
}: InternalTransferBoardProps) {
  const { data: rows, isLoading, isFetching, refetch, error } =
    useInternalTransfers();

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Bảng theo dõi điều chuyển</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-2 hidden sm:inline">Làm mới</span>
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive mb-4">
            {(error as Error).message || "Không tải được lệnh điều chuyển"}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Đang tải...
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            Chưa có lệnh điều chuyển nội bộ.
            <br />
            <span className="text-xs">
              Phiếu cần có cả kho xuất và kho nhận (
              <code>source_warehouse_id</code> → <code>warehouse_id</code>).
            </span>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center whitespace-nowrap">
                    STT
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Mã lệnh</TableHead>
                  <TableHead className="whitespace-nowrap">Kho xuất</TableHead>
                  <TableHead className="whitespace-nowrap">Kho nhận</TableHead>
                  <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
                  {!compact && (
                    <TableHead className="text-right whitespace-nowrap">
                      SL xuất
                    </TableHead>
                  )}
                  <TableHead className="whitespace-nowrap">Cảnh báo</TableHead>
                  {!compact && (
                    <TableHead className="whitespace-nowrap">Ngày tạo</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow
                    key={row.id}
                    className={cn(row.hasMismatch && "bg-destructive/5")}
                  >
                    <TableCell className="text-center text-muted-foreground tabular-nums">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium font-mono text-sm">
                      {row.code}
                    </TableCell>
                    <TableCell>{row.fromWarehouse}</TableCell>
                    <TableCell>{row.toWarehouse}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-normal",
                          TRANSFER_STATUS_BADGE[row.status],
                        )}
                      >
                        {TRANSFER_STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                    {!compact && (
                      <TableCell className="text-right tabular-nums">
                        {row.qtyShipped}
                        {row.qtyReceived != null && (
                          <span className="text-muted-foreground text-xs block">
                            nhận: {row.qtyReceived}
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {row.hasMismatch ? (
                        <span className="inline-flex items-center gap-1.5 text-destructive text-sm font-medium">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          SL thực nhận ≠ SL xuất
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    {!compact && (
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", {
                          locale: vi,
                        })}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
