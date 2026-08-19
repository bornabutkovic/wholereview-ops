import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PartnerEditable {
  partner_id: string;
  name: string;
  country: string | null;
  contact_email: string | null;
  is_buyer: boolean;
  is_supplier: boolean;
  code?: string | null;
}

const FK_TABLES = [
  { table: "email_log", label: "email_log" },
  { table: "incoming_requests", label: "incoming_requests" },
  { table: "partner_contacts", label: "partner_contacts" },
  { table: "product_code_alias", label: "product_code_alias" },
] as const;

// Untyped table accessor — some tables are missing from generated types.
const anyTable = (name: string) =>
  (supabase as unknown as { from: (t: string) => any }).from(name);

async function countRefs(partnerId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of FK_TABLES) {
    const { count, error } = await anyTable(t.table)
      .select("*", { count: "exact", head: true })
      .eq("partner_id", partnerId);
    if (error) {
      // Missing table / no access — treat as zero rather than blocking the UI.
      out[t.label] = 0;
      continue;
    }
    out[t.label] = count ?? 0;
  }
  return out;
}

/**
 * Next free partner id, computed from the real MAX of the numeric suffix.
 * String ordering is wrong here ("PT70" sorts above "PT0029"), so we scan the
 * ids and take the numeric maximum.
 */
