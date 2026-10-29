import { useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Input, InputNumber, Modal, Space, Switch, Tag, message } from 'antd'
import {
  EditOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
  QuestionCircleOutlined, TrophyOutlined, SafetyCertificateOutlined, CalculatorOutlined,
} from '@ant-design/icons'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import EnrollmentScoreTag from './AlgorithmForm/EnrollmentScoreTag'
import ScoreRow from './AlgorithmForm/ScoreRow'
import HelpPopover, { type HelpSection } from '@/components/HelpPopover'
import {
  computeFreeShippingScore, validateFreeShippingScoreConfig, freeShippingScoreHint, freeShippingBandLabel,
  freeShippingGuardLimit,
  type FreeShippingScoreConfig, type FreeShippingThresholdBand,
} from './organicTrafficConfig'

/**
 * 减免运费计分面板（COM_02）：得分 = 报名分 + 门槛分。
 * 平台配置与商家自建的减免运费活动最终只生效一个，商家报名即给报名分（可用「啟用報名分」开关停用）；
 * 活动门槛口径不统一、系统读不到，因此门槛只能由运营在档位表里人工配置（不像券类以客单价换算倍数）。
 * 报名分护栏：有效上限默认跟随末档，活动门槛超出上限视为空转，报名分默认一并停发。
 * 评分说明与整份配置随保存写库（free_shipping_config）。
 * 文案暂沿用算法库自然流量面板的繁中硬编码风格（该域尚未纳入 i18n 门禁），待整域抽取时统一迁移。
 */

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: FreeShippingScoreConfig
  /** 后端是否已有保存过的配置（false 时按示例模板展示） */
  hasSavedConfig: boolean
  /** 评分说明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  /** 最后修改人 / 最后修改时间：只读态工具条展示，与通用计分项同位置同格式 */
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: FreeShippingScoreConfig, description: string) => void
}

/** 固定示例门槛（元）：改档位时标题右侧示例分值即时跟随 */
const DEMO_THRESHOLD = 30

/** 试算快捷案例 */
const PREVIEW_CASES = [
  { name: '無門檻', threshold: 0 },
  { name: '滿 20 免運', threshold: 20 },
  { name: '滿 30 免運', threshold: 30 },
  { name: '滿 50 免運', threshold: 50 },
  { name: '滿 100 免運', threshold: 100 },
  { name: '滿 500 免運（超限）', threshold: 500 },
]

