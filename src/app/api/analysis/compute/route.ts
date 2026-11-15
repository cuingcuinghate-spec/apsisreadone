// ============ POST /api/analysis/compute ============

import { NextRequest, NextResponse } from 'next/server'
import {
  getAnalysisData,
  normalizeConfig,
  normalizeStudents,
} from '@/lib/apsis/analysis-server'
import { computeCtt, computeKktp } from '@/lib/apsis/analysis'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  let config
  let students
  if (body.config && body.students) {
    // Pakai payload yang dikirim (dinormalisasi seperti getAnalysisData)
    config = normalizeConfig(body.config)
    students = normalizeStudents(body.students, config.totalQuestions)
  } else {
    const data = await getAnalysisData()
    config = data.config
    students = data.students
  }

  const ctt = computeCtt(students, config)
  const kktp = computeKktp(students, config)
  return NextResponse.json({ ctt, kktp })
}
