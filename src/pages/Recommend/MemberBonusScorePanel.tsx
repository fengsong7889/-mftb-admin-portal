import { useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Input, InputNumber, Modal, Space, Switch, Tag, message } from 'antd'
import {
  EditOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
  QuestionCircleOutlined, TrophyOutlined, ThunderboltOutlined, CalculatorOutlined,
} from '@ant-design/icons'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import EnrollmentScoreTag from './AlgorithmForm/EnrollmentScoreTag'
import ScoreRow from './AlgorithmForm/ScoreRow'
import HelpPopover, { type HelpSection } from '@/components/HelpPopover'
import {
  computeMemberBonusScore, validateMemberBonusScoreConfig, memberBonusTierLabel,
  type MemberBonusScoreConfig, type MemberBonusTier,
} from './organicTrafficConfig'

/**
 * 平台会员红包计分面板（COM_06）：得分 = 报名分 + 加码分。
 * 平台配置的会员红包出资金额由商家承担，商家报名即给报名分（可用「啟用報名分」开关停用）；
 * 商家觉得力度不够可额外加码，运营按「加码金额 → 分值」配置梯度，加码越多分越高。
 * 整份配置随保存写库（member_bonus_config）。
 * 文案暂沿用算法库自然流量面板的繁中硬编码风格（该域尚未纳入 i18n 门禁），待整域抽取时统一迁移。
 */

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: MemberBonusScoreConfig
  /** 后端是否已有保存过的配置（false 时按示例模板展示） */
  hasSavedConfig: boolean
  /** 评分说明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  /** 最后修改人 / 最后修改时间：只读态工具条展示，与通用计分项同位置同格式 */
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: MemberBonusScoreConfig, description: string) => void
}

/** 固定示例加码金额（元）：改档位时标题右侧示例分值即时跟随 */
const DEMO_AMOUNT = 10

/** 试算快捷案例 */
const PREVIEW_CASES = [
  { name: '未加碼', amount: 0 },
  { name: '加碼 5 元', amount: 5 },
  { name: '加碼 10 元', amount: 10 },
  { name: '加碼 20 元', amount: 20 },
  { name: '加碼 50 元', amount: 50 },
]

