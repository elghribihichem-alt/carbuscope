// Mobile B2C — G-1 : Copilote IA « où faire le plein » (automobilistes).
// Adaptation du pattern /api/portal/ai (F-1) au périmètre B2C PUBLIC : le
// contexte RAG-lite n'injecte QUE des données publiques — derniers prix
// officiels du décret, stations actives autour de l'automobiliste (distance,
// note, services, horaires) — AUCUNE donnée B2B/SaaS privée (contrats,
// abonnements, MRR, factures, tickets) n'est lue ni sérialisée.
//
// POST { question, history?, lat?, lng? } → { reponse }
//   • garde-fou n°1 : feature flag mobile.ai.active (interrupteur
//     FONCTIONNALITES de la Configuration SA) → 503 FR, AVANT le quota —
//     une plateforme coupée ne consomme pas le quota d'une IP ;
//   • garde-fou n°2 : rate limit PAR IP (Map<ip, timestamps[]>, fenêtre
//     glissante 60 s, 10 requêtes) → 429 FR — toute requête reçue compte ;
//   • garde-fou n°3 : validation identique à /api/portal/ai (question
//     1–500 car., historique ≤ 8 messages × 1 500 car.) → 400 FR ;
//     lat/lng optionnelles (défaut : Tunis centre — position de démo) ;
//   • contexte public recalculé à chaque consultation AVANT l'appel LLM
//     (SDK z-ai-web-dev-sdk côté serveur UNIQUEMENT, thinking disabled) ;
//   • audit systématique (module AGENT_IA) — try/catch séparé, jamais bloquant.
import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { haversineKm } from "@/lib/geo"

export const dynamic = "force-dynamic"

// ------------------------------------------------------------------ garde-fous

const QUESTION_MAX = 500
const HISTORIQUE_MAX = 8
const MESSAGE_MAX = 1500
const FENETRE_MS = 60_000 // fenêtre glissante du rate limit
const MAX_REQUETES = 10 // requêtes par IP et par fenêtre

/** Position de démonstration (Tunis centre) quand l'automobiliste n'envoie
 *  pas de coordonnées — même valeur que USER_POS du socle mobile. */
const POSITION_DEMO = { lat: 36.8065, lng: 10.1815, label: "Tunis — Centre" }

/** Horodatages des requêtes reçues, par IP (in-memory — aucune dépendance). */
const requetesParIp = new Map<string, number[]>()

/** Compte la requête de l'IP dans la fenêtre glissante et dit si son quota est atteint. */
function quotaDepasse(ip: string): boolean {
  const maintenant = Date.now()
  const requetes = (requetesParIp.get(ip) ?? []).filter(t => t > maintenant - FENETRE_MS)
  if (requetes.length >= MAX_REQUETES) {
    requetesParIp.set(ip, requetes)
    return true
  }
  requetes.push(maintenant)
  requetesParIp.set(ip, requetes)
  return false
}

/** IP appelante : premier saut de x-forwarded-for, sinon « local » (dev). */
function ipDepuisRequete(req: Request): string {
  const brut = req.headers.get("x-forwarded-for")
  const premier = brut?.split(",")[0]?.trim()
  return premier && premier.length > 0 ? premier : "local"
}

/** Coordonnée optionnelle valide : nombre fini dans les bornes du globe. */
function coordValide(v: unknown, borne: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= borne
}

interface MessageHistorique {
  role: "user" | "assistant"
  content: string
}

function messageValide(m: unknown): m is MessageHistorique {
  if (typeof m !== "object" || m === null) return false
  const { role, content } = m as { role?: unknown; content?: unknown }
  return (role === "user" || role === "assistant") && typeof content === "string" && content.length <= MESSAGE_MAX
}

// ------------------------------------------------------------------ contexte

const NB_PROCHES = 12
const RAYON_NOTES_KM = 15 // « les mieux notées autour de moi »
const MIN_AVIS_NOTES = 10 // fiabilité minimale pour le top notes
const MIN_AVIS_AFFICHES = 3 // la note n'est affichée qu'avec assez d'avis
const NB_SERVICES_DETAIL = 3 // services détaillés station par station
const NB_STATIONS_PAR_SERVICE = 5

