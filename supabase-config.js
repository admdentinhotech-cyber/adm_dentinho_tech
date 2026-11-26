window.DENTINHO_SUPABASE_URL = "https://lnpzygdcrbavrcrkixqr.supabase.co";
window.DENTINHO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucHp5Z2RjcmJhdnJjcmtpeHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NTk2ODgsImV4cCI6MjExMTIzNTY4OH0.rhHSSuT3_VEuGfExDCn25NGAZE4pyJrSnZThaTRWKjU";

window.dentinhoSupabaseClient = null;

if (
  window.supabase &&
  !window.DENTINHO_SECRETARIA_PORTAL &&
  window.DENTINHO_SUPABASE_URL.startsWith("https://") &&
  !window.DENTINHO_SUPABASE_URL.includes("SEU-PROJETO") &&
  window.DENTINHO_SUPABASE_ANON_KEY !== "SUA_CHAVE_ANON_PUBLICA"
) {
  window.dentinhoSupabaseClient = window.supabase.createClient(
    window.DENTINHO_SUPABASE_URL,
    window.DENTINHO_SUPABASE_ANON_KEY
  );
}
