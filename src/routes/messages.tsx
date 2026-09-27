import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Carte, Erreur, Titre, boutonSecondaire, champ } from "@/components/ui";
import { chargerBoite, envoyerReponse, proposerReponse, type ElementBoite } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";
import { useUserId } from "@/lib/donnees";
import { nomPlateforme } from "@/lib/plateformes";

export const Route = createFileRoute("/messages")({ component: Messages });

function Messages() {
  const userId = useUserId();
  const [elements, setElements] = useState<ElementBoite[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await chargerBoite({ data: { jeton: await jetonSession() } });
      if (r.ok) setElements(r.elements);
      else
        setErreur(
          r.erreur === "ZERNIO_ABSENT" ? "Le service de connexion des réseaux n'est pas activé (clé Zernio manquante)." : r.erreur,
        );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    if (userId) void charger();
  }, [userId, charger]);

  return (
    <>
      <Titre sous="Commentaires et messages privés reçus sur les réseaux connectés via Zernio. L'IA propose une réponse, vous l'envoyez en un clic.">
        Messages
      </Titre>
      <button className={`${boutonSecondaire} mb-4`} disabled={chargement} onClick={charger}>
        {chargement ? "Chargement…" : "Actualiser"}
      </button>
      <Erreur message={erreur} />
      {elements?.length === 0 && (
        <Carte className="text-sm text-doux">
          Rien de nouveau. Les commentaires et messages de vos réseaux connectés apparaîtront ici.
        </Carte>
      )}
      <div className="space-y-3">
        {elements?.map((e) => <Element key={`${e.genre}-${e.id}`} e={e} />)}
      </div>
    </>
  );
}

function Element({ e }: { e: ElementBoite }) {
  const [reponse, setReponse] = useState("");
  const [etat, setEtat] = useState<"libre" | "ia" | "envoi" | "envoye">("libre");
  const [erreur, setErreur] = useState<string | null>(null);

  async function proposer() {
    setEtat("ia");
    setErreur(null);
    try {
      const r = await proposerReponse({
        data: { genre: e.genre, auteur: e.auteur, texte: e.texte, contexte: e.contexte, jeton: await jetonSession() },
      });
      if (r.ok) setReponse(r.reponse);
      else setErreur(r.erreur);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    }
    setEtat("libre");
  }

  async function envoyer() {
    setEtat("envoi");
    setErreur(null);
    try {
      const r = await envoyerReponse({
        data: { genre: e.genre, id: e.id, accountId: e.accountId, postId: e.postId, auteur: e.auteur, reponse, jeton: await jetonSession() },
      });
      if (r.ok) return setEtat("envoye");
      setErreur(r.erreur);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    }
    setEtat("libre");
  }

  return (
    <Carte>
      <p className="text-xs text-doux">
        {e.genre === "commentaire" ? "Commentaire" : "Message privé"} · {nomPlateforme(e.plateforme)}
        {e.date && ` · ${new Date(e.date).toLocaleString("fr-FR")}`}
        {e.lien && (
          <>
            {" · "}
            <a href={e.lien} target="_blank" rel="noreferrer" className="underline">voir</a>
          </>
        )}
      </p>
      <p className="mt-1 font-medium">{e.auteur}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap">{e.texte}</p>
      {e.contexte && <p className="mt-1 text-xs text-doux">Sous : « {e.contexte} »</p>}

      {etat === "envoye" ? (
        <p className="mt-3 text-sm text-ok">Réponse envoyée.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            className={`${champ} min-h-16`}
            placeholder="Votre réponse…"
            aria-label={`Réponse à ${e.auteur}`}
            value={reponse}
            onChange={(x) => setReponse(x.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button className={boutonSecondaire} disabled={etat !== "libre"} onClick={proposer}>
              {etat === "ia" ? "L'IA rédige…" : "Proposer une réponse (IA)"}
            </button>
            <button className={boutonSecondaire} disabled={etat !== "libre" || !reponse.trim()} onClick={envoyer}>
              {etat === "envoi" ? "Envoi…" : "Envoyer"}
            </button>
          </div>
          <Erreur message={erreur} />
        </div>
      )}
    </Carte>
  );
}
