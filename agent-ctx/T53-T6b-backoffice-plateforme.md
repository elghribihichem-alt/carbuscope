# T53-T6b — Back-office plateforme (moitié B du round T6)

**Agent :** full-stack-developer (T6b Back-office plateforme)
**Périmètre :** G7 sidebar portail (nav.espace="backoffice", 8 outils) — `backoffice-view.tsx` + 8 `bo-*.tsx`. Aucune route API touchée (lecture seule de src/app/api). Accès vérifié : `PLATFORM_MODULE_ROLES = ["ADMIN","DG"]` (store, ligne 61).

## 1. Audit à l'arrivée (worktree propre — aucun partiel T6b en attente)

git status HEAD = 8aa35bf (T6a) → net : le pattern « partiel d'agent expiré » ne s'applique PAS ce round. Audit des 9 fichiers (6 181 l.) + curl des routes réelles.

## 2. Contrats routes curlés (toutes 200, aucune modifiée)

- `GET /api/contributions?status=PENDING&limit=50` → `{contributions[9]}` (badge sidebar 9 réel) ; `PATCH /api/contributions {id, action}` → `{ok, status, validationCount}` (muta réelle, NON testée ce round)
- `GET /api/missions` → `{missions[8?], agents[6 réels]}` ; `POST /api/missions` ; `PATCH/DELETE /api/missions/[id]` (+`?taskId=`) (mutas réelles, NON testées)
- `GET /api/field-agents` → `{agents[6] total 6}` (codes AGIL-SFX-02/AGIL-TUN-01/OLA-GBS-06/SHE-TUN-05/TOT-SOU-04/TOT-TUN-03) ; `POST {code,name,phone?,brandSlug,zone}` ; **`PATCH ?id= {active?,zone?,phone?,name?}`** (réelle — utilisée par le nouveau bo-agents)
- `GET /api/roads` → `{roads[?]}` ; `GET /api/governorats` → 24 ; `GET /api/projects` → `{projects}`
- `GET /api/stations?limit=2200` → 2 985 stations ; `GET /api/brands` → 6
- `GET /api/stats/platform` → stations 2 985/rated 2 930/qualityScore 70 · moderation 14 (9 PENDING/3/2, avgDelayHours 49, resolutionRate 35,7) · users 17 · alerts 44 · reports 7
- `GET /api/watchlist-alerts/overview?runs=12` → totals 36 actives/207 déclenchements/18 emails ; `POST /api/watchlist-alerts/run` (muta NON testée — passe réelle créerait AlertRun+emails)
- `GET /api/prices` → current 3 + history ; `POST /api/prices` + `DELETE /api/prices/[id]` (mutas réelles, NON testées)
- `GET /status?XTransformPort=3035` (veil-scheduler, repli silencieux OK) ; `GET /api/notifications` → 400 sans brand (normal)
- Manques constatés (API INTERDITE ce round, à lister pour T7) : aucune route `/api/contestations` (arbitrage C.3 non branché → simulation locale honnête) ; aucune route « injection données souveraines » (idem) ; aucune route « campagne de vérification » (idem) ; bo-agents consomme /api/field-agents (existant).

## 3. DÉBORDEMENT 390 — cause racine unique, preuve avant/après

- **AVANT (mesuré E2E) : « Veille & alertes » = scrollWidth 662 vs clientWidth 390** (les 7 autres outils passaient déjà 390). Capture `qa-t53-t6b-avant-veille-alertes-390-overflow.png`.
- **Cause racine (bisection DOM) :** la colonne droite `lg:col-span-3` est un item de grille avec `min-width:auto` ; son min-content remonte depuis la table du « Rapport de passe » (7 colonnes, min-content ≈ 650 px) à travers les div Radix CollapsibleContent/overflow-x-auto de la vue arborescence DataViews (le couple `table.w-full` + Collapsible fait sortir le min-content) → piste de grille étirée à 649 → page 662. Test empirique : `min-width:0` sur l'item → 390 immédiat.
- **Fix (pattern T4b portal-api) :** `min-w-0` sur la grille `lg:grid-cols-5` + les 2 colonnes (`lg:col-span-2`, `lg:col-span-3`), commenté en source. La table scrolle désormais dans son `overflow-x-auto` interne (comme les autres DataViews).
- **APRÈS : 390 = 390** sur les 3 vues (arborescence/tableau/cartes) + aperçu email ouvert + dark + desktop 1440=1440. Captures apres/alerts-390 + v2.
- Note : bo-decrees (`lg:grid-cols-[1fr_20rem]`) et bo-stats (`lg:grid-cols-[220px_1fr]`) passaient 390 sans correctif (contenus wrappants) — laissés tels quels (gel souple).

## 4. Correctifs ciblés (fichier par fichier)

