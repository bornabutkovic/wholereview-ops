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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequestDetailSheet } from "@/components/request-detail-sheet";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  component: PurchaseOrdersPage,
});

const PO_DOC_TYPES = ["PO", "PO_XLS", "PO_PDF"] as const;

type PoStatus = "NEW" | "IN_REVIEW" | "CONFIRMED" | "REJECTED" | "CLOSED";

const STATUS_STYLES: Record<PoStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  IN_REVIEW: "bg-yellow-50 text-yellow-800 border-yellow-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABELS: Record<PoStatus, string> = {
  NEW: "new",
  IN_REVIEW: "in review",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  CLOSED: "closed",
};

const STATUS_FILTERS: { value: PoStatus | "ALL"; label: string; tooltip: string }[] = [
  { value: "ALL", label: "All statuses", tooltip: "Show purchase orders of any status" },
  { value: "NEW", label: "New", tooltip: "Just received, not yet reviewed" },
  { value: "IN_REVIEW", label: "In review", tooltip: "Someone is working on it" },
  { value: "CONFIRMED", label: "Confirmed", tooltip: "Buyer confirmed the offer" },
  { value: "REJECTED", label: "Rejected", tooltip: "We declined" },
  { value: "CLOSED", label: "Closed", tooltip: "Order completed or withdrawn" },
];

interface RequestItemRow {
  id?: string | null;
  qty_requested?: number | null;
  np_sku_id?: string | null;
  raw_product_ref?: string | null;
}

interface PartnerRow {
  partner_id: string;
  name: string | null;
  country: string | null;
  contact_email: string | null;
}

interface IncomingRequestRow {
  id: string;
  partner_id: string | null;
  doc_type: string | null;
  status: string | null;
  po_number: string | null;
  is_urgent: boolean | null;
  cycle_ref: string | null;
  created_at: string;
  partner: PartnerRow | PartnerRow[] | null;
  email_log:
    | { subject: string | null; received_at: string | null }
    | { subject: string | null; received_at: string | null }[]
    | null;
  request_items: RequestItemRow[] | null;
}

interface PurchaseOrder {
  id: string;
  buyer: string;
  partnerId: string | null;
  country: string | null;
  contactEmail: string | null;
  poNumber: string | null;
  subject: string | null;
  isUrgent: boolean;
  dateReceived: string;
  productsCount: number;
  totalQuantity: number;
  status: PoStatus;
  items: RequestItemRow[];
}


function normalizeStatus(s: string | null | undefined): PoStatus {
  const v = (s ?? "").toUpperCase();
  if (
    v === "NEW" ||
    v === "IN_REVIEW" ||
    v === "CONFIRMED" ||
    v === "REJECTED" ||
    v === "CLOSED"
  )
    return v;
  return "NEW";
}

function normalize(row: IncomingRequestRow): PurchaseOrder {
  const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
  const email = Array.isArray(row.email_log) ? row.email_log[0] : row.email_log;
  const buyer = partner?.name?.trim() || "Unknown";
  const items = row.request_items ?? [];
  const totalQty = items.reduce((acc, it) => acc + (it.qty_requested ?? 0), 0);
  return {
    id: row.id,
    buyer,
    partnerId: row.partner_id,
    country: partner?.country ?? null,

    contactEmail: partner?.contact_email ?? null,
    poNumber: row.po_number,
    subject: email?.subject ?? null,
    isUrgent: !!row.is_urgent,
    dateReceived: email?.received_at ?? row.created_at,
    productsCount: items.length,
    totalQuantity: totalQty,
    status: normalizeStatus(row.status),
    items,
  };
}

function PurchaseOrdersPage() {
  const [status, setStatus] = useState<PoStatus | "ALL">("NEW");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<PurchaseOrder | null>(null);

  const query = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      const { data, error } = await supabase
        .from("incoming_requests")
        .select(
          `id, doc_type, status, po_number, partner_id, is_urgent, cycle_ref, created_at,
           partner:partner_id (partner_id, name, contact_email, country),
           email_log:email_log_id (subject, received_at),
           request_items (id, np_sku_id, raw_product_ref, qty_requested)`,
        )
        .in("doc_type", PO_DOC_TYPES as unknown as string[])
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
      if (search.trim() && !po.buyer.toLowerCase().includes(search.toLowerCase()))
        return false;
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
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <TooltipProvider delayDuration={100}>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{s.label}</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">{s.tooltip}</TooltipContent>
                  </Tooltip>
                </SelectItem>
              ))}
            </TooltipProvider>
          </SelectContent>
        </Select>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search buyer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
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
                <TableHead className="w-[160px] text-xs">Date</TableHead>
                <TableHead className="w-[140px] text-xs">PO Number</TableHead>
                <TableHead className="w-[100px] text-right text-xs">Products</TableHead>
                <TableHead className="w-[140px] text-xs">Status</TableHead>
                <TableHead className="w-[100px] text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((po) => (
                <TableRow
                  key={po.id}
                  className="cursor-pointer text-sm hover:bg-muted/50"
                  onClick={() => setActive(po)}
                >
                  <TableCell className="text-[13px] font-medium text-foreground">
                    {po.buyer}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(po.dateReceived), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{po.poNumber ?? "—"}</TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">
                    {po.productsCount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-medium ${STATUS_STYLES[po.status]}`}
                    >
                      {STATUS_LABELS[po.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(po);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <RequestDetailSheet
        context={
          active
            ? {
                id: active.id,
                partnerId: active.partnerId,
                partnerName: active.buyer,
                contactEmail: active.contactEmail,
                title: active.poNumber ?? "—",
                titleLabel: "PO Number",
                status: active.status,
                dateReceived: active.dateReceived,
              }

            : null
        }
        onOpenChange={(o) => !o && setActive(null)}
      />
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
