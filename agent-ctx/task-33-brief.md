# Task ID: 33 — Phase 3 « perfectionnement Super Admin » (100 % ADDITIF) : Agent IA interne + Délimitation cartographique

## CONTEXTE OBLIGATOIRE
Lisez d'abord `/home/z/my-project/worklog.md` — surtout Task 28 (construction Super Admin), Task 30/31 (Phase 1), **Task 32 (Phase 2 : catalogue plans, création contrat, relances groupées, pagination audit — commit 064c30b)**. Vous travaillez dans `/home/z/my-project`.

Projet : **CarbuScope** — SaaS de veille carburant (Tunisie). Stack : Next.js 16 App Router, TypeScript strict, Tailwind CSS 4 + shadcn/ui (`src/components/ui/`), Prisma ORM + SQLite, framer-motion, sonner, lucide-react. UI **100 % française**. Palette : émeraude / ambre / violet / teal / graphite — **JAMAIS de bleu ni d'indigo**. Serveur dev : port 3000, il TOURNE (vérifiez `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/` → 200). **INTERDIT : `bun run build`, git push (aucun remote), toucher aux mini-services, créer des routes hors périmètre, toucher à src/components/mobile/, src/store/, src/lib/demo-accounts, src/app/page.tsx.**

Demande utilisateur (verbatim, à respecter à la lettre) : « go pour la phase 3 pour la partie superadministrateur, ajoutez un agent IA interne qui serait pour le superadministrateur au début et aussi possible de l'activer ou désactiver pour les autres enseignes et leur personnel. un agent ia avec interface classique pour lancer nouvelle tache et aussi enregistrement et suppression.... Comme vous le savez on travaille uniquement sur la tunisie et pour éviter un chargement maps trop lourd et des parties hors pays qui ne servent plus grande chose, on va aussi inclure un autre paramètre concernant la définition du paramètre cartographique pour délimitation de zone qui sera éditable. Les deux paramètres, ia et délimitation cartographique à inclure après "utilisateurs" dans le menu »

## CONTRAT UTILISATEUR — 5 RÈGLES D'OR (les violer = échec)
1. Ne jamais casser un code qui marche.
2. Ne jamais casser un design qui marche.
3. Ne rien inventer hors du périmètre ci-dessous.
4. Ne jamais repartir de zéro — construisez sur les fichiers/patterns existants (sa-plans.tsx = composant le plus récent : pattern fetch/erreur/spinner/toast ; sa-contracts.tsx = dialogs ; sa-audit.tsx = listes scrollables ; logAudit = audit).
5. QA et fixes : toujours permis et exigés.

