# T53-T3 — Réseau & marché Tenant (G2 observatoire : Mes stations · Prix & marges · Veille)

Agent : full-stack-developer (round T53-T3) · Date : 30/09/2026 · Gel souple SA actif, routes API protégées (lecture seule).

## 1. AUDIT (fichiers + routes curlées + écrans visités AVANT codage)

### Routes curlées (contrats réels, aucune modifiée)
- `GET /api/stations?brand=staroil&limit=400` → 200 (120 stations, `total`, champ services/rating/reviewsCount/photoUrl/verifiedBy)
- `GET /api/stations/[id]` → 200 — **reviews ≤ 12 AVEC `replyText`/`repliedAt`/`repliedBy`**, history ≤ 20, nearby ≤ 8 + `distanceKm`
- `GET /api/prices` → 200 (current 3 carburants + history décrets + totals.lastChangeAt/nextReviewLabel) ; sous-dossier `[id]` non consommé par l'onglet
- `GET /api/alerts?limit=60` → 200 (44 alertes ; param `severity` supporté ; champs `read`/`stationCode` servis)
- `GET /api/movements?limit=200` → 200 (175 mouvements)
- `GET /api/stats/movements` → 200 — **`byBrand` (6 enseignes × ouvertures/rénovations/fermetures) servi mais NON consommé par l'UI**
- `GET /api/relances?brand=staroil&seuil=7` → 200 (2 fiches, kpis) — **BUG de périmètre : `kpis.total` = 2 905 compté SANS filtre enseigne (national) alors que `overdue`/liste sont brand-scoped**
- `GET /api/brands` → 200 (6 enseignes) ; `GET /api/stats/overview` 200 (déjà T2)
- Dossiers listés : `api/{alerts,brands,calculations,competition,contributions,demographie,field-agents,governorats,missions,mobile,movements,notifications,portal,prices,projects,relances,reports,reviews,roads,route.ts,services,shadow,stations,stats,super,watchlist-alerts}`

### Fiches par fichier
| Fichier | Verdict |
|---|---|
| stations-tab.tsx (716 l.) | **SAIN et riche** — sous-onglets avec compteurs, recherche accents-neutralisés (normalizeFr), filtre gouvernorat, 9 tris, pagination 20/p, exports CSV/Excel/PDF (BOM « ; » + vue imprimable), comparateur 2-4 câblé, cartes mobile. Écart : boutons d'action des cartes mobile h-8 (< cible tactile h-11). Slate du bloc `.cs-print` = intentionnel (papier blanc). |
| station-detail-dialog.tsx (339 l.) | **MANQUE criant** — `replyText/repliedBy/repliedAt` servis par l'API mais JAMAIS affichés (le module Avis & réputation les affiche, pattern émeraude existant) ; titre « Avis récents » sans compteur ; slice(0,3) dans un conteneur déjà scrollable (max-h-64) → scroll inutile. |
| station-form-dialog.tsx (357 l.) | **SAIN** — diff PATCH (historique auto), validations lat/lng Tunisie, compteurs services. Rien à corriger. |
| station-compare-dialog.tsx (324 l.) | **SAIN mais dark mode manquant** — WinnerMark, badges 24h/7j, pilules services/score, « Meilleur profil », bloc synthèse ambre : tous sans variantes `dark:` (chips claires collées en thème sombre). |
| service-chip.tsx (55 l.) | **SAIN**. Intact. |
| prices-tab.tsx (837 l.) | **SAIN et très riche (T22)** — 2 écarts : ticks axe Y `toFixed(2)` avec point anglo-saxon (« 2.65 ») ; bouton « Noter ce scénario » qui ne sauvegarde RIEN (toast mensonger « Scénario marge copié »). |
| veille-tab.tsx (171 l.) | **SAIN mais manque** — `stats.byBrand` (données réelles 12 mois) non exploité. |
| alerts-timeline.tsx (192 l.) | **SAIN** — chips de type SANS compteurs (idée candidate du brief) ; recherche `toLowerCase` SANS neutralisation d'accents (« renovation » ne trouvait pas « Rénovation »). |
| movements-history.tsx (166 l.) | **SAIN** — même recherche sans neutralisation d'accents. |
| relances-card.tsx (329 l.) | **SAIN en UI** — KPI « sur 2905 stations actives » trompeur (dénominateur national, bug route — protégée). |

### Écrans visités avant codage (session t53t3, login Anis Ferjani → Staroil → Brand portal → FR)
Stations (recherche « La Marsa » OK, fiche La Marsa, comparateur 2/4), Prix (cartes, toggle carburants, simulateur, registre), Veille (timeline 44, filtre Ouverture → 7, relances J+7 → 2 fiches). 0 erreur console partout. 390×844 : 390 vs 390 sur les 3 onglets dès l'audit.

## 2. CHANGEMENTS (additif strict, zéro casse, données 100 % réelles)

