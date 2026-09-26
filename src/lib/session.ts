import { supabase } from "./supabase";

export async function jetonSession() {
  const { data } = await supabase().auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) throw new Error("Session expirée, reconnectez-vous.");
  return jeton;
}
