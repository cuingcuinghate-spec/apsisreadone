// ============ Server-only helpers untuk generate soal (LLM + fallback) ============
import ZAI from 'z-ai-web-dev-sdk'
import { promises as fsp } from 'fs'
import path from 'path'
import os from 'os'
import type {
  ExamProfileData,
  StructureData,
  QuestionData,
  TkaQuestionData,
  TkaSimulationData,
} from './types'
import { db } from '@/lib/db'

export type NewQuestion = Omit<QuestionData, 'id' | 'structureId'>
type ZAIClient = Awaited<ReturnType<typeof ZAI.create>>

function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ---------- ZAI instance cache ----------
// File .z-ai-config dapat ditulis ulang oleh sistem (mis. token diperbarui).
// Cache di-invalidate berdasarkan mtime config agar token selalu fresh.
const CONFIG_PATHS = [
  path.join(process.cwd(), '.z-ai-config'),
  path.join(os.homedir(), '.z-ai-config'),
  '/etc/.z-ai-config',
]

let zaiInstance: ZAIClient | null = null
let zaiConfigSig: string | null = null

async function readConfigSignature(): Promise<string> {
  const parts: string[] = []
  for (const p of CONFIG_PATHS) {
    try {
      const st = await fsp.stat(p)
      parts.push(`${p}:${st.mtimeMs}`)
    } catch {
      parts.push(`${p}:-`)
    }
  }
  return parts.join('|')
}

export async function getZAI(): Promise<ZAIClient> {
  const sig = await readConfigSignature()
  if (!zaiInstance || sig !== zaiConfigSig) {
    zaiInstance = await ZAI.create()
    zaiConfigSig = sig
  }
  return zaiInstance
}

export function resetZAICache(): void {
  zaiInstance = null
  zaiConfigSig = null
}

const NO_TEXT_SUFFIX =
  ' Absolutely no text, no letters, no numbers, no Chinese characters, no captions, no labels, no watermark, no signature.'

export function withNoTextGuard(prompt: string): string {
  const clean = prompt.trim()
  if (/no text/i.test(clean)) {
    // Prompt sudah memuat larangan teks — pastikan klausul bahasa Cina ikut ada
    return /Chinese characters/i.test(clean) ? clean : `${clean.replace(/\.$/, '')}. No Chinese characters.`
  }
  return `${clean.replace(/\.$/, '')}.${NO_TEXT_SUFFIX}`
}

