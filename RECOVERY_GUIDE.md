# Hướng dẫn khôi phục quyền Super Admin

Nếu bạn vô tình xóa quyền của chính mình và không thể đăng nhập vào admin panel, có 3 cách để khôi phục:

## Cách 1: Sử dụng trang Recovery (Khuyến nghị)

1. Đảm bảo bạn đã đăng nhập bằng Google với email `nguyenthanhphatdeveloper@gmail.com`
2. Truy cập: `http://your-domain.com/admin/recovery`
3. Nhập email của bạn
4. Nhấn "Khôi phục quyền Super Admin"
5. Đăng nhập lại sau khi khôi phục thành công

## Cách 2: Chạy Migration SQL trong Supabase Dashboard

1. Mở Supabase Dashboard → SQL Editor
2. Chạy migration: `supabase/migrations/20250107000001_restore_super_admin_role.sql`
3. Hoặc chạy SQL trực tiếp:

```sql
DO $$
DECLARE
  super_admin_id UUID;
  user_email TEXT := 'nguyenthanhphatdeveloper@gmail.com';
BEGIN
  SELECT id INTO super_admin_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  IF super_admin_id IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = super_admin_id
      AND role IN ('super_admin'::app_role, 'manager'::app_role, 'staff'::app_role, 'admin'::app_role);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (super_admin_id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Super Admin role restored for: %', user_email;
  END IF;
END;
$$;
```

## Cách 3: Sử dụng RPC Function (Nếu đã deploy function)

1. Mở Supabase Dashboard → SQL Editor
2. Chạy migration: `supabase/migrations/20250107000002_create_recovery_function.sql` (nếu chưa chạy)
3. Chạy SQL:

```sql
SELECT public.restore_super_admin_role('nguyenthanhphatdeveloper@gmail.com', NULL);
```

## Lưu ý bảo mật

- Trang recovery chỉ hoạt động với các email được liệt kê trong `ALLOWED_RECOVERY_EMAILS`
- Bạn phải đăng nhập trước khi sử dụng trang recovery
- Email nhập vào phải khớp với email đang đăng nhập
- Sau khi khôi phục, bạn sẽ cần đăng nhập lại

## Ngăn chặn vấn đề này trong tương lai

Đã thêm logic trong `AdminUsers.tsx` để:
- Ngăn chặn user tự xóa quyền của chính mình
- Ngăn chặn xóa quyền của tài khoản `super_admin` từ giao diện

Nếu bạn vẫn gặp vấn đề, vui lòng liên hệ support hoặc chạy SQL trực tiếp trong Supabase Dashboard.