const nfEntier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
const nf1Dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2Dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const nfPompe = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fDateLongue = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

interface StationProche {
  id: string
  name: string
  gouvernorat: string
  delegation: string
  open24: boolean
  open7j: boolean
  rating: number
  reviewsCount: number
  brandName: string
  distanceKm: number
}

/** « • Agil Tunis Centre 4 (Agil) — Tunis / Tunis Centre — à 1,8 km — 7 j/7 — note 4,5/5 (9 avis) » */
function ligneStation(s: StationProche): string {
  const horaires = [s.open24 ? "24 h/24" : null, s.open7j ? "7 j/7" : null].filter(Boolean).join(" et ")
  const note = s.reviewsCount >= MIN_AVIS_AFFICHES
    ? ` — note ${nf2Dec.format(s.rating)}/5 (${nfEntier.format(s.reviewsCount)} avis)`
    : ""
  return `• ${s.name} (${s.brandName}) — ${s.gouvernorat} / ${s.delegation} — à ${nf1Dec.format(s.distanceKm)} km` +
    (horaires.length > 0 ? ` — ${horaires}` : "") + note
}

/** Snapshot PUBLIC autour de l'automobiliste — prix officiels + stations
 *  actives + notes + services, sérialisé pour le prompt système. */
async function construireContexte(lat: number, lng: number, positionDemo: boolean, now: Date): Promise<string> {
  const [stations, nbEnseignes, prixEssence, prixGazole, prixGpl] = await Promise.all([
    db.station.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, name: true, lat: true, lng: true, gouvernorat: true, delegation: true,
        open24: true, open7j: true, rating: true, reviewsCount: true, brand: { select: { name: true } },
      },
    }),
    db.brand.count(),
    db.fuelPrice.findFirst({ where: { fuelType: "ESSENCE" }, orderBy: { effectiveAt: "desc" }, select: { priceMillimes: true, effectiveAt: true, decreeNote: true } }),
    db.fuelPrice.findFirst({ where: { fuelType: "GAZOLE" }, orderBy: { effectiveAt: "desc" }, select: { priceMillimes: true, effectiveAt: true, decreeNote: true } }),
    db.fuelPrice.findFirst({ where: { fuelType: "GPL" }, orderBy: { effectiveAt: "desc" }, select: { priceMillimes: true, effectiveAt: true, decreeNote: true } }),
  ])

  // Distances haversine depuis la position de l'automobiliste
  const avecDistance: StationProche[] = stations.map(s => ({
    id: s.id, name: s.name, gouvernorat: s.gouvernorat, delegation: s.delegation,
    open24: s.open24, open7j: s.open7j, rating: s.rating, reviewsCount: s.reviewsCount,
    brandName: s.brand?.name ?? "Indépendant", distanceKm: haversineKm(lat, lng, s.lat, s.lng),
  }))
  const proches = [...avecDistance].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, NB_PROCHES)
  const mieuxNotees = avecDistance
    .filter(s => s.distanceKm <= RAYON_NOTES_KM && s.reviewsCount >= MIN_AVIS_NOTES)
    .sort((a, b) => b.rating - a.rating || a.distanceKm - b.distanceKm)
    .slice(0, 5)

  // Services réellement disponibles dans les 12 stations les plus proches
  const servicesProches = await db.stationService.findMany({
    where: { stationId: { in: proches.map(s => s.id) } },
    select: { stationId: true, service: { select: { name: true } } },
  })
  const parService = new Map<string, { nom: string; stations: StationProche[] }>()
  for (const ss of servicesProches) {
    const station = proches.find(p => p.id === ss.stationId)
    if (!station) continue
    const cur = parService.get(ss.service.name) ?? { nom: ss.service.name, stations: [] }
    cur.stations.push(station)
    parService.set(ss.service.name, cur)
  }
  const topServices = [...parService.values()].sort((a, b) => b.stations.length - a.stations.length).slice(0, 6)

  // Sérialisation compacte (le prompt système reste borné)
  const lignes: string[] = []
  lignes.push(
    positionDemo
      ? `— Position de l'automobiliste : ${POSITION_DEMO.label} (${POSITION_DEMO.lat}, ${POSITION_DEMO.lng}) — position de démonstration.`
      : `— Position de l'automobiliste : ${lat}, ${lng} (coordonnées transmises par l'application).`,
  )
  const prixPompe: string[] = []
  if (prixEssence) prixPompe.push(`essence ${nfPompe.format(prixEssence.priceMillimes / 1000)} DT/L`)
  if (prixGazole) prixPompe.push(`gazole ${nfPompe.format(prixGazole.priceMillimes / 1000)} DT/L`)
  if (prixGpl) prixPompe.push(`GPL ${nfPompe.format(prixGpl.priceMillimes / 1000)} DT/kg`)
  const dateDecret = prixEssence?.effectiveAt ?? prixGazole?.effectiveAt ?? prixGpl?.effectiveAt
  const noteDecret = prixEssence?.decreeNote ?? prixGazole?.decreeNote ?? prixGpl?.decreeNote
  if (prixPompe.length > 0) {
    lignes.push(
      `— Prix officiels à la pompe (RÉGLEMENTÉS par décret : identiques dans TOUTES les stations du territoire)` +
        `${dateDecret ? `, en vigueur depuis le ${fDateLongue.format(dateDecret)}` : ""}${noteDecret ? ` (« ${noteDecret} »)` : ""} : ${prixPompe.join(", ")}.`,
    )
  }
  lignes.push(`— Parc national : ${nfEntier.format(stations.length)} stations actives recensées, ${nfEntier.format(nbEnseignes)} enseignes.`)
  lignes.push(`— Les ${NB_PROCHES} stations actives les plus proches de l'automobiliste :\n${proches.map(ligneStation).join("\n")}`)
  lignes.push(
    mieuxNotees.length > 0
      ? `— Top ${mieuxNotees.length} des stations les mieux notées à moins de ${RAYON_NOTES_KM} km (au moins ${MIN_AVIS_NOTES} avis) :\n${mieuxNotees.map(ligneStation).join("\n")}`
      : `— Aucune station à moins de ${RAYON_NOTES_KM} km n'a encore suffisamment d'avis (au moins ${MIN_AVIS_NOTES}) pour établir un classement fiable.`,
  )
  lignes.push(
    topServices.length > 0
      ? `— Services disponibles autour (parmi les ${NB_PROCHES} plus proches) : ${topServices.map(s => `${s.nom} (${nfEntier.format(s.stations.length)} stations)`).join(", ")}.`
      : "— Services disponibles autour : aucun service enregistré sur les stations proches.",
  )
  if (topServices.length > 0) {
    lignes.push(
      `— Stations proches équipées des principaux services : ` +
        topServices.slice(0, NB_SERVICES_DETAIL)
          .map(s => `${s.nom} → ${s.stations.slice(0, NB_STATIONS_PAR_SERVICE).map(l => `${l.name} (${nf1Dec.format(l.distanceKm)} km)`).join(", ")}`)
          .join(" ; ") + ".",
    )
  }
  return lignes.join("\n")
}

