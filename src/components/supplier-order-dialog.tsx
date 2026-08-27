import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OrderLine {
  np_sku_id: string | null;
  product_name: string | null;
  qty: number | null;
}

interface DraftLine {
  key: string;
  product_name: string;
  qty: string;
}

/** Parse "MM/YY" out of a date-like cycle_ref such as "2026-08" or "2026-08-01". */
export function cycleRefToMonthYear(cycleRef: string | null): string {
  if (!cycleRef) return "";
  const match = cycleRef.match(/(\d{4})\D?(\d{2})/);
  if (match) return `${match[2]}/${match[1].slice(2)}`;
  const alt = cycleRef.match(/(\d{2})\D?(\d{2,4})/);
  if (alt) return `${alt[1]}/${alt[2].slice(-2)}`;
  const d = new Date(cycleRef);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  }
  return cycleRef;
}

export function SupplierOrderDialog({ cycleRef }: { cycleRef: string }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<DraftLine[] | null>(null);

  const monthYear = useMemo(() => cycleRefToMonthYear(cycleRef), [cycleRef]);
  const title = `NOVO PHARMA NARUDŽBA ${monthYear}`;

  const query = useQuery({
    queryKey: ["oktal-order-lines", cycleRef],
    enabled: open && !!cycleRef,
    queryFn: async (): Promise<OrderLine[]> => {
      const { data, error } = await (supabase as any).rpc("get_oktal_order_lines", {
        p_cycle_ref: cycleRef,
      });
      if (error) throw error;
      return (data ?? []) as OrderLine[];
    },
  });

  useEffect(() => {
    if (!query.data) return;
    setLines(
      query.data.map((r, i) => ({
        key: `${r.np_sku_id ?? "row"}-${i}`,
        product_name: r.product_name ?? r.np_sku_id ?? "",
        qty: r.qty != null ? String(r.qty) : "",
      })),
    );
  }, [query.data]);

  useEffect(() => {
    if (!open) setLines(null);
  }, [open]);

  const draft = lines ?? [];

  const handleExport = () => {
    const rows: (string | number)[][] = [[title]];
    for (const line of draft) {
      const qty = Number(line.qty.replace(",", "."));
      rows.push([line.product_name, Number.isFinite(qty) ? qty : line.qty]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Narudzba");
    XLSX.writeFile(book, `Novo_Pharma_narudzba_${monthYear.replace("/", "_")}.xlsx`);
    toast.success("Downloaded");
  };

  const handleCopy = async () => {
    const text = draft.map((l) => `${l.product_name}\t${l.qty}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
          Generate Supplier Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="py-6 text-center text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Failed to load order lines"}
          </div>
        ) : draft.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No PO demand found for this cycle
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Product Name</TableHead>
                  <TableHead className="w-[140px] text-xs">Qty</TableHead>
                  <TableHead className="w-[70px] text-xs text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.map((line) => (
                  <TableRow key={line.key}>
                    <TableCell className="text-sm">{line.product_name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={line.qty}
                        className="h-8 text-xs"
                        onChange={(e) =>
                          setLines((prev) =>
                            (prev ?? []).map((l) =>
                              l.key === line.key ? { ...l, qty: e.target.value } : l,
                            ),
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setLines((prev) => (prev ?? []).filter((l) => l.key !== line.key))
                        }
                        title="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={draft.length === 0}
            onClick={handleCopy}
          >
            Copy as text
          </Button>
          <Button size="sm" disabled={draft.length === 0} onClick={handleExport}>
            {query.isFetching ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-2 h-3.5 w-3.5" />
            )}
            Export as XLSX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
