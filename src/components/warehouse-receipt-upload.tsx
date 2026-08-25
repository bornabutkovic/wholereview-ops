import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { formatQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const BUCKET = "warehouse-receipts";
const WEBHOOK_URL =
  "https://novopharma.app.n8n.cloud/webhook/warehouse-receipt-upload";

const ACCEPT = ".pdf,image/*,application/pdf";
const MAX_BYTES = 25 * 1024 * 1024;

type Phase = "idle" | "uploading" | "processing" | "success" | "error";

interface ParsedItem {
  product_name?: string | null;
  raw_product_ref?: string | null;
  np_sku_id?: string | null;
  lot_number?: string | null;
  expiry_date?: string | null;
  qty?: number | null;
  qty_received?: number | null;
  shortfall?: number | null;
}

interface WebhookResponse {
  success: boolean;
  receipt_id?: string;
  items_written?: number;
  items?: ParsedItem[];
  error?: string;
}

interface PoOption {
  id: string;
  po_number: string | null;
  partner_name: string | null;
  created_at: string;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}

export function WarehouseReceiptUpload() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [requestId, setRequestId] = useState<string>("NONE");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebhookResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  const pos = useQuery({
    queryKey: ["receipt-po-options"],
    queryFn: async (): Promise<PoOption[]> => {
      const { data, error: err } = await supabase
        .from("incoming_requests")
        .select("id, po_number, created_at, partner:partner_id(name)")
        .in("doc_type", ["PO", "PO_XLS", "PO_PDF"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      return (
        (data ?? []) as unknown as {
          id: string;
          po_number: string | null;
          created_at: string;
          partner: { name: string | null } | { name: string | null }[] | null;
        }[]
      ).map((r) => {
        const p = Array.isArray(r.partner) ? r.partner[0] : r.partner;
        return {
          id: r.id,
          po_number: r.po_number,
          partner_name: p?.name ?? null,
          created_at: r.created_at,
        };
      });
    },
  });

  const selectedPo = pos.data?.find((p) => p.id === requestId) ?? null;

  function pickFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("Datoteka je prevelika (max 25 MB).");
      return;
    }
    setFile(f);
    setPhase("idle");
    setError(null);
    setResult(null);
    setStoragePath(null);
  }

  function reset() {
    setFile(null);
    setPhase("idle");
    setError(null);
    setResult(null);
    setStoragePath(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run(existingPath?: string | null) {
    if (!file) return;
    setError(null);
    setResult(null);

    const incoming_request_id = requestId === "NONE" ? null : requestId;
    let path = existingPath ?? null;

    try {
      if (!path) {
        setPhase("uploading");
        const folder =
          (selectedPo?.po_number && sanitizeName(selectedPo.po_number)) ||
          String(Date.now());
        path = `${folder}/${sanitizeName(file.name)}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            upsert: true,
            contentType: file.type || "application/octet-stream",
          });
        if (upErr) throw new Error(`Upload nije uspio: ${upErr.message}`);
        setStoragePath(path);
      }

      setPhase("processing");
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: path,
          incoming_request_id,
          uploaded_by: user?.id ?? null,
        }),
      });

      let payload: WebhookResponse | null = null;
      try {
        payload = (await res.json()) as WebhookResponse;
      } catch {
        payload = null;
      }

      if (!res.ok) {
        throw new Error(
          payload?.error ?? `Webhook je vratio status ${res.status}`,
        );
      }
      if (!payload || payload.success !== true) {
        throw new Error(payload?.error ?? "Obrada nije uspjela.");
      }

      setResult(payload);
      setPhase("success");
      toast.success(
        `Receipt processed — ${formatQty(payload.items_written ?? 0)} items recorded.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setPhase("error");
      toast.error(msg);
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Warehouse receipt</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Upload a scanned PDF or photo of the handwritten receipt. If you don't
          know which PO it belongs to, leave “Unknown”.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <FileUp className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">
          {file ? file.name : "Prevuci dokument ovdje"}
        </p>
        <p className="text-xs text-muted-foreground">
          PDF ili slika (JPG, PNG), do 25 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <div className="mt-1 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </Button>
          {file ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Pripada PO-u
          </label>
          <Select value={requestId} onValueChange={setRequestId} disabled={busy}>
            <SelectTrigger className="h-8 w-[320px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE" className="text-xs">
                Nije poznato
              </SelectItem>
              {(pos.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {(p.po_number ?? "—") + " · " + (p.partner_name ?? "Unknown")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          disabled={!file || busy}
          onClick={() => void run(null)}
          className="ml-auto"
        >
          {busy ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-2 h-3.5 w-3.5" />
          )}
          {phase === "uploading"
            ? "Uploading…"
            : phase === "processing"
              ? "Processing…"
              : "Upload and process"}
        </Button>
      </div>

      {phase === "processing" ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Processing… the document is being parsed, this can take up to a minute.
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Obrada nije uspjela
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void run(storagePath)}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : null}

      {phase === "success" && result ? (
        <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-800">
                Receipt processed
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatQty(result.items_written ?? result.items?.length ?? 0)}{" "}
                items recorded
                {result.receipt_id ? (
                  <>
                    {" · "}
                    <span className="font-mono">{result.receipt_id}</span>
                  </>
                ) : null}
                {requestId === "NONE"
                  ? " · no comparison against expected quantity (no PO selected)"
                  : null}
              </p>
            </div>
            {storagePath ? (
              <ReceiptFileLink path={storagePath} />
            ) : null}
          </div>

          {result.items?.length ? (
            <div className="overflow-hidden rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Proizvod</TableHead>
                    <TableHead className="w-[120px] text-xs">Lot</TableHead>
                    <TableHead className="w-[110px] text-xs">Rok</TableHead>
                    <TableHead className="w-[100px] text-right text-xs">
                      Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((it, i) => {
                    const qty = it.qty_received ?? it.qty ?? null;
                    return (
                      <TableRow key={i} className="text-sm">
                        <TableCell className="text-[13px]">
                          {it.product_name ?? it.raw_product_ref ?? "—"}
                          {it.shortfall ? (
                            <Badge
                              variant="outline"
                              className="ml-2 border-rose-200 bg-rose-50 text-rose-700"
                            >
                              manjak {formatQty(it.shortfall)}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {it.lot_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {it.expiry_date ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-[13px] tabular-nums">
                          {qty == null ? "—" : formatQty(qty)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The webhook did not return an item list.
            </p>
          )}

          <Button size="sm" variant="outline" onClick={reset}>
            Upload another receipt
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptFileLink({ path }: { path: string }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 10);
    setLoading(false);
    if (error || !data?.signedUrl) {
      toast.error("Ne mogu otvoriti dokument.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={() => void open()}>
      {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
      Vidi dokument
    </Button>
  );
}
