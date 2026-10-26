import { useState } from 'react'
import { Alert, Button, Descriptions, Empty, Input, Space, Steps, Switch, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreOutlined, ApiOutlined, DashboardOutlined, DatabaseOutlined, ExperimentOutlined, PlayCircleOutlined, SafetyCertificateOutlined, CloudServerOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import HelpPopover from '@/components/HelpPopover'
import StatCards from '@/components/StatCards'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import AiAssistantPageShell from '../PageShell'
import PolicyPlayground from './PolicyPlayground'
import RunPlayground from './RunPlayground'
import { DEFAULT_PREVIEW_POLICY, evaluatePreviewPolicy, PREVIEW_PANES, SCENARIOS, type PreviewPane, type PreviewScenario } from './previewModel'
import './preview.css'

const PANE_ICONS = {
  overview: <DashboardOutlined />, applications: <AppstoreOutlined />, tools: <ApiOutlined />,
  knowledge: <DatabaseOutlined />, models: <CloudServerOutlined />, security: <SafetyCertificateOutlined />,
  runs: <PlayCircleOutlined />, evaluation: <ExperimentOutlined />,
}

interface PreviewRow { key: PreviewScenario; title: string; system: string; description: string; state: string }
const APP_ROWS: PreviewRow[] = (Object.keys(SCENARIOS) as PreviewScenario[]).map(key => ({
  key, title: SCENARIOS[key].title, system: SCENARIOS[key].system,
  description: SCENARIOS[key].risk, state: '交互樣板 · 未發布',
}))

function RegistryTable({ tools = false, onOpen }: { tools?: boolean; onOpen: (scenario: PreviewScenario) => void }) {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const rows = APP_ROWS.filter(row => `${row.title} ${row.system} ${SCENARIOS[row.key].tool}`.includes(keyword))
  const columns: ColumnsType<PreviewRow> = [
    { key: 'title', title: tools ? '工具契約（示例）' : '應用名稱', render: (_, row) => <><b>{tools ? SCENARIOS[row.key].tool : row.title}</b><div className="agent-platform-preview__muted">{tools ? row.title : 'v0.1-preview · 示範應用'}</div></> },
    { key: 'system', title: '所屬系統', dataIndex: 'system' },
    { key: 'description', title: '執行邊界', dataIndex: 'description' },
    { key: 'state', title: '狀態', render: () => <Tag color="orange">未接線 · 僅演練</Tag> },
    { key: 'action', title: '操作', render: (_, row) => <Button type="link" size="small" onClick={() => onOpen(row.key)}>體驗流程</Button> },
  ]
  const meta = [{ key: 'title', title: '名稱' }, { key: 'system', title: '所屬系統' }, { key: 'description', title: '執行邊界' }, { key: 'state', title: '狀態' }, { key: 'action', title: '操作' }]
  const { applyConfig, configComponent } = useColumnConfig(`ai-platform-preview-${tools ? 'tools' : 'apps'}`, meta, [
    { key: 'title', visible: true, locked: 'head' as const }, { key: 'action', visible: true, locked: 'tail' as const },
  ])
  return (
    <section className="agent-platform-preview__card">
      <h3>{tools ? '工具目錄樣板' : '應用列表樣板'}<HelpPopover title="應用、工具與系統" ariaLabel="應用工具關係說明" content="系統保有資料與業務權限；應用綁定明確的工具、知識和版本；工具執行前必須再次校驗，不以安裝狀態代替授權。" /></h3>
      <div className="search-section"><Input.Search aria-label="搜尋樣例" placeholder="按名稱、系統或契約搜尋" value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1) }} allowClear /></div>
      <div className="action-section"><div className="action-section-left"><Tag>全部為示例資料</Tag></div><div className="action-section-right">{configComponent}</div></div>
      <Table rowKey="key" columns={applyConfig(columns)} dataSource={rows} scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: size, total: rows.length, showSizeChanger: true, showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'], showTotal: total => `共 ${total} 條示例`,
          onChange: (next, nextSize) => { setPage(nextSize !== size ? 1 : next); setSize(nextSize) } }} />
    </section>
  )
}