// ---------- Image generation dengan retry otomatis saat error auth (401) ----------
export async function generateImage(prompt: string, size = '1024x1024'): Promise<string> {
  const guardedPrompt = withNoTextGuard(prompt)
  let lastError: unknown = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const zai = await getZAI()
      const res = await zai.images.generations.create({ prompt: guardedPrompt, size })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error('Image generation returned no data')
      return b64
    } catch (err: any) {
      lastError = err
      const msg = String(err?.message ?? err)
      const isAuthError = /status 401|missing x-token|unauthorized|forbidden/i.test(msg)
      const isTransient = /status 4[02]9|status 5\d\d|timeout|econn|network|fetch failed/i.test(msg)
      if ((isAuthError || isTransient) && attempt < 3) {
        if (isAuthError) {
          // Token mungkin sudah dirotasi — paksa baca ulang config lalu coba lagi
          console.warn('[generateImage] auth error, refreshing ZAI config and retrying...')
          resetZAICache()
        } else {
          console.warn(`[generateImage] transient error (attempt ${attempt + 1}), retrying...`)
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

// ---------- 1. extractJsonArray ----------
export function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  // Strip markdown fences (```json ... ``` or ``` ... ```)
  let cleaned = text.trim()
  cleaned = cleaned.replace(/```(?:json)?/gi, '')
  const first = cleaned.indexOf('[')
  const last = cleaned.lastIndexOf(']')
  if (first === -1 || last === -1 || last <= first) return null
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// ---------- 2. callLLM ----------
export async function callLLM(system: string, user: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await getZAI()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        thinking: { type: 'disabled' },
      })
      const raw = completion?.choices?.[0]?.message?.content
      let text: string | null = null
      if (typeof raw === 'string') {
        text = raw
      } else if (Array.isArray(raw)) {
        text = raw.map((part: any) => (typeof part === 'string' ? part : part?.text ?? '')).join('')
      }
      if (text && text.trim().length > 0) return text
      console.warn(`[callLLM] attempt ${attempt + 1}: empty content`)
    } catch (err) {
      console.error(`[callLLM] attempt ${attempt + 1} error:`, err)
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  console.error('[callLLM] final failure after retries')
  return null
}

// ---------- Shared prompt fragments ----------
const SYSTEM_PROMPT =
  'Anda adalah penyusun soal ujian profesional Indonesia yang mengikuti Kurikulum Merdeka dan prinsip asesmen Kemendikbudristek. Balas HANYA dengan JSON array valid tanpa teks lain.'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

function questionTypeFlags(questionType: string) {
  const t = (questionType || '').toLowerCase()
  return {
    isPG: t.includes('pilihan ganda'),
    isComplex: t.includes('kompleks'),
    isBS: t.includes('benar') || t.includes('salah'),
    isShort: t.includes('isian'),
    isEssay: t.includes('uraian'),
  }
}

function stripOptionPrefix(opt: string): string {
  let s = String(opt ?? '').trim()
  const stripped = s.replace(/^[A-Ja-j][.)]\s+/, '')
  if (stripped.trim().length > 0) s = stripped
  return s
}

function normalizeAnswerLetter(answer: any, optionCount: number): string | null {
  const raw = String(answer ?? '').trim().toUpperCase()
  if (!raw) return null
  const firstLetter = raw.match(/[A-J]/)
  if (!firstLetter) return null
  const letter = firstLetter[0]
  const idx = LETTERS.indexOf(letter)
  if (idx === -1 || idx >= optionCount) return null
  return letter
}

function normalizeAnswerLetters(answer: any, optionCount: number): string | null {
  const raw = String(answer ?? '').trim().toUpperCase()
  if (!raw) return null
  const letters = raw.match(/[A-J]/g) ?? []
  const valid = Array.from(new Set(letters)).filter((l) => LETTERS.indexOf(l) < optionCount)
  if (valid.length === 0) return null
  return valid.join(',')
}

// ---------- Difficulty & cognitive helpers ----------
function difficultySequence(structure: StructureData): string[] {
  const seq: string[] = []
  for (let i = 0; i < structure.easyCount; i++) seq.push('Mudah')
  for (let i = 0; i < structure.mediumCount; i++) seq.push('Sedang')
  for (let i = 0; i < structure.hardCount; i++) seq.push('Sulit')
  const total = structure.total > 0 ? structure.total : seq.length
  while (seq.length < total) seq.push('Sedang')
  return seq.slice(0, total)
}

function cognitiveAt(structure: StructureData, index: number): string {
  const levels = structure.cognitiveLevels && structure.cognitiveLevels.length > 0 ? structure.cognitiveLevels : ['C1']
  return levels[index % levels.length]
}

// ---------- 4. fallbackQuestions ----------
export function fallbackQuestionAt(
  profile: ExamProfileData,
  structure: StructureData,
  index: number,
  difficulty: string,
  cognitiveLevel: string,
  number: number
): NewQuestion {
  const { isPG, isComplex, isBS, isShort, isEssay } = questionTypeFlags(structure.questionType)
  const isMath = /matematika/i.test(profile.subject || '')
  const indicator = `Siswa mampu menyelesaikan soal tentang ${profile.topic}`
  const material = profile.topic
  const source = 'Buku Siswa Kurikulum Merdeka'
  const base = { number, type: structure.questionType, difficulty, cognitiveLevel, indicator, material, source, scoreWeight: 1, imagePrompt: null, imagePath: null }

  if (isMath) {
    const a = 2 + ((index * 7) % 8)
    const b = 1 + ((index * 5) % 9)
    const usePlus = index % 2 === 0
    let aa = a
    let bb = b
    if (!usePlus && bb > aa) {
      const tmp = aa
      aa = bb
      bb = tmp
    }
    const op = usePlus ? '+' : '-'
    const correct = usePlus ? aa + bb : aa - bb
    const story = index % 3 !== 0
    const items = ['apel', 'buku', 'kelereng']
    const names = ['Andi', 'Budi', 'Citra']
    const item = items[index % 3]
    const name = names[index % 3]
    const storyContent = `${name} memiliki ${aa} ${item}. Kemudian ${usePlus ? `ditambah ${bb}` : `dikurangi ${bb}`}. Berapa hasil akhirnya?`
    const plainContent = `Hasil dari ${aa} ${op} ${bb} adalah…`

    if (isBS) {
      const claimed = correct + (index % 2 === 0 ? 0 : 1 + (index % 3))
      const content = `Perhatikan pernyataan berikut: "Hasil dari ${aa} ${op} ${bb} adalah ${claimed}." Pernyataan tersebut benar atau salah?`
      return { ...base, content, options: ['Benar', 'Salah'], answer: claimed === correct ? 'A' : 'B' }
    }

    if (isShort || isEssay) {
      const content = isEssay ? storyContent : plainContent
      const answer = isEssay
        ? `${correct}, karena ${aa} ${usePlus ? 'ditambah' : 'dikurangi'} ${bb} menghasilkan ${correct}.`
        : String(correct)
      return { ...base, content, options: [], answer }
    }

    // PG / PG Kompleks
    const content = story ? storyContent : plainContent
    const correctPos = Math.min(index % 3, Math.max(structure.optionCount - 1, 0))
    const deltas = [-1, 1, 2, -2, 3, -3, 4]
    const distractors: string[] = []
    for (const d of deltas) {
      if (distractors.length >= structure.optionCount - 1) break
      const v = correct + d
      if (v >= 0 && v !== correct && !distractors.includes(String(v))) distractors.push(String(v))
    }
    const options: string[] = []
    let dIdx = 0
    for (let k = 0; k < structure.optionCount; k++) {
      if (k === correctPos) {
        options.push(String(correct))
      } else {
        options.push(distractors[dIdx % distractors.length])
        dIdx++
      }
    }
    const answer = isComplex ? LETTERS[correctPos] : LETTERS[correctPos]
    return { ...base, content, options, answer }
  }

  // Generic (non-matematika)
  if (isBS) {
    const positive = index % 2 === 0
    const content = positive
      ? `Pernyataan: "Konsep ${profile.topic} termasuk materi penting yang dipelajari dalam ${profile.subject} di ${profile.grade}." Pernyataan tersebut benar atau salah?`
      : `Pernyataan: "${profile.topic} sama sekali tidak memiliki kaitan dengan materi ${profile.subject}." Pernyataan tersebut benar atau salah?`
    return { ...base, content, options: ['Benar', 'Salah'], answer: positive ? 'A' : 'B' }
  }

  if (isShort || isEssay) {
    const content = `Jelaskan dengan singkat konsep ${profile.topic} (${index + 1})${isEssay ? ' beserta satu contohnya' : ''}.`
    const answer = isEssay
      ? `Jawaban model: siswa menjelaskan pengertian ${profile.topic} dan memberikan satu contoh relevan dalam kehidupan sehari-hari.`
      : `${profile.topic} merupakan konsep dalam ${profile.subject} yang mencakup pemahaman, penerapan, dan contoh nyata di kehidupan sehari-hari.`
    return { ...base, content, options: [], answer }
  }

  // PG / PG Kompleks
  const genericOptions = ['Pernyataan yang tepat', 'Pernyataan kurang tepat', 'Tidak relevan']
  while (genericOptions.length < structure.optionCount) {
    genericOptions.push(`Pernyataan tidak dapat diterima (${genericOptions.length})`)
  }
  return {
    ...base,
    content: `Pilih pernyataan yang paling tepat mengenai konsep ${profile.topic} (soal ${index + 1}).`,
    options: genericOptions.slice(0, structure.optionCount),
    answer: 'A',
  }
}

export function fallbackQuestions(profile: ExamProfileData, structure: StructureData, startNumber: number): NewQuestion[] {
  const difficulties = difficultySequence(structure)
  const total = structure.total > 0 ? structure.total : difficulties.length
  const out: NewQuestion[] = []
  for (let i = 0; i < total; i++) {
    out.push(fallbackQuestionAt(profile, structure, i, difficulties[i], cognitiveAt(structure, i), startNumber + i))
  }
  return out
}

// ---------- 3. generateQuestionsForStructure ----------
function sanitizeLLMQuestion(
  raw: any,
  profile: ExamProfileData,
  structure: StructureData,
  difficulty: string,
  cognitiveLevel: string,
  number: number
): NewQuestion | null {
  const { isPG, isComplex, isBS, isShort, isEssay } = questionTypeFlags(structure.questionType)
  const content = String(raw?.content ?? '').trim()
  if (!content) return null

  let options: string[] = []
  let answer = ''

  if (isBS) {
    options = ['Benar', 'Salah']
    const ans = String(raw?.answer ?? '').trim().toLowerCase()
    if (ans.includes('benar') || (ans.startsWith('a') && !ans.includes('benar') && !ans.includes('salah'))) answer = 'A'
    else if (ans.includes('salah') || ans.startsWith('b')) answer = 'B'
    else return null
  } else if (isPG) {
    if (!Array.isArray(raw?.options)) return null
    options = raw.options.map(stripOptionPrefix).filter((o: string) => o.length > 0)
    if (options.length > structure.optionCount) options = options.slice(0, structure.optionCount)
    if (options.length !== structure.optionCount) return null
    const normalized = isComplex
      ? normalizeAnswerLetters(raw?.answer, structure.optionCount)
      : normalizeAnswerLetter(raw?.answer, structure.optionCount)
    if (!normalized) return null
    answer = normalized
  } else if (isShort || isEssay) {
    options = []
    answer = String(raw?.answer ?? '').trim()
    if (!answer) return null
  } else {
    // Unknown type: treat as short answer
    options = []
    answer = String(raw?.answer ?? '').trim()
    if (!answer) return null
  }

  const indicator = String(raw?.indicator ?? '').trim() || `Siswa mampu menyelesaikan soal tentang ${profile.topic}`
  const material = String(raw?.material ?? '').trim() || profile.topic
  const source = String(raw?.source ?? '').trim() || 'Buku Siswa Kurikulum Merdeka'

  return {
    number,
    type: structure.questionType,
    difficulty,
    cognitiveLevel,
    content,
    options,
    answer,
    indicator,
    material,
    source,
    scoreWeight: 1,
    imagePrompt: null,
    imagePath: null,
  }
}

export async function generateQuestionsForStructure(
  profile: ExamProfileData,
  structure: StructureData,
  startNumber: number
): Promise<NewQuestion[]> {
  const difficulties = difficultySequence(structure)
  const total = structure.total > 0 ? structure.total : difficulties.length
  const CHUNK_SIZE = 6
  const out: NewQuestion[] = []

  for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, total)
    const chunkIndexes: number[] = []
    for (let i = chunkStart; i < chunkEnd; i++) chunkIndexes.push(i)

    const levels = structure.cognitiveLevels && structure.cognitiveLevels.length > 0 ? structure.cognitiveLevels.join(', ') : 'C1'
    const chunkDifficulties = chunkIndexes.map((i) => difficulties[i]).join(', ')

    const userPrompt = [
      `Buat soal ujian dengan konteks berikut: jenjang ${profile.level}, fase ${profile.phase}, kelas ${profile.grade}, mata pelajaran ${profile.subject}, topik "${profile.topic}".`,
      `Bentuk soal: ${structure.questionType} dengan ${structure.optionCount} opsi (untuk Pilihan Ganda / Pilihan Ganda Kompleks).`,
      structure.customInstruction ? `Instruksi tambahan dari guru: ${structure.customInstruction}` : '',
      `Buat ${chunkIndexes.length} soal dengan spesifikasi per soal (array JSON objects): {"content": string (teks soal jelas sesuai tingkat kelas), "options": array ${structure.optionCount} string TANPA huruf prefix (HANYA untuk bentuk pilihan ganda; untuk "Benar/Salah" gunakan ["Benar","Salah"]; untuk "Isian Singkat"/"Uraian" gunakan []), "answer": huruf kunci (A/B/C/...) untuk pilihan ganda, atau jawaban model singkat untuk isian/uraian, atau "A" (Benar) / "B" (Salah) untuk Benar/Salah, "indicator": string indikator soal, "material": string materi pokok, "source": string buku sumber/acuan}.`,
      `Tingkat kesulitan untuk ${chunkIndexes.length} soal ini (berurutan): ${chunkDifficulties}.`,
      `Soal harus variatif, kontekstual, sesuai kognitif ${levels}, dan tidak saling mirip. Balas HANYA JSON array.`,
    ]
      .filter(Boolean)
      .join('\n')

    console.log(`[generate] chunk ${chunkStart}-${chunkEnd - 1} (${chunkIndexes.length} soal) dari ${total} — memanggil LLM...`)
    const text = await callLLM(SYSTEM_PROMPT, userPrompt, 2)
    const parsed = text ? extractJsonArray(text) : null

    if (!parsed) {
      console.warn(`[generate] chunk ${chunkStart}-${chunkEnd - 1}: LLM gagal/parse gagal → menggunakan fallback template`)
    }

    for (let k = 0; k < chunkIndexes.length; k++) {
      const i = chunkIndexes[k]
      const number = startNumber + i
      const difficulty = difficulties[i]
      const cognitiveLevel = cognitiveAt(structure, i)
      let question: NewQuestion | null = null
      if (parsed && parsed[k]) {
        question = sanitizeLLMQuestion(parsed[k], profile, structure, difficulty, cognitiveLevel, number)
      }
      if (!question) {
        question = fallbackQuestionAt(profile, structure, i, difficulty, cognitiveLevel, number)
      }
      out.push(question)
    }
    console.log(`[generate] chunk ${chunkStart}-${chunkEnd - 1} selesai (total soal sejauh ini: ${out.length})`)
  }

  return out
}

// ---------- 5. regenerateQuestion ----------
export async function regenerateQuestion(
  profile: ExamProfileData,
  structure: StructureData,
  question: QuestionData
): Promise<{ content: string; options: string[]; answer: string; indicator: string; material: string; source: string }> {
  const { isPG, isComplex, isBS, isShort, isEssay } = questionTypeFlags(structure.questionType)
  const levels = structure.cognitiveLevels && structure.cognitiveLevels.length > 0 ? structure.cognitiveLevels.join(', ') : 'C1'

  const optionRule = isBS
    ? '"options": ["Benar","Salah"], "answer": "A" (Benar) atau "B" (Salah)'
    : isPG
      ? `"options": array ${structure.optionCount} string TANPA huruf prefix, "answer": huruf kunci (${isComplex ? 'boleh beberapa huruf dipisah koma' : 'satu huruf A/B/C/...'})`
      : isShort || isEssay
        ? '"options": [], "answer": jawaban model singkat'
        : '"options": [], "answer": jawaban model singkat'

  const userPrompt = [
    `Buat SOAL BARU yang berbeda dari soal sebelumnya berikut ini (jangan menyalin isi soal lama).`,
    `Soal lama: "${question.content.slice(0, 400)}"`,
    `Konteks: jenjang ${profile.level}, fase ${profile.phase}, kelas ${profile.grade}, mata pelajaran ${profile.subject}, topik "${profile.topic}".`,
    `Bentuk soal: ${structure.questionType} dengan ${structure.optionCount} opsi (untuk Pilihan Ganda / Pilihan Ganda Kompleks). Tingkat kesulitan: ${question.difficulty}. Level kognitif: ${question.cognitiveLevel} dari ${levels}.`,
    structure.customInstruction ? `Instruksi tambahan dari guru: ${structure.customInstruction}` : '',
    `Balas dengan JSON array yang berisi SATU object soal dengan spesifikasi: {"content": string, ${optionRule}, "indicator": string indikator soal, "material": string materi pokok, "source": string buku sumber/acuan}. Soal harus variatif dan kontekstual. Balas HANYA JSON array.`,
  ]
    .filter(Boolean)
    .join('\n')

  console.log(`[regenerate] soal nomor ${question.number} — memanggil LLM...`)
  const text = await callLLM(SYSTEM_PROMPT, userPrompt, 2)
  const parsed = text ? extractJsonArray(text) : null
  const raw = parsed && parsed.length > 0 ? parsed[0] : null

  if (raw) {
    const sanitized = sanitizeLLMQuestion(
      raw,
      profile,
      { ...structure, total: 1 },
      question.difficulty,
      question.cognitiveLevel,
      question.number
    )
    if (sanitized) {
      console.log(`[regenerate] soal nomor ${question.number}: LLM OK`)
      return {
        content: sanitized.content,
        options: sanitized.options,
        answer: sanitized.answer,
        indicator: sanitized.indicator,
        material: sanitized.material,
        source: sanitized.source,
      }
    }
  }

  console.warn(`[regenerate] soal nomor ${question.number}: LLM gagal/tidak valid → fallback template variant`)
  const variant = fallbackQuestionAt(
    profile,
    structure,
    question.number * 2 + 1,
    question.difficulty,
    question.cognitiveLevel,
    question.number
  )
  return {
    content: variant.content,
    options: variant.options,
    answer: variant.answer,
    indicator: variant.indicator,
    material: variant.material,
    source: variant.source,
  }
}

// ---------- 6. generateTkaQuestions ----------
const TKA_SYSTEM_PROMPT = SYSTEM_PROMPT

const TKA_THEMES = [
  'budaya Indonesia (tenun ikat / batik)',
  'kesehatan masyarakat (demam berdarah)',
  'lingkungan (pengelolaan sampah / kebakaran hutan)',
  'teknologi (media digital / aplikasi)',
  'ekonomi sederhana (warung / UMKM)',
]

interface TkaFallbackSet {
  stimulus: string
  content: string
  options: string[]
  answer: string
  cognitiveLevel: string
  difficulty: string
}

const TKA_FALLBACK_SETS: TkaFallbackSet[] = [
  {
    // Literasi 1: tenun ikat
    stimulus:
      'Di Pulau Sumba, Nusa Tenggara Timur, tenun ikat atau hinggi bukan sekadar kain, melainkan simbol status sosial dan penghubung dunia manusia dengan leluhur. Motif-motif seperti kuda, ayam, dan tengkorak manusia ditenun memakai pewarna alami dari akar mengkudu dan daun indigo. Prosesnya panjang: benang dipilin, dicelup, dirancang motifnya dengan teknik ikat, lalu ditenun berhari-hari di alat tenun bukan mesin. Seorang penenun ahli bisa menyelesaikan satu kain ritual dalam waktu hingga satu bulan. Kini generasi muda mulai meninggalkan tradisi ini karena waktu panjang dan hasil ekonomi yang tak selalu sepadan. Untunglah, sejumlah komunitas di Waingapu menghidupkan kembali minat lewat pelatihan penenunan bagi pemuda dan pemasaran daring. Kain hinggi kini juga tampil di ajang fashion nasional dengan sentuhan desain modern. Pemerintah daerah pun menetapkan tenun ikat sebagai warisan budaya takbenda yang wajib dilindungi. Meski demikian, para tetua masih mengingatkan bahwa makna ritual setiap motif tidak boleh dikorbankan demi pasar.',
    content: 'Berdasarkan stimulus tersebut, simpulan yang paling tepat tentang keberlanjutan tradisi tenun ikat Sumba adalah…',
    options: [
      'tradisi bertahan karena disokong pelatihan pemuda, pemasaran baru, dan pengakuan resmi tanpa meninggalkan makna ritualnya.',
      'tradisi itu sudah punah sejak generasi muda meninggalkan desa.',
      'motif ritual kini sepenuhnya diganti motif komersial agar laku di pasar.',
      'pemerintah melarang penjualan kain hinggi ke luar Pulau Sumba.',
    ],
    answer: 'A',
    cognitiveLevel: 'C5',
    difficulty: 'Sedang',
  },
  {
    // Literasi 2: demam berdarah
    stimulus:
      'Musim hingga membawa berkah bagi petani, tetapi juga membawa risiko. Rumah Sakit Umum Daerah Kota Baru mencatat lonjakan pasien demam berdarah dengue sebesar dua kali lipat dibanding bulan lalu. Kepala Dinas Kesehatan menjelaskan bahwa genangan air di ban bekas, pot gentong, dan saluran tersumbat menjadi tempat berkembang biak Aedes aegypti. Petugas jumantik berkeliling memeriksa akumulasi air dan mengecat bak muatan nyamuk, tetapi keberhasilannya bergantung pada kebiasaan warga. Keluarga dengan anak di bawah lima diminta memasang kelambu, memakai repellent, dan mengadakan gerbong rumah setiap Jumat. Di beberapa sekolah, murid diajak menanam tanaman pengusir nyamuk seperti lavender dan serai wangi di halaman. Kepala puskesmas menegaskan bahwa kematian bisa dicegah bila pengobatan dimulai pada hari kedua atau ketiga demam. Masyarakat diimbau tidak panik, namun tetap waspada, terutama bila anak menunjukkan tanda perdarahan seperti mimisan atau bintik merah pada kulit.',
    content: 'Manakah pernyataan yang paling sesuai dengan isi stimulus tersebut?',
    options: [
      'keberhasilan pemberantasan sarang nyamuk lebih ditentukan oleh kebiasaan warga daripada kerja petugas semata.',
      'vaksin demam berdarah sudah dibagikan gratis kepada seluruh warga Kota Baru.',
      'demam berdarah hanya menyerang keluarga yang tinggal di kawasan padat.',
      'pengobatan bisa ditunda hingga hari kelima tanpa risiko apa pun.',
    ],
    answer: 'A',
    cognitiveLevel: 'C4',
    difficulty: 'Sedang',
  },
  {
    // Literasi 3: semut rangging
    stimulus:
      'Legenda Semut Rangging berasal dari Kutai, Kalimantan Timur, dan diwariskan secara turun-temurun melalui cerita lisan. Konon, semut rangging adalah semut merah kecil yang gigih: walau badannya mungil, ia mampu memindahkan daun besar seorang diri demi sarangnya. Dalam hikayat, seekor semut rangging menantang buaya raksasa yang meneror penghuni hutan. Dengan kecerdikan, semut itu menyuruh para buaya berbaris melintasi muara dan menghitung jumlah mereka, lalu mengaku bahwa anak buahnya di daratan jauh lebih banyak. Buaya yang takut akhirnya pergi meninggalkan muara. Cerita ini sering dipakai para tetua Dayak untuk menanamkan nilai kerja keras, kecerdikan, dan keberanian menghadapi kekuatan besar. Kini legenda itu juga muncul dalam buku cerita anak bergambar dan pertunjukan teater sekolah. Para guru memanfaatkan kisah itu untuk mengajarkan bahwa ukuran bukan penentu kemenangan; strategi dan kekompakan justru sering menjadi penentu.',
    content: 'Nilai kehidupan yang paling menonjol dari legenda Semut Rangging dan alasan pemanfaatannya di sekolah adalah…',
    options: [
      'kerja keras, kecerdikan, dan keberanian — karena kisahnya menunjukkan yang kecil pun dapat menang lewat strategi dan kekompakan.',
      'kesombongan — karena semut berhasil menakuti buaya hingga lari.',
      'kepatuhan mutlak — karena buaya menuruti semua perintah semut.',
      'kekayaan — karena semut memperoleh harta dari buaya.',
    ],
    answer: 'A',
    cognitiveLevel: 'C5',
    difficulty: 'Sulit',
  },
  {
    // Numerasi 1: data penjualan
    stimulus:
      'Bu Ratna menjalankan warung kelontong di tepi pasar Desa Sukamaju. Selama satu pekan, ia mencatat penjualan tiga produk utamanya. Senin sampai Kamis, penjualan kopi sachet naik stabil: 20, 24, 28, lalu 32 bungkus per hari. Jumat turun menjadi 25 bungkus karena banyak pembeli memilih menabung menjelang akhir pekan, lalu Sabtu melonjak ke 40 bungkus dan Minggu 45 bungkus ketika pasar ramai. Untuk gula pasir, penjualannya cukup rata, sekitar 15 kg setiap hari, kecuali Minggu yang mencapai 22 kg. Minyak goreng justru paling ramai di awal bulan: pada pekan ini penjualannya 10 kg per hari, kecuali Senin yang mencapai 18 kg karena tepat hari gajian. Bu Ratna berencana menghitung rata-rata penjualan tiap produk untuk menentukan stok awal pekan depan. Ia juga membandingkan total penjualan akhir pekan (Sabtu-Minggu) dengan hari kerja agar tahu kapan harus menambah tenaga bantu.',
    content: 'Berdasarkan data pada stimulus, selisih rata-rata penjualan kopi sachet pada hari kerja (Senin-Jumat) dan akhir pekan (Sabtu-Minggu) adalah…',
    options: [
      '6 bungkus, dengan rata-rata akhir pekan lebih tinggi.',
      '6 bungkus, dengan rata-rata hari kerja lebih tinggi.',
      '9 bungkus, dengan rata-rata akhir pekan lebih tinggi.',
      '4 bungkus, dengan rata-rata hari kerja lebih tinggi.',
    ],
    answer: 'A',
    cognitiveLevel: 'C4',
    difficulty: 'Sedang',
  },
  {
    // Numerasi 2: tangga stadium
    stimulus:
      'Stadion Cendrawasih memiliki tribun timur dengan susunan tangga berbentuk pola. Undakan pertama dari lapangan memiliki 3 langkah dari pintu masuk bawah, dan setiap baris di atasnya bertambah 4 langkah dari baris sebelumnya. Jadi baris pertama memerlukan 3 langkah, baris kedua 7 langkah, baris ketiga 11 langkah, dan seterusnya. Panitia pertandingan ingin memasang papan petunjuk jarak tempuh di setiap blok. Seorang petugas menghitung berapa total langkah yang ditempuh penonton di blok A yang terdiri atas 8 baris terbawah jika penonton harus mendaki sampai baris ke-8. Sementara itu, di tribun barat polanya berbeda: baris pertama 2 langkah dan bertambah 3 langkah setiap baris, dengan total 10 baris. Panitia juga menyiapkan tangga darurat bagi penyandang disabilitas sehingga penonton cukup menempuh setengah jumlah langkah baris yang dituju.',
    content: 'Berdasarkan stimulus tersebut, total langkah untuk mencapai baris ke-8 di tribun timur (baris pertama 3 langkah, tiap baris berikutnya +4) adalah…',
    options: [
      '31 langkah.',
      '32 langkah.',
      '28 langkah.',
      '35 langkah.',
    ],
    answer: 'A',
    cognitiveLevel: 'C4',
    difficulty: 'Sulit',
  },
  {
    // Numerasi 3: bensin
    stimulus:
      'Pak Harun adalah pengemudi angkutan desa dengan rute tetap sepanjang 36 km sekali jalan. Setiap pagi ia bolak-balik rute itu dua kali untuk mengantar penumpang pertama dan kedua. Motor tangki miliknya berkapasitas 4 liter dan konsumsi bensin rata-rata 1 liter untuk setiap 12 km. Harga bensin di pom desa Rp10.000 per liter, sedangkan di SPBU kota lebih murah Rp2.000 per liter, tetapi jarak ke SPBU 9 km sekali jalan sehingga tetap memerlukan bensin untuk menuju ke sana. Pak Harun mengisi penuh tangki setiap Senin pagi di pom desa dan menghitung berapa hari anggaran Rp60.000 per pekan cukup. Ia juga mempertimbangkan pindah mengisi ke SPBU dua kali seminggu. Anaknya membuatkan catatan sederhana: total kilometer tempuh per hari dikali konsumsi, lalu dikali harga, agar bapaknya mudah membandingkan dua pilihan pengisian itu.',
    content: 'Berdasarkan stimulus, bensin yang dibutuhkan Pak Harun untuk seluruh perjalanan sehari (dua kali bolak-balik rute 36 km) adalah…',
    options: [
      '12 liter.',
      '6 liter.',
      '9 liter.',
      '15 liter.',
    ],
    answer: 'A',
    cognitiveLevel: 'C4',
    difficulty: 'Sedang',
  },
]

function rotateTkaSet(set: TkaFallbackSet, variant: number): TkaQuestionData {
  const n = set.options.length
  const s = ((variant % n) + n) % n
  const rotated = set.options.map((_, k) => set.options[(k - s + n) % n])
  const answerIdx = LETTERS.indexOf(set.answer)
  const newAnswerIdx = (answerIdx + s) % n
  const leads = ['Berdasarkan stimulus tersebut, ', 'Berdasarkan teks di atas, ', 'Berdasarkan bacaan tersebut, ']
  let content = set.content
  if (variant > 0 && !content.toLowerCase().startsWith('berdasarkan')) {
    content = leads[variant % leads.length] + content.charAt(0).toLowerCase() + content.slice(1)
  }
  return {
    stimulus: set.stimulus,
    content,
    options: rotated,
    answer: LETTERS[newAnswerIdx],
    cognitiveLevel: set.cognitiveLevel,
    difficulty: set.difficulty,
  }
}

export function fallbackTkaQuestionAt(subtest: string, index: number): TkaQuestionData {
  const isLiterasi = /literasi|bahasa/i.test(subtest || '')
  const isNumerasi = /numerasi|matematika/i.test(subtest || '')
  const pool = isLiterasi ? [0, 1, 2] : isNumerasi ? [3, 4, 5] : [0, 1, 2, 3, 4, 5]
  const setIdx = pool[index % pool.length]
  const variant = Math.floor(index / pool.length)
  return rotateTkaSet(TKA_FALLBACK_SETS[setIdx], variant)
}

export async function generateTkaQuestions(level: string, subtest: string, count: number): Promise<TkaQuestionData[]> {
  const CHUNK_SIZE = 5
  const out: TkaQuestionData[] = []

  for (let chunkStart = 0; chunkStart < count; chunkStart += CHUNK_SIZE) {
    const chunkCount = Math.min(CHUNK_SIZE, count - chunkStart)
    const theme = TKA_THEMES[(chunkStart / CHUNK_SIZE) % TKA_THEMES.length]

    const userPrompt = [
      `Buat ${chunkCount} soal standar Tes Kemampuan Akademik (TKA) Kemendikdasmen 2026 untuk jenjang ${level}, subtes ${subtest}.`,
      `Soal harus HOTS berbasis stimulus dengan tema konteks batch ini: ${theme}.`,
      `Setiap item adalah JSON object dengan spesifikasi: {"stimulus": string (120–200 kata; untuk Literasi Bahasa Indonesia: teks narasi/informasi menarik berita/tokoh/lingkungan/budaya Indonesia; untuk Numerasi/Matematika: konteks data/tabel naratif kehidupan nyata), "content": pertanyaan HOTS, "options": 4 opsi tanpa huruf, "answer": huruf kunci (A-D), "cognitiveLevel": "C4"|"C5"|"C6", "difficulty": "Sedang"|"Sulit"}.`,
      `Soal harus variatif dan tidak saling mirip. Balas HANYA JSON array.`,
    ].join('\n')

    console.log(`[tka/generate] chunk ${chunkStart}-${chunkStart + chunkCount - 1} (${chunkCount} soal) tema: ${theme} — memanggil LLM...`)
    const text = await callLLM(TKA_SYSTEM_PROMPT, userPrompt, 2)
    const parsed = text ? extractJsonArray(text) : null

    if (!parsed) {
      console.warn(`[tka/generate] chunk ${chunkStart}: LLM gagal/parse gagal → fallback template`)
    }

    for (let k = 0; k < chunkCount; k++) {
      const index = chunkStart + k
      let item: TkaQuestionData | null = null
      const raw = parsed && parsed[k] ? parsed[k] : null
      if (raw) {
        const stimulus = String(raw?.stimulus ?? '').trim()
        const content = String(raw?.content ?? '').trim()
        const options = Array.isArray(raw?.options) ? raw.options.map(stripOptionPrefix).filter((o: string) => o.length > 0) : []
        const answer = normalizeAnswerLetter(raw?.answer, 4)
        const cognitiveLevel = ['C4', 'C5', 'C6'].includes(String(raw?.cognitiveLevel)) ? String(raw.cognitiveLevel) : 'C4'
        const difficulty = ['Sedang', 'Sulit'].includes(String(raw?.difficulty)) ? String(raw.difficulty) : 'Sedang'
        if (stimulus.length >= 30 && content && options.length === 4 && answer) {
          item = { stimulus, content, options, answer, cognitiveLevel, difficulty }
        }
      }
      if (!item) {
        item = fallbackTkaQuestionAt(subtest, index)
      }
      out.push(item)
    }
    console.log(`[tka/generate] chunk ${chunkStart} selesai (total soal sejauh ini: ${out.length})`)
  }

  return out
}

// ---------- 7. buildImageAutoPrompt (heuristic fallback, subject-aware) ----------
// Fallback tanpa LLM: tetap memperhatikan mapel, jenjang, level kognitif,
// dan kata kunci visual dari soal. Klausul anti-teks ditambahkan otomatis
// oleh generateImage (withNoTextGuard), jadi tidak ditulis di sini.
const ID_STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'dengan', 'untuk', 'adalah', 'ini', 'itu', 'sebuah',
  'para', 'akan', 'telah', 'dapat', 'bisa', 'jika', 'maka', 'karena', 'agar',
  'saat', 'ada', 'tidak', 'bukan', 'juga', 'oleh', 'sebagai', 'hanya', 'sangat',
  'lebih', 'paling', 'banyak', 'semua', 'setiap', 'berikut', 'tersebut', 'gambar',
  'the', 'and', 'or', 'of', 'to', 'in', 'on', 'with', 'for', 'is', 'are', 'a', 'an',
])

function pickVisualKeywords(question: QuestionData, max = 8): string {
  const source = `${question.material || ''} ${question.content}`
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !ID_STOPWORDS.has(w))
  const unique: string[] = []
  for (const w of source) if (!unique.includes(w)) unique.push(w)
  return unique.slice(0, max).join(', ')
}

export function buildImageAutoPrompt(question: QuestionData, profile: ExamProfileData): string {
  const grade = parseInt(String(profile.grade ?? '').replace(/\D+/g, ''), 10)
  const isPrimary = !Number.isNaN(grade) && grade <= 6
  const isJunior = !Number.isNaN(grade) && grade >= 7 && grade <= 9
  const style = isPrimary
    ? 'cheerful flat vector storybook cartoon illustration for children, thick clean outlines, bright friendly colors, rounded shapes'
    : isJunior
      ? 'modern flat vector educational illustration, clean semi-detailed style, harmonious color palette'
      : 'clean flat vector illustration, professional academic style, muted professional colors'

  const subject = `${profile.subject} ${profile.level}`.toLowerCase()
  const material = (question.material || profile.topic || '').trim()
  const content = question.content.replace(/\s+/g, ' ').trim()
  const cognitive = (question.cognitiveLevel || 'C2').toUpperCase()
  const isHigherOrder = /C[4-6]/.test(cognitive)

  // Arahkan scene sesuai karakter mapel agar objek yang digambar tepat konsep
  let directive: string
  if (/ipa|sains|science|biologi|fisika|kimia/.test(subject)) {
    directive = `scientifically accurate depiction of "${material}" — organisms drawn with correct characteristic anatomy and colors, or clean everyday science objects`
  } else if (/matematika|math/.test(subject)) {
    directive = `real-world visualization of "${material}" using everyday objects and clean geometric forms (never relying on digits or equations)`
  } else if (/ips|sosial|sejarah|geografi|ekonomi|pkn|kewarganegaraan/.test(subject)) {
    directive = `realistic Indonesian everyday-life or landscape depiction of "${material}"`
  } else if (/bahasa|sastra|indonesia|inggris|english/.test(subject)) {
    directive = `clear narrative story scene of "${material}"`
  } else {
    directive = `one clear, instantly recognizable depiction of "${material}"`
  }

  const arrangement = isHigherOrder
    ? 'a two-part comparative scene with clearly separated groups so the visual contrast is readable at a glance'
    : 'one focused scene, a single main subject with a few supporting details'

  const keywords = pickVisualKeywords(question)

  return [
    `Educational illustration for a formal ${profile.level || 'school'} exam paper (${profile.subject}, grade ${profile.grade}): ${directive}.`,
    keywords ? `Key visual elements: ${keywords}.` : '',
    `Question context: "${content.slice(0, 180)}".`,
    `Composition: ${arrangement}, plain pure white background, generous margins, uncluttered, soft ground shadow, soft even lighting.`,
    `Style: ${style}.`,
    'Quality: crisp edges, correct proportions, distinct silhouettes, harmonious palette, print-ready.',
  ]
    .filter(Boolean)
    .join(' ')
}

// ---------- Prompt sanitizer: buang kata pemicu teks pada bagian deskriptif ----------
// Model gambar cenderung menuliskan teks kacau bila prompt memuat kata-kata ini.
// Klausa negatif resmi ditambahkan terpisah oleh withNoTextGuard.
const BANNED_TEXT_WORDS =
  /\b(infographics?|diagrams?|charts?|graphs?|labeled|labelled|labelling|labels?|annotated|annotations?|typography|captions?|subtitles?|letters?|numbers?|digits?|words?|texts?|textbook|writing|written|signs?|speech\s?bubbles?)\b/gi

export function sanitizeImagePrompt(prompt: string): string {
  let s = prompt.replace(/textbook/gi, 'educational')
  s = s.replace(BANNED_TEXT_WORDS, ' ')
  s = s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/\s+\./g, '.')
    .trim()
  return s
}

// ---------- 7b. composeImagePromptWithAI (art director AI 2-tahap) ----------
// LLM bekerja seperti art director profesional:
//   Tahap 1 — menganalisis soal: konsep inti, objek visual wajib (dengan detail
//             bentuk/warna/anatomi yang benar), tata letak, dan jebakan visual.
//   Tahap 2 — menyusun prompt akhir yang setia pada analisis, bukan sekadar
//             menyalin kalimat soal.
// Hasil disanitasi dari kata pemicu teks, lalu guard anti-teks ditambah otomatis.
export async function composeImagePromptWithAI(
  question: QuestionData,
  profile: ExamProfileData
): Promise<string> {
  const system = [
    'You are a senior art director and visual-pedagogy expert who designs illustrations for Indonesian school exam papers (Kurikulum Merdeka).',
    'TASK: read the exam question below and design ONE single-scene illustration that genuinely helps students answer it. Work in two steps, then output a single JSON object.',
    'STEP 1 - analyze and fill these JSON fields:',
    '  "coreConcept": one sentence stating exactly what concept or skill the question tests.',
    '  "objects": 2-6 concrete visual objects that MUST appear; each {"name":"...","visual":"precise English description with correct shape, size, color and details","reason":"why it matters for this question"}.',
    '  "layout": how the objects are arranged (zones, grouping, foreground/background, relative sizes).',
    '  "pitfalls": 1-4 concrete mistakes a careless illustrator could make here.',
    'STEP 2 - write "prompt": one English paragraph of 80-150 words for an image model that faithfully renders your analysis:',
    '  - Open with the illustration type, then describe the full scene using every object from "objects" with its visual details, correct proportions, and distinct colors/silhouettes.',
    '  - Include the arrangement from "layout", the setting, soft even lighting, and a style matched to grade: grade 1-6 = cheerful flat vector storybook cartoon, rounded shapes, bright friendly colors; grade 7-9 = modern flat vector illustration, moderate detail; grade 10-12 = clean flat vector illustration, muted professional colors.',
    '  - Use Indonesian school context where natural (tropical plants, everyday Indonesian objects, modest diverse characters). No violence, no religion, no politics.',
    '  - Keep it purely pictorial. NEVER use the words infographic, diagram, chart, graph, labeled, annotated, typography, caption, text, letters, numbers, words, or any mention of written elements.',
    '  - Do NOT add negative instructions such as "no text" - the system appends them automatically.',
    'ACCURACY RULES:',
    '  - Classification questions (living/non-living, grouping): choose unmistakable examples of each category and place them in clearly separated zones.',
    '  - Science: draw plants, animals, body parts and objects with correct characteristic anatomy and colors.',
    '  - Math: illustrate with real-world objects or clean geometric forms; never rely on written digits or equations.',
    '  - Social studies: landscapes, plain-colored maps without labels, famous Indonesian landmarks.',
    '  - Abstract topics (text genres, concept names): invent one concrete everyday scene that symbolizes the idea (e.g. a student explaining a process using real objects), and never show the topic name as lettering, on signs, covers, or anywhere in the scene.',
    'OUTPUT: ONLY valid JSON (no markdown), schema: {"coreConcept":"...","objects":[{"name":"...","visual":"...","reason":"..."}],"layout":"...","pitfalls":["..."],"prompt":"..."}',
  ].join('\n')

  const user = [
    `Subject: ${profile.subject}`,
    `Grade: ${profile.grade} (${profile.level || 'school'})`,
    `Topic/Material: ${question.material || profile.topic}`,
    `Cognitive level: ${question.cognitiveLevel} (${question.difficulty})`,
    `Learning indicator: ${question.indicator || '-'}`,
    `Question: ${question.content.slice(0, 500)}`,
    question.options.length > 0 ? `Answer options: ${question.options.slice(0, 6).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await callLLM(system, user, 1)
  if (raw) {
    const obj = extractJsonObject(raw)
    const prompt = typeof obj?.prompt === 'string' ? obj.prompt.trim() : ''
    if (prompt.length >= 40) return sanitizeImagePrompt(prompt)
    // Fallback: LLM balas teks polos berisi prompt
    const plain = raw.trim().replace(/^```(?:json)?|```$/g, '').trim()
    if (plain.length >= 40 && plain.length <= 1200 && !plain.startsWith('{')) {
      return sanitizeImagePrompt(plain)
    }
  }
  // Fallback terakhir: heuristic builder subject-aware
  return buildImageAutoPrompt(question, profile)
}

// ---------- 7b-2. expandCustomImagePrompt: perkaya instruksi singkat guru ----------
// Instruksi guru yang pendek (mis. "ilustrasi siklus air") diterjemahkan dan
// diperkaya AI menjadi prompt penuh agar kualitasnya setara mode otomatis.
export async function expandCustomImagePrompt(
  directive: string,
  question: QuestionData,
  profile: ExamProfileData
): Promise<string> {
  const system = [
    "You enrich a teacher's short illustration instruction into a vivid English image-generation prompt for an Indonesian school exam paper.",
    "Preserve the teacher's intent exactly; add concrete visual details (objects with shapes/colors, setting, composition) that serve that intent and match the question context.",
    'Style matched to grade: grade 1-6 cheerful flat storybook cartoon; grade 7-9 modern flat vector illustration; grade 10-12 clean flat vector professional. Soft lighting, plain white background.',
    'Purely pictorial only: never mention text, letters, numbers, labels, captions, typography, charts or diagrams. Do NOT add negative clauses like "no text".',
    'Output ONLY JSON: {"prompt":"..."} with one English paragraph of 60-120 words.',
  ].join('\n')

  const user = [
    `Teacher directive: ${directive}`,
    `Subject: ${profile.subject} | Grade: ${profile.grade} (${profile.level || 'school'})`,
    `Material: ${question.material || profile.topic}`,
    `Question: ${question.content.slice(0, 300)}`,
  ].join('\n')

  const raw = await callLLM(system, user, 1)
  if (raw) {
    const obj = extractJsonObject(raw)
    const prompt = typeof obj?.prompt === 'string' ? obj.prompt.trim() : ''
    if (prompt.length >= 40) return sanitizeImagePrompt(prompt)
    const plain = raw.trim().replace(/^```(?:json)?|```$/g, '').trim()
    if (plain.length >= 40 && plain.length <= 1200 && !plain.startsWith('{')) {
      return sanitizeImagePrompt(plain)
    }
  }
  return directive
}

// ---------- 7c. QA otomatis via VLM: kritik gambar secara menyeluruh ----------
// Bukan hanya mendeteksi teks — VLM juga menilai relevansi konsep dan kualitas
// visual, lalu masalahnya dipakai untuk memperbaiki prompt dan regenerasi.
interface ImageCritique {
  hasText: boolean
  relevant: boolean
  score: number // 1-10
  issues: string[]
}

async function critiqueGeneratedImage(b64: string, brief: string): Promise<ImageCritique | null> {
  try {
    const zai = await getZAI()
    const body = {
      messages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: [
                'You are a strict QA reviewer of educational exam illustrations.',
                'Intended illustration brief:',
                brief,
                '',
                'Inspect the generated image and evaluate:',
                '1. hasText: does it contain ANY visible text (letters, numbers, words, captions, labels, characters of any language including Chinese)? true/false.',
                '2. relevant: does it clearly depict the intended subject and key objects from the brief (not a generic or unrelated picture)? true/false.',
                '3. score: 1-10 suitability for a formal school exam paper, judging object accuracy, visual clarity, appropriate style, and cleanliness. 10 = perfect.',
                '4. issues: array of short English strings naming concrete visual problems (empty array if flawless).',
                'Answer ONLY JSON: {"hasText":true,"relevant":true,"score":7,"issues":["..."]}',
              ].join('\n'),
            },
            { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
      thinking: { type: 'disabled' as const },
    }
    const completion = await zai.chat.completions.createVision(
      body as unknown as Parameters<typeof zai.chat.completions.createVision>[0]
    )
    const raw = completion?.choices?.[0]?.message?.content
    const text =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.map((p: any) => p?.text ?? '').join('')
          : ''
    const obj = extractJsonObject(text)
    if (!obj) return null
    const score = Number(obj.score)
    return {
      hasText: obj.hasText === true || /hasText"\s*:\s*true/i.test(text),
      relevant: obj.relevant !== false && !/"relevant"\s*:\s*false/i.test(text),
      score: Number.isFinite(score) && score > 0 ? Math.min(10, score) : 5,
      issues: Array.isArray(obj.issues)
        ? obj.issues.filter((i) => typeof i === 'string' && i.trim()).slice(0, 6)
        : [],
    }
  } catch (err) {
    console.warn('[imageQA] kritik VLM gagal, lewati:', err)
    return null // jangan blokir alur bila QA gagal
  }
}

// ---------- 7c-2. refinePromptWithFeedback: perbaiki prompt dari kritik VLM ----------
async function refinePromptWithFeedback(
  basePrompt: string,
  issues: string[],
  attempt: number
): Promise<string> {
  try {
    const system = [
      'You are an art director fixing an image-generation prompt after QA feedback on the rendered picture.',
      'Keep every positive element of the original prompt (subject, objects, style, composition) and rewrite it so the listed problems cannot recur.',
      'Be concrete: strengthen object descriptions, clarify placement and proportions, and simplify anything that previously caused confusion.',
      'Purely pictorial only: never mention text, letters, numbers, labels, captions, typography, charts or diagrams; do NOT add negative clauses like "no text".',
      'Output ONLY JSON: {"prompt":"..."} with one English paragraph of 80-150 words.',
    ].join('\n')
    const user = [
      `Original prompt: ${basePrompt}`,
      `QA problems to fix: ${issues.map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
      attempt > 0
        ? 'This is a second fix round - make the corrections more decisive (change object choices or layout if needed).'
        : '',
    ]
      .filter(Boolean)
      .join('\n')
    const raw = await callLLM(system, user, 1)
    if (raw) {
      const obj = extractJsonObject(raw)
      const prompt = typeof obj?.prompt === 'string' ? obj.prompt.trim() : ''
      if (prompt.length >= 40) return sanitizeImagePrompt(prompt)
    }
  } catch (err) {
    console.warn('[imageQA] refine prompt gagal, pakai koreksi sederhana:', err)
  }
  return sanitizeImagePrompt(
    `${basePrompt} Important corrections: fix these problems seen in the previous render - ${issues.join('; ')}.`
  )
}

// ---------- 7d. Background image job runner ----------
// Pembuatan gambar butuh 60-180 detik (compose + render + QA); gateway akan
// memutus request HTTP yang terlalu lama (502). Karena itu pekerjaan berjalan
// di background dan statusnya disimpan di DB (Question.imageStatus) agar
// frontend bisa polling.
const runningImageJobs = new Map<string, Promise<void>>()

// Variasi render untuk menghindari hasil yang identik saat regenerasi
const RETRY_VARIATIONS = [
  '',
  ' Render with a slightly different object arrangement and camera angle while keeping the same subject, meaning, and style.',
  ' Alternative visual interpretation: adjust object placement, poses and small details to resolve the reported problems while keeping the same subject and style.',
]

function buildCritiqueBrief(prompt: string, question: QuestionData): string {
  return [
    `- Prompt: ${prompt.slice(0, 350)}`,
    `- Material: ${question.material || '-'}`,
    `- Question: ${question.content.replace(/\s+/g, ' ').slice(0, 220)}`,
  ].join('\n')
}

// Prompt warisan dari pipeline lama (sebelum peningkatan kecerdasan) — ditandai
// frasa khas builder lama. Prompt basi seperti ini diabaikan agar soal selalu
// mendapat komposisi baru dari art director AI.
function isLegacyAutoPrompt(p: string): boolean {
  return /Educational textbook illustration|MUST NOT contain|Subject matter:/i.test(p)
}

async function runImageJob(questionId: string, customPrompt: string | null): Promise<void> {
  try {
    const row = await db.question.findUnique({
      where: { id: questionId },
      include: { structure: { include: { profile: true } } },
    })
    if (!row) throw new Error('Soal tidak ditemukan')

    const profile: ExamProfileData = { ...row.structure.profile }
    const question = parseQuestionRow(row)

    // Fase 1 — susun prompt
    // Mode otomatis: art director AI menganalisis soal lalu menyusun prompt.
    // Mode custom: instruksi guru pendek diperkaya AI; instruksi panjang dipakai
    // apa adanya. Prompt basi warisan pipeline lama diabaikan agar selalu ada
    // komposisi segar.
    await db.question.update({
      where: { id: questionId },
      data: { imageStatus: 'composing', imageError: null },
    })
    const effectiveCustom = customPrompt && !isLegacyAutoPrompt(customPrompt) ? customPrompt : null
    let basePrompt: string
    if (effectiveCustom) {
      basePrompt =
        effectiveCustom.length >= 150
          ? effectiveCustom
          : await expandCustomImagePrompt(effectiveCustom, question, profile)
    } else {
      basePrompt = await composeImagePromptWithAI(question, profile)
    }

    // Fase 2 — render + kritik VLM + perbaikan mandiri (maks 3 render).
    // Setiap gambar dinilai VLM: teks asing, relevansi konsep, kualitas visual.
    // Bila belum memenuhi standar, prompt diperbaiki dari daftar masalah lalu
    // dirender ulang. Hasil terbaik selalu disimpan — guru tidak pernah tanpa gambar.
    await db.question.update({
      where: { id: questionId },
      data: { imageStatus: 'rendering', imagePrompt: basePrompt },
    })

    let accepted: { b64: string; usedPrompt: string } | null = null
    let best: { b64: string; usedPrompt: string; score: number } | null = null
    let workingPrompt = basePrompt

    for (let attempt = 0; attempt < 3; attempt++) {
      const b64 = await generateImage(workingPrompt + RETRY_VARIATIONS[attempt], '1152x864')
      const critique = await critiqueGeneratedImage(b64, buildCritiqueBrief(basePrompt, question))

      // QA tidak tersedia → terima gambar ini (perilaku aman seperti sebelumnya)
      if (!critique) {
        accepted = { b64, usedPrompt: workingPrompt }
        break
      }

      // Seleksi "terbaik" memakai skor terkoreksi: gambar berteks dihukum berat
      // (teks kacau adalah cacat paling merusak naskah ujian), gambar yang tak
      // relevan dengan konsep soal juga dihukum.
      const adjusted =
        critique.score - (critique.hasText ? 3 : 0) - (critique.relevant ? 0 : 2)
      if (!best || adjusted > best.score) {
        best = { b64, usedPrompt: workingPrompt, score: adjusted }
      }

      const ok = !critique.hasText && critique.relevant && critique.score >= 7
      console.log(
        `[imageJob] soal ${questionId} render ${attempt + 1}: score=${critique.score}/10 adjusted=${adjusted} hasText=${critique.hasText} relevant=${critique.relevant} issues=${critique.issues.join(' | ') || '-'}`
      )
      if (ok) {
        accepted = { b64, usedPrompt: workingPrompt }
        break
      }
      if (attempt < 2) {
        const issues =
          critique.issues.length > 0
            ? critique.issues
            : ['the illustration does not match the question topic clearly enough']
        workingPrompt = await refinePromptWithFeedback(basePrompt, issues, attempt)
      }
    }

    const finalImage = accepted ?? best
    if (!finalImage) throw new Error('Semua percobaan render gagal')

    const buffer = Buffer.from(finalImage.b64, 'base64')
    const dir = path.join(process.cwd(), 'public', 'generated')
    await fsp.mkdir(dir, { recursive: true })
    const filename = `${questionId}-${Date.now()}.png`
    await fsp.writeFile(path.join(dir, filename), buffer)

    // Hapus file lama setelah file baru berhasil ditulis
    if (row.imagePath) {
      try {
        await fsp.rm(path.join(process.cwd(), 'public', row.imagePath))
      } catch {
        // abaikan jika file lama sudah tidak ada
      }
    }

    await db.question.update({
      where: { id: questionId },
      data: {
        imagePrompt: finalImage.usedPrompt,
        imagePath: `/generated/${filename}`,
        imageStatus: 'done',
        imageError: null,
      },
    })
    console.log(`[imageJob] soal ${questionId} selesai — /generated/${filename}`)
  } catch (err: any) {
    const message = String(err?.message ?? err)
    console.error(`[imageJob] soal ${questionId} gagal:`, message)
    try {
      await db.question.update({
        where: { id: questionId },
        data: { imageStatus: 'error', imageError: message.slice(0, 500) },
      })
    } catch (dbErr) {
      console.error('[imageJob] gagal menyimpan status error:', dbErr)
    }
  }
}

export function startImageJob(questionId: string, customPrompt: string | null): 'started' | 'already-running' {
  if (runningImageJobs.has(questionId)) return 'already-running'
  const task = runImageJob(questionId, customPrompt)
    .catch(() => {}) // error sudah dicatat di DB oleh runImageJob
    .finally(() => runningImageJobs.delete(questionId))
  runningImageJobs.set(questionId, task)
  return 'started'
}

export function isImageJobRunning(questionId: string): boolean {
  return runningImageJobs.has(questionId)
}

export async function getImageJobState(questionId: string): Promise<QuestionData | null> {
  const row = await db.question.findUnique({ where: { id: questionId } })
  if (!row) return null
  return parseQuestionRow(row)
}

// ---------- Row parsers (Prisma -> Data types) ----------
export function parseStructureRow(row: {
  id: string
  profileId: string
  label: string
  questionType: string
  optionCount: number
  includeImages: boolean
  easyCount: number
  mediumCount: number
  hardCount: number
  total: number
  cognitiveLevels: string
  customInstruction: string | null
}): StructureData {
  let cognitiveLevels: string[] = []
  try {
    const parsed = JSON.parse(row.cognitiveLevels)
    if (Array.isArray(parsed)) cognitiveLevels = parsed.map(String)
  } catch {
    cognitiveLevels = []
  }
  return { ...row, cognitiveLevels }
}

export function parseQuestionRow(row: {
  id: string
  structureId: string
  number: number
  type: string
  difficulty: string
  cognitiveLevel: string
  content: string
  options: string
  answer: string
  indicator: string
  material: string
  source: string
  scoreWeight: number
  imagePrompt: string | null
  imagePath: string | null
  imageStatus?: string
  imageError?: string | null
}): QuestionData {
  let options: string[] = []
  try {
    const parsed = JSON.parse(row.options)
    if (Array.isArray(parsed)) options = parsed.map(String)
  } catch {
    options = []
  }
  return {
    ...row,
    options,
    imageStatus: row.imageStatus ?? (row.imagePath ? 'done' : 'idle'),
    imageError: row.imageError ?? null,
  }
}

export function parseTkaSimulationRow(row: {
  id: string
  level: string
  subtest: string
  mode: string
  totalQuestions: number
  data: string
  createdAt: Date
}): TkaSimulationData {
  let questions: TkaQuestionData[] = []
  try {
    const parsed = JSON.parse(row.data)
    if (Array.isArray(parsed)) questions = parsed
  } catch {
    questions = []
  }
  return {
    id: row.id,
    level: row.level,
    subtest: row.subtest,
    mode: row.mode,
    totalQuestions: row.totalQuestions,
    questions,
    createdAt: row.createdAt?.toISOString(),
  }
}
