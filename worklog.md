# Worklog — Plateforme « Waze du Carburant » (CarbuScope)

Projet : Observatoire Web B2B + Portail Enseigne + Aperçu Mobile B2C + Back-office
Cahier des charges : `/home/z/my-project/upload/Cahier de cahrges d'application stations.txt`
Stack : Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui + Prisma (SQLite) + Recharts + Zustand

## Conventions globales (IMPORTANT pour tous les agents)

- **NE PAS toucher à** `src/app/page.tsx`, `src/lib/types.ts`, `src/store/app-store.ts`, `src/components/map/*`, `src/components/shell/*`, `src/app/api/*`, `prisma/*` — ces fichiers appartiennent au chef d'orchestre, sauf instructions contraires explicites.
- Couleurs interdites : **bleu/indigo**. Palette : émeraude (primaire), ambre, terracotta, prune, ardoise.
- Thème : light/dark via next-themes (classe `.dark`).
- UI 100 % en **français**.
- Charte graphique : rayon `0.625rem`, cartes `Card` shadcn, padding `p-4`/`p-6`, listes longues `max-h-96 overflow-y-auto` avec scrollbar stylée.
- Icônes : `lucide-react`. Graphiques : `recharts` + `src/components/ui/chart.tsx`.
- État global : `useAppStore` (zustand) — mode, onglet actif, enseigne connectée, rôle.
- Requêtes client : `fetch('/api/...')` chemins relatifs uniquement.

## Contrats d'API (source de vérité : src/lib/types.ts)

- `GET /api/brands` → `{ brands: BrandDTO[] }`
- `GET /api/stations?brand=&services=&status=&gouvernorat=&hours=&search=&limit=&mine=` → `{ stations: StationDTO[], total }`
- `GET /api/stations/[id]` → `{ station, reviews: ReviewDTO[], history: HistoryDTO[], nearby: StationDTO[] }`
- `POST /api/stations` (création) / `PATCH /api/stations/[id]` (édition + trace historique)
- `GET /api/stats/overview?brand=` → KPIs + fil d'alertes
- `GET /api/stats/gouvernorats?brand=` → histogramme par gouvernorat
- `GET /api/stats/services-evolution` → évolution services 5 ans
- `GET /api/stats/market-share` → part de marché par enseigne
- `GET /api/stats/movements` → mouvements 12 mois
- `GET /api/alerts?brand=&limit=` → alertes actives
- `GET /api/movements?brand=&type=&limit=` → historique mouvements
- `GET /api/competition?brand=&radius=` → KPIs concurrence + concurrents proches
- `GET /api/governorats` → stats parc auto/population
- `GET /api/roads` → axes routiers + TMJ
- `GET /api/projects` → projets d'infrastructure
- `GET/POST /api/reviews`, `GET/POST /api/reports`, `GET/POST /api/contributions`
- `GET/POST /api/calculations` → calculs sauvegardés

## Historique

---
Task ID: 1
Agent: orchestrator (Z.ai Code)
Task: Fondations de données — schema Prisma + seed 1814 stations

Work Log:
- Analyse du cahier des charges (Module A observatoire 8 onglets, B mobile, C portail enseigne, D back-office)
- Schema Prisma complet : Brand, Station, Service, StationService, StationHistory, Review, Alert, Movement, GovernoratStat, RoadAxis, InfraProject, Report, ReportSchedule, SavedCalculation, Contribution, User
- `prisma/seed.ts` : 1814 stations réparties sur 24 gouvernorats (Tunis 283, Sfax 197, Nabeul 155…), 6 enseignes (Agil 228, TotalEnergies 151, Staroil 120, Shell 100, Ola 90, Indépendants 1125), 4588 avis, 44 alertes, ~120 mouvements 12 mois, 9 axes routiers (A1-A4, RN, GP), 10 projets d'infrastructure, stats gouvernorats (population/véhicules), rapports, contributions, utilisateurs
- Exécution : `bun run db:push` + `bun prisma/seed.ts` → OK

Stage Summary:
- Base SQLite peuplée et opérationnelle. Toutes les données sont réalistes (cahier des charges §1.1 : 1814 stations, 228 Agil, etc.)

---
Task ID: 2, 3, 4
Agent: orchestrator (Z.ai Code)
Task: Socle applicatif — design system, shell, carte Tunisie SVG, API routes

