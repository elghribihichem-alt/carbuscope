# T54-B3b — Études de Faisabilité + Franchise (finalisation Module 1 Opportunity Radar, 6/6)

Agent : full-stack-developer · Round de FINALISATION (round interrompu repris : code + 17
captures existaient non commités, vérification finale + commit manquants).

## Contexte lu
- worklog.md entrées T54-A0 → T54-B3a (plan canonique, socle data, coque, scoring B2,
  formats+simulations B3a) + /agent-ctx/T54-B2-full-stack-developer.md (pattern QA curl
  cookie jar, login démo sonia.beji@agil.tn / « carbuscope »).
- Règles respectées : palette émeraude/ambre/terracotta (zéro bleu), UI FR, chiffres FR,
  390 px, dark, discipline 4 Go (pkill navigateurs, une session, lint navigateur fermé),
  jamais `bun run build`, dev server jamais tué volontairement.

## Audit code (lecture, pas de refonte)
- scoring.ts : diff +2/-2 STRICTEMENT additive (`export const GOV_REGION` pour validation
  serveur des routes franchise — moteur B2 intact).
- radar-module.tsx (+56/-38) : 2 volets intégrés proprement, routing nav.radar
  « faisabilite »/« franchise » conforme, ModuleSoonCard supprimé (icônes toujours
  utilisées dans RADAR_SUBTABS).
- 7 nouveaux fichiers cohérents : imports résolus, shapes API conformes, zéro code mort.

## Bugs corrigés (les seules réécritures)
1. 4 erreurs lint `react-hooks/set-state-in-effect` (radar-franchise.tsx) :
   - éditeur de notes du Sheet candidature → pattern React render-time reset (garde id) ;
   - resets de dialogs à la fermeture → REMONTAGE PAR CLÉ au bouton d'ouverture
     (newSeq / newContractSeq) ;
   - drapeau « délégations chargement » armé dans le handler du sélecteur, baissé à la
     résolution du fetch.
2. Régression dup-key introduite par le remontage (2 dialogs frères clé={0}/{0} puis
   {1}/{1} → « Encountered two children with the same key », React 19 détecte hors
   tableaux) → clés nommées `candidature-${seq}` / `contrat-${seq}`. Cycles des 2 dialogs
   re-testés : 0 erreur console.

## Sanity routes (curl, cookie jar Sonia)
- /api/radar/scoring 200 · /api/franchise/kit 200 (12 pièces).
- /api/franchise/candidates?brand=agil → 401 SANS session (protégé = SAIN, documenté).
- /api/franchise/contracts?brand=agil → 401 idem.
- Avec session : candidates 200 (12 agil), contracts 200 (5), kit 200.

## État final DB (audit lecture seule, script tmp supprimé)
- 14 candidatures SEED INTACTES (agil 10 + staroil 4, statuts/notes inchangés).
- 6 contrats SEED INTACTS (FR-2025-001→006, 5 statuts distincts, signedAt d'origine).
- Kit 12 intact · invariants T54-B2 préservés (config 30/20/25/15/10, ZoneAlert 6).
- Résidus QA documentés (légitimes, PAS de seed altéré → rien restauré) : candidats
  « QA T54-B3b test » (Kairouan) + « QA T54-B3b nav test » (Sousse), tous deux REJECTED
  terminal (pas de DELETE en V1 par spec) ; contrat QA FR-2025-007 (SENT, Karim Maalej,
  140 KDT/3,2 %/6 ans) ; 11 AuditEvent kind=FRANCHISE ; 0 radar-simulation.

## QA complémentaire (17 captures existantes + 2 nouvelles = 19)
- 18 : export PDF Tunis (toast) — PDF frais valide PDF 1.3, 2 pages, 47 513 o dans
  ~/Downloads ; le PDF Kairouan du round interrompu (47 928 o, 2 pages) était déjà là.
- 19 : dialog contrat remonté à neuf (défauts 150000/3/5) après correctifs lint.
- Balayage : faisabilité rend (Feu orange Tunis, SVG 5 variantes, checklist 14 points),
  franchise 3 volets rendent, 0 console error + 0 page error sur toute la session.

## Divers
- lint 0 erreur (navigateur fermé) · tsc 0 erreur sur les fichiers du round.
- Incident externe : 1 OOM kill du dev server pendant lint+tsc concurrents (~2,56 Go RSS)
  → relance (setsid bun run dev > dev.log 2>&1 < /dev/null &), serveur vivant au final.
- Worklog : entrée « T54-B3b » complète appendée (fichiers, routes, round-trips, DB, QA).
- Commit : message « T54-B3b: … Module 1 Opportunity Radar 6/6 COMPLET … ».

## Suivi
- Statut : TERMINÉ — Module 1 Opportunity Radar 6/6 volets réels, commit fait.
- Prochaine étape logique : Module 2 « Mobility Hub Operations » (coque T54-A2B1,
  5 volets « Bientôt », données TMP déjà seedées).
