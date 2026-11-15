'use client'

import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import { Loader2 } from 'lucide-react'

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div> : null}
    </div>
  )
}

export function SectionCard({
  title,
  note,
  children,
  className,
  headerExtra,
}: {
  title: string
  note?: string
  children: React.ReactNode
  className?: string
  headerExtra?: React.ReactNode
}) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3 md:px-5">
        <div>
          <h2 className="card-title-upper">{title}</h2>
          {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
        </div>
        {headerExtra}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  )
}

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="form-label">
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </span>
  )
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'default' | 'primary' | 'danger' | 'warning' | 'success'
}) {
  const toneClasses: Record<string, string> = {
    default: 'text-foreground',
    primary: 'text-primary',
    danger: 'text-destructive',
    warning: 'text-amber-600',
    success: 'text-apsis-green',
  }
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="form-label">{label}</div>
      <div className={cn('mt-1 text-2xl font-extrabold tabular-nums', toneClasses[tone])}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

export function Chip({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'amber' | 'navy' | 'outline'
  className?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-muted text-foreground',
    primary: 'bg-primary text-primary-foreground',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    amber: 'bg-amber-400 text-white',
    navy: 'bg-navy text-white',
    outline: 'border border-border bg-transparent text-muted-foreground',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function GenerationOverlay({
  label,
  batch,
  totalBatches,
}: {
  label: string
  batch: number
  totalBatches: number
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
        <p className="mt-4 text-sm font-bold uppercase tracking-wide text-primary">
          {label} BATCH {Math.min(batch, totalBatches)} DARI {totalBatches}
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            PERINGATAN PENTING: Jangan tutup halaman ini atau menekan tombol kembali hingga proses
            selesai.
          </p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          AI sedang menyusun soal terbaik untuk ujian Anda. Proses ini bisa memakan waktu 1–3 menit.
        </p>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      {icon}
      <div>
        <p className="font-bold">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
