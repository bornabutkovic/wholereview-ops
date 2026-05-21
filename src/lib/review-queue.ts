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
  userId: string | null;
}): Promise<void> {
  const { data, error } = await supabase
    .from("review_queue")
    .update({
      status: params.status,
      resolution_note: params.note,
      resolved_at: new Date().toISOString(),
      resolved_by: params.userId,
    })
    .eq("id", params.id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Update returned 0 rows — likely missing RLS UPDATE policy on review_queue.",
    );
  }
}
