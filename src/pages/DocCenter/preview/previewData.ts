/**
 * 第一阶段专用演示数据，不含真实方案、人员或凭据，不与服务端数据混用。
 * 文案待第二阶段 i18n 解耦后统一登记；生产契约不从这些 UI 类型反推。
 */
export type PreviewPage = 'plans' | 'library' | 'read' | 'edit' | 'versions' | 'confirm' | 'handoff' | 'trash' | 'spaces' | 'governance' | 'learning' | 'stats'
export type PreviewStatus = 'draft' | 'reviewing' | 'effective' | 'archived' | 'replaced'
export type PreviewExecution = 'not_started' | 'running' | 'paused' | 'done'

export interface PreviewSection {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export interface PreviewRevision {
  id: string
  label: string
  createdAt: string
  reason: string
  sections: PreviewSection[]
  markdown: string
  metadata?: Pick<PreviewDocument, 'title' | 'system' | 'menu' | 'space' | 'category'>
}

export interface PreviewDocument {
  id: string
  code: string
  title: string
  system: string
  menu: string
  space: string
  category: string
  source: 'native' | 'external'
  ownerName: string
  tags: string[]
  alias: string
  status: PreviewStatus
  execution: PreviewExecution
  effectiveId?: string
  draftId?: string
  adoptedId?: string
  revisions: PreviewRevision[]
  updatedAt: string
  reviewDue: boolean
  deleted?: boolean
  deletionReason?: string
  replacementId?: string
  handoffPending?: boolean
  handoff?: { done: string; remaining: string; risk: string; revisionId?: string }
  favorite?: boolean
}

export type PreviewNavigate = (page: PreviewPage, id?: string) => void

export const STATUS_LABEL: Record<PreviewStatus, string> = {
  draft: '草稿', reviewing: '待確認', effective: '已生效', archived: '已歸檔', replaced: '已被替代',
}
export const STATUS_COLOR: Record<PreviewStatus, string> = {
  draft: 'default', reviewing: 'orange', effective: 'green', archived: 'purple', replaced: 'default',
}
export const EXECUTION_LABEL: Record<PreviewExecution, string> = {
  not_started: '未開始', running: '執行中', paused: '已暫停', done: '已完成',
}
export const PREVIEW_PEOPLE = [
  { id: 1, name: '示例負責人', empId: 'MF-DEMO01' },
  { id: 2, name: '示例接手人', empId: 'MF-DEMO02' },
]
export const PREVIEW_PAGES: PreviewPage[] = ['plans', 'library', 'read', 'edit', 'versions', 'confirm', 'handoff', 'trash', 'spaces', 'governance', 'learning', 'stats']

const BASE_SECTIONS: PreviewSection[] = [
  { title: '背景與目標', paragraphs: ['讓分散的方案成為可搜尋、可確認、可交接的知識資產。團隊從同一個入口取得採用版本，不再依賴本地資料夾。'] },
  { title: '範圍與不做事項', paragraphs: ['本批次聚焦原生 Markdown 方案的完整管理流程。'], bullets: ['納入：原文保存、版本比較、人工確認、交接與回收站。', '不納入：多人即時協作、Office 編輯、AI 自動批准或自動執行。'] },
  { title: '內容與版本設計', paragraphs: ['穩定的方案編號標識同一份文件；草稿與有效版本分開。已確認內容不原地覆寫，每次交接綁定明確版本。'], bullets: ['新草稿不影響讀者查閱目前有效版。', '版本回復產生新草稿，不刪除歷史。'] },
  { title: '權限與安全邊界', paragraphs: ['菜單准入、空間角色、文件限制與版本可見性共同決定權限，後端必須重新驗證。'], bullets: ['AI 僅能在授權範圍建立草稿。', '無權內容不出現在搜尋片段、計數或附件連結中。'] },
  { title: '實施與驗收', paragraphs: ['先確認介面，再實作 API、資料庫與 AI 接入。驗收須證明另一台電腦可取得相同版本，並完成備份恢復演練。'], bullets: ['重複提交不產生重複版本。', '並行編輯提示衝突，不靜默覆蓋。', '誤刪後恢復原編號與關聯記錄。'] },
  { title: '回滾與待確認事項', paragraphs: ['關閉新寫入入口時保留已存內容，以相容服務提供唯讀查閱。確認責任人、存取範圍與備份演練安排後，再開放真實資料。'] },
]

/** 仅将固定演示段落序列化为示例原文；不是 Markdown 解析器。 */
export function createPreviewRevision(id: string, label: string, reason: string, sections = BASE_SECTIONS): PreviewRevision {
  return {
    id, label, reason, createdAt: '2026-10-23 10:30', sections,
    markdown: sections.map(section => `## ${section.title}\n\n${section.paragraphs.join('\n\n')}${section.bullets ? `\n\n${section.bullets.map(item => `- ${item}`).join('\n')}` : ''}`).join('\n\n'),
  }
}

export function createPreviewDocuments(): PreviewDocument[] {
  const effective = createPreviewRevision('demo-r1', 'v1', '首次確認：統一方案入口與版本規則')
  const revisedSections = BASE_SECTIONS.map(section => section.title === '權限與安全邊界'
    ? { ...section, bullets: [...(section.bullets ?? []), '新增：AI 寫入必須取得可核驗回執；集成身分不得批准方案。'] }
    : section)
  const draft = createPreviewRevision('demo-r2', 'v2', '補充 AI 入庫回執與集成權限邊界', revisedSections)
  const base: PreviewDocument = {
    id: 'demo-1', code: 'PLAN-DEMO-001', title: '文檔中心原生方案管理', system: '文檔中心', menu: '方案管理',
    space: '產品與研發', category: '系統重構', source: 'native', ownerName: '示例負責人',
    tags: ['Markdown', '版本管理', 'AI 接入'], alias: '文檔中心_方案管理_示例.md',
    status: 'reviewing', execution: 'running', effectiveId: effective.id, draftId: draft.id, adoptedId: effective.id,
    revisions: [effective, draft], updatedAt: '2026-10-23 10:30', reviewDue: false, favorite: true,
  }
  const documents: PreviewDocument[] = [
    base,
    { ...base, id: 'demo-2', code: 'PLAN-DEMO-002', title: '員工資料管理重構', system: '人力資源', menu: '員工管理', space: '人事制度', tags: ['HCM', '資料權限'], alias: '企業_HCM_重構方案_示例.md', status: 'draft', execution: 'not_started', effectiveId: undefined, adoptedId: undefined, draftId: effective.id, revisions: [effective], favorite: false },
    { ...base, id: 'demo-3', code: 'PLAN-DEMO-003', title: '資產盤點快照與差異核對', system: '資產管理', menu: '資產盤點', tags: ['快照', '驗收'], alias: '資產盤點_示例.md', status: 'effective', draftId: undefined, revisions: [effective], handoffPending: true, favorite: false },
    { ...base, id: 'demo-4', code: 'PLAN-DEMO-004', title: '搜尋結果排序與回退策略', system: '搜尋系統', menu: '搜尋配置', tags: ['排序', '回退'], alias: '搜尋策略_示例.md', status: 'effective', execution: 'done', draftId: undefined, revisions: [effective], reviewDue: true, favorite: false },
    { ...base, id: 'demo-5', code: 'PLAN-DEMO-005', title: '舊版文檔索引設計', tags: ['歷史方案'], alias: '舊版文檔索引_示例.md', status: 'replaced', execution: 'done', draftId: undefined, revisions: [effective], replacementId: 'demo-1', favorite: false },
    { ...base, id: 'demo-6', code: 'PLAN-DEMO-006', title: '入職知識清單整理', system: '人力資源', menu: '學習路徑', space: '人事制度', tags: ['入職', '知識清單'], alias: '入職知識_示例.md', status: 'archived', execution: 'done', draftId: undefined, revisions: [effective], favorite: false },
    { ...base, id: 'demo-7', code: 'PLAN-DEMO-007', title: '測試環境遷移預案', tags: ['遷移', '回滾'], alias: '環境遷移_示例.md', status: 'draft', execution: 'not_started', effectiveId: undefined, adoptedId: undefined, draftId: effective.id, revisions: [effective], deleted: true, deletionReason: '演示：誤刪後恢復原編號', favorite: false },
    { ...base, id: 'demo-8', code: 'DOC-DEMO-008', title: '團隊協作指引（外鏈）', category: '協作指引', source: 'external', tags: ['騰訊文檔'], alias: '', status: 'effective', execution: 'not_started', draftId: undefined, adoptedId: undefined, revisions: [], favorite: false },
  ]
  return documents.map(doc => ({ ...doc, revisions: doc.revisions.map(revision => ({
    ...revision, metadata: { title: doc.title, system: doc.system, menu: doc.menu, space: doc.space, category: doc.category },
  })) }))
}

export function getPreviewRevision(doc: PreviewDocument, id?: string): PreviewRevision | undefined {
  return doc.revisions.find(revision => revision.id === (id ?? doc.effectiveId ?? doc.draftId))
}

export function previewUrl(page: PreviewPage, id?: string): string {
  const query = new URLSearchParams({ preview: page })
  if (id) query.set('sample', id)
  return `/doc-center?${query}`
}
