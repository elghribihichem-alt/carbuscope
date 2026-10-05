'use client'

// CarbuScope — T60-e — fiche détail d'une face (Sheet latéral, bouton
// « Détails » du tableau imbriqué). Deux régimes STRICTS :
//  · FULL  — tous les attributs regroupés en 6 onglets thématiques
//    (GEOMETRIE / TRAFIC / AUDIENCE / CONCURRENTIEL / COMMERCIAL / TECHNIQUE)
//    construits depuis le registre FACE_FIELDS + labels FIELD_GROUPS_LABELS,
//    + extras (orientation, profil, CSP, stations de l'enseigne, clients,
//    zones interdites, POI) + galerie photos du panneau + clients actuels.
//  · AGGREGE — AUCUN attribut masqué n'est affiché : seules les colonnes
//    publiques du DTO (fourchette ±30 %, occupation, concurrents, position
//    approximative) + bandeau « Visibilité restreinte » avec verrou. Le
//    serveur ne transmet rien d'autre — ce composant n'invente rien.

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Coins, Crosshair, FileCheck, Gauge, Lock, MapPin, Ruler, Users } from "lucide-react"
import {
  FACE_STATUS_META, dateFr, numFr, useLocalT, type LocalDict,
} from "@/components/media/media-shared"
import {
  FACE_FIELDS, FIELD_GROUPS_LABELS, type FaceDTO, type FaceFullDTO, type FieldDef, type FieldGroup,
  type PanelNestedDTO,
} from "@/lib/media/shared"
import { ExplorerPhotos } from "./explorer-photos"

