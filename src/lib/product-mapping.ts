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

export function usePartners(options?: { buyersOnly?: boolean }) {
  const buyersOnly = options?.buyersOnly ?? false;
  return useQuery({
    queryKey: ["partners", { buyersOnly }],
    queryFn: async (): Promise<Partner[]> => {
      let q = supabase
        .from("partner")
        .select("partner_id, code, name, contact_email, is_buyer")
        .order("name", { ascending: true })
        .limit(2000);
      if (buyersOnly) q = q.eq("is_buyer", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });
}

interface RawSkuRow {
  np_sku_id: string;
  pack_description: string | null;
  np_product:
    | { brand: string | null; inn: string | null; name?: string | null }
    | { brand: string | null; inn: string | null; name?: string | null }[]
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
    name: product?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface AssignPartnerArgs {
  partnerId: string;
  partnerName: string;
  fromAddress: string | null;
  emailLogId: string | null;
  reviewItemId: string;
  userEmail: string | null;
}

export function useAssignPartner() {
  return useMutation({
    mutationFn: async (args: AssignPartnerArgs) => {
      const trimmedEmail = args.fromAddress?.trim() || null;
      if (trimmedEmail) {
        const { error } = await supabase
          .from("partner")
          .update({ contact_email: trimmedEmail })
          .eq("partner_id", args.partnerId);
        if (error) throw error;
      }

      if (args.emailLogId) {
        const { error: elErr } = await supabase
          .from("email_log")
          .update({ partner_id: args.partnerId })
          .eq("id", args.emailLogId);
        if (elErr) throw elErr;
      }

      await resolveReviewItem({
        id: args.reviewItemId,
        status: "RESOLVED",
        note: `Linked to partner: ${args.partnerName}`,
        userEmail: args.userEmail,
      });
    },
  });
}

export interface ConfirmMappingArgs {
  rawInput: string;
  partnerId: string | null;
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

      // Try to update an existing learned mapping row first, scoped by partner.
      let updateQuery = supabase
        .from("product_mapping_learned")
        .update({
          status: "CONFIRMED",
          np_sku_id: args.npSkuId,
          confirmed_at: nowIso,
          confirmed_by: args.userId,
        })
        .eq("raw_input", args.rawInput);
      updateQuery = args.partnerId
        ? updateQuery.eq("partner_id", args.partnerId)
        : updateQuery.is("partner_id", null);
      const { data: updated, error: updateErr } = await updateQuery.select("raw_input");
      if (updateErr) throw updateErr;

      // Edge case: no row existed yet — insert one.
      if (!updated || updated.length === 0) {
        const { error: insertErr } = await supabase.from("product_mapping_learned").insert({
          raw_input: args.rawInput,
          partner_id: args.partnerId,
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
        note: `SKU confirmed: ${args.npSkuId}`,
        userEmail: args.userEmail,
      });
    },
  });
}

export interface RejectMappingArgs {
  rawInput: string;
  partnerId: string | null;
  reviewItemId: string;
  userEmail: string | null;
}

export function useRejectMapping() {
  return useMutation({
    mutationFn: async (args: RejectMappingArgs) => {
      let q = supabase
        .from("product_mapping_learned")
        .update({ status: "REJECTED" })
        .eq("raw_input", args.rawInput);
      q = args.partnerId ? q.eq("partner_id", args.partnerId) : q.is("partner_id", null);
      const { error } = await q;
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
