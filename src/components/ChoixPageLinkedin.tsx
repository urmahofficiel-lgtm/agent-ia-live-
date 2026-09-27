import { useEffect, useState } from "react";
import { Carte, Erreur, champ } from "./ui";
import { LogoPlateforme } from "./LogoPlateforme";
import { choisirPageLinkedin, pagesLinkedin } from "@/lib/agent.functions";
import { jetonSession } from "@/lib/session";

// LinkedIn connecte d'abord le profil personnel : ici on choisit de publier
// au nom d'une page entreprise dont on est administrateur.
export function ChoixPageLinkedin({ nomProfil }: { nomProfil: string | null }) {
  const [pages, setPages] = useState<{ urn: string; nom: string }[] | null>(null);
  const [cible, setCible] = useState<string>("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await pagesLinkedin({ data: { jeton: await jetonSession() } });
        if (r.ok) {
          setPages(r.pages);
          setCible(r.cible ?? "");
        } else setErreur(r.erreur);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    })();
  }, []);

  async function changer(urn: string) {
    setCible(urn);
    setErreur(null);
    setInfo(null);
    const nom = pages?.find((p) => p.urn === urn)?.nom ?? null;
    try {
      const r = await choisirPageLinkedin({ data: { urn: urn || null, nom, jeton: await jetonSession() } });
      if (r.ok) setInfo(urn ? `Les publications LinkedIn partiront au nom de « ${nom} ».` : "Les publications LinkedIn partiront de votre profil personnel.");
      else setErreur(r.erreur);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <Carte className="mb-6 flex flex-wrap items-center gap-3">
      <LogoPlateforme id="linkedin" taille={32} />
      <label className="min-w-0 flex-1 text-sm">
        <span className="font-medium">LinkedIn : publier au nom de</span>
        <select className={`${champ} mt-1`} value={cible} onChange={(e) => changer(e.target.value)} disabled={pages === null}>
          <option value="">Mon profil personnel{nomProfil ? ` (${nomProfil})` : ""}</option>
          {pages?.map((p) => (
            <option key={p.urn} value={p.urn}>Page entreprise : {p.nom}</option>
          ))}
        </select>
        {pages !== null && pages.length === 0 && (
          <span className="mt-1 block text-xs text-alerte">
            Aucune page entreprise trouvée : ce compte LinkedIn doit être administrateur de la page (LinkedIn → votre page →
            Outils d'administration → Gérer les administrateurs), puis reconnectez LinkedIn.
          </span>
        )}
        {info && <span className="mt-1 block text-xs text-ok">{info}</span>}
      </label>
      <div className="w-full"><Erreur message={erreur} /></div>
    </Carte>
  );
}
