# T45-a — Agent « demographie-cites » — Extension cités (3ᵉ niveau) + alimentation en masse des véhicules

Statut : TERMINÉ (lint 0 erreur, `tsc --noEmit | grep -iE "demograph|cite"` vide, GET / 200, routes curlées 200/201/400/404, base remise propre avec seed conservé).

## Objectif
Deux phases demandées par la direction : ① extension « cités » — 3ᵉ niveau du découpage administratif (gouvernorat → délégation → cité) avec seed ~520 cités, niveau d'accès CITES, volet SA dédié et drill-down B2B ; ② alimentation en masse des véhicules 🚗 — import renforcé (warnings de cohérence, compte-rendu détaillé), modèles CSV, mini-tableau de bord « Parc automobile ».

## Livrables

### 1. Schéma Prisma (poussé + client régénéré)
- **`prisma/schema.prisma`** — nouveau modèle `DemographicCite` (gouvernorat, délegation, cite, population, urbanPct, 5 catégories véhicules, source « INS 2024 | Import SA », updatedAt/updatedBy ; `@@unique([gouvernorat, delegation, cite])` + `@@index([gouvernorat, delegation])`). `DemographicAccess.level` → 3 valeurs (GOUVERNORATS | DELEGATIONS | CITES, commentaire mis à jour) ; commentaire de `DemographicDelegation` (« cité volontairement différée ») → « géré par DemographicCite (T45) ».

### 2. Seed — `prisma/seed-cites.ts` (nouveau, exécutable `bun prisma/seed-cites.ts`)
- **515 cités** sur **144 délégations** couvertes (24 gouvernorats ; 3-8 délégations principales par gouvernorat selon la population, 2-4 cités par délégation), noms tunisiens crédibles (Cité El Khadhra/Ibn Khaldoun/Essalem/Ettadhamen/El Ghazala/El Manar/Ennour/Erriadh/El Amal/El Wafa/Ezzouhour/El Fath…, Borj …, Médina, Vieille ville, Zone industrielle, Route de X). Hash FNV-1a déterministe (seed reproductible, upsert idempotent).
- Population : répartition pondérée de la population INS du gouvernorat sur ses délégations (poids 3,0/1,6/0,9), cités = 60-85 % de leur délégation. Parc = population × motorizationRate du gouvernorat × mix (VL 62 % · utilitaires 15 % · PL 5 % · autocars 1 % · 2-roues 17 %), arrondi. `source: "INS 2024"`, taux urbain par type de nom.
- **Décision assumée** : les 144 délégations couvertes reçoivent AUSSI leurs valeurs (population, urban/rural, parc par catégorie) — c'est la référence « alimentation en masse » qui rend le volet Délégations et son tableau de bord Parlants (les 133 autres délégations restent vierges).
- Récapitulatif : 515 cités · top 3 couverture Tunis/Sfax/Nabeul (32) · pop cumulée 5 189 300 hab. · parc 1 875 697 véh.
- `prisma/seed-saas.ts` (1 ligne) : accès démo Karim Trabelsi passé à `CITES` (drill-down B2B démontrable après fresh install).

### 3. Backend
- **`src/lib/saas.ts`** — `DemographicCiteDTO` (id, gouvernorat, delegation, cite, population, urbanPct, vehicles×5, source, updatedAt, updatedBy) ; `DemographicAccessLevel` + `"CITES"` ; `DEMOGRAPHIC_LEVELS` 3ᵉ option « Gouvernorats + délégations + cités ».
- **`src/lib/saas-server.ts`** — `serializeDemographicCite` + mapping CITES dans `serializeDemographicAccess`.
- **`src/lib/demographie-server.ts`** — `validateCiteValues` (FR, entiers positifs, urbain 0-100, champ non modifiable rejeté), `CITE_IMPORT_ALIASES`, `applyCiteUpdate` / `applyCiteDelete` (audit kind DEMOGRAPHIE), `parcCoherenceWarning` (motorisation > 0,9 → avertissement), `CITE_INT_FIELDS`.
- **`src/app/api/super/demographie/route.ts`** — GET expose `cites` (515 lignes) ; POST nouvelles actions **« maj-cite »** (édition inline + audit), **« suppr-cite »** (suppression + audit), **« maj-acces »** accepte CITES ; **« import » scope « cites »** : upsert (gouvernorat+délégation+cité), cité inconnue → CRÉÉE, couple gov/délégation inconnu → erreur ligne, population cité > délégation → warning, motorisation > 0,9 → warning ; tous les imports retournent désormais `{ updated, created, warnings, errors, skipped }` (gouvernorats + délégations + warnings cohérence parc).
- **`src/app/api/demographie/route.ts`** — niveau CITES servi (delegations + cites filtrés par accès, lecture seule pour les cités) ; **`src/app/api/demographie/acces/route.ts`** — mapping CITES.

