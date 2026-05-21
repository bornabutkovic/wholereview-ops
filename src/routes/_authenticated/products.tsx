import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Hash, Globe, Barcode, Package as PackageIcon, FileBadge } from "lucide-react";

import { supabase } from "@/lib/supabase";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkuRow {
  np_sku_id: string;
  pack_description: string | null;
  origin_country: string | null;
  gtin_ean: string | null;
  status: string | null;
  hr_approval_no: string | null;
  eu_approval_no: string | null;
  np_product:
    | { brand: string | null; inn: string | null }
    | { brand: string | null; inn: string | null }[]
    | null;
}

interface Sku {
  np_sku_id: string;
  pack_description: string | null;
  origin_country: string | null;
  gtin_ean: string | null;
  status: string | null;
  hr_approval_no: string | null;
  eu_approval_no: string | null;
  brand: string | null;
  inn: string | null;
}

interface Alias {
  external_name: string | null;
  external_code: string | null;
  partner_id: string | null;
}

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

function productName(s: Pick<Sku, "brand" | "inn">) {
  return [s.brand, s.inn ? `(${s.inn})` : null].filter(Boolean).join(" ") || "—";
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function useSkus() {
  return useQuery({
    queryKey: ["products-sku-list"],
    queryFn: async (): Promise<Sku[]> => {
      const { data, error } = await supabase
        .from("np_sku")
        .select(
          "np_sku_id, pack_description, origin_country, gtin_ean, status, hr_approval_no, eu_approval_no, np_product:np_product_id(brand, inn)",
        )
        .order("np_sku_id", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as SkuRow[]).map((r) => {
        const p = Array.isArray(r.np_product) ? r.np_product[0] : r.np_product;
        return {
          np_sku_id: r.np_sku_id,
          pack_description: r.pack_description,
          origin_country: r.origin_country,
          gtin_ean: r.gtin_ean,
          status: r.status,
          hr_approval_no: r.hr_approval_no,
          eu_approval_no: r.eu_approval_no,
          brand: p?.brand ?? null,
          inn: p?.inn ?? null,
        };
      });
    },
  });
}

function useAliases(skuId: string | null) {
  return useQuery({
    queryKey: ["product-aliases", skuId],
    enabled: !!skuId,
    queryFn: async (): Promise<Alias[]> => {
      const { data, error } = await supabase
        .from("product_code_alias")
        .select("external_name, external_code, partner_id")
        .eq("np_sku_id", skuId!)
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Alias[];
    },
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toUpperCase();
  if (s === "ACTIVE") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        ACTIVE
      </Badge>
    );
  }
  if (s === "INACTIVE") {
    return (
      <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
        INACTIVE
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
      {s || "—"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ProductsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selected, setSelected] = useState<Sku | null>(null);

  const { data, isLoading, error } = useSkus();

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((s) => {
      if (statusFilter !== "ALL" && (s.status ?? "").toUpperCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.np_sku_id.toLowerCase().includes(q) ||
        productName(s).toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Products</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Product catalogue (SKU registry)
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or SKU ID..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto h-6 text-xs">
            {filtered.length} {filtered.length === 1 ? "product" : "products"}
          </Badge>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">SKU ID</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Pack</TableHead>
                <TableHead className="w-[120px]">Origin</TableHead>
                <TableHead className="w-[160px]">EAN</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-destructive">
                    {(error as Error).message}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow
                    key={s.np_sku_id}
                    className="cursor-pointer"
                    onClick={() => setSelected(s)}
                  >
                    <TableCell className="font-mono text-xs">{s.np_sku_id}</TableCell>
                    <TableCell className="font-medium">{productName(s)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.pack_description ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.origin_country ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.gtin_ean ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProductDetailSheet sku={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail sheet
// ---------------------------------------------------------------------------

function ProductDetailSheet(props: { sku: Sku | null; onClose: () => void }) {
  const { sku, onClose } = props;
  const aliases = useAliases(sku?.np_sku_id ?? null);

  return (
    <Sheet open={!!sku} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {sku && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base">{productName(sku)}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {sku.np_sku_id}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <div className="flex items-center gap-2">
                <StatusBadge status={sku.status} />
                {sku.brand && (
                  <Badge variant="outline" className="text-xs">
                    {sku.brand}
                  </Badge>
                )}
              </div>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SKU details
                </h3>
                <DetailRow icon={Hash} label="SKU ID" value={sku.np_sku_id} mono />
                <DetailRow icon={PackageIcon} label="Pack" value={sku.pack_description} />
                <DetailRow icon={Globe} label="Origin" value={sku.origin_country} />
                <DetailRow icon={Barcode} label="EAN / GTIN" value={sku.gtin_ean} mono />
                <DetailRow icon={Hash} label="INN" value={sku.inn} />
                <DetailRow icon={Hash} label="Brand" value={sku.brand} />
              </section>

              <section className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Regulatory
                </h3>
                <DetailRow icon={FileBadge} label="HR approval no" value={sku.hr_approval_no} mono />
                <DetailRow icon={FileBadge} label="EU approval no" value={sku.eu_approval_no} mono />
              </section>

              <section className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Known aliases
                </h3>
                {aliases.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : aliases.error ? (
                  <p className="text-xs text-destructive">
                    {(aliases.error as Error).message}
                  </p>
                ) : (aliases.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No aliases recorded</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-[11px]">External name</TableHead>
                          <TableHead className="h-8 text-[11px]">Code</TableHead>
                          <TableHead className="h-8 w-[90px] text-[11px]">Partner</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aliases.data!.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{a.external_name ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {a.external_code ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {a.partner_id ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  const { icon: Icon, label, value, mono } = props;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={mono ? "text-sm font-mono" : "text-sm"}>{value ?? "—"}</p>
      </div>
    </div>
  );
}
