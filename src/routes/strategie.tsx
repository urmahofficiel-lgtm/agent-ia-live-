import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { CalendarPlus, LoaderCircle, Search } from "lucide-react";
import { Carte, Erreur, Titre, bouton, champ } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useRequete, useUserId } from "@/lib/donnees";
import { nomPlateforme } from "@/lib/plateformes";
import { analyserMarche, planifierDepuisStrategie } from "@/lib/agent.functions";
import type { Analyse, Profil } from "@/lib/strategie";

export const Route = createFileRoute("/strategie")({ component: Strategie });

type Ligne = Profil & { analyse_marche: Analyse | null; analyse_le: string | null };

const VIDE: Profil = { activite: "", offre: "", cible: "", zone: "", ton: "", site: "", objectif: "" };

const CHAMPS: { cle: keyof Profil; label: string; aide: string; long?: boolean }[] = [
  { cle: "activite", label: "Votre activité", aide: "Ex. : plombier-chauffagiste indépendant, agence de voyage, coach sportif…", long: true },
  { cle: "offre", label: "Ce que vous vendez", aide: "Vos produits / services, prix indicatifs, ce qui vous distingue", long: true },
  { cle: "cible", label: "Vos clients idéaux", aide: "Particuliers, entreprises, âge, métier, besoins…", long: true },
  { cle: "zone", label: "Zone", aide: "Ville, région, France entière, international…" },
  { cle: "ton", label: "Ton souhaité", aide: "Professionnel, chaleureux, humoristique, expert…" },
  { cle: "site", label: "Site web (optionnel)", aide: "https://…" },
  { cle: "objectif", label: "Objectif principal", aide: "Plus de demandes de devis, notoriété, vendre en ligne…" },
];

