import { Link, createFileRoute } from "@tanstack/react-router";
import { PageLegale } from "@/components/Vitrine";
import { EDITEUR } from "@/lib/editeur";

export const Route = createFileRoute("/suppression-donnees")({
  head: () => ({ meta: [{ title: `Suppression des données · ${EDITEUR.produit}` }] }),
  component: Suppression,
});

// Page exigée par Meta (« Data Deletion Instructions URL ») et utile pour tous.
function Suppression() {
  return (
    <PageLegale titre="Suppression de vos données">
      <p>Vous pouvez supprimer à tout moment tout ou partie des données liées à votre compte {EDITEUR.produit}.</p>

      <h2>Retirer un réseau social</h2>
      <ul>
        <li>Connectez-vous, ouvrez la page Comptes et cliquez sur « Retirer » sur le réseau concerné.</li>
        <li>Le jeton d'accès à ce réseau est effacé immédiatement.</li>
        <li>
          Vous pouvez aussi révoquer l'accès côté réseau. Pour Facebook : Paramètres et confidentialité → Paramètres → Applications
          et sites web → {EDITEUR.produit} → Supprimer. Pour Instagram : Paramètres → Applications et sites web.
        </li>
      </ul>

      <h2>Supprimer votre compte et toutes vos données</h2>
      <ul>
        <li>
          Connectez-vous, ouvrez <Link to="/parametres">Réglages</Link> et cliquez sur « Supprimer mon compte ».
        </li>
        <li>
          Sont effacés immédiatement et définitivement : votre compte, votre fiche marque et votre stratégie, vos publications,
          images et vidéos, votre journal d'activité, vos prospects et tous les accès aux réseaux sociaux.
        </li>
      </ul>

      <h2>Sans accès à votre compte</h2>
      <p>
        Écrivez à <a href={`mailto:${EDITEUR.contact}`}>{EDITEUR.contact}</a> depuis l'adresse e-mail de votre compte, avec pour
        objet « Suppression de mes données ». La suppression est effectuée sous 30 jours au plus et vous recevez une confirmation.
      </p>
    </PageLegale>
  );
}
