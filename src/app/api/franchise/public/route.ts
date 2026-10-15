// CarbuScope — T55-b — /api/franchise/public : point d'entrée PUBLIC (SANS
// session) du formulaire « Devenir franchisé » de l'écran de connexion.
// Crée une FranchiseCandidate { status: "NEW", source: "PUBLIC" } pour
// l'enseigne choisie et la tracée dans AuditEvent (module FRANCHISE).
//
// SÉCURITÉ & ANTI-ABUS (plan T55-A0) :
//   · AUCUNE session exigée (point d'entrée public) — GET interdit (405) :
//     jamais de liste publique de candidatures ;
//   · validations FR strictes : nom 3-80 car., e-mail (regex, < 120),
//     téléphone tunisien (+216 ou 8 chiffres, espaces/points tolérés),
//     gouvernorat ∈ 24 réels, délégation/cité ≤ 80 car., notes ≤ 600 car.,
//     expérience/budget ∈ énumérations du schéma, enseigne RÉELLE (Brand,
//     hors « Indépendants ») ;
//   · consentement RGPD-like OBLIGATOIRE (« J'accepte que CarbuScope
//     transmette ma candidature à l'enseigne sélectionnée ») — 400 sinon ;
//   · rate-limit IP en mémoire (Map ip → horodatages, 3 créations/heure/IP,
//     purge périodique des fenêtres expirées) — 429 FR ;
//   · honeypot « website » (champ invisible du formulaire) : si rempli,
//     réponse 200 factice { ok: true } SANS création + log serveur discret ;
//   · corps limité à 4 Ko (413 sinon).
// Réponse 201 : { ok: true, reference } — référence courte affichable, aucune
// donnée sensible retournée. Seules les candidatures EFFECTIVEMENT créées
// consomment le quota IP (les rejets de validation ne créent aucune ligne).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { GOV_REGION } from "@/lib/radar/scoring"

export const dynamic = "force-dynamic"

/* ----------------------------- Constantes ----------------------------- */

const BODY_MAX_BYTES = 4096 // 4 Ko
const RATE_LIMIT_MAX = 3 // candidatures créées / fenêtre / IP
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 heure
const RATE_LIMIT_PRUNE_MS = 5 * 60 * 1000 // purge périodique toutes les 5 min

const EXPERIENCES = new Set(["NONE", "STATION", "RETAIL", "OTHER"])
const BUDGETS = new Set(["<500K", "500K_1M", "1M_2M", ">2M"])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** ip → horodatages des créations de la dernière heure (en mémoire). */
const hitsByIp = new Map<string, number[]>()
let lastPrune = 0

/** IP cliente : X-Forwarded-For (premier saut, posé par la passerelle) puis
 * X-Real-IP, repli local (requêtes directes curl/navigateur sans proxy). */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0].trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip") ?? "127.0.0.1"
}

/** Purge périodique des fenêtres expirées (évite la croissance de la Map). */
function pruneRateLimit(now: number) {
  if (now - lastPrune < RATE_LIMIT_PRUNE_MS) return
  lastPrune = now
  for (const [ip, ts] of hitsByIp) {
    const kept = ts.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    if (kept.length === 0) hitsByIp.delete(ip)
    else hitsByIp.set(ip, kept)
  }
}

/** Téléphone tunisien public : « +216 » + 8 chiffres, « 216 » + 8 chiffres ou
 * 8 chiffres seuls — espaces, points, tirets et parenthèses tolérés. */
function isPhoneTn(raw: string): boolean {
  const cleaned = raw.replace(/[\s.\-()]/g, "")
  if (cleaned.startsWith("+216")) return /^\+216\d{8}$/.test(cleaned)
  if (cleaned.startsWith("216")) return /^216\d{8}$/.test(cleaned)
  return /^\d{8}$/.test(cleaned)
}

/** Référence courte affichable dérivée de l'id Prisma (cuid) : « PUB-XXXXXX »
 * (6 derniers caractères, majuscules) — vérifiable côté enseigne via l'id. */
function shortReference(id: string): string {
  return `PUB-${id.slice(-6).toUpperCase()}`
}

/* ----------------------------- GET : interdit ----------------------------- */

export async function GET() {
  return NextResponse.json(
    { error: "Méthode non autorisée — aucune liste publique de candidatures n'est exposée." },
    { status: 405, headers: { Allow: "POST" } },
  )
}

