import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase, type NpSkuDetails, type Partner } from "./supabase";
import { resolveReviewItem } from "./review-queue";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useNpSkuDetails(npSkuId: string | null | undefined) {
  return useQuery({
    queryKey: ["np-sku-details", npSkuId],
    enabled: !!npSkuId,
    queryFn: async (): Promise<NpSkuDetails | null> => {
      const { data, error } = await supabase
        .from("np_sku")
        .select("np_sku_id, pack_description, np_product:np_product_id(brand, inn, name)")
        .eq("np_sku_id", npSkuId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return normalizeSku(data);
    },
  });
}

export function useNpSkuList() {
  return useQuery({
    queryKey: ["np-sku-list"],
    queryFn: async (): Promise<NpSkuDetails[]> => {
      const { data, error } = await supabase
        .from("np_sku")
        .select("np_sku_id, pack_description, np_product:np_product_id(brand, inn, name)")
        .order("np_sku_id", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map(normalizeSku);
    },
  });
}

export function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: async (): Promise<Partner[]> => {
      const { data, error } = await supabase
        .from("partner")
        .select("partner_id, code, contact_email")
        .order("code", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });
}

interface RawSkuRow {
  np_sku_id: string;
  pack_description: string | null;
  np_product:
    | { brand: string | null; inn: string | null }
    | { brand: string | null; inn: string | null }[]
    | null;
}

function normalizeSku(row: unknown): NpSkuDetails {
  const r = row as RawSkuRow;
  const product = Array.isArray(r.np_product) ? r.np_product[0] : r.np_product;
  return {
    np_sku_id: r.np_sku_id,
    pack_description: r.pack_description,
    brand: product?.brand ?? null,
    inn: product?.inn ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface AssignPartnerArgs {
  partnerId: string;
  partnerCode: string;
  email: string;
  currentEmail: string | null;
  reviewItemId: string;
  userEmail: string | null;
}

export function useAssignPartner() {
  return useMutation({
    mutationFn: async (args: AssignPartnerArgs) => {
      const trimmedEmail = args.email.trim();
      if (trimmedEmail && trimmedEmail !== (args.currentEmail ?? "")) {
        const { error } = await supabase
          .from("partner")
          .update({ contact_email: trimmedEmail })
          .eq("partner_id", args.partnerId);
        if (error) throw error;
      }
      await resolveReviewItem({
        id: args.reviewItemId,
        status: "RESOLVED",
        note: `Partner assigned: ${args.partnerCode}`,
        userEmail: args.userEmail,
      });
    },
  });
}

export interface ConfirmMappingArgs {
  rawInput: string;
  npSkuId: string;
  itemId?: string | null;
  reviewItemId: string;
  userEmail: string | null;
  userId: string | null;
}

export function useConfirmMapping() {
  return useMutation({
    mutationFn: async (args: ConfirmMappingArgs) => {
      const nowIso = new Date().toISOString();

      // Try to update an existing learned mapping row first.
      const { data: updated, error: updateErr } = await supabase
        .from("product_mapping_learned")
        .update({
          status: "CONFIRMED",
          confirmed_at: nowIso,
          confirmed_by: args.userId,
        })
        .eq("raw_input", args.rawInput)
        .eq("np_sku_id", args.npSkuId)
        .select("raw_input");
      if (updateErr) throw updateErr;

      // Edge case: no row existed yet — insert one.
      if (!updated || updated.length === 0) {
        const { error: insertErr } = await supabase.from("product_mapping_learned").insert({
          raw_input: args.rawInput,
          np_sku_id: args.npSkuId,
          status: "CONFIRMED",
          confirmed_at: nowIso,
          confirmed_by: args.userId,
        });
        if (insertErr) throw insertErr;
      }

      if (args.itemId) {
        const { error: itemErr } = await supabase
          .from("request_items")
          .update({ np_sku_id: args.npSkuId })
          .eq("id", args.itemId);
        if (itemErr) throw itemErr;
      }

      await resolveReviewItem({
        id: args.reviewItemId,
        status: "RESOLVED",
        note: `Mapping confirmed: ${args.npSkuId}`,
        userEmail: args.userEmail,
      });
    },
  });
}

export interface RejectMappingArgs {
  rawInput: string;
  reviewItemId: string;
  userEmail: string | null;
}

export function useRejectMapping() {
  return useMutation({
    mutationFn: async (args: RejectMappingArgs) => {
      const { error } = await supabase
        .from("product_mapping_learned")
        .update({ status: "REJECTED" })
        .eq("raw_input", args.rawInput);
      if (error) throw error;

      await resolveReviewItem({
        id: args.reviewItemId,
        status: "RESOLVED",
        note: "Mapping rejected",
        userEmail: args.userEmail,
      });
    },
  });
}