export default function MemberBonusScorePanel({
  ruleName, config, hasSavedConfig, description, updatedBy, updatedAt, readOnly = false, onSave,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<MemberBonusScoreConfig>(config)
  /** 评分说明编辑值：取消时回滚到已保存值 */
  const [descDraft, setDescDraft] = useState(description)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const [previewAmount, setPreviewAmount] = useState(DEMO_AMOUNT)

  const isEditing = editing && !readOnly
  const view = isEditing ? draft : config
  const patch = (p: Partial<MemberBonusScoreConfig>) => setDraft(prev => ({ ...prev, ...p }))

  const validationError = useMemo(() => validateMemberBonusScoreConfig(draft), [draft])
  const preview = useMemo(() => computeMemberBonusScore(view, previewAmount), [view, previewAmount])
  const demo = useMemo(() => computeMemberBonusScore(view, DEMO_AMOUNT), [view])
  const demoNone = useMemo(() => computeMemberBonusScore(view, 0), [view])

  const handleEdit = () => { setDraft(config); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!descDraft.trim()) { message.warning('請填寫評分說明'); return }
    onSave(draft, descDraft.trim())
    setEditing(false)
  }

  /* ── 加码档位增删改 ── */
  const patchTier = (index: number, p: Partial<MemberBonusTier>) =>
    patch({ bonusTiers: draft.bonusTiers.map((tier, i) => i === index ? { ...tier, ...p } : tier) })
  const addTier = () => {
    const tiers = draft.bonusTiers
    const last = tiers[tiers.length - 1]
    if (!last) { patch({ bonusTiers: [{ amount: 5, score: 5 }] }); return }
    patch({ bonusTiers: [...tiers, { amount: Math.round((last.amount + 10) * 100) / 100, score: last.score }] })
  }
  const removeTier = (index: number) => {
    if (draft.bonusTiers.length <= 1) return
    patch({ bonusTiers: draft.bonusTiers.filter((_, i) => i !== index) })
  }

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(`請先修正配置：${validationError}`); return }
    setPreviewOpen(true)
  }

  return (
    <section aria-label={`${ruleName}計分配置`}>
      <div className="organic-score-toolbar">
        <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>報名分＋加碼分 · 加碼梯度</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? '編輯中' : hasSavedConfig ? '已保存配置' : '示例模板 · 尚未保存'} · 未接入真實排名
        </span>
        {/* 靠右成组：修改人/时间在按钮左侧，与通用计分项工具条位置一致 */}
        <Space style={{ marginLeft: 'auto' }} size={12}>
          {!isEditing && (updatedBy || updatedAt) && (
            <span style={{ fontSize: 11, color: '#8C8C8C', whiteSpace: 'nowrap' }}>
              {updatedBy && <>修改人：<span style={{ color: '#595959' }}>{updatedBy}</span></>}
              {updatedBy && updatedAt && <span style={{ margin: '0 4px' }}>·</span>}
              {updatedAt && <span>{updatedAt}</span>}
            </span>
          )}
          {/* 详情只读模式下父级 Form disabled 会连带禁用按钮，试算必须保留可用，因此显式 disabled={false} */}
          <Button ref={previewTrigger} aria-label="試算與說明" disabled={false} size="small"
            icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
            試算與說明
          </Button>
          {!isEditing && !readOnly && (
            <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={handleEdit}
              style={{ borderRadius: 6, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>編輯</Button>
          )}
        </Space>
      </div>

      {!isEditing ? <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info"
          extra={<FormulaHint formula="有效報名即給一次" example={`報名即得 ${view.enrollmentScore} 分`} />}>
          <div className="organic-score-panel organic-score-list">
            {/* 只读态用禁用开关回显启用状态（与券类面板同款式），保存后状态不再「消失」 */}
            <ScoreRow label="報名計分" score={view.enrollmentScore} enabled={view.enrollmentEnabled}
              control={<>
                <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={view.enrollmentEnabled} disabled />
                <EnrollmentScoreTag enabled={view.enrollmentEnabled} />
              </>}
              hint="停用後報名分值保留，僅該模組不計入得分" />
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="加碼計分檔位" icon={<ThunderboltOutlined />} tone="strategy"
          extra={<>
            <FormulaHint formula="按商家加碼金額查檔"
              example={`加碼 ${DEMO_AMOUNT} 元 → 命中 ${demo.bonusScore} 分；未加碼 → ${demoNone.bonusScore} 分`} />
            <BonusBasisTip />
          </>}>
          <div className="organic-score-panel organic-score-list">
            {view.bonusTiers.map((tier, i) => (
              <ScoreRow key={`${tier.amount}-${i}`} index={i} label={memberBonusTierLabel(tier)} score={tier.score} />
            ))}
          </div>
        </AlgorithmSection>

        {/* 评分说明是规则的 description 字段，与其他计分项一样在详情尾部展示 */}
        <div className="organic-score-note">{description}</div>
      </> : <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info"
          extra={<FormulaHint formula="有效報名即給一次" example={`報名即得 ${draft.enrollmentScore} 分`} />}>
          {/* 开关与分值并排一行，避免竖排占空间 */}
          <div className="organic-score-panel">
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用報名分</span>
              <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.enrollmentEnabled}
                onChange={v => patch({ enrollmentEnabled: v })} />
              <span className="organic-score-edit-row__label">報名分值</span>
              <InputNumber aria-label="報名分值" value={draft.enrollmentScore} min={0} max={100} disabled={!draft.enrollmentEnabled}
                onChange={v => patch({ enrollmentScore: v ?? 0 })} style={{ width: 160 }} addonAfter="分" />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>每商家只計一次有效報名</span>
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="加碼計分檔位" icon={<ThunderboltOutlined />} tone="strategy"
          extra={<>
            <FormulaHint formula="按商家加碼金額查檔" example={`加碼 ${DEMO_AMOUNT} 元 → 命中 ${demo.bonusScore} 分`} />
            <BonusBasisTip />
          </>}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>加碼得分條件</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addTier}
                style={{ color: '#E8720C' }}>添加加碼檔位</Button>
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              平台配置的出資金額由商家承擔；商家額外加碼越多分越高，命中一檔即停、分數不累加
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.bonusTiers.map((tier, i) => (
                <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#262626' }}>當商家加碼 ≥</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔加碼金額`} value={tier.amount} min={0.01} max={10000000} precision={2} step={5}
                    onChange={v => patchTier(i, { amount: v ?? 0 })} style={{ width: 150 }} addonAfter="元" />
                  <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔加碼分值`} value={tier.score} min={0} max={1000}
                    onChange={v => patchTier(i, { score: v ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                  {i > 0 && <span style={{ fontSize: 12, color: '#8C8C8C' }}>≥ 上一檔 {draft.bonusTiers[i - 1].score} 分</span>}
                  <Button aria-label={`刪除加碼第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />}
                    disabled={draft.bonusTiers.length <= 1} onClick={() => removeTier(i)} />
                </div>
              ))}
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="評分說明" icon={<QuestionCircleOutlined />} tone="info">
          <div className="organic-score-panel">
            <Input.TextArea aria-label="評分說明" value={descDraft} rows={2} maxLength={120} showCount
              placeholder="說明該計分項的取值口徑與給分邏輯（必填，最多 120 字）" onChange={e => setDescDraft(e.target.value)} />
          </div>
        </AlgorithmSection>

        {validationError && <Alert type="warning" showIcon message={validationError} style={{ marginBottom: 12 }} />}
        <div className="organic-score-edit-actions">
          <span className="algorithm-form__hint" style={{ margin: 0 }}>報名分值、加碼檔位與評分說明均會寫入後端</span>
          <Button size="small" onClick={handleCancel}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>保存</Button>
        </div>
      </>}

      <ConfigProvider componentDisabled={false}>
        <Modal title={`${ruleName} · 試算與說明`} open={previewOpen} onCancel={() => setPreviewOpen(false)}
          centered width={760} afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          footer={<Space><Button onClick={() => setPreviewAmount(DEMO_AMOUNT)}>重置試算</Button><Button onClick={() => setPreviewOpen(false)}>關閉</Button></Space>}>
          <AlgorithmSection title="規則說明" icon={<QuestionCircleOutlined />} tone="info">
            <p className="algorithm-form__hint">得分 = 報名分 + 加碼分（按商家額外加碼金額查檔）；未達首檔只拿報名分。</p>
            <p className="algorithm-form__hint">商家報名會員紅包活動，滿足條件可得報名分；紅包金額商家可自行額外加碼。</p>
            <p className="algorithm-form__hint">加碼越多分越高，按金額從低到高匹配，命中一檔即停、分數不累加；分值不得隨加碼升高而降低。</p>
          </AlgorithmSection>
          <AlgorithmSection title="示例試算" icon={<CalculatorOutlined />} tone="info">
            <Space wrap style={{ marginBottom: 16 }}>
              {PREVIEW_CASES.map(item =>
                <Button key={item.name} aria-label={item.name} size="small" onClick={() => setPreviewAmount(item.amount)}>{item.name}</Button>)}
            </Space>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>商家額外加碼金額（元，未加碼填 0）</div>
              <InputNumber aria-label="商家加碼金額" value={previewAmount} min={0} max={10000000} precision={2} step={5}
                onChange={v => setPreviewAmount(v ?? 0)} style={{ width: '100%' }} />
            </div>

            {validationError && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`請先修正配置：${validationError}`} />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <MetricCell label="命中加碼檔"
                value={preview.matchedTier ? memberBonusTierLabel(preview.matchedTier) : '未達檔位'} />
              <MetricCell label="商家加碼金額" value={`${previewAmount || 0} 元`} />
              <MetricCell label="報名分" value={`+${preview.enrollmentScore}`} color="#52C41A" />
              <MetricCell label="加碼分" value={`+${preview.bonusScore}`} color={preview.bonusScore > 0 ? '#E8720C' : '#8C8C8C'} />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16,
              padding: '14px 20px', background: '#FFF7E6', border: '1px solid #FFE7D1', borderRadius: 8,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>單項總得分 = 報名分 + 加碼分</span>
              <output aria-label="單項總得分" aria-live="polite" style={{ fontSize: 24, fontWeight: 700, color: '#E8720C' }}>{preview.total} 分</output>
            </div>
          </AlgorithmSection>
        </Modal>
      </ConfigProvider>
    </section>
  )
}

