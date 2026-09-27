# T44-d — Agent shadow-front-c (Recensement + Analyse d'Impact)

Task ID : T44-d · Module Shadow Market (CarbuScope) · Statut : TERMINÉ

## Périmètre
- `src/components/shadow/recensement/` — 8 fichiers (shadow-recensement.tsx remplacé + 7 nouveaux)
- `src/components/shadow/impact/` — 7 fichiers (shadow-impact.tsx remplacé + 6 nouveaux)
- Aucun fichier hors périmètre modifié (shadow-view / shadow-shared / types / api / app-store intacts).

## Fichiers livrés
| Fichier | Rôle |
|---|---|
| recensement/shadow-recensement.tsx | Conteneur 6 onglets (➕📝🔄👥✅📸), export `ShadowRecensement({ onNavigate? })` |
| recensement/recensement-shared.tsx | Constantes métier, KIND_COLORS, CSV, PointDetailDialog (+ historique) |
| recensement/tab-new-point.tsx | Saisie terrain : GPS ±0,001, typologies radio, aperçu temps réel (perte + station la plus proche + alerte < 500 m) |
| recensement/tab-points-list.tsx | Tableau CRUD paginé (25/page), filtres serveur, édition PATCH, disparition DELETE soft, export CSV |
| recensement/tab-updates.tsx | Timeline cycle de vie, chips kind + gouvernorat, stats du mois, « disparu puis réapparu » (Eye) |
| recensement/tab-auditors.tsx | Cartes auditeurs, productivité vs moyenne, Dialog add/edit, BarChart + ReferenceLine |
| recensement/tab-validation.tsx | Workflow BRUT→VERIFIE→VALIDE/REJETE/DOUBLON, multi-sélection groupée, délai moyen, 5 compteurs |
| recensement/tab-gallery.tsx | Galerie photos (overlay, aspect 4/3), filtres, grande photo + fiche, export CSV métadonnées |
| impact/shadow-impact.tsx | Conteneur 5 onglets (💸📉⚖️📈🎯), station sélectionnée + fiche impact partagées |
| impact/impact-shared.tsx | StationPicker (recherche + chips enseignes + top 20), TipShell/TipRow, anneaux 500 m/1 km/2 km |
| impact/tab-station-loss.tsx | Fiche station + 4 KPI + points cannibalisateurs (tri distance) + camembert typo + anneaux + voisines |
| impact/tab-region-loss.tsx | Top 12 gouvernorats (couleur niveau) + tableau triable + comparatif enseignes (surlignage scope BRAND) |
| impact/tab-cannibalisation.tsx | Jauge RadialBar ratio, officiel (traffic×8 L) vs informel, densité anneaux, mini-carte SVG, analyse auto |
| impact/tab-trend.tsx | ComposedChart points+perte (double axe, ReferenceLine ◆ notes) + AreaChart naissances/neutralisations + KPI |
| impact/tab-simulation.tsx | « What if » prix (périmètre lié, slider 0–400 mill., 4–24 sem.), courbe baseline/projeté, interprétation auto |

## Conventions respectées
- Anti « set-state-in-effect » STRICT : tous les fetch en AbortController + setState uniquement dans `.then` ; états de rechargement dérivés (garde `impact.station.code === selectedCode`, `fetched.code === code`) au lieu de resets synchrones.
- Charte métier via shadow-shared uniquement (SHADOW_COLORS, ShadowKpiCard, badges, formatTnd/LJ/Millimes, TYPOLOGY_PHOTOS…) — zéro duplication.
- Toasts sonner sur toutes les mutations ; listes longues `max-h-* overflow-y-auto` ; tabs shadcn libellés avec emoji ; charts Recharts colorés par typologie/niveau/enseigne.

## Validation
- `bunx eslint src/components/shadow/recensement src/components/shadow/impact` → **0 erreur, 0 warning**
- `bunx tsc --noEmit | grep -E "recensement|shadow/impact"` → **vide**
- `GET /` 200 (bundle complet compile) ; toutes les routes consommées curl 200/201.
- POST point de test : **SM-26-0930** (Sfax · BIDONS · 250 L/j · 2 300 mill.) — GET détail (APPARITION), PATCH volume 310 (VOLUME), PATCH VERIFIE (STATUT), DELETE (DISPARITION, active=false) → point conservé inactif en base.

## Pièges rencontrés (pour les agents suivants)
- Chemins d'imports relatifs depuis `shadow/impact/tab-*.tsx` : `../shadow-shared` (1 niveau) et `./impact-shared` — pas `../../`.
- PATCH `/api/shadow/points/[id]` : `{ status }` doit être l'UNIQUE clé du body (sinon branche terrain) ; transitions : BRUT→VERIFIE/REJETE/DOUBLON, VERIFIE→VALIDE/REJETE/DOUBLON (BRUT→VALIDE refusé 400).
- `/api/shadow/updates` : `limit` plafonné à 300 et `kind` = une seule valeur → filtres multi-kind en client.
- Le dev server tombe 500 globalement quand un import client est manquant (traces settings/reports pendant l'écriture parallèle) : patienter, ça repart tout seul.
- Radix TabsContent démonte l'onglet inactif → les onglets se rechargent à chaque activation (prévu), l'état partagé (station sélectionnée) est porté par shadow-impact.tsx.
