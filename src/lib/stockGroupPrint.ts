/** In bảng tồn theo nhóm SKU — popup + window.print */

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type StockPrintRow = {
  slug: string;
  name: string;
  unit: string;
  qty: number;
  updatedAtLabel: string;
  matched?: boolean;
};

export type StockPrintGroup = {
  title: string;
  rows: StockPrintRow[];
};

export function printStockGroups(options: {
  warehouseLabel: string;
  latestUpdatedAt: string;
  groups: StockPrintGroup[];
  subtitle?: string;
}): void {
  const groups = options.groups.filter((g) => g.rows.length);
  if (!groups.length) {
    alert("Không có dòng để in.");
    return;
  }

  let body = "";
  for (const g of groups) {
    body +=
      `<tr class="gh"><td colspan="6">${escapeHtml(g.title)} (${g.rows.length})</td></tr>`;
    g.rows.forEach((r, i) => {
      body +=
        `<tr class="${r.matched ? "hit" : ""}">` +
        `<td class="c">${i + 1}</td>` +
        `<td class="code">${escapeHtml(r.slug)}</td>` +
        `<td>${escapeHtml(r.name)}</td>` +
        `<td>${escapeHtml(r.unit)}</td>` +
        `<td class="num">${r.qty.toLocaleString("vi-VN")}</td>` +
        `<td class="num">${escapeHtml(r.updatedAtLabel)}</td>` +
        `</tr>`;
    });
  }

  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<title>Tồn kho ${escapeHtml(options.warehouseLabel)}</title>` +
    `<style>
      body{font-family:"Segoe UI",Arial,sans-serif;margin:10px;color:#0f172a;font-size:12px;}
      h1{font-size:16px;margin:0 0 2px;}
      .sub{color:#64748b;font-size:11px;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #94a3b8;padding:3px 5px;vertical-align:middle;}
      th{background:#e2e8f0;text-align:left;font-weight:700;}
      .c{text-align:center;color:#64748b;width:28px;}
      .code{font-family:ui-monospace,Consolas,monospace;font-size:11px;}
      .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
      tr.gh td{background:#e0f2fe;font-weight:700;color:#0c4a6e;}
      tr.hit td{background:#fef9c3;}
      .toolbar{margin-bottom:8px;}
      @media print{.toolbar{display:none!important;} body{margin:0;} @page{margin:8mm;size:A4 portrait;}}
    </style></head><body>` +
    `<div class="toolbar"><button type="button" onclick="window.print()">In</button></div>` +
    `<h1>Tồn kho · ${escapeHtml(options.warehouseLabel)}</h1>` +
    `<div class="sub">Cập nhật tồn mới nhất: ${escapeHtml(options.latestUpdatedAt)}` +
    (options.subtitle ? ` · ${escapeHtml(options.subtitle)}` : "") +
    ` · ${groups.length} nhóm · ${total} dòng</div>` +
    `<table><thead><tr><th>#</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Tồn</th><th>Cập nhật tồn</th></tr></thead>` +
    `<tbody>${body}</tbody></table></body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Trình duyệt chặn popup. Cho phép rồi thử lại.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
}
