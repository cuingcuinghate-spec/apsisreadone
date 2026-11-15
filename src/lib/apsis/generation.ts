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

// ---------- Image generation dengan retry otomatis saat error auth (401) ----------
export async function generateImage(prompt: string, size = '1024x1024'): Promise<string> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const zai = await getZAI()
      const res = await zai.images.generations.create({ prompt, size })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error('Image generation returned no data')
      return b64
    } catch (err: any) {
      lastError = err
      const msg = String(err?.message ?? err)
      const isAuthError = /status 401|missing x-token|unauthorized|forbidden/i.test(msg)
      const isTransient = /status 4[02]9|status 5\d\d|timeout|econn|network|fetch failed/i.test(msg)
      if ((isAuthError || isTransient) && attempt < 2) {
        if (isAuthError) {
          // Token mungkin sudah dirotasi — paksa baca ulang config lalu coba lagi
          console.warn('[generateImage] auth error, refreshing ZAI config and retrying...')
          resetZAICache()
        } else {
          console.warn(`[generateImage] transient error (attempt ${attempt + 1}), retrying...`)
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
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

// ---------- 7. buildImageAutoPrompt ----------
export function buildImageAutoPrompt(question: QuestionData, profile: ExamProfileData): string {
  return `Ilustrasi kartun pendidikan anak-anak untuk soal ${profile.subject} kelas ${profile.grade}: "${question.content.slice(0, 120)}". Gaya flat design cartoon ceria, warna cerah, tanpa teks dan tanpa angka, latar putih bersih.`
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
}): QuestionData {
  let options: string[] = []
  try {
    const parsed = JSON.parse(row.options)
    if (Array.isArray(parsed)) options = parsed.map(String)
  } catch {
    options = []
  }
  return { ...row, options }
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
