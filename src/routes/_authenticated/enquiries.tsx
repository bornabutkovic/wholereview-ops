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
import { RequestDetailSheet } from "@/components/request-detail-sheet";

export const Route = createFileRoute("/_authenticated/enquiries")({
  component: EnquiriesPage,
});

const ENQUIRY_DOC_TYPES = ["ENQUIRY", "ENQUIRY_LIST", "PRICE_REQUEST_XLS"] as const;

type RequestStatus =
  | "NEW"
  | "IN_REVIEW"
  | "OFFERED"
  | "CONFIRMED"
  | "PARTIAL"
  | "REJECTED"
  | "CLOSED";

const STATUS_STYLES: Record<RequestStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  IN_REVIEW: "bg-yellow-50 text-yellow-800 border-yellow-200",
  OFFERED: "bg-purple-50 text-purple-700 border-purple-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  NEW: "new",
  IN_REVIEW: "in review",
  OFFERED: "offered",
  CONFIRMED: "confirmed",
  PARTIAL: "partial",
  REJECTED: "rejected",
  CLOSED: "closed",
};

const STATUS_FILTERS: { value: RequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "NEW", label: "New" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "OFFERED", label: "Offered" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PARTIAL", label: "Partial" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CLOSED", label: "Closed" },
];

interface PartnerRow {
  partner_id: string;
  name: string | null;
  contact_email: string | null;
  country: string | null;
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
  request_items: { id: string }[] | null;
}

interface Enquiry {
  id: string;
  buyer: string;
  dateReceived: string;
  subject: string;
  productsCount: number;
  status: RequestStatus;
}

function normalizeStatus(s: string | null | undefined): RequestStatus {
  const v = (s ?? "").toUpperCase();
  if (
    v === "NEW" ||
    v === "IN_REVIEW" ||
    v === "OFFERED" ||
    v === "CONFIRMED" ||
    v === "PARTIAL" ||
    v === "REJECTED" ||
    v === "CLOSED"
  )
    return v;
  return "NEW";
}

function normalize(row: IncomingRequestRow): Enquiry {
  const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
  const email = Array.isArray(row.email_log) ? row.email_log[0] : row.email_log;
  return {
    id: row.id,
    buyer: partner?.name?.trim() || "Unknown",
    dateReceived: email?.received_at ?? row.created_at,
    subject: email?.subject?.trim() || "—",
    productsCount: (row.request_items ?? []).length,
    status: normalizeStatus(row.status),
  };
}

function EnquiriesPage() {
  const [status, setStatus] = useState<RequestStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["enquiries"],
    queryFn: async (): Promise<Enquiry[]> => {
      const { data, error } = await supabase
        .from("incoming_requests")
        .select(
          `id, doc_type, status, po_number, partner_id, is_urgent, cycle_ref, created_at,
           partner:partner_id (partner_id, name, contact_email, country),
           email_log:email_log_id (subject, received_at),
           request_items (id, np_sku_id, raw_product_ref, qty_requested)`,
        )
        .in("doc_type", ENQUIRY_DOC_TYPES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as IncomingRequestRow[]).map(normalize);
    },
  });

  const filtered = useMemo(() => {
    const items = query.data ?? [];
    return items.filter((e) => {
      if (status !== "ALL" && e.status !== status) return false;
      if (search.trim() && !e.buyer.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [query.data, status, search]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Enquiries</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {query.isLoading
              ? "Loading…"
              : `${filtered.length} enquir${filtered.length === 1 ? "y" : "ies"}`}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
        <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus | "ALL")}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
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
                <TableHead className="text-xs">Subject</TableHead>
                <TableHead className="w-[100px] text-right text-xs">Products</TableHead>
                <TableHead className="w-[140px] text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className="text-sm">
                  <TableCell className="text-[13px] font-medium text-foreground">
                    {e.buyer}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.dateReceived), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-[13px]">{e.subject}</TableCell>
                  <TableCell className="text-right text-[13px] tabular-nums">
                    {e.productsCount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-medium ${STATUS_STYLES[e.status]}`}
                    >
                      {STATUS_LABELS[e.status]}
                    </Badge>
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
        <p className="text-sm font-medium">No enquiries</p>
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
        <p className="text-sm font-medium">Failed to load enquiries</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
