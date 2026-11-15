'use client'

import { useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi } from '@/lib/apsis/client'
import { runImageJobFlow } from '@/lib/apsis/image-job'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, Chip, EmptyState } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { QuizRunner } from '@/components/apsis/QuizRunner'
import { cn } from '@/lib/utils'
import { ImageOff, Loader2, MonitorPlay, Play, RefreshCw, Settings2 } from 'lucide-react'
import type { QuestionData } from '@/lib/apsis/types'

export default function KuisView() {
  const questions = useApsisStore((s) => s.questions)
  const structures = useApsisStore((s) => s.structures)
  const setQuestions = useApsisStore((s) => s.setQuestions)
  const setView = useApsisStore((s) => s.setView)
  const { toast } = useToast()
  const [mode, setMode] = useState<'prep' | 'quiz'>('prep')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [imagePhase, setImagePhase] = useState<'composing' | 'rendering'>('composing')

  function updateQuestion(updated: QuestionData) {
    setQuestions(questions.map((q) => (q.id === updated.id ? updated : q)))
  }

  async function regenerateImage(q: QuestionData) {
    if (busyId) return
    setBusyId(q.id)
    setImagePhase('composing')
    try {
      const updated = await runImageJobFlow(q.id, {
        prompt: q.imagePrompt ?? undefined,
        onPhase: setImagePhase,
      })
      updateQuestion(updated)
      toast({ title: `Gambar soal #${updated.number} diperbarui` })
    } catch (err) {
      toast({
        title: 'Gagal membuat gambar',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function removeImage(q: QuestionData) {
    setBusyId(q.id)
    try {
      const { question } = await apsisApi.deleteImage(q.id)
      updateQuestion(question)
      toast({ title: `Gambar soal #${question.number} dihapus` })
    } catch (err) {
      toast({
        title: 'Gagal menghapus gambar',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function regenerateQuestion(q: QuestionData) {
    setBusyId(q.id)
    try {
      const { question } = await apsisApi.regenerateQuestion(q.id)
      updateQuestion(question)
      toast({ title: `Soal #${question.number} dibuat ulang oleh AI` })
    } catch (err) {
      toast({
        title: 'Gagal membuat ulang soal',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageTitle title="Persiapan Mode Kuis Interaktif" />
        <EmptyState
          icon={<MonitorPlay className="h-10 w-10 text-muted-foreground" aria-hidden />}
          title="Belum ada naskah soal untuk kuis"
          description="Buat naskah soal terlebih dahulu di menu Naskah & Hasil."
          action={
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setView('konfigurasi')}
            >
              Ke Konfigurasi Teknis
            </Button>
          }
        />
      </div>
    )
  }

  if (mode === 'quiz') {
    return (
      <div className="space-y-5">
        <QuizRunner
          title="Kuis"
          questions={questions.map((q) => ({
            id: q.id,
            content: q.content,
            options: q.options,
            answer: q.answer,
          }))}
          onExit={() => setMode('prep')}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageTitle
        title="Persiapan Mode Kuis Interaktif"
        description="Tampilkan soal pada layar proyektor untuk asesmen formatif bersama seluruh kelas. Periksa soal, gambar, dan kunci sebelum mulai."
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/70 bg-primary px-4 py-3 text-primary-foreground md:px-5">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <MonitorPlay className="h-4 w-4" aria-hidden /> MODE QUIZ INTERAKTIF
          </p>
          <Chip tone="amber" className="bg-amber-400/90 text-white">
            Untuk Proyektor Kelas
          </Chip>
        </div>
        <div className="p-4 md:p-5">
          <p className="card-title-upper mb-3">
            Daftar Soal Siap Kuis — Total Soal: {questions.length}
          </p>
          <div className="space-y-3">
            {questions.map((q) => {
              const structure = structures.find((s) => s.id === q.structureId)
              const withImage = Boolean(structure?.includeImages)
              const busy = busyId === q.id
              return (
                <div
                  key={q.id}
                  className={cn(
                    'rounded-xl border bg-background p-4',
                    busy && 'opacity-70'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-relaxed">
                      <span className="mr-1.5 font-extrabold text-primary">{q.number}.</span>
                      {q.content}
                    </p>
                    <div className="flex shrink-0 gap-1.5">
                      <Chip tone="primary">{q.cognitiveLevel}</Chip>
                      <Chip tone="outline">{q.difficulty}</Chip>
                    </div>
                  </div>
                  {withImage && q.imagePath ? (
                    <img
                      src={q.imagePath}
                      alt={`Ilustrasi soal nomor ${q.number}`}
                      className="mt-3 h-32 w-auto max-w-[220px] rounded-lg border bg-white object-contain"
                    />
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {busy ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{' '}
                        {busyId === q.id
                          ? imagePhase === 'composing'
                            ? 'Menyusun deskripsi ilustrasi…'
                            : 'Menggambar ilustrasi AI…'
                          : 'Memproses…'}
                      </span>
                    ) : null}
                    {withImage ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          onClick={() => void regenerateImage(q)}
                          disabled={busy}
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden /> Buat Ulang Gambar
                        </Button>
                        {q.imagePath ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
                            onClick={() => void removeImage(q)}
                            disabled={busy}
                          >
                            <ImageOff className="h-3 w-3" aria-hidden /> Hapus Gambar
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[11px]"
                      onClick={() => void regenerateQuestion(q)}
                    >
                      <Settings2 className="h-3 w-3" aria-hidden /> Buat Soal Ulang
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <Button
            size="lg"
            className="mt-5 w-full gap-2 bg-apsis-green text-base font-extrabold text-white shadow-md hover:bg-apsis-green/90"
            onClick={() => setMode('quiz')}
          >
            <Play className="h-5 w-5" aria-hidden /> MULAI KUIS INTERAKTIF
          </Button>
        </div>
      </section>
    </div>
  )
}
