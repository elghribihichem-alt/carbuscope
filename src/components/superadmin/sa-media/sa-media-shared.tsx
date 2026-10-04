'use client'

// CarbuScope — Module Média (T60-g, sous-agent B) : socle partagé des 7 volets
// Super Administration « Média (référentiel) ». Aucune logique métier ici :
// types DTO SA (réponses brutes des routes /api/media/*), petit hook de fetch
// avec erreur+retry, constantes de listes (statuts, technologies, gouvernorats)
// et la CELLULE ÉDITABLE EN LIGNE (cœur du volet panneaux/trafic : clic →
// Input inline → PATCH /api/media/faces/[id] {field, value}, optimiste +
// rollback + toast sonner).

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { apiJson, useLocalT, type LocalDict } from "@/components/media/media-shared"
import type { FieldDef, PanelPhotoDTO } from "@/lib/media/shared"
import { cn } from "@/lib/utils"

// ─────────────────── DTO SA (réponses JSON des routes) ───────────────────

export interface SaMediaFaceDTO {
  id: string
  code: string
  orientation: string
  sensLecture: string
  status: string
  tmja: number
  audienceJournaliere: number
  odvJournalieres: number
  prixSemaine: number
  tauxOccupation12m: number
  partDeVoix: number
  visibilityMode: string
  exclusiveBrandSlug: string | null
  allowedBrandSlugs: string[]
  excludedBrandSlugs: string[]
  allowedGroups: string[]
  allowedZones: string[]
  visibilityConditions: { ancienneteMinMois?: number; budgetMin?: number; typesEnseignes?: string[] } | null
}

export interface SaMediaPanelDTO {
  id: string
  code: string
  name: string
  mediaType: string
  supportType: string
  format: string
  technology: string
  widthCm: number
  heightCm: number
  heightAboveGroundM: number
  illumination: string
  lat: number
  lng: number
  governorat: string
  delegation: string
  ville: string
  rue: string | null
  photos: PanelPhotoDTO[]
  status: string
  authorizationRef: string | null
  authorizationStart: string | null
  authorizationEnd: string | null
  createdAt?: string
  owner: { id: string; code: string; name: string; type: string; brandSlug: string | null }
  faces: SaMediaFaceDTO[]
}

export interface SaDashboardDTO {
  scope: "SA"
  kpis: { panels: number; faces: number; occupancy: number }
  topFaces: {
    code: string; panel: string; ville: string; format: string; technology: string
    odv: number; audience: number; sov: number; occupancy: number; status: string
  }[]
  expiring: { code: string; name: string; ville: string; authorizationRef: string | null; authorizationEnd: string | null }[]
}

export interface SaAuditPageDTO {
  entries: import("@/lib/media/shared").MediaAuditDTO[]
  total: number
  page: number
  pages: number
}

// ─────────────────── Listes de référence (FR) ───────────────────

export const GOVERNORATS = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba",
  "Kairouan", "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine",
  "Monastir", "Nabeul", "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine",
  "Tozeur", "Tunis", "Zaghouan",
] as const

export const SUPPORT_TYPES = ["GRAND_FORMAT", "MUR", "PANNEAU_SOL", "ABRIBUS", "GIRATOIRE", "MEUBLE_URBAIN"] as const
export const FORMATS = ["4x3", "8x4", "12x4", "2M2", "ABRIBUS_2M2", "BANDEROLE"] as const
export const TECHNOLOGIES = ["PAPIER", "BACKLIGHT", "LED", "TRIVISION", "AFFICHAGE_DYNAMIQUE"] as const
export const ILLUMINATIONS = ["AUCUNE", "PROJETEE", "FRONTALE", "LED"] as const
export const MEDIA_TYPES = ["URBAIN", "MOBILE", "FERROVIAIRE"] as const
export const ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const
export const PHOTO_ANGLES = ["FACE", "3/4", "PROFILE"] as const
export const PHOTO_MODES = ["JOUR", "NUIT"] as const

/** Jours restants avant échéance (négatif si dépassée). */
export const daysLeft = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return null
  return Math.ceil((d - Date.now()) / 86_400_000)
}

/** Badge échéance : rouge si < 30 j, ambre si < 90 j, sinon zinc discret. */
export const dueBadgeClass = (iso: string | null | undefined): string => {
  const d = daysLeft(iso)
  if (d === null) return "border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
  if (d < 30) return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
  if (d < 90) return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
  return "border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
}

// ─────────────────── Hook de fetch (erreur + Réessayer + reload) ───────────────────

/** Chargement d'une route JSON GET : { data, error, loading, reload }.
 *  « loading » est DÉRIVÉ d'une clé de requête (tick|url) — aucun setState
 *  synchrone dans l'effet (règle react-hooks/set-state-in-effect) ; l'effet
 *  ne fait que déclencher le fetch et résilier via AbortController. */
