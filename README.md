# Tăm Nhựa Vinon - E-commerce Website

Website thương mại điện tử chuyên bán sản phẩm Tăm Nhựa Vinon - Sản phẩm đạt chuẩn kiểm định Quốc tế Eurofins. Hệ thống được xây dựng với React, TypeScript, và Supabase, bao gồm đầy đủ các tính năng quản lý kho, kế toán, và quản trị.

## 📋 Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Tech Stack](#tech-stack)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Giới thiệu

**Tăm Nhựa Vinon** là một hệ thống thương mại điện tử hoàn chỉnh được thiết kế để quản lý và bán sản phẩm tăm nhựa cao cấp. Hệ thống bao gồm:

- **Frontend**: Giao diện người dùng hiện đại, responsive, tối ưu SEO
- **Admin Panel**: Hệ thống quản trị toàn diện với quản lý kho, kế toán, đơn hàng
- **Backend**: Supabase (PostgreSQL, Authentication, Storage, Edge Functions)
- **Tính năng nâng cao**: Flash sales, đánh giá sản phẩm, AI chatbot, tra cứu đơn hàng

## ✨ Tính năng

### 🛍️ Tính năng người dùng

- **Trang chủ**: Hero banner, flash sales, sản phẩm nổi bật, giới thiệu công ty
- **Sản phẩm**: 
  - Danh sách sản phẩm với filter và sort
  - Chi tiết sản phẩm với gallery, video, mô tả
  - Đánh giá và nhận xét từ khách hàng
  - Flash sales với countdown timer
- **Giỏ hàng**: 
  - Thêm/xóa sản phẩm
  - Tính phí vận chuyển theo tỉnh thành
  - Áp dụng mã giảm giá
  - Lưu trữ trong localStorage
- **Đặt hàng**:
  - Checkout form với validation
  - Guest checkout (không cần đăng nhập)
  - Tra cứu đơn hàng bằng mã đơn hàng hoặc số điện thoại
  - Lịch sử đơn hàng cho user đã đăng nhập
- **Tài khoản**:
  - Đăng ký/Đăng nhập (Email/Password, Google OAuth)
  - Quản lý profile
  - Lịch sử đơn hàng
- **Tin tức & Blog**: Hiển thị bài viết, tin tức, khuyến mãi
- **Liên hệ**: Form liên hệ, thông tin công ty
- **SEO**: Dynamic SEO, Schema.org markup, sitemap.xml

### 🔧 Tính năng Admin

#### Quản lý sản phẩm
- CRUD sản phẩm (tên, mô tả, giá, hình ảnh, video, gallery)
- Quản lý danh mục
- Quản lý flash sales
- Quản lý đánh giá sản phẩm

#### Quản lý đơn hàng
- Xem danh sách đơn hàng
- Cập nhật trạng thái đơn hàng
- Tự động tạo stock out và accounts receivable khi xác nhận đơn
- Tự động trả hàng về kho khi hủy đơn

#### Quản lý kho (Inventory Management)
- **Nhà cung cấp (Suppliers)**: Quản lý thông tin nhà cung cấp
- **Nhập kho (Stock In)**: 
  - Tạo phiếu nhập kho
  - Quản lý lô hàng (batch), hạn sử dụng
  - Tự động tính giá trung bình (FIFO)
  - Tự động tạo accounts payable
- **Xuất kho (Stock Out)**:
  - Xuất kho thủ công
  - Tự động xuất kho khi xác nhận đơn hàng
  - Tính giá vốn theo FIFO
- **Tồn kho (Inventory)**:
  - Xem tồn kho theo lô
  - Lịch sử nhập/xuất
  - Cảnh báo tồn kho thấp
  - Cảnh báo hạn sử dụng

#### Quản lý công nợ (Accounts Management)
- **Công nợ phải trả (Accounts Payable)**:
  - Danh sách công nợ nhà cung cấp
  - Ghi nhận thanh toán
  - Lịch sử thanh toán
  - Phân tích công nợ theo độ tuổi (aging analysis)
