'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Moteur » : paramétrage des
// trois familles de coefficients du moteur de simulation.
//   · SAISONNALITE : matrice gouvernorat × 12 mois (coefficients 0.1 → 4.9,
//     pas 0.05) avec heatmap subtile (> 1.15 fond émeraude clair, < 0.9 fond
//     ambre clair) et ajout de gouvernorat ;
//   · CHEVAUCHEMENT : déduplication du reach par zone (facteur
//     supplémentaire, croissance journalière, plafond d'unicité) ;
//   · COUT : CPM de référence et marge plateforme.
// Enregistrement par card : PATCH /api/media/engine { key, value } (validation
// stricte serveur). GET au montage.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarRange, Coins, Gauge, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/loading"
import { ModuleHeader, apiJson, numFr } from "@/components/media/media-shared"
import type { EngineSettingsDTO } from "@/lib/media/shared"
import { GOVERNORATS, useSaMediaGet, useSaMediaT } from "./sa-media/sa-media-shared"

const DICT = {
  fr: {
    header: "Paramétrage du moteur de simulation",
    headerDesc: "Coefficients de saisonnalité mensuels par gouvernorat, matrice de chevauchement (déduplication du reach par zone) et formules de coût. Chaque modification est journalisée.",
    "saison.title": "Saisonnalité — coefficients mensuels par gouvernorat",
    "saison.desc": "Multiplicateur appliqué aux ODV/audience du mois (1.00 = neutre). Été littoral > 1, zones urbaines stables, intérieur < 1 en hiver.",
    "saison.add": "Ajouter un gouvernorat",
    "saison.addGov": "Nom du gouvernorat",
    "saison.remove": "Retirer ce gouvernorat",
    "saison.months": "J F M A M J J A S O N D",
    "saison.heatHigh": "coefficient élevé (> 1.15)",
    "saison.heatLow": "coefficient faible (< 0.9)",
    "chev.title": "Chevauchement — déduplication du reach",
    "chev.desc": "Le reach déduplique les individus exposés plusieurs fois dans une même zone : chaque face supplémentaire apporte moins de reach que la précédente.",
    "chev.facteur": "Facteur supplémentaire",
    "chev.facteurDesc": "Part de reach additionnel apportée par chaque nouvelle face d'une même zone (0-1).",
    "chev.croissance": "Croissance journalière",
    "chev.croissanceDesc": "Croissance du reach avec la durée de campagne (0-1) — plafonnée par le facteur d'unicité.",
    "chev.plafond": "Plafond d'unicité",
    "chev.plafondDesc": "Nombre maximal d'individus uniques comptés par zone avant saturation (1-10).",
    "cout.title": "Coût — CPM & marge",
    "cout.desc": "CPM de référence servant de base au coût pour mille ODV et marge appliquée par la plateforme.",
    "cout.cpm": "CPM de référence (DT)",
    "cout.cpmDesc": "Coût pour mille occasions de voir servant d'ancrage tarifaire.",
    "cout.marge": "Marge plateforme",
    "cout.margeDesc": "Marge appliquée au coût total des campagnes (0-1, ex. 0.10 = 10 %).",
    saved: "Paramètres enregistrés",
    "err.save": "Échec de l'enregistrement",
    "err.gov": "Nom de gouvernorat invalide.",
    "err.months": "12 coefficients par gouvernorat, entre 0.1 et 4.9.",
    "err.chev": "Valeurs invalides : facteur/croissance 0-1, plafond 1-10.",
    "err.cout": "Valeurs positives attendues.",
    dirty: "modifications non enregistrées",
  },
  en: {
    header: "Simulation engine settings",
    headerDesc: "Monthly seasonality coefficients per governorate, overlap matrix (reach deduplication per zone) and cost formulas. Every change is logged.",
    "saison.title": "Seasonality — monthly coefficients per governorate",
    "saison.desc": "Multiplier applied to the month's ODV/audience (1.00 = neutral). Coastal summer > 1, urban stable, inland winter < 1.",
    "saison.add": "Add a governorate",
    "saison.addGov": "Governorate name",
    "saison.remove": "Remove this governorate",
    "saison.months": "J F M A M J J A S O N D",
    "saison.heatHigh": "high coefficient (> 1.15)",
    "saison.heatLow": "low coefficient (< 0.9)",
    "chev.title": "Overlap — reach deduplication",
    "chev.desc": "Reach deduplicates individuals exposed several times in the same zone: each additional face brings less reach.",
    "chev.facteur": "Additional factor",
    "chev.facteurDesc": "Reach share added by each new face of a same zone (0-1).",
    "chev.croissance": "Daily growth",
    "chev.croissanceDesc": "Reach growth with campaign duration (0-1) — capped by the uniqueness ceiling.",
    "chev.plafond": "Uniqueness ceiling",
    "chev.plafondDesc": "Max unique individuals counted per zone before saturation (1-10).",
    "cout.title": "Cost — CPM & margin",
    "cout.desc": "Reference CPM anchoring the cost per thousand ODV and platform margin.",
    "cout.cpm": "Reference CPM (DT)",
    "cout.cpmDesc": "Cost per thousand opportunities to see.",
    "cout.marge": "Platform margin",
    "cout.margeDesc": "Margin applied to the total campaign cost (0-1).",
    saved: "Settings saved",
    "err.save": "Save failed",
    "err.gov": "Invalid governorate name.",
    "err.months": "12 coefficients per governorate, between 0.1 and 4.9.",
    "err.chev": "Invalid values: factor/growth 0-1, ceiling 1-10.",
    "err.cout": "Positive values expected.",
    dirty: "unsaved changes",
  },
  ar: {
    header: "إعدادات محرك المحاكاة",
    headerDesc: "معاملات الموسمية الشهرية لكل ولاية ومصفوفة التداخل وصيغ التكلفة. كل تعديل مُسجَّل.",
    "saison.title": "الموسمية — معاملات شهرية لكل ولاية",
    "saison.desc": "مضاعف يُطبَّق على ODV/الجمهور الشهري (1.00 = محايد).",
    "saison.add": "إضافة ولاية",
    "saison.addGov": "اسم الولاية",
    "saison.remove": "إزالة هذه الولاية",
    "saison.months": "J F M A M J J A S O N D",
    "saison.heatHigh": "معامل مرتفع (> 1.15)",
    "saison.heatLow": "معامل منخفض (< 0.9)",
    "chev.title": "التداخل — إزالة تكرار الوصول",
    "chev.desc": "يُخصم الأفراد المعرَّضون مرات عدة في نفس المنطقة.",
    "chev.facteur": "العامل الإضافي",
    "chev.facteurDesc": "حصة الوصول المضافة لكل وجه جديد (0-1).",
    "chev.croissance": "النمو اليومي",
    "chev.croissanceDesc": "نمو الوصول مع مدة الحملة (0-1).",
    "chev.plafond": "سقف التفرّد",
    "chev.plafondDesc": "أقصى أفراد فريدين لكل منطقة (1-10).",
    "cout.title": "التكلفة — CPM والهامش",
    "cout.desc": "CPM مرجعي وهامش المنصة.",
    "cout.cpm": "CPM المرجعي",
    "cout.cpmDesc": "التكلفة لكل ألف فرصة رؤية.",
    "cout.marge": "هامش المنصة",
    "cout.margeDesc": "الهامش المطبق على إجمالي تكلفة الحملات (0-1).",
    saved: "تم حفظ الإعدادات",
    "err.save": "فشل الحفظ",
    "err.gov": "اسم ولاية غير صالح.",
    "err.months": "12 معاملًا لكل ولاية بين 0.1 و4.9.",
    "err.chev": "قيم غير صالحة.",
    "err.cout": "قيم موجبة مطلوبة.",
    dirty: "تغييرات غير محفوظة",
  },
}

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] as const

