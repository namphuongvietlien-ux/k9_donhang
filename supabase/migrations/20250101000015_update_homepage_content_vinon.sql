-- Update homepage content for Tăm Nhựa Vinon
-- This migration updates the default homepage content with Vinon-specific information

INSERT INTO public.page_contents (page_key, title, subtitle, content)
VALUES (
  'homepage',
  'Trang chủ',
  '',
  '{
    "journey_section_title": "TĂM NHỰA VINON",
    "journey_section_subtitle": "Hành trình của",
    "journey_items": [
      {
        "icon": "TrendingUp",
        "title": "Chất liệu nhựa nguyên sinh",
        "description": "Không mùi, không vị, độ dẻo cao, không lo xước nướu hay gãy vụn như tăm tre truyền thống.",
        "image_url": ""
      },
      {
        "icon": "Star",
        "title": "Thiết kế thông minh",
        "description": "Hai đầu đa năng (một đầu nhọn, một đầu lông chải mềm) giúp loại bỏ mảng bám hiệu quả mà không làm thưa răng.",
        "image_url": ""
      },
      {
        "icon": "Factory",
        "title": "Công nghệ kháng khuẩn",
        "description": "Quy trình sản xuất khép kín, đảm bảo vệ sinh tối đa từ nhà máy đến tay người dùng.",
        "image_url": ""
      },
      {
        "icon": "Award",
        "title": "Chứng nhận Eurofins",
        "description": "Đạt chuẩn QCVN 12-1:2011/BYT, không chứa kim loại nặng, an toàn tuyệt đối cho sức khỏe.",
        "image_url": ""
      }
    ],
    "core_values_section_title": "TẠI SAO NÊN CHỌN TĂM NHỰA VINON",
    "core_values_section_subtitle": "ƯU ĐIỂM VƯỢT TRỘI",
    "core_values_image": "",
    "core_values": [
      {
        "icon": "Heart",
        "title": "An toàn tuyệt đối",
        "description": "Đạt chuẩn QCVN 12-1:2011/BYT, không chứa kim loại nặng, an toàn cho sức khỏe"
      },
      {
        "icon": "Shield",
        "title": "Vệ sinh kháng khuẩn",
        "description": "Kháng khuẩn, không ẩm mốc, đảm bảo vệ sinh tối đa"
      },
      {
        "icon": "Award",
        "title": "Chứng nhận rõ ràng",
        "description": "Có chứng nhận Eurofins rõ ràng, minh bạch về nguồn gốc"
      },
      {
        "icon": "Star",
        "title": "Thiết kế chuyên dụng",
        "description": "Thiết kế chuyên dụng để lấy mảng bám hiệu quả"
      }
    ],
    "story_items": [
      {
        "title": "An Tâm 100% Với Chứng Nhận Kiểm Định Quốc Tế",
        "description": "Tăm nhựa Vinon đã trải qua các bước kiểm tra nghiêm ngặt tại trung tâm Eurofins Sắc Ký Hải Đăng và đạt kết quả hoàn hảo: Đạt chuẩn QCVN 12-1:2011/BYT, KHÔNG chứa kim loại nặng (Chì, Cadimi), và an toàn tuyệt đối với các chỉ số cặn khô trong ngưỡng an toàn cực thấp.",
        "image_url": "",
        "button_text": "Xem Chứng Nhận An Toàn",
        "button_link": "/about"
      }
    ]
  }'::jsonb
)
ON CONFLICT (page_key) DO UPDATE
SET content = EXCLUDED.content,
    updated_at = now();

-- Update about page content
INSERT INTO public.page_contents (page_key, title, subtitle, content)
VALUES (
  'about',
  'VỀ CHÚNG TÔI',
  '',
  '{
    "hero_image": "",
    "intro_title": "VỀ CHÚNG TÔI",
    "intro_text": "CÔNG TY TNHH VINON là đơn vị chuyên sản xuất và phân phối tăm nhựa cao cấp hàng đầu Việt Nam. Với cam kết mang đến sản phẩm an toàn tuyệt đối cho sức khỏe răng miệng, chúng tôi tự hào là thương hiệu tăm nhựa đầu tiên đạt chứng nhận kiểm định Quốc tế Eurofins tại Việt Nam.",
    "mission_title": "Sứ mệnh",
    "mission_text": "Sứ mệnh của chúng tôi là bảo vệ sức khỏe răng miệng của mọi gia đình Việt Nam bằng sản phẩm tăm nhựa cao cấp, an toàn tuyệt đối, không chứa chất độc hại, và thân thiện với môi trường.",
    "vision_title": "Tầm nhìn",
    "vision_text": "Trở thành thương hiệu tăm nhựa số 1 Việt Nam, được tin dùng bởi hàng triệu gia đình nhờ chất lượng vượt trội và cam kết an toàn tuyệt đối cho sức khỏe người tiêu dùng.",
    "values": [
      {
        "title": "Nhựa nguyên sinh cao cấp",
        "description": "Chất liệu nhựa nguyên sinh tinh khiết, không mùi, không vị, độ dẻo cao"
      },
      {
        "title": "Chứng nhận Eurofins",
        "description": "Đạt chuẩn QCVN 12-1:2011/BYT, được kiểm nghiệm tại Eurofins Sắc Ký Hải Đăng"
      },
      {
        "title": "Thiết kế thông minh",
        "description": "Hai đầu đa năng giúp loại bỏ mảng bám hiệu quả mà không làm thưa răng"
      }
    ],
    "story_image": "",
    "story_text": "Chúng tôi hiểu rằng sức khỏe của bạn bắt đầu từ những điều nhỏ nhất. Tăm nhựa Vinon đã trải qua các bước kiểm tra nghiêm ngặt tại trung tâm Eurofins Sắc Ký Hải Đăng và đạt kết quả hoàn hảo: Đạt chuẩn QCVN 12-1:2011/BYT, KHÔNG chứa kim loại nặng (Chì, Cadimi), và an toàn tuyệt đối với các chỉ số cặn khô trong ngưỡng an toàn cực thấp."
  }'::jsonb
)
ON CONFLICT (page_key) DO UPDATE
SET content = EXCLUDED.content,
    updated_at = now();

