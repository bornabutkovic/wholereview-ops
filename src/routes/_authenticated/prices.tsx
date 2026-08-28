import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Loader2, Search, Tag } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { NpSkuDetails, Partner } from "@/lib/supabase";
import { useNpSkuDetails, useNpSkuList, usePartners } from "@/lib/product-mapping";
import { formatMoney, formatNumber, formatPercent, parseDecimalInput, toInputString } from "@/lib/format";
import { SkuCombobox } from "@/components/sku-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

export const Route = createFileRoute("/_authenticated/prices")({
  component: PricesPage,
  head: () => ({
    meta: [
      { title: "Prices — SKU buyer pricing | Novo Pharma" },
      {
        name: "description",
        content:
          "Manage buyer prices, active overrides and price history for a single SKU.",
      },
      { property: "og:title", content: "Prices — SKU buyer pricing | Novo Pharma" },
      {
        property: "og:description",
        content: "Buyer prices, suggested prices, overrides and full price history per SKU.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),

});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceHistoryRow {
  id?: string | number | null;
  np_sku_id: string | null;
  buyer_id: string | null;
  supplier_id: string | null;
  unit_price: number | null;
  sold_price: number | null;
  offered_price: number | null;
  commission_pct: number | null;
  cycle_ref: string | null;
  recorded_at: string | null;
  source: string | null;
}

interface SuggestionRow {
  np_sku_id: string | null;
  buyer_id: string | null;
  final_price: number | null;
  suggested_price: number | null;
  margin_pct: number | null;
}

interface OverrideRow {
  id?: string | number | null;
  np_sku_id: string | null;
  buyer_id: string | null;
  unit_price: number | null;
  commission_pct: number | null;
  valid_from: string | null;
  valid_to: string | null;
}

interface FloorConflict {
  buyer_id?: string | null;
  buyer_name?: string | null;
  unit_price?: number | null;
  price?: number | null;
  valid_from?: string | null;
}

/**
 * These pricing tables name the buyer column differently across environments
 * (`buyer_id` vs `buyer_partner_id` vs `partner_id`), so every read selects `*`
 * and normalizes here. Selecting an explicit column list caused the hard load
 * errors; a too-narrow key list made every joined cell render empty.
 */
const BUYER_KEY_CANDIDATES = [
  "buyer_id",
  "buyer_partner_id",
  "partner_id",
  "buyer_code",
  "buyer_ref",
  "buyer",
];

/** Ids are compared case/whitespace-insensitively so map keys always match. */
function normId(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function findBuyerKey(row: Record<string, unknown>): string | null {
  for (const k of BUYER_KEY_CANDIDATES) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return k;
  }
  for (const k of Object.keys(row)) {
    if (/buyer/i.test(k) && /(_id|_code|_ref)$/i.test(k)) {
      const v = row[k];
      if (typeof v === "string" && v.trim() !== "") return k;
    }
  }
  return null;
}

function pickBuyerId(row: Record<string, unknown>): string | null {
  const key = findBuyerKey(row);
  if (!key) return null;
  const v = row[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Detects the buyer column name of a pricing table from a sample row. */
async function resolveBuyerColumn(table: string): Promise<string> {
  const { data } = await (supabase as any).from(table).select("*").limit(1);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return "buyer_id";
  const key = findBuyerKey(row);
  if (key) return key;
  for (const k of BUYER_KEY_CANDIDATES) if (k in row) return k;
  return "buyer_id";
}


function num(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function str(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function laterOf(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function usePriceHistory(npSkuId: string | null) {
  return useQuery({
    queryKey: ["price-history", npSkuId],
    enabled: !!npSkuId,
    queryFn: async (): Promise<PriceHistoryRow[]> => {
      const { data, error } = await (supabase as any)
        .from("price_history")
        .select("*")
        .eq("np_sku_id", npSkuId)
        .limit(500);
      if (error) throw error;
      const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: (r["id"] as string | number | null) ?? null,
        np_sku_id: str(r, "np_sku_id"),
        buyer_id: pickBuyerId(r),
        supplier_id: str(r, "supplier_id", "supplier_partner_id"),
        unit_price: num(r, "unit_price", "price"),
        sold_price: num(r, "sold_price"),
        offered_price: num(r, "offered_price"),
        commission_pct: num(r, "commission_pct", "commission"),
        cycle_ref: str(r, "cycle_ref", "cycle"),
        recorded_at: str(r, "recorded_at", "created_at"),
        source: str(r, "source", "source_type"),
      })) satisfies PriceHistoryRow[];
      return rows.sort(
        (a, b) =>
          new Date(b.recorded_at ?? 0).getTime() - new Date(a.recorded_at ?? 0).getTime(),
      );
    },
  });
}

function usePriceSuggestions(npSkuId: string | null) {
  return useQuery({
    queryKey: ["price-suggestions", npSkuId],
    enabled: !!npSkuId,
    queryFn: async (): Promise<SuggestionRow[]> => {
      const { data, error } = await (supabase as any)
        .from("price_suggestions")
        .select("*")
        .eq("np_sku_id", npSkuId)
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        np_sku_id: str(r, "np_sku_id"),
        buyer_id: pickBuyerId(r),
        final_price: num(r, "final_price", "override_price"),
        suggested_price: num(r, "suggested_price"),
        margin_pct: num(r, "margin_pct"),
      }));
    },
  });
}

function useActiveOverrides(npSkuId: string | null) {
  return useQuery({
    queryKey: ["price-overrides-buyer", npSkuId],
    enabled: !!npSkuId,
    queryFn: async (): Promise<OverrideRow[]> => {
      const today = todayISO();
      const { data, error } = await (supabase as any)
        .from("price_overrides_buyer")
        .select("*")
        .eq("np_sku_id", npSkuId)
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .map((r) => ({
          id: (r["id"] as string | number | null) ?? null,
          np_sku_id: str(r, "np_sku_id"),
          buyer_id: pickBuyerId(r),
          unit_price: num(r, "unit_price", "price"),
          commission_pct: num(r, "commission_pct", "commission"),
          valid_from: str(r, "valid_from"),
          valid_to: str(r, "valid_to"),
        }))
        // Active = valid_from <= today AND (valid_to is null OR valid_to >= today)
        .filter(
          (r) =>
            (!r.valid_from || r.valid_from <= today) && (!r.valid_to || r.valid_to >= today),
        )
        .sort((a, b) => (b.valid_from ?? "").localeCompare(a.valid_from ?? ""));
    },
  });
}


// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PricesPage() {
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const skus = useNpSkuList();
  // The seed list is capped, so the selected SKU is usually not in it — fall
  // back to a direct lookup so brand / pack description always resolve.
  const seeded = skus.data?.find((s) => s.np_sku_id === selectedSkuId) ?? null;
  const details = useNpSkuDetails(selectedSkuId && !seeded ? selectedSkuId : null);
  const selectedSku: NpSkuDetails | null = seeded ?? details.data ?? null;


  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Prices</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          SKU-level buyer pricing, active overrides and full price history.
        </p>
      </header>

      <div className="space-y-6 p-6">
        <div className="max-w-xl space-y-1.5">
          <Label className="text-xs text-muted-foreground">SKU</Label>
          <SkuCombobox
            skus={skus.data ?? []}
            loading={skus.isLoading}
            value={selectedSkuId}
            onChange={setSelectedSkuId}
            placeholder="Search for a SKU…"
          />
        </div>

        {!selectedSkuId ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Search for a SKU to view and manage its pricing.
            </p>
          </div>
        ) : (
          <>
            <SkuHeader sku={selectedSku} skuId={selectedSkuId} />
            <BuyerPricesSection npSkuId={selectedSkuId} />
            <PriceHistorySection npSkuId={selectedSkuId} />
          </>
        )}
      </div>
    </div>
  );
}

