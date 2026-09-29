# T52-R3 — Gouvernance & outils SA (Utilisateurs · Journal d'audit · Cartographie · Démographie · Agent IA)

Agent : full-stack-developer (R3 Gouvernance & outils SA) — cycle T52, espace Super Admin.
Règle d'or : enrichissement avec précaution, QUALITÉ AVANT TOUT, zéro casse code/design, UI 100 % FR, aucun bleu/indigo.

## 1. Audit initial (état + APIs réelles)

| Module | Fichier | État initial | API(s) consommée(s) | Code HTTP |
|---|---|---|---|---|
| Utilisateurs | sa-users.tsx (342 l.) | Très propre (T-V7) : impersonation, resetTotp, suspension, DataViews 3 vues nested par enseigne. Manques : pas de récap, pas de recherche, pas de chips rôle. Faute FR « dans le audit ». | GET /api/super/users ; PATCH /api/super/users/[id] ; POST /api/auth/login ; POST /api/super/audit ; PATCH /api/super/comptes?id= (resetTotp) | 200 / 405 GET (PATCH ok) / 200 |
| Journal d'audit | sa-audit.tsx (193 l.) | Fonctionnel T32 : chips kinds + compteurs, pagination page/pageSize. Manques : pas de recherche, pas d'export CSV, kind SECURITE (11 événements de connexion en base) NON filtrable (absent des KINDS de la route et d'AUDIT_KIND_META). | GET/POST /api/super/audit | 200 |
| Cartographie | sa-carto.tsx (342 l.) | Fonctionnel T33 : aperçu SVG live, validation FR, étendue km, reset. Suffixes « °S/°N/°O/°E » ambigus (30,2 °S = hémisphère sud ?). Aucun indicateur de brouillon non enregistré. | GET/POST /api/super/carto | 200 |
| Démographie | sa-demographie.tsx (1000 l.) + sa-demographie-cites.tsx (427 l.) + sa-demographie-parametrage.tsx (330 l.) | Très riche (T35/T37/T45) : 4 volets, édition en ligne, modélisateur camembert/histogramme, exports 6 formats via DemographieIoBar (sa-demographie-io.tsx — IMPORTÉ DONC VIVANT, jamais touché), chiffres clés, filtres liés, pagination cités. Bugs mineurs : chips de niveau SANS dark: (+ slate dur) au paramétrage ; title « Modifié » affichant l'ISO brut ; ternaire Trash2 double identique aux cités. | GET/POST /api/super/demographie ; GET /api/super/users (paramétrage) | 200 |
| Agent IA | sa-ai-agent.tsx (580 l.) | Complet T33 : création + exécution LLM RÉELLE (z-ai-web-dev-sdk serveur, prompt système CarbuScope, garde-fou 120 s), tâches enregistrées/relançables/supprimables, activation enseigne par membre. Aucun bug en lecture. | GET/POST /api/super/ai-tasks ; GET/POST /api/super/ai-agent-settings | 200 |

Routes vérifiées curl (au départ) : users 200, users/1 GET 405 (PATCH only, normal), comptes 200, comptes/usage GET 404 (sous-route inexistante — l'usage resetTotp est PATCH /comptes?id=), audit 200, carto 200, demographie 200, ai GET 405 (route POST-only du module MORT sa-ai.tsx 499 l., NON consommée par sa-ai-agent — documentée sans invention), ai-tasks 200, ai-agent-settings 200.

Découverte d'architecture : DEUX logAudit coexistent — l'ancien (sa-server.ts : module/action/cible, try/catch, produit kind « SECURITE » pour les connexions) et le nouveau (saas-server.ts : kind/message, kinds stricts). /api/super/comptes et auth.ts utilisent l'ANCIEN (fonctionnent) ; les routes T30+ le nouveau. Le kind SECURITE vivait en base sans être filtrable : corrigé côté route audit (KINDS) + meta local côté composant (saas.ts additif-strict intouchable).

## 2. Changements (fichiers + détail)

### src/app/api/super/audit/route.ts (additif)
- « SECURITE » ajouté à KINDS → les 11+ événements de connexion/2FA deviennent filtrables.
- Param `q` (≤ 80 car) : recherche contains sur message + actor, insensible casse, COMBINABLE au kind ; kindCounts restés globaux sur tout le journal (pattern T32 des compteurs de chips).
- Curl vérifié : kind=SECURITE 200 ; q=Staroil 200 ; q=staroil&kind=CONTRAT → total 5.

### src/components/superadmin/sa-audit.tsx (193 → ~290 l., vitrine du round)
- Chip « Sécurité » (KIND_META_LOCAL + kindMeta() fallback — saas.ts intouché), pastille timeline rouge.
- Recherche texte : Input Search + bouton Effacer (X), debounce 350 ms (setState dans le callback du timer, jamais dans le corps d'effet), message aria-live « N résultat(s) pour … · type … », emptyMessage contextuel.
- Export CSV multi-pages du filtre actif (pattern R2b : BOM UTF-8, « ; », csvEscape ; collecte itérée pageSize=100, garde 5 pages = 500 ; colonnes Date/Heure/Type/Acteur/Enseigne/Message ; toast succès avec filename + périmètre, toast échec ; bouton Exporter CSV avec état exporting + disabled si 0).
- Badge brandSlug (font-mono) sur chaque événement qui en porte.
- Pagination T32 STRICTEMENT conservée (Précédent/Suivant + Select 8/16/24/48) — le « Charger plus » demandé serait redondant avec la pagination discrète déjà testée : choix documenté, pageSize 48 ajouté pour lecture longue.
- Liste max-h-96 overflow-y-auto.

### src/components/superadmin/sa-users.tsx (342 → ~530 l.)
- Récapitulatif en tête (sur TOUTES les données) : comptes actifs (émeraude) / suspendus (zinc) / 2FA (teal + icône) / enseignes représentées (ambre + icône) + « N compte(s) · M enseigne(s) ».
- Recherche norm/needle (accents neutralisés) sur nom + e-mail + enseigne, bouton Effacer, compteur « X / Y compte(s) » aria-live.
- Chips par rôle avec compteurs (Tous + rôles triés par fréquence décroissante), style chips teal identique au journal/contrats.
- Export CSV du filtre actif (toolbarExtra de DataViews, BOM + « ; », colonnes Nom/E-mail/Enseigne/Rôle/Statut/2FA/Dernier accès, toast).
- Suspension confirmée par SaConfirmDialog (pattern R2b) : titre « Suspendre ce compte ? », description avec conséquence explicite (ne peut plus se connecter, réversible, journalisée), détail Enseigne/Rôle/Dernier accès, Annuler testé, busy = mutation en cours. RÉACTIVATION directe (non destructive, sans dialog). Impersonation et resetTotp : code STRICTEMENT inchangé.
- Faute corrigée : « journalisée dans le audit » → « journalisée dans le journal d'audit ».

### src/components/superadmin/sa-carto.tsx (polish léger, module sain)
- Suffixes « °S/°N/°O/°E » supprimés (ambiguïté hémisphère) → labels explicites « Latitude min (bord sud) » / « (bord nord) » / « Longitude min (bord ouest) » / « (bord est) » + suffixe unité « ° ».
- Indicateur « Modifications non enregistrées » : pastille ambre role=status quand les valeurs parsées diffèrent de la zone enregistrée (virgule décimale acceptée) ; disparaît au retour à l'identique ; zéro mutation tant que « Enregistrer » n'est pas cliqué.
- Toast Réinitialiser précisé (« Rien n'est enregistré… »).

### src/components/superadmin/sa-demographie-parametrage.tsx (corrections ciblées)
- Chips LEVEL_SELECT_META : variantes dark: ajoutées (elles restaient claires en thème sombre) + « slate » dur → zinc (tokens thémés, cohérence design system).
- Survol « Modifié » : fmtDate FR + « — modifié par X » (affichait l'ISO brut).

### src/components/superadmin/sa-demographie-cites.tsx (micro-fix)
- Ternaire Trash2 à deux branches identiques → icône unique (zéro changement visuel).

### INTACTS (vérifiés)
sa-demographie.tsx (aucun manque criant : 4 volets, recherche, filtres liés, modélisateur, exports déjà livrés), sa-demographie-io.tsx (VIVANT — importé par sa-demographie et sa-demographie-cites : PAS un fichier mort, jamais touché), sa-ai-agent.tsx (aucun bug), sa-confirm-dialog.tsx, sa-shared.tsx, superadmin-view.tsx, saas.ts, prisma, page.tsx, store, shell, i18n.

## 3. QA détaillée (session unique agent-browser t52r3, discipline mémoire 4 Go)

Zombies chrome tués AVANT (pkill agent-browser + chrome headless), session close + pkill APRÈS. Login « Rania Feki SUPER_ADMIN » via grille démo.

1. **Utilisateurs** : récap 17 actifs / 0 suspendus / 0 2FA / 5 enseignes ; chip Observateur → 4/17 ; recherche « riadh » → 1/17 (Riadh Jelassi) ; Suspendre → dialogue ouvert → **Annuler** → base active:true inchangé ; re-Suspendre → **Confirmer** → base active:false (script prisma vérifié) + statut « Suspendu » + bouton « Réactiver » en UI ; **Réactiver** → base active:true — ÉTAT RÉTABLI. 0 erreur console.
2. **Journal d'audit** : 57 événements (54 + traces QA) ; chips Tout(57)/Connexion(4)/**Sécurité(12)**/Contrat(9)/Facture(6)/Utilisateur(13)/Prise de main(0)… ; filtre Sécurité → « Page 1 sur 2 · 12 événement(s) » ; recherche « 2FA » (avec filtre Sécurité) → 0 résultat + état vide propre ; « Riadh » + filtre Tout → 2 résultats (suspension + réactivation de la QA) ; pagination → page 2 sur 8 ; **Export CSV → toast « Export CSV téléchargé (57 événement(s)) »**. 0 erreur.
3. **Cartographie** : labels bords sud/nord/ouest/est, aperçu SVG live (étendue recalculée 799→710 km à la saisie), pastille « Modifications non enregistrées » apparaît (31) puis disparaît (retour 30.2 exact) — ZÉRO mutation serveur. 0 erreur.
4. **Démographie** : 4 onglets internes parcourus (Gouvernorats → Délégations → Cités → Paramétrage) ; chiffres clés cités présents ; paramétrage « 17 compte(s) » ; 0 erreur console après CHAQUE onglet.
5. **Agent IA** : tâche RÉELLE créée et lancée (« QA T52-R3 — réponse de test ») → **Terminée en 0,4 s**, réponse LLM réelle « Agent IA CarbuScope opérationnel et prêt à assister la Super Administration. » ; puis **supprimée** → état rétabli (seules les 2 tâches démo ai-demo-synthese ENREGISTREE et ai-demo-relances TERMINEE restent, vérifié en base). 0 erreur.
6. **Mobile 390×844** : `set viewport 390 844` + reload → scrollWidth 390 = clientWidth 390 → **true** (vérifié sur Utilisateurs ET Journal d'audit) ; récap empilé 2 colonnes, recherche + chips fluides ; 0 erreur.
7. `agent-browser errors` → vide après chaque écran.

Vérifications finales : `bun run lint` → 0 erreur projet entier ; `bunx tsc --noEmit` → 0 erreur dans le périmètre R3 (140 erreurs globales préexistantes, stock historique, inchangées) ; serveur vivant 200 (relancé après un kill OOM pendant lint+tsc : setsid bun run dev + 15 s) ; dev.log propre.

Captures : qa-t52-r3-users.png, qa-t52-r3-audit.png, qa-t52-r3-audit-filtre.png, qa-t52-r3-carto.png, qa-t52-r3-demographie.png, qa-t52-r3-ai.png, qa-t52-r3-mobile.png.

## 4. Verdicts fichiers morts pour R4 (lecture/minage R3, jamais modifiés)

- **sa-comptes.tsx (1635 l.)** : NON importé (sa-users.tsx le remplace depuis T-V7). La route /api/super/comptes reste VIVANTE (resetTotp consommé par sa-users) — le composant seul est mort. Fonctionnalités valorisables résiduelles : vue consolidée par enseigne (déjà couverte par DataViews nested de sa-users), onboarding de compte (POST /api/super/comptes existe — créable en R4 si besoin). Verdict : SUPPRIMABLE (conserver la route).
- **sa-config.tsx (1218 l.)** : NON importé. Dépend de /api/super/config (modèles fantômes ParametrePlateforme). Idées : gestion des clés API (route cles-api existe, signature ancienne logAudit). Verdict : SUPPRIMABLE (idées minées si module Config demandé).
- **sa-support.tsx (1425 l.)** : NON importé, modèles fantômes (tickets). Verdict : SUPPRIMABLE.
- **sa-analytics.tsx (986 l.)** : NON importé, /api/super/analytics = 500 (signalé par R1). Verdict : SUPPRIMABLE.
- **sa-ai.tsx (499 l.)** : NON importé (sa-ai-agent.tsx le remplace, T33) ; /api/super/ai (405 GET) = sa route POST-only résiduelle. Verdict : SUPPRIMABLE (la route /api/super/ai peut rester ou être purgée avec prudence — non consommée).
- **sa-demographie-io.tsx (313 l.)** : ⚠️ ATTENTION — il n'est PAS mort : DemographieIoBar y est défini et importé par sa-demographie.tsx et sa-demographie-cites.tsx. La liste T51-bis le classait à tort parmi les morts. Verdict : À CONSERVER (vivant) — retirer de la liste de purge R4.
- sa-billing / sa-devis / sa-clients : verdicts déjà rendus par R2b (supprimables, idées fiche 360° et devis PDF documentées).

## 5. Limites

- Sévérité : les AuditEvent n'ont PAS de champ sévérité (l'ancien logAudit la formate dans le message) → « badges de sévérité si présents » = non présents, aucun substitut inventé ; la pastille couleur par type + le nouveau filtre Sécurité tiennent lieu de lecture rapide.
- Recherche audit : contains SQL insensible à la casse, mais PAS insensible aux accents côté SQLite ( contrairement au client) — la recherche « Staroil » matche, « Staroil » vs « Staroïl » ne serait pas normalisé serveur (aucun accent dans les données réelles actuelles).
- Pagination conservée : « Charger plus » non implémenté (redondance documentée avec la pagination T32 + pageSize jusqu'à 48).
- L'exécution LLM de l'agent IA dépend du service z-ai-web-dev-sdk (0,4 s lors du test) ; les défaillances éventuelles sont gérées par l'ECHEC + garde-fou 120 s existants (testés par T33, pas re-testés en échec).
- 140 erreurs tsc globales préexistantes (stock historique hors périmètre) inchangées ; le tueur OOM a coupé le serveur une fois pendant lint+tsc (relancé, discipline mémoire respectée).
