# CarbuScope — Synthèse de lecture complète du projet

> Document de compréhension rédigé à l'issue d'une relecture intégrale du projet
> (cahier des charges, worklog, schéma de données, code frontend/backend, mini-services,
> comptes de démonstration, design system, i18n, données réelles en base).
> **Nature : lecture seule — aucun fichier du projet n'a été modifié.**

---

## 1. Identité et vision

**CarbuScope** est l'implémentation du cahier des charges « Waze du Carburant » (v2.0) :
construire **l'infrastructure de données de référence du secteur des stations-service
en Tunisie**, avec une projection Maghreb à 5 ans. Le positionnement assumé : *un Waze
qui ne se contente pas de guider — il certifie la donnée, analyse le marché et éclaire
les décisions stratégiques*.

Le concept repose sur **trois couches de données auto-alimentées** (cahier des charges §1.2) :

| Couche | Acteur | Apport | Bénéfice |
|---|---|---|---|
| 1 | Utilisateurs | Avis, signalements, photos | Utilité, reconnaissance |
| 2 | Enseignes | Données officielles de leurs stations | Visibilité, image, contrôle |
| 3 | Plateforme | Trafic, parc auto, démographie, projets | Légitimité, autorité, valeur |

**Un seul produit visible (une page `/`), sept espaces métier** qui partagent la même
base de données SQLite. Le principe directeur du cahier des charges est respecté de bout
en bout : *trois produits, une seule base de données* (étendue à 7 espaces par les phases
successives : back-office, super-administration SaaS, agents terrain, Shadow Market).

---

## 2. Les sept espaces produit

La page unique `src/app/page.tsx` orchestre tout. Le `mode` du store Zustand détermine
l'espace rendu ; l'en-tête (figé, sticky) porte le sélecteur d'espace, et depuis T46
la navigation interne de chaque espace est portée par **une sidebar verticale à
accordéons** (`AppSidebar`).

### 2.1 Observatoire Web B2B (`mode = observatoire`) — Module A du cahier des charges
Outil des directions d'enseignes, **11 onglets** (le cahier en demandait 8, enrichis par
les phases : implantation, prix & marges, démographie) :

| Onglet | Rôle | Points marquants |
|---|---|---|
| `dashboard` | Vision 10 secondes (A.2) | 5 KPIs cliquables, mini-carte empreinte, fil d'alertes, 4 graphiques |
| `map` | Carte interactive (A.3) | Carte OSM réelle + fond schéma SVG, 6 couches, filtres accordéon, mesure/rayon/polygone, export CSV/GeoJSON, grappes au dézoom |
| `stations` | Parc propre (A.4) | Table/filtres/édition, comparateur 2-3 stations (dialog riche) |
| `competition` | Analyse concurrentielle (A.5) | Saturation, zones sous-desservies, concurrents proches, IVE |
| `calculators` | 6 calculateurs (A.6) | Trafic captif, couverture, parc auto, rentabilité, multi-sites, veille — recalcul client instantané, scénarios sauvegardés |
| `implantation` | Décision d'implantation | Zones blanches, isochrones 5/10/15 min, comparateur gouvernorats, cannibalisation |
| `prices` | Prix & marges réglementés | 28 décrets 2021-2026, historique en marches, simulateur d'impact marge |
| `veille` | Alertes & mouvements (A.7) | Timeline filtrable, mouvements 12 mois, relances J+7 |
| `reports` | Rapports (A.8) | 4 types × formats, **vrais PDF jsPDF**, CSV enrichis, programmations |
| `demographie` | Socle INS (T37/T45) | Conditionnel à l'accès accordé par la Super Admin — gouvernorats/délégations/cités |
| `settings` | Paramètres (A.9) | Profil, utilisateurs, notifications, API, langue |

Accès par rôle (`TAB_ACCESS`) : Direction Réseau, Commerciale, Expansion, Observateur —
conforme au tableau A.1 du cahier des charges.