function SkuHeader({ sku, skuId }: { sku: NpSkuDetails | null; skuId: string }) {
  const code = useQuery({
    queryKey: ["sku-materijal-code", skuId],
    queryFn: async (): Promise<string | null> => {
      const direct = await (supabase as any)
        .from("np_sku")
        .select("materijal_code")
        .eq("np_sku_id", skuId)
        .maybeSingle();
      if (!direct.error && direct.data) return direct.data.materijal_code ?? null;
      const { data } = await (supabase as any)
        .from("np_catalog_reference")
        .select("materijal_code")
        .eq("promoted_to_sku_id", skuId)
        .limit(1);
      return (data ?? [])[0]?.materijal_code ?? null;
    },
  });

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">
          {sku?.pack_description ?? sku?.brand ?? sku?.inn ?? "Unknown product"}
        </span>
        {code.data ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            {code.data}
          </Badge>
        ) : null}
        <Badge variant="secondary" className="font-mono text-[10px]">
          {skuId}
        </Badge>
      </div>
      {sku?.brand || sku?.inn ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {[sku?.brand, sku?.inn].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section A — Buyer Prices
// ---------------------------------------------------------------------------

function BuyerPricesSection({ npSkuId }: { npSkuId: string }) {
  const buyers = usePartners({ buyersOnly: true });
  const history = usePriceHistory(npSkuId);
  const suggestions = usePriceSuggestions(npSkuId);
  const overrides = useActiveOverrides(npSkuId);

  const loading =
    buyers.isLoading || history.isLoading || suggestions.isLoading || overrides.isLoading;
  const error =
    buyers.error ?? history.error ?? suggestions.error ?? overrides.error ?? null;

  const latestHistoryByBuyer = useMemo(() => {
    const map: Record<string, PriceHistoryRow> = {};
    for (const row of history.data ?? []) {
      const key = normId(row.buyer_id);
      if (!key) continue;
      const existing = map[key];
      if (
        !existing ||
        new Date(row.recorded_at ?? 0).getTime() >
          new Date(existing.recorded_at ?? 0).getTime()
      ) {
        map[key] = row;
      }
    }
    return map;
  }, [history.data]);

  const suggestionByBuyer = useMemo(() => {
    const map: Record<string, SuggestionRow> = {};
    for (const row of suggestions.data ?? []) {
      const key = normId(row.buyer_id);
      if (key) map[key] = row;
    }
    return map;
  }, [suggestions.data]);

  const overrideByBuyer = useMemo(() => {
    const map: Record<string, OverrideRow> = {};
    for (const row of overrides.data ?? []) {
      const key = normId(row.buyer_id);
      if (key && !map[key]) map[key] = row;
    }
    return map;
  }, [overrides.data]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">Buyer Prices</h2>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer</TableHead>
              <TableHead className="text-right">Last Sold Price</TableHead>
              <TableHead className="text-right">Suggested Price</TableHead>
              <TableHead className="text-right">Active Override</TableHead>
              <TableHead className="text-right">Commission %</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    {error instanceof Error ? error.message : "Could not load buyer prices."}
                  </div>
                </TableCell>
              </TableRow>
            ) : (buyers.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No buyers found
                </TableCell>
              </TableRow>
            ) : (
              (buyers.data ?? []).map((buyer) => (
                <BuyerRow
                  key={buyer.partner_id}
                  npSkuId={npSkuId}
                  buyer={buyer}
                  history={latestHistoryByBuyer[normId(buyer.partner_id)] ?? null}
                  suggestion={suggestionByBuyer[normId(buyer.partner_id)] ?? null}
                  override={overrideByBuyer[normId(buyer.partner_id)] ?? null}
                  buyerNames={Object.fromEntries(
                    (buyers.data ?? []).map((b) => [b.partner_id, b.name]),
                  )}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function BuyerRow(props: {
  npSkuId: string;
  buyer: Partner;
  history: PriceHistoryRow | null;
  suggestion: SuggestionRow | null;
  override: OverrideRow | null;
  buyerNames: Record<string, string>;
}) {
  const { npSkuId, buyer, history, suggestion, override, buyerNames } = props;

  const suggested =
    suggestion?.final_price ?? suggestion?.suggested_price ?? null;
  const lastUpdated = laterOf(history?.recorded_at ?? null, override?.valid_from ?? null);

  return (
    <TableRow>
      <TableCell>
        <div className="text-sm font-medium">{buyer.name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{buyer.partner_id}</div>
      </TableCell>
      <TableCell className="text-right text-sm">
        {formatMoney(history?.sold_price ?? history?.offered_price ?? null)}
      </TableCell>
      <TableCell className="text-right text-sm">
        {formatMoney(suggested)}
        {suggestion?.margin_pct != null ? (
          <div className="text-[10px] text-muted-foreground">
            margin {formatPercent(suggestion.margin_pct)}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <OverrideEditor
          npSkuId={npSkuId}
          buyer={buyer}
          override={override}
          buyerNames={buyerNames}
        />
      </TableCell>
      <TableCell className="text-right text-sm">
        {override?.commission_pct != null
          ? formatPercent(override.commission_pct)
          : history?.commission_pct != null
            ? formatPercent(history.commission_pct)
            : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(lastUpdated)}
      </TableCell>
    </TableRow>
  );
}

function OverrideEditor(props: {
  npSkuId: string;
  buyer: Partner;
  override: OverrideRow | null;
  buyerNames: Record<string, string>;
}) {
  const { npSkuId, buyer, override, buyerNames } = props;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [conflicts, setConflicts] = useState<FloorConflict[] | null>(null);
  const [checking, setChecking] = useState(false);

  const reset = () => {
    setPrice(toInputString(override?.unit_price ?? null));
    setCommission(toInputString(override?.commission_pct ?? null));
    setConflicts(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const unitPrice = parseDecimalInput(price);
      if (Number.isNaN(unitPrice)) throw new Error("Enter a valid unit price.");
      const commissionPct = parseDecimalInput(commission);
      const buyerCol = await resolveBuyerColumn("price_overrides_buyer");

      if (override) {
        const { error } = await (supabase as any)
          .from("price_overrides_buyer")
          .update({ valid_to: yesterdayISO() })
          .eq("np_sku_id", npSkuId)
          .eq(buyerCol, buyer.partner_id)
          .is("valid_to", null);
        if (error) throw error;
        if (override.valid_to) {
          const { error: e2 } = await (supabase as any)
            .from("price_overrides_buyer")
            .update({ valid_to: yesterdayISO() })
            .eq("np_sku_id", npSkuId)
            .eq(buyerCol, buyer.partner_id)
            .gte("valid_to", todayISO());
          if (e2) throw e2;
        }
      }

      const { error: insertError } = await (supabase as any)
        .from("price_overrides_buyer")
        .insert({
          np_sku_id: npSkuId,
          [buyerCol]: buyer.partner_id,
          unit_price: unitPrice,
          commission_pct: Number.isNaN(commissionPct) ? null : commissionPct,
          valid_from: todayISO(),
          valid_to: null,
        });
      if (insertError) throw insertError;
    },

    onSuccess: () => {
      toast.success("Price updated");
      setOpen(false);
      setConflicts(null);
      queryClient.invalidateQueries({ queryKey: ["price-overrides-buyer", npSkuId] });
      queryClient.invalidateQueries({ queryKey: ["price-history", npSkuId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not update the price");
    },
  });

  const handleFirstSave = async () => {
    const unitPrice = parseDecimalInput(price);
    if (Number.isNaN(unitPrice)) {
      toast.error("Enter a valid unit price.");
      return;
    }
    setChecking(true);
    try {
      const { data, error } = await (supabase as any).rpc("check_price_floor", {
        p_np_sku_id: npSkuId,
        p_buyer_id: buyer.partner_id,
        p_proposed_price: unitPrice,
      });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as FloorConflict[];
      if (rows.length > 0) {
        setConflicts(rows);
        return;
      }
    } catch (e) {
      // A missing/failing floor check must not block manual pricing.
      console.warn("check_price_floor failed:", e);
    } finally {
      setChecking(false);
    }
    save.mutate();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded px-2 py-1 text-right text-sm hover:bg-muted"
        >
          {override?.unit_price != null ? (
            <>
              <span className="font-medium">{formatMoney(override.unit_price)}</span>
              <span className="block text-[10px] text-muted-foreground">
                since {formatDate(override.valid_from)}
                {override.valid_to ? ` · until ${formatDate(override.valid_to)}` : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground underline decoration-dotted">
              Set price
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">Override for {buyer.name}</p>
          <p className="text-[11px] text-muted-foreground">
            A new period starts today; the previous one is closed, not overwritten.
          </p>
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Unit Price (EUR)</Label>
            <Input
              inputMode="decimal"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setConflicts(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Commission %</Label>
            <Input
              inputMode="decimal"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="0"
            />
          </div>
        </div>

        {conflicts && conflicts.length > 0 ? (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Price floor warning
            </div>
            {conflicts.map((c, i) => {
              const name =
                c.buyer_name ?? (c.buyer_id ? buyerNames[c.buyer_id] ?? c.buyer_id : "Another buyer");
              const p = c.unit_price ?? c.price ?? null;
              return (
                <p key={i} className="text-[11px] text-muted-foreground">
                  {name} currently has a higher active price ({formatMoney(p)}, since{" "}
                  {formatDate(c.valid_from)}) for this SKU.
                </p>
              );
            })}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {conflicts && conflicts.length > 0 ? (
            <Button
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-700"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Save anyway
            </Button>
          ) : (
            <Button size="sm" disabled={save.isPending || checking} onClick={handleFirstSave}>
              {save.isPending || checking ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Section B — Price History
// ---------------------------------------------------------------------------

function PriceHistorySection({ npSkuId }: { npSkuId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [buyerFilter, setBuyerFilter] = useState("all");
  const history = usePriceHistory(npSkuId);
  const partners = usePartners();

  const partnerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of partners.data ?? []) map[normId(p.partner_id)] = p.name;
    return map;
  }, [partners.data]);

  const rows = useMemo(() => {
    const all = history.data ?? [];
    return buyerFilter === "all"
      ? all
      : all.filter((r) => normId(r.buyer_id) === normId(buyerFilter));
  }, [history.data, buyerFilter]);

  const buyerOptions = useMemo(() => {
    const ids = [...new Set((history.data ?? []).map((r) => r.buyer_id).filter(Boolean))] as string[];
    return ids.map((id) => ({ id, name: partnerNames[normId(id)] ?? id }));
  }, [history.data, partnerNames]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-semibold tracking-tight"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          Price History
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {(history.data ?? []).length}
          </Badge>
        </button>

        <Select value={buyerFilter} onValueChange={setBuyerFilter}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="All buyers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All buyers</SelectItem>
            {buyerOptions.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {collapsed ? null : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Sold Price</TableHead>
                <TableHead className="text-right">Offered Price</TableHead>
                <TableHead className="text-right">Commission %</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Recorded At</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : history.isError ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      {history.error instanceof Error
                        ? history.error.message
                        : "Could not load price history."}
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No price history for this SKU yet
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={String(r.id ?? i)}>
                    <TableCell className="text-sm">
                      {r.buyer_id ? partnerNames[r.buyer_id] ?? r.buyer_id : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.supplier_id ? partnerNames[r.supplier_id] ?? r.supplier_id : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(r.unit_price)}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(r.sold_price)}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(r.offered_price)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {r.commission_pct != null ? formatNumber(r.commission_pct, 2) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.cycle_ref ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(r.recorded_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.source ? (
                        <Badge variant="outline" className="text-[10px]">
                          {r.source}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