1. **station-detail-dialog.tsx** — ① `ReviewRow` affiche désormais la **réponse officielle de l'enseigne** (bloc émeraude `border-l-2`, MessageSquareReply, « Réponse officielle · {repliedBy} · {date} » — pattern du module Avis & réputation) + badge « Répondu ». ② Titre « Avis récents (N) ». ③ slice 3→6 avis + note « 6 avis affichés sur N — voir l'onglet Avis & réputation » si >6 (défensif ; DB actuelle = ≤3 avis/station servis).
2. **stations-tab.tsx** — boutons Fiche/Modifier/Carte des cartes mobile h-8 → **h-11** (cible tactile convention app ; ~+38 % de surface). Rien d'autre : module déjà exemplaire.
3. **station-compare-dialog.tsx** — variantes `dark:` ajoutées (WinnerMark, badges 24h/7j, pilule services, pilule score, « Meilleur profil », bloc synthèse ambre) — cohérent avec le reste de l'app.
4. **prices-tab.tsx** — ① ticks axe Y en virgule FR (« 2,65 »). ② « Noter ce scénario » → **« Copier le scénario »** avec copie RÉELLE au presse-papiers (résumé 6 lignes : trafic, plein, part, marges réglementaires, volume, marge/an) + repli toast si Clipboard indisponible.
5. **veille-utils.ts** — helper `normalizeFr` (pattern stations) partagé.
6. **alerts-timeline.tsx** — ① **compteurs sur les chips de type** (7/6/12/11/8 sur 44 réelles, `aria-label` explicite). ② recherche accents-neutralisés.
7. **movements-history.tsx** — recherche accents-neutralisés.
8. **veille-tab.tsx** — carte additive **« Mouvements par enseigne — 12 derniers mois »** consommant `stats.byBrand` (zéro fetch supplémentaire) : tableau compact (Ouvertures/Rénovations/Fermetures/Solde net +/−, ligne « Votre réseau » émeraude pour l'enseigne connectée résolue via /api/brands, total marché en tfoot, max-h-96, scroll horizontal ≤420px après contrôle VLM mobile). Fix lint : NetCell sorti du corps de composant (react-hooks/static-components).
9. **relances-card.tsx** — libellés KPI honnêtes : « sur 2 905 stations actives (toutes enseignes) » et « au seuil J+7 · base nationale » + commentaire documentant le bug de périmètre côté route (protégée).

## 3. QA E2E (session unique t53t3, zombies tués avant, session fermée + pkill après)

- Login Anis Ferjani (Staroil) → Brand portal → FR → **Mes stations** : fiche La Marsa → **réponse officielle « Équipe Staroil · 04 sept. 2026 » affichée** + badge Répondu + compteur (1) ; fiche Ariana (3 avis servis dont 1 réponse Ola Energy — données seed réelles affichées telles quelles) ; comparateur 2/4 (clair + capture, dark + capture, VLM : « contraste excellent, aucun chevauchement »).
- **Prix & marges** : ticks Y « 0,55 / 1,10 / 1,65 / 2,20 / 2,75 » ✓, « Copier le scénario » → toast « Scénario copié dans le presse-papiers » ✓ (Clipboard OK en headless).
- **Veille** : chips avec compteurs 7/6/12/11/8 ✓ ; recherche « renovation » (sans accent) → **6 alertes** (0 avant fix) ✓ ; recherche « star » → 42 mouvements ✓ ; carte « Mouvements par enseigne » (Shell +13, Staroil +18 « Votre réseau », Indépendants −5, total +62 — réels) ✓ ; relances : libellés clarifiés, seuil J+30 testé ✓.
- **Mobile 390×844 + reload** : 390 vs 390 sur les 3 onglets (avant ET après fix byBrand) ; byBrand scrollable horizontalement dans sa carte (VLM : « débordement contenu, accessible par scroll, propre »).
- **0 erreur console** après CHAQUE écran (agent-browser errors → vide à chaque étape).
- **AUCUNE mutation serveur** (lecture/navigation uniquement ; vérifs base : 0 notification RELANCE, 44 alertes, 220 StationHistory — inchangés ; db/custom.db touché par housekeeping WAL SQLite uniquement).
- Captures : qa-t53-t3-stations.png, -stations-390.png, -fiche-reponse.png, -compare-clair.png, -compare-dark.png, -compare.png, -prices.png, -prices-390.png, -veille.png, -veille-390.png, -veille-dark.png, -bybrand-390.png.

## 4. Vérifications finales
- `bun run lint` → **0 erreur** projet entier (après fix NetCell).
- `bunx tsc --noEmit` → **0 erreur sur components/(stations|prices|veille)** ; 140 erreurs globales préexistantes inchangées (stock historique, dont 3 dans api/stations/route.ts protégé).
- Serveur 200 vivant, dev.log propre.

## 5. Verdicts / manques signalés à l'orchestrateur (pour T4+)
1. **BUG route /api/relances** (protégée ce round) : `kpis.total`/`freshnessRate` calculés sur TOUTES les enseignes alors que la liste est brand-scoped → KPIs de fraîcheur incohérents pour l'enseigne. UI honnête en attendant (libellés explicites) ; correctif un jour côté route : ajouter `brandId` au `db.station.count`.
2. `reviewsCount` des stations (ex. 24) ≠ avis réellement en base par station (≤ 3 servis) — écart seed à arbitrer.
3. `/api/prices/[id]` existe et n'est consommé par aucun écran G2 (à arbitrer).
4. AlertDTO porte `read`/`stationCode` non exploités (pas de route de mutation d'alerte → rien à faire côté UI sans API).
5. La zone de réponse dans les fiches peut provenir d'une autre enseigne (seed : « Équipe Ola Energy » répond à un avis d'une station Staroil) — affiché tel quel (données réelles), à arbitrer côté data.
6. Idées non réalisées par prudence (module déjà riche) : compteurs sur le Select sévérité, export CSV du filtre alertes (timeline déjà filtrable + KPIs de synthèse), critères d'avis (propreté/accueil/…) dans la fiche.
