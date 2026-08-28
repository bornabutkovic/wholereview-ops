import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import type { NpSkuDetails } from "@/lib/supabase";
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
  skus: NpSkuDetails[];
  loading: boolean;
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
};

export function skuLabel(s: NpSkuDetails) {
  return `${s.brand ?? s.inn ?? "Unknown product"}${s.pack_description ? ` — ${s.pack_description}` : ""}`;
}

export function SkuCombobox(props: SkuComboboxProps) {
  const { skus, loading, value, onChange, placeholder = "Select SKU…" } = props;
  const [open, setOpen] = useState(false);
  const selected = skus.find((s) => s.np_sku_id === value) ?? null;

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
            {loading ? "Loading SKUs…" : selected ? skuLabel(selected) : placeholder}
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
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
