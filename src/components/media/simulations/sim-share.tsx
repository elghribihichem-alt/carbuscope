'use client'

// CarbuScope — T60-f — Étape 5 de l'assistant : EXPORT & DIFFUSION.
// PDF serveur (filigrane optionnel), export tableur, LIEN PARTAGEABLE SIGNÉ
// (30 j, lecture seule), WhatsApp via simple lien wa.me (AUCUNE API Business),
// email via mailto avec annuaire des membres pré-inscrits (si habilité),
// et « Marquer comme envoyée » (statut ENVOYEE).

import { useEffect, useState } from "react"
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { apiJson, dateFr, dtFr, numFr, useLocalT } from "../media-shared"
import type { SimulationDTO } from "@/lib/media/shared"

const DICT = {
  fr: {
    title: "Export & diffusion",
    desc: "Partagez le rapport : PDF signé côté serveur, tableur, lien lecture seule valable 30 jours.",
    needCompute: "Aucun résultat enregistré",
    needComputeDesc: "Le rapport ne peut pas être exporté avant le calcul du moteur.",
    needComputeBtn: "Lancer le calcul",
    computing: "Calcul en cours… (< 2 s)",
    pdf: "Rapport PDF",
    pdfDesc: "Généré côté serveur, en-tête aux couleurs de l'enseigne.",
    pdfWatermark: "Filigrane « CONFIDENTIEL »",
    pdfBtn: "Télécharger le PDF",
    xlsx: "Export tableur (xlsx)",
    xlsxDesc: "Faces sélectionnées + onglet paramètres, pour vos outils internes.",
    xlsxBtn: "Exporter le tableur",
    link: "Lien partageable signé",
    linkDesc: "Lecture seule, valable 30 jours, sans session — idéal pour un client ou un partenaire.",
    linkBtn: "Générer un lien",
    linkExpires: "Expire le",
    linkCopy: "Copier le lien",
    linkCopied: "Lien copié dans le presse-papiers",
    linkOpen: "Ouvrir",
    wa: "WhatsApp",
    waDesc: "Simple lien wa.me — aucune API Business, aucun numéro n'est collecté.",
    waBtn: "Envoyer sur WhatsApp",
    mail: "Email",
    mailDesc: "Client mail par défaut via mailto — pensez à l'annuaire des membres pré-inscrits du tenant.",
    mailTo: "Destinataires (saisie manuelle)",
    mailToHint: "Séparez par des virgules — sera ajouté en copie.",
    mailBtn: "Composer l'email",
    directory: "Annuaire des membres pré-inscrits",
    directoryHint: "Cliquez pour copier une adresse.",
    directoryNone: "Annuaire indisponible pour votre rôle — saisie manuelle.",
    sent: "Marquer comme envoyée",
    sentDesc: "Clôture la simulation : statut « Envoyée », sortie du fil des brouillons.",
    alreadySent: "Simulation déjà marquée « Envoyée »",
    sentOk: "Simulation marquée comme envoyée",
    summary: "Résumé du partage",
    errShare: "Génération du lien impossible",
    errCompute: "Calcul impossible",
    errSend: "Envoi impossible",
    readonly: "Consultation seule — la diffusion requiert le rôle habilité.",
  },
  en: {
    title: "Export & sharing",
    desc: "Share the report: server-signed PDF, spreadsheet, read-only link valid 30 days.",
    needCompute: "No stored results",
    needComputeDesc: "The report cannot be exported before the engine computation.",
    needComputeBtn: "Run computation",
    computing: "Computing… (< 2 s)",
    pdf: "PDF report",
    pdfDesc: "Generated server-side, headed with the brand colors.",
    pdfWatermark: "“CONFIDENTIAL” watermark",
    pdfBtn: "Download PDF",
    xlsx: "Spreadsheet export (xlsx)",
    xlsxDesc: "Selected faces + parameters sheet, for your internal tools.",
    xlsxBtn: "Export spreadsheet",
    link: "Signed shareable link",
    linkDesc: "Read-only, valid 30 days, no session — ideal for a client or partner.",
    linkBtn: "Generate a link",
    linkExpires: "Expires on",
    linkCopy: "Copy link",
    linkCopied: "Link copied to clipboard",
    linkOpen: "Open",
    wa: "WhatsApp",
    waDesc: "Plain wa.me link — no Business API, no number collected.",
    waBtn: "Send on WhatsApp",
    mail: "Email",
    mailDesc: "Default mail client via mailto — see the tenant member directory.",
    mailTo: "Recipients (manual entry)",
    mailToHint: "Comma-separated — will be added as copy.",
    mailBtn: "Compose email",
    directory: "Pre-registered member directory",
    directoryHint: "Click to copy an address.",
    directoryNone: "Directory unavailable for your role — manual entry.",
    sent: "Mark as sent",
    sentDesc: "Closes the simulation: “Sent” status, out of the drafts list.",
    alreadySent: "Simulation already marked “Sent”",
    sentOk: "Simulation marked as sent",
    summary: "Sharing summary",
    errShare: "Link generation failed",
    errCompute: "Computation failed",
    errSend: "Sending failed",
    readonly: "Read-only — sharing requires an authorized role.",
  },
  ar: {
    title: "التصدير والمشاركة",
    desc: "شارك التقرير: PDF موقع من الخادم، جدول بيانات، رابط قراءة فقط صالح 30 يوما.",
    needCompute: "لا توجد نتائج",
    needComputeBtn: "إطلاق الحساب",
    pdf: "تقرير PDF",
    xlsx: "تصدير جدول (xlsx)",
    link: "رابط مشاركة موقّع",
    linkBtn: "توليد رابط",
    linkExpires: "ينتهي في",
    linkCopy: "نسخ الرابط",
    linkCopied: "تم نسخ الرابط",
    wa: "واتساب",
    waBtn: "إرسال عبر واتساب",
    mail: "البريد الإلكتروني",
    mailBtn: "إنشاء الرسالة",
    sent: "وضع علامة مرسلة",
    sentOk: "تم وضع علامة مرسلة",
  },
}

