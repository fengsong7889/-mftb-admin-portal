import { useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Drawer, InputNumber, Space, Switch, Tag, Tooltip, message } from 'antd'
import {
  EditOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
  QuestionCircleOutlined, TrophyOutlined, ThunderboltOutlined,
  SafetyCertificateOutlined, CalculatorOutlined,
} from '@ant-design/icons'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import ScoreRow from './AlgorithmForm/ScoreRow'
import {
  validateCouponIntensityConfig,
  type CouponIntensityConfig, type IntensityTier, type ThresholdCoefficientTier,
} from './organicTrafficConfig'

/** 金额/比例统一保留两位小数（仅最终展示时四舍五入，比较前不取整） */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** 试算结果 */
interface PreviewResult {
  canCompute: boolean
  reason?: string
  X: number
  D: number
  R: number
  intensityTier?: IntensityTier
  M: number
  coefficientTier?: ThresholdCoefficientTier
  coefficient: number
  enrollmentScore: number
  intensityScore: number
  total: number
}

/** 依据配置与试算输入计算单项得分（口径见方案：X=max(B,T)，D=min(券面,X)，R=D/X，M=T/B） */
function computePreview(cfg: CouponIntensityConfig, B: number, T: number, amount: number): PreviewResult {
  const threshold = T || 0
  const coupon = amount || 0
  if (!B || B <= 0) {
    return {
      canCompute: false, reason: '缺少可信基準客單價（B≤0），無法計算力度分；生產不得回退為券面金額×倍率。',
      X: threshold, D: Math.min(coupon, threshold), R: threshold > 0 ? round2(Math.min(coupon, threshold) / threshold * 100) : 0,
      M: 0, coefficient: 0, enrollmentScore: cfg.enrollmentEnabled ? cfg.enrollmentScore : 0, intensityScore: 0,
      total: cfg.enrollmentEnabled ? cfg.enrollmentScore : 0,
    }
  }
  const X = Math.max(B, threshold)
  const D = Math.min(coupon, X)
  const R = X > 0 ? (D / X) * 100 : 0
  // 用金额交叉比较避免 29 / 100 * 100 的浮点误差造成边界错档。
  const intensityTier = cfg.intensityTiers.find((tier, index) =>
    D * 100 >= tier.minRate * X && (index === cfg.intensityTiers.length - 1
      ? D * 100 <= tier.maxRate * X : D * 100 < tier.maxRate * X))
  const M = threshold / B
  const coefficientTier = cfg.thresholdTiers.find(tier => threshold <= tier.maxMultiplier * B)
  const coefficient = coefficientTier?.coefficient ?? 0
  const baseIntensity = intensityTier?.score ?? 0
  const rawIntensity = baseIntensity * coefficient
  const intensityScore = cfg.intensityEnabled ? round2(Math.min(rawIntensity, cfg.intensityCap)) : 0
  const enrollmentScore = cfg.enrollmentEnabled ? cfg.enrollmentScore : 0
  return {
    canCompute: true, X, D, R: round2(R), intensityTier, M: round2(M), coefficientTier, coefficient,
    enrollmentScore, intensityScore, total: round2(enrollmentScore + intensityScore),
  }
}

/** 力度档位区间文案 */
function intensityRangeLabel(t: IntensityTier, isLast: boolean): string {
  const lo = `${t.minRate}%`
  const hi = isLast ? `${t.maxRate}%（含）` : `< ${t.maxRate}%`
  return isLast ? `≥ ${t.minRate}% 且 ≤ ${t.maxRate}%` : `≥ ${lo} 且 ${hi}`
}

function thresholdRangeLabel(tiers: ThresholdCoefficientTier[], index: number): string {
  const lower = index === 0 ? '0 ≤ M' : `${tiers[index - 1].maxMultiplier} < M`
  return tiers[index].maxMultiplier === Infinity ? lower : `${lower} ≤ ${tiers[index].maxMultiplier}`
}

interface Props {
  ruleName: string
  config: CouponIntensityConfig
  editing: boolean
  readOnly?: boolean
  hasDraft: boolean
  onChange: (config: CouponIntensityConfig) => void
  onEdit: () => void
  onCancel: () => void
  onSave: (config: CouponIntensityConfig) => void
}

