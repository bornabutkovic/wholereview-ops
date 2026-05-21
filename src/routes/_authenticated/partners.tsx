import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Eye, Mail, FileText, MapPin, Hash } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/partners")({
  component: PartnersPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartnerRow {
  partner_id: string;
  name: string;
  country: string | null;
  contact_email: string | null;
  is_buyer: boolean;
  is_supplier: boolean;
  is_mah: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RequestRow {
  id: string;
  doc_type: string | null;
  status: string | null;
  received_at: string | null;
}

type Role = "buyer" | "supplier";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function usePartners(role: Role) {
  return useQuery({
    queryKey: ["partners-list", role],
    queryFn: async (): Promise<PartnerRow[]> => {
      const col = role === "buyer" ? "is_buyer" : "is_supplier";
      const { data, error } = await supabase
        .from("partner")
        .select(
          "partner_id, name, country, contact_email, is_buyer, is_supplier, is_mah, notes, created_at, updated_at",
        )
        .eq(col, true)
        .order("name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function usePartnerRequests(partnerId: string | null) {
  return useQuery({
    queryKey: ["partner-requests", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await supabase
        .from("incoming_requests")
        .select("id, doc_type, status, received_at")
        .eq("partner_id", partnerId!)
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PartnersPage() {
  const [selected, setSelected] = useState<PartnerRow | null>(null);

  const buyers = usePartners("buyer");
  const suppliers = usePartners("supplier");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Partners</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Buyers and suppliers directory
        </p>
      </header>

      <Tabs defaultValue="buyers" className="flex flex-1 flex-col">
        <div className="border-b px-6 pt-3">
          <TabsList>
            <TabsTrigger value="buyers" className="text-xs">
              Buyers
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {buyers.data?.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="text-xs">
              Suppliers
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {suppliers.data?.length ?? 0}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="buyers" className="flex-1 overflow-auto p-6 pt-4">
          <PartnerTable
            partners={buyers.data}
            isLoading={buyers.isLoading}
            error={buyers.error as Error | null}
            onView={setSelected}
          />
        </TabsContent>

        <TabsContent value="suppliers" className="flex-1 overflow-auto p-6 pt-4">
          <PartnerTable
            partners={suppliers.data}
            isLoading={suppliers.isLoading}
            error={suppliers.error as Error | null}
            onView={setSelected}
          />
        </TabsContent>
      </Tabs>

      <PartnerDetailSheet
        partner={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partner table
// ---------------------------------------------------------------------------

interface PartnerTableProps {
  partners: PartnerRow[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onView: (p: PartnerRow) => void;
}

function PartnerTable(props: PartnerTableProps) {
  const { partners, isLoading, error, onView } = props;
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!partners) return [];
    const q = search.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) =>
      (p.name ?? "").toLowerCase().includes(q),
    );
  }, [partners, search]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="pl-8 h-9 text-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[140px]">Country</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[100px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No partners found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.partner_id}>
                  <TableCell className="font-mono text-xs">{p.partner_id}</TableCell>
                  <TableCell className="font-medium">{p.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.country ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.contact_email ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => onView(p)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail side panel
// ---------------------------------------------------------------------------

function PartnerDetailSheet(props: {
  partner: PartnerRow | null;
  onClose: () => void;
}) {
  const { partner, onClose } = props;
  const requests = usePartnerRequests(partner?.partner_id ?? null);

  return (
    <Sheet open={!!partner} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {partner && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base">{partner.name ?? "—"}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {partner.partner_id}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Details
                </h3>
                <DetailRow icon={Hash} label="Code" value={partner.partner_id} />
                <DetailRow icon={MapPin} label="Country" value={partner.country} />
                <DetailRow icon={Mail} label="Email" value={partner.contact_email} />
                <DetailRow icon={FileText} label="Notes" value={partner.notes} />
                <div className="flex gap-1.5 pt-1">
                  {partner.is_buyer && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      Buyer
                    </Badge>
                  )}
                  {partner.is_supplier && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      Supplier
                    </Badge>
                  )}
                  {partner.is_mah && (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      MAH
                    </Badge>
                  )}
                </div>
              </section>

              <section className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Requests
                </h3>
                {requests.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : requests.error ? (
                  <p className="text-xs text-destructive">
                    {(requests.error as Error).message}
                  </p>
                ) : (requests.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent requests</p>
                ) : (
                  <ul className="space-y-1.5">
                    {requests.data!.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {r.doc_type ?? "—"}
                          </Badge>
                          <span className="text-muted-foreground">{r.status ?? "—"}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {r.received_at
                            ? format(new Date(r.received_at), "dd MMM yyyy")
                            : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
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
}) {
  const { icon: Icon, label, value } = props;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-sm">{value ?? "—"}</p>
      </div>
    </div>
  );
}
