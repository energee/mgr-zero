// lib/supabase/cola-label-images.ts — the only writer of MGR's COLA label copies (iron rule 4).
// store_cola_label_image is service-only so staff cannot plant bytes; get_cola_image calls this
// after admitting the caller and receiving the permit-checked label from TTB.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function storeColaLabelImage(breweryId: string, ttbId: string, imageUrl: string, dataUrl: string) {
  const { error } = await createAdminClient().rpc("store_cola_label_image", {
    p_brewery: breweryId, p_ttb_id: ttbId, p_image_url: imageUrl, p_data_url: dataUrl,
  });
  if (error) throw error;
}
