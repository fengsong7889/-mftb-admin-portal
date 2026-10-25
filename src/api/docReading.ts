import request from './request'

export interface DocReaderState {
  nodeId: number
  revisionId?: number | null
  positionJson?: string | null
  percent: number
  totalSeconds: number
  lastReadAt?: string | number | null
}

export interface DocFavorite {
  nodeId: number
  title: string
  summary?: string | null
  contentKind: number
  confidentiality: number
  updatedAt?: string | number | null
  folder: string
}

export interface DocNote {
  id: number
  nodeId: number
  revisionId: number
  noteType: number
  anchorJson?: string | null
  quoteText?: string | null
  content?: string | null
  visibility: number
  createdAt?: string | number | null
  updatedAt?: string | number | null
}

export interface DocBookMeta {
  nodeId: number
  title?: string | null
  summary?: string | null
  isbn?: string | null
  author?: string | null
  publisher?: string | null
  publishYear?: number | null
  language?: string | null
  pageCount?: number | null
  coverAssetId?: number | null
  bookCategoryId?: number | null
  accessMode: number
  percent: number
  lastReadAt?: string | number | null
}

export interface DocBookPage {
  records: DocBookMeta[]
  total: number
  page: number
  size: number
}

export function fetchDocReaderState(id: number) {
  return request.get<unknown, DocReaderState>(`/doc/v3/documents/${id}/reader-state`)
}

export function saveDocReaderState(id: number, payload: {
  revisionId?: number | null
  positionJson?: string | null
  percent: number
  seconds?: number | null
}) {
  return request.put<unknown, DocReaderState>(`/doc/v3/documents/${id}/reader-state`, payload)
}

export function fetchDocFavorites() {
  return request.get<unknown, DocFavorite[]>('/doc/v3/favorites')
}

export function toggleDocFavorite(id: number, folder?: string) {
  return request.put<unknown, boolean>(`/doc/v3/documents/${id}/favorite`, null, {
    params: { folder: folder?.trim() || undefined },
  })
}

export function fetchDocNotes(id: number) {
  return request.get<unknown, DocNote[]>(`/doc/v3/documents/${id}/notes`)
}

export function saveDocNote(id: number, payload: {
  revisionId: number
  noteType: number
  anchorJson?: string | null
  quoteText?: string | null
  content?: string | null
  visibility: number
}) {
  return request.post<unknown, DocNote>(`/doc/v3/documents/${id}/notes`, payload)
}

export function deleteDocNote(noteId: number) {
  return request.delete<unknown, void>(`/doc/v3/notes/${noteId}`)
}

export function fetchDocBookMeta(id: number) {
  return request.get<unknown, DocBookMeta>(`/doc/v3/documents/${id}/book-meta`)
}

export function saveDocBookMeta(id: number, payload: {
  isbn?: string | null
  author?: string | null
  publisher?: string | null
  publishYear?: number | null
  language?: string | null
  pageCount?: number | null
  coverAssetId?: number | null
  bookCategoryId?: number | null
  accessMode: number
}) {
  return request.put<unknown, DocBookMeta>(`/doc/v3/documents/${id}/book-meta`, payload)
}

export function fetchDocBooks(params: { spaceId?: number; keyword?: string; page?: number; size?: number }) {
  return request.get<unknown, DocBookPage>('/doc/v3/books', {
    params: {
      spaceId: params.spaceId,
      keyword: params.keyword?.trim() || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
}
