'use client'

import { useEffect, useRef, useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi } from '@/lib/apsis/client'
import { COGNITIVE_DIMENSIONS, CUSTOM_INSTRUCTION_EXAMPLES, OPTION_SEGMENTS, QUESTION_TYPES } from '@/lib/apsis/constants'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, SectionCard, FieldLabel, Chip, GenerationOverlay, EmptyState } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Loader2,
  Minus,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

const DIFFICULTIES = [
  { key: 'easy', label: 'Mudah' },
  { key: 'medium', label: 'Sedang' },
  { key: 'hard', label: 'Sulit' },
] as const

function Counter({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
      <span className="text-sm font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Kurangi soal ${label}`}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <span className="w-8 text-center text-base font-extrabold tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(Math.min(30, value + 1))}
          aria-label={`Tambah soal ${label}`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </span>
    </div>
  )
}

export default function KonfigurasiView() {
  const profile = useApsisStore((s) => s.profile)
  const structures = useApsisStore((s) => s.structures)
  const setStructures = useApsisStore((s) => s.setStructures)
  const setQuestions = useApsisStore((s) => s.setQuestions)
  const setView = useApsisStore((s) => s.setView)
  const generating = useApsisStore((s) => s.generating)
  const setGenerating = useApsisStore((s) => s.setGenerating)
  const { toast } = useToast()

  const [questionType, setQuestionType] = useState<string>('Pilihan Ganda')
  const [optionCount, setOptionCount] = useState(3)
  const [includeImages, setIncludeImages] = useState(false)
  const [counts, setCounts] = useState({ easy: 0, medium: 0, hard: 0 })
  const [cognitive, setCognitive] = useState<string[]>([])
  const [customInstruction, setCustomInstruction] = useState<string | null>(null)
  const [instructionDraft, setInstructionDraft] = useState('')
  const [instructionOpen, setInstructionOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const batchTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const isPG = questionType === 'Pilihan Ganda' || questionType === 'Pilihan Ganda Kompleks'
  const isBS = questionType === 'Benar/Salah'
  const total = counts.easy + counts.medium + counts.hard

  useEffect(() => {
    return () => {
      if (batchTimer.current) clearInterval(batchTimer.current)
    }
  }, [])

  function toggleCognitive(code: string) {
    setCognitive((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  async function addToStructure() {
    if (!profile) {
      toast({
        title: 'Profil belum diisi',
        description: 'Isi Identitas & Profil terlebih dahulu.',
        variant: 'destructive',
      })
      setView('profil')
      return
    }
    if (total < 1) {
      toast({
        title: 'Jumlah soal masih 0',
        description: 'Atur tingkat kesulitan dengan spinner untuk menentukan jumlah soal.',
        variant: 'destructive',
      })
      return
    }
    if (cognitive.length === 0) {
      toast({
        title: 'Pilih dimensi kognitif',
        description: 'Pilih minimal satu level kognitif (C1–C6).',
        variant: 'destructive',
      })
      return
    }
    setAdding(true)
    try {
      const { structure } = await apsisApi.addStructure(profile.id, {
        questionType,
        optionCount: isPG ? optionCount : isBS ? 2 : 0,
        includeImages,
        easyCount: counts.easy,
        mediumCount: counts.medium,
        hardCount: counts.hard,
        total,
        cognitiveLevels: cognitive,
        customInstruction,
      })
      setStructures([...structures, structure])
      setCustomInstruction(null)
      setCounts({ easy: 0, medium: 0, hard: 0 })
      toast({
        title: `${structure.label} ditambahkan`,
        description: `${structure.questionType} — total ${structure.total} soal.`,
      })
    } catch (err) {
      toast({
        title: 'Gagal menambah bagian',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  async function removeStructure(id: string) {
    setDeletingId(id)
    try {
      await apsisApi.deleteStructure(id)
      setStructures(structures.filter((s) => s.id !== id))
      toast({ title: 'Bagian dihapus dari struktur' })
    } catch (err) {
      toast({
        title: 'Gagal menghapus bagian',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  async function generateExam() {
    if (!profile) {
      toast({
        title: 'Profil belum diisi',
        description: 'Isi Identitas & Profil terlebih dahulu.',
        variant: 'destructive',
      })
      setView('profil')
      return
    }
    if (structures.length === 0) {
      toast({
        title: 'Struktur masih kosong',
        description: 'Tambahkan minimal satu bagian soal terlebih dahulu.',
        variant: 'destructive',
      })
      return
    }
    const totalQuestions = structures.reduce((acc, s) => acc + s.total, 0)
    const totalBatches = Math.max(1, Math.ceil(totalQuestions / 6))
    setSubmitting(true)
    setGenerating({ active: true, label: `MEMPROSES ${structures[0].label} (${structures[0].questionType.toUpperCase()})...`, batch: 1, totalBatches })
    let batchTick = 1
    batchTimer.current = setInterval(() => {
      batchTick += 1
      setGenerating({ active: true, label: `MEMPROSES SOAL UJIAN...`, batch: Math.min(batchTick, totalBatches), totalBatches })
    }, 20000)

    try {
      const { questions } = await apsisApi.generateExam(profile.id)
      setQuestions(questions)
      toast({
        title: 'Naskah soal siap!',
        description: `${questions.length} soal berhasil dibuat oleh AI. Cek tab Naskah, Kunci, Kisi-Kisi & Kartu Soal.`,
      })
      setView('naskah')
    } catch (err) {
      toast({
        title: 'Gagal membuat naskah',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      if (batchTimer.current) clearInterval(batchTimer.current)
      batchTimer.current = null
      setGenerating({ active: false, label: '', batch: 0, totalBatches: 0 })
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageTitle
        title="Konfigurasi Teknis & Spesifikasi Soal"
        description="Rancang bagian-bagian soal: bentuk, jumlah opsi, distribusi kesulitan, dan dimensi kognitif sesuai kebutuhan ujian."
      />

      <SectionCard title="+ Input Bagian Soal">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel required>Bentuk Soal</FieldLabel>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger aria-label="Bentuk Soal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isPG ? (
              <div className="space-y-1.5">
                <FieldLabel required>Jumlah Opsi</FieldLabel>
                <div className="flex gap-2" role="group" aria-label="Jumlah opsi">
                  {OPTION_SEGMENTS.map((seg) => (
                    <button
                      key={seg.label}
                      type="button"
                      onClick={() => setOptionCount(seg.count)}
                      aria-pressed={optionCount === seg.count}
                      className={cn(
                        'h-10 flex-1 rounded-lg border-2 text-sm font-bold transition-colors',
                        optionCount === seg.count
                          ? 'border-primary bg-secondary text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {seg.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3">
            <Checkbox
              checked={includeImages}
              onCheckedChange={(v) => setIncludeImages(v === true)}
              className="mt-0.5"
              aria-label="Tambah gambar di naskah soal"
            />
            <span>
              <span className="block text-sm font-bold">TAMBAH GAMBAR DI NASKAH SOAL</span>
              <span className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                Ilustrasi AI dibuat per soal. Proses ini membutuhkan waktu tambahan beberapa detik
                per gambar.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <FieldLabel required>Tingkat Kesulitan</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-3">
              {DIFFICULTIES.map((d) => (
                <Counter
                  key={d.key}
                  label={d.label}
                  value={counts[d.key]}
                  onChange={(v) => setCounts({ ...counts, [d.key]: v })}
                />
              ))}
            </div>
            <p className="text-right text-xs font-semibold text-muted-foreground">
              Total Soal Bagian Ini:{' '}
              <span className="text-base font-extrabold text-primary">{total}</span>
            </p>
          </div>

          <div className="space-y-2">
            <FieldLabel required>Dimensi Kognitif</FieldLabel>
            <div className="space-y-3">
              {COGNITIVE_DIMENSIONS.map((group) => (
                <div key={group.group}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {group.group}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {group.items.map((item) => {
                      const active = cognitive.includes(item.code)
                      return (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => toggleCognitive(item.code)}
                          aria-pressed={active}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left transition-colors',
                            active
                              ? 'border-primary bg-secondary text-primary'
                              : 'border-border bg-background hover:border-primary/50'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold',
                              active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                            )}
                          >
                            {item.code}
                          </span>
                          <span className="text-xs font-semibold">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setInstructionDraft(customInstruction ?? '')
                setInstructionOpen(true)
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Custom Instruction (Opsional)
              {customInstruction ? <Chip tone="primary">Aktif</Chip> : null}
            </button>
            <Button
              type="button"
              onClick={addToStructure}
              disabled={adding}
              className="gap-2 bg-navy px-6 text-white hover:bg-navy/90 dark:bg-navy dark:hover:bg-navy/90"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              TAMBAH KE STRUKTUR
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Struktur Paket Soal"
        note={structures.length === 0 ? 'Belum ada bagian. Tambahkan bagian soal pertama Anda.' : undefined}
        headerExtra={
          structures.length > 0 ? (
            <Chip tone="primary">
              {structures.length} bagian • {structures.reduce((a, s) => a + s.total, 0)} soal
            </Chip>
          ) : undefined
        }
      >
        {structures.length === 0 ? (
          <EmptyState
            icon={<Settings2 className="h-8 w-8 text-muted-foreground" aria-hidden />}
            title="Struktur paket soal masih kosong"
            description="Gunakan formulir di atas untuk menambahkan BAGIAN 1."
          />
        ) : (
          <div className="space-y-3">
            {structures.map((s) => (
              <div key={s.id} className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="success">{s.label}</Chip>
                    <span className="text-sm font-bold">
                      {s.questionType.toUpperCase()}
                      {s.questionType === 'Pilihan Ganda'
                        ? ` — ${{ 3: 'ABC', 4: 'ABCD', 5: 'ABCDE' }[s.optionCount] ?? ''} (${s.optionCount} opsi)`
                        : ''}
                    </span>
                    {s.includeImages ? <Chip tone="warning">Dengan Gambar</Chip> : null}
                    {s.customInstruction ? <Chip tone="outline">Instruksi Kustom</Chip> : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950/40"
                    onClick={() => removeStructure(s.id)}
                    disabled={deletingId === s.id}
                    aria-label={`Hapus ${s.label}`}
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <caption className="sr-only">Distribusi soal {s.label}</caption>
                    <thead>
                      <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-1 pr-4 font-semibold">Total</th>
                        <th className="pb-1 pr-4 font-semibold">Mudah</th>
                        <th className="pb-1 pr-4 font-semibold">Sedang</th>
                        <th className="pb-1 pr-4 font-semibold">Sulit</th>
                        <th className="pb-1 font-semibold">Kognitif</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-bold tabular-nums">
                        <td className="py-1 pr-4 text-primary">{s.total}</td>
                        <td className="py-1 pr-4">{s.easyCount}</td>
                        <td className="py-1 pr-4">{s.mediumCount}</td>
                        <td className="py-1 pr-4">{s.hardCount}</td>
                        <td className="py-1">
                          <span className="flex flex-wrap gap-1">
                            {s.cognitiveLevels.map((c) => (
                              <Chip key={c} tone="primary">
                                {c}
                              </Chip>
                            ))}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Button
        onClick={generateExam}
        disabled={submitting || structures.length === 0}
        size="lg"
        className="w-full gap-2 bg-primary text-base text-primary-foreground shadow-md hover:bg-primary/90"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Pencil className="h-5 w-5" aria-hidden />
        )}
        BUAT NASKAH SOAL
      </Button>

      {generating.active ? (
        <GenerationOverlay
          label={generating.label}
          batch={generating.batch}
          totalBatches={generating.totalBatches}
        />
      ) : null}

      {/* Modal Custom Instruction */}
      <Dialog open={instructionOpen} onOpenChange={setInstructionOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="bg-primary px-5 py-4 text-primary-foreground">
            <DialogTitle className="flex items-center justify-between text-sm font-bold uppercase tracking-wide">
              Custom Instruction (Opsional)
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80">
              Beri instruksi khusus kepada AI untuk bagian soal ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Contoh penggunaan:
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
                {CUSTOM_INSTRUCTION_EXAMPLES.map((ex) => (
                  <li key={ex}>{ex}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Tulis Instruksi Tambahan (Opsional)</FieldLabel>
              <Textarea
                value={instructionDraft}
                onChange={(e) => setInstructionDraft(e.target.value)}
                placeholder="cth: Gunakan konteks kehidupan sehari-hari siswa dan tulis soal dalam bahasa Indonesia baku."
                className="min-h-[90px]"
                aria-label="Instruksi tambahan"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCustomInstruction(null)
                  setInstructionOpen(false)
                }}
              >
                Saya tidak pakai instruksi
              </Button>
              <Button
                type="button"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  const trimmed = instructionDraft.trim()
                  setCustomInstruction(trimmed.length > 0 ? trimmed : null)
                  setInstructionOpen(false)
                  if (trimmed) toast({ title: 'Instruksi kustom disimpan', description: trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : '') })
                }}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Tambah dengan instruksi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
