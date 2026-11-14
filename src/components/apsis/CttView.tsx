'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi, formatNumberId, formatSigned, formatPercent } from '@/lib/apsis/client'
import { DEMO_QUESTION_TEXTS, LETTERS } from '@/lib/apsis/constants'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, SectionCard, Chip, StatCard, EmptyState } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CttResult, ItemAnalysis, ItemStatus, OptionStat } from '@/lib/apsis/types'
import {
  ArrowRight,
  ClipboardCheck,
  Download,
  FilePlus2,
  Loader2,
  ScanSearch,
  Table2,
  Upload,
  X,
} from 'lucide-react'

const STATUS_TONE: Record<ItemStatus, 'success' | 'warning' | 'danger'> = {
  Pertahankan: 'success',
  Revisi: 'warning',
  Buang: 'danger',
}

const STATUS_STYLE: Record<ItemStatus, string> = {
  Pertahankan: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40',
  Revisi: 'bg-amber-50 border-amber-300 dark:bg-amber-950/40',
  Buang: 'bg-red-50 border-red-300 dark:bg-red-950/40',
}

function cellClasses(isCorrect: boolean, isBlank: boolean) {
  if (isBlank) return 'bg-muted text-muted-foreground'
  return isCorrect
    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200'
    : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-200'
}

