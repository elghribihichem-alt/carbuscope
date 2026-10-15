'use client'

// T55-B3-b — Franchise > « candidats » : pipeline complet avec CRUD. La vue
// A2 (KPIs, filtres chips, table) est conservée à l'identique ; s'ajoutent :
// création (Dialog : identité, zone visée scorée, apport, expérience, notes),
// avancement / refus par ligne (PATCH statut → toasts), édition des notes
// (Dialog) et Sheet de détail complet (identité, zone, hubs pilotés, contrats
// liés + actions). POST/PATCH audité côté serveur (FRANCHISE).

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { ScoreBar } from "@/components/implantation/implantation-shared"
import { num } from "@/lib/chart"
import { CircleCheck, Handshake, UserRound, Users, Building2, UserPlus, ChevronRight, Ban, Pencil, FileSignature } from "lucide-react"
import { SectionHeader } from "./radar-shared"
import {
  CANDIDATE_STATUS_META, CANDIDATE_FLOW, CONTRACT_STATUS_META, nextStatus,
  money, fmtDateFr, franchiseApi,
  type CandidateDTO,
} from "./radar-franchise-shared"
import type { RadarZoneDTO } from "@/lib/radar-scoring"

export function FranchiseCandidats({
  candidates, reload, zones, brandSlug,
}: {
  candidates: CandidateDTO[]
  reload: () => void
  zones: RadarZoneDTO[]
  brandSlug: string | null
}) {
  const [filter, setFilter] = useState<string | null>(null)
  // Mutations : id en cours (spinners ligne), dialogues, sheet de détail.
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [notesTarget, setNotesTarget] = useState<CandidateDTO | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const x of candidates) c[x.status] = (c[x.status] ?? 0) + 1
    return c
  }, [candidates])

  const shown = filter ? candidates.filter(c => c.status === filter) : candidates
  const sheetCandidate = sheetId ? candidates.find(c => c.id === sheetId) ?? null : null

  /** PATCH statut (avancer / refuser) → toast + reload. */
  const patchStatus = async (c: CandidateDTO, status: string) => {
    setMutatingId(c.id)
    const res = await franchiseApi(`/api/franchise/candidates/${c.id}`, "PATCH", { status })
    setMutatingId(null)
    if (res.ok) {
      toast.success(
        status === "REFUSE"
          ? `${c.fullName} — dossier refusé.`
          : `${c.fullName} — avancé au statut « ${CANDIDATE_STATUS_META[status]?.label ?? status} ».`,
      )
      reload()
    } else {
      toast.error(res.message ?? "Mise à jour impossible.")
    }
  }

  const signed = counts.SIGNE ?? 0

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Module Franchise — candidats"
        description="Recrutement des franchisés des futurs points de service : pipeline interne (saisie par l'enseigne — formulaire public en V2), apport, expérience et hubs pilotés. Création, avancement et refus audités."
        icon={Handshake}
        badge={`${candidates.length} candidats`}
      />

      {/* KPIs (conservés de la coque A2) + création */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Candidats actifs" value={num(candidates.length - (counts.REFUSE ?? 0))} sub={`${candidates.length} dossiers au total`} icon={Users} />
        <KpiCard label="Signés" value={num(signed)} sub="franchisés opérationnels" icon={CircleCheck} tone="success" />
        <KpiCard label="En visite" value={num(counts.VISITE ?? 0)} sub="étape de validation terrain" icon={UserRound} tone="warning" />
        <KpiCard label="Hubs pilotés" value={num(candidates.reduce((s, c) => s + c.hubs.length, 0))} sub="par des franchisés signés" icon={Building2} />
        <div className="flex items-end">
          <Button type="button" className="min-h-11 w-full gap-1.5" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Nouveau candidat
          </Button>
        </div>
      </div>

      {/* Filtres par statut (chips — conservés) */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${filter === null ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-background hover:bg-muted"}`}
        >
          Tous ({candidates.length})
        </button>
        {Object.entries(CANDIDATE_STATUS_META).map(([status, meta]) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status === filter ? null : status)}
            className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${filter === status ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-background hover:bg-muted"}`}
          >
            {meta.label} ({counts[status] ?? 0})
          </button>
        ))}
      </div>

      {/* Table du pipeline (conservée + actions B3-b) */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidat</TableHead>
                  <TableHead>Zone visée</TableHead>
                  <TableHead className="text-right">Score zone</TableHead>
                  <TableHead className="text-right">Apport</TableHead>
                  <TableHead>Expérience</TableHead>
                  <TableHead>Hubs</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(c => {
                  const meta = CANDIDATE_STATUS_META[c.status] ?? CANDIDATE_STATUS_META.INTERESSE
                  const next = nextStatus(c.status)
                  const busy = mutatingId === c.id
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setSheetId(c.id)}
                      aria-label={`Ouvrir le dossier de ${c.fullName}`}
                    >
                      <TableCell>
                        <p className="font-medium">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground">{c.phone ?? c.email ?? "—"}</p>
                      </TableCell>
                      <TableCell>{c.gouvernorat}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.zoneNote}/100</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.capital)}</TableCell>
                      <TableCell className="max-w-52 text-xs text-muted-foreground">{c.experience ?? "—"}</TableCell>
                      <TableCell>
                        {c.hubs.length > 0 ? (
                          <span className="inline-flex flex-col gap-0.5">
                            {c.hubs.map(h => (
                              <span key={h.code} className="inline-flex items-center gap-1 text-xs tabular-nums">
                                <span className={`h-1.5 w-1.5 rounded-full ${h.status === "ACTIF" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
                                {h.code}
                              </span>
                            ))}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                        {c.contracts.length > 0 && (
                          <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{c.contracts.map(k => k.number).join(", ")}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1 px-2"
                            disabled={busy}
                            onClick={(e) => { e.stopPropagation(); setNotesTarget(c) }}
                            aria-label={`Modifier les notes de ${c.fullName}`}
                            title="Modifier les notes"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Notes</span>
                          </Button>
                          {next && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1 px-2.5"
                              disabled={busy}
                              onClick={(e) => { e.stopPropagation(); patchStatus(c, next) }}
                              title={`Avancer vers « ${CANDIDATE_STATUS_META[next].label} »`}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                              Avancer
                            </Button>
                          )}
                          {c.status !== "SIGNE" && c.status !== "REFUSE" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1 border-red-300 px-2.5 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                              disabled={busy}
                              onClick={(e) => { e.stopPropagation(); patchStatus(c, "REFUSE") }}
                              title="Refuser le dossier"
                            >
                              <Ban className="h-3.5 w-3.5" aria-hidden />
                              <span className="hidden sm:inline">Refuser</span>
                              <span className="sr-only sm:hidden">Refuser</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Aucun candidat à ce statut.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Cliquez une ligne pour le dossier complet (zone visée, hubs pilotés, contrats liés).
            Avancement : {CANDIDATE_FLOW.map(s => CANDIDATE_STATUS_META[s].label).join(" → ")} — chaque action est
            auditée{brandSlug ? ` · périmètre enseigne : ${brandSlug}` : ""}.
          </p>
        </CardContent>
      </Card>

      {/* ---------- Sheet détail candidat ---------- */}
      <CandidateSheet
        candidate={sheetCandidate}
        zones={zones}
        onClose={() => setSheetId(null)}
        onPatchStatus={patchStatus}
        onEditNotes={c => { setSheetId(null); setNotesTarget(c) }}
        mutating={mutatingId}
      />

      {/* ---------- Dialog création ---------- */}
      <CreateCandidateDialog
        open={createOpen}
        zones={zones}
        onOpenChange={setCreateOpen}
        onCreated={() => { reload() }}
      />

      {/* ---------- Dialog édition des notes ---------- */}
      {notesTarget && (
        <NotesDialog
          candidate={notesTarget}
          onClose={() => setNotesTarget(null)}
          onSaved={() => { reload() }}
        />
      )}
    </div>
  )
}

/* ============================ Sheet de détail (partagée avec « suivi ») ============================ */

export function CandidateSheet({
  candidate, zones, onClose, onPatchStatus, onEditNotes, mutating,
}: {
  candidate: CandidateDTO | null
  zones: RadarZoneDTO[]
  onClose: () => void
  onPatchStatus: (c: CandidateDTO, status: string) => void
  onEditNotes: (c: CandidateDTO) => void
  mutating: string | null
}) {
  const zone = zones.find(z => z.gouvernorat === candidate?.gouvernorat) ?? null
  const next = candidate ? nextStatus(candidate.status) : null
  const meta = candidate ? CANDIDATE_STATUS_META[candidate.status] ?? CANDIDATE_STATUS_META.INTERESSE : null

  return (
    <Sheet open={candidate !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {candidate && meta && (
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                {candidate.fullName}
                <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
              </SheetTitle>
              <SheetDescription>
                Dossier ouvert le {fmtDateFr(candidate.createdAt)} · dernier suivi {fmtDateFr(candidate.updatedAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              {/* Identité */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identité & coordonnées</p>
                <dl className="mt-2 space-y-1 text-xs">
                  {[
                    ["E-mail", candidate.email ?? "—"],
                    ["Téléphone", candidate.phone ?? "—"],
                    ["Apport personnel", money(candidate.capital)],
                    ["Expérience", candidate.experience ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Zone visée — score réel du Radar */}
              <div className="rounded-lg border p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zone visée</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {candidate.zoneNote}<span className="text-xs text-muted-foreground">/100</span>
                  </p>
                </div>
                <div className="mt-2"><ScoreBar value={candidate.zoneNote} color="#059669" className="h-2" /></div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {candidate.gouvernorat}
                  {zone && zone.tmj > 0 && ` · TMJ ${num(zone.tmj)} véh./j`}
                  {zone && ` · parc ${num(zone.vehicles)} véh.`}
                  {zone && zone.stationsTotal === 0 && " · aucune station en service"}
                </p>
              </div>

              {/* Hubs pilotés */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hubs pilotés</p>
                {candidate.hubs.length > 0 ? (
                  <ul className="space-y-1.5">
                    {candidate.hubs.map(h => (
                      <li key={h.code} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${h.status === "ACTIF" ? "bg-emerald-500" : h.status === "CONSTRUCTION" ? "bg-amber-500" : "bg-stone-400"}`} aria-hidden />
                        <span className="font-semibold tabular-nums">{h.code}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{h.status.toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
                    Aucun hub rattaché — le rattachement se fait à l&apos;activation du contrat (onglet « Contrat »).
                  </p>
                )}
              </div>

              {/* Contrats liés */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contrats liés</p>
                {candidate.contracts.length > 0 ? (
                  <ul className="space-y-1.5">
                    {candidate.contracts.map(k => (
                      <li key={k.number} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                        <FileSignature className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                        <span className="font-semibold tabular-nums">{k.number}</span>
                        <span className="ml-auto">
                          <Badge variant="outline" className={(CONTRACT_STATUS_META[k.status]?.badge ?? "") + " text-[10px]"}>
                            {(CONTRACT_STATUS_META[k.status]?.label ?? k.status).toLowerCase()}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">Aucun contrat généré.</p>
                )}
              </div>

              {/* Notes internes */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes internes</p>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => onEditNotes(candidate)}>
                    <Pencil className="h-3 w-3" aria-hidden /> Modifier
                  </Button>
                </div>
                <p className="whitespace-pre-line rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
                  {candidate.notes || "Aucune note pour l'instant."}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {next && (
                  <Button
                    type="button"
                    className="min-h-11 flex-1 gap-1.5"
                    disabled={mutating === candidate.id}
                    onClick={() => onPatchStatus(candidate, next)}
                  >
                    Avancer — {CANDIDATE_STATUS_META[next].label}
                  </Button>
                )}
                {candidate.status !== "SIGNE" && candidate.status !== "REFUSE" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 gap-1.5 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                    disabled={mutating === candidate.id}
                    onClick={() => onPatchStatus(candidate, "REFUSE")}
                  >
                    <Ban className="h-4 w-4" aria-hidden /> Refuser
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* ============================ Dialog création ============================ */

function CreateCandidateDialog({
  open, zones, onOpenChange, onCreated,
}: {
  open: boolean
  zones: RadarZoneDTO[]
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [gouvernorat, setGouvernorat] = useState<string>(zones[0]?.gouvernorat ?? "")
  const [capital, setCapital] = useState("")
  const [experience, setExperience] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Score réel de la zone sélectionnée (le zoneNote est rempli automatiquement).
  const zone = zones.find(z => z.gouvernorat === gouvernorat) ?? null
  const zoneNote = zone?.score ?? 0

  const submit = async () => {
    if (fullName.trim().length < 3) {
      toast.error("Nom complet requis (3 caractères minimum).")
      return
    }
    if (!gouvernorat) {
      toast.error("Choisissez la zone visée par le candidat.")
      return
    }
    setSubmitting(true)
    const res = await franchiseApi("/api/franchise/candidates", "POST", {
      fullName: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      gouvernorat,
      zoneNote,
      capital: capital ? Number(capital) : null,
      experience: experience.trim() || null,
      notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (res.ok) {
      toast.success(`${fullName.trim()} ajouté au pipeline (${gouvernorat}, score ${zoneNote}/100).`)
      onCreated()
      onOpenChange(false)
      setFullName(""); setEmail(""); setPhone(""); setCapital(""); setExperience(""); setNotes("")
    } else {
      toast.error(res.message ?? "Création impossible.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau candidat franchisé</DialogTitle>
          <DialogDescription>
            Saisie interne (formulaire public en V2) — le score de la zone visée est rempli automatiquement depuis le Radar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cand-fullname">Nom complet *</Label>
            <Input id="cand-fullname" className="min-h-11" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="ex. Slim Trabelsi" maxLength={120} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cand-email">E-mail</Label>
              <Input id="cand-email" className="min-h-11" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="candidat@exemple.tn" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cand-phone">Téléphone</Label>
              <Input id="cand-phone" className="min-h-11" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+216 …" maxLength={40} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cand-zone">Zone visée (gouvernorat) *</Label>
            <Select value={gouvernorat} onValueChange={setGouvernorat}>
              <SelectTrigger id="cand-zone" className="min-h-11 w-full" aria-label="Gouvernorat visé">
                <SelectValue placeholder="Choisir un gouvernorat" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones.map(z => (
                  <SelectItem key={z.gouvernorat} value={z.gouvernorat}>
                    {z.gouvernorat} — score {z.score}/100
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zone && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Score rempli automatiquement : <strong className="tabular-nums">{zoneNote}/100</strong>
                {zone.tmj > 0 && ` · TMJ ${num(zone.tmj)} véh./j`} · parc {num(zone.vehicles)} véh.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cand-capital">Apport personnel (DT)</Label>
            <Input id="cand-capital" className="min-h-11 tabular-nums" type="number" inputMode="decimal" min={0} step={5000} value={capital} onChange={e => setCapital(e.target.value)} placeholder="ex. 120000" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cand-experience">Expérience</Label>
            <Textarea id="cand-experience" value={experience} onChange={e => setExperience(e.target.value)} placeholder="ex. gérant de station 8 ans · garagiste · commerçant carburant…" rows={3} maxLength={500} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cand-notes">Notes internes</Label>
            <Textarea id="cand-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="prise de contact, motivations, points de vigilance…" rows={3} maxLength={2000} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button type="button" className="min-h-11 gap-1.5" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? "Création…" : "Créer le candidat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============================ Dialog édition des notes (partagé avec « suivi ») ============================ */

export function NotesDialog({
  candidate, onClose, onSaved,
}: {
  candidate: CandidateDTO
  onClose: () => void
  onSaved: () => void
}) {
  const [notes, setNotes] = useState(candidate.notes)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    const res = await franchiseApi(`/api/franchise/candidates/${candidate.id}`, "PATCH", { notes })
    setSubmitting(false)
    if (res.ok) {
      toast.success(`Notes de ${candidate.fullName} mises à jour.`)
      onSaved()
      onClose()
    } else {
      toast.error(res.message ?? "Mise à jour impossible.")
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !submitting) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notes — {candidate.fullName}</DialogTitle>
          <DialogDescription>
            {candidate.gouvernorat} · statut {CANDIDATE_STATUS_META[candidate.status]?.label ?? candidate.status}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="cand-notes-edit">Notes internes (suivi du dossier)</Label>
          <Textarea id="cand-notes-edit" value={notes} onChange={e => setNotes(e.target.value)} rows={6} maxLength={2000} />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="button" className="min-h-11 gap-1.5" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
