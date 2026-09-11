import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getPublishedMenu(publicId: string) {
  const { data, error } = await createAdminClient().rpc("get_published_pos_menu", { p_public_id: publicId });
  if (error) throw error;
  return data;
}
