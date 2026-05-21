import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInMonths } from "date-fns";
import { Search, Construction } from "lucide-react";

import { supabase } from "@/lib/supabase";
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

function SupplierBadge({ code }: { code: string | null }) {
  const upper = (code ?? "").toUpperCase();
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium ${
        SUPPLIER_STYLES[upper] ?? "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      {upper || "—"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toUpperCase();
  const styles: Record<string, string> = {
    AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    RESERVED: "bg-amber-50 text-amber-700 border-amber-200",
    DEPLETED: "bg-slate-100 text-slate-600 border-slate-200",
    EXPIRED: "bg-red-50 text-red-700 border-red-200",
    QUARANTINE: "bg-orange-50 text-orange-700 border-orange-200",
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
          </TabsList>
        </div>

        <TabsContent value="warehouse" className="flex-1 overflow-auto p-6 pt-4">
          <WarehouseBatches />
        </TabsContent>

        <TabsContent value="virtual" className="flex-1 overflow-auto p-6 pt-4">
          <VirtualStockPlaceholder />
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
              filtered.map((b) => <BatchRow key={b.id} batch={b} />)
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
      <TableCell className="font-mono text-xs">{b.id.slice(0, 8)}</TableCell>
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
        {b.received_date ? format(new Date(b.received_date), "dd MMM yyyy") : "—"}
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
