import { useState, useEffect } from "react";
import { Download, Loader2, DollarSign, AlertTriangle, TrendingUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface AccountsPayableReport {
  supplier_id: string;
  supplier_name: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  overdue_amount: number;
  count: number;
}

interface AccountsReceivableReport {
  customer_name: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  overdue_amount: number;
  count: number;
}

interface AgingReport {
  range: string;
  payable_amount: number;
  receivable_amount: number;
}

const AdminAccountsReports = () => {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<"payable" | "receivable" | "aging">("payable");
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [payableData, setPayableData] = useState<AccountsPayableReport[]>([]);
  const [receivableData, setReceivableData] = useState<AccountsReceivableReport[]>([]);
  const [agingData, setAgingData] = useState<AgingReport[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchReportData();
  }, [reportType, startDate, endDate]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      if (reportType === "payable") {
        const { data, error } = await supabase
          .from("accounts_payable")
          .select(`
            *,
            supplier:suppliers(name)
          `)
          .gte("created_at", startDate)
          .lte("created_at", endDate + " 23:59:59");

        if (error) throw error;

        // Group by supplier
        const grouped: Record<string, AccountsPayableReport> = {};
        (data || []).forEach((item: any) => {
          const supplierId = item.supplier_id;
          const supplierName = item.supplier?.name || "Không xác định";
          const isOverdue = new Date(item.due_date) < new Date() && item.remaining_amount > 0;

          if (!grouped[supplierId]) {
            grouped[supplierId] = {
              supplier_id: supplierId,
              supplier_name: supplierName,
              total_amount: 0,
              paid_amount: 0,
              remaining_amount: 0,
              overdue_amount: 0,
              count: 0,
            };
          }

          grouped[supplierId].total_amount += item.original_amount;
          grouped[supplierId].paid_amount += item.paid_amount;
          grouped[supplierId].remaining_amount += item.remaining_amount;
          if (isOverdue) {
            grouped[supplierId].overdue_amount += item.remaining_amount;
          }
          grouped[supplierId].count += 1;
        });

        setPayableData(Object.values(grouped));
      } else if (reportType === "receivable") {
        const { data, error } = await supabase
          .from("accounts_receivable")
          .select("*")
          .gte("created_at", startDate)
          .lte("created_at", endDate + " 23:59:59");

        if (error) throw error;

        // Group by customer
        const grouped: Record<string, AccountsReceivableReport> = {};
        (data || []).forEach((item: any) => {
          const customerName = item.customer_name || "Không xác định";
          const isOverdue = new Date(item.due_date) < new Date() && item.remaining_amount > 0;

          if (!grouped[customerName]) {
            grouped[customerName] = {
              customer_name: customerName,
              total_amount: 0,
              paid_amount: 0,
              remaining_amount: 0,
              overdue_amount: 0,
              count: 0,
            };
          }

          grouped[customerName].total_amount += item.original_amount;
          grouped[customerName].paid_amount += item.paid_amount;
          grouped[customerName].remaining_amount += item.remaining_amount;
          if (isOverdue) {
            grouped[customerName].overdue_amount += item.remaining_amount;
          }
          grouped[customerName].count += 1;
        });

        setReceivableData(Object.values(grouped));
      } else if (reportType === "aging") {
        // Aging analysis
        const { data: payable, error: payableError } = await supabase
          .from("accounts_payable")
          .select("due_date, remaining_amount")
          .gt("remaining_amount", 0);

        const { data: receivable, error: receivableError } = await supabase
          .from("accounts_receivable")
          .select("due_date, remaining_amount")
          .gt("remaining_amount", 0);

        if (payableError || receivableError) throw payableError || receivableError;

        const today = new Date();
        const ranges = [
          { label: "0-30 ngày", days: 30 },
          { label: "31-60 ngày", days: 60 },
          { label: "61-90 ngày", days: 90 },
          { label: "Trên 90 ngày", days: Infinity },
        ];

        const aging: AgingReport[] = ranges.map((range) => {
          let payableAmount = 0;
          let receivableAmount = 0;

          (payable || []).forEach((item: any) => {
            const daysDiff = Math.floor((today.getTime() - new Date(item.due_date).getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff >= 0 && daysDiff <= range.days) {
              payableAmount += item.remaining_amount;
            }
          });

          (receivable || []).forEach((item: any) => {
            const daysDiff = Math.floor((today.getTime() - new Date(item.due_date).getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff >= 0 && daysDiff <= range.days) {
              receivableAmount += item.remaining_amount;
            }
          });

          return {
            range: range.label,
            payable_amount: payableAmount,
            receivable_amount: receivableAmount,
          };
        });

        setAgingData(aging);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching accounts report data:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải dữ liệu báo cáo",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const totalPayable = payableData.reduce((sum, item) => sum + item.remaining_amount, 0);
  const totalOverduePayable = payableData.reduce((sum, item) => sum + item.overdue_amount, 0);
  const totalReceivable = receivableData.reduce((sum, item) => sum + item.remaining_amount, 0);
  const totalOverdueReceivable = receivableData.reduce((sum, item) => sum + item.overdue_amount, 0);

  return (
    <AdminLayout>
      <SEO title="Báo cáo công nợ" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Báo cáo công nợ</h1>
            <p className="text-muted-foreground mt-1">
              Xem báo cáo công nợ phải trả và phải thu
            </p>
          </div>
        </div>

        {reportType === "payable" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tổng công nợ phải trả
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(totalPayable)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Công nợ quá hạn
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatPrice(totalOverduePayable)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Số nhà cung cấp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{payableData.length}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {reportType === "receivable" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tổng công nợ phải thu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(totalReceivable)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Công nợ quá hạn
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatPrice(totalOverdueReceivable)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Số khách hàng
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{receivableData.length}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Báo cáo</CardTitle>
              <div className="flex items-center gap-4">
                <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payable">Công nợ phải trả</SelectItem>
                    <SelectItem value="receivable">Công nợ phải thu</SelectItem>
                    <SelectItem value="aging">Phân tích tuổi nợ</SelectItem>
                  </SelectContent>
                </Select>
                {reportType !== "aging" && (
                  <div className="flex items-center gap-2">
                    <div>
                      <Label>Từ ngày</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                    <div>
                      <Label>Đến ngày</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {reportType === "payable" && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nhà cung cấp</TableHead>
                          <TableHead>Số công nợ</TableHead>
                          <TableHead>Tổng tiền</TableHead>
                          <TableHead>Đã trả</TableHead>
                          <TableHead>Còn nợ</TableHead>
                          <TableHead>Quá hạn</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payableData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              Không có dữ liệu
                            </TableCell>
                          </TableRow>
                        ) : (
                          payableData.map((item) => (
                            <TableRow key={item.supplier_id}>
                              <TableCell className="font-medium">{item.supplier_name}</TableCell>
                              <TableCell>{item.count}</TableCell>
                              <TableCell>{formatPrice(item.total_amount)}</TableCell>
                              <TableCell>{formatPrice(item.paid_amount)}</TableCell>
                              <TableCell className="font-medium">{formatPrice(item.remaining_amount)}</TableCell>
                              <TableCell>
                                {item.overdue_amount > 0 ? (
                                  <Badge variant="destructive">
                                    {formatPrice(item.overdue_amount)}
                                  </Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reportType === "receivable" && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Khách hàng</TableHead>
                          <TableHead>Số công nợ</TableHead>
                          <TableHead>Tổng tiền</TableHead>
                          <TableHead>Đã thu</TableHead>
                          <TableHead>Còn nợ</TableHead>
                          <TableHead>Quá hạn</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivableData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              Không có dữ liệu
                            </TableCell>
                          </TableRow>
                        ) : (
                          receivableData.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{item.customer_name}</TableCell>
                              <TableCell>{item.count}</TableCell>
                              <TableCell>{formatPrice(item.total_amount)}</TableCell>
                              <TableCell>{formatPrice(item.paid_amount)}</TableCell>
                              <TableCell className="font-medium">{formatPrice(item.remaining_amount)}</TableCell>
                              <TableCell>
                                {item.overdue_amount > 0 ? (
                                  <Badge variant="destructive">
                                    {formatPrice(item.overdue_amount)}
                                  </Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reportType === "aging" && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Độ tuổi nợ</TableHead>
                          <TableHead>Công nợ phải trả</TableHead>
                          <TableHead>Công nợ phải thu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agingData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.range}</TableCell>
                            <TableCell className="font-medium">{formatPrice(item.payable_amount)}</TableCell>
                            <TableCell className="font-medium">{formatPrice(item.receivable_amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminAccountsReports;