- **Công nợ phải thu (Accounts Receivable)**:
  - Danh sách công nợ khách hàng (từ đơn hàng)
  - Ghi nhận thanh toán từ khách hàng
  - Lịch sử thanh toán
  - Phân tích công nợ theo độ tuổi

#### Báo cáo (Reports)
- **Báo cáo kho**:
  - Tổng quan tồn kho (tổng giá trị, số lượng sản phẩm)
  - Báo cáo tồn kho thấp
  - Báo cáo lịch sử nhập/xuất
  - Xuất Excel
- **Báo cáo công nợ**:
  - Báo cáo công nợ phải trả
  - Báo cáo công nợ phải thu
  - Phân tích công nợ theo độ tuổi
  - Xuất Excel

#### Quản lý nội dung
- Quản lý banner (homepage)
- Quản lý bài viết/tin tức
- Quản lý trang giới thiệu
- Quản lý trang chính sách (Privacy, Terms, etc.)
- Quản lý cài đặt website

#### Khác
- Quản lý mã giảm giá (Coupons)
- Quản lý đăng ký newsletter
- Quản lý tin nhắn liên hệ
- Dashboard với thống kê tổng quan
- Google Analytics integration
- Cookie consent management

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18.3.1
- **Language**: TypeScript 5.8.3
- **Build Tool**: Vite 5.4.19
- **Routing**: React Router DOM 6.30.1
- **State Management**: 
  - React Context API
  - TanStack Query (React Query) 5.83.0
- **UI Framework**: 
  - Tailwind CSS 3.4.17
  - shadcn/ui (Radix UI components)
  - Lucide React (Icons)
- **Form Management**: 
  - React Hook Form 7.61.1
  - Zod 3.25.76 (Validation)
- **Rich Text Editor**: CKEditor 5
- **Charts**: Recharts 2.15.4
- **Date Handling**: date-fns 3.6.0
- **SEO**: react-helmet-async 2.0.5

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password, Google OAuth)
- **Storage**: Supabase Storage
- **Edge Functions**: Supabase Edge Functions (Deno)
- **Real-time**: Supabase Realtime

### Development Tools
- **Linting**: ESLint 9.32.0
- **Code Formatting**: Prettier (via ESLint)
- **Type Checking**: TypeScript
- **Package Manager**: npm

## 📦 Cài đặt

### Yêu cầu hệ thống

- Node.js >= 18.x
- npm >= 9.x
- Git

### Các bước cài đặt

1. **Clone repository**
```bash
git clone <repository-url>
cd vinon
```

2. **Cài đặt dependencies**
```bash
npm install
```

3. **Cấu hình environment variables**

Tạo file `.env` trong thư mục gốc:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX (optional)
VITE_SITE_URL=https://yourdomain.com (optional)
```

4. **Chạy development server**
```bash
npm run dev
```

Website sẽ chạy tại `http://localhost:8080`

## ⚙️ Cấu hình

### Supabase Setup

