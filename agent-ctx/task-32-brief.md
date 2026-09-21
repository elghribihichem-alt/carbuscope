# Task ID: 32 — Phase 2 « perfectionnement Super Admin » (100 % ADDITIF)

## CONTEXTE OBLIGATOIRE
Lisez d'abord /home/z/my-project/worklog.md (surtout Task 28 : construction de l'espace Super Administration, Task 30 : Phase 1 — dialog d'édition des contrats + exports CSV + relances de factures, Task 31 : vérification). Vous travaillez dans /home/z/my-project.

Projet : **CarbuScope** — SaaS de veille carburant (Tunisie). Stack : Next.js 16 App Router, TypeScript strict, Tailwind CSS 4 + shadcn/ui (src/components/ui/), Prisma ORM + SQLite, framer-motion, sonner, lucide-react. UI **100 % française**. Palette : émeraude / ambre / violet / teal / graphite — **JAMAIS de bleu ni d'indigo**. Serveur dev : port 3000, il TOURNE (vérifiez `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/` → 200). **INTERDIT : `bun run build`, git push (aucun remote), toucher aux mini-services, créer des routes hors périmètre.**

## CONTRAT UTILISATEUR — 5 RÈGLES D'OR (les violer = échec)
1. Ne jamais casser un code qui marche.
2. Ne jamais casser un design qui marche.
3. Ne rien inventer hors du périmètre ci-dessous.
4. Ne jamais repartir de zéro — construisez sur les fichiers/patterns existants (notamment le dialog d'édition de la Task 30 dans sa-contracts.tsx, le pattern relance de sa-invoices.tsx, sa-shared.tsx, logAudit).
5. QA et fixes : toujours permis et exigés.

## ÉTAT EXISTANT
- `src/components/superadmin/` : superadmin-view.tsx (5 onglets : Vue d'ensemble / Enseignes & contrats / Facturation / Utilisateurs / Journal d'audit) + sa-overview, sa-contracts, sa-invoices, sa-users, sa-audit, sa-shared.tsx.
- API `src/app/api/super/*` : overview, contracts (GET + PATCH [id] avec édition des champs plan/monthlyFee/seats/stationQuota/renewsAt + statut SUSPENDU/ACTIF en cascade), invoices (GET + PATCH [id] avec action « relancer »), users, audit.
- Libs : `src/lib/saas.ts` (types DTO + méta badges + fmtDT + effectiveInvoiceStatus), `src/lib/saas-server.ts` (sérialisations + logAudit).
- Schéma `prisma/schema.prisma` : SaasContract (brandSlug unique, plan enum ESSENTIEL/PRO/ENTERPRISE, statut ESSAI/ACTIF/SUSPENDU/RESILIE), SaasInvoice (reminderCount/lastReminderAt depuis la Task 30), AuditEvent, User.
- Accès démo : compte « Rania Feki » (⚡ express sur l'écran de connexion, ou rania.feki@carbuscope.tn / carbu2025) → Super Administration.

## A. Catalogue des plans — nouveau modèle + 6e onglet « Plans & tarifs »
- **Schéma** : nouveau modèle `SaasPlan { id String @id @default(cuid()), code String @unique, label String, monthlyFee Int, seatsIncluded Int, stationQuota Int, features String, sortOrder Int, active Boolean @default(true) }` (features = libellés FR séparés par le caractère `|`). Puis `bun run db:push` (si le serveur dev erre ensuite sur le client Prisma : redémarrez-le en arrière-plan, instance UNIQUE — tuez l'ancien via .zscripts/dev.pid si besoin, relancez `bun run dev` en écrivant dans dev.log).
- **Seed** (`prisma/seed-saas.ts`, upserts idempotents) : 3 plans —
  - ESSENTIEL : 890 DT / 5 sièges / 100 stations — features : « Observatoire prix & concurrence | Rapport hebdo | 1 gouvernorat »
  - PRO : 1 490 DT / 15 sièges / 300 stations — features : « Tout Essentiel | Portail enseigne complet | Veille terrain | Exports CSV »
  - ENTERPRISE : 2 450 DT / 25 sièges / 500 stations — features : « Tout Pro | API dédiée | Back-office souverain | Support prioritaire »
  - Étendez aussi le journal d'audit seedé à **24 événements** réalistes (kinds AUTH/CONTRAT/FACTURE/UTILISATEUR/SYSTEME répartis sur ~2 mois, dates décroissantes) pour démontrer la pagination (D).
- **API** : `src/app/api/super/plans/route.ts` (nouveau) — GET (liste triée par sortOrder + stats dérivées : nb contrats par plan, MRR par plan calculé sur les contrats ACTIF) et PATCH (body {id, monthlyFee?, seatsIncluded?, stationQuota?, features?} — validation FR, audit SYSTEME « Catalogue plans : PRO — tarif 1 490 → 1 590 DT » via logAudit, n'indiquez que les champs réellement modifiés, montants fr).
- **UI** : `sa-plans.tsx` (nouveau) + **6e onglet « Plans & tarifs »** (icône `Layers` ou `LayoutGrid`) dans superadmin-view.tsx (additif — ne modifiez ni l'ordre ni le comportement des 5 onglets existants ; insérez-le juste après « Enseignes & contrats »). 3 cartes (mêmes codes couleur que les badges plan existants) : nom + prix en gros (fmtDT, tabular-nums) « /mois », sièges inclus, quota stations, liste de features (puces), stats « N contrats actifs · MRR X DT », badge discret « Le plus populaire » sur PRO (3 contrats seedés). Bouton « Modifier » par carte → dialog (patron du dialog Task 30 : code non éditable, Input number tarif/sièges/quota, Textarea features une par ligne) → PATCH → toast + refresh. Carte ENTERPRISE avec liseré discret.

## B. Création de contrat (nouveau client)
- **API** : étendez `src/app/api/super/contracts/route.ts` (GET existe) avec **POST** : body {brandSlug, plan, monthlyFee, seats, stationQuota, renewsAt?, contactName?, contactEmail?} — validez : enseigne existe (table Brand via Prisma), **aucun contrat existant pour cette enseigne** (sinon 409 « Un contrat existe déjà pour cette enseigne »), plan dans le catalogue actif, monthlyFee 1..100000, seats 1..500, quota 1..5000. Crée le contrat avec statut **ESSAI**, renewsAt par défaut = aujourd'hui + 30 jours. Audit CONTRAT « Contrat créé : <enseigne> — plan PRO, 1 490 DT/mois, essai jusqu'au <date fr> ». Répond avec le contrat sérialisé.
- **UI** (sa-contracts.tsx) : bouton « Nouveau contrat » (icône `Plus`, dans la barre d'outils à côté d'« Exporter CSV ») → dialog de création : Select enseigne (via /api/brands — options **désactivées + note « contrat existant »** pour les enseignes déjà sous contrat, seules les libres sont actives ; le seed laisse une enseigne sans contrat — identifiez-la en lisant les données), Select plan (via GET /api/super/plans — la sélection **pré-remplit** tarif/sièges/quota, restant éditables), date de renouvellement (défaut +30 j), contact nom/e-mail. Validation FR, spinner, toast « Contrat créé — <enseigne> · essai 30 jours », re-fetch (le contrat apparaît dans le groupe « Essai »). Réutilisez au maximum le dialog de la Task 30 (mêmes champs/styles).

## C. Relances groupées (« Tout relancer »)
- **API** : `src/app/api/super/invoices/relance-all/route.ts` (nouveau, POST) : relance TOUTES les factures non payées (statut effectif IMPAYEE ou RETARD, PAYEE exclue) — pour chacune : reminderCount+1, lastReminderAt=now, audit FACTURE « Relance envoyée : FCT-… — <enseigne>, <montant> DT impayés (relance n° N) » (même format que la Task 30). Répond {relanced: N, totalMillimes: X} — si rien à relancer : 200 avec relanced: 0 (pas d'erreur).
- **UI** (sa-invoices.tsx) : bouton « Tout relancer » (icône `BellRing`, à côté d'« Exporter CSV ») — toujours visible, **désactivé avec title** si aucune facture en retard/impayée ; spinner ; toast succès « N relances enregistrées — X DT impayés » ; re-fetch. Note discrète sous les filtres : « Politique : relance manuelle groupée — l'automatisation planifiée (J+7) est prévue en phase 3. » (honnête, petit texte slate-400).

## D. Pagination du journal d'audit
- **API** : étendez `src/app/api/super/audit/route.ts` : paramètres `page` (≥1, défaut 1) et `pageSize` (1..100, défaut 8) — répondez {events, total, page, pageSize} en gardant le filtrage kind existant.
- **UI** (sa-audit.tsx) : contrôles de pagination en bas : « Précédent / Suivant » (ChevronLeft/ChevronRight, désactivés aux bornes), « Page X sur Y · N événements au total », sélecteur pageSize (8/16/24) optionnel. Les filtres par type (existants) resettent sur la page 1. Le bouton refresh existant reste fonctionnel.

## PORTES QUALITÉ (toutes obligatoires)
1. `bun run lint` → 0 erreur, 0 warning.
2. `bunx tsc --noEmit` → 0 nouvelle erreur sur les fichiers touchés (erreurs préexistantes hors périmètre : prisma/seed*, skills/, examples/, stations/route.ts, serialize.ts — ne pas corriger ni aggraver).
3. **QA E2E agent-browser** : open http://127.0.0.1:3000/ → ⚡ « Rania Feki » → Super Administration →
   - Onglet « Plans & tarifs » : 3 cartes (prix 890/1 490/2 450), stats contrats ; édition PRO (tarif 1 490 → 1 590) → toast + audit SYSTEME visible dans le journal ;
   - « Enseignes & contrats » : « Nouveau contrat » → enseigne libre sélectionnable (les autres désactivées avec note), plan PRO pré-remplit 1 490/15/300, sauvegarde → toast + contrat dans le groupe « Essai » ;
   - « Facturation » : « Tout relancer » → toast avec le nombre + notes « Relancée N× » visibles + événements FACTURE dans le journal ;
   - « Journal d'audit » : « Page 1 sur 3 » (24 événements, pageSize 8), Précédent/Suivant, filtre par type reset page 1, total affiché ;
   - Vue d'ensemble intacte (KPIs, liens croisés) ; responsive 390×844 : 6 onglets utilisables, aucun débordement horizontal, dialogs utilisables ; **zéro erreur console/page** (`agent-browser errors`, `agent-browser console`).
4. **Restaurez l'état démo** après QA : `bunx tsx prisma/seed-saas.ts` (upserts idempotents — 5 contrats, 20 factures, 3 plans, 24 événements) ; vérifiez GET / → 200.
5. **Commit local** (jamais de push) : message « feat(superadmin): catalogue plans + création contrat + relances groupées + pagination audit ». Stagez UNIQUEMENT prisma/schema.prisma, prisma/seed-saas.ts et src/**. Interdits : .env, db/, worklog.md, dev.log, qa-*, tests/, tool-results/, .zscripts/, mini-services/.
6. **Worklog** : APPENDEZ à la fin de /home/z/my-project/worklog.md une section commençant par la ligne exacte `---` puis `Task ID: 32`, `Agent: full-stack-developer`, `Task: ...`, `Work Log:` (étapes concrètes), `Stage Summary:` (résultats, décisions, risques). Ne réécrivez jamais le fichier existant.

## FORMAT DE RAPPORT FINAL (votre unique message de retour)
Listez : implémenté (A/B/C/D), fichiers touchés (chemins), preuves QA (valeurs observées au navigateur), résultats lint/tsc, hash du commit, écarts/risques résiduels.
