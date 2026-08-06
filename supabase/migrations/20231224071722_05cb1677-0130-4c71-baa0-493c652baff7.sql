-- Create page_contents table for dynamic page content
CREATE TABLE public.page_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key TEXT NOT NULL UNIQUE,
  title TEXT,
  subtitle TEXT,
  content JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.page_contents ENABLE ROW LEVEL SECURITY;

-- Anyone can view page contents
CREATE POLICY "Anyone can view page contents"
ON public.page_contents
FOR SELECT
USING (true);

-- Admins can manage page contents
CREATE POLICY "Admins can manage page contents"
ON public.page_contents
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_page_contents_updated_at
BEFORE UPDATE ON public.page_contents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default about page content
INSERT INTO public.page_contents (page_key, title, subtitle, content)
VALUES (
  'about',
  'Về Chúng Tôi',
  'Câu chuyện thương hiệu Black Pepper',
  '{
    "hero_image": "",
    "intro_title": "Hành trình của hương vị",
    "intro_text": "Black Pepper được thành lập với sứ mệnh mang đến những sản phẩm gia vị sạch, an toàn và chất lượng cao nhất đến tay người tiêu dùng Việt Nam.",
    "mission_title": "Sứ mệnh",
    "mission_text": "Chúng tôi cam kết cung cấp các sản phẩm gia vị 100% tự nhiên, không chất bảo quản, được thu hoạch và chế biến theo quy trình nghiêm ngặt.",
    "vision_title": "Tầm nhìn", 
    "vision_text": "Trở thành thương hiệu gia vị hàng đầu Việt Nam, đồng hành cùng mọi gia đình trong việc tạo nên những bữa ăn ngon và an toàn.",
    "values": [
      {"title": "Chất lượng", "description": "100% nguyên liệu tự nhiên"},
      {"title": "An toàn", "description": "Quy trình sản xuất khép kín"},
      {"title": "Tận tâm", "description": "Phục vụ khách hàng tận tình"}
    ],
    "story_image": "",
    "story_text": "Xuất phát từ tình yêu với ẩm thực Việt Nam và mong muốn mang đến những sản phẩm gia vị chất lượng, Black Pepper đã ra đời. Với hơn 10 năm kinh nghiệm trong ngành, chúng tôi tự hào là đối tác tin cậy của hàng nghìn gia đình Việt."
  }'::jsonb
);