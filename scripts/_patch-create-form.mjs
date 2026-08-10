import fs from "fs";

const path = "src/components/admin/CreateWarehouseOrderForm.tsx";
let s = fs.readFileSync(path, "utf8");
const start = s.indexOf(
  '      <div className="border rounded-lg p-4 space-y-3 bg-card relative">',
);
const endMarker = "      <AlertDialog open={dupOpen}";
const end = s.indexOf(endMarker);
if (start < 0 || end < 0) {
  console.error("markers", start, end);
  process.exit(1);
}

const replacement = fs.readFileSync(
  "scripts/_create-form-cart-block.tsx.txt",
  "utf8",
);

fs.writeFileSync(path, s.slice(0, start) + replacement + s.slice(end));
console.log("ok", { start, end });
