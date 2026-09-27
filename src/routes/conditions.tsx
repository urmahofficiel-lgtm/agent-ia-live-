import { createFileRoute } from "@tanstack/react-router";
import { PageLegale } from "@/components/Vitrine";
import { EDITEUR } from "@/lib/editeur";

export const Route = createFileRoute("/conditions")({
  head: () => ({ meta: [{ title: `Conditions d'utilisation · ${EDITEUR.produit}` }] }),
  component: Conditions,
});

function Conditions() {
  return (
    <PageLegale titre="Conditions d'utilisation">
      <h2>Le service</h2>
      <p>
        {EDITEUR.produit}, édité par {EDITEUR.societe}, met à votre disposition un agent d'intelligence artificielle qui prépare et
        publie des contenus sur les réseaux sociaux que vous connectez, propose des réponses aux messages et vous aide à trouver
        des prospects.
      </p>

      <h2>Votre compte</h2>
      <p>
        Vous êtes responsable de la confidentialité de vos identifiants et de l'usage fait de votre compte. Vous ne connectez que
        des comptes de réseaux sociaux que vous êtes autorisé à gérer.
      </p>

      <h2>Contenus publiés</h2>
      <p>
        Les contenus générés par l'IA peuvent contenir des erreurs. La validation avant publication est activée par défaut : vous
        restez responsable de ce qui est publié en votre nom, y compris lorsque vous désactivez cette validation. Vous vous engagez
        à respecter les règles de chaque réseau social ainsi que la loi (droit d'auteur, publicité, protection des données).
      </p>

      <h2>Prospection</h2>
      <p>
        Les prospects proposés proviennent de données publiques. Tout contact commercial que vous engagez doit respecter la
        réglementation applicable, notamment le RGPD et les règles sur la prospection électronique.
      </p>

      <h2>Disponibilité</h2>
      <p>
        Le service dépend de fournisseurs tiers (réseaux sociaux, services d'IA, hébergeurs). Nous faisons notre possible pour
        qu'il fonctionne en continu, sans pouvoir garantir l'absence d'interruption ni l'acceptation de chaque publication par les
        réseaux.
      </p>

      <h2>Résiliation</h2>
      <p>
        Vous pouvez arrêter l'agent, retirer vos réseaux ou supprimer votre compte à tout moment depuis les Réglages. Nous pouvons
        suspendre un compte utilisé de façon abusive ou contraire à ces conditions.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question : <a href={`mailto:${EDITEUR.contact}`}>{EDITEUR.contact}</a>.
      </p>
    </PageLegale>
  );
}
