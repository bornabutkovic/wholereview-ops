import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hinseieocikbszmyflyh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpbn NlaWVvY2lrYnN6bXlmbHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcxOTgsImV4cCI6MjA5MDI3MzE5OH0.mVvJ4t1BwtaMWGhQoU5GGPJHsmlJ8Ao8LXoJydoul4A".replace(
    / /g,
    "",
  );

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}
