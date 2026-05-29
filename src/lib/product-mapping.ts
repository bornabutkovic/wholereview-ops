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
        .select("np_sku_id, pack_description, np_product:np_product_id(brand, inn)")
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
        .select("np_sku_id, pack_description, eu_approval_no, hr_approval_no, np_product:np_product_id(brand, inn)")
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
        .select("partner_id, name, contact_email, is_buyer")
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
  eu_approval_no: string | null;
  hr_approval_no: string | null;
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
    eu_approval_no: r.eu_approval_no,
    hr_approval_no: r.hr_approval_no,
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

      let matched = 0;
      let sentToReview = 0;
      let requestIds: string[] = [];

      if (args.emailLogId) {
        // Step A: link email_log to the partner
        const { data: emailRows, error: elErr } = await supabase
          .from("email_log")
          .update({ partner_id: args.partnerId })
          .eq("id", args.emailLogId)
          .select("id");
        if (elErr) throw elErr;
        console.log("[assignPartner] email_log updated:", emailRows?.length ?? 0, "row(s)", {
          emailLogId: args.emailLogId,
          partnerId: args.partnerId,
        });

        // Step B: link incoming_requests to the partner
        const { data: reqs, error: reqErr } = await supabase
          .from("incoming_requests")
          .update({ partner_id: args.partnerId })
          .eq("email_log_id", args.emailLogId)
          .select("id, doc_type");
        if (reqErr) throw reqErr;

        requestIds = (reqs ?? []).map((r) => r.id as string);
        console.log("[assignPartner] incoming_requests updated:", requestIds.length, "row(s)", {
          emailLogId: args.emailLogId,
          partnerId: args.partnerId,
          requestIds,
        });

        // Step C: backfill email_log.doc_type from the request's parsed doc_type
        const parsedDocType =
          (reqs ?? [])
            .map((r) => (r as { doc_type: string | null }).doc_type)
            .find((d) => d && d.trim().length > 0) ?? null;
        if (parsedDocType) {
          const { error: dtErr } = await supabase
            .from("email_log")
            .update({ doc_type: parsedDocType })
            .eq("id", args.emailLogId);
          if (dtErr) throw dtErr;
          console.log("[assignPartner] email_log.doc_type set to:", parsedDocType);
        }
      }

      {

        if (requestIds.length > 0) {
          // Step 4: fetch unmatched items
          const { data: items, error: itemsErr } = await supabase
            .from("request_items")
            .select("id, incoming_request_id, raw_product_ref")
            .in("incoming_request_id", requestIds)
            .is("np_sku_id", null);
          if (itemsErr) throw itemsErr;

          const SUPABASE_URL = "https://hinseieocikbszmyflyh.supabase.co";
          const SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnNlaWVvY2lrYnN6bXlmbHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcxOTgsImV4cCI6MjA5MDI3MzE5OH0.mVvJ4t1BwtaMWGhQoU5GGPJHsmlJ8Ao8LXoJydoul4A";

          for (const item of items ?? []) {
            const it = item as {
              id: string;
              incoming_request_id: string;
              raw_product_ref: string | null;
            };

            // Step 5: call match-product edge function
            let matchedSku: string | null = null;
            let confidence = 0;
            try {
              const res = await fetch(`${SUPABASE_URL}/functions/v1/match-product`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                  raw_product_ref: it.raw_product_ref,
                  partner_id: args.partnerId,
                }),
              });
              if (res.ok) {
                const json = (await res.json()) as { np_sku_id?: string | null; confidence?: number };
                matchedSku = json.np_sku_id ?? null;
                confidence = typeof json.confidence === "number" ? json.confidence : 0;
              }
            } catch {
              // fall through to review queue
            }

            if (matchedSku && confidence >= 0.85) {
              // Step 6: auto-match
              const { error: updErr } = await supabase
                .from("request_items")
                .update({ np_sku_id: matchedSku })
                .eq("id", it.id);
              if (updErr) throw updErr;
              matched += 1;
            } else {
              // Step 7: send to review queue
              const { error: rqErr } = await supabase.from("review_queue").insert({
                email_id: args.emailLogId,
                request_id: it.incoming_request_id,
                item_id: it.id,
                category: "PRODUCT_MATCH",
                status: "OPEN",
                description: `Neprepoznat produkt: ${it.raw_product_ref ?? "(no reference)"}`,
                suggested_value: matchedSku,
                payload: {
                  raw_product_ref: it.raw_product_ref,
                  item_id: it.id,
                  email_log_id: args.emailLogId,
                  partner_id: args.partnerId,
                  confidence,
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
          updated_at: nowIso,
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
          updated_at: nowIso,
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
