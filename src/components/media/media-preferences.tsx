'use client'

// CarbuScope — T60-f — Volet « Préférences » du module Média (par membre) :
// pondérations du score composite (4 sliders, normalisation à 100 % à la
// sauvegarde + exemple live), branding des PDF (couleur / mention / logo),
// et note informative sur la langue (elle suit le sélecteur global FR/EN/AR).

import { useEffect, useMemo, useState } from "react"
import { CircleAlert, Check, Gauge, Languages, Loader2, Palette, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { compositeScore } from "@/lib/media/shared"
import { apiJson, pctFr, useLocalT } from "./media-shared"

const DICT = {
  fr: {
    title: "Préférences du module Média",
    desc: "Vos préférences sont personnelles : elles adaptent le score composite de l'explorateur et l'habillage de vos PDF.",
    weights: "Pondérations du score composite",
    weightsDesc: "Le score classe les faces de l'explorateur selon vos priorités. La somme est normalisée à 100 % lors de l'enregistrement.",
    "w.audience": "Audience",
    "w.trafic": "Trafic",
    "w.prix": "Prix (inversé — moins cher = mieux)",
    "w.partDeVoix": "Part de voix",
    weightsSum: "Somme actuelle",
    weightsNormalized: "seront normalisés à 100 %",
    weightsExample: "Aperçu live — score de faces types",
    weightsExampleDesc: "Trois archétypes recalculés avec vos pondérations :",
    branding: "Branding des PDF",
    brandingDesc: "Appliqué au rapport PDF généré côté serveur (en-tête, mention de pied de page).",
    "branding.couleur": "Couleur d'accent (hex)",
    "branding.mention": "Mention de pied de page",
    "branding.logo": "URL du logo",
    "branding.logoPreview": "Aperçu du logo",
    lang: "Langue de l'interface du module",
    langDesc: "La langue suit le sélecteur global de la plateforme (FR / EN / AR) — aucun réglage propre au module.",
    langPreview: "Aperçu des libellés :",
    save: "Enregistrer",
    saving: "Enregistrement…",
    saved: "Préférences enregistrées",
    errLoad: "Chargement des préférences impossible",
    errSave: "Enregistrement impossible",
    errHex: "Couleur invalide — format attendu #059669",
    retry: "Réessayer",
    "preset.emerald": "Émeraude",
    "preset.amber": "Ambre",
    "preset.terracotta": "Terracotta",
  },
  en: {
    title: "Media module preferences",
    desc: "Your preferences are personal: they tune the explorer composite score and your PDF branding.",
    weights: "Composite score weights",
    weightsDesc: "The score ranks explorer faces by your priorities. The sum is normalized to 100% on save.",
    "w.audience": "Audience",
    "w.trafic": "Traffic",
    "w.prix": "Price (inverted — cheaper = better)",
    "w.partDeVoix": "Share of voice",
    weightsSum: "Current sum",
    weightsNormalized: "will be normalized to 100%",
    weightsExample: "Live preview — typical faces score",
    weightsExampleDesc: "Three archetypes recomputed with your weights:",
    branding: "PDF branding",
    brandingDesc: "Applied to the server-generated PDF report (header, footer mention).",
    "branding.couleur": "Accent color (hex)",
    "branding.mention": "Footer mention",
    "branding.logo": "Logo URL",
    "branding.logoPreview": "Logo preview",
    lang: "Module interface language",
    langDesc: "The language follows the platform-wide selector (FR / EN / AR) — no module-specific setting.",
    langPreview: "Label preview:",
    save: "Save",
    saving: "Saving…",
    saved: "Preferences saved",
    errLoad: "Failed to load preferences",
    errSave: "Save failed",
    errHex: "Invalid color — expected format #059669",
    retry: "Retry",
    "preset.emerald": "Emerald",
    "preset.amber": "Amber",
    "preset.terracotta": "Terracotta",
  },
  ar: {
    title: "تفضيلات وحدة الإعلام",
    weights: "أوزان النقطة المركبة",
    "w.audience": "الجمهور",
    "w.trafic": "الحركة",
    "w.prix": "السعر",
    "w.partDeVoix": "الحصة الصوتية",
    branding: "هوية PDF",
    "branding.couleur": "اللون",
    "branding.mention": "ذكر أسفل الصفحة",
    "branding.logo": "رابط الشعار",
    lang: "لغة الواجهة",
    langDesc: "اللغة تتبع المحدد العام للمنصة.",
    save: "حفظ",
    saved: "تم حفظ التفضيلات",
    retry: "إعادة المحاولة",
  },
}

const PRESETS: ReadonlyArray<{ hex: string; labelKey: string }> = [
  { hex: "#059669", labelKey: "preset.emerald" },
  { hex: "#d97706", labelKey: "preset.amber" },
  { hex: "#b0563b", labelKey: "preset.terracotta" },
]

/** Trois archétypes de faces pour l'aperçu live du score (valeurs types). */
const ARCHETYPES: ReadonlyArray<{ code: string; audienceJournaliere: number; tmja: number; prixSemaine: number; partDeVoix: number }> = [
  { code: "Face type — artère principale", audienceJournaliere: 42_000, tmja: 26_000, prixSemaine: 980, partDeVoix: 46 },
  { code: "Face type — axe secondaire", audienceJournaliere: 18_500, tmja: 11_000, prixSemaine: 420, partDeVoix: 22 },
  { code: "Face type — boulevard commerçant", audienceJournaliere: 29_000, tmja: 15_500, prixSemaine: 650, partDeVoix: 31 },
]

interface PrefsState {
  weights: { audience: number; trafic: number; prix: number; partDeVoix: number } // 0..1
  couleur: string
  mention: string
  logoUrl: string
}

export function MediaPreferences() {
  const { t } = useLocalT(DICT)
  const [prefs, setPrefs] = useState<PrefsState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [logoBroken, setLogoBroken] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiJson<{
          scoreWeights: { audience: number; trafic: number; prix: number; partDeVoix: number }
          branding: { logoUrl?: string; couleur?: string; mention?: string }
        }>("/api/media/preferences")
        setPrefs({
          weights: {
            audience: r.scoreWeights.audience ?? 0.35,
            trafic: r.scoreWeights.trafic ?? 0.25,
            prix: r.scoreWeights.prix ?? 0.2,
            partDeVoix: r.scoreWeights.partDeVoix ?? 0.2,
          },
          couleur: r.branding.couleur ?? "#059669",
          mention: r.branding.mention ?? "",
          logoUrl: r.branding.logoUrl ?? "",
        })
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : "error")
      }
    })()
  }, [])

  const sliders: { key: "audience" | "trafic" | "prix" | "partDeVoix"; labelKey: string }[] = [
    { key: "audience", labelKey: "w.audience" },
    { key: "trafic", labelKey: "w.trafic" },
    { key: "prix", labelKey: "w.prix" },
    { key: "partDeVoix", labelKey: "w.partDeVoix" },
  ]

  const sum = useMemo(() => {
    if (!prefs) return 0
    return Math.round((prefs.weights.audience + prefs.weights.trafic + prefs.weights.prix + prefs.weights.partDeVoix) * 100)
  }, [prefs])

  // Score live des archétypes avec les pondérations courantes
  const liveScores = useMemo(() => {
    if (!prefs) return []
    return compositeScore(
      ARCHETYPES.map(a => ({
        audienceJournaliere: a.audienceJournaliere,
        tmja: a.tmja,
        prixSemaine: a.prixSemaine,
        partDeVoix: a.partDeVoix,
      })),
      prefs.weights,
    )
  }, [prefs])

  function setWeight(key: "audience" | "trafic" | "prix" | "partDeVoix", pct: number) {
    setPrefs(prev => {
      if (!prev) return prev
      return { ...prev, weights: { ...prev.weights, [key]: pct / 100 } }
    })
  }

  async function save() {
    if (!prefs) return
    if (prefs.couleur.trim() && !/^#[0-9a-fA-F]{6}$/.test(prefs.couleur.trim())) {
      toast.error(t("errHex"))
      return
    }
    setSaving(true)
    try {
      const total = prefs.weights.audience + prefs.weights.trafic + prefs.weights.prix + prefs.weights.partDeVoix
      const norm = total > 0 ? total : 1
      await apiJson("/api/media/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          scoreWeights: {
            audience: prefs.weights.audience / norm,
            trafic: prefs.weights.trafic / norm,
            prix: prefs.weights.prix / norm,
            partDeVoix: prefs.weights.partDeVoix / norm,
          },
          branding: {
            couleur: prefs.couleur.trim() || undefined,
            mention: prefs.mention.trim() || undefined,
            logoUrl: prefs.logoUrl.trim() || undefined,
          },
        }),
      })
      toast.success(t("saved"))
      // recharge pour refléter la normalisation serveur
      const r = await apiJson<{
        scoreWeights: { audience: number; trafic: number; prix: number; partDeVoix: number }
        branding: { logoUrl?: string; couleur?: string; mention?: string }
      }>("/api/media/preferences")
      setPrefs({
        weights: {
          audience: r.scoreWeights.audience ?? 0.25,
          trafic: r.scoreWeights.trafic ?? 0.25,
          prix: r.scoreWeights.prix ?? 0.25,
          partDeVoix: r.scoreWeights.partDeVoix ?? 0.25,
        },
        couleur: r.branding.couleur ?? "#059669",
        mention: r.branding.mention ?? "",
        logoUrl: r.branding.logoUrl ?? "",
      })
    } catch (e) {
      toast.error(t("errSave"), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <CircleAlert className="h-6 w-6 text-[#b0563b]" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("errLoad")}</p>
          <Button type="button" variant="outline" className="h-10" onClick={() => window.location.reload()}>
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!prefs) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-base font-bold leading-tight">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("desc")}</p>
        </CardContent>
      </Card>

      {/* Pondérations du score composite */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
            {t("weights")}
          </CardTitle>
          <CardDescription>{t("weightsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4">
            {sliders.map(s => (
              <div key={s.key} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`w-${s.key}`} className="text-xs font-medium">{t(s.labelKey)}</Label>
                  <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-semibold tabular-nums dark:border-zinc-800">
                    {Math.round(prefs.weights[s.key] * 100)} %
                  </span>
                </div>
                <Slider
                  id={`w-${s.key}`}
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round(prefs.weights[s.key] * 100)]}
                  onValueChange={v => setWeight(s.key, v[0] ?? 0)}
                  aria-label={t(s.labelKey)}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t("weightsSum")} : <strong className={sum === 100 ? "text-[#059669] dark:text-emerald-400" : "text-[#d97706] dark:text-amber-500"}>{pctFr(sum)}</strong></span>
            {sum !== 100 ? <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">{t("weightsNormalized")}</span> : null}
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium">{t("weightsExample")}</p>
            <p className="text-[11px] text-muted-foreground">{t("weightsExampleDesc")}</p>
            <div className="space-y-2">
              {ARCHETYPES.map((a, i) => (
                <div key={a.code} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{a.code}</span>
                    <span className="shrink-0 font-bold tabular-nums text-[#059669] dark:text-emerald-400">
                      {(liveScores[i] ?? 0).toLocaleString("fr-FR")} / 100
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-[#059669] transition-all dark:bg-emerald-600"
                      style={{ width: `${Math.min(100, Math.max(2, liveScores[i] ?? 0))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding PDF */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-[#d97706] dark:text-amber-500" aria-hidden />
            {t("branding")}
          </CardTitle>
          <CardDescription>{t("brandingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pref-color" className="text-xs font-medium">{t("branding.couleur")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="pref-color"
                value={prefs.couleur}
                onChange={e => setPrefs(prev => (prev ? { ...prev, couleur: e.target.value } : prev))}
                placeholder="#059669"
                className="h-10 w-32 font-mono"
              />
              <span className="h-10 w-10 rounded-md border border-zinc-200 dark:border-zinc-800" style={{ backgroundColor: prefs.couleur }} aria-hidden />
              {PRESETS.map(p => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setPrefs(prev => (prev ? { ...prev, couleur: p.hex } : prev))}
                  title={t(p.labelKey)}
                  aria-label={`${t(p.labelKey)} ${p.hex}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 transition-transform hover:scale-105 dark:border-zinc-800"
                  style={{ backgroundColor: p.hex }}
                >
                  {prefs.couleur.toLowerCase() === p.hex ? <Check className="h-4 w-4 text-white" aria-hidden /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pref-mention" className="text-xs font-medium">{t("branding.mention")}</Label>
            <Input
              id="pref-mention"
              value={prefs.mention}
              onChange={e => setPrefs(prev => (prev ? { ...prev, mention: e.target.value } : prev))}
              placeholder="Document confidentiel — usage interne"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pref-logo" className="text-xs font-medium">{t("branding.logo")}</Label>
            <div className="flex flex-wrap items-start gap-3">
              <Input
                id="pref-logo"
                type="url"
                value={prefs.logoUrl}
                onChange={e => {
                  setLogoBroken(false)
                  setPrefs(prev => (prev ? { ...prev, logoUrl: e.target.value } : prev))
                }}
                placeholder="https://…/logo.png"
                className="h-10 flex-1 min-w-56"
              />
              {prefs.logoUrl && !logoBroken ? (
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={prefs.logoUrl}
                    alt={t("branding.logoPreview")}
                    className="h-10 rounded-md border border-zinc-200 bg-white object-contain p-1 dark:border-zinc-800"
                    onError={() => setLogoBroken(true)}
                  />
                  <span className="text-[10px] text-muted-foreground">{t("branding.logoPreview")}</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Langue */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Languages className="h-4 w-4 text-[#b0563b] dark:text-[#e0957a]" aria-hidden />
            {t("lang")}
          </CardTitle>
          <CardDescription>{t("langDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{t("langPreview")}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-800">FR — Média &amp; Panneaux urbains</span>
            <span className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-800">EN — Media &amp; Urban Panels</span>
            <span className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-800" dir="rtl">AR — الإعلام واللوحات الحضرية</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          onClick={() => void save()}
          disabled={saving}
          className="h-11 gap-2 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  )
}
