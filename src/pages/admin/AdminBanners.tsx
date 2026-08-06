import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Image, ArrowUp, ArrowDown, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  button_text: string | null;
  button_link: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

interface BannerFormData {
  title: string;
  subtitle: string;
  image_url: string;
  button_text: string;
  button_link: string;
  is_active: boolean;
}

const MAX_BANNERS = 5;

const AdminBanners = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
const [formData, setFormData] = useState<BannerFormData>({
    title: "",
    subtitle: "",
    image_url: "",
    button_text: "",
    button_link: "",
    is_active: true,
  });
  const [deletingBanner, setDeletingBanner] = useState<Banner | null>(null);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Banner[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: BannerFormData) => {
      const maxOrder = banners.length > 0 
        ? Math.max(...banners.map(b => b.display_order)) 
        : -1;
      
      const { error } = await supabase.from("banners").insert({
        title: data.title,
        subtitle: data.subtitle || null,
        image_url: data.image_url,
        button_text: data.button_text || null,
        button_link: data.button_link || null,
        is_active: data.is_active,
        display_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Đã thêm banner mới");
      handleCloseDialog();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể thêm banner", {
        description: errorMessage,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BannerFormData }) => {
      const { error } = await supabase
        .from("banners")
        .update({
          title: data.title,
          subtitle: data.subtitle || null,
          image_url: data.image_url,
          button_text: data.button_text || null,
          button_link: data.button_link || null,
          is_active: data.is_active,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Đã cập nhật banner");
      handleCloseDialog();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể cập nhật banner", {
        description: errorMessage,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Đã xóa banner");
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể xóa banner", {
        description: errorMessage,
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, newOrder }: { id: string; newOrder: number }) => {
      const { error } = await supabase
        .from("banners")
        .update({ display_order: newOrder })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBanner(null);
    setImagePreview(null);
    setFormData({
      title: "",
      subtitle: "",
      image_url: "",
      button_text: "",
      button_link: "",
      is_active: true,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      subtitle: banner.subtitle || "",
      image_url: banner.image_url,
      button_text: banner.button_text || "",
      button_link: banner.button_link || "",
      is_active: banner.is_active,
    });
    setImagePreview(banner.image_url);
    setIsDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Kích thước file tối đa là 5MB");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `banner-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      setFormData({ ...formData, image_url: publicUrl });
      setImagePreview(publicUrl);
      toast.success("Đã tải lên hình ảnh");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Không thể tải lên hình ảnh";
      toast.error("Không thể tải lên: " + errorMessage);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = () => {
    setFormData({ ...formData, image_url: "" });
    setImagePreview(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.image_url) {
      toast.error("Vui lòng tải lên hình ảnh banner");
      return;
    }
    if (editingBanner) {
      updateMutation.mutate({ id: editingBanner.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const current = banners[index];
    const prev = banners[index - 1];
    reorderMutation.mutate({ id: current.id, newOrder: prev.display_order });
    reorderMutation.mutate({ id: prev.id, newOrder: current.display_order });
  };

  const handleMoveDown = (index: number) => {
    if (index === banners.length - 1) return;
    const current = banners[index];
    const next = banners[index + 1];
    reorderMutation.mutate({ id: current.id, newOrder: next.display_order });
    reorderMutation.mutate({ id: next.id, newOrder: current.display_order });
  };

  const canAddMore = banners.length < MAX_BANNERS;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Slide/Banner</h1>
            <p className="text-muted-foreground">
              Tối đa {MAX_BANNERS} slide • Tự động chuyển mỗi 5 giây
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) handleCloseDialog();
            else setIsDialogOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button disabled={!canAddMore} onClick={() => setEditingBanner(null)}>
                <Plus className="w-4 h-4 mr-2" />
                Thêm Banner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingBanner ? "Chỉnh sửa Banner" : "Thêm Banner mới"}
                </DialogTitle>
                <DialogDescription>
                  {editingBanner ? "Cập nhật thông tin banner" : "Thêm banner mới để hiển thị trên trang chủ"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Image Upload */}
                <div className="space-y-2">
                  <Label>Hình ảnh Banner *</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  
                  {imagePreview ? (
                    <div className="relative">
                      <div className="border rounded-lg overflow-hidden aspect-[16/9]">
                        <img
                          src={imagePreview}
                          alt="Banner preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholder.svg";
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={handleRemoveImage}
                        aria-label="Xóa hình ảnh"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-2 right-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        Thay đổi
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed rounded-lg aspect-[16/9] flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
                    >
                      {uploading ? (
                        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Image className="w-10 h-10 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Click để tải lên hình ảnh banner
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            PNG, JPG, WEBP • Tối đa 5MB • Tỉ lệ 16:9 đề xuất
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Tiêu đề *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subtitle">Phụ đề</Label>
                  <Input
                    id="subtitle"
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="button_text">Nút bấm (text)</Label>
                    <Input
                      id="button_text"
                      value={formData.button_text}
                      onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
                      placeholder="Xem thêm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="button_link">Nút bấm (link)</Label>
                    <Input
                      id="button_link"
                      value={formData.button_link}
                      onChange={(e) => setFormData({ ...formData, button_link: e.target.value })}
                      placeholder="/products"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Hiển thị</Label>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseDialog} className="flex-1">
                    Hủy
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1" 
                    disabled={createMutation.isPending || updateMutation.isPending || uploading}
                  >
                    <span className="flex items-center">
                      <Loader2 className={`w-4 h-4 mr-2 animate-spin ${(createMutation.isPending || updateMutation.isPending) ? 'inline' : 'hidden'}`} />
                      <span>{editingBanner ? "Cập nhật" : "Thêm"}</span>
                    </span>
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {!canAddMore && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">
                Đã đạt giới hạn {MAX_BANNERS} banner. Vui lòng xóa bớt để thêm mới.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              Danh sách Banner ({banners.length}/{MAX_BANNERS})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Đang tải...</p>
            ) : banners.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                Chưa có banner nào. Thêm banner để hiển thị trên trang chủ.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Thứ tự</TableHead>
                    <TableHead className="w-20">Ảnh</TableHead>
                    <TableHead>Tiêu đề</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banners.map((banner, index) => (
                    <TableRow key={banner.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            aria-label={`Di chuyển banner "${banner.title}" lên trên`}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === banners.length - 1}
                            aria-label={`Di chuyển banner "${banner.title}" xuống dưới`}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <img
                          src={banner.image_url}
                          alt={banner.title}
                          className="w-16 h-10 object-cover rounded"
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{banner.title}</p>
                          {banner.subtitle && (
                            <p className="text-sm text-muted-foreground">{banner.subtitle}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            banner.is_active
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {banner.is_active ? "Đang hiển thị" : "Đã ẩn"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => handleEdit(banner)}
                            aria-label={`Chỉnh sửa banner ${banner.title}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingBanner(banner)}
                            aria-label={`Xóa banner ${banner.title}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!deletingBanner} onOpenChange={() => setDeletingBanner(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa banner?</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa banner "{deletingBanner?.title}"? Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deletingBanner) {
                    deleteMutation.mutate(deletingBanner.id, {
                      onSuccess: () => setDeletingBanner(null),
                    });
                  }
                }}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xóa"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminBanners;