export default function FreeShippingScorePanel({
  ruleName, config, hasSavedConfig, description, updatedBy, updatedAt, readOnly = false, onSave,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FreeShippingScoreConfig>(config)
  /** 评分说明编辑值：取消时回滚到已保存值 */
  const [descDraft, setDescDraft] = useState(description)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const [previewThreshold, setPreviewThreshold] = useState(DEMO_THRESHOLD)

  const isEditing = editing && !readOnly
  const view = isEditing ? draft : config
  const patch = (p: Partial<FreeShippingScoreConfig>) => setDraft(prev => ({ ...prev, ...p }))

  const validationError = useMemo(() => validateFreeShippingScoreConfig(draft), [draft])
  const thresholdHint = useMemo(() => freeShippingScoreHint(draft), [draft])
  const preview = useMemo(() => computeFreeShippingScore(view, previewThreshold), [view, previewThreshold])
  const demo = useMemo(() => computeFreeShippingScore(view, DEMO_THRESHOLD), [view])
  const demoNoThreshold = useMemo(() => computeFreeShippingScore(view, 0), [view])
  const guardLimit = useMemo(() => freeShippingGuardLimit(view), [view])
  const lastBandThreshold = view.thresholdBands[view.thresholdBands.length - 1]?.threshold

  const handleEdit = () => { setDraft(config); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!descDraft.trim()) { message.warning('請填寫評分說明'); return }
    if (thresholdHint) message.info(thresholdHint)
    onSave(draft, descDraft.trim())
    setEditing(false)
  }

  /* ── 门槛档位增删改 ── */
  const patchThresholdBand = (index: number, p: Partial<FreeShippingThresholdBand>) =>
    patch({ thresholdBands: draft.thresholdBands.map((band, i) => i === index ? { ...band, ...p } : band) })
  const addThresholdBand = () => {
    const bands = draft.thresholdBands
    const last = bands[bands.length - 1]
    if (!last) { patch({ thresholdBands: [{ threshold: 0, score: 10 }] }); return }
    patch({ thresholdBands: [...bands, { threshold: Math.round((last.threshold + 20) * 100) / 100, score: last.score }] })
  }
  const removeThresholdBand = (index: number) => {
    if (draft.thresholdBands.length <= 1) return
    patch({ thresholdBands: draft.thresholdBands.filter((_, i) => i !== index) })
  }

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(`請先修正配置：${validationError}`); return }
    setPreviewOpen(true)
  }

  return (
    <section aria-label={`${ruleName}計分配置`}>
      <div className="organic-score-toolbar">
        <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>報名分＋門檻分 · 門檻人工配置</Tag>
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
          extra={<FormulaHint formula="有效報名即給一次" example={`同商家多個活動也只給 ${view.enrollmentScore} 分`} />}>
          <div className="organic-score-panel organic-score-list">
            {/* 只读态用禁用开关回显启用状态（与门槛模块同款式），保存后状态不再「消失」 */}
            <ScoreRow label="報名計分" score={view.enrollmentScore} enabled={view.enrollmentEnabled}
              control={<>
                <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={view.enrollmentEnabled} disabled />
                <EnrollmentScoreTag enabled={view.enrollmentEnabled} />
              </>}
              hint="停用後報名分值保留，僅該模組不計入得分" />
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻計分檔位" icon={<SafetyCertificateOutlined />} tone="strategy"
          extra={<>
            <FormulaHint formula="按生效活動的減免門檻查檔"
              example={`門檻 ${DEMO_THRESHOLD} 元 → 命中 ${demo.thresholdScore} 分；無門檻 → ${demoNoThreshold.thresholdScore} 分`} />
            <ThresholdBasisTip />
          </>}>
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
              <ScoreRow key={`${band.threshold}-${i}`} index={i} label={freeShippingBandLabel(band)}
                score={band.score} enabled={view.thresholdEnabled} />
            ))}
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="報名分護欄" icon={<SafetyCertificateOutlined />} tone="advanced"
          extra={<FormulaHint formula="活動門檻 > 有效上限 → 視為空轉"
            example={`超限時門檻分不發、報名分${view.enrollWhenGuarded ? '仍發' : '停發'}`} />}>
          <div className="organic-score-panel organic-score-list">
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">有效門檻上限</div>
              </div>
              <span className="organic-score-value organic-score-value--multiplier">
                <span className="organic-score-value__badge">上限</span>
                <span className="organic-score-value__number">{guardLimit === undefined ? '未設定' : `${guardLimit} 元`}</span>
              </span>
              <div className="organic-score-row__hint">
                {guardLimit === undefined ? '未配置檔位也未設上限，護欄不生效' : view.guardThreshold !== undefined ? '手動覆蓋（不得低於末檔）' : '跟隨檔位表末檔'}
              </div>
            </div>
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <div className="organic-score-row__label">超過上限的報名分</div>
              </div>
              <span className={`organic-score-value ${guardLimit !== undefined && view.enrollWhenGuarded ? 'organic-score-value--bonus' : 'organic-score-value--disabled'}`}>
                <span className="organic-score-value__badge">報名分</span>
                <span className="organic-score-value__number">
                  {guardLimit === undefined ? '—' : view.enrollWhenGuarded ? '仍發放' : '一併停發'}
                </span>
              </span>
              <div className="organic-score-row__hint">預設停發，避免掛一張夠不著的活動白拿報名分</div>
            </div>
          </div>
        </AlgorithmSection>

        <p className="organic-score-note">
          以商家最終生效的那一個減免運費活動為準（平台活動與商家自建活動報名後只生效一個），未報名不計分；
          門檻檔位由運營人工配置（不使用門店客單價換算），商家生效活動的門檻按檔位查分。
        </p>
        {/* 评分说明是规则的 description 字段，与其他计分项一样在详情尾部展示 */}
        <div className="organic-score-note">{description}</div>
      </> : <>
        <AlgorithmSection title="報名計分" icon={<TrophyOutlined />} tone="info"
          extra={<FormulaHint formula="有效報名即給一次" example={`同商家多個活動也只給 ${draft.enrollmentScore} 分`} />}>
          {/* 开关与分值并排一行，避免竖排占空间 */}
          <div className="organic-score-panel">
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用報名分</span>
              <Switch aria-label="啟用報名分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.enrollmentEnabled}
                onChange={v => patch({ enrollmentEnabled: v })} />
              <span className="organic-score-edit-row__label">報名分值</span>
              <InputNumber aria-label="報名分值" value={draft.enrollmentScore} min={0} max={100} disabled={!draft.enrollmentEnabled}
                onChange={v => patch({ enrollmentScore: v ?? 0 })} style={{ width: 160 }} addonAfter="分" />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>多個活動也只計一次有效報名</span>
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="門檻計分檔位" icon={<SafetyCertificateOutlined />} tone="strategy"
          extra={<>
            <FormulaHint formula="按生效活動的減免門檻查檔"
              example={`門檻 ${DEMO_THRESHOLD} 元 → 命中 ${demo.thresholdScore} 分`} />
            <ThresholdBasisTip />
          </>}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">啟用門檻計分</span>
              <Switch aria-label="啟用門檻計分" checkedChildren="啟用" unCheckedChildren="停用" checked={draft.thresholdEnabled}
                onChange={v => patch({ thresholdEnabled: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>停用時檔位不參與計算，也不校驗</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>門檻得分條件</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addThresholdBand}
                disabled={!draft.thresholdEnabled} style={{ color: '#E8720C' }}>添加門檻檔位</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                0 元表示無門檻；檔位按門檻從低到高匹配，命中即停、分數不累加；門檻越低（越好用）分數越高
              </div>
              {draft.thresholdBands.map((band, i) => (
                <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#262626' }}>當減免門檻 ≤</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔門檻金額`} value={band.threshold} min={0} max={10000000} precision={2} step={10}
                    disabled={!draft.thresholdEnabled}
                    onChange={v => patchThresholdBand(i, { threshold: v ?? 0 })} style={{ width: 140 }} addonAfter="元" />
                  <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                  <InputNumber aria-label={`第 ${i + 1} 檔門檻分值`} value={band.score} min={0} max={1000}
                    disabled={!draft.thresholdEnabled}
                    onChange={v => patchThresholdBand(i, { score: v ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                  {i > 0 && <span style={{ fontSize: 12, color: '#8C8C8C' }}>≤ 上一檔 {draft.thresholdBands[i - 1].score} 分</span>}
                  <Button aria-label={`刪除門檻第 ${i + 1} 檔`} size="small" type="text" danger icon={<DeleteOutlined />}
                    disabled={!draft.thresholdEnabled || draft.thresholdBands.length <= 1} onClick={() => removeThresholdBand(i)} />
                </div>
              ))}
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title="報名分護欄" icon={<SafetyCertificateOutlined />} tone="advanced"
          extra={<FormulaHint formula="活動門檻 > 有效上限 → 視為空轉"
            example={`超限時門檻分不發、報名分${draft.enrollWhenGuarded ? '仍發' : '停發'}`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">有效門檻上限</span>
              <InputNumber aria-label="有效門檻上限" value={draft.guardThreshold} min={0} max={10000000} precision={2} step={10}
                placeholder={lastBandThreshold === undefined ? '未配置檔位時可不填' : `跟隨末檔（${lastBandThreshold} 元）`}
                onChange={v => patch({ guardThreshold: v ?? undefined })} style={{ width: 190 }} addonAfter="元" />
              {draft.guardThreshold !== undefined && (
                <Button size="small" type="link" onClick={() => patch({ guardThreshold: undefined })} style={{ color: '#E8720C' }}>
                  跟隨末檔
                </Button>
              )}
              <HelpPopover title="報名分護欄 · 為什麼要設上限" content={GUARD_BASIS_SECTIONS}
                ariaLabel="報名分護欄說明" placement="bottomRight" width={400} />
            </div>
            <div className="organic-score-edit-row">
              <span className="organic-score-edit-row__label">超限報名分</span>
              <Switch aria-label="超過上限仍發報名分" checkedChildren="仍發" unCheckedChildren="停發"
                checked={!!draft.enrollWhenGuarded} onChange={v => patch({ enrollWhenGuarded: v })} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>預設停發，與券類護欄口徑一致</span>
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              上限留空則跟隨末檔（{lastBandThreshold === undefined ? '未配置' : `${lastBandThreshold} 元`}）；手動覆蓋必須不低於末檔，
              否則會出現「檔位有分但報名分停發」的矛盾區間
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
        {thresholdHint && !validationError && <Alert type="info" showIcon message={thresholdHint} style={{ marginBottom: 12 }} />}
        <div className="organic-score-edit-actions">
          <span className="algorithm-form__hint" style={{ margin: 0 }}>報名分值、門檻檔位、護欄與評分說明均會寫入後端</span>
          <Button size="small" onClick={handleCancel}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>保存</Button>
        </div>
      </>}

      <ConfigProvider componentDisabled={false}>
        <Modal title={`${ruleName} · 試算與說明`} open={previewOpen} onCancel={() => setPreviewOpen(false)}
          centered width={760} afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          footer={<Space><Button onClick={() => setPreviewThreshold(DEMO_THRESHOLD)}>重置試算</Button><Button onClick={() => setPreviewOpen(false)}>關閉</Button></Space>}>
          <AlgorithmSection title="規則說明" icon={<QuestionCircleOutlined />} tone="info">
            <p className="algorithm-form__hint">得分 = 報名分 + 門檻分（按商家生效活動的減免門檻金額查檔）；匹配不到檔位即 0 分。</p>
            <p className="algorithm-form__hint">平台配置的減免運費活動與商家自建活動最終只生效一個；只要商家報名即給報名分，多個活動不重複累加。</p>
            <p className="algorithm-form__hint">門檻檔位由運營人工配置（不使用門店客單價換算）：0 元檔承接無門檻活動，門檻越低越好達成，分值不得隨門檻升高而升高。</p>
            <p className="algorithm-form__hint">報名分護欄：有效上限默認跟隨末檔，也可手動覆蓋（不得低於末檔）；活動門檻超出上限視為空轉，門檻分不發，報名分預設一併停發。</p>
            <p className="algorithm-form__hint">注意：商家實際活動門檻由報名數據帶入；若首檔門檻大於 0 元，無門檻活動將拿不到門檻分。</p>
          </AlgorithmSection>
          <AlgorithmSection title="示例試算" icon={<CalculatorOutlined />} tone="info">
            <Space wrap style={{ marginBottom: 16 }}>
              {PREVIEW_CASES.map(item =>
                <Button key={item.name} aria-label={item.name} size="small" onClick={() => setPreviewThreshold(item.threshold)}>{item.name}</Button>)}
            </Space>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>商家生效活動的減免門檻（元，無門檻填 0）</div>
              <InputNumber aria-label="減免門檻" value={previewThreshold} min={0} max={10000000} precision={2} step={10}
                onChange={v => setPreviewThreshold(v ?? 0)} style={{ width: '100%' }} />
            </div>

            {!view.thresholdEnabled && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="門檻計分模組已停用，該項不計入總分。" />}
            {preview.guarded && preview.limit !== undefined && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                message={`已超有效上限 ${preview.limit} 元，視為空轉活動：門檻分不發，報名分${view.enrollWhenGuarded ? '仍發' : '一併停發'}。`} />
            )}
            {validationError && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`請先修正配置：${validationError}`} />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <MetricCell label="命中門檻檔"
                value={preview.thresholdBand ? freeShippingBandLabel(preview.thresholdBand) : '未命中'}
                note={!view.thresholdEnabled ? '模組停用' : undefined} />
              <MetricCell label="商家生效活動門檻" value={`${previewThreshold || 0} 元`} />
              <MetricCell label="有效門檻上限" value={preview.limit === undefined ? '未設定' : `${preview.limit} 元`}
                note={preview.limit === undefined ? undefined : view.guardThreshold !== undefined ? '手動覆蓋' : '跟隨末檔'} />
              <MetricCell label="護欄狀態" value={preview.guarded ? '超限' : '未超限'}
                color={preview.guarded ? '#FF4D4F' : '#52C41A'}
                note={preview.guarded ? (view.enrollWhenGuarded ? '報名分仍發' : '報名分停發') : undefined} />
              <MetricCell label="報名分" value={`+${preview.enrollmentScore}`} color={preview.enrollmentScore > 0 ? '#52C41A' : '#8C8C8C'} />
              <MetricCell label="門檻分" value={`+${preview.thresholdScore}`} color={view.thresholdEnabled ? '#1890FF' : '#8C8C8C'} />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16,
              padding: '14px 20px', background: '#FFF7E6', border: '1px solid #FFE7D1', borderRadius: 8,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>單項總得分 = 報名分 + 門檻分</span>
              <output aria-label="單項總得分" aria-live="polite" style={{ fontSize: 24, fontWeight: 700, color: '#E8720C' }}>{preview.total} 分</output>
            </div>
          </AlgorithmSection>
        </Modal>
      </ConfigProvider>
    </section>
  )
}

/**
 * 门槛口径问号入口：只读与编辑态共用。
 * 说明超过一句且含因果，按规范走 HelpPopover 结构化分区，不用 Tooltip。
 */
function ThresholdBasisTip() {
  return (
    <HelpPopover
      title="門檻口徑 · 為什麼要人工配置"
      content={THRESHOLD_BASIS_SECTIONS}
      ariaLabel="減免門檻口徑說明"
      placement="bottomRight"
      width={400}
    />
  )
}

const THRESHOLD_BASIS_SECTIONS: HelpSection[] = [
  { tone: 'warn', body: '平台配置與商家自建的減免運費活動最終只生效一個，門檻口徑不統一，因此檔位需要運營人工約定。' },
  { tone: 'info', label: '券類模組', body: '以系統已有的門店客單價為基準，自動換算「門檻 ÷ 客單價」倍數。' },
  { tone: 'info', label: '減免運費', body: '按運營配置的減免門檻金額檔位查分；0 元檔承接無門檻活動。' },
  { tone: 'danger', label: '漏配 0 元檔', body: '無門檻的減免運費活動匹配不到任何檔位，門檻分為 0。' },
  { tone: 'neutral', body: '門檻越高越好用性越差，因此分值必須隨門檻升高而不升高（保存時硬校驗）。' },
]

/** 報名分護欄口徑：為何要用「上限」防空轉，以及上限如何取值 */
const GUARD_BASIS_SECTIONS: HelpSection[] = [
  { tone: 'warn', body: '報名分是「報名即得」的確定性收益，若門檻虛高到顧客永遠夠不著，等於白拿分。' },
  { tone: 'info', label: '與券類一致', body: '券類以「門檻 > N × 客單價」判定空轉，並默認一併停發報名分。' },
  { tone: 'info', label: '減免運費', body: '沒有客單價基準，改用檔位表末檔作有效上限；檔位本身就是運營按算法場景拍過的合理區間。' },
  { tone: 'danger', label: '上限低於末檔', body: '會出現「檔位有分但報名分停發」的矛盾區間，保存時直接攔截。' },
  { tone: 'neutral', body: '需要更寬的有效區間時，用低分檔（如 1 分）表達即可，不必再維護第二個數字。' },
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
