import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { CalendarPlus, Globe, LoaderCircle, Search } from "lucide-react";
import { Carte, Erreur, Titre, bouton, champ } from "@/components/ui";
import { LogoPlateforme } from "@/components/LogoPlateforme";
import { CapturesAppli } from "@/components/CapturesAppli";
import { supabase } from "@/lib/supabase";
import { jetonSession } from "@/lib/session";
import { useRequete, useUserId } from "@/lib/donnees";
import { nomPlateforme } from "@/lib/plateformes";
import { analyserDepuisLien, analyserMarche, planifierDepuisStrategie } from "@/lib/agent.functions";
import type { Analyse, Fiche, Profil } from "@/lib/strategie";

export const Route = createFileRoute("/strategie")({ component: Strategie });

type Ligne = Profil & { nom: string; fiche: Fiche | null; analyse_marche: Analyse | null; analyse_le: string | null };

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
    () => supabase().from("profil_marque").select("nom, fiche, activite, offre, cible, zone, ton, site, objectif, analyse_marche, analyse_le").maybeSingle(),
    [userId],
  );
  const [profil, setProfil] = useState<Profil>(VIDE);
  const [etat, setEtat] = useState<"libre" | "sauvegarde" | "analyse" | "lien" | "plan">("libre");
  const [lien, setLien] = useState("");
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (ligne.data?.site) setLien(ligne.data.site);
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

  async function analyserLien(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEtat("lien");
    try {
      const r = await analyserDepuisLien({ data: { lien, jeton: await jetonSession() } });
      if (r.ok) {
        setProfil({ ...VIDE, ...r.profil });
        setInfo("Site analysé : le profil est rempli et la stratégie est prête ci-dessous.");
      } else setErreur(r.erreur);
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
  const fiche = ligne.data?.fiche;

  return (
    <>
      <Titre sous="Donnez le lien de votre site : l'agent comprend votre niche, analyse votre marché et choisit où et quoi publier.">
        Stratégie
      </Titre>

      <Carte className="mb-4 border-accent/40">
        <form onSubmit={analyserLien}>
          <label htmlFor="lien" className="mb-1 flex items-center gap-2 font-medium">
            <Globe size={16} className="text-accent" aria-hidden />
            Le plus simple : le lien de votre site
          </label>
          <p className="mb-3 text-sm text-doux">
            Site, page produit, SaaS, boutique, page Google… L'agent le lit, remplit tout et construit votre stratégie.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="lien"
              className={champ}
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="https://monsite.fr/mon-produit"
              value={lien}
              onChange={(e) => setLien(e.target.value)}
              required
            />
            <button className={`${bouton} flex shrink-0 items-center justify-center gap-2`} disabled={etat !== "libre"}>
              {etat === "lien" ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />}
              {etat === "lien" ? "Lecture et analyse (≈ 1 min)…" : "Analyser avec l'IA"}
            </button>
          </div>
        </form>
        {etat === "lien" && <p className="mt-2 text-xs text-doux">Vous pouvez suivre chaque étape dans « En direct ».</p>}
      </Carte>

      <details
        className="mb-6 rounded-xl border border-bord bg-carte"
        open={detailsOuverts || Boolean(profil.activite)}
        onToggle={(e) => setDetailsOuverts((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer p-4 font-medium">
          {profil.activite ? "Votre profil (modifiable)" : "Pas de site ? Décrivez votre activité vous-même"}
        </summary>
        <form onSubmit={analyser} className="grid gap-4 px-4 pb-4 md:grid-cols-2">
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
              {etat === "analyse" ? "Analyse du marché en cours (≈ 30 s)…" : a ? "Refaire l'analyse avec ces infos" : "Analyser mon marché"}
            </button>
            {ligne.data?.analyse_le && (
              <span className="text-xs text-doux">Dernière analyse : {new Date(ligne.data.analyse_le).toLocaleString("fr-FR")}</span>
            )}
          </div>
        </form>
      </details>
      <Erreur message={erreur ?? ligne.erreur} />
      {info && <p className="-mt-3 mb-4 text-sm text-ok" role="status">{info}</p>}

      {ligne.data?.site && !fiche && (
        <Carte className="mb-4 border-alerte/40 text-sm">
          <p className="font-medium text-alerte">Relancez « Analyser avec l'IA » sur votre lien</p>
          <p className="mt-1 text-doux">
            L'agent récupère maintenant la fiche complète de votre marque (nom, fonctionnalités, preuves, tarifs, lien) pour
            que chaque publication et chaque image parlent vraiment de votre offre.
          </p>
        </Carte>
      )}

      {fiche && (
        <Carte className="mb-6">
          <h2 className="font-medium">Fiche marque{ligne.data?.nom ? ` : ${ligne.data.nom}` : ""}</h2>
          {fiche.slogan && <p className="mt-1 text-sm text-doux">« {fiche.slogan} »</p>}
          <p className="mt-1 text-xs text-doux">
            C'est la source de vérité de l'agent : il ne cite que ces faits, et termine chaque post par votre lien.
          </p>
          <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
            <ListeFiche titre="Fonctionnalités mises en avant" elements={fiche.fonctionnalites} />
            <ListeFiche titre="Bénéfices clients" elements={fiche.benefices} />
            <ListeFiche titre="Preuves relevées sur le site" elements={fiche.preuves} vide="Aucune : l'agent n'utilisera aucun chiffre." />
            <div className="space-y-2">
              {fiche.tarifs && <p><span className="text-doux">Tarifs : </span>{fiche.tarifs}</p>}
              {fiche.appel_action && <p><span className="text-doux">Appel à l'action : </span>{fiche.appel_action}</p>}
              {fiche.lien_cta && (
                <p className="truncate"><span className="text-doux">Lien dans les posts : </span>
                  <a href={fiche.lien_cta} target="_blank" rel="noreferrer" className="text-accent underline">{fiche.lien_cta}</a>
                </p>
              )}
            </div>
          </div>
        </Carte>
      )}

      <CapturesAppli />

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

function ListeFiche({ titre, elements, vide }: { titre: string; elements: string[]; vide?: string }) {
  return (
    <div>
      <p className="text-doux">{titre}</p>
      {elements.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {elements.map((x) => <li key={x}>{x}</li>)}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-doux">{vide ?? "—"}</p>
      )}
    </div>
  );
}
