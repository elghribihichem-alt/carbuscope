# T53-T6a — Shadow Market (moitié A du round T6)

Agent : full-stack-developer (T6a Shadow Market) · Session QA : t53t6a · Date : 2026-09-30

## Mission
Priorité n°1 : corriger le débordement 390 px du module Shadow Market (sw 488 signalé par
T4b, préexistant). Puis audit + correctifs ciblés (slate→zinc, virgules FR, bleu→prune,
cibles 44 px, boutons mensongers) sur les 6 sections, QA E2E lecture seule, documentation,
commit. Groupe G6 sidebar portail (SHADOW_MODULE_ROLES : ADMIN/COMMERCIAL/DG).

## Situation de départ — partiel d'un agent T6a expiré (pattern T4b/T5b)
Un agent T6a précédent avait livré un partiel NON committé et NON documenté :
- 13 fichiers shadow modifiés (+35/−19) : fixes ciblés qualité (voir détail ci-dessous) ;
- 49 captures qa-t53-t6a-* (dont 3 « overflow-avant ») ;
- PAS de worklog, PAS d'agent-ctx, PAS de commit → ce round l'audite, le complète
  (4 grilles défensives + 2 bleus restants), le QA à nouveau et le commite.

## Audit du partiel (fichier par fichier) — verdict : SAIN
- `shadow-shared.tsx` : SHADOW_COLORS.blue #2196F3 → #7C3AED (prune, clé `blue` conservée
  pour stabilité des signatures — consommateurs intouchés) + DOUBLON slate→zinc. SAIN.