// ------------------------------------------------------------------ route

export async function POST(req: Request) {
  // Garde-fou n°1 : feature flag réel — l'onglet Configuration de la Super
  // Administration pilote mobile.ai.active ; désactivé, la route refuse toute
  // consultation SANS consommer le quota de l'IP.
  const flag = await db.parametrePlateforme.findUnique({ where: { cle: "mobile.ai.active" } })
  if (flag?.valeur !== "true") {
    return NextResponse.json(
      { erreur: "Le copilote IA est désactivé dans la Configuration (Fonctionnalités → mobile.ai.active)." },
      { status: 503 },
    )
  }

  // Garde-fou n°2 : quota PAR IP — toute requête reçue compte, valide ou non.
  if (quotaDepasse(ipDepuisRequete(req))) {
    return NextResponse.json({ erreur: "Trop de consultations rapprochées — patientez une minute." }, { status: 429 })
  }

  // Garde-fou n°3 : validation stricte du corps (messages d'erreur FR).
  const body = (await req.json().catch(() => null)) as { question?: unknown; history?: unknown; lat?: unknown; lng?: unknown } | null
  if (body === null || typeof body.question !== "string" || body.question.trim().length === 0 || body.question.length > QUESTION_MAX) {
    return NextResponse.json({ erreur: `La question est obligatoire (1 à ${QUESTION_MAX} caractères).` }, { status: 400 })
  }
  const question = body.question.trim()
  let history: MessageHistorique[] = []
  if (body.history !== undefined) {
    if (!Array.isArray(body.history) || body.history.length > HISTORIQUE_MAX || !body.history.every(messageValide)) {
      return NextResponse.json(
        { erreur: `Historique invalide (au plus ${HISTORIQUE_MAX} messages « user »/« assistant » de ${MESSAGE_MAX} caractères).` },
        { status: 400 },
      )
    }
    history = body.history
  }
  // Position : coordonnées optionnelles, sinon position de démonstration (Tunis centre).
  const positionDemo = !coordValide(body.lat, 90) || !coordValide(body.lng, 180)
  const lat = coordValide(body.lat, 90) ? body.lat : POSITION_DEMO.lat
  const lng = coordValide(body.lng, 180) ? body.lng : POSITION_DEMO.lng

  try {
    // Contexte RAG-lite PUBLIC : prix officiels + stations actives autour,
    // recalculé à chaque consultation AVANT tout appel LLM.
    const now = new Date()
    const dateDuJour = fDateLongue.format(now)
    const contexte = await construireContexte(lat, lng, positionDemo, now)

    const systemPrompt =
      "Tu es le Copilote IA de l'application mobile CarbuScope (observatoire tunisien des stations-service), au service des automobilistes tunisiens. " +
      "Tu réponds STRICTEMENT en français, en 3 à 4 phrases maximum, sur un ton sympa et concret. " +
      "Tu réponds UNIQUEMENT à partir des données publiques fournies ci-dessous — n'invente jamais une station, un prix, une note ni un service. " +
      "RÈGLE D'HONNÊTETÉ : les prix à la pompe en Tunisie sont réglementés par décret et identiques dans toutes les stations du territoire — ne prétends JAMAIS qu'une station est « moins chère » qu'une autre ; l'arbitrage se fait sur la distance, la note, les services et les horaires. " +
      "Quand tu recommandes, cite des stations RÉELLES de la liste fournie (nom + enseigne + distance en km) et exprime les montants en DT — et ne cite un service pour une station QUE si les données fournies associent explicitement ce service à cette station. " +
      "Si la question sort du domaine carburant / stations-service / route en Tunisie, invite poliment l'automobiliste à reformuler. " +
      `Date du jour : ${dateDuJour}.\nDonnées publiques autour de l'automobiliste :\n${contexte}`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ],
      thinking: { type: "disabled" },
    })
    const reponse = String(completion.choices?.[0]?.message?.content ?? "")
    if (reponse.trim().length === 0) throw new Error("Réponse vide du moteur IA")

    // Audit systématique — try/catch séparé, ne jamais casser la réponse.
    try {
      await logAudit({
        acteur: { nom: "Utilisateur mobile B2C", email: "b2c@mobile.carbuscope.tn", role: "VIEWER" },
        module: "AGENT_IA",
        action: "Consultation du copilote IA mobile B2C",
        cibleType: "AGENT_IA",
        cibleLabel: `Mobile B2C · ${question.slice(0, 60)}`,
        details: `réponse ${reponse.length} car. · position ${lat},${lng}`,
        severite: "NORMALE",
      })
    } catch {
      // l'audit ne doit jamais bloquer la réponse métier
    }

    return NextResponse.json({ reponse })
  } catch (e) {
    console.error("POST /api/mobile/ai", e)
    return NextResponse.json({ erreur: "Le service IA est momentanément indisponible — réessayez." }, { status: 500 })
  }
}
