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

export const Route = createFileRoute("/_authenticated/enquiries")({
  component: EnquiriesPage,
});

type EnquiryStatus = "new" | "in_progress" | "closed";

interface RequestItemRow {
  id?: string | null;
}

interface PartnerRow {
  partner_id: string;
  code: string | null;
  name?: string | null;
}

interface IncomingRequestRow {
  id: string;
  partner_id: string | null;
  doc_type: string | null;
  status: string | null;
  subject: string | null;
  created_at: string;
  received_at?: string | null;
  partner: PartnerRow | PartnerRow[] | null;
  request_items: RequestItemRow[] | null;
}

interface Enquiry {
  id: string;
  buyer: string;
  dateReceived: string;
  subject: string;
  productsCount: number;
  status: EnquiryStatus;
}

const STATUS_STYLES: Record<EnquiryStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "new",
  in_progress: "in progress",
  closed: "closed",
};

const STATUS_FILTERS: { value: EnquiryStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Closed" },
];

function normalizeStatus(s: string | null | undefined): EnquiryStatus {
  const v = (s ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (v === "in_progress" || v === "inprogress") return "in_progress";
  if (v === "closed" || v === "resolved" || v === "done") return "closed";
  return "new";
}

function normalize(row: IncomingRequestRow): Enquiry {
  const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
  const buyer = partner?.name?.trim() || partner?.code?.trim() || "—";
  return {
    id: row.id,
    buyer,
    dateReceived: row.received_at ?? row.created_at,
    subject: row.subject ?? "—",
    productsCount: (row.request_items ?? []).length,
    status: normalizeStatus(row.status),
  };
}

function EnquiriesPage() {
  const [status, setStatus] = useState<EnquiryStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["enquiries"],
    queryFn: async (): Promise<Enquiry[]> => {
      const { data, error } = await supabase
        .from("incoming_requests")
        .select(
          "id, partner_id, doc_type, status, subject, created_at, received_at, partner:partner_id(partner_id, code, name), request_items(id)",
        )
        .eq("doc_type", "ENQUIRY")
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
      if (search.trim() && !e.buyer.toLowerCase().includes(search.toLowerCase())) return false;
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
        <Select value={status} onValueChange={(v) => setStatus(v as EnquiryStatus | "ALL")}>
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
                <TableHead className="w-[130px] text-xs">Status</TableHead>
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
