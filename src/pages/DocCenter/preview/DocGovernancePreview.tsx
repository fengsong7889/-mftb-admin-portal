/** 治理、权限、回收站预览。没有上传、授权或运维真实写操作。 */
import { useState } from 'react'
import { Alert, Button, Checkbox, Descriptions, Form, Input, Radio, Select, Space, Tabs, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ApiOutlined, AuditOutlined, CloudServerOutlined, DeleteOutlined, FileTextOutlined, ImportOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import DocSectionCard from '../DocSectionCard'
import { PreviewHeading, PreviewPerson, PreviewTable } from './PreviewPrimitives'
import { confirmPreview } from './previewActions'
import { type PreviewDocument, type PreviewNavigate } from './previewData'

export interface PreviewAuditEvent { id: string; action: string; target: string; detail: string; time: string }

export function DocTrashPreview({ documents, navigate, onRestore }: { documents: PreviewDocument[]; navigate: PreviewNavigate; onRestore: (id: string) => void }) {
  const [keyword, setKeyword] = useState('')
  const rows = documents.filter(doc => doc.deleted && `${doc.title} ${doc.code}`.includes(keyword))
  const columns: TableColumnsType<PreviewDocument> = [
    { key: 'code', title: '原方案編號', dataIndex: 'code' }, { key: 'title', title: '方案標題', dataIndex: 'title' },
    { key: 'space', title: '原空間', dataIndex: 'space' }, { key: 'reason', title: '移除原因', dataIndex: 'deletionReason' },
    { key: 'retention', title: '保留規則', render: () => <Tag color="purple">90 天內禁止永久清除</Tag> },
    { key: 'action', title: '操作', fixed: 'right', render: (_, doc) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => navigate('read', doc.id)}>詳情</Button>
      <Button type="link" size="small" onClick={() => confirmPreview('恢復此方案？', <><p>{doc.code} · {doc.title}</p><p>保留原編號、版本及關聯，恢復至「{doc.space}」。</p></>, () => onRestore(doc.id))}>恢復</Button>
    </Space> },
  ]
  return <>
    <PreviewHeading icon={<DeleteOutlined />} title="回收站" description="誤刪可找回；恢復原編號，不重新登記另一份。" />
    <Alert className="doc-preview__notice" type="info" showIcon message="90 天到期也不自動銷毀；此階段不提供永久刪除。" />
    <div className="search-section"><Form layout="vertical"><Form.Item label="搜尋已移除方案"><Input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="方案編號或標題" allowClear /></Form.Item></Form></div>
    <PreviewTable key={keyword} rows={rows} columns={columns} pageKey="trash" left={<Button onClick={() => navigate('plans')}>返回方案管理</Button>} />
  </>
}

const ROLE_ROWS = [
  { id: 'reader', role: '閱讀者', read: '授權有效版', draft: '不可', approve: '不可', manage: '不可' },
  { id: 'editor', role: '編輯者', read: '授權內容', draft: '參與的草稿', approve: '需另行授權', manage: '可提出交接' },
  { id: 'reviewer', role: '指定確認人', read: '指定待確認版', draft: '不改正文', approve: '僅指定申請', manage: '記錄決定' },
  { id: 'admin', role: '空間管理員', read: '仍遵守內容限制', draft: '按資源授權', approve: '需明確權限', manage: '成員、恢復、接管' },
  { id: 'ai', role: 'AI 集成身分', read: '使用者與授權範圍交集', draft: '僅允許的草稿', approve: '永遠不可', manage: '不可改權限或銷毀' },
]

export function DocSpacesPreview({ onNotice }: { onNotice: (text: string) => void }) {
  const [space, setSpace] = useState('產品與研發')
  const [restricted, setRestricted] = useState(true)
  const columns: TableColumnsType<typeof ROLE_ROWS[number]> = [
    { key: 'role', title: '角色', dataIndex: 'role' }, { key: 'read', title: '閱讀範圍', dataIndex: 'read' },
    { key: 'draft', title: '編輯草稿', dataIndex: 'draft' }, { key: 'approve', title: '確認生效', dataIndex: 'approve', render: value => <Tag color={value === '永遠不可' ? 'red' : 'default'}>{value}</Tag> },
    { key: 'manage', title: '交接 / 治理', dataIndex: 'manage' },
  ]
  return <>
    <PreviewHeading icon={<TeamOutlined />} title="空間與權限" description="空間決定誰能看，文件限制只收窄範圍，不跨空間放行。" />
    <div className="search-section"><Form layout="vertical"><Form.Item label="知識空間"><Radio.Group value={space} onChange={event => setSpace(event.target.value)} optionType="button" options={['產品與研發', '人事制度']} /></Form.Item></Form></div>
    <DocSectionCard title={`${space} · 存取邊界示意`} icon={<SafetyCertificateOutlined />} color="#722ED1" bg="#F9F0FF">
      <Form layout="vertical"><div className="doc-preview__two-columns"><Form.Item label="空間管理員（固定示例）"><PreviewPerson /></Form.Item><Form.Item label="預設確認人（固定示例）"><PreviewPerson /></Form.Item></div>
        <Form.Item label="新文件預設可見性"><Checkbox checked={restricted} onChange={event => setRestricted(event.target.checked)}>草稿僅作者與指定參與者可見</Checkbox></Form.Item>
      </Form>
      {!restricted && <Alert type="warning" showIcon message="安全規則要求草稿預設私有，這個選擇不能保存。" />}
      <div className="doc-preview__permission-chain"><span>系統 / 菜單准入</span><b>∩</b><span>空間角色</span><b>∩</b><span>文件限制</span><b>∩</b><span>版本可見性</span></div>
      <Button disabled={!restricted} onClick={() => confirmPreview('確認空間權限示意？', <p>空間：{space}；草稿保持私有。本次不修改任何真實授權。</p>, () => onNotice('已演示權限確認，未變更伺服器授權。'))}>確認權限示意</Button>
    </DocSectionCard>
    <PreviewTable rows={ROLE_ROWS} columns={columns} pageKey="permissions" left={<span className="doc-preview__muted">權限矩陣 · 僅展示產品規則，並非目前後端能力</span>} />
  </>
}

