/**
 * Hub quản trị danh mục — GAS admin tabs:
 * 1. Danh Mục & Biến Thể (Parent_SKU)
 * 2. Đồng Bộ MISA & Tồn Kho
 * 3. Quản Lý & Khóa Đơn Hàng (NEW / khóa / hết hàng)
 * 4. Cài Đặt Hệ Thống
 */
import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  Loader2,
  Lock,
  Package,
  PackageX,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CatalogStockImport from "@/components/admin/CatalogStockImport";
import ProductGiftsPanel from "@/components/admin/ProductGiftsPanel";
import {
  filterCatalogFlagItems,
  useCatalogFlagAdminList,
  useCreateCatalogSku,
  useSaveCatalogFlags,
  useSaveChildVariants,
  useVariantGroups,
  type CatalogFlagAdminItem,
  type ChildVariantDraft,
  type VariantGroup,
} from "@/hooks/useCatalogFlags";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import { cn } from "@/lib/utils";

type FlagKind = "new" | "lock" | "out";

type SkuCodeMapping = {
  short_slug: string;
  long_slug: string;
  barcode: string;
  created_at: string;
};

function SkuCodeMappingManager() {
  const [shortSlug, setShortSlug] = useState("");
  const [longSlug, setLongSlug] = useState("");
  const [rows, setRows] = useState<SkuCodeMapping[]>([]);
  const [saving, setSaving] = useState(false);

  const loadMappings = async () => {
    const { data, error } = await supabase
      .from("sku_code_mappings" as never)
      .select("short_slug,long_slug,barcode,created_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Không tải được danh sách mapping mã hàng.");
      return;
    }
    setRows((data || []) as SkuCodeMapping[]);
  };

  useEffect(() => {
    void loadMappings();
  }, []);

  const saveMapping = async () => {
    const oldCode = normalizeOrderCodeText(shortSlug);
    const newCode = normalizeOrderCodeText(longSlug);
    if (!oldCode || !newCode) {
      toast.error("Nhập đủ mã cũ và mã mới.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc(
        "save_sku_code_mapping" as never,
        { _short_slug: oldCode, _long_slug: newCode } as never,
      );
      if (error) throw error;
      const updatedRows = Number(data) || 0;
      toast.success(`Đã lưu mapping và đổi ${updatedRows} dòng đơn chưa khóa.`);
      setShortSlug("");
      setLongSlug("");
      await loadMappings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được mapping mã hàng.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Chuyển mã cũ sang mã mới</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Chỉ lưu khi hai mã có cùng mã vạch. Đơn chưa khóa sẽ đổi ngay; đơn tạo sau này tự dùng mã mới.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1"><Label htmlFor="short-sku">Mã cũ (ngắn)</Label><Input id="short-sku" value={shortSlug} onChange={(event) => setShortSlug(event.target.value)} placeholder="VD: TAC1063" /></div>
        <div className="space-y-1"><Label htmlFor="long-sku">Mã mới (dài)</Label><Input id="long-sku" value={longSlug} onChange={(event) => setLongSlug(event.target.value)} placeholder="VD: CTPCHI1029" /></div>
        <Button type="button" onClick={() => void saveMapping()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Lưu & áp dụng</Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-2">Mã cũ</th><th className="p-2">Mã mới</th><th className="p-2">Mã vạch</th></tr></thead><tbody>{rows.map((row) => <tr key={row.short_slug} className="border-t"><td className="p-2 font-mono text-xs">{row.short_slug}</td><td className="p-2 font-mono text-xs">{row.long_slug}</td><td className="p-2 font-mono text-xs">{row.barcode}</td></tr>)}{!rows.length ? <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Chưa có mapping nào.</td></tr> : null}</tbody></table>
      </div>
    </div>
  );
}

function FlagManager({
  kind,
  title,
  hint,
}: {
  kind: FlagKind;
  title: string;
  hint: string;
}) {
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const listQ = useCatalogFlagAdminList("", loaded);
  const saveM = useSaveCatalogFlags();

  const rows = listQ.data || [];
  const filtered = useMemo(
    () => filterCatalogFlagItems(rows, q),
    [rows, q],
  );

  const serverFlag = (r: CatalogFlagAdminItem) => {
    if (kind === "new") return r.isNew;
    if (kind === "lock") return r.isLocked;
    return r.isOutStock;
  };

  const flagOf = (r: CatalogFlagAdminItem) =>
    draft[r.id] !== undefined ? draft[r.id] : serverFlag(r);

  const setFlag = (id: string, v: boolean) =>
    setDraft((d) => ({ ...d, [id]: v }));

  const checkVisible = (v: boolean) => {
    const next = { ...draft };
    for (const r of filtered) next[r.id] = v;
    setDraft(next);
  };

  const onSave = async () => {
    const flags = rows
      .map((r) => {
        const value = draft[r.id] !== undefined ? draft[r.id] : serverFlag(r);
        if (value === serverFlag(r) && draft[r.id] === undefined) return null;
        if (kind === "new") return { id: r.id, isNew: value };
        if (kind === "lock") return { id: r.id, isLocked: value };
        return { id: r.id, isOutStock: value };
      })
      .filter(Boolean) as {
      id: string;
      isNew?: boolean;
      isLocked?: boolean;
      isOutStock?: boolean;
    }[];

    // Nếu user CheckAll trên filtered — gửi toàn bộ draft hiện tại
    const fromDraft = Object.keys(draft).map((id) => {
      const value = draft[id];
      if (kind === "new") return { id, isNew: value };
      if (kind === "lock") return { id, isLocked: value };
      return { id, isOutStock: value };
    });

    const payload = fromDraft.length ? fromDraft : flags;
    if (!payload.length) {
      toast.message("Không có thay đổi để lưu");
      return;
    }

    try {
      const res = await saveM.mutateAsync({ flags: payload });
      toast.success(`Đã lưu ${res.changed} sản phẩm`);
      setDraft({});
      void listQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label className="text-xs">Tìm mã / tên sản phẩm</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gõ để lọc: vịt, TQP1011..."
            className="h-9"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              setLoaded(true);
              void listQ.refetch();
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-9 gap-1.5"
          disabled={listQ.isFetching}
          onClick={() => {
            setLoaded(true);
            void listQ.refetch();
          }}
        >
          {listQ.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Tải danh sách
        </Button>
        <Button
          type="button"
          className="h-9 gap-1.5"
          disabled={!loaded || saveM.isPending || !rows.length}
          onClick={() => void onSave()}
        >
          {saveM.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Lưu
        </Button>
      </div>
      {loaded && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => checkVisible(true)}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            CheckAll (đang hiện)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => checkVisible(false)}
          >
            <Square className="h-3.5 w-3.5" />
            UncheckAll (đang hiện)
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Hiển thị {filtered.length} / {rows.length}. Tick rồi nhấn Lưu.
          </span>
        </div>
      )}
      {!loaded ? (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-slate-50">
          Nhấn &quot;Tải danh sách&quot; để quản lý.
        </p>
      ) : listQ.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto max-h-[min(60vh,520px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 z-10">
              <tr className="text-left text-xs text-slate-600">
                <th className="p-2 w-12">
                  {kind === "new"
                    ? "Hàng Mới"
                    : kind === "lock"
                      ? "Khóa"
                      : "Hết"}
                </th>
                <th className="p-2">Mã hàng</th>
                <th className="p-2">Mã vạch</th>
                <th className="p-2">Tên sản phẩm</th>
                <th className="p-2">ĐVT</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50/80">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={flagOf(r)}
                      onChange={(e) => setFlag(r.id, e.target.checked)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="p-2 font-mono text-xs uppercase">
                    {r.maHang}
                    {r.parentSku ? (
                      <div className="text-[10px] text-muted-foreground uppercase">
                        Parent: {r.parentSku}
                      </div>
                    ) : null}
                    {kind === "out" && r.isOutStock ? (
                      <span className="ml-1 text-[10px] font-bold text-red-600">
                        HẾT HÀNG
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 font-mono text-xs text-slate-600">
                    {r.maVach || "—"}
                  </td>
                  <td className="p-2">{r.tenHang}</td>
                  <td className="p-2 text-xs">{r.dvt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 ? (
            <p className="text-xs text-amber-700 p-2 bg-amber-50">
              Chỉ hiện 500 dòng đầu — hãy lọc mã để chỉnh chính xác.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function VariantManager() {
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editorParent, setEditorParent] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [rows, setRows] = useState<ChildVariantDraft[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    maHang: "",
    tenHang: "",
    maVach: "",
    dvt: "Cái",
    parentSku: "",
  });

  const groupsQ = useVariantGroups(q, loaded);
  const saveChildrenM = useSaveChildVariants();
  const createSkuM = useCreateCatalogSku();

  const groups = groupsQ.data || [];

  const openGroupEditor = (g: VariantGroup) => {
    const parent = normalizeOrderCodeText(g.parentSku);
    setEditorParent(parent);
    const children = g.children.filter(
      (c) =>
        normalizeOrderCodeText(c.parentSku) === parent &&
        normalizeOrderCodeText(c.maHang) !== parent,
    );
    const seed =
      children.length > 0
        ? children
        : g.children.filter(
            (c) => normalizeOrderCodeText(c.maHang) !== parent,
          );
    const list = seed.length ? seed : g.children;
    setRows(
      list.length
        ? list.map((c) => ({
            id: c.id,
            maHang: normalizeOrderCodeText(c.maHang),
            tenHang: c.tenHang || "",
            maVach: c.maVach || "",
            dvt: c.dvt || "Cái",
          }))
        : [{ maHang: "", tenHang: "", maVach: "", dvt: "Cái" }],
    );
    setEditorOpen(true);
  };

  const openNewGroup = () => {
    const parent = normalizeOrderCodeText(q) || "";
    setEditorParent(parent);
    setRows([{ maHang: "", tenHang: "", maVach: "", dvt: "Cái" }]);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorParent("");
    setRows([]);
  };

  const patchRow = (idx: number, patch: Partial<ChildVariantDraft>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        if (patch.maHang != null) {
          next.maHang = normalizeOrderCodeText(patch.maHang);
        }
        return next;
      }),
    );
  };

  const onSaveGroup = async () => {
    const parentSku = normalizeOrderCodeText(editorParent);
    if (!parentSku) {
      toast.error("Nhập Parent_SKU trước khi lưu");
      return;
    }
    try {
      const res = await saveChildrenM.mutateAsync({
        parentSku,
        variants: rows,
      });
      toast.success(
        `Đã lưu Parent ${res.parentSku}: +${res.created} mới, ${res.updated} cập nhật`,
      );
      closeEditor();
      setLoaded(true);
      void groupsQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu");
    }
  };

  const onCreateSku = async () => {
    if (createSkuM.isPending) return;
    const maHang = normalizeOrderCodeText(addForm.maHang);
    if (!maHang) {
      toast.error("Nhập mã hàng trước khi thêm");
      return;
    }
    try {
      // BẮT BUỘC await mutateAsync — chỉ đóng form SAU khi DB xong
      const res = await createSkuM.mutateAsync({
        maHang: addForm.maHang,
        tenHang: addForm.tenHang,
        maVach: addForm.maVach,
        dvt: addForm.dvt,
        parentSku: addForm.parentSku || undefined,
      });
      toast.success(
        res.created
          ? `Đã lưu mã mới thành công: ${res.maHang}`
          : `Đã cập nhật mã ${res.maHang}`,
      );
      setAddOpen(false);
      setAddForm({
        maHang: "",
        tenHang: "",
        maVach: "",
        dvt: "Cái",
        parentSku: "",
      });
      setLoaded(true);
      // Refetch list nền — không await
      void groupsQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi thêm mã");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Quản lý Biến thể (Parent_SKU)</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Giống GAS: mở nhóm → ＋ Thêm mã con → Lưu. Hoặc thêm mã hàng mới độc
          lập.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label className="text-xs">Tìm Parent_SKU / tên</Label>
          <Input
            value={q}
            onChange={(e) =>
              setQ(normalizeOrderCodeText(e.target.value) || e.target.value)
            }
            placeholder="VD: TQP1011..."
            className="h-9 font-mono uppercase"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-9 gap-1.5"
          disabled={groupsQ.isFetching}
          onClick={() => {
            setLoaded(true);
            void groupsQ.refetch();
          }}
        >
          {groupsQ.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Tải nhóm
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-1.5"
          onClick={() => openNewGroup()}
        >
          <Plus className="h-3.5 w-3.5" />
          Nhóm mới / Thêm mã con
        </Button>
        <Button
          type="button"
          className="h-9 gap-1.5"
          onClick={() => {
            setAddForm((f) => ({
              ...f,
              parentSku: normalizeOrderCodeText(q) || f.parentSku,
            }));
            setAddOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm mã mới
        </Button>
      </div>
      {!loaded ? (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-slate-50">
          Chưa tải danh sách nhóm. Nhấn &quot;Tải nhóm&quot; hoặc &quot;Thêm mã
          mới&quot;.
        </p>
      ) : groupsQ.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto max-h-[min(55vh,480px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr className="text-left text-xs text-slate-600">
                <th className="p-2">Parent_SKU</th>
                <th className="p-2">Tên mẫu</th>
                <th className="p-2">Số mã</th>
                <th className="p-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {groups.slice(0, 200).map((g: VariantGroup) => (
                <tr key={g.parentSku} className="border-t align-top">
                  <td className="p-2 font-mono text-xs font-semibold uppercase">
                    {g.parentSku}
                  </td>
                  <td className="p-2 text-xs">{g.sampleName || "—"}</td>
                  <td className="p-2">{g.childCount}</td>
                  <td className="p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => openGroupEditor(g)}
                    >
                      Sửa biến thể · {g.children.length} dòng
                    </Button>
                    <div className="mt-1 flex flex-col gap-0.5 max-h-28 overflow-auto">
                      {g.children.map((c) => (
                        <span
                          key={c.id}
                          className="font-mono text-[10px] text-slate-600 uppercase"
                        >
                          {c.maHang}
                          {c.parentSku ? ` ← ${c.parentSku}` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!groups.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center text-muted-foreground text-sm"
                  >
                    Chưa có nhóm Parent_SKU. Dùng &quot;Thêm mã mới&quot; hoặc
                    &quot;Nhóm mới / Thêm mã con&quot;.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor đa dòng như GAS modal-variant-manager */}
      <Dialog
        open={editorOpen}
        onOpenChange={(o) => {
          if (!o) closeEditor();
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Quản lý mã con (Parent_SKU)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Parent_SKU</Label>
              <Input
                value={editorParent}
                onChange={(e) =>
                  setEditorParent(normalizeOrderCodeText(e.target.value))
                }
                className="h-9 font-mono uppercase"
                placeholder="VD: TQP1011"
              />
            </div>
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Mã hàng</th>
                    <th className="p-2 text-left">Tên chi tiết</th>
                    <th className="p-2 text-left">Mã vạch</th>
                    <th className="p-2 text-left">ĐVT</th>
                    <th className="p-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.id || `new-${idx}`} className="border-t">
                      <td className="p-1.5">
                        <Input
                          value={r.maHang}
                          onChange={(e) =>
                            patchRow(idx, { maHang: e.target.value })
                          }
                          className="h-8 font-mono uppercase text-xs"
                          placeholder="MÃ CON"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={r.tenHang}
                          onChange={(e) =>
                            patchRow(idx, { tenHang: e.target.value })
                          }
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={r.maVach}
                          onChange={(e) =>
                            patchRow(idx, { maVach: e.target.value })
                          }
                          className="h-8 font-mono text-xs"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={r.dvt}
                          onChange={(e) =>
                            patchRow(idx, { dvt: e.target.value })
                          }
                          className="h-8 text-xs w-20"
                        />
                      </td>
                      <td className="p-1.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() =>
                            setRows((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              return next.length
                                ? next
                                : [
                                    {
                                      maHang: "",
                                      tenHang: "",
                                      maVach: "",
                                      dvt: "Cái",
                                    },
                                  ];
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { maHang: "", tenHang: "", maVach: "", dvt: "Cái" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm mã con
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              Hủy
            </Button>
            <Button
              disabled={saveChildrenM.isPending}
              onClick={() => void onSaveGroup()}
            >
              {saveChildrenM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Lưu biến thể"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (createSkuM.isPending) return;
          setAddOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm mã hàng mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(
              [
                ["maHang", "Mã hàng *"],
                ["tenHang", "Tên sản phẩm"],
                ["maVach", "Mã vạch"],
                ["dvt", "ĐVT"],
                ["parentSku", "Parent_SKU (tuỳ chọn)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={addForm[k]}
                  disabled={createSkuM.isPending}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddForm((f) => ({
                      ...f,
                      [k]:
                        k === "maHang" || k === "parentSku"
                          ? normalizeOrderCodeText(v)
                          : v,
                    }));
                  }}
                  className={cn(
                    "h-9",
                    (k === "maHang" || k === "parentSku") &&
                      "font-mono uppercase",
                  )}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createSkuM.isPending}
              onClick={() => setAddOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={createSkuM.isPending}
              onClick={() => void onCreateSku()}
            >
              {createSkuM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Thêm mã"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OutStockQuick() {
  const [q, setQ] = useState("");
  const listQ = useCatalogFlagAdminList("", true);
  const saveM = useSaveCatalogFlags();

  const outRows = useMemo(
    () => (listQ.data || []).filter((r) => r.isOutStock),
    [listQ.data],
  );

  const suggestions = useMemo(() => {
    if (q.trim().length < 2) return [];
    return filterCatalogFlagItems(listQ.data || [], q)
      .filter((r) => !r.isOutStock)
      .slice(0, 8);
  }, [listQ.data, q]);

  const markOut = async (row: CatalogFlagAdminItem, out: boolean) => {
    try {
      await saveM.mutateAsync({
        flags: [{ id: row.id, isOutStock: out }],
      });
      toast.success(
        out ? `Đã báo hết: ${row.maHang}` : `Đã bán lại: ${row.maHang}`,
      );
      void listQ.refetch();
      setQ("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    }
  };

  return (
    <div className="space-y-3 border-t pt-4 mt-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
          <PackageX className="h-4 w-4" />
          Quản lý Hàng Hết Hàng
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Báo hết hàng lưu trên IsOutStock (giữ khi import MISA). Khi báo hết hàng
          hệ thống tự gỡ IsNew khỏi Hàng Mới.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 flex-1 min-w-[200px] relative">
          <Label className="text-xs">Tìm & chọn sản phẩm</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gõ mã / tên / mã vạch..."
            className="h-9"
          />
          {suggestions.length > 0 ? (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 border rounded-md bg-white shadow-lg max-h-48 overflow-auto">
              {suggestions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 border-b last:border-0"
                  onClick={() => void markOut(r, true)}
                >
                  <span className="font-mono font-semibold uppercase">{r.maHang}</span>
                  <span className="text-muted-foreground"> · {r.tenHang}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-9 gap-1.5"
          onClick={() => void listQ.refetch()}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", listQ.isFetching && "animate-spin")}
          />
          Tải DS hết hàng
        </Button>
      </div>
      <p className="text-xs font-medium text-slate-700">
        Đang hết hàng: {outRows.length} sản phẩm.
      </p>
      <div className="border rounded-lg overflow-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100">
            <tr className="text-left text-xs text-slate-600">
              <th className="p-2">Mã hàng</th>
              <th className="p-2">Mã vạch</th>
              <th className="p-2">Tên sản phẩm</th>
              <th className="p-2">ĐVT</th>
              <th className="p-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {outRows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono text-xs uppercase">
                  {r.maHang}{" "}
                  <span className="text-[10px] font-bold text-red-600">
                    HẾT HÀNG
                  </span>
                </td>
                <td className="p-2 font-mono text-xs">{r.maVach || "—"}</td>
                <td className="p-2 text-xs">{r.tenHang}</td>
                <td className="p-2 text-xs">{r.dvt}</td>
                <td className="p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={saveM.isPending}
                    onClick={() => void markOut(r, false)}
                  >
                    Gỡ báo hết hàng (Bán lại)
                  </Button>
                </td>
              </tr>
            ))}
            {!outRows.length ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-4 text-center text-muted-foreground text-sm"
                >
                  Không có sản phẩm hết hàng.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CatalogAdminHub() {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Package className="h-5 w-5 text-teal-600" />
          Danh mục & tồn kho
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Biến thể · đồng bộ MISA · badge NEW · khóa đặt hàng · hết hàng
        </p>
      </div>
      <Tabs defaultValue="variants" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-2 rounded-none border-b bg-slate-50/80">
          <TabsTrigger
            value="variants"
            className="text-xs gap-1 data-[state=active]:bg-white"
          >
            <Package className="h-3.5 w-3.5" />
            1. Danh Mục & Biến Thể
          </TabsTrigger>
          <TabsTrigger
            value="sync"
            className="text-xs gap-1 data-[state=active]:bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            2. Đồng Bộ MISA & Tồn Kho
          </TabsTrigger>
          <TabsTrigger
            value="flags"
            className="text-xs gap-1 data-[state=active]:bg-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            3. Quản Lý & Khóa Đơn Hàng
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="text-xs gap-1 data-[state=active]:bg-white"
          >
            <Settings className="h-3.5 w-3.5" />
            4. Cài Đặt Hệ Thống
          </TabsTrigger>
          <TabsTrigger
            value="sku-mapping"
            className="text-xs gap-1 data-[state=active]:bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            5. Chuyển Mã Hàng
          </TabsTrigger>
          <TabsTrigger
            value="gifts"
            className="text-xs gap-1 data-[state=active]:bg-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            6. Hàng tặng kèm
          </TabsTrigger>
        </TabsList>

        <TabsContent value="variants" className="p-4 mt-0">
          <VariantManager />
        </TabsContent>

        <TabsContent value="sync" className="p-4 mt-0">
          <CatalogStockImport />
        </TabsContent>

        <TabsContent value="flags" className="p-4 mt-0 space-y-8">
          <FlagManager
            kind="new"
            title="Quản lý Hàng Mới (Badge NEW)"
            hint="Chỉ Admin tick sản phẩm để hiện badge MỚI. Cập nhật file tồn / danh mục sẽ giữ nguyên IsNew."
          />
          <FlagManager
            kind="lock"
            title="Khóa Sản Phẩm (Khóa đặt hàng)"
            hint="Chỉ Admin tick để khóa đặt hàng. Trạng thái lưu độc lập — import MISA / tồn không ghi đè."
          />
          <div className="flex gap-2 text-xs text-muted-foreground px-1">
            <Lock className="h-3.5 w-3.5" />
            <Unlock className="h-3.5 w-3.5" />
            Dùng CheckAll / UncheckAll trên danh sách đang lọc rồi Lưu.
          </div>
          <OutStockQuick />
        </TabsContent>

        <TabsContent value="settings" className="p-4 mt-0">
          <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
            <p className="font-semibold">Cài đặt hệ thống</p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
              <li>
                Cột <code className="font-mono">parent_sku</code>,{" "}
                <code className="font-mono">is_new</code>,{" "}
                <code className="font-mono">is_locked</code>,{" "}
                <code className="font-mono">is_out_stock</code> trên bảng{" "}
                <code className="font-mono">products</code>.
              </li>
              <li>
                Chạy SQL:{" "}
                <code className="font-mono">scripts/sql-product-flags-parent.sql</code>{" "}
                nếu chưa có cột.
              </li>
              <li>
                Sản phẩm mới trên portal: ưu tiên Admin chọn (IsNew); thiếu thì
                lấy theo ngày tạo.
              </li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="sku-mapping" className="p-4 mt-0">
          <SkuCodeMappingManager />
        </TabsContent>
        <TabsContent value="gifts" className="p-4 mt-0">
          <ProductGiftsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
