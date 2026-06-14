import { createClient } from "@/lib/supabase/server";

/** Batch-generates signed URLs (TTL 1h) for whatsapp-media paths. Returns a
 *  Map<path, signedUrl>. The signed URL is generated server-side under the user's
 *  session so RLS applies; the stored value is only the empresa-scoped PATH. */
export async function signedMediaUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("whatsapp-media").createSignedUrls(paths, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  }
  return map;
}
