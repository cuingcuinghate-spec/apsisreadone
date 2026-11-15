// ============ POST /api/analysis/students ============

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAnalysisData } from '@/lib/apsis/analysis-server'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Nama siswa wajib diisi' }, { status: 400 })
  }

  const { config } = await getAnalysisData()
  const aggregate = await db.analysisStudent.aggregate({ _max: { id: true } })
  const id = (aggregate._max.id ?? 0) + 1

  const answers = Array.from({ length: config.totalQuestions }, () => '-')
  const created = await db.analysisStudent.create({
    data: { id, name, answers: JSON.stringify(answers) },
  })

  return NextResponse.json({
    student: { id: created.id, name: created.name, answers: JSON.parse(created.answers) as string[] },
  })
}