export function DocGovernancePreview({ events, navigate, onNotice }: { events: PreviewAuditEvent[]; navigate: PreviewNavigate; onNotice: (text: string) => void }) {
  const [tab, setTab] = useState('imports')
  const [prepared, setPrepared] = useState(false)
  const [keyword, setKeyword] = useState('')
  const importRows = prepared ? [
    { id: 'import-1', name: '示例_功能方案.md', outcome: '可匯入草稿', hint: '編碼與必填資訊就緒', tone: 'green' },
    { id: 'import-2', name: '示例_含圖方案.md', outcome: '待補附件', hint: '本地圖片尚未遷入，不可宣告完整遷移', tone: 'orange' },
    { id: 'import-3', name: '示例_重複方案.md', outcome: '重複提示', hint: '相同來源及內容，不重複建立', tone: 'default' },
  ] : []
  const importColumns: TableColumnsType<typeof importRows[number]> = [
    { key: 'name', title: '示例檔案', dataIndex: 'name' }, { key: 'outcome', title: '預檢結果', render: (_, row) => <Tag color={row.tone}>{row.outcome}</Tag> }, { key: 'hint', title: '處理建議', dataIndex: 'hint' },
  ]
  const auditColumns: TableColumnsType<PreviewAuditEvent> = [
    { key: 'time', title: '演示時間', dataIndex: 'time' }, { key: 'target', title: '對象', dataIndex: 'target' }, { key: 'action', title: '動作', dataIndex: 'action' }, { key: 'detail', title: '說明', dataIndex: 'detail' },
  ]
  return <>
    <PreviewHeading icon={<SafetyCertificateOutlined />} title="治理與集成" description="集中管理匯入、AI 接入、審計與恢復；不把未接入的能力顯示為正常運行。" />
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'imports', label: <span><ImportOutlined /> 歷史匯入</span> }, { key: 'ai', label: <span><ApiOutlined /> AI 接入</span> },
      { key: 'audit', label: <span><AuditOutlined /> 操作記錄</span> }, { key: 'backup', label: <span><CloudServerOutlined /> 備份與恢復</span> },
      { key: 'templates', label: <span><FileTextOutlined /> 方案模板</span> },
    ]} />
    {tab === 'imports' && <>
      <div className="doc-preview__import-panel"><ImportOutlined /><h3>先預檢，再入庫，最後核對</h3><p>來源映射、同名判定與圖片完整性逐項展示，不直接批量發布。</p>
        <Button className="btn-import" onClick={() => setPrepared(true)}>演示匯入預檢</Button><span className="doc-preview__muted">只顯示虛構結果，不讀取本機檔案。</span>
      </div>
      <div className="search-section"><span>來源：示例檔案集 · 目標：私有草稿 · 敏感內容不得自動發布</span></div>
      <PreviewTable rows={importRows} columns={importColumns} pageKey="imports" left={<Space><Button disabled>開始真實匯入（待接入）</Button><Button onClick={() => navigate('trash')}>查看回收站</Button></Space>} />
    </>}
    {tab === 'ai' && <DocSectionCard title="受限的方案工具" icon={<ApiOutlined />} color="#1890FF" bg="#E6F7FF">
      <Alert type="warning" showIcon message="尚未連線 MCP，也未建立任何集成憑據。" />
      <div className="doc-preview__tool-grid">{['doc_search', 'doc_get', 'doc_create_draft', 'doc_save_revision', 'doc_get_save_receipt', 'doc_get_handoff_context'].map(tool => <div key={tool}><code>{tool}</code><Tag>{tool.includes('create') || tool.includes('save_revision') ? '僅草稿寫入' : '授權讀取'}</Tag></div>)}</div>
      <Descriptions column={2} items={[{ key: 'expires', label: '有效期', children: '預設 7 天，最長 30 天' }, { key: 'scope', label: '範圍', children: '使用者目前權限 ∩ 指定空間' }, { key: 'forbidden', label: '禁止能力', children: '批准、刪除、改權限、全庫匯出', span: 2 }]} />
      <div className="doc-preview__receipt"><strong>保存回執（欄位示意）</strong><code>documentId · revisionId · contentHash · savedAt · versionUrl</code><p>只有伺服器提交成功才能顯示「已入庫」。此頁沒有真實回執。</p></div>
      <Button disabled>建立集成授權（第二階段接入）</Button>
    </DocSectionCard>}
    {tab === 'audit' && <>
      <Alert className="doc-preview__notice" type="info" showIcon message="以下僅為本次預覽操作記錄，重新整理即清空，不是不可變審計。" />
      <div className="search-section"><Form layout="vertical"><Form.Item label="搜尋操作記錄"><Input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="編號或動作" allowClear /></Form.Item></Form></div>
      <PreviewTable key={keyword} rows={events.filter(event => `${event.target} ${event.action}`.includes(keyword))} columns={auditColumns} pageKey="audit" />
    </>}
    {tab === 'backup' && <DocSectionCard title="恢復保障" icon={<CloudServerOutlined />} color="#722ED1" bg="#F9F0FF">
      <Alert type="warning" showIcon message="備份尚未接入，恢復尚未演練。不能以此頁判定資料已受保護。" />
      <div className="doc-preview__two-columns doc-preview__spaced"><div className="doc-preview__policy"><h3>保留策略（目標）</h3><p>日備份 30 天 · 月備份 12 個月</p><p>回收站 90 天內禁止永久清除</p><p>已批准版本與交接記錄不自動清理</p></div><div className="doc-preview__policy"><h3>恢復目標（未驗證）</h3><p>RPO ≤ 15 分鐘</p><p>RTO ≤ 4 小時</p><p>每月在隔離環境演練</p></div></div>
      <Descriptions items={[{ key: 'last', label: '最近備份', children: '未接入' }, { key: 'drill', label: '最近演練', children: '未驗證' }]} />
      <Button disabled>發起恢復演練（待運維接入）</Button>
    </DocSectionCard>}
    {tab === 'templates' && <div className="doc-preview__template-grid">{['系統 / 菜單設計', '功能實施', '重構整改'].map(title => <DocSectionCard key={title} title={title} icon={<FileTextOutlined />} color="#1890FF" bg="#E6F7FF">
      <Tag>模板 v1 · 示例</Tag><p>背景 → 範圍 → 現狀 → 改動 → 權限 → 實施 → 驗收 → 回滾</p><Button onClick={() => onNotice(`「${title}」模板已展示；模板版本與套用於第二階段接入。`)}>查看模板說明</Button>
    </DocSectionCard>)}</div>}
  </>
}

