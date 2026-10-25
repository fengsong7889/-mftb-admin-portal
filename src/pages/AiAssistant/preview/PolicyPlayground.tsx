import { useState } from 'react'
import { Alert, Button, Form, InputNumber, Select, Space, Switch, Tag } from 'antd'
import { ExperimentOutlined, ReloadOutlined } from '@ant-design/icons'
import HelpPopover from '../../../components/HelpPopover'
import { DEFAULT_PREVIEW_POLICY, evaluatePreviewPolicy, formatPreviewMoney, type PreviewPolicyInput } from './previewModel'

const AMOUNT_FIELDS = [
  { key: 'budgetCents', label: '本期預算', help: '本期可使用的總額；樣例以人民幣計算。' },
  { key: 'usedCents', label: '已結算用量', help: '已實際消耗並結算的費用，不包含仍在運行的任務預占。' },
  { key: 'reservedCents', label: '其他任務預占', help: '其他運行已保留但未結算的預算；不能把這部分額度再次分配。' },
  { key: 'estimatedCents', label: '本次預估費用', help: '本次調用預計需要的預算。正式環境由服務端估算及原子預占，並按實際用量結算。' },
] as const

/** 纯前端规则交互样板，不调用真实模型、不写预算，也不提供生产保存按钮。 */
export default function PolicyPlayground() {
  const [input, setInput] = useState<PreviewPolicyInput>({ ...DEFAULT_PREVIEW_POLICY })
  const [snapshot, setSnapshot] = useState<PreviewPolicyInput>({ ...DEFAULT_PREVIEW_POLICY })
  const decision = evaluatePreviewPolicy(snapshot)
  const dirty = JSON.stringify(input) !== JSON.stringify(snapshot)
  const handleReset = () => {
    setInput({ ...DEFAULT_PREVIEW_POLICY })
    setSnapshot({ ...DEFAULT_PREVIEW_POLICY })
  }

  return (
    <section className="agent-platform-preview__card">
      <h3><ExperimentOutlined /> 規則試算
        <HelpPopover title="試算不是正式執行" ariaLabel="規則試算說明" content={[
          { tone: 'info', label: '怎麼用', body: '修改左側樣例條件，再點「重新試算」，右側展示命中規則與下一步。' },
          { tone: 'warn', label: '邊界', body: '本頁只演示交互，不讀取生產資料、不調用模型、不扣費。正式接線後必須由同一個後端策略服務提供試算和執行裁決。' },
        ]} />
      </h3>
      <div className="agent-platform-preview__split">
        <Form layout="vertical" className="agent-platform-preview__form">
          <div className="agent-platform-preview__fields">
            {AMOUNT_FIELDS.map(field => (
              <Form.Item key={field.key} label={<span>{field.label}<HelpPopover title={field.label} ariaLabel={`${field.label}說明`} content={field.help} /></span>}>
                <InputNumber aria-label={field.label} min={0} max={1_000_000} precision={2} addonAfter="元"
                  value={input[field.key] / 100} onChange={value => setInput(prev => ({ ...prev, [field.key]: Math.round((value ?? 0) * 100) }))} />
              </Form.Item>
            ))}
          </div>
          <div className="agent-platform-preview__fields">
            <Form.Item label={<span>資料等級<HelpPopover title="資料出域" ariaLabel="資料等級說明" content="未分類、內部及敏感資料不能因為外部模型更便宜就直接出域；本樣例只允許公開資料使用外部端點。" /></span>}>
              <Select aria-label="資料等級" value={input.dataClass} onChange={dataClass => setInput(prev => ({ ...prev, dataClass }))}
                options={[{ value: 'public', label: '公開' }, { value: 'internal', label: '企業內部' }, { value: 'sensitive', label: '敏感' }]} />
            </Form.Item>
            <Form.Item label="模型部署端點">
              <Select aria-label="模型部署端點" value={input.endpoint} onChange={endpoint => setInput(prev => ({ ...prev, endpoint }))}
                options={[{ value: 'private', label: '企業私域端點（示例）' }, { value: 'cloud', label: '外部模型端點（示例）' }]} />
            </Form.Item>
          </div>
          <Space wrap size={20}>
            <span>具備資源權限 <Switch aria-label="模擬資源權限" checked={input.authorized} onChange={authorized => setInput(prev => ({ ...prev, authorized }))} checkedChildren="有" unCheckedChildren="無" /></span>
            <span>需要動作審批 <Switch aria-label="模擬動作審批" checked={input.approvalRequired} onChange={approvalRequired => setInput(prev => ({ ...prev, approvalRequired }))} checkedChildren="是" unCheckedChildren="否" /></span>
          </Space>
          <div className="form-footer">
            <Button icon={<ReloadOutlined />} onClick={handleReset}>還原示例</Button>
            <Button type="primary" onClick={() => setSnapshot({ ...input })}>重新試算</Button>
          </div>
        </Form>
        <div className="agent-platform-preview__result" aria-live="polite">
          <Space><h4>試算結果</h4><Tag color="purple">規則樣例 · 不扣費</Tag></Space>
          {dirty && <Alert type="info" showIcon message="條件已變更，請重新試算；下方仍是上次結果。" />}
          <div className="agent-platform-preview__amount">{formatPreviewMoney(decision.availableCents)}<small>元可用</small></div>
          <Alert showIcon type={decision.kind === 'allow' ? 'success' : decision.kind === 'deny' ? 'error' : 'warning'} message={decision.title} description={decision.reason} />
          <ol>{decision.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <p className="agent-platform-preview__muted">裁決順序：資源權限 → 資料邊界 → 預算 → 動作審批。正式環境不信任本頁輸入的權限或金額。</p>
        </div>
      </div>
    </section>
  )
}
