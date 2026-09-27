# T45-b — Agent « pdf-exports » — Exports PDF rapportés

Statut : TERMINÉ (lint 0, tsc filtré 0, GET / 200, 8 générateurs testés E2E avec données réelles).

## Objectif
Générer de VRAIS fichiers PDF pour les rapports de la plateforme (B2B module A.8 + Shadow Market) — le format « PDF » était affiché sans qu'aucun fichier ne soit produit.

## Fichiers livrés

### Nouveaux
- **`src/lib/report-pdf.ts`** — socle de composition PDF client-only (`"use client"`, importé uniquement par des composants clients). `createReportPdf({ title, subtitle?, classification?, brandColor? (#059669 défaut), metaLines? })` → `{ doc, cursor, theme }` : A4 portrait, page de garde stylisée (bandeau 27 mm couleur marque + liseré, « CarbuScope », classification « DIFFUSION RESTREINTE », titre, filet décoratif, date FR, métadonnées). Helpers : `sectionTitle`, `kpiGrid` (2 colonnes encadrées), `table` (autoTable : head sombre marque, zébrures, tailles 8), `bulletList`, `paragraph`, `checkPage` (saut auto y > 272), `finish(pdf, filename)` → pied « Généré par CarbuScope — page N/M » gravé sur toutes les pages + `doc.save` + retour `{ filename, sizeKb }` (taille réelle du blob), `pdfStamp()`. Encodage WinAnfi assaini (`winAnsiSafe` : flèches, ≥, chiffres cerclés, **espaces fines U+202F/U+00A0 du séparateur de milliers fr-FR**).
- **`src/components/reports/reports-pdf.tsx`** — B2B : `generateB2bReportPdf(report, brandSlug)` compose le contenu AU CLIC via `/api/stats/overview?brand=`, `/api/stats/gouvernorats?brand=`, `/api/stats/market-share`, `/api/stats/movements`, `/api/alerts?limit=10` (+ `/api/governorats` pour IMPLANTATION, `/api/shadow/reports` pour le type SHADOW → délégation au générateur rouge). 4 compositions : CONCURRENCE / IMPLANTATION / PERFORMANCE / VEILLE (+ défaut + SHADOW). Export `ReportPdfButton` (icon | label) avec Loader2 + toasts. Noms : `carbuscope-rapport-{type}-{AAAA-MM-JJ}.pdf`.
- **`src/components/shadow/reports/shadow-pdf.ts`** — 4 générateurs Shadow (rouge #E53935) : `downloadMonthlyShadowPdf` (blocs 1 Synthèse / 2 KPIs / 3 Top 10 menaces / 4 gouvernorat top 12 / 5 Recommandations / note méthodologique 0,190 DT/L × 30,4 j + 3 stations proches) → `shadow-rapport-mensuel-{AAAA-MM}.pdf` ; `downloadBrandShadowPdf` (carte d'identité enseigne + SES stations + SON gouvernorat, marge/seuils `map.config`) → `shadow-rapport-enseigne-{slug}-{date}.pdf` ; `downloadCustomShadowPdf` (SEULEMENT les blocs cochés) → `shadow-rapport-personnalise-{du}_{au}.pdf` ; `downloadShadowSummaryPdf` (blocs 1+2+5) → `shadow-synthese-{date}.pdf`. Tous renvoient `{ filename, sizeKb }`.

### Modifiés (wiring uniquement)
- `src/components/reports/reports-tab.tsx` — bouton PDF dans colonne Actions + vue cartes (`ReportPdfButton`).
- `src/components/shadow/reports/report-paper.tsx` — bouton « Télécharger PDF » (props `onDownloadPdf?` / `pdfBusy?`) + « Imprimer / PDF » renommé « Imprimer ».
- `src/components/shadow/reports/shadow-reports.tsx` — MonthlyTab : handler + busy + wiring papier.
- `src/components/shadow/reports/brand-report-tab.tsx` — actions « Télécharger PDF » + « Imprimer » + wiring papier (marge/seuils config).
- `src/components/shadow/reports/custom-report-tab.tsx` — bouton « Télécharger PDF » dans l'étape résultat (indicateurs cochés respectés).
- `src/components/shadow/reports/export-share-tab.tsx` — 5e carte « PDF — synthèse mensuelle », journal de session avec sizeKb RÉEL.

## QA
- E2E bun contre le serveur dev réel (fetch relatifs réécrits) : B2B 36/41/46/35 Ko + SHADOW 61 Ko (délégation), Shadow mensuel 61 Ko / synthèse 17 Ko / enseigne / personnalisé. Contenus vérifiés `pdftotext` (2 985 stations, Agil 41,2 %, 847 points, Ola Energy Remada 1 55 K DT, pieds « page 1/2 »). Artefacts nettoyés.
- `bun run lint` → 0 erreur ; `bunx tsc --noEmit` filtré sur les 10 fichiers → vide (159 erreurs préexistantes hors périmètre) ; `GET /` → 200 ; dev.log propre.
- Bug corrigé en cours de route : séparateur de milliers fr-FR U+202F illisible en WinAnsi (« 2 /985 ») → normalisation espace classique dans `winAnsiSafe`.

## Décisions / notes pour l'orchestrateur
- **sizeKb réels** : aucune route PATCH (api/* interdit) — le POST « Régénérer » garde son sizeKb serveur ; la taille réelle des PDF est tracée dans le journal de session client (onglet Export/Partage, pattern T44-e).
- jsPDF 4 en **Node/bun** écrit `doc.save()` sur le disque (cwd) ; en navigateur le téléchargement est normal — les tests bun ont laissé des PDF à la racine, supprimés.
- Le tableau « Rapports récents » du module A.8 est alimenté par `/api/reports` qui renvoie désormais les **rapports de visite terrain** (T28) : lignes sans `name/type/period/…` → colonnes vides et POST « Générer » en 400. Hors de mon périmètre (api/* interdit) — mon bouton PDF dégrade proprement (type inconnu → composition VEILLE générique, titre de repli). À trancher côté orchestrateur.
- QA navigateur (clics réels, toasts, fichiers téléchargés) à faire par l'orchestrateur — points d'entrée : A.8 Rapports (bouton PDF par ligne + carte), Shadow Market → Rapports → 4 onglets.
