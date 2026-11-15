// POST /api/exam/profile — buat profil ujian; GET — profil terbaru
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const REQUIRED_FIELDS = ['teacherName', 'schoolName', 'level', 'phase', 'grade', 'subject', 'topic'] as const

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
    }

    const missing = REQUIRED_FIELDS.filter((f) => !String(body[f] ?? '').trim())
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Field wajib kosong: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    const profile = await db.examProfile.create({
      data: {
        teacherName: String(body.teacherName).trim(),
        schoolName: String(body.schoolName).trim(),
        level: String(body.level).trim(),
        phase: String(body.phase).trim(),
        grade: String(body.grade).trim(),
        subject: String(body.subject).trim(),
        topic: String(body.topic).trim(),
      },
    })

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[POST /api/exam/profile] error:', err)
    return NextResponse.json({ error: 'Gagal membuat profil ujian' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const profile = await db.examProfile.findFirst({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ profile: profile ?? null })
  } catch (err) {
    console.error('[GET /api/exam/profile] error:', err)
    return NextResponse.json({ error: 'Gagal memuat profil ujian' }, { status: 500 })
  }
}
