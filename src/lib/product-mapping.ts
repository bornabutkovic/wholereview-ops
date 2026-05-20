import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase, type NpSkuDetails } from "./supabase";

export function useNpSkuDetails(npSkuId: string | null | undefined) {
  return useQuery({
    queryKey: ["np-sku-details", npSkuId],
    enabled: !!npSkuId,
    queryFn: async (): Promise<NpSkuDetails | null> => {
      const { data, error } = await supabase
        .from("np_sku")
        .select("np_sku_id, pack_description, np_product:np_product_id(brand, inn)")
        .eq("np_sku_id", npSkuId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const product = (data as { np_product: { brand: string | null; inn: string | null } | null })
        .np_product;
      return {
        np_sku_id: (data as { np_sku_id: string }).np_sku_id,
        pack_description: (data as { pack_description: string | null }).pack_description,
        brand: product?.brand ?? null,
        inn: product?.inn ?? null,
      };
    },
  });
}

export interface ConfirmMappingArgs {
  rawInput: string;
  suggestedSkuId: string | null;
  correctedSkuId?: string | null;
  userId: string | null;
}

/**
 * Confirms an existing suggested mapping, or rejects it and inserts a corrected one.
 * - If correctedSkuId is null/undefined: marks the (rawInput, suggestedSkuId) row CONFIRMED.
 * - Otherwise: marks the suggested row REJECTED and upserts a CONFIRMED row for correctedSkuId.
 */
export function useConfirmProductMapping() {
  return useMutation({
    mutationFn: async (args: ConfirmMappingArgs) => {
      const nowIso = new Date().toISOString();

      if (!args.correctedSkuId) {
        if (!args.suggestedSkuId) {
          throw new Error("Nothing to confirm: no suggested SKU.");
        }
        const { data, error } = await supabase
          .from("product_mapping_learned")
          .update({
            status: "CONFIRMED",
            confirmed_by: args.userId,
            confirmed_at: nowIso,
          })
          .eq("raw_input", args.rawInput)
          .eq("np_sku_id", args.suggestedSkuId)
          .select("raw_input");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            "No matching product_mapping_learned row found to confirm (check RLS UPDATE policy).",
          );
        }
        return { action: "confirmed" as const };
      }

      // Reject suggested (if any) and insert a corrected CONFIRMED row.
      if (args.suggestedSkuId) {
        const { error: rejectErr } = await supabase
          .from("product_mapping_learned")
          .update({ status: "REJECTED" })
          .eq("raw_input", args.rawInput)
          .eq("np_sku_id", args.suggestedSkuId);
        if (rejectErr) throw rejectErr;
      }

      const { error: insertErr } = await supabase.from("product_mapping_learned").insert({
        raw_input: args.rawInput,
        np_sku_id: args.correctedSkuId,
        status: "CONFIRMED",
        confirmed_by: args.userId,
        confirmed_at: nowIso,
      });
      if (insertErr) throw insertErr;
      return { action: "corrected" as const, correctedSkuId: args.correctedSkuId };
    },
  });
}
