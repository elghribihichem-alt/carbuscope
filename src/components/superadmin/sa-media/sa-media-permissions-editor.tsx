'use client'

// CarbuScope — Module Média (T60-g) : ÉDITEUR GUIDÉ de permissions d'une face
// (SA — Sheet). Aucun code brut : RadioGroup PUBLIQUE / GRANULAIRE / EXCLUSIVE,
// blocs structurés (enseignes autorisées, interdictions prioritaires, groupes,
// zones, conditions commerciales), enseigne réservataire en mode exclusif.
// Enregistrement : PATCH /api/media/permissions/[faceId] — en mode
// PUBLIQUE/EXCLUSIVE les listes sont remises à zéro côté serveur.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Ban, CheckCircle2, Coins, Eye, Loader2, Lock, MapPinned, Save, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { apiJson, VISIBILITY_MODE_META } from "@/components/media/media-shared"
import type { FaceRuleDTO, PermissionsMatrixResponse } from "@/lib/media/shared"
import { GOVERNORATS, useSaMediaT } from "./sa-media-shared"

const DICT = {
  fr: {
    title: "Permissions de la face",
    desc: "Choisir le mode de visibilité puis structurer les autorisations. Les interdictions priment toujours.",
    mode: "Mode de visibilité",
    "mode.publique": "Publique — visible par toutes les enseignes",
    "mode.granulaire": "Granulaire — autorisations, exclusions, zones, conditions",
    "mode.exclusive": "Exclusive — réservée à une seule enseigne",
    "excl.brand": "Enseigne réservataire",
    "excl.brandPh": "Sélectionner l'enseigne…",
    "excl.required": "Mode exclusif : sélectionnez l'enseigne réservataire.",
    b1: "Enseignes autorisées",
    "b1.hint": "Vide = aucune restriction par enseigne (filtrée par les autres blocs).",
    b2: "Interdictions explicites",
    "b2.hint": "Ces enseignes ne verront JAMAIS la face en accès complet — priment toujours sur les autorisations.",
    b3: "Groupes autorisés",
    "b3.hint": "L'enseigne doit appartenir à l'un de ces groupes pour l'accès complet.",
    b4: "Zones autorisées (gouvernorats)",
    "b4.hint": "Vide = tout le territoire. Sinon la face n'est complète que dans ces gouvernorats.",
    b5: "Conditions commerciales",
    "b5.hint": "Appliquées à l'ancienneté du contrat SaaS et au budget — vérifiables via l'aperçu en direct.",
    "b5.age": "Ancienneté min (mois)",
    "b5.budget": "Budget min (DT)",
    "b5.none": "Aucune condition",
    save: "Enregistrer les permissions",
    saved: "Permissions mises à jour",
    empty: "aucune",
    current: "Règle actuelle",
    "err.save": "Échec de l'enregistrement",
  },
  en: {
    title: "Face permissions",
    desc: "Pick the visibility mode then structure the authorizations. Exclusions always win.",
    mode: "Visibility mode",
    "mode.publique": "Public — visible to every brand",
    "mode.granulaire": "Granular — allowlists, exclusions, zones, conditions",
    "mode.exclusive": "Exclusive — reserved to one brand",
    "excl.brand": "Reserving brand",
    "excl.brandPh": "Select the brand…",
    "excl.required": "Exclusive mode: select the reserving brand.",
    b1: "Allowed brands",
    "b1.hint": "Empty = no brand restriction (other blocks still apply).",
    b2: "Explicit exclusions",
    "b2.hint": "These brands will NEVER get full access — always win over allowlists.",
    b3: "Allowed groups",
    "b3.hint": "The brand must belong to one of these groups for full access.",
    b4: "Allowed zones (governorates)",
    "b4.hint": "Empty = whole territory. Otherwise full access only in these governorates.",
    b5: "Commercial conditions",
    "b5.hint": "Applied on SaaS contract age and budget — check with the live preview.",
    "b5.age": "Min seniority (months)",
    "b5.budget": "Min budget (DT)",
    "b5.none": "No condition",
    save: "Save permissions",
    saved: "Permissions updated",
    empty: "none",
    current: "Current rule",
    "err.save": "Save failed",
  },
  ar: {
    title: "صلاحيات الوجه",
    desc: "اختر وضع الرؤية ثم اضبط التصاريح. الاستثناءات لها الأولوية دائمًا.",
    mode: "وضع الرؤية",
    "mode.publique": "عام — مرئي لكل العلامات",
    "mode.granulaire": "دقيق — تصاريح واستثناءات ومناطق وشروط",
    "mode.exclusive": "حصري — محجوز لعلامة واحدة",
    "excl.brand": "العلامة المحجوزة لها",
    "excl.brandPh": "اختر العلامة…",
    "excl.required": "الوضع الحصري: اختر العلامة.",
    b1: "العلامات المسموح لها",
    "b1.hint": "فارغ = بلا قيود على العلامات.",
    b2: "الاستثناءات الصريحة",
    "b2.hint": "لن تحصل هذه العلامات أبدًا على وصول كامل.",
    b3: "المجموعات المسموح لها",
    "b3.hint": "يجب أن تنتمي العلامة إلى إحدى هذه المجموعات.",
    b4: "المناطق المسموح بها",
    "b4.hint": "فارغ = كل الأراضي.",
    b5: "الشروط التجارية",
    "b5.hint": "تُطبق على عمر العقد والميزانية.",
    "b5.age": "أقل قدم (أشهر)",
    "b5.budget": "أقل ميزانية",
    "b5.none": "بلا شرط",
    save: "حفظ الصلاحيات",
    saved: "تم تحديث الصلاحيات",
    empty: "لا شيء",
    current: "القاعدة الحالية",
    "err.save": "فشل الحفظ",
  },
}

