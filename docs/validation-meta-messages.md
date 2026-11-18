# Validation Meta : commentaires Facebook et messages privés

Objectif : que l'agent commercial réponde seul aux **commentaires Facebook** et
aux **messages privés Instagram et Facebook**. Tout est gratuit. Compter 2 à 6
semaines chez Meta pour les messages privés.

Ce qu'il faut : le **SIRET**, un justificatif (avis de situation INSEE ou
attestation URSSAF, en PDF), un ordinateur.

---

## Étape 1 : vérifier l'entreprise (15 minutes)

1. Ouvrir **business.facebook.com** → **Paramètres** → **Centre de sécurité**.
2. **Vérification de l'entreprise** → **Commencer**.
3. Nom légal, adresse, téléphone, site `https://www.btp-ecosystem.com`, **SIRET**.
4. Joindre l'avis de situation INSEE (ou l'attestation URSSAF).
5. Confirmer par le code reçu (téléphone ou e-mail du domaine).

Réponse de Meta : quelques jours en général.

## Étape 2 : ajouter les autorisations à l'app (10 minutes)

1. **developers.facebook.com** → **Mes apps** → **Agent IA Live**.
2. **Cas d'usage** → ajouter (ou **Personnaliser**) :
   - **Gérer tout sur votre Page** : cocher `pages_read_user_content` et `pages_manage_engagement` ;
   - **Interagir avec les clients sur Messenger** : cocher `pages_messaging` ;
   - **Instagram** (API avec connexion Instagram) : vérifier que `instagram_business_manage_messages` et `instagram_business_manage_comments` sont cochés.
3. Enregistrer.
4. **Prévenir Claude** : il ajoute ces autorisations à la connexion de l'agent.
   Ensuite, sur la page **Comptes** de l'Agent IA Live, **reconnecter Facebook**
   et **Instagram** pour accepter les nouveaux droits.

Dès cette étape, l'agent devrait pouvoir lire les commentaires de **votre**
page Facebook (votre compte a un rôle dans l'app). Les messages privés
d'inconnus attendent l'étape 3.

## Étape 3 : demander la validation (30 minutes + la vidéo)

**Où** : app → **Contrôle app** → **Demander des autorisations avancées**,
pour chacune des autorisations ci-dessous. Coller le texte (en anglais) et
joindre **la même vidéo**.

- `pages_read_user_content`, `pages_manage_engagement` :
  > Agent IA Live reads new comments on the user's own Facebook Page posts and answers them on the Page's behalf, following the business profile the user wrote (products, prices, tone). Questions about prices, limits or data are never answered automatically: the AI drafts a reply that the user reviews.
- `pages_messaging` :
  > When a person sends a message to the user's Facebook Page, Agent IA Live replies within Messenger's 24-hour window, in the person's language, using the business profile the user wrote. The assistant never starts a conversation: it only answers people who wrote first.
- `instagram_business_manage_messages` :
  > When a person sends a direct message to the user's Instagram professional account, Agent IA Live answers it within the 24-hour messaging window, using the business profile the user wrote. It never sends the first message.
- `instagram_business_manage_comments` :
  > Agent IA Live reads new comments on the user's own Instagram posts and replies to them on the account's behalf, following the business profile written by the user.

**Avant la vidéo** : Claude branche la réponse automatique aux messages privés
(à faire après l'étape 2), et le second compte qui écrit doit être ajouté comme
**testeur** de l'app (app → **Rôles de l'app** → **Testeurs**) : avant la
validation, Meta ne transmet que les messages des comptes ayant un rôle.

**Vidéo (2 à 3 minutes, sans son)**
1. Ouvrir https://agent-ia-live.vercel.app et se connecter.
2. Page **Comptes** : montrer Facebook et Instagram connectés.
3. Depuis un autre compte (un ami, un second compte), commenter une
   publication de la page, puis envoyer un message privé à la page et au
   compte Instagram.
4. Attendre le passage de l'agent (20 minutes au plus), puis montrer les
   réponses publiées sur Facebook et Instagram.
5. Page **Messages** de l'Agent IA Live : montrer les échanges et une
   réponse « à valider » (question de prix).

**Délai** : 2 à 6 semaines, parfois une demande de précision : envoyer la
réponse de Meta à Claude, il rédige la suite.
