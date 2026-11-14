// ============ Seed dataset demo analisis CTT/KKTP (deterministik) ============
// Jalankan: bun prisma/seed.ts
//
// Menghasilkan 35 siswa x 10 soal yang di-rekayasa agar:
// - mean 6.43/10, min skor 30, max 100, 19 tuntas / 16 remedial (KKM 70)
// - KR-20 ~0.57, item 1 Buang (D~0.11), item 9 Revisi (D~0.22), 8 lainnya Pertahankan
// - TP1 (soal 1-5) 71.4%, TP2 (soal 6-10) 57.1%

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---- Konstanta dataset ----
const N = 35
const TOTAL = 10
const OPTION_COUNT = 3
const CONFIG_ID = 'main'
const KKM = 70
const LETTERS = ['A', 'B', 'C']

const KEY_ANSWERS = ['B', 'A', 'B', 'B', 'B', 'C', 'B', 'A', 'B', 'C']

// Target total benar per id siswa (id = peringkat; id 1 tertinggi)
const TARGET_CORRECT = [
  10,
  9, 9, 9, 9, 9,
  8, 8, 8, 8, 8, 8, 8, 8, 8,
  7, 7, 7, 7,
  6, 6, 6,
  5,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  3,
]

// Jumlah benar per butir (kolom)
const C_J = [34, 23, 26, 22, 20, 16, 16, 18, 29, 21]
const W_J = C_J.map((c) => N - c)

// Alokasi salah per butir ke tier [atas (id 1-9), tengah (id 10-26), bawah (id 27-35)]
const TIER_ALLOC: Array<[number, number, number]> = [
  [0, 0, 1],
  [0, 7, 5],
  [1, 2, 6],
  [1, 5, 7],
  [1, 6, 8],
  [2, 10, 7],
  [2, 9, 8],
  [2, 9, 6],
  [0, 4, 2],
  [2, 7, 5],
]

const TIERS: number[][] = [
  Array.from({ length: 9 }, (_, i) => i + 1),
  Array.from({ length: 17 }, (_, i) => i + 10),
  Array.from({ length: 9 }, (_, i) => i + 27),
]

const NAMES = [
  'Vino Bastian',
  'Intan Permata',
  'Kirana Wulandari',
  'Naufal Akbar',
  'Umi Kalsum',
  'Lutfi Hakim',
  'Joko Susilo',
  'Cinta Ayu Kusuma',
  'Siti Nurhaliza',
  'Putri Ayu Lestari',
  'Aisyah Ramadhani',
  'Ahmad Fauzan',
  'Bagas Saputra',
  'Dewi Angraini',
  'Rizky Pratama',
  'Nadia Salsabila',
  'Fajar Nugroho',
  'Mega Utami',
  'Hendra Wijaya',
  'Larasati Ningrum',
  'Bayu Setiawan',
  'Rahma Fadhila',
  'Doni Saputra',
  'Wulan Cahyani',
  'Arif Rahman',
  'Sekar Melati',
  'Teguh Santoso',
  'Mira Handayani',
  'Yusuf Maulana',
  'Anggun Puspita',
  'Reza Fahlevi',
  'Tiara Ayu',
  'Galih Perkasa',
  'Nita Amalia',
  'Farhan Ramadhan',
]

const TOPICS = [
  { label: 'Tujuan Pembelajaran 1', materi: 'Penjumlahan dan Pengurangan sampai 20', from: 1, to: 5 },
  { label: 'Tujuan Pembelajaran 2', materi: 'Operasi Hitung Lanjutan & Perbandingan', from: 6, to: 10 },
]

// ---- PRNG deterministik (mulberry32) ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function targetWrongOf(id: number): number {
  return TOTAL - TARGET_CORRECT[id - 1]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

type Grid = boolean[][] // wrong[soalIndex][idSiswa]

/**
 * Satu percobaan alokasi sel salah untuk seed tertentu.
 * Mengembalikan grid salah/bernar yang tervalidasi, atau null jika gagal.
 */
function attempt(seed: number): Grid | null {
  const rand = mulberry32(seed)
  const wrong: Grid = Array.from({ length: TOTAL }, () => Array<boolean>(N + 1).fill(false))
  const assignedWrong = new Array<number>(N + 1).fill(0)

  // 1. Greedy: prioritas siswa dengan sisa kebutuhan salah terbesar (tie-break acak)
  for (let j = 0; j < TOTAL; j++) {
    for (let t = 0; t < TIERS.length; t++) {
      const need = TIER_ALLOC[j][t]
      if (need <= 0) continue
      const candidates = TIERS[t]
        .map((id) => ({ id, remaining: targetWrongOf(id) - assignedWrong[id], jitter: rand() }))
        .sort((a, b) => b.remaining - a.remaining || a.jitter - b.jitter)
      if (candidates.length < need) return null
      for (let x = 0; x < need; x++) {
        wrong[j][candidates[x].id] = true
        assignedWrong[candidates[x].id]++
      }
    }
  }

  // 2. Perbaikan: tukar sel salah <-> benar antara siswa lebih & kurang di tier yang sama
  for (let iter = 0; iter < 300; iter++) {
    let excessId = 0
    let deficitId = 0
    for (const tier of TIERS) {
      const excess = tier.find((id) => assignedWrong[id] > targetWrongOf(id))
      const deficit = tier.find((id) => assignedWrong[id] < targetWrongOf(id))
      if (excess !== undefined && deficit !== undefined) {
        excessId = excess
        deficitId = deficit
        break
      }
    }
    if (excessId === 0) break
    let swapped = false
    for (let j = 0; j < TOTAL; j++) {
      if (wrong[j][excessId] && !wrong[j][deficitId]) {
        wrong[j][excessId] = false
        wrong[j][deficitId] = true
        assignedWrong[excessId]--
        assignedWrong[deficitId]++
        swapped = true
        break
      }
    }
    if (!swapped) break // macet -> seed berikutnya
  }

  // 3. Verifikasi seluruh baris (per siswa) & kolom (per butir)
  for (let id = 1; id <= N; id++) {
    if (assignedWrong[id] !== targetWrongOf(id)) return null
  }
  for (let j = 0; j < TOTAL; j++) {
    let columnWrong = 0
    for (let id = 1; id <= N; id++) if (wrong[j][id]) columnWrong++
    if (columnWrong !== W_J[j]) return null
  }
  return wrong
}