## ÉTAT EXISTANT (ne pas modifier, juste étendre)
- `src/components/superadmin/superadmin-view.tsx` : **6 onglets** (overview / contracts / plans / invoices / users / audit) — TabsList `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`.
- API `src/app/api/super/*` : overview, contracts (GET/POST/PATCH), invoices (+ relance-all), plans (GET/PATCH), users, audit (GET paginé + POST). Pattern : `export const dynamic = "force-dynamic"`, validation FR → 400/404/409, `body.actor` (e-mail du compte) passé par le client, `logAudit` serveur.
- Libs : `src/lib/saas.ts` (DTO + méta badges, côté client), `src/lib/saas-server.ts` (sérialisations + `logAudit` avec kinds `["AUTH","CONTRAT","FACTURE","UTILISATEUR","IMPERSONATION","SYSTEME"]`).
- Schéma `prisma/schema.prisma` : SaasContract, SaasPlan, SaasInvoice, AuditEvent, User (role ADMIN/NETWORK/COMMERCIAL/EXPANSION/VIEWER, brandSlug).
- Accès démo : compte « Rania Feki » (⚡ express sur l'écran de connexion, ou rania.feki@carbuscope.tn / carbu2025) → atterrit dans la Super Administration. Les composants UI obtiennent l'acteur ainsi : `const actor = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system"` (pattern sa-plans.tsx/sa-users.tsx).
- UI dispo dans `src/components/ui/` : switch.tsx, textarea.tsx, alert.tsx, collapsible.tsx, badge.tsx, card.tsx, button.tsx, input.tsx, label.tsx, dialog.tsx… tout ce qu'il faut.

## ÉTAPE 0 — TEST DU SDK IA (OBLIGATOIRE AVANT D'IMPLÉMENTER)
Le moteur de l'agent IA est **z-ai-web-dev-sdk** (BACKEND UNIQUEMENT — jamais côté client). Testez d'abord en CLI : `z-ai chat -p "Réponds en une phrase : tu es l'agent IA de CarbuScope."` → si la CLI répond, le SDK fonctionne. API exacte à utiliser dans les routes (attention : le prompt système passe avec **role "assistant"** — spécificité de ce SDK) :

```ts
import ZAI from "z-ai-web-dev-sdk"

// instance mise en cache au niveau du module (pattern "reuse SDK instance")
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null
function getZAI() {
  zaiPromise ??= ZAI.create()
  return zaiPromise
}

const zai = await getZAI()
const completion = await zai.chat.completions.create({
  messages: [
    { role: "assistant", content: SYSTEM_PROMPT },
    { role: "user", content: instruction },
  ],
  thinking: { type: "disabled" },
})
const text = completion.choices[0]?.message?.content?.trim()
```

## A. AGENT IA INTERNE

### A.1 Schéma (prisma/schema.prisma — 3 nouveaux modèles, section après AuditEvent)
```prisma
// ---- Agent IA interne (Phase 3 Super Admin) : tâches créées/exécutées par
// l'assistant IA de la plateforme (LLM serveur). Disponible d'abord pour la
// Super Administration ; ouverture progressive aux enseignes et à leur
// personnel via AiAgentBrandSetting / AiAgentUserSetting.
model AiTask {
  id          String    @id @default(cuid())
  title       String
  instruction String
  status      String    @default("ENREGISTREE") // ENREGISTREE | EN_COURS | TERMINEE | ECHEC
  result      String?
  error       String?
  launchedAt  DateTime?
  finishedAt  DateTime?
  durationMs  Int?
  createdBy   String    @default("") // e-mail de l'auteur
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model AiAgentBrandSetting {
  id        String   @id @default(cuid())
  brandSlug String   @unique
  enabled   Boolean  @default(false)
  updatedAt DateTime @updatedAt
}

model AiAgentUserSetting {
  id        String   @id @default(cuid())
  userId    String   @unique
  enabled   Boolean  @default(false)
  updatedAt DateTime @updatedAt
}
```
Puis `bun run db:push` (régénère le client Prisma). Si le serveur dev erre ensuite sur le client Prisma : tuez l'ancien via `.zscripts/dev.pid`, relancez `bun run dev` en arrière-plan (écrivant dans dev.log), **instance unique**, vérifiez 200.

### A.2 API `src/app/api/super/ai-tasks/route.ts` (nouveau, force-dynamic)
- **GET** → `{ tasks: AiTaskDTO[] }` (ordre createdAt desc, take 200).
- **POST** — 3 actions (pattern action de invoices) :
  - `{ action: "creer", title, instruction, lancer?: boolean, actor? }` : validez titre 3..120 caractères (« Titre requis — entre 3 et 120 caractères »), instruction 10..4 000 caractères (« Instruction requise — entre 10 et 4 000 caractères »). Crée la tâche (status ENREGISTREE, createdBy=actor). Si `lancer` truthy → exécution immédiate (voir A.4). Audit AGENT_IA à la création : « Tâche IA enregistrée : « <titre> » » (seulement si pas de lancement immédiat — sinon un seul audit d'exécution). Répond `{ task }`.
  - `{ action: "executer", id, actor? }` : 404 « Tâche introuvable » si inconnue ; re-exécute l'instruction stockée (A.4). Répond `{ task }`.
  - `{ action: "supprimer", id, actor? }` : 404 si inconnue ; supprime + audit AGENT_IA « Tâche IA supprimée : « <titre> » ». Répond `{ ok: true }`.
  - Action inconnue → 400 « Action inconnue ».

### A.3 API `src/app/api/super/ai-agent-settings/route.ts` (nouveau, force-dynamic)
- **GET** → `{ brands: [{ brandSlug, brandName, color, plan, contractStatus, enabled, users: [{ id, name, email, role, active, enabled }] }] }` — enseignes = SaasContract (tous statuts, orderBy brandName), `users` = User où brandSlug = le slug (orderBy name), `enabled` lu dans AiAgentBrandSetting/AiAgentUserSetting (défaut false). Réutilisez les libellés de rôle FR EXACTS de sa-users.tsx (lisez-le — mapping role → libellé).
- **POST** `{ scope: "brand" | "user", key, enabled, actor? }` :
  - brand : vérifie le contrat (404 « Enseigne introuvable ») → upsert AiAgentBrandSetting + audit AGENT_IA « Agent IA activé pour <brandName> » / « …désactivé pour <brandName> » (brandSlug = key).
  - user : vérifie l'utilisateur (404 « Utilisateur introuvable ») → upsert AiAgentUserSetting + audit « Agent IA activé pour <name> (<brandName>) » / désactivé.
  - Répond `{ ok: true }` puis la vue re-fetchera.

### A.4 Exécution LLM (dans ai-tasks/route.ts, fonction partagée)
- Persistez d'abord status EN_COURS + launchedAt (observabilité si crash).
- SYSTEM_PROMPT (exact) : « Tu es l'Agent IA interne de CarbuScope — la plateforme SaaS tunisienne de pilotage des stations-service, des prix du carburant et de la veille concurrence. Tu assistes la Super Administration : analyses, synthèses, rédaction, recommandations. Contexte métier : enseignes tunisiennes (Agil, TotalEnergies, Shell, Staroil, Ola, indépendants), prix pompe fixés par décret ministériel, monnaie en dinars tunisiens (DT), découpage en gouvernorats. Réponds toujours en français, de façon structurée (sections courtes en gras si utile), concise (300 mots maximum) et actionnable. »
- Message user = l'instruction stockée. `thinking: { type: "disabled" }`.
- Garde-fou délai : `Promise.race` avec un timeout **120 s** → ECHEC « Délai dépassé (120 s) ».
- Réponse vide → ECHEC « Réponse vide de l'agent IA ». Erreur SDK → ECHEC avec message court FR (« Agent IA indisponible — <erreur> »).
- Succès : status TERMINEE, result = texte (tronqué à 20 000 caractères), finishedAt, durationMs. Audit AGENT_IA « Tâche IA exécutée : « <titre> » — terminée en <X,X> s » (secondes fr 1 décimale) ; en cas d'échec : « Tâche IA en échec : « <titre> » — <erreur> » (logAudit tronque à 300 car. — c'est OK).

### A.5 Audit — NOUVEAU kind `AGENT_IA` (4 fichiers, additif)
- `src/lib/saas-server.ts` : kinds logAudit += `"AGENT_IA"`.
- `src/lib/saas.ts` : `AUDIT_KIND_META` += `AGENT_IA: { label: "Agent IA", className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400" }`.
- `src/app/api/super/audit/route.ts` : `KINDS` += `"AGENT_IA"`.
- `src/components/superadmin/sa-audit.tsx` : `KIND_FILTERS` += `"AGENT_IA"` (entre SYSTEME et rien — ordre : …, IMPERSONATION, SYSTEME, AGENT_IA) + couleur de pastille timeline : `e.kind === "AGENT_IA" ? "#0f766e" : …` (insérez en tête du ternaire existant ligne ~122).

### A.6 UI `src/components/superadmin/sa-ai-agent.tsx` (nouveau, 'use client', pattern sa-plans)
3 Cards empilées :
1. **« Lancer une nouvelle tâche »** (icône Sparkles, liseré discret teal) : Input « Titre de la tâche » + Textarea « Instruction à l'agent IA » (placeholder : « Analyse les factures impayées du mois et propose 3 actions de recouvrement. ») + 2 boutons : « Lancer maintenant » (icône Play, primaire) et « Enregistrer » (icône Save, outline — enregistre sans exécuter). Pendant l'exécution : les 2 boutons disabled + Loader2 animé + « L'agent IA travaille sur « <titre> »… ». À la fin : panneau résultat sous le formulaire (statut Terminée en emerald / Échec en red + texte `whitespace-pre-wrap` dans un bloc bordé arrondi + durée « Terminée en 12,4 s ») + toast + refresh de la liste. Erreur réseau → `role="alert"` FR.
2. **« Tâches enregistrées (N) »** (icône ListTodo, refresh) : liste `max-h-[28rem] overflow-y-auto` (même style que sa-audit) ; par tâche : Badge statut (voir méta ci-dessous), titre medium, extrait instruction (muted, tronqué), `timeAgo`, actions : « Lancer »/« Relancer » (Play, h-7 discret, disabled si EN_COURS), « Voir le résultat » (ChevronDown — déplie le texte `whitespace-pre-wrap` bordé) si result, « Supprimer » (Trash2, suppression immédiate + toast « Tâche supprimée » — pattern identique à Suspendre des contrats, pas de dialog de confirmation). État vide : « Aucune tâche enregistrée — lancez votre première tâche ci-dessus. »
3. **« Activation de l'agent IA »** (icône ToggleRight) : note d'intro (« L'agent IA est toujours disponible pour la Super Administration. Activez-le enseigne par enseigne — puis membre par membre — pour ouvrir l'accès aux personnels. ») ; rangée verrouillée « Rania Feki — Super Administration · Accès permanent » (icône Lock, badge outline teal) ; puis par enseigne : rangée avec pastille couleur (contract.color), nom, badge plan (PLAN_LABELS), Switch (toast « Agent IA activé — <enseigne> », mise à jour optimiste ou re-fetch), puis le personnel imbriqué indenté (nom, e-mail mono discret, libellé rôle FR, Switch par membre ; si l'enseigne est désactivée : petite note ambre « Activez d'abord l'enseigne »). Note de bas : « Accès effectif d'un membre = enseigne activée ET membre activé. »

Méta statuts dans `src/lib/saas.ts` (export `AI_TASK_STATUS_META`) : ENREGISTREE « Enregistrée » zinc, EN_COURS « En cours » amber, TERMINEE « Terminée » emerald, ECHEC « Échec » red (mêmes styles border/bg/text que INVOICE_STATUS_META, adaptés) + `AiTaskDTO` (id, title, instruction, status, result, error, launchedAt, finishedAt, durationMs, createdBy, createdAt, updatedAt — dates ISO, nullables) + types des settings (AiBrandSettingDTO / AiUserSettingDTO ci-dessus) + `serializeAiTask` / helpers dans saas-server.ts.

### A.7 Seed (`prisma/seed-saas.ts` — extension idempotente)
- Bloc « reset Phase 3 » (avant les upserts) : `deleteMany` sur aiAgentUserSetting, aiAgentBrandSetting, cartoBoundary ; `aiTask.deleteMany({ where: { id: { notIn: ["ai-demo-relances","ai-demo-synthese"] } } })` (nettoie les tâches créées pendant les QA).
- Upsert 2 tâches démo (ids déterministes) :
  - `ai-demo-relances` : « Plan de relance des impayés », instruction « Analyse les factures impayées des enseignes clientes et propose un plan de relance priorisé en 3 actions. », status TERMINEE, launchedAt = J-2, finishedAt = J-2 + 9 s, durationMs 9200, createdBy rania.feki@carbuscope.tn, result réaliste FR (~120 mots : synthèse Staroil/Agil, plan en 3 points numérotés, suivi « relancer chaque 7 jours »).
  - `ai-demo-synthese` : « Synthèse hebdo — mouvements concurrents », instruction « Rédige la synthèse hebdomadaire des mouvements du marché (ouvertures, rénovations, changements d'enseigne) à destination de la direction. », status ENREGISTREE (brouillon, sans résultat).
- AUCUN seed de settings (défaut tout désactivé = « pour le superadmin au début », conforme à la demande) ni de carto (défaut servi par l'API).

## B. DÉLIMITATION CARTOGRAPHIQUE (zone de couverture éditable)

### B.1 Schéma
```prisma
// ---- Paramètre cartographique (Phase 3 Super Admin) : délimitation de la
// zone de couverture (bounding box éditable). CarbuScope ne couvre que la
// Tunisie — cette zone borne le chargement cartographique pour éviter le
// poids et les zones hors pays inutiles.
model CartoBoundary {
  id        String   @id @default("zone-principale")
  name      String   @default("Zone de couverture — Tunisie")
  minLat    Float    @default(30.2)
  maxLat    Float    @default(37.4)
  minLng    Float    @default(7.5)
  maxLng    Float    @default(11.6)
  active    Boolean  @default(true)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}
```

### B.2 API `src/app/api/super/carto/route.ts` (nouveau, force-dynamic)
- **GET** → `{ boundary: CartoBoundaryDTO }` : si aucune ligne → valeurs par défaut ci-dessus avec `updatedAt: null` et `isDefault: true` (sinon false). DTO : id, name, minLat, maxLat, minLng, maxLng, active, updatedAt, isDefault.
- **POST** `{ name?, minLat, maxLat, minLng, maxLng, actor? }` : validations FR → name 3..80 (« Nom de la zone requis — entre 3 et 80 caractères ») ; latitudes nombres -90..90 (« Latitude invalide — nombre entre -90 et 90 ») ; longitudes -180..180 (« Longitude invalide — nombre entre -180 et 180 ») ; `minLat < maxLat` strict (« La latitude minimale doit être inférieure à la maximale ») ; idem longitude. Arrondissez à 4 décimales. Upsert de la ligne unique (`id = "zone-principale"`). Audit **SYSTEME** : « Délimitation cartographique : lat <min> → <max> · lng <min> → <max> — <nom> » (nombres fr 2 décimales). Répond `{ boundary }`.

### B.3 UI `src/components/superadmin/sa-carto.tsx` (nouveau, 'use client')
2 Cards :
1. **« Délimitation cartographique — zone de couverture »** (icône MapPinned) : description (« CarbuScope ne couvre que la Tunisie : cette zone borne le chargement des cartes pour en réduire le poids et exclure les zones hors pays inutiles. »). Contenu en 2 colonnes (lg) :
   - **Aperçu SVG live** (mise à jour à la frappe) : viewBox base lng 6.8→12.4 / lat 29.4→38.1, projection `x = (lng - 6.8) * 40`, `y = (38.1 - lat) * 40` (viewBox "0 0 224 348", w-full max-w-xs mx-auto) ; **contour stylisé de la Tunisie** en polygone teal (fill teal-500/10, stroke teal-600 dark:teal-400, 1.5) avec CES points (lng, lat) : (8.7,36.95) (9.15,37.1) (9.85,37.32) (10.45,37.15) (11.05,37.04) (10.75,36.75) (10.6,36.4) (10.9,35.85) (11.05,35.45) (10.85,34.9) (10.35,34.3) (10.1,33.5) (10.8,33.5) (11.05,33.45) (11.5,33.1) (11.0,32.2) (11.55,30.35) (10.5,30.05) (9.7,30.2) (9.0,31.4) (8.6,32.4) (8.35,33.6) (8.65,34.8) (8.35,35.9) (8.65,36.5) — légende « Aperçu indicatif » (texte 9px muted) ; **rectangle de la zone** : stroke emerald-600 dashed 6-3, fill emerald-500/5 (rouge + fill red-500/5 si bornes invalides min≥max) ; grilles fines tous les 2° (lng 8/10/12, lat 30/32/34/36/38, stroke border, dash 2-2) + libellés discrets.
   - **Formulaire** : Label+Input nom ; grille 2×2 : « Latitude min », « Latitude max », « Longitude min », « Longitude max » (type number, step 0.01, suffixe °N/°S/°E/°O en muted — reprise du pattern suffixe DT des dialogs contrats) ; ligne d'aide « Étendue : ≈ <spanLat×111> km (N-S) × <spanLng×111×cos(lat moyenne)> km (E-O) » (arrondis) ; erreur validation `role="alert"` FR rouge ; boutons : « Enregistrer la zone » (Save, primaire, spinner pendant l'appel, toast « Délimitation cartographique enregistrée ») et « Réinitialiser (Tunisie entière) » (RotateCcw, outline — remplit le formulaire avec les valeurs par défaut SANS enregistrer, toast discret « Valeurs par défaut restaurées dans le formulaire ») ; pied : « Dernière modification : <fmtDate + timeAgo> » ou « Valeurs par défaut (jamais modifiée) » si isDefault.
2. **Alerte info** (composant Alert, icône Info, style discret) : « Ce paramètre sera consommé par les vues cartographiques de la plateforme : seules les tuiles/services dans la zone seront chargés. » (une seule phrase, pas plus).

## C. INTÉGRATION MENU (superadmin-view.tsx — additif strict)
- Imports : `SaAiAgent`, `SaCarto` + icônes `Bot`, `MapPinned`.
- TabsList : `grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 lg:w-auto` (les triggers gardent `gap-1.5 px-3 py-2 text-xs sm:text-sm`).
- **Ordre des onglets (exigence utilisateur) :** Vue d'ensemble, Enseignes & contrats, Plans & tarifs, Facturation, **Utilisateurs, Agent IA (`value="ai"`, icône Bot), Cartographie (`value="carto"`, icône MapPinned)**, Journal d'audit. (Libellé menu « Cartographie » ; le titre complet « Délimitation cartographique » est dans la vue.)
- TabsContent correspondants + commentaire de code mis à jour (« 8 onglets — Agent IA + Cartographie ajoutés en T33 après Utilisateurs, demande utilisateur Phase 3 »).
- Les 6 onglets existants : ordre, libellés, contenus et comportements STRICTEMENT inchangés.

## PORTES QUALITÉ (toutes obligatoires)
1. `bun run lint` → 0 erreur, 0 warning.
2. `bunx tsc --noEmit` → 0 NOUVELLE erreur sur les fichiers touchés (erreurs préexistantes hors périmètre : prisma/seed.ts, skills/, examples/, mini-services/, stations/route.ts, serialize.ts — ne pas corriger ni aggraver).
3. **QA E2E agent-browser** (open http://127.0.0.1:3000/) : ⚡ « Rania Feki » → Super Administration →
   - 8 onglets rendus, les 6 historiques intacts (Vue d'ensemble KPIs, Enseignes & contrats, Plans & tarifs 3 cartes, Facturation, Utilisateurs, Journal d'audit pagination) ;
   - « Agent IA » : lancer une tâche RÉELLE (ex. titre « QA — impayés », instruction « Résume en 3 points la situation des factures impayées. ») → attendre le résultat (jusqu'à 60 s, rafraîchir le snapshot) → statut Terminée + texte non vide + durée ; enregistrer une 2e tâche sans lancer → statut Enregistrée ; la relancer → Terminée ; supprimer les 2 tâches QA → disparues + toast ;
   - Activation : activer Agil → toast ; activer un membre du personnel d'Agil → toast ; **recharger la page → états persistés** (les 2 switches toujours ON) ; Rania = « Accès permanent » sans switch ;
   - « Cartographie » : valeurs par défaut 30.2/37.4/7.5/11.6 + SVG (rectangle englobant la Tunisie) ; modifier maxLat 36 → Enregistrer → toast ; recharger → 36 persisté ; saisie invalide (minLat 40 > maxLat) → erreur FR, pas d'enregistrement ; Réinitialiser → formulaire 37.4 ;
   - « Journal d'audit » : chip « Agent IA » avec compteur ≥ 1, filtre fonctionnel, événements SYSTEME carto visibles ;
   - responsive 390×844 : 8 onglets utilisables (grid 2 colonnes), aucun débordement horizontal (scrollWidth = 390), formulaires/dialogs utilisables ;
   - **zéro erreur console/page** (`agent-browser errors`, `agent-browser console`).
4. **Restaurez l'état démo** après QA : `bunx tsx prisma/seed-saas.ts` (le bloc reset Phase 3 nettoie vos tâches QA + settings + carto) ; vérifiez GET / → 200.
5. **Commit local** (jamais de push) : message « feat(superadmin): agent IA interne + délimitation cartographique (phase 3) ». Stagez UNIQUEMENT prisma/schema.prisma, prisma/seed-saas.ts et src/**. Interdits : .env, db/, worklog.md, dev.log, qa-*, tests/, tool-results/, .zscripts/, mini-services/, agent-ctx/.
6. **Worklog** : APPENDEZ à la fin de `/home/z/my-project/worklog.md` une section commençant par la ligne exacte `---` puis `Task ID: 33`, `Agent: full-stack-developer`, `Task: …`, `Work Log:` (étapes concrètes), `Stage Summary:` (résultats, décisions, risques). Ne réécrivez jamais le fichier existant.

## FORMAT DE RAPPORT FINAL (votre unique message de retour)
Listez : implémenté (A/B/C), fichiers touchés (chemins), preuves QA E2E (valeurs observées au navigateur : statut des tâches, durées, valeurs carto persistées, états des switches après reload), résultats lint/tsc, hash du commit, écarts/risques résiduels.
