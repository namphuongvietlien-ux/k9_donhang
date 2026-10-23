#!/usr/bin/env python3
"""
Dọn dẹp danh mục: vô hiệu hóa (xóa mềm) các mã sản phẩm đang active trong
Supabase nhưng KHÔNG còn trong file "Danh sách hàng hóa (38).xlsx".

Quy trình:
  1. Đọc Excel (pandas, header=2 — 2 dòng đầu là tiêu đề hệ thống), lấy cột
     "Mã hàng hóa" (đã .strip()).
  2. Lấy toàn bộ mã sản phẩm active (is_active=true) từ bảng products.
     LƯU Ý: bảng products dùng cột `slug` làm mã hàng (không có cột `code`).
  3. Tìm mã có trong DB nhưng KHÔNG có trong Excel -> xóa mềm (is_active=False).
     Tuyệt đối KHÔNG dùng DELETE.

An toàn:
  - Mặc định DRY-RUN (chỉ in, không ghi). Phải thêm --apply để thực sự cập nhật.
  - So khớp bằng mã đã chuẩn hóa (UPPER + bỏ dấu + bỏ ký tự không chữ-số) để
    tránh tắt nhầm do khác hoa/thường hay dấu gạch nối (vd "B-101" == "B101").
  - Nếu tỉ lệ bị tắt > 50%, chặn lại (trừ khi thêm --force) để phòng file thiếu.

Cài phụ thuộc:
  pip install pandas openpyxl requests

Biến môi trường (đọc từ .env / .env.local hoặc shell):
  VITE_SUPABASE_URL  và  SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_SECRET_KEY)

Ví dụ:
  python clean_old_products.py                       # DRY-RUN (xem trước)
  python clean_old_products.py --apply               # thực sự vô hiệu hóa
  python clean_old_products.py --file "Danh sách hàng hóa (38).xlsx" --apply
  python clean_old_products.py --self-test           # kiểm thử logic, không cần DB
"""

from __future__ import annotations

import argparse
import os
import sys
import unicodedata

DEFAULT_FILE = "Danh sách hàng hóa (38).xlsx"
CODE_HEADER = "Mã hàng hóa"
NAME_HEADER = "TEN HANG HOA"
PAGE_SIZE = 1000
UPDATE_BATCH = 100
HIGH_RATIO_GUARD = 0.5


def fold_code(value) -> str:
    """Chuẩn hóa mã để so khớp: bỏ dấu, viết hoa, chỉ giữ A-Z/0-9."""
    s = "" if value is None else str(value)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace("đ", "d").replace("Đ", "D")
    s = s.upper()
    return "".join(ch for ch in s if ch.isalnum())


def load_env(root: str) -> None:
    """Nạp .env / .env.local (không ghi đè biến đã có sẵn trong shell)."""
    for name in (".env", ".env.local"):
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip()
                if (val.startswith('"') and val.endswith('"')) or (
                    val.startswith("'") and val.endswith("'")
                ):
                    val = val[1:-1]
                os.environ.setdefault(key, val)


def read_excel_codes(path: str, header: int, code_col: str, name_col: str):
    """Trả về (danh sách mã đã strip, tập mã đã chuẩn hóa)."""
    import pandas as pd

    df = pd.read_excel(path, header=header, engine="openpyxl")
    if code_col not in df.columns:
        raise SystemExit(
            f"Không thấy cột '{code_col}' trong Excel. Các cột: {list(df.columns)}"
        )
    series = df[code_col].dropna().astype(str).str.strip()
    series = series[series != ""]
    codes = series.tolist()
    norm = {fold_code(c) for c in codes if fold_code(c)}
    # Ghi chú: name_col chỉ để kiểm tra tồn tại, phục vụ log nếu cần mở rộng.
    if name_col not in df.columns:
        print(f"  (cảnh báo: không thấy cột '{name_col}', vẫn tiếp tục)")
    return codes, norm


def get_credentials():
    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
    )
    if not url or not key:
        raise SystemExit(
            "Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY/"
            "SUPABASE_SECRET_KEY (service role để bypass RLS khi update)."
        )
    return url.rstrip("/"), key


def fetch_active_products(url: str, key: str, code_column: str):
    """Lấy toàn bộ product active (phân trang 1000). Trả về list dict."""
    import requests

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    out = []
    offset = 0
    while True:
        q = (
            f"{url}/rest/v1/products"
            f"?select=id,{code_column},name"
            f"&is_active=eq.true"
            f"&order={code_column}.asc"
            f"&limit={PAGE_SIZE}&offset={offset}"
        )
        resp = requests.get(q, headers=headers, timeout=60)
        if resp.status_code >= 400:
            raise SystemExit(f"Lỗi đọc products ({resp.status_code}): {resp.text}")
        rows = resp.json()
        out.extend(rows)
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return out


def compute_orphans(products, excel_norm, code_column: str):
    """Product active có mã (chuẩn hóa) KHÔNG nằm trong tập Excel."""
    orphans = []
    for p in products:
        raw = p.get(code_column)
        key = fold_code(raw)
        if not key:
            continue  # mã rỗng -> không đụng cho an toàn
        if key not in excel_norm:
            orphans.append(p)
    return orphans


