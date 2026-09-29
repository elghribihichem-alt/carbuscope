# T53-T2 — Pilotage Tenant (tableau de bord enseigne + observatoire)

Agent : full-stack-developer (T2 Pilotage Tenant)
Date : 29-30 sept. 2026 (session)
Statut : TERMINÉ — lint 0, tsc périmètre 0, QA E2E 0 erreur console, responsive 390 OK.

## Audit préalable

Fichiers en scope, lecture intégrale :

- `src/components/portal/portal-dashboard.tsx` (223 l.) — sain mais : complétude affichée
  « 69.4 % » (point anglo-saxon, déviation FR) ; carte « activité récente » STATIQUE avec dl
  factice (« Auteur : Portail Enseigne », mention IP non stockée en base) alors que 99 traces
  réelles existent ; aucune bannière d'alertes ; aucun KPI réputation.
- `src/components/dashboard/dashboard-tab.tsx` (338 l.) + `dashboard-charts.tsx` (215 l.) +
  `dashboard-utils.ts` — SANES et RICHES : 8 fetchs (tous 200), 5 KPIs réels, carte Leaflet
  + filtre gouvernorat, fil d'alertes réel trié par priorité, 4 graphiques Recharts thémés
  via useChartPalette. Décision : micro-polish a11y uniquement (ul/li sémantique du fil),
  aucun enrichissement — aucun manque criant documenté.
- `src/components/portal/portal-view.tsx` — sain (bandeau + NotificationsCenter vivants),
  NON MODIFIÉ (la bannière vit dans portal-dashboard.tsx).
- `src/app/api/portal/stats/route.ts` — vivant, 5 champs ; extension additive autorisée par
  la consigne du round.

Routes curlées : `/api/portal/stats?brand=agil|staroil` (200, 5 champs : 1206/70.1/…/4/99 et
117/69.4/…/0/10), `/api/stats/overview?brand=agil|staroil` (200 : alerts 6c/26m/12i/44t +
alertsFeed 8 réelles), `/api/brands` (200, 6 enseignes), `/api/stats/reputation?brand=agil`
(200 : avgRating 3.8, 3063 avis — servait de référence de cohérence). Vérifs base directes :
Review.aggregate (agil 3.8/3063, staroil 3.7/293), StationHistory (fields réels :
services/statut/horaires/photo ; sources : Plateforme/Utilisateur/Enseigne/Agent terrain).

## Changements (fichier par fichier)

1. `src/app/api/portal/stats/route.ts` (+40 l.) — extension ADDITIVE STRICTE : les 5 champs
   historiques (published, completenessPct, lastSync, moderationAlerts, historyCount) sont
   inchangés (aucun renommage, aucun changement de contrat). Ajouts réels : `avgRating`
   (Review.aggregate, arrondi 0,1 — cohérent avec /api/stats/reputation), `reviewsCount`,
   `recentHistory` (8 dernières traces StationHistory avec station name/code, field,
   oldValue, newValue, author, source, createdAt).
2. `src/components/portal/portal-dashboard.tsx` (223 → ~460 l.) :
   - FIX FR : complétude « 69,4 % » via toLocaleString("fr-FR") (était « 69.4 % »).
   - NOUVEAU `PortalAlertsBanner` (pattern T52-R1 sa-overview-alertes répliqué) : fetch
     /api/stats/overview?brand=, dérive comptes critiques/moyens/info + alerte la plus
     urgente (sortByPriority), chip navigante « Veille (44) » → setNav("espace",
     "observatoire") + setTab("veille"), masquage session (X), rien rendu si zéro alerte
     OU erreur réseau, role="status" aria-live="polite", rouge si critiques sinon ambre,
     cibles min-h-11.
   - KPI ADDITIF « Note moyenne des avis » (5e carte, grille 2/3/5 cols comme le TDB G1) :
     valeur « 3,7 / 5 » réelle + « 293 avis clients cumulés », ton success ≥ 4 / warning
     < 3, clic → onglet « Avis & réputation » (pTab pattern).
   - Carte « activité récente » VIVANTE : liste réelle des 8 dernières traces
     (max-h-96 overflow-y-auto, scroll stylée webkit + scrollbar-width:thin, scrollHeight
     665 > clientHeight 307 vérifié en QA), badge champ FR (services/statut/horaires/photo),
     statuts traduits via STATUS_LABELS (Active → En rénovation…), ancienne valeur barrée →
     nouvelle, auteur + source, date relative avec title absolu ; état vide propre ;
     carte « Chaque modification est tracée » recentée sur le VRAI contenu des traces
     (champ, valeurs, auteur, source — l'ancienne mention « IP » n'est pas en base) ;
     note émeraude historique conservée.
   - Types étendus LOCALEMENT (PortalStatsExt, PortalHistoryItem) — src/lib/types.ts protégé
     (pattern T52-R1), champs optionnels → tolérants aux réponses sans extension.
   - TOUT l'existant inchangé : 4 KPIs d'origine, workflow 5 étapes, en-têtes de cartes.
