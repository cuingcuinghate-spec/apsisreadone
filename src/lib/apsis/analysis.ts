// ============ Fungsi analisis murni (tanpa DB): CTT & KKTP ============

import type {
  AnalysisConfigData,
  AnalysisStudentData,
  CttResult,
  CttSummary,
  ItemAnalysis,
  ItemStatus,
  KktpResult,
  OptionStat,
  ScoreDistributionBand,
  StudentScore,
  TpAnalysis,
} from './types'
import { DEMO_MATERIALS } from './constants'

const LETTER_ALPHABET = ['A', 'B', 'C', 'D', 'E']

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function difficultyLabelOf(p: number): 'Mudah' | 'Sedang' | 'Sulit' {
  if (p > 0.7) return 'Mudah'
  if (p >= 0.3) return 'Sedang'
  return 'Sulit'
}

function discriminationLabelOf(d: number): string {
  if (d >= 0.4) return 'Sangat Baik'
  if (d >= 0.3) return 'Baik'
  if (d >= 0.2) return 'Cukup'
  return 'Kurang'
}

function materialOf(questionNumber: number): string {
  return DEMO_MATERIALS[questionNumber - 1] ?? `Materi Soal ${questionNumber}`
}

// ============ Analisis Butir soal (Classical Test Theory) ============

export function computeCtt(students: AnalysisStudentData[], config: AnalysisConfigData): CttResult {
  const n = students.length
  const k = config.totalQuestions
  const keys = config.keyAnswers
  const optionCount = config.optionCount

  // Total jawaban benar per siswa
  const totals = students.map((s) => {
    let correct = 0
    for (let j = 0; j < k; j++) {
      if (s.answers[j] === keys[j]) correct++
    }
    return correct
  })

  // Kelompok 27% atas & bawah (peringkat: total benar desc, id asc)
  const groupSize = Math.max(1, Math.floor(n * 0.27))
  const order = students
    .map((s, idx) => ({ id: s.id, idx, total: totals[idx] }))
    .sort((a, b) => b.total - a.total || a.id - b.id)
  const upperIdx = order.slice(0, groupSize).map((o) => o.idx)
  const lowerIdx = order.slice(Math.max(0, n - groupSize)).map((o) => o.idx)

  const items: ItemAnalysis[] = []
  const statusCounts = { baik: 0, revisi: 0, buang: 0 }
  let sumPQ = 0

  for (let j = 0; j < k; j++) {
    const key = keys[j] ?? 'A'

    let correctCount = 0
    const optionCounts = new Map<string, number>()
    for (let l = 0; l < optionCount; l++) optionCounts.set(LETTER_ALPHABET[l], 0)

    for (const s of students) {
      const ans = s.answers[j] ?? '-'
      if (ans === key) correctCount++
      if (ans !== '-' && optionCounts.has(ans)) {
        optionCounts.set(ans, (optionCounts.get(ans) ?? 0) + 1)
      }
    }

    const pRaw = n > 0 ? correctCount / n : 0
    const p = round(pRaw, 2)
    const pLabel = difficultyLabelOf(pRaw)

    // Daya pembeda (kelompok 27% atas vs bawah)
    let upperCorrect = 0
    for (const idx of upperIdx) if (students[idx].answers[j] === key) upperCorrect++
    let lowerCorrect = 0
    for (const idx of lowerIdx) if (students[idx].answers[j] === key) lowerCorrect++
    const dRaw = groupSize > 0 ? upperCorrect / groupSize - lowerCorrect / groupSize : 0
    const d = round(dRaw, 2)

    let status: ItemStatus
    let reason: string
    if (d >= 0.3) {
      status = 'Pertahankan'
      reason = 'Daya pembeda baik (≥0.30), pertahankan butir ini.'
    } else if (d >= 0.2) {
      status = 'Revisi'
      reason = 'Daya pembeda cukup (0.20–0.29), perlu perbaikan pengecoh.'
    } else {
      status = 'Buang'
      reason = 'Daya pembeda lemah (<0.20), sebaiknya diganti atau diperbaiki.'
    }
    if (pRaw > 0.95) reason += ' Soal terlalu mudah (P > 0.95).'
    if (pRaw < 0.1) reason += ' Soal terlalu sulit (P < 0.10).'

    const optionStats: OptionStat[] = []
    for (let l = 0; l < optionCount; l++) {
      const letter = LETTER_ALPHABET[l]
      const count = optionCounts.get(letter) ?? 0
      const percent = n > 0 ? (count / n) * 100 : 0
      optionStats.push({
        letter,
        count,
        percent: round(percent, 1),
        isKey: letter === key,
        functional: letter !== key && percent >= 5,
      })
    }

    if (status === 'Pertahankan') statusCounts.baik++
    else if (status === 'Revisi') statusCounts.revisi++
    else statusCounts.buang++

    sumPQ += pRaw * (1 - pRaw)

    items.push({
      number: j + 1,
      key,
      correctCount,
      p,
      pLabel,
      d,
      dLabel: discriminationLabelOf(d),
      status,
      reason,
      optionStats,
      upperCorrect,
      upperTotal: groupSize,
      lowerCorrect,
      lowerTotal: groupSize,
    })
  }

  // Ringkasan: mean, KR-20 (Kuder-Richardson 20)
  const mean = n > 0 ? totals.reduce((acc, t) => acc + t, 0) / n : 0
  const variance = n > 0 ? totals.reduce((acc, t) => acc + (t - mean) ** 2, 0) / n : 0
  const kr20Raw = k > 1 && variance > 0 ? (k / (k - 1)) * (1 - sumPQ / variance) : 0
  const kr20 = round(kr20Raw, 2)
  const kr20Label =
    kr20 >= 0.9
      ? 'Sangat Reliabel'
      : kr20 >= 0.7
        ? 'Reliabel Tinggi'
        : kr20 >= 0.6
          ? 'Reliabel'
          : kr20 >= 0.5
            ? 'Cukup Reliabel'
            : 'Rendah'

  const summary: CttSummary = {
    kr20,
    kr20Label,
    mean: round(mean, 2),
    maxScore: n > 0 ? Math.max(...totals) : 0,
    statusCounts,
    sampleSize: n,
    groupSize,
  }

  return { summary, items }
}

