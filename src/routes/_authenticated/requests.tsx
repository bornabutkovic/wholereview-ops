import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Search, Inbox, AlertCircle, Mail, Flame } from "lucide-react";

import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/requests")({
  component: RequestsPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type RequestStatus =
  | "NEW"
  | "IN_REVIEW"
  | "OFFERED"
  | "CONFIRMED"
  | "PARTIAL"
  | "REJECTED"
  | "CLOSED"
  | "RECEIVED";

type StatusFilter = "ALL" | "NEW" | "IN_REVIEW" | "OFFERED" | "CONFIRMED" | "CLOSED" | "REJECTED";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "OFFERED", label: "Offered" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "CLOSED", label: "Closed" },
  { value: "REJECTED", label: "Rejected" },
];

const DOC_TYPES = [
  "ALL",
  "ENQUIRY",
  "PO",
  "ENQUIRY_LIST",
  "PRICE_REQUEST_XLS",
  "PO_XLS",
  "PO_PDF",
  "OTHER",
] as const;
type DocTypeFilter = (typeof DOC_TYPES)[number];

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  IN_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  OFFERED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
  RECEIVED: "bg-slate-100 text-slate-600 border-slate-200",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestRow {
  id: string;
  email_log_id: string | null;
  partner_id: string | null;
  doc_type: string;
  status: string;
  po_number: string | null;
  received_at: string | null;
  is_urgent: boolean;
  raw_text: string | null;
  notes: string | null;
  created_at: string;
  partner: { partner_id: string; name: string } | null;
  request_items: { count: number }[];
}

