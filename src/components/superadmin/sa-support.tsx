"use client"

// Super Administration — ⑧ Support & Communication : la voix des clients
// enseignes et la voix de l'éditeur. File de tickets (fiche détaillée avec fil
// de discussion façon chat + réponses staff + réorientation), centre d'annonces
// avec bannière système globale (diffusion immédiate), et journal des
// incidents de service (lecture seule, alimenté par la supervision).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import {
  formatDate, formatDateTime, formatInt, joursEntre, pastille, PRIORITE_META, TICKET_STATUT_META,
  SEVERITE_META, AUDIENCE_META, INCIDENT_STATUT_META,
  type AnnonceDTO, type IncidentDTO, type SupervisionResponse, type TicketDTO, type TicketMessageDTO,
} from "@/lib/sa-types"
import {
  LifeBuoy, Inbox, Timer, CheckCircle2, Zap, RefreshCw, Plus, Send, Megaphone, X, Info,
  AlertTriangle, Wrench, MessagesSquare, Filter, Radio, Clock, UserRound, Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Constantes métier
// ---------------------------------------------------------------------------
const STAFF = ["Nadia Ben Amor", "Yasmine Tounsi", "Hichem Jaziri", "Olfa Mahjoub"] as const
const ASSIGNE_NONE = "__none__"

const BRANDS = [
  { slug: "agil", nom: "Agil Tunisia" },
  { slug: "totalenergies", nom: "TotalEnergies Tunisie" },
  { slug: "shell", nom: "Shell Tunisia" },
  { slug: "staroil", nom: "Staroil" },
  { slug: "ola", nom: "Ola Energy" },
] as const

const BRAND_COLORS: Record<string, string> = {
  agil: "#059669",
  totalenergies: "#d97706",
  shell: "#dc2626",
  staroil: "#9333ea",
  ola: "#e07856",
  med: "#64748b",
}

const STATUTS = ["OUVERT", "EN_COURS", "EN_ATTENTE_CLIENT", "RESOLU", "FERME"] as const
const PRIORITES = ["BASSE", "NORMALE", "HAUTE", "URGENTE"] as const
const STATUT_ORDER: Record<string, number> = { OUVERT: 0, EN_COURS: 1, EN_ATTENTE_CLIENT: 2, RESOLU: 3, FERME: 4 }

type TicketsKpis = { total: number; ouverts: number; enCours: number; resoluJour: number; urgents: number }
type TicketsResponse = { tickets: TicketDTO[]; kpis: TicketsKpis }
type AnnoncesResponse = { annonces: AnnonceDTO[] }

/** « 2026-09-18T… » → « aujourd'hui », « hier », « il y a 3 j »… */
function dateRelative(iso: string): string {
  const jours = Math.abs(joursEntre(iso))
  if (jours === 0) return "aujourd'hui"
  if (jours === 1) return "hier"
  if (jours < 7) return `il y a ${jours} j`
  if (jours < 30) return `il y a ${Math.floor(jours / 7)} sem.`
  return `il y a ${Math.floor(jours / 30)} mois`
}

/** Extrait tronqué pour les cellules de tableau. */
function extraire(contenu: string, max = 80): string {
  const t = contenu.trim().replace(/\s+/g, " ")
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function brandBadge(slug: string) {
  return (
    <Badge variant="outline" className="gap-1.5 text-[11px] font-medium">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND_COLORS[slug] ?? "#64748b" }} aria-hidden />
      {slug}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// En-têtes de section / états communs
// ---------------------------------------------------------------------------
function ErreurCard({ message, onRetry, label }: { message: string; onRetry: () => void; label: string }) {
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
        <div>
          <p className="font-semibold">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dialogue — fiche ticket : fil de discussion + réponse staff + réorientation
// ---------------------------------------------------------------------------
function TicketDetailDialog({
  ticket, open, onOpenChange, onRefresh,
}: {
  ticket: TicketDTO | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onRefresh: () => void
}) {
  const [detail, setDetail] = useState<TicketDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState("")
  const [auteur, setAuteur] = useState<string>(STAFF[0])
  const [sending, setSending] = useState(false)
  const [patching, setPatching] = useState(false)

  useEffect(() => {
    if (!open || !ticket) return
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setDetail(null)
    setReply("")
    fetch(`/api/super/tickets/${ticket.id}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Erreur HTTP ${r.status}`))))
      .then((j: { ticket: TicketDTO }) => { setDetail(j.ticket); setLoading(false) })
      .catch(e => {
        if ((e as Error).name === "AbortError") return
        setError((e as Error).message || "Erreur inconnue")
        setLoading(false)
      })
    return () => ac.abort()
  }, [open, ticket])

  const sendReply = useCallback(async () => {
    if (!ticket || !reply.trim() || sending) return
    setSending(true)
    try {
      const r = await fetch(`/api/super/tickets/${ticket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: reply.trim(), auteur }),
      })
      if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`)
      const j = (await r.json()) as { ticket: TicketDTO }
      setDetail(j.ticket)
      setReply("")
      toast.success("Réponse envoyée", {
        description: `${ticket.numero} — le client sera notifié par e-mail. Statut mis à jour automatiquement si le ticket était ouvert.`,
      })
      onRefresh()
    } catch (e) {
      toast.error("Échec de l'envoi", { description: (e as Error).message })
    } finally {
      setSending(false)
    }
  }, [ticket, reply, auteur, sending, onRefresh])

  const patchTicket = useCallback(async (patch: { statut?: string; priorite?: string; assigneA?: string | null }, libelle: string) => {
    if (!ticket || patching) return
    setPatching(true)
    try {
      const r = await fetch(`/api/super/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`)
      const j = (await r.json()) as { ticket: TicketDTO }
      setDetail(j.ticket)
      toast.success(`${ticket.numero} — ${libelle}`)
      onRefresh()
    } catch (e) {
      toast.error("Modification impossible", { description: (e as Error).message })
    } finally {
      setPatching(false)
    }
  }, [ticket, patching, onRefresh])

  if (!ticket) return null
  const t = detail ?? ticket
  const messages: TicketMessageDTO[] = detail?.messages ?? []
  const pr = pastille(PRIORITE_META, t.priorite)
  const st = pastille(TICKET_STATUT_META, t.statut)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono text-sm text-muted-foreground">{ticket.numero}</span>
            <span className="min-w-0 flex-1 truncate">{t.sujet}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" className={cn("text-[11px]", st.className)}>{st.label}</Badge>
            <Badge variant="outline" className={cn("text-[11px]", pr.className)}>{pr.label}</Badge>
            {brandBadge(t.brandSlug)}
            <span className="text-xs">· demandeur : {t.demandeur}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-4">
          <div><span className="text-muted-foreground">Créé le</span><br />{formatDateTime(t.createdAt)}</div>
          <div><span className="text-muted-foreground">Dernière MAJ</span><br />{formatDateTime(t.updatedAt)} ({dateRelative(t.updatedAt)})</div>
          <div><span className="text-muted-foreground">Assigné à</span><br />{t.assigneA ?? <span className="text-muted-foreground">non assigné</span>}</div>
          <div><span className="text-muted-foreground">Messages</span><br />{formatInt(t.messagesCount)} dans le fil</div>
        </div>

        {/* Fil de discussion — façon chat : staff à droite, client à gauche */}
        <section aria-label="Fil de discussion du ticket" className="space-y-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <MessagesSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
            Fil de discussion
          </h4>
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="ml-auto h-16 w-3/4" />
              <Skeleton className="h-16 w-2/3" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-dashed border-red-300 p-4 text-center text-sm text-muted-foreground dark:border-red-800">
              Impossible de charger le fil de discussion ({error}).
              <Button size="sm" variant="outline" className="ml-2 h-7" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Aucun message dans ce fil.
            </p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
              {messages.map(m => (
                <div key={m.id} className={cn("flex", m.estStaff ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg border p-3",
                      m.estStaff
                        ? "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40"
                        : "border-border bg-muted/50",
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold">{m.auteur}</span>
                      {m.estStaff ? (
                        <Badge className="h-4 gap-1 border-violet-300 bg-violet-100 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
                          Équipe CarbuScope
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t.brandSlug}
                        </Badge>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.contenu}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Zone de réponse staff */}
        <section aria-label="Répondre au ticket" className="space-y-2">
          <Label htmlFor="reponse-ticket" className="text-xs font-medium text-muted-foreground">
            Répondre au nom de l&apos;équipe
          </Label>
          <Textarea
            id="reponse-ticket"
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Votre réponse au client… (un e-mail de notification lui sera envoyé)"
            rows={3}
            className="text-sm"
            disabled={sending}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <Select value={auteur} onValueChange={setAuteur} disabled={sending}>
                <SelectTrigger size="sm" className="h-8 w-[190px] text-xs" aria-label="Auteur de la réponse">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => void sendReply()} disabled={!reply.trim() || sending}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              {sending ? "Envoi…" : "Répondre"}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Réorientation : statut, priorité, assignation */}
        <section aria-label="Réorientation du ticket" className="space-y-2">
          <h4 className="text-sm font-semibold">Pilotage du ticket</h4>
          <p className="text-xs text-muted-foreground">
            Les changements ci-dessous sont enregistrés immédiatement (PATCH audité) et
            rafraîchissent la file.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Statut</Label>
              <Select value={t.statut} onValueChange={v => void patchTicket({ statut: v }, `statut « ${pastille(TICKET_STATUT_META, v).label} »`)} disabled={patching}>
                <SelectTrigger size="sm" className="text-xs" aria-label="Changer le statut">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUTS.map(s => <SelectItem key={s} value={s}>{pastille(TICKET_STATUT_META, s).label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priorité</Label>
              <Select value={t.priorite} onValueChange={v => void patchTicket({ priorite: v }, `priorité « ${pastille(PRIORITE_META, v).label} »`)} disabled={patching}>
                <SelectTrigger size="sm" className="text-xs" aria-label="Changer la priorité">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITES.map(p => <SelectItem key={p} value={p}>{pastille(PRIORITE_META, p).label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Assigné à</Label>
              <Select
                value={t.assigneA ?? ASSIGNE_NONE}
                onValueChange={v => void patchTicket({ assigneA: v === ASSIGNE_NONE ? null : v }, v === ASSIGNE_NONE ? "ticket désassigné" : `assigné à ${v}`)}
                disabled={patching}
              >
                <SelectTrigger size="sm" className="text-xs" aria-label="Changer l'assignation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ASSIGNE_NONE}>Non assigné</SelectItem>
                  {STAFF.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialogue — ouverture d'un ticket pour un client
// ---------------------------------------------------------------------------
function NewTicketDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [brand, setBrand] = useState<string>("agil")
  const [demandeur, setDemandeur] = useState("")
  const [sujet, setSujet] = useState("")
  const [priorite, setPriorite] = useState<string>("NORMALE")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setBrand("agil"); setDemandeur(""); setSujet(""); setPriorite("NORMALE"); setMessage("")
  }

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await fetch("/api/super/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug: brand, demandeur: demandeur.trim(), sujet: sujet.trim(), priorite, message: message.trim() }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      }
      const j = (await r.json()) as { ticket: TicketDTO }
      toast.success(`Ticket ${j.ticket.numero} ouvert`, {
        description: `« ${j.ticket.sujet} » pour ${brand} — il apparaît en tête de file.`,
      })
      reset()
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast.error("Création impossible", { description: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  const valide = demandeur.trim().length > 2 && sujet.trim().length > 3 && message.trim().length > 5

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ouvrir un ticket pour un client</DialogTitle>
          <DialogDescription>
            Saisie de la demande reçue hors plateforme (téléphone, e-mail, visite) — le fil
            démarre côté client, la première réponse staff passera le ticket en « En cours ».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nt-brand">Enseigne</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger id="nt-brand" aria-label="Enseigne concernée">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => (
                    <SelectItem key={b.slug} value={b.slug}>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND_COLORS[b.slug] }} aria-hidden />
                        {b.nom}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-priorite">Priorité</Label>
              <Select value={priorite} onValueChange={setPriorite}>
                <SelectTrigger id="nt-priorite" aria-label="Priorité du ticket">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITES.map(p => (
                    <SelectItem key={p} value={p}>{pastille(PRIORITE_META, p).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-demandeur">Demandeur</Label>
            <Input id="nt-demandeur" value={demandeur} onChange={e => setDemandeur(e.target.value)}
              placeholder="Nom et e-mail — ex. Mehdi Lasram (commercial@agil.tn)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-sujet">Sujet</Label>
            <Input id="nt-sujet" value={sujet} onChange={e => setSujet(e.target.value)}
              placeholder="Ex. Ajouter 12 stations récemment rebrandées" maxLength={160} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-message">Message initial (demande du client)</Label>
            <Textarea id="nt-message" value={message} onChange={e => setMessage(e.target.value)} rows={4}
              placeholder="Décrivez la demande telle que formulée par le client…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={!valide || submitting}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {submitting ? "Création…" : "Ouvrir le ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Panneau — file de tickets
// ---------------------------------------------------------------------------
function TicketsPanel({
  tickets, kpis, loading, error, onRetry, onRowClick, onNewTicket,
  fStatut, setFStatut, fBrand, setFBrand,
}: {
  tickets: TicketDTO[]
  kpis: TicketsKpis | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onRowClick: (t: TicketDTO) => void
  onNewTicket: () => void
  fStatut: string
  setFStatut: (v: string) => void
  fBrand: string
  setFBrand: (v: string) => void
}) {
  const columns: DataViewColumn<TicketDTO>[] = useMemo(() => [
    {
      key: "numero", header: "N°", sortValue: (t) => t.numero,
      render: (t) => <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{t.numero}</span>,
    },
    {
      key: "sujet", header: "Sujet", sortValue: (t) => t.sujet,
      render: (t) => (
        <span className="block max-w-[260px]">
          <span className="block truncate text-sm font-medium leading-tight">{t.sujet}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{t.demandeur}</span>
        </span>
      ),
    },
    {
      key: "enseigne", header: "Enseigne", sortValue: (t) => t.brandSlug,
      render: (t) => brandBadge(t.brandSlug),
    },
    {
      key: "priorite", header: "Priorité", sortValue: (t) => t.priorite,
      render: (t) => {
        const p = pastille(PRIORITE_META, t.priorite)
        return <Badge variant="outline" className={cn("text-[11px]", p.className)}>{p.label}</Badge>
      },
    },
    {
      key: "statut", header: "Statut", sortValue: (t) => t.statut, hideInNested: true,
      render: (t) => {
        const s = pastille(TICKET_STATUT_META, t.statut)
        return <Badge variant="outline" className={cn("text-[11px]", s.className)}>{s.label}</Badge>
      },
    },
    {
      key: "assigne", header: "Assigné", sortValue: (t) => t.assigneA ?? "zz",
      render: (t) => t.assigneA
        ? <span className="whitespace-nowrap text-xs">{t.assigneA}</span>
        : <span className="text-xs italic text-muted-foreground">non assigné</span>,
    },
    {
      key: "dernier", header: "Dernier message", sortValue: (t) => t.dernierMessage?.createdAt ?? t.updatedAt,
      render: (t) => t.dernierMessage ? (
        <span className="block max-w-[260px]">
          <span className="block truncate text-xs leading-snug">
            <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", t.dernierMessage.estStaff ? "bg-violet-500" : "bg-slate-400")} aria-hidden />
            {extraire(t.dernierMessage.contenu, 70)}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {t.dernierMessage.auteur} · {dateRelative(t.dernierMessage.createdAt)}
          </span>
        </span>
      ) : (
        <span className="text-xs italic text-muted-foreground">—</span>
      ),
    },
    {
      key: "maj", header: "MAJ", align: "right", sortValue: (t) => t.updatedAt,
      render: (t) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" title={formatDateTime(t.updatedAt)}>
          {dateRelative(t.updatedAt)}
        </span>
      ),
    },
  ], [])

  if (error) return <ErreurCard message={error} onRetry={onRetry} label="Impossible de charger la file de tickets" />

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>File de tickets support</CardTitle>
            <CardDescription>
              {loading && !tickets.length
                ? "Chargement de la file…"
                : `${formatInt(tickets.length)} ticket${tickets.length > 1 ? "s" : ""} affiché${tickets.length > 1 ? "s" : ""}${kpis ? ` — ${formatInt(kpis.total)} au total` : ""} · cliquez une ligne pour ouvrir la fiche et répondre`}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onNewTicket}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Ouvrir un ticket pour un client
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Select value={fStatut} onValueChange={setFStatut}>
            <SelectTrigger size="sm" className="w-[170px]" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {STATUTS.map(s => (
                <SelectItem key={s} value={s}>{pastille(TICKET_STATUT_META, s).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fBrand} onValueChange={setFBrand}>
            <SelectTrigger size="sm" className="w-[180px]" aria-label="Filtrer par enseigne">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les enseignes</SelectItem>
              {BRANDS.map(b => <SelectItem key={b.slug} value={b.slug}>{b.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading && tickets.length === 0 ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <DataViews
            viewKey="sa-tickets"
            columns={columns}
            rows={tickets}
            rowKey={(t) => t.id}
            maxHeightClassName="max-h-96"
            emptyMessage="Aucun ticket pour ces filtres — la file est à jour."
            onRowClick={onRowClick}
            nested={{
              groupKey: (t) => t.statut,
              groupLabel: (gk, grows) => {
                const s = pastille(TICKET_STATUT_META, gk)
                return (
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", s.point ?? "bg-slate-400")} aria-hidden />
                    {s.label}
                    <span className="text-[11px] font-normal text-primary/70">
                      — {grows.length} ticket{grows.length > 1 ? "s" : ""}
                    </span>
                  </span>
                )
              },
              groupSortValue: (gk) => STATUT_ORDER[gk] ?? 99,
              hideColumnKeyInGroups: "statut",
              defaultOpen: "all",
            }}
            renderCard={(t) => {
              const s = pastille(TICKET_STATUT_META, t.statut)
              const p = pastille(PRIORITE_META, t.priorite)
              return (
                <Card className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md" onClick={() => onRowClick(t)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{t.numero}</span>
                      <Badge variant="outline" className={cn("text-[10px]", s.className)}>{s.label}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug">{t.sujet}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {brandBadge(t.brandSlug)}
                      <Badge variant="outline" className={cn("text-[10px]", p.className)}>{p.label}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.demandeur} · {t.assigneA ? `assigné à ${t.assigneA}` : "non assigné"}
                    </p>
                    {t.dernierMessage && (
                      <p className="mt-2 line-clamp-2 rounded border-l-2 border-violet-300 pl-2 text-xs leading-snug text-muted-foreground dark:border-violet-800">
                        {extraire(t.dernierMessage.contenu, 110)}
                        <span className="mt-0.5 block text-[10px]">
                          {t.dernierMessage.auteur} · {dateRelative(t.dernierMessage.createdAt)}
                        </span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dialogue — diffusion d'une annonce (bannière système globale)
// ---------------------------------------------------------------------------
const SEVERITES_FORM = [
  { v: "INFO", titre: "Info", desc: "Bannière discrète, masquable", cls: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" },
  { v: "ATTENTION", titre: "Attention", desc: "Bannière ambre persistante", cls: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" },
  { v: "CRITIQUE", titre: "Critique", desc: "Bannière rouge, non masquable conseillé", cls: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" },
] as const

function AnnonceFormDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [titre, setTitre] = useState("")
  const [corps, setCorps] = useState("")
  const [severite, setSeverite] = useState<string>("INFO")
  const [audience, setAudience] = useState<string>("TOUTES")
  const [dateFin, setDateFin] = useState("")
  const [dissmissible, setDissmissible] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTitre(""); setCorps(""); setSeverite("INFO"); setAudience("TOUTES"); setDateFin(""); setDissmissible(true)
  }

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await fetch("/api/super/annonces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: titre.trim(), corps: corps.trim(), audience, severite, dateFin: dateFin || null, dissmissible }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      }
      toast.success("Annonce diffusée — visible immédiatement dans la bannière de tous les espaces concernés", {
        description: `« ${titre.trim()} » (${pastille(SEVERITE_META, severite).label} · ${AUDIENCE_META[audience] ?? audience}).`,
      })
      reset()
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast.error("Diffusion impossible", { description: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  const valide = titre.trim().length > 3 && corps.trim().length > 10

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
            Diffuser une annonce
          </DialogTitle>
          <DialogDescription>
            L&apos;annonce devient active immédiatement : la bannière système située sous
            l&apos;en-tête de chaque espace concerné se met à jour au prochain affichage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="an-titre">Titre</Label>
            <Input id="an-titre" value={titre} onChange={e => setTitre(e.target.value)} maxLength={120}
              placeholder="Ex. Maintenance planifiée samedi 02:00–04:00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="an-corps">Corps</Label>
            <Textarea id="an-corps" value={corps} onChange={e => setCorps(e.target.value)} rows={3} maxLength={2000}
              placeholder="Message complet affiché au survol / sur mobile au fil de la bannière…" />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Sévérité</legend>
            <RadioGroup value={severite} onValueChange={setSeverite} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SEVERITES_FORM.map(s => (
                <Label
                  key={s.v}
                  htmlFor={`sev-${s.v}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs leading-snug transition-colors",
                    s.cls,
                    severite === s.v ? "ring-2 ring-ring" : "opacity-75 hover:opacity-100",
                  )}
                >
                  <RadioGroupItem id={`sev-${s.v}`} value={s.v} className="mt-0.5" />
                  <span>
                    <span className="block font-semibold">{s.titre}</span>
                    <span className="block text-muted-foreground">{s.desc}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="an-audience">Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger id="an-audience" aria-label="Audience de l'annonce">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_META).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-fin">Fin (optionnelle)</Label>
              <Input id="an-fin" type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                aria-label="Date de fin d'affichage, optionnelle" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0">
              <Label htmlFor="an-dismiss" className="text-sm">Masquable par l&apos;utilisateur</Label>
              <p className="text-xs text-muted-foreground">
                Décochez pour une annonce que personne ne peut masquer (incidents critiques).
              </p>
            </div>
            <Switch id="an-dismiss" checked={dissmissible} onCheckedChange={setDissmissible} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={!valide || submitting} className="bg-violet-600 text-white hover:bg-violet-700">
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {submitting ? "Diffusion…" : "Diffuser maintenant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Panneau — annonces & bannière système
// ---------------------------------------------------------------------------
function AnnoncesPanel({
  annonces, loading, error, onRetry, onNew,
}: {
  annonces: AnnonceDTO[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onNew: () => void
}) {
  const [pendingOff, setPendingOff] = useState<AnnonceDTO | null>(null)

  const toggleActive = useCallback(async (a: AnnonceDTO, active: boolean) => {
    try {
      const r = await fetch(`/api/super/annonces?id=${encodeURIComponent(a.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      }
      toast.success(active ? "Annonce réactivée" : "Annonce archivée", {
        description: `« ${a.titre} » — ${active ? "elle redevient visible dans la bannière." : "elle disparaît de la bannière immédiatement."}`,
      })
      onRetry()
    } catch (e) {
      toast.error("Action impossible", { description: (e as Error).message })
    }
  }, [onRetry])

  const columns: DataViewColumn<AnnonceDTO>[] = useMemo(() => [
    {
      key: "titre", header: "Annonce", sortValue: (a) => a.titre,
      render: (a) => (
        <span className="block max-w-[300px]">
          <span className="block truncate text-sm font-medium leading-tight">{a.titre}</span>
          <span className="block truncate text-[11px] text-muted-foreground" title={a.corps}>
            {extraire(a.corps, 90)}
          </span>
        </span>
      ),
    },
    {
      key: "severite", header: "Sévérité", sortValue: (a) => a.severite,
      render: (a) => {
        const s = pastille(SEVERITE_META, a.severite)
        return <Badge variant="outline" className={cn("text-[11px]", s.className)}>{s.label}</Badge>
      },
    },
    {
      key: "audience", header: "Audience", sortValue: (a) => a.audience,
      render: (a) => (
        <Badge variant="outline" className="text-[11px] text-muted-foreground">
          {AUDIENCE_META[a.audience] ?? a.audience}
        </Badge>
      ),
    },
    {
      key: "periode", header: "Période", sortValue: (a) => a.dateDebut,
      render: (a) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(a.dateDebut)} → {a.dateFin ? formatDate(a.dateFin) : <span className="italic">sans fin</span>}
        </span>
      ),
    },
    {
      key: "active", header: "État", align: "center", sortValue: (a) => (a.active ? 1 : 0),
      render: (a) => (
        <span className="flex items-center justify-center gap-2">
          <Switch
            checked={a.active}
            onCheckedChange={(on) => {
              if (!on && a.severite === "CRITIQUE" && a.active) {
                setPendingOff(a)
                return
              }
              void toggleActive(a, on)
            }}
            aria-label={a.active ? `Archiver l'annonce « ${a.titre} »` : `Réactiver l'annonce « ${a.titre} »`}
          />
          <span className={cn("text-[11px] font-medium", a.active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {a.active ? "diffusée" : "archivée"}
          </span>
        </span>
      ),
    },
    {
      key: "auteur", header: "Auteur", sortValue: (a) => a.auteur,
      render: (a) => <span className="whitespace-nowrap text-xs text-muted-foreground">{a.auteur}</span>,
    },
    {
      key: "dissmissible", header: "Masquable", align: "center", sortValue: (a) => (a.dissmissible ? 1 : 0),
      render: (a) => a.dissmissible ? (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">masquable</Badge>
      ) : (
        <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          <Trash2 className="mr-1 h-2.5 w-2.5" aria-hidden /> fixe
        </Badge>
      ),
    },
  ], [toggleActive])

  if (error) return <ErreurCard message={error} onRetry={onRetry} label="Impossible de charger les annonces" />

  return (
    <div className="space-y-4">
      {/* Où apparaissent les annonces + aperçu de la bannière */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
            Où apparaissent vos annonces
          </CardTitle>
          <CardDescription>
            La bannière système existe déjà dans tous les espaces (composant SystemBanner) :
            elle se place juste sous l&apos;en-tête, au-dessus du contenu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid gap-2 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
            <li className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 dark:border-amber-900 dark:bg-amber-950/30">
              <strong className="text-amber-800 dark:text-amber-300">ATTENTION / CRITIQUE</strong> —
              bannière persistante (ambre ou rouge), affichée en priorité ; une seule à la fois
              (la plus récente).
            </li>
            <li className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
              <strong className="text-emerald-800 dark:text-emerald-300">INFO</strong> — bannière
              discrète (émeraude), masquable par l&apos;utilisateur si l&apos;annonce l&apos;autorise.
            </li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900">
              <strong>Mode maintenance</strong> — prioritaire sur toute annonce : activable dans
              l&apos;onglet Supervision.
            </li>
          </ul>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Aperçu statique d&apos;une bannière « attention » (rendu réel : SystemBanner)
            </p>
            {/* Simulation figée de la bannière — aucune donnée live ici */}
            <div
              role="img"
              aria-label="Aperçu statique de la bannière système ambre avec icône mégaphone, titre en gras et bouton de fermeture"
              className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="font-semibold">Maintenance planifiée samedi 02:00–04:00</span>
              <span className="hidden min-w-0 flex-1 truncate sm:inline">Une maintenance de la base de données est programmée…</span>
              <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                <X className="h-3 w-3" aria-hidden />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Centre d&apos;annonces</CardTitle>
              <CardDescription>
                {loading && !annonces.length
                  ? "Chargement…"
                  : `${formatInt(annonces.length)} annonce${annonces.length > 1 ? "s" : ""} — archivage et réactivation immédiats (audités)`}
              </CardDescription>
            </div>
            <Button size="sm" onClick={onNew} className="bg-violet-600 text-white hover:bg-violet-700">
              <Megaphone className="h-3.5 w-3.5" aria-hidden /> Diffuser une annonce
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && annonces.length === 0 ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <DataViews
              viewKey="sa-annonces"
              columns={columns}
              rows={annonces}
              rowKey={(a) => a.id}
              maxHeightClassName="max-h-96"
              emptyMessage="Aucune annonce enregistrée — diffusez la première."
              renderCard={(a) => {
                const s = pastille(SEVERITE_META, a.severite)
                return (
                  <Card className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{a.titre}</p>
                        <Switch
                          checked={a.active}
                          onCheckedChange={(on) => {
                            if (!on && a.severite === "CRITIQUE" && a.active) {
                              setPendingOff(a)
                              return
                            }
                            void toggleActive(a, on)
                          }}
                          aria-label={a.active ? `Archiver l'annonce « ${a.titre} »` : `Réactiver l'annonce « ${a.titre} »`}
                        />
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{a.corps}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px]", s.className)}>{s.label}</Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{AUDIENCE_META[a.audience] ?? a.audience}</Badge>
                        {a.dissmissible
                          ? <Badge variant="outline" className="text-[10px] text-muted-foreground">masquable</Badge>
                          : <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">fixe</Badge>}
                        <span className={cn("text-[10px] font-medium", a.active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                          {a.active ? "· diffusée" : "· archivée"}
                        </span>
                      </div>
                      <Separator className="my-2.5" />
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(a.dateDebut)} → {a.dateFin ? formatDate(a.dateFin) : "sans fin"} · par {a.auteur}
                      </p>
                    </CardContent>
                  </Card>
                )
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Confirmation — archivage d'une annonce CRITIQUE */}
      <AlertDialog open={!!pendingOff} onOpenChange={(o) => { if (!o) setPendingOff(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver cette annonce critique ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {pendingOff?.titre} » est diffusée en sévérité CRITIQUE. L&apos;archiver la
              retirera immédiatement de la bannière de tous les espaces concernés. Confirmez
              seulement si l&apos;incident est bien terminé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingOff(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingOff) void toggleActive(pendingOff, false)
                setPendingOff(null)
              }}
            >
              Archiver l&apos;annonce
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panneau — incidents de service (lecture seule)
// ---------------------------------------------------------------------------
function dureeHumaine(debut: string, fin: string | null): string {
  const ms = (fin ? new Date(fin).getTime() : Date.now()) - new Date(debut).getTime()
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${min % 60 > 0 ? `${min % 60} min` : ""}`.trim()
  return `${Math.floor(h / 24)} j`
}

function IncidentsPanel({
  incidents, loading, error, onRetry,
}: {
  incidents: IncidentDTO[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (error) return <ErreurCard message={error} onRetry={onRetry} label="Impossible de charger les incidents" />

  const dotCls: Record<string, string> = {
    EN_COURS: "bg-red-500",
    SURVEILLE: "bg-amber-500",
    RESOLU: "bg-emerald-500",
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" aria-hidden />
              Incidents de service
            </CardTitle>
            <CardDescription>
              Journal alimenté par la supervision — consultation seule, la saisie et la
              clôture passent par l&apos;onglet Supervision.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onRetry} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden /> Rafraîchir
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !incidents ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !incidents || incidents.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucun incident enregistré — la plateforme est stable.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l pl-6" aria-label="Chronologie des incidents">
            {incidents.map(inc => {
              const st = pastille(INCIDENT_STATUT_META, inc.statut)
              const sv = pastille(SEVERITE_META, inc.severite)
              return (
                <li key={inc.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background",
                      dotCls[inc.statut] ?? "bg-slate-400",
                    )}
                    aria-hidden
                  />
                  <div className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={cn("text-[11px]", st.className)}>{st.label}</Badge>
                      <Badge variant="outline" className={cn("text-[11px]", sv.className)}>{sv.label}</Badge>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {inc.composant}
                      </Badge>
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden />
                        {formatDate(inc.debut)} → {inc.fin ? formatDate(inc.fin) : "en cours"} · durée {dureeHumaine(inc.debut, inc.fin)}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold leading-snug">{inc.titre}</h4>
                    <p className="mt-1 text-sm font-medium leading-snug">{inc.impact}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{inc.description}</p>
                    {inc.resolution && (
                      <p className="mt-2 rounded border-l-2 border-emerald-400 bg-emerald-50/60 pl-2.5 text-xs leading-relaxed text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                        Résolution : {inc.resolution}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Module ⑧ — Support & Communication
// ---------------------------------------------------------------------------
export function SaSupport() {
  const [tab, setTab] = useState("tickets")

  // ---- Tickets : file filtrée (serveur) + KPIs globales (non filtrées)
  // Pattern « load » externe à l'effet (cf. sa-analytics) : les setState vivent
  // dans la fonction asynchrone, l'effet ne fait qu'abonner/annuler.
  const [tickets, setTickets] = useState<TicketDTO[]>([])
  const [kpis, setKpis] = useState<TicketsKpis | null>(null)
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [fStatut, setFStatut] = useState("all")
  const [fBrand, setFBrand] = useState("all")

  const loadTickets = useCallback(async (statut: string, brand: string, signal?: AbortSignal) => {
    setTicketsLoading(true)
    setTicketsError(null)
    const params = new URLSearchParams()
    if (statut !== "all") params.set("statut", statut)
    if (brand !== "all") params.set("brand", brand)
    const qs = params.toString()
    try {
      const reqs: Promise<Response>[] = [fetch(`/api/super/tickets${qs ? `?${qs}` : ""}`, { signal })]
      if (qs) reqs.push(fetch("/api/super/tickets", { signal })) // KPIs non filtrées
      const rs = await Promise.all(reqs)
      const js = await Promise.all(rs.map(r => (r.ok ? r.json() : Promise.reject(new Error(`Erreur HTTP ${r.status}`)))))
      const filtre = js[0] as TicketsResponse
      setTickets(filtre.tickets)
      setKpis((js[1] as TicketsResponse | undefined)?.kpis ?? filtre.kpis)
      setTicketsLoading(false)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setTicketsError((e as Error).message || "Erreur inconnue")
      setTicketsLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void loadTickets(fStatut, fBrand, ac.signal)
    return () => ac.abort()
  }, [loadTickets, fStatut, fBrand])

  const refreshTickets = useCallback(() => {
    void loadTickets(fStatut, fBrand)
  }, [loadTickets, fStatut, fBrand])

  // ---- Annonces
  const [annonces, setAnnonces] = useState<AnnonceDTO[]>([])
  const [annoncesLoading, setAnnoncesLoading] = useState(true)
  const [annoncesError, setAnnoncesError] = useState<string | null>(null)

  const loadAnnonces = useCallback(async (signal?: AbortSignal) => {
    setAnnoncesLoading(true)
    setAnnoncesError(null)
    try {
      const r = await fetch("/api/super/annonces", { signal })
      if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`)
      const j = (await r.json()) as AnnoncesResponse
      setAnnonces(j.annonces)
      setAnnoncesLoading(false)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setAnnoncesError((e as Error).message || "Erreur inconnue")
      setAnnoncesLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void loadAnnonces(ac.signal)
    return () => ac.abort()
  }, [loadAnnonces])

  const refreshAnnonces = useCallback(() => {
    void loadAnnonces()
  }, [loadAnnonces])

  // ---- Incidents (chargés paresseusement à l'ouverture de l'onglet)
  const [incidents, setIncidents] = useState<IncidentDTO[] | null>(null)
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [incidentsError, setIncidentsError] = useState<string | null>(null)

  const loadIncidents = useCallback(async (signal?: AbortSignal) => {
    setIncidentsLoading(true)
    setIncidentsError(null)
    try {
      const r = await fetch("/api/super/supervision", { signal })
      if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`)
      const j = (await r.json()) as SupervisionResponse
      setIncidents(j.incidents ?? [])
      setIncidentsLoading(false)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setIncidentsError((e as Error).message || "Erreur inconnue")
      setIncidentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== "incidents") return
    const ac = new AbortController()
    void loadIncidents(ac.signal)
    return () => ac.abort()
  }, [tab, loadIncidents])

  const refreshIncidents = useCallback(() => {
    void loadIncidents()
  }, [loadIncidents])

  // ---- Dialogues
  const [selected, setSelected] = useState<TicketDTO | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [newTicketOpen, setNewTicketOpen] = useState(false)
  const [annonceOpen, setAnnonceOpen] = useState(false)

  const openTicket = useCallback((t: TicketDTO) => {
    setSelected(t)
    setDetailOpen(true)
  }, [])

  return (
    <div className="space-y-4">
      {/* En-tête du module */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <LifeBuoy className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
            Support &amp; Communication
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La relation client au quotidien : file de tickets enseignes, annonces de service et
            transparence sur les incidents.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { refreshTickets(); refreshAnnonces(); }} disabled={ticketsLoading || annoncesLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5", (ticketsLoading || annoncesLoading) && "animate-spin")} aria-hidden />
          Rafraîchir
        </Button>
      </header>

      {/* KPIs — vue instantanée de la file */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Tickets (total)" value={kpis ? formatInt(kpis.total) : "—"} icon={LifeBuoy} tone="info" sub="historique complet du support" />
        <KpiCard
          label="Ouverts"
          value={kpis ? formatInt(kpis.ouverts) : "—"}
          icon={Inbox}
          tone={kpis && kpis.ouverts > 0 ? "danger" : "success"}
          sub={kpis && kpis.ouverts > 0 ? "en attente de première réponse" : "aucun ticket en attente"}
        />
        <KpiCard label="En cours / attente client" value={kpis ? formatInt(kpis.enCours) : "—"} icon={Timer} tone="warning" sub="pris en charge par l'équipe" />
        <KpiCard label="Résolus (7 j)" value={kpis ? formatInt(kpis.resoluJour) : "—"} icon={CheckCircle2} tone="success" sub="clôturés favorablement" />
        <KpiCard
          label="Urgents ouverts"
          value={kpis ? formatInt(kpis.urgents) : "—"}
          icon={Zap}
          tone={kpis && kpis.urgents > 0 ? "danger" : "success"}
          sub="priorité URGENTE non résolue"
        />
      </div>

      {/* Sous-onglets internes */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="tickets" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
            <MessagesSquare className="h-4 w-4" aria-hidden /> Tickets clients
          </TabsTrigger>
          <TabsTrigger value="annonces" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
            <Megaphone className="h-4 w-4" aria-hidden /> Annonces &amp; bannière
          </TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1.5 px-2 py-2 text-xs sm:text-sm">
            <Radio className="h-4 w-4" aria-hidden /> Incidents de service
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-0 space-y-4">
          <TicketsPanel
            tickets={tickets}
            kpis={kpis}
            loading={ticketsLoading}
            error={ticketsError}
            onRetry={refreshTickets}
            onRowClick={openTicket}
            onNewTicket={() => setNewTicketOpen(true)}
            fStatut={fStatut}
            setFStatut={setFStatut}
            fBrand={fBrand}
            setFBrand={setFBrand}
          />
        </TabsContent>

        <TabsContent value="annonces" className="mt-0 space-y-4">
          <AnnoncesPanel
            annonces={annonces}
            loading={annoncesLoading}
            error={annoncesError}
            onRetry={refreshAnnonces}
            onNew={() => setAnnonceOpen(true)}
          />
        </TabsContent>

        <TabsContent value="incidents" className="mt-0 space-y-4">
          <IncidentsPanel
            incidents={incidents}
            loading={incidentsLoading}
            error={incidentsError}
            onRetry={refreshIncidents}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogues contrôlés */}
      <TicketDetailDialog
        ticket={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={refreshTickets}
      />
      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        onCreated={refreshTickets}
      />
      <AnnonceFormDialog
        open={annonceOpen}
        onOpenChange={setAnnonceOpen}
        onCreated={refreshAnnonces}
      />
    </div>
  )
}