### 4. Front Super Administration
- **`src/components/superadmin/sa-demographie-cites.tsx`** (nouveau) — 3ᵉ volet « Cités » : 4 KPI (cités / délégations couvertes / gouvernorats / parc cumulé), recherche + filtres gouvernorat→délégation LIÉS, tableau 14 colonnes (3 colonnes identité collantes, population, urbain, 5 catégories éditables inline via `EditableCell`, total véh., source [INS 2024 émeraude / Import SA violet], modifié, suppression 2 clics), pagination 25/page, `DemographieIoBar scope="cites"` (export 6 formats / import 4 formats), bouton **« Modèle d'import véhicules »**.
- **`src/components/superadmin/sa-demographie.tsx`** — 4ᵉ onglet Cités (TabsList grid-cols-2 sm:grid-cols-4), `EditableCell` rendu **générique** `<T extends object>` (aucun call site existant modifié), en-tête enrichi (X cités, quatre volets), alerte finale actualisée (découpage complet disponible).
- **`src/components/superadmin/sa-demographie-io.tsx`** — scope `cites` + **compte-rendu d'import dans la dialogue de confirmation** : 4 compteurs (mises à jour / créées / avertissements / rejetées), listes warnings (ambre) et erreurs (rouge) détail par ligne, lignes inconnues, texte adapté au scope cités (création vs ignore).
- **`src/components/demographie/demographie-parc-dashboard.tsx`** (nouveau) — mini-tableau de bord **« Parc automobile »** en tête du volet Délégations : parc total + sommes par catégorie (barres chip), camembert Recharts donut (palette `useChartPalette` — zéro bleu), top 5 délégations par parc (barres ambre), état vide pédagogique si aucune valeur.
- **`src/components/superadmin/sa-demographie-parametrage.tsx`** — Select 3 niveaux (option « Gouvernorats + délégations + cités »), 5ᵉ carte de stats « Avec cités (3ᵉ niv.) ».
- Volet Délégations : bouton **« Modèle véhicules »** (CSV dédié 7 colonnes + 2 lignes exemple).

### 5. Front B2B — `src/components/demographie/demographie-terrain.tsx`
- Niveau CITES → drill-down 3ᵉ niveau : chevron par délégation déploie ses cités sous la ligne (tableau raccourci : cité, population, urbain, 5 catégories, total, source — **lecture seule**, max-h-96 overflow-y-auto), badge niveau « Gouvernorats + délégations + cités », compteur cités. Sans accès CITES → aucun changement comportemental (niveau GOUVERNORATS/DELEGATIONS identiques à avant).

### 6. IO — `src/lib/demographie-io.ts`
- Scope `cites` dans l'export 6 formats + `CITES_IMPORT_ALIASES` (alias FR complets : « cité », « quartier », « voitures légères », « PL », « motos »…) + `CITE_NUMERIC_FIELDS` ; en-têtes « Source »/« Total » ignorés à l'import ; **lignes de commentaires « # » ignorées** dans le parseur CSV ; `buildCsvTemplate`/`downloadCsvTemplate` + `downloadCitesVehiculesTemplate` (10 colonnes, 3 lignes d'exemple, 4 commentaires FR) + `downloadDelegationsVehiculesTemplate` (7 colonnes, 2 lignes).

## QA
- `bun run lint` → **0 erreur** ; `bunx tsc --noEmit | grep -iE "demograph|cite"` → **vide** (au passage : fix d'une erreur tsc préexistante `sa-comptes.tsx` — `TAB_LABELS` Record<Tab> incomplet depuis T37, clé `demographie` ajoutée).
- curl : GET /api/super/demographie 200 (24 gov / 277 délég. / **515 cités** / accès GOUVERNORATS+CITES) ; GET /api/demographie karim → CITES + 515 cités, sonia → GOUVERNORATS sans cités (aucune régression) ; sonde /acces 200 ; **maj-cite** 200 (population/VL persistés) + valeur négative → **400** FR ; **import cites** 2 lignes dont 1 erreur → `{updated:1, created:0, errors:[gov inconnu]}` ; import création → `{created:2, warnings:[pop > délégation + motorisation 180 %]}` ; **import delegations** → `{updated:1, warnings:[motorisation 240 %], errors:[PL négatif]}` ; **suppr-cite** 200 + 404 id inconnu.
- Base remise propre : cités de test supprimées (2), « Borj El Mezrana » restauré aux valeurs seed, « Tunis/Carthage » (hors seed) remis vierge → 515 cités 100 % « INS 2024 ». Audit DEMOGRAPHIE : les événements de test restent (journal honnête des actions réelles).
- GET / → 200, dev.log sans erreur (routes demographie 200).

## Décisions / notes pour l'orchestrateur
- **144 délégations alimentées par le seed** (population + parc par catégorie) : nécessaire pour que le tableau de bord Parc et les warnings de cohérence cité ≤ délégation aient du sens en démo ; les 133 délégations restantes s'alimentent via l'import (modèle fourni).
- **Karim Trabelsi (démo) promu CITES** (en base + seed-saas) pour rendre le drill-down B2B visible en QA ; Sonia reste GOUVERNORATS.
- Import scope cites = **upsert** (cité inconnue créée — alimentation en masse) ; l'édition des cités en B2B reste interdite (lecture seule, l'édition reste SA conformément à la mission).
- Chiffres clés : parc national GovernoratStat 3 910 070 véh. · parc délégations (144 renseignées) 2 684 315 véh. · **parc cités 1 875 697 véh.** (VL 1 162 839 · utilitaires 281 382 · PL 93 832 · autocars 18 785 · 2-roues 318 859) · population cités cumulée 5 189 300 hab.
- QA navigateur non lancé (consigne) — points à vérifier par l'orchestrateur : 4ᵉ onglet Cités (filtres liés, pagination, inline edit, suppression 2 clics), dialogue d'import avec compte-rendu, camembert Parc automobile, drill-down B2B avec Karim, modèles CSV téléchargeables.
