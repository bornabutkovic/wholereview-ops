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
  userId: string | null;
}

export interface AssignPartnerResult {
  matched: number;
  sentToReview: number;
}

export function useAssignPartner() {
  return useMutation({
    mutationFn: async (args: AssignPartnerArgs): Promise<AssignPartnerResult> => {
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

      let matched = 0;
      let sentToReview = 0;

      if (args.emailLogId) {
        // Step 1: link incoming_requests to the partner
        const { data: reqs, error: reqErr } = await supabase
          .from("incoming_requests")
          .update({ partner_id: args.partnerId })
          .eq("email_log_id", args.emailLogId)
          .select("id");
        if (reqErr) throw reqErr;

        const requestIds = (reqs ?? []).map((r) => r.id as string);

        if (requestIds.length > 0) {
          // Step 2: fetch unmatched items
          const { data: items, error: itemsErr } = await supabase
            .from("request_items")
            .select("id, incoming_request_id, raw_product_ref")
            .in("incoming_request_id", requestIds)
            .is("np_sku_id", null);
          if (itemsErr) throw itemsErr;

          for (const item of items ?? []) {
            const rawRef = (item as { raw_product_ref: string | null }).raw_product_ref;
            if (!rawRef) {
              const { error: rqErr } = await supabase.from("review_queue").insert({
                email_id: args.emailLogId,
                request_id: item.incoming_request_id,
                item_id: item.id,
                category: "PRODUCT_MATCH",
                status: "OPEN",
                description: "Neprepoznat produkt: (no reference)",
                payload: {
                  raw_product_ref: null,
                  item_id: item.id,
                  email_log_id: args.emailLogId,
                  partner_id: args.partnerId,
                },
              });
              if (rqErr) throw rqErr;
              sentToReview += 1;
              continue;
            }

            // Step 3: lookup alias for this partner
            const { data: alias, error: aliasErr } = await supabase
              .from("product_code_alias")
              .select("np_sku_id")
              .eq("partner_id", args.partnerId)
              .or(`external_name.ilike.${rawRef},external_code.ilike.${rawRef}`)
              .limit(1)
              .maybeSingle();
            if (aliasErr) throw aliasErr;

            if (alias?.np_sku_id) {
              // Step 4: assign sku to the item
              const { error: updErr } = await supabase
                .from("request_items")
                .update({ np_sku_id: alias.np_sku_id })
                .eq("id", item.id);
              if (updErr) throw updErr;
              matched += 1;
            } else {
              // Step 5: send to review queue
              const { error: rqErr } = await supabase.from("review_queue").insert({
                email_id: args.emailLogId,
                request_id: item.incoming_request_id,
                item_id: item.id,
                category: "PRODUCT_MATCH",
                status: "OPEN",
                description: `Neprepoznat produkt: ${rawRef}`,
                payload: {
                  raw_product_ref: rawRef,
                  item_id: item.id,
                  email_log_id: args.emailLogId,
                  partner_id: args.partnerId,
                },
              });
              if (rqErr) throw rqErr;
              sentToReview += 1;
            }
          }
        }
      }

      // Step 6: resolve the current PARTNER_UNKNOWN review item
      await resolveReviewItem({
        id: args.reviewItemId,
        status: "RESOLVED",
        note: `Linked to partner: ${args.partnerName}`,
        userId: args.userId,
      });

      return { matched, sentToReview };
    },
  });
}

export interface ConfirmMappingArgs {
  rawInput: string;
  partnerId: string | null;
  npSkuId: string;
  itemId?: string | null;
  reviewItemId: string;
  userId: string | null;
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
        userId: args.userId,
      });
    },
  });
}

export interface RejectMappingArgs {
  rawInput: string;
  partnerId: string | null;
  reviewItemId: string;
  userId: string | null;
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
        userId: args.userId,
      });
    },
  });
}