/* ----------------------------- POST : candidature publique ----------------------------- */

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const now = Date.now()
  pruneRateLimit(now)

  // Rate-limit IP : contrôlé AVANT tout travail lourd (seules les créations
  // effectives consomment le quota — voir en tête de fichier).
  const recent = (hitsByIp.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      {
        error:
          "Trop de candidatures depuis cette adresse — patientez une heure avant de renvoyer un dossier.",
      },
      { status: 429, headers: { "Retry-After": "3600" } },
    )
  }

  // Corps ≤ 4 Ko (anti-abus).
  const raw = await req.text().catch(() => "")
  if (raw.length > BODY_MAX_BYTES) {
    return NextResponse.json(
      { error: "Requête trop volumineuse — le formulaire public est limité à 4 Ko." },
      { status: 413 },
    )
  }
  let body: Record<string, unknown> | null = null
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>
    } catch {
      body = null
    }
  }
  if (!body) {
    return NextResponse.json({ error: "Corps de requête JSON attendu." }, { status: 400 })
  }

  // Honeypot « website » : champ invisible pour les robots — réponse 200
  // factice, AUCUNE création, log serveur discret.
  const honeypot = typeof body.website === "string" ? body.website.trim() : ""
  if (honeypot !== "") {
    console.log(`[franchise-public] honeypot déclenché (IP ${ip}) — aucune création`)
    return NextResponse.json({ ok: true })
  }

  /* ---- Extraction (chaînes court-circuitées en champs vides) ---- */
  const brandSlug = typeof body.brandSlug === "string" ? body.brandSlug.trim().toLowerCase() : ""
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const phone = typeof body.phone === "string" ? body.phone.trim() : ""
  const gouvernorat = typeof body.gouvernorat === "string" ? body.gouvernorat.trim() : ""
  const delegation = typeof body.delegation === "string" ? body.delegation.trim() : ""
  const city = typeof body.city === "string" ? body.city.trim() : ""
  const experience = typeof body.experience === "string" ? body.experience : ""
  const investmentRange = typeof body.investmentRange === "string" ? body.investmentRange : ""
  const notes = typeof body.notes === "string" ? body.notes.trim() : ""

  /* ---- Validations FR strictes ---- */
  if (fullName.length < 3 || fullName.length > 80) {
    return NextResponse.json(
      { error: "Le nom du candidat doit contenir entre 3 et 80 caractères." },
      { status: 400 },
    )
  }
  if (!email || !EMAIL_RE.test(email) || email.length >= 120) {
    return NextResponse.json(
      { error: "Adresse e-mail invalide (ex. prenom.nom@exemple.tn, 120 caractères max)." },
      { status: 400 },
    )
  }
  if (!phone || !isPhoneTn(phone)) {
    return NextResponse.json(
      { error: "Téléphone tunisien attendu : +216 suivi de 8 chiffres, ou 8 chiffres seuls (espaces et points tolérés)." },
      { status: 400 },
    )
  }
  if (!gouvernorat || !(gouvernorat in GOV_REGION)) {
    return NextResponse.json(
      { error: "Gouvernorat inconnu — choisissez parmi les 24 gouvernorats." },
      { status: 400 },
    )
  }
  if (delegation.length > 80 || city.length > 80) {
    return NextResponse.json(
      { error: "Délégation et cité : 80 caractères maximum chacune." },
      { status: 400 },
    )
  }
  if (!EXPERIENCES.has(experience)) {
    return NextResponse.json(
      { error: "Expérience invalide (aucune, station, commerce, autre)." },
      { status: 400 },
    )
  }
  if (!BUDGETS.has(investmentRange)) {
    return NextResponse.json(
      { error: "Budget d'investissement invalide (moins de 500 KDT, 500 KDT-1 MDT, 1-2 MDT, plus de 2 MDT)." },
      { status: 400 },
    )
  }
  if (notes.length > 600) {
    return NextResponse.json({ error: "Notes trop longues (600 caractères max)." }, { status: 400 })
  }
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "Le consentement est obligatoire : acceptez la transmission de votre candidature à l'enseigne sélectionnée." },
      { status: 400 },
    )
  }
  if (!brandSlug) {
    return NextResponse.json({ error: "Enseigne requise — choisissez une enseigne." }, { status: 400 })
  }

  // Enseigne RÉELLE (référentiel Brand, hors agrégat « Indépendants »).
  const brand = await db.brand.findUnique({ where: { slug: brandSlug }, select: { slug: true, name: true, isIndependents: true } })
  if (!brand || brand.isIndependents) {
    return NextResponse.json(
      { error: "Enseigne inconnue — choisissez une enseigne référencée (Agil, Ola Energy, Shell, Staroil, TotalEnergies)." },
      { status: 400 },
    )
  }

  /* ---- Création (status NEW, source PUBLIC) + audit + quota ---- */
  const created = await db.franchiseCandidate.create({
    data: {
      brandSlug: brand.slug,
      fullName,
      email,
      phone,
      gouvernorat,
      delegation: delegation || null,
      city: city || null,
      experience,
      investmentRange,
      status: "NEW",
      source: "PUBLIC",
      notes: notes || null,
    },
  })

  const reference = shortReference(created.id)
  recent.push(now)
  hitsByIp.set(ip, recent)

  await logAudit({
    acteur: { nom: fullName, email, role: "CANDIDAT" },
    module: "FRANCHISE",
    action: "Candidature publique reçue",
    cibleType: "FRANCHISE_CANDIDATE",
    cibleLabel: `${fullName} → ${brand.slug} (${gouvernorat})`,
    details: `référence ${reference}`,
    ip,
  })

  // Aucune donnée sensible retournée : statut de création + référence courte.
  return NextResponse.json({ ok: true, reference }, { status: 201 })
}

// QA T55-b : recompilation dev (fenêtre rate-limit réinitialisée — équivalent du passage de la fenêtre d\x27une heure en production).