interface RequestItem {
  id: string;
  raw_product_ref: string | null;
  np_sku_id: string | null;
  qty_requested: number | null;
  qty_unit: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function RequestsPage() {
  const [status, setStatus] = useState<StatusFilter>("NEW");
  const [docType, setDocType] = useState<DocTypeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [active, setActive] = useState<RequestRow | null>(null);

  const debouncedSearch = useDebounced(search.trim(), 250);

  const query = useQuery({
    queryKey: ["requests", status, docType, debouncedSearch, urgentOnly],
    queryFn: async (): Promise<RequestRow[]> => {
      let q = supabase
        .from("incoming_requests")
        .select(
          "id, email_log_id, partner_id, doc_type, status, po_number, received_at, is_urgent, raw_text, notes, created_at, partner:partner_id ( partner_id, name ), request_items ( count )",
        )
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(100);

      if (status !== "ALL") q = q.eq("status", status);
      if (docType !== "ALL") q = q.eq("doc_type", docType);
      if (urgentOnly) q = q.eq("is_urgent", true);
      if (debouncedSearch) {
        // ilike on po_number; partner name filter applied client-side
        q = q.ilike("po_number", `%${debouncedSearch}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
  });

  // Apply client-side partner-name search in parallel to po_number filter.
  const rows = (() => {
    const data = query.data ?? [];
    if (!debouncedSearch) return data;
    const needle = debouncedSearch.toLowerCase();
    return data.filter(
      (r) =>
        (r.po_number ?? "").toLowerCase().includes(needle) ||
        (r.partner?.name ?? "").toLowerCase().includes(needle),
    );
  })();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        <header className="border-b px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">Requests</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Incoming buyer enquiries and purchase orders.
          </p>
        </header>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setStatus(t.value)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  status === t.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Select value={docType} onValueChange={(v) => setDocType(v as DocTypeFilter)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((d) => (
                <SelectItem key={d} value={d} className="text-xs">
                  {d === "ALL" ? "All doc types" : d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 rounded-md border px-2.5 py-1">
            <Switch
              id="urgent-only"
              checked={urgentOnly}
              onCheckedChange={setUrgentOnly}
            />
            <Label htmlFor="urgent-only" className="cursor-pointer text-xs">
              Urgent only
            </Label>
          </div>

          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search PO# or partner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="h-8 w-[260px] pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {query.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to load requests</AlertTitle>
                <AlertDescription className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs">
                    {(query.error as Error)?.message ?? "Unknown error"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : query.isLoading ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[140px] text-xs">Received</TableHead>
                  <TableHead className="text-xs">Partner</TableHead>
                  <TableHead className="w-[140px] text-xs">Doc type</TableHead>
                  <TableHead className="w-[140px] text-xs">PO number</TableHead>
                  <TableHead className="w-[90px] text-xs">Items</TableHead>
                  <TableHead className="w-[120px] text-xs">Status</TableHead>
                  <TableHead className="w-[90px] text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const itemsCount = r.request_items?.[0]?.count ?? 0;
                  return (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="text-xs text-muted-foreground">
                        {r.received_at ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                {formatDistanceToNow(new Date(r.received_at), {
                                  addSuffix: true,
                                })}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(r.received_at), "dd MMM yyyy HH:mm")}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {r.partner ? (
                            <span className="font-medium">{r.partner.name}</span>
                          ) : (
                            <span className="italic text-muted-foreground">Unknown</span>
                          )}
                          {r.is_urgent && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-red-200 bg-red-50 text-[10px] text-red-700"
                            >
                              <Flame className="h-3 w-3" />
                              Urgent
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.doc_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.po_number ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{itemsCount}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            STATUS_STYLES[r.status] ??
                              "bg-slate-100 text-slate-600 border-slate-200",
                          )}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setActive(r)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <RequestSheet
          item={active}
          open={!!active}
          onOpenChange={(o) => !o && setActive(null)}
        />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Loading / Empty
// ---------------------------------------------------------------------------

function LoadingRows() {
  return (
    <div className="space-y-2 p-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No requests match the current filters.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side sheet (read-only)
// ---------------------------------------------------------------------------

interface RequestSheetProps {
  item: RequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RequestSheet({ item, open, onOpenChange }: RequestSheetProps) {
  const itemsQuery = useQuery({
    enabled: !!item,
    queryKey: ["request-items", item?.id],
    queryFn: async (): Promise<RequestItem[]> => {
      const { data, error } = await supabase
        .from("request_items")
        .select("id, raw_product_ref, np_sku_id, qty_requested, qty_unit, status")
        .eq("incoming_request_id", item!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RequestItem[];
    },
  });

  const emailQuery = useQuery({
    enabled: !!item?.email_log_id,
    queryKey: ["email-log", item?.email_log_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_log")
        .select("id, subject, from_address, received_at")
        .eq("id", item!.email_log_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            {item?.po_number ?? "Request"}
            {item?.is_urgent && (
              <Badge
                variant="outline"
                className="gap-1 border-red-200 bg-red-50 text-[10px] text-red-700"
              >
                <Flame className="h-3 w-3" />
                Urgent
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {item?.partner?.name ?? "Unknown partner"} ·{" "}
            <Badge variant="outline" className="text-[10px]">
              {item?.doc_type}
            </Badge>
          </SheetDescription>
        </SheetHeader>

        {item && (
          <div className="mt-6 space-y-6">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source email
              </h3>
              {item.email_log_id ? (
                emailQuery.isLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : emailQuery.data ? (
                  <div className="rounded-md border p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {emailQuery.data.subject ?? "(no subject)"}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {emailQuery.data.from_address ?? "—"}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {emailQuery.data.received_at
                            ? format(
                                new Date(emailQuery.data.received_at),
                                "dd MMM yyyy HH:mm",
                              )
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Email not found.</p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">No linked email.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Items
              </h3>
              {itemsQuery.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : itemsQuery.isError ? (
                <p className="text-xs text-destructive">
                  {(itemsQuery.error as Error).message}
                </p>
              ) : (itemsQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No items.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="w-[100px] text-xs">Qty</TableHead>
                        <TableHead className="w-[100px] text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsQuery.data!.map((it) => (
                        <TableRow key={it.id} className="text-xs">
                          <TableCell>
                            <div className="font-medium">
                              {it.raw_product_ref ?? "—"}
                            </div>
                            {it.np_sku_id && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {it.np_sku_id}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {it.qty_requested ?? "—"}{" "}
                            <span className="text-muted-foreground">{it.qty_unit ?? ""}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {it.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Raw text
              </h3>
              <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                {item.raw_text ?? "(empty)"}
              </pre>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
