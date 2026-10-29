# Serveur MCP Amat : Google OAuth et liste blanche (Cloudflare Worker)

Ce Worker expose le serveur MCP Odoo d'Amat (`https://mcp-amat.nasta-univers.com/mcp`) aux connecteurs MCP distants de Claude (Team/Enterprise). Chaque utilisateur s'authentifie individuellement avec Google. Seuls trois comptes peuvent obtenir un accès :

- `bangaly@nasta-univers.com`
- `aissata@nasta-univers.com`
- `talby@nasta-univers.com`

Il est construit sur le modèle `remote-mcp-google-oauth` du dépôt Cloudflare AI et sur [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) 1.2.4.

```
Claude ──OAuth 2.1 + PKCE──▶ Worker (/authorize, /token, /register)
                               │  consentement, puis Google (OIDC + PKCE)
                               │  e-mail vérifié + liste blanche ─▶ jeton MCP
Claude ──Bearer <jeton MCP>──▶ Worker /mcp ──X-Access-Token (secret)──▶ Nginx ▶ mcp-odoo-amat
```

## Contrôles de sécurité

**Authentification (`src/google-handler.ts`, `src/access.ts`)**

- Le flux utilise les primitives de la bibliothèque OAuth : `parseAuthRequest`, `beginConsent`, `approveConsent`/`denyConsent`, `beginUpstream`, `finishUpstream` et `completeAuthorization`. La requête d'autorisation est conservée côté serveur, chiffrée, à usage unique, valable dix minutes et liée au navigateur par un cookie `__Host-`. Le formulaire ne transporte qu'un identifiant opaque, jamais la requête elle-même.
- Le `redirect_uri` doit être celui de Claude (`https://claude.ai/api/mcp/auth_callback` ou `https://claude.com/api/mcp/auth_callback`). Un client enregistré via `/register` avec une autre adresse est refusé avant toute redirection vers Google.
- Google est interrogé en OpenID Connect (`openid email profile`) avec PKCE S256. Le code est échangé côté serveur avec le secret client. L'identité est lue sur l'endpoint `userinfo` de Google et jamais dans un paramètre, un en-tête ou un cookie fourni par le navigateur.
- `email_verified` doit valoir exactement `true`. L'adresse est normalisée (espaces retirés, minuscules) puis comparée **exactement** à la liste blanche. Ni `HOSTED_DOMAIN` ni le paramètre `hd` ne sont utilisés.
- Cette vérification a lieu **avant** `completeAuthorization`. Un compte refusé reçoit une page 403 : aucun grant, aucun code et aucun jeton n'est créé.
- Le jeton d'accès Google n'est pas conservé. Les `props` du jeton MCP contiennent seulement `sub`, `email` et `name`.
- Les jetons MCP sont liés à `MCP_RESOURCE` (RFC 8707/9728). La bibliothèque rejette avec un 401 tout jeton absent, inconnu, expiré ou destiné à une autre ressource, avant d'appeler le relais.
- La page de consentement s'affiche à **chaque** autorisation, aucun consentement n'est mémorisé. Elle avertit de refuser un lien d'autorisation reçu d'un tiers. Un utilisateur non autorisé ne peut donc pas faire valider silencieusement son propre lien par un utilisateur autorisé.
- La page de consentement interdit l'intégration en iframe (CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`), n'est pas mise en cache et échappe tout contenu fourni par le client. Chaque cookie part dans son propre en-tête `Set-Cookie`.
- Les journaux ne contiennent ni jeton, ni code, ni secret. Un test le vérifie. Les « invocation logs » de Workers sont désactivés, car ils enregistreraient l'URL `/callback` qui contient le code Google.

**Relais (`src/amat-relay.ts`, `src/mcp-policy.ts`)**