interface ShareInfo {
  url: string
  expiresAt: string
}

export function SimShare({ sim, canExport, canSend, canListMembers, onComputed, onFinish }: {
  sim: SimulationDTO
  /** caps.export — PDF / XLSX / lien signé. */
  canExport: boolean
  /** caps.createSimulation — « Marquer comme envoyée » (PATCH ENVOYEE). */
  canSend: boolean
  /** caps.manageMembers — annuaire des emails du tenant. */
  canListMembers: boolean
  /** Après un compute lancé depuis l'étape 5 (résultats manquants). */
  onComputed: (sim: SimulationDTO) => void
  /** Retour à la liste après « Marquer comme envoyée ». */
  onFinish: () => void
}) {
  const { t } = useLocalT(DICT)
  const [watermark, setWatermark] = useState(false)
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [generating, setGenerating] = useState(false)
  const [computing, setComputing] = useState(false)
  const [sending, setSending] = useState(false)
  const [memberEmails, setMemberEmails] = useState<string[] | null>(null)
  const [manualEmails, setManualEmails] = useState("")

  useEffect(() => {
    if (!canListMembers || memberEmails !== null) return
    void apiJson<{ members: { email: string }[] }>("/api/media/members")
      .then(r => setMemberEmails(r.members.map(m => m.email)))
      .catch(() => setMemberEmails(null))
  }, [canListMembers, memberEmails])

  const results = sim.results
  const reportUrl = share?.url ?? `${typeof window === "undefined" ? "" : window.location.origin}/api/media/simulations/${sim.id}/pdf`

  const summary = results
    ? [
        `📊 ${sim.name}${sim.client ? ` — ${sim.client}` : ""}`,
        `📅 ${dateFr(sim.dateStart)} → ${dateFr(sim.dateEnd)} (${results.days} j)`,
        `🎯 ${results.facesCount} faces · ${results.formatsCount} formats · ${results.villesCount} villes`,
        `👁 ${numFr(results.odvTotal)} ODV · reach ${numFr(results.reach)} · fréquence ${results.frequence.toLocaleString("fr-FR")}`,
        `💰 CPM ${results.cpm.toLocaleString("fr-FR")} DT · budget estimé ${dtFr(results.coutTotal)}`,
        `Rapport CarbuScope :`,
      ].join("\n")
    : `${sim.name}`

  async function computeNow() {
    setComputing(true)
    try {
      const r = await apiJson<{ simulation: SimulationDTO }>(`/api/media/simulations/${sim.id}/compute`, { method: "POST" })
      onComputed(r.simulation)
      toast.success(t("computing"))
    } catch (e) {
      toast.error(t("errCompute"), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setComputing(false)
    }
  }

  async function generateLink() {
    setGenerating(true)
    try {
      const r = await apiJson<ShareInfo>(`/api/media/simulations/${sim.id}/share`, { method: "POST" })
      setShare(r)
      toast.success(t("linkDesc"))
    } catch (e) {
      toast.error(t("errShare"), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setGenerating(false)
    }
  }

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch {
      // Repli : sélection manuelle (contextes sans clipboard API)
      try {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
        toast.success(message)
      } catch {
        toast.error(message)
      }
    }
  }

  async function markSent() {
    setSending(true)
    try {
      await apiJson(`/api/media/simulations/${sim.id}`, { method: "PATCH", body: JSON.stringify({ status: "ENVOYEE" }) })
      toast.success(t("sentOk"))
      onFinish()
    } catch (e) {
      toast.error(t("errSend"), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSending(false)
    }
  }

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`CarbuScope — ${sim.name}`)}&body=${encodeURIComponent(`${summary}\n${reportUrl}`)}${manualEmails.trim() ? `&cc=${encodeURIComponent(manualEmails.trim())}` : ""}`
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${summary}\n${reportUrl}`)}`

  if (!results) {
    return (
      <Card className="border-amber-300 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4 text-[#d97706] dark:text-amber-500" aria-hidden />
            {t("needCompute")}
          </CardTitle>
          <CardDescription>{t("needComputeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            size="lg"
            onClick={computeNow}
            disabled={computing || !canSend}
            className="h-11 gap-2 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            {computing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {computing ? t("computing") : t("needComputeBtn")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
          <CardDescription>{t("desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* PDF */}
          <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#b0563b] dark:text-[#e0957a]" aria-hidden />
              <p className="text-sm font-semibold">{t("pdf")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("pdfDesc")}</p>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="wm" className="text-xs text-muted-foreground">{t("pdfWatermark")}</Label>
              <Switch id="wm" checked={watermark} onCheckedChange={setWatermark} aria-label={t("pdfWatermark")} />
            </div>
            <Button
              type="button"
              size="lg"
              disabled={!canExport}
              onClick={() => window.open(`/api/media/simulations/${sim.id}/pdf${watermark ? "?watermark=1" : ""}`, "_blank")}
              className="h-11 w-full gap-2 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              <FileText className="h-4 w-4" aria-hidden />
              {t("pdfBtn")}
            </Button>
          </div>

          {/* XLSX */}
          <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
              <p className="text-sm font-semibold">{t("xlsx")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("xlsxDesc")}</p>
            <div className="h-6" aria-hidden />
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={!canExport}
              onClick={() => window.open(`/api/media/simulations/${sim.id}/export`, "_blank")}
              className="h-11 w-full gap-2 border-[#059669] text-[#059669] hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              {t("xlsxBtn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lien signé */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
            {t("link")}
          </CardTitle>
          <CardDescription>{t("linkDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!share ? (
            <Button
              type="button"
              size="lg"
              disabled={!canExport || generating}
              onClick={generateLink}
              className="h-11 gap-2 border-[#d97706] bg-[#d97706] text-white hover:bg-[#b45309] dark:border-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
              {t("linkBtn")}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950">
                <Check className="h-4 w-4 shrink-0 text-[#059669] dark:text-emerald-400" aria-hidden />
                <Input
                  readOnly
                  value={share.url}
                  aria-label={t("link")}
                  className="h-9 flex-1 bg-transparent font-mono text-xs"
                  onFocus={e => e.target.select()}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  {t("linkExpires")} {dateFr(share.expiresAt)}
                </Badge>
                <Button type="button" size="sm" onClick={() => void copyText(share.url, t("linkCopied"))} className="h-9 gap-1.5">
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {t("linkCopy")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => window.open(share.url, "_blank")} className="h-9 gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  {t("linkOpen")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp + Email */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
              {t("wa")}
            </CardTitle>
            <CardDescription>{t("waDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild type="button" size="lg" disabled={!canExport} className="h-11 w-full gap-2 border-[#059669] bg-[#059669] text-white hover:bg-[#047857] dark:border-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600">
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t("waBtn")}
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-[#b0563b] dark:text-[#e0957a]" aria-hidden />
              {t("mail")}
            </CardTitle>
            <CardDescription>{t("mailDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-mails" className="text-xs text-muted-foreground">{t("mailTo")}</Label>
              <Input
                id="manual-mails"
                type="text"
                placeholder="client@exemple.tn, partenaire@exemple.tn"
                value={manualEmails}
                onChange={e => setManualEmails(e.target.value)}
                className="h-10"
              />
              <p className="text-[11px] text-muted-foreground">{t("mailToHint")}</p>
            </div>
            {canListMembers ? (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {t("directory")}
                </p>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {memberEmails === null ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : memberEmails.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    memberEmails.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => void copyText(m, t("linkCopied"))}
                        title={t("directoryHint")}
                        className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-700 transition-colors hover:border-[#059669] hover:bg-emerald-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-emerald-950"
                      >
                        {m}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("directoryNone")}</p>
            )}
            <Button asChild type="button" size="lg" disabled={!canExport} className="h-11 w-full gap-2 border-[#b0563b] bg-[#b0563b] text-white hover:bg-[#98482f] dark:border-[#7a3c2a] dark:bg-[#7a3c2a] dark:hover:bg-[#8a4530]">
              <a href={mailtoHref}>
                <Mail className="h-4 w-4" aria-hidden />
                {t("mailBtn")}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Clôture */}
      <Card className={sim.status === "ENVOYEE" ? "border-emerald-300 dark:border-emerald-800" : undefined}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Send className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
              {sim.status === "ENVOYEE" ? t("alreadySent") : t("sent")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("sentDesc")}</p>
          </div>
          {sim.status === "ENVOYEE" ? (
            <Badge variant="outline" className="shrink-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              <Check className="h-3 w-3" aria-hidden />
              ENVOYEE
            </Badge>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={!canSend || sending}
              onClick={markSent}
              className="h-11 shrink-0 gap-2 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {t("sent")}
            </Button>
          )}
        </CardContent>
      </Card>

      {!canExport || !canSend ? (
        <>
          <Separator />
          <p className="text-center text-xs text-muted-foreground">{t("readonly")}</p>
        </>
      ) : null}
    </div>
  )
}
