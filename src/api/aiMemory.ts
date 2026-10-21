import request from './request'

/** 用户长期记忆（按用户隔离，仅本人可读写） */
export interface AiUserMemory {
  id: number
  userId: number
  memoryType: string
  content: string
  status: 'active' | 'disabled'
  expiresAt?: string | null
  updatedAt?: string | null
}

export function fetchMemories(): Promise<AiUserMemory[]> {
  return request.get<unknown, AiUserMemory[]>('/ai/memories')
}

export function createMemory(content: string, memoryType = 'preference'): Promise<AiUserMemory> {
  return request.post<unknown, AiUserMemory>('/ai/memories', { content, memoryType })
}

export function updateMemory(
  id: number,
  data: { content?: string; status?: 'active' | 'disabled'; memoryType?: string },
): Promise<AiUserMemory> {
  return request.put<unknown, AiUserMemory>(`/ai/memories/${id}`, data)
}

export function deleteMemory(id: number): Promise<void> {
  return request.delete(`/ai/memories/${id}`)
}
