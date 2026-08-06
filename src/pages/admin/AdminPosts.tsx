import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, FileText, Eye, EyeOff, Loader2 } from "lucide-react";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

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
  created_at: string;
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

const CATEGORIES = ["Tin tức", "Công thức", "Mẹo vặt", "Sự kiện"];

const AdminPosts = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deletingPost, setDeletingPost] = useState<Post | null>(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Post[];
    },
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory]);

  const createMutation = useMutation({
    mutationFn: async (data: PostFormData) => {
      const { error } = await supabase.from("posts").insert({
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        content: data.content || null,
        image_url: data.image_url || null,
        category: data.category || null,
        is_published: data.is_published,
        published_at: data.is_published ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Đã thêm bài viết mới");
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể thêm bài viết", {
        description: errorMessage,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PostFormData }) => {
      const currentPost = posts.find((p) => p.id === id);
      const wasPublished = currentPost?.is_published;

      const { error } = await supabase
        .from("posts")
        .update({
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt || null,
          content: data.content || null,
          image_url: data.image_url || null,
          category: data.category || null,
          is_published: data.is_published,
          published_at: data.is_published && !wasPublished 
            ? new Date().toISOString() 
            : currentPost?.published_at,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Đã cập nhật bài viết");
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể cập nhật bài viết", {
        description: errorMessage,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Đã xóa bài viết");
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể xóa bài viết", {
        description: errorMessage,
      });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const { error } = await supabase
        .from("posts")
        .update({
          is_published: isPublished,
          published_at: isPublished ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Đã cập nhật trạng thái");
    },
  });

  const handleEdit = (post: Post) => {
    navigate(`/admin/posts/${post.id}/edit`);
  };

  const postFilters: SearchFilter[] = [
    {
      key: "category",
      label: "Danh mục",
      options: CATEGORIES.map((cat) => ({
        value: cat,
        label: cat,
      })),
    },
  ];

  const filteredPosts = posts.filter((post) => {
    const matchesSearch =
      !searchTerm ||
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || post.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredPosts.length / itemsPerPage);
  const paginatedPosts = filteredPosts.slice(
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

  const publishedCount = posts.filter((p) => p.is_published).length;
  const draftCount = posts.filter((p) => !p.is_published).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Bài viết</h1>
            <p className="text-muted-foreground">
              {publishedCount} đã đăng • {draftCount} bản nháp
            </p>
          </div>
          <Button onClick={() => navigate("/admin/posts/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm bài viết
          </Button>
        </div>

        {/* Filters */}
        <AdminSearchBar
          placeholder="Tìm kiếm theo tiêu đề, mô tả, nội dung..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={postFilters}
          activeFilters={{
            category: filterCategory,
          }}
          onFilterChange={(key, value) => {
            if (key === "category") setFilterCategory(value);
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Danh sách bài viết ({filteredPosts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Đang tải...</p>
            ) : filteredPosts.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {searchTerm || filterCategory !== "all"
                  ? "Không tìm thấy bài viết"
                  : "Chưa có bài viết nào"}
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Ảnh</TableHead>
                      <TableHead>Tiêu đề</TableHead>
                      <TableHead>Danh mục</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPosts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell>
                          {post.image_url ? (
                            <img
                              src={post.image_url}
                              alt={post.title}
                              className="w-16 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-16 h-10 bg-muted rounded flex items-center justify-center">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium line-clamp-1">{post.title}</p>
                            <p className="text-sm text-muted-foreground">/{post.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {post.category && (
                            <span className="px-2 py-1 rounded-full text-xs bg-muted">
                              {post.category}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() =>
                              togglePublishMutation.mutate({
                                id: post.id,
                                isPublished: !post.is_published,
                              })
                            }
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                              post.is_published
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {post.is_published ? (
                              <>
                                <Eye className="w-3 h-3" /> Đã đăng
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3" /> Nháp
                              </>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(post.created_at), "dd/MM/yyyy", { locale: vi })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleEdit(post)}
                              aria-label={`Chỉnh sửa bài viết ${post.title}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingPost(post)}
                              aria-label={`Xóa bài viết ${post.title}`}
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
                  totalItems={filteredPosts.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                />
              </>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!deletingPost} onOpenChange={() => setDeletingPost(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa bài viết?</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa bài viết "{deletingPost?.title}"? Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deletingPost) {
                    deleteMutation.mutate(deletingPost.id, {
                      onSuccess: () => setDeletingPost(null),
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

export default AdminPosts;
