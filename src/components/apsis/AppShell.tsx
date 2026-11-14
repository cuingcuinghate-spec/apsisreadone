'use client'

import { useApsisStore, type ApsisView } from '@/lib/store'
import { APP_FOOTER_TEXT } from '@/lib/apsis/constants'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Check,
  ClipboardList,
  FileText,
  GraduationCap,
  Menu,
  MonitorPlay,
  Sparkles,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface NavItem {
  view: ApsisView
  label: string
  desc?: string
  num?: number
  bonus?: boolean
}

const ALUR_ITEMS: NavItem[] = [
  { view: 'profil', label: 'Identitas & Profil', num: 1 },
  { view: 'konfigurasi', label: 'Teknis & Kisi-Kisi', desc: 'Konfigurasi Bagian, Struktur Paket', num: 2 },
  { view: 'naskah', label: 'Naskah & Hasil', num: 3 },
]

const ANALISIS_ITEMS: NavItem[] = [
  { view: 'kktp', label: 'Analisis Nilai (KKTP)' },
  { view: 'ctt', label: 'Analisis Butir Soal (CTT)' },
  { view: 'kuis', label: 'Mode Quiz Kelas' },
  { view: 'tka', label: 'Simulasi TKA', bonus: true },
]

function SidebarNav() {
  const view = useApsisStore((s) => s.view)
  const setView = useApsisStore((s) => s.setView)
  const profile = useApsisStore((s) => s.profile)
  const structures = useApsisStore((s) => s.structures)
  const questions = useApsisStore((s) => s.questions)

  const doneMap: Partial<Record<ApsisView, boolean>> = {
    profil: Boolean(profile),
    konfigurasi: structures.length > 0,
    naskah: questions.length > 0,
  }

  const renderItem = (item: NavItem) => {
    const active = view === item.view
    const done = doneMap[item.view]
    return (
      <button
        key={item.view}
        type="button"
        onClick={() => setView(item.view)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
          active ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary'
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            active
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : done
                ? 'bg-apsis-green text-white'
                : 'bg-secondary text-primary'
          )}
        >
          {done && !active ? <Check className="h-3.5 w-3.5" aria-hidden /> : item.num ?? '•'}
        </span>
        <span className="min-w-0">
          <span className={cn('block truncate text-sm font-semibold', !active && 'text-foreground')}>
            {item.label}
            {item.bonus ? (
              <Sparkles
                className={cn(
                  'ml-1.5 inline h-3.5 w-3.5',
                  active ? 'text-amber-300' : 'text-amber-500'
                )}
                aria-hidden
              />
            ) : null}
          </span>
          {item.desc ? (
            <span
              className={cn(
                'block truncate text-[11px]',
                active ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}
            >
              {item.desc}
            </span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <nav className="flex h-full flex-col" aria-label="Navigasi APSIS">
      <div className="flex-1 overflow-y-auto nice-scroll px-3 py-4">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Alur Pembuatan Soal
        </p>
        <div className="space-y-1">{ALUR_ITEMS.map(renderItem)}</div>
        <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Analisis &amp; Interaktif
        </p>
        <div className="space-y-1">{ANALISIS_ITEMS.map(renderItem)}</div>
      </div>
      <div className="border-t border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
            <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">Akun Guru</p>
            <p className="truncate text-[11px] text-muted-foreground">@guru7</p>
          </div>
        </div>
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useApsisStore((s) => s.sidebarOpen)
  const setSidebarOpen = useApsisStore((s) => s.setSidebarOpen)
  const setView = useApsisStore((s) => s.setView)

  return (
    <div className="min-h-screen bg-app-gradient">
      <div className="mx-auto flex w-full max-w-[1440px]">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border/70 bg-sidebar lg:flex no-print">
          <button
            type="button"
            onClick={() => setView('profil')}
            className="flex items-center gap-2.5 border-b border-border/70 px-4 py-4 text-left"
            aria-label="Ke halaman profil"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" aria-hidden />
            </span>
            <span>
              <span className="block text-base font-extrabold tracking-wide text-primary">APSIS PRO</span>
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pembuat Soal &amp; Analisis
              </span>
            </span>
          </button>
          <SidebarNav />
        </aside>

        {/* Kolom utama */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur no-print">
            <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
              <button
                type="button"
                onClick={() => setView('profil')}
                className="flex items-center gap-2 lg:hidden"
                aria-label="Ke halaman profil"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <GraduationCap className="h-4.5 w-4.5 text-primary-foreground" aria-hidden />
                </span>
                <span className="text-base font-extrabold tracking-wide text-primary">APSIS PRO</span>
              </button>
              <span className="hidden lg:inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <ClipboardList className="h-4 w-4" aria-hidden />
                Aplikasi Pembuat Soal dan Analisis
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  V1.0
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Buka menu navigasi"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>

          <footer className="mt-auto border-t border-border/60 bg-background/60 px-4 py-3 text-center no-print">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {APP_FOOTER_TEXT}
            </p>
          </footer>
        </div>
      </div>

      {/* Sidebar mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="border-b border-border/70 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <GraduationCap className="h-4 w-4 text-primary-foreground" aria-hidden />
              </span>
              APSIS PRO
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-4rem)]">
            <SidebarNav />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export const VIEW_ICONS = {
  FileText,
  BarChart3,
  MonitorPlay,
  Target,
}
