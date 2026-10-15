# CarbuScope — Proposition « Media Planner »

> **Objet** : proposition complète du module Media Planner en **outil de
> simulation de campagnes publicitaires**, rédigée à la demande de
> l'utilisateur (round T57) après ses arbitrages initiaux :
> - le module doit **attirer l'attention du tenant (enseigne) et du client** ;
> - intégrer **tous les types de supports médiatiques** (tous types
>   d'affichage et modes) ;
> - **commencer par un test** : la liste des panneaux publicitaires avec
>   toutes les données attributaires possibles (table imbriquée, carte,
>   filtres) — **livré dès ce round** ;
> - l'outil final doit **simuler des campagnes publicitaires**.

Ce document est la référence de cadrage ; les idées non retenues restent
consignées dans `propositions-en-attente.md`.

---

## 1. Positionnement

Le Media Planner est le **premier module « revenu »** de CarbuScope : il
transforme la connaissance terrain (trafic, parc, zones, concurrence) en
**décisions média chiffrées**. Deux lecteurs :

| Lecteur | Ce qu'il y gagne |
|---|---|
| **Le tenant (enseigne)** | Planifier, arbitrer et chiffrer ses campagnes : où afficher, combien ça coûte, combien de contacts — avec la donnée CarbuScope en socle plutôt qu'un tableur. |
| **Le client / prospect franchisé** | Un argumentaire visuel : « voici où votre future station sera vue », potentiel d'affichage local, plan média d'ouverture. |

Le principe directeur : **chaque décision d'achat média doit être justifiable
par un chiffre** (contacts, CPM, couverture) — pas par l'intuition.

---

## 2. Le référentiel supports (le socle)

« Tous types d'affichage et modes » — le référentiel couvre 3 familles :

### 2.1 Affichage externe (achat auprès de régies)
- **Grand format urbain** : 4×3 (12 m²), 8 m², 16 m², panneaux muraux,
  totems directionnels, pré-enseignes ;
- **Mobilier urbain** : abribus, bornes, sucettes, kiosques ;
- **Digital OOH (DOOH)** : écrans numériques roadside, panneaux déroulants,
  trivisions — diffusion programmable (jour/heure), comptage horodaté.

### 2.2 Média propriétaire (réseau CarbuScope — gratuit, prioritaire)
- **En station** : totems prix, écrans Pompe (habillage pumpes, écran
  attendant), vitrines PLV, totem d'entrée, habillage boutique ;
- **Réseau enseigne** : l'ensemble des stations de l'enseigne devient un
  réseau d'affichage mutualisé — le media planner le valorise à coût marginal.

### 2.3 Extensions (hors affichage, phases ultérieures)
- Radio locale, presse, digital/social — intégrées comme **lignes de plan
  média** dans la simulation (coût/contact saisi, sans referentiel carto).

### 2.4 Données attributaires du référentiel (exigence « toutes les
données possibles » — implémenté en P1)

| Bloc | Champs |
|---|---|
| **Identification** | code unique, repère/nom, réseau (régie externe / propriétaire CarbuScope), statut (disponible, réservé, occupé, maintenance) |
| **Support** | type, format (surface m²), orientation (horizontale, verticale, double face, trivision, déroulant), éclairage (avant, rétroprojeté, non éclairé) |
| **Emplacement** | gouvernorat, délégation, ville, axe/voie (RN, autoroute, boulevard), latitude/longitude, face (N/S/E/W), hauteur, environnement (urbain, périurbain, routier, commercial, station) |
| **Audience** | trafic véhicules/jour, flux piétons/jour, visibilité notée /100, contacts journaliers estimés |
| **Commercial** | coût mensuel (DT), disponibilité, état (bon, moyen, à rénover), dernier contrôle, notes libres |
| **Calculé** | CPM (coût pour mille contacts), coût/semaine, part du budget |

---

## 3. Le cœur : le simulateur de campagnes

### 3.1 Le flux utilisateur proposé (builder en 4 pas)

1. **Objectif & cadre** — nom de campagne, objectif (notoriété / trafic
   station / promotion produit), période (semaines, avec périodes clés
   suggérées : été, ramadan, rentrée), budget cible DT ;
2. **Sélection des supports** — depuis l'inventaire filtré (nested table +
   carte) : panier de supports, bascule propriétaire/externe, zones
   (gouvernorats) ;
3. **Simulation instantanée** — chaque ajout recalcule : budget, contacts,
   portée, fréquence, CPM, GRP, couverture carte (fond OSM) ;
