import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Link2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { formatMoney, formatPercent, parseDecimalInput, toInputString } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogRow {
  materijal_code: string;
  hzzo_brand_name: string | null;
  inn: string | null;
  manufacturer_name: string | null;
  mah_name: string | null;
  form_strength_pack: string | null;
  atc_code: string | null;
  ean: string | null;
  wholesale_price_eur: number | null;
  vat_rate: number | null;
  country: string | null;
  prescription_status: string | null;
  route_of_admin: string | null;
  status: string | null;
  is_pending_materijal_code: boolean | null;
  promoted_to_sku_id: string | null;
}

const SELECT_COLUMNS =
  "materijal_code, hzzo_brand_name, inn, manufacturer_name, mah_name, form_strength_pack, atc_code, ean, wholesale_price_eur, vat_rate, country, prescription_status, route_of_admin, status, is_pending_materijal_code, promoted_to_sku_id";

const PAGE_SIZE = 50;

export type CatalogMode = "CATALOG" | "PENDING";
type PromotedFilter = "ALL" | "PROMOTED" | "CATALOG_ONLY";

const EDITABLE_FIELDS = [
  { key: "hzzo_brand_name", label: "Name (HZZO brand)", type: "text" },
  { key: "inn", label: "INN", type: "text" },
  { key: "manufacturer_name", label: "Manufacturer", type: "text" },
  { key: "mah_name", label: "Nositelj odobrenja (MAH)", type: "text" },
  { key: "form_strength_pack", label: "Form / strength / pack", type: "text" },
  { key: "atc_code", label: "ATC kod", type: "text" },
  { key: "ean", label: "EAN", type: "text" },
  { key: "wholesale_price_eur", label: "Veleprodajna cijena (EUR)", type: "number" },
  { key: "vat_rate", label: "PDV (%)", type: "number" },
  { key: "country", label: "Country", type: "text" },
  { key: "prescription_status", label: "Prescription status", type: "text" },
  { key: "route_of_admin", label: "Put primjene", type: "text" },
] as const;

type EditableKey = (typeof EDITABLE_FIELDS)[number]["key"];

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function useCatalog(params: {
  mode: CatalogMode;
  search: string;
  manufacturer: string;
  atc: string;
  promoted: PromotedFilter;
  page: number;
}) {
  const { mode, search, manufacturer, atc, promoted, page } = params;
  return useQuery({
    queryKey: ["catalog", mode, search, manufacturer, atc, promoted, page],
    queryFn: async (): Promise<{ rows: CatalogRow[]; total: number }> => {
      // Untyped: np_catalog_reference is not part of the generated Database types.
      const client = supabase as unknown as {
        from: (t: string) => any;
      };
      let q = client
        .from("np_catalog_reference")
        .select(SELECT_COLUMNS, { count: "exact" });

      // Discontinued rows are never sellable — never listed.
      q = q.not("status", "eq", "OUT");

      if (mode === "PENDING") {
        q = q.eq("is_pending_materijal_code", true);
      } else {
        q = q.or("is_pending_materijal_code.is.null,is_pending_materijal_code.eq.false");
      }

      if (promoted === "PROMOTED") q = q.not("promoted_to_sku_id", "is", null);
      if (promoted === "CATALOG_ONLY") q = q.is("promoted_to_sku_id", null);

      const s = search.trim();
      if (s) {
        const like = `%${s.replace(/[%,]/g, " ")}%`;
        q = q.or(
          [
            `hzzo_brand_name.ilike.${like}`,
            `inn.ilike.${like}`,
            `materijal_code.ilike.${like}`,
            `ean.ilike.${like}`,
          ].join(","),
        );
      }
      const m = manufacturer.trim();
      if (m) q = q.ilike("manufacturer_name", `%${m.replace(/[%,]/g, " ")}%`);
      const a = atc.trim();
      if (a) q = q.ilike("atc_code", `${a.replace(/[%,]/g, " ")}%`);

      const from = page * PAGE_SIZE;
      const { data, error, count } = await q
        .order("hzzo_brand_name", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as CatalogRow[], total: count ?? 0 };
    },
  });
}

function useUpdateCatalogRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; patch: Partial<Record<EditableKey, unknown>> }) => {
      const client = supabase as unknown as { from: (t: string) => any };
      const { error } = await client
        .from("np_catalog_reference")
        .update(input.patch)
        .eq("materijal_code", input.code);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success("Product updated");
    },
    onError: (e: unknown) => {
      toast.error(`Save failed: ${(e as Error).message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function PromotedBadge({ skuId }: { skuId: string | null }) {
  if (!skuId) {
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[11px]">
        Samo katalog
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]"
        >
          <Link2 className="h-3 w-3" />
          Promoted
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">{skuId}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export function CatalogBrowser({ mode }: { mode: CatalogMode }) {
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [atc, setAtc] = useState("");
  const [promoted, setPromoted] = useState<PromotedFilter>("ALL");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CatalogRow | null>(null);

  // Reset paging whenever the filters change.
  useEffect(() => {
    setPage(0);
  }, [search, manufacturer, atc, promoted, mode]);

  const { data, isLoading, error, isFetching } = useCatalog({
    mode,
    search,
    manufacturer,
    atc,
    promoted,
    page,
  });

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeLabel = useMemo(() => {
    if (total === 0) return "0";
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(total, (page + 1) * PAGE_SIZE);
    return `${from}–${to} / ${total.toLocaleString("hr-HR")}`;
  }, [page, total]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="Name, INN, code, or EAN..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Input
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Manufacturer"
          className="h-9 w-[180px] text-sm"
        />
        <Input
          value={atc}
          onChange={(e) => setAtc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="ATC kod"
          className="h-9 w-[140px] text-sm"
        />
        <Select value={promoted} onValueChange={(v) => setPromoted(v as PromotedFilter)}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All records</SelectItem>
            <SelectItem value="PROMOTED">Promoted (SKU)</SelectItem>
            <SelectItem value="CATALOG_ONLY">Samo katalog</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="ml-auto h-6 text-xs">
          {isLoading ? "…" : rangeLabel}
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[130px]">Materijal kod</TableHead>
              <TableHead>INN</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead className="w-[100px]">ATC</TableHead>
              <TableHead className="w-[140px]">EAN</TableHead>
              <TableHead className="w-[120px] text-right">VP cijena</TableHead>
              <TableHead className="w-[80px] text-right">PDV</TableHead>
              <TableHead className="w-[70px]">Country</TableHead>
              <TableHead className="w-[130px]">Veza</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-sm text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-sm text-muted-foreground">
                  No results
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.materijal_code}>
                  <TableCell className="font-medium">{r.hzzo_brand_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.materijal_code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.inn ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.manufacturer_name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.atc_code ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.ean ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatMoney(r.wholesale_price_eur)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatPercent(r.vat_rate, 1)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.country ?? "—"}
                  </TableCell>
                  <TableCell>
                    <PromotedBadge skuId={r.promoted_to_sku_id} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Stranica {page + 1} / {pageCount}
          {isFetching && !isLoading ? " · refreshing…" : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prethodna
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CatalogEditDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

function CatalogEditDialog(props: { row: CatalogRow | null; onClose: () => void }) {
  const { row, onClose } = props;
  const update = useUpdateCatalogRow();
  const [form, setForm] = useState<Record<EditableKey, string>>(
    {} as Record<EditableKey, string>,
  );

  useEffect(() => {
    if (!row) return;
    const next = {} as Record<EditableKey, string>;
    for (const f of EDITABLE_FIELDS) {
      const v = row[f.key];
      next[f.key] =
        f.type === "number" ? toInputString(v as number | null) : ((v as string | null) ?? "");
    }
    setForm(next);
  }, [row]);

  function save() {
    if (!row) return;
    const patch: Partial<Record<EditableKey, unknown>> = {};
    for (const f of EDITABLE_FIELDS) {
      const raw = (form[f.key] ?? "").trim();
      if (f.type === "number") {
        if (raw === "") {
          patch[f.key] = null;
          continue;
        }
        const n = parseDecimalInput(raw);
        if (Number.isNaN(n)) {
          toast.error(`Neispravan broj u polju "${f.label}"`);
          return;
        }
        patch[f.key] = n;
      } else {
        patch[f.key] = raw === "" ? null : raw;
      }
    }
    update.mutate(
      { code: row.materijal_code, patch },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">
                Edit catalog product
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 font-mono text-xs">
                {row.materijal_code}
                <PromotedBadge skuId={row.promoted_to_sku_id} />
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              {EDITABLE_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                        save();
                      }
                    }}
                    className="h-9 text-sm"
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
