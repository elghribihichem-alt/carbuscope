import type { Prisma } from "@prisma/client"
import type { StationDTO } from "@/lib/types"

export type StationFull = Prisma.StationGetPayload<{
  include: { brand: true; services: { include: { service: true } } }
}>

export const STATION_INCLUDE = { brand: true, services: { include: { service: true } } } satisfies Prisma.StationInclude

export function serializeStation(s: StationFull): StationDTO {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    brandId: s.brandId,
    brandSlug: s.brand?.slug ?? null,
    brandName: s.brand?.name ?? "Indépendant",
    brandColor: s.brand?.color ?? "#94a3b8",
    gouvernorat: s.gouvernorat,
    delegation: s.delegation,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    status: s.status,
    traffic: s.traffic,
    open24: s.open24,
    open7j: s.open7j,
    rating: s.rating,
    reviewsCount: s.reviewsCount,
    photoUrl: s.photoUrl,
    lastVerified: s.lastVerified.toISOString(),
    verifiedBy: s.verifiedBy,
    services: s.services.map(ss => ss.service.slug),
  }
}
