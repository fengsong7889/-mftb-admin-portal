import { useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Input, InputNumber, Modal, Space, Switch, Tag, message } from 'antd'
import {
  EditOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
  QuestionCircleOutlined, TrophyOutlined, ThunderboltOutlined,
  SafetyCertificateOutlined, CalculatorOutlined,
} from '@ant-design/icons'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import EnrollmentScoreTag from './AlgorithmForm/EnrollmentScoreTag'
import ScoreRow from './AlgorithmForm/ScoreRow'
import HelpPopover, { type HelpSection } from '@/components/HelpPopover'
import {
  computeCouponScore, validateCouponScoreConfig, couponScoreMonotonicHint,
  thresholdBandLabel, discountBandLabel,
  type CouponScoreConfig, type DiscountBand, type ThresholdBand,
} from './organicTrafficConfig'

/**
 * 券类计分 v1 面板（满额立减 + 券类活动 COM_01/03/04/05/07）：得分 = 报名分 + 门槛分 + 力度分。
 * 基准直接取系统已有的「门店客单价」指标（与满减类活动共用），面板不再提供统计口径配置；
 * 力度分母为「计价基数 = 客单价与门槛取大」，高门槛券的分母被抬高，空转券力度分自动压低。
 * 公式与口径统一写在「試算與說明」弹窗的规则说明里，面板顶部不再重复展示，节省空间。
 * 评分说明是规则的真实后端字段（与其他计分项一致，随保存写库）；档位配置仅存页面草稿。
 */

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: CouponScoreConfig
  hasDraft: boolean
  /** 評分說明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  /** 金额术语：券类为「券面金額」，满额立减为「立減金額」 */
  amountLabel?: string
  /** 最後修改人 / 最後修改時間：只讀態工具條展示，與通用計分项同位置同格式 */
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: CouponScoreConfig, description: string) => void
}

/** 基準來源：門店客單價由訂單域指標提供，後台不配統計口徑 */
const BENCHMARK_SOURCE = '基準 = 門店客單價（系統已有的門店指標，與滿額立減共用；統計口徑與新店回退規則由訂單指標側維護，此處不配置）。'

const PREVIEW_CASES = [
  { name: '早餐店滿 10 減 3', B: 10, T: 10, amount: 3 },
  { name: '早餐店無門檻減 3', B: 10, T: 0, amount: 3 },
  { name: '正常餐廳滿 100 減 60', B: 100, T: 100, amount: 60 },
  { name: '高門檻真狠券滿 200 減 100', B: 100, T: 200, amount: 100 },
  { name: '高門檻低面額滿 190 減 10', B: 100, T: 190, amount: 10 },
  { name: '空轉券滿 290 減 10', B: 100, T: 290, amount: 10 },
]

