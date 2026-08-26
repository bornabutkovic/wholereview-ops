import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Clock, RefreshCw, HelpCircle, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { assignPartner, usePartners } from "@/lib/product-mapping";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [
      { title: "Inbox — incoming email triage | Novo Pharma" },
      {
        name: "description",
        content:
          "Triage view of incoming emails that need manual intervention: processing errors, unknown senders and stuck processing.",
      },
      { property: "og:title", content: "Inbox — incoming email triage" },
      {
        property: "og:description",
        content:
          "Processing errors, unknown senders and stuck processing in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// ---------------------------------------------------------------------------
// Types & triage logic
// ---------------------------------------------------------------------------

const STUCK_MINUTES = 30;

type InboxReason = "FAILED" | "PARTNER_UNKNOWN" | "STUCK";

interface InboxRow {
  id: string;
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  status: string | null;
  parse_status: string | null;
  partner_id: string | null;
  error_message: string | null;
  parse_status_updated_at: string | null;
  reasons: InboxReason[];
}

function isStuck(parseStatus: string | null, updatedAt: string | null): boolean {
  if ((parseStatus ?? "").toUpperCase() !== "PARSING") return false;
  if (!updatedAt) return true;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > STUCK_MINUTES * 60 * 1000;
}

function useInbox() {
  return useQuery({
    queryKey: ["inbox"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await supabase
        .from("email_log")
        .select("*")
        .or("status.eq.FAILED,partner_id.is.null,parse_status.eq.PARSING")
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

      return rows
        .map((r) => {
          const status = (r["status"] as string | null) ?? null;
          const parseStatus = (r["parse_status"] as string | null) ?? null;
          const partnerId = (r["partner_id"] as string | null) ?? null;
          const parseUpdatedAt =
            (r["parse_status_updated_at"] as string | null) ??
            (r["parsed_at"] as string | null) ??
            null;

          const reasons: InboxReason[] = [];
          if ((status ?? "").toUpperCase() === "FAILED") reasons.push("FAILED");
          if (!partnerId) reasons.push("PARTNER_UNKNOWN");
          if (isStuck(parseStatus, parseUpdatedAt)) reasons.push("STUCK");

          return {
            id: r["id"] as string,
            from_address: (r["from_address"] as string | null) ?? null,
            subject: (r["subject"] as string | null) ?? null,
            received_at: (r["received_at"] as string | null) ?? null,
            status,
            parse_status: parseStatus,
            partner_id: partnerId,
            error_message:
              (r["error_message"] as string | null) ??
              (r["notes"] as string | null) ??
              null,
            parse_status_updated_at: parseUpdatedAt,
            reasons,
          } satisfies InboxRow;
        })
        .filter(
          (r) =>
            r.reasons.length > 0 &&
            (r.status ?? "").toUpperCase() !== "DISCARDED",
        );
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useRetryParse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_log")
        .update({ status: "NEW", parse_status: "PENDING" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrada je ponovno pokrenuta");
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function useDiscardEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_log")
        .update({ status: "DISCARDED", parse_status: "SKIPPED" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Email dismissed");
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function InboxPage() {
  const { data, isLoading, error } = useInbox();
  const retry = useRetryParse();
  const discard = useDiscardEmail();
  const [partnerTarget, setPartnerTarget] = useState<InboxRow | null>(null);

  const counts = useMemo(() => {
    const c = { FAILED: 0, PARTNER_UNKNOWN: 0, STUCK: 0 };
    for (const r of data ?? []) for (const reason of r.reasons) c[reason] += 1;
    return c;
  }, [data]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Emails that need manual intervention — errors, unknown senders and
          stuck processing
        </p>
      </header>

      <div className="flex-1 space-y-4 p-6">

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Razlog</TableHead>
                <TableHead className="w-[220px]">Sender</TableHead>
                <TableHead>Predmet</TableHead>
                <TableHead className="w-[250px]">Error</TableHead>
                <TableHead className="w-[150px]">Primljeno</TableHead>
                <TableHead className="w-[230px] text-right">Akcija</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-destructive"
                  >
                    {(error as Error).message}
                  </TableCell>
                </TableRow>
              ) : (data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Inbox is clear — nothing to triage
                  </TableCell>
                </TableRow>
              ) : (
                data!.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.reasons.map((r) => (
                          <ReasonBadge key={r} reason={r} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="truncate text-xs">
                      {row.from_address ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm font-medium">
                      {row.subject ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      {row.error_message ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="line-clamp-2 cursor-help text-xs text-destructive">
                                {row.error_message}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              {row.error_message}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.received_at
                        ? format(new Date(row.received_at), "dd MMM yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {row.reasons.includes("PARTNER_UNKNOWN") && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => setPartnerTarget(row)}
                          >
                            Link partner
                          </Button>
                        )}
                        {(row.reasons.includes("FAILED") ||
                          row.reasons.includes("STUCK")) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(row.id)}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Retry processing
                          </Button>
                        )}
                        {row.reasons.includes("FAILED") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            disabled={discard.isPending}
                            onClick={() => discard.mutate(row.id)}
                          >
                            <X className="mr-1 h-3 w-3" />
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PartnerUnknownDialog
        row={partnerTarget}
        onClose={() => setPartnerTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reason badge
// ---------------------------------------------------------------------------

const REASON_META: Record<
  InboxReason,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  FAILED: {
    label: "Error",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: AlertCircle,
  },
  PARTNER_UNKNOWN: {
    label: "Unknown sender",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: HelpCircle,
  },
  STUCK: {
    label: "Stuck",
    className: "border-slate-200 bg-slate-100 text-slate-700",
    icon: Clock,
  },
};

function ReasonBadge({
  reason,
  count,
}: {
  reason: InboxReason;
  count?: number;
}) {
  const meta = REASON_META[reason];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[11px] ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
      {typeof count === "number" ? ` · ${count}` : null}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// PARTNER_UNKNOWN dialog
// ---------------------------------------------------------------------------

function PartnerUnknownDialog({
  row,
  onClose,
}: {
  row: InboxRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: partners, isLoading } = usePartners();
  const [partnerId, setPartnerId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const open = !!row;
  const currentEmail = email || row?.from_address || "";

  const link = useMutation({
    mutationFn: async () => {
      if (!row || !partnerId) return;
      const partner = (partners ?? []).find((p) => p.partner_id === partnerId);

      // Resolve an existing OPEN PARTNER_UNKNOWN review item for this email, if any.
      const { data: reviewRows } = await supabase
        .from("review_queue")
        .select("id")
        .eq("category", "PARTNER_UNKNOWN")
        .eq("status", "OPEN")
        .eq("email_id", row.id)
        .limit(1);

      return assignPartner({
        partnerId,
        partnerName: partner?.name ?? partnerId,
        fromAddress: currentEmail.trim() || null,
        emailLogId: row.id,
        reviewItemId: (reviewRows?.[0]?.id as string | undefined) ?? null,
        userId: user?.id ?? null,
      });
    },
    onSuccess: (res) => {
      toast.success(
        res
          ? `Partner povezan · ${res.matched} matchano, ${res.sentToReview} u review`
          : "Partner povezan",
      );
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      setPartnerId("");
      setEmail("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPartnerId("");
          setEmail("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unknown sender</DialogTitle>
          <DialogDescription className="truncate">
            {row?.subject ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Sender email</Label>
            <Input
              value={currentEmail}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={isLoading ? "Loading…" : "Select partner"}
                />
              </SelectTrigger>
              <SelectContent>
                {(partners ?? []).map((p) => (
                  <SelectItem key={p.partner_id} value={p.partner_id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!partnerId || link.isPending}
            onClick={() => link.mutate()}
          >
            Link partner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
