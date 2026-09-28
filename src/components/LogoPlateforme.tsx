import {
  siBluesky,
  siFacebook,
  siGmail,
  siGoogle,
  siInstagram,
  siMessenger,
  siPinterest,
  siReddit,
  siSnapchat,
  siTelegram,
  siThreads,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
} from "simple-icons";

type Logo = { fond: string; encre: string; chemin?: string; lettres?: string };

// Logos officiels (simple-icons). LinkedIn et Outlook n'y figurent pas :
// on affiche leurs initiales sur leur couleur de marque.
const LOGOS: Record<string, Logo> = {
  facebook: { fond: `#${siFacebook.hex}`, encre: "#fff", chemin: siFacebook.path },
  facebook_profil: { fond: `#${siFacebook.hex}`, encre: "#fff", chemin: siFacebook.path },
  instagram: { fond: "linear-gradient(45deg,#f58529,#dd2a7b,#8134af)", encre: "#fff", chemin: siInstagram.path },
  linkedin: { fond: "#0A66C2", encre: "#fff", lettres: "in" },
  tiktok: { fond: "#111", encre: "#fff", chemin: siTiktok.path },
  x: { fond: "#111", encre: "#fff", chemin: siX.path },
  youtube: { fond: `#${siYoutube.hex}`, encre: "#fff", chemin: siYoutube.path },
  google_business: { fond: "#fff", encre: `#${siGoogle.hex}`, chemin: siGoogle.path },
  threads: { fond: "#111", encre: "#fff", chemin: siThreads.path },
  pinterest: { fond: `#${siPinterest.hex}`, encre: "#fff", chemin: siPinterest.path },
  bluesky: { fond: `#${siBluesky.hex}`, encre: "#fff", chemin: siBluesky.path },
  reddit: { fond: `#${siReddit.hex}`, encre: "#fff", chemin: siReddit.path },
  snapchat: { fond: `#${siSnapchat.hex}`, encre: "#111", chemin: siSnapchat.path },
  whatsapp_business: { fond: `#${siWhatsapp.hex}`, encre: "#fff", chemin: siWhatsapp.path },
  telegram: { fond: `#${siTelegram.hex}`, encre: "#fff", chemin: siTelegram.path },
  messenger: { fond: `#${siMessenger.hex}`, encre: "#fff", chemin: siMessenger.path },
  gmail: { fond: "#fff", encre: `#${siGmail.hex}`, chemin: siGmail.path },
  outlook: { fond: "#0078D4", encre: "#fff", lettres: "O" },
};

export function LogoPlateforme({ id, taille = 40 }: { id: string; taille?: number }) {
  const l = LOGOS[id] ?? { fond: "#252b38", encre: "#fff", lettres: id.slice(0, 2).toUpperCase() };
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-xl font-bold"
      style={{ width: taille, height: taille, background: l.fond, color: l.encre, fontSize: taille * 0.4 }}
    >
      {l.chemin ? (
        <svg viewBox="0 0 24 24" width={taille * 0.55} height={taille * 0.55} fill="currentColor">
          <path d={l.chemin} />
        </svg>
      ) : (
        l.lettres
      )}
    </span>
  );
}
