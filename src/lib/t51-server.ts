// T51 — Sérialisation + calculs serveur des modules Opportunity Radar et
// Mobility Hub Operations (serveur uniquement — importé par /api/opportunity/*
// et /api/mobility/*).

import type {
  FranchiseCandidate, FranchiseContract, FranchiseKitItem, FeasibilityStudy,
  HubEquipment, HubLoyaltyRule, HubPriceItem, HubServiceRecord, HubStockItem,
  HubTireProduct, HubVehicle, MobilityHub, OpportunityAlert, OpportunitySetting,
  OpportunityZone, RentabilitySimulation, HubSetting,
} from "@prisma/client"
import {
  type EtudeFoncier, type EtudeRegulation, type EtudeRh, type FeasibilityStudyDTO,
  type FranchiseCandidateDTO, type FranchiseContractDTO, type FranchiseKitItemDTO,
  type HubConversionDTO, type HubDTO, type HubDiagnosticTemplateDTO, type HubEquipmentDTO,
  type HubLoyaltyRuleDTO, type HubPriceItemDTO, type HubServiceRecordDTO, type HubSettingDTO,
  type HubStockItemDTO, type HubTireProductDTO, type HubVehicleDTO, type OpportunityAlertDTO,
  type OpportunitySettingDTO, type OpportunityZoneDTO, type RentabilitySimulationDTO,
  type VehicleAlert,
} from "@/lib/t51-dto"

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

// ---------------------------------------------------------------------------
// Opportunity Radar
// ---------------------------------------------------------------------------

export function serializeOpportunitySetting(s: OpportunitySetting): OpportunitySettingDTO {
  return {
    id: s.id, brandSlug: s.brandSlug, enabled: s.enabled,
    weightPark: s.weightPark, weightPower: s.weightPower, weightTraffic: s.weightTraffic,
    weightCompetition: s.weightCompetition, weightFoncier: s.weightFoncier,
    alertThreshold: s.alertThreshold, whiteZoneKm: s.whiteZoneKm,
    updatedAt: s.updatedAt.toISOString(), updatedBy: s.updatedBy,
  }
}

export function serializeZone(
  z: OpportunityZone,
  weights: { park: number; power: number; traffic: number; comp: number; foncier: number },
  extras: { hasStudy: boolean; hubCode: string | null },
): OpportunityZoneDTO {
  const weighted = Math.round(
    weights.park * z.scorePark + weights.power * z.scorePower + weights.traffic * z.scoreTraffic +
    weights.comp * z.scoreCompetition + weights.foncier * z.scoreFoncier,
  )
  return {
    id: z.id, gouvernorat: z.gouvernorat, delegation: z.delegation, zoneName: z.zoneName,
    lat: z.lat, lng: z.lng, areaKm2: z.areaKm2, population: z.population, vehicles: z.vehicles,
    vehicleDensity: z.vehicleDensity, trafficDaily: z.trafficDaily,
    purchasingPowerIdx: z.purchasingPowerIdx, competitorCount: z.competitorCount,
    nearestStationKm: z.nearestStationKm, foncierPriceM2: z.foncierPriceM2,
    foncierDispo: z.foncierDispo, isWhiteZone: z.isWhiteZone,
    scorePark: z.scorePark, scorePower: z.scorePower, scoreTraffic: z.scoreTraffic,
    scoreCompetition: z.scoreCompetition, scoreFoncier: z.scoreFoncier,
    scoreGlobal: z.scoreGlobal, weightedScore: weighted, recommendedFormat: z.recommendedFormat,
    status: z.status, notes: z.notes, ...extras,
  }
}

export function serializeAlert(a: OpportunityAlert): OpportunityAlertDTO {
  return {
    id: a.id, zoneId: a.zoneId, gouvernorat: a.gouvernorat, type: a.type, message: a.message,
    score: a.score, read: a.read, createdAt: a.createdAt.toISOString(),
  }
}

export function serializeStudy(s: FeasibilityStudy): FeasibilityStudyDTO {
  return {
    id: s.id, zoneId: s.zoneId, brandSlug: s.brandSlug, title: s.title, status: s.status,
    pages: s.pages, investment: s.investment,
    foncier: (s.foncier as unknown as EtudeFoncier) ?? null,
    regulation: (s.regulation as unknown as EtudeRegulation[]) ?? null,
    rh: (s.rh as unknown as EtudeRh[]) ?? null,
    summary: s.summary, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  }
}