### 2.2 Portail Enseigne (`mode = portail`) — Module C
Auto-publication B2B2B : tableau de bord (complétude, synchronisation), gestion des
stations (workflow traçé), promotions, avis & réputation (réponses officielles, IVE,
watchlist programmable), veille terrain (missions, conformité réseau, intelligence
concurrentielle), espace API (clé, quotas).

### 2.3 Mobile B2C (`mode = mobile`) — Module B
**Aperçu produit dans un cadre de téléphone** (`PhoneFrame`) : carte, recherche/filtres,
fiche station, signalements, avis, alertes intelligentes personnalisées, promotions,
fidélité, profil/favoris, comparateur consommateur, assistant, centre d'alertes.
i18n complet 5 langues avec **RTL arabe réel** — l'unique espace intégralement traduit
(choix assumé : les outils pro restent en français).

### 2.4 Agents terrain (`mode = agents`)
Application mobile pro embarquée dans le même téléphone de démonstration : connexion par
code (ex. `AGIL-TUN-01`), missions de contrôle/veille, rapport de visite riche (prix
pré-remplis au décret avec détection d'écart, file d'attente, propreté, conformité,
anomalies), **écran Shadow Market de recensement** (points clandestins, photos).

### 2.5 Back-office plateforme (`mode = backoffice`) — Module D
Cœur opérationnel : modération des contributions (validation 3 signalements concordants),
données souveraines, suivi de fraîcheur (indicateurs §3.2 du cahier), agents terrain,
missions, publication/purge des décrets, veille (moteur, passes, planificateur),
statistiques plateforme.

### 2.6 Super Administration (`mode = superadmin`) — SaaS
Espace racine (compte Rania Feki uniquement) : pilotage commercial complet
**catalogue → contrat (essai 30 j) → facturation → encaissement → relances → audit**,
comptes utilisateurs (suspension, impersonation journalisée, reset 2FA), module
Démographie 3 volets (gouvernorats/délégations/cités + import/export 6 formats),
**Agent IA interne** (vrais appels LLM via `z-ai-web-dev-sdk`, exécution/relance traçées),
délimitation cartographique éditable, journal d'audit filtrable.

### 2.7 Shadow Market (`mode = shadow`) — T44
Module d'intelligence sur le **marché parallèle du carburant** (vendeurs clandestins) :
vue d'ensemble (847 points actifs, ~1,24 M DT/mois de pertes, 52 stations menacées),
cartographie nationale/district/station/axe/zones rouges, recensement terrain avec
validation, analyse d'impact (cannibalisation, pertes par station/région, tendance,
simulation), rapports PDF, paramètres. Modèle pédagogique transparent (hypothèses de
capture affichées). Accessible à la Super Admin (vision nationale) et aux enseignes
(leurs pertes).

---

## 3. Architecture technique

### 3.1 Stack
- **Next.js 16** (App Router) + **TypeScript 5** strict — une seule route visible : `/`
- **Tailwind CSS 4** + **shadcn/ui** (49 composants UI) + lucide-react
- **Prisma ORM** sur **SQLite** (`db/custom.db`, ~6 Mo, **43 modèles**)
- **Zustand** (état global persisté) — pas de TanStack Query côté données (fetch directs)
- **Recharts** (graphiques), framer-motion (animations), sonner (toasts)
- **jsPDF + autotable** : exports PDF authentiques (8 générateurs, socle `report-pdf.ts`)
- **socket.io-client** : notifications temps réel ; **bcryptjs + crypto natif** : auth
- **z-ai-web-dev-sdk** : backend uniquement (Agent IA Super Admin)
- xlsx (imports/exports), qrcode (2FA), next-themes (thèmes)

### 3.2 Frontend — conventions structurantes
- `src/store/app-store.ts` : **source unique de vérité de navigation**. Contient mode,
  tab, brandSlug (lentille enseigne), role, session V7, `nav: Record<string,string>`
  (sous-navigation des modules), `sidebarCollapsed`, `mobileNavOpen`.
  Persistance partielle volontaire : **`nav` n'est pas persisté** (retour aux défauts
  au rechargement, design assumé T46).
