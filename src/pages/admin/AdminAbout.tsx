import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CKEditorComponent from "@/components/admin/CKEditor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/admin/ImageUploader";

interface AboutContent {
  hero_image: string;
  intro_title: string;
  intro_text: string;
  mission_title: string;
  mission_text: string;
  vision_title: string;
  vision_text: string;
  values: Array<{ title: string; description: string }>;
  story_image: string;
  story_text: string;
}

interface PageContent {
  id: string;
  page_key: string;
  title: string | null;
  subtitle: string | null;
  content: AboutContent;
}

const defaultContent: AboutContent = {
  hero_image: "",
  intro_title: "Hành trình của hương vị",
  intro_text: "",
  mission_title: "Sứ mệnh",
  mission_text: "",
  vision_title: "Tầm nhìn",
  vision_text: "",
  values: [
    { title: "Chất lượng", description: "" },
    { title: "An toàn", description: "" },
    { title: "Tận tâm", description: "" },
  ],
  story_image: "",
  story_text: "",
};

const AdminAbout = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<{
    title: string;
    subtitle: string;
    content: AboutContent;
  }>({
    title: "Về Chúng Tôi",
    subtitle: "",
    content: defaultContent,
  });

  const { data: pageContent, isLoading } = useQuery({
    queryKey: ["page-content", "about"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .eq("page_key", "about")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        content: data.content as unknown as AboutContent,
      } as PageContent;
    },
  });

  useEffect(() => {
    if (pageContent) {
      setFormData({
        title: pageContent.title || "Về Chúng Tôi",
        subtitle: pageContent.subtitle || "",
        content: { ...defaultContent, ...(pageContent.content as AboutContent) },
      });
    }
  }, [pageContent]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const contentJson = JSON.parse(JSON.stringify(formData.content));
      
      if (pageContent) {
        const { error } = await supabase
          .from("page_contents")
          .update({
            title: formData.title,
            subtitle: formData.subtitle,
            content: contentJson,
          })
          .eq("page_key", "about");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("page_contents").insert([{
          page_key: "about",
          title: formData.title,
          subtitle: formData.subtitle,
          content: contentJson,
        }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-content", "about"] });
      toast.success("Đã lưu nội dung trang Giới thiệu");
    },
    onError: () => toast.error("Lỗi khi lưu nội dung"),
  });

  const updateContent = (key: keyof AboutContent, value: string) => {
    setFormData((prev) => ({
      ...prev,
      content: { ...prev.content, [key]: value },
    }));
  };

  const updateValue = (index: number, field: "title" | "description", value: string) => {
    setFormData((prev) => {
      const newValues = [...prev.content.values];
      newValues[index] = { ...newValues[index], [field]: value };
      return { ...prev, content: { ...prev.content, values: newValues } };
    });
  };

  const addValue = () => {
    setFormData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        values: [...prev.content.values, { title: "", description: "" }],
      },
    }));
  };

  const removeValue = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        values: prev.content.values.filter((_, i) => i !== index),
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý trang Giới thiệu</h1>
            <p className="text-muted-foreground">Chỉnh sửa nội dung và hình ảnh trang About</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            Lưu thay đổi
          </Button>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList>
            <TabsTrigger value="general">Thông tin chung</TabsTrigger>
            <TabsTrigger value="content">Nội dung</TabsTrigger>
            <TabsTrigger value="values">Giá trị cốt lõi</TabsTrigger>
            <TabsTrigger value="story">Câu chuyện</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
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
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                <div className="space-y-2">
                  <ImageUploader
                    label="Hình ảnh Hero"
                    imageUrl={formData.content.hero_image || null}
                    onUpload={(url) => updateContent("hero_image", url)}
                    onRemove={() => updateContent("hero_image", "")}
                    maxSize={5}
                    aspectRatio="video"
                    folder="about"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Giới thiệu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="intro_title">Tiêu đề giới thiệu</Label>
                  <Input
                    id="intro_title"
                    value={formData.content.intro_title}
                    onChange={(e) => updateContent("intro_title", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intro_text">Nội dung giới thiệu</Label>
                  <CKEditorComponent
                    value={formData.content.intro_text || ""}
                    onChange={(value) => updateContent("intro_text", value)}
                    placeholder="Nhập nội dung giới thiệu..."
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Sứ mệnh</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mission_title">Tiêu đề</Label>
                    <Input
                      id="mission_title"
                      value={formData.content.mission_title}
                      onChange={(e) => updateContent("mission_title", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mission_text">Nội dung</Label>
                    <CKEditorComponent
                      value={formData.content.mission_text || ""}
                      onChange={(value) => updateContent("mission_text", value)}
                      placeholder="Nhập nội dung sứ mệnh..."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tầm nhìn</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="vision_title">Tiêu đề</Label>
                    <Input
                      id="vision_title"
                      value={formData.content.vision_title}
                      onChange={(e) => updateContent("vision_title", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vision_text">Nội dung</Label>
                    <CKEditorComponent
                      value={formData.content.vision_text || ""}
                      onChange={(value) => updateContent("vision_text", value)}
                      placeholder="Nhập nội dung tầm nhìn..."
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="values" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Giá trị cốt lõi</CardTitle>
                <CardDescription>Thêm các giá trị cốt lõi của công ty</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {formData.content.values.map((value, index) => (
                  <div key={index} className="flex gap-4 items-start p-4 border border-border rounded-lg">
                    <div className="flex-1 grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tiêu đề</Label>
                        <Input
                          value={value.title}
                          onChange={(e) => updateValue(index, "title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mô tả</Label>
                        <Input
                          value={value.description}
                          onChange={(e) => updateValue(index, "description", e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeValue(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addValue}>
                  <Plus className="w-4 h-4 mr-2" />
                  Thêm giá trị
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="story" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Câu chuyện thương hiệu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <ImageUploader
                    label="Hình ảnh câu chuyện"
                    imageUrl={formData.content.story_image || null}
                    onUpload={(url) => updateContent("story_image", url)}
                    onRemove={() => updateContent("story_image", "")}
                    maxSize={5}
                    aspectRatio="video"
                    folder="about"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="story_text">Nội dung câu chuyện</Label>
                  <CKEditorComponent
                    value={formData.content.story_text || ""}
                    onChange={(value) => updateContent("story_text", value)}
                    placeholder="Nhập nội dung câu chuyện..."
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </AdminLayout>
  );
};

export default AdminAbout;
