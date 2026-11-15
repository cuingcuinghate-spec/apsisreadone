'use client'

import { useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi } from '@/lib/apsis/client'
import { DEMO_TKA_LEVELS, DEMO_TKA_SUBTESTS, TKA_MODES } from '@/lib/apsis/constants'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, SectionCard, FieldLabel, Chip, EmptyState, GenerationOverlay } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QuizRunner } from '@/components/apsis/QuizRunner'
import { cn } from '@/lib/utils'
import { FileDown, Loader2, MonitorPlay, RefreshCw, Sparkles, Target } from 'lucide-react'

export default function TkaView() {
  const simulation = useApsisStore((s) => s.tkaSimulation)
  const setTkaSimulation = useApsisStore((s) => s.setTkaSimulation)
  const { toast } = useToast()

  const [level, setLevel] = useState<string>(DEMO_TKA_LEVELS[0])
  const [subtest, setSubtest] = useState<string>(DEMO_TKA_SUBTESTS[0])
  const [mode, setMode] = useState<string>('drill')
  const [loading, setLoading] = useState(false)
  const [runMode, setRunMode] = useState<'prep' | 'quiz'>('prep')

  const selectedMode = TKA_MODES.find((m) => m.id === mode) ?? TKA_MODES[2]

  async function generate() {
    setLoading(true)
    try {
      const { simulation: sim } = await apsisApi.generateTka(level, subtest, mode)
      setTkaSimulation(sim)
      toast({
        title: 'Simulasi TKA siap!',
        description: `${sim.totalQuestions} butir soal ${sim.subtest} berhasil dibuat.`,
      })
    } catch (err) {
      toast({
        title: 'Gagal membuat simulasi',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (runMode === 'quiz' && simulation) {
    return (
      <div className="space-y-5">
        <QuizRunner
          title="Simulasi TKA"
          showStimulus
          questions={simulation.questions.map((q) => ({
            stimulus: q.stimulus,
            content: q.content,
            options: q.options,
            answer: q.answer,
          }))}
          onExit={() => setRunMode('prep')}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageTitle
        title="Simulator TKA 2026"
        description="Paket simulasi Tes Kemampuan Akademik standar Kemendikdasmen 2026 — soal HOTS berbasis stimulus mendalam, durasi 75 menit per subtes."
      />

      <SectionCard title="Konfigurasi Simulasi">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel required>Jenjang Pendidikan</FieldLabel>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger aria-label="Jenjang Pendidikan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_TKA_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Subtes (Mata Pelajaran)</FieldLabel>
              <Select value={subtest} onValueChange={setSubtest}>
                <SelectTrigger aria-label="Subtes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_TKA_SUBTESTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel required>Mode Jumlah Soal & Standar Kemendikdasmen</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Mode jumlah soal">
              {TKA_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                  className={cn(
                    'rounded-xl border-2 px-4 py-3 text-left transition-colors',
                    mode === m.id
                      ? 'border-primary bg-secondary'
                      : 'border-border bg-background hover:border-primary/50'
                  )}
                >
                  <span className="block text-sm font-extrabold">
                    {m.label} ({m.count} Soal)
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            size="lg"
            className="w-full gap-2 bg-primary text-base font-extrabold text-primary-foreground shadow-md hover:bg-primary/90"
            onClick={generate}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-5 w-5" aria-hidden />
            )}
            BUAT SIMULASI BARU
          </Button>
        </div>
      </SectionCard>

      {loading ? (
        <GenerationOverlay
          label={`SEDANG MEMBUAT SIMULASI TKA (${selectedMode.count} BUTIR SOAL)...`}
          batch={1}
          totalBatches={Math.max(1, Math.ceil(selectedMode.count / 5))}
        />
      ) : null}

      {simulation ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-apsis-green/40 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide text-apsis-green">
                Naskah Simulasi TKA Siap — {simulation.totalQuestions} Butir Soal
              </p>
              <p className="text-xs text-muted-foreground">
                {simulation.subtest} • {simulation.level} • Standar Kemendikdasmen 2026
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/export/doc?type=tka&id=${simulation.id}`} download>
                <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  <FileDown className="h-4 w-4" aria-hidden /> UNDUH WORD (.DOC)
                </Button>
              </a>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-apsis-green text-apsis-green hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                onClick={() => setRunMode('quiz')}
              >
                <MonitorPlay className="h-4 w-4" aria-hidden /> MULAI SIMULASI
              </Button>
            </div>
          </div>

          <SectionCard title="Naskah Simulasi" headerExtra={<Chip tone="primary">HOTS • Berstimulus</Chip>}>
            <div className="space-y-5">
              {simulation.questions.map((q, i) => (
                <div key={i} className="rounded-xl border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                      Soal {i + 1}
                    </p>
                    <div className="flex gap-1.5">
                      <Chip tone="primary">{q.cognitiveLevel}</Chip>
                      <Chip tone="outline">{q.difficulty}</Chip>
                    </div>
                  </div>
                  {q.stimulus ? (
                    <div className="mt-2 max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3 nice-scroll">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Stimulus
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                        {q.stimulus}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-3 text-sm font-semibold leading-relaxed">{q.content}</p>
                  <div className="mt-2 space-y-1">
                    {q.options.map((opt, oi) => (
                      <p key={oi} className="pl-5 text-sm">
                        {String.fromCharCode(65 + oi)}. {opt}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : (
        <EmptyState
          icon={<Target className="h-10 w-10 text-muted-foreground" aria-hidden />}
          title="Belum ada simulasi TKA"
          description="Atur jenjang, subtes, dan mode jumlah soal lalu klik BUAT SIMULASI BARU."
          action={
            <Chip tone="warning">
              <Sparkles className="h-3 w-3" aria-hidden /> FITUR BONUS APSIS
            </Chip>
          }
        />
      )}
    </div>
  )
}