- `overview/alerts-tab.tsx` : lien « Voir sur la carte » text-[#2196F3] → text-primary. SAIN.
- `overview/calendar-tab.tsx` : badge VALIDATION bleu → purple-300/50/800 + dark:. SAIN.
- `impact/{tab-cannibalisation,tab-simulation,tab-station-loss}.tsx` : `grid-cols-1`
  explicite sur les 3 grilles lg:grid-cols-[...] (piste implicite « auto » → max-content).
  SAIN (pattern documenté en source).
- `reports/report-paper.tsx` : wrapper `overflow-x-auto` autour de la table 8 colonnes
  (min-content ≈ 487 px). SAIN — c'est LA cause racine du sw 488 (preuve ci-dessous).
- `cartography/{national-tab,redzones-tab}.tsx` : boutons h-8 → h-11 (cible 44 px). SAIN.
- `cartography/road-tab.tsx` : title SVG décimal FR (« à 0,5 km », PK arrondi). SAIN.
- `recensement/recensement-shared.tsx` + `tab-points-list.tsx` + `tab-new-point.tsx` :
  coordonnées GPS virgule FR (36,78389). SAIN.

## Mes complétions (additif strict)
1. `recensement/tab-auditors.tsx` L156 : `grid-cols-1` sur `lg:grid-cols-[minmax(0,1fr)_420px]`
   (défensif — test sans fix : 390, mais piste auto structurellement fragile).
2. `recensement/tab-new-point.tsx` L344 : idem sur `lg:grid-cols-[minmax(0,1fr)_380px]`.
3. `settings/settings-radii-tab.tsx` L211 : idem sur `lg:grid-cols-[1fr_minmax(320px,420px)]`.
4. `settings/settings-typologies-tab.tsx` L365 : idem sur `lg:grid-cols-[1fr_340px]`.
5. `reports/export-share-tab.tsx` L322 : lien « Restaurer le message auto » #2196F3 →
   purple-700/dark:purple-400 (prune, dernier bleu restant du module).
6. `settings/settings-notifications-tab.tsx` L295 : icône FlaskConical #2196F3 →
   purple-600/dark:purple-400.

Après ces fixes : `rg '#2196F3|blue-[0-9]|indigo|slate-[0-9]' src/components/shadow/` → 0
(hors commentaires historiques documentant la migration).

## Preuve racine du débordement 390 (avant/après mesuré E2E)
En retirant PONCTUELLEMENT le wrapper `overflow-x-auto` du report-paper (re-remis juste
après, le diff final n'en garde aucune trace) :
- AVANT (sans fix) : « Rapport Mensuel » à 390×844 → **scrollWidth 517 vs clientWidth 390**
  (capture qa-t53-t6a-overflow-avant-rapports-mensuel-390.png). Le min-content de la table
  8 colonnes (menaces, pertes) ≈ 487–517 px selon les données réelles affichées — colle au
  « sw 488 » constaté par T4b.
- APRÈS (avec fix) : **390 vs 390** (capture qa-t53-t6a-apres-rapports-mensuel-390-v2.png).
Les 3 tabs impact + mes 4 grilles : testés sans leur `grid-cols-1` → 390 quand même sur
les données actuelles (contenu qui wrappe) → fixes DÉFENSIFS documentés comme tels : la
piste implicite « auto » d'une grid sans template est une bombe à retardement (dès qu'un
contenu dépasse, la page déborde — c'est arrivé sur StationPicker ~540 px max-content,
cf. commentaires du partiel dans les 3 tabs impact).

## Contrats API vérifiés (curl, scope NATIONAL sans session — convention démo)
- GET /api/shadow/overview → 200 : {month, monthLabel, scope, kpis{activePoints 847,
  estLossTnd, stationsThreatened 52, pendingValidation 124, newThisWeek…}, alerts[10],
  govLosses, typologies, monthly, topThreats[10], calendar}
- GET /api/shadow/map → 200 {scope, points[]} ; GET /calendar → 200 {events[26]} ;
  GET /points → 200 (+?status=BRUT filtré) ; GET /typologies → 200 (6) ;
  GET /auditors → 200 (14) ; GET /updates → 200 ; GET /validation → 200 {pending} ;
  GET /reports → 200 {month, summary, …} (POST régénération) ;
  GET /config → 200 {radiiM[500,1000,2000], cannibRadiusM 2000, seuils} (PATCH).
- GET /impact/station?code=TN-0001 → 200 {station, points[]} (400 si code absent) ;
  GET /impact/region → 200 {gouvernorats[]} ; GET /impact/trend → 200 {monthly[]} ;
  POST /impact/simulation {priceCutMillimes 10–800, weeks?, gouvernorat?, stationCode?}
  (GET → 405 normal).
- Mutations (NON testées — lecture seule) : POST /points, PATCH/DELETE /points/[id],
  POST /typologies + PATCH, POST /auditors + PATCH, PATCH /config, POST /reports,
  POST /validation.
- Scope : SUPER_ADMIN → NATIONAL (lentille ?brand=) ; compte enseigne → pertes filtrées
  sur ses stations (points informels nationaux) ; sans session → NATIONAL démo.

## QA E2E (session unique t53t6a, zombies tués avant, close + pkill après)
Login Rania Feki (racine) → « Brand portal » → groupe « SHADOW MARKET ».
**Les 24 écrans (6 sections × onglets) testés à 390×844 : scrollWidth = clientWidth = 390**
(overview kpis/alertes/top/calendrier ; carto nationale/district/station/axe/zones rouges ;
recensement nouveau/liste/maj/audit/validation/galerie ; impact station/région/
cannibalisation/tendance/simulation ; rapports mensuel/enseigne/personnalisé/export ;
settings accès/rayons/typologies/notifications) — éval après navigation Sheet mobile +
reload sur écran défaut. 0 ERREUR console après chaque écran (seuls warnings Radix
DialogContent préexistants, app-wide). Desktop 1440×900 : 1440 = 1440, 0 erreur.
Dark mode (Espresso) : calendrier + export 1440, rapport mensuel 390 = 390, 0 erreur.
Contrôle visuel VLM des 2 captures clés : KPIs réels (847 points, 1,2 M DT, 52 stations,
124 signalements), aperçu PDF Shadow Market (SYNTHÈSE, TOP 10 MENACES, PERTE PAR
GOUVERNORAT, RECOMMANDATIONS, historique 5 exports) — aucun chevauchement ni coupure.
Contenu vérifié réel : 847 points actifs / +11 cette semaine / 124 à valider /
52 stations menacées / 11 critiques — cohérent API↔écran.

## Base de données — zéro mutation
Tables shadow strictement identiques HEAD ↔ worktree (ShadowPoint 930=930, ShadowAlert
13=13, ShadowCensusEvent 26=26, ShadowAuditor 14=14, ShadowTypologie 6=6, Config 1=1).
Seul diff : AuditEvent 81 → 83 = +2 lignes de journal (login rania 00:55 de l'agent T6a
partiel + login rania 01:28 de ma QA) — journal append-only, convention « trace honnête »,
conservées. QA 100 % lecture + navigation client, aucun formulaire soumis.

## Vérifications finales
- `bun run lint` → 0 erreur projet entier.
- `bunx tsc --noEmit` → 0 erreur périmètre shadow (140 globales préexistantes = stock
  mort inchangé, aucune dans components/shadow ni api/shadow).
- Serveur 200 vivant (jamais tué), dev.log propre.

## Captures (97 fichiers qa-t53-t6a-*)
Partiel (49, conservées) : overflow-avant-{overview,impact,reports} + paires
desktop/390 des 24 écrans + apres-impact-station/apres-rapports-mensuel.
Complétion (48, suffixes -v2/-final) : re-validation 390 des 24 écrans (v2), 4 écrans
avant-sans-fix défensifs, preuve racine overflow-avant-rapports-mensuel (517 px) +
apres (390), 6 desktop final, 3 dark (calendrier, export, rapport mensuel 390).

## Verdicts pour T6b (Back-office — moitié B)
- Le module Shadow Market est INTÈGRE au 390 : la livraison clé du round est faite
  (390 = 390 sur les 24 écrans, preuve avant/après 517→390).
- Restes cosmétiques constatés (non bloquants, à arbitrer) :
  - `road-tab.tsx` : distance « à X,X km » (virgule FR) et PK arrondi — sain,
    plus aucun point anglo-saxon dans le module.
  - Liens alerts-tab en `text-primary` (primaire app, non prune) : harmonisation
    d'accent à arbitrer si on veut le prune strict partout.
  - Warning Radix DialogContent sans Description : app-wide, advisory.
- Hash de navigation : la section shadow (nav.shadow + onglets internes) n'est PAS
  portée par le hash → reload retourne à overview/kpis (préexistant, documenté T5b,
  sans impact données) — candidat amélioration future (deep-links par onglet).
- Export CSV observations terrain (pattern T52-R2b) déjà opérationnel côté terrain ;
  si T6b veut un export CSV shadow côté portail, la voie est libre (données déjà
  chargées côté client dans les listes) — à demander explicitement.
- `shadow-shared.tsx` clé `blue` = prune : ne JAMAIS la renommer (contrat stable),
  les 2 usages restants (STATUS_DOT.DOUBLON + commentaires) sont prunes.