const D_DICT: LocalDict = {
  fr: {
    "d.restricted": "Visibilité restreinte",
    "d.restrictedDesc": "Cette face est servie en vue agrégée : position approximative (±500 m), fourchette de prix large, aucun détail stratégique. Contactez le gestionnaire du réseau pour un accès complet.",
    "d.prixRange": "Fourchette de prix (DT/sem.)",
    "d.occup": "Occupation 12 mois",
    "d.concur": "Stations concurrentes (rayon)",
    "d.panneaux1km": "Panneaux dans 1 km",
    "d.panelInfo": "Panneau",
    "d.owner": "Propriétaire",
    "d.support": "Support",
    "d.dimensions": "Dimensions",
    "d.height": "Hauteur au sol",
    "d.illumination": "Éclairage",
    "d.photos": "Photos du terrain",
    "d.pois": "Points d'intérêt à proximité",
    "d.poisEmpty": "Aucun POI référencé.",
    "d.poi": "POI",
    "d.nom": "Nom",
    "d.distance": "Distance",
    "d.clients": "Clients actuels",
    "d.clientsEmpty": "Aucun client en cours.",
    "d.zones": "Zones interdites",
    "d.zonesEmpty": "Aucune zone interdite référencée.",
    "d.orientation": "Orientation",
    "d.sensLecture": "Sens de lecture",
    "d.repartitionSens": "Répartition des sens",
    "d.profil": "Profil démographique",
    "d.csp": "CSP dominante",
    "d.partPassants": "Part passants",
    "d.mesStations": "Stations de votre enseigne (≤ 1 km)",
    "d.dateCampagne": "Dernière campagne",
    "d.ville": "Ville",
    "d.gouvernorat": "Gouvernorat",
    "d.delegation": "Délégation",
  },
  en: {
    "d.restricted": "Restricted visibility",
    "d.restrictedDesc": "This face is served in aggregated view: approximate position (±500 m), wide price range, no strategic detail. Contact the network manager for full access.",
    "d.prixRange": "Price range (DT/wk)",
    "d.occup": "12-month occupancy",
    "d.concur": "Competing stations (radius)",
    "d.panneaux1km": "Panels within 1 km",
    "d.panelInfo": "Panel",
    "d.owner": "Owner",
    "d.support": "Support",
    "d.dimensions": "Dimensions",
    "d.height": "Height above ground",
    "d.illumination": "Illumination",
    "d.photos": "Field photos",
    "d.pois": "Nearby points of interest",
    "d.poisEmpty": "No registered POI.",
    "d.poi": "POI",
    "d.nom": "Name",
    "d.distance": "Distance",
    "d.clients": "Current clients",
    "d.clientsEmpty": "No ongoing client.",
    "d.zones": "Forbidden zones",
    "d.zonesEmpty": "No forbidden zone registered.",
    "d.orientation": "Orientation",
    "d.sensLecture": "Reading direction",
    "d.repartitionSens": "Direction split",
    "d.profil": "Demographic profile",
    "d.csp": "Dominant CSP",
    "d.partPassants": "Passing-by share",
    "d.mesStations": "Your brand's stations (≤ 1 km)",
    "d.dateCampagne": "Last campaign",
    "d.ville": "City",
    "d.gouvernorat": "Governorate",
    "d.delegation": "Delegation",
  },
  ar: {
    "d.restricted": "رؤية مقيّدة",
    "d.restrictedDesc": "يُقدَّم هذا الوجه في عرض مجمّع: موقع تقريبي (±500 م)، نطاق سعر واسع، بلا تفاصيل استراتيجية. تواصل مع مدير الشبكة للوصول الكامل.",
    "d.prixRange": "نطاق السعر (د.ت/أسبوع)",
    "d.occup": "الإشغال 12 شهرًا",
    "d.concur": "محطات منافسة (النطاق)",
    "d.panneaux1km": "لوحات في 1 كم",
    "d.panelInfo": "اللوحة",
    "d.owner": "المالك",
    "d.support": "الحامل",
    "d.dimensions": "الأبعاد",
    "d.height": "الارتفاع عن الأرض",
    "d.illumination": "الإضاءة",
    "d.photos": "صور من الميدان",
    "d.pois": "نقاط الاهتمام القريبة",
    "d.poisEmpty": "لا نقاط اهتمام مسجلة.",
    "d.poi": "نقطة",
    "d.nom": "الاسم",
    "d.distance": "المسافة",
    "d.clients": "العملاء الحاليون",
    "d.clientsEmpty": "لا عميل حاليًا.",
    "d.zones": "مناطق ممنوعة",
    "d.zonesEmpty": "لا مناطق ممنوعة مسجلة.",
    "d.orientation": "التوجّه",
    "d.sensLecture": "اتجاه القراءة",
    "d.repartitionSens": "توزيع الاتجاهات",
    "d.profil": "الملف الديموغرافي",
    "d.csp": "الفئة المهيمنة",
    "d.partPassants": "نسبة العابرين",
    "d.mesStations": "محطات علامتكم (≤ 1 كم)",
    "d.dateCampagne": "آخر حملة",
    "d.ville": "المدينة",
    "d.gouvernorat": "الولاية",
    "d.delegation": "المعتمدية",
  },
}

const GROUP_ORDER: FieldGroup[] = ["GEOMETRIE", "TRAFIC", "AUDIENCE", "CONCURRENTIEL", "COMMERCIAL", "TECHNIQUE"]
const GROUP_ICONS: Record<FieldGroup, React.ComponentType<{ className?: string }>> = {
  GEOMETRIE: Ruler, TRAFIC: Gauge, AUDIENCE: Users,
  CONCURRENTIEL: Crosshair, COMMERCIAL: Coins, TECHNIQUE: FileCheck,
}

const SENS_LABELS: Record<string, string> = { GAUCHE_DROITE: "Gauche → droite", DROITE_GAUCHE: "Droite → gauche" }
const POI_LABELS: Record<string, string> = {
  CENTRE_COMMERCIAL: "Centre commercial", HOPITAL: "Hôpital", ECOLE: "École", UNIVERSITE: "Université",
  MARCHE: "Marché", ZONE_INDUSTRIELLE: "Zone industrielle", STADE: "Stade",
}

