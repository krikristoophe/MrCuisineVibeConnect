# API Claudimix pour le robot

Base : `https://claudimix.krikristoophe.workers.dev`. Tout est en JSON (UTF-8).
Après l'appairage, chaque appel porte `Authorization: Bearer <token>` (jeton `cmr_…`).

Le certificat de `*.workers.dev` est signé par Let's Encrypt (chaîne vers ISRG Root X2 / Root YE),
que la tablette Android 6 ne reconnaît pas : l'appli doit embarquer les racines Let's Encrypt
(ISRG Root X1, ISRG Root X2 et les racines « Gen Y ») et les ajouter aux racines du système pour ce
domaine seulement.

## Appairage

1. `POST /api/robot/pair/start` (sans corps) →
   `{ "code": "JW7WWZLU", "pollToken": "…", "url": "https://…/robot/ajouter?code=JW7WWZLU", "qr": ["0011…", …], "expiresIn": 900 }`
   `qr` : matrice du QR code de `url`, une chaîne de `0`/`1` par ligne (marge comprise). Le robot
   l'affiche (pixels noirs = `1`) avec le code en clair à côté.
2. Un membre du foyer scanne le QR code (ou tape le code) dans l'appli et confirme.
3. Le robot interroge toutes les 3 s `GET /api/robot/pair/poll?token=<pollToken>` →
   `{ "status": "pending" }`, puis une seule fois `{ "status": "paired", "robotId": "…", "token": "cmr_…", "household": "Foyer de …" }`,
   ou HTTP 410 `{ "status": "expired" }` (recommencer à l'étape 1).
4. Après l'appairage, une fois : `POST /api/robot/favorites` `{ "ids": ["web-250008", …] }` (favoris locaux).

HTTP 401 sur un appel authentifié = robot retiré du foyer : effacer le jeton et revenir à l'étape 1.

## État en temps réel

`POST /api/robot/state`, toutes les 3 s pendant une cuisson (et à chaque changement), toutes les
60 s sinon. Corps (champs absents = inconnus) :

```json
{
  "status": "idle | running | paused | finished | error",
  "recipe": { "id": "web-250008", "title": "Beurre de cacahuètes" },
  "step": { "index": 4, "total": 9, "text": "Cuire 12 min à 98 °C", "next": "Ajoutez la crème…" },
  "remainingSec": 760,
  "tempC": 98, "speed": 1, "reverse": false, "weightG": 1240, "lidClosed": true,
  "action": "Ajoutez la crème et les champignons",
  "error": null
}
```

- `finished` : envoyé à la fin d'une recette (déclenche la notification « Cuisson terminée » et
  compte la recette comme cuisinée). `action` : texte d'une action attendue de l'utilisateur
  (pesée, ingrédient à ajouter, couvercle…), `null` sinon ; un nouveau texte déclenche une notification.
- Réponse : `{ "commands": [ { "id": "…", "type": "open_recipe", "recipeId": "web-250008", "at": 1764000000000 } ] }`.
  `open_recipe` : ouvrir la fiche de cette recette sur le robot (« Envoyer au robot » depuis l'appli).

## Repas du jour

`GET /api/robot/today` → `{ "today": "2026-11-24", "meals": [ { "day": "2026-11-24", "slot": "midi | soir", "leftoverOf": null | "2026-11-23:soir", "keepNext": false, "recipe": { "id": "…", "title": "…", "image": "https://…", "totalMinutes": 25, "usesRobot": true, "category": "…" } } ] }`
(aujourd'hui et demain). À afficher sur l'accueil du robot ; toucher un repas ouvre la recette.

## Recettes

La base de recettes Claudimix (commune, modifiable dans l'appli ou par IA) remplace la synchro
Lidl. Même format JSON que la base locale du robot (`Recipe` de `android/core`).

`GET /api/robot/recipes?since=<ms>&limit=200` →
`{ "recipes": [ {…recette…} ], "deleted": ["id", …], "next": <ms> | null, "until": <ms> }`.
Tant que `next` n'est pas `null`, rappeler avec `since=next`. Garder `until` comme prochain `since`.
Synchro au démarrage puis toutes les heures.
