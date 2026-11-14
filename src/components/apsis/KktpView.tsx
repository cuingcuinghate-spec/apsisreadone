'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi, formatNumberId, formatPercent } from '@/lib/apsis/client'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, SectionCard, Chip, StatCard, EmptyState } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { KktpResult, StudentScore } from '@/lib/apsis/types'
import { ArrowRight, Download, Loader2, Printer, Upload } from 'lucide-react'

const KKM_PRESETS = [65, 70, 75, 80]

export default function KktpView() {
  const config = useApsisStore((s) => s.analysisConfig)
  const students = useApsisStore((s) => s.analysisStudents)
  const setAnalysisConfig = useApsisStore((s) => s.setAnalysisConfig)
  const setAnalysisStudents = useApsisStore((s) => s.setAnalysisStudents)
  const analysisLoaded = useApsisStore((s) => s.analysisLoaded)
  const setCttTabState = useApsisStore((s) => s.setCttTab)
  const setView = useApsisStore((s) => s.setView)
  const { toast } = useToast()

  const [result, setResult] = useState<KktpResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [filter, setFilter] = useState<'Semua' | 'Tuntas' | 'Remedial'>('Semua')
  const [remedialStudent, setRemedialStudent] = useState<StudentScore | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const compute = useCallback(async () => {
    setComputing(true)
    try {
      const data = await apsisApi.computeAnalysis({})
      setResult(data.kktp)
    } catch (err) {
      toast({
        title: 'Gagal menghitung analisis nilai',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setComputing(false)
    }
  }, [toast])

  useEffect(() => {
    if (analysisLoaded) void compute()
  }, [analysisLoaded, students, config, compute])

  async function changeKkm(value: number) {
    try {
      const data = await apsisApi.patchAnalysisConfig({ kkm: value })
      setAnalysisConfig(data.config)
    } catch (err) {
      toast({
        title: 'Gagal mengubah KKM',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    }
  }

  function handleImportFile(file: File) {
    if (!config) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const text = String(reader.result || '').replace(/^\uFEFF/, '').trim()
        const rows = text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0)
          .map((line) => {
            const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
            return { name: cols[0] || 'Tanpa Nama', answers: cols.slice(1, 1 + config.totalQuestions) }
          })
        if (rows.length === 0) throw new Error('File kosong')
        const data = await apsisApi.importStudents(rows)
        setAnalysisConfig(data.config)
        setAnalysisStudents(data.students)
        toast({ title: 'Import berhasil', description: `${data.students.length} siswa dimuat.` })
      } catch (err) {
        toast({
          title: 'Gagal mengimpor file',
          description: err instanceof Error ? err.message : 'Format CSV tidak valid.',
          variant: 'destructive',
        })
      }
    }
    reader.readAsText(file)
  }

  if (!analysisLoaded || !config) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  const kkm = config.kkm
  const filteredStudents: StudentScore[] = result
    ? result.students.filter((s) =>
        filter === 'Semua' ? true : filter === 'Tuntas' ? s.status === 'TUNTAS' : s.status === 'BELUM TUNTAS'
      )
    : []

  return (
    <div className="space-y-5">
      <PageTitle
        title="Analisis Nilai & Ketuntasan Belajar Siswa"
        description="Evaluasi capaian pembelajaran berbasis Kriteria Ketercapaian Tujuan Pembelajaran (KKTP), distribusi nilai, dan rekomendasi remedial."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden /> Import Excel
            </Button>
            <a href="/api/export/csv?type=nilai" download>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-4 w-4" aria-hidden /> Export Excel
              </Button>
            </a>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Cetak / PDF
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setCttTabState('input')
                setView('ctt')
              }}
            >
              Buka Matriks Jawaban <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </>
        }
      />
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

      <div className="flex flex-wrap gap-2 no-print">
        <Chip tone="primary">{students.length} Siswa Terdaftar</Chip>
        <Chip tone="outline">{config.totalQuestions} Butir Soal</Chip>
        <Chip tone="outline">Kunci: {config.keyAnswers.join('')}</Chip>
      </div>

      {computing && !result ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        </div>
      ) : result ? (
        <div className="space-y-5">
          {/* KKM */}
          <SectionCard title="Kriteria Keteruntasan Minimal (KKM / KTP)">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
              <div className="flex-1">
                <Slider
                  value={[kkm]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => void changeKkm(v[0])}
                  aria-label="Nilai KKM"
                />
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-secondary px-4 py-2 text-center">
                  <span className="block text-2xl font-extrabold text-primary tabular-nums">{kkm}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    KKM
                  </span>
                </span>
                <div className="flex gap-1.5" role="group" aria-label="Preset KKM">
                  {KKM_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void changeKkm(p)}
                      aria-pressed={kkm === p}
                      className={cn(
                        'h-9 w-11 rounded-lg text-xs font-bold transition-colors',
                        kkm === p
                          ? 'bg-primary text-primary-foreground'
                          : 'border bg-card text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Statistik */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Rata-rata Kelas"
              value={`${formatNumberId(result.mean)} /100`}
              sub={
                <span>
                  Selisih KKM{' '}
                  <b className={result.mean >= kkm ? 'text-apsis-green' : 'text-destructive'}>
                    {result.mean >= kkm ? '+' : '−'}
                    {formatNumberId(Math.abs(result.mean - kkm))}
                  </b>
                </span>
              }
              tone={result.mean >= kkm ? 'success' : 'danger'}
            />
            <StatCard
              label="Rentang Nilai (Min/Max)"
              value={`${result.min} – ${result.max}`}
              sub={`Rentang Sebaran ${formatNumberId(result.rangeSpread)} poin`}
            />
            <StatCard
              label="Standar Deviasi"
              value={formatNumberId(result.sd)}
              sub={result.sdLabel}
            />
            <StatCard
              label="Ketuntasan Klasikal (Target ≥ 85%)"
              value={`${formatPercent(result.classicalMasteryPercent)}`}
              sub={`${result.tuntasCount} Tuntas • ${result.remedialCount} Remedial`}
              tone={result.needRemedialClassical ? 'danger' : 'success'}
            />
          </div>

          {result.needRemedialClassical ? (
            <div className="rounded-xl border border-destructive/40 bg-red-50 px-4 py-3 dark:bg-red-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold uppercase tracking-wide text-destructive">
                  PERLU REMEDIAL KLASIKAL
                </p>
                <Chip tone="danger">Ketuntasan di bawah target 85%</Chip>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-red-100 dark:bg-red-900/50">
                <div
                  className="h-full rounded-full bg-destructive"
                  style={{ width: `${result.classicalMasteryPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatPercent(result.classicalMasteryPercent)} dari target 85% — perlu tindak lanjut
                remedial untuk seluruh kelas.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-apsis-green/40 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40">
              <p className="text-sm font-extrabold uppercase tracking-wide text-apsis-green">
                TARGET TUNTAS KLASIKAL TERCAPAI
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ketuntasan {formatPercent(result.classicalMasteryPercent)} ≥ target 85%.
              </p>
            </div>
          )}

          {/* Distribusi nilai */}
          <SectionCard title="Distribusi Nilai Siswa">
            <div className="space-y-3">
              {result.distribution.map((band) => (
                <div key={band.label} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-bold text-muted-foreground">{band.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-lg bg-muted">
                    <div
                      className="flex h-full items-center justify-end rounded-lg px-2 text-[11px] font-extrabold text-white"
                      style={{ width: `${Math.max(band.percent, 3)}%`, backgroundColor: band.color }}
                    >
                      {band.count > 0 ? `${band.count} siswa` : ''}
                    </div>
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums">
                    {formatPercent(band.percent)}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Tabel daftar nilai */}
          <SectionCard
            title="Daftar Nilai & Status Ketuntasan Siswa"
            headerExtra={
              <div className="flex gap-1.5" role="group" aria-label="Filter ketuntasan">
                {(['Semua', 'Tuntas', 'Remedial'] as const).map((f) => (
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
                    {f === 'Semua' ? ` (${result.students.length})` : f === 'Tuntas' ? ` (${result.tuntasCount})` : ` (${result.remedialCount})`}
                  </button>
                ))}
              </div>
            }
          >
            {filteredStudents.length === 0 ? (
              <EmptyState title="Tidak ada siswa pada filter ini" />
            ) : (
              <div className="max-h-[480px] overflow-auto rounded-lg border nice-scroll">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-secondary">
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2.5 font-bold">Rank</th>
                      <th className="px-3 py-2.5 font-bold">Nama</th>
                      <th className="px-3 py-2.5 text-center font-bold">Benar</th>
                      <th className="px-3 py-2.5 text-center font-bold">Skor (0–100)</th>
                      <th className="px-3 py-2.5 text-center font-bold">KKM</th>
                      <th className="px-3 py-2.5 text-center font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold">Materi yang Belum Dikuasai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s) => (
                      <tr key={s.id} className="border-b border-border/60 odd:bg-muted/30">
                        <td className="px-3 py-2 text-xs font-extrabold text-muted-foreground">#{s.rank}</td>
                        <td className="px-3 py-2 text-xs font-bold">{s.name}</td>
                        <td className="px-3 py-2 text-center text-xs tabular-nums">
                          {s.correct}/{config.totalQuestions}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={cn(
                              'rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums',
                              s.score >= kkm
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                            )}
                          >
                            {s.score}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                          {kkm}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Chip tone={s.status === 'TUNTAS' ? 'success' : 'danger'}>
                            {s.status === 'TUNTAS' ? 'TUNTAS' : 'BELUM TUNTAS'}
                          </Chip>
                        </td>
                        <td className="px-3 py-2">
                          {s.weakMaterials.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {s.weakMaterials.map((m) => (
                                <Chip key={m} tone="warning">
                                  {m}
                                </Chip>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Capaian per TP */}
          <SectionCard title="Analisis Capaian per Tujuan Pembelajaran (TP) / Materi">
            <div className="space-y-3">
              {result.tpAnalysis.map((tp) => (
                <div key={tp.label} className="rounded-lg border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">
                        {tp.label} <span className="text-muted-foreground">(Soal {tp.from}-{tp.to})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{tp.materi}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold tabular-nums">
                        {formatPercent(tp.masteryPercent)}
                      </span>
                      <Chip
                        tone={
                          tp.status === 'BAIK' ? 'success' : tp.status === 'CUKUP' ? 'warning' : 'danger'
                        }
                      >
                        {tp.status}
                      </Chip>
                    </div>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        tp.status === 'BAIK'
                          ? 'bg-apsis-green'
                          : tp.status === 'CUKUP'
                            ? 'bg-amber-400'
                            : 'bg-destructive'
                      )}
                      style={{ width: `${tp.masteryPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Remedial */}
          <SectionCard
            title="Rekomendasi Tindak Lanjut & Kelompok Remedial"
            headerExtra={
              <Chip tone={result.remedialCount > 0 ? 'danger' : 'success'}>
                {result.remedialCount} Siswa Perlu Remedial
              </Chip>
            }
          >
            {result.remedialCount === 0 ? (
              <EmptyState
                title="Tidak ada siswa yang memerlukan remedial"
                description="Seluruh siswa mencapai KKM. Pertahankan kualitas pembelajaran!"
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {result.students
                  .filter((s) => s.status === 'BELUM TUNTAS')
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Skor {s.score} • {s.weakMaterials[0] ?? 'Perlu pendampingan'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-destructive/50 text-xs font-bold text-destructive hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950/40"
                        onClick={() => setRemedialStudent(s)}
                      >
                        REMEDIAL
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {/* Dialog Remedial */}
      <Dialog open={remedialStudent !== null} onOpenChange={(b) => !b && setRemedialStudent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Program Remedial — {remedialStudent?.name}</DialogTitle>
            <DialogDescription>
              Skor {remedialStudent?.score} (KKM {kkm}) — Jawaban benar{' '}
              {remedialStudent?.correct}/{config.totalQuestions}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Materi yang harus diulang
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-900 dark:text-amber-200">
                {remedialStudent?.weakMaterials.length ? (
                  remedialStudent.weakMaterials.map((m) => <li key={m}>{m}</li>)
                ) : (
                  <li>Materi keseluruhan perlu didampingi guru</li>
                )}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Rencana: pembelajaran ulang bermateri fokus, bimbingan kelompok kecil, lalu berikan tes
              pemantapan singkat sebelum asesmen formatif berikutnya.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemedialStudent(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
