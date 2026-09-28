import { useState } from "react";
import { Check, LoaderCircle, Share2 } from "lucide-react";
import { bouton, boutonSecondaire } from "./ui";
import { supabase } from "@/lib/supabase";
import type { Tache } from "@/lib/types";

// Partage en 1 clic vers un profil Facebook perso (ou un groupe) : aucune API
// ne le permet, on passe donc par le menu « Partager » du téléphone. Facebook
// ignore le texte transmis par ce menu : on le copie pour qu'il suffise de le coller.
type Etape = "pret" | "chargement" | "relancer" | "confirmer" | "fait";

async function versFichier(url: string, video: boolean) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Média introuvable.");
  const blob = await r.blob();
  const ext = video ? "mp4" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `publication.${ext}`, { type: blob.type || (video ? "video/mp4" : "image/jpeg") });
}

export function BoutonPartage({ tache: t, principal, onPublie }: { tache: Tache; principal?: boolean; onPublie: () => Promise<void> }) {
  const [etape, setEtape] = useState<Etape>("pret");
  const [fichiers, setFichiers] = useState<File[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const texte = t.resultat?.brouillon ?? "";
  const media = t.resultat?.video_url ?? t.resultat?.visuel_url ?? null;

  async function partager() {
    setInfo(null);
    let copie = false;
    try {
      await navigator.clipboard.writeText(texte);
      copie = true;
    } catch {
      /* presse-papiers refusé : le texte reste affiché sur la carte */
    }
    try {
      let f = fichiers;
      if (!f) {
        setEtape("chargement");
        f = media ? [await versFichier(media, Boolean(t.resultat?.video_url))] : [];
        setFichiers(f);
      }
      if (navigator.share && (!f.length || navigator.canShare?.({ files: f }))) {
        await navigator.share(f.length ? { files: f, text: texte } : { text: texte });
        setInfo(copie ? "Texte copié : dans Facebook, appuyez longuement dans la zone de texte puis « Coller »." : null);
        setEtape("confirmer");
        return;
      }
      // Ordinateur : on télécharge le média et on ouvre Facebook.
      if (f.length) {
        const lien = document.createElement("a");
        lien.href = URL.createObjectURL(f[0]);
        lien.download = f[0].name;
        lien.click();
      }
      window.open("https://www.facebook.com/", "_blank", "noopener");
      setInfo(`${f.length ? "Média téléchargé. " : ""}${copie ? "Texte copié. " : ""}Dans Facebook : « Créer une publication », collez le texte et ajoutez le média.`);
      setEtape("confirmer");
    } catch (e) {
      const nom = e instanceof Error ? e.name : "";
      if (nom === "AbortError") return setEtape("pret"); // partage fermé sans choisir d'appli
      // Le chargement du média a pris trop de temps : le téléphone exige un nouvel appui.
      if (nom === "NotAllowedError") return setEtape("relancer");
      setInfo(e instanceof Error ? e.message : "Partage impossible.");
      setEtape("pret");
    }
  }

  async function marquerPublie() {
    await supabase()
      .from("taches")
      .update({ statut: "terminee", resultat: { ...t.resultat, publie_le: new Date().toISOString() } })
      .eq("id", t.id);
    setEtape("fait");
    await onPublie();
  }

  if (etape === "confirmer") {
    return (
      <div className="flex w-full flex-col gap-2" role="status">
        {info && <p className="text-xs text-doux">{info}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">C'est publié ?</span>
          <button className={`${bouton} flex items-center gap-1.5`} onClick={marquerPublie}>
            <Check size={15} aria-hidden />
            Oui, c'est publié
          </button>
          <button className={boutonSecondaire} onClick={() => setEtape("pret")}>
            Pas encore
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        className={`${principal ? bouton : boutonSecondaire} flex items-center gap-1.5`}
        disabled={etape === "chargement" || etape === "fait" || !texte}
        title={texte ? "Ouvre le menu Partager du téléphone : choisissez Facebook, puis votre profil ou un groupe" : "Rédigez d'abord le texte"}
        onClick={partager}
      >
        {etape === "chargement" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Share2 size={15} aria-hidden />}
        {etape === "chargement" ? "Préparation…" : etape === "relancer" ? "Appuyez pour partager" : "Partager sur Facebook"}
      </button>
      {info && <p className="w-full text-xs text-erreur">{info}</p>}
    </>
  );
}