const heatClass = (v: number): string => {
  if (v > 1.15) return "bg-emerald-100/80 dark:bg-emerald-900/40"
  if (v < 0.9) return "bg-amber-100/80 dark:bg-amber-900/40"
  return ""
}

type SaisonState = Record<string, string[]>
interface ChevState { facteurSupplementaire: string; croissanceJournaliere: string; plafondUnicite: string }
interface CoutState { cpmReference: string; margePlateforme: string }

export function SaMediaEngine() {
  const { t } = useSaMediaT(DICT)
  const { data, error, loading, reload } = useSaMediaGet<EngineSettingsDTO>("/api/media/engine")

  const [saison, setSaison] = useState<SaisonState>({})
  const [chev, setChev] = useState<ChevState>({ facteurSupplementaire: "", croissanceJournaliere: "", plafondUnicite: "" })
  const [cout, setCout] = useState<CoutState>({ cpmReference: "", margePlateforme: "" })
  const [newGov, setNewGov] = useState("")
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Préremplissage depuis le GET (une fois).
  useEffect(() => {
    if (!data) return
    setSaison(Object.fromEntries(
      Object.entries(data.SAISONNALITE).map(([g, coeffs]) => [g, coeffs.map(c => String(c))]),
    ))
    setChev({
      facteurSupplementaire: String(data.CHEVAUCHEMENT.facteurSupplementaire),
      croissanceJournaliere: String(data.CHEVAUCHEMENT.croissanceJournaliere),
      plafondUnicite: String(data.CHEVAUCHEMENT.plafondUnicite),
    })
    setCout({ cpmReference: String(data.COUT.cpmReference), margePlateforme: String(data.COUT.margePlateforme) })
  }, [data])

  const saisonDirty = useMemo(
    () => data !== null && JSON.stringify(saison) !== JSON.stringify(Object.fromEntries(
      Object.entries(data.SAISONNALITE).map(([g, c]) => [g, c.map(x => String(x))]))) && Object.keys(saison).length > 0,
    [saison, data],
  )
  const chevDirty = data !== null && (
    chev.facteurSupplementaire !== String(data.CHEVAUCHEMENT.facteurSupplementaire) ||
    chev.croissanceJournaliere !== String(data.CHEVAUCHEMENT.croissanceJournaliere) ||
    chev.plafondUnicite !== String(data.CHEVAUCHEMENT.plafondUnicite)
  )
  const coutDirty = data !== null && (
    cout.cpmReference !== String(data.COUT.cpmReference) ||
    cout.margePlateforme !== String(data.COUT.margePlateforme)
  )

  async function patchEngine(key: "SAISONNALITE" | "CHEVAUCHEMENT" | "COUT", value: unknown) {
    if (busyKey) return
    setBusyKey(key)
    try {
      await apiJson("/api/media/engine", { method: "PATCH", body: JSON.stringify({ key, value }) })
      toast.success(t("saved"), { description: key })
      reload()
    } catch (e) {
      toast.error(t("err.save"), { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusyKey(null)
    }
  }

  function saveSaison() {
    const value: Record<string, number[]> = {}
    for (const [g, arr] of Object.entries(saison)) {
      if (g.trim() === "" || arr.length !== 12 || arr.some(v => v.trim() === "")) { toast.error(t("err.months")); return }
      const coeffs = arr.map(v => Number(v.replace(",", ".")))
      if (coeffs.some(n => !Number.isFinite(n) || n < 0.1 || n > 4.9)) { toast.error(t("err.months")); return }
      value[g.trim()] = coeffs.map(n => Math.round(n * 1000) / 1000)
    }
    if (Object.keys(value).length === 0) { toast.error(t("err.gov")); return }
    void patchEngine("SAISONNALITE", value)
  }

  function saveChev() {
    const f = Number(chev.facteurSupplementaire.replace(",", "."))
    const c = Number(chev.croissanceJournaliere.replace(",", "."))
    const p = Number(chev.plafondUnicite.replace(",", "."))
    if (![f, c, p].every(Number.isFinite) || f < 0 || f > 1 || c < 0 || c > 1 || p < 1 || p > 10) {
      toast.error(t("err.chev"))
      return
    }
    void patchEngine("CHEVAUCHEMENT", { facteurSupplementaire: f, croissanceJournaliere: c, plafondUnicite: p })
  }

  function saveCout() {
    const cpm = Number(cout.cpmReference.replace(",", "."))
    const m = Number(cout.margePlateforme.replace(",", "."))
    if (!Number.isFinite(cpm) || cpm < 0 || !Number.isFinite(m) || m < 0) { toast.error(t("err.cout")); return }
    void patchEngine("COUT", { cpmReference: cpm, margePlateforme: m })
  }

  function setCell(gov: string, month: number, v: string) {
    setSaison(prev => ({
      ...prev,
      [gov]: prev[gov].map((x, i) => (i === month ? v : x)),
    }))
  }

  function addGovernorate() {
    const g = newGov.trim()
    if (g === "" || Object.keys(saison).includes(g)) { toast.error(t("err.gov")); return }
    setSaison(prev => ({ ...prev, [g]: Array.from({ length: 12 }, () => "1.00") }))
    setNewGov("")
  }

  if (error !== null) return <ErrorState message={error} retry={reload} />
  if (loading || data === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("common.loading")}>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  const govEntries = Object.entries(saison)
  const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={Gauge} title={t("header")} description={t("headerDesc")} />

      {/* ---- SAISONNALITE ---- */}
      <Card>
        <CardHeader className="gap-1.5 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarRange className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("saison.title")}
            {saisonDirty ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {t("dirty")}
              </span>
            ) : null}
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("saison.desc")}</p>
          <p className="text-[11px] text-muted-foreground">
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100 align-middle dark:bg-emerald-900/60" aria-hidden />
            {t("saison.heatHigh")}
            <span className="mx-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-amber-100 align-middle dark:bg-amber-900/60" aria-hidden />
            {t("saison.heatLow")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-96 overflow-auto rounded-lg border">
            <div className="min-w-[40rem]">
              <table className="w-full text-xs tabular-nums">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="w-36 px-2 py-2 text-left font-medium text-muted-foreground">Gouvernorat</th>
                    {MONTHS.map((m, i) => (
                      <th key={i} className="w-14 px-1 py-2 text-center font-semibold text-muted-foreground" aria-label={`Mois ${i + 1}`}>{m}</th>
                    ))}
                    <th className="w-12 px-1 py-2" aria-label="Retirer" />
                  </tr>
                </thead>
                <tbody>
                  {govEntries.map(([gov, coeffs]) => (
                    <tr key={gov} className="border-b last:border-0">
                      <td className="px-2 py-1.5 text-left text-sm font-medium">{gov}</td>
                      {coeffs.map((c, i) => (
                        <td key={i} className={`px-0.5 py-1 text-center ${heatClass(Number(c.replace(",", ".")) || 1)}`}>
                          <input
                            type="number" min={0.1} max={4.9} step={0.05}
                            value={c}
                            onChange={e => setCell(gov, i, e.target.value)}
                            aria-label={`${gov} — mois ${i + 1}`}
                            className="h-8 w-14 rounded border border-transparent bg-transparent text-center text-xs tabular-nums transition-colors hover:border-zinc-300 focus:border-amber-400 focus:bg-amber-50 focus:outline-none dark:hover:border-zinc-600 dark:focus:bg-amber-950"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => setSaison(prev => {
                            const n = { ...prev }
                            delete n[gov]
                            return n
                          })}
                          className="flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950"
                          aria-label={`${t("saison.remove")} ${gov}`}
                          title={t("saison.remove")}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="eg-gov" className={labelCls}>{t("saison.addGov")}</Label>
              <Input
                id="eg-gov" list="eg-govs" value={newGov} onChange={e => setNewGov(e.target.value)}
                placeholder="Nabeul" className="h-9 w-44"
              />
              <datalist id="eg-govs">
                {GOVERNORATS.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={addGovernorate}>
              <Plus className="h-4 w-4" aria-hidden /> {t("saison.add")}
            </Button>
            <Button
              size="sm" className="ml-auto h-9 gap-1.5"
              disabled={busyKey !== null || !saisonDirty}
              onClick={saveSaison}
            >
              {busyKey === "SAISONNALITE" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- CHEVAUCHEMENT ---- */}
      <Card>
        <CardHeader className="gap-1.5 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Gauge className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" aria-hidden /> {t("chev.title")}
            {chevDirty ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {t("dirty")}
              </span>
            ) : null}
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("chev.desc")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="eg-facteur" className="text-sm font-medium">{t("chev.facteur")}</Label>
              <Input
                id="eg-facteur" inputMode="decimal" min={0} max={1} step={0.01}
                value={chev.facteurSupplementaire}
                onChange={e => setChev(c => ({ ...c, facteurSupplementaire: e.target.value }))}
                className="h-10 tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("chev.facteurDesc")}</p>
              <p className="text-xs text-muted-foreground">Actuel : {numFr(data.CHEVAUCHEMENT.facteurSupplementaire)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eg-croissance" className="text-sm font-medium">{t("chev.croissance")}</Label>
              <Input
                id="eg-croissance" inputMode="decimal" min={0} max={1} step={0.01}
                value={chev.croissanceJournaliere}
                onChange={e => setChev(c => ({ ...c, croissanceJournaliere: e.target.value }))}
                className="h-10 tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("chev.croissanceDesc")}</p>
              <p className="text-xs text-muted-foreground">Actuel : {numFr(data.CHEVAUCHEMENT.croissanceJournaliere)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eg-plafond" className="text-sm font-medium">{t("chev.plafond")}</Label>
              <Input
                id="eg-plafond" inputMode="decimal" min={1} max={10} step={0.1}
                value={chev.plafondUnicite}
                onChange={e => setChev(c => ({ ...c, plafondUnicite: e.target.value }))}
                className="h-10 tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("chev.plafondDesc")}</p>
              <p className="text-xs text-muted-foreground">Actuel : {numFr(data.CHEVAUCHEMENT.plafondUnicite)}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-9 gap-1.5" disabled={busyKey !== null || !chevDirty} onClick={saveChev}>
              {busyKey === "CHEVAUCHEMENT" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- COUT ---- */}
      <Card>
        <CardHeader className="gap-1.5 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Coins className="h-4.5 w-4.5 text-[#b0563b] dark:text-[#e0957a]" aria-hidden /> {t("cout.title")}
            {coutDirty ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {t("dirty")}
              </span>
            ) : null}
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("cout.desc")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="eg-cpm" className="text-sm font-medium">{t("cout.cpm")}</Label>
              <Input
                id="eg-cpm" inputMode="decimal" min={0} step={0.05}
                value={cout.cpmReference}
                onChange={e => setCout(c => ({ ...c, cpmReference: e.target.value }))}
                className="h-10 tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("cout.cpmDesc")}</p>
              <p className="text-xs text-muted-foreground">Actuel : {numFr(data.COUT.cpmReference)} DT</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eg-marge" className="text-sm font-medium">{t("cout.marge")}</Label>
              <Input
                id="eg-marge" inputMode="decimal" min={0} max={1} step={0.01}
                value={cout.margePlateforme}
                onChange={e => setCout(c => ({ ...c, margePlateforme: e.target.value }))}
                className="h-10 tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("cout.margeDesc")}</p>
              <p className="text-xs text-muted-foreground">Actuel : {numFr(data.COUT.margePlateforme)}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-9 gap-1.5" disabled={busyKey !== null || !coutDirty} onClick={saveCout}>
              {busyKey === "COUT" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
