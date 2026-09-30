import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Eye, Heart, MessageCircle, Share2, Sparkles, Video } from "lucide-react";
import { Carte, Erreur, Pastille, Titre } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";
import { nomPlateforme } from "@/lib/plateformes";
import {
  JOURS_STATS,
  aDesStats,
  classer,
  parCreneau,
  parFormat,
  parJour,
  parStyleImage,
  parStyleVideo,
  totauxParReseau,
  type Apprentissage,
  type Groupe,
  type PubliStat,
} from "@/lib/statistiques";
import type { Tache } from "@/lib/types";

export const Route = createFileRoute("/statistiques")({ component: Statistiques });

type Ligne = Pick<Tache, "id" | "titre" | "plateforme" | "resultat">;

const fmt = (n: number | null | undefined) => (typeof n === "number" ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) : "—");

function Statistiques() {
  const userId = useUserId();
  const depuis = useMemo(() => new Date(Date.now() - JOURS_STATS * 86_400_000).toISOString(), []);
  const taches = useRequete<Ligne[]>(
    () =>
      supabase()
        .from("taches")
        .select("id, titre, plateforme, resultat")
        .eq("type", "publication")
        .eq("statut", "terminee")
        .gte("resultat->>publie_le", depuis)
        .order("updated_at", { ascending: false })
        .limit(500),
    [userId, depuis],
  );
  // Colonne absente tant que la migration n'est pas appliquée : ignorée.
  const reglages = useRequete<{ apprentissage: Apprentissage | null }>(
    () => supabase().from("reglages_agent").select("apprentissage").maybeSingle(),
    [userId],
  );

  const pubs: PubliStat[] = useMemo(
    () =>
      (taches.data ?? []).map((t) => ({
        id: t.id,
        titre: t.titre,
        plateforme: t.plateforme,
        publie_le: t.resultat?.publie_le ?? null,
        video: Boolean(t.resultat?.video_url),
        video_style: t.resultat?.video_style,
        visuel_style: t.resultat?.visuel_style,
        stats: t.resultat?.stats ?? null,
      })),
    [taches.data],
  );
  const mesurees = useMemo(() => pubs.filter(aDesStats), [pubs]);
  const totaux = useMemo(() => totauxParReseau(pubs), [pubs]);
  const top = useMemo(() => classer(mesurees).slice(0, 5), [mesurees]);
  const apprentissage = reglages.data?.apprentissage;
  const puces = apprentissage?.resume.split("\n").map((p) => p.replace(/^-\s*/, "")).filter(Boolean) ?? [];

  const somme = (k: "vues" | "likes" | "commentaires" | "partages") =>
    totaux.some((t) => t[k] !== null) ? totaux.reduce((n, t) => n + (t[k] ?? 0), 0) : null;

  return (
    <>
      <Titre sous={`Ce que vos publications des ${JOURS_STATS} derniers jours ont donné, et ce que l'agent en retient pour les suivantes. Mis à jour toutes les heures.`}>
        Statistiques
      </Titre>
      <Erreur message={taches.erreur} />

      {!taches.chargement && pubs.length === 0 && (
        <Carte className="mb-6 p-5 text-sm text-doux">
          Aucune publication publiée ces {JOURS_STATS} derniers jours.{" "}
          <Link to="/taches" className="font-medium text-accent hover:underline">
            Voir les publications →
          </Link>
        </Carte>
      )}

      <Carte className="mb-6 border-accent/40 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Sparkles size={18} className="text-accent" aria-hidden />
          Ce qui marche auprès de votre audience
        </h2>
        {puces.length ? (
          <>
            <ul className="space-y-2 text-sm">
              {puces.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-doux">
              L'agent s'en sert pour rédiger vos prochains posts et choisir les sujets. Analyse du{" "}
              {apprentissage?.maj ? new Date(apprentissage.maj).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}.
            </p>
          </>
        ) : (
          <p className="text-sm text-doux">
            Pas encore assez de données : le résumé apparaît dès que les premières statistiques sont relevées (environ une heure après une publication).
          </p>
        )}
      </Carte>

      {pubs.length > 0 && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tuile icone={Eye} libelle="Vues" valeur={somme("vues")} />
            <Tuile icone={Heart} libelle="Likes / réactions" valeur={somme("likes")} />
            <Tuile icone={MessageCircle} libelle="Commentaires" valeur={somme("commentaires")} />
            <Tuile icone={Share2} libelle="Partages" valeur={somme("partages")} />
          </div>

          <Carte className="mb-6 p-5">
            <h2 className="mb-3 text-lg font-semibold">Par réseau</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-mono text-[11px] tracking-wider text-doux uppercase">
                    <th className="py-2 pr-3 font-normal">Réseau</th>
                    <th className="px-3 py-2 text-right font-normal">Posts</th>
                    <th className="px-3 py-2 text-right font-normal">Vues</th>
                    <th className="px-3 py-2 text-right font-normal">Likes</th>
                    <th className="px-3 py-2 text-right font-normal">Comm.</th>
                    <th className="py-2 pl-3 text-right font-normal">Partages</th>
                  </tr>
                </thead>
                <tbody>
                  {totaux.map((t) => (
                    <tr key={t.reseau} className="border-t border-bord">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <LogoPlateforme id={t.reseau} taille={22} />
                          {nomPlateforme(t.reseau)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.publications}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(t.vues)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(t.likes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(t.commentaires)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{fmt(t.partages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-doux">
              « — » : le réseau ne fournit pas cette donnée avec les autorisations actuelles (ex. vues des Reels Facebook, LinkedIn sans l'option
              statistiques de Zernio).
            </p>
          </Carte>

          <Carte className="mb-6 p-5">
            <h2 className="mb-3 text-lg font-semibold">Top 5 des publications</h2>
            {top.length ? (
              <ol className="space-y-2">
                {top.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg border border-bord bg-fond/50 px-3 py-2.5">
                    <span className="w-5 shrink-0 font-mono text-sm text-doux">{i + 1}</span>
                    {p.plateforme && <LogoPlateforme id={p.plateforme} taille={24} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.titre}</span>
                      <span className="text-xs text-doux">
                        {p.publie_le ? new Date(p.publie_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
                        {p.video && (
                          <>
                            {" · "}
                            <Video size={12} className="inline" aria-label="Vidéo" />
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-doux tabular-nums">
                      {p.stats?.vues != null && <span>{fmt(p.stats.vues)} vues</span>}
                      <span>{fmt(p.stats?.likes)} ♥</span>
                      <span>{fmt(p.stats?.commentaires)} comm.</span>
                      {p.stats?.partages != null && <span>{fmt(p.stats.partages)} partages</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-doux">Statistiques en cours de relevé.</p>
            )}
          </Carte>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <Barres titre="Meilleurs créneaux (heure de Paris)" groupes={parCreneau(mesurees)} />
            <Barres titre="Meilleurs jours" groupes={parJour(mesurees)} />
            <Barres titre="Vidéo ou image" groupes={parFormat(mesurees)} />
            <Barres titre="Styles" groupes={[...parStyleVideo(mesurees).map((g) => ({ ...g, nom: `Vidéo · ${g.nom}` })), ...parStyleImage(mesurees).map((g) => ({ ...g, nom: `Image · ${g.nom}` }))].sort((a, b) => b.moyenne - a.moyenne)} />
          </div>
          <p className="text-xs text-doux">
            Score d'engagement moyen par publication : likes + 2 × commentaires + 3 × partages + vues / 100.{" "}
            {mesurees.length < pubs.length && <Pastille ton="doux">{pubs.length - mesurees.length} publication(s) sans statistiques</Pastille>}
          </p>
        </>
      )}
    </>
  );
}

function Tuile({ icone: Icone, libelle, valeur }: { icone: typeof Eye; libelle: string; valeur: number | null }) {
  return (
    <Carte className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-doux">
        <Icone size={14} aria-hidden />
        {libelle}
      </p>
      <p className="mt-1 font-titre text-2xl font-bold tabular-nums">{fmt(valeur)}</p>
    </Carte>
  );
}

// Barres CSS : largeur proportionnelle au meilleur score moyen.
function Barres({ titre, groupes }: { titre: string; groupes: Groupe[] }) {
  const max = Math.max(...groupes.map((g) => g.moyenne), 0);
  return (
    <Carte className="p-5">
      <h2 className="mb-3 font-semibold">{titre}</h2>
      {groupes.length && max > 0 ? (
        <ul className="space-y-2.5">
          {groupes.map((g, i) => (
            <li key={g.cle}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="capitalize">{g.nom}</span>
                <span className="font-mono text-xs text-doux tabular-nums">
                  {g.moyenne} · {g.n} post{g.n > 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-2 rounded-full bg-fond" aria-hidden>
                <div className={`h-2 rounded-full ${i === 0 ? "bg-accent" : "bg-plan/60"}`} style={{ width: `${Math.max((g.moyenne / max) * 100, 2)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-doux">Pas encore de données.</p>
      )}
    </Carte>
  );
}
