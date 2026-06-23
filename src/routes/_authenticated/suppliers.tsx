import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { AlertCircle, Check, Inbox, Search, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/suppliers")({
  component: SuppliersPage,
});

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

type SupplierCode = "MEDIKA" | "OKTAL";
const SUPPLIERS: SupplierCode[] = ["MEDIKA", "OKTAL"];

const SUPPLIER_STYLES: Record<SupplierCode, string> = {
  MEDIKA: "bg-blue-50 text-blue-700 border-blue-200",
  OKTAL: "bg-purple-50 text-purple-700 border-purple-200",
};

function SupplierBadge({ code }: { code: string | null }) {
  const upper = (code ?? "").toUpperCase();
  const known = SUPPLIERS.includes(upper as SupplierCode)
    ? (upper as SupplierCode)
    : null;
  return (
    <Badge
      variant="outline"
      className={`font-medium ${
        known ? SUPPLIER_STYLES[known] : "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      {upper || "—"}
    </Badge>
  );
}

function SuppliersPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Draft orders and supplier offers
        </p>
      </header>

      <Tabs defaultValue="draft-orders" className="flex flex-1 flex-col">
        <div className="border-b px-6 pt-3">
          <TabsList>
            <TabsTrigger value="draft-orders" className="text-xs">
              Draft Orders
            </TabsTrigger>
            <TabsTrigger value="supplier-offers" className="text-xs">
              Supplier Offers
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="draft-orders" className="m-0 flex-1 overflow-hidden">
          <DraftOrdersTab />
        </TabsContent>
        <TabsContent value="supplier-offers" className="m-0 flex-1 overflow-hidden">
          <SupplierOffersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — Draft Orders
// ---------------------------------------------------------------------------


interface EmailLogRow {
  id: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  received_at: string | null;
  parse_status: string | null;
  doc_type: string | null;
  has_attachments: boolean | null;
}

interface DraftOrder {
  id: string;
  supplier: string;
  subject: string;
  date: string | null;
  parseStatus: string;
  docType: string;
  hasAttachments: boolean;
}

function normalizeDraft(row: EmailLogRow): DraftOrder {
  return {
    id: row.id,
    supplier: row.from_address ?? row.to_address ?? "—",
    subject: row.subject ?? "—",
    date: row.received_at,
    parseStatus: row.parse_status ?? "—",
    docType: row.doc_type ?? "—",
    hasAttachments: !!row.has_attachments,
  };
}

function DraftOrdersTab() {
  const query = useQuery({
    queryKey: ["supplier-draft-orders"],
    queryFn: async (): Promise<DraftOrder[]> => {
      const { data, error } = await supabase
        .from("email_log")
        .select(
          "id, from_address, to_address, subject, received_at, parse_status, doc_type, has_attachments",
        )
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as unknown as EmailLogRow[]).map(normalizeDraft);
    },
  });

  const filtered = query.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <div className="ml-auto text-xs text-muted-foreground">
          {query.isLoading
            ? "Loading…"
            : `${filtered.length} email${filtered.length === 1 ? "" : "s"}`}
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
          <EmptyState label="No emails" />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="text-xs">From / To</TableHead>
                <TableHead className="text-xs">Subject</TableHead>
                <TableHead className="w-[140px] text-xs">Doc Type</TableHead>
                <TableHead className="w-[110px] text-xs">Parse</TableHead>
                <TableHead className="w-[90px] text-center text-xs">Attach</TableHead>
                <TableHead className="w-[160px] text-xs">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id} className="text-sm">
                  <TableCell className="max-w-[220px] truncate text-[13px]">
                    {d.supplier}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-[13px]">
                    {d.subject}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="font-medium">
                      {d.docType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="font-medium">
                      {d.parseStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {d.hasAttachments ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.date ? formatDistanceToNow(new Date(d.date), { addSuffix: true }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Supplier Offers
// ---------------------------------------------------------------------------

type OfferStatus =
  | "pending_review"
  | "accepted"
  | "rejected"
  | "buyer_query_sent"
  | "buyer_accepted"
  | "buyer_rejected";

const OFFER_STATUS_STYLES: Record<OfferStatus, string> = {
  pending_review: "bg-yellow-50 text-yellow-800 border-yellow-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  buyer_query_sent: "bg-blue-50 text-blue-700 border-blue-200",
  buyer_accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  buyer_rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending_review: "pending review",
  accepted: "accepted",
  rejected: "rejected",
  buyer_query_sent: "buyer query sent",
  buyer_accepted: "buyer accepted",
  buyer_rejected: "buyer rejected",
};

const OFFER_STATUS_FILTERS: { value: OfferStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "pending_review", label: "Pending review" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "buyer_query_sent", label: "Buyer query sent" },
  { value: "buyer_accepted", label: "Buyer accepted" },
  { value: "buyer_rejected", label: "Buyer rejected" },
];

interface SupplierOfferRow {
  id: string;
  supplier: string;
  raw_product_name: string | null;
  np_sku_id: string | null;
  quantity_offered: number | null;
  unit: string | null;
  price_per_unit: number | null;
  currency: string | null;
  expiry_date: string | null;
  batch_number: string | null;
  expiry_ok: boolean | null;
  status: string | null;
  created_at: string | null;
  incoming_request_id: string | null;
  np_sku?: {
    eu_approval_no: string | null;
    hr_approval_no: string | null;
  } | null;
}


function normalizeOfferStatus(s: string | null | undefined): OfferStatus {
  const v = (s ?? "").toLowerCase();
  if (
    v === "pending_review" ||
    v === "accepted" ||
    v === "rejected" ||
    v === "buyer_query_sent" ||
    v === "buyer_accepted" ||
    v === "buyer_rejected"
  )
    return v;
  return "pending_review";
}

function SupplierOffersTab() {
  const [status, setStatus] = useState<OfferStatus | "ALL">("ALL");
  const [supplier, setSupplier] = useState<SupplierCode | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["supplier-offers"],
    queryFn: async (): Promise<SupplierOfferRow[]> => {
      const { data, error } = await supabase
        .from("supplier_offers")
        .select(
          "id, supplier, raw_product_name, np_sku_id, quantity_offered, unit, price_per_unit, currency, expiry_date, batch_number, expiry_ok, status, created_at, incoming_request_id, np_sku:np_sku_id(eu_approval_no, hr_approval_no)",
        )

        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SupplierOfferRow[];
    },
  });

  const filtered = useMemo(() => {
    return (query.data ?? []).filter((o) => {
      const s = normalizeOfferStatus(o.status);
      if (status !== "ALL" && s !== status) return false;
      if (
        supplier !== "ALL" &&
        o.supplier.toUpperCase() !== supplier
      )
        return false;
      if (
        search.trim() &&
        !(o.raw_product_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [query.data, status, supplier, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <Select value={status} onValueChange={(v) => setStatus(v as OfferStatus | "ALL")}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OFFER_STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={supplier}
          onValueChange={(v) => setSupplier(v as SupplierCode | "ALL")}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              All suppliers
            </SelectItem>
            {SUPPLIERS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search product…"
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
          <EmptyState label="No supplier offers" />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[120px] text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="w-[110px] text-right text-xs">Qty Offered</TableHead>
                <TableHead className="w-[130px] text-right text-xs">Price</TableHead>
                <TableHead className="w-[130px] text-xs">Expiry Date</TableHead>
                <TableHead className="w-[90px] text-center text-xs">Expiry OK</TableHead>
                <TableHead className="w-[150px] text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => {
                const s = normalizeOfferStatus(o.status);
                return (
                  <TableRow key={o.id} className="text-sm">
                    <TableCell>
                      <SupplierBadge code={o.supplier} />
                    </TableCell>
                    <TableCell className="max-w-0 truncate text-[13px]">
                      <div>{o.raw_product_name ?? "—"}</div>
                      {(o.np_sku?.eu_approval_no || o.np_sku?.hr_approval_no) && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {o.np_sku?.eu_approval_no && <span>EU: {o.np_sku.eu_approval_no}</span>}
                          {o.np_sku?.eu_approval_no && o.np_sku?.hr_approval_no && <span> · </span>}
                          {o.np_sku?.hr_approval_no && <span>HR: {o.np_sku.hr_approval_no}</span>}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-[13px] tabular-nums">
                      {(o.quantity_offered ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {o.price_per_unit != null
                        ? `${o.price_per_unit.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} ${o.currency ?? ""}`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.expiry_date
                        ? format(new Date(o.expiry_date), "yyyy-MM-dd")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {o.expiry_ok === true ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" />
                      ) : o.expiry_ok === false ? (
                        <X className="mx-auto h-4 w-4 text-rose-600" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-medium ${OFFER_STATUS_STYLES[s]}`}
                      >
                        {OFFER_STATUS_LABELS[s]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
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
        <p className="text-sm font-medium">Failed to load</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
