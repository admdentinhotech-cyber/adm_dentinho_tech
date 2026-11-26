window.secretariaSupabaseClient = null;

if (
  window.supabase &&
  window.DENTINHO_SUPABASE_URL?.startsWith("https://") &&
  !window.DENTINHO_SUPABASE_URL.includes("SEU-PROJETO") &&
  window.DENTINHO_SUPABASE_ANON_KEY !== "SUA_CHAVE_ANON_PUBLICA"
) {
  window.secretariaSupabaseClient = window.supabase.createClient(
    window.DENTINHO_SUPABASE_URL,
    window.DENTINHO_SUPABASE_ANON_KEY,
    {
      auth: {
        storageKey: "dentinho-secretaria-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
}
