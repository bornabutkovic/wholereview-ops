import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ClipboardCopy, Inbox } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { formatQty } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/supplier-offers")({
  component: SupplierOffersPage,
});

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type SuggestedResponse = "DA" | "JAVIM" | "DA_PARTIAL";

interface OfferRow {
  id: string;
  supplier: string | null;
  np_sku_id: string | null;
  raw_product_name: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity_offered: number | null;
  buyer_quantity_req: number | null;
  status: string | null;
  source_email_id: string | null;
  ivana_note: string | null;
  suggested_response: string | null;
  suggested_accept_qty: number | null;
  suggestion_reason: string | null;
  created_at: string | null;
}

const VIEW_COLUMNS =
  "id, supplier, np_sku_id, raw_product_name, batch_number, expiry_date, quantity_offered, buyer_quantity_req, status, source_email_id, ivana_note, suggested_response, suggested_accept_qty, suggestion_reason, created_at";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function normalizeResponse(value: string | null): SuggestedResponse {
  const upper = (value ?? "").toUpperCase();
  if (upper === "JAVIM") return "JAVIM";
  if (upper === "DA_PARTIAL" || upper === "DA-PARTIAL") return "DA_PARTIAL";
  return "DA";
}

const RESPONSE_STYLES: Record<SuggestedResponse, string> = {
  DA: "bg-green-50 text-green-700 border-green-200",
  JAVIM: "bg-yellow-50 text-yellow-700 border-yellow-200",
  DA_PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
};

