import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Upload, X, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateSlug, generateUniqueSlug } from "@/lib/slug";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CKEditorComponent from "@/components/admin/CKEditor";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;
  is_published: boolean;
  published_at: string | null;
}

interface PostFormData {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  image_url: string;
  category: string;
  is_published: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const AdminPostForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast: toastHook } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  // Prevent renders during unmount
  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      setIsNavigating(true);
    };
  }, []);

  const [formData, setFormData] = useState<PostFormData>({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    image_url: "",
    category: "",
    is_published: false,
  });

  const isEditing = !!id;

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (data) {
        setCategories(data);
      }
    };
    fetchCategories();
  }, []);

  // Fetch post if editing
  useEffect(() => {
    if (id) {
      setIsLoading(true);
      const fetchPost = async () => {
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .eq("id", id)
          .single();

        if (error) {
          toast.error("Không thể tải thông tin bài viết");
          navigate("/admin/posts");
          return;
        }

        if (data) {
          setFormData({
            title: data.title,
            slug: data.slug,
            excerpt: data.excerpt || "",
            content: data.content || "",
            image_url: data.image_url || "",
            category: data.category || "",
            is_published: data.is_published,
          });
          setImagePreview(data.image_url);
          setIsSlugManuallyEdited(true);
        }
        setIsLoading(false);
      };
      fetchPost();
    }
  }, [id, navigate]);

  const createMutation = useMutation({
    mutationFn: async (data: PostFormData) => {
      const { error } = await supabase.from("posts").insert({
        ...data,
        published_at: data.is_published ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Đã thêm bài viết");
      setIsNavigating(true);
      navigate("/admin/posts");
    },
    onError: (error: Error) => {
      toast.error("Không thể thêm bài viết: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PostFormData }) => {
      const { error } = await supabase
        .from("posts")
        .update({
          ...data,
          published_at: data.is_published ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Đã cập nhật bài viết");
      setIsNavigating(true);
      navigate("/admin/posts");
    },
    onError: (error: Error) => {
      toast.error("Không thể cập nhật bài viết: " + error.message);
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Kích thước file tối đa là 5MB");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `post-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `posts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(filePath);

      setFormData({ ...formData, image_url: publicUrl });
      setImagePreview(publicUrl);
      toast.success("Đã tải lên hình ảnh");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể tải lên hình ảnh";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalSlug = formData.slug || generateSlug(formData.title);

    try {
      finalSlug = await generateUniqueSlug(finalSlug, "posts", id);
    } catch (error) {
      // Continue with original slug if error
    }

    const submitData = {
      ...formData,
      slug: finalSlug,
    };

    if (isEditing) {
      updateMutation.mutate({ id: id!, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleTitleChange = (title: string) => {
    const autoSlug = generateSlug(title);
    setFormData({
      ...formData,
      title,
      slug: isSlugManuallyEdited ? formData.slug : autoSlug,
    });
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/posts")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {isEditing ? "Chỉnh sửa bài viết" : "Thêm bài viết mới"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isEditing
                  ? "Cập nhật thông tin bài viết"
                  : "Điền thông tin để thêm bài viết mới"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin cơ bản</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title">Tiêu đề bài viết *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="Nhập tiêu đề bài viết"
                    />
                  </div>

                  {/* Slug */}
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (URL) *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="slug"
                        value={formData.slug}
                        onChange={(e) => {
                          setIsSlugManuallyEdited(true);
                          setFormData((prev) => ({ ...prev, slug: e.target.value }));
                        }}
                        placeholder="slug-se-tu-dong-tao"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const autoSlug = generateSlug(formData.title);
                          setIsSlugManuallyEdited(false);
                          setFormData((prev) => ({ ...prev, slug: autoSlug }));
                        }}
                        title="Tự động tạo slug từ tiêu đề"
                      >
                        🔄
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Slug sẽ tự động được tạo từ tiêu đề bài viết
                    </p>
                  </div>

                  {/* Excerpt */}
                  <div className="space-y-2">
                    <Label htmlFor="excerpt">Mô tả ngắn</Label>
                    <Textarea
                      id="excerpt"
                      value={formData.excerpt}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, excerpt: e.target.value }))
                      }
                      placeholder="Nhập mô tả ngắn cho bài viết..."
                      rows={3}
                    />
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <Label htmlFor="content">Nội dung bài viết</Label>
                    <CKEditorComponent
                      value={formData.content || ""}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, content: value }))
                      }
                      placeholder="Nhập nội dung bài viết..."
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Image Upload */}
              <Card>
                <CardHeader>
                  <CardTitle>Hình ảnh bài viết</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  {imagePreview ? (
                    <div className="relative">
                      <div className="border rounded-lg overflow-hidden aspect-video">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleRemoveImage}
                        className="mt-2 w-full"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Xóa hình ảnh
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted transition-colors"
                    >
                      {uploading ? (
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                      ) : (
                        <>
                          <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">Upload hình ảnh</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            JPG, PNG, WEBP (tối đa 5MB)
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Category & Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Phân loại & Cài đặt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Danh mục</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open("/admin/categories", "_blank")}
                        className="h-auto p-1 text-xs"
                      >
                        Quản lý danh mục →
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={formData.category}
                        onValueChange={(value) => {
                          if (value === "__add_new__") {
                            setShowCategoryInput(true);
                          } else {
                            setFormData((prev) => ({ ...prev, category: value }));
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Chọn danh mục" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="__add_new__" className="text-primary">
                            <span className="flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Thêm danh mục mới
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {showCategoryInput && (
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="Nhập tên danh mục mới"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={async () => {
                            if (newCategory.trim()) {
                              const slug = newCategory
                                .trim()
                                .toLowerCase()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .replace(/đ/g, "d")
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/(^-|-$)/g, "");

                              const { data, error } = await supabase
                                .from("categories")
                                .insert({ name: newCategory.trim(), slug })
                                .select()
                                .single();

                              if (!error && data) {
                                setFormData((prev) => ({
                                  ...prev,
                                  category: newCategory.trim(),
                                }));
                                setCategories((prev) => [...prev, data]);
                                toastHook({ title: "Đã thêm danh mục mới" });
                              } else {
                                toastHook({
                                  variant: "destructive",
                                  title: "Lỗi",
                                  description: "Không thể thêm danh mục",
                                });
                              }
                              setShowCategoryInput(false);
                              setNewCategory("");
                            }
                          }}
                        >
                          Thêm
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowCategoryInput(false);
                            setNewCategory("");
                          }}
                        >
                          Hủy
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_published">Xuất bản ngay</Label>
                    <Switch
                      id="is_published"
                      checked={formData.is_published}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, is_published: checked }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {!isNavigating ? (
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="w-full"
                  >
                    <span className="flex items-center">
                      <Loader2 className={`w-4 h-4 mr-2 animate-spin ${(createMutation.isPending || updateMutation.isPending) ? 'inline' : 'hidden'}`} />
                      <Save className={`w-4 h-4 mr-2 ${(createMutation.isPending || updateMutation.isPending) ? 'hidden' : 'inline'}`} />
                      <span>{(createMutation.isPending || updateMutation.isPending) ? "Đang lưu..." : (isEditing ? "Cập nhật bài viết" : "Thêm bài viết")}</span>
                    </span>
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={true}
                    className="w-full"
                  >
                    <span className="flex items-center">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span>Đang lưu...</span>
                    </span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin/posts")}
                  className="w-full"
                >
                  Hủy
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default AdminPostForm;