4. **Comparaison & arbitrage** — 2-3 scénarios côte à côte (A : propriétaire
   d'abord, B : mix affichage, C : premium DOOH), export PDF « plan média »
   (pattern jsPDF CarbuScope) à remettre à la régie ou valider en interne.

### 3.2 Le moteur d'estimation (transparent, défendable)

Formules V1 — volontairement **simples, auditéables et affichées à
l'utilisateur** (le crédit du module repose sur cette transparence) :

```
contacts/semaine(un support) = contacts/journaliers × 7 × facteur périodes
portée brute      = Σ contacts
fréquence moyenne = portée brute / portée nette estimée
portée nette      = portée brute × (1 − 0,18 × doublons inter-supports)
GRP               = portée nette / population cible zone × 100
CPM               = coût total / (contacts / 1 000)
budget            = Σ (coût mensuel / 4,345 × semaines)
```

- le **facteur périodes** encode les pics tunisiens (ramadan +25 %, été
  +15 % sur les axes balnéaires, rentrée +10 %) ;
- les **contacts journaliers** du référentiel sont croisés à la donnée
  CarbuScope (trafic des axes `RoadSegment`, parc par gouvernorat) — c'est le
  **différenciateur « CPM réel par zone »** : les estimations ne sortent pas
  d'un tableur générique, elles sortent du terrain CarbuScope ;
- **Phase 2 : optimiseur glouton** — « maximiser les contacts sous budget B »
  (tri par CPM croissant, respect d'un équilibre de zones et d'un plafond de
  doublons), proposé comme **recommandation** à côté de la sélection manuelle
  (jamais imposé).

### 3.3 Restitution

- **KPI live** pendant la sélection (budget, contacts, CPM, GRP, fréquence) ;
- **carte de couverture** : supports sélectionnés en surbrillance (fond OSM —
  convention T57 « toutes les cartes fond OSM »), zones sans couverture
  grisées ;
- **calendrier Gantt léger** : semaines × supports, conflits de disponibilité
  signalés (support déjà réservé) ;
- **rapport PDF** : plan média, budget détaillé, cartes et KPI, mention
  « estimations CarbuScope — à valider ».

---

## 4. Phasage proposé

| Phase | Contenu | Statut |
|---|---|---|
| **P1 — Test inventaire** (ce round) | Référentiel panneaux (~72 supports réalistes, 24 gouvernorats), **table imbriquée** (gouvernorat → panneau → fiche attributs complète), **carte OSM** (fond OSM par défaut, popup riche, focus depuis la table), **filtres** (recherche, gouvernorat, type, format, statut, budget max), **mini-simulation** (sélection → budget/contacts/CPM/semaines). | **Livré** |
| **P2 — Simulateur complet** | Builder 4 pas, moteur d'estimation + facteur périodes, scénarios A/B/C, optimiseur glouton, persistance campagnes (statut brouillon → validée). | Cadré, prêt |
| **P3 — Calendrier & réservations** | Gantt semaines × supports, conflits, blocage de disponibilité, validation en flux, lien promotions Portail enseigne. | Cadré |
| **P4 — Rapports & extensions** | PDF plan média, lentille SA multi-enseignes, lignes radio/presse/digital, croisement Shadow Market (contre-communication zones grignotées). | Vision |

---

## 5. Mon avis (les 3 paris gagnants)

1. **Média propriétaire d'abord** — une enseigne carburant possède déjà un
   réseau d'écrans/totems : le simulateur doit afficher en permanence le
   ratio « propriétaire / externe » du budget. Le plan le plus rentable
   commence par activer ce qu'on possède déjà (coût marginal ≈ 0).
2. **CPM réel par zone** (le différenciateur) — personne en Tunisie ne peut
   croiser trafic d'axes + parc + zones de marché parallèle comme CarbuScope.
   L'affichage acheté là où le shadow market grignote = défense de zone
   chiffrée, argument commercial envers le tenant.
3. **Transparence du moteur** — chaque chiffre cliquable renvoie à sa
   formule et ses données sources. La confiance est le produit.

---

## 6. Questions restantes (peu nombreuses)

- [ ] Le référentiel P1 couvre l'affichage externe + propriétaire station :
      priorité de volumétrie ? (actuellement ~72 supports équilibrés)
- [ ] P2 : la validation de campagne est-elle hiérarchique (DG valide) ou
      libre (ADMIN) ?
- [ ] P4 : une intégration de régies externes (API/file) est-elle envisagée
      côté votre écosystème, ou saisie interne suffisante ?

---

*Proposition round T57 — le test P1 est livré dans ce même round :
menu Media Planner → onglet « Inventaire panneaux ».*
