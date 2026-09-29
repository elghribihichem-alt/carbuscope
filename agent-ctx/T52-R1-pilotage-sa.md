# T52-R1 — R1 Pilotage SA (full-stack-developer)

**Mission** : perfectionnement du module « Vue d'ensemble » (nav.superadmin = "overview") de l'espace Super Admin — gel souple, enrichissement avec précaution, qualité avant tout.

**Date** : 29/09/2026 (horloge sandbox) · **Session QA** : agent-browser `--session t52r1` (isolée).

## 1. Audit initial (état au démarrage)

### Fichiers vivants
| Fichier | État | Rôle |
|---|---|---|
| `src/components/superadmin/sa-overview.tsx` (191 l.) | actif | 6 KPIs (KpiCard), carte « Prochains renouvellements » (4 renewals), carte « Dernières factures » (6), carte « Activité récente » (audit, max-h-72) ; consomme `/api/super/overview` ; `onNavigate` → contracts/invoices/audit. |
| `src/app/api/super/overview/route.ts` | **200 OK** | seule route SA vivante (SaasContract/SaasInvoice/Brand/User/AuditEvent). |

### Code mort miné (non importé, non modifié)
| Fichier | Fonctionnalités minées |
|---|---|
| `sa-banniere-alertes.tsx` (356 l.) | bannière proactive : consolidation `/api/super/echeances` (DEPASSE/CRITIQUE/WARNING) + `/api/super/factures` (EN_RETARD, séniorité) ; résumé + urgence + chips navigantes + dismiss session ; recalcul live sur événement DOM `carbuscope:mutation-sa` (debounce 400 ms) ; zéro alerte/erreur → rien rendu ; rouge si retard ≥ 30 j sinon ambre. |
| `sa-supervision.tsx` (1209 l.) | 6 KPIs santé (base intègre/latence/endpoints/jobs/dernière sauvegarde/incidents), santé base (comptages table par table + top 10 BarChart), santé API (sonde + Progress), jobs (bascule PATCH + exécution POST), sauvegardes physiques (création/restauration), incidents, mode maintenance, charge. |

### Constat central — routes SA mortes (500)
`/api/super/echeances`, `/factures`, `/supervision`, `/analytics`, `/jobs` répondaient **HTTP 500** : elles sondent les modèles Prisma **fantômes** du stock historique (`Contrat`, `AbonnementStation`, `Facture`, `JobPlateforme`, `Incident`, `Sauvegarde`, `ParametrePlateforme`, `Annonce`, `TicketSupport`, `CleApi`) — inexistants dans `prisma/schema.prisma` (dette tsc ~159 erreurs). Données réellement disponibles : `SaasContract` (5 : Agil ACTIF 3450, TotalEnergies ACTIF 1690, Shell ACTIF 1490, Staroil SUSPENDU, Ola ESSAI), `SaasInvoice` (20, dont 6 RETARD effectives = 10 900 DT), comptages 16 tables vivantes (12 353 lignes), fraîcheur (prix 2026-09-01, contribution J-5, audit J-2), charge (5 missions, 9 signalements PENDING, 4 alertes critiques non lues).

## 2. Changements effectués (périmètre respecté)

| Fichier | Action |
|---|---|
| `src/app/api/super/echeances/route.ts` | **Réécrit** sur modèles réels : RENOUVELLEMENT_CONTRAT (renewsAt, fenêtre −30/+90 j) + FACTURE_RETARD (statut effectif, fenêtre −90/+90 j) ; gravité DEPASSE/CRITIQUE/WARNING/INFO ; stats enrichies (facturesRetard, montantRetardDt) ; champs compat bannière d'origine. |
| `src/app/api/super/supervision/route.ts` | **Réécrit** sur modèles réels : 16 tables comptées en parallèle + taille db + latence, sonde 5 routes vivantes, fraîcheur métier, charge modération. Jobs/incidents/maintenance absents (fantômes) — documenté dans le code. |
| `src/app/api/super/overview/route.ts` | **Enrichi additivement** : `overdueInvoices` (6 RETARD, dueAt asc) + `mrrHistory` (6 mois reconstruits : contrats ACTIF présents depuis startedAt ; résiliés exclus, aucune invention). Champs existants inchangés. |
| `src/components/superadmin/sa-overview-alertes.tsx` | **Nouveau** (≈215 l.) : bannière légère vivante (fetch echeances + écoute mutation-sa debounced, chips Facturation/Contrats, dismiss, rouge/ambre, aria-live, min-h-11). |
| `src/components/superadmin/sa-overview-sante.tsx` | **Nouveau** (≈250 l.) : carte « Santé de la plateforme » (badge Saine/À surveiller/Dégradée, 4 sections mesurées, Actualiser, skeleton, échec discret + Réessayer). |
| `src/components/superadmin/sa-overview-mrr.tsx` | **Nouveau** (≈140 l.) : AreaChart 6 mois, teal #0d9488 + gradient 0.30→0.08, tooltip/axes/grille thémés (lib/chart.ts), badge variation/stable, état vide, note méthodo. |
| `src/components/superadmin/sa-overview.tsx` | **Intégré/enrichi** : bannière en tête, carte « Échéances & renouvellements » + bloc « Factures en retard » (jours + pastilles rouge ≥ 30 j / ambre, max-h-96 scroll), rangée MRR + Santé ; 6 KPIs, carte factures, carte audit, onNavigate inchangés. |

