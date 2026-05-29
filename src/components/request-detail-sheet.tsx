import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, Send } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface RequestDetailContext {
  id: string;
  partnerId: string | null;
  partnerName: string;
  contactEmail?: string | null;
  title: string;
  titleLabel: string;
  status: string;
  dateReceived: string;
}

interface RequestItem {
  id: string;
  raw_product_ref: string | null;
  np_sku_id: string | null;
  qty_requested: number | null;
  qty_unit: string | null;
  min_expiry_months: number | null;
  status: string | null;
  offered_price: number | null;
  np_sku?: {
    eu_approval_no: string | null;
    hr_approval_no: string | null;
  } | null;
}


interface SuggestPriceResponse {
  last_sold_price?: number | null;
  suggested_price?: number | null;
  max_historical_price?: number | null;
  estimated_qty?: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  IN_REVIEW: "bg-yellow-50 text-yellow-800 border-yellow-200",
  OFFERED: "bg-purple-50 text-purple-700 border-purple-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
  MATCHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UNMATCHED: "bg-rose-50 text-rose-700 border-rose-200",
  PENDING: "bg-yellow-50 text-yellow-800 border-yellow-200",
};

function statusClass(s: string | null | undefined) {
  const key = (s ?? "").toUpperCase();
  return STATUS_STYLES[key] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

const MARGIN_OPTIONS = [9, 10, 11] as const;
type Margin = (typeof MARGIN_OPTIONS)[number];

interface ItemPriceState {
  margin: Margin;
  yourPrice: string;
  // baseline price returned by edge fn (for default if user changes margin)
  suggestedPrice: number | null;
}

export function RequestDetailSheet({
  context,
  onOpenChange,
}: {
  context: RequestDetailContext | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!context;
  const id = context?.id;
  const partnerId = context?.partnerId ?? null;

  const items = useQuery({
    queryKey: ["request-items", id],
    enabled: !!id,
    queryFn: async (): Promise<RequestItem[]> => {
      const { data, error } = await supabase
        .from("request_items")
        .select(
          "id, raw_product_ref, np_sku_id, qty_requested, qty_unit, min_expiry_months, status, offered_price, np_sku:np_sku_id(eu_approval_no, hr_approval_no)",
        )
        .eq("incoming_request_id", id!);

      if (error) throw error;
      return (data ?? []) as unknown as RequestItem[];
    },
  });

  const itemList = items.data ?? [];

  // Per-item price suggestion via edge function
  const suggestionQueries = useQueries({
    queries: itemList.map((it) => ({
      queryKey: ["suggest-price", id, it.id, 11],
      enabled: !!id && !!partnerId,
      queryFn: async (): Promise<SuggestPriceResponse> => {
        const { data, error } = await supabase.functions.invoke<SuggestPriceResponse>(
          "suggest-price",
          {
            body: {
              np_sku_id: it.np_sku_id,
              partner_id: partnerId,
              item_id: it.id,
              incoming_request_id: id,
              margin_pct: 11,
            },
          },
        );
        if (error) throw error;
        return data ?? {};
      },
    })),
  });

  // Local editable state per item
  const [priceState, setPriceState] = useState<Record<string, ItemPriceState>>({});

  // Seed local state when suggestions arrive
  useEffect(() => {
    setPriceState((prev) => {
      const next = { ...prev };
      itemList.forEach((it, idx) => {
        const s = suggestionQueries[idx]?.data;
        if (s && next[it.id] === undefined) {
          next[it.id] = {
            margin: 11,
            yourPrice: s.suggested_price != null ? String(s.suggested_price) : "",
            suggestedPrice: s.suggested_price ?? null,
          };
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionQueries.map((q) => q.dataUpdatedAt).join("|"), itemList.length]);

  // Reset state when sheet target changes
  useEffect(() => {
    if (!id) setPriceState({});
  }, [id]);

  const unmatched = itemList.filter((it) => !it.np_sku_id).length;
  const allMatched = itemList.length > 0 && unmatched === 0;

  const allPriced =
    itemList.length > 0 &&
    itemList.every((it) => {
      const p = priceState[it.id]?.yourPrice;
      return p != null && p !== "" && !Number.isNaN(Number(p));
    });

  const [previewOpen, setPreviewOpen] = useState(false);

  const updateMargin = (it: RequestItem, margin: Margin) => {
    const idx = itemList.indexOf(it);
    const s = suggestionQueries[idx]?.data;
    const max = s?.max_historical_price ?? null;
    const recalculated = max != null ? Number((max * (1 + margin / 100)).toFixed(2)) : null;
    setPriceState((prev) => ({
      ...prev,
      [it.id]: {
        margin,
        suggestedPrice: recalculated ?? prev[it.id]?.suggestedPrice ?? null,
        yourPrice:
          recalculated != null ? String(recalculated) : (prev[it.id]?.yourPrice ?? ""),
      },
    }));
  };

  const updateYourPrice = (it: RequestItem, value: string) => {
    setPriceState((prev) => ({
      ...prev,
      [it.id]: {
        margin: prev[it.id]?.margin ?? 11,
        suggestedPrice: prev[it.id]?.suggestedPrice ?? null,
        yourPrice: value,
      },
    }));
  };

  const persistOverride = async (it: RequestItem) => {
    const state = priceState[it.id];
    if (!state || !it.np_sku_id || !partnerId) return;
    const numeric = Number(state.yourPrice);
    if (Number.isNaN(numeric)) return;
    await (supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> };
        };
      };
    })
      .from("price_suggestions")
      .update({ override_price: numeric, margin_pct: state.margin })
      .eq("np_sku_id", it.np_sku_id)
      .eq("partner_id", partnerId);
  };


  const offerPreview = useMemo(() => {
    if (!context) return "";
    const lines = itemList.map((it) => {
      const p = priceState[it.id]?.yourPrice ?? "—";
      const qty = it.qty_requested != null ? `${it.qty_requested}${it.qty_unit ? ` ${it.qty_unit}` : ""}` : "—";
      return `• ${it.raw_product_ref ?? it.np_sku_id ?? "Item"} — ${qty} @ ${p} EUR`;
    });
    return [
      `To: ${context.contactEmail ?? context.partnerName}`,
      `Subject: Offer for ${context.title}`,
      "",
      `Dear ${context.partnerName},`,
      "",
      "Please find our offer below:",
      "",
      ...lines,
      "",
      "Best regards,",
    ].join("\n");
  }, [context, itemList, priceState]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[960px]">
        {context && (
          <>
            <SheetHeader className="border-b px-6 py-4 text-left">
              <SheetTitle className="text-base">{context.partnerName}</SheetTitle>
              <SheetDescription className="text-xs">
                <span className="text-muted-foreground">{context.titleLabel}: </span>
                <span className="font-mono text-foreground">{context.title || "—"}</span>
              </SheetDescription>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`font-medium ${statusClass(context.status)}`}
                >
                  {context.status.toLowerCase().replace("_", " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Received {format(new Date(context.dateReceived), "PPp")}
                </span>
              </div>
            </SheetHeader>

            <div className="space-y-4 px-6 py-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Requested Products
                </h3>
                {items.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : items.isError ? (
                  <p className="text-xs text-destructive">
                    {(items.error as Error)?.message ?? "Failed to load items"}
                  </p>
                ) : itemList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">SKU</TableHead>
                          <TableHead className="text-xs">Qty</TableHead>
                          <TableHead className="text-xs">Last Sold</TableHead>
                          <TableHead className="text-xs">Suggested</TableHead>
                          <TableHead className="text-xs">Margin %</TableHead>
                          <TableHead className="text-xs">Your Price</TableHead>
                          <TableHead className="text-xs">Est. Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemList.map((it, idx) => {
                          const sq = suggestionQueries[idx];
                          const s = sq?.data;
                          const ps = priceState[it.id];
                          const loadingSuggestion = sq?.isLoading;
                          return (
                            <TableRow key={it.id} className="text-sm">
                              <TableCell className="text-[13px]">
                                {it.raw_product_ref ?? "—"}
                              </TableCell>
                              <TableCell>
                                {it.np_sku_id ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-200 bg-emerald-50 font-mono text-[11px] text-emerald-700"
                                  >
                                    {it.np_sku_id}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-rose-200 bg-rose-50 text-[11px] text-rose-700"
                                  >
                                    Unmatched
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-[13px] tabular-nums">
                                {it.qty_requested != null
                                  ? `${it.qty_requested}${it.qty_unit ? ` ${it.qty_unit}` : ""}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {loadingSuggestion
                                  ? "…"
                                  : s?.last_sold_price != null
                                    ? `${s.last_sold_price} EUR`
                                    : "—"}
                              </TableCell>
                              <TableCell>
                                {loadingSuggestion ? (
                                  <span className="text-xs text-muted-foreground">…</span>
                                ) : s?.suggested_price != null ? (
                                  <Badge className="bg-blue-600 font-bold text-white hover:bg-blue-700">
                                    {s.suggested_price} EUR
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    No history
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={String(ps?.margin ?? 11)}
                                  onValueChange={(v) =>
                                    updateMargin(it, Number(v) as Margin)
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[72px] text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MARGIN_OPTIONS.map((m) => (
                                      <SelectItem key={m} value={String(m)}>
                                        {m}%
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    className="h-8 w-[100px] text-xs tabular-nums"
                                    value={ps?.yourPrice ?? ""}
                                    onChange={(e) => updateYourPrice(it, e.target.value)}
                                    onBlur={() => persistOverride(it)}
                                  />
                                  <span className="text-[11px] text-muted-foreground">
                                    EUR
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {loadingSuggestion
                                  ? "…"
                                  : s?.estimated_qty != null
                                    ? s.estimated_qty
                                    : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {itemList.length > 0 && (
                <div
                  className={`flex items-center gap-2 rounded-md border p-3 text-xs ${
                    allMatched
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-yellow-200 bg-yellow-50 text-yellow-900"
                  }`}
                >
                  {allMatched ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      All products matched ✅
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      {unmatched} product{unmatched === 1 ? "" : "s"} need review ⚠️
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end border-t pt-4">
                <Button
                  disabled={!allPriced}
                  onClick={() => setPreviewOpen(true)}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send Offer
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Offer email preview</DialogTitle>
            <DialogDescription>
              Review the draft below. Sending is not yet enabled.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-4 text-xs">
            {offerPreview}
          </pre>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
