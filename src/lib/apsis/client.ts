import type {
  AnalysisConfigData,
  AnalysisStudentData,
  CttResult,
  ExamProfileData,
  KktpResult,
  QuestionData,
  StructureData,
  TkaSimulationData,
} from '@/lib/apsis/types'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Permintaan gagal (${res.status})`
    throw new Error(message)
  }
  return body as T
}

export const apsisApi = {
  getExam: () =>
    fetchJson<{ profile: ExamProfileData | null; structures: StructureData[]; questions: QuestionData[] }>(
      '/api/exam'
    ),
  saveProfile: (data: Omit<ExamProfileData, 'id'>) =>
    fetchJson<{ profile: ExamProfileData }>('/api/exam/profile', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProfile: (id: string, data: Omit<ExamProfileData, 'id'>) =>
    fetchJson<{ profile: ExamProfileData }>(`/api/exam/profile/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  addStructure: (profileId: string, structure: Omit<StructureData, 'id' | 'profileId' | 'label'>) =>
    fetchJson<{ structure: StructureData }>('/api/exam/structures', {
      method: 'POST',
      body: JSON.stringify({ profileId, structure }),
    }),
  deleteStructure: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/exam/structures/${id}`, { method: 'DELETE' }),
  generateExam: (profileId: string) =>
    fetchJson<{ questions: QuestionData[] }>('/api/exam/generate', {
      method: 'POST',
      body: JSON.stringify({ profileId }),
    }),
  generateImage: (questionId: string, prompt?: string) =>
    fetchJson<{ question: QuestionData }>(`/api/questions/${questionId}/image`, {
      method: 'POST',
      body: JSON.stringify({ prompt: prompt ?? null }),
    }),
  deleteImage: (questionId: string) =>
    fetchJson<{ question: QuestionData }>(`/api/questions/${questionId}/image`, { method: 'DELETE' }),
  regenerateQuestion: (questionId: string) =>
    fetchJson<{ question: QuestionData }>(`/api/questions/${questionId}/regenerate`, { method: 'POST' }),

  getAnalysis: () =>
    fetchJson<{ config: AnalysisConfigData; students: AnalysisStudentData[] }>('/api/analysis'),
  patchAnalysisConfig: (patch: Partial<Pick<AnalysisConfigData, 'kkm' | 'totalQuestions' | 'optionCount' | 'keyAnswers'>>) =>
    fetchJson<{ config: AnalysisConfigData; students: AnalysisStudentData[] }>('/api/analysis', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  addStudent: (name: string) =>
    fetchJson<{ student: AnalysisStudentData }>('/api/analysis/students', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateStudent: (id: number, data: { name?: string; answers?: string[] }) =>
    fetchJson<{ student: AnalysisStudentData }>(`/api/analysis/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteStudent: (id: number) =>
    fetchJson<{ ok: boolean }>(`/api/analysis/students/${id}`, { method: 'DELETE' }),
  importStudents: (students: { name: string; answers: string[] }[]) =>
    fetchJson<{ config: AnalysisConfigData; students: AnalysisStudentData[] }>('/api/analysis/import', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
  computeAnalysis: (data?: { config?: AnalysisConfigData; students?: AnalysisStudentData[] }) =>
    fetchJson<{ ctt: CttResult; kktp: KktpResult }>('/api/analysis/compute', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  generateTka: (level: string, subtest: string, mode: string) =>
    fetchJson<{ simulation: TkaSimulationData }>('/api/tka/generate', {
      method: 'POST',
      body: JSON.stringify({ level, subtest, mode }),
    }),
  getTka: () => fetchJson<{ simulation: TkaSimulationData | null }>('/api/tka'),
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`
}

export function formatSigned(value: number): string {
  const s = value.toFixed(2)
  return value >= 0 ? `+${s}` : s
}

export function formatNumberId(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace('.', ',')
}