function KnowledgePreview() {
  const [query, setQuery] = useState('領用物資需要哪些步驟？')
  const [authorized, setAuthorized] = useState(true)
  const [result, setResult] = useState<'none' | 'hit' | 'empty'>('none')
  const handleSearch = () => setResult(authorized && /物資|領用|設備/.test(query) ? 'hit' : 'empty')
  return <section className="agent-platform-preview__card">
    <h3>知識檢索與引用樣板<HelpPopover title="先授權，再檢索" ariaLabel="知識權限說明" content={[
      { tone: 'info', body: '檢索前按原文檔 ACL 過濾；引用、計數和候選名稱也不能洩漏無權內容。' },
      { tone: 'warn', body: '本頁只匹配一份預置示例，並非真實檢索或語義評測。' },
    ]} /></h3>
    <div className="search-section"><Input.Search aria-label="知識樣例問題" value={query} onChange={event => { setQuery(event.target.value); setResult('none') }} onSearch={handleSearch} enterButton="試搜示例" />
      <span><Switch aria-label="知識樣例權限" checked={authorized} onChange={value => { setAuthorized(value); setResult('none') }} checkedChildren="有權" unCheckedChildren="無權" /> 模擬文檔權限</span>
    </div>
    {result === 'none' && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="輸入含「物資／領用／設備」的問題，體驗引用與拒答分支。" />}
    {result === 'empty' && <Alert type="warning" showIcon message="沒有可引用的授權依據" description="無命中或沒有權限，不展示受限文檔名稱、不猜測答案。" />}
    {result === 'hit' && <div className="agent-platform-preview__result">
      <h4>示例物資領用規範 <Tag>v2 · 有效 · 模擬資料</Tag></h4>
      <p>{SCENARIOS.knowledge.preview}</p><p className="agent-platform-preview__muted">引用：DOC-DEMO-01 · 片段 2 · 來源權限已通過（樣例）</p>
    </div>}
    <Descriptions className="agent-platform-preview__spaced" column={1} size="small" items={[
      { key: 'source', label: '知識源', children: '正式接線需維護同步狀態、版本、新鮮度及刪除／撤權傳播。' },
      { key: 'memory', label: '個人記憶', children: '僅保存使用者確認的偏好；不得保存授權結論，不得轉成跨系統事實庫。' },
      { key: 'retention', label: '保留策略', children: '調整前展示影響範圍；既有記憶與新寫入記憶的生效時間需分開解釋。' },
    ]} />
  </section>
}

function EvaluationPreview() {
  const [ran, setRan] = useState(false)
  const cases = [
    { title: '資源拒絕優先', input: { ...DEFAULT_PREVIEW_POLICY, authorized: false }, expected: 'deny' },
    { title: '敏感資料不能走外部端點', input: { ...DEFAULT_PREVIEW_POLICY, dataClass: 'sensitive' as const, endpoint: 'cloud' as const }, expected: 'deny' },
    { title: '預占不能重複分配', input: { ...DEFAULT_PREVIEW_POLICY }, expected: 'approval' },
    { title: '合法樣例可通過試算', input: { ...DEFAULT_PREVIEW_POLICY, estimatedCents: 500 }, expected: 'allow' },
  ]
  return <section className="agent-platform-preview__card">
    <h3>評測與發布門禁樣板<HelpPopover title="四條樣例不等於生產驗收" ariaLabel="發布門禁說明" content="這裡只執行本地規則樣例。正式發布必須綁定應用、工具、知識和策略版本，通過安全負向測試、業務驗收與故障恢復演練。" /></h3>
    <Alert type="info" showIcon message="規則樣例測試，不調用模型，也不執行完整企業評測集。" />
    <Space className="agent-platform-preview__spaced"><Button type="primary" onClick={() => setRan(true)}>運行四條規則樣例</Button><Button disabled>發布至正式環境（未接線）</Button></Space>
    {ran && <div className="agent-platform-preview__checks" aria-live="polite">{cases.map(item => {
      const decision = evaluatePreviewPolicy(item.input)
      return <div key={item.title}><Tag color={decision.kind === item.expected ? 'green' : 'red'}>{decision.kind === item.expected ? '通過' : '失敗'}</Tag><b>{item.title}</b><p>{decision.title}：{decision.reason}</p></div>
    })}</div>}
    <div className="agent-platform-preview__spaced"><h4>正式發布需完成</h4><Steps direction="vertical" size="small" current={0} items={[
      { title: '固定版本與驗收資料集', description: '不能用今天的配置解釋昨天的運行。' },
      { title: '安全、正確性與恢復測試', description: '高風險斷言必須全部通過，不能以平均分抵銷越權。' },
      { title: '差異審核與小範圍灰度', description: '展示變更影響、回滾版本、預算與應用負責人。' },
      { title: '線上反饋轉回歸樣例', description: '區分回答錯誤、工具錯誤、權限問題與資料過期。' },
    ]} /></div>
  </section>
}

