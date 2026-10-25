/** 方案/文档列表静态交互；无真实检索请求，文案待第二阶段 i18n 解耦后重构。 */
import { useState } from 'react'
import { Button, Checkbox, Form, Input, Select, Space, Tabs, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined, FileTextOutlined, FolderOpenOutlined, ImportOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StarFilled, StarOutlined, TeamOutlined } from '@ant-design/icons'
import MeetingStatCards from '@/pages/MeetingManagement/MeetingStatCards'
import HelpPopover from '@/components/HelpPopover'
import { PreviewHeading, PreviewTable } from './PreviewPrimitives'
import { EXECUTION_LABEL, STATUS_COLOR, STATUS_LABEL, getPreviewRevision, type PreviewDocument, type PreviewNavigate } from './previewData'

interface Filters { keyword: string; system?: string; space?: string; history: boolean }
const EMPTY_FILTERS: Filters = { keyword: '', history: false }
const VIEW_ITEMS = [
  { key: 'all', label: '全部方案' }, { key: 'draft', label: '我的草稿' }, { key: 'review', label: '待我確認' },
  { key: 'handoff', label: '待接手' }, { key: 'running', label: '執行中' }, { key: 'due', label: '待複核' }, { key: 'favorite', label: '我的收藏' },
]

export default function PlanLibraryPreview({ documents, navigate, onFavorite, onCreate, library = false }: {
  documents: PreviewDocument[]; navigate: PreviewNavigate; onFavorite: (id: string) => void; onCreate: () => void; library?: boolean
}) {
  const [view, setView] = useState('all')
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const source = documents.filter(doc => !doc.deleted && (library || doc.source === 'native'))
  const rows = source.filter(doc => {
    if (!filters.history && ['archived', 'replaced'].includes(doc.status)) return false
    if (filters.system && doc.system !== filters.system) return false
    if (filters.space && doc.space !== filters.space) return false
    if (view === 'draft' && !doc.draftId) return false
    if (view === 'review' && doc.status !== 'reviewing') return false
    if (view === 'handoff' && !doc.handoffPending) return false
    if (view === 'running' && doc.execution !== 'running') return false
    if (view === 'due' && !doc.reviewDue) return false
    if (view === 'favorite' && !doc.favorite) return false
    const text = [doc.title, doc.code, doc.alias, doc.menu, ...doc.tags, ...doc.revisions.map(revision => revision.markdown)].join(' ').toLocaleLowerCase()
    return text.includes(filters.keyword.trim().toLocaleLowerCase())
  })
  const filterKey = JSON.stringify([view, filters, rows.map(doc => doc.id)])
  const columns: TableColumnsType<PreviewDocument> = [
    { key: 'title', title: '方案 / 文檔', width: 310, render: (_, doc) => <div className="doc-preview__title-cell">
      <Button type="text" size="small" aria-label={`${doc.favorite ? '取消收藏' : '收藏'} ${doc.code}`} icon={doc.favorite ? <StarFilled /> : <StarOutlined />} onClick={() => onFavorite(doc.id)} />
      <div><Button type="link" onClick={() => navigate('read', doc.id)}>{doc.title}</Button><div className="doc-preview__muted">{doc.code}</div></div>
    </div> },
    { key: 'system', title: '適用範圍', width: 150, render: (_, doc) => <><div>{doc.system}</div><span className="doc-preview__muted">{doc.menu}</span></> },
    { key: 'space', title: '空間 / 類型', width: 150, render: (_, doc) => <><div>{doc.space}</div><span className="doc-preview__muted">{doc.category}</span></> },
    { key: 'revision', title: '版本與確認', width: 170, render: (_, doc) => <Space direction="vertical" size={2}>
      {doc.source === 'external' ? <Tag>外部連結 · 未保管正文</Tag> : <>
        <span>{doc.effectiveId ? `${getPreviewRevision(doc, doc.effectiveId)?.label} 有效版` : '尚無有效版'}</span>
        <Tag color={STATUS_COLOR[doc.status]}>{doc.draftId ? `${getPreviewRevision(doc, doc.draftId)?.label} · ` : ''}{STATUS_LABEL[doc.status]}</Tag>
      </>}
    </Space> },
    { key: 'execution', title: '執行情況', width: 130, render: (_, doc) => <><Tag color={doc.execution === 'running' ? 'blue' : 'default'}>{doc.source === 'external' ? '不適用' : EXECUTION_LABEL[doc.execution]}</Tag>{doc.reviewDue && <div className="doc-preview__warning">需要複核</div>}</> },
    { key: 'owner', title: '負責人', width: 125, dataIndex: 'ownerName' },
    { key: 'updated', title: '最後更新', width: 145, dataIndex: 'updatedAt' },
    { key: 'action', title: '操作', fixed: 'right', width: 215, render: (_, doc) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => navigate('read', doc.id)}>詳情</Button>
      {doc.source === 'native' && <Button type="link" size="small" onClick={() => navigate('versions', doc.id)}>版本</Button>}
      {doc.status === 'reviewing' ? <Button type="link" size="small" onClick={() => navigate('confirm', doc.id)}>確認</Button>
        : doc.handoffPending ? <Button type="link" size="small" onClick={() => navigate('handoff', doc.id)}>接手</Button>
          : doc.source === 'native' && !['archived', 'replaced'].includes(doc.status) && <Button type="link" size="small" onClick={() => navigate('edit', doc.id)}>編輯</Button>}
    </Space> },
  ]
  return <>
    <PreviewHeading icon={library ? <FolderOpenOutlined /> : <FileTextOutlined />} title={library ? '文檔庫' : '方案管理'}
      description={library ? '一個入口查閱原生文檔與外部連結，內容來源清楚可辨。' : '讓每一次決策都有版本，讓每一次交接都有依據。'} />
    <div className="search-section doc-preview__search">
      <Form layout="vertical" onFinish={() => setFilters({ ...draftFilters })}>
        <div className="doc-preview__filters">
          <Form.Item label="關鍵字"><Input value={draftFilters.keyword} onChange={event => setDraftFilters({ ...draftFilters, keyword: event.target.value })} placeholder="標題、正文、編號或歷史檔名" allowClear /></Form.Item>
          <Form.Item label="涉及系統"><Select aria-label="涉及系統" value={draftFilters.system} allowClear placeholder="全部系統" options={[...new Set(source.map(doc => doc.system))].map(value => ({ value, label: value }))} onChange={system => setDraftFilters({ ...draftFilters, system })} /></Form.Item>
          <Form.Item label="知識空間"><Select aria-label="知識空間" value={draftFilters.space} allowClear placeholder="全部空間" options={[...new Set(source.map(doc => doc.space))].map(value => ({ value, label: value }))} onChange={space => setDraftFilters({ ...draftFilters, space })} /></Form.Item>
          <div className="doc-preview__search-actions"><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button><Button icon={<ReloadOutlined />} onClick={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setView('all') }}>重置</Button></div>
        </div>
      </Form>
      <div className="doc-preview__search-meta">
        <Checkbox checked={draftFilters.history} onChange={event => { const next = { ...draftFilters, history: event.target.checked }; setDraftFilters(next); setFilters(next) }}>包含已歸檔 / 已被替代</Checkbox>
        <HelpPopover title="搜尋與可見性" ariaLabel="搜尋與可見性說明" content={[{ tone: 'info', body: '目前只搜尋這組虛構樣本，統計跟隨目前條件。' }, { tone: 'warn', body: '正式版本由後端先校驗資源權限，再回傳結果；此介面不是安全邊界。' }]} />
      </div>
      <Tabs activeKey={view} onChange={setView} items={VIEW_ITEMS.map(item => item.key === 'all' && library ? { ...item, label: '全部文檔' } : item)} />
    </div>
    <div key={`stats-${filterKey}`} data-testid="preview-filtered-stats">
      <MeetingStatCards items={[
        { icon: <FileTextOutlined />, color: '#1890FF', bg: '#E6F7FF', value: rows.length, label: '符合條件' },
        { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: rows.filter(doc => doc.effectiveId && !['archived', 'replaced'].includes(doc.status) && doc.source === 'native').length, label: '有有效版本' },
        { icon: <ClockCircleOutlined />, color: '#E8720C', bg: '#FFF7E6', value: rows.filter(doc => doc.status === 'reviewing').length, label: '待確認' },
        { icon: <TeamOutlined />, color: '#722ED1', bg: '#F9F0FF', value: rows.filter(doc => doc.handoffPending).length, label: '待接手' },
      ]} />
    </div>
    <PreviewTable key={`table-${filterKey}`} rows={rows} columns={columns} pageKey={library ? 'library' : 'plans'}
      left={<Space><Button className="btn-import" icon={<ImportOutlined />} onClick={() => navigate('governance')}>匯入預檢</Button><Button icon={<DeleteOutlined />} onClick={() => navigate('trash')}>回收站</Button></Space>}
      right={<Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>新增方案</Button>} />
    <div className="doc-preview__footnote">示例狀態僅保留於本次預覽；重新整理即重置。正式方案不會從本機資料夾取數。</div>
  </>
}
