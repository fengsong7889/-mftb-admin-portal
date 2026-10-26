import request from './request'

/** 能力清单（prompt 元数据） */
export interface AiCapability {
  id?: number
  toolKey: string
  displayName: string
  domain: string
  promptDescription: string
  useWhen?: string
  avoidWhen?: string
  sort?: number
  updatedAt?: string
}

/** 回答骨架（版本化） */
export interface AiPromptProfile {
  id?: number
  profileKey: string
  name: string
  domain: string
  responseSkeleton: string
  extraRules?: string
  status: string
  version: number
  publishedAt?: string
  updatedBy?: string
}

/** 术语/口径 */
export interface AiGlossary {
  id?: number
  domain: string
  term: string
  aliases?: string
  definition: string
  formula?: string
  example?: string
  promptVisible?: number
  source?: string
  status?: string
  sort?: number
  updatedAt?: string
}

export function fetchCapabilities(): Promise<AiCapability[]> {
  return request.get<unknown, AiCapability[]>('/ai/prompt-config/capabilities')
}

export function saveCapability(toolKey: string, body: AiCapability): Promise<AiCapability> {
  return request.put<unknown, AiCapability>(`/ai/prompt-config/capabilities/${encodeURIComponent(toolKey)}`, body)
}

export function fetchProfiles(): Promise<AiPromptProfile[]> {
  return request.get<unknown, AiPromptProfile[]>('/ai/prompt-config/profiles')
}

export function saveProfileDraft(body: AiPromptProfile): Promise<AiPromptProfile> {
  return request.post<unknown, AiPromptProfile>('/ai/prompt-config/profiles/draft', body)
}

export function publishProfile(profileKey: string): Promise<AiPromptProfile> {
  return request.post<unknown, AiPromptProfile>(`/ai/prompt-config/profiles/${encodeURIComponent(profileKey)}/publish`)
}

export function rollbackProfile(profileKey: string, version: number): Promise<AiPromptProfile> {
  return request.post<unknown, AiPromptProfile>(
    `/ai/prompt-config/profiles/${encodeURIComponent(profileKey)}/rollback/${version}`,
  )
}

export function fetchGlossary(params?: { domain?: string; keyword?: string }): Promise<AiGlossary[]> {
  return request.get<unknown, AiGlossary[]>('/ai/prompt-config/glossary', { params })
}

export function saveGlossary(body: AiGlossary): Promise<AiGlossary> {
  return request.post<unknown, AiGlossary>('/ai/prompt-config/glossary', body)
}

export function deleteGlossary(id: number): Promise<void> {
  return request.delete(`/ai/prompt-config/glossary/${id}`)
}

/* ────────────────── 提示词试跑 ────────────────── */

export interface AiPromptTestRunTrace {
  toolKey: string
  elapsedMs: number
  success: boolean
}

export interface AiPromptTestRunResult {
  prompt: string
  text: string
  model?: string
  tokens: number
  errorKind?: string
  traces: AiPromptTestRunTrace[]
}

/** 用草稿配置在 sandbox 跑一轮问答；不写会话、不暴露外部工具与推送工具 */
export function testRunPrompt(input: {
  profileKey: string
  question: string
  useTools: boolean
}): Promise<AiPromptTestRunResult> {
  return request.post<unknown, AiPromptTestRunResult>('/ai/prompt-config/test-run', input)
}
