import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Mail, Search, Download, Trash2, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface NewsletterSubscription {
  id: string;
  email: string;
  is_active: boolean;
  subscribed_at: string;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}

const ITEMS_PER_PAGE = 20;

const AdminNewsletter = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subscriptionToDelete, setSubscriptionToDelete] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["newsletter-subscriptions", page, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("newsletter_subscriptions")
        .select("*", { count: "exact" })
        .order("subscribed_at", { ascending: false });

      if (searchTerm) {
        query = query.ilike("email", `%${searchTerm}%`);
      }

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: subscriptions, error: queryError, count } = await query
        .range(from, to);

      if (queryError) throw queryError;

      return {
        subscriptions: subscriptions as NewsletterSubscription[],
        total: count || 0,
      };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("newsletter_subscriptions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletter-subscriptions"] });
      toast({
        title: "Thành công",
        description: "Đã xóa đăng ký nhận tin",
      });
      setDeleteDialogOpen(false);
      setSubscriptionToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: "Không thể xóa: " + error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("newsletter_subscriptions")
        .update({
          is_active: !isActive,
          unsubscribed_at: !isActive ? null : new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletter-subscriptions"] });
      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái đăng ký",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật: " + error.message,
        variant: "destructive",
      });
    },
  });

  const exportCSVMutation = useMutation({
    mutationFn: async () => {
      const { data: allSubscriptions, error } = await supabase
        .from("newsletter_subscriptions")
        .select("*")
        .order("subscribed_at", { ascending: false });

      if (error) throw error;

      // Convert to CSV
      const headers = ["Email", "Trạng thái", "Ngày đăng ký", "Ngày hủy đăng ký"];
      const rows = (allSubscriptions || []).map((sub) => [
        sub.email,
        sub.is_active ? "Đang đăng ký" : "Đã hủy",
        format(new Date(sub.subscribed_at), "dd/MM/yyyy HH:mm", { locale: vi }),
        sub.unsubscribed_at
          ? format(new Date(sub.unsubscribed_at), "dd/MM/yyyy HH:mm", { locale: vi })
          : "",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

      // Download CSV
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `newsletter-subscriptions-${format(new Date(), "yyyy-MM-dd")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "Đã xuất file CSV",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: "Không thể xuất file: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    setSubscriptionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (subscriptionToDelete) {
      deleteMutation.mutate(subscriptionToDelete);
    }
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    toggleActiveMutation.mutate({ id, isActive });
  };

  const totalPages = data ? Math.ceil(data.total / ITEMS_PER_PAGE) : 0;
  const activeCount = data?.subscriptions.filter((s) => s.is_active).length || 0;
  const inactiveCount = data ? data.subscriptions.length - activeCount : 0;

  return (
    <AdminLayout>
      <SEO title="Quản lý Đăng ký nhận tin | Admin" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Đăng ký nhận tin</h1>
            <p className="text-muted-foreground">Quản lý danh sách đăng ký newsletter</p>
          </div>
          <Button
            onClick={() => exportCSVMutation.mutate()}
            disabled={exportCSVMutation.isPending}
            variant="outline"
          >
            <span className="inline-flex items-center mr-2">
              {exportCSVMutation.isPending ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </span>
            Xuất CSV
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tổng đăng ký</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Đang đăng ký</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Đã hủy</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{inactiveCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Tìm kiếm theo email..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách đăng ký</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                Lỗi khi tải dữ liệu. Vui lòng thử lại.
              </div>
            ) : !data || data.subscriptions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Không có đăng ký nào
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Ngày đăng ký</TableHead>
                        <TableHead>Ngày hủy</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.subscriptions.map((subscription) => (
                        <TableRow key={subscription.id}>
                          <TableCell className="font-medium">
                            {subscription.email}
                          </TableCell>
                          <TableCell>
                            {subscription.is_active ? (
                              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                Đang đăng ký
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                                Đã hủy
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {format(new Date(subscription.subscribed_at), "dd/MM/yyyy HH:mm", {
                              locale: vi,
                            })}
                          </TableCell>
                          <TableCell>
                            {subscription.unsubscribed_at
                              ? format(new Date(subscription.unsubscribed_at), "dd/MM/yyyy HH:mm", {
                                  locale: vi,
                                })
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleToggleActive(subscription.id, subscription.is_active)
                                }
                                disabled={toggleActiveMutation.isPending}
                              >
                                {subscription.is_active ? (
                                  <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Hủy đăng ký
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Kích hoạt lại
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(subscription.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <AdminPagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa đăng ký này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminNewsletter;