/**
 * 加码口径问号入口：只读与编辑态共用。
 * 说明超过一句且含因果，按规范走 HelpPopover 结构化分区，不用 Tooltip。
 */
function BonusBasisTip() {
  return (
    <HelpPopover
      title="加碼口徑 · 為什麼只按加碼金額計分"
      content={BONUS_BASIS_SECTIONS}
      ariaLabel="會員紅包加碼口徑說明"
      placement="bottomRight"
      width={400}
    />
  )
}

const BONUS_BASIS_SECTIONS: HelpSection[] = [
  { tone: 'warn', body: '平台配置的會員紅包出資金額由商家承擔，商家報名即得報名分。' },
  { tone: 'info', label: '額外加碼', body: '商家覺得力度不夠可自行多出資，平台鼓勵加碼吸引用戶。' },
  { tone: 'info', label: '梯度計分', body: '按商家加碼金額由低到高查檔，命中一檔即停，加碼越多分越高。' },
  { tone: 'danger', label: '未達首檔', body: '加碼低於首檔金額不加分，但仍拿報名分。' },
  { tone: 'neutral', body: '分值必須隨加碼金額單調不降，避免高分誤填到低加碼檔（保存時硬校驗）。' },
]

/** 模块内的一行公式+示例：放在区块标题右侧，不另占一块区域 */
function FormulaHint({ formula, example }: { formula: string; example: string }) {
  return <span style={{ fontSize: 12, color: '#8C8C8C' }}>公式：{formula}{' · '}例：{example}</span>
}

/** 试算指标单元格 */
function MetricCell({ label, value, color, note }: { label: string; value: string; color?: string; note?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#FAFAFA', borderRadius: 6, border: '1px solid #F0F0F0' }}>
      <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || '#262626' }}>
        {value}{note && <span style={{ fontSize: 11, fontWeight: 400, color: '#8C8C8C', marginLeft: 6 }}>{note}</span>}
      </div>
    </div>
  )
}