Work Log:
- `src/lib/types.ts` (contrats DTO), `src/lib/geo.ts` (projection, haversine, point-in-polygon), `src/lib/serialize.ts`, `src/lib/chart.ts` (palette sans bleu)
- `src/store/app-store.ts` (zustand persist : mode, onglet, enseigne, rôle + TAB_ACCESS par rôle)
- Shell : `app-header.tsx` (sélecteurs mode/enseigne/rôle, cloche alertes, thème), `tab-nav.tsx` (8 onglets avec verrous par rôle), `app-footer.tsx` (sticky mt-auto), `kpi-card.tsx`, `badges.tsx` (Status/Severity/Impact), `loading.tsx`, `module-placeholder.tsx`, `carbuscope-logo.tsx`
- Carte : `components/map/tunisia-geo.ts` (frontière Tunisie stylisée, Djerba, Kerkennah, 22 villes, centroïdes) + `tunisia-map.tsx` (pan/zoom molette+drag, 6 couches commutables [stations, routes A1-A4, heatmap trafic, zones admin, projets infra, parc auto], fiche popup A.3.3 avec détail fetch + concurrents proches + historique, outils : mesure distance, rayon de chalandise avec slider, sélection polygone + export CSV/GeoJSON, légende enseignes) + `carte-interactive-tab.tsx` (panneau filtres : enseigne multi, services, statut, horaires, gouvernorat, recherche)
- 22 API routes : brands, services, stations (GET filtres+POST), stations/[id] (GET+PATCH+historique), stats/overview|gouvernorats|services-evolution|market-share|movements, alerts, movements, competition (saturation@5km, zones sous-desservies, concurrents proches), governorats, roads, projects, reviews (GET+POST+recalcul note), reports + reports/schedules, contributions (GET+POST+PATCH modération avec validation 3 concordances), calculations, portal/stats
- Thème : globals.css (primary émeraude, chart-1..8 sans bleu, classes .map-*, scrollbar fine, ping-slow), layout.tsx (metadata FR, ThemeProvider next-themes, SonnerToaster)
- Images générées : public/images/logo-carbuscope.png + station-1..4.jpg
- `bun run lint` : 0 erreur. Page / compile et répond 200.

Stage Summary:
- L'application squelette tourne : header + navigation + carte interactive pleinement fonctionnelle + APIs complètes. Les 10 stubs restants (dashboard, veille, stations, concurrence, calculateurs, rapports, paramètres, mobile, portail, back-office) sont des placeholders `ModulePlaceholder` à remplacer par les agents 5-a à 5-e.

