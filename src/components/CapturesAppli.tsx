import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { Carte, Erreur, boutonSecondaire } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRequete, useUserId } from "@/lib/donnees";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const TAILLE_MAX = 6 * 1024 * 1024;
const NOMBRE_MAX = 30;

// Nom du fichier sans extension ni accents (« Devis IA.png » → « devis-ia ») :
// les vidéos montrent d'abord les captures dont le nom reprend leur sujet.
const nomFichier = (nom: string) =>
  nom
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "capture";

// Captures d'écran de l'application de l'utilisateur : les vidéos créées par
// l'agent les montrent à la place des images lues sur le site.
export function CapturesAppli() {
  const userId = useUserId();
  const liste = useRequete<string[]>(() => supabase().rpc("mes_captures_appli"), [userId]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const entree = useRef<HTMLInputElement>(null);
  const noms = liste.data ?? [];
  const lien = (nom: string) => supabase().storage.from("captures").getPublicUrl(nom).data.publicUrl;

  async function ajouter(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!userId || !fichiers.length) return;
    setErreur(null);
    const refusees = fichiers.filter((f) => !TYPES.includes(f.type) || f.size > TAILLE_MAX);
    const valides = fichiers.filter((f) => !refusees.includes(f)).slice(0, Math.max(0, NOMBRE_MAX - noms.length));
    if (refusees.length) setErreur("Images JPG, PNG ou WebP de 6 Mo maximum : certaines ont été ignorées.");
    else if (valides.length < fichiers.length) setErreur(`${NOMBRE_MAX} captures au maximum : supprimez-en avant d'en ajouter.`);
    setEnvoi(true);
    for (const f of valides) {
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const { error } = await supabase()
        .storage.from("captures")
        .upload(`${userId}/${Date.now()}-${nomFichier(f.name)}.${ext}`, f, { contentType: f.type });
      if (error) {
        setErreur(/fetch|network/i.test(error.message) ? "La connexion a coupé pendant l'envoi. Réessayez." : error.message);
        break;
      }
    }
    setEnvoi(false);
    await liste.recharger();
  }

  async function supprimer(nom: string) {
    if (!window.confirm("Retirer cette capture des vidéos ?")) return;
    const { error } = await supabase().storage.from("captures").remove([nom]);
    if (error) setErreur(error.message);
    await liste.recharger();
  }

  return (
    <Carte className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Captures de votre application</h2>
          <p className="mt-1 text-xs text-doux">
            Les vidéos de l'agent montrent ces écrans pour présenter votre produit, quatre différents à chaque vidéo. Nommez
            vos fichiers d'après l'écran (« devis.png », « planning.png ») : une vidéo sur les devis montrera d'abord
            l'écran des devis. Sans capture, l'agent utilise les images de votre site.
          </p>
        </div>
        <button
          type="button"
          className={`${boutonSecondaire} inline-flex items-center gap-2`}
          disabled={envoi || noms.length >= NOMBRE_MAX}
          onClick={() => entree.current?.click()}
        >
          {envoi ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {envoi ? "Envoi…" : "Ajouter des captures"}
        </button>
        <input ref={entree} type="file" accept={TYPES.join(",")} multiple hidden onChange={ajouter} />
      </div>
      <Erreur message={erreur ?? liste.erreur} />
      {liste.chargement ? null : noms.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {noms.map((nom) => (
            <li key={nom} className="group relative overflow-hidden rounded-lg border border-bord">
              <img src={lien(nom)} alt="Capture de l'application" loading="lazy" className="aspect-[9/16] w-full object-cover object-top" />
              <button
                type="button"
                aria-label="Retirer cette capture"
                onClick={() => supprimer(nom)}
                className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-doux">
          Aucune capture pour l'instant. Ajoutez des captures d'écran de votre logiciel ou de votre appli (sur téléphone, de
          préférence), sans données personnelles visibles.
        </p>
      )}
    </Carte>
  );
}
