# T54-Cb — Analytics & Conversions + Paramètres TMP + supervision SA (Module 2, volets 4-5/5 + supervision SA)

Task ID: **T54-Cb** · Agent: full-stack-developer · Statut: **TERMINÉ — Module 2 « Mobility Hub Operations » 5/5 COMPLET, les DEUX modules T54 terminés**

## Contexte

Round de FINALISATION d'un round interrompu (pattern T54-Ca/T54-B3b) : le code des 3 volets + 3 routes API + HubSetting + 6 captures QA existaient non commités. Reprise complète : audit fichier par fichier, correctif d'hydratation, sanity curl, QA navigateur complémentaire (24 captures), restaurations DB, lint, worklog, commit.

## Livrable

1. **Modèle additif `HubSetting`** (fin de `prisma/schema.prisma`, seule modif autorisée) : `hubId @unique` + relation Cascade (champ retour `setting HubSetting?` sur MobilityHub), `horaires Json` (7 clés jour → "HH:MM-HH:MM"), `tarifs Json` ({ prestation: {min,max} } DT), `updatedAt @updatedAt`, `updatedBy?` (e-mail). `bun run db:push` OK.
2. **API** :
   - `GET /api/hubs/analytics?days=30|90` — session enseigne 401 sinon ; kpis (446 passages, 46,6 % taux, 21 200 DT valeur, 72 fidélisés, `prev` null honnête), funnel 446/246/136/72 (100/55,2/30,5/16,1 %), byHub 9, bySource 40/35/15/10 %, timeseries (13 bacs hebdo si 90 j / journalier si 30 j), `radarLoop.govFortPotentiel` = jointure HubConversion CAPTEUR_RADAR → hubs → gouvernorats croisée avec `scoreGouvernorats` serveur + seuil alerte (Tunis 170 passages, score 77,7 ≥ 70). 400 FR si days invalide.
   - `GET/PUT /api/hubs/settings` — GET ?hubId → setting|null (défaut vide honnête) ; PUT validations FR strictes (7 jours, regex HH:MM, ouverture < fermeture, 1-12 prestations, min ≤ max) + HUBS_WRITE_ROLES 403 + upsert + AuditEvent HUBS.
   - `PATCH /api/hubs` — identité (nom/adresse/responsable/tél +216/surface > 0/trafic/CA) + **cycle À SENS UNIQUE** PLANNED→CONSTRUCTION→ACTIVE→CLOSED (400 FR détaillé sinon, CLOSED terminal) + `openedAt` horodaté à la première ouverture + AuditEvent.
   - `GET /api/hubs/supervision` — SA UNIQUEMENT (401/403 pattern /api/radar/config) : KPIs réseau 90 j, entonnoir, bySource, 9 hubs (funnel propre + services actifs + MAJ paramètres). Lecture seule V1.
3. **Volets** :
   - `hub-analytics.tsx` (634 l.) — 4 KPIs + badge tendance/« 1ʳᵉ période », entonnoir 4 barres animées (zinc → émeraude clair → ambre → émeraude plein), ComposedChart tendances + BarChart sources (mapping SOURCE_META), table max-h-96 tri 4 colonnes + mini jauge, carte « Boucle capteurs → Radar » émeraude + bouton h-11 → setNav espace/portail/radar/scoring, Select 30/90 j re-fetch abortable, Skeleton/ErrorState.
   - `hub-parametres.tsx` (833 l.) — sélecteur 9 cartes (nav.hubsSel) + panneau Identité (7 champs, PLANNED = « — », timeline 4 étapes, AlertDialog transition 3 variantes + « sens unique ») + panneau Horaires & tarifs (7 inputs + Appliquer à tous, tarifs min-max, Suggérer depuis les services relit les services ACTIFS, Enregistrer → PUT + toast + « Dernière mise à jour »).
   - `sa-hubs.tsx` (478 l.) — supervision SA : bandeau Lecture seule, 4 KPIs réseau, mini entonnoir, table 9 hubs max-h-96, Sheet détail (fiche + 3 tuiles + entonnoir hub), Actualiser + « Voir la carte TMP » (bascule portail réelle).
