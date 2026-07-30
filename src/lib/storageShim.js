import { supabase } from "./supabaseClient";

// Installs a `window.storage` that matches the exact get/set/delete/list
// contract the app already uses — so the ~2,300 lines of App.jsx need zero
// changes. Everything is scoped to the signed-in user via Supabase RLS.
export function installStorageShim(userId) {
  window.storage = {
    async get(key) {
      const { data, error } = await supabase
        .from("kv_store")
        .select("value")
        .eq("user_id", userId)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`key not found: ${key}`);
      return { key, value: data.value, shared: false };
    },

    async set(key, value) {
      const { error } = await supabase
        .from("kv_store")
        .upsert(
          { user_id: userId, key, value, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
      if (error) throw error;
      return { key, value, shared: false };
    },

    async delete(key) {
      const { error } = await supabase
        .from("kv_store")
        .delete()
        .eq("user_id", userId)
        .eq("key", key);
      if (error) throw error;
      return { key, deleted: true, shared: false };
    },

    async list(prefix = "") {
      let q = supabase.from("kv_store").select("key").eq("user_id", userId);
      if (prefix) q = q.like("key", `${prefix}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { keys: (data || []).map((r) => r.key), prefix, shared: false };
    },
  };
}
