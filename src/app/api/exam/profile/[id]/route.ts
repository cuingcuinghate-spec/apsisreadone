import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const fields = ['teacherName', 'schoolName', 'level', 'phase', 'grade', 'subject', 'topic'] as const
    const data: Record<string, string> = {}
    for (const f of fields) {
      const v = body[f]
      if (typeof v === 'string' && v.trim().length > 0) data[f] = v.trim()
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Tidak ada field yang diubah' }, { status: 400 })
    }
    const profile = await db.examProfile.update({ where: { id }, data })
    return NextResponse.json({ profile })
  } catch {
    return NextResponse.json({ error: 'Profil tidak ditemukan' }, { status: 404 })
  }
}
