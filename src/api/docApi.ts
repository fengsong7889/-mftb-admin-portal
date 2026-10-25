import request from './request'

export interface DocApiSpec {
  id: number
  nodeId: number
  revisionId: number
  systemCode: string
  specFormat: string
  specVersion: string
  baseUrl?: string | null
  specHash: string
  createdAt?: string | number | null
}

export interface DocApiOperation {
  id: number
  operationId: string
  method: string
  path: string
  summary?: string | null
  tag?: string | null
  deprecated: boolean
  schemaHash: string
}

export interface DocApiChange {
  id: number
  changeType: number
  operationKey: string
  detail?: string | null
  acknowledgedBy?: number | null
  createdAt?: string | number | null
}

export interface DocApiSpecView {
  spec: DocApiSpec
  operations: DocApiOperation[]
  changes: DocApiChange[]
  pendingDestructive: number
}

export function fetchDocApiSpecs(nodeId: number) {
  return request.get<unknown, DocApiSpec[]>(`/doc/v3/documents/${nodeId}/api-specs`)
}

export function importDocApiSpec(nodeId: number, payload: {
  systemCode: string
  specVersion: string
  rawSpec: string
}) {
  return request.post<unknown, DocApiSpecView>(`/doc/v3/documents/${nodeId}/api-specs`, payload)
}

export function fetchDocApiSpec(specId: number) {
  return request.get<unknown, DocApiSpecView>(`/doc/v3/api-specs/${specId}`)
}

export function fetchDocApiDiff(specId: number, against?: number) {
  return request.get<unknown, DocApiChange[]>(`/doc/v3/api-specs/${specId}/diff`, {
    params: { against },
  })
}

export function ackDocApiChange(changeId: number) {
  return request.post<unknown, DocApiChange>(`/doc/v3/api-changes/${changeId}/ack`)
}
