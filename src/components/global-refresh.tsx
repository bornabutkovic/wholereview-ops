import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const COOLDOWN_MS = 15_000;
const AUTO_FLAG = "np_wf1_refresh_triggered";

const WEBHOOK_URL = "https://novopharma.app.n8n.cloud/webhook/wf1-manual-refresh";
const REFRESH_KEY = "bc9dac77ebd55759e1c88c3bdb8cbefe";

function relativeTime(iso: string | null): string {
  if (!iso) return "nikad osvježeno";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "nikad osvježeno";
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Zadnje osvježeno upravo sada";
  if (mins < 60) return `Zadnje osvježeno prije ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Zadnje osvježeno prije ${hours} h`;
  return `Zadnje osvježeno prije ${Math.floor(hours / 24)} d`;
}

async function triggerRefresh(): Promise<void> {
  if (!WEBHOOK_URL) throw new Error("Refresh webhook nije konfiguriran");
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(REFRESH_KEY ? { "x-np-refresh-key": REFRESH_KEY } : {}),
    },
    body: JSON.stringify({ source: "web-app" }),
  });
  if (!res.ok) throw new Error(`Webhook greška (${res.status})`);
}

export function GlobalRefresh() {
  const [pending, setPending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, forceTick] = useState(0);
  const autoRan = useRef(false);

  const lastRefreshed = useQuery({
    queryKey: ["system-refresh-lock"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("system_refresh_lock")
        .select("last_triggered_at")
        .order("last_triggered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data?.last_triggered_at as string | null) ?? null;
    },
  });

  // Ticker so the relative label and cooldown countdown stay fresh.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const run = useCallback(
    async (silent: boolean) => {
      setPending(true);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      try {
        await triggerRefresh();
        if (!silent) toast.success("Osvježavanje pokrenuto");
        void lastRefreshed.refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Nepoznata greška";
        if (!silent) toast.error(`Osvježavanje nije uspjelo: ${msg}`);
        else console.warn("Auto refresh failed:", msg);
      } finally {
        setPending(false);
      }
    },
    [lastRefreshed],
  );

  // Fire once per browser session on app mount.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(AUTO_FLAG)) return;
    window.sessionStorage.setItem(AUTO_FLAG, "1");
    void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const disabled = pending || cooldownLeft > 0;

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <span className="hidden text-[11px] text-muted-foreground sm:inline">
        {relativeTime(lastRefreshed.data ?? null)}
      </span>
      <Button
        size="sm"
        onClick={() => void run(false)}
        disabled={disabled}
        className="h-8 gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span className="text-xs font-semibold">
          {pending ? "Osvježavam…" : cooldownLeft > 0 ? `Čekaj ${cooldownLeft}s` : "Refresh"}
        </span>
      </Button>
    </div>
  );
}
