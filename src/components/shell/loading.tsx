'use client'

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export { Skeleton }

export function TabSkeleton({ title = "Chargement…" }: { title?: string }) {
  return (
    <div className="space-y-4 p-4 md:p-6" aria-busy="true" aria-label={title}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Card>
        <CardHeader><Skeleton className="h-4 w-48" /></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </CardContent>
      </Card>
    </div>
  )
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Card className="m-6 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold text-red-700 dark:text-red-400">Erreur de chargement</p>
          <p className="text-sm text-red-600/90 dark:text-red-400/80">{message}</p>
        </div>
        {retry && <button onClick={retry} className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900">Réessayer</button>}
      </CardContent>
    </Card>
  )
}
