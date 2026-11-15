// Purge des médias de l'agent (vidéos, animations, fichiers du studio).
//
// Accord de Younes du 15/11/2026 : une fois une publication partie, ses fichiers
// ne servent plus et sont effacés. Ne restent que les fichiers reliés à une
// publication À VENIR (à partager, à valider, en attente, programmée), à un
// montage ou un doublage prêt de moins de 30 jours, à la photothèque et à la
// fiche de marque (voir prive.medias_a_purger).
//
// Appelée chaque nuit par pg_cron, ou à la demande avec { avant, simuler }.
// Garde-fou : jamais de fichier de moins de 24 h (un média en cours de
// fabrication n'est pas encore relié à sa publication).
//
// SÉCURITÉ : clé de service ou secret partagé avec le cron (purge_medias_secret),
// comparé en temps constant. Refus par défaut si le secret manque.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const JOUR_MS = 24 * 3600 * 1000;
const DELAI_PAR_DEFAUT_JOURS = 3;
const TOURS_MAX = 12;

async function secretsEgaux(a?: string | null, b?: string | null): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < va.length; i++) d |= va[i] ^ vb[i];
  return d === 0;
}

type Candidat = { bucket: string; nom: string; taille: number };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: secretCron } = await admin.rpc("purge_medias_secret");
  const autorise =
    (await secretsEgaux(bearer, SERVICE_ROLE)) ||
    (await secretsEgaux(bearer, typeof secretCron === "string" ? secretCron : null));
  if (!autorise) return new Response("unauthorized", { status: 401 });

  const corps = (await req.json().catch(() => ({}))) as { avant?: string; simuler?: boolean };
  const maintenant = Date.now();
  const avantMs = corps.avant ? Date.parse(corps.avant) : maintenant - DELAI_PAR_DEFAUT_JOURS * JOUR_MS;
  if (!Number.isFinite(avantMs)) return Response.json({ ok: false, erreur: "date invalide" }, { status: 400 });
  // Jamais de fichier de moins de 24 h.
  const avant = new Date(Math.min(avantMs, maintenant - JOUR_MS)).toISOString();
  const simuler = corps.simuler === true;

  let supprimes = 0;
  let octets = 0;
  const parSeau: Record<string, number> = {};
  const erreurs: string[] = [];
  for (let tour = 0; tour < TOURS_MAX; tour++) {
    const { data, error } = await admin.rpc("purge_medias_candidats", { p_avant: avant, p_limite: simuler ? 1000 : 500 });
    if (error) return Response.json({ ok: false, erreur: error.message }, { status: 500 });
    const lot = (data ?? []) as Candidat[];
    if (!lot.length) break;

    const noms = new Map<string, Candidat[]>();
    for (const c of lot) noms.set(c.bucket, [...(noms.get(c.bucket) ?? []), c]);

    let efface = 0;
    for (const [seau, fichiers] of noms) {
      for (let i = 0; i < fichiers.length; i += 100) {
        const tranche = fichiers.slice(i, i + 100);
        if (simuler) {
          efface += tranche.length;
          octets += tranche.reduce((s, f) => s + Number(f.taille), 0);
          parSeau[seau] = (parSeau[seau] ?? 0) + tranche.length;
          continue;
        }
        const { data: retires, error: e } = await admin.storage.from(seau).remove(tranche.map((f) => f.nom));
        if (e) {
          erreurs.push(`${seau}: ${e.message}`);
          continue;
        }
        const n = (retires ?? []).length;
        efface += n;
        parSeau[seau] = (parSeau[seau] ?? 0) + n;
        octets += tranche.reduce((s, f) => s + Number(f.taille), 0);
      }
    }
    supprimes += efface;
    // Simulation : une seule passe (rien n'est retiré, la liste ne change pas).
    // Aucun fichier retiré sur cette passe : on s'arrête, pas de boucle sans fin.
    if (simuler || efface === 0 || lot.length < 500) break;
  }
  return Response.json({
    ok: erreurs.length === 0,
    simule: simuler,
    avant,
    supprimes,
    megaoctets: Math.round(octets / 1024 / 1024),
    par_seau: parSeau,
    erreurs: erreurs.slice(0, 10),
  });
});