async function nextPartnerId(): Promise<string> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("partner")
      .select("partner_id")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    ids.push(...rows.map((r) => String(r.partner_id)));
    if (rows.length < pageSize) break;
  }
  const max = ids.reduce((acc, id) => {
    const m = /^PT(\d+)$/i.exec(id.trim());
    if (!m) return acc;
    const n = parseInt(m[1], 10);
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `PT${String(max + 1).padStart(4, "0")}`;
}

function isMissingColumn(message: string, column: string) {
  return (
    /PGRST204/i.test(message) ||
    new RegExp(`column .*${column}|'${column}' column|${column}.* does not exist`, "i").test(
      message,
    )
  );
}


// ---------------------------------------------------------------------------
// Edit / create dialog
// ---------------------------------------------------------------------------

export function PartnerEditDialog(props: {
  open: boolean;
  partner: PartnerEditable | null; // null => create mode
  onClose: () => void;
}) {
  const { open, partner, onClose } = props;
  const qc = useQueryClient();
  const isCreate = !partner;

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isBuyer, setIsBuyer] = useState(true);
  const [isSupplier, setIsSupplier] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(partner?.name ?? "");
    setCountry(partner?.country ?? "");
    setEmail(partner?.contact_email ?? "");
    setCode(partner?.code ?? "");
    setIsBuyer(partner ? partner.is_buyer : true);
    setIsSupplier(partner ? partner.is_supplier : false);
  }, [open, partner]);

  const roleFlags = { is_buyer: isBuyer, is_supplier: isSupplier };

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Naziv je obavezan");

      const base: Record<string, unknown> = {
        name: trimmedName,
        country: country.trim() || null,
        contact_email: email.trim() || null,
        ...roleFlags,
      };

      const trimmedCode = code.trim() || null;

      if (isCreate) {
        let newId = await nextPartnerId();
        let codeDropped = false;

        for (let attempt = 0; attempt < 10; attempt += 1) {
          const payload: Record<string, unknown> = {
            ...base,
            partner_id: newId,
            ...(codeDropped ? {} : { code: trimmedCode }),
          };
          const { data, error } = await anyTable("partner")
            .insert(payload)
            .select("partner_id")
            .single();

          if (!error) return String(data?.partner_id ?? newId);

          const msg = String(error.message ?? "");
          // `code` column not in the schema — retry without it, but tell the user.
          if (!codeDropped && trimmedCode !== null && isMissingColumn(msg, "code")) {
            codeDropped = true;
            continue;
          }
          // Primary key already taken — bump the number and retry.
          if (error.code === "23505" || /duplicate key|already exists/i.test(msg)) {
            const n = parseInt(newId.slice(2), 10) + 1;
            newId = `PT${String(n).padStart(4, "0")}`;
            continue;
          }
          throw new Error(`${msg}${error.code ? ` (${error.code})` : ""}`);
        }
        throw new Error("Nije moguće generirati slobodan partner_id");
      }

      let codeDropped = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const payload = codeDropped ? base : { ...base, code: trimmedCode };
        const { error } = await anyTable("partner")
          .update(payload)
          .eq("partner_id", partner!.partner_id);
        if (!error) return partner!.partner_id;
        const msg = String(error.message ?? "");
        if (!codeDropped && isMissingColumn(msg, "code")) {
          codeDropped = true;
          continue;
        }
        throw new Error(`${msg}${error.code ? ` (${error.code})` : ""}`);
      }
      return partner!.partner_id;

    },
    onSuccess: (id) => {
      toast.success(isCreate ? `Partner ${id} dodan` : "Partner ažuriran");
      qc.invalidateQueries({ queryKey: ["partners-list"] });
      qc.invalidateQueries({ queryKey: ["partners"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isCreate ? "Novi partner" : "Uredi partnera"}
          </DialogTitle>
          {!isCreate && (
            <DialogDescription className="font-mono text-xs">
              {partner!.partner_id}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Naziv">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </Field>
          <Field label="Code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="npr. NOVO-HR"
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </Field>
          <Field label="Država">
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </Field>
          <Field label="Contact email">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </Field>

          <div className="space-y-2">
            <Label className="text-xs">Tip partnera</Label>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="role-buyer"
                  checked={isBuyer}
                  onCheckedChange={(v) => setIsBuyer(v === true)}
                />
                <Label htmlFor="role-buyer" className="text-sm font-normal">
                  Buyer
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="role-supplier"
                  checked={isSupplier}
                  onCheckedChange={(v) => setIsSupplier(v === true)}
                />
                <Label htmlFor="role-supplier" className="text-sm font-normal">
                  Supplier
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="role-both"
                  checked={isBuyer && isSupplier}
                  onCheckedChange={(v) => {
                    setIsBuyer(v === true);
                    setIsSupplier(v === true);
                  }}
                />
                <Label htmlFor="role-both" className="text-sm font-normal">
                  Both
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Spremi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete dialog (with FK dependency check)
// ---------------------------------------------------------------------------

export function PartnerDeleteDialog(props: {
  partner: PartnerEditable | null;
  onClose: () => void;
}) {
  const { partner, onClose } = props;
  const qc = useQueryClient();

  const refs = useQuery({
    queryKey: ["partner-refs", partner?.partner_id],
    enabled: !!partner,
    queryFn: () => countRefs(partner!.partner_id),
  });

  const total = useMemo(
    () => Object.values(refs.data ?? {}).reduce((a, b) => a + b, 0),
    [refs.data],
  );

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("partner")
        .delete()
        .eq("partner_id", partner!.partner_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partner obrisan");
      qc.invalidateQueries({ queryKey: ["partners-list"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blocked = total > 0;

  return (
    <Dialog open={!!partner} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Obriši partnera</DialogTitle>
          <DialogDescription>{partner?.name}</DialogDescription>
        </DialogHeader>

        {refs.isLoading ? (
          <p className="text-sm text-muted-foreground">Provjera ovisnosti…</p>
        ) : blocked ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Partner ima povezane podatke, koristi Merge umjesto Delete.
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {Object.entries(refs.data ?? {})
                .filter(([, n]) => n > 0)
                .map(([t, n]) => (
                  <li key={t}>
                    {t}: {n}
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm">
            Nema povezanih podataka. Brisanje je nepovratno — potvrdi?
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button
            variant="destructive"
            disabled={blocked || refs.isLoading || del.isPending}
            onClick={() => del.mutate()}
          >
            {del.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Obriši
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Merge dialog
// ---------------------------------------------------------------------------

export function PartnerMergeDialog(props: {
  open: boolean;
  partners: PartnerEditable[];
  onClose: (merged?: boolean) => void;
}) {
  const { open, partners, onClose } = props;
  const qc = useQueryClient();
  const [survivor, setSurvivor] = useState<string>("");

  useEffect(() => {
    if (open) setSurvivor(partners[0]?.partner_id ?? "");
  }, [open, partners]);

  const losers = partners.filter((p) => p.partner_id !== survivor);

  const summary = useQuery({
    queryKey: [
      "partner-merge-summary",
      survivor,
      losers.map((l) => l.partner_id).join(","),
    ],
    enabled: open && !!survivor && losers.length > 0,
    queryFn: async () => {
      let rows = 0;
      for (const l of losers) {
        const counts = await countRefs(l.partner_id);
        rows += Object.values(counts).reduce((a, b) => a + b, 0);
      }
      return { rows, deleted: losers.length };
    },
  });

  const merge = useMutation({
    mutationFn: async () => {
      for (const l of losers) {
        for (const t of FK_TABLES) {
          const { error } = await anyTable(t.table)
            .update({ partner_id: survivor })
            .eq("partner_id", l.partner_id);
          if (error && !/does not exist|schema cache/i.test(error.message)) {
            throw new Error(`${t.label}: ${error.message}`);
          }
        }
        const { error: delErr } = await supabase
          .from("partner")
          .delete()
          .eq("partner_id", l.partner_id);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      toast.success(`Spojeno u ${survivor}`);
      qc.invalidateQueries({ queryKey: ["partners-list"] });
      qc.invalidateQueries({ queryKey: ["partners"] });
      onClose(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Spoji partnere</DialogTitle>
          <DialogDescription>
            Odaberi partnera koji ostaje (survivor)
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={survivor} onValueChange={setSurvivor} className="grid gap-2">
          {partners.map((p) => (
            <div key={p.partner_id} className="flex items-center gap-2">
              <RadioGroupItem value={p.partner_id} id={`sv-${p.partner_id}`} />
              <Label htmlFor={`sv-${p.partner_id}`} className="text-sm font-normal">
                {p.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {p.partner_id}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <p className="text-xs text-muted-foreground">
          {summary.isLoading
            ? "Izračun ovisnosti…"
            : summary.data
              ? `${summary.data.rows} redova će biti premješteno, ${summary.data.deleted} partnera će biti obrisano.`
              : "—"}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()}>
            Odustani
          </Button>
          <Button
            disabled={!survivor || losers.length === 0 || merge.isPending}
            onClick={() => merge.mutate()}
          >
            {merge.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Spoji
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
