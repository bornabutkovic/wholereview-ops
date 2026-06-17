import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Search, AlertCircle, Inbox, CheckCircle2, XCircle, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

import { listReviewItems, resolveReviewItem } from "@/lib/review-queue";
import type { NpSkuDetails, Partner, PartnerUnknownPayload, ProductMatchPayload, ReviewCategory, ReviewItem, ReviewStatus } from "@/lib/supabase";
import {
  useAssignPartner,
  useConfirmMapping,
  useNpSkuList,
  usePartners,
  useRejectMapping,
  useReopenReviewItem,
} from "@/lib/product-mapping";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/review-queue")({
  component: ReviewQueuePage,
});

const CATEGORIES: { value: ReviewCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All categories" },
  { value: "PRODUCT_MATCH", label: "Product match" },
  { value: "QTY_AMBIGUOUS", label: "Qty ambiguous" },
  { value: "PARTNER_UNKNOWN", label: "Partner unknown" },
  { value: "DOC_TYPE", label: "Doc type" },
  { value: "PRICE", label: "Price" },
  { value: "OTHER", label: "Other" },
];

const STATUSES: { value: ReviewStatus | "ALL"; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "ALL", label: "All statuses" },
];

const CATEGORY_STYLES: Record<ReviewCategory, string> = {
  PRODUCT_MATCH: "bg-blue-100 text-blue-700 border-blue-200",
  QTY_AMBIGUOUS: "bg-amber-100 text-amber-800 border-amber-200",
  PARTNER_UNKNOWN: "bg-purple-100 text-purple-700 border-purple-200",
  DOC_TYPE: "bg-cyan-100 text-cyan-700 border-cyan-200",
  PRICE: "bg-rose-100 text-rose-700 border-rose-200",
  OTHER: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_STYLES: Record<ReviewStatus, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DISMISSED: "bg-slate-100 text-slate-600 border-slate-200",
};

function ReviewQueuePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReviewStatus | "ALL">("OPEN");
  const [category, setCategory] = useState<ReviewCategory | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ReviewItem | null>(null);

  const query = useQuery({
    queryKey: ["review-queue", status, category],
    queryFn: () => listReviewItems({ status, category }),
  });

  const filtered = useMemo(() => {
    const items = query.data ?? [];
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((i) => (i.description ?? "").toLowerCase().includes(s));
  }, [query.data, search]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        <header className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Review Queue</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {query.isLoading
                  ? "Loading…"
                  : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
          <Select value={status} onValueChange={(v) => setStatus(v as ReviewStatus | "ALL")}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={(v) => setCategory(v as ReviewCategory | "ALL")}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search description…"
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
                  <TableHead className="w-[170px] text-xs">Category</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="w-[120px] text-xs">Status</TableHead>
                  <TableHead className="w-[140px] text-xs">Created</TableHead>
                  <TableHead className="w-[100px] text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id} className="text-sm">
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-medium ${CATEGORY_STYLES[item.category]}`}
                      >
                        {item.category.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="truncate text-[13px] text-foreground">
                            {item.description ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TooltipTrigger>
                        {item.description && (
                          <TooltipContent className="max-w-md">
                            <p className="text-xs">{item.description}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-medium ${STATUS_STYLES[item.status]}`}
                      >
                        {item.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === "OPEN" ? (
                        <Button size="sm" variant="outline" onClick={() => setActive(item)}>
                          Resolve
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setActive(item)}>
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <ResolveDialog
          item={active}
          onClose={() => setActive(null)}
          onResolved={() => {
            qc.invalidateQueries({ queryKey: ["review-queue"] });
            setActive(null);
          }}
          userId={user?.id ?? null}
        />

      </div>
    </TooltipProvider>
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
        <p className="text-sm font-medium">No items</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing matches the current filters.
        </p>
      </div>
    </div>
  );
}