export function serializeSimulation(r: RentabilitySimulation): RentabilitySimulationDTO {
  return {
    id: r.id, zoneId: r.zoneId, scenario: r.scenario, investment: r.investment,
    caYear1: r.caYear1, chargesAnnual: r.chargesAnnual, growthPct: r.growthPct,
    horizonYears: r.horizonYears, breakEvenMonths: r.breakEvenMonths,
    netYear5: r.netYear5, newClients: r.newClients,
  }
}

export function serializeCandidate(c: FranchiseCandidate): FranchiseCandidateDTO {
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone, gouvernorat: c.gouvernorat,
    city: c.city, profile: c.profile, capital: c.capital, experience: c.experience,
    zoneId: c.zoneId, zoneLabel: c.zoneLabel, status: c.status, score: c.score,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  }
}

export function serializeContract(
  k: FranchiseContract, candidateName: string | null,
): FranchiseContractDTO {
  return {
    id: k.id, reference: k.reference, candidateId: k.candidateId, candidateName: candidateName ?? "—",
    brandSlug: k.brandSlug, zoneId: k.zoneId, entryFee: k.entryFee, royaltyPct: k.royaltyPct,
    durationYears: k.durationYears, status: k.status, content: k.content,
    createdAt: k.createdAt.toISOString(),
  }
}

export function serializeKit(k: FranchiseKitItem): FranchiseKitItemDTO {
  return {
    id: k.id, brandSlug: k.brandSlug, category: k.category, label: k.label,
    description: k.description, active: k.active,
  }
}

// ---------------------------------------------------------------------------
// Mobility Hub Operations
// ---------------------------------------------------------------------------

export function serializeHubSetting(s: HubSetting): HubSettingDTO {
  return {
    id: s.id, brandSlug: s.brandSlug, enabled: s.enabled, vehicleAlertKm: s.vehicleAlertKm,
    vehicleAlertDays: s.vehicleAlertDays, equipmentAlertDays: s.equipmentAlertDays,
    conversionTargetPct: s.conversionTargetPct, updatedAt: s.updatedAt.toISOString(),
    updatedBy: s.updatedBy,
  }
}

/** Entrées légères acceptées par serializeHub (sous-ensembles des modèles). */
export interface HubKpiRecord { hubId: string; amount: number; performedAt: Date }
export interface HubKpiConversion { hubId: string; status: string; amount: number; proposedAt: Date }

/** KPIs d'un TMP calculés depuis les enregistrements bruts. */
export function serializeHub(
  h: MobilityHub,
  records: HubKpiRecord[],
  conversions: HubKpiConversion[],
  vehicleCount: number,
  equipmentAlerts: number,
  stockAlerts: number,
): HubDTO {
  const now = Date.now()
  const day = 86_400_000
  const in30 = records.filter(r => now - r.performedAt.getTime() < 30 * day)
  const prev30 = records.filter(r => {
    const age = now - r.performedAt.getTime()
    return age >= 30 * day && age < 60 * day
  })
  const ca30 = in30.reduce((s, r) => s + r.amount, 0)
  const caPrev30 = prev30.reduce((s, r) => s + r.amount, 0)
  const conv90 = conversions.filter(c => now - c.proposedAt.getTime() < 90 * day)
  const confirmed = conv90.filter(c => c.status === "CONFIRMEE")
  return {
    id: h.id, code: h.code, name: h.name, brandSlug: h.brandSlug, gouvernorat: h.gouvernorat,
    delegation: h.delegation, address: h.address, lat: h.lat, lng: h.lng,
    franchisee: h.franchisee, contractRef: h.contractRef, status: h.status,
    openedAt: h.openedAt.toISOString(), surfaceM2: h.surfaceM2, bays: h.bays,
    investment: h.investment, targetMonthlyCa: h.targetMonthlyCa, rating: h.rating,
    reviewsCount: h.reviewsCount,
    ca30: Math.round(ca30), caPrev30: Math.round(caPrev30),
    targetPct: h.targetMonthlyCa > 0 ? Math.round(ca30 / h.targetMonthlyCa * 100) : 0,
    services30: in30.length, vehiclesCount: vehicleCount,
    conversions90: conv90.length, conversionsConfirmed90: confirmed.length,
    conversionRate: conv90.length > 0 ? Math.round(confirmed.length / conv90.length * 100) : 0,
    caCaptured: Math.round(confirmed.reduce((s, c) => s + c.amount, 0)),
    roiPct: h.investment > 0 ? Math.round(ca30 * 12 / h.investment * 100) : 0,
    equipmentAlerts, stockAlerts,
  }
}

