import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, GripVertical, ArrowUp, ArrowDown, Menu as MenuIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MenuItem } from "@/hooks/useMenuItems";

const AdminMenuItems = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    label: "",
    href: "",
    is_external: false,
    icon: "",
    parent_id: null as string | null,
    display_order: 0,
    is_active: true,
    target_blank: false,
  });

  // Fetch all menu items
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ["admin-menu-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as MenuItem[];
    },
  });

  // Build hierarchical structure for parent selection
  const rootItems = allItems.filter((item) => !item.parent_id && item.id !== editingItem?.id);

  const resetForm = () => {
    setFormData({
      label: "",
      href: "",
      is_external: false,
      icon: "",
      parent_id: null,
      display_order: allItems.length,
      is_active: true,
      target_blank: false,
    });
    setEditingItem(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: MenuItem) => {
    setFormData({
      label: item.label,
      href: item.href,
      is_external: item.is_external,
      icon: item.icon || "",
      parent_id: item.parent_id,
      display_order: item.display_order,
      is_active: item.is_active,
      target_blank: item.target_blank,
    });
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!formData.label.trim()) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Vui lòng nhập tên menu",
        });
        return;
      }

      if (!formData.href.trim()) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Vui lòng nhập đường dẫn",
        });
        return;
      }

      if (editingItem) {
        // Update
        const { error } = await supabase
          .from("menu_items")
          .update({
            label: formData.label,
            href: formData.href,
            is_external: formData.is_external,
            icon: formData.icon || null,
            parent_id: formData.parent_id || null,
            display_order: formData.display_order,
            is_active: formData.is_active,
            target_blank: formData.target_blank,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingItem.id);

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Đã cập nhật menu item",
        });
      } else {
        // Create
        const { error } = await supabase.from("menu_items").insert({
          label: formData.label,
          href: formData.href,
          is_external: formData.is_external,
          icon: formData.icon || null,
          parent_id: formData.parent_id || null,
          display_order: formData.display_order,
          is_active: formData.is_active,
          target_blank: formData.target_blank,
        });

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Đã tạo menu item",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Đã xảy ra lỗi",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    try {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", deletingItem.id);

      if (error) throw error;

      toast({
        title: "Đã xóa menu item",
        description: `Menu "${deletingItem.label}" đã được xóa`,
      });

      setDeletingItem(null);
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể xóa menu item",
      });
    }
  };

  const moveItem = async (item: MenuItem, direction: "up" | "down") => {
    const sortedItems = [...allItems].sort((a, b) => a.display_order - b.display_order);
    const currentIndex = sortedItems.findIndex((i) => i.id === item.id);

    if (currentIndex === -1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedItems.length) return;

    const targetItem = sortedItems[newIndex];
    const newOrder = targetItem.display_order;
    const oldOrder = item.display_order;

    try {
      // Swap orders
      await supabase
        .from("menu_items")
        .update({ display_order: newOrder })
        .eq("id", item.id);

      await supabase
        .from("menu_items")
        .update({ display_order: oldOrder })
        .eq("id", targetItem.id);

      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể di chuyển menu item",
      });
    }
  };

  const getParentLabel = (parentId: string | null) => {
    if (!parentId) return "Không có";
    const parent = allItems.find((item) => item.id === parentId);
    return parent?.label || "Không tìm thấy";
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý Menu" />
        <div className="p-6 space-y-4">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-96 bg-muted animate-pulse rounded" />
        </div>
      </AdminLayout>
    );
  }

  const sortedItems = [...allItems].sort((a, b) => a.display_order - b.display_order);

  return (
    <AdminLayout>
      <SEO title="Quản lý Menu" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MenuIcon className="w-8 h-8 text-primary" />
              Quản lý Menu Header
            </h1>
            <p className="text-muted-foreground mt-1">
              Quản lý các menu items hiển thị trên header
            </p>
          </div>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="w-4 h-4" />
            Thêm Menu Item
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách Menu Items ({sortedItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Chưa có menu item nào. Tạo menu item đầu tiên!
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Tên</TableHead>
                      <TableHead>Đường dẫn</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Menu cha</TableHead>
                      <TableHead>Thứ tự</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveItem(item, "up")}
                              disabled={index === 0}
                            >
                              <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveItem(item, "down")}
                              disabled={index === sortedItems.length - 1}
                            >
                              <ArrowDown className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.icon && <span className="mr-2">{item.icon}</span>}
                          {item.label}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {item.href}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.is_external ? "default" : "secondary"}>
                            {item.is_external ? "External" : "Internal"}
                          </Badge>
                          {item.target_blank && (
                            <Badge variant="outline" className="ml-2">
                              New Tab
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{getParentLabel(item.parent_id)}</TableCell>
                        <TableCell>{item.display_order}</TableCell>
                        <TableCell>
                          <Badge variant={item.is_active ? "default" : "secondary"}>
                            {item.is_active ? "Hiển thị" : "Ẩn"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(item)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingItem(item)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Chỉnh sửa Menu Item" : "Tạo Menu Item mới"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Cập nhật thông tin menu item"
                : "Tạo menu item mới cho header"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Tên menu *</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value })
                }
                placeholder="Ví dụ: Trang chủ, Sản phẩm..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="href">Đường dẫn *</Label>
              <Input
                id="href"
                value={formData.href}
                onChange={(e) =>
                  setFormData({ ...formData, href: e.target.value })
                }
                placeholder="/products hoặc https://example.com"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_external"
                  checked={formData.is_external}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_external: checked })
                  }
                />
                <Label htmlFor="is_external">Link ngoài</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="target_blank"
                  checked={formData.target_blank}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, target_blank: checked })
                  }
                />
                <Label htmlFor="target_blank">Mở tab mới</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="parent_id">Menu cha (tùy chọn)</Label>
                <Select
                  value={formData.parent_id || "__none__"}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      parent_id: value === "__none__" ? null : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Không có" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Không có</SelectItem>
                    {rootItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_order">Thứ tự hiển thị</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => {
                    const value = e.target.value;
                    const intValue = value === "" ? 0 : parseInt(value, 10);
                    setFormData({
                      ...formData,
                      display_order: isNaN(intValue) || !isFinite(intValue) ? 0 : intValue,
                    });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon">Icon (tùy chọn)</Label>
              <Input
                id="icon"
                value={formData.icon}
                onChange={(e) =>
                  setFormData({ ...formData, icon: e.target.value })
                }
                placeholder="Tên icon từ lucide-react (ví dụ: Home, Package)"
              />
              <p className="text-xs text-muted-foreground">
                Xem danh sách icons tại:{" "}
                <a
                  href="https://lucide.dev/icons/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  lucide.dev/icons
                </a>
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
              <Label htmlFor="is_active">Kích hoạt (hiển thị trên header)</Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <span className="flex items-center">
                  <Loader2 className={`w-4 h-4 mr-2 ${isSubmitting ? 'animate-spin inline' : 'hidden'}`} />
                  <span className={isSubmitting ? 'hidden' : 'inline'}>
                    {editingItem ? "Cập nhật" : "Tạo"}
                  </span>
                </span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa menu item "{deletingItem?.label}"? Hành động này không thể hoàn tác.
              {deletingItem?.children && deletingItem.children.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Cảnh báo: Menu này có {deletingItem.children.length} menu con sẽ bị xóa theo.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminMenuItems;

