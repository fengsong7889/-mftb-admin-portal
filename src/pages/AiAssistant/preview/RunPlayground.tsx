import { useState } from 'react'
import { Alert, Button, Descriptions, Input, Select, Space, Steps, Switch, Tag, Timeline } from 'antd'
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import HelpPopover from '../../../components/HelpPopover'
import { nextPreviewRunStatus, RUN_STATUS_LABEL, SCENARIOS, type PreviewRunStatus, type PreviewScenario } from './previewModel'

interface Props {
  scenario: PreviewScenario
  onScenarioChange: (scenario: PreviewScenario) => void
}

/** 固定样例的审批与异常演练；整个组件不依赖任何业务 API。 */
export default function RunPlayground({ scenario, onScenarioChange }: Props) {
  const [status, setStatus] = useState<PreviewRunStatus>('idle')
  const [uncertain, setUncertain] = useState(false)
  const [resourceChanged, setResourceChanged] = useState(false)
  const [canView, setCanView] = useState(true)
  const [notice, setNotice] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const sample = SCENARIOS[scenario]
  const isKnowledge = scenario === 'knowledge'
  const append = (text: string) => setEvents(previous => [...previous, text])

  const handleStart = () => {
    setNotice('')
    if (!canView) {
      setStatus('rejected')
      append('資源授權拒絕：不顯示文檔、項目名稱或工具返回值。')
      return
    }
    setStatus(isKnowledge ? 'succeeded' : nextPreviewRunStatus(status, 'prepare'))
    append(isKnowledge ? '已從有權樣例中取得引用；沒有調用真實模型。' : '已生成示例提案，凍結參數與資源版本；尚未發送或扣減庫存。')
  }

  const handleAction = (action: Parameters<typeof nextPreviewRunStatus>[1]) => {
    if (action === 'execute' && resourceChanged) {
      setStatus('idle')
      setResourceChanged(false)
      setNotice('資源版本已變更，原提案與審批失效。請重新生成提案並提交審批。')
      append('執行前重驗失敗：沒有執行副作用。')
      return
    }
    const next = nextPreviewRunStatus(status, action, uncertain)
    if (next === status) return
    setStatus(next)
    append(`${RUN_STATUS_LABEL[next]}${action === 'reconcile' ? '：已核實示例回執，沒有重新發送。' : ''}`)
  }

  const handleReset = () => {
    setStatus('idle')
    setEvents([])
    setNotice('')
    setResourceChanged(false)
  }
  const step = { idle: 0, prepared: 1, waiting: 2, approved: 3, succeeded: 4, rejected: 2, unknown: 3 }[status]

  return (
    <section className="agent-platform-preview__card">
      <h3><PlayCircleOutlined /> 場景操作演練
        <HelpPopover title="模擬、試跑與正式執行" ariaLabel="場景演練說明" content={[
          { tone: 'success', label: '本頁模式', body: '固定樣例、純本地狀態切換；不讀取生產資料、不調模型、不發送、不建立真實申請。' },
          { tone: 'info', label: '正式流程', body: '使用者核對提案，經原業務審批後，服務端重新校驗資源與權限才執行。' },
          { tone: 'warn', label: '結果待核實', body: '外部服務可能已受理但本地超時。應查驗回執，不能直接重發。' },
        ]} />
      </h3>
      <div className="search-section">
        <label>選擇樣例場景
          <Select aria-label="樣例場景" value={scenario} onChange={onScenarioChange}
            options={(Object.keys(SCENARIOS) as PreviewScenario[]).map(key => ({ value: key, label: SCENARIOS[key].title }))} />
        </label>
        <Tag color="purple">隔離模擬 · 固定資料 · 費用 0</Tag>
      </div>
      <Steps current={step} status={status === 'rejected' ? 'error' : 'process'} size="small"
        items={[{ title: '查詢與預檢' }, { title: '核對提案' }, { title: '業務審批' }, { title: '執行前重驗' }, { title: '回執與結果' }]} />
      <div className="agent-platform-preview__split agent-platform-preview__spaced">
        <div className="agent-platform-preview__form">
          <h4>使用者的需求</h4>
          <Input.TextArea aria-label="示例需求" value={sample.question} readOnly rows={3} />
          <Space wrap className="agent-platform-preview__spaced">
            <Tag>{sample.system}</Tag><Tag color="blue">{sample.risk}</Tag>
          </Space>
          <p><Switch aria-label="場景資源權限" checked={canView} disabled={status !== 'idle'} onChange={setCanView} checkedChildren="有權" unCheckedChildren="無權" /> 模擬資源權限</p>
          {!isKnowledge && <Space direction="vertical">
            <span><Switch aria-label="模擬外部超時" checked={uncertain} onChange={setUncertain} checkedChildren="開啟" unCheckedChildren="關閉" /> 模擬外部已受理，但本地超時</span>
            <span><Switch aria-label="模擬資源版本變更" checked={resourceChanged} onChange={setResourceChanged} checkedChildren="開啟" unCheckedChildren="關閉" /> 模擬審批後資源版本變更</span>
          </Space>}
          <div className="form-footer">
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置演練</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={status !== 'idle'}>開始模擬</Button>
          </div>
        </div>
        <div className="agent-platform-preview__result" aria-live="polite">
          <h4>本次任務 <Tag color={status === 'unknown' ? 'orange' : status === 'succeeded' ? 'green' : 'blue'}>{RUN_STATUS_LABEL[status]}</Tag></h4>
          {notice && <Alert type="warning" showIcon message={notice} />}
          {status === 'idle' && <p className="agent-platform-preview__muted">從左側開始模擬，這裡會展示結果依據、影響範圍與下一步。</p>}
          {status === 'rejected' && <Alert type="error" showIcon message="本次未執行任何操作" description="缺少資源權限或審批被拒絕；不能由模型自行放行。" />}
          {status !== 'idle' && status !== 'rejected' && <>
            <Descriptions size="small" column={1} items={[
              { key: 'run', label: '運行編號', children: 'SIM-RUN-001（本地樣例）' },
              { key: 'version', label: '應用版本', children: 'v0.1-preview · 僅示例' },
              { key: 'source', label: '資料依據', children: sample.source },
              { key: 'tool', label: '能力契約', children: sample.tool },
            ]} />
            <pre className="agent-platform-preview__artifact">{sample.preview}</pre>
            {status === 'prepared' && <Button type="primary" onClick={() => handleAction('submit')}>模擬提交審批</Button>}
            {status === 'waiting' && <>
              <Alert type="info" showIcon message="等待示例業務審批人，尚未執行" />
              <Space className="agent-platform-preview__spaced">
                <Button type="primary" onClick={() => handleAction('approve')}>模擬批准</Button>
                <Button danger onClick={() => handleAction('reject')}>模擬拒絕</Button>
              </Space>
            </>}
            {status === 'approved' && <Button type="primary" onClick={() => handleAction('execute')}>模擬執行前重驗與執行</Button>}
            {status === 'unknown' && <>
              <Alert type="warning" showIcon message="可能已受理：先核實，不能重發" description="此處只演示不確定結果處置，沒有真正發送資料。" />
              <Button className="agent-platform-preview__spaced" onClick={() => handleAction('reconcile')}>模擬查驗回執</Button>
            </>}
            {status === 'succeeded' && <Alert type="success" showIcon message="演練完成，沒有生產副作用" description={isKnowledge ? '展示的是預置回答與授權來源示例，不是真實檢索結果。' : '正式環境須以原系統或渠道回執為準；本頁只展示成功分支。'} />}
          </>}
        </div>
      </div>
      {events.length > 0 && <div className="agent-platform-preview__spaced">
        <h4>模擬事件軌跡 <Tag>不是生產審計</Tag></h4>
        <Timeline items={events.map((event, index) => ({ children: `${index + 1}. ${event}` }))} />
      </div>}
    </section>
  )
}
