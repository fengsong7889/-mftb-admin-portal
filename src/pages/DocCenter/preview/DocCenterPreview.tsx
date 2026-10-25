/**
 * 文档中心重构的隔离 UI 预览。
 * 只保存 React 内存状态，不读取本机方案、不写真实 API、不绕过外层菜单门禁。
 * 中文临时文案待界面确认后的第二阶段统一 i18n。
 */
import { useRef, useState } from 'react'
import { useBeforeUnload, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Result, Space, Tag, message } from 'antd'
import { AuditOutlined, BookOutlined, ExperimentOutlined, FileTextOutlined, FolderOpenOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import PlanLibraryPreview from './PlanLibraryPreview'
import { PlanReaderPreview, PlanVersionsPreview } from './PlanDocumentPreview'
import { PlanConfirmationPreview, PlanEditorPreview, PlanHandoffPreview, type PreviewEditValues } from './PlanFormsPreview'
import { DocGovernancePreview, DocRetainedPreview, DocSpacesPreview, DocTrashPreview, type PreviewAuditEvent } from './DocGovernancePreview'
import { confirmPreview } from './previewActions'
import { PREVIEW_PAGES, createPreviewDocuments, createPreviewRevision, getPreviewRevision, previewUrl, type PreviewDocument, type PreviewPage } from './previewData'
import '@/styles/components.css'
import './preview.css'

const NAV_ITEMS = [
  { key: 'plans', label: '方案管理', icon: <FileTextOutlined /> },
  { key: 'library', label: '文檔庫', icon: <FolderOpenOutlined /> },
  { key: 'learning', label: '學習路徑', icon: <BookOutlined /> },
  { key: 'stats', label: '閱讀統計', icon: <AuditOutlined /> },
  { key: 'spaces', label: '空間管理', icon: <TeamOutlined /> },
  { key: 'governance', label: '治理與集成', icon: <SafetyCertificateOutlined /> },
] as const

export default function DocCenterPreview() {
  const routeNavigate = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('preview')
  const page: PreviewPage = PREVIEW_PAGES.find(value => value === requested) ?? 'plans'
  const [documents, setDocuments] = useState(createPreviewDocuments)
  const [events, setEvents] = useState<PreviewAuditEvent[]>([])
  const nextId = useRef(9)
  const dirty = useRef(false)
  const [notice, noticeContext] = message.useMessage()
  const selected = documents.find(doc => doc.id === params.get('sample'))
  const requiresDocument = ['read', 'edit', 'versions', 'confirm', 'handoff'].includes(page)
  const activeNav = requiresDocument || page === 'trash' ? 'plans' : page

  useBeforeUnload(event => {
    if (dirty.current) { event.preventDefault(); event.returnValue = '' }
  })

  const navigate = (next: PreviewPage, id?: string) => {
    const proceed = () => { dirty.current = false; routeNavigate(previewUrl(next, id)) }
    if (dirty.current) confirmPreview('離開尚未保存的編輯？', <p>目前輸入僅在畫面中，離開後不會存入伺服器。</p>, proceed)
    else proceed()
  }
  const addEvent = (action: string, target: string, detail: string) => {
    setEvents(previous => [{ id: `event-${previous.length + 1}`, action, target, detail, time: new Date().toLocaleTimeString('zh-TW', { hour12: false }) }, ...previous])
  }
  const update = (id: string, patch: Partial<PreviewDocument>, action: string, detail: string) => {
    setDocuments(previous => previous.map(doc => doc.id === id ? { ...doc, ...patch } : doc))
    addEvent(action, documents.find(doc => doc.id === id)?.code ?? id, detail)
    void notice.info(`${action}已演示，未寫入伺服器。`)
  }
  const create = () => {
    const number = nextId.current++
    const base = createPreviewDocuments()[0]
    const revision = createPreviewRevision(`draft-${number}-1`, 'v1', '新方案樣稿')
    const doc: PreviewDocument = {
      ...base, id: `new-demo-${number}`, code: `PLAN-DEMO-${String(number).padStart(3, '0')}`, title: '新方案（示例）', status: 'draft',
      execution: 'not_started', revisions: [revision], draftId: revision.id, effectiveId: undefined, adoptedId: undefined, favorite: false,
    }
    setDocuments(previous => [...previous, doc])
    navigate('edit', doc.id)
  }
  const save = (values: PreviewEditValues) => {
    if (!selected) return
    const original = getPreviewRevision(selected, selected.draftId ?? selected.effectiveId)
    const metadata = { title: values.title.trim(), system: values.system, menu: values.menu, space: values.space, category: values.category }
    const revision = { ...createPreviewRevision(`revision-${selected.id}-${selected.revisions.length + 1}`, `v${selected.revisions.length + 1}`, values.reason), metadata, markdown: values.markdown, sections: original?.markdown === values.markdown ? original.sections : [] }
    // 即使在演示中也不让草稿标题/范围覆盖当前有效版的展示。
    update(selected.id, { ...(!selected.effectiveId ? metadata : {}), revisions: [...selected.revisions, revision], draftId: revision.id, status: 'draft' }, '保存演示草稿', `${revision.label} · ${values.reason}`)
    navigate('read', selected.id)
  }
  const restoreRevision = (revisionId: string) => {
    if (!selected) return
    const previous = getPreviewRevision(selected, revisionId)
    if (!previous) return
    confirmPreview('從歷史版本建立新草稿？', <p>{selected.code} · 以 {previous.label} 為基礎，保留目前有效版及既有歷史。</p>, () => {
      const revision = { ...previous, id: `restored-${selected.id}-${selected.revisions.length + 1}`, label: `v${selected.revisions.length + 1}`, reason: `從 ${previous.label} 恢復為草稿（演示）` }
      update(selected.id, { revisions: [...selected.revisions, revision], draftId: revision.id, status: 'draft' }, '恢復為新草稿', revision.reason)
      navigate('edit', selected.id)
    })
  }
  const decide = (action: 'submit' | 'approve' | 'reject' | 'withdraw', note: string) => {
    if (!selected?.draftId) return
    const label = { submit: '提交確認', approve: '確認版本生效', reject: '退回修改', withdraw: '撤回確認' }[action]
    update(selected.id, action === 'approve' ? { ...getPreviewRevision(selected, selected.draftId)?.metadata, effectiveId: selected.draftId, draftId: undefined, status: 'effective' } : { status: action === 'submit' ? 'reviewing' : 'draft' }, label, `${getPreviewRevision(selected, selected.draftId)?.label} · ${note || '無補充意見'}`)
    navigate('read', selected.id)
  }

  return <div className="content-area doc-preview">
    {noticeContext}
    <Alert className="doc-preview__preview-banner" type="warning" showIcon icon={<ExperimentOutlined />}
      message={<Space wrap><strong>文檔中心新版 · 第一階段介面預覽</strong><Tag>虛構資料</Tag></Space>}
      description="只演示流程，不保存至伺服器；重新整理即重置。現有文檔與權限不受影響，請勿輸入真實敏感資料。"
      action={<Button size="small" onClick={() => {
        const exit = () => { dirty.current = false; routeNavigate('/doc-center') }
        if (dirty.current) confirmPreview('離開預覽？', <p>未保存的輸入將捨棄。</p>, exit)
        else exit()
      }}>返回現有文檔庫</Button>} />
    <nav className="doc-preview__nav" aria-label="新版文檔中心導航">
      {NAV_ITEMS.map(item => <button key={item.key} type="button" aria-current={activeNav === item.key ? 'page' : undefined} onClick={() => navigate(item.key)}>{item.icon}<span>{item.label}</span>{['plans', 'governance'].includes(item.key) && <small>新</small>}</button>)}
    </nav>
    <main className="doc-preview__main" key={`${page}-${selected?.id ?? ''}`}>
      {requiresDocument && !selected ? <Result status="404" title="找不到這筆演示記錄" subTitle="新增的演示內容只存在本次預覽；重新整理後不會保留。" extra={<Button onClick={() => navigate('plans')}>返回方案管理</Button>} /> : <>
        {(page === 'plans' || page === 'library') && <PlanLibraryPreview documents={documents} navigate={navigate} library={page === 'library'} onCreate={create} onFavorite={id => setDocuments(previous => previous.map(doc => doc.id === id ? { ...doc, favorite: !doc.favorite } : doc))} />}
        {page === 'read' && selected && <PlanReaderPreview doc={selected} navigate={navigate} onTrash={() => confirmPreview('將方案移入回收站？', <p>{selected.code} · {selected.title}，可恢復原編號與版本。</p>, () => { update(selected.id, { deleted: true, deletionReason: '使用者演示移入回收站' }, '移入回收站', '保留原 ID 與版本'); navigate('trash') }, true)} />}
        {page === 'versions' && selected && <PlanVersionsPreview doc={selected} navigate={navigate} onRestore={restoreRevision} />}
        {page === 'edit' && selected && <PlanEditorPreview doc={selected} navigate={navigate} onSave={save} onDirty={value => { dirty.current = value }} />}
        {page === 'confirm' && selected && <PlanConfirmationPreview doc={selected} navigate={navigate} onDecision={decide} />}
        {page === 'handoff' && selected && <PlanHandoffPreview doc={selected} navigate={navigate} onHandoff={values => {
          update(selected.id, { handoff: { done: values.done, remaining: values.remaining, risk: values.risk, revisionId: selected.adoptedId ?? selected.effectiveId }, handoffPending: !selected.handoffPending, adoptedId: selected.adoptedId ?? selected.effectiveId, ...(selected.handoffPending ? { ownerName: '示例接手人' } : {}) }, selected.handoffPending ? '接收交接' : '發起交接', '固定採用版本，不自動改變權限')
          navigate('read', selected.id)
        }} />}
        {page === 'trash' && <DocTrashPreview documents={documents} navigate={navigate} onRestore={id => update(id, { deleted: false }, '恢復方案', '保留原 ID、版本與關聯')} />}
        {page === 'spaces' && <DocSpacesPreview onNotice={text => { void notice.info(text) }} />}
        {page === 'governance' && <DocGovernancePreview events={events} navigate={navigate} onNotice={text => { void notice.info(text) }} />}
        {(page === 'learning' || page === 'stats') && <DocRetainedPreview kind={page} documents={documents} navigate={navigate} />}
      </>}
    </main>
  </div>
}