- **Contrat de navigation T46** (source de vérité : `NAV_DEFAULTS` dans
  `app-sidebar.tsx`) : clés `portail`, `portal-terrain`, `shadow`,
  `shadow-overview/cartography/recensement/impact/reports/settings`, `superadmin`,
  `backoffice`, `implantation`, `calculators`, `mobile`, `agents`. Les vues lisent
  `nav[key] ?? "défaut"`.
- Pattern « **vue store-driven** » : les gros modules (portal, shadow, superadmin,
  backoffice, implantation, calculateurs, mobile) ne portent plus leurs barres
  d'onglets horizontales — ils rendent la section dictée par le store.
- Règle lint critique respectée partout : **jamais de setState synchrone dans un effet**
  (`react-hooks/set-state-in-effect`) — fetchs en `.then` avec drapeau `cancelled`,
  dérivation au rendu, remontée de clé.
- `DataViews` (composant `ui/data-views.tsx`) : **3 modes d'affichage** (tableau
  triable / cartes riches / arborescence groupée) sur tous les tableaux métier,
  préférence persistée par `localStorage cs-dataview:{viewKey}`.
- Deep-links partageables : `#mode=…&tab=…&station=…` restaurés au chargement
  (validation + garde superadmin, `replaceState` discret).

### 3.3 Backend — routes API
~25 dossiers de routes dans `src/app/api/` : `auth/*` (login, session, logout, 2FA,
accounts), `brands`, `stations/[id]`, `stats/*` (overview, gouvernorats,
services-evolution, market-share, movements, platform, reputation), `alerts`,
`movements`, `competition`, `governorats`, `roads`, `projects`, `reviews/[id]/reply`,
`contributions`, `calculations`, `reports(/schedules)`, `prices/[id]`, `missions/[id]`,
`field-agents`, `watchlist-alerts(/run|overview)`, `notifications`, `relances`,
`demographie(/acces)`, `portal/(stats|ai)`, `mobile/ai`, `super/*` (18 routes SaaS),
`shadow/*` (15 routes). Toutes en chemins relatifs, côté serveur, `force-dynamic`.
`src/lib/types.ts` (1 096 lignes) est le **contrat DTO unique** partagé front/back.

### 3.4 Mini-services (ports dédiés, gateway XTransformPort)
| Service | Port | Rôle |
|---|---|---|
| `veil-scheduler` | 3035 | Planificateur réel : passe de veille quotidienne **08:00 Tunis** (anti-doublon calendaire), journal **persistant** (`state.json`), `GET /status` + `/run` pour le back-office ; contient aussi le **dev-keeper** qui relance le serveur Next s'il meurt |
| `notif-relay` | 3036 (WS) / 3037 (HTTP) | Relais **WebSocket temps réel** des notifications enseigne (moteur de veille + publication de décrets → room `brand:{slug}`) ; le double port contourne l'interception engine.io du path `/` |

Le gateway Caddy (`:81`) achemine tout : `/api/...?XTransformPort=3035` par exemple.
Le client se connecte toujours en `io("/?XTransformPort=3036")`.

### 3.5 Moteurs transversaux (src/lib)
- `alert-engine.ts` + `watchlist.ts` : veille des notes — évaluation live, fréquences
  honnêtes (IMMEDIATE réservé aux nouveaux signaux, digest non re-notifié),
  compteur, traçabilité `AlertRun`.
- `notif-relay.ts` : push in-app temps réel + repli polling 45 s.
- `saas-server.ts` / `sa-server.ts` : contrat/facture/audit SaaS côté serveur.
- `demographie-server.ts` / `demographie-io.ts` : imports/exports multi-formats
  (JSON/CSV/XLS/XML/PDF/Word) avec normalisation d'alias FR.
- `report-pdf.ts` : socle PDF réutilisable (page de garde, KPI encadrés, tableaux,
  pied paginé, thème par marque — jamais de bleu).
- `serialize.ts`, `geo.ts` (haversine, point-in-polygon, projection), `chart.ts`
  (palettes thémées via `useChartPalette`), `missions.ts`, `auth.ts`.

---

## 4. Modèle de données (43 modèles Prisma)

Groupes fonctionnels :

