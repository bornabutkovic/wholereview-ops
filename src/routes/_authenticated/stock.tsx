import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInMonths } from "date-fns";
import { Search, Construction, AlertTriangle, Loader2, PlayCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";


import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawBatch {
  batch_id: string;
  np_sku_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  qty_initial: number | null;
  qty_unit: string | null;
  status: string | null;
  received_at: string | null;
  supplier_partner_id: string | null;
  np_sku:
    | { np_product: { brand: string | null; inn: string | null } | { brand: string | null; inn: string | null }[] | null }
    | { np_product: { brand: string | null; inn: string | null } | { brand: string | null; inn: string | null }[] | null }[]
    | null;
  partner:
    | { name: string | null; partner_id: string }
    | { name: string | null; partner_id: string }[]
    | null;
}

interface Batch {
  batch_id: string;
  np_sku_id: string | null;
  product_name: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  qty_initial: number | null;
  qty_unit: string | null;
  status: string | null;
  received_at: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SupplierFilter = "ALL" | "MEDIKA" | "OKTAL";
const SUPPLIER_STYLES: Record<string, string> = {
  MEDIKA: "bg-blue-50 text-blue-700 border-blue-200",
  OKTAL: "bg-purple-50 text-purple-700 border-purple-200",
};

function SupplierBadge({ name, code }: { name?: string | null; code?: string | null }) {
  const upper = (code ?? "").toUpperCase();
  const label = name || code || "—";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`text-xs font-medium cursor-default ${
            SUPPLIER_STYLES[upper] ?? "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          {label}
        </Badge>
      </TooltipTrigger>
      {code && (
        <TooltipContent side="top">
          <span className="text-xs">Code: {code}</span>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toUpperCase();
  const styles: Record<string, string> = {
    RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ALLOCATED: "bg-blue-50 text-blue-700 border-blue-200",
    SHIPPED: "bg-purple-50 text-purple-700 border-purple-200",
    RETURNED: "bg-amber-50 text-amber-700 border-amber-200",
    DESTROYED: "bg-red-50 text-red-700 border-red-200",
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

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function useBatches() {
  return useQuery({
    queryKey: ["warehouse-batches"],
    queryFn: async (): Promise<Batch[]> => {
      const { data, error } = await supabase
        .from("batch")
        .select(
          "batch_id, np_sku_id, lot_number, expiry_date, qty_initial, qty_unit, status, received_at, supplier_partner_id, np_sku:np_sku_id(np_product:np_product_id(brand, inn)), partner:supplier_partner_id(partner_id, name)",
        )
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as RawBatch[]).map((r) => {
        const sku = Array.isArray(r.np_sku) ? r.np_sku[0] : r.np_sku;
        const prod = sku
          ? Array.isArray(sku.np_product)
            ? sku.np_product[0]
            : sku.np_product
          : null;
        const sup = Array.isArray(r.partner) ? r.partner[0] : r.partner;
        return {
          batch_id: r.batch_id,
          np_sku_id: r.np_sku_id,
          product_name: [prod?.brand, prod?.inn ? `(${prod.inn})` : null].filter(Boolean).join(" ") || null,
          supplier_name: sup?.name ?? null,
          supplier_code: sup?.partner_id ?? null,
          lot_number: r.lot_number,
          expiry_date: r.expiry_date,
          qty_initial: r.qty_initial,
          qty_unit: r.qty_unit,
          status: r.status,
          received_at: r.received_at,
        };
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function StockPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Stock</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Warehouse batches and virtual stock
        </p>
      </header>

      <Tabs defaultValue="warehouse" className="flex flex-1 flex-col">
        <div className="border-b px-6 pt-3">
          <TabsList>
            <TabsTrigger value="warehouse" className="text-xs">
              Warehouse Batches
            </TabsTrigger>
            <TabsTrigger value="virtual" className="text-xs">
              Virtual Stock
            </TabsTrigger>
            <TabsTrigger value="allocation" className="text-xs">
              Allocation
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="warehouse" className="flex-1 overflow-auto p-6 pt-4">
          <WarehouseBatches />
        </TabsContent>

        <TabsContent value="virtual" className="flex-1 overflow-auto p-6 pt-4">
          <VirtualStockPlaceholder />
        </TabsContent>

        <TabsContent value="allocation" className="flex-1 overflow-auto p-6 pt-4">
          <AllocationTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Warehouse batches tab
// ---------------------------------------------------------------------------

function WarehouseBatches() {
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState<SupplierFilter>("ALL");
  const [status, setStatus] = useState<string>("ALL");

  const { data, isLoading, error } = useBatches();

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((b) => b.status && set.add(b.status.toUpperCase()));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((b) => {
      if (supplier !== "ALL" && (b.supplier_code ?? "").toUpperCase() !== supplier) {
        return false;
      }
      if (status !== "ALL" && (b.status ?? "").toUpperCase() !== status) {
        return false;
      }
      if (!q) return true;
      return (
        (b.product_name ?? "").toLowerCase().includes(q) ||
        (b.lot_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, supplier, status]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or lot number..."
            className="pl-8 h-9 text-sm"
          />
        </div>

        <Select value={supplier} onValueChange={(v) => setSupplier(v as SupplierFilter)}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All suppliers</SelectItem>
            <SelectItem value="MEDIKA">MEDIKA</SelectItem>
            <SelectItem value="OKTAL">OKTAL</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="ml-auto h-6 text-xs">
          {filtered.length} {filtered.length === 1 ? "batch" : "batches"}
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Batch ID</TableHead>
              <TableHead className="w-[120px]">SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="w-[120px]">Supplier</TableHead>
              <TableHead className="w-[130px]">Lot</TableHead>
              <TableHead className="w-[120px]">Expiry</TableHead>
              <TableHead className="w-[120px]">Qty</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[110px]">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  No batches found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => <BatchRow key={b.batch_id} batch={b} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BatchRow({ batch: b }: { batch: Batch }) {
  const expiringSoon = useMemo(() => {
    if (!b.expiry_date) return false;
    try {
      return differenceInMonths(new Date(b.expiry_date), new Date()) < 6;
    } catch {
      return false;
    }
  }, [b.expiry_date]);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{b.batch_id.slice(0, 8)}</TableCell>
      <TableCell className="font-mono text-xs">{b.np_sku_id ?? "—"}</TableCell>
      <TableCell className="font-medium text-sm">{b.product_name ?? "—"}</TableCell>
      <TableCell>
        <SupplierBadge code={b.supplier_code ?? b.supplier_name} />
      </TableCell>
      <TableCell className="font-mono text-xs">{b.lot_number ?? "—"}</TableCell>
      <TableCell
        className={`text-xs ${
          expiringSoon ? "text-red-600 font-semibold" : "text-muted-foreground"
        }`}
      >
        {b.expiry_date ? format(new Date(b.expiry_date), "dd MMM yyyy") : "—"}
      </TableCell>
      <TableCell className="text-sm">
        {b.qty_initial != null ? b.qty_initial.toLocaleString() : "—"}
        {b.qty_unit ? <span className="ml-1 text-muted-foreground">{b.qty_unit}</span> : null}
      </TableCell>
      <TableCell>
        <StatusBadge status={b.status} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {b.received_at ? format(new Date(b.received_at), "dd MMM yyyy") : "—"}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Virtual stock placeholder
// ---------------------------------------------------------------------------

function VirtualStockPlaceholder() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-8 py-12 text-center">
        <Construction className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Virtual stock tracking</h2>
        <p className="text-xs text-muted-foreground">
          Virtual stock tracking available in M2
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocation tab
// ---------------------------------------------------------------------------

interface CycleRow {
  cycle_ref: string;
  status: string | null;
}

interface AllocationPreviewRow {
  np_sku_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  qty_requested: number | null;
  qty_allocated: number | null;
  fulfilled_pct: number | null;
  status: string | null;
}

interface AllocateCycleResponse {
  allocations?: AllocationPreviewRow[];
  confirmed_count?: number;
}

const ALLOC_STATUS_STYLES: Record<string, string> = {
  FULL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
  NONE: "bg-rose-50 text-rose-700 border-rose-200",
};

function AllocationTab() {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<AllocationPreviewRow[] | null>(null);

  const cycleQuery = useQuery({
    queryKey: ["open-cycle"],
    queryFn: async (): Promise<CycleRow | null> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: CycleRow | null; error: unknown }>;
            };
          };
        };
      })
        .from("cycles")
        .select("cycle_ref, status")
        .eq("status", "OPEN")
        .maybeSingle();
      if (error) throw error as Error;
      return data;
    },
  });

  const cycle = cycleQuery.data;
  const cycleRef = cycle?.cycle_ref ?? null;

  const stockConfirmed = useQuery({
    queryKey: ["stock-confirmed", cycleRef],
    enabled: !!cycleRef,
    queryFn: async (): Promise<{ total: number; unconfirmed: number }> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => Promise<{
              data: Array<{ warehouse_confirmed: boolean | null }> | null;
              error: unknown;
            }>;
          };
        };
      })
        .from("stock_entries")
        .select("warehouse_confirmed")
        .eq("cycle_ref", cycleRef!);
      if (error) throw error as Error;
      const rows = data ?? [];
      return {
        total: rows.length,
        unconfirmed: rows.filter((r) => !r.warehouse_confirmed).length,
      };
    },
  });

  const allConfirmed =
    !!stockConfirmed.data &&
    stockConfirmed.data.total > 0 &&
    stockConfirmed.data.unconfirmed === 0;

  const confirmWarehouse = useMutation({
    mutationFn: async () => {
      if (!cycleRef) throw new Error("No open cycle");
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: unknown }>;
          };
        };
      })
        .from("stock_entries")
        .update({ warehouse_confirmed: true })
        .eq("cycle_ref", cycleRef);
      if (error) throw error as Error;
    },
    onSuccess: () => {
      toast.success("Skladišno stanje potvrđeno");
      queryClient.invalidateQueries({ queryKey: ["stock-confirmed", cycleRef] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAllocation = useMutation({
    mutationFn: async (previewOnly: boolean): Promise<AllocateCycleResponse> => {
      if (!cycleRef) throw new Error("No open cycle");
      const { data, error } = await supabase.functions.invoke<AllocateCycleResponse>(
        "allocate-cycle",
        { body: { cycle_ref: cycleRef, preview_only: previewOnly } },
      );
      if (error) throw error;
      return data ?? {};
    },
  });

  const handlePreview = () => {
    runAllocation.mutate(true, {
      onSuccess: (res) => setPreview(res.allocations ?? []),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleApprove = () => {
    runAllocation.mutate(false, {
      onSuccess: (res) => {
        const n = res.confirmed_count ?? res.allocations?.length ?? 0;
        toast.success(`Ciklus zatvoren. ${n} alokacija potvrđeno.`);
        setPreview(null);
        queryClient.invalidateQueries({ queryKey: ["open-cycle"] });
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const disabled = !cycleRef || !allConfirmed || runAllocation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cycle
          </span>
          {cycleQuery.isLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : cycle ? (
            <>
              <Badge variant="outline" className="font-mono text-xs">
                {cycle.cycle_ref}
              </Badge>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">
                {cycle.status}
              </Badge>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No open cycle</span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!cycleRef || confirmWarehouse.isPending || allConfirmed}
            onClick={() => confirmWarehouse.mutate()}
          >
            {confirmWarehouse.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
            )}
            Confirm Warehouse Stock
          </Button>
          <Button size="sm" disabled={disabled} onClick={handlePreview}>
            {runAllocation.isPending && !preview ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-3.5 w-3.5" />
            )}
            Run Allocation Preview
          </Button>
        </div>
      </div>

      {cycleRef && !allConfirmed && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          Potvrdite skladišno stanje prije pokretanja alokacije
          {stockConfirmed.data && (
            <span className="ml-auto font-mono">
              {stockConfirmed.data.total - stockConfirmed.data.unconfirmed}/
              {stockConfirmed.data.total} confirmed
            </span>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">SKU</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Qty Requested</TableHead>
                <TableHead className="text-right">Qty Allocated</TableHead>
                <TableHead className="text-right">Fulfilled %</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                    No allocations
                  </TableCell>
                </TableRow>
              ) : (
                preview.map((r, i) => {
                  const st = (r.status ?? "").toUpperCase();
                  const pct =
                    r.fulfilled_pct ??
                    (r.qty_requested && r.qty_allocated != null
                      ? Math.round((r.qty_allocated / r.qty_requested) * 100)
                      : null);
                  return (
                    <TableRow key={`${r.np_sku_id}-${r.partner_id}-${i}`} className="text-sm">
                      <TableCell className="font-mono text-xs">{r.np_sku_id ?? "—"}</TableCell>
                      <TableCell>{r.partner_name ?? r.partner_id ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.qty_requested ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.qty_allocated ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct != null ? `${pct}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            ALLOC_STATUS_STYLES[st] ??
                            "bg-slate-100 text-slate-600 border-slate-200"
                          }
                        >
                          {st || "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="flex justify-end">
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={disabled}
            onClick={handleApprove}
          >
            {runAllocation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
            )}
            Approve &amp; Close Cycle
          </Button>
        </div>
      )}
    </div>
  );
}

