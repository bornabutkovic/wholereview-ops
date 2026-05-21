import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Inbox, Search } from "lucide-react";

import { supabase } from "@/lib/supabase";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  component: PurchaseOrdersPage,
});

type PoStatus = "new" | "confirmed" | "rejected";

interface RequestItemRow {
  id?: string | null;
  quantity?: number | null;
  qty?: number | null;
  np_sku_id?: string | null;
  raw_product_ref?: string | null;
}

interface PartnerRow {
  partner_id: string;
  code: string | null;
  name?: string | null;
  contact_email?: string | null;
}

interface IncomingRequestRow {
  id: string;
  partner_id: string | null;
  request_type: string | null;
  status: string | null;
  created_at: string;
  received_at?: string | null;
  partner: PartnerRow | PartnerRow[] | null;
  request_items: RequestItemRow[] | null;
}

interface PurchaseOrder {
  id: string;
  buyer: string;
  dateReceived: string;
  productsCount: number;
  totalQuantity: number;
  status: PoStatus;
  raw: IncomingRequestRow;
}

const STATUS_STYLES: Record<PoStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_FILTERS: { value: PoStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

function normalizeStatus(s: string | null | undefined): PoStatus {
  const v = (s ?? "").toLowerCase();
  if (v === "confirmed") return "confirmed";
  if (v === "rejected") return "rejected";
  return "new";
}

function normalize(row: IncomingRequestRow): PurchaseOrder {
  const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
  const buyer =
    partner?.name?.trim() ||
    partner?.code?.trim() ||
    "—";
  const items = row.request_items ?? [];
  const totalQty = items.reduce((acc, it) => {
    const q = typeof it.quantity === "number" ? it.quantity : it.qty ?? 0;
    return acc + (q ?? 0);
  }, 0);
  return {
    id: row.id,
    buyer,
    dateReceived: row.received_at ?? row.created_at,
    productsCount: items.length,
    totalQuantity: totalQty,
    status: normalizeStatus(row.status),
    raw: row,
  };
}

function PurchaseOrdersPage() {
  const [status, setStatus] = useState<PoStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<PurchaseOrder | null>(null);

  const query = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      const { data, error } = await supabase
        .from("incoming_requests")
        .select(
          "id, partner_id, request_type, status, created_at, received_at, partner:partner_id(partner_id, code, name, contact_email), request_items(id, quantity, np_sku_id, raw_product_ref)",
        )
        .eq("request_type", "PO")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as IncomingRequestRow[]).map(normalize);
    },
  });

  const filtered = useMemo(() => {
    const items = query.data ?? [];
    return items.filter((po) => {
      if (status !== "ALL" && po.status !== status) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!po.buyer.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [query.data, status, search]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Purchase Orders</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {query.isLoading
              ? "Loading…"
              : `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <Select value={status} onValueChange={(v) => setStatus(v as PoStatus | "ALL")}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search buyer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[240px] pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {query.isError ? (
          <ErrorState
            message={(query.error as Error)?.message ?? "Failed to load"}
            onRetry={() => query.refetch()}
          />
        ) : query.isLoading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="text-xs">Buyer</TableHead>
                <TableHead className="w-[160px] text-xs">Date Received</TableHead>
                <TableHead className="w-[100px] text-xs text-right">Products</TableHead>
                <TableHead className="w-[130px] text-xs text-right">Total Qty</TableHead>
                <TableHead className="w-[120px] text-xs">Status</TableHead>
                <TableHead className="w-[100px] text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((po) => (
                <TableRow key={po.id} className="text-sm">
                  <TableCell className="text-[13px] font-medium text-foreground">
                    {po.buyer}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(po.dateReceived), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">
                    {po.productsCount}
                  </TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">
                    {po.totalQuantity.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-medium ${STATUS_STYLES[po.status]}`}
                    >
                      {po.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setActive(po)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DetailsDialog po={active} onClose={() => setActive(null)} />
    </div>
  );
}

function DetailsDialog({
  po,
  onClose,
}: {
  po: PurchaseOrder | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!po} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-base">Purchase Order</DialogTitle>
          <DialogDescription className="text-xs">
            {po?.buyer} ·{" "}
            {po && formatDistanceToNow(new Date(po.dateReceived), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        {po && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <Stat label="Products" value={String(po.productsCount)} />
              <Stat label="Total quantity" value={po.totalQuantity.toLocaleString()} />
              <Stat label="Status" value={po.status} />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium">Items</p>
              <div className="max-h-[320px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="w-[100px] text-right text-xs">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(po.raw.request_items ?? []).map((it, idx) => (
                      <TableRow key={it.id ?? idx} className="text-sm">
                        <TableCell className="text-[13px]">
                          {it.np_sku_id ?? it.raw_product_ref ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-[13px] tabular-nums">
                          {(typeof it.quantity === "number" ? it.quantity : it.qty) ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(po.raw.request_items ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                          No items
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

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
        <p className="text-sm font-medium">No purchase orders</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing matches the current filters.
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium">Failed to load purchase orders</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
