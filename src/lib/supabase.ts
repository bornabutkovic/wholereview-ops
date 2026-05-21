import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = "https://hinseieocikbszmyflyh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnNlaWVvY2lrYnN6bXlmbHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcxOTgsImV4cCI6MjA5MDI3MzE5OH0.mVvJ4t1BwtaMWGhQoU5GGPJHsmlJ8Ao8LXoJydoul4A";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type ReviewCategory =
  | "PRODUCT_MATCH"
  | "QTY_AMBIGUOUS"
  | "PARTNER_UNKNOWN"
  | "DOC_TYPE"
  | "PRICE"
  | "OTHER";

export type ReviewStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export interface ReviewItem {
  id: string;
  category: ReviewCategory;
  description: string | null;
  status: ReviewStatus;
  payload: unknown;
  suggested_value: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductMatchPayload {
  raw_input?: string | null;
  raw_product_ref?: string | null;
  raw_code?: string | null;
  partner_id?: string | null;
  item_id?: string | null;
  match_source?: string | null;
  mapping_confidence?: number | null;
  match_reason?: string | null;
}

export interface PartnerUnknownPayload {
  from_address?: string | null;
  email_log_id?: string | null;
}

export interface NpSkuDetails {
  np_sku_id: string;
  pack_description: string | null;
  brand: string | null;
  inn: string | null;
}

export interface Partner {
  partner_id: string;
  name: string;
  contact_email: string | null;
  is_buyer: boolean;
}