function Strategie() {
  const userId = useUserId();
  const navigate = useNavigate();
  const ligne = useRequete<Ligne>(
    () => supabase().from("profil_marque").select("activite, offre, cible, zone, ton, site, objectif, analyse_marche, analyse_le").maybeSingle(),
    [userId],
  );
  const [profil, setProfil] = useState<Profil>(VIDE);
  const [etat, setEtat] = useState<"libre" | "sauvegarde" | "analyse" | "plan">("libre");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (ligne.data) setProfil({ ...VIDE, ...Object.fromEntries(Object.keys(VIDE).map((k) => [k, ligne.data?.[k as keyof Profil] ?? ""])) });
  }, [ligne.data]);

  async function sauver() {
    if (!userId) return false;
    const { error } = await supabase().from("profil_marque").upsert({ user_id: userId, ...profil });
    if (error) setErreur(error.message);
    return !error;
  }

  async function analyser(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEtat("sauvegarde");
    if (!(await sauver())) return setEtat("libre");
    setEtat("analyse");
    try {
      const r = await analyserMarche({ data: { jeton: await jetonSession() } });
      if (!r.ok) setErreur(r.erreur);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    }
    setEtat("libre");
    await ligne.recharger();
  }

  async function creerCalendrier() {
    setErreur(null);
    setEtat("plan");
    try {
      const r = await planifierDepuisStrategie({ data: { jours: 14, jeton: await jetonSession() } });
      if (r.ok) {
        setInfo(`${r.creees} publications planifiées. L'agent prépare les textes et les visuels.`);
        await navigate({ to: "/en-direct" });
      } else setErreur(r.erreur);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    }
    setEtat("libre");
  }

  const a = ligne.data?.analyse_marche;

  return (
    <>
      <Titre sous="Décrivez votre activité : l'agent analyse votre niche et votre marché, puis choisit où et quoi publier.">
        Stratégie
      </Titre>

      <Carte className="mb-6">
        <form onSubmit={analyser} className="grid gap-4 md:grid-cols-2">
          {CHAMPS.map((c) => (
            <label key={c.cle} className={`text-sm ${c.long ? "md:col-span-2" : ""}`}>
              <span className="font-medium">{c.label}</span>
              {c.long ? (
                <textarea className={`${champ} mt-1 min-h-16`} placeholder={c.aide} value={profil[c.cle]} onChange={(e) => setProfil({ ...profil, [c.cle]: e.target.value })} required={c.cle === "activite"} />
              ) : (
                <input className={`${champ} mt-1`} placeholder={c.aide} value={profil[c.cle]} onChange={(e) => setProfil({ ...profil, [c.cle]: e.target.value })} />
              )}
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button className={`${bouton} flex items-center gap-2`} disabled={etat !== "libre"}>
              {etat === "analyse" || etat === "sauvegarde" ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />}
              {etat === "analyse" ? "Analyse du marché en cours (≈ 30 s)…" : a ? "Mettre à jour l'analyse" : "Analyser mon marché"}
            </button>
            {ligne.data?.analyse_le && (
              <span className="text-xs text-doux">Dernière analyse : {new Date(ligne.data.analyse_le).toLocaleString("fr-FR")}</span>
            )}
          </div>
        </form>
        <Erreur message={erreur ?? ligne.erreur} />
        {info && <p className="mt-2 text-sm text-ok">{info}</p>}
      </Carte>

      {a && (
        <div className="space-y-4">
          <Carte className="flex flex-wrap items-center justify-between gap-3 border-accent/40">
            <div>
              <p className="font-medium">Passer à l'action</p>
              <p className="text-sm text-doux">L'agent crée 2 semaines de publications sur vos réseaux prioritaires, avec texte et visuel.</p>
            </div>
            <button className={`${bouton} flex items-center gap-2`} disabled={etat !== "libre"} onClick={creerCalendrier}>
              {etat === "plan" ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <CalendarPlus size={16} aria-hidden />}
              {etat === "plan" ? "Création du calendrier…" : "Créer mon calendrier (14 jours)"}
            </button>
          </Carte>

          <div className="grid gap-4 md:grid-cols-2">
            <Bloc titre="Votre niche">{a.resume_niche}</Bloc>
            <Bloc titre="Positionnement">{a.positionnement}</Bloc>
            <Bloc titre="Le marché">{a.marche}</Bloc>
            <Bloc titre="La concurrence">{a.concurrence}</Bloc>
          </div>

          <Carte>
            <h2 className="mb-3 font-medium">Où publier</h2>
            <div className="space-y-3">
              {a.plateformes.map((p) => (
                <div key={p.id} className="flex gap-3">
                  <LogoPlateforme id={p.id} taille={36} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {nomPlateforme(p.id)} <span className="ml-1 text-xs text-doux">priorité {p.priorite}</span>
                    </p>
                    <p className="text-doux">{p.pourquoi}</p>
                    <p className="mt-1 text-xs">
                      <span className="text-accent">{p.frequence}</span> · {p.meilleurs_moments}
                      {p.formats && ` · ${p.formats}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Carte>

          <Carte>
            <h2 className="mb-3 font-medium">Vos clients</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {a.cibles.map((c) => (
                <div key={c.persona} className="rounded-lg border border-bord p-3 text-sm">
                  <p className="font-medium">{c.persona}</p>
                  <p className="mt-1"><span className="text-doux">Besoins : </span>{c.besoins}</p>
                  <p><span className="text-doux">Freins : </span>{c.freins}</p>
                  <p><span className="text-doux">Où les trouver : </span>{c.ou_les_trouver}</p>
                </div>
              ))}
            </div>
          </Carte>

          <Carte>
            <h2 className="mb-3 font-medium">Thèmes de contenu</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {a.piliers.map((p) => (
                <div key={p.theme} className="text-sm">
                  <p className="font-medium">{p.theme}</p>
                  <ul className="mt-1 list-disc pl-5 text-doux">
                    {p.idees.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Carte>

          <div className="grid gap-4 md:grid-cols-2">
            <Carte>
              <h2 className="mb-3 font-medium">Hashtags</h2>
              <div className="flex flex-wrap gap-2">
                {a.hashtags.map((h) => (
                  <span key={h} className="rounded-full bg-bord px-2.5 py-1 text-xs">{h}</span>
                ))}
              </div>
            </Carte>
            <Carte>
              <h2 className="mb-3 font-medium">Angles de prospection</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {a.angles_prospection.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </Carte>
          </div>
          <p className="text-xs text-doux">
            Analyse produite par l'IA à partir de ses connaissances du marché : utilisez-la comme base de travail.
          </p>
        </div>
      )}
    </>
  );
}

function Bloc({ titre, children }: { titre: string; children: string }) {
  return (
    <Carte>
      <h2 className="mb-2 font-medium">{titre}</h2>
      <p className="text-sm text-doux">{children}</p>
    </Carte>
  );
}