| Fichier | Changements |
|---|---|
| `backoffice-view.tsx` | slate→zinc du bandeau (dégradé + icône) ; badge « 2 985 fiches stations » en dur → **dynamique** via GET /api/stats/platform (stations.total, formatage fr-FR « 2 985 ») ; fetch additif non bloquant |
| `bo-moderation.tsx` | SERVICE_UNAVAILABLE slate→zinc ; **toast d'arbitrage honnête** (« Arbitrage simulé … aucune écriture serveur, moteur C.3 non branché », pattern T4b/T5b) + CardDescription « Exemples de démonstration » + badge « Arbitrage simulé » ; **export CSV file d'attente** (pattern T52-R2b : BOM + « ; » + dates FR) ; boutons Valider/Rejeter/Arbitrer → h-11 (44 px) |
| `bo-sovereign.tsx` | slate→zinc (carte gouvernance + icône) ; **toast d'injection honnête** (« Aperçu de planification — aucune injection exécutée … simulation locale ») + libellé « Dernière planification (aperçu local) » |
| `bo-freshness.tsx` | fallback dot slate→zinc ; **4 KPIs du cahier non instrumentés (96,4 % précision / 22 j détection / 5 j mise à jour / 97,8 % couverture en dur) remplacés par des mesures réelles** : Fiches notées 98 % (rated/total), Délai de traitement 2 j (avgDelayHours 49 h réel), Âge moyen vérifications 210 j (calcul local — honnête, éloigné de la cible), Couverture territoriale 24/24 (distinct gouvernorats) ; fetch /api/stats/platform non bloquant + comment documenté |
| `bo-agents.tsx` | **agents RÉELS de /api/field-agents** (6, codes AGIL-*/OLA-*/SHE-*/TOT-*) à la place des 8 agents fictifs (Sami Trabelsi etc. + « validité » inventée) : stats réelles missions ouvertes/terminées/rapports, téléphone, badge Actif/Inactif zinc, skeletons + ErrorState ; **réassignation de zone câblée sur le PATCH réel** `/api/field-agents?id= {zone}` (testée E2E + restaurée) ; campagne = simulation locale honnête (« Planifier la campagne (simulation) » + toast explicite) ; carte zones = agents ACTIFS ; boutons h-11 |
| `bo-alerts.tsx` | **min-w-0 ×3 (le fix 390 ci-dessus)** ; slate→zinc (STATUS_META.SKIPPED, fallbacks ×2, chip « non dues », RunDetailRow, fond zinc des exemples) ; feuille d'impression slate→zinc (couleurs littérales pour fond blanc, hex #f1f5f9→#f4f4f5, #475569→#52525b) |
| `bo-stats.tsx` | SEVERITY_META.INFO slate→zinc + hex #64748b→#71717a (zinc-500) |
| `bo-decrees.tsx` | aucun changement (audit sain ; KPI repli « 6 » enseignes = valeur réelle du registre enseignes, documentée) |
| `bo-missions.tsx` (2081 l., ciblé uniquement) | STATUS_META PLANIFIEE/ANNULEE + TASK_STATUS TODO + badge Inactif slate→zinc ; NEUTRAL_DOT #94a3b8→#a1a1aa (zinc-400) ; GPS virgule FR (`36,870, 10,180` — vérifié E2E) ; **export CSV missions filtrées** (pattern T52-R2b) ; bouton carte « Voir le détail » h-11. Aucune réécriture structurelle |

## 5. QA E2E (session unique t53t6b, zombies tués avant, close + pkill après)

- Login réel Rania Feki (racine) → « Brand portal » → groupe « BACK-OFFICE PLATEFORME » (badges Modération 9 / Missions 5 confirmés en sidebar).
- **8/8 outils à 390×844 → scrollWidth = clientWidth = 390** (sweep final post-correctifs, chaque outil navigué via menu mobile) : Modération / Données souveraines / Fraîcheur / Agents terrain / Veille & alertes / Stats plateforme / Prix & décrets / Missions.
- **0 erreur console** après chaque écran (seuls warnings Radix DialogContent préexistants app-wide). Desktop 1440×900 : 1440=1440 (missions dark, alerts, moderation). Dark mode (Espresso) : alerts + missions 390=390, 0 erreur. Reload ×3 : 0 erreur.
- Tests interactifs lecture seule : export CSV modération (toast « File exportée — 9 signalement(s) ») ; export CSV missions (toast « Liste exportée ») ; toast injection honnête ; toast campagne simulée ; dialog détail mission (390=390, GPS virgule FR) ; vues tableau/cartes/arborescence du rapport de passe ; aperçu email ouvert à 390.
- **Mutation réelle testée puis STRICTEMENT rétablie :** PATCH field-agents Ines Trabelsi (AGIL-SFX-02) Sfax → Ariana (toast « Zone réassignée … mis à jour en base » + carte mise à jour + vérif SQL) → retour Sfax (vérif SQL : zone='Sfax', active=true). Les 6 agents intacts.
- **DB :** aucune donnée modifiée au final (worktree vs HEAD : FieldAgent identique ×6, Contributions/Missions/Prices/AlertRun intacts) ; seul +1 AuditEvent SECURITE (login Rania — journal honnête, convention trace). 25 captures qa-t53-t6b-*.

## 6. Vérifications finales

- `bun run lint` → **0 erreur** (projet entier, navigateur fermé).
- `bunx tsc --noEmit` → **0 erreur périmètre backoffice/bo-*** (140 globales préexistantes inchangées — stock mort).
- Serveur 200 vivant (jamais tué, jamais build).
- `rg 'slate-[0-9]|#64748b|#94a3b8|#f1f5f9|#475569' src/components/backoffice/` → 0 (hors 1 commentaire de migration).

## 7. Verdicts pour T7 (validation finale tenant + passage Mobile B2C léger)

- Back-office INTÈGRE au 390 : débordement 662→390 éteint sur Veille & alertes, 8/8 outils 390=390 + 0 erreur + dark + desktop.
- Restes à arbitrer : (a) 3 simulations locales honnêtes subsistent (arbitrage C.3, injection sources souveraines, campagne de vérification) → routes à créer côté API si le produit veut les rendre réelles ; (b) dialog détail mission et create dialog non audités ligne à ligne (2081 l. — budget), sains à l'E2E ; (c) bo-decrees KPI repli « 6 » statique = valeur réelle actuelle, suivre si le registre enseignes évolue ; (d) hash sans section backoffice (reload → Modération par défaut, préexistant — même verdict que Shadow T6a) ; (e) warnings Radix DialogDescription app-wide (à traiter globalement un jour).
- Mobile B2C léger (T7) : le portail enseigne et le back-office sont propres ; le passage B2C peut se concentrer sur les écrans mobiles restants.