function ErrorState(props: { message: string; onRetry: () => void }) {
  const { message, onRetry } = props;

  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium">Failed to load review queue</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

type ResolveDialogProps = {
  item: ReviewItem | null;
  onClose: () => void;
  onResolved: () => void;
  userId: string | null;
};

function ResolveDialog(props: ResolveDialogProps) {
  const { item, onClose, onResolved, userId } = props;
  const readOnly = item?.status !== "OPEN";
  const isProductMatch = item?.category === "PRODUCT_MATCH" && !readOnly;
  const isPartnerUnknown = item?.category === "PARTNER_UNKNOWN" && !readOnly;

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={isProductMatch ? "sm:max-w-[760px]" : "sm:max-w-[520px]"}
      >
        <DialogHeader>
          <DialogTitle className="text-base">
            {readOnly ? "Review item" : "Resolve review item"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {item?.category.replace(/_/g, " ").toLowerCase()}
          </DialogDescription>
        </DialogHeader>

        {item && isProductMatch ? (
          <ProductMatchBody
            item={item}
            userId={userId}
            onResolved={onResolved}
          />
        ) : item && isPartnerUnknown ? (
          <PartnerUnknownBody
            item={item}
            userId={userId}
            onResolved={onResolved}
          />
        ) : item ? (
          <GenericBody
            item={item}
            readOnly={readOnly}
            userId={userId}
            onResolved={onResolved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Generic fallback body
// ---------------------------------------------------------------------------

type GenericBodyProps = {
  item: ReviewItem;
  readOnly: boolean;
  userId: string | null;
  onResolved: () => void;
};

function GenericBody(props: GenericBodyProps) {
  const { item, readOnly, userId, onResolved } = props;
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: (status: "RESOLVED" | "DISMISSED") =>
      resolveReviewItem({ id: item.id, status, note: note.trim(), userId }),
    onSuccess: (_d, status) => {
      toast.success(status === "RESOLVED" ? "Marked as resolved" : "Dismissed");
      setNote("");
      onResolved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-foreground">
          {item.description ?? <span className="text-muted-foreground">No description</span>}
        </div>

        {readOnly ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Resolution note</Label>
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              {item.resolution_note ?? <span className="text-muted-foreground">No note</span>}
            </div>
            {item.resolved_by && (
              <p className="text-[11px] text-muted-foreground">
                by {item.resolved_by}
                {item.resolved_at &&
                  ` · ${formatDistanceToNow(new Date(item.resolved_at), { addSuffix: true })}`}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="note" className="text-xs">
              Resolution note <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="note"
              rows={4}
              placeholder="Describe how this was resolved…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </div>

      {!readOnly && (
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={!note.trim() || mutation.isPending}
            onClick={() => mutation.mutate("DISMISSED")}
          >
            {mutation.isPending && mutation.variables === "DISMISSED" && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Dismiss
          </Button>
          <Button
            disabled={!note.trim() || mutation.isPending}
            onClick={() => mutation.mutate("RESOLVED")}
          >
            {mutation.isPending && mutation.variables === "RESOLVED" && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Mark Resolved
          </Button>
        </DialogFooter>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PARTNER_UNKNOWN
// ---------------------------------------------------------------------------

type PartnerUnknownBodyProps = {
  item: ReviewItem;
  userId: string | null;
  onResolved: () => void;
};

function PartnerUnknownBody(props: PartnerUnknownBodyProps) {
  const { item, userId, onResolved } = props;
  const partners = usePartners({ buyersOnly: true });
  const assign = useAssignPartner();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [emailToAssign, setEmailToAssign] = useState<string>("");


  const payload: PartnerUnknownPayload =
    item.payload && typeof item.payload === "object"
      ? (item.payload as PartnerUnknownPayload)
      : {};

  const unknownEmail =
    payload.from_address?.trim() || extractEmail(item.description ?? "") || "";
  const emailLogId = payload.email_log_id ?? null;

  // Pre-fill editable email input with from_address when item changes
  useEffect(() => setEmailToAssign(unknownEmail), [item.id, unknownEmail]);



  const dismiss = useMutation({
    mutationFn: () =>
      resolveReviewItem({
        id: item.id,
        status: "DISMISSED",
        note: "Dismissed (no partner assigned)",
        userId,
      }),
    onSuccess: () => {
      toast.success("Dismissed");
      onResolved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedPartner = partners.data?.find((p) => p.partner_id === partnerId) ?? null;

  const handleLink = async () => {
    if (!selectedPartner) {
      toast.error("Select a partner first");
      return;
    }
    try {
      const result = await assign.mutateAsync({
        partnerId: selectedPartner.partner_id,
        partnerName: selectedPartner.name || selectedPartner.partner_id,
        fromAddress: emailToAssign.trim() || null,
        emailLogId,
        reviewItemId: item.id,
        userId,
      });
      toast.success(
        `Partner linked. ${result.matched} products auto-matched, ${result.sentToReview} sent to review queue.`,
      );
      onResolved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unknown sender
          </p>
          <p className="mt-1 text-sm font-mono text-foreground">
            {unknownEmail || item.description || "—"}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Link to partner</Label>
          <PartnerCombobox
            partners={partners.data ?? []}
            loading={partners.isLoading}
            value={partnerId}
            onChange={setPartnerId}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email-to-assign" className="text-xs">
            Email za dodijeliti partneru
          </Label>
          <Input
            id="email-to-assign"
            type="email"
            value={emailToAssign}
            onChange={(e) => setEmailToAssign(e.target.value)}
            placeholder="partner@example.com"
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            This will be saved as the partner's primary contact email.
          </p>


        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          variant="outline"
          disabled={dismiss.isPending || assign.isPending}
          onClick={() => dismiss.mutate()}
        >
          {dismiss.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Dismiss
        </Button>
        <Button disabled={!partnerId || !emailToAssign.trim() || assign.isPending} onClick={handleLink}>
          {assign.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Link to Partner
        </Button>
      </DialogFooter>
    </>
  );
}

type PartnerComboboxProps = {
  partners: Partner[];
  loading: boolean;
  value: string | null;
  onChange: (id: string) => void;
};

function PartnerCombobox(props: PartnerComboboxProps) {
  const { partners, loading, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const selected = partners.find((p) => p.partner_id === value) ?? null;
  const labelFor = (p: Partner) => {
    const primary = p.name || p.partner_id;
    return p.contact_email ? `${primary} — ${p.contact_email}` : primary;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {loading
              ? "Loading partners…"
              : selected
                ? labelFor(selected)
                : "Select partner…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search partner…" />
          <CommandList>
            <CommandEmpty>No partner found.</CommandEmpty>
            <CommandGroup>
              {partners.map((p) => {
                const label = labelFor(p);
                const searchText = `${p.name ?? ""} ${p.partner_id} ${p.contact_email ?? ""}`;
                return (
                  <CommandItem
                    key={p.partner_id}
                    value={searchText}
                    onSelect={() => {
                      onChange(p.partner_id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === p.partner_id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// PRODUCT_MATCH
// ---------------------------------------------------------------------------

type ProductMatchBodyProps = {
  item: ReviewItem;
  userId: string | null;
  onResolved: () => void;
};

function ProductMatchBody(props: ProductMatchBodyProps) {
  const { item, userId, onResolved } = props;
  const payload: ProductMatchPayload =
    item.payload && typeof item.payload === "object"
      ? (item.payload as ProductMatchPayload)
      : {};

  const rawInput =
    payload.raw_input ?? payload.raw_product_ref ?? item.description ?? "";
  const partnerId = payload.partner_id ?? null;
  const matchSource = payload.match_source ?? null;
  const confidence =
    typeof payload.mapping_confidence === "number" ? payload.mapping_confidence : null;
  const itemId = payload.item_id ?? null;
  const suggestedSkuId = item.suggested_value;

  const skus = useNpSkuList();
  const confirm = useConfirmMapping();
  const reject = useRejectMapping();

  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(suggestedSkuId);

  const suggestedSku = useMemo(
    () => skus.data?.find((s) => s.np_sku_id === suggestedSkuId) ?? null,
    [skus.data, suggestedSkuId],
  );

  const handleConfirm = async () => {
    if (!selectedSkuId) {
      toast.error("Select an SKU first");
      return;
    }
    if (!rawInput) {
      toast.error("Missing raw_input in payload");
      return;
    }
    try {
      await confirm.mutateAsync({
        rawInput,
        partnerId,
        npSkuId: selectedSkuId,
        itemId,
        reviewItemId: item.id,
        userId,
      });
      toast.success("Mapping confirmed");
      onResolved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReject = async () => {
    if (!rawInput) {
      toast.error("Missing raw_input in payload");
      return;
    }
    try {
      await reject.mutateAsync({
        rawInput,
        partnerId,
        reviewItemId: item.id,
        userId,
      });
      toast.success("Mapping rejected");
      onResolved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confPct =
    confidence !== null
      ? `${Math.round(confidence > 1 ? confidence : confidence * 100)}%`
      : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Left: buyer */}
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Buyer napisao
          </p>
          <p className="text-sm font-medium text-foreground">
            {rawInput || <span className="text-muted-foreground">—</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {matchSource && (
              <Badge variant="outline" className="text-[11px]">
                {matchSource}
              </Badge>
            )}
            {confPct && (
              <Badge variant="outline" className="text-[11px]">
                {confPct}
              </Badge>
            )}
          </div>
          {payload.match_reason && (
            <p className="mt-2 text-[11px] text-muted-foreground">{payload.match_reason}</p>
          )}
        </div>

        {/* Right: suggestion */}
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sistem predlaže
          </p>
          {!suggestedSkuId ? (
            <p className="text-sm text-muted-foreground">Nema prijedloga</p>
          ) : skus.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : suggestedSku ? (
            <>
              <p className="text-sm font-medium text-foreground">
                {suggestedSku.brand ?? <span className="text-muted-foreground">No brand</span>}
              </p>
              <p className="text-xs text-muted-foreground">{suggestedSku.inn ?? "—"}</p>
              <p className="mt-1 text-xs text-foreground">
                {suggestedSku.pack_description ?? "—"}
              </p>
              {(suggestedSku.eu_approval_no || suggestedSku.hr_approval_no) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {suggestedSku.eu_approval_no && <>EU: {suggestedSku.eu_approval_no}</>}
                  {suggestedSku.eu_approval_no && suggestedSku.hr_approval_no && " · "}
                  {suggestedSku.hr_approval_no && <>HR: {suggestedSku.hr_approval_no}</>}
                </p>
              )}
              <p className="mt-2 text-[11px] font-mono text-muted-foreground">
                {suggestedSkuId}
              </p>

            </>
          ) : (
            <p className="text-sm text-muted-foreground">SKU {suggestedSkuId} not found</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Ispravi SKU</Label>
        <SkuCombobox
          skus={skus.data ?? []}
          loading={skus.isLoading}
          value={selectedSkuId}
          onChange={setSelectedSkuId}
        />
        {(() => {
          const sel = skus.data?.find((s) => s.np_sku_id === selectedSkuId);
          if (!sel || (!sel.eu_approval_no && !sel.hr_approval_no)) return null;
          return (
            <p className="text-[11px] text-muted-foreground">
              {sel.eu_approval_no && <>EU: {sel.eu_approval_no}</>}
              {sel.eu_approval_no && sel.hr_approval_no && " · "}
              {sel.hr_approval_no && <>HR: {sel.hr_approval_no}</>}
            </p>
          );
        })()}
      </div>


      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={confirm.isPending || reject.isPending}
          onClick={handleReject}
        >
          {reject.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="mr-2 h-3.5 w-3.5" />
          )}
          Odbaci
        </Button>
        <Button
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={!selectedSkuId || confirm.isPending || reject.isPending}
          onClick={handleConfirm}
        >
          {confirm.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
          )}
          Potvrdi mapping
        </Button>
      </DialogFooter>
    </>
  );
}

type SkuComboboxProps = {
  skus: NpSkuDetails[];
  loading: boolean;
  value: string | null;
  onChange: (id: string) => void;
};

function SkuCombobox(props: SkuComboboxProps) {
  const { skus, loading, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const selected = skus.find((s) => s.np_sku_id === value) ?? null;
  const label = (s: NpSkuDetails) =>
    s.brand ? `${s.np_sku_id} — ${s.brand}` : s.np_sku_id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {loading ? "Loading SKUs…" : selected ? label(selected) : "Select SKU…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search SKU, brand, INN…" />
          <CommandList>
            <CommandEmpty>No SKU found.</CommandEmpty>
            <CommandGroup>
              {skus.map((s) => {
                const text = `${s.np_sku_id} ${s.brand ?? ""} ${s.inn ?? ""} ${s.pack_description ?? ""} ${s.eu_approval_no ?? ""} ${s.hr_approval_no ?? ""}`;
                return (
                  <CommandItem
                    key={s.np_sku_id}
                    value={text}
                    onSelect={() => {
                      onChange(s.np_sku_id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === s.np_sku_id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{label(s)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.np_sku_id}
                        {s.inn ? ` · ${s.inn}` : ""}
                        {s.eu_approval_no ? ` · EU: ${s.eu_approval_no}` : ""}
                        {s.hr_approval_no ? ` · HR: ${s.hr_approval_no}` : ""}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>

    </Popover>
  );
}