export default function CttView() {
  const config = useApsisStore((s) => s.analysisConfig)
  const students = useApsisStore((s) => s.analysisStudents)
  const setAnalysisConfig = useApsisStore((s) => s.setAnalysisConfig)
  const setAnalysisStudents = useApsisStore((s) => s.setAnalysisStudents)
  const analysisLoaded = useApsisStore((s) => s.analysisLoaded)
  const setView = useApsisStore((s) => s.setView)
  const { toast } = useToast()

  const [result, setResult] = useState<CttResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [filter, setFilter] = useState<'Semua' | ItemStatus>('Semua')
  const [focusItem, setFocusItem] = useState<number | null>(null)
  const [kunciOpen, setKunciOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [pendingRows, setPendingRows] = useState<{ name: string; answers: string[] }[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [busyStudent, setBusyStudent] = useState<number | null>(null)
  const [addingStudent, setAddingStudent] = useState(false)
  const [tab, setTab] = useState('input')
  const fileRef = useRef<HTMLInputElement>(null)

  const totalQuestions = config?.totalQuestions ?? 10
  const optionCount = config?.optionCount ?? 3

  const compute = useCallback(async () => {
    setComputing(true)
    try {
      const data = await apsisApi.computeAnalysis({})
      setResult(data.ctt)
    } catch (err) {
      toast({
        title: 'Gagal menghitung analisis',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setComputing(false)
    }
  }, [toast])

  useEffect(() => {
    if (analysisLoaded) void compute()
    // hitung ulang ketika data berubah
  }, [analysisLoaded, students, config, compute])

  async function cycleCell(studentId: number, questionIndex: number) {
    if (!config) return
    const student = students.find((s) => s.id === studentId)
    if (!student) return
    const current = student.answers[questionIndex]
    const validLetters = LETTERS.slice(0, optionCount)
    let next: string
    if (!current || current === '-') next = validLetters[0]
    else {
      const idx = validLetters.indexOf(current)
      next = idx >= 0 && idx < optionCount - 1 ? validLetters[idx + 1] : '-'
    }
    const newAnswers = [...student.answers]
    newAnswers[questionIndex] = next
    setBusyStudent(studentId)
    try {
      const { student: updated } = await apsisApi.updateStudent(studentId, { answers: newAnswers })
      setAnalysisStudents(students.map((s) => (s.id === studentId ? updated : s)))
    } catch (err) {
      toast({
        title: 'Gagal menyimpan jawaban',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setBusyStudent(null)
    }
  }

  async function addStudent() {
    setAddingStudent(true)
    try {
      const { student } = await apsisApi.addStudent(`Siswa Baru ${students.length + 1}`)
      setAnalysisStudents([...students, student])
      toast({ title: `${student.name} ditambahkan`, description: 'Klik sel untuk mengisi jawaban.' })
    } catch (err) {
      toast({
        title: 'Gagal menambah siswa',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setAddingStudent(false)
    }
  }

  async function changeTotalQuestions(value: number) {
    const clamped = Math.max(5, Math.min(20, value || 10))
    try {
      const data = await apsisApi.patchAnalysisConfig({ totalQuestions: clamped })
      setAnalysisConfig(data.config)
      setAnalysisStudents(data.students)
    } catch (err) {
      toast({
        title: 'Gagal mengubah jumlah soal',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    }
  }

  async function changeOptionCount(value: number) {
    try {
      const data = await apsisApi.patchAnalysisConfig({ optionCount: value })
      setAnalysisConfig(data.config)
    } catch (err) {
      toast({
        title: 'Gagal mengubah jumlah opsi',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    }
  }

  async function saveKey(keyAnswers: string[]) {
    try {
      const data = await apsisApi.patchAnalysisConfig({ keyAnswers })
      setAnalysisConfig(data.config)
      setKunciOpen(false)
      toast({ title: 'Kunci jawaban diperbarui' })
    } catch (err) {
      toast({
        title: 'Gagal menyimpan kunci',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    }
  }

  function handleImportFile(file: File) {
    setImportError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result || '').replace(/^\uFEFF/, '').trim()
        const rows = text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0)
          .map((line) => {
            const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
            return { name: cols[0] || 'Tanpa Nama', answers: cols.slice(1, 1 + totalQuestions) }
          })
        if (rows.length === 0) throw new Error('File kosong')
        setPendingRows(rows)
        setImportOpen(true)
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Format CSV tidak valid')
      }
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    try {
      const data = await apsisApi.importStudents(pendingRows)
      setAnalysisConfig(data.config)
      setAnalysisStudents(data.students)
      setImportOpen(false)
      setPendingRows([])
      toast({ title: 'Import berhasil', description: `${data.students.length} siswa dimuat dari file.` })
    } catch (err) {
      toast({
        title: 'Gagal mengimpor',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    }
  }

  const filteredItems: ItemAnalysis[] = useMemo(() => {
    if (!result) return []
    return filter === 'Semua' ? result.items : result.items.filter((i) => i.status === filter)
  }, [result, filter])

  const focusDetail = useMemo(
    () => (result && focusItem ? result.items.find((i) => i.number === focusItem) ?? null : null),
    [result, focusItem]
  )

  if (!analysisLoaded || !config) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Analisis Butir Soal (Classical Test Theory)"
        description="Evaluasi kualitas butir soal: tingkat kesulitan (P), daya pembeda (D), analisis pengecoh, dan rekomendasi tindak lanjut."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <ScanSearch className="h-4 w-4" aria-hidden /> Cetak / PDF
            </Button>
            <a href="/api/export/csv?type=butir" download>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-4 w-4" aria-hidden /> Export Excel
              </Button>
            </a>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="flex-wrap rounded-xl border bg-card p-1.5">
            <TabsTrigger value="input" className="gap-1.5 rounded-lg font-bold">
              <Table2 className="h-4 w-4" aria-hidden /> Input Jawaban
            </TabsTrigger>
            <TabsTrigger value="hasil" className="gap-1.5 rounded-lg font-bold">
              <ClipboardCheck className="h-4 w-4" aria-hidden /> Hasil Analisis Butir (CTT)
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setView('kktp')}
          >
            Analisis Nilai Siswa <Chip tone="primary">KKTP</Chip> <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>

        <TabsContent value="input">
          <SectionCard
            title="Matriks Respon Siswa"
            note={`Klik sel untuk mengubah jawaban. Hijau = benar, merah = salah.`}
            headerExtra={
              <Chip tone="primary">
                {students.length} Siswa • {totalQuestions} Soal
              </Chip>
            }
          >
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 no-print">
                <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={addStudent} disabled={addingStudent}>
                  {addingStudent ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FilePlus2 className="h-4 w-4" aria-hidden />} Tambah Siswa
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setKunciOpen(true)}>
                  <ClipboardCheck className="h-4 w-4" aria-hidden /> Kunci Jawaban
                </Button>
                <a href="/api/export/csv?type=template" download>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Download className="h-4 w-4" aria-hidden /> Template
                  </Button>
                </a>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden /> Import Excel
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleImportFile(f)
                    e.target.value = ''
                  }}
                  aria-label="Import file jawaban CSV"
                />

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    Jumlah Soal:
                    <Input
                      type="number"
                      min={5}
                      max={20}
                      value={totalQuestions}
                      onChange={(e) => void changeTotalQuestions(parseInt(e.target.value, 10))}
                      onBlur={(e) => void changeTotalQuestions(parseInt(e.target.value, 10))}
                      className="h-8 w-16"
                      aria-label="Jumlah soal"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    Opsi:
                    <Select value={String(optionCount)} onValueChange={(v) => void changeOptionCount(parseInt(v, 10))}>
                      <SelectTrigger className="h-8 w-[120px]" aria-label="Jumlah opsi">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 (A B C)</SelectItem>
                        <SelectItem value="4">4 (A B C D)</SelectItem>
                        <SelectItem value="5">5 (A B C D E)</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </div>

              {students.length === 0 ? (
                <EmptyState
                  title="Belum ada data siswa"
                  description="Tambahkan siswa atau import dari file CSV."
                  action={
                    <Button className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={addStudent}>
                      <FilePlus2 className="h-4 w-4" aria-hidden /> Tambah Siswa
                    </Button>
                  }
                />
              ) : (
                <div className="max-h-[460px] overflow-auto rounded-lg border nice-scroll">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">Matriks respon siswa</caption>
                    <thead className="sticky top-0 z-10 bg-secondary">
                      <tr>
                        <th className="border-b border-border px-2 py-2 text-[11px] font-bold text-muted-foreground">No</th>
                        <th className="border-b border-border px-2 py-2 text-left text-[11px] font-bold text-muted-foreground">Nama Siswa</th>
                        {Array.from({ length: totalQuestions }, (_, i) => (
                          <th key={i} className="border-b border-border px-1 py-2 text-center text-[11px] font-bold text-muted-foreground">
                            {i + 1}
                          </th>
                        ))}
                        <th className="border-b border-border px-2 py-2 text-center text-[11px] font-bold text-muted-foreground">Skor</th>
                        <th className="border-b border-border px-1 py-2 text-[11px] font-bold text-muted-foreground no-print" aria-label="Hapus" />
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, rowIdx) => {
                        const correct = s.answers.filter((a, i) => a && a === config.keyAnswers[i]).length
                        return (
                          <tr key={s.id} className={rowIdx % 2 === 1 ? 'bg-muted/30' : ''}>
                            <td className="border-b border-border/60 px-2 py-1 text-center text-xs font-bold text-muted-foreground">
                              {rowIdx + 1}
                            </td>
                            <td className="border-b border-border/60 px-2 py-1 text-xs font-semibold">
                              {busyStudent === s.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {s.name}
                                </span>
                              ) : (
                                s.name
                              )}
                            </td>
                            {s.answers.map((a, qi) => {
                              const isKey = config.keyAnswers[qi]
                              const isCorrect = Boolean(a) && a === isKey
                              const isBlank = !a || a === '-'
                              return (
                                <td key={qi} className="border-b border-border/60 p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => void cycleCell(s.id, qi)}
                                    aria-label={`Jawaban ${s.name} soal ${qi + 1}: ${isBlank ? 'kosong' : a}`}
                                    className={cn(
                                      'h-7 w-9 rounded text-center text-xs font-bold transition-colors',
                                      cellClasses(isCorrect, isBlank)
                                    )}
                                  >
                                    {isBlank ? '−' : a}
                                  </button>
                                </td>
                              )
                            })}
                            <td className="border-b border-border/60 px-2 py-1 text-center">
                              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-extrabold text-primary">
                                {correct}/{totalQuestions}
                              </span>
                            </td>
                            <td className="border-b border-border/60 px-1 py-1 text-center no-print">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                aria-label={`Hapus ${s.name}`}
                                onClick={async () => {
                                  try {
                                    await apsisApi.deleteStudent(s.id)
                                    setAnalysisStudents(students.filter((x) => x.id !== s.id))
                                  } catch (err) {
                                    toast({
                                      title: 'Gagal menghapus siswa',
                                      description: err instanceof Error ? err.message : 'Coba lagi.',
                                      variant: 'destructive',
                                    })
                                  }
                                }}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Kunci saat ini:{' '}
                <span className="font-bold text-primary">{config.keyAnswers.join(' • ')}</span>
              </p>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="hasil">
          {computing && !result ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Reliabilitas KR-20"
                  value={formatNumberId(result.summary.kr20)}
                  sub={result.summary.kr20Label}
                  tone={result.summary.kr20 >= 0.6 ? 'success' : 'warning'}
                />
                <StatCard
                  label="Rata-rata Nilai"
                  value={`${formatNumberId(result.summary.mean)} /${result.summary.maxScore} Soal`}
                  sub="Skala 0–10"
                />
                <StatCard
                  label="Status Butir Soal"
                  value={
                    <span className="text-lg">
                      <span className="text-apsis-green">{result.summary.statusCounts.baik} Baik</span>
                      {', '}
                      <span className="text-amber-600">{result.summary.statusCounts.revisi} Revisi</span>
                      {', '}
                      <span className="text-destructive">{result.summary.statusCounts.buang} Buang</span>
                    </span>
                  }
                />
                <StatCard
                  label="Ukuran Sampel"
                  value={`${result.summary.sampleSize} Siswa`}
                  sub={`Kelompok 27% Atas/Bawah (${result.summary.groupSize} siswa/grup)`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 no-print">
                {(['Semua', 'Pertahankan', 'Revisi', 'Buang'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                      filter === f
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-card text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {f}
                  </button>
                ))}
                {focusItem ? (
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => setFocusItem(null)}>
                    <X className="h-3.5 w-3.5" aria-hidden /> Tutup Detail
                  </Button>
                ) : null}
              </div>

              {focusDetail ? (
                <ItemDetail item={focusDetail} totalStudents={students.length} />
              ) : (
                <div className="space-y-2.5">
                  {filteredItems.length === 0 ? (
                    <EmptyState title={`Tidak ada butir dengan status ${filter}`} />
                  ) : (
                    filteredItems.map((item) => (
                      <button
                        key={item.number}
                        type="button"
                        onClick={() => setFocusItem(item.number)}
                        className={cn(
                          'flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md',
                          STATUS_STYLE[item.status]
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold">
                            Soal #{item.number}{' '}
                            <span className="font-semibold text-muted-foreground">
                              — Kunci: {item.key}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            P: {formatNumberId(item.p)} ({item.pLabel}) • D: {formatSigned(item.d)}
                          </p>
                        </div>
                        <Chip tone={STATUS_TONE[item.status]}>{item.status.toUpperCase()}</Chip>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Dialog Kunci Jawaban */}
      <KeyDialog
        key={kunciOpen ? `open-${config.keyAnswers.join('')}` : 'closed'}
        open={kunciOpen}
        onOpenChange={setKunciOpen}
        totalQuestions={totalQuestions}
        optionCount={optionCount}
        initial={config.keyAnswers}
        onSave={saveKey}
      />

      {/* Dialog Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Jawaban dari File</DialogTitle>
            <DialogDescription>
              Konfirmasi untuk mengganti seluruh data siswa dengan {pendingRows.length} baris dari file.
            </DialogDescription>
          </DialogHeader>
          {importError ? <p className="text-xs font-semibold text-destructive">{importError}</p> : null}
          <div className="max-h-48 overflow-auto rounded-lg border nice-scroll">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold">Nama</th>
                  <th className="px-2 py-1.5 text-left font-bold">Jawaban</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.slice(0, 40).map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-2 py-1 font-semibold">{r.name}</td>
                    <td className="px-2 py-1 font-mono">{r.answers.join(' ') || '(kosong)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Batal
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={confirmImport}>
              Import Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KeyDialog({
  open,
  onOpenChange,
  totalQuestions,
  optionCount,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  totalQuestions: number
  optionCount: number
  initial: string[]
  onSave: (keys: string[]) => void
}) {
  const [draft, setDraft] = useState<string[]>(initial)
  const letters = LETTERS.slice(0, optionCount)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kunci Jawaban</DialogTitle>
          <DialogDescription>Atur kunci jawaban untuk {totalQuestions} butir soal.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[320px] grid-cols-2 gap-2 overflow-auto nice-scroll sm:grid-cols-3">
          {Array.from({ length: totalQuestions }, (_, i) => (
            <div key={i} className="rounded-lg border bg-background p-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Soal {i + 1}
              </p>
              <div className="flex gap-1" role="group" aria-label={`Kunci soal ${i + 1}`}>
                {letters.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      const next = [...draft]
                      next[i] = l
                      setDraft(next)
                    }}
                    aria-pressed={draft[i] === l}
                    className={cn(
                      'h-7 flex-1 rounded text-xs font-bold transition-colors',
                      draft[i] === l
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-card text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => onSave(draft)}>
            Simpan Kunci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OptionBar({ stat }: { stat: OptionStat }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-extrabold',
          stat.isKey ? 'bg-apsis-green text-white' : 'bg-muted text-foreground'
        )}
      >
        {stat.letter}
      </span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', stat.isKey ? 'bg-apsis-green' : 'bg-sky-400')}
          style={{ width: `${Math.max(stat.percent, stat.count > 0 ? 2 : 0)}%` }}
        />
      </div>
      <span className="w-28 shrink-0 text-right text-[11px] font-semibold text-muted-foreground">
        {stat.count > 0 ? `${stat.count} siswa • ${formatPercent(stat.percent)}` : '0% TIDAK BERFUNGSI'}
      </span>
      {stat.isKey ? <Chip tone="success">KUNCI</Chip> : null}
    </div>
  )
}

function ItemDetail({ item, totalStudents }: { item: ItemAnalysis; totalStudents: number }) {
  const text = DEMO_QUESTION_TEXTS[item.number - 1] ?? `Butir soal nomor ${item.number}`
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold">Detail Butir #{item.number}</p>
        <Chip tone={STATUS_TONE[item.status]}>STATUS: {item.status.toUpperCase()}</Chip>
      </div>
      <p className="mt-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">{text}</p>

      <div
        className={cn(
          'mt-3 rounded-lg border p-3',
          STATUS_STYLE[item.status]
        )}
      >
        <p className="text-xs font-extrabold uppercase tracking-wide">
          REKOMENDASI: {item.status.toUpperCase()}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Tingkat Kesulitan (P)
          </p>
          <p className="mt-1 text-xl font-extrabold tabular-nums">
            {formatNumberId(item.p)} <span className="text-sm font-bold text-primary">{item.pLabel}</span>
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${item.p * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.correctCount} dari {totalStudents} siswa menjawab benar
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Daya Pembeda (D)
          </p>
          <p className="mt-1 text-xl font-extrabold tabular-nums">
            {formatSigned(item.d)}{' '}
            <span className="text-sm font-bold text-primary">{item.dLabel}</span>
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                item.d >= 0.3 ? 'bg-apsis-green' : item.d >= 0.2 ? 'bg-amber-400' : 'bg-destructive'
              )}
              style={{ width: `${Math.max(0, Math.min(100, item.d * 100))}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.d < 0.2 ? 'Jelek, sebaiknya diganti' : item.d < 0.3 ? 'Cukup, perlu perbaikan pengecoh' : 'Baik, layak dipertahankan'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Distribusi Pemilih &amp; Analisis Pengecoh
        </p>
        <div className="space-y-2">
          {item.optionStats.map((s) => (
            <OptionBar key={s.letter} stat={s} />
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Kelompok Atas (KA)
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums">
            {item.upperCorrect}/{item.upperTotal} benar (
            {formatPercent(item.upperTotal > 0 ? (item.upperCorrect / item.upperTotal) * 100 : 0)})
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Kelompok Bawah (KB)
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums">
            {item.lowerCorrect}/{item.lowerTotal} benar (
            {formatPercent(item.lowerTotal > 0 ? (item.lowerCorrect / item.lowerTotal) * 100 : 0)})
          </p>
        </div>
      </div>
    </div>
  )
}
