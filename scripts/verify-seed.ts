// ============ Verifikasi hasil seed: jalankan analisis CTT & KKTP ============
// Jalankan: bun scripts/verify-seed.ts

import { getAnalysisData } from '@/lib/apsis/analysis-server'
import { computeCtt, computeKktp } from '@/lib/apsis/analysis'
import { db } from '@/lib/db'

async function main() {
  const { config, students } = await getAnalysisData()
  const ctt = computeCtt(students, config)
  const kktp = computeKktp(students, config)

  const checks: Array<{ label: string; pass: boolean; actual: string }> = []
  const check = (label: string, pass: boolean, actual: string) => checks.push({ label, pass, actual })

  // Status butir wajib
  const statusByItem = ctt.items.map((item) => `${item.number}:${item.status}(D=${item.d})`)
  check('Item 1 status Buang', ctt.items[0]?.status === 'Buang', `${ctt.items[0]?.status} (D=${ctt.items[0]?.d})`)
  check('Item 9 status Revisi', ctt.items[8]?.status === 'Revisi', `${ctt.items[8]?.status} (D=${ctt.items[8]?.d})`)
  const othersOk = ctt.items.every((item) => (item.number === 1 || item.number === 9 ? true : item.status === 'Pertahankan'))
  check('Item lain Pertahankan', othersOk, statusByItem.join(', '))
  check('Mean 6.4-6.5', ctt.summary.mean >= 6.4 && ctt.summary.mean <= 6.5, `ctt=${ctt.summary.mean}, kktpScoreMean=${kktp.mean}`)
  check('Tuntas 19', kktp.tuntasCount === 19, `${kktp.tuntasCount}`)
  check('Remedial 16', kktp.remedialCount === 16, `${kktp.remedialCount}`)
  check('Min skor 30', kktp.min === 30, `${kktp.min}`)
  check('Max skor 100', kktp.max === 100, `${kktp.max}`)
  const tp1 = kktp.tpAnalysis[0]
  const tp2 = kktp.tpAnalysis[1]
  check('TP1 71.4%', tp1?.masteryPercent === 71.4, `${tp1?.masteryPercent}`)
  check('TP2 57.1%', tp2?.masteryPercent === 57.1, `${tp2?.masteryPercent}`)
  check('KR-20 0.55-0.65', ctt.summary.kr20 >= 0.55 && ctt.summary.kr20 <= 0.65, `${ctt.summary.kr20}`)

  const report = {
    summaryCtt: ctt.summary,
    items: ctt.items.map((item) => ({
      number: item.number,
      key: item.key,
      correctCount: item.correctCount,
      p: item.p,
      pLabel: item.pLabel,
      d: item.d,
      status: item.status,
      reason: item.reason,
      optionStats: item.optionStats,
    })),
    kktp: {
      mean: kktp.mean,
      min: kktp.min,
      max: kktp.max,
      rangeSpread: kktp.rangeSpread,
      sd: kktp.sd,
      sdLabel: kktp.sdLabel,
      classicalMasteryPercent: kktp.classicalMasteryPercent,
      tuntasCount: kktp.tuntasCount,
      remedialCount: kktp.remedialCount,
      distribution: kktp.distribution,
      tpAnalysis: kktp.tpAnalysis,
    },
    sampleTopStudents: kktp.students.slice(0, 3),
    sampleBottomStudent: kktp.students[kktp.students.length - 1],
    checks,
    allPass: checks.every((c) => c.pass),
  }

  console.log('APSIS_VERIFY_BEGIN')
  console.log(JSON.stringify(report, null, 2))
  console.log('APSIS_VERIFY_END')
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
