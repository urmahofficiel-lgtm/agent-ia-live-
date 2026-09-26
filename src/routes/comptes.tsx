import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Carte, Erreur, Titre, boutonSecondaire } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useRequete, useUserId } from "@/lib/donnees";
import { PLATEFORMES } from "@/lib/plateformes";
import { synchroniserComptes, urlConnexion } from "@/lib/agent.functions";

export const Route = createFileRoute("/comptes")({ component: Comptes });

type Compte = { id: string; plateforme: string; statut: string; nom_utilisateur: string | null };

const MESSAGE_ZERNIO_ABSENT =
  "Le service de connexion n'est pas encore activé : il manque la clé Zernio dans Vercel (ZERNIO_API_KEY).";

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

  const synchroniser = useCallback(async () => {
    setEnCours("sync");
    setErreur(null);
    try {
      const r = await synchroniserComptes({ data: { jeton: await jetonSession() } });
      if (r.ok) setInfo(`${r.connectes} compte(s) connecté(s).`);
      else setErreur(traduire(r.erreur));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setEnCours(null);
    await comptes.recharger();
  }, [comptes.recharger]);

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
    await comptes.recharger();
  }

  return (
    <>
      <Titre sous="Cliquez sur « Connecter » : la page officielle du réseau s'ouvre, vous autorisez l'agent, puis vous revenez ici.">
        Comptes connectés
      </Titre>
      <div className="mb-4 flex items-center gap-3">
        <button className={boutonSecondaire} disabled={enCours !== null} onClick={synchroniser}>
          {enCours === "sync" ? "Actualisation…" : "Actualiser les connexions"}
        </button>
        {info && <p className="text-sm text-ok">{info}</p>}
      </div>
      <Erreur message={erreur ?? comptes.erreur} />
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATEFORMES.map((p) => {
          const compte = comptes.data?.find((c) => c.plateforme === p.id);
          const connecte = compte?.statut === "connecte";
          return (
            <Carte key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{p.nom}</p>
                <p className={`truncate text-xs ${connecte ? "text-ok" : "text-doux"}`}>
                  {connecte
                    ? `Connecté${compte?.nom_utilisateur ? ` · ${compte.nom_utilisateur}` : ""}`
                    : compte?.statut === "erreur"
                      ? "Connexion à refaire"
                      : p.zernio
                        ? "Non connecté"
                        : "Bientôt disponible"}
                </p>
              </div>
              {connecte && compte ? (
                <button className={boutonSecondaire} onClick={() => retirer(compte.id)}>Retirer</button>
              ) : p.zernio ? (
                <button className={boutonSecondaire} disabled={enCours !== null} onClick={() => connecter(p.id)}>
                  {enCours === p.id ? "Ouverture…" : "Connecter"}
                </button>
              ) : null}
            </Carte>
          );
        })}
      </div>
    </>
  );
}