1. **Référentiel stations** : `Brand`, `Station`, `Service`, `StationService`,
   `StationHistory` (règle d'or : *on n'archive jamais, on ne supprime pas*).
2. **Communauté** : `Review` (+ réponses enseigne), `Contribution` (modération,
   règle des 3 signalements concordants).
3. **Marché** : `Alert`, `Movement`, `GovernoratStat`, `RoadAxis`, `InfraProject`,
   `FuelPrice` (28 décrets), `MarketShare` dérivé.
4. **Démographie** (T37/T45) : `DemographicAccess` (visibilité par utilisateur),
   `DemographicDelegation` (277), `DemographicCite` (515) — données INS 2024.
5. **Veille enseigne** : `WatchlistAlert`, `AlertRun`, `Notification` (178).
6. **SaaS** : `SaasContract`, `SaasPlan`, `SaasInvoice`, `AuditEvent`, `User`,
   `AiTask`, `AiAgentBrandSetting`, `AiAgentUserSetting`, `CartoBoundary`.
7. **Terrain** : `FieldAgent`, `Mission`, `MissionTask`, `VisitReport`.
8. **Shadow Market** : `ShadowPoint` (930), `ShadowPointUpdate`, `ShadowTypology`,
   `ShadowAuditor`, `ShadowCensusEvent`, `ShadowConfig`, `ShadowMonthlyStat`,
   `ShadowAlert`.
9. **Outils** : `Report`, `ReportSchedule`, `SavedCalculation`.

**Volumes réels en base** : 2 985 stations (effectifs officiels re-seedés T44),
6 enseignes (Agil, TotalEnergies, Staroil, Shell, Ola, Indépendants), 7 453 avis,
44 alertes, 175 mouvements, 9 services, 9 axes routiers, 10 projets d'infrastructure,
21 utilisateurs, 5 contrats SaaS, 6 missions, 6 agents, 8 rapports de visite.

---

## 5. Design system « Observatoire du Café » (T40)

Transplanté depuis un design system externe via l'astuce **`@theme inline`** : ~3 000
classes héritées suivent les tokens sans toucher aux ~103 composants — migration
visuelle instantanée, zéro rupture.

