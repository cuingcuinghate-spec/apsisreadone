// ============ Akses DB & normalisasi data analisis (server-only) ============

import { db } from '@/lib/db'
import { DEMO_CONFIG_ID } from './constants'
import type { AnalysisConfigData, AnalysisStudentData, AnalysisTopic } from './types'

const LETTER_ALPHABET = ['A', 'B', 'C', 'D', 'E']

function safeParseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isLetterInOptions(value: string, optionCount: number): boolean {
  const index = LETTER_ALPHABET.indexOf(value)
  return index >= 0 && index < optionCount
}

/** Kunci jawaban: panjang = totalQuestions, huruf valid, pad 'A'. */
export function normalizeKeyAnswers(raw: unknown, total: number): string[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < total; i++) {
    const value = String(arr[i] ?? '').trim().toUpperCase()
    out.push(isLetterInOptions(value, 5) ? value : 'A')
  }
  return out
}

/** Jawaban siswa: panjang = totalQuestions, huruf valid atau '-', pad '-'. */
export function normalizeStudentAnswers(raw: unknown, total: number): string[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < total; i++) {
    const value = String(arr[i] ?? '').trim().toUpperCase()
    out.push(value === '-' || isLetterInOptions(value, 5) ? value : '-')
  }
  return out
}

/** Topik default dua bagian (setengah awal & setengah akhir). */
export function defaultTopics(total: number): AnalysisTopic[] {
  const half = Math.ceil(total / 2)
  return [
    {
      label: 'Tujuan Pembelajaran 1',
      materi: 'Penjumlahan dan Pengurangan sampai 20',
      from: 1,
      to: half,
    },
    {
      label: 'Tujuan Pembelajaran 2',
      materi: 'Operasi Hitung Lanjutan & Perbandingan',
      from: half + 1,
      to: total,
    },
  ]
}

export function defaultConfigData(): AnalysisConfigData {
  return {
    totalQuestions: 10,
    optionCount: 3,
    kkm: 70,
    keyAnswers: ['B', 'A', 'B', 'B', 'B', 'C', 'B', 'A', 'B', 'C'],
    topics: defaultTopics(10),
  }
}

/** Topik wajib mencakup 1..totalQuestions tanpa gap; jika tidak, pakai default. */
export function normalizeTopics(raw: unknown, total: number): AnalysisTopic[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const topics: AnalysisTopic[] = []
    let valid = true
    for (const entry of raw) {
      const item = (entry ?? {}) as Record<string, unknown>
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      const materi = typeof item.materi === 'string' ? item.materi.trim() : ''
      const from = Number(item.from)
      const to = Number(item.to)
      if (!label || !materi || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > total || from > to) {
        valid = false
        break
      }
      topics.push({ label, materi, from, to })
    }
    if (valid) {
      const sorted = [...topics].sort((a, b) => a.from - b.from)
      let cursor = 1
      for (const topic of sorted) {
        if (topic.from > cursor) {
          valid = false
          break
        }
        cursor = Math.max(cursor, topic.to + 1)
      }
      if (valid && cursor > total) return topics
    }
  }
  return defaultTopics(total)
}

/** Normalisasi payload konfigurasi arbitrer menjadi AnalysisConfigData yang aman. */
export function normalizeConfig(raw: unknown): AnalysisConfigData {
  const fallback = defaultConfigData()
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const totalRaw = Number(obj.totalQuestions)
  const total = Number.isInteger(totalRaw) && totalRaw >= 1 && totalRaw <= 50 ? totalRaw : fallback.totalQuestions

  const optionRaw = Number(obj.optionCount)
  const optionCount =
    Number.isInteger(optionRaw) && optionRaw >= 1 && optionRaw <= 5
      ? Math.min(5, Math.max(3, optionRaw))
      : fallback.optionCount

  const kkmRaw = Number(obj.kkm)
  const kkm = Number.isFinite(kkmRaw) ? Math.min(100, Math.max(0, Math.round(kkmRaw))) : fallback.kkm

  return {
    totalQuestions: total,
    optionCount,
    kkm,
    keyAnswers: normalizeKeyAnswers(obj.keyAnswers, total),
    topics: normalizeTopics(obj.topics, total),
  }
}

/** Normalisasi daftar siswa arbitrer (panjang jawaban disesuaikan). */
export function normalizeStudents(raw: unknown, total: number): AnalysisStudentData[] {
  if (!Array.isArray(raw)) return []
  const students: AnalysisStudentData[] = []
  let nextId = 1
  for (const entry of raw) {
    const item = (entry ?? {}) as Record<string, unknown>
    const idRaw = Number(item.id)
    const id = Number.isInteger(idRaw) && idRaw >= 1 ? idRaw : nextId
    nextId = Math.max(nextId, id) + 1
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Siswa ${id}`
    students.push({ id, name, answers: normalizeStudentAnswers(item.answers, total) })
  }
  return students
}

/** Muat konfigurasi + seluruh siswa dari DB (dengan normalisasi menyeluruh). */
export async function getAnalysisData(): Promise<{
  config: AnalysisConfigData
  students: AnalysisStudentData[]
}> {
  const [configRow, studentRows] = await Promise.all([
    db.analysisConfig.findUnique({ where: { id: DEMO_CONFIG_ID } }),
    db.analysisStudent.findMany({ orderBy: { id: 'asc' } }),
  ])

  const config = configRow
    ? normalizeConfig({
        totalQuestions: configRow.totalQuestions,
        optionCount: configRow.optionCount,
        kkm: configRow.kkm,
        keyAnswers: safeParseJsonArray(configRow.keyAnswers),
        topics: safeParseJsonArray(configRow.topics),
      })
    : defaultConfigData()

  const students: AnalysisStudentData[] = studentRows.map((row) => ({
    id: row.id,
    name: row.name,
    answers: normalizeStudentAnswers(safeParseJsonArray(row.answers), config.totalQuestions),
  }))

  return { config, students }
}
