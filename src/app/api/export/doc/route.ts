// GET /api/export/doc?type=naskah|kartu|tka[&no=N][&id=...]
// Ekspor dokumen Word (.doc) dari HTML kompatibel Word.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getLatestExam,
  buildWordDocHtml,
  buildNaskahDoc,
  buildKartuDoc,
  buildTkaDoc,
} from '@/lib/apsis/export'
import type { TkaQuestionData } from '@/lib/apsis/types'

function parseTkaQuestions(raw: string): TkaQuestionData[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TkaQuestionData[]) : []
  } catch {
    return []
  }
}

function docResponse(bodyHtml: string, title: string, filename: string) {
  const html = buildWordDocHtml(title, bodyHtml)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type')

  if (type === 'naskah' || type === 'kartu') {
    const exam = await getLatestExam()
    if (!exam) {
      return jsonError('Belum ada paket soal untuk diekspor. Buat paket soal terlebih dahulu.', 404)
    }

    if (type === 'naskah') {
      const bodyHtml = buildNaskahDoc(exam.profile, exam.structures, exam.questions)
      return docResponse(bodyHtml, 'Naskah Soal Ujian', 'Naskah-Soal-APSIS.doc')
    }

    const noParam = searchParams.get('no')
    const parsedNo = noParam ? Number(noParam) : NaN
    const singleNumber = Number.isFinite(parsedNo) ? parsedNo : undefined
    const bodyHtml = buildKartuDoc(exam.profile, exam.questions, singleNumber)
    return docResponse(bodyHtml, 'Kartu Soal', 'Kartu-Soal-APSIS.doc')
  }

  if (type === 'tka') {
    const id = searchParams.get('id')
    if (!id) {
      return jsonError('Parameter id wajib diisi untuk ekspor simulasi TKA.', 400)
    }
    const row = await db.tkaSimulation.findUnique({ where: { id } })
    if (!row) {
      return jsonError('Simulasi TKA tidak ditemukan.', 404)
    }
    const sim = {
      id: row.id,
      level: row.level,
      subtest: row.subtest,
      mode: row.mode,
      totalQuestions: row.totalQuestions,
      questions: parseTkaQuestions(row.data),
    }
    return docResponse(
      buildTkaDoc(sim),
      `Simulasi TKA 2026 — ${sim.subtest}`,
      'Simulasi-TKA-APSIS.doc'
    )
  }

  return jsonError('Parameter type tidak valid. Gunakan type=naskah | kartu | tka.', 400)
}
