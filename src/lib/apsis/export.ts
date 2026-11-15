// ============ Ekspor dokumen (Word/HTML) & CSV — server-only ============

import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { SCHOOL_YEAR, LETTERS } from '@/lib/apsis/constants'
import type {
  ExamProfileData,
  StructureData,
  QuestionData,
  TkaSimulationData,
} from '@/lib/apsis/types'

// ---------- Helper umum ----------

function parseJsonArray<T>(raw: string | null | undefined, fallback: T[]): T[] {
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

/** Baca file gambar dari folder public → data URI base64. Gagal (file hilang) → null. */
function readImageAsDataUri(imagePath: string): string | null {
  try {
    const rel = imagePath.replace(/^[/\\]+/, '')
    const abs = path.join(process.cwd(), 'public', rel)
    const buf = fs.readFileSync(abs)
    const ext = path.extname(abs).toLowerCase().replace('.', '')
    const mime = ext === 'jpg' ? 'jpeg' : ext || 'png'
    return `data:image/${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br />')
}

function isChoiceType(questionType: string): boolean {
  return (
    questionType === 'Pilihan Ganda' ||
    questionType === 'Pilihan Ganda Kompleks' ||
    questionType === 'Benar/Salah'
  )
}

/** Teks jawaban dari soal: teks opsi kunci (jika PG/BS) atau jawaban langsung (Isian/Uraian). */
export function answerTextOf(q: QuestionData): string {
  const answer = q.answer.trim()
  const letterIndex = /^[A-Ea-e]$/.test(answer)
    ? answer.toUpperCase().charCodeAt(0) - 65
    : -1
  if (letterIndex >= 0 && letterIndex < q.options.length) {
    const text = q.options[letterIndex]
    if (text && text.trim()) return text
  }
  return q.answer
}

// ---------- 1. Data paket ujian terbaru ----------

export interface LatestExam {
  profile: ExamProfileData
  structures: StructureData[]
  questions: QuestionData[]
}

export async function getLatestExam(): Promise<LatestExam | null> {
  const profile = await db.examProfile.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      structures: {
        orderBy: { createdAt: 'asc' },
        include: { questions: { orderBy: { number: 'asc' } } },
      },
    },
  })
  if (!profile) return null

  const structures: StructureData[] = profile.structures.map((s) => ({
    id: s.id,
    profileId: s.profileId,
    label: s.label,
    questionType: s.questionType,
    optionCount: s.optionCount,
    includeImages: s.includeImages,
    easyCount: s.easyCount,
    mediumCount: s.mediumCount,
    hardCount: s.hardCount,
    total: s.total,
    cognitiveLevels: parseJsonArray<string>(s.cognitiveLevels, []),
    customInstruction: s.customInstruction,
  }))

  const questions: QuestionData[] = profile.structures.flatMap((s) =>
    s.questions.map((q) => ({
      id: q.id,
      structureId: q.structureId,
      number: q.number,
      type: q.type,
      difficulty: q.difficulty,
      cognitiveLevel: q.cognitiveLevel,
      content: q.content,
      options: parseJsonArray<string>(q.options, []),
      answer: q.answer,
      indicator: q.indicator,
      material: q.material,
      source: q.source,
      scoreWeight: q.scoreWeight,
      imagePrompt: q.imagePrompt,
      imagePath: q.imagePath,
    }))
  )

  return {
    profile: {
      id: profile.id,
      teacherName: profile.teacherName,
      schoolName: profile.schoolName,
      level: profile.level,
      phase: profile.phase,
      grade: profile.grade,
      subject: profile.subject,
      topic: profile.topic,
    },
    structures,
    questions,
  }
}

// ---------- 2. Util HTML ----------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------- 3. Kerangka HTML kompatibel Word ----------

const WORD_STYLES =
  "@page { size: A4; margin: 2cm; } " +
  "body { font-family: 'Times New Roman', serif; font-size: 12pt; } " +
  'h1 { text-align: center; } ' +
  '.center { text-align:center } ' +
  '.break { page-break-before: always; } ' +
  'table { border-collapse: collapse; width: 100% } ' +
  'td, th { border: 1px solid #333; padding: 6pt; vertical-align: top } ' +
  '.bold { font-weight: bold } ' +
  '.key { background: #d9ead3; font-weight: bold }'

export function buildWordDocHtml(title: string, bodyHtml: string): string {
  return (
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>${WORD_STYLES}</style></head>` +
    `<body>${bodyHtml}</body></html>`
  )
}

// ---------- 4. Naskah soal ujian ----------

const DEFAULT_INSTRUCTIONS: Record<string, string> = {
  'Pilihan Ganda':
    'Pilihlah salah satu jawaban yang paling tepat dengan memberi tanda silang (X) pada huruf di depan jawaban yang dipilih!',
  'Pilihan Ganda Kompleks':
    'Pilihlah jawaban yang paling tepat! Jawaban yang benar dapat lebih dari satu.',
  'Benar/Salah':
    'Tentukanlah apakah pernyataan pada setiap soal berikut Benar atau Salah!',
  'Isian Singkat':
    'Isilah titik-titik di bawah ini dengan jawaban yang singkat dan tepat!',
  Uraian:
    'Jawablah pertanyaan-pertanyaan berikut dengan lengkap dan jelas!',
}

function optionLineHtml(letter: string, text: string, indent: number, isKey?: boolean): string {
  const cls = isKey ? ' class="key"' : ''
  const suffix = isKey ? ' (KUNCI)' : ''
  return `<p${cls} style="margin:1pt 0 1pt ${indent}pt">${letter}. ${textToHtml(text)}${suffix}</p>`
}

function questionImageHtml(q: QuestionData): string {
  if (!q.imagePath) return ''
  const dataUri = readImageAsDataUri(q.imagePath)
  if (!dataUri) return ''
  return `<p class="center"><img src="${dataUri}" style="max-width:280px" /></p>`
}

export function buildNaskahDoc(
  profile: ExamProfileData,
  structures: StructureData[],
  questions: QuestionData[]
): string {
  const parts: string[] = []

  parts.push('<h1>NASKAH SOAL UJIAN</h1>')
  const identity: Array<[string, string]> = [
    ['Satuan Pendidikan', profile.schoolName],
    ['Penyusun', profile.teacherName],
    ['Mata Pelajaran', profile.subject],
    ['Kelas/Fase', `${profile.grade} / ${profile.phase}`],
    ['Tahun Pelajaran', SCHOOL_YEAR],
  ]
  for (const [label, value] of identity) {
    parts.push(`<p class="center"><span class="bold">${escapeHtml(label)} : </span>${escapeHtml(value)}</p>`)
  }
  parts.push(
    '<p class="center"><i>Petunjuk: Bacalah setiap soal dengan teliti sebelum menjawab!</i></p>'
  )

  structures.forEach((st, stIndex) => {
    const qs = questions.filter((q) => q.structureId === st.id)
    if (qs.length === 0) return

    if (stIndex > 0) parts.push('<div class="break"></div>')
    parts.push(`<h2>${escapeHtml(st.label)}: ${escapeHtml(st.questionType.toUpperCase())}</h2>`)
    const instruction =
      st.customInstruction?.trim() ||
      DEFAULT_INSTRUCTIONS[st.questionType] ||
      'Kerjakan setiap soal dengan cermat dan jujur!'
    parts.push(`<p><i>${escapeHtml(instruction)}</i></p>`)

    for (const q of qs) {
      parts.push(`<p class="bold">${q.number}. ${textToHtml(q.content)}</p>`)
      parts.push(questionImageHtml(q))
      if (isChoiceType(st.questionType) && q.options.length > 0) {
        q.options.forEach((opt, i) => {
          parts.push(optionLineHtml(LETTERS[i] ?? '-', opt, 24))
        })
      } else {
        parts.push('<p style="margin:1pt 0 1pt 24pt">Jawab: ............</p>')
      }
    }
  })

  return buildWordDocHtml('Naskah Soal Ujian', parts.join('\n'))
}

// ---------- 5. Kartu soal (format resmi Kemendikbudristek) ----------

function kartuCardHtml(profile: ExamProfileData, q: QuestionData): string {
  const rows: string[] = []
  const addRow = (label: string, valueHtml: string) => {
    rows.push(
      `<tr><td class="bold" style="width:28%">${escapeHtml(label)}</td><td>${valueHtml}</td></tr>`
    )
  }

  addRow('Satuan Pendidikan', escapeHtml(profile.schoolName))
  addRow('Penyusun', escapeHtml(profile.teacherName))
  addRow('Mata Pelajaran', escapeHtml(profile.subject))
  addRow('Kelas/Fase', escapeHtml(`${profile.grade} / ${profile.phase}`))
  addRow('Tahun Pelajaran', SCHOOL_YEAR)
  addRow('Capaian Pembelajaran (CP)/KD', escapeHtml(profile.topic))
  addRow('Materi Pokok', escapeHtml(q.material))
  addRow('Level Kognitif', escapeHtml(`${q.cognitiveLevel} (${q.difficulty})`))
  addRow('Indikator Soal', escapeHtml(q.indicator))
  addRow('Buku Sumber/Acuan', escapeHtml(q.source))

  // Rumusan Butir Soal
  const rumusan: string[] = [`<p style="margin:0 0 4pt 0">${textToHtml(q.content)}</p>`]
  rumusan.push(questionImageHtml(q))
  const keyLetters = q.answer
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-E]$/.test(s))

  if (isChoiceType(q.type) && q.options.length > 0) {
    q.options.forEach((opt, i) => {
      const letter = LETTERS[i] ?? '-'
      const isKey = keyLetters.includes(letter)
      rumusan.push(optionLineHtml(letter, opt, 12, isKey))
    })
  } else {
    rumusan.push(`<p style="margin:1pt 0 1pt 12pt">Jawaban: ${textToHtml(q.answer)}</p>`)
  }
  addRow('Rumusan Butir Soal', rumusan.join(''))

  // Kunci Jawaban
  const keyText = keyLetters
    .map((l) => {
      const idx = l.charCodeAt(0) - 65
      const text = q.options[idx]
      return text && text.trim() ? `${l}. ${text.trim()}` : l
    })
    .join(', ')
  addRow('Kunci Jawaban', escapeHtml(keyText || q.answer))

  addRow('Pedoman Penskoran', 'Skor 1 jika jawaban benar, skor 0 jika salah.')

  return (
    `<div class="center"><h2>KARTU SOAL NO. ${q.number}</h2></div>` +
    `<table>${rows.join('')}</table>`
  )
}

