# T54-Ca — Carte des TMP + Gestion des Services + Base Clients TMP (Module 2, volets 1-3/5)

Agent : full-stack-developer · Round : T54-Ca (volets C1-carte, C2-services, C2-clients)

## Contexte lu avant intervention

- `worklog.md` : entrées T54-A0 (plan canonique, 5 règles, palette, discipline), T54-A1 (socle data : 9 MobilityHub, 45 HubService, 350 HubVehicle, 500 HubIntervention, 900 HubConversion), T54-A2B1 (coque hub-module.tsx + nav.hubs + module-soon), T54-B2/B3a/B3b (patterns API/radar/franchise, AuditEvent, QA).
- Assets réutilisés (zéro réinvention) : Leaflet via `dynamic(ssr:false)` pattern tunisia-map→osm-map (tuiles Esri jour/nuit, bounds Tunisie, attribution bottom-left) ; `requireSessionOr401`/`resolveBrandSession` style de `src/app/api/radar/_lib.ts` + `franchise/_lib.ts` ; `logAudit` (module→kind HUBS) ; export CSV T52-R2b (BOM `\uFEFF`, `;`, `\r\n`) ; table + pagination + debounce 300 ms (tab-points-list) ; Sheet/Dialog/AlertDialog/Select/Tabs/Switch shadcn ; toasts sonner ; `num`/`Intl` de `src/lib/chart` ; Skeleton/TabSkeleton/ErrorState.

## Livré (strictement additif)

### API /api/hubs/* (session enseigne — 401 sinon, PII clients)

- `_lib.ts` : HUBS_WRITE_ROLES (SUPER_ADMIN/ADMIN/NETWORK/COMMERCIAL/DG — miroir sidebar + SA), requireHubSession, 8 catégories, segments, HUB_STATUS_RANK, normalizeFr serveur, CLIENTS_PAGE_SIZE=20, estimatedRevenueByVehicle (groupBy interventions non annulées).
- `route.ts` GET : 9 hubs + servicesCount/activeServicesCount/bookingsThisMonth (inclusion JS des 45 services, tri statut→code).
- `services/route.ts` : GET ?hubId (tri catégorie→nom) · POST (catégorie 8, nom 2-80, prix ≥ 0/null vente libre, capacité entière ≥ 1, statut initial ACTIVE|PAUSED) · PATCH (name/price/capacity/status ; guard 400 FR sur CLOSED « définitif » ; transitions ACTIVE↔PAUSED libres, →CLOSED définitif ; catégorie structurelle non modifiable V1 documenté) · AuditEvent HUBS sur chaque mutation.
- `clients/route.ts` : GET liste paginée 20/page (hubId/segment Prisma + q NFD plaque/client/tél/marque/modèle en mémoire, tri lastVisit desc) + `stats` du JEU FILTRÉ (total/répartition/avgVisits) + CA est. par véhicule · GET ?vehicleId → fiche + 50 interventions (service/hub inclus, scheduledAt desc) + totalRevenue sur l'ensemble · PATCH { id, segment } (400 si identique) + audit.
- `clients/export/route.ts` : CSV FR filtres courants (BOM, `;`, CRLF, virgules décimales, dates jj/mm/aaaa, X-Rows-Count) — `clients-tmp-YYYY-MM-DD.csv`.

### Frontend (src/components/hubs/)