/** 待用户确认的隔离交互蓝图；不改变现有菜单授权或生产配置。 */
export default function EnterpriseAgentPreview() {
  const [params, setParams] = useSearchParams()
  const [scenario, setScenario] = useState<PreviewScenario>('rdm')
  const pane = PREVIEW_PANES.find(item => item.key === params.get('pane')) ?? PREVIEW_PANES[0]
  const handlePane = (key: PreviewPane) => setParams(previous => {
    const next = new URLSearchParams(previous)
    next.set('preview', 'enterprise')
    next.set('pane', key)
    return next
  })
  const handleScenario = (key: PreviewScenario) => { setScenario(key); handlePane('runs') }

  return <AiAssistantPageShell title="企業 Agent 平台 · 交互藍圖" backTo="/ai-assistant">
    <div className="agent-platform-preview">
      <Alert type="warning" showIcon message="第一階段交互預覽｜全部為模擬資料，不代表功能已上線"
        description="不調用模型、不讀取生產資料、不發送通知、不扣費、不建立真實申請。既有人工智能系統與權限保持不變；確認體驗後再接入後端。" />
      <div className="agent-platform-preview__context"><Space wrap><Tag color="purple">環境：隔離預覽</Tag><Tag>應用版本：v0.1-preview</Tag><Tag>範圍：三個示例場景</Tag></Space>
        <HelpPopover title="怎麼體驗" ariaLabel="平台預覽使用說明" content={[
          { tone: 'info', label: '1. 看結構', body: '左側八組是目標導航，沒有替換目前的真實菜單。' },
          { tone: 'info', label: '2. 改規則', body: '在模型與成本或策略與安全中改預算、資料等級與權限，再試算。' },
          { tone: 'success', label: '3. 演練流程', body: '在運行中心體驗核對、審批、版本失效和回執待核實；所有按鈕都只改本地樣例。' },
        ]} />
      </div>
      <div className="agent-platform-preview__layout">
        <nav className="agent-platform-preview__nav" aria-label="企業 Agent 目標導航">
          {PREVIEW_PANES.map(item => <button key={item.key} type="button" aria-current={item.key === pane.key ? 'page' : undefined} onClick={() => handlePane(item.key)}>
            {PANE_ICONS[item.key]}<span>{item.label}<small>{item.description}</small></span>
          </button>)}
        </nav>
        <main className="agent-platform-preview__main">
          <div className="agent-platform-preview__heading"><div><h2>{pane.label}</h2><p>{pane.description}</p></div><Tag color="orange">交互待確認</Tag></div>
          {pane.key === 'overview' && <>
            <StatCards columns={4} items={[
              { key: 'systems', label: '示例業務場景', value: 3, icon: <AppstoreOutlined />, color: 'info' },
              { key: 'modes', label: '規劃試驗模式', value: 3, icon: <ExperimentOutlined />, color: 'system' },
              { key: 'effects', label: '本預覽生產副作用', value: 0, icon: <SafetyCertificateOutlined />, color: 'success' },
              { key: 'cost', label: '本預覽模型費用', value: 0, suffix: ' 元', icon: <CloudServerOutlined />, color: 'brand' },
            ]} />
            <section className="agent-platform-preview__card agent-platform-preview__spaced"><h3>先體驗一條完整動線</h3><div className="agent-platform-preview__scenario-grid">
              {APP_ROWS.map(row => <article key={row.key}><Tag>{row.system}</Tag><h4>{row.title}</h4><p>{SCENARIOS[row.key].question}</p><Tag color="blue">{row.description}</Tag><Button type="link" onClick={() => handleScenario(row.key)}>開始體驗 <ArrowRightOutlined /></Button></article>)}
            </div></section>
            <Alert type="info" showIcon message="真正的平台能力需要後端驗收" description="優先完成執行授權、資料邊界、原子預算、持久化 Run 和可信審批；導航調整與原型展示不代表這些能力已完成。" />
          </>}
          {pane.key === 'applications' && <RegistryTable onOpen={handleScenario} />}
          {pane.key === 'tools' && <>
            <RegistryTable tools onOpen={handleScenario} />
            <section className="agent-platform-preview__card"><h3>連接器接入檢查<HelpPopover title="安裝不等於可執行" ariaLabel="連接器狀態說明" content="必須分開驗證部署、認證、契約、授權與健康。缺少執行器時只能顯示待接入，不能把安裝開關視為可用。" /></h3>
              <Steps direction="vertical" size="small" current={0} items={['登記系統與負責人', '部署受控 API／MCP 連接器', '驗證認證、目標白名單與健康', '通過 Schema 與資源權限測試', '綁定應用、預算與審批', '小範圍發布'].map(title => ({ title }))} />
            </section>
          </>}
          {pane.key === 'knowledge' && <KnowledgePreview />}
          {(pane.key === 'models' || pane.key === 'security') && <PolicyPlayground />}
          {pane.key === 'runs' && <RunPlayground key={scenario} scenario={scenario} onScenarioChange={setScenario} />}
          {pane.key === 'evaluation' && <EvaluationPreview />}
        </main>
      </div>
    </div>
  </AiAssistantPageShell>
}
