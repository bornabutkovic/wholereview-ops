import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  partnerName: string;
  title: string; // PO Number or Subject
  titleLabel: string; // "PO Number" or "Subject"
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

export function RequestDetailSheet({
  context,
  onOpenChange,
}: {
  context: RequestDetailContext | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!context;
  const id = context?.id;

  const items = useQuery({
    queryKey: ["request-items", id],
    enabled: !!id,
    queryFn: async (): Promise<RequestItem[]> => {
      const { data, error } = await supabase
        .from("request_items")
        .select(
          "id, raw_product_ref, np_sku_id, qty_requested, qty_unit, min_expiry_months, status, offered_price",
        )
        .eq("incoming_request_id", id!);
      if (error) throw error;
      return (data ?? []) as unknown as RequestItem[];
    },
  });

  const data = items.data ?? [];
  const unmatched = data.filter((it) => !it.np_sku_id).length;
  const allMatched = data.length > 0 && unmatched === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[720px]">
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
                ) : data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">SKU</TableHead>
                          <TableHead className="text-xs">Qty</TableHead>
                          <TableHead className="text-xs">Min Expiry</TableHead>
                          <TableHead className="text-xs">Price</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.map((it) => (
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
                            <TableCell className="text-xs text-muted-foreground">
                              {it.min_expiry_months != null
                                ? `${it.min_expiry_months} months`
                                : ""}
                            </TableCell>
                            <TableCell className="text-[13px] tabular-nums">
                              {it.offered_price != null ? (
                                it.offered_price.toLocaleString()
                              ) : (
                                <span className="text-xs text-muted-foreground">TBD</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {it.status ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[11px] ${statusClass(it.status)}`}
                                >
                                  {it.status.toLowerCase()}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {data.length > 0 && (
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
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