// ============ Analisis nilai & ketuntasan (KKTP) ============

export function computeKktp(students: AnalysisStudentData[], config: AnalysisConfigData): KktpResult {
  const n = students.length
  const k = config.totalQuestions
  const keys = config.keyAnswers
  const kkm = config.kkm

  const scored = students.map((s) => {
    let correct = 0
    for (let j = 0; j < k; j++) {
      if (s.answers[j] === keys[j]) correct++
    }
    return { id: s.id, name: s.name, answers: s.answers, correct, score: Math.round((correct / k) * 100) }
  })

  const sorted = [...scored].sort((a, b) => b.score - a.score || a.id - b.id)
  const scores = scored.map((s) => s.score)
  const mean = n > 0 ? scores.reduce((acc, v) => acc + v, 0) / n : 0
  const min = n > 0 ? Math.min(...scores) : 0
  const max = n > 0 ? Math.max(...scores) : 0
  const variance = n > 0 ? scores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n : 0
  const sd = round(Math.sqrt(variance), 2)
  const sdLabel = sd < 10 ? 'Sebaran Homogen' : 'Sebaran Heterogen'

  const tuntasCount = scored.filter((s) => s.score >= kkm).length
  const remedialCount = n - tuntasCount
  const classicalMasteryPercent = n > 0 ? round((tuntasCount / n) * 100, 1) : 0

  const bandDefs: Array<{ label: string; color: string; test: (v: number) => boolean }> = [
    { label: '90–100', color: '#0e5e56', test: (v) => v >= 90 },
    { label: '80–89', color: '#14a085', test: (v) => v >= 80 && v < 90 },
    { label: '70–79', color: '#3b82f6', test: (v) => v >= 70 && v < 80 },
    { label: '60–69', color: '#f59e0b', test: (v) => v >= 60 && v < 70 },
    { label: '< 60', color: '#dc2626', test: (v) => v < 60 },
  ]
  const distribution: ScoreDistributionBand[] = bandDefs.map((band) => {
    const count = scores.filter(band.test).length
    return {
      label: band.label,
      count,
      percent: n > 0 ? round((count / n) * 100, 1) : 0,
      color: band.color,
    }
  })

  const studentScores: StudentScore[] = sorted.map((s, rankIdx) => {
    const weakMaterials: string[] = []
    for (let j = 0; j < k; j++) {
      if (s.answers[j] !== keys[j]) {
        const materi = materialOf(j + 1)
        if (!weakMaterials.includes(materi)) weakMaterials.push(materi)
      }
    }
    return {
      rank: rankIdx + 1,
      id: s.id,
      name: s.name,
      correct: s.correct,
      score: s.score,
      status: s.score >= kkm ? 'TUNTAS' : 'BELUM TUNTAS',
      weakMaterials: weakMaterials.slice(0, 3),
    }
  })

  const tpAnalysis: TpAnalysis[] = config.topics.map((tp) => {
    const itemCount = Math.max(0, tp.to - tp.from + 1)
    let sumCorrect = 0
    for (const s of students) {
      for (let q = tp.from; q <= tp.to; q++) {
        const idx = q - 1
        if (idx >= 0 && idx < k && s.answers[idx] === keys[idx]) sumCorrect++
      }
    }
    const denominator = itemCount * n
    const masteryPercent = denominator > 0 ? round((sumCorrect / denominator) * 100, 1) : 0
    const status = masteryPercent >= 80 ? 'BAIK' : masteryPercent >= 60 ? 'CUKUP' : 'MATERI KRITIS'
    return {
      label: tp.label,
      materi: tp.materi,
      from: tp.from,
      to: tp.to,
      masteryPercent,
      status,
    }
  })

  return {
    mean: round(mean, 1),
    min,
    max,
    rangeSpread: round(max - min, 1),
    sd,
    sdLabel,
    classicalMasteryPercent,
    tuntasCount,
    remedialCount,
    kkmTargetPercent: 85,
    needRemedialClassical: classicalMasteryPercent < 85,
    distribution,
    students: studentScores,
    tpAnalysis,
  }
}