export function DocRetainedPreview({ kind, documents, navigate }: { kind: 'learning' | 'stats'; documents: PreviewDocument[]; navigate: PreviewNavigate }) {
  const [space, setSpace] = useState<string>()
  const rows = documents.filter(doc => !doc.deleted && doc.source === 'native' && doc.status === 'effective' && (!space || doc.space === space))
  const columns: TableColumnsType<PreviewDocument> = [
    { key: 'title', title: '文檔', dataIndex: 'title' }, { key: 'space', title: '空間', dataIndex: 'space' },
    { key: 'meaning', title: kind === 'learning' ? '學習口徑' : '統計口徑', render: () => <Tag>{kind === 'learning' ? '導航清單，不等同於簽收' : '僅計打開，不證明已讀完'}</Tag> },
    { key: 'action', title: '操作', render: (_, doc) => <Button type="link" size="small" onClick={() => navigate('read', doc.id)}>查看示例文檔</Button> },
  ]
  return <>
    <PreviewHeading icon={kind === 'learning' ? <TeamOutlined /> : <AuditOutlined />} title={kind === 'learning' ? '學習路徑' : '閱讀統計'} description="保留既有入口與能力；本次先確認定位，不重建培訓或績效系統。" />
    <Alert className="doc-preview__notice" type="info" showIcon message={kind === 'learning' ? '已打開不等於已學會，也不等於已確認某一版本。' : '新版統計需先統一空間及資源過濾，再計算次數、人數與時長；這裡不展示虛構的運行數據。'} />
    <div className="search-section"><Form layout="vertical"><Form.Item label="空間"><Select value={space} onChange={setSpace} allowClear placeholder="全部空間" options={['產品與研發', '人事制度'].map(value => ({ value, label: value }))} /></Form.Item></Form></div>
    <PreviewTable key={space ?? 'all'} rows={rows} columns={columns} pageKey={kind} />
  </>
}
