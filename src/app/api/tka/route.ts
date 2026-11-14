// GET /api/tka — simulasi TKA terbaru
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseTkaSimulationRow } from '@/lib/apsis/generation'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const row = await db.tkaSimulation.findFirst({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ simulation: row ? parseTkaSimulationRow(row) : null })
  } catch (err) {
    console.error('[GET /api/tka] error:', err)
    return NextResponse.json({ error: 'Gagal memuat simulasi TKA' }, { status: 500 })
  }
}