/** Isi huruf: sel benar -> kunci, sel salah -> huruf pengecoh acak non-kunci. */
function buildLetters(grid: Grid, seed: number): { answersById: Map<number, string[]>; item1WrongId: number } {
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const options = LETTERS.slice(0, OPTION_COUNT)
  const answersById = new Map<number, string[]>()
  let item1WrongId = 0
  for (let id = 1; id <= N; id++) {
    if (grid[0][id]) item1WrongId = id
  }

  for (let id = 1; id <= N; id++) {
    const row: string[] = []
    for (let j = 0; j < TOTAL; j++) {
      if (!grid[j][id]) {
        row.push(KEY_ANSWERS[j])
        continue
      }
      if (j === 0) {
        // Satu-satunya sel salah butir 1 dipaksa 'C' (Opsi C: 1 siswa, Opsi A: 0%)
        row.push('C')
        continue
      }
      const nonKey = options.filter((letter) => letter !== KEY_ANSWERS[j])
      row.push(nonKey[Math.floor(rand() * nonKey.length)])
    }
    answersById.set(id, row)
  }
  return { answersById, item1WrongId }
}

function shuffleNames(rand: () => number): string[] {
  const arr = [...NAMES]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function main() {
  // Cari seed yang valid (maks 200 percobaan)
  let usedSeed = 0
  let grid: Grid | null = null
  for (let seed = 2026; seed < 2026 + 200; seed++) {
    grid = attempt(seed)
    if (grid) {
      usedSeed = seed
      break
    }
  }
  if (!grid) {
    throw new Error('Tidak ada seed valid dalam 200 percobaan')
  }

  const { answersById, item1WrongId } = buildLetters(grid, usedSeed)
  const names = shuffleNames(mulberry32((usedSeed ^ 0x51ed270b) >>> 0))

  const studentRows = Array.from({ length: N }, (_, i) => ({
    id: i + 1,
    name: names[i],
    answers: JSON.stringify(answersById.get(i + 1)),
  }))

  await db.analysisConfig.upsert({
    where: { id: CONFIG_ID },
    update: {
      totalQuestions: TOTAL,
      optionCount: OPTION_COUNT,
      kkm: KKM,
      keyAnswers: JSON.stringify(KEY_ANSWERS),
      topics: JSON.stringify(TOPICS),
    },
    create: {
      id: CONFIG_ID,
      totalQuestions: TOTAL,
      optionCount: OPTION_COUNT,
      kkm: KKM,
      keyAnswers: JSON.stringify(KEY_ANSWERS),
      topics: JSON.stringify(TOPICS),
    },
  })

  await db.$transaction([db.analysisStudent.deleteMany(), db.analysisStudent.createMany({ data: studentRows })])

  // ---- Ringkasan verifikasi ----
  const rows = studentRows.map((row) => {
    const answers = answersById.get(row.id) ?? []
    const wrongCount = answers.filter((answer, j) => answer !== KEY_ANSWERS[j]).length
    return {
      id: row.id,
      name: row.name,
      targetCorrect: TARGET_CORRECT[row.id - 1],
      correctCount: TOTAL - wrongCount,
      wrongCount,
      rowMatch: wrongCount === targetWrongOf(row.id),
    }
  })

  const columns = Array.from({ length: TOTAL }, (_, j) => {
    const wrongTop = TIERS[0].filter((id) => answersById.get(id)?.[j] !== KEY_ANSWERS[j]).length
    const wrongMiddle = TIERS[1].filter((id) => answersById.get(id)?.[j] !== KEY_ANSWERS[j]).length
    const wrongBottom = TIERS[2].filter((id) => answersById.get(id)?.[j] !== KEY_ANSWERS[j]).length
    const columnWrong = wrongTop + wrongMiddle + wrongBottom
    return {
      item: j + 1,
      key: KEY_ANSWERS[j],
      correctCount: N - columnWrong,
      wrongCount: columnWrong,
      targetWrong: W_J[j],
      tierWrong: [wrongTop, wrongMiddle, wrongBottom],
      dEstimate: round2((wrongBottom - wrongTop) / 9),
      columnMatch: columnWrong === W_J[j],
    }
  })

  const totalCorrect = rows.reduce((acc, row) => acc + row.correctCount, 0)
  const summary = {
    usedSeed,
    config: { totalQuestions: TOTAL, optionCount: OPTION_COUNT, kkm: KKM, keyAnswers: KEY_ANSWERS, topics: TOPICS },
    students: N,
    totalCorrect,
    meanCorrect: round2(totalCorrect / N),
    item1WrongStudentId: item1WrongId,
    item1WrongLetter: answersById.get(item1WrongId)?.[0] ?? null,
    allRowsMatch: rows.every((row) => row.rowMatch),
    allColumnsMatch: columns.every((column) => column.columnMatch),
    rows,
    columns,
  }
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await db.$disconnect()
    process.exit(1)
  })