export function buildKartuDoc(
  profile: ExamProfileData,
  questions: QuestionData[],
  singleNumber?: number
): string {
  const list =
    singleNumber != null ? questions.filter((q) => q.number === singleNumber) : questions
  const cards = list.map((q) => kartuCardHtml(profile, q))
  return buildWordDocHtml('Kartu Soal', cards.join('\n<div class="break"></div>\n'))
}

// ---------- 6. Naskah simulasi TKA 2026 ----------

export function buildTkaDoc(sim: TkaSimulationData): string {
  const parts: string[] = []

  parts.push(
    `<h1>NASKAH SIMULASI TKA 2026 &mdash; ${escapeHtml(sim.subtest)} (${escapeHtml(sim.level)})</h1>`
  )
  parts.push(
    `<p class="center"><i>Naskah ini disusun mengikuti standar Kemendikdasmen untuk Simulasi Tes Kemampuan Akademik (TKA) 2026. ` +
      `Pilihlah satu jawaban yang paling tepat untuk setiap soal.</i></p>`
  )
  parts.push('<div class="break"></div>')

  sim.questions.forEach((q, i) => {
    const n = i + 1
    if (q.stimulus && q.stimulus.trim()) {
      parts.push(`<table><tr><td><i>${textToHtml(q.stimulus)}</i></td></tr></table>`)
    }
    parts.push(`<p><span class="bold">${n}.</span> ${textToHtml(q.content)}</p>`)
    q.options.forEach((opt, j) => {
      parts.push(`<p style="margin:1pt 0 1pt 24pt">${LETTERS[j] ?? '-'}. ${textToHtml(opt)}</p>`)
    })
  })

  parts.push('<div class="break"></div>')
  parts.push('<h2 class="center">KUNCI JAWABAN</h2>')
  parts.push(
    `<ol>${sim.questions.map((q) => `<li>${escapeHtml(q.answer)}</li>`).join('')}</ol>`
  )

  return buildWordDocHtml(`Simulasi TKA 2026 — ${sim.subtest}`, parts.join('\n'))
}

// ---------- 7. CSV ----------

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const cellOf = (value: string | number): string => {
    const s = String(value ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers, ...rows].map((row) => row.map(cellOf).join(','))
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
