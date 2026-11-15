// GET /api/export/csv?type=kunci|butir|nilai|template
// Ekspor CSV (dengan BOM UTF-8) untuk kunci jawaban, analisis butir CTT,
// analisis nilai KKTP, dan template import jawaban siswa.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getLatestExam, toCsv, answerTextOf } from '@/lib/apsis/export'
import { getAnalysisData } from '@/lib/apsis/analysis-server'
import { computeCtt, computeKktp } from '@/lib/apsis/analysis'
import { LETTERS } from '@/lib/apsis/constants'

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type')

  // ---- Kunci jawaban paket soal ----
  if (type === 'kunci') {
    const exam = await getLatestExam()
    if (!exam) {
      return jsonError('Belum ada paket soal untuk diekspor. Buat paket soal terlebih dahulu.', 404)
    }
    const labelById = new Map(exam.structures.map((s) => [s.id, s.label]))
    const headers = [
      'Nomor',
      'Bagian',
      'Bentuk Soal',
      'Level Kognitif',
      'Tingkat Kesulitan',
      'Indikator',
      'Materi',
      'Kunci',
      'Teks Jawaban',
    ]
    const rows = exam.questions.map((q) => [
      q.number,
      labelById.get(q.structureId) ?? '',
      q.type,
      q.cognitiveLevel,
      q.difficulty,
      q.indicator,
      q.material,
      q.answer,
      answerTextOf(q),
    ])
    return csvResponse(toCsv(headers, rows), 'Kunci-Jawaban-APSIS.csv')
  }

  // ---- Analisis butir soal (CTT) ----
  if (type === 'butir') {
    const { config, students } = await getAnalysisData()
    const ctt = computeCtt(students, config)
    const pickLetters = LETTERS.slice(0, Math.max(1, config.optionCount))
    const headers = [
      'Nomor',
      'Kunci',
      'Jumlah Benar',
      'P (Kesulitan)',
      'Label Kesulitan',
      'D (Pembeda)',
      'Status',
      'Rekomendasi',
      ...pickLetters.map((l) => `Pilih ${l}`),
    ]
    const rows = ctt.items.map((it) => [
      it.number,
      it.key,
      it.correctCount,
      round2(it.p),
      it.pLabel,
      round2(it.d),
      it.status,
      it.reason,
      ...pickLetters.map((l) => {
        const stat = it.optionStats.find((o) => o.letter === l)
        return stat ? stat.count : 0
      }),
    ])
    return csvResponse(toCsv(headers, rows), 'Analisis-Butir-Soal-CTT.csv')
  }

  // ---- Analisis nilai (KKTP) ----
  if (type === 'nilai') {
    const { config, students } = await getAnalysisData()
    const kktp = computeKktp(students, config)
    const headers = [
      'Rank',
      'Nama',
      'Jawaban Benar',
      'Skor',
      'KKM',
      'Status',
      'Materi yang Belum Dikuasai',
    ]
    const rows = kktp.students.map((s) => [
      s.rank,
      s.name,
      s.correct,
      s.score,
      config.kkm,
      s.status,
      s.weakMaterials.join('; '),
    ])
    return csvResponse(toCsv(headers, rows), 'Analisis-Nilai-KKTP.csv')
  }

  // ---- Template import jawaban siswa ----
  if (type === 'template') {
    const { config } = await getAnalysisData()
    const optionCount = Math.max(1, config.optionCount)
    const headers = [
      'Nama',
      ...Array.from({ length: config.totalQuestions }, (_, i) => `Soal${i + 1}`),
    ]
    const rows = [1, 2, 3].map((r) => [
      `Contoh Siswa ${r}`,
      ...Array.from(
        { length: config.totalQuestions },
        (_, c) => LETTERS[(r - 1 + c) % optionCount]
      ),
    ])
    return csvResponse(toCsv(headers, rows), 'Template-Import-Jawaban.csv')
  }

  return jsonError('Parameter type tidak valid. Gunakan type=kunci | butir | nilai | template.', 400)
}
