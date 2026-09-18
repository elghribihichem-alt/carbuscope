'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Construction } from "lucide-react"

export function ModulePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-500">
            <Construction className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">{title}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{note}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
