import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Inbox, ListChecks, Boxes, Users, ArrowUpRight } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// KPI fetch helpers
// ---------------------------------------------------------------------------

async function countOpenRequests(): Promise<number> {
  const { count, error } = await supabase
    .from("incoming_requests")
    .select("*", { count: "exact", head: true })
    .in("status", ["NEW", "IN_REVIEW"]);
  if (error) throw error;
  return count ?? 0;
}

async function countReviewQueue(): Promise<number> {
  const { count, error } = await supabase
    .from("review_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "OPEN");
  if (error) throw error;
  return count ?? 0;
}

async function countWarehouseLines(): Promise<number> {
  const { count, error } = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (
          c: string,
          o: { count: "exact"; head: true },
        ) => {
          eq: (
            col: string,
            val: boolean,
          ) => Promise<{ count: number | null; error: unknown }>;
        };
      };
    }
  )
    .from("stock_entries")
    .select("*", { count: "exact", head: true })
    .eq("warehouse_confirmed", true);
  if (error) throw error as Error;
  return count ?? 0;
}

async function countActivePartners(): Promise<number> {
  const { count, error } = await supabase
    .from("partner")
    .select("partner_id", { count: "exact", head: true })
    .or("is_buyer.eq.true,is_supplier.eq.true");
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DashboardPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Operational overview
        </p>
      </header>

      <div className="flex-1 space-y-6 p-6">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Open requests"
            icon={Inbox}
            to="/requests"
            queryKey={["kpi", "open-requests"]}
            queryFn={countOpenRequests}
            accent="text-blue-600"
          />
          <KpiCard
            label="Items in review"
            icon={ListChecks}
            to="/review-queue"
            queryKey={["kpi", "review-open"]}
            queryFn={countReviewQueue}
            accent="text-amber-600"
          />
          <KpiCard
            label="Lines in warehouse"
            icon={Boxes}
            to="/stock"
            queryKey={["kpi", "warehouse-lines"]}
            queryFn={countWarehouseLines}
            accent="text-emerald-600"
          />
          <KpiCard
            label="Active partners"
            icon={Users}
            to="/partners"
            queryKey={["kpi", "active-partners"]}
            queryFn={countActivePartners}
            accent="text-purple-600"
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Recent Activity</h2>
            <p className="text-xs text-muted-foreground">
              Last 10 inbound email events
            </p>
          </div>
          <RecentActivity />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to: "/requests" | "/review-queue" | "/stock" | "/partners";
  queryKey: readonly unknown[];
  queryFn: () => Promise<number>;
  accent: string;
}

function KpiCard(props: KpiCardProps) {
  const { label, icon: Icon, to, queryKey, queryFn, accent } = props;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn,
    staleTime: 60_000,
  });

  const valueNode = isLoading ? (
    <Skeleton className="mt-2 h-8 w-16" />
  ) : error ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="mt-1 cursor-help text-2xl font-semibold tabular-nums text-muted-foreground">
            —
          </p>
        </TooltipTrigger>
        <TooltipContent>Could not load metric</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <p className="mt-1 text-2xl font-semibold tabular-nums">
      {(data ?? 0).toLocaleString()}
    </p>
  );

  return (
    <Link to={to} className="group block">
      <Card className="relative p-4 transition-colors group-hover:border-primary/60">
        <ArrowUpRight className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {valueNode}
          </div>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted ${accent}`}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

interface EmailRow {
  id: string;
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  parse_status: string | null;
  doc_type: string | null;
}

function useRecentEmails() {
  return useQuery({
    queryKey: ["dashboard", "recent-emails"],
    queryFn: async (): Promise<EmailRow[]> => {
      const { data, error } = await supabase
        .from("email_log")
        .select("id, from_address, subject, received_at, parse_status, doc_type")
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as EmailRow[];
    },
  });
}

function ParseStatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toUpperCase();
  const styles: Record<string, string> = {
    PARSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
    SKIPPED: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <Badge
      variant="outline"
      className={`text-xs ${styles[s] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
    >
      {s || "—"}
    </Badge>
  );
}

function RecentActivity() {
  const { data, isLoading, error } = useRecentEmails();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[220px]">From</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="w-[110px]">Doc Type</TableHead>
            <TableHead className="w-[150px]">Date</TableHead>
            <TableHead className="w-[120px]">Parse Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-destructive">
                {(error as Error).message}
              </TableCell>
            </TableRow>
          ) : (data ?? []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                No recent emails
              </TableCell>
            </TableRow>
          ) : (
            data!.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="truncate text-xs">{e.from_address ?? "—"}</TableCell>
                <TableCell className="truncate text-sm font-medium">
                  {e.subject ?? "—"}
                </TableCell>
                <TableCell>
                  {e.doc_type ? (
                    <Badge variant="outline" className="text-[10px]">
                      {e.doc_type}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {e.received_at
                    ? format(new Date(e.received_at), "dd MMM yyyy HH:mm")
                    : "—"}
                </TableCell>
                <TableCell>
                  <ParseStatusBadge status={e.parse_status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
