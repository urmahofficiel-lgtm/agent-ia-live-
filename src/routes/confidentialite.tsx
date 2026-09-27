import { Link, createFileRoute } from "@tanstack/react-router";
import { PageLegale } from "@/components/Vitrine";
import { EDITEUR } from "@/lib/editeur";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({ meta: [{ title: `Politique de confidentialité · ${EDITEUR.produit}` }] }),
  component: Confidentialite,
});

function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <p>
        {EDITEUR.produit} est un service édité par {EDITEUR.societe} ({EDITEUR.site}). Cette page explique quelles données nous
        traitons, pourquoi, avec qui elles sont partagées et comment les supprimer.
      </p>

      <h2>Données que nous traitons</h2>
      <ul>
        <li>Votre compte : adresse e-mail et mot de passe (le mot de passe est stocké sous forme chiffrée par notre hébergeur d'authentification).</li>
        <li>Les informations sur votre activité que vous saisissez ou que l'agent lit sur le site dont vous donnez le lien.</li>
        <li>Les contenus préparés par l'agent : textes, images, vidéos, calendrier, journal d'activité.</li>
        <li>
          Les accès aux réseaux que vous connectez (Facebook, Instagram, LinkedIn…) : identifiant et nom du compte ou de la page, et
          le jeton d'accès délivré par le réseau. Nous ne recevons jamais vos mots de passe de réseaux sociaux.
        </li>
        <li>Les commentaires et messages reçus sur ces comptes, lorsque vous utilisez la page Messages.</li>
        <li>Les prospects que vous ajoutez ou que l'agent trouve à partir de données publiques (OpenStreetMap).</li>
      </ul>

      <h2>Pourquoi</h2>
      <p>
        Uniquement pour faire fonctionner le service : préparer vos publications, les publier sur les comptes que vous avez
        connectés, vous proposer des réponses et afficher le suivi en direct. Nous ne vendons pas vos données et ne les utilisons
        pas à des fins publicitaires.
      </p>

      <h2>Données des réseaux sociaux (Meta, Instagram et autres)</h2>
      <p>
        Les autorisations demandées servent à lister vos pages et comptes, à y publier les contenus que vous avez validés et à
        lire ou répondre aux commentaires et messages. Les jetons d'accès sont conservés côté serveur, dans un espace auquel ni le
        navigateur ni les autres utilisateurs n'ont accès. Vous pouvez retirer un réseau à tout moment depuis la page Comptes, ou
        révoquer l'accès depuis les paramètres du réseau concerné.
      </p>

      <h2>Sous-traitants</h2>
      <ul>
        <li>Supabase : base de données, authentification et stockage des fichiers.</li>
        <li>Vercel : hébergement de l'application.</li>
        <li>NVIDIA (NIM) : rédaction des textes et création des images par IA.</li>
        <li>Google (Gemini) : voix off des vidéos.</li>
        <li>Pexels : photos et séquences vidéo libres de droits.</li>
        <li>Meta, LinkedIn, TikTok, Google et les autres réseaux que vous connectez, directement ou via Zernio (service de publication).</li>
      </ul>
      <p>
        Les textes et informations envoyés aux services d'IA le sont uniquement pour produire le contenu demandé.
      </p>

      <h2>Durée de conservation</h2>
      <p>
        Vos données sont conservées tant que votre compte existe. Lorsque vous supprimez votre compte, elles sont effacées
        immédiatement de notre base, y compris les jetons d'accès aux réseaux.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les corriger ou les supprimer à tout moment depuis l'application. Pour la suppression
        complète, suivez la page{" "}
        <Link to="/suppression-donnees">Suppression des données</Link>. Pour toute autre demande (accès, rectification, opposition,
        portabilité), écrivez à <a href={`mailto:${EDITEUR.contact}`}>{EDITEUR.contact}</a>. Vous pouvez aussi saisir la CNIL
        (cnil.fr).
      </p>
    </PageLegale>
  );
}