const RESPONSE_LABELS: Record<SuggestedResponse, string> = {
  DA: "DA",
  JAVIM: "JAVIM",
  DA_PARTIAL: "DA_PARTIAL",
};

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function usePendingSupplierOffers() {
  return useQuery({
    queryKey: ["supplier-offer-suggestions", "pending_review"],
    queryFn: async (): Promise<OfferRow[]> => {
      const { data, error } = await (supabase as any)
        .from("v_supplier_offer_suggestion")
        .select(VIEW_COLUMNS)
        .eq("status", "pending_review")
        .order("source_email_id", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
  });
}

/** np_sku_id -> { code, name }. Falls back to np_catalog_reference for the code. */
function useSkuInfoMap(skuIds: string[]) {
  const key = [...new Set(skuIds)].sort();
  return useQuery({
    queryKey: ["sku-info-map", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Record<string, { code: string | null; name: string | null }>> => {
      const map: Record<string, { code: string | null; name: string | null }> = {};

      const withCode = await (supabase as any)
        .from("np_sku")
        .select("np_sku_id, pack_description, materijal_code")
        .in("np_sku_id", key);

      if (!withCode.error) {
        for (const r of (withCode.data ?? []) as any[]) {
          map[r.np_sku_id] = {
            code: r.materijal_code ?? null,
            name: r.pack_description ?? null,
          };
        }
        return map;
      }

      // materijal_code not present on np_sku — read names, then codes from catalog.
      const { data: skus } = await supabase
        .from("np_sku")
        .select("np_sku_id, pack_description")
        .in("np_sku_id", key);
      for (const r of skus ?? []) {
        map[r.np_sku_id] = { code: null, name: r.pack_description ?? null };
      }

      const { data: refs } = await (supabase as any)
        .from("np_catalog_reference")
        .select("materijal_code, promoted_to_sku_id")
        .in("promoted_to_sku_id", key);
      for (const r of (refs ?? []) as any[]) {
        if (!r.promoted_to_sku_id) continue;
        const existing = map[r.promoted_to_sku_id];
        map[r.promoted_to_sku_id] = {
          code: r.materijal_code ?? null,
          name: existing?.name ?? null,
        };
      }
      return map;
    },
  });
}

async function lookupPrimaryContactName(supplier: string | null): Promise<string | null> {
  if (!supplier) return null;
  const { data: partners } = await (supabase as any)
    .from("partner")
    .select("partner_id, name, code")
    .or(`code.eq.${supplier},name.ilike.${supplier}`)
    .limit(1);
  const partnerId = (partners ?? [])[0]?.partner_id;
  if (!partnerId) return null;

  const { data: contacts } = await (supabase as any)
    .from("partner_contacts")
    .select("name, is_primary")
    .eq("partner_id", partnerId)
    .eq("is_primary", true)
    .limit(1);
  return (contacts ?? [])[0]?.name ?? null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface RowDraft {
  response: SuggestedResponse;
  acceptQty: string;
  note: string;
}

function SupplierOffersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = usePendingSupplierOffers();
  const rows = data ?? [];

  const skuIds = useMemo(
    () => rows.map((r) => r.np_sku_id).filter((v): v is string => !!v),
    [rows],
  );
  const { data: skuInfo } = useSkuInfoMap(skuIds);

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const draftFor = (row: OfferRow): RowDraft =>
    drafts[row.id] ?? {
      response: normalizeResponse(row.suggested_response),
      acceptQty:
        row.suggested_accept_qty != null ? String(row.suggested_accept_qty) : "",
      note: row.ivana_note ?? "",
    };

  const patchDraft = (row: OfferRow, patch: Partial<RowDraft>) =>
    setDrafts((prev) => ({ ...prev, [row.id]: { ...draftFor(row), ...patch } }));

  const confirm = useMutation({
    mutationFn: async (input: { row: OfferRow; draft: RowDraft }) => {
      const { row, draft } = input;
      const status = draft.response === "JAVIM" ? "buyer_query_sent" : "accepted";
      const { error: updateError } = await (supabase as any)
        .from("supplier_offers")
        .update({
          status,
          ivana_note: draft.note.trim() || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      return status;
    },
    onSuccess: (status) => {
      toast.success(
        status === "accepted" ? "Offer accepted" : "Buyer query recorded",
      );
      queryClient.invalidateQueries({ queryKey: ["supplier-offer-suggestions"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not confirm offer");
    },
  });

  const groups = useMemo(() => {
    const byEmail = new Map<string, OfferRow[]>();
    for (const row of rows) {
      const key = row.source_email_id ?? "__none__";
      const list = byEmail.get(key);
      if (list) list.push(row);
      else byEmail.set(key, [row]);
    }
    return [...byEmail.entries()].map(([key, items]) => ({ key, items }));
  }, [rows]);

  async function copyGroup(items: OfferRow[]) {
    const contactName = await lookupPrimaryContactName(items[0]?.supplier ?? null);
    const greeting = contactName ? `Draga ${contactName},` : "Poštovani,";

    const header = ["Code", "Product Name", "Batch", "Expiry", "Qty", "Response"].join(
      "\t",
    );
    const lines = items.map((row) => {
      const draft = draftFor(row);
      const info = skuInfo?.[row.np_sku_id ?? ""];
      const responseText =
        draft.response === "JAVIM"
          ? "Javim"
          : draft.response === "DA_PARTIAL"
            ? `Da, ali samo ${draft.acceptQty || "0"} kom`
            : "Da";
      return [
        info?.code ?? row.np_sku_id ?? "",
        info?.name ?? row.raw_product_name ?? "",
        row.batch_number ?? "",
        formatDate(row.expiry_date),
        row.quantity_offered != null ? String(row.quantity_offered) : "",
        responseText,
      ].join("\t");
    });

    const text = [
      greeting,
      "",
      "Hvala na ponudi. U nastavku šaljem odgovore.",
      "",
      header,
      ...lines,
      "",
      "Kind regards,",
      "",
      "Ivana Fabić Ojdanić",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Supplier Offers</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pending supplier offers awaiting review, grouped by source email
        </p>
      </header>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Unknown error"}
          onRetry={() => refetch()}
        />
      ) : groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6 p-6">
          {groups.map((group) => (
            <div key={group.key} className="rounded-md border">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    Supplier offer email
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                      {group.key === "__none__" ? "no email id" : group.key}
                    </span>
                  </p>
                </div>
                <Badge variant="secondary" className="text-[11px]">
                  {group.items.length} item{group.items.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Product Name</TableHead>
                      <TableHead className="text-xs">Batch</TableHead>
                      <TableHead className="text-xs">Expiry Date</TableHead>
                      <TableHead className="text-xs">Qty Offered</TableHead>
                      <TableHead className="text-xs">Qty Requested</TableHead>
                      <TableHead className="text-xs">Suggested Response</TableHead>
                      <TableHead className="text-xs">Override</TableHead>
                      <TableHead className="text-xs">Note</TableHead>
                      <TableHead className="text-xs" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((row) => {
                      const draft = draftFor(row);
                      const info = skuInfo?.[row.np_sku_id ?? ""];
                      const suggested = normalizeResponse(row.suggested_response);
                      return (
                        <TableRow key={row.id} className="align-top">
                          <TableCell className="font-mono text-xs">
                            {info?.code ?? row.np_sku_id ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[240px] text-xs">
                            {info?.name ?? row.raw_product_name ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.batch_number ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDate(row.expiry_date)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatQty(row.quantity_offered)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatQty(row.buyer_quantity_req)}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={`text-[11px] font-medium ${RESPONSE_STYLES[suggested]}`}
                              >
                                {RESPONSE_LABELS[suggested]}
                              </Badge>
                              {suggested === "DA_PARTIAL" &&
                                row.suggested_accept_qty != null && (
                                  <span className="text-[11px] font-medium text-orange-700">
                                    {formatQty(row.suggested_accept_qty)}
                                  </span>
                                )}
                            </div>
                            {row.suggestion_reason && (
                              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                {row.suggestion_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="w-[180px]">
                            <Select
                              value={draft.response}
                              onValueChange={(v) =>
                                patchDraft(row, { response: v as SuggestedResponse })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DA" className="text-xs">
                                  Da
                                </SelectItem>
                                <SelectItem value="JAVIM" className="text-xs">
                                  Javim
                                </SelectItem>
                                <SelectItem value="DA_PARTIAL" className="text-xs">
                                  Da, ali samo N kom
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {draft.response === "DA_PARTIAL" && (
                              <Input
                                type="number"
                                min={0}
                                value={draft.acceptQty}
                                placeholder="Accepted qty"
                                className="mt-1.5 h-8 text-xs"
                                onChange={(e) =>
                                  patchDraft(row, { acceptQty: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell className="w-[200px]">
                            <Input
                              value={draft.note}
                              placeholder="Note"
                              className="h-8 text-xs"
                              onChange={(e) => patchDraft(row, { note: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={confirm.isPending}
                              onClick={() => confirm.mutate({ row, draft })}
                            >
                              Confirm
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end border-t px-4 py-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => copyGroup(group.items)}
                >
                  <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                  Copy reply as email text
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="space-y-2 p-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">No pending supplier offers</p>
        <p className="mt-1 text-xs text-muted-foreground">
          New offers appear here once a supplier email is parsed.
        </p>
      </div>
    </div>
  );
}

function ErrorState(props: { message: string; onRetry: () => void }) {
  const { message, onRetry } = props;
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium">Failed to load supplier offers</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
