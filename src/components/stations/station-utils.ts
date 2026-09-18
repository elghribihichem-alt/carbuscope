// CarbuScope — utilitaires du module « Mes stations » (A.4)
// Exports CSV/Excel, helpers de formatage FR, référentiel des 24 gouvernorats.

import { STATUS_LABELS } from "@/lib/types"
import type { StationDTO } from "@/lib/types"

/** Les 24 gouvernorats tunisiens (ordre alphabétique FR). */
export const GOVERNORATS = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba",
  "Kairouan", "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine",
  "Monastir", "Nabeul", "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine",
  "Tozeur", "Tunis", "Zaghouan",
] as const

/** Libellés lisibles des champs d'historique de fiche station. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  address: "Adresse",
  status: "Statut",
  traffic: "Trafic captif",
  open24: "Horaires 24h/24",
  open7j: "Ouverture 7j/7",
  gouvernorat: "Gouvernorat",
  delegation: "Délégation",
  photoUrl: "Photo",
  services: "Services",
  rating: "Note",
  lat: "Latitude",
  lng: "Longitude",
}

/** Date courte FR : « 5 janv. 2026 ». */
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

/** Horodatage fichier : « 2026-01-31 ». */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Construit le CSV (séparateur « ; », pour tableurs FR). */
export function buildStationsCsv(stations: StationDTO[]): string {
  const header = [
    "Code", "Nom", "Gouvernorat", "Délégation", "Adresse", "Latitude", "Longitude",
    "Statut", "Trafic captif", "24h/24", "7j/7", "Note", "Avis", "Services",
    "Dernière vérification", "Vérifié par",
  ]
  const rows = stations.map((s) => [
    s.code, s.name, s.gouvernorat, s.delegation, s.address,
    s.lat, s.lng, STATUS_LABELS[s.status] ?? s.status, s.traffic,
    s.open24 ? "Oui" : "Non", s.open7j ? "Oui" : "Non",
    s.rating, s.reviewsCount, s.services.map((x) => x).join(" | "),
    formatDateFr(s.lastVerified), s.verifiedBy,
  ])
  return [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n")
}

/** Télécharge un contenu texte en pièce jointe (BOM UTF-8 pour Excel). */
export function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Recherche insensible à la casse et aux accents. */
export function normalizeFr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}