def disable_products(url: str, key: str, orphans, code_column: str, batch: int):
    """PATCH is_active=false theo id, batch. Trả về số dòng đã cập nhật."""
    import requests

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    updated = 0
    ids = [p["id"] for p in orphans if p.get("id")]
    for i in range(0, len(ids), batch):
        chunk = ids[i : i + batch]
        in_list = ",".join(chunk)
        q = f"{url}/rest/v1/products?id=in.({in_list})&is_active=eq.true"
        resp = requests.patch(q, headers=headers, json={"is_active": False}, timeout=60)
        if resp.status_code >= 400:
            raise SystemExit(
                f"Lỗi cập nhật batch {len(chunk)} ({resp.status_code}): {resp.text}"
            )
        updated += len(chunk)
        print(f"  Đã vô hiệu hóa batch: +{len(chunk)} (tổng {updated})")
    return updated


def run_self_test(file_path: str, header: int, code_col: str, name_col: str) -> int:
    print("== SELF-TEST (không kết nối DB) ==")
    fails = 0

    def check(label, cond):
        nonlocal fails
        if not cond:
            fails += 1
        print(f"{'PASS' if cond else 'FAIL'}  {label}")

    # fold_code
    check("fold 'B-101' == 'B101'", fold_code("B-101") == fold_code("B101") == "B101")
    check("fold ' b-101 ' == 'B101' (strip + upper)", fold_code(" b-101 ") == "B101")
    check("fold bỏ dấu 'Mã Đ' giữ chữ-số", fold_code("MĐ-01") == "MD01")
    check("fold None -> ''", fold_code(None) == "")

    # đọc Excel thật
    if os.path.isfile(file_path):
        codes, norm = read_excel_codes(file_path, header, code_col, name_col)
        check("đọc Excel ra mã (>0)", len(codes) > 0)
        check("có mã mẫu 'B-101'", fold_code("B-101") in norm)
        print(f"   -> {len(codes)} mã, {len(norm)} mã chuẩn hóa")
    else:
        print(f"   (bỏ qua đọc Excel: không thấy '{file_path}')")
        norm = {fold_code(x) for x in ["B-101", "BLP1004"]}

    # compute_orphans với DB giả
    fake_db = [
        {"id": "1", "slug": "B-101", "name": "Trong Excel (giữ)"},
        {"id": "2", "slug": "b101", "name": "Khác hoa/gạch nhưng vẫn khớp (giữ)"},
        {"id": "3", "slug": "ZZZ-999", "name": "Không có trong Excel (tắt)"},
        {"id": "4", "slug": "", "name": "Mã rỗng (bỏ qua, không đụng)"},
    ]
    orphans = compute_orphans(fake_db, norm, "slug")
    ids = sorted(o["id"] for o in orphans)
    check("orphan đúng = chỉ id '3'", ids == ["3"])
    check("giữ mã khớp fold (B-101 / b101)", all(i not in ids for i in ("1", "2")))
    check("bỏ qua mã rỗng (id '4')", "4" not in ids)

    print("\n" + ("ALL PASS" if fails == 0 else f"{fails} FAIL(S)"))
    return 0 if fails == 0 else 1


def main() -> int:
    root = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Xóa mềm mã sản phẩm không còn trong Excel.")
    ap.add_argument("--file", default=os.path.join(root, DEFAULT_FILE), help="Đường dẫn Excel.")
    ap.add_argument("--header", type=int, default=2, help="Dòng header (0-based). Mặc định 2.")
    ap.add_argument("--code-column", default="slug", help="Cột mã trong bảng products (mặc định slug).")
    ap.add_argument("--apply", action="store_true", help="Thực sự ghi (mặc định DRY-RUN).")
    ap.add_argument("--force", action="store_true", help="Bỏ chặn khi tỉ lệ tắt > 50%%.")
    ap.add_argument("--self-test", action="store_true", help="Chạy kiểm thử logic, không cần DB.")
    args = ap.parse_args()

    if args.self_test:
        return run_self_test(args.file, args.header, CODE_HEADER, NAME_HEADER)

    load_env(root)

    if not os.path.isfile(args.file):
        raise SystemExit(f"Không thấy file Excel: {args.file}")

    print(f"Đọc Excel: {args.file} (header={args.header})")
    excel_codes, excel_norm = read_excel_codes(args.file, args.header, CODE_HEADER, NAME_HEADER)
    print(f"  Mã trong Excel: {len(excel_codes)} (chuẩn hóa unique: {len(excel_norm)})")

    url, key = get_credentials()
    print("Lấy sản phẩm active từ Supabase ...")
    products = fetch_active_products(url, key, args.code_column)
    print(f"  Sản phẩm active trong DB: {len(products)}")

    orphans = compute_orphans(products, excel_norm, args.code_column)
    print(f"\n=== Sẽ vô hiệu hóa {len(orphans)} mã (có trong DB, KHÔNG có trong Excel) ===")
    for p in orphans:
        print(f"  - {p.get(args.code_column)} | {p.get('name')}")

    if not orphans:
        print("\nKhông có mã nào cần vô hiệu hóa. Xong.")
        return 0

    ratio = len(orphans) / max(1, len(products))
    print(f"\nTỉ lệ tắt: {ratio:.1%} ({len(orphans)}/{len(products)})")
    if ratio > HIGH_RATIO_GUARD and args.apply and not args.force:
        raise SystemExit(
            f"CHẶN: tỉ lệ tắt {ratio:.1%} > {HIGH_RATIO_GUARD:.0%}. "
            "Kiểm tra lại file Excel có đủ không. Thêm --force nếu chắc chắn."
        )

    if not args.apply:
        print("\nDRY-RUN (chưa ghi DB). Chạy lại với --apply để thực sự vô hiệu hóa.")
        return 0

    print("\n--- Ghi database (xóa mềm is_active=False) ---")
    updated = disable_products(url, key, orphans, args.code_column, UPDATE_BATCH)
    print(f"\nXong. Đã vô hiệu hóa {updated} mã.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