export function useSaMediaGet<T>(url: string): {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
  setData: React.Dispatch<React.SetStateAction<T | null>>
} {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const key = `${tick}|${url}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== key

  useEffect(() => {
    const ctrl = new AbortController()
    apiJson<T>(url, { signal: ctrl.signal })
      .then(d => {
        if (ctrl.signal.aborted) return
        setData(d)
        setError(null)
        setLoadedKey(key)
      })
      .catch(e => {
        if (ctrl.signal.aborted) return
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
        setLoadedKey(key)
      })
    return () => ctrl.abort()
  }, [key, url])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, error, loading, reload, setData }
}

// ─────────────────── Dict local FR/EN/AR (clés communes aux volets) ───────────────────

export const SA_MEDIA_BASE_DICT: LocalDict = {
  fr: {
    "common.loading": "Chargement…",
    "common.error": "Erreur de chargement",
    "common.retry": "Réessayer",
    "common.reload": "Actualiser",
    "common.empty": "Aucune donnée pour le moment.",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.delete": "Supprimer",
    "common.edit": "Modifier",
    "common.calculated": "calculée",
    "common.of": "sur",
    "common.actions": "Actions",
  },
  en: {
    "common.loading": "Loading…",
    "common.error": "Loading error",
    "common.retry": "Retry",
    "common.reload": "Refresh",
    "common.empty": "No data yet.",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.calculated": "computed",
    "common.of": "of",
    "common.actions": "Actions",
  },
  ar: {
    "common.loading": "جارٍ التحميل…",
    "common.error": "خطأ في التحميل",
    "common.retry": "إعادة المحاولة",
    "common.reload": "تحديث",
    "common.empty": "لا توجد بيانات.",
    "common.cancel": "إلغاء",
    "common.save": "حفظ",
    "common.delete": "حذف",
    "common.edit": "تعديل",
    "common.calculated": "محسوبة",
    "common.of": "من",
    "common.actions": "إجراءات",
  },
}

/** Fusion du dict de base + dict du volet (le volet prime). */
export function useSaMediaT(dict: LocalDict) {
  const merged: LocalDict = {
    fr: { ...SA_MEDIA_BASE_DICT.fr, ...(dict.fr ?? {}) },
    en: { ...SA_MEDIA_BASE_DICT.en, ...(dict.en ?? {}) },
    ar: { ...SA_MEDIA_BASE_DICT.ar, ...(dict.ar ?? {}) },
  }
  return useLocalT(merged)
}

// ─────────────────── Cellule éditable en ligne ───────────────────

/** PATCH une valeur de face (registre FACE_FIELDS — validation serveur). */
export async function patchFaceField(faceId: string, field: string, value: unknown): Promise<void> {
  await apiJson(`/api/media/faces/${faceId}`, { method: "PATCH", body: JSON.stringify({ field, value }) })
}

interface EditableCellProps {
  faceId: string
  def: FieldDef
  value: number | string | boolean | null
  /** Affichage formaté en lecture (numFr / dtFr / pctFr côté appelant). */
  formatted: string
  className?: string
  inputClassName?: string
  /** Applique la nouvelle valeur au state local (optimiste + rollback). */
  onCommit: (value: number | string | boolean | null) => void
  onSaved?: () => void
  compact?: boolean
}

/** Cellule cliquable → Input inline discret → validation (Entrée / blur /
 *  ✓) → PATCH optimiste avec rollback + toast. Cellules « CALCULE »
 *  (partDeVoix) rendues grisées avec mention « calculée ». */
export function EditableCell({ faceId, def, value, formatted, className, inputClassName, onCommit, onSaved, compact }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const { t } = useSaMediaT({})

  if (def.edit === "CALCULE") {
    return (
      <span
        className={cn(
          "inline-flex cursor-not-allowed items-center gap-1 text-zinc-400 dark:text-zinc-600",
          compact ? "text-xs" : "text-sm",
        )}
        title={t("common.calculated")}
      >
        <span className="tabular-nums">{formatted}</span>
        <span className="sr-only">({t("common.calculated")})</span>
      </span>
    )
  }

  if (editing) {
    const save = async () => {
      if (busy) return
      let typed: number | string | boolean | null
      if (def.type === "bool") typed = draft === "true"
      else if (def.type === "int" || def.type === "float") {
        const n = Number(draft.replace(",", "."))
        if (!Number.isFinite(n)) {
          toast.error("Valeur numérique attendue.")
          return
        }
        if (def.type === "int" && !Number.isInteger(n)) {
          toast.error("Valeur entière attendue.")
          return
        }
        typed = n
      } else typed = draft.trim() === "" ? null : draft.trim()

      setBusy(true)
      onCommit(typed) // optimiste
      try {
        await patchFaceField(faceId, def.key, typed)
        toast.success(`${def.label} mis à jour`, { description: `${formatted} → ${typed === null ? "—" : String(typed)}` })
        setEditing(false)
        onSaved?.()
      } catch (e) {
        onCommit(value) // rollback
        toast.error("Échec de l'édition", { description: e instanceof Error ? e.message : "Erreur inconnue." })
      } finally {
        setBusy(false)
      }
    }
    return (
      <span className="inline-flex items-center gap-1" onBlur={() => void save()}>
        <Input
          autoFocus
          type={def.type === "int" || def.type === "float" ? "number" : "text"}
          inputMode={def.type === "int" || def.type === "float" ? "decimal" : undefined}
          step={def.type === "float" ? "any" : "1"}
          value={draft}
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); void save() }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false) }
          }}
          className={cn(
            "h-7 w-24 min-w-0 px-1.5 text-xs tabular-nums",
            "border-amber-300 bg-amber-50 focus-visible:ring-amber-400 dark:border-amber-700 dark:bg-amber-950",
            inputClassName,
          )}
          aria-label={`${def.label} — édition`}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900"
          aria-label="Valider"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(false)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Annuler"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      title={`${def.label} — cliquer pour éditer`}
      onClick={() => { setDraft(def.type === "bool" ? String(value === true) : value === null || value === undefined ? "" : String(value)); setEditing(true) }}
      className={cn(
        "group/cell inline-flex min-h-8 items-center gap-1 rounded px-1.5 text-left tabular-nums transition-colors",
        "hover:bg-amber-50/70 hover:text-amber-900 dark:hover:bg-amber-950/40 dark:hover:text-amber-200",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <span>{formatted}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/cell:opacity-60" aria-hidden />
    </button>
  )
}