- La liste blanche est revérifiée à chaque requête. Retirer un compte de `ALLOWED_EMAILS` puis redéployer coupe son accès immédiatement, sans attendre l'expiration de son jeton.
- La destination est fixe : `AMAT_MCP_URL` doit valoir exactement `https://mcp-amat.nasta-univers.com/mcp` (ou la même adresse avec `/` final). Sinon le relais répond 500 et n'envoie rien. L'URL de la requête cliente n'influence jamais la destination.
- `X-Access-Token` est ajouté côté serveur à partir du secret `AMAT_ACCESS_TOKEN`. Seuls `Accept`, `Content-Type`, `Last-Event-ID` et les en-têtes `Mcp-*` du client sont transmis. `Authorization`, `Cookie`, `Origin`, `X-Access-Token` client et tous les autres en-têtes restent dans le Worker.
- Les redirections ne sont jamais suivies (`redirect: "manual"`) et sont transformées en 502. Un 401 ou 403 d'Amat (secret refusé) devient aussi un 502, pour que Claude ne le confonde pas avec un problème de son propre jeton. Les autres erreurs 5xx deviennent un 502 générique, sans le corps d'Amat. Les réponses portent toujours `Cache-Control: no-store`.
- Limites : corps de requête 1 Mio, réponse 10 Mio, 120 s par POST/DELETE, 300 s par flux GET. Une réponse qui annonce une taille supérieure est refusée (502). Un flux qui dépasse une limite en cours de route est fermé proprement et la réponse amont est annulée.
- **Lecture seule** : seuls les outils de lecture de `READ_ONLY_TOOLS` peuvent être appelés (`search_records`, `get_record`, `list_models`, `get_fields`, `aggregate_records`, `list_resource_templates`, `get_current_context`, `read_attachment`, `list_record_attachments`). Un appel à un autre outil (`create_record`, `update_record`, `delete_record`, `post_message`, `upload_attachment`, etc.) reçoit une erreur de lecture seule et n'est jamais transmis. Ces outils sont aussi retirés des réponses `tools/list`, en JSON comme en SSE. Cette règle s'ajoute aux droits du serveur Odoo, elle ne les remplace pas.
- Seules les méthodes MCP de `ALLOWED_RPC_METHODS` sont transmises, plus les notifications et les réponses. Toute autre méthode reçoit « Method not found ».
- Le corps transmis à Amat est le JSON ré-sérialisé, exactement celui qui a été vérifié. Une clé dupliquée ne peut donc pas être lue autrement par l'analyseur JSON Python. Un nombre que JavaScript ne représente pas exactement fait refuser la requête.

## Fonctionnement du relais MCP

Le serveur Amat (mcp-server-odoo, SDK MCP Python) utilise le transport **Streamable HTTP** : POST pour les messages du client, GET pour le flux d'événements du serveur, DELETE pour terminer une session, et l'en-tête `Mcp-Session-Id` pour identifier la session. Ce transport est du HTTP ordinaire, il peut donc être relayé sans réimplémenter le protocole :

- **POST** : le corps est lu (1 Mio maximum) et validé comme message ou lot JSON-RPC 2.0, la politique de lecture seule est appliquée, puis le JSON vérifié est transmis. La réponse, JSON ou `text/event-stream`, est renvoyée en flux continu, sans mise en mémoire tampon.
- **GET** : le flux SSE du serveur est relayé avec `Last-Event-ID`. Un 405 d'Amat (pas de flux autonome) est transmis tel quel.
- **DELETE** : il est transmis avec `Mcp-Session-Id`.
- **Sessions** : elles restent sur le serveur Amat. Le Worker relaie `Mcp-Session-Id` dans les deux sens, et un 404 d'Amat (session expirée) est transmis pour que le client se réinitialise.

## Configuration et déploiement

> Le déploiement n'est pas automatisé. Les commandes ci-dessous sont à lancer manuellement, après revue.

