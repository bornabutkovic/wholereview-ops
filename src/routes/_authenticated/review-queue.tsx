import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Search, AlertCircle, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { listReviewItems, resolveReviewItem } from "@/lib/review-queue";
import type { ProductMatchPayload, ReviewCategory, ReviewItem, ReviewStatus } from "@/lib/supabase";
import { useConfirmProductMapping, useNpSkuDetails } from "@/lib/product-mapping";
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
          userEmail={user?.email ?? null}
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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

function ResolveDialog({
  item,
  onClose,
  onResolved,
  userEmail,
}: {
  item: ReviewItem | null;
  onClose: () => void;
  onResolved: () => void;
  userEmail: string | null;
}) {
  const [note, setNote] = useState("");
  const readOnly = item?.status !== "OPEN";

  const mutation = useMutation({
    mutationFn: (status: "RESOLVED" | "DISMISSED") =>
      resolveReviewItem({ id: item!.id, status, note: note.trim(), userEmail }),
    onSuccess: (_d, status) => {
      toast.success(status === "RESOLVED" ? "Marked as resolved" : "Dismissed");
      setNote("");
      onResolved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) {
          setNote("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {readOnly ? "Review item" : "Resolve review item"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {item?.category.replace(/_/g, " ").toLowerCase()}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-foreground">
              {item.description ?? <span className="text-muted-foreground">No description</span>}
            </div>

            {readOnly ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Resolution note</Label>
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  {item.resolution_note ?? (
                    <span className="text-muted-foreground">No note</span>
                  )}
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
        )}

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
      </DialogContent>
    </Dialog>
  );
}
