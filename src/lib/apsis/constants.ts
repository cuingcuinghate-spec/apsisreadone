// ============ Konstanta & opsi kurikulum APSIS ============

export const JENJANG_OPTIONS = [
  'SD/MI',
  'SMP/MTs',
  'SMA/MA',
  'SMK/Kejuruan',
  'SMPLB',
  'SMALB',
] as const

export const FASE_BY_JENJANG: Record<string, string[]> = {
  'SD/MI': ['Fase A', 'Fase B', 'Fase C'],
  'SMP/MTs': ['Fase D'],
  'SMA/MA': ['Fase E', 'Fase F'],
  'SMK/Kejuruan': ['Fase E', 'Fase F'],
  SMPLB: ['Fase A', 'Fase B', 'Fase C'],
  SMALB: ['Fase A', 'Fase B', 'Fase C'],
}

export const KELAS_BY_FASE: Record<string, string[]> = {
  'Fase A': ['Kelas 1', 'Kelas 2'],
  'Fase B': ['Kelas 3', 'Kelas 4'],
  'Fase C': ['Kelas 5', 'Kelas 6'],
  'Fase D': ['Kelas 7', 'Kelas 8', 'Kelas 9'],
  'Fase E': ['Kelas 10'],
  'Fase F': ['Kelas 11', 'Kelas 12'],
}

export const QUESTION_TYPES = [
  'Pilihan Ganda',
  'Pilihan Ganda Kompleks',
  'Benar/Salah',
  'Isian Singkat',
  'Uraian',
] as const

export const OPTION_SEGMENTS = [
  { label: 'ABC', count: 3 },
  { label: 'ABCD', count: 4 },
  { label: 'ABCDE', count: 5 },
] as const

export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export const COGNITIVE_DIMENSIONS = [
  {
    group: 'LOTS (LOWER ORDER)',
    items: [
      { code: 'C1', label: 'Mengingat' },
      { code: 'C2', label: 'Memahami' },
      { code: 'C3', label: 'Menerapkan' },
    ],
  },
  {
    group: 'HOTS (HIGHER ORDER)',
    items: [
      { code: 'C4', label: 'Menganalisis' },
      { code: 'C5', label: 'Mengevaluasi' },
      { code: 'C6', label: 'Mencipta' },
    ],
  },
] as const

export const CUSTOM_INSTRUCTION_EXAMPLES = [
  'Bahasa Inggris — tulis soal dalam bahasa Inggris yang baku.',
  'Bahasa Arab — gunakan kosakata dasar dan harakat.',
  'PAI — sertakan kutipan ayat/hadits pendek yang relevan.',
  'Gaya penulisan — buat soal naratif kontekstual sehari-hari.',
  'Format — gunakan stimulus pendek sebelum pertanyaan.',
] as const

// ============ Data demo modul analisis ============

export const DEMO_CONFIG_ID = 'main'

// Teks soal demo (untuk detail butir pada analisis CTT)
export const DEMO_QUESTION_TEXTS = [
  'Hasil dari 3 + 2 adalah…',
  'Di dalam sebuah kotak ada 4 bola merah dan 3 bola biru. Berapa jumlah bola semuanya?',
  'Ibu memiliki 8 mangga, lalu diberikan 5 buah kepada tetangga. Sisa mangga Ibu adalah…',
  'Hasil dari 10 − 4 adalah…',
  'Terdapat 9 jeruk dalam keranjang, ditambah 6 jeruk lagi. Jumlah jeruk sekarang adalah…',
  'Hasil dari 12 − 7 adalah…',
  'Ani membeli 6 pensil, kemudian membeli 9 pensil lagi. Jumlah pensil Ani sekarang adalah…',
  'Hasil dari 20 − 13 adalah…',
  'Berpakah hasil dari 4 + 4?',
  'Berpakah hasil dari 0 + 6?',
  'Hasil dari 15 − 8 adalah…',
  'Ada 7 kucing di halaman, datang lagi 5 kucing. Jumlah kucing sekarang adalah…',
  'Hasil dari 18 − 9 adalah…',
  'Hasil dari 5 + 5 + 5 adalah…',
  'Berpakah hasil dari 9 − 0?',
  'Hasil dari 11 + 4 adalah…',
  'Ada 12 buku di rak, dipinjam 6 buku. Sisa buku di rak adalah…',
  'Hasil dari 6 + 7 adalah…',
  'Hasil dari 14 − 6 adalah…',
  'Berpakah hasil dari 8 + 8?',
]

export const DEMO_MATERIALS = [
  'Penjumlahan Dasar',
  'Penjumlahan Kontekstual',
  'Pengurangan Kontekstual',
  'Pengurangan Dasar',
  'Penjumlahan Bersusun',
  'Pengurangan Bersusun',
  'Penjumlahan Lanjutan',
  'Pengurangan Dua Digit',
  'Penjumlahan Bilangan Sama',
  'Identitas Penjumlahan',
  'Pengurangan Lanjutan',
  'Penjumlahan Kontekstual',
  'Pengurangan Dua Digit',
  'Penjumlahan Berulang',
  'Identitas Pengurangan',
  'Penjumlahan Dua Digit',
  'Pengurangan Kontekstual',
  'Penjumlahan Menyimpan',
  'Pengurangan Menyimpan',
  'Penjumlahan Bilangan Sama',
]

export const DEMO_TKA_LEVELS = [
  'SD/MI Sederajat',
  'SMP/MTs Sederajat',
  'SMA/MA/SMK Sederajat',
] as const

export const DEMO_TKA_SUBTESTS = [
  'Literasi Bahasa Indonesia',
  'Numerasi/Matematika',
] as const

export const TKA_MODES = [
  { id: 'standar', label: 'Standar Resmi', count: 30, desc: 'Sesuai standar resmi Kemendikdasmen' },
  { id: 'latihan', label: 'Latihan', count: 10, desc: 'Paket latihan terukur' },
  { id: 'drill', label: 'Mini Drill', count: 5, desc: 'Asah cepat sebelum ujian' },
] as const

export const SCHOOL_YEAR = '2026/2027'

export const APP_FOOTER_TEXT =
  '© 2026 APSIS. Hak Cipta Dilindungi Undang-Undang. | Version 1.0 (Stable)'

export function difficultyLabelOf(p: number): 'Mudah' | 'Sedang' | 'Sulit' {
  if (p > 0.7) return 'Mudah'
  if (p >= 0.3) return 'Sedang'
  return 'Sulit'
}
