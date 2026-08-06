import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface JourneyItem {
  icon: string;
  title: string;
  description: string;
  image_url: string;
}

export interface CoreValue {
  icon: string;
  title: string;
  description: string;
}

export interface StoryItem {
  title: string;
  description: string;
  image_url: string;
  button_text: string;
  button_link: string;
}

export interface HomepageContent {
  journey_section_title: string;
  journey_section_subtitle: string;
  journey_items: JourneyItem[];
  core_values_section_title: string;
  core_values_section_subtitle: string;
  core_values_image: string;
  core_values: CoreValue[];
  story_items: StoryItem[];
}

const defaultContent: HomepageContent = {
  journey_section_title: "TĂM NHỰA VINON",
  journey_section_subtitle: "Hành trình của",
  journey_items: [
    { icon: "TrendingUp", title: "Chất liệu nhựa nguyên sinh", description: "Không mùi, không vị, độ dẻo cao, không lo xước nướu hay gãy vụn như tăm tre truyền thống.", image_url: "" },
    { icon: "Star", title: "Thiết kế thông minh", description: "Hai đầu đa năng (một đầu nhọn, một đầu lông chải mềm) giúp loại bỏ mảng bám hiệu quả mà không làm thưa răng.", image_url: "" },
    { icon: "Factory", title: "Công nghệ kháng khuẩn", description: "Quy trình sản xuất khép kín, đảm bảo vệ sinh tối đa từ nhà máy đến tay người dùng.", image_url: "" },
    { icon: "Award", title: "Chứng nhận Eurofins", description: "Đạt chuẩn QCVN 12-1:2011/BYT, không chứa kim loại nặng, an toàn tuyệt đối cho sức khỏe.", image_url: "" },
  ],
  core_values_section_title: "TẠI SAO NÊN CHỌN TĂM NHỰA VINON",
  core_values_section_subtitle: "ƯU ĐIỂM VƯỢT TRỘI",
  core_values_image: "",
  core_values: [
    { icon: "Heart", title: "An toàn tuyệt đối", description: "Đạt chuẩn QCVN 12-1:2011/BYT, không chứa kim loại nặng, an toàn cho sức khỏe" },
    { icon: "Shield", title: "Vệ sinh kháng khuẩn", description: "Kháng khuẩn, không ẩm mốc, đảm bảo vệ sinh tối đa" },
    { icon: "Award", title: "Chứng nhận rõ ràng", description: "Có chứng nhận Eurofins rõ ràng, minh bạch về nguồn gốc" },
    { icon: "Star", title: "Thiết kế chuyên dụng", description: "Thiết kế chuyên dụng để lấy mảng bám hiệu quả" },
  ],
  story_items: [
    { title: "Sự phát triển từ chất lượng", description: "Chúng tôi yêu gia vị của Việt Nam và rất mong muốn đưa sản phẩm chất lượng cao ra toàn thế giới. Với niềm đam mê trong công việc và sự hiểu biết sâu sắc về nền nông nghiệp Việt Nam. Sản lượng xuất khẩu của công ty đã tăng mạnh hàng năm và đạt nhiều thành tựu.", image_url: "", button_text: "Xem ngay", button_link: "/about" },
    { title: "Nguồn gốc gia vị sạch", description: "Nhà máy chúng tôi đặt tại trung tâm cung cấp nguyên liệu lớn nhất tại Việt Nam và chúng tôi hoàn toàn chủ động nguồn nguyên liệu. Sản lượng tiêu được thu hoạch từ các nông trại ở xã Namyang (huyện Dak Doa, Gia Lai) và xã Earal (huyện Ea H'leo, Đắc Lắc).", image_url: "", button_text: "Xem ngay", button_link: "/about" },
  ],
};

export const useHomepageContent = () => {
  const queryClient = useQueryClient();

  const { data: content, isLoading } = useQuery({
    queryKey: ["homepage-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .eq("page_key", "homepage")
        .maybeSingle();

      if (error) throw error;
      
      if (data && data.content) {
        return data.content as unknown as HomepageContent;
      }
      return defaultContent;
    },
  });

  const updateContent = useMutation({
    mutationFn: async (newContent: HomepageContent) => {
      // Check if record exists
      const { data: existing } = await supabase
        .from("page_contents")
        .select("id")
        .eq("page_key", "homepage")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("page_contents")
          .update({ 
            content: JSON.parse(JSON.stringify(newContent)),
            updated_at: new Date().toISOString() 
          })
          .eq("page_key", "homepage");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("page_contents")
          .insert([{ 
            page_key: "homepage", 
            content: JSON.parse(JSON.stringify(newContent)),
            title: "Trang chủ"
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homepage-content"] });
      toast.success("Đã lưu nội dung trang chủ");
    },
    onError: (error) => {
      toast.error("Lỗi khi lưu: " + error.message);
    },
  });

  return {
    content: content || defaultContent,
    isLoading,
    updateContent: updateContent.mutate,
    isUpdating: updateContent.isPending,
  };
};

export const iconOptions = [
  "TrendingUp", "Star", "Factory", "Award", "Heart", "Shield", "Users", 
  "Leaf", "Sun", "Layers", "TreePine", "Package", "Globe", "Target", 
  "Zap", "CheckCircle", "ThumbsUp", "Trophy"
];
