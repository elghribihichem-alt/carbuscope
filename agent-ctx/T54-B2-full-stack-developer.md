# T54-B2 — moteur de scoring 5 critères + Top 50 + ZoneAlert + éditeurs SA

Agent : full-stack-developer · Début : lecture worklog (T54-A0/A1/A2B1), conventions respectées
(palette émeraude/ambre/terracotta, zéro bleu/indigo, UI FR, chiffres FR via `num` de lib/chart,
discipline 4 Go : navigateurs tués avant agent-browser, une seule session, jamais `bun run build`,
dev server jamais tué — curl /api/brands 200 vérifié au départ).

## Données en base vérifiées (script ponctuel tmp-checks, supprimé ensuite)
- OpportunityConfig « default » : 30/20/25/15/10, seuils 35/70, updatedBy null.
- PurchasingPower 24 (indice 38-95), LandIndicator 24 (Tunis 1450 DT/m², dispo 22 → Tataouine 110, 82).
- RoadAxis 9 (A1/A2/A3/A4/RN1/RN3/RN10/GP9/RN2, segments [[lng,lat],…]) — tous partent de Tunis sauf RN10.
- GovernoratStat 24 (Tunis 581 880 véh. ; écart avec somme DemographicDelegation sur les 24/24 →
  GovernoratStat retenu comme référence du parc, conformément au contrat).
- DemographicDelegation 277 — 144 avec parc/population renseignés, 133 null (reliquat réparti, est.).
- Station : 2 985 (2 796 ACTIVE + 109 RENOVATION en service), delegation toujours renseignée.
- ZoneAlert 0 (à remplir dynamiquement). Users : rania.feki@carbuscope.tn (SUPER_ADMIN, sans 2FA),
  sonia.beji@agil.tn (ADMIN agil) — mot de passe réel « carbuscope » (seed V7).

## Décisions de conception (documentées dans le code + worklog)
1. **Trafic — affectation par SEGMENT** (pas par axe entier) : la méthode littérale « axe → gouvernorat
   du point médian » concentrait 100 % de l'A1 sur Monastir et laissait Tunis à 0 (irréaliste, contredit
   l'attente QA « Tunis/Grand Tunis en tête trafic »). Chaque segment est affecté au gouvernorat dont le
   chef-lieu (table des 24 centroïdes réels en dur) est le plus proche ; le TMJ pondéré de l'axe
   (tmj × (1 + %PL/100)) est réparti au prorata des segments tombant dans chaque gouvernorat.
   Résultat mesuré : Tunis 26 381 (n°1), Bizerte 18 915, Béja 15 130, Manouba 13 167, Sfax 12 091…
2. **Concurrence** : ratio véh./station en service (même logique que computeGovStats, fichier gelé non
   touché), normalisé min-max (plus le ratio est haut = moins de concurrence = score haut).
3. **Foncier** : (disponibilité normalisée min-max + inverse du prix normalisé) / 2.
4. **Pouvoir d'achat** : indice 0-100 utilisé tel quel (déjà normalisé par conception).
5. **Délégations** : parc réel min-max sur les 277 ; reliquat du gouvernorat réparti sur les délégations
   sans parc (badge est.) ; 4 autres critères hérités du gouvernorat × facteur population
   (pop_délégation / pop moyenne des délégations du gouvernorat, borné ×[0,5 ; 2]) — interprétation
   documentée du « prorata de population » du contrat.
6. **Alertes idempotentes** : dédoublonnage gov+type+seuil non acquitté < 24 h (message/score rafraîchis) ;
   une non acquittée > 24 h est REMPLACÉE (supprimée + recréée) ; les acquittées sont conservées (historique).

## Fichiers créés
- src/lib/radar/scoring.ts (moteur pur)
- src/app/api/radar/{scoring,alerts,config,indicators}/route.ts
- src/components/radar/radar-scoring.tsx, radar-alerts-banner.tsx
- src/components/superadmin/sa-radar.tsx

## Fichiers modifiés (additif strict)
- radar-module.tsx (volet scoring réel + bandeau alertes), superadmin-view.tsx (+volet radar),
  app-sidebar.tsx (+item SA), fr.ts (+clé sb.sa.radar).

## Suivi (mis à jour en fin de round)
- Statut : TERMINÉ — moteur, 4 routes, volet enseigne, bandeau alertes, console SA,
  QA E2E complète (curl + navigateur), restaurations vérifiées, worklog appendé, commit fait.
- QA complémentaire session de reprise : dev server retrouvé mort au démarrage (tué par
  l'interruption de la session précédente) → relancé `(setsid bun run dev &)`, curl 200 avant/après.
  curl : 401 sans session (config + alerts), 400 FR somme=95 et poids négatif, PATCH indicateur
  Tunis 95→90→95, cycle config 40/15/25/10/10 → top3 Tunis 81,7 → remise défaut. Navigateur :
  bandeau 6 alertes → acquittement Ariana FONCIER (Sonia, toast, 5 restent actives) ; Sheet Tunis
  (21 délégations, TMJ 26 381, mini-carte) ; what-if slider parc +1 → Tunis 77,7→77,9 instantané
  + reset ; Top 50 (El Menzah n°1) ; SA sliders 40/10/25/15/10 → Enregistrer → enseigne revoit
  « Parc 40 · Pouvoir 10 » et Tunis 78,2 → restaure 30/20/25/15/10 ; éditeur inline indice Tunis
  95→93→95 ; régression SA Utilisateurs saine ; 390 = scrollWidth 390 (clair + dark + Sheet) ;
  0 erreur console + 0 page error sur toute la session. Captures 18→29 ajoutées aux 01→17.
- État final DB : config 30/20/25/15/10 (défaut), indicateurs Tunis PP 95 / foncier 22 DT 1 450
  (valeurs seed, seules traces updatedBy/updatedAt), 6 alertes (5 actives + 1 acquittée par
  sonia.beji@agil.tn), 19 événements d'audit RADAR documentant tous les cycles test + restauration.
- tmp-checks/ supprimé (scripts ponctuels).
