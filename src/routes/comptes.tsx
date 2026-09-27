import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { Carte, Erreur, Titre, bouton, boutonSecondaire } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { ChoixPageLinkedin } from "@/components/ChoixPageLinkedin";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES, type Plateforme } from "@/lib/plateformes";
import { deconnecter, synchroniserComptes, urlConnexion, type CompteDistant } from "@/lib/agent.functions";
import { nomPlateforme } from "@/lib/plateformes";

export const Route = createFileRoute("/comptes")({ component: Comptes });

type Compte = {
  id: string;
  plateforme: string;
  statut: string;
  nom_utilisateur: string | null;
  compte_externe_id: string | null;
  fournisseur: "zernio" | "meta" | "instagram";
};

// Erreurs renvoyées par Zernio au retour de la page d'autorisation.
const ERREURS_RETOUR: Record<string, string> = {
  oauth_denied: "Autorisation refusée ou annulée sur la page du réseau. Recommencez et acceptez toutes les permissions.",
  no_facebook_pages:
    "Aucune page Facebook sélectionnée. Recommencez, cliquez sur « Modifier les paramètres précédents » et cochez votre page.",
  reconnect_required: "Le réseau demande une nouvelle connexion. Cliquez à nouveau sur « Connecter ».",
};

const MESSAGE_ZERNIO_ABSENT =
  "Le service de connexion n'est pas activé : il manque la clé Zernio dans Vercel (ZERNIO_API_KEY).";

const GROUPES: { titre: string; filtre: (p: Plateforme) => boolean }[] = [
  { titre: "Réseaux sociaux", filtre: (p) => p.zernio !== null && (p.categorie === "reseau" || p.categorie === "local") },
  { titre: "Messageries", filtre: (p) => p.zernio !== null && p.categorie === "messagerie" },
  { titre: "Bientôt disponible", filtre: (p) => p.zernio === null },
];