const PREVIEW_CASES = [
  { name: '早餐店滿 10 減 3', B: 10, T: 10, amount: 3 },
  { name: '早餐店無門檻減 3', B: 10, T: 0, amount: 3 },
  { name: '正常餐廳滿 100 減 60', B: 100, T: 100, amount: 60 },
  { name: '早餐店超高門檻券', B: 10, T: 6000, amount: 10000 },
  { name: '高客單餐廳（基準 6000）', B: 6000, T: 6000, amount: 5000 },
  { name: '高客單餐廳（基準 5000）', B: 5000, T: 6000, amount: 5000 },
]

/** 原位配置受父页面控制；抽屉只操作试算金额，不修改配置。 */
export default function CouponIntensityPanel({ ruleName, config, editing, readOnly = false, hasDraft,
  onChange, onEdit, onCancel, onSave }: Props) {
  const isEditing = editing && !readOnly
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const [benchmark, setBenchmark] = useState<number>(100)
  const [threshold, setThreshold] = useState<number>(100)
  const [couponAmount, setCouponAmount] = useState<number>(60)

  const patch = (p: Partial<CouponIntensityConfig>) => { if (isEditing) onChange({ ...config, ...p }) }

  const updateIntensityTier = (index: number, p: Partial<IntensityTier>) => {
    patch({ intensityTiers: config.intensityTiers.map((tier, i) => i === index ? { ...tier, ...p } : tier) })
  }
  const addIntensityTier = () => {
    // 拆分末档，避免默认已覆盖 100% 时添加出 100%～100% 的无效区间。
    const tiers = config.intensityTiers
    const last = tiers[tiers.length - 1]
    if (!last) return
    const middle = round2((last.minRate + last.maxRate) / 2)
    if (middle <= last.minRate || middle >= last.maxRate) { message.warning('末檔區間過小，無法繼續拆分'); return }
    patch({ intensityTiers: [...tiers.slice(0, -1), { ...last, maxRate: middle }, { ...last, minRate: middle }] })
  }
  const removeIntensityTier = (index: number) => {
    const tiers = config.intensityTiers.map(tier => ({ ...tier }))
    if (tiers.length <= 1) return
    if (index === 0) tiers[1].minRate = tiers[0].minRate
    else tiers[index - 1].maxRate = tiers[index].maxRate
    patch({ intensityTiers: tiers.filter((_, i) => i !== index) })
  }

  const updateThresholdTier = (index: number, p: Partial<ThresholdCoefficientTier>) => {
    patch({ thresholdTiers: config.thresholdTiers.map((tier, i) => i === index ? { ...tier, ...p } : tier) })
  }
  const addThresholdTier = () => {
    const tiers = [...config.thresholdTiers]
    const lastIdx = tiers.length - 1
    const prevMax = lastIdx > 0 ? tiers[lastIdx - 1].maxMultiplier : 1
    tiers.splice(lastIdx, 0, { maxMultiplier: prevMax + 0.5, coefficient: tiers[lastIdx].coefficient })
    patch({ thresholdTiers: tiers })
  }
  const removeThresholdTier = (index: number) => {
    patch({ thresholdTiers: config.thresholdTiers.filter((_, i) => i !== index) })
  }

  const validationError = validateCouponIntensityConfig(config)
  const preview = useMemo(() => validationError ? null : computePreview(config, benchmark, threshold, couponAmount),
    [config, benchmark, threshold, couponAmount, validationError])

  const handleSave = () => {
    if (!isEditing) return
    if (validationError) { message.warning(validationError); return }
    onSave(config)
  }
  const handleOpenPreview = () => {
    if (validationError) { message.warning(`請先修正配置：${validationError}`); return }
    setPreviewOpen(true)
  }
  const handleResetPreview = () => { setBenchmark(100); setThreshold(100); setCouponAmount(60) }

  return (
    <section aria-label={`${ruleName}優惠配置`}>
      <div className="organic-score-toolbar">
        <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>報名分＋優惠力度分</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? '編輯中' : hasDraft ? '當前頁面草稿' : '示例模板'} · 未接入真實排名
        </span>
        <Space style={{ marginLeft: 'auto' }}>
          <Button ref={previewTrigger} aria-label="試算與說明" disabled={false} size="small" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
            試算與說明
          </Button>
          {!isEditing && !readOnly && <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={onEdit}
            style={{ borderRadius: 6, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>編輯</Button>}
        </Space>
      </div>
      <p className="algorithm-form__hint">保存僅保留當前頁面草稿；刷新或離開頁面後不保留，不覆蓋後端原有規則。</p>
      {isEditing && validationError && <Alert type="warning" showIcon message={validationError} style={{ marginBottom: 12 }} />}
      {!isEditing ? <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info">
          <div className="organic-score-panel">
            <ScoreRow label="報名計分" score={config.enrollmentScore} enabled={config.enrollmentEnabled}
              control={<Switch size="small" aria-label="報名計分" checked={config.enrollmentEnabled} disabled />}
              hint="每門店、每活動類型僅計一次有效報名。" />
          </div>
        </AlgorithmSection>
        <AlgorithmSection title="優惠力度" icon={<ThunderboltOutlined />} tone="strategy"
          extra={<span>{config.intensityEnabled ? `啟用 · 上限 ${config.intensityCap} 分` : '停用'}</span>}>
          <div className="organic-score-panel organic-score-list">
            {config.intensityTiers.map((tier, index) => <ScoreRow key={index} index={index}
              label={intensityRangeLabel(tier, index === config.intensityTiers.length - 1)}
              score={tier.score} enabled={config.intensityEnabled} />)}
          </div>
        </AlgorithmSection>
        <AlgorithmSection title="門檻保護" icon={<SafetyCertificateOutlined />} tone="advanced">
          <div className="organic-score-panel organic-score-list">
            {config.thresholdTiers.map((tier, index) => <ScoreRow key={index} index={index}
              label={thresholdRangeLabel(config.thresholdTiers, index)} score={tier.coefficient}
              kind="coefficient" enabled={config.intensityEnabled} />)}
          </div>
          <p className="organic-score-note">缺少可信基準時不計算力度分；完整口徑見「試算與說明」。</p>
        </AlgorithmSection>
      </> : <>
      {/* 1. 报名计分 */}
      <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info">
        <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="organic-score-edit-row">
            <span className="organic-score-edit-row__label">啟用報名分</span>
            <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={config.enrollmentEnabled} onChange={v => patch({ enrollmentEnabled: v })} />
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>每門店、每活動類型只給一次報名分，多張券不重複加報名分</span>
          </div>
          <div className="organic-score-edit-row">
            <span className="organic-score-edit-row__label">報名分值</span>
            <InputNumber aria-label="報名分值" value={config.enrollmentScore} min={0} max={100} disabled={!config.enrollmentEnabled}
              onChange={v => patch({ enrollmentScore: v ?? 0 })} style={{ width: 160 }} addonAfter="分" />
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: '20px', background: '#FAFAFA', borderRadius: 6, padding: '10px 12px' }}>
            有效報名定義：報名生效、處於活動期、活動未停用，且有可領取或可核銷的有效優惠。歷史報名記錄不永久給分；門檻過高但活動真實有效時力度分可為 0，報名分保留；僅確認虛假活動才取消報名資格。
          </div>
        </div>
      </AlgorithmSection>

      {/* 2. 优惠力度 */}
      <AlgorithmSection title="優惠力度" icon={<ThunderboltOutlined />} tone="strategy"
        extra={<span style={{ fontSize: 12, color: '#8C8C8C' }}>R = 有效抵扣額 / 參考消費額，單檔命中不累加</span>}>
        <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="organic-score-edit-row">
            <span className="organic-score-edit-row__label">啟用力度分</span>
            <Switch aria-label="啟用力度分" checkedChildren="啟用" unCheckedChildren="停用" checked={config.intensityEnabled} onChange={v => patch({ intensityEnabled: v })} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>優惠比例檔位</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addIntensityTier} disabled={!config.intensityEnabled} style={{ color: '#E8720C' }}>添加比例檔位</Button>
            </div>
            <div className="organic-score-edit-table"><div className="organic-score-edit-table__content" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 40px', gap: 12, fontSize: 12, color: '#8C8C8C' }}>
                <span>下界（含，%）</span><span>上界（末檔含 100%）</span><span>力度基礎分</span><span>區間預覽</span><span />
              </div>
              {config.intensityTiers.map((t, i) => {
                const isLast = i === config.intensityTiers.length - 1
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 40px', gap: 12, alignItems: 'center' }}>
                    <InputNumber aria-label={`第 ${i + 1} 檔優惠比例下界`} value={t.minRate} min={0} max={100} disabled={!config.intensityEnabled} onChange={v => updateIntensityTier(i, { minRate: v ?? 0 })} style={{ width: '100%' }} addonAfter="%" />
                    <InputNumber aria-label={`第 ${i + 1} 檔優惠比例上界`} value={t.maxRate} min={0} max={100} disabled={!config.intensityEnabled} onChange={v => updateIntensityTier(i, { maxRate: v ?? 0 })} style={{ width: '100%' }} addonAfter="%" />
                    <InputNumber aria-label={`第 ${i + 1} 檔力度基礎分`} value={t.score} min={0} max={1000} disabled={!config.intensityEnabled} onChange={v => updateIntensityTier(i, { score: v ?? 0 })} style={{ width: '100%' }} addonAfter="分" />
                    <span style={{ fontSize: 12, color: '#595959' }}>{intensityRangeLabel(t, isLast)}</span>
                    <Button aria-label={`刪除優惠比例第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />} disabled={!config.intensityEnabled || config.intensityTiers.length <= 1} onClick={() => removeIntensityTier(i)} />
                  </div>
                )
              })}
            </div></div>
          </div>
          <div className="organic-score-edit-row">
            <span className="organic-score-edit-row__label">力度分上限</span>
            <InputNumber aria-label="力度分上限" value={config.intensityCap} min={0} max={1000} disabled={!config.intensityEnabled} onChange={v => patch({ intensityCap: v ?? 0 })} style={{ width: 160 }} addonAfter="分" />
            <Tooltip title="對單項力度分封頂，避免優惠分壓過餐點質量與履約表現">
              <QuestionCircleOutlined style={{ color: '#8C8C8C' }} />
            </Tooltip>
          </div>
        </div>
      </AlgorithmSection>

      {/* 3. 门槛保护 */}
      <AlgorithmSection title="門檻保護" icon={<SafetyCertificateOutlined />} tone="advanced"
        extra={<span style={{ fontSize: 12, color: '#8C8C8C' }}>M = 使用門檻 / 基準客單價，單檔命中不累加</span>}>
        <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#595959', lineHeight: '20px', background: '#FFF7F0', border: '1px solid #FFE7D1', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, color: '#262626', marginBottom: 4 }}>基準口徑（統一，五項共用）</div>
            {config.benchmarkDescription}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>門檻可達係數</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addThresholdTier} disabled={!config.intensityEnabled} style={{ color: '#E8720C' }}>添加門檻檔位</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 12, fontSize: 12, color: '#8C8C8C' }}>
                <span>門檻倍數上界</span><span>力度折減係數（0~1）</span><span />
              </div>
              {config.thresholdTiers.map((t, i) => {
                const isInfinite = t.maxMultiplier === Infinity
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 40px', gap: 12, alignItems: 'center' }}>
                    {isInfinite
                      ? <Tag color="default" style={{ margin: 0, height: 32, lineHeight: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>不限（兜底檔）</Tag>
                      : <InputNumber aria-label={`第 ${i + 1} 檔門檻倍數上界`} disabled={!config.intensityEnabled} value={t.maxMultiplier} min={0.01} step={0.5} onChange={v => updateThresholdTier(i, { maxMultiplier: v ?? 0 })} style={{ width: '100%' }} addonAfter="倍" />}
                    <InputNumber aria-label={`第 ${i + 1} 檔門檻係數`} disabled={!config.intensityEnabled} value={t.coefficient} min={0} max={1} step={0.1} onChange={v => updateThresholdTier(i, { coefficient: v ?? 0 })} style={{ width: '100%' }} />
                    <Button aria-label={`刪除門檻第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />} disabled={!config.intensityEnabled || isInfinite || i === 0 || config.thresholdTiers.length <= 2} onClick={() => removeThresholdTier(i)} />
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: '20px' }}>
            缺少基準處理：連同可信參考基準也不存在時，顯示「缺少基準，無法計算力度分」，生產不得回退為券面金額×倍率。高門檻只影響當前場景曝光獎勵，不直接禁止商家發券或判定欺詐。
          </div>
        </div>
      </AlgorithmSection>

      <div className="organic-score-edit-actions">
        <span className="algorithm-form__hint" style={{ margin: 0 }}>僅保存當前頁面草稿</span>
        <Button size="small" onClick={onCancel}>取消</Button>
        <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>保存</Button>
      </div>
      </>}

      <ConfigProvider componentDisabled={false}>
      <Drawer title={`${ruleName} · 試算與說明`} open={previewOpen} onClose={() => setPreviewOpen(false)}
        width="min(760px, 100vw)" afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
        footer={<Space><Button onClick={handleResetPreview}>重置試算</Button><Button onClick={() => setPreviewOpen(false)}>關閉</Button></Space>}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={isEditing ? '未保存配置試算' : hasDraft ? '當前頁面草稿試算' : '示例模板試算'}
          description="未接入真實排名。試算金額與配置獨立，關閉不會保存配置或退出編輯。" />
        <AlgorithmSection title="規則說明" icon={<QuestionCircleOutlined />} tone="info">
          <p className="algorithm-form__hint">參考消費 X = max(B,T)；有效抵扣 D = min(券面,X)；優惠比例 R = D/X；門檻倍數 M = T/B。</p>
          <p className="algorithm-form__hint">總分 = 報名分 + min(力度基礎分 × 門檻係數, 力度分上限)。兩個計分開關分別控制對應分值。</p>
          <p className="algorithm-form__hint">{config.benchmarkDescription}</p>
          <p className="algorithm-form__hint">示例假設已有效報名、商品可用、允許抵至零元且不找零；平台與商家補貼合計，五類活動獨立累加，不處理互斥。</p>
        </AlgorithmSection>
        <AlgorithmSection title="示例試算" icon={<CalculatorOutlined />} tone="info">
          <Space wrap style={{ marginBottom: 16 }}>{PREVIEW_CASES.map(item =>
            <Button key={item.name} aria-label={item.name} size="small" onClick={() => {
              setBenchmark(item.B); setThreshold(item.T); setCouponAmount(item.amount)
            }}>{item.name}</Button>)}
          </Space>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>基準客單價 B（元）</div>
              <InputNumber aria-label="基準客單價 B" value={benchmark} min={0} max={10000000} precision={2} step={10} onChange={v => setBenchmark(v ?? 0)} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>使用門檻 T（元，無門檻填 0）</div>
              <InputNumber aria-label="使用門檻 T" value={threshold} min={0} max={10000000} precision={2} step={10} onChange={v => setThreshold(v ?? 0)} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>券面金額（元）</div>
              <InputNumber aria-label="券面金額" value={couponAmount} min={0} max={10000000} precision={2} step={10} onChange={v => setCouponAmount(v ?? 0)} style={{ width: '100%' }} />
            </div>
          </div>

          {validationError && <Alert type="warning" showIcon message={`請先修正配置：${validationError}`} />}
          {preview && <>
          {!preview.canCompute && (
            <Alert type="info" showIcon message={preview.reason} />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <MetricCell label="參考消費金額 X = max(B,T)" value={`${round2(preview.X)} 元`} />
            <MetricCell label="有效抵扣額 D = min(券面, X)" value={`${round2(preview.D)} 元`} />
            <MetricCell label="優惠比例 R = D / X" value={`${preview.R}%`} highlight="#E8720C" />
            <MetricCell label="門檻倍數 M = T / B" value={preview.canCompute ? `${preview.M} 倍` : '—'} highlight="#1890FF" />
            <MetricCell label="命中力度檔" value={preview.intensityTier ? `${preview.intensityTier.score} 分` : '未命中'} />
            <MetricCell label="命中門檻係數" value={preview.coefficientTier ? `× ${preview.coefficient}` : '—'} />
            <MetricCell label="報名分" value={`+${preview.enrollmentScore}`} color="#52C41A" />
            <MetricCell label="力度分（封頂後）" value={`+${preview.intensityScore}`} color="#E8720C" />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', background: '#FFF7E6', border: '1px solid #FFE7D1', borderRadius: 8,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>單項總得分 = 報名分 + 折減封頂後的力度分</span>
            <output aria-label="單項總得分" aria-live="polite" style={{ fontSize: 24, fontWeight: 700, color: '#E8720C' }}>{preview.total} 分</output>
          </div>
          </>}
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: '20px' }}>
            說明：同活動類型有多張券或多檔門檻時，逐條試算取力度得分最高的一條，不把券面金額相加。券面金額始終受單筆可抵扣餘額限制；無門檻不意味著券面金額都能抵扣，也不意味著必然滿分。
          </div>
        </div>
      </AlgorithmSection>

      </Drawer>
      </ConfigProvider>
    </section>
  )
}

/** 试算指标单元格 */
function MetricCell({ label, value, color, highlight }: { label: string; value: string; color?: string; highlight?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#FAFAFA', borderRadius: 6, border: '1px solid #F0F0F0' }}>
      <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || highlight || '#262626' }}>{value}</div>
    </div>
  )
}
