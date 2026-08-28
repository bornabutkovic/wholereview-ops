import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import type { NpSkuDetails } from "@/lib/supabase";
import { useNpSkuDetails, useNpSkuSearch } from "@/lib/product-mapping";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SkuComboboxProps = {
  /** Optional seed list (recently loaded SKUs) shown before the user types. */
  skus?: NpSkuDetails[];
  loading?: boolean;
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
};

export function skuLabel(s: NpSkuDetails) {
  return `${s.brand ?? s.inn ?? "Unknown product"}${s.pack_description ? ` — ${s.pack_description}` : ""}`;
}

function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SkuCombobox(props: SkuComboboxProps) {
  const { skus = [], loading = false, value, onChange, placeholder = "Select SKU…" } = props;
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebounced(term);

  const search = useNpSkuSearch(debouncedTerm);
  const searching = search.isFetching || (term.trim().length >= 2 && term !== debouncedTerm);

  // Selected SKU may not be present in the seed list or the current results.
  const selectedFromLists =
    skus.find((s) => s.np_sku_id === value) ??
    search.data?.find((s) => s.np_sku_id === value) ??
    null;
  const fetchedSelected = useNpSkuDetails(value && !selectedFromLists ? value : null);
  const selected = selectedFromLists ?? fetchedSelected.data ?? null;

  const options = useMemo<NpSkuDetails[]>(() => {
    if (debouncedTerm.trim().length >= 2) return search.data ?? [];
    return skus;
  }, [debouncedTerm, search.data, skus]);

  const emptyMessage =
    term.trim().length < 2
      ? "Type at least 2 characters to search…"
      : searching
        ? "Searching…"
        : "No SKU found.";

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
            {selected
              ? skuLabel(selected)
              : loading || fetchedSelected.isLoading
                ? "Loading SKUs…"
                : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        {/* Filtering happens server-side; disable cmdk's built-in matching. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search SKU, brand, INN, pack…"
            value={term}
            onValueChange={setTerm}
          />
          <CommandList>
            <CommandEmpty>
              <span className="flex items-center justify-center gap-2 text-sm">
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {emptyMessage}
              </span>
            </CommandEmpty>
            <CommandGroup>
              {options.map((s) => (
                <CommandItem
                  key={s.np_sku_id}
                  value={s.np_sku_id}
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
                    <div className="truncate text-sm font-medium">{skuLabel(s)}</div>
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">
                        {s.np_sku_id}
                      </Badge>
                      {s.inn ? `· ${s.inn}` : ""}
                      {s.eu_approval_no ? `· EU: ${s.eu_approval_no}` : ""}
                      {s.hr_approval_no ? `· HR: ${s.hr_approval_no}` : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
