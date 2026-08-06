/** File mẫu CSV (mở được bằng Excel) — khớp cột import K9/GAS */

export type TemplateKind = "stockQ7" | "catalogFast" | "orderDhDc" | "transferDc";

const TEMPLATES: Record<
  TemplateKind,
  { filename: string; headers: string[]; sampleRows: string[][] }
> = {
  stockQ7: {
    filename: "mau-ton-kho-Q7.csv",
    headers: ["Mã hàng", "Mã vạch", "Tên hàng", "ĐVT", "Tồn kho"],
    sampleRows: [
      ["TAM1014", "", "Tăm nhựa Vinon hộp 100", "Hộp", "120"],
      ["SUA001", "", "Sữa tắm chó 500ml", "Chai", "45"],
    ],
  },
  catalogFast: {
    filename: "mau-nhap-khau-danh-muc.csv",
    headers: ["Mã hàng", "Mã vạch", "Tên hàng", "ĐVT", "Parent_SKU"],
    sampleRows: [
      ["TAM1014", "8936000000001", "Tăm nhựa Vinon hộp 100", "Hộp", ""],
      ["TAM1014-L", "", "Tăm nhựa Vinon lẻ", "Cái", "TAM1014"],
    ],
  },
  orderDhDc: {
    filename: "mau-phieu-DH-DC.csv",
    headers: ["Mã hàng", "Tên hàng", "ĐVT", "Số lượng"],
    sampleRows: [
      ["TAM1014", "Tăm nhựa Vinon hộp 100", "Hộp", "10"],
      ["SUA001", "Sữa tắm chó 500ml", "Chai", "5"],
    ],
  },
  transferDc: {
    filename: "mau-dieu-chuyen-DC.csv",
    headers: [
      "Mã lệnh",
      "Mã hàng",
      "Tên hàng",
      "ĐVT",
      "Số lượng xuất",
      "Kho xuất",
      "Kho nhận",
      "Ghi chú",
    ],
    sampleRows: [
      ["DC-100001", "TAM1014", "Tăm nhựa Vinon hộp 100", "Hộp", "20", "Q7", "Q8", ""],
      ["DC-100001", "SUA001", "Sữa tắm chó 500ml", "Chai", "8", "Q7", "Q8", ""],
      ["", "CAT002", "Cát vệ sinh 5kg", "Bao", "3", "Q7", "Q5", "Giao buổi sáng"],
    ],
  },
};

function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return ["\uFEFF" + headers.map(esc).join(",")]
    .concat(rows.map((r) => r.map(esc).join(",")))
    .join("\r\n");
}

export function downloadImportTemplate(kind: TemplateKind) {
  const t = TEMPLATES[kind];
  const blob = new Blob([toCsv(t.headers, t.sampleRows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = t.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function getTemplateLabel(kind: TemplateKind): string {
  switch (kind) {
    case "stockQ7":
      return "Mẫu file tồn kho";
    case "catalogFast":
      return "Mẫu file nhập khẩu danh mục";
    case "orderDhDc":
      return "Mẫu phiếu DH/DC";
    case "transferDc":
      return "Mẫu điều chuyển DC";
  }
}