function Comptes() {
  const userId = useUserId();
  const comptes = useRequete<Compte[]>(
    () => supabase().from("comptes_connectes").select("id, plateforme, statut, nom_utilisateur, compte_externe_id, fournisseur"),
    [userId],
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const [distants, setDistants] = useState<CompteDistant[] | null>(null);
  const [lienFacturation, setLienFacturation] = useState<string | null>(null);

  const traduire = (e: string) => {
    if (e === "ZERNIO_ABSENT") return MESSAGE_ZERNIO_ABSENT;
    if (e.startsWith("LIMITE_GRATUITE|")) {
      setLienFacturation(e.split("|")[1]);
      return "Limite gratuite atteinte : Zernio offre 2 comptes connectés. Déconnectez un compte inutile ci-dessous pour libérer une place, ou ajoutez un moyen de paiement chez Zernio (6 $/mois par compte en plus).";
    }
    return e;
  };
  const recharger = comptes.recharger;

  const synchroniser = useCallback(async (silencieux = false) => {
    setEnCours("sync");
    if (!silencieux) {
      setErreur(null);
      setInfo(null);
    }
    try {
      const r = await synchroniserComptes({ data: { jeton: await jetonSession() } });
      if (r.ok) {
        setDistants(r.distants);
        if (!silencieux) setInfo(r.connectes ? `${r.connectes} compte(s) connecté(s).` : "Aucun compte connecté pour l'instant.");
      } else setErreur(traduire(r.erreur));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnCours(null);
    await recharger();
  }, [recharger]);

  // Au chargement : état réel chez Zernio. Au retour de la page d'autorisation,
  // Zernio ajoute ?connected=… (succès) ou ?error=…&platform=… (échec).
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const erreurRetour = params.get("error");
    if (params.has("connected") || erreurRetour) window.history.replaceState(null, "", "/comptes");
    if (erreurRetour) {
      const reseau = nomPlateforme(params.get("platform"));
      const detail = ERREURS_RETOUR[erreurRetour] ?? params.get("error_message") ?? erreurRetour;
      setErreur(`${reseau} : ${detail}${params.get("request_id") ? ` (réf. ${params.get("request_id")})` : ""}`);
      void synchroniser(true);
    } else void synchroniser(!params.has("connected"));
  }, [userId, synchroniser]);

  async function connecter(plateforme: string) {
    setEnCours(plateforme);
    setErreur(null);
    try {
      const r = await urlConnexion({ data: { plateforme, jeton: await jetonSession() } });
      if (r.ok) {
        window.location.href = r.url;
        return;
      }
      setErreur(traduire(r.erreur));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnCours(null);
  }

  // Déconnecte aussi chez Zernio : sinon le compte y garde sa place.
  async function retirer(compte: { id: string; compte_externe_id: string | null }) {
    setErreur(null);
    if (compte.compte_externe_id) {
      setEnCours(compte.compte_externe_id);
      try {
        const r = await deconnecter({ data: { compteExterneId: compte.compte_externe_id, jeton: await jetonSession() } });
        if (!r.ok) setErreur(traduire(r.erreur));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
      setEnCours(null);
    } else {
      const { error } = await supabase().from("comptes_connectes").delete().eq("id", compte.id);
      setErreur(error?.message ?? null);
    }
    await synchroniser(true);
  }

  const connectes = comptes.data?.filter((c) => c.statut === "connecte") ?? [];

  return (
    <>
      <Titre sous="Connectez vos réseaux une fois : l'agent publie, répond aux messages et prospecte avec.">
        Comptes connectés
      </Titre>

      <Carte className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CircleCheck className={connectes.length ? "text-ok" : "text-doux"} aria-hidden />
          <div>
            <p className="font-medium">
              {connectes.length} réseau{connectes.length > 1 ? "x" : ""} connecté{connectes.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-doux">
              Cliquez sur « Connecter » : la page officielle du réseau s'ouvre, vous autorisez, vous revenez ici.
            </p>
          </div>
        </div>
        <button className={`${boutonSecondaire} flex items-center gap-2`} disabled={enCours !== null} onClick={() => synchroniser()}>
          <RefreshCw size={14} className={enCours === "sync" ? "animate-spin" : ""} aria-hidden />
          Actualiser
        </button>
      </Carte>

      {info && <p className="-mt-3 mb-4 text-sm text-ok" role="status">{info}</p>}
      <Erreur message={erreur ?? comptes.erreur} />
      {lienFacturation && (
        <p className="mt-1 text-sm">
          <a href={lienFacturation} target="_blank" rel="noreferrer" className="text-accent underline">
            Ouvrir la facturation Zernio
          </a>
        </p>
      )}

      {distants && distants.length > 0 && (
        <Carte className="my-4">
          <h2 className="font-medium">Comptes enregistrés chez Zernio : {distants.length} (2 gratuits)</h2>
          <p className="mt-1 text-xs text-doux">
            Chaque compte ici occupe une place, même s'il n'est plus utilisé. Déconnectez ceux dont vous n'avez plus besoin.
          </p>
          <ul className="mt-3 space-y-2">
            {distants.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <LogoPlateforme id={d.plateforme} taille={24} />
                  <span className="truncate">
                    {nomPlateforme(d.plateforme)}
                    {d.nom && ` · ${d.nom}`}
                    {!d.utilise && <span className="text-alerte"> · non utilisé</span>}
                    {!d.actif && <span className="text-erreur"> · connexion expirée</span>}
                  </span>
                </span>
                <button
                  className={boutonSecondaire}
                  disabled={enCours !== null}
                  onClick={() => retirer({ id: "", compte_externe_id: d.id })}
                >
                  {enCours === d.id ? "…" : "Déconnecter"}
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <PagesMeta comptes={comptes.data ?? []} onChange={recharger} />

      {comptes.data?.find((c) => c.plateforme === "linkedin" && c.statut === "connecte") && (
        <ChoixPageLinkedin
          nomProfil={comptes.data.find((c) => c.plateforme === "linkedin")?.nom_utilisateur ?? null}
        />
      )}

      <p className="mb-2 text-xs text-doux">
        Facebook et Instagram : connexion directe à Meta, gratuite et sans limite ; elle n'occupe pas de place chez Zernio.
        Instagram doit être un compte professionnel ou créateur (réglage gratuit dans l'app Instagram : Paramètres → Type de compte).
      </p>
      <p className="mb-4 text-xs text-doux">
        LinkedIn : la connexion se fait avec votre compte personnel ; choisissez ensuite
        ci-dessus la page entreprise au nom de laquelle publier (il faut en être administrateur).
      </p>

      {GROUPES.map((g) => {
        const liste = PLATEFORMES.filter(g.filtre);
        return (
          <section key={g.titre} className="mb-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-doux uppercase">{g.titre}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liste.map((p) => {
                // Le compte actif d'abord, la connexion directe Meta avant Zernio.
                const compte =
                  comptes.data?.find((c) => c.plateforme === p.id && c.statut === "connecte" && c.fournisseur !== "zernio") ??
                  comptes.data?.find((c) => c.plateforme === p.id && c.statut === "connecte") ??
                  comptes.data?.find((c) => c.plateforme === p.id && c.statut !== "desactive");
                const connecte = compte?.statut === "connecte";
                const disponible = p.zernio !== null;
                return (
                  <div
                    key={p.id}
                    className={`flex min-w-0 items-center gap-3 rounded-xl border bg-carte p-4 transition-colors ${
                      connecte ? "border-ok/40" : "border-bord"
                    } ${disponible ? "" : "opacity-60"}`}
                  >
                    <LogoPlateforme id={p.id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nom}</p>
                      <p className={`flex items-center gap-1.5 truncate text-xs ${connecte ? "text-ok" : "text-doux"}`}>
                        <span className={`inline-block size-1.5 rounded-full ${connecte ? "bg-ok" : "bg-doux/50"}`} aria-hidden />
                        {connecte
                          ? `${compte?.nom_utilisateur ? (compte.plateforme === "facebook" ? compte.nom_utilisateur : `@${compte.nom_utilisateur.replace(/^@/, "")}`) : "Connecté"}${compte?.fournisseur !== "zernio" ? " · direct" : ""}`
                          : compte?.statut === "erreur"
                            ? "Connexion à refaire"
                            : disponible
                              ? "Non connecté"
                              : "Bientôt"}
                      </p>
                    </div>
                    {connecte && compte ? (
                      <button className={boutonSecondaire} disabled={enCours !== null} onClick={() => retirer(compte)}>
                        Retirer
                      </button>
                    ) : disponible ? (
                      <button
                        className={`${bouton} flex items-center gap-1.5 px-3 py-1.5`}
                        disabled={enCours !== null}
                        onClick={() => connecter(p.id)}
                      >
                        {enCours === p.id && <LoaderCircle size={14} className="animate-spin" aria-hidden />}
                        {enCours === p.id ? "Ouverture…" : "Connecter"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

// Plusieurs pages autorisées chez Meta : choisir celle au nom de laquelle publier.
function PagesMeta({ comptes, onChange }: { comptes: Compte[]; onChange: () => Promise<void> }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const meta = comptes.filter((c) => c.fournisseur === "meta");
  const plateformes = ["facebook", "instagram"].filter((p) => meta.filter((c) => c.plateforme === p).length > 1);
  if (plateformes.length === 0) return null;

  async function utiliser(c: Compte) {
    const sb = supabase();
    const autres = meta.filter((x) => x.plateforme === c.plateforme && x.id !== c.id).map((x) => x.id);
    const r1 = await sb.from("comptes_connectes").update({ statut: "desactive" }).in("id", autres);
    const r2 = await sb.from("comptes_connectes").update({ statut: "connecte" }).eq("id", c.id);
    setErreur(r1.error?.message ?? r2.error?.message ?? null);
    await onChange();
  }

  return (
    <Carte className="my-4">
      <h2 className="font-medium">Page utilisée pour publier</h2>
      <p className="mt-1 text-xs text-doux">Vous avez autorisé plusieurs pages. L'agent publie sur celle qui est cochée.</p>
      {plateformes.map((p) => (
        <fieldset key={p} className="mt-3">
          <legend className="mb-2 flex items-center gap-2 text-sm">
            <LogoPlateforme id={p} taille={20} />
            {nomPlateforme(p)}
          </legend>
          <div className="space-y-1.5">
            {meta
              .filter((c) => c.plateforme === p)
              .map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name={`page-${p}`} checked={c.statut === "connecte"} onChange={() => utiliser(c)} className="accent-accent" />
                  {c.nom_utilisateur ?? c.compte_externe_id}
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      <Erreur message={erreur} />
    </Carte>
  );
}
