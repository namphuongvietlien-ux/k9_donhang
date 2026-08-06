import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CKEditorComponent from "@/components/admin/CKEditor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Save, Plus, Trash2, Shield, FileText, RefreshCw, Truck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";

interface PolicySection {
  title: string;
  content: string;
}

interface PolicyContent {
  sections: PolicySection[];
}

interface PageContent {
  id: string;
  page_key: string;
  title: string | null;
  subtitle: string | null;
  content: PolicyContent;
}

const defaultPolicyPages = [
  { key: "privacy", label: "Chính sách bảo mật", icon: Shield },
  { key: "terms", label: "Điều khoản sử dụng", icon: FileText },
  { key: "return-policy", label: "Chính sách đổi trả", icon: RefreshCw },
  { key: "shipping-policy", label: "Chính sách vận chuyển", icon: Truck },
];

const getIconForPage = (pageKey: string) => {
  const defaultPage = defaultPolicyPages.find((p) => p.key === pageKey);
  return defaultPage?.icon || FileText;
};

const AdminPolicies = () => {
  const queryClient = useQueryClient();
  const [activePage, setActivePage] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);
  const [newPolicyData, setNewPolicyData] = useState({
    page_key: "",
    title: "",
    subtitle: "",
  });
  const [formData, setFormData] = useState<{
    title: string;
    subtitle: string;
    content: PolicyContent;
  }>({
    title: "",
    subtitle: "",
    content: { sections: [] },
  });

  // Fetch all policy pages from database
  const { data: allPolicies, isLoading: isLoadingPolicies } = useQuery({
    queryKey: ["all-policy-pages"],
    queryFn: async () => {
      const policyKeys = defaultPolicyPages.map((p) => p.key);
      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .in("page_key", policyKeys)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Also get any custom policy pages (page_key starting with "policy-")
      const { data: customPolicies, error: customError } = await supabase
        .from("page_contents")
        .select("*")
        .like("page_key", "policy-%")
        .order("created_at", { ascending: false });
      
      if (customError) throw customError;
      
      // Merge default policies with database data
      // Ensure all 4 default policies are always shown, even if not in DB
      const dbPoliciesMap = new Map((data || []).map((p) => [p.page_key, p]));
      const defaultPoliciesWithData = defaultPolicyPages.map((defaultPage) => {
        const dbData = dbPoliciesMap.get(defaultPage.key);
        if (dbData) {
          // Use data from database
          return dbData;
        }
        // Create placeholder for default policy not yet in DB
        return {
          page_key: defaultPage.key,
          title: defaultPage.label,
          subtitle: null,
          content: { sections: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          id: `default-${defaultPage.key}`,
        };
      });
      
      // Return default policies first, then custom policies
      return [...defaultPoliciesWithData, ...(customPolicies || [])];
    },
  });

  // Set first page as active if none selected
  useEffect(() => {
    if (!activePage && allPolicies && allPolicies.length > 0) {
      setActivePage(allPolicies[0].page_key);
    } else if (!activePage && defaultPolicyPages.length > 0) {
      setActivePage(defaultPolicyPages[0].key);
    }
  }, [allPolicies, activePage]);

  const { data: pageContent, isLoading } = useQuery({
    queryKey: ["page-content", activePage],
    queryFn: async () => {
      if (!activePage) return null;
      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .eq("page_key", activePage)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        content: (data.content as unknown as PolicyContent) || { sections: [] },
      } as PageContent;
    },
    enabled: !!activePage,
  });

  useEffect(() => {
    if (pageContent) {
      setFormData({
        title: pageContent.title || "",
        subtitle: pageContent.subtitle || "",
        content: pageContent.content || { sections: [] },
      });
    } else if (activePage) {
      const defaultPage = defaultPolicyPages.find((p) => p.key === activePage);
      const dbPage = allPolicies?.find((p) => p.page_key === activePage);
      setFormData({
        title: dbPage?.title || defaultPage?.label || "",
        subtitle: dbPage?.subtitle || "",
        content: { sections: [] },
      });
    }
  }, [pageContent, activePage, allPolicies]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activePage) throw new Error("Chưa chọn trang");
      const contentJson = JSON.parse(JSON.stringify(formData.content));

      if (pageContent) {
        const { error } = await supabase
          .from("page_contents")
          .update({
            title: formData.title,
            subtitle: formData.subtitle,
            content: contentJson,
          })
          .eq("page_key", activePage);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("page_contents").insert([
          {
            page_key: activePage,
            title: formData.title,
            subtitle: formData.subtitle,
            content: contentJson,
          },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-content", activePage] });
      queryClient.invalidateQueries({ queryKey: ["all-policy-pages"] });
      toast.success("Đã lưu nội dung");
    },
    onError: () => toast.error("Lỗi khi lưu nội dung"),
  });

  const createPolicyMutation = useMutation({
    mutationFn: async () => {
      // Generate page_key from title if not provided
      const pageKey = newPolicyData.page_key.trim() || 
        `policy-${newPolicyData.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
      
      // Check if page_key already exists
      const { data: existing } = await supabase
        .from("page_contents")
        .select("id")
        .eq("page_key", pageKey)
        .maybeSingle();

      if (existing) {
        throw new Error("Mã trang đã tồn tại. Vui lòng chọn mã khác.");
      }

      const { error } = await supabase.from("page_contents").insert([
        {
          page_key: pageKey,
          title: newPolicyData.title,
          subtitle: newPolicyData.subtitle,
          content: { sections: [] },
        },
      ]);
      if (error) throw error;
      return pageKey;
    },
    onSuccess: (pageKey) => {
      queryClient.invalidateQueries({ queryKey: ["all-policy-pages"] });
      setActivePage(pageKey);
      setCreateDialogOpen(false);
      setNewPolicyData({ page_key: "", title: "", subtitle: "" });
      toast.success("Đã tạo chính sách mới");
    },
    onError: (error: Error) => {
      toast.error("Lỗi khi tạo chính sách: " + error.message);
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (pageKey: string) => {
      const { error } = await supabase
        .from("page_contents")
        .delete()
        .eq("page_key", pageKey);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-policy-pages"] });
      if (pageToDelete === activePage) {
        // Select first available page
        const remaining = allPolicies?.filter((p) => p.page_key !== pageToDelete) || [];
        if (remaining.length > 0) {
          setActivePage(remaining[0].page_key);
        } else if (defaultPolicyPages.length > 0) {
          setActivePage(defaultPolicyPages[0].key);
        } else {
          setActivePage(null);
        }
      }
      setDeleteDialogOpen(false);
      setPageToDelete(null);
      toast.success("Đã xóa chính sách");
    },
    onError: (error: Error) => {
      toast.error("Lỗi khi xóa: " + error.message);
    },
  });

  const updateSection = (index: number, field: "title" | "content", value: string) => {
    setFormData((prev) => {
      const newSections = [...prev.content.sections];
      newSections[index] = { ...newSections[index], [field]: value };
      return {
        ...prev,
        content: { ...prev.content, sections: newSections },
      };
    });
  };

  const addSection = () => {
    setFormData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        sections: [...prev.content.sections, { title: "", content: "" }],
      },
    }));
  };

  const removeSection = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        sections: prev.content.sections.filter((_, i) => i !== index),
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePage) {
      toast.error("Vui lòng chọn hoặc tạo một trang chính sách");
      return;
    }
    updateMutation.mutate();
  };

  const handleCreatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyData.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề");
      return;
    }
    createPolicyMutation.mutate();
  };

  const handleDeletePolicy = (pageKey: string) => {
    // Don't allow deleting default policy pages
    if (defaultPolicyPages.some((p) => p.key === pageKey)) {
      toast.error("Không thể xóa các trang chính sách mặc định");
      return;
    }
    setPageToDelete(pageKey);
    setDeleteDialogOpen(true);
  };

  if (isLoadingPolicies || isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </AdminLayout>
    );
  }

  const Icon = activePage ? getIconForPage(activePage) : FileText;
  const activePageData = allPolicies?.find((p) => p.page_key === activePage) || 
    defaultPolicyPages.find((p) => p.key === activePage);

  return (
    <AdminLayout>
      <SEO title="Quản lý Chính sách | Admin" />
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Chính sách</h1>
            <p className="text-muted-foreground">Chỉnh sửa nội dung các trang chính sách</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            <span className="flex items-center">
              <Loader2 className={`w-4 h-4 mr-2 animate-spin ${updateMutation.isPending ? 'inline' : 'hidden'}`} />
              <Save className={`w-4 h-4 mr-2 ${updateMutation.isPending ? 'hidden' : 'inline'}`} />
              <span>{updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}</span>
            </span>
          </Button>
        </div>

        {/* Page Selector */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Chọn trang cần chỉnh sửa</CardTitle>
              <Button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                variant="outline"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Tạo chính sách mới
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {allPolicies?.map((page) => {
                const PageIcon = getIconForPage(page.page_key);
                const isDefault = defaultPolicyPages.some((p) => p.key === page.page_key);
                return (
                  <div
                    key={page.page_key}
                    className={`relative p-4 border-2 rounded-lg transition-all ${
                      activePage === page.page_key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePage(page.page_key)}
                      className="w-full text-left"
                    >
                      <PageIcon className="w-6 h-6 mb-2 text-primary" />
                      <p className="font-medium">{page.title || page.page_key}</p>
                      {page.subtitle && (
                        <p className="text-sm text-muted-foreground mt-1">{page.subtitle}</p>
                      )}
                    </button>
                    {!isDefault && (
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePolicy(page.page_key);
                        }}
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Form Content */}
        <Tabs defaultValue="general" className="w-full">
          <TabsList>
            <TabsTrigger value="general">Thông tin chung</TabsTrigger>
            <TabsTrigger value="sections">Nội dung</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  Thông tin chung
                </CardTitle>
                <CardDescription>Tiêu đề và mô tả ngắn của trang</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Tiêu đề trang</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Nhập tiêu đề trang"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subtitle">Mô tả ngắn</Label>
                  <Input
                    id="subtitle"
                    value={formData.subtitle}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, subtitle: e.target.value }))
                    }
                    placeholder="Nhập mô tả ngắn"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sections" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Các phần nội dung</CardTitle>
                    <CardDescription>Quản lý các phần nội dung của trang</CardDescription>
                  </div>
                  <Button type="button" onClick={addSection} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Thêm phần
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {formData.content.sections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Chưa có phần nội dung nào.</p>
                    <Button
                      type="button"
                      onClick={addSection}
                      variant="outline"
                      className="mt-4"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Thêm phần đầu tiên
                    </Button>
                  </div>
                ) : (
                  formData.content.sections.map((section, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            Phần {index + 1}: {section.title || "Chưa có tiêu đề"}
                          </CardTitle>
                          <Button
                            type="button"
                            onClick={() => removeSection(index)}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Tiêu đề phần</Label>
                          <Input
                            value={section.title}
                            onChange={(e) => updateSection(index, "title", e.target.value)}
                            placeholder="Nhập tiêu đề phần (ví dụ: 1. Thu thập thông tin)"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Nội dung</Label>
                          <CKEditorComponent
                            value={section.content || ""}
                            onChange={(data) => updateSection(index, "content", data)}
                            placeholder="Nhập nội dung chi tiết..."
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>

      {/* Create Policy Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreatePolicy}>
            <DialogHeader>
              <DialogTitle>Tạo chính sách mới</DialogTitle>
              <DialogDescription>
                Tạo một trang chính sách mới. Mã trang sẽ được tạo tự động từ tiêu đề nếu bạn không nhập.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-page-key">Mã trang (tùy chọn)</Label>
                <Input
                  id="new-page-key"
                  value={newPolicyData.page_key}
                  onChange={(e) =>
                    setNewPolicyData((prev) => ({
                      ...prev,
                      page_key: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    }))
                  }
                  placeholder="policy-ten-chinh-sach (tự động tạo nếu để trống)"
                />
                <p className="text-xs text-muted-foreground">
                  Mã trang sẽ được dùng làm URL. Ví dụ: policy-ten-chinh-sach
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-title">
                  Tiêu đề <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="new-title"
                  value={newPolicyData.title}
                  onChange={(e) =>
                    setNewPolicyData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Nhập tiêu đề chính sách"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-subtitle">Mô tả ngắn</Label>
                <Input
                  id="new-subtitle"
                  value={newPolicyData.subtitle}
                  onChange={(e) =>
                    setNewPolicyData((prev) => ({ ...prev, subtitle: e.target.value }))
                  }
                  placeholder="Nhập mô tả ngắn (tùy chọn)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setNewPolicyData({ page_key: "", title: "", subtitle: "" });
                }}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={createPolicyMutation.isPending}>
                <span className="inline-flex items-center mr-2">
                  {createPolicyMutation.isPending ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </span>
                {createPolicyMutation.isPending ? "Đang tạo..." : "Tạo mới"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa chính sách này? Hành động này không thể hoàn tác.
              Tất cả nội dung sẽ bị mất vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pageToDelete) {
                  deletePolicyMutation.mutate(pageToDelete);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePolicyMutation.isPending}
            >
              {deletePolicyMutation.isPending ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminPolicies;

