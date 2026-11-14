'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/apsis/shared'
import { ArrowRight, CheckCircle2, ChevronLeft, Trophy, XCircle } from 'lucide-react'
import { LETTERS } from '@/lib/apsis/constants'

export interface RunnerQuestion {
  id?: string
  stimulus?: string
  content: string
  options: string[]
  answer: string
}

export function QuizRunner({
  title,
  questions,
  onExit,
  showStimulus = false,
}: {
  title: string
  questions: RunnerQuestion[]
  onExit: () => void
  showStimulus?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const question = questions[index]
  const keyLetter = useMemo(() => (question?.answer || '').trim().charAt(0).toUpperCase(), [question])
  const hasOptions = question && question.options && question.options.length > 0

  if (!question) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Tidak ada soal untuk ditampilkan.
        <div className="mt-3">
          <Button variant="outline" onClick={onExit}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm text-center">
        <Trophy className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
        <h2 className="mt-3 text-2xl font-extrabold">{title} Selesai!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Berikut rekap kunci jawaban seluruh soal untuk dibahas bersama kelas.
        </p>
        <div className="mt-5 space-y-2 text-left">
          {questions.map((q, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2"
            >
              <span className="text-sm">
                <span className="font-bold text-primary">Soal {i + 1}.</span>{' '}
                <span className="line-clamp-1 text-muted-foreground">{q.content}</span>
              </span>
              <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-primary">
                {q.options.length > 0 ? (q.answer || '-').charAt(0).toUpperCase() : 'Uraian'}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setIndex(0)
              setSelected(null)
              setFinished(false)
            }}
          >
            Ulangi {title}
          </Button>
          <Button variant="outline" onClick={onExit}>
            Kembali ke Persiapan
          </Button>
        </div>
      </div>
    )
  }

  const answered = selected !== null
  const isLast = index === questions.length - 1

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Progress header */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onExit} className="gap-1 no-print">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Keluar
          </Button>
          <p className="text-sm font-extrabold uppercase tracking-widest text-primary">
            SOAL {index + 1} DARI {questions.length}
          </p>
          <span className="text-xs font-semibold text-muted-foreground">
            {answered ? 'Terjawab' : 'Pilih jawaban'}
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Soal */}
      <div className="rounded-xl border bg-card p-5 shadow-sm md:p-6">
        {showStimulus && question.stimulus ? (
          <div className="mb-4 rounded-lg border border-border/80 bg-muted/50 p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Stimulus
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {question.stimulus}
            </p>
          </div>
        ) : null}
        <p className="text-base font-semibold leading-relaxed md:text-lg">{question.content}</p>

        {hasOptions ? (
          <div className="mt-5 space-y-3" role="group" aria-label="Opsi jawaban">
            {question.options.map((opt, i) => {
              const letter = LETTERS[i]
              const isKey = letter === keyLetter
              const isSelected = selected === letter
              const revealed = answered
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={revealed}
                  onClick={() => setSelected(letter)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                    !revealed && 'hover:border-primary/60 hover:bg-secondary/60 active:scale-[0.99]',
                    revealed && isKey && 'border-apsis-green bg-emerald-50 dark:bg-emerald-950/40',
                    revealed && isSelected && !isKey && 'border-destructive bg-red-50 dark:bg-red-950/40',
                    revealed && !isKey && !isSelected && 'border-border opacity-70',
                    !revealed && 'border-border bg-background'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      revealed && isKey
                        ? 'bg-apsis-green text-white'
                        : revealed && isSelected && !isKey
                          ? 'bg-destructive text-white'
                          : 'bg-secondary text-primary'
                    )}
                  >
                    {letter}
                  </span>
                  <span className="text-sm md:text-base">{opt}</span>
                  {revealed && isKey ? (
                    <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-apsis-green" aria-hidden />
                  ) : revealed && isSelected && !isKey ? (
                    <XCircle className="ml-auto h-5 w-5 shrink-0 text-destructive" aria-hidden />
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mt-5">
            {answered ? (
              <div className="rounded-lg border border-apsis-green/40 bg-emerald-50 p-4 dark:bg-emerald-950/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-apsis-green">
                  Jawaban / Rubrik
                </p>
                <p className="mt-1 text-sm">{question.answer}</p>
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Diskusikan jawaban dengan kelas, lalu tekan tombol di bawah untuk melihat jawaban model.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          {!answered ? (
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setSelected(hasOptions ? '?' : 'shown')}
              disabled={!hasOptions}
              aria-label="Tampilkan jawaban"
            >
              Tampilkan Jawaban <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (isLast) {
                  setFinished(true)
                } else {
                  setIndex((v) => v + 1)
                  setSelected(null)
                }
              }}
            >
              {isLast ? 'Lihat Hasil' : 'Selanjutnya'} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 no-print">
        {questions.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-6 rounded-full transition-colors',
              i < index ? 'bg-apsis-green' : i === index ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>
    </div>
  )
}

export function QuizChipInfo({ difficulty, cognitive }: { difficulty?: string; cognitive?: string }) {
  if (!difficulty && !cognitive) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cognitive ? <Chip tone="primary">{cognitive}</Chip> : null}
      {difficulty ? <Chip tone="outline">{difficulty}</Chip> : null}
    </div>
  )
}
