import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Mail, Trash2, Eye, Loader2, CheckCircle2 } from "lucide-react";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
  updated_at: string;
}

const AdminContactMessages = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRead, setFilterRead] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<ContactMessage | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["admin-contact-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContactMessage[];
    },
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRead]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("contact_messages")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          read_by: user?.id || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contact-messages"] });
      toast.success("Đã đánh dấu đã đọc");
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể cập nhật", {
        description: errorMessage,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contact_messages")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contact-messages"] });
      toast.success("Đã xóa tin nhắn");
      setDeletingMessage(null);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể xóa tin nhắn", {
        description: errorMessage,
      });
    },
  });

  const handleViewMessage = (message: ContactMessage) => {
    setSelectedMessage(message);
    // Auto mark as read when viewing
    if (!message.is_read) {
      markAsReadMutation.mutate(message.id);
    }
  };

  const contactFilters: SearchFilter[] = [
    {
      key: "read",
      label: "Trạng thái",
      options: [
        { value: "all", label: "Tất cả" },
        { value: "unread", label: "Chưa đọc" },
        { value: "read", label: "Đã đọc" },
      ],
    },
  ];

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch =
      !searchTerm ||
      msg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.phone.includes(searchTerm) ||
      msg.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRead =
      filterRead === "all" ||
      (filterRead === "read" && msg.is_read) ||
      (filterRead === "unread" && !msg.is_read);
    return matchesSearch && matchesRead;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredMessages.length / itemsPerPage);
  const paginatedMessages = filteredMessages.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;
  const readCount = messages.filter((m) => m.is_read).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Liên hệ</h1>
            <p className="text-muted-foreground">
              {unreadCount} chưa đọc • {readCount} đã đọc
            </p>
          </div>
        </div>

        {/* Filters */}
        <AdminSearchBar
          placeholder="Tìm kiếm theo tên, email, số điện thoại, nội dung..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={contactFilters}
          activeFilters={{
            read: filterRead,
          }}
          onFilterChange={(key, value) => {
            if (key === "read") setFilterRead(value);
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Danh sách tin nhắn ({filteredMessages.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Đang tải...</p>
            ) : filteredMessages.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {searchTerm || filterRead !== "all"
                  ? "Không tìm thấy tin nhắn"
                  : "Chưa có tin nhắn nào"}
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Người gửi</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Số điện thoại</TableHead>
                      <TableHead>Nội dung</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày gửi</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMessages.map((message) => (
                      <TableRow key={message.id}>
                        <TableCell className="font-medium">{message.name}</TableCell>
                        <TableCell>{message.email}</TableCell>
                        <TableCell>{message.phone}</TableCell>
                        <TableCell>
                          <p className="line-clamp-2 max-w-xs">{message.message}</p>
                        </TableCell>
                        <TableCell>
                          {message.is_read ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Đã đọc
                            </Badge>
                          ) : (
                            <Badge className="bg-primary text-primary-foreground">
                              Chưa đọc
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(message.created_at), "dd/MM/yyyy HH:mm", {
                            locale: vi,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleViewMessage(message)}
                              aria-label={`Xem tin nhắn từ ${message.name}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingMessage(message)}
                              aria-label={`Xóa tin nhắn từ ${message.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <AdminPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredMessages.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* View Message Dialog */}
        <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chi tiết tin nhắn</DialogTitle>
              <DialogDescription>
                Gửi lúc{" "}
                {selectedMessage &&
                  format(new Date(selectedMessage.created_at), "dd/MM/yyyy HH:mm", {
                    locale: vi,
                  })}
              </DialogDescription>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tên</label>
                  <p className="mt-1">{selectedMessage.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="mt-1">{selectedMessage.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Số điện thoại
                  </label>
                  <p className="mt-1">{selectedMessage.phone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nội dung</label>
                  <p className="mt-1 whitespace-pre-wrap">{selectedMessage.message}</p>
                </div>
                {selectedMessage.is_read && selectedMessage.read_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Đã đọc lúc
                    </label>
                    <p className="mt-1">
                      {format(new Date(selectedMessage.read_at), "dd/MM/yyyy HH:mm", {
                        locale: vi,
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingMessage} onOpenChange={() => setDeletingMessage(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa tin nhắn?</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa tin nhắn từ "{deletingMessage?.name}"? Hành động này không
                thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deletingMessage) {
                    deleteMutation.mutate(deletingMessage.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Xóa"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminContactMessages;