4. **Intégration** : hub-module.tsx 2 « Bientôt » remplacés + badge « Module complet · 5/5 volets actifs » ; superadmin-view TabsContent « hubs » + sidebar saItem + i18n `sb.sa.hubs` ; hub-shared +173 l. (DTO + FUNNEL_STAGE_META + SOURCE_META).

## Correctif finalisation

Erreur console détectée en QA : `<p>` dans `<p>` (AlertDialogDescription Radix = `<p>` par défaut → hydratation) → **asChild + div interne** dans l'AlertDialog du cycle de vie. Console re-testée VIERGE.

## QA (30 captures qa-t54-cb-* : 6 round interrompu + 24 finalisation, 3 invalides supprimées)

- Curl : 401 ×5 routes sans session ; analytics 90 j (funnel + byHub + radarLoop 1 gov) + 30 j (143/78/42/30) + days=45 400 FR ; settings 4× 400 FR + round-trip test→restaure ; PATCH 3× 400 FR (ACTIVE→PLANNED, tél, surface) + round-trip identité + CONSTRUCTION→ACTIVE 200 openedAt horodaté (puis restauré DB) ; Sonia supervision 403 ; Rania supervision 200.
- Navigateur (Sonia ADMIN + Rania SA, UNE session par phase, pkill avant) : analytics complet + nav radar/scoring vérifiée + 30 j re-fetch + tri table ; paramètres (toast identité + restaure, AlertDialog ouvert/annulé, horaires + Appliquer à tous + Suggérer (95-120, 320-320 réels) + PUT + restauration UI complète vérifiée API) ; SA volet + Sheet TMP-SSE-01 + 390 px + dark ; régressions carte TMP (canvas 902×624) / services / radar scoring — 0 régression. 390 px scrollWidth 390 partout. Console VIERGE (après correctif), 0 page error.
- Lint 2× (navigateur fermé) → 0 erreur.

## État DB final (audit lecture seule)

- Hubs 9 : 6 ACTIVE + 2 CONSTRUCTION (BIZ-01 seed + **MNS-01 résidu QA sens unique documenté** : PLANNED→CONSTRUCTION testé, pas de retour arrière V1) + 1 PLANNED (GAB-01).
- HubSetting 2 : TMP-SSE-01 (horaires défauts ×7 + 25/40 · 95/140 · 60/180) et TMP-MNS-01 (défauts ×7 + 20/35 · 80/160 · 60/180), par sonia.beji@agil.tn.
- Intacts : HubConversion 900 (446/246/136/72), HubVehicle 350, HubIntervention 500, HubService 47 (45 seed + 2 QA CLOSED T54-Ca).
- TUN-01 restauré seed (Sami Toumi). AuditEvent HUBS 32.

## Incident serveur

Dev server mort 2× pendant la reprise (1 OOM dmesq documenté next-server 2,4 Go + chrome résiduel ; 1 silencieuse) → relance `setsid bun run dev &`, curl 200 avant/après chaque phase, plus aucune chute ensuite.

## Fichiers

- `prisma/schema.prisma` (HubSetting + champ retour), `db/custom.db`
- `src/app/api/hubs/{analytics,settings,supervision}/route.ts` (nouveaux) + `src/app/api/hubs/route.ts` (PATCH + serializeHub)
- `src/components/hubs/{hub-analytics,hub-parametres}.tsx` (nouveaux) + `hub-shared.tsx` (+173) + `hub-module.tsx`
- `src/components/superadmin/sa-hubs.tsx` (nouveau) + `superadmin-view.tsx`
- `src/components/shell/app-sidebar.tsx` (saItem hubs) + `src/lib/i18n/fr.ts` (sb.sa.hubs)
