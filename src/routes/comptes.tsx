import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { Carte, Erreur, Titre, bouton, boutonSecondaire } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES, type Plateforme } from "@/lib/plateformes";
import { synchroniserComptes, urlConnexion } from "@/lib/agent.functions";

export const Route = createFileRoute("/comptes")({ component: Comptes });

type Compte = { id: string; plateforme: string; statut: string; nom_utilisateur: string | null };

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
    () => supabase().from("comptes_connectes").select("id, plateforme, statut, nom_utilisateur"),
    [userId],
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const traduire = (e: string) => (e === "ZERNIO_ABSENT" ? MESSAGE_ZERNIO_ABSENT : e);
  const recharger = comptes.recharger;

  const synchroniser = useCallback(async () => {
    setEnCours("sync");
    setErreur(null);
    setInfo(null);
    try {
      const r = await synchroniserComptes({ data: { jeton: await jetonSession() } });
      if (r.ok) setInfo(r.connectes ? `${r.connectes} compte(s) connecté(s).` : "Aucun compte connecté pour l'instant.");
      else setErreur(traduire(r.erreur));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnCours(null);
    await recharger();
  }, [recharger]);

  // Retour de la page d'autorisation du réseau : Zernio ajoute ?connected=…
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("connected")) {
      window.history.replaceState(null, "", "/comptes");
      void synchroniser();
    }
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

  async function retirer(id: string) {
    const { error } = await supabase().from("comptes_connectes").delete().eq("id", id);
    setErreur(error?.message ?? null);
    await recharger();
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
        <button className={`${boutonSecondaire} flex items-center gap-2`} disabled={enCours !== null} onClick={synchroniser}>
          <RefreshCw size={14} className={enCours === "sync" ? "animate-spin" : ""} aria-hidden />
          Actualiser
        </button>
      </Carte>

      {info && <p className="-mt-3 mb-4 text-sm text-ok" role="status">{info}</p>}
      <Erreur message={erreur ?? comptes.erreur} />

      {GROUPES.map((g) => {
        const liste = PLATEFORMES.filter(g.filtre);
        return (
          <section key={g.titre} className="mb-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-doux uppercase">{g.titre}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liste.map((p) => {
                const compte = comptes.data?.find((c) => c.plateforme === p.id);
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
                          ? compte?.nom_utilisateur ? `@${compte.nom_utilisateur.replace(/^@/, "")}` : "Connecté"
                          : compte?.statut === "erreur"
                            ? "Connexion à refaire"
                            : disponible
                              ? "Non connecté"
                              : "Bientôt"}
                      </p>
                    </div>
                    {connecte && compte ? (
                      <button className={boutonSecondaire} onClick={() => retirer(compte.id)}>
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
