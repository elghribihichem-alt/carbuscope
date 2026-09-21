"use client"

// Centre de notifications in-app enseigne (C.2.6+) — cloche dans le bandeau du
// portail : badge de non-lues, fil défilant des notifications laissées par le
// moteur de veille (email parti) et par la plateforme, marquage lu unitaire et
// global. Boucle de fermeture recommandée par la task 20.

import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Bell, BellRing, CheckCheck, TrendingDown, Radar, Inbox, MailCheck, Loader2, MapPin, Banknote, ArrowRight, Wifi, WifiOff,
} from "lucide-react"
import type { NotificationDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

const MIN_MS = 60_000
const HOUR_MS = 3_600_000

/** Temps relatif français : « à l'instant », « il y a 12 min », « il y a 3 h », « hier », « il y a 4 j ». */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < MIN_MS) return "à l'instant"
  if (ms < HOUR_MS) return `il y a ${Math.floor(ms / MIN_MS)} min`
  const hours = Math.floor(ms / HOUR_MS)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "hier"
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  return months < 12 ? `il y a ${months} mois` : `il y a ${Math.floor(months / 12)} an${months >= 24 ? "s" : ""}`
}

const fr1 = (n: number) => n.toFixed(1).replace(".", ",")

export function NotificationsCenter({ brandSlug, onNavigate }: { brandSlug: string; onNavigate?: (kind: string) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationDTO[]>([])
  const [unread, setUnread] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [live, setLive] = useState(false)
  const prevUnread = useRef(0)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`/api/notifications?brand=${encodeURIComponent(brandSlug)}`, { cache: "no-store" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { notifications: NotificationDTO[]; unread: number; total: number }
      setItems(j.notifications)
      setUnread(j.unread)
      setTotal(j.total)
    } catch {
      // Silencieux : la cloche ne doit jamais casser le portail.
    } finally {
      setLoading(false)
    }
  }, [brandSlug])

  useEffect(() => {
    void refresh()
    // Léger polling (45 s) : filet de sécurité si le relais WebSocket est injoignable.
    const id = setInterval(() => void refresh(true), 45_000)
    return () => clearInterval(id)
  }, [refresh])

  // Relais WebSocket (mini-service :3036) : les notifications arrivent EN DIRECT
  // quand le moteur de veille déclenche ou qu'un décret est publié — le polling
  // 45 s reste en repli. Connexion via la passerelle (XTransformPort), path "/".
  useEffect(() => {
    let disposed = false
    const socket: Socket = io("/?XTransformPort=3036", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 8000,
    })
    socket.on("connect", () => {
      setLive(true)
      socket.emit("subscribe", brandSlug)
    })
    socket.on("disconnect", () => { if (!disposed) setLive(false) })
    socket.on("notification", (payload: { brandSlug?: string; kind?: string; title?: string }) => {
      if (payload?.brandSlug && payload.brandSlug !== brandSlug) return
      void refresh(true)
    })
    return () => {
      disposed = true
      socket.disconnect()
    }
  }, [brandSlug, refresh])

  // Toast discret quand de nouvelles notifications arrivent pendant la session.
  useEffect(() => {
    if (prevUnread.current > 0 && unread > prevUnread.current) {
      toast.info("Nouvelle notification de veille", {
        description: `${unread - prevUnread.current} élément(s) ajouté(s) au centre de notifications.`,
      })
    }
    prevUnread.current = unread
  }, [unread])

  const markRead = useCallback(async (id: string) => {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
    setUnread(prev => Math.max(0, prev - 1))
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    } catch {
      void refresh(true)
    }
  }, [refresh])

  // Deep-link (T23) : cliquer une notification de veille (chute de note, seuil)
  // emmène directement l'enseigne sur l'onglet « Avis & réputation » du portail
  // pour consulter les avis à l'origine de l'alerte — fermeture de boucle.
  const openNotification = useCallback((n: NotificationDTO) => {
    if (!n.read) void markRead(n.id)
    if (onNavigate) {
      const tab = n.kind === "WATCHLIST" ? "reviews" : n.kind === "DECREE" ? "dashboard" : null
      if (tab) {
        setOpen(false)
        onNavigate(tab)
        if (n.kind === "WATCHLIST") {
          toast.info("Avis & réputation ouverts", {
            description: "Consultez les avis à l'origine de cette alerte de veille.",
          })
        }
      }
    }
  }, [onNavigate, markRead])

  const markAllRead = useCallback(async () => {
    if (unread === 0) return
    setMarkingAll(true)
    try {
      const r = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "READ_ALL", brand: brandSlug }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      setUnread(0)
      toast.success("Notifications marquées comme lues", {
        description: "Le compteur du portail est remis à zéro.",
      })
    } catch {
      toast.error("Impossible de marquer les notifications comme lues.")
      void refresh(true)
    } finally {
      setMarkingAll(false)
    }
  }, [brandSlug, unread, refresh])

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) void refresh(true) }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={unread > 0 ? `Notifications — ${unread} non lues` : "Notifications"}
          className="relative h-10 gap-2 rounded-lg border-border/80 bg-background/60 px-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500/50"
        >
          <span className="relative flex items-center">
            {unread > 0 ? (
              <BellRing className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <Bell className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
            )}
            {unread > 0 && (
              <>
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-background" aria-hidden>
                  {unread > 9 ? "9+" : unread}
                </span>
                <span className="absolute -right-1.5 -top-1.5 h-4 min-w-4 animate-ping rounded-full bg-amber-400/60 [animation-duration:2.5s]" aria-hidden />
              </>
            )}
          </span>
          <span className="hidden text-xs font-medium md:inline">Notifications</span>
          <span className="sr-only">, {unread > 0 ? `${unread} non lues` : "aucune non lue"}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-96" sideOffset={8}>
        {/* En-tête du centre */}
        <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-br from-muted/60 to-transparent px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <BellRing className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold leading-none">Notifications</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unread > 0 ? (
                  <span className="font-medium text-amber-600 dark:text-amber-400">{unread} non {unread > 1 ? "lues" : "lue"}{total > 0 ? ` sur ${total}` : ""}</span>
                ) : total > 0 ? `À jour — ${total} au total` : "Aucune notification"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void markAllRead()}
            disabled={markingAll || unread === 0}
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
          >
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden />}
            Tout lire
          </Button>
        </div>

        {/* Fil des notifications */}
        {loading ? (
          <div className="flex h-40 items-center justify-center" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <p className="text-xs">Chargement des notifications…</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Aucune notification pour l&apos;instant</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Le moteur de veille publiera ici chaque email parti : chutes de notes,
                passages de seuil et rapports de passe.
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[22rem]">
            <ul className="divide-y divide-border/70">
              {items.map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    aria-label={`${n.read ? "Notification lue" : "Notification non lue"} — ${n.title}${n.kind === "WATCHLIST" ? " — ouvrir Avis & réputation" : ""}`}
                    className={cn(
                      "group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                      "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50",
                      !n.read && "bg-emerald-50/40 dark:bg-emerald-950/20",
                    )}
                  >
                    {/* Icône par genre */}
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105",
                        n.kind === "DECREE"
                          ? "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
                          : n.kind === "SYSTEM"
                            ? "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
                            : "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
                      )}
                      aria-hidden
                    >
                      {n.kind === "DECREE" ? <Banknote className="h-4 w-4" /> : n.kind === "SYSTEM" ? <Radar className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm leading-snug", n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>
                          {n.title}
                        </p>
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" aria-hidden />}
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {n.stationLabel && (
                          <Badge variant="outline" className="h-5 gap-1 border-border/70 bg-muted/40 px-1.5 text-[10px] font-medium text-muted-foreground">
                            <MapPin className="h-3 w-3" aria-hidden /> {n.stationLabel}
                          </Badge>
                        )}
                        {n.deltaPoints !== null && n.deltaPoints !== undefined && (
                          <Badge variant="outline" className="h-5 border-rose-300 bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                            −{fr1(n.deltaPoints)} pt
                          </Badge>
                        )}
                        {n.alertRunId && (
                          <Badge variant="outline" className="h-5 gap-1 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
                            <MailCheck className="h-3 w-3" aria-hidden /> Email envoyé
                          </Badge>
                        )}
                        {n.kind === "DECREE" && (
                          <Badge variant="outline" className="h-5 gap-1 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
                            <Banknote className="h-3 w-3" aria-hidden /> Décret prix
                          </Badge>
                        )}
                        {n.kind === "WATCHLIST" && onNavigate && (
                          <Badge
                            variant="outline"
                            className="h-5 gap-0.5 border-emerald-300 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700 transition-colors group-hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                          >
                            Avis <ArrowRight className="h-2.5 w-2.5" aria-hidden />
                          </Badge>
                        )}
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/80">{timeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <Separator />
        {/* Pied du centre */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {live ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" title="Relais WebSocket connecté — notifications instantanées">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 [animation-duration:1.8s]" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <Wifi className="h-3 w-3" aria-hidden />Temps réel
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground/70" title="Relais injoignable — rafraîchissement toutes les 45 s">
                <WifiOff className="h-3 w-3" aria-hidden />45 s
              </span>
            )}
            <span className="ml-1 inline-flex items-center gap-1">
              <Radar className="h-3 w-3" aria-hidden />
              Moteur de veille CarbuScope
            </span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            aria-label="Rafraîchir les notifications"
          >
            <Loader2 className={cn("h-3 w-3", loading && "animate-spin")} aria-hidden />
            Rafraîchir
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