3. `src/components/dashboard/dashboard-tab.tsx` — micro-polish a11y uniquement : le fil
   d'alertes devient une liste sémantique (ul aria-label + li par AlertRow), ZÉRO changement
   visuel (CardContent grid conservé). dashboard-charts.tsx / dashboard-utils.ts /
   portal-view.tsx : NON MODIFIÉS.

## QA E2E (session agent-browser t53t2, zombies tués avant/après)

- Login Anis Ferjani (Staroil) → G3 « Tableau de bord enseigne » : bannière
  « 6 alertes critiques · 26 moyennes · 12 infos — plus urgente : "Changement d'enseigne :
  Shell → Indépendants à Sahline" (il y a 5 jours) », 5 KPIs (117, 69,4 %, il y a 13 j,
  3,7/5 · 293 avis, 0), liste réelle 8 traces (Staroil Menzel Temime 1 Horaires
  07h–20h → 06h30–21h30, Portail Enseigne · Plateforme…), 0 erreur.
- Chip « Veille (44) » → veille concurrentielle observatoire (44/6/26/12) ✓, 0 erreur.
- KPI note moyenne → « Avis & réputation » (Réputation en ligne — Staroil, 3.7/5 · 293
  avis — cohérence KPI ↔ module confirmée) ✓.
- Masquage bannière (X) → disparaît, réapparaît au remontage d'onglet (session) ✓.
- G1 « Dashboard » observatoire : rendu identique + liste sémantique, 0 erreur, capture.
- G1 « Interactive map » : rendu vérifié (FILTRES/recherche/canvas), 0 erreur.
- Bascule enseigne Agil (header) : 1206/70,1 %/note 3,8/3063 avis/4 alertes modération
  (tone danger), 0 erreur, capture desktop.
- Viewport 390×844 + reload : scrollWidth 390 = clientWidth 390 (desktop 1440 = 1440),
  Sheet menu mobile → G3 rendu (bannière + KPIs + liste), 0 erreur.
- Dark mode : toggle + capture, 0 erreur.
- Aucune mutation serveur en QA (lecture seule + navigation client uniquement ; les
  événements d'audit SECURITE de connexion restent au journal = comportement normal).

Vérifications : `bun run lint` → 0 erreur projet ; `bunx tsc --noEmit` → 0 erreur périmètre
T2 (140 erreurs globales préexistantes inchangées, dont 6 dans api/portal/ai/route.ts non
touché) ; serveur 200.

Captures : qa-t53-t2-portail-dashboard.png, qa-t53-t2-portail-dashboard-agil.png,
qa-t53-t2-observatoire-dashboard.png, qa-t53-t2-mobile-390.png, qa-t53-t2-dark.png.

## Verdicts / limites pour les rounds suivants

- dashboard-tab observatoire : NE PAS enrichir sans nouveau besoin documenté — module déjà
  exemplaire ; la voie d'enrichissement la plus naturelle (KPIs réputation) est déjà couverte
  par PortalReviews côté G3.
- La convention « PortalStatsExt champs optionnels » permet à d'autres composants de
  consommer avgRating/reviewsCount/recentHistory sans casser les anciens consommateurs.
- api/portal/ai/route.ts porte 6 erreurs tsc préexistantes (modèles Prisma fantômes) —
  candidat à arbitrage dans un futur round de purge (hors périmètre T2).
- Le fil d'alertes de la bannière est NATIONAL (veille concurrence, toutes enseignes) :
  c'est le comportement du module veille, pas un bug — un filtrage « impactant mon enseigne »
  serait un enrichissement à arbitrer séparément.
