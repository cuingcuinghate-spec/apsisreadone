'use client'

import { useMemo, useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi } from '@/lib/apsis/client'
import { SCHOOL_YEAR } from '@/lib/apsis/constants'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, SectionCard, Chip, EmptyState } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  ImageOff,
  ImagePlus,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Table2,
} from 'lucide-react'
import type { QuestionData, StructureData } from '@/lib/apsis/types'

function structureOf(structures: StructureData[], structureId: string) {
  return structures.find((s) => s.id === structureId)
}

function QuestionImageBlock({ question }: { question: QuestionData }) {
  const setQuestions = useApsisStore((s) => s.setQuestions)
  const questions = useApsisStore((s) => s.questions)
  const profile = useApsisStore((s) => s.profile)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')

  async function generate(prompt?: string) {
    if (!profile) return
    setBusy(true)
    try {
      const { question: updated } = await apsisApi.generateImage(question.id, prompt)
      setQuestions(questions.map((q) => (q.id === updated.id ? updated : q)))
      toast({ title: `Gambar soal #${updated.number} siap` })
    } catch (err) {
      toast({
        title: `Gagal membuat gambar soal #${question.number}`,
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  async function removeImage() {
    setBusy(true)
    try {
      const { question: updated } = await apsisApi.deleteImage(question.id)
      setQuestions(questions.map((q) => (q.id === updated.id ? updated : q)))
      toast({ title: `Gambar soal #${updated.number} dihapus` })
    } catch (err) {
      toast({
        title: 'Gagal menghapus gambar',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      {busy ? (
        <div className="flex h-44 w-full max-w-xs items-center justify-center rounded-lg border border-dashed bg-muted/50">
          <div className="text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-hidden />
            <p className="mt-2 text-xs font-semibold text-muted-foreground">Membuat ilustrasi AI…</p>
          </div>
        </div>
      ) : question.imagePath ? (
        <img
          src={question.imagePath}
          alt={`Ilustrasi soal nomor ${question.number}`}
          className="h-44 w-auto max-w-xs rounded-lg border bg-white object-contain"
        />
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5 no-print">
        {question.imagePath ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => {
              setPromptDraft(question.imagePrompt ?? '')
              setEditOpen(true)
            }}
          >
            <Pencil className="h-3 w-3" aria-hidden /> EDIT PROMPT
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={() => generate(question.imagePrompt ?? undefined)}
          disabled={busy}
        >
          <RefreshCw className="h-3 w-3" aria-hidden /> {question.imagePath ? 'BUAT ULANG' : 'BUAT GAMBAR'}
        </Button>
        {question.imagePath ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
            onClick={removeImage}
            disabled={busy}
          >
            <ImageOff className="h-3 w-3" aria-hidden /> HAPUS
          </Button>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Prompt Gambar — Soal #{question.number}</DialogTitle>
            <DialogDescription>
              Ubah deskripsi ilustrasi lalu buat ulang gambar dengan AI.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            className="min-h-[110px]"
            aria-label="Prompt gambar"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Batal
            </Button>
            <Button
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={async () => {
                setEditOpen(false)
                await generate(promptDraft.trim() || undefined)
              }}
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> Buat Gambar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NaskahTab({
  structures,
  questions,
}: {
  structures: StructureData[]
  questions: QuestionData[]
}) {
  const profile = useApsisStore((s) => s.profile)
  if (!profile) return null
  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-white p-5 shadow-sm md:p-8 print-plain">
      <div className="text-center">
        <h2 className="text-lg font-extrabold uppercase tracking-wide">Naskah Soal Ujian</h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">— {profile.schoolName} —</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border bg-background/60 px-4 py-3 text-xs sm:grid-cols-3">
        <span>
          <b>Penyusun:</b> {profile.teacherName}
        </span>
        <span>
          <b>Mapel:</b> {profile.subject}
        </span>
        <span>
          <b>Kelas/Fase:</b> {profile.grade} / {profile.phase}
        </span>
        <span>
          <b>Jenjang:</b> {profile.level}
        </span>
        <span>
          <b>Tahun:</b> {SCHOOL_YEAR}
        </span>
        <span>
          <b>Topik:</b> {profile.topic}
        </span>
      </div>
      <p className="mt-3 text-xs italic text-muted-foreground">
        Petunjuk: Bacalah setiap soal dengan teliti, kemudian pilih jawaban yang paling tepat pada
        lembar jawaban.
      </p>

      {structures.map((structure) => {
        const list = questions.filter((q) => q.structureId === structure.id)
        if (list.length === 0) return null
        return (
          <div key={structure.id} className="mt-6">
            <h3 className="border-b-2 border-primary/30 pb-1 text-sm font-extrabold uppercase tracking-wide text-primary">
              {structure.label}: {structure.questionType}
            </h3>
            <ol className="mt-4 space-y-6">
              {list.map((q) => {
                return (
                  <li key={q.id} className="text-sm leading-relaxed">
                    <p>
                      <span className="font-extrabold">{q.number}.</span> {q.content}
                    </p>
                    {structure.includeImages ? <QuestionImageBlock question={q} /> : null}
                    {q.options.length > 0 ? (
                      <div className="mt-2 space-y-1 pl-1">
                        {q.options.map((opt, i) => (
                          <p key={i} className="pl-6">
                            {String.fromCharCode(65 + i)}. {opt}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 pl-6 text-muted-foreground">Jawab: ..............................</p>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
      {questions.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">Belum ada soal pada struktur.</p>
      ) : null}
    </div>
  )
}

function KunciTab({ questions }: { questions: QuestionData[] }) {
  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-white p-5 shadow-sm md:p-8 print-plain">
      <h2 className="text-center text-lg font-extrabold uppercase tracking-wide">
        Kunci Jawaban Ujian
      </h2>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b-2 border-primary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-bold">No.</th>
              <th className="py-2 pr-4 font-bold">Kunci</th>
              <th className="py-2 font-bold">Isi Jawaban</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const keyLetter = q.answer.charAt(0).toUpperCase()
              const idx = q.options.findIndex((_, i) => String.fromCharCode(65 + i) === keyLetter)
              return (
                <tr key={q.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-bold">{q.number}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-secondary font-extrabold text-primary">
                      {q.options.length > 0 ? keyLetter : 'U'}
                    </span>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {q.options.length > 0 ? `${keyLetter}. ${idx >= 0 ? q.options[idx] : ''}` : q.answer}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KisiKisiTab({
  structures,
  questions,
}: {
  structures: StructureData[]
  questions: QuestionData[]
}) {
  return (
    <div className="mx-auto max-w-4xl rounded-xl border bg-white p-5 shadow-sm md:p-8 print-plain">
      <h2 className="text-center text-lg font-extrabold uppercase tracking-wide">
        Kisi-Kisi Penulisan Soal
      </h2>
      <div className="mt-5 max-h-[520px] overflow-auto rounded-lg border nice-scroll">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-primary text-primary-foreground">
            <tr className="text-left text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2.5 font-bold">Bagian</th>
              <th className="px-3 py-2.5 font-bold">No</th>
              <th className="px-3 py-2.5 font-bold">Materi</th>
              <th className="px-3 py-2.5 font-bold">Indikator</th>
              <th className="px-3 py-2.5 font-bold">Level</th>
            </tr>
          </thead>
          <tbody>
            {structures.flatMap((st) =>
              questions
                .filter((q) => q.structureId === st.id)
                .map((q) => (
                  <tr key={q.id} className="border-b border-border/60 odd:bg-muted/40">
                    <td className="px-3 py-2 text-xs font-semibold">{st.label}</td>
                    <td className="px-3 py-2 font-bold">{q.number}</td>
                    <td className="px-3 py-2 text-xs">{q.material}</td>
                    <td className="px-3 py-2 text-xs">{q.indicator}</td>
                    <td className="px-3 py-2">
                      <Chip tone="primary">
                        {q.cognitiveLevel} ({q.difficulty})
                      </Chip>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KartuSoalCard({
  question,
  structure,
  profile,
}: {
  question: QuestionData
  structure?: StructureData
  profile: NonNullable<ReturnType<typeof useApsisStore.getState>['profile']>
}) {
  const keyLetter = question.answer.charAt(0).toUpperCase()
  const keyIdx = question.options.findIndex((_, i) => String.fromCharCode(65 + i) === keyLetter)
  return (
    <div className="overflow-hidden rounded-xl border-2 border-primary/50 bg-white shadow-sm print-plain">
      <div className="bg-primary px-4 py-2.5 text-center text-primary-foreground">
        <p className="text-sm font-extrabold uppercase tracking-widest">
          Kartu Soal No. {question.number}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/80">
          Dokumen Resmi Format Kemendikbudristek
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-4 text-xs sm:grid-cols-2">
        <span>
          <b className="text-muted-foreground">Satuan Pendidikan:</b> {profile.schoolName}
        </span>
        <span>
          <b className="text-muted-foreground">Penyusun:</b> {profile.teacherName}
        </span>
        <span>
          <b className="text-muted-foreground">Mata Pelajaran:</b> {profile.subject}
        </span>
        <span>
          <b className="text-muted-foreground">Kelas/Fase:</b> {profile.grade} / {profile.phase}
        </span>
        <span>
          <b className="text-muted-foreground">Tahun Pelajaran:</b> {SCHOOL_YEAR}
        </span>
        <span>
          <b className="text-muted-foreground">Bentuk Soal:</b>{' '}
          {structure?.questionType ?? question.type}
        </span>
      </div>
      <div className="space-y-2 px-4 pb-4 text-xs">
        <p className="rounded-md border bg-muted/50 px-3 py-2">
          <b className="text-muted-foreground">CAPAIAN PEMBELAJARAN (CP) / KD:</b> {profile.topic}
        </p>
        <p className="rounded-md border bg-muted/50 px-3 py-2">
          <b className="text-muted-foreground">MATERI POKOK:</b> {question.material}
        </p>
        <p className="rounded-md border bg-muted/50 px-3 py-2">
          <b className="text-muted-foreground">LEVEL KOGNITIF:</b>{' '}
          <Chip tone="primary">
            {question.cognitiveLevel} ({question.difficulty})
          </Chip>
        </p>
        <p className="rounded-md border bg-muted/50 px-3 py-2">
          <b className="text-muted-foreground">INDIKATOR SOAL:</b> {question.indicator}
        </p>
        <p className="rounded-md border bg-muted/50 px-3 py-2">
          <b className="text-muted-foreground">BUKU SUMBER / ACUAN:</b> {question.source}
        </p>
        <div className="rounded-md border-2 border-primary/40 bg-background px-3 py-2">
          <b className="text-muted-foreground">RUMUSAN BUTIR SOAL:</b>
          <p className="mt-1.5 leading-relaxed">{question.content}</p>
          {question.imagePath ? (
            <img
              src={question.imagePath}
              alt={`Ilustrasi kartu soal nomor ${question.number}`}
              className="mt-2 h-36 w-auto max-w-[240px] rounded border bg-white object-contain"
            />
          ) : null}
          {question.options.length > 0 ? (
            <div className="mt-2 space-y-1">
              {question.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i)
                const isKey = letter === keyLetter
                return (
                  <p
                    key={i}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1',
                      isKey && 'bg-emerald-50 font-bold text-apsis-green dark:bg-emerald-950/40'
                    )}
                  >
                    <span className="font-extrabold">{letter}.</span> {opt}
                    {isKey ? <Chip tone="success">Kunci</Chip> : null}
                  </p>
                )
              })}
            </div>
          ) : null}
        </div>
        <p className="rounded-md border border-apsis-green/50 bg-emerald-50 px-3 py-2 font-bold text-apsis-green dark:bg-emerald-950/40">
          KUNCI JAWABAN:{' '}
          {question.options.length > 0
            ? `${keyLetter}. ${keyIdx >= 0 ? question.options[keyIdx] : ''}`
            : question.answer}
        </p>
        <p className="rounded-md border bg-muted/50 px-3 py-2">
          <b className="text-muted-foreground">PEDOMAN PENSKORAN / BOBOT:</b> Skor {question.scoreWeight} jika
          jawaban benar, skor 0 jika salah.
        </p>
      </div>
    </div>
  )
}

function KartuTab({
  structures,
  questions,
}: {
  structures: StructureData[]
  questions: QuestionData[]
}) {
  const profile = useApsisStore((s) => s.profile)
  const [mode, setMode] = useState<'semua' | 'per'>('semua')
  const [current, setCurrent] = useState(0)
  if (!profile) return null
  if (questions.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-apsis-green/40 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-extrabold uppercase tracking-wide text-apsis-green">
          Dokumen Resmi Kartu Soal (Format Kemendikbudristek)
        </p>
        <div className="flex flex-wrap gap-2 no-print">
          <a href="/api/export/doc?type=kartu" download>
            <Button size="sm" className="gap-1.5 bg-amber-400 text-white hover:bg-amber-500">
              <FileDown className="h-4 w-4" aria-hidden /> DOWNLOAD KARTU SOAL (.DOC)
            </Button>
          </a>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-primary text-primary hover:bg-secondary"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden /> CETAK KARTU
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <span className="form-label">Tampilan:</span>
          <div className="flex gap-1.5" role="group" aria-label="Mode tampilan kartu soal">
            <button
              type="button"
              onClick={() => setMode('semua')}
              aria-pressed={mode === 'semua'}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                mode === 'semua'
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:border-primary/50'
              )}
            >
              Semua Kartu ({questions.length})
            </button>
            <button
              type="button"
              onClick={() => setMode('per')}
              aria-pressed={mode === 'per'}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                mode === 'per'
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:border-primary/50'
              )}
            >
              Per Butir Soal
            </button>
          </div>
        </div>
        {mode === 'per' ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              aria-label="Kartu sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Kartu soal nomor ${q.number}`}
                aria-pressed={current === i}
                className={cn(
                  'h-8 w-8 rounded-full text-xs font-bold transition-colors',
                  current === i
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-card text-muted-foreground hover:border-primary/50'
                )}
              >
                {q.number}
              </button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              disabled={current === questions.length - 1}
              aria-label="Kartu berikutnya"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>

      {mode === 'semua' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {questions.map((q) => (
            <KartuSoalCard
              key={q.id}
              question={q}
              structure={structureOf(structures, q.structureId)}
              profile={profile}
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          {questions[current] ? (
            <KartuSoalCard
              question={questions[current]}
              structure={structureOf(structures, questions[current].structureId)}
              profile={profile}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function NaskahView() {
  const profile = useApsisStore((s) => s.profile)
  const structures = useApsisStore((s) => s.structures)
  const questions = useApsisStore((s) => s.questions)
  const setView = useApsisStore((s) => s.setView)

  const total = useMemo(() => questions.length, [questions])

  if (!profile || total === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageTitle title="Pratinjau Naskah & Kisi-Kisi Ujian" />
        <EmptyState
          icon={<Table2 className="h-10 w-10 text-muted-foreground" aria-hidden />}
          title="Belum ada naskah soal"
          description="Susun struktur paket soal terlebih dahulu, lalu klik BUAT NASKAH SOAL."
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

  return (
    <div className="space-y-5">
      <PageTitle
        title="Pratinjau Naskah & Kisi-Kisi Ujian"
        description={`${profile.schoolName} • ${profile.subject} • ${profile.grade} — total ${total} soal siap digunakan.`}
        actions={
          <>
            <a href="/api/export/doc?type=naskah" download>
              <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" aria-hidden /> DOWNLOAD .DOC
              </Button>
            </a>
            <a href="/api/export/csv?type=kunci" download>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Table2 className="h-4 w-4" aria-hidden /> KUNCI EXCEL (ANALISIS SOAL)
              </Button>
            </a>
          </>
        }
      />
      <Tabs defaultValue="naskah">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-card p-1.5">
          <TabsTrigger value="naskah" className="rounded-lg font-bold">
            NASKAH SOAL
          </TabsTrigger>
          <TabsTrigger value="kunci" className="rounded-lg font-bold">
            KUNCI JAWABAN
          </TabsTrigger>
          <TabsTrigger value="kisi" className="rounded-lg font-bold">
            KISI-KISI
          </TabsTrigger>
          <TabsTrigger value="kartu" className="rounded-lg font-bold">
            KARTU SOAL
          </TabsTrigger>
        </TabsList>
        <TabsContent value="naskah" className="mt-4">
          <NaskahTab structures={structures} questions={questions} />
        </TabsContent>
        <TabsContent value="kunci" className="mt-4">
          <KunciTab questions={questions} />
        </TabsContent>
        <TabsContent value="kisi" className="mt-4">
          <KisiKisiTab structures={structures} questions={questions} />
        </TabsContent>
        <TabsContent value="kartu" className="mt-4">
          <KartuTab structures={structures} questions={questions} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
