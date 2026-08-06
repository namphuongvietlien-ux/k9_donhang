-- Insert default content for policy pages
-- These pages can be managed through admin panel

INSERT INTO public.page_contents (page_key, title, subtitle, content)
VALUES 
  (
    'privacy',
    'Chính sách bảo mật',
    'Cam kết bảo vệ quyền riêng tư và thông tin của bạn',
    '{
      "sections": [
        {
          "title": "1. Thu thập thông tin",
          "content": "<p>Chúng tôi thu thập thông tin cá nhân của bạn khi bạn đăng ký tài khoản, đặt hàng, hoặc liên hệ với chúng tôi. Thông tin thu thập bao gồm:</p><ul><li>Họ và tên</li><li>Địa chỉ email</li><li>Số điện thoại</li><li>Địa chỉ giao hàng</li><li>Thông tin thanh toán (được mã hóa và bảo mật)</li></ul>"
        },
        {
          "title": "2. Sử dụng thông tin",
          "content": "<p>Thông tin cá nhân của bạn được sử dụng để:</p><ul><li>Xử lý đơn hàng và giao hàng</li><li>Liên hệ với bạn về đơn hàng</li><li>Cải thiện dịch vụ và trải nghiệm khách hàng</li><li>Gửi thông tin khuyến mãi (nếu bạn đồng ý)</li><li>Tuân thủ các yêu cầu pháp lý</li></ul>"
        },
        {
          "title": "3. Bảo vệ thông tin",
          "content": "<p>Chúng tôi cam kết bảo vệ thông tin cá nhân của bạn bằng các biện pháp bảo mật tiên tiến, bao gồm mã hóa SSL/TLS cho tất cả các giao dịch trực tuyến. Thông tin của bạn được lưu trữ an toàn và chỉ được truy cập bởi nhân viên được ủy quyền.</p>"
        },
        {
          "title": "4. Chia sẻ thông tin",
          "content": "<p>Chúng tôi không bán, cho thuê hoặc chia sẻ thông tin cá nhân của bạn với bên thứ ba, trừ các trường hợp:</p><ul><li>Đối tác vận chuyển (chỉ thông tin cần thiết để giao hàng)</li><li>Nhà cung cấp dịch vụ thanh toán (để xử lý thanh toán)</li><li>Khi có yêu cầu từ cơ quan pháp luật</li></ul>"
        },
        {
          "title": "5. Quyền của bạn",
          "content": "<p>Bạn có quyền:</p><ul><li>Truy cập và xem thông tin cá nhân của mình</li><li>Yêu cầu chỉnh sửa hoặc xóa thông tin</li><li>Từ chối nhận email marketing</li><li>Khiếu nại về việc xử lý thông tin cá nhân</li></ul>"
        },
        {
          "title": "6. Cookies",
          "content": "<p>Website của chúng tôi sử dụng cookies để cải thiện trải nghiệm người dùng. Bạn có thể tắt cookies trong cài đặt trình duyệt, nhưng điều này có thể ảnh hưởng đến một số chức năng của website.</p>"
        },
        {
          "title": "7. Liên hệ",
          "content": "<p>Nếu bạn có câu hỏi về chính sách bảo mật này, vui lòng liên hệ với chúng tôi qua email hoặc điện thoại.</p>"
        }
      ]
    }'::jsonb
  ),
  (
    'terms',
    'Điều khoản sử dụng',
    'Quy định về việc sử dụng website và mua hàng',
    '{
      "sections": [
        {
          "title": "1. Chấp nhận điều khoản",
          "content": "<p>Bằng việc truy cập và sử dụng website này, bạn đồng ý tuân thủ các điều khoản và điều kiện được nêu trong tài liệu này. Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng không sử dụng website của chúng tôi.</p>"
        },
        {
          "title": "2. Sử dụng website",
          "content": "<p>Bạn được phép sử dụng website cho mục đích cá nhân và thương mại hợp pháp. Bạn không được sử dụng website cho mục đích bất hợp pháp, xâm phạm quyền sở hữu trí tuệ, phát tán virus hoặc mã độc.</p>"
        },
        {
          "title": "3. Đặt hàng và thanh toán",
          "content": "<p>Khi đặt hàng, bạn cần cung cấp thông tin chính xác và đầy đủ. Chúng tôi có quyền từ chối hoặc hủy đơn hàng nếu phát hiện thông tin không chính xác hoặc có dấu hiệu gian lận.</p>"
        },
        {
          "title": "4. Quyền sở hữu trí tuệ",
          "content": "<p>Tất cả nội dung trên website, bao gồm văn bản, hình ảnh, logo, và thiết kế, đều thuộc quyền sở hữu của chúng tôi hoặc đối tác của chúng tôi.</p>"
        },
        {
          "title": "5. Giới hạn trách nhiệm",
          "content": "<p>Chúng tôi không chịu trách nhiệm về bất kỳ thiệt hại nào phát sinh từ việc sử dụng website, bao gồm mất dữ liệu, lợi nhuận, hoặc gián đoạn kinh doanh.</p>"
        },
        {
          "title": "6. Thay đổi điều khoản",
          "content": "<p>Chúng tôi có quyền thay đổi các điều khoản này bất cứ lúc nào. Các thay đổi sẽ có hiệu lực ngay sau khi được đăng tải trên website.</p>"
        },
        {
          "title": "7. Luật áp dụng",
          "content": "<p>Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi tranh chấp phát sinh sẽ được giải quyết tại tòa án có thẩm quyền tại Việt Nam.</p>"
        }
      ]
    }'::jsonb
  ),
  (
    'return-policy',
    'Chính sách đổi trả',
    'Quy định về việc đổi trả sản phẩm và điều kiện áp dụng',
    '{
      "sections": [
        {
          "title": "1. Điều kiện đổi trả",
          "content": "<p>Chúng tôi chấp nhận đổi trả sản phẩm trong các trường hợp: sản phẩm bị lỗi do nhà sản xuất, không đúng với mô tả, bị hư hỏng trong quá trình vận chuyển, hoặc giao nhầm sản phẩm.</p><p><strong>Lưu ý:</strong> Sản phẩm phải còn nguyên vẹn, chưa sử dụng, còn đầy đủ bao bì và phụ kiện đi kèm.</p>"
        },
        {
          "title": "2. Thời gian đổi trả",
          "content": "<p>Bạn có thể yêu cầu đổi trả trong vòng <strong>07 ngày</strong> kể từ ngày nhận hàng. Sau thời gian này, chúng tôi sẽ không chấp nhận yêu cầu đổi trả, trừ trường hợp sản phẩm có lỗi từ nhà sản xuất.</p>"
        },
        {
          "title": "3. Quy trình đổi trả",
          "content": "<p>Quy trình đổi trả bao gồm: liên hệ với chúng tôi, xác nhận yêu cầu, gửi hàng về, kiểm tra sản phẩm, và hoàn tiền/đổi hàng.</p>"
        },
        {
          "title": "4. Hoàn tiền",
          "content": "<p>Sau khi xác nhận đổi trả hợp lệ, chúng tôi sẽ hoàn tiền cho bạn bằng phương thức thanh toán ban đầu. Thời gian hoàn tiền: thẻ tín dụng (5-7 ngày), chuyển khoản (3-5 ngày), ví điện tử (1-3 ngày).</p>"
        },
        {
          "title": "5. Trường hợp không được đổi trả",
          "content": "<p>Chúng tôi không chấp nhận đổi trả trong các trường hợp: sản phẩm đã qua sử dụng, bị hư hỏng do lỗi khách hàng, không còn đầy đủ bao bì, hoặc quá thời hạn 07 ngày.</p>"
        },
        {
          "title": "6. Đổi sản phẩm",
          "content": "<p>Nếu bạn muốn đổi sang sản phẩm khác, bạn có thể chọn sản phẩm có giá trị tương đương hoặc cao hơn. Nếu sản phẩm mới có giá cao hơn, bạn sẽ thanh toán phần chênh lệch.</p>"
        }
      ]
    }'::jsonb
  ),
  (
    'shipping-policy',
    'Chính sách vận chuyển',
    'Thông tin về phí vận chuyển, thời gian giao hàng và khu vực giao hàng',
    '{
      "sections": [
        {
          "title": "1. Khu vực giao hàng",
          "content": "<p>Chúng tôi giao hàng trên toàn quốc, bao gồm tất cả các tỉnh thành trong cả nước, khu vực nội thành và ngoại thành, khu vực đảo và vùng sâu vùng xa (có thể áp dụng phí phụ thu).</p>"
        },
        {
          "title": "2. Thời gian giao hàng",
          "content": "<p><strong>Khu vực nội thành:</strong> 1-2 ngày làm việc<br/><strong>Khu vực ngoại thành:</strong> 2-3 ngày làm việc<br/><strong>Các tỉnh thành khác:</strong> 3-5 ngày làm việc</p><p><em>* Thời gian giao hàng có thể thay đổi trong các dịp lễ, Tết hoặc do điều kiện thời tiết.</em></p>"
        },
        {
          "title": "3. Phí vận chuyển",
          "content": "<p><strong>Miễn phí vận chuyển:</strong> Đơn hàng từ 500.000đ trở lên, khách hàng VIP</p><p><strong>Phí vận chuyển:</strong> Nội thành (30.000đ), Ngoại thành (40.000đ), Các tỉnh thành khác (50.000đ - 80.000đ), Vùng sâu vùng xa (liên hệ để được báo giá)</p>"
        },
        {
          "title": "4. Phương thức vận chuyển",
          "content": "<p>Chúng tôi sử dụng các đối tác vận chuyển uy tín: Viettel Post, Vietnam Post, Grab Express (cho đơn hàng gấp), và đối tác vận chuyển địa phương.</p>"
        },
        {
          "title": "5. Quy trình giao hàng",
          "content": "<p>Quy trình bao gồm: xác nhận đơn hàng, chuẩn bị hàng, giao cho đơn vị vận chuyển, giao hàng, và nhận hàng. Vui lòng kiểm tra hàng hóa trước khi ký nhận.</p>"
        },
        {
          "title": "6. Theo dõi đơn hàng",
          "content": "<p>Bạn có thể theo dõi đơn hàng bằng cách đăng nhập vào tài khoản, sử dụng mã vận đơn, hoặc liên hệ hotline của chúng tôi.</p>"
        },
        {
          "title": "7. Xử lý khi giao hàng thất bại",
          "content": "<p>Nếu không thể giao hàng, chúng tôi sẽ liên hệ lại để sắp xếp giao hàng. Sau 3 lần giao hàng thất bại, đơn hàng sẽ được hoàn về kho.</p>"
        }
      ]
    }'::jsonb
  )
ON CONFLICT (page_key) DO NOTHING;