- **4 thèmes commutables** (sélecteur dans l'en-tête, persistés) :
  `corporate` (défaut — sobre professionnel), `clair` (blanc papier), `café`
  (light/brun chaud), `espresso` (dark). Gérés par next-themes via `data-theme`.
- Tokens sémantiques `--c-page`, `--c-paper`, `--c-ink*` (10 niveaux d'encre),
  `--c-brown`, `--c-green`, `--c-amber`, `--c-terra`, radius 4/8/12, signature
  12.8 px, scrollbar `scroll-coffee`.
- Graphiques thémés via `useChartPalette` (MutationObserver, repli SSR café).
- Palette historique interdite bleu/indigo — émeraude/ambre/terracotta/prune/ardoise.

---

## 6. Authentification V7 et sécurité

- **Sessions signées HMAC-SHA256** (cookie httpOnly `cs_session`, TTL 12 h),
  vérification bcrypt (coût 10), rate limit anti-force-brute (15 essais / 5 min).
- **2FA TOTP complet** (RFC 6238 sur crypto natif, zéro dépendance) : QR, défi,
  reset par la Super Admin, refus d'impersonation si 2FA actif.
- Espaces autorisés par profil (`spacesForUser`) : racine → tout ; enseigne cliente →
  observatoire/portail/mobile ; personnel plateforme → observatoire/backoffice/mobile.
- 8 personas de démonstration (connexion express 1 clic) : Sonia (Agil, ADMIN),
  Karim (Shell, COMMERCIAL), Mehdi (Ola, EXPANSION), Leila (TotalEnergies, VIEWER),
  Nadia (portail Agil), Yassine (mobile B2C), Amine (back-office), Rania
  (Super Admin, 2FA). Mot de passe démo public documenté dans l'UI : `carbuscope`
  (posé par `scripts/v7-set-passwords.ts`).
- L'espace Super Admin est **caché** aux non-racines (bouton + garde défensive dans
  `page.tsx` : `effectiveMode` retombe sur l'observatoire).
- Les API « données » restent ouvertes en démonstration ; les mutations
  d'authentification sont protégées. Chaque action sensible passe par `logAudit`.

---

## 7. Internationalisation

`src/lib/i18n/` : 5 dictionnaires (fr ~426 clés, ar, en, it, es), store persisté
`carbuscope-lang` avec détection auto du terminal, `translate()` avec repli
FR → clé, helpers Intl localisés (dates relatives, nombres, heures).
**L'arabe active le RTL complet** (`dir` sur le wrapper racine, sidebar et chrome
inversés). Périmètre traduit : app mobile B2C + chrome/en-tête/sidebar + onglets ;
les modules pro B2B restent FR (choix documenté).

---

## 8. Historique de construction (45+ tâches orchestrées)

| Phase | Tâches | Apport |
|---|---|---|
| Fondations | 1→4 | Schéma + seed 1 814 stations, shell, carte SVG, 22 routes API |
| Modules A (agents) | 5-a→5-e | Dashboard, veille, calculateurs, rapports, stations, concurrence, settings, mobile, portail, back-office |
| Robustesse | 6 | Incident OOM diagnostiqué (serveur tué), procédé de relance détachée |
| Extensions B2C/B2B | 7→18 | Alertes intelligentes, comparateur, i18n 5 langues, carte OSM réelle, réputation/IVE, réponses enseigne, PDF réputation, watchlist |
| Automatisation | 19→21 | Moteur de veille, passe SCHEDULED, scheduler réel 08:00, notifications temps réel WebSocket |
| Réglementaire | 22→23 | Prix & décrets (9e onglet B2B + mobile + calculateurs), boucle décret → notification |
| UX systèmes | 24→25 | Fiches popup enrichies, purge décrets, DataViews (3 vues), veille terrain (agents/missions) |
| Auth & SaaS | 27→34 | Écran de connexion, 8 personas, Super Admin complet (contrats, factures, plans, relances, audit, Agent IA, carto) |
| Démographie | 35→37 | Module INS 3 niveaux, import/export 6 formats, visibilité conditionnelle |
| Agents terrain app | 38 | Vue produit + espace agent réel |
| Design café | 40→41 | Transplantation design system 4 thèmes, charts thémés, i18n onglets, deep-links |
| Auth réelle | 42 | Sessions signées, bcrypt, 2FA TOTP de bout en bout |
| Relances | 43 | Boucle J+7 veille → notifications |
| Shadow Market | T44-a→f | 929 points seedés, 15 routes, 6 sections / 28 onglets, mobile |
| Finalisation | T45-a→c | Cités (515), alimentation parc auto, 8 générateurs PDF réels |
| Navigation T46 | 2-a, 2-b, 3 | **Sidebar verticale accordéon** : en-tête figé conservé, toutes les barres horizontales remplacées, rail repliable, Sheet mobile, badges live, verrous rôles, RTL |

---

## 9. Conventions de gouvernance (à préserver)

1. **Fichiers protégés** (propriété orchestrateur) : `src/app/page.tsx`,
   `src/lib/types.ts`, `src/store/app-store.ts`, `src/components/map/*`,
   `src/components/shell/*`, `src/app/api/*`, `prisma/*`.
2. **Aucune couleur bleu/indigo**. Palette : émeraude, ambre, terracotta, prune, ardoise,
   or + tokens café.
3. UI **100 % français** hors mobile B2C (5 langues) ; RTL pour l'arabe.
4. `fetch('/api/...')` **relatifs uniquement** ; WebSocket uniquement via
   `io("/?XTransformPort={port}")`.
5. Charts via `recharts` + `useChartPalette` ; icônes `lucide-react` ; toasts `sonner`.
6. Listes longues : `max-h-*` + `overflow-y-auto` (scrollbar stylée).
7. Footer sticky `mt-auto` dans un wrapper `min-h-screen flex flex-col`.
8. Lint strict : `react-hooks/set-state-in-effect` (pattern `.then` + drapeau),
   jamais de variable locale homonyme d'une fonction module-level (leçon tâche 8).
9. Worklog obligatoire (`worklog.md`) : chaque agent lit puis **append** sa section.

---

## 10. État actuel et risques connus (documentés au worklog)

**État : complet et sain.** Serveur :3000 actif (dev-keeper), lint 0 erreur sur les
fichiers actifs, navigation T46 vérifiée de bout en bout dans les 7 modes, deep-links,
RTL, accordéons, badges.

Risques/pistes documentés :
- ~129 erreurs `tsc` **préexistantes** concentrées dans des routes SA/portail
  **orphelles** (modèles Prisma fantômes `db.contrat`, `db.ticketSupport`…, composants
  non rendus) — **aucune visible dans l'app rendue** (les 9 onglets SA n'appellent que
  des routes 200). À trancher un jour : compléter ou nettoyer le code mort.
