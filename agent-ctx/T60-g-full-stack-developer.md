# T60-g — UI Super Administration : référentiel Média (7 volets)

Task ID: T60-g · Agent: sous-agent B (full-stack-developer)
Fichiers possédés : `src/components/superadmin/sa-media-*.tsx` (7 volets) + `src/components/superadmin/sa-media/*` (8 sous-composants).
Interdits (non touchés) : sa-media.tsx (coque), src/components/media/*, src/lib/media/*, src/app/api/media/*, i18n global, prisma, store.

## Travail réalisé

### 1. Socle partagé — `sa-media/sa-media-shared.tsx`
- DTO SA typés (SaMediaPanelDTO / SaMediaFaceDTO / SaDashboardDTO / SaAuditPageDTO) alignés sur les réponses réelles des routes.
- `useSaMediaGet<T>(url)` : hook fetch avec abort, erreur FR + `reload()`, `loading` dérivé d'une clé de requête (aucun setState synchrone dans l'effet — règle react-hooks).
- `useSaMediaT(dict)` : fusion du dict de base (fr/en/ar) + dict du volet, sur `useLocalT` du module média.
- `EditableCell` : cellule éditable en ligne (clic → Input inline → Entrée/blur/✓) → PATCH `/api/media/faces/[id] {field, value}` optimiste + rollback + toast sonner ; champs CALCULE (partDeVoix) rendus grisés « calculée ».
- Listes de référence (GOVERNORATS, SUPPORT_TYPES, FORMATS, TECHNOLOGIES, ILLUMINATIONS, PHOTO_ANGLES/MODES…), `daysLeft`, `dueBadgeClass` (rouge < 30 j).

### 2. Les 7 volets
- **dashboard** : 3 KPI (9 panneaux / 20 faces / occupation 74,1 %), bandeau ambre autorisations < 30 j (clic → setNav("saMedia","panels")), table top 10 ODV + barres recharts par technologie (palette émeraude/ambre/terracotta/zinc).
- **panels** : recherche + filtre statut + Import CSV + bulk + « Nouveau panneau ». Table imbriquée panneaux → faces (expansion), édition en ligne TMJA/audience/ODV/prix/occupation, SOV grisée, badges visibilité, AlertDialog suppressions (cascade panneau), Sheet fiche + galerie PHOTOS (URL + angle + mode), dialog face initiale par panneau, dialog création complète (mini-carte Leaflet de sélection lat/lng — dynamic ssr:false).
- **owners** : table 4 propriétaires (badges type REGIE émeraude / COMMUNE zinc / PRIVE ambre), CRUD Dialog + AlertDialog (erreur 400 « panneaux rattachés » gérée).
- **permissions** : matrice 20 faces × 5 enseignes, cellules dérivées client (fidèle au résolveur couche 2 : exclusions priment, EXCLUSIVE réservataire, ✓ émeraude / ⛁ ambre / — zinc), clic → Sheet éditeur guidé (RadioGroup 3 modes + blocs enseignes/interdictions/groupes/zones/conditions), Card Groupes + Dialog, aperçu en direct sticky (Select enseigne + périmètre TOUT/GOUVERNORATS/RAYON → POST preview → 4 nombres + échantillon + phrase « C'est exactement ce que verra … »).
- **traffic** : faces aplaties (GET /api/media/faces — accès FULL SA) avec 11 colonnes trafic/audience éditables en ligne, bulk + import CSV (code;tmja;audience;odv), table « dernières révisions » (audit entityType=FACE), note enseignes/journalisation.
- **audit** : filtres (acteur debounce 350 ms, action, champ, from/to), table paginée 50/page (Précédent/Suivant + « page X/Y · N »), ancienne zinc barrée → nouvelle émeraude, IP en tooltip, bandeau Lock « ajout seul — inaltérable ».
- **engine** : 3 cards — SAISONNALITE (matrice gouvernorat × 12 mois, inputs 0.1-4.9 step 0.05, heatmap > 1.15 émeraude / < 0.9 ambre, + ajout gouvernorat), CHEVAUCHEMENT (3 inputs + explications), COUT (2 inputs). Enregistrer par card → PATCH → toast.

### 3. QA navigateur (base laissée PROPRE)
- Login rania.feki@carbuscope.tn → console SA → Média (7 onglets rendus).
- Dashboard : 9 / 20 / 74,1 % + alerte PAN-SFX-003 (J-22) ✓.
- Panels : expansion PAN-TUN-001, TMJA 38 000 → 39 500 → RESTAURÉ 38 000 ✓ ; face TEST PAN-TUN-001-Z créée PUIS supprimée (retour 2 faces) ✓.
- Permissions : matrice rendue (20×5), aperçu enseigne agil → total 20 / complet 18 / agrégé 2 / invisible 0 ✓ ; éditeur guidé ouvert et refermé proprement.
- Trafic : import 1 ligne `PAN-TUN-001-A;39000;25000;33000` → appliqué (« 1 importée(s) · 0 échec(s) ») PUIS restauré en ligne (38 000 / 23 074 / 34 960) ✓.
- Audit : entrées visibles, filtre action=Édition → 12 entrées, pager OK ✓.
- Moteur : coefficient Tunis-Mars 1.18 → 1.2 → enregistré (toast) → RESTAURÉ 1.18 ✓.
- `agent-browser console` → 0 erreur, 0 warning (un warning React « Select uncontrolled→controlled » sur l'aperçu permissions a été corrigé : `value={pvBrand || undefined}` → `value={pvBrand}`).
- Viewport 390×844 : scrollWidth=390 (aucun débordement document ; les tables larges scrollent dans leurs conteneurs `overflow-x-auto`) ; dark mode vérifié (variantes dark: appliquées).
- `agent-browser close` effectué à la FIN.
- État final base vérifié par API : 10 panneaux, 20 faces, pas de face TEST, valeurs d'origine restaurées, moteur 1.18.

### 4. Qualité
- `bunx tsc --noEmit` : 0 erreur sur les fichiers sa-media (les erreurs restantes du projet sont hors périmètre — prisma/seed, mini-services, examples).
- `bunx eslint` sur les 7 volets + le dossier `sa-media/` : 0 erreur, 0 warning.
- Aucun `any`, TypeScript strict, dict local fr/en/ar par volet, ARIA labels partout, cibles ≥ 44px (min-h-11), skeleton/erreurs+Réessayer/vides honnêtes, toasts sonner.

## Risques / notes
- L'environnement (watchdog) a redémarré `next dev` plusieurs fois pendant la session (HMR + manipulations DOM du QA) — le serveur est reparti seul et répond 200 en fin de session ; aucun crash imputable au code livré (console 0 erreur après rechargement propre).
- Le journal d'audit conserve les entrées de la QA (append-only, comportement voulu).
- Photos : ajout par URL uniquement en V1 (upload fichier annoncé V2 dans l'UI).