export default function CouponScorePanel({ ruleName, config, hasDraft, description, amountLabel = '券面金額', updatedBy, updatedAt, readOnly = false, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CouponScoreConfig>(config)
  /** 評分說明编辑值：取消时回滚到已保存值 */
  const [descDraft, setDescDraft] = useState(description)
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
  /** 模块内示例的固定门店：客单价 100 元、發「滿 150 減 30」，另取一家「滿 290 減 100」演示硬护栏 */
  const demo = useMemo(() => computeCouponScore(view, 100, 150, 30), [view])
  const demoGuard = useMemo(() => computeCouponScore(view, 100, 290, 100), [view])

  const handleEdit = () => { setDraft(config); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!descDraft.trim()) { message.warning('請填寫評分說明'); return }
    if (monotonicHint) message.info(monotonicHint)
    onSave(draft, descDraft.trim())
    setEditing(false)
  }

  /* ── 门槛档位增删改 ── */
  const patchThresholdBand = (index: number, p: Partial<ThresholdBand>) =>
    patch({ thresholdBands: draft.thresholdBands.map((band, i) => i === index ? { ...band, ...p } : band) })
  const addThresholdBand = () => {
    const bands = draft.thresholdBands
    const last = bands[bands.length - 1]
    if (!last) { patch({ thresholdBands: [{ upper: 0.5, score: 10 }] }); return }
    const upper = Math.round((last.upper + 0.5) * 100) / 100
    patch({ thresholdBands: [...bands, { upper, score: last.score }] })
  }
  const removeThresholdBand = (index: number) => {
    const bands = draft.thresholdBands
    if (bands.length <= 1) return
    patch({ thresholdBands: bands.filter((_, i) => i !== index) })
  }

  /* ── 力度档位增删改 ── */
  const patchDiscountBand = (index: number, p: Partial<DiscountBand>) =>
    patch({ discountBands: draft.discountBands.map((band, i) => i === index ? { ...band, ...p } : band) })
  const addDiscountBand = () => {
    const bands = draft.discountBands
    const bottom = bands[bands.length - 1]
    if (!bottom) { patch({ discountBands: [{ lower: 5, score: 10 }] }); return }
    const lower = Math.max(1, Math.floor(bottom.lower / 2))
    if (lower >= bottom.lower) { message.warning('最低檔區間過小，無法繼續拆分'); return }
    patch({ discountBands: [...bands, { lower, score: bottom.score }] })
  }
  const removeDiscountBand = (index: number) => {
    const bands = draft.discountBands
    if (bands.length <= 1) return
    patch({ discountBands: bands.filter((_, i) => i !== index) })
  }

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(`請先修正配置：${validationError}`); return }
    setPreviewOpen(true)
  }

  const resetPreview = () => { setBenchmark(100); setThreshold(100); setCouponAmount(60) }

  return (
    <section aria-label={`${ruleName}計分配置`}>
      <div className="organic-score-toolbar">
        <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>方案 v1 · 報名分＋門檻分＋力度分</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? '編輯中' : hasDraft ? '當前頁面草稿' : '示例模板'} · 未接入真實排名
        </span>
        {/* 靠右成組：修改人/時間在按鈕左側，與通用計分项工具條位置一致 */}
        <Space style={{ marginLeft: 'auto' }} size={12}>
          {/* 最後更新信息：僅只讀態展示，編輯中不需要占位 */}
          {!isEditing && (updatedBy || updatedAt) && (
            <span style={{ fontSize: 11, color: '#8C8C8C', whiteSpace: 'nowrap' }}>
              {updatedBy && <>修改人：<span style={{ color: '#595959' }}>{updatedBy}</span></>}
              {updatedBy && updatedAt && <span style={{ margin: '0 4px' }}>·</span>}
              {updatedAt && <span>{updatedAt}</span>}
            </span>
          )}
          {/* 詳情只讀模式下父級 Form disabled 會連帶禁用按鈕，試算必須保留可用，因此顯式 disabled={false} */}
          <Button ref={previewTrigger} aria-label="試算與說明" disabled={false} size="small" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
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
          extra={<FormulaHint formula="有效報名即給一次" example={`同活動多檔優惠也只給 ${view.enrollmentScore} 分`} />}>
          <div className="organic-score-panel organic-score-list">
            {/* 只读态用禁用开关回显启用状态（与门槛/力度模块同款式），保存后状态不再「消失」 */}
            <ScoreRow label="報名計分" score={view.enrollmentScore} enabled={view.enrollmentEnabled}
              control={<>
                <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={view.enrollmentEnabled} disabled />
                <EnrollmentScoreTag enabled={view.enrollmentEnabled} />
              </>}
              hint="停用後報名分值保留，僅該模組不計入得分" />
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻計分檔位" icon={<SafetyCertificateOutlined />} tone="strategy"
          extra={<FormulaHint formula="使用門檻 ÷ 門店客單價" example={`150 ÷ 100 = ${demo.thresholdRatio} 倍 → 命中 ${demo.thresholdScore} 分；單檔命中不累加`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">啟用門檻計分</div>
                <Switch aria-label="門檻計分" checkedChildren="啟用" unCheckedChildren="停用" checked={view.thresholdEnabled} disabled />
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
          extra={<FormulaWithTip formula={`${amountLabel} D ÷ 計價基數（B 與 T 取大）`} example={`30 ÷ 150 = ${demo.discountRate}% → 命中 ${demo.discountScore} 分；單檔命中不累加`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">啟用力度計分</div>
                <Switch aria-label="力度計分" checkedChildren="啟用" unCheckedChildren="停用" checked={view.discountEnabled} disabled />
              </div>
              <span className={`organic-score-value ${view.discountEnabled ? 'organic-score-value--bonus' : 'organic-score-value--disabled'}`}>
                <span className="organic-score-value__badge">模組狀態</span>
                <span className="organic-score-value__number">{view.discountEnabled ? '計入總分' : '停用不計分'}</span>
              </span>
              <div className="organic-score-row__hint">停用後檔位配置保留，僅該模組不計入得分</div>
            </div>
            {view.discountBands.map((band, i) => (
              <ScoreRow key={i} index={i} label={discountBandLabel(view.discountBands, i, amountLabel)} score={band.score} enabled={view.discountEnabled} />
            ))}
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻保護與報名分" icon={<SafetyCertificateOutlined />} tone="advanced"
          extra={<FormulaHint formula={`門檻 ${`>`} ${view.guardMultiplier} × 客單價 → 門檻分與力度分都不發`} example={`滿 290 減 100 → ${demoGuard.thresholdScore + demoGuard.discountScore} 分`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">硬護欄：門檻 {`>`} {view.guardMultiplier} 倍客單價（空轉券）</div>
              </div>
              <span className="organic-score-value organic-score-value--disabled">
                <span className="organic-score-value__badge">門檻分＋力度分</span>
                <span className="organic-score-value__number">都不發</span>
              </span>
              <div className="organic-score-row__hint">顧客根本夠不著的券視為空轉，防「高門檻大額券」刷分</div>
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
          以單檔優惠為計分單元；同一門店同一活動有多檔在架時，逐檔算分後<strong>只取分最高的一檔</strong>，不累加。無門檻視為最可達，命中首檔滿分。
        </p>
        {/* 評分說明是規則的 description 字段，與其他計分項一樣在詳情尾部展示 */}
        <div className="organic-score-note">{description}</div>
      </> : <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info"
          extra={<FormulaHint formula="有效報名即給一次" example={`同活動多檔優惠也只給 ${view.enrollmentScore} 分`} />}>
          {/* 开关与分值并排一行，避免竖排占空间 */}
          <div className="organic-score-panel">
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用報名分</span>
              <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.enrollmentEnabled} onChange={v => patch({ enrollmentEnabled: v })} />
              <span className="organic-score-edit-row__label">報名分值</span>
              <InputNumber aria-label="報名分值" value={draft.enrollmentScore} min={0} max={100} disabled={!draft.enrollmentEnabled}
                onChange={v => patch({ enrollmentScore: v ?? 0 })} style={{ width: 160 }} addonAfter="分" />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>每門店、每活動只計一次有效報名</span>
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
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>停用時檔位不參與計算，也不校驗</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>門檻得分條件</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addThresholdBand} disabled={!draft.thresholdEnabled} style={{ color: '#E8720C' }}>添加門檻檔位</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>從第一檔往下找，命中即停，分數不累加；門檻倍數越小（越好用）分數越高（要給 1.1 倍容錯就直接配 1.1 倍檔）</div>
              {draft.thresholdBands.map((band, i) => (
                <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#262626' }}>當使用門檻 ≤</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔門檻倍數`} value={band.upper} min={0.1} step={0.1} disabled={!draft.thresholdEnabled}
                    onChange={v => patchThresholdBand(i, { upper: v ?? 0 })} style={{ width: 120 }} addonAfter="倍" />
                  <span style={{ fontSize: 13, color: '#262626' }}>門店客單價</span>
                  <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔門檻分值`} value={band.score} min={0} max={1000} disabled={!draft.thresholdEnabled}
                    onChange={v => patchThresholdBand(i, { score: v ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                  {i > 0 && <span style={{ fontSize: 12, color: '#8C8C8C' }}>≤ 上一檔 {draft.thresholdBands[i - 1].score} 分</span>}
                  <Button aria-label={`刪除門檻第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />}
                    disabled={!draft.thresholdEnabled || draft.thresholdBands.length <= 1} onClick={() => removeThresholdBand(i)} />
                </div>
              ))}
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="力度計分檔位" icon={<ThunderboltOutlined />} tone="strategy"
          extra={<FormulaWithTip formula={`${amountLabel} D ÷ 計價基數（B 與 T 取大）`} example={`30 ÷ 150 = ${demo.discountRate}% → 命中 ${demo.discountScore} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用力度計分</span>
              <Switch aria-label="啟用力度計分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.discountEnabled}
                onChange={v => patch({ discountEnabled: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>停用時檔位不參與計算，也不校驗</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>力度得分條件</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addDiscountBand} disabled={!draft.discountEnabled} style={{ color: '#E8720C' }}>添加力度檔位</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>從第一檔往下找，命中即停，分數不累加</div>
              {draft.discountBands.map((band, i) => (
                <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#262626' }}>當{amountLabel} ≥</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔優惠力度`} value={band.lower} min={1} max={500} disabled={!draft.discountEnabled}
                    onChange={v => patchDiscountBand(i, { lower: v ?? 0 })} style={{ width: 120 }} addonAfter="%" />
                  <span style={{ fontSize: 13, color: '#262626' }}>計價基數</span>
                  <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔力度分值`} value={band.score} min={0} max={1000} disabled={!draft.discountEnabled}
                    onChange={v => patchDiscountBand(i, { score: v ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                  {i > 0 && <span style={{ fontSize: 12, color: '#8C8C8C' }}>≤ 上一檔 {draft.discountBands[i - 1].score} 分</span>}
                  <Button aria-label={`刪除力度第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />}
                    disabled={!draft.discountEnabled || draft.discountBands.length <= 1} onClick={() => removeDiscountBand(i)} />
                </div>
              ))}
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻保護與報名分" icon={<SafetyCertificateOutlined />} tone="advanced"
          extra={<FormulaHint formula={`門檻 ${`>`} ${view.guardMultiplier} × 客單價 → 門檻分與力度分都不發`} example={`滿 290 減 100 → ${demoGuard.thresholdScore + demoGuard.discountScore} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">硬護欄倍數</span>
              <InputNumber aria-label="硬護欄倍數" value={draft.guardMultiplier} min={1} max={20} step={0.5}
                onChange={v => patch({ guardMultiplier: v ?? 2 })} style={{ width: 150 }} addonAfter="倍" />
              <HelpPopover
                title="硬護欄：門檻過高視為空轉券"
                content={'門檻 > 該倍數 × 門店客單價時，視為「顧客根本夠不著」的空轉券：門檻分與力度分都不發。\n這是防刷分的最後一道防線，建議與門檻檔位末檔保持一致。'}
                ariaLabel="硬護欄說明"
                placement="right"
              />
            </div>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">護欄觸發時報名分</span>
              <Switch aria-label="護欄觸發時仍發報名分" checkedChildren="仍發放" unCheckedChildren="停發" checked={draft.enrollWhenGuarded}
                onChange={v => patch({ enrollWhenGuarded: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>預設停發，避免挂一張夠不著的券白拿報名分</span>
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
        {monotonicHint && !validationError && <Alert type="info" showIcon message={monotonicHint} style={{ marginBottom: 12 }} />}
        <div className="organic-score-edit-actions">
          <span className="algorithm-form__hint" style={{ margin: 0 }}>評分說明會寫入後端；檔位配置僅存當前頁面草稿</span>
          <Button size="small" onClick={handleCancel}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>保存</Button>
        </div>
      </>}

      <ConfigProvider componentDisabled={false}>
        <Modal title={`${ruleName} · 試算與說明`} open={previewOpen} onCancel={() => setPreviewOpen(false)}
          centered width={860} afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          footer={<Space><Button onClick={resetPreview}>重置試算</Button><Button onClick={() => setPreviewOpen(false)}>關閉</Button></Space>}>
          <AlgorithmSection title="規則說明" icon={<QuestionCircleOutlined />} tone="info">
            <p className="algorithm-form__hint">符號：B = 門店客單價，T = 使用門檻，D = {amountLabel}；得分 = 報名分 + 門檻分（T ÷ B 查檔） + 力度分（D ÷ 計價基數查檔）；匹配不到檔位即 0 分。</p>
            <p className="algorithm-form__hint">計價基數 = max(B, T)，即「這張券真正生效的那筆消費額」：門檻 ≤ 客單價時顧客不用湊單（券在 ≈B 那一單生效），門檻 &gt; 客單價時顧客必須湊到門檻（券在 T 這筆生效）。例（B=100）：滿 30 減 30 → 30%（用 D÷T 會虛高成 100%）；滿 150 減 100 → 66.7%（用 D÷B 會算成 100% 讓空轉券拿滿分）；無門檻券也只有本口徑能直接計算。</p>
            <p className="algorithm-form__hint">總分 = 報名分 + 門檻檔分值 + 力度檔分值；任一模組匹配不到檔位即該模組 0 分；門檻 {`>`} {view.guardMultiplier} 倍客單價時視為空轉券，門檻分與力度分都為 0。</p>
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
                  <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{amountLabel} D（元）</div>
                  <InputNumber aria-label={`${amountLabel} D`} value={couponAmount} min={0} max={10000000} precision={2} step={10} onChange={v => setCouponAmount(v ?? 0)} style={{ width: '100%' }} />
                </div>
              </div>

              {!preview.canCompute && <Alert type="info" showIcon message={preview.reason} />}
              {validationError && <Alert type="warning" showIcon message={`請先修正配置：${validationError}`} />}
              {preview.guarded && preview.canCompute && <Alert type="warning" showIcon message={`硬護欄已觸發：門檻 ${preview.thresholdRatio} 倍客單價，超過 ${view.guardMultiplier} 倍視為空轉券，門檻分與力度分都不發。`} />}
              {(!view.thresholdEnabled || !view.discountEnabled) && <Alert type="info" showIcon
                message={`${[!view.thresholdEnabled && '門檻計分', !view.discountEnabled && '力度計分'].filter(Boolean).join(' 與 ')} 模組已停用，該項不計入總分。`} />}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <MetricCell label="門檻倍率 = T / B" value={preview.canCompute ? `${preview.thresholdRatio} 倍` : '—'} highlight="#1890FF" />
                <MetricCell label="優惠力度 = D ÷ 計價基數（B 與 T 取大）" value={preview.canCompute ? `${preview.discountRate}%` : '—'} highlight="#E8720C" />
                <MetricCell label="命中門檻檔" value={preview.thresholdBand ? `≤ ${preview.thresholdBand.upper === Infinity ? '不限' : preview.thresholdBand.upper} 倍` : '未命中'} note={!view.thresholdEnabled ? '模組停用' : undefined} />
                <MetricCell label="計價基數 = max(B, T)"
                  value={preview.canCompute ? `${preview.intensityBase} 元` : '—'}
                  note={preview.intensityBaseFromThreshold ? '門檻較高，取 T' : '門檻未超客單價，取 B'}
                  highlight="#1890FF" />
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
        </Modal>
      </ConfigProvider>
    </section>
  )
}

/**
 * 口径说明的问号入口：只读与编辑态共用，避免结论在两处不同步。
 * 统一走全站 HelpPopover（点击弹出结构化分区），不再用白底长文本 Tooltip。
 */
function IntensityBaseTip() {
  return (
    <HelpPopover
      title="力度口徑 · 為什麼計價基數取 max(B, T)"
      content={INTENSITY_BASE_SECTIONS}
      ariaLabel="力度口徑說明"
      placement="bottomRight"
      width={400}
    />
  )
}

/** 力度分母口径说明：按「结论 → 两种情形 → 反例 → 防操纵」四层结构化，替代原先难读的长文本 Tooltip */
const INTENSITY_BASE_SECTIONS: HelpSection[] = [
  { tone: 'warn', body: '計價基數 = max(門店客單價 B, 使用門檻 T)，即「這張券真正生效的那筆消費額」。' },
  { tone: 'info', label: '門檻 ≤ 客單價', body: '顧客不用湊單，券在正常那一單（≈ B）生效 → 力度 = D ÷ B' },
  { tone: 'info', label: '門檻 > 客單價', body: '顧客必須湊到門檻，券在 T 這筆消費生效 → 力度 = D ÷ T' },
  { tone: 'danger', label: '只用 D ÷ B', body: '滿 290 減 100 算成 100% 讓利 → 空轉券拿滿力度分' },
  { tone: 'danger', label: '只用 D ÷ T', body: '滿 30 減 30 算成 100%（顧客實花 100 只省 30）；無門檻券 T = 0 更無法計算' },
  { tone: 'neutral', body: '取 max 還自帶防操縱：壓低門檻不會抬高力度分，抬高門檻反而會壓低力度分。' },
]

/**
 * 模块内的一行公式+示例：直接放在区块标题右侧，不另占一块区域。
 * 示例用当前配置实时算，改档位时括号里的分数同步变。
 */
function FormulaHint({ formula, example }: { formula: string; example: string }) {
  return (
    <span style={{ fontSize: 12, color: '#8C8C8C' }}>公式：{formula}{' · '}例：{example}</span>
  )
}

/** 公式+示例，末尾再挂一个口径说明问号（力度模块用） */
function FormulaWithTip({ formula, example }: { formula: string; example: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <FormulaHint formula={formula} example={example} />
      <IntensityBaseTip />
    </span>
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
