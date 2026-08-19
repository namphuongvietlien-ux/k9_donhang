import csv
import json
import os
from pathlib import Path
from urllib import error, request

CSV_PATH = Path(r"C:\Users\ASUS\Downloads\mau-nhap-khau-danh-muc (3).csv")
ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"


def load_env_file(path: Path):
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def get_supabase_config():
    env = load_env_file(ENV_PATH)
    url = env.get("VITE_SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = env.get("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise RuntimeError(
            "Thiếu biến môi trường. Cần VITE_SUPABASE_URL và SUPABASE_SECRET_KEY trong .env hoặc env shell."
        )
    return url.rstrip("/"), key


SUPABASE_URL, SUPABASE_SECRET_KEY = get_supabase_config()


def parse_csv(path: Path):
    products_by_slug = {}
    duplicate_count = 0
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sku = (row.get("Mã hàng") or "").strip()
            if not sku:
                continue
            product = {
                "slug": sku,
                "barcode": (row.get("Mã vạch") or "").strip(),
                "barcode_2": None,
                "barcodes": [],
                "name": (row.get("Tên hàng") or "").strip(),
                "unit": (row.get("ĐVT") or "").strip(),
                "unit_2": None,
                "parent_sku": (row.get("Parent_SKU") or "").strip() or None,
                "price": 0,
                "original_price": None,
                "category": None,
                "is_active": True,
            }
            if product["barcode"]:
                product["barcodes"].append(
                    {"barcode": product["barcode"], "unit": product["unit"] or None}
                )
            existing = products_by_slug.get(sku)
            if existing is None:
                products_by_slug[sku] = product
                continue

            duplicate_count += 1
            for field in ("name", "parent_sku"):
                if not existing[field] and product[field]:
                    existing[field] = product[field]

            barcode = product["barcode"]
            if barcode and barcode not in {row["barcode"] for row in existing["barcodes"]}:
                existing["barcodes"].append(
                    {"barcode": barcode, "unit": product["unit"] or None}
                )
                if existing["barcode"]:
                    if not existing["barcode_2"]:
                        existing["barcode_2"] = barcode
                        existing["unit_2"] = product["unit"] or None
                else:
                    existing["barcode"] = barcode
                    existing["unit"] = product["unit"]

    missing_name_skus = [
        product["slug"] for product in products_by_slug.values() if not product["name"]
    ]
    if missing_name_skus:
        sample = ", ".join(missing_name_skus[:10])
        raise ValueError(
            f"Có {len(missing_name_skus)} SKU không có tên hàng: {sample}"
        )
    if duplicate_count:
        print(f"Gộp {duplicate_count} dòng SKU trùng trong CSV.")
    return list(products_by_slug.values())


def rest_request(method: str, path: str, payload=None):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    if method == "PATCH":
        headers["Prefer"] = "resolution=merge-duplicates"
    req = request.Request(url, method=method, headers=headers, data=data)
    with request.urlopen(req, timeout=120) as res:
        raw = res.read()
        if not raw:
            return []
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return raw.decode("utf-8", errors="replace")


def disable_all_products():
    print("[1/4] Ẩn toàn bộ danh mục cũ...")
    response = rest_request(
        "PATCH",
        "/products?is_active=not.eq.false",
        {"is_active": False},
    )
    print(f"  -> response: {response if isinstance(response, str) else type(response).__name__}")


def upsert_products(rows):
    print(f"[2/4] Upload {len(rows)} SKU mới vào Supabase...")
    chunk_size = 25
    failed_rows = []

    for idx in range(0, len(rows), chunk_size):
        chunk = rows[idx: idx + chunk_size]
        product_chunk = [
            {key: value for key, value in product.items() if key != "barcodes"}
            for product in chunk
        ]
        batch_number = idx // chunk_size + 1
        try:
            rest_request("POST", "/products?on_conflict=slug", product_chunk)
            print(f"  -> batch {batch_number}: {len(chunk)} dòng")
        except error.HTTPError as exc:
            print(f"  -> batch {batch_number} lỗi HTTP {exc.code}; thử từng SKU để cô lập lỗi...")
            for product in chunk:
                try:
                    product_payload = {
                        key: value for key, value in product.items() if key != "barcodes"
                    }
                    rest_request("POST", "/products?on_conflict=slug", [product_payload])
                except error.HTTPError as row_error:
                    failed_rows.append((product["slug"], row_error.code))
                    print(f"     x SKU lỗi: {product['slug']} (HTTP {row_error.code})")

    if failed_rows:
        failed_skus = ", ".join(sku for sku, _ in failed_rows)
        raise RuntimeError(
            f"Không thể import {len(failed_rows)} SKU: {failed_skus}. "
            "Các SKU còn lại đã được import."
        )


def upsert_barcodes(rows):
    barcode_rows = [
        {
            "product_slug": product["slug"],
            "barcode": barcode["barcode"],
            "unit": barcode["unit"],
        }
        for product in rows
        for barcode in product["barcodes"]
    ]
    print(f"[3/4] Lưu {len(barcode_rows)} mã vạch theo đúng CSV...")
    chunk_size = 200
    for idx in range(0, len(barcode_rows), chunk_size):
        rest_request(
            "POST",
            "/product_barcodes?on_conflict=product_slug,barcode",
            barcode_rows[idx: idx + chunk_size],
        )


def active_count():
    print("[4/4] Đếm danh mục đang active...")
    url = f"{SUPABASE_URL}/rest/v1/products?is_active=eq.true"
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Prefer": "count=exact",
    }
    req = request.Request(url, method="HEAD", headers=headers)
    with request.urlopen(req, timeout=120) as res:
        content_range = res.headers.get("Content-Range", "")
    print(f"  -> active_count={content_range.rsplit('/', 1)[-1] if '/' in content_range else 'không xác định'}")


def main():
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy file CSV: {CSV_PATH}")

    rows = parse_csv(CSV_PATH)
    print(f"Đọc được {len(rows)} SKU từ CSV: {CSV_PATH}")

    disable_all_products()
    upsert_products(rows)
    upsert_barcodes(rows)
    active_count()

    print("\nHoàn tất. Nếu active_count = số SKU CSV, bạn đã chuyển sang danh mục mới thành công.")


if __name__ == "__main__":
    main()