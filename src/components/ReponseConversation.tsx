import { useRef, useState, type ChangeEvent } from "react";
import { Check, Copy, ImagePlus, LoaderCircle, PenLine, Trash2 } from "lucide-react";
import { Carte, Erreur, Pastille, bouton, boutonSecondaire, champ } from "@/components/ui";
import { repondreConversation } from "@/lib/agent.functions";
import { NOMS_ETAPES, type ReponseConversation as Reponse } from "@/lib/conversation";
import { jetonSession } from "@/lib/session";

const NOMBRE_MAX = 3;

type Capture = { donnees: string; apercu: string };

// Réduit une capture d'écran de téléphone (JPEG, 1600 px au plus) : la
// demande reste légère et le texte de la conversation reste lisible.
async function reduire(fichier: File): Promise<Capture> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Image illisible : essayez une capture en JPG ou PNG."));
      i.src = url;
    });
    const echelle = Math.min(1, 1600 / Math.max(img.width, img.height));
    const toile = document.createElement("canvas");
    toile.width = Math.round(img.width * echelle);
    toile.height = Math.round(img.height * echelle);
    toile.getContext("2d")?.drawImage(img, 0, 0, toile.width, toile.height);
    const apercu = toile.toDataURL("image/jpeg", 0.82);
    return { donnees: apercu.split(",")[1] ?? "", apercu };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Répondre à une conversation (LinkedIn, SMS, Messenger…) : on colle
// l'échange ou on ajoute des captures d'écran, l'agent écrit le prochain
// message selon la méthode ouverture → diagnostic → lien → proposition. Vous
// l'envoyez vous-même.
export function ReponseConversation() {
  const [conversation, setConversation] = useState("");
  const [precisions, setPrecisions] = useState("");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [texte, setTexte] = useState("");
  const [copie, setCopie] = useState(false);
  const entree = useRef<HTMLInputElement>(null);

  async function ajouter(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = [...(e.target.files ?? [])];
    e.target.value = "";
    setErreur(null);
    try {
      const nouvelles = await Promise.all(fichiers.slice(0, Math.max(0, NOMBRE_MAX - captures.length)).map(reduire));
      setCaptures((c) => [...c, ...nouvelles].slice(0, NOMBRE_MAX));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Image illisible.");
    }
  }

  async function ecrire() {
    setAttente(true);
    setErreur(null);
    setReponse(null);
    try {
      const r = await repondreConversation({
        data: {
          conversation,
          precisions,
          images: captures.map((c) => ({ mime: "image/jpeg" as const, donnees: c.donnees })),
          jeton: await jetonSession(),
        },
      });
      if (r.ok) {
        setReponse(r.reponse);
        setTexte(r.reponse.message);
      } else setErreur(r.erreur);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
    }
    setAttente(false);
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setErreur("Copie impossible : sélectionnez le texte et copiez-le à la main.");
    }
  }

  const pret = conversation.trim().length > 0 || captures.length > 0;

  return (
    <Carte className="mb-4">
      <h2 className="flex items-center gap-2 font-medium">
        <PenLine className="size-4 text-accent" /> Répondre à une conversation
      </h2>
      <p className="mt-1 text-xs text-doux">
        LinkedIn, SMS, Messenger… Collez l'échange ou ajoutez des captures d'écran : l'agent écrit le prochain message (compliment précis, question sur son
        quotidien, lien avec votre offre, proposition d'un appel). Vous l'envoyez vous-même.
      </p>
      <textarea
        className={`${champ} mt-3 min-h-28`}
        placeholder="Collez ici la conversation (du plus ancien au plus récent)…"
        value={conversation}
        onChange={(e) => setConversation(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={`${boutonSecondaire} inline-flex items-center gap-2`} disabled={captures.length >= NOMBRE_MAX} onClick={() => entree.current?.click()}>
          <ImagePlus className="size-4" /> Ajouter une capture
        </button>
        <input ref={entree} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={ajouter} />
        <span className="text-xs text-doux">{NOMBRE_MAX} captures au plus, dans l'ordre de la conversation.</span>
      </div>
      {captures.length > 0 && (
        <ul className="mt-3 flex gap-2">
          {captures.map((c, i) => (
            <li key={i} className="relative w-20 overflow-hidden rounded-lg border border-bord">
              <img src={c.apercu} alt={`Capture ${i + 1}`} className="aspect-[9/16] w-full object-cover object-top" />
              <button
                type="button"
                aria-label="Retirer cette capture"
                onClick={() => setCaptures((l) => l.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className={`${champ} mt-3`}
        placeholder="Précisions (facultatif) : architecte à Lyon, a accepté mon invitation hier…"
        value={precisions}
        onChange={(e) => setPrecisions(e.target.value)}
      />
      <div className="mt-3">
        <button type="button" className={`${bouton} inline-flex items-center gap-2`} disabled={attente || !pret} onClick={ecrire}>
          {attente ? <LoaderCircle className="size-4 animate-spin" /> : <PenLine className="size-4" />}
          {attente ? "Écriture…" : "Écrire la réponse"}
        </button>
      </div>
      <Erreur message={erreur} />
      {reponse && (
        <div className="mt-4 rounded-lg border border-bord p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pastille ton="accent">Étape : {NOMS_ETAPES[reponse.etape]}</Pastille>
            {reponse.pourquoi && <span className="text-xs text-doux">{reponse.pourquoi}</span>}
          </div>
          <textarea className={`${champ} mt-3 min-h-32`} value={texte} onChange={(e) => setTexte(e.target.value)} aria-label="Message à envoyer" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={`${bouton} inline-flex items-center gap-2`} onClick={copier}>
              {copie ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copie ? "Copié" : "Copier le message"}
            </button>
            <button type="button" className={boutonSecondaire} disabled={attente} onClick={ecrire}>
              Une autre version
            </button>
          </div>
          {reponse.suite && <p className="mt-3 text-xs text-doux">Ensuite : {reponse.suite}</p>}
        </div>
      )}
    </Carte>
  );
}
