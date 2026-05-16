import { supabase, type ReviewCategory, type ReviewItem, type ReviewStatus } from "./supabase";

export interface ListFilters {
  status: ReviewStatus | "ALL";
  category: ReviewCategory | "ALL";
}

export async function listReviewItems({ status, category }: ListFilters): Promise<ReviewItem[]> {
  let q = supabase
    .from("review_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (status !== "ALL") q = q.eq("status", status);
  if (category !== "ALL") q = q.eq("category", category);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ReviewItem[];
}

export async function resolveReviewItem(params: {
  id: string;
  status: "RESOLVED" | "DISMISSED";
  note: string;
  userEmail: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("review_queue")
    .update({
      status: params.status,
      resolution_note: params.note,
      resolved_at: new Date().toISOString(),
      resolved_by: params.userEmail,
    })
    .eq("id", params.id);
  if (error) throw error;
}
