import request from './request'

export interface DocArchiveMeta {
  nodeId: number
  documentNo: string
  title: string
  spaceName: string
  archiveNo: string
  fondsCode: string
  seriesCode?: string | null
  securityLevel: number
  retentionYears: number
  retentionStart: string
  disposalState: number
  legalHold: boolean
  archivedAt?: string | number | null
}

export interface DocDisposalRequest {
  id: number
  nodeId: number
  documentNo: string
  title: string
  reason: string
  requestedBy: number
  requestedByName: string
  approvedBy?: number | null
  approvedByName?: string | null
  status: number
  certificateNo?: string | null
  createdAt?: string | number | null
  decidedAt?: string | number | null
  destroyedAt?: string | number | null
}

export function archiveDoc(id: number, payload: { retentionYears: number; retentionStart: string; legalHold: boolean }) {
  return request.post<unknown, DocArchiveMeta>(`/doc/v3/documents/${id}/archive`, payload)
}

export function fetchDocArchives(params: { keyword?: string; page?: number; size?: number }) {
  return request.get<unknown, DocArchiveMeta[]>('/doc/v3/archives', {
    params: { keyword: params.keyword?.trim() || undefined, page: params.page ?? 1, size: params.size ?? 20 },
  })
}

export function requestDocDisposal(id: number, reason: string) {
  return request.post<unknown, DocDisposalRequest>(`/doc/v3/documents/${id}/disposal-requests`, { reason })
}

export function fetchDisposalRequests(params: { status?: number; page?: number; size?: number }) {
  return request.get<unknown, DocDisposalRequest[]>('/doc/v3/disposal-requests', {
    params: { status: params.status, page: params.page ?? 1, size: params.size ?? 20 },
  })
}

export function decideDocDisposal(id: number, approve: boolean, certificateNo?: string) {
  return request.post<unknown, DocDisposalRequest>(`/doc/v3/disposal-requests/${id}/approve`, {
    approve, certificateNo: certificateNo?.trim() || null,
  })
}

export async function downloadDisposalCsv() {
  const blob = await request.get<unknown, Blob>('/doc/v3/disposal-requests/export', { responseType: 'blob' })
  if ((blob.type || '').includes('json')) {
    let message = '導出失敗'
    try {
      const body = JSON.parse(await blob.text()) as { message?: string }
      message = body.message || message
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(message)
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'disposal-register.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