export interface SaMediaPermEditorProps {
  rule: FaceRuleDTO | null
  matrix: PermissionsMatrixResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

interface EditorState {
  mode: string
  exclusiveBrandSlug: string
  allowedBrandSlugs: Set<string>
  excludedBrandSlugs: Set<string>
  allowedGroups: Set<string>
  allowedZones: Set<string>
  condAge: string
  condBudget: string
  noCond: boolean
}

export function SaMediaPermEditor({ rule, matrix, open, onOpenChange, onSaved }: SaMediaPermEditorProps) {
  const { t } = useSaMediaT(DICT)
  const [st, setSt] = useState<EditorState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !rule) { setSt(null); return }
    const c = rule.conditions
    setSt({
      mode: rule.mode,
      exclusiveBrandSlug: rule.exclusiveBrandSlug ?? "",
      allowedBrandSlugs: new Set(rule.allowedBrandSlugs),
      excludedBrandSlugs: new Set(rule.excludedBrandSlugs),
      allowedGroups: new Set(rule.allowedGroups),
      allowedZones: new Set(rule.allowedZones),
      condAge: c?.ancienneteMinMois !== undefined ? String(c.ancienneteMinMois) : "",
      condBudget: c?.budgetMin !== undefined ? String(c.budgetMin) : "",
      noCond: c === null || (c.ancienneteMinMois === undefined && c.budgetMin === undefined),
    })
  }, [open, rule])

  const brands = useMemo(() => matrix?.brands ?? [], [matrix])
  const groups = useMemo(() => matrix?.groups ?? [], [matrix])
  const modeMeta = st ? VISIBILITY_MODE_META[st.mode] : null

  const toggleSet = (set: Set<string>, v: string): Set<string> => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }

  async function save() {
    if (!st || !rule || busy) return
    if (st.mode === "EXCLUSIVE" && !st.exclusiveBrandSlug) { toast.error(t("excl.required")); return }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { mode: st.mode }
      if (st.mode === "EXCLUSIVE") body.exclusiveBrandSlug = st.exclusiveBrandSlug
      if (st.mode === "GRANULAIRE") {
        body.allowedBrandSlugs = [...st.allowedBrandSlugs]
        body.excludedBrandSlugs = [...st.excludedBrandSlugs]
        body.allowedGroups = [...st.allowedGroups]
        body.allowedZones = [...st.allowedZones]
        body.conditions = st.noCond
          ? null
          : {
            ancienneteMinMois: st.condAge.trim() === "" ? undefined : Number(st.condAge),
            budgetMin: st.condBudget.trim() === "" ? undefined : Number(st.condBudget),
            typesEnseignes: [],
          }
      }
      await apiJson(`/api/media/permissions/${rule.faceId}`, { method: "PATCH", body: JSON.stringify(body) })
      toast.success(t("saved"), { description: `${rule.code} → ${VISIBILITY_MODE_META[st.mode]?.label ?? st.mode}` })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(t("err.save"), { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  if (!rule || !st) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg" />
      </Sheet>
    )
  }

  const checkboxRow = (checked: boolean, onChange: () => void, label: React.ReactNode, key: string) => (
    <label
      key={key}
      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <Checkbox checked={checked} onCheckedChange={onChange} aria-label={String(label)} />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  )

  const brandLabel = (slug: string) => {
    const b = brands.find(x => x.slug === slug)
    return (
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-zinc-300 dark:border-zinc-600" style={{ backgroundColor: b?.color ?? "#a1a1aa" }} aria-hidden />
        {b?.name ?? slug}
      </span>
    )
  }

  const blocTitle = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <Sheet open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{rule.code}</SheetTitle>
          <SheetDescription>
            {rule.panelName} · {rule.ville} — {t("desc")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {/* ---- Règle actuelle ---- */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2.5">
            <span className="text-xs text-muted-foreground">{t("current")} :</span>
            <Badge variant="outline" className={modeMeta?.className ?? ""}>{modeMeta?.label ?? st.mode}</Badge>
            {st.mode === "EXCLUSIVE" && st.exclusiveBrandSlug ? (
              <Badge variant="outline" className="border-terracotta bg-[#fdeee8] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]">
                <Lock className="h-3 w-3" aria-hidden /> {brands.find(b => b.slug === st.exclusiveBrandSlug)?.name ?? st.exclusiveBrandSlug}
              </Badge>
            ) : null}
            {st.excludedBrandSlugs.size > 0 ? (
              <Badge variant="outline" className="gap-1 border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                <Ban className="h-3 w-3" aria-hidden /> {st.excludedBrandSlugs.size}
              </Badge>
            ) : null}
          </div>

          {/* ---- Mode ---- */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("mode")}</Label>
            <RadioGroup
              value={st.mode}
              onValueChange={v => setSt(s => s ? { ...s, mode: v } : s)}
              className="gap-2"
              disabled={busy}
            >
              {(["PUBLIQUE", "GRANULAIRE", "EXCLUSIVE"] as const).map(m => {
                const meta = VISIBILITY_MODE_META[m]
                return (
                  <label
                    key={m}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <RadioGroupItem value={m} className="mt-0.5" />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium">{t(`mode.${m.toLowerCase()}`)}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{meta.hint}</span>
                    </span>
                  </label>
                )
              })}
            </RadioGroup>
          </div>

          {/* ---- EXCLUSIVE : enseigne réservataire ---- */}
          {st.mode === "EXCLUSIVE" ? (
            <div className="space-y-1.5 rounded-lg border border-[#e7c4b5] bg-[#fdeee8]/60 p-3 dark:border-[#7a3c2a] dark:bg-[#2a1a13]/50">
              <Label className="text-sm font-semibold">{t("excl.brand")}</Label>
              <Select value={st.exclusiveBrandSlug} onValueChange={v => setSt(s => s ? { ...s, exclusiveBrandSlug: v } : s)} disabled={busy}>
                <SelectTrigger className="h-10 bg-background"><SelectValue placeholder={t("excl.brandPh")} /></SelectTrigger>
                <SelectContent>
                  {brands.map(b => <SelectItem key={b.slug} value={b.slug}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Seule cette enseigne verra la face en accès complet — les autres en vue agrégée.
              </p>
            </div>
          ) : null}

          {/* ---- GRANULAIRE : 4 blocs + conditions ---- */}
          {st.mode === "GRANULAIRE" ? (
            <div className="space-y-4">
              <div className="space-y-1.5 rounded-lg border p-3">
                <p className={blocTitle}><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("b1")}</p>
                <p className="text-[11px] text-muted-foreground">{t("b1.hint")}</p>
                <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {brands.map(b => checkboxRow(
                    st.allowedBrandSlugs.has(b.slug),
                    () => setSt(s => s ? { ...s, allowedBrandSlugs: toggleSet(s.allowedBrandSlugs, b.slug) } : s),
                    brandLabel(b.slug), b.slug,
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{st.allowedBrandSlugs.size} sélectionnée(s)</p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-amber-300/70 bg-amber-50/40 p-3 dark:border-amber-800/70 dark:bg-amber-950/30">
                <p className={blocTitle}><Ban className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden /> {t("b2")}</p>
                <p className="text-[11px] font-medium text-amber-700/90 dark:text-amber-400/90">{t("b2.hint")}</p>
                <div className="grid max-h-40 grid-cols-1 gap-0.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {brands.map(b => checkboxRow(
                    st.excludedBrandSlugs.has(b.slug),
                    () => setSt(s => s ? { ...s, excludedBrandSlugs: toggleSet(s.excludedBrandSlugs, b.slug) } : s),
                    brandLabel(b.slug), `x-${b.slug}`,
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{st.excludedBrandSlugs.size} interdite(s)</p>
              </div>

              <div className="space-y-1.5 rounded-lg border p-3">
                <p className={blocTitle}><Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("b3")}</p>
                <p className="text-[11px] text-muted-foreground">{t("b3.hint")}</p>
                {groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun groupe — créez-en un dans « Groupes d&apos;enseignes ».</p>
                ) : (
                  <div className="space-y-0.5">
                    {groups.map(g => checkboxRow(
                      st.allowedGroups.has(g.name),
                      () => setSt(s => s ? { ...s, allowedGroups: toggleSet(s.allowedGroups, g.name) } : s),
                      <span>
                        <span className="font-medium">{g.name}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">({g.brandSlugs.length} enseignes)</span>
                      </span>,
                      `g-${g.id}`,
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 rounded-lg border p-3">
                <p className={blocTitle}><MapPinned className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("b4")}</p>
                <p className="text-[11px] text-muted-foreground">{t("b4.hint")}</p>
                <div className="grid max-h-40 grid-cols-2 gap-0.5 overflow-y-auto pr-1 sm:grid-cols-3">
                  {GOVERNORATS.map(g => checkboxRow(
                    st.allowedZones.has(g),
                    () => setSt(s => s ? { ...s, allowedZones: toggleSet(s.allowedZones, g) } : s),
                    g, `z-${g}`,
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{st.allowedZones.size === 0 ? t("empty") : st.allowedZones.size} gouvernorat(s)</p>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <p className={blocTitle}><Coins className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("b5")}</p>
                <p className="text-[11px] text-muted-foreground">{t("b5.hint")}</p>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <Checkbox
                    checked={st.noCond}
                    onCheckedChange={v => setSt(s => s ? { ...s, noCond: v === true } : s)}
                  />
                  {t("b5.none")}
                </label>
                {!st.noCond ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="pm-age" className="text-xs">{t("b5.age")}</Label>
                      <Input
                        id="pm-age" inputMode="decimal" className="h-9 tabular-nums" value={st.condAge}
                        disabled={busy} onChange={e => setSt(s => s ? { ...s, condAge: e.target.value } : s)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pm-budget" className="text-xs">{t("b5.budget")}</Label>
                      <Input
                        id="pm-budget" inputMode="decimal" className="h-9 tabular-nums" value={st.condBudget}
                        disabled={busy} onChange={e => setSt(s => s ? { ...s, condBudget: e.target.value } : s)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <Separator />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void save()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {t("save")}
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3 shrink-0" aria-hidden />
            L&apos;aperçu en direct (colonne de droite) permet de vérifier la vue exacte d&apos;une enseigne après enregistrement.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