- `tab-nav.tsx` conservé mais **inutilisé** (poubelle douce) depuis T46.
- `nav` non persisté (voulu) ; les Tabs de 3e niveau (sa-demographie, sa-support,
  sa-config) restent des onglets de contenu.
- Coordonnées GPS du seed historiquement arrondies (co-localisations) — impact
  documenté dans l'outil cannibalisation.
- Le `DEMO_PASSWORD` constant (`carbu2025`) dans `demo-accounts.ts` est un vestige :
  le vrai mot de passe posé en base est `carbuscope` (script V7).
- Priorités suggérées par les agents : badges live sidebar observatoire (alertes
  critiques), recherche ⌘K dans la sidebar, i18n des libellés sidebar, suppression
  du fichier mort `tab-nav.tsx`.

---

## 11. Carte du code (volume)

```
src/
  app/            page.tsx (orchestrateur), layout.tsx, globals.css (thèmes),
                  api/ (~25 dossiers, ~60 routes)
  components/
    shell/        10 fichiers — header, sidebar T46, footer, logo, KPI, badges…
    ui/           49 composants shadcn + data-views.tsx
    dashboard 3 · veille 5 · map 5 · stations 6 · competition 3 · calculators 8 ·
    implantation 6 · prices 1 · reports 3 · settings 7 · demographie 3 ·
    portal 14 · backoffice 9 · superadmin 24 · shadow 42 ·
    mobile 28 (dont 16 écrans) · auth 3 · app 10
  store/          app-store.ts (navigation + session)
  hooks/          use-deep-links, use-chart-palette, use-toast, use-mobile
  lib/            types.ts (contrats), auth.ts, alert-engine, watchlist, notif-relay,
                  saas-server, demographie-*, report-pdf, geo, chart, i18n/ (5 dict.)
prisma/           schema.prisma (43 modèles) + 10 seeds
mini-services/    veil-scheduler (3035), notif-relay (3036/3037)
```

---

## 12. Conclusion — l'idée directrice

CarbuScope démontre le concept du cahier des charges **à une échelle rarement
atteinte en démonstration** : une base de données unique (2 985 stations réelles,
démographie INS 3 niveaux, décrets, SaaS, marché parallèle) alimente **7 espaces
produits cohérents**, chacun avec sa logique métier, ses KPIs et ses boucles de
rétroaction (l'automobiliste note → l'enseigne répond → la réputation alimente
l'IVE → la veille surveille → le back-office certifie → la Super Admin monétise).

Les trois signatures du projet :
1. **La donnée est le produit** : fraîcheur tracée, sources INS/DG citées,
   hypothèses de calcul transparentes, audit de chaque action sensible.
2. **Un seul chrome, sept métiers** : en-tête figé + sidebar accordéon T46,
   thèmes café, i18n RTL — l'identité ne change jamais, seul le périmètre change.
3. **Une automatisation réelle** : scheduler 08:00 persistant, WebSocket temps réel,
   moteur de veille honnête (anti-spam), PDF authentiques, LLM serveur.

*Cette synthèse est le point d'entrée recommandé pour toute reprise future du
projet — à lire avec `worklog.md` (historique détaillé tâche par tâche) et
`upload/Cahier de cahrges d'application stations.txt` (référence fonctionnelle).*