Code mort (`sa-banniere-alertes.tsx`, `sa-supervision.tsx`) : **lecture/minage uniquement, zéro modification, zéro suppression**. Fichiers interdits : zéro modification. Aucun nouvel onglet sidebar.

## 3. QA (session isolée t52r1)

- Login Rania Feki (grille démo) → Vue d'ensemble : bannière « 6 factures en retard (10 900,00 DT) · retard le plus ancien : TotalEnergies J+33 » + chips (6)/(2) ; 6 KPIs chargés ; MRR stable 6 630,00 DT badge « stable » ; Santé « À surveiller » (signalements 9 + alertes critiques 4 → watch) ; sections retards avec pastilles.
- Navigation interne : Contrats → Enseignes & contrats ✓ ; Facturation → Encours & recouvrement (20 factures) ✓ ; Journal complet → Journal d'audit (38 événements) ✓.
- Mobile 390 844 : `scrollWidth (390) <= clientWidth (390)` → **true**, cartes empilées, KPIs 2 colonnes, graphique MRR sans débordement.
- Dark mode (thème Espresso) : contrastes vérifiés (VLM), gradient MRR renforcé 0.30/0.08 au passage ; thème restauré corporate ensuite.
- Console : **0 erreur de code** (2 ChunkLoadError turbopack = artefacts d'un reload tombé dans la fenêtre de recompilation serveur, hors périmètre, aucune nouvelle erreur après).
- `bun run lint` : **0 erreur projet entier**. `tsc --noEmit` : 0 erreur périmètre ; 140 erreurs globales (baisse vs ~159 : mes réécritures de routes mortes en ont supprimé).
- Captures : `qa-t52-r1-overview.png` (1440 full-page corporate), `qa-t52-r1-overview-mobile.png` (390 full-page).
- Smoke final : GET / → 200 ; /api/super/{overview,echeances,supervision} → 200 ; dev.log propre.

## 4. Besoins signalés à l'orchestrateur

1. **Jobs planifiés** : aucun modèle réel (`JobPlateforme` fantôme). La carte santé affiche fraîcheur/charge/endpoints mais PAS de jobs. Si souhaité : ajouter un modèle jobs réel au schéma + route, puis brancher la carte (champ `jobs` dans la réponse supervision).
2. **`/api/super/analytics` et `/api/super/jobs`** : toujours 500 (modèles fantômes, hors mon périmètre) — soit réparer (données SaaS réelles), soit supprimer en R4 avec le code mort associé.
3. **Historique MRR 12 mois** : la reconstruction 6 mois est plate (6630 partout — Shell souscrit en février 2026) ; sur 12 mois on verrait 3450 → 5140 → 6630. Extension triviale si souhaitée.
4. **`lib/saas.ts`** : j'ai utilisé un type local étendu (`SaasOverviewExt`) pour ne pas toucher le fichier — si R2 ajoute officiellement `overdueInvoices`/`mrrHistory` à `SaasOverviewDTO`, le type local pourra être simplifié.
5. **Thème corporate** (sidebar active / bouton mode) utilise du bleu institutionnel — thème global T46 de l'orchestrateur, hors de mon périmètre ; aucun bleu ajouté dans MES composants (VLM vérifié).

## 5. Verdict code mort (pour R4)

- **sa-banniere-alertes.tsx** : fonctionnalité ENTIÈREMENT PORTÉE en version légère vivante (`sa-overview-alertes.tsx`) → **supprimable en R4** (aucune valeur restante, dépendances sa-types/factures mortes).
- **sa-supervision.tsx** : carte santé PORTÉE (mesures réelles) ; jobs/sauvegardes/restauration/incidents/maintenance **non portables** (modèles fantômes — porter serait fabriquer des données) → **conserver en friche documentaire ou supprimer en R4** selon l'arbitrage ; si l'orchestrateur ajoute les modèles, le module complet reste une base de réactivation.

## 6. Limites rencontrées

- `/api/super/analytics` (historique MRR/ARR officiel) intouchable et en 500 → tendance MRR reconstruite côté `/api/super/overview` (données réelles, méthodo documentée) ; pas de fausses données.
- La fenêtre bannière des retards a été élargie à −90 j pour aligner bannière (6 retards, 10 900 DT) et KPI « Encaissement en attente » (cohérence utilisateur).
- `mrrHistory` reconstruit exclut les résiliés (date de sortie inconnue en base) — note méthodo affichée dans la carte.
- Le dev server a recompilé/redémarré pendant la QA (fenêtre ChunkLoadError) — revalidé après stabilisation : 200 partout, 0 nouvelle erreur.
