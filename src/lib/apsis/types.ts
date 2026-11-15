// ============ Tipe data bersama APSIS ============

export interface ExamProfileData {
  id: string
  teacherName: string
  schoolName: string
  level: string
  phase: string
  grade: string
  subject: string
  topic: string
}

export interface StructureData {
  id: string
  profileId: string
  label: string
  questionType: string
  optionCount: number
  includeImages: boolean
  easyCount: number
  mediumCount: number
  hardCount: number
  total: number
  cognitiveLevels: string[]
  customInstruction: string | null
}

export interface QuestionData {
  id: string
  structureId: string
  number: number
  type: string
  difficulty: string
  cognitiveLevel: string
  content: string
  options: string[]
  answer: string
  indicator: string
  material: string
  source: string
  scoreWeight: number
  imagePrompt: string | null
  imagePath: string | null
  imageStatus: string
  imageError: string | null
}

export interface TkaQuestionData {
  stimulus: string
  content: string
  options: string[]
  answer: string
  cognitiveLevel: string
  difficulty: string
}

export interface TkaSimulationData {
  id: string
  level: string
  subtest: string
  mode: string
  totalQuestions: number
  questions: TkaQuestionData[]
  createdAt?: string
}

export interface AnalysisTopic {
  label: string
  materi: string
  from: number
  to: number
}

export interface AnalysisConfigData {
  totalQuestions: number
  optionCount: number
  kkm: number
  keyAnswers: string[]
  topics: AnalysisTopic[]
}

export interface AnalysisStudentData {
  id: number
  name: string
  answers: string[]
}

// ============ Hasil analisis CTT ============

export type ItemStatus = 'Pertahankan' | 'Revisi' | 'Buang'

export interface OptionStat {
  letter: string
  count: number
  percent: number
  isKey: boolean
  functional: boolean
}

export interface ItemAnalysis {
  number: number
  key: string
  correctCount: number
  p: number // tingkat kesulitan 0..1
  pLabel: 'Mudah' | 'Sedang' | 'Sulit'
  d: number // daya pembeda -1..1
  dLabel: string
  status: ItemStatus
  reason: string
  optionStats: OptionStat[]
  upperCorrect: number
  upperTotal: number
  lowerCorrect: number
  lowerTotal: number
}

export interface CttSummary {
  kr20: number
  kr20Label: string
  mean: number
  maxScore: number
  statusCounts: { baik: number; revisi: number; buang: number }
  sampleSize: number
  groupSize: number
}

export interface CttResult {
  summary: CttSummary
  items: ItemAnalysis[]
}

// ============ Hasil analisis nilai KKTP ============

export interface ScoreDistributionBand {
  label: string
  count: number
  percent: number
  color: string
}

export interface StudentScore {
  rank: number
  id: number
  name: string
  correct: number
  score: number
  status: 'TUNTAS' | 'BELUM TUNTAS'
  weakMaterials: string[]
}

export interface TpAnalysis {
  label: string
  materi: string
  from: number
  to: number
  masteryPercent: number
  status: 'BAIK' | 'CUKUP' | 'MATERI KRITIS'
}

export interface KktpResult {
  mean: number
  min: number
  max: number
  rangeSpread: number
  sd: number
  sdLabel: string
  classicalMasteryPercent: number
  tuntasCount: number
  remedialCount: number
  kkmTargetPercent: number
  needRemedialClassical: boolean
  distribution: ScoreDistributionBand[]
  students: StudentScore[]
  tpAnalysis: TpAnalysis[]
}
