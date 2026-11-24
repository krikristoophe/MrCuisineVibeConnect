# Claudimix — app web/mobile et API

Appli web installable (PWA) pour téléphone, tablette et ordinateur, et l'API qui la sert, sur
Cloudflare : un Worker (Hono) sert l'API et les fichiers de l'appli (Preact, Vite), avec une base D1
et un Durable Object par robot. Rien à maintenir : pas de serveur, formule gratuite.

En ligne : https://claudimix.krikristoophe.workers.dev

## Ce qu'elle fait

- **Accueil** : le robot en direct (anneau du temps restant, étape, action attendue), le prochain
  repas avec l'heure limite pour le lancer et les ingrédients à sortir, les jours à venir.
- **Semaine** : midi et soir sur 7 jours ; un repas peut servir aussi au suivant (restes midi → soir,
  soir → lendemain midi) ; liste de courses calculée.
- **Recettes** : base commune à tous les foyers, initialisée depuis le catalogue monsieur-cuisine.com
  (4 102 recettes françaises, dont 1 772 faisables sur le Connect), modifiable dans l'appli ou par IA.
  « Envoyer au robot », « Planifier », mode pas à pas pour cuisiner sans robot.
- **Favoris** du foyer, triés par recettes les plus cuisinées ou oubliées.
- **Mon compte et foyer** : connexion Google seulement, membres (invitation par lien), robots,
  notifications push (cuisson terminée, action attendue), assistants IA connectés.
- **MCP** (`/mcp`, connexion OAuth 2.1 avec le compte Claudimix : dans Claude, ajouter un connecteur
  personnalisé avec cette adresse) : chercher, lire, modifier, créer des recettes ; lire et prévoir les repas.
- **Robot** : voir [API-ROBOT.md](API-ROBOT.md) (appairage par QR code, état en temps réel,
  commandes, repas du jour, synchro des recettes).

## Développer

```bash
cd web && npm install
npx vite build && npx wrangler dev      # http://localhost:8787 (base D1 locale)
npx tsc --noEmit -p .                   # types
```

Secrets locaux dans `.dev.vars` (non commité) : `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_JWK`.

## Déployer

Automatique : chaque push sur `main` qui touche `web/` lance [.github/workflows/web.yml](../.github/workflows/web.yml)
(types, build, migrations D1, déploiement). Secrets GitHub : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
Secrets du Worker (`wrangler secret put`) : `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_JWK`.

À la main : `npm run deploy`.

## Recettes : import

`scripts/import_robot_db.py` génère le SQL d'import depuis la base d'un robot (`recettes.db`) ou un
export du catalogue complet (`android/core/src/test/kotlin/app/toque/core/CatalogExport.kt`, une
recette JSON par ligne). Les recettes déjà présentes ne sont pas écrasées. Les fichiers générés
contiennent du contenu Lidl : ne jamais les commiter.
