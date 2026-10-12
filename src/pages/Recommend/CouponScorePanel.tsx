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
  computeCouponScore, validateCouponScoreConfig, couponScoreMonotonicHint,
  thresholdBandLabel, discountBandLabel,
  type CouponScoreConfig, type DiscountBand, type ThresholdBand,
} from './organicTrafficConfig'

/**
 * 券类计分 v1 面板（进店领券试点）：得分 = 报名分 + 门槛分 + 力度分。
 * 基准直接取系统已有的「门店客单价」指标（与满额立减共用），面板不再提供统计口径配置。
 * 与旧面板（比例档 × 门槛系数）的区别是三条线各自查表后直接相加，
 * 运营只需「看条件读分数」，不再心算折减系数。
 */

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: CouponScoreConfig
  hasDraft: boolean
  readOnly?: boolean
  onSave: (config: CouponScoreConfig) => void
}

/** 基准来源：门店客单价由订单域指标提供，后台不配统计口径 */
const BENCHMARK_SOURCE = '基準 = 門店客單價（系統已有的門店指標，與滿額立減共用；統計口徑與新店回退規則由訂單指標側維護，此處不配置）。'

const PREVIEW_CASES = [
  { name: '早餐店滿 10 減 3', B: 10, T: 10, amount: 3 },
  { name: '早餐店無門檻減 3', B: 10, T: 0, amount: 3 },
  { name: '正常餐廳滿 100 減 60', B: 100, T: 100, amount: 60 },
  { name: '高門檻真狠券滿 200 減 100', B: 100, T: 200, amount: 100 },
  { name: '空轉券滿 290 減 10', B: 100, T: 290, amount: 10 },
]