/** Ligne label/valeur d'un attribut. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function regValue(face: FaceFullDTO, def: FieldDef): string {
  const v = (face as unknown as Record<string, unknown>)[def.key]
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") return numFr(v)
  if (typeof v === "boolean") return v ? "Oui" : "Non"
  return String(v)
}

export interface ExplorerDetailProps {
  face: FaceDTO | null
  panel: PanelNestedDTO | null
  onOpenChange: (open: boolean) => void
}

export function ExplorerDetail({ face, panel, onOpenChange }: ExplorerDetailProps) {
  const { t } = useLocalT(D_DICT)
  const open = face !== null
  const isFull = face?.access === "FULL"
  const statusMeta = face ? FACE_STATUS_META[isFull ? face.status : face.statut] : undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {face && panel && (
          <>
            <SheetHeader className="space-y-2 border-b p-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">{face.code}</Badge>
                {statusMeta && <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>}
                {!isFull && (
                  <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                    <Lock className="h-3 w-3" aria-hidden /> {t("d.restricted")}
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-left text-base leading-snug">
                {panel.name} <span className="font-normal text-muted-foreground">· {panel.code}</span>
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-left text-xs">
                <MapPin className="h-3.5 w-3.5 text-[#b0563b]" aria-hidden />
                <span>{panel.ville} · {panel.governorat}</span>
                <span aria-hidden>·</span>
                <span>{panel.format} · {panel.technology}</span>
                <span aria-hidden>·</span>
                <span>{panel.mediaType}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 p-4">
              {/* — Panneau (caractéristiques physiques communes) — */}
              <section aria-label={t("d.panelInfo")}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("d.panelInfo")}</p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Row label={t("d.owner")} value={panel.ownerName} />
                  <Row label={t("d.support")} value={panel.supportType} />
                  <Row label={t("d.dimensions")} value={`${numFr(panel.widthCm)} × ${numFr(panel.heightCm)} cm`} />
                  <Row label={t("d.height")} value={`${numFr(panel.heightAboveGroundM)} m`} />
                  <Row label={t("d.illumination")} value={panel.illumination} />
                  <Row label={t("d.delegation")} value={panel.delegation} />
                </dl>
              </section>

              <Separator />

              {isFull ? (
                <>
                  {/* — Galerie photos (accès complet uniquement) — */}
                  {panel.photos.length > 0 && (
                    <section aria-label={t("d.photos")}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("d.photos")}</p>
                      <ExplorerPhotos photos={panel.photos} />
                    </section>
                  )}

                  {/* — Onglets thématiques : registre FACE_FIELDS — */}
                  <Tabs defaultValue={GROUP_ORDER[1]} className="w-full">
                    <TabsList className="h-auto w-full flex-wrap gap-1">
                      {GROUP_ORDER.map(g => {
                        const Icon = GROUP_ICONS[g]
                        return (
                          <TabsTrigger key={g} value={g} className="h-9 flex-1 gap-1 px-2 text-[11px] sm:text-xs">
                            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{FIELD_GROUPS_LABELS[g]}</span>
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>

                    {/* GEOMETRIE */}
                    <TabsContent value="GEOMETRIE" className="mt-3 space-y-2">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Row label={t("d.orientation")} value={face.orientation} />
                        <Row label={t("d.sensLecture")} value={SENS_LABELS[face.sensLecture] ?? face.sensLecture} />
                        {FACE_FIELDS.filter(f => f.group === "GEOMETRIE").map(def => (
                          <Row key={def.key} label={def.label} value={regValue(face, def)} />
                        ))}
                      </dl>
                    </TabsContent>

                    {/* TRAFIC */}
                    <TabsContent value="TRAFIC" className="mt-3 space-y-2">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Row label={t("d.repartitionSens")} value={face.repartitionSens} />
                        {FACE_FIELDS.filter(f => f.group === "TRAFIC").map(def => (
                          <Row key={def.key} label={def.label} value={regValue(face, def)} />
                        ))}
                      </dl>
                    </TabsContent>

                    {/* AUDIENCE */}
                    <TabsContent value="AUDIENCE" className="mt-3 space-y-2">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Row label={t("d.profil")} value={face.profilDemographique} />
                        <Row label={t("d.csp")} value={face.cspDominante} />
                        <Row label={t("d.partPassants")} value={`${numFr(face.partPassants)} %`} />
                        {FACE_FIELDS.filter(f => f.group === "AUDIENCE").map(def => (
                          <Row key={def.key} label={def.label} value={regValue(face, def)} />
                        ))}
                      </dl>
                    </TabsContent>

                    {/* CONCURRENTIEL + POIs */}
                    <TabsContent value="CONCURRENTIEL" className="mt-3 space-y-3">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Row label={t("d.mesStations")} value={numFr(face.mesStationsRayon)} />
                        {FACE_FIELDS.filter(f => f.group === "CONCURRENTIEL").map(def => (
                          <Row key={def.key} label={def.label} value={regValue(face, def)} />
                        ))}
                      </dl>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("d.pois")}</p>
                        {face.pois.length === 0 ? (
                          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t("d.poisEmpty")}</p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto rounded-lg border [scrollbar-width:thin]">
                            <Table>
                              <TableHeader className="sticky top-0 bg-muted">
                                <TableRow>
                                  <TableHead className="h-9 text-[11px]">{t("d.poi")}</TableHead>
                                  <TableHead className="h-9 text-[11px]">{t("d.nom")}</TableHead>
                                  <TableHead className="h-9 text-right text-[11px]">{t("d.distance")}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {face.pois.map(p => (
                                  <TableRow key={`${p.type}-${p.nom}`}>
                                    <TableCell className="py-2 text-[13px]">{POI_LABELS[p.type] ?? p.type}</TableCell>
                                    <TableCell className="max-w-[200px] truncate py-2 text-[13px]">{p.nom}</TableCell>
                                    <TableCell className="py-2 text-right text-[13px] tabular-nums">{numFr(p.distanceM)} m</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* COMMERCIAL + clients actuels */}
                    <TabsContent value="COMMERCIAL" className="mt-3 space-y-3">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Row label={t("d.dateCampagne")} value={dateFr(face.dateDerniereCampagne)} />
                        {FACE_FIELDS.filter(f => f.group === "COMMERCIAL").map(def => (
                          <Row key={def.key} label={def.label} value={regValue(face, def)} />
                        ))}
                      </dl>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("d.clients")}</p>
                        {face.clientsActuels.length === 0 ? (
                          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t("d.clientsEmpty")}</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {face.clientsActuels.map(c => (
                              <Badge key={c} variant="secondary" className="text-[11px]">{c}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* TECHNIQUE + zones interdites */}
                    <TabsContent value="TECHNIQUE" className="mt-3 space-y-3">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {FACE_FIELDS.filter(f => f.group === "TECHNIQUE").map(def => (
                          <Row key={def.key} label={def.label} value={regValue(face, def)} />
                        ))}
                      </dl>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("d.zones")}</p>
                        {face.zonesInterdites.length === 0 ? (
                          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t("d.zonesEmpty")}</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {face.zonesInterdites.map(z => (
                              <Badge key={z} variant="outline" className="border-[#e5c9be] bg-[#fdeee8] text-[11px] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]">{z}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </>
              ) : (
                /* — Face AGGREGE : uniquement les colonnes publiques du DTO — */
                <section
                  aria-label={t("d.restricted")}
                  className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-400">
                    <Lock className="h-4 w-4" aria-hidden /> {t("d.restricted")}
                  </p>
                  <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-400/80">{t("d.restrictedDesc")}</p>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Row label={t("d.ville")} value={face.ville} />
                    <Row label={t("d.gouvernorat")} value={face.governorat} />
                    <Row label={t("d.prixRange")} value={`${numFr(face.prixMin)} – ${numFr(face.prixMax)} DT`} />
                    <Row label={t("d.occup")} value={`${numFr(face.tauxOccupation12m)} %`} />
                    <Row label={t("d.concur")} value={numFr(face.stationsConcurrentesRayon)} />
                    <Row label={t("d.panneaux1km")} value={numFr(face.panneauxRayon1km)} />
                  </dl>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