export function serializeService(r: HubServiceRecord, hubCode?: string): HubServiceRecordDTO {
  return {
    id: r.id, hubId: r.hubId, type: r.type, vehicleId: r.vehicleId, plate: r.plate,
    performedAt: r.performedAt.toISOString(), amount: r.amount, durationMin: r.durationMin,
    detail: r.detail, hubCode,
  }
}

export function serializeConversion(c: {
  id: string; hubId: string; plate: string; reason: string; targetStationCode: string
  targetStationName: string; proposedAt: Date; confirmedAt: Date | null; status: string
  amount: number; followed: boolean
}, hubCode?: string): HubConversionDTO {
  return {
    id: c.id, hubId: c.hubId, plate: c.plate, reason: c.reason,
    targetStationCode: c.targetStationCode, targetStationName: c.targetStationName,
    proposedAt: c.proposedAt.toISOString(), confirmedAt: iso(c.confirmedAt), status: c.status,
    amount: c.amount, followed: c.followed, hubCode,
  }
}

export function serializeVehicle(
  v: HubVehicle, hubCode: string | undefined, setting: { vehicleAlertDays: number } | null,
): HubVehicleDTO {
  let alert: VehicleAlert | null = null
  if (v.nextServiceDueAt) {
    const days = Math.round((v.nextServiceDueAt.getTime() - Date.now()) / 86_400_000)
    if (days < 0) {
      alert = {
        level: "URGENT", kind: "ECHEANCE_DEPASSEE",
        message: `Échéance d'entretien dépassée depuis ${Math.abs(days)} jour(s) — relancer le client.`,
      }
    } else if (days <= (setting?.vehicleAlertDays ?? 90) / 3) {
      alert = {
        level: "INFO", kind: "ECHEANCE_PROCHE",
        message: `Entretien à prévoir dans ${days} jour(s).`,
      }
    }
  }
  return {
    id: v.id, hubId: v.hubId, plate: v.plate, brand: v.brand, model: v.model, year: v.year,
    fuel: v.fuel, km: v.km, ownerName: v.ownerName, ownerPhone: v.ownerPhone,
    firstSeenAt: v.firstSeenAt.toISOString(), lastServiceAt: iso(v.lastServiceAt),
    nextServiceDueAt: iso(v.nextServiceDueAt), servicesCount: v.servicesCount,
    totalSpent: v.totalSpent, loyaltyPoints: v.loyaltyPoints, loyaltyTier: v.loyaltyTier,
    notes: v.notes, hubCode, alert,
  }
}

export function serializeStock(s: HubStockItem, hubCode?: string): HubStockItemDTO {
  return {
    id: s.id, hubId: s.hubId, sku: s.sku, label: s.label, category: s.category,
    quantity: s.quantity, minQuantity: s.minQuantity, unitCost: s.unitCost,
    updatedAt: s.updatedAt.toISOString(), hubCode,
  }
}

export function serializeEquipment(e: HubEquipment, hubCode?: string): HubEquipmentDTO {
  return {
    id: e.id, hubId: e.hubId, name: e.name, model: e.model,
    installedAt: e.installedAt.toISOString(), lastMaintenanceAt: iso(e.lastMaintenanceAt),
    nextMaintenanceAt: iso(e.nextMaintenanceAt), status: e.status,
    operatingHours: e.operatingHours, hubCode,
  }
}

export function serializePrice(p: HubPriceItem): HubPriceItemDTO {
  return {
    id: p.id, brandSlug: p.brandSlug, serviceType: p.serviceType, label: p.label,
    price: p.price, durationMin: p.durationMin, active: p.active,
    updatedAt: p.updatedAt.toISOString(),
  }
}

export function serializeTire(t: HubTireProduct): HubTireProductDTO {
  return {
    id: t.id, ref: t.ref, brand: t.brand, model: t.model, size: t.size, season: t.season,
    price: t.price, stockHint: t.stockHint, active: t.active,
  }
}

export function serializeTemplate(t: {
  id: string; brandSlug: string; code: string; name: string; systems: unknown; active: boolean; updatedAt: Date
}): HubDiagnosticTemplateDTO {
  return {
    id: t.id, brandSlug: t.brandSlug, code: t.code, name: t.name,
    systems: (t.systems as { systeme: string; points: string[] }[]) ?? [],
    active: t.active, updatedAt: t.updatedAt.toISOString(),
  }
}

export function serializeLoyalty(l: HubLoyaltyRule): HubLoyaltyRuleDTO {
  return {
    id: l.id, brandSlug: l.brandSlug, action: l.action, points: l.points,
    rewardLabel: l.rewardLabel, rewardThreshold: l.rewardThreshold, active: l.active,
  }
}