### Instructions pour les agents 5-a → 5-e (LIRE ABSOLUMENT)
- Chaque agent ne modifie QUE ses dossiersassignés (voir tâches). Ne PAS toucher : page.tsx, types.ts, app-store.ts, tunisia-map.tsx, tunisia-geo.ts, carte-interactive-tab.tsx, shell/*, api/*, prisma/*.
- Export attendu = remplacer le stub existant (même nom de fichier, même nom d'export).
- Composants partagés disponibles : `KpiCard` (shell/kpi-card), `StatusBadge`/`SeverityBadge`/`ImpactBadge` (shell/badges), `TabSkeleton`/`ErrorState` (shell/loading), `TunisiaMap` + `SERVICE_ICONS` (map/tunisia-map), `useAppStore` (store/app-store), libellés dans `lib/types.ts`, `CHART_PALETTE`/`tooltipStyle` (lib/chart).
- État global : `const { brandSlug, role, setTab, setMode, setFocusStation, ... } = useAppStore()`. Enseigne connectée = brandSlug.
- API : voir liste complète + formes de réponses dans `src/lib/types.ts` (source de vérité). fetch relatifs uniquement.
- Interdits : couleurs bleu/indigo ; blue-600 etc. Palette : émeraude #059669, ambre #d97706, rouge #dc2626, prune #9333ea, or #d9a514, terracotta #e07856, ardoise #64748b.
- Recharts via composants existants ; icônes lucide-react ; toasts `sonner` (`toast.success/info/error`).
- Listes longues : `max-h-96 overflow-y-auto` (scrollbar déjà stylée).
- Style : français, cartes Card p-4/p-6, responsive mobile-first, dark-mode compatible (variables CSS).

---
Task ID: 5-a
Agent: agent-dashboard-veille (Z.ai Code)
Task: Modules A.2 « Tableau de bord » + A.7 « Veille » — dossiers exclusifs `src/components/dashboard/` et `src/components/veille/`

Work Log:
- Lecture du worklog, de `src/lib/types.ts` (contrats), `app-store.ts`, `lib/chart.ts`, composants shell (KpiCard, badges, loading) et du cahier des charges (A.2, A.7).
- `dashboard/dashboard-tab.tsx` (remplace le stub, export `DashboardTab`) :
  - En-tête « Tableau de bord — {nom enseigne} » (nom + couleur via `/api/brands`) + badge « Période : 12 derniers mois ».
  - 5 KPIs (KpiCard, responsive grid-cols-2/3/5) : stations enseigne (clic → setTab('stations')), part de marché, à rénover/sous tension (warning), trafic captif moyen (Gauge, info), alertes actives (danger, clic → setTab('veille')).
  - Carte « Empreinte territoriale » (col-span-2) : TunisiaMap mini-carte h-[340px] avec mes stations (`limit=400`) + échantillon concurrent national (`limit=600`) dédupliqués par code, `fitTo` auto (mémoïsé), Select gouvernorat client-side (re-fit + compteurs), zones layer, « Fiche complète » → setFocusStation + setTab('map').
  - « Fil des dernières alertes » : 5 alertes triées CRITICAL>MEDIUM>INFO puis date (SeverityBadge, type, date relative FR via Intl.RelativeTimeFormat + title date absolue, bouton « Voir » → veille, bouton « Tout voir »).
  - 4 graphiques (`dashboard-charts.tsx`) : BarChart empilé gouvernorats (mes stations émeraude / concurrents ardoise #94a3b8, top 12, ticks inclinés), LineChart évolution services 5 ans (6 services les plus dynamiques — tri par taux de croissance, CHART_PALETTE, légende bas), PieChart doughnut part de marché (Cell fill=row.color, total 1814 au centre, légende custom avec mon enseigne surlignée), BarChart empilé mouvements 12 mois (émeraude/ambre/rouge/prune).
- `veille/veille-tab.tsx` (remplace le stub, export `VeilleTab`) :
  - En-tête + 3 KpiCards compactes par sévérité (Critique/Moyen/Info).
  - `alerts-timeline.tsx` : chips toggle par type (5 types avec icônes lucide), Select sévérité, recherche texte, timeline verticale (ligne + points colorés par sévérité) dans ScrollArea max-h-[520px] — SeverityBadge + type + titre gras + description line-clamp-2 + dot couleur enseigne + gouvernorat + ImpactBadge + date relative + badge « Nouveau » (< 7 j) + tri priorité/date + bouton Réinitialiser.
  - Graphique mouvements 12 mois : ComposedChart — 3 Area empilées (ouvertures/rénovations/fermetures) + Line rebrandings (prune).
  - `movements-history.tsx` : Table shadxn (Date fr, Type badge coloré, Enseigne + dot, Station, Gouvernorat, ImpactBadge), 50 derniers, ScrollArea max-h-80, filtre type Select + recherche.
  - Export CSV client-side (Blob + BOM UTF-8, séparateur « ; ») + toast sonner.
- `dashboard-utils.ts` / `veille-utils.ts` : dates relatives/absolues FR, tri priorité, growthRate, styles badges mouvements, export CSV.
- Pattern lint `react-hooks/set-state-in-effect` respecté : fetch via AbortController wrappé dans setTimeout(0) dans l'effet, setStates uniquement après await ; enseigne courante dérivée au rendu (`data.brand === brandSlug` → skeleton pendant le chargement, pas de reset d'état synchrone).
- Corrections après lint/tsc : 2 erreurs set-state-in-effect (setTimeout pattern), 1 erreur TS `angle` non typé dans `tick` recharts (cast SVGProps — recharts l'applique bien au runtime, vérifié dans son code source).
- Vérifications : `bunx eslint src/components/dashboard src/components/veille` → 0 erreur ; `bunx tsc --noEmit` → 0 erreur sur mes dossiers ; GET / → 200, SSR du dashboard OK (skeleton), les 8 appels API du dashboard ont tous répondu 200 en session navigateur (dev.log, brand=totalenergies).

Stage Summary:
- Modules A.2 et A.7 livrés, denses et responsive, 100 % français, palette sans bleu (émeraude/ambre/rouge/prune/ardoise), dark-mode via variables CSS. Le tableau de bord donne la vision 10 secondes (5 KPIs cliquables + carte + fil + 4 graphiques) ; la veille couvre alertes (timeline filtrable), mouvements 12 mois (aires empilées + courbe) et historique exportable CSV. Restent aux autres agents : stations, concurrence, calculateurs, rapports, paramètres, portail, mobile, back-office (leurs dossiers).

---
Task ID: 5-c
Agent: agent-calculateurs-rapports (Z.ai Code)
Task: Modules A.6 « Calculateurs » + A.8 « Rapports » — dossiers exclusifs `src/components/calculators/` et `src/components/reports/`

Work Log:
- Lecture du worklog, de `src/lib/types.ts` (contrats), `app-store.ts`, `kpi-card.tsx`, `loading.tsx`, `lib/chart.ts`, `lib/geo.ts`, `badges.tsx`, du cahier des charges (A.6/A.8) et vérification des routes API consommées (roads, governorats, brands, stations, alerts, movements, reports, reports/schedules, calculations, stats/market-share, stats/overview).
- `calculators/calculators-tab.tsx` (export `CalculatorsTab`) : en-tête + badge compteur de scénarios, navigation secondaire en 6 cartes sélectionnables (icône + titre + description + état « Calculateur actif »), chargement parallèle Promise.all (roads/governorats/brands/calculations), gestion d'erreur ErrorState + retry, POST /api/calculations → toast + prépend, section « Scénarios sauvegardés » (label + type + date fr + bouton Recharger → restaure params/résultats via clé de remontée `key={nonce}`), import du dernier trafic captif sauvegardé vers le calculateur de rentabilité.
- `calculators/calc-shared.tsx` : définitions des 6 calculateurs (id, saveType, icône, teinte), formatage fr-FR (entiers, décimales, TND, %, km, dates), coefficients saisonniers JICA/OMMP, composants partagés (ParamsPanel, ResultsPanel aria-live, ChartBlock, SliderParam, NumberParam, SelectParam, SaveScenarioBar), helpers asNumber/asString.
- `calc-traffic.tsx` (A.6.1, type « trafic-captif ») : paramètres gouvernorat/axe (sélection d'axe → TMJ et %PL préremplis)/TMJ 2 000–60 000/%PL 5–40/distance 0–20 km/saisonnalité (Été 1,18 · Hiver 0,88 · Moyenne 1). Formules : capture VL 2,2 % → 0,4 % et PL 3,5 % → 0,8 % (linéaire sur 20 km), captif VL/PL/total × coefficient saisonnier. KPIs (captifs/jour avec sous-titre VL·PL, capture, décomposition) + LineChart saisonnalité 12 mois avec ligne de moyenne + bloc « Lecture du résultat ».
- `calc-couverture.tsx` (A.6.2, type « couverture ») : sélection de ma station (fetch enseigne brandSlug) + rayon 2–30 km ; analyse 100 % client-side haversine sur les concurrents (`/api/stations?limit=2200`, brandSlug ≠ mien, statuts actifs) : nb concurrents dans le rayon, plus proche (marque + distance), saturation = min(100, nb/8×100) avec ton coloré, niches < 30 % (chips SERVICE_LABELS, « + » si absent de ma station) + BarChart horizontal pénétration des services (niches en émeraude, autre ardoise, seuil 30 % en pointillé ambre).
- `calc-parc.tsx` (A.6.3, type « parc-auto ») : données réelles INS par gouvernorat (population, véhicules, motorisation, âge moyen, stations) ; évolution 2020–2026 par interpolation géométrique (+7,3 %/an, 2026 = valeur réelle). Demande potentielle : carburant = véhicules × 32 km/j × 6,5 L/100 × 365 j, entretien = × 1,2/an, VE = 0,9 % + bornes (1/25 VE). LineChart évolution du parc + AreaChart projection de la demande (M L/an, ambre) + 8 KPIs + lecture du résultat.
- `calc-rentabilite.tsx` (A.6.4, type « rentabilite ») : 7 paramètres (invest 2,5 MTND, trafic 3 000 véh/j avec import depuis A.6.1, conversion 2–15 %, panier carburant 48 TND ÷ 2,5 TND/L, marge 0,18 TND/L, panier boutique 9 TND × 30 %, charges 850 kTND). Litres/an, marges carburant/boutique/nette, seuil = invest ÷ (marge/12), TRI = marge/invest, payback en années+mois ; 3 scénarios ×0,75/×1/×1,25 (sur trafic ET conversion) en cards bordées rouge/ambre/émeraude ; AreaChart cash-flow cumulé 10 ans avec ligne zéro et dégradé scindé au point mort (rouge sous zéro, émeraude au-dessus, offset calculé sur les bornes de la série) + 6 KPIs.
- `calc-multi-sites.tsx` (A.6.5, type « multi-sites ») : table dynamique 2–10 candidats (nom, gouvernorat, TMJ, concurrents à 5 km, investissement ; ajout/suppression, minimum 2). Score composite = 40 % TMJ + 30 % faible concurrence + 15 % motorisation + 15 % faible investissement, normalisation min-max entre candidats (critère non discriminant → neutre 0,5), /100. Classement avec médailles or #d9a514 / argent ardoise / bronze terracotta, BarChart horizontal des scores (podium coloré), tableau détaillé + 3 KPIs (meilleur site, score moyen, écart 1ᵉʳ/dernier).
- `calc-veille.tsx` (A.6.6, type « veille-concurrentielle ») : enseigne cible (Select /api/brands) + période 3/6/12 mois ; fetch `/api/movements?brand={name}&limit=100` + `/api/alerts?limit=60` filtrées client-side par marque. KPIs ouvertures/rénovations/fermetures/mouvements, BarChart mensuel empilé par type (émeraude/ambre/rouge/prune), table des mouvements (ScrollArea, badges type colorés + ImpactBadge), « axes stratégiques adverses » calculés automatiquement (zone d'expansion prioritaire = gouvernorat le plus visé par les ouvertures, re-brandings, pic d'activité, impacts forts) et alertes liées (SeverityBadge). Anti-stale : assombrissement des résultats pendant le rechargement (dérivé au rendu, pas de reset synchrone).
- `reports/reports-tab.tsx` (export `ReportsTab`) : en-tête « Rapports & programmations » + 2 KPIs. Générateur : 4 radio-cards type avec icônes (Crosshair/MapPin/Gauge/Radar + descriptions), Select période (Mois courant/Trimestre/Semestre/Année), Select périmètre (National + 24 gouvernorats avec compteurs de stations), ToggleGroup format (PDF/FileText, Excel/Sheet, PowerPoint/Presentation), bouton Générer → POST /api/reports (generatedBy = rôle connecté) → toast + prépend en tête + téléchargement CSV immédiat. Rapports récents : Table complète (nom, type Badge coloré, période, périmètre, format avec icône, taille Ko, date fr, généré par, actions télécharger CSV + retirer de la liste), 6 rapports seedés, zone scrollable. Rapports programmés : cards avec Switch (PATCH optimiste + rollback en erreur), 3 seedés (Veille hebdo, Synthèse mensuelle, Alerte temps réel) + formulaire de création (nom, fréquence WEEKLY/MONTHLY/REALTIME avec icônes, cible, canal) → POST → toast.
- `reports/report-csv.ts` : export CSV client-side (BOM UTF-8, séparateur « ; », échappement) — métadonnées du rapport + extrait de données selon le type (CONCURRENCE → /api/stats/market-share, IMPLANTATION → /api/governorats, PERFORMANCE → /api/stats/overview, VEILLE → /api/alerts), nom de fichier slugifié.
- Contraintes lint respectées : `react-hooks/set-state-in-effect` — fetchs uniquement en .then avec drapeau `cancelled`, jamais de setState synchrone dans le corps d'un effet (les resets d'enseigne se font par dérivation au rendu + remontée de clé) ; 'use client' partout ; listes longues en max-h + overflow-y-auto ; Intl.NumberFormat fr-FR ; montants « TND ».
- Vérifications : `bun run lint` → 0 erreur ; `bunx tsc --noEmit` → 0 erreur sur les dossiers calculators/ et reports/ ; dev.log : serveur prêt, GET / 200, aucune erreur de compilation. Palette 100 % sans bleu/indigo (émeraude, ambre, rouge, prune, or, terracotta, ardoise), UI intégralement française, responsive (grilles 2/3/4/6 colonnes, panneaux empilés en mobile).

Stage Summary:
- Modules A.6 et A.8 livrés : le « cœur de la valeur ajoutée » du produit est opérationnel — 6 calculateurs à recalcul instantané côté client (paramètres à gauche, KPIs + graphiques recharts à droite, sauvegarde/rechargement de scénarios via /api/calculations, chaînage trafic captif → rentabilité) et l'onglet Rapports complet (générateur multi-formats avec export CSV enrichi, rapports récents téléchargeables, programmations avec activation/désactivation temps réel). Restent aux autres agents : stations, concurrence, paramètres, portail, mobile, back-office.

---
Task ID: 6
Agent: orchestrator (Z.ai Code)
Task: Réponse incident « tout a disparu » — diagnostic et restauration du serveur

Work Log:
- Utilisateur signale que le site semble vide / tout le travail a disparu.
- Vérification disque : TOUS les fichiers sont intacts (12 dossiers de composants : dashboard 3, map 3, stations 5, competition 3, calculators 8, veille 4, reports 2, settings 7, mobile 5, portal 5, backoffice 6, shell 8 fichiers ; base SQLite peuplée 1814 stations).
- Diagnostic : `dmesg` révèle `Out of memory: Killed process 1707 (next-server)` — le serveur original avait gonflé à ~3 Go RSS et a été tué par l'OOM killer → l'aperçu est devenu vide côté utilisateur.
- Redémarrages : nohup/setsid classiques tués à la fin de session bash ; solution retenue = sous-shell détaché `(setsid bun run dev > dev.log 2>&1 < /dev/null &)` → processus survit aux sessions.
- Vérification agent-browser (navigateur headless) :
  - GET / 200, page rendue : header complet (sélecteurs mode/enseigne/rôle, cloche alertes=1, thème).
  - Tableau de bord : KPIs Agil (228 stations, 12,6 % part de marché, 1 814 national), graphiques rendus.
  - Carte interactive : filtres enseignes/services/statut OK.
  - Calculateurs : « Trafic captif » actif, 6 calculateurs listés.
  - Portail enseigne : « Portail Enseigne — Agil », 228 stations, onglets référentiel.
  - Mobile B2C : présentation module B (alertes, contribution, hors ligne).
  - Back-office : 12 signalements en attente, onglets Modération/Données souveraines/Fraîcheur/Agents terrain.
  - Console navigateur : aucune erreur (HMR connected, Fast Refresh OK).
  - dev.log : ~23 routes API toutes 200 (brands, stats/*, stations, roads, projects, governorats, services, calculations, portal/stats…).
- Nettoyage : navigateur de test fermé, mémoire libérée (2,2 Go disponibles), serveur toujours 200.

Stage Summary:
- AUCUNE perte de données : le « tout a disparu » n'était que le serveur OOM-tué. Serveur relancé (PID bun + next-server), app revalidée de bout en bout sur les 4 modes. Risque résiduel : Turbopack peut regonfler en mémoire (limite ~4 Go conteneur) — prévoir surveillance via cron webDevReview toutes les 15 min et redémarrage `(setsid bun run dev > dev.log 2>&1 < /dev/null &)` si nécessaire.

---
Task ID: 7
Agent: orchestrator (Z.ai Code)
Task: QA complet + Module B.3.1 étendu — Centre d'alertes intelligentes mobile avec préférences persistantes

Work Log:
- QA initial : `bun run lint` 0 erreur ; 10 endpoints API supplémentaires testés (reviews, contributions, reports, calculations, alerts, movements, competition, roads, projects, governorats) → tous 200.
- Audit de couverture du cahier des charges : tous les modules A/B/C/D implémentés (stations 1 709 lignes, competition 687, settings 815, mobile 794 + 9 écrans, portal 1 314, backoffice 1 562 — agents 5-b/5-d/5-e avaient livré sans journaliser).
- Nouveaux fichiers (exclusif dossier mobile) :
  - `smart-alerts.ts` : moteur de calcul d'alertes (4 types : open24/service/rating/fresh) 100 % client, filtres rayon/statut/24h, priorité enseignes favorites, dédup, tri distance, plafond 14.
  - `alerts-store.ts` : zustand persist « carbuscope-alerts » (favBrands, watchedServices, radiusKm 2-20, open24Only) + merge assainissant (défense état localStorage corrompu).
  - `screens/alerts-screen.tsx` : centre d'alertes — bandeau « en direct » (compteur + heure de calcul), panneau préférences repliable (chips enseignes colorées, chips services avec icônes, slider rayon, switch 24h/24, réinitialisation + toast), fil de cartes animées (framer-motion stagger, badge type, distance/temps/enseigne, clic → fiche), état vide avec CTA.
- Modifications : `shared.tsx` (Screen + « alertes »), `mobile-app.tsx` (routeur : écran enregistré, écran poussé, retour → carte, returnTo préservé), `screens/map-screen.tsx` (rotation des alertes désormais personnalisée via prefs ; bouton cloche avec badge de compte ; carte rotative cliquable → centre ; état vide invitatif ; suppression de l'ancien buildAlerts codé en dur).
- Bug trouvé et corrigé pendant la vérification navigateur : `prefs.favBrands.includes is not a function` — le `toggleIn` de shared.tsx est dédié aux Set (retournait un Set pour un champ tableau). Correctif : `toggleInArray` local + merge assainissant du persist.
- Vérifications agent-browser : bascule mode Mobile → cloche « 8 alertes intelligentes » ; centre ouvert (8 alertes réelles : « Station Indépendants ouverte 24h/24 à 1,8 km », « Lavage disponible à 1,8 km »…) ; bascule enseigne favorite Agil → recalcul instantané 9 alertes dont « Station Agil ouverte 24h/24 à 1,8 km — Agil Tunis Centre » (exemple exact du cahier §B.3.1) + El Ouardia + Ettadhamen ; clic carte → fiche station « Agil Tunis Centre » ; retours empilés OK ; localStorage persisté propre (tableaux). Rechargement + nettoyage du localStorage corrompu du bug validés.
- `bun run lint` final : 0 erreur. GET / 200. Navigateur de test fermé (1,8 Go libres).

Stage Summary:
- B.3.1 pleinement réalisé : alertes personnalisées, persistantes, recalcul instantané, navigation complète. Aucun appel serveur ajouté (calcul client). Prochaine étape recommandée : comparateur de stations (observatoire), export PDF (A.4.3/A.8), ou i18n 5 langues (A.9/B.3.4).

---
Task ID: 8
Agent: orchestrator (Z.ai Code)
Task: Comparateur de stations (extension A.4) — comparaison côte à côte de 2-3 stations dans l'onglet « Mes stations »

Work Log:
- Nouveau fichier `stations/station-compare-dialog.tsx` : Dialog large (ScrollArea max-h-70vh, défilement horizontal mobile) — grille comparative (colonnes = stations, lignes = statut, localisation, trafic captif + barre relative, note + étoiles, horaires 24h/24-7j/7, services, fraîcheur, score) ; badges « Top » (Trophy) sur les meilleurs scores par critère ; matrice des services différenciants (check émeraude / tiret, point ambre = différenciant, cf. A.5.3) ; score comparatif {wins}/4 + « Meilleur profil » ; synthèse ambre avec recommandation ; bouton « Voir la fiche » par colonne (ouvre StationDetailDialog).
- `stations/stations-tab.tsx` : état compareIds/compareOpen + sélection par Checkbox (colonne desktop + cartes mobile), toast limite 3, bouton « Comparer (n/3) » (désactivé < 2) dans la barre d'actions, dialog rendu avec compareSelection.
- ⚠️ Incident de debug majeur (à retenir) : variable locale nommée `compareStations` entrait en collision avec la FONCTION module-level `compareStations(a, b, sort)` (comparateur de tri) utilisée DANS le useMemo `filtered` → le compilateur React résolvait le symbole vers la variable locale (« inferred dependency was compareStations ») → « Could not preserve existing memoization » → saut de l'optimisation du composant entier + 2 erreurs eslint react-hooks/preserve-manual-memoization. Bissection complète (git stash, retraits incrémentaux) pour isoler la cause. Correctif : renommage en `compareSelection`. LEÇON : ne jamais nommer une variable locale comme une fonction module-level référencée dans un callback/mémo du même composant.
- Bissection supplémentaire : `.at(-1)` remplacé par index classique (prudence compilateur) ; toast sorti du setState updater (StrictMode) ; useCallback dépend de [compareIds, stations].
- Vérifications agent-browser : onglet Mes stations → cases à cocher présentes (desktop + cartes) → 2 stations cochées → bouton « Comparer (2/3) » actif → dialog « Comparateur de stations 2/3 » avec Agil Soukra vs Agil Beni Khiar 3, badges TOP, services différenciants, synthèse « Agil Soukra domine 4 critères sur 4 (7 796 véh./j, note 4,7/5, 5 services, vérifiée le 05 janv. 2026) » → « Voir la fiche » → StationDetailDialog + API 200.
- `bun run lint` complet : 0 erreur. GET / 200. Mémoire : 1,6 Go disponibles.

Stage Summary:
- Comparateur livré et vérifié de bout en bout. Conventions respectées (shadcn, palette sans bleu, français, responsive, accessibilité aria). Reste recommandé : i18n 5 langues (A.9/B.3.4), export PDF enrichi, widget comparaison sur carte.

---
Task ID: 9
Agent: orchestrator (Z.ai Code) — cron QA 15 min
Task: QA de routine + Module B.2.7 « Favoris stations » — favoris persistés (cœur), section profil, filtre recherche

Work Log:
- QA initial : serveur 200, mémoire 1,6 Go dispo. Sweep navigateur : onglets Concurrence/Veille/Rapports/Paramètres ✓, centre d'alertes (8 alertes) ✓, 0 erreur console. Régression tâches 7-8 : OK.
- Nouveau fichier `mobile/favorites-store.ts` : zustand persist « carbuscope-favorites » — stationIds (favoris), favBrands, favServices (préférences du profil désormais persistées, étaient en useState local), toggle/remove, merge assainissant (défense localStorage corrompu, cf. leçon tâche 7).
- `screens/station-screen.tsx` : bouton cœur à côté du partage dans ScreenHeader — aria-pressed, micro-interactions (fill amber + scale-110 actif, active:scale-90), toasts ajout/retrait, hooks appelés avant l'early-return (règle des hooks respectée).
- `shared.tsx` StationRow : badge cœur (fill-amber-400, aria-label « Station favorite ») sur toute ligne de station favorite — visible carte/recherche/profil automatiquement (le composant lit le store).
- `screens/profile-screen.tsx` : remplacement des Set locaux par le store persisté (favBrands/favServices) + NOUVELLE section « Mes stations favorites » (compteur badge ambre, liste avec BrandDot + cœur superposé, clic → fiche, bouton X retirer + toast, bordure ambre, état vide guide « appuyez sur le cœur ♥ »).
- `screens/search-screen.tsx` : chip « Favoris » (cœur, ton ambre, badge compteur, active:scale-95) avant le bouton Filtres — filtre favOnly dans le useMemo results, inclus dans reset(), compteur Filtres ajusté (n'inclut pas favoris).
- Vérifications agent-browser : fiche Petro Mégrine 2 → cœur cliqué → toast « Station ajoutée aux favoris » + bouton basculé « Retirer des favoris » ; profil → section « Mes stations favorites 1 » avec boutons Ouvrir/Retirer ; recherche → chip « Favoris 1 » → résultats filtrés (uniquement le favori, badge « Station favorite » sur la ligne) ; carte → cœur visible sur la ligne du favori ; rechargement complet page → localStorage persisté (stationIds + prefs), section profil toujours « 1 » ; 0 erreur console à chaque étape.
- `bun run lint` complet : 0 erreur. GET / 200. Mémoire : 1,5 Go disponibles. Navigateur fermé.

Stage Summary:
- B.2.7 (préférences utilisateur) pleinement réalisé avec persistance réelle : stations favorites + enseignes + services. Styles : accents ambre cohérents sur toute la chaîne favoris (cœur, chip, section profil). Prochaines priorités recommandées : i18n 5 langues effectif (A.9/B.3.4 — la sélection de langue existe mais ne traduit pas encore), widget comparaison sur la carte (tâche 8 → carte), statistiques d'usage des favoris dans le portail enseigne (C.2.5).
