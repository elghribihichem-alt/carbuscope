# CarbuScope — Propositions en attente (backlog collaboratif)

> **Règle convenue avec l'utilisateur (T56)** : toute proposition faite et non
> exécutée immédiatement est consignée ici. Nous reviendrons tout reprendre,
> une fois, ensemble. Chaque entrée porte le round d'origine, l'état et les
> questions ouvertes. Ce document ne remplace pas `worklog.md` (journal
> technique d'exécution) : il est le **carnet des idées en suspens**.

---

## 1. Media Planner — vision proposée (round T56, statut : **P1 livré en T57**)

Le menu + la coque + le volet « Vue d'ensemble » sont livrés en T56.
Arbitrages de l'utilisateur (round T57) : le module couvre **tous types de
supports** (affichage externe + propriétaire, extensions radio/presse/digital
en phases ultérieures) et **commence par le test inventaire** — livré :
onglet « Inventaire panneaux » (table imbriquée, carte OSM, filtres, sélection
+ mini-simulation). La proposition complète vit désormais dans
**`docs/media-planner-proposition.md`** (référence de cadrage) : simulateur de
campagnes 4 pas, moteur d'estimation transparent, phasage P1→P4, les 3 paris
gagnants. Cette section garde la trace des arbitrages.

### Volets proposés
1. **Campagnes & calendrier** — plan annuel (affichage, radio locale, digital,
   écrans en station), périodes clés (été, ramadan, pics), validation en flux.
2. **Inventaire supports** — référentiel panneaux / pré-enseignes / totems /
   écrans DOOH / habillage pompes : disponibilités, emplacements, coûts.
3. **Ciblage & budget** — allocation par gouvernorat/zone avec portée estimée
   depuis les données CarbuScope (trafic des axes, parc, pouvoir d'achat).
4. **Média en station** — plan PLV/écrans station par station, synchronisé
   avec les promotions actives et les hubs TMP.
5. **Performance & rapports** — suivi livré/budget/contacts, export PDF
   (pattern Rapports), restitution par enseigne et par zone.

### Mon avis (à discuter)
- **Différenciateur « CPM réel par zone »** : CarbuScope connaît trafic, parc
  et pouvoir d'achat → recommander où acheter de l'affichage pour maximiser
  les contacts là où l'on vend, et défendre les zones grignotées par le marché
  parallèle (croisement Shadow Market × Radar).
- **Média propriétaire d'abord** : une enseigne carburant possède déjà un
  réseau d'écrans/totems/pré-enseignes (média propriétaire gratuit) —
  l'inventaire + le calendrier sont la fondation la plus rentable avant
  d'acheter de l'espace externe.

### Questions ouvertes (restantes — les autres sont tranchées)
- [x] Périmètre : **tous types de supports** (affichage externe + propriétaire
      + extensions) — arbitré par l'utilisateur en T57.
- [x] Démarrage : **test inventaire panneaux** (nested table + carte +
      filtres) — livré en T57.
- [ ] Budget : planification annuelle glissante ? Multi-enseignes (lentille SA) ?
- [ ] Inventaire : intégration de régies externes ou référentiel interne saisi ?
- [ ] KPI de réussite : contacts/GRP, ou drive-to-store (attributions CA) ?
- [ ] Lien direct avec les promotions du Portail enseigne (décliner une promo
      en campagne écran/totem automatiquement) ?
- [ ] P2 : validation hiérarchique (DG) ou libre (ADMIN) ?

---

## 2. Réduction d'échelle 15 % — voie « zoom » rejetée (round T56, statut : **rejetée, documentée**)

Testée empiriquement (navigateur réel) avant implémentation : un `zoom: 0.85`
global donne une réduction parfaitement uniforme (rem + px) mais **désaligne
tous les menus déroulants Radix** (portals positionnés par Popper hors du
contexte zoomé — écart mesuré ≈ 15 % sur 190 px). Retenue à la place : racine
typographique 12.8 → 10.88 px + compensation ciblée des ~2 000 libellés
`text-[Npx]` et icônes 14-22 px (réversible via `--cs-scale`, voir
`globals.css`). Si un jour un besoin de « zoom exact uniforme » revient, la
piste serait un **conteneur de portal Radix dédié** dans le contexte zoomé
(invasif — à re-discuter).

---

## 3-bis. Module « Publicité » — cadrage utilisateur T58 (statut : **livré en T58**)

Clarification de l'utilisateur (T58) : le Media Planner actuel (panneaux/stations)
est **conservé tel quel** ; un NOUVEAU module « Publicité » offre les listes des
supports publicitaires **d'autres régies** — l'enseigne regarde ce qui existe sur
le terrain avant de lancer une campagne, avec un simulateur de campagne et des
rapports. Spécification livrée :

- **Sous-menu 1 — Listing des supports** : onglets *Cartographie · RFR · Metro ·
  Urbain*, données fictives par mode (130 supports seedés), table imbriquée par
  régie, carte OSM, filtres, sélection.
- **Sous-menu 2 — Simulateur publicitaire** : cadrage (nom, objectif, durée,
  période clé, budget cible), 6 KPI (budget, contacts, portée nette, fréquence,
  GRP, CPM), mix par mode/régie, couverture par gouvernorat, **enregistrement
  persisté** (POST recalculé serveur + snapshot des supports).
- **Sous-menu 3 — Rapports** : tous les rapports des campagnes enregistrées
  (KPI, mix par mode, supports, export CSV) + 3 campagnes d'exemple.

### Interprétations documentées (à valider ensemble)
- Onglet « Cartographie » = grands formats géolocalisés (panneaux 4×3/8 m²,
  muraux, pré-enseignes, totems digitaux, DOOH) sur axes routiers — les 3 autres
  onglets sont les réseaux de transport et le mobilier urbain.
- Régies fictives plausibles (réutilisation des 5 du Media Planner + 3
  transport/mobilier : Métro Média Tunisie, Rail Média, Ferrovia Affichage,
  Urbania Mobilier, Cité Affichage).
- Rapports alimentés par l'enregistrement simulateur (statut SIMULEE) — la
  gestion du cycle de vie (BROUILLON→VALIDÉE→LIVRÉE) est un P2 possible.

### Suites possibles (P2+)
- [ ] Export PDF des rapports de campagne (pattern Rapports shadow).
- [ ] Cycle de vie des campagnes + validation DG.
- [ ] Optimiseur glouton (recommandation de supports sous budget).
- [ ] Vue supervision SA (toutes enseignes) + statistiques d'usage des régies.
- [ ] Remplacer progressivement les données fictives par un référentiel régi
      importé (CSV/API).

---

## 3. Idées émises antérieurement, toujours en suspens

- **PDF génératif IA V2** — remplacer le template jsPDF par une mise en page
  générée (structure variables) tout en gardant le PDF de secours déterministe.
  (émis en T55-c, remplacé par l'enrichissement du template — la génération
  complète reste une option.)
- **Formulaire public franchise : champ « budget » en paliers** — aujourd'hui
  libre ; proposer des paliers (ex. < 300 k, 300 k–800 k, > 800 k DT) pour
  faciliter le tri côté enseigne.
- **Accordéon exclusif** — variante où un seul groupe de la sidebar serait
  ouvert à la fois (comportement choisi en T56 : multi-ouverture, auto-ouverture
  du groupe actif — l'exclusivité reste une préférence possible).
- **Sous-onglets dans la page pour Portail enseigne (G3)** — les 4 volets du
  portail enseigne (tableau de bord/stations/avis/API) restent pilotés par la
  seule sidebar ; les ajouter en barre d'onglets comme Shadow (T56) serait la
  suite logique de l'harmonisation.
- **Chips drag & drop généralisées** — le réordonnancement drag & drop livré
  sur les typologies de la carte OSM (T56) pourrait s'étendre aux colonnes de
  tableaux (personnalisation des vues), moyennant persistance par utilisateur.

---

*Document ouvert — toute nouvelle proposition non exécutée vient s'ajouter ici
au fil des rounds. Dernière mise à jour : round T58 (module « Publicité » livré —
listing régies par mode, simulateur enregistrable, rapports ; fonds OSM
généralisés aux 5 onglets d'analyse du Shadow Market ; Media Planner conservé).*