1. **Nom et URL du Worker.** Confirmez `name` dans `wrangler.jsonc` (actuellement `amat-mcp-oauth`). L'URL publique sera `https://<name>.<sous-domaine-du-compte>.workers.dev`. Le sous-domaine du compte s'affiche dans le tableau de bord Cloudflare (Workers & Pages, puis Subdomain).
2. **`MCP_RESOURCE`.** Remplacez le texte provisoire de `wrangler.jsonc` par `https://<name>.<sous-domaine>.workers.dev/mcp`. Le texte provisoire n'est volontairement pas une URL valide : le Worker refuse de démarrer tant que la valeur n'est pas renseignée.
3. **KV.** Lancez `npx wrangler kv namespace create OAUTH_KV` et reportez l'`id` affiché dans `kv_namespaces` de `wrangler.jsonc`.
4. **Client OAuth Google** (Google Cloud Console, APIs & Services, Credentials, type « Web application ») :
    - URI de redirection autorisée : `https://<name>.<sous-domaine>.workers.dev/callback`, c'est-à-dire l'origine de `MCP_RESOURCE` suivie de `/callback` ;
    - écran de consentement : périmètres `openid`, `email` et `profile`.
5. **Secrets** (jamais dans Git) :

    ```bash
    npx wrangler secret put GOOGLE_CLIENT_ID
    npx wrangler secret put GOOGLE_CLIENT_SECRET
    npx wrangler secret put AMAT_ACCESS_TOKEN   # la valeur X-Access-Token attendue par Nginx
    ```

6. **Déploiement**, après validation : `npx wrangler deploy`.
7. **Claude** : dans les paramètres de l'organisation, ajoutez un connecteur personnalisé avec l'URL `https://<name>.<sous-domaine>.workers.dev/mcp`. Chaque utilisateur se connecte ensuite avec son compte Google.

## Développement et tests

```bash
pnpm install --filter remote-mcp-google-oauth   # depuis la racine du dépôt (espace de travail pnpm)
cp .dev.vars.example .dev.vars   # MCP_RESOURCE=http://localhost:8788/mcp, plus des identifiants de développement
npx wrangler dev                 # http://localhost:8788
npm run test:ci                  # tests Vitest exécutés dans workerd (miniflare)
npm run type-check
```

Les tests simulent Google et le serveur Amat. Ils n'utilisent aucun service réel ni aucun identifiant réel. Le flux complet Claude → Google → Amat ne peut être validé qu'après déploiement.

En local, seuls les `redirect_uri` de Claude sont acceptés. Pour tester avec MCP Inspector, il faut ajouter temporairement son adresse de rappel dans `ALLOWED_REDIRECT_URIS`, sans commiter cette modification.

## Modifier les accès

- **Utilisateurs autorisés** : `ALLOWED_EMAILS` dans `src/access.ts`, puis commit et déploiement.
- **Outils autorisés** : `READ_ONLY_TOOLS` dans `src/mcp-policy.ts`. N'y ajoutez que des outils de lecture. Un outil que le serveur Amat ajouterait plus tard reste bloqué tant qu'il n'a pas été ajouté ici.

## Points à confirmer

- **Google Workspace** : si `nasta-univers.com` est un domaine Google Workspace, exiger en plus la revendication `hd === "nasta-univers.com"` renforcerait la vérification. Seraient alors exclus un compte Google personnel créé avec la même adresse ou un ancien compte « en conflit ». Ce contrôle n'est pas activé, car il bloquerait tout le monde si le domaine n'est pas sur Workspace.
- **Abus anonymes** : `/register` et `/authorize` écrivent dans KV sans authentification. Sur l'offre Workers Free (1 000 écritures KV par jour), un flot de requêtes peut épuiser le quota et bloquer les connexions jusqu'au lendemain. Une offre payante, ou une liaison Workers Rate Limiting, limite ce risque.
- **Sessions MCP** : elles ne sont pas liées à l'utilisateur OAuth. Les trois comptes partagent la même identité Odoo côté Amat, l'impact est donc limité.