export default function CouponScorePanel({ ruleName, config, hasDraft, readOnly = false, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CouponScoreConfig>(config)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const [benchmark, setBenchmark] = useState(100)
  const [threshold, setThreshold] = useState(100)
  const [couponAmount, setCouponAmount] = useState(60)

  const isEditing = editing && !readOnly
  const view = isEditing ? draft : config
  const patch = (p: Partial<CouponScoreConfig>) => setDraft(prev => ({ ...prev, ...p }))

  const validationError = useMemo(() => validateCouponScoreConfig(draft), [draft])
  const monotonicHint = useMemo(() => couponScoreMonotonicHint(draft), [draft])
  const preview = useMemo(() => computeCouponScore(view, benchmark, threshold, couponAmount), [view, benchmark, threshold, couponAmount])
  /** 模块内示例的固定门店：客单价 100 元、發「滿 150 減 30」，另取一家「滿 290 減 100」演示闸门拦截 */
  const demo = useMemo(() => computeCouponScore(view, 100, 150, 30), [view])
  const demoBlocked = useMemo(() => computeCouponScore(view, 100, 290, 100), [view])

  const handleEdit = () => { setDraft(config); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (monotonicHint) message.info(monotonicHint)
    onSave(draft)
    setEditing(false)
    message.info('已保存當前頁面草稿；刷新或離開頁面後不保留，未寫入後端。')
  }

  /* ── 门槛档位增删改 ── */
  const patchThresholdBand = (index: number, p: Partial<ThresholdBand>) =>
    patch({ thresholdBands: draft.thresholdBands.map((band, i) => i === index ? { ...band, ...p } : band) })
  const addThresholdBand = () => {
    const bands = draft.thresholdBands
    const last = bands[bands.length - 2]
    if (!last || last.upper === Infinity) return
    const upper = Math.round((last.upper + 0.5) * 100) / 100
    patch({ thresholdBands: [...bands.slice(0, -1), { upper, score: last.score }, bands[bands.length - 1]] })
  }
  const removeThresholdBand = (index: number) => {
    const bands = draft.thresholdBands
    if (bands.length <= 2 || bands[index].upper === Infinity) return
    patch({ thresholdBands: bands.filter((_, i) => i !== index) })
  }

  /* ── 力度档位增删改 ── */
  const patchDiscountBand = (index: number, p: Partial<DiscountBand>) =>
    patch({ discountBands: draft.discountBands.map((band, i) => i === index ? { ...band, ...p } : band) })
  const addDiscountBand = () => {
    const bands = draft.discountBands
    const bottom = bands[bands.length - 1]
    const prev = bands[bands.length - 2]
    if (!bottom || bottom.lower !== 0 || !prev) return
    const lower = Math.max(1, Math.floor(prev.lower / 2))
    if (lower >= prev.lower) { message.warning('末檔區間過小，無法繼續拆分'); return }
    patch({ discountBands: [...bands.slice(0, -1), { lower, score: prev.score }, bottom] })
  }
  const removeDiscountBand = (index: number) => {
    const bands = draft.discountBands
    if (bands.length <= 2 || bands[index].lower === 0) return
    patch({ discountBands: bands.filter((_, i) => i !== index) })
  }

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(`請先修正配置：${validationError}`); return }
    setPreviewOpen(true)
  }

  return (
    <section aria-label={`${ruleName}計分配置`}>
      <div className="organic-score-toolbar">
        <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>方案 v1 · 報名分＋門檻分＋力度分</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? '編輯中' : hasDraft ? '當前頁面草稿' : '示例模板'} · 未接入真實排名
        </span>
        <Space style={{ marginLeft: 'auto' }}>
          <Button ref={previewTrigger} aria-label="試算與說明" size="small" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
            試算與說明
          </Button>
          {!isEditing && !readOnly && (
            <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={handleEdit}
              style={{ borderRadius: 6, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>編輯</Button>
          )}
        </Space>
      </div>
      <p className="algorithm-form__hint">
        得分 = 報名分 + 門檻分 +（通過閘門時的）力度分；門檻與券面都換算成「÷ 門店客單價」的倍數後查檔；門檻越低於客單價分越高。
      </p>
      <p className="algorithm-form__hint">{BENCHMARK_SOURCE}</p>

      {!isEditing ? <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info"
          extra={<FormulaHint formula="有效報名即給一次" example={`同活動發 3 張券也只給 ${view.enrollmentScore} 分`} />}>
          <div className="organic-score-panel organic-score-list">
            <ScoreRow label="報名計分" score={view.enrollmentScore} enabled={view.enrollmentEnabled}
              control={<Switch size="small" aria-label="報名計分" checked={view.enrollmentEnabled} disabled />}
              hint="每門店、每活動只計一次有效報名；多張券不重複發報名分。" />
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻計分檔位" icon={<SafetyCertificateOutlined />} tone="strategy"
          extra={<FormulaHint formula="使用門檻 ÷ 門店客單價" example={`150 ÷ 100 = ${demo.thresholdRatio} 倍 → 命中 ${demo.thresholdScore} 分；單檔命中不累加`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">啟用門檻計分</div>
                <Switch size="small" aria-label="門檻計分" checked={view.thresholdEnabled} disabled />
              </div>
              <span className={`organic-score-value ${view.thresholdEnabled ? 'organic-score-value--bonus' : 'organic-score-value--disabled'}`}>
                <span className="organic-score-value__badge">模組狀態</span>
                <span className="organic-score-value__number">{view.thresholdEnabled ? '計入總分' : '停用不計分'}</span>
              </span>
              <div className="organic-score-row__hint">停用後檔位配置保留，僅該模組不計入得分</div>
            </div>
            {view.thresholdBands.map((band, i) => (
              <ScoreRow key={i} index={i} label={thresholdBandLabel(view.thresholdBands, i)} score={band.score} enabled={view.thresholdEnabled} />
            ))}
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="力度計分檔位" icon={<ThunderboltOutlined />} tone="strategy"
          extra={<FormulaHint formula="券面金額 ÷ 門店客單價" example={`30 ÷ 100 = ${demo.discountRate}% → 命中 ${demo.discountScore} 分；單檔命中不累加`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">啟用力度計分</div>
                <Switch size="small" aria-label="力度計分" checked={view.discountEnabled} disabled />
              </div>
              <span className={`organic-score-value ${view.discountEnabled ? 'organic-score-value--bonus' : 'organic-score-value--disabled'}`}>
                <span className="organic-score-value__badge">模組狀態</span>
                <span className="organic-score-value__number">{view.discountEnabled ? '計入總分' : '停用不計分'}</span>
              </span>
              <div className="organic-score-row__hint">停用後檔位配置保留，僅該模組不計入得分</div>
            </div>
            {view.discountBands.map((band, i) => (
              <ScoreRow key={i} index={i} label={discountBandLabel(view.discountBands, i)} score={band.score} enabled={view.discountEnabled} />
            ))}
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻保護與報名分" icon={<SafetyCertificateOutlined />} tone="advanced"
          extra={<FormulaHint formula={`門檻 ≤ ${view.gateMultiplier} × 客單價 或 券面 ≥ ${view.gateDiscountRate}% × 門檻 → 力度分全額`} example={`滿 290 減 100（2.9 倍、34%）→ ${demoBlocked.gatePassed ? '閘門通過' : '閘門不過'}，力度分 ${demoBlocked.discountScore} 分`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">閘門①：門檻 ≤ {view.gateMultiplier} 倍門店客單價（顧客夠得著）</div>
              </div>
              <span className="organic-score-value organic-score-value--multiplier">
                <span className="organic-score-value__badge">力度分</span>
                <span className="organic-score-value__number">全額發放</span>
              </span>
            </div>
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">閘門②：券面 ≥ {view.gateDiscountRate}% × 門檻（顧客省得夠狠）</div>
              </div>
              <span className="organic-score-value organic-score-value--multiplier">
                <span className="organic-score-value__badge">力度分</span>
                <span className="organic-score-value__number">全額發放</span>
              </span>
              <div className="organic-score-row__hint">兩條任一滿足即可；都不滿足則力度分不計，門檻分與報名分照常</div>
            </div>
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">硬護欄：門檻 {`>`} {view.guardMultiplier} 倍客單價（空轉券）</div>
              </div>
              <span className="organic-score-value organic-score-value--disabled">
                <span className="organic-score-value__badge">門檻分＋力度分</span>
                <span className="organic-score-value__number">都不發</span>
              </span>
              <div className="organic-score-row__hint">折扣率豁免在此區間不適用，防「高門檻大額券」空轉刷分</div>
            </div>
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">護欄觸發時的報名分</div>
              </div>
              <span className={`organic-score-value ${view.enrollWhenGuarded ? 'organic-score-value--bonus' : 'organic-score-value--disabled'}`}>
                <span className="organic-score-value__badge">報名分</span>
                <span className="organic-score-value__number">{view.enrollWhenGuarded ? '仍發放' : '一併停發'}</span>
              </span>
              <div className="organic-score-row__hint">預設停發，避免挂一張夠不著的券白拿報名分</div>
            </div>
          </div>
        </AlgorithmSection>

        <p className="organic-score-note">
          券面以單張券為計分單元；同一門店同一活動有多張券在架時，逐條算分後<strong>只取分最高的一張</strong>，不相加。無門檻券視為最可達，命中首檔滿分。
        </p>
      </> : <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info"
          extra={<FormulaHint formula="有效報名即給一次" example={`同活動發 3 張券也只給 ${view.enrollmentScore} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用報名分</span>
              <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.enrollmentEnabled} onChange={v => patch({ enrollmentEnabled: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>每門店、每活動只計一次有效報名</span>
            </div>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">報名分值</span>
              <InputNumber aria-label="報名分值" value={draft.enrollmentScore} min={0} max={100} disabled={!draft.enrollmentEnabled}
                onChange={v => patch({ enrollmentScore: v ?? 0 })} style={{ width: 160 }} addonAfter="分" />
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻計分檔位" icon={<SafetyCertificateOutlined />} tone="strategy"
          extra={<FormulaHint formula="使用門檻 ÷ 門店客單價" example={`150 ÷ 100 = ${demo.thresholdRatio} 倍 → 命中 ${demo.thresholdScore} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用門檻計分</span>
              <Switch aria-label="啟用門檻計分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.thresholdEnabled}
                onChange={v => patch({ thresholdEnabled: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>停用時下方檔位保留但不計入得分</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>門檻得分條件</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addThresholdBand} disabled={!draft.thresholdEnabled} style={{ color: '#E8720C' }}>添加門檻檔位</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>從第一檔往下找，命中即停，分數不累加；門檻倍數越小（越好用）分數越高</div>
              {draft.thresholdBands.map((band, i) => {
                const isInfinite = band.upper === Infinity
                return (
                  <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                    {isInfinite ? (
                      <span style={{ fontSize: 13, color: '#262626' }}>當使用門檻超過 {draft.thresholdBands[i - 1]?.upper ?? 0} 倍門店客單價</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, color: '#262626' }}>當使用門檻 ≤</span>
                        <InputNumber aria-label={`第 ${i + 1} 檔門檻倍數`} value={band.upper} min={0.1} step={0.1} disabled={!draft.thresholdEnabled}
                          onChange={v => patchThresholdBand(i, { upper: v ?? 0 })} style={{ width: 120 }} addonAfter="倍" />
                        <span style={{ fontSize: 13, color: '#262626' }}>門店客單價</span>
                      </>
                    )}
                    <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                    <InputNumber aria-label={`第 ${i + 1} 檔門檻分值`} value={band.score} min={0} max={1000} disabled={!draft.thresholdEnabled}
                      onChange={v => patchThresholdBand(i, { score: v ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                    {isInfinite && <Tag color="default" style={{ margin: 0 }}>兜底檔</Tag>}
                    <Button aria-label={`刪除門檻第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />}
                      disabled={isInfinite || !draft.thresholdEnabled || draft.thresholdBands.length <= 2} onClick={() => removeThresholdBand(i)} />
                  </div>
                )
              })}
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="力度計分檔位" icon={<ThunderboltOutlined />} tone="strategy"
          extra={<FormulaHint formula="券面金額 ÷ 門店客單價" example={`30 ÷ 100 = ${demo.discountRate}% → 命中 ${demo.discountScore} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用力度計分</span>
              <Switch aria-label="啟用力度計分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.discountEnabled}
                onChange={v => patch({ discountEnabled: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>停用時下方檔位保留但不計入得分</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>力度得分條件</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addDiscountBand} disabled={!draft.discountEnabled} style={{ color: '#E8720C' }}>添加力度檔位</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>從第一檔往下找，命中即停，分數不累加</div>
              {draft.discountBands.map((band, i) => {
                const isBottom = band.lower === 0
                return (
                  <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                    {isBottom ? (
                      <span style={{ fontSize: 13, color: '#262626' }}>當券面金額未達 {draft.discountBands[i - 1]?.lower ?? 0}% 門店客單價</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, color: '#262626' }}>當券面金額 ≥</span>
                        <InputNumber aria-label={`第 ${i + 1} 檔優惠力度`} value={band.lower} min={1} max={500} disabled={!draft.discountEnabled}
                          onChange={v => patchDiscountBand(i, { lower: v ?? 0 })} style={{ width: 120 }} addonAfter="%" />
                        <span style={{ fontSize: 13, color: '#262626' }}>門店客單價</span>
                      </>
                    )}
                    <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                    <InputNumber aria-label={`第 ${i + 1} 檔力度分值`} value={band.score} min={0} max={1000} disabled={!draft.discountEnabled}
                      onChange={v => patchDiscountBand(i, { score: v ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                    {isBottom && <Tag color="default" style={{ margin: 0 }}>兜底檔</Tag>}
                    <Button aria-label={`刪除力度第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />}
                      disabled={isBottom || !draft.discountEnabled || draft.discountBands.length <= 2} onClick={() => removeDiscountBand(i)} />
                  </div>
                )
              })}
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻保護與報名分" icon={<SafetyCertificateOutlined />} tone="advanced"
          extra={<FormulaHint formula={`門檻 ≤ ${view.gateMultiplier} × 客單價 或 券面 ≥ ${view.gateDiscountRate}% × 門檻 → 力度分全額`} example={`滿 290 減 100 → 力度分 ${demoBlocked.discountScore} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">閘門倍數</span>
              <InputNumber aria-label="閘門倍數" value={draft.gateMultiplier} min={1} max={20} step={0.5}
                onChange={v => patch({ gateMultiplier: v ?? 1.5 })} style={{ width: 150 }} addonAfter="倍" />
              <Tooltip title="門檻 ≤ 該倍數 × 門店客單價時，券被判定為「顧客夠得著」（不需要大幅凑單就能用），力度分全額發放。">
                <QuestionCircleOutlined style={{ color: '#8C8C8C' }} />
              </Tooltip>
            </div>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">閘門折扣率</span>
              <InputNumber aria-label="閘門折扣率" value={draft.gateDiscountRate} min={0} max={100} step={5}
                onChange={v => patch({ gateDiscountRate: v ?? 50 })} style={{ width: 150 }} addonAfter="%" />
              <Tooltip title="券面 ≥ 該比例 × 門檻時，券被判定為「顧客省得夠狠」，力度分全額發放。用於保護門檻較高但真讓利的券（如滿 200 減 100），避免誤傷。">
                <QuestionCircleOutlined style={{ color: '#8C8C8C' }} />
              </Tooltip>
            </div>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">硬護欄倍數</span>
              <InputNumber aria-label="硬護欄倍數" value={draft.guardMultiplier} min={1} max={20} step={0.5}
                onChange={v => patch({ guardMultiplier: v ?? 2 })} style={{ width: 150 }} addonAfter="倍" />
              <Tooltip title="門檻 > 該倍數 × 門店客單價時，視為「顧客根本夠不著」的空轉券：門檻分與力度分都不發，且不再適用折扣率豁免。這是防刷分的最後一道防線。">
                <QuestionCircleOutlined style={{ color: '#8C8C8C' }} />
              </Tooltip>
            </div>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">護欄觸發時報名分</span>
              <Switch aria-label="護欄觸發時仍發報名分" checkedChildren="仍發放" unCheckedChildren="停發" checked={draft.enrollWhenGuarded}
                onChange={v => patch({ enrollWhenGuarded: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>預設停發，避免挂一張夠不著的券白拿報名分</span>
            </div>
          </div>
        </AlgorithmSection>

        {validationError && <Alert type="warning" showIcon message={validationError} style={{ marginBottom: 12 }} />}
        {monotonicHint && !validationError && <Alert type="info" showIcon message={monotonicHint} style={{ marginBottom: 12 }} />}
        <div className="organic-score-edit-actions">
          <span className="algorithm-form__hint" style={{ margin: 0 }}>僅保存當前頁面草稿</span>
          <Button size="small" onClick={handleCancel}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>保存</Button>
        </div>
      </>}

      <ConfigProvider componentDisabled={false}>
        <Drawer title={`${ruleName} · 試算與說明`} open={previewOpen} onClose={() => setPreviewOpen(false)}
          width="min(760px, 100vw)" afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
          footer={<Space><Button onClick={() => { setBenchmark(100); setThreshold(100); setCouponAmount(60) }}>重置試算</Button><Button onClick={() => setPreviewOpen(false)}>關閉</Button></Space>}>
          <Alert type="info" showIcon style={{ marginBottom: 16 }}
            message={isEditing ? '未保存配置試算' : hasDraft ? '當前頁面草稿試算' : '示例模板試算'}
            description="未接入真實排名。試算金額與配置獨立，關閉不會保存配置或退出編輯。" />
          <AlgorithmSection title="規則說明" icon={<QuestionCircleOutlined />} tone="info">
            <p className="algorithm-form__hint">門檻倍數 = 使用門檻 ÷ 門店客單價；優惠力度 = 券面金額 ÷ 門店客單價（分母固定是客單價，不隨門檻變化）。</p>
            <p className="algorithm-form__hint">力度分閘門：門檻 ≤ {view.gateMultiplier} 倍客單價（顧客夠得著）或 券面 ≥ {view.gateDiscountRate}% × 門檻（省得夠狠）任一滿足才發力度分；兩條都不滿足則力度分為 0，門檻分與報名分照常。</p>
            <p className="algorithm-form__hint">總分 = 報名分 + 門檻檔分值 + 閘門通過後的力度檔分值；門檻 {`>`} {view.guardMultiplier} 倍客單價時視為空轉券，門檻分與力度分都為 0。</p>
            <p className="algorithm-form__hint">{BENCHMARK_SOURCE}</p>
          </AlgorithmSection>
          <AlgorithmSection title="示例試算" icon={<CalculatorOutlined />} tone="info">
            <Space wrap style={{ marginBottom: 16 }}>{PREVIEW_CASES.map(item =>
              <Button key={item.name} aria-label={item.name} size="small" onClick={() => { setBenchmark(item.B); setThreshold(item.T); setCouponAmount(item.amount) }}>{item.name}</Button>)}
            </Space>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>門店客單價 B（元）</div>
                  <InputNumber aria-label="門店客單價 B" value={benchmark} min={0} max={10000000} precision={2} step={10} onChange={v => setBenchmark(v ?? 0)} style={{ width: '100%' }} />
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

              {!preview.canCompute && <Alert type="info" showIcon message={preview.reason} />}
              {validationError && <Alert type="warning" showIcon message={`請先修正配置：${validationError}`} />}
              {preview.guarded && preview.canCompute && <Alert type="warning" showIcon message={`硬護欄已觸發：門檻 ${preview.thresholdRatio} 倍客單價，超過 ${view.guardMultiplier} 倍視為空轉券，門檻分與力度分都不發。`} />}
              {preview.canCompute && !preview.guarded && !preview.gatePassed && <Alert type="warning" showIcon
                message={`力度分閘門未通過：門檻 ${preview.thresholdRatio} 倍（> ${view.gateMultiplier} 倍）且券面僅為門檻的 ${threshold > 0 ? Math.round(couponAmount / threshold * 100) : 0}%（< ${view.gateDiscountRate}%），力度分不計。`} />}
              {(!view.thresholdEnabled || !view.discountEnabled) && <Alert type="info" showIcon
                message={`${[!view.thresholdEnabled && '門檻計分', !view.discountEnabled && '力度計分'].filter(Boolean).join(' 與 ')} 模組已停用，該項不計入總分。`} />}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <MetricCell label="門檻倍率 = T / B" value={preview.canCompute ? `${preview.thresholdRatio} 倍` : '—'} highlight="#1890FF" />
                <MetricCell label="優惠力度 = D / B" value={preview.canCompute ? `${preview.discountRate}%` : '—'} highlight="#E8720C" />
                <MetricCell label="命中門檻檔" value={preview.thresholdBand ? `≤ ${preview.thresholdBand.upper === Infinity ? '不限' : preview.thresholdBand.upper} 倍` : '未命中'} note={!view.thresholdEnabled ? '模組停用' : undefined} />
                <MetricCell label="力度分閘門"
                  value={preview.guarded ? '硬護欄已觸發' : preview.gateBy === 'threshold' ? '① 門檻可達' : preview.gateBy === 'discount' ? '② 折扣率達標' : '未通過'}
                  color={preview.gatePassed ? '#52C41A' : '#FF4D4F'}
                  note={!view.discountEnabled ? '模組停用' : undefined} />
                <MetricCell label="命中力度檔" value={preview.discountBand ? `≥ ${preview.discountBand.lower}%` : '未命中'} note={!view.discountEnabled ? '模組停用' : undefined} />
                <MetricCell label="報名分" value={`+${preview.enrollmentScore}`} color="#52C41A" />
                <MetricCell label="門檻分" value={`+${preview.thresholdScore}`} color={view.thresholdEnabled ? '#1890FF' : '#8C8C8C'} />
                <MetricCell label="力度分" value={`+${preview.discountScore}`} color={view.discountEnabled ? '#E8720C' : '#8C8C8C'} />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: '#FFF7E6', border: '1px solid #FFE7D1', borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>單項總得分 = 報名分 + 門檻分 + 力度分</span>
                <output aria-label="單項總得分" aria-live="polite" style={{ fontSize: 24, fontWeight: 700, color: '#E8720C' }}>{preview.total} 分</output>
              </div>
            </div>
          </AlgorithmSection>
        </Drawer>
      </ConfigProvider>
    </section>
  )
}

/**
 * 模块内的一行公式+示例：直接放在区块标题右侧，不另占一块区域。
 * 示例用当前配置实时算，改档位时括号里的分数同步变。
 */
function FormulaHint({ formula, example }: { formula: string; example: string }) {
  return (
    <span style={{ fontSize: 12, color: '#8C8C8C' }}>公式：{formula}{' · '}例：{example}</span>
  )
}

/** 试算指标单元格 */
function MetricCell({ label, value, color, highlight, note }: { label: string; value: string; color?: string; highlight?: string; note?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#FAFAFA', borderRadius: 6, border: '1px solid #F0F0F0' }}>
      <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || highlight || '#262626' }}>
        {value}{note && <span style={{ fontSize: 11, fontWeight: 400, color: '#8C8C8C', marginLeft: 6 }}>{note}</span>}
      </div>
    </div>
  )
}