- `hub-shared.tsx` (socle) : types DTO, MAPPING BADGES documenté en tête (LAVAGE émeraude/VIDANGE ambre/PNEUS terracotta/RECHARGE émeraude plein/BOUTIQUE zinc outline/CAFÉ ambre clair/LAVERIE zinc/RELAIS émeraude outline ; véhicules UTILITAIRE zinc/BERLINE émeraude/SUV ambre/POIDS_LOURD terracotta/ÉLECTRIQUE émeraude plein + Zap ; segments FIDÈLE/RÉGULIER/NOUVEAU ; statuts hub/intervention), GOVS_24, dateFr/relativeDateFr (Intl RTF)/kdt/priceFr/durationFr/pctFr/normalizeFr + composants Badge.
- `hub-map.tsx` : MapContainer bounds Tunisie, tuiles Esri street/noir (auto via next-themes), CircleMarker statut (ACTIVE #059669 plein · CONSTRUCTION #d97706 · PLANNED zinc contour tirets), radius ∝ dailyVehicles (8→22 px), popup FR (nom, code mono, statut, véh./j), flyTo sélection, légende cartouche (3 statuts + note rayon).
- `hub-carte.tsx` : 4 KPIs (hubs actifs 6/9, 11 380 véh./j, 882,5 kDT, prochaine ouverture BIZ-01) · split lg 2/1 (carte h-420/520 arrondie + panneau 3 Selects h-11 + liste 9 cartes cliquables max-h-96 scrollbar fine) · Sheet détail (identité 6 tuiles, 3 KPI, mini-table services max-h-72, boutons h-11 « Gérer les services »/« Base clients » → nav.hubsSel + nav.hubs).
- `hub-services.tsx` : sélecteur 9 cartes horizontales scrollables (présélection nav.hubsSel) · 4 KPI hub · table triable 5 colonnes + mini jauge remplissage (réserv./(cap×30), tons émeraude/ambre/terra) · actions h-11 w-11 Modifier/Pause|Reprendre/Clôturer (AlertDialog « définitif ») · Dialog création/édition remonté par clé (diff-only en PATCH) · toggle « Grouper par catégorie » (sections badge+count).
- `hub-clients.tsx` : 5 KPIs du jeu filtré · filtres hub/segment/recherche débouncée 300 ms accent-insensible + Réinitialiser · table 20/page (plaque mono, client+tél, véhicule, type badge, segment, visites, dernière visite relative, CA est.) · pagination Précédent/Suivant h-11 · Sheet détail (fiche 4 tuiles, segment Select+Enregistrer h-11 → PATCH + refresh discret des stats, historique 50 interventions max-h-96 scrollbar fine + total CA + note « est. ») · Exporter CSV (blob + toast).
- `hub-module.tsx` (+42/-38 additif) : 3 TabsContent réels (preselect={nav.hubsSel}), 2 Bientôt conservés (analytics/parametres), badge « Carte · Services · Clients actifs ».

## QA E2E (une session agent-browser, navigateurs tués avant, 30 captures qa-t54-ca-*)

- curl : 401 sans session · login Sonia (ADMIN agil) · GET /api/hubs 9 hubs+counts · services GET/POST/PAUSED→ACTIVE→CLOSED + guards 400 (nom 1 car., catégorie inconnue, même statut, modif après clôture) · clients GET segment/q/page + vehicleId détail + PATCH segment→→restauré + export CSV (BOM, en-têtes FR, 350/30 lignes, virgules décimales).
- Navigateur : carte (markers Esri, filtres Planifiés 2 hubs/Tunis 2 hubs, clic liste + clic marker centre → Sheet détail SSE-01 9 services + popup, handoffs services ET clients présélectionnés — MNS-01 vide honest) · services (création 28,5 DT → édition 32 DT → pause → reprise → AlertDialog clôture définitive, group-by 6 sections) · clients (recherche « rania » 3 résultats, page 2/18, Sheet historique 2 lignes + CA 146 DT, segment Fidèle→Régulier→Fidèle restauré, export CSV 13 clients filtrés téléchargé vérifié BOM/CRLF) · 390 px scrollWidth 390 sur les 3 volets · dark Espresso 3 captures · régressions : radar zones + scoring + dashboard portail + volet Bientôt analytics · 0 erreur console, 0 page error.
- Incidents documentés : dev server tué 2× par OOM (tsc/lint concurrents + session navigateur — procédure worklog appliquée : relance setsid, curl 200 avant/après).

## État DB final (audit lecture seule)

- Seeds INTACTS : 9 hubs (statuts/metrics inchangés), 350 véhicules segments exacts FIDÈLE 108/RÉGULIER 157/NOUVEAU 85, 500 interventions, 900 conversions, non-régression franchise 16 candidats/7 contrats/ZoneAlert 6/config 30-20-25-15-10.
- Résidus QA LÉGITIMES (V1 sans DELETE, documentés) : 2 services de test CLOSED « QA T54-Ca service test » (ARI-01, 33,5 DT) et « QA T54-Ca navigateur lavage express » (SSE-01, 32 DT) — HubService 45→47 (CLOSED 2) · 12 AuditEvent kind=HUBS traçant toute la session · segment du véhicule 612 SO 5352 RESTAURÉ Fidèle.

## Fichiers

- Créés : `src/app/api/hubs/{_lib,route}.ts`, `src/app/api/hubs/services/route.ts`, `src/app/api/hubs/clients/route.ts`, `src/app/api/hubs/clients/export/route.ts`, `src/components/hubs/{hub-shared,hub-map,hub-carte,hub-services,hub-clients}.tsx` (9 fichiers).
- Modifiés : `src/components/hubs/hub-module.tsx` (intégration 3 volets, additif), `db/custom.db` (mutations QA auditées).
- Lint 0 erreur (navigateur fermé) · tsc 0 erreur sur les fichiers du round (erreurs préexistantes hors périmètre uniquement).

## Finalisation (round repris — même discipline que T54-B3b)

Le round avait été interrompu avant worklog/commit (code + 30 captures QA existaient non commités). Reprise complète : audit code (9 fichiers 3 524 l. sains, zéro fichier gelé touché), sanity curl (401 sans session sur les 4 routes ; login réel Sonia ADMIN agil → GET /api/hubs 9 hubs + compteurs ; services ARI 8 ; clients 350/18 pages stats 108/157/85 ; q=rania+segment 6 résultats ; vehicleId 612 SO 5352 2 interventions CA 146 DT ; export SSE 80 lignes BOM/virgules décimales/X-Rows-Count), audit DB LECTURE SEULE (seeds intacts, 47 HubService dont 2 CLOSED QA résiduels, 12 AuditEvent HUBS, segment 612 SO 5352 restauré Fidèle), QA navigateur complémentaire 2 sessions (8 captures qa-t54-ca-31→38 : handoff « Gérer les services » vérifié SSE-01 présélectionné, handoff clients idem 80 clients 24/36/20, Sheet 612 SO 5352 historique + segment, 390 px scrollWidth 390 clair+dark, console VIDE dumps complets vierges, 0 page error), lint 2× navigateur fermé → 0 erreur, worklog.md (entrée T54-Ca), commit 4ba3e02. Dev server vivant avant/après (curl 200), aucun OOM ce round.