1. **Tạo Supabase project**
   - Truy cập [Supabase Dashboard](https://app.supabase.com/)
   - Tạo project mới
   - Lấy `URL` và `anon key` từ Settings → API

2. **Chạy migrations**
   - Vào SQL Editor trong Supabase Dashboard
   - Chạy các file migration trong thứ tự từ `supabase/migrations/`
   - Hoặc sử dụng Supabase CLI:
   ```bash
   supabase migration up
   ```

3. **Cấu hình Authentication**
   - Vào Authentication → Providers
   - Enable Email provider
   - Enable Google OAuth (cần cấu hình OAuth credentials)
   - Cấu hình Redirect URLs:
     - `http://localhost:8080/admin/login/callback`
     - `https://yourdomain.com/admin/login/callback`

4. **Cấu hình Storage**
   - Tạo buckets cho images, videos
   - Cấu hình RLS policies cho buckets

### Google OAuth Setup

1. Tạo OAuth 2.0 credentials trong [Google Cloud Console](https://console.cloud.google.com/)
2. Thêm Authorized redirect URIs:
   - `https://your-project.supabase.co/auth/v1/callback`
3. Copy Client ID và Client Secret vào Supabase Dashboard → Authentication → Providers → Google

### Google Analytics Setup

1. Tạo GA4 property trong [Google Analytics](https://analytics.google.com/)
2. Lấy Measurement ID (format: `G-XXXXXXXXXX`)
3. Thêm vào `.env` file: `VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX`

## 📁 Cấu trúc thư mục

```
vinon/
├── public/                 # Static files
│   ├── favicon.ico
│   ├── robots.txt
│   └── sitemap.xml
├── src/
│   ├── assets/            # Images, fonts
│   ├── components/        # React components
│   │   ├── admin/        # Admin components
│   │   ├── seo/          # SEO components
│   │   └── ui/           # shadcn/ui components
│   ├── contexts/          # React contexts
│   │   ├── AuthContext.tsx
│   │   ├── CartContext.tsx
│   │   └── AdminContext.tsx
│   ├── hooks/            # Custom React hooks
│   ├── integrations/     # Third-party integrations
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── types.ts
│   ├── lib/              # Utility libraries
│   ├── pages/            # Page components
│   │   ├── admin/        # Admin pages
│   │   └── ...           # Public pages
│   ├── utils/            # Utility functions
│   ├── App.tsx           # Main app component
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
├── supabase/
│   ├── migrations/       # Database migrations
│   ├── functions/        # Edge Functions
│   │   ├── ai-chatbot/
│   │   ├── send-admin-otp/
│   │   └── sitemap/
│   └── config.toml       # Supabase config
├── .env                  # Environment variables (not in git)
├── .env.example          # Example env file
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

## 🚀 Hướng dẫn sử dụng

### Development

```bash
# Chạy development server
npm run dev

# Build cho production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Database Migrations

```bash
# Tạo migration mới
supabase migration new migration_name

# Chạy migrations
supabase migration up

# Reset database (cẩn thận!)
supabase db reset
```

### Admin Panel

1. Truy cập `/admin/login`
2. Đăng nhập bằng email admin hoặc Google OAuth
3. Email admin mặc định: `nguyenthanhphatdeveloper@gmail.com`
4. Cần có role `admin` trong bảng `user_roles`

### Tạo Admin User

```sql
-- 1. Tạo user trong Supabase Auth (qua UI hoặc API)
-- 2. Thêm role admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('user-uuid-here', 'admin');
```

## 🌐 Deployment

### Build cho Production

```bash
npm run build
```

Output sẽ ở thư mục `dist/`

### Environment Variables cho Production

Tạo file `.env.production` hoặc set trong hosting platform:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_SITE_URL=https://yourdomain.com
```

### Supabase Configuration cho Production

1. **OAuth Redirect URLs**
   - Vào Authentication → URL Configuration
   - Thêm:
     - `https://yourdomain.com/admin/login/callback`
     - `https://www.yourdomain.com/admin/login/callback`

2. **Site URL**
   - Vào Authentication → URL Configuration
   - Set Site URL: `https://yourdomain.com`

### Hosting Options

#### Option 1: Static Hosting (Vercel, Netlify, Cloudflare Pages)
- Upload thư mục `dist/`
- Cấu hình SPA routing (tất cả routes → `index.html`)
- Set environment variables

#### Option 2: VPS/Server (Nginx, Apache)
- Upload `dist/` lên server
- Cấu hình web server cho SPA routing
- Enable HTTPS (Let's Encrypt)

Xem file `nginx.conf.example` và `.htaccess` để biết cấu hình chi tiết.

## 📚 API Documentation

### Supabase Client

Tất cả API calls đều thông qua Supabase client:

```typescript
import { supabase } from "@/integrations/supabase/client";

// Query example
const { data, error } = await supabase
  .from("products")
  .select("*")
  .eq("is_active", true);
```

### Database Schema

Xem file `supabase/migrations/` để biết cấu trúc database chi tiết.

#### Tables chính:
- `products` - Sản phẩm
- `orders` - Đơn hàng
- `order_items` - Chi tiết đơn hàng
- `suppliers` - Nhà cung cấp
- `stock_in_transactions` - Phiếu nhập kho
- `stock_out_transactions` - Phiếu xuất kho
- `inventory_lots` - Lô hàng
- `accounts_payable` - Công nợ phải trả
- `accounts_receivable` - Công nợ phải thu
- `user_roles` - Vai trò người dùng
- `profiles` - Thông tin người dùng
- `posts` - Bài viết/tin tức
- `product_reviews` - Đánh giá sản phẩm
- `flash_sales` - Flash sales
- `coupons` - Mã giảm giá
- `site_settings` - Cài đặt website

### SQL Functions

#### Order Lookup
```sql
-- Tra cứu đơn hàng
SELECT * FROM lookup_guest_order(
  p_order_code := 'VN20250101000001',
  p_customer_phone := '0372777911'
);

-- Lấy chi tiết đơn hàng
SELECT * FROM lookup_guest_order_items(
  p_order_id := 'order-uuid-here'
);
```

#### Inventory Functions
- `generate_supplier_code()` - Tạo mã nhà cung cấp
- `generate_stock_in_code()` - Tạo mã phiếu nhập
- `generate_stock_out_code()` - Tạo mã phiếu xuất
- `get_product_stock()` - Lấy tồn kho sản phẩm
- `get_product_average_cost()` - Tính giá trung bình
- `stock_out_fifo()` - Xuất kho theo FIFO

## 🐛 Troubleshooting

### Lỗi thường gặp

#### 1. OAuth không hoạt động
- **Nguyên nhân**: Redirect URLs chưa được cấu hình
- **Giải pháp**: Thêm redirect URLs vào Supabase Dashboard → Authentication → URL Configuration

#### 2. Build lỗi
- **Nguyên nhân**: Thiếu dependencies hoặc TypeScript errors
- **Giải pháp**: 
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  npm run build
  ```

#### 3. Database migration lỗi
- **Nguyên nhân**: Migrations chạy không đúng thứ tự hoặc conflict
- **Giải pháp**: Kiểm tra logs trong Supabase Dashboard → Logs → Postgres Logs

#### 4. Images không load
- **Nguyên nhân**: Storage bucket chưa được cấu hình hoặc RLS policy chưa đúng
- **Giải pháp**: Kiểm tra Storage buckets và RLS policies trong Supabase Dashboard

#### 5. Order lookup không tìm thấy đơn hàng
- **Nguyên nhân**: Function `lookup_guest_order` chỉ tìm guest orders
- **Giải pháp**: Đã được fix trong migration `20250102000007_fix_order_lookup_for_all_orders.sql`

### Debug Mode

Để bật debug mode, set environment variable:
```env
NODE_ENV=development
```

Console logs sẽ hiển thị trong development mode.

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tạo Pull Request

### Code Style

- Sử dụng TypeScript strict mode
- Follow ESLint rules
- Format code với Prettier
- Viết comments cho complex logic
- Wrap console statements trong `process.env.NODE_ENV === 'development'`

## 📄 License

Private project - All rights reserved

## 📞 Liên hệ

- **Email**: info@vinon.vn
- **Phone**: 0372777911
- **Address**: 160/91/51/2/24 Khu Phố 4, Nguyễn Văn Quỳ, Phường Phú Thuận, Quận 7, TP. Hồ Chí Minh

## 🙏 Acknowledgments

- [Supabase](https://supabase.com/) - Backend infrastructure
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Vite](https://vitejs.dev/) - Build tool
- [React](https://react.dev/) - UI framework

---

**Made with ❤️ for Tăm Nhựa Vinon**

