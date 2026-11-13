/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Input, InputNumber, Modal, Radio, Select, Space, Tag, message } from 'antd'
import {
  EditOutlined, SaveOutlined, PlusOutlined, DeleteOutlined,
  QuestionCircleOutlined, FieldTimeOutlined, CalculatorOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import ScoreRow from './AlgorithmForm/ScoreRow'
import {
  TIME_PERIOD_KEYS, TIME_PERIOD_LABELS,
  DECAY_MAX_SCORE_LIMIT, DECAY_DEFAULT_MAX_SCORE, DECAY_DEFAULT_COEFFICIENT,
  computeDistanceDecayScore, validateDecayPeriodConfig,
  type TimePeriodScore, type TimePeriodScoreConfig,
} from './organicTrafficConfig'

/**
 * 距離衰減面板（PLT_01）：满分按早餐／午餐／下午茶／晚餐／宵夜五时段独立配置，
 * 衰减系数全局只有一个配置、所有时段共用；交互形式对齐主營時段面板（TimePeriodScorePanel），
 * 试算在其「当前时段」单选之外再加距离维度。
 *
 * 口径：得分 = max(0, 满分（当前时段） - 衰减系数 × 距离)；
 * 未配置满分的时段不计分（不设兜底分），时段归属由业务系统传值，本面板只配满分与系数。
 *
 * 第一阶段文案分层：chrome 短标签复用 organicTrafficScore.timePeriod 既有键，
 * 衰减口径长句暂硬编码繁中，第二阶段统一替换为 t()。
 */

/** 复用既有 chrome 键（编辑/保存/取消/试算等），不新增翻译键 */
const K = (key: string) => `organicTrafficScore.timePeriod.${key}`

/** 距離衰減专属短标签键（第二阶段 i18n 收口；长句业务口径仍硬编码繁中） */
const D = (key: string) => `organicTrafficScore.decayPeriod.${key}`

/** 试算默认时段与距离：距离 3km 与沙盘 StoreScoreDetail 的行业调研取值一致 */
const DEMO_PERIOD: keyof typeof TIME_PERIOD_LABELS = 'lunch'
const DEMO_DISTANCE = 3

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: TimePeriodScoreConfig
  /** 衰减系数（全局单一配置） */
  coefficient: number
  /** 是否已有已保存的配置（决定工具条提示「已保存配置 / 默认模板」） */
  hasSavedConfig: boolean
  /** 评分说明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: TimePeriodScoreConfig, coefficient: number, description: string) => void
}

/**
 * 时段满分行编辑器（编辑态与新增弹窗共用）：
 * 行内下拉选时段 + 满分输入 + 删除；已被其他行选中的时段置灰，配满五档关闭新增。
 */
export function DecayPeriodRowsEditor({ items, onChange }: {
  items: TimePeriodScore[]
  onChange: (items: TimePeriodScore[]) => void
}) {
  const { t } = useTranslation()
  const patchRow = (index: number, patch: Partial<TimePeriodScore>) =>
    onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item))
  /** 选中枚举即带出名称快照，历史数据在枚举调整后仍可读 */
  const pickPeriod = (index: number, value: string) =>
    patchRow(index, { periodValue: value, periodName: TIME_PERIOD_LABELS[value as keyof typeof TIME_PERIOD_LABELS] ?? value })
  const addRow = () => onChange([...items, { periodValue: '', periodName: '', score: DECAY_DEFAULT_MAX_SCORE }])
  const removeRow = (index: number) => onChange(items.filter((_, i) => i !== index))
  const periodOptions = (index: number) => {
    const usedByOthers = new Set(items.filter((_, i) => i !== index).map(item => item.periodValue).filter(Boolean))
    return TIME_PERIOD_KEYS.map(period => ({
      value: period,
      disabled: usedByOthers.has(period),
      label: TIME_PERIOD_LABELS[period],
    }))
  }
  const allPeriodsUsed = items.length >= TIME_PERIOD_KEYS.length
  return <>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
        {t(K('configuredCount'), { count: items.length, total: TIME_PERIOD_KEYS.length })}
      </span>
      <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addRow} disabled={allPeriodsUsed} style={{ color: 'var(--brand)' }}>
        {allPeriodsUsed ? t(K('allUsed')) : t(K('add'))}
      </Button>
    </div>
    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
      {t(D('editHint'), { limit: DECAY_MAX_SCORE_LIMIT })}
    </div>
    {items.map((item, i) => (
      <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
        <Select aria-label={`第 ${i + 1} 行時段`} style={{ width: 200 }} placeholder="選擇時段"
          value={item.periodValue || undefined} options={periodOptions(i)} onChange={value => pickPeriod(i, value)} />
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>→ {t(D('maxScoreWord'))}</span>
        <InputNumber aria-label={`第 ${i + 1} 行滿分`} value={item.score} min={0} max={DECAY_MAX_SCORE_LIMIT}
          onChange={value => patchRow(i, { score: value ?? 0 })} style={{ width: 120 }} addonAfter={t(K('scoreUnit'))} />
        <Button aria-label={t(K('rowDeleteAria'), { index: i + 1 })} size="small" type="text" danger icon={<DeleteOutlined aria-hidden="true" />} onClick={() => removeRow(i)} />
      </div>
    ))}
    {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t(K('addEmpty'))}</div>}
  </>
}

export default function DistanceDecayScorePanel({ ruleName, config, coefficient, hasSavedConfig, description, updatedBy, updatedAt, readOnly = false, onSave }: Props) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TimePeriodScoreConfig>(config)
  /** 衰减系数编辑值：取消时回滚到已保存值 */
  const [coeffDraft, setCoeffDraft] = useState<number>(coefficient)
  /** 评分说明编辑值：取消时回滚到已保存值 */
  const [descDraft, setDescDraft] = useState(description)
  /** 试算：模拟业务系统传入的当前时段（单选）与用户距离 */
  const [current, setCurrent] = useState<string>(DEMO_PERIOD)
  const [distance, setDistance] = useState<number>(DEMO_DISTANCE)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)

  const isEditing = editing && !readOnly
  const view = isEditing ? draft : config
  const viewCoeff = isEditing ? coeffDraft : coefficient
  const validationError = useMemo(() => validateDecayPeriodConfig(draft), [draft])
  const preview = useMemo(() => computeDistanceDecayScore(view, viewCoeff, current, distance), [view, viewCoeff, current, distance])
  /** 模块内示例：固定按「午餐 + 3km」演示，改满分/系数时示例即时跟随 */
  const demo = useMemo(() => computeDistanceDecayScore(view, viewCoeff, DEMO_PERIOD, DEMO_DISTANCE), [view, viewCoeff])
  const demoExample = `午餐滿分 ${demo.maxScore} 分、${DEMO_DISTANCE}km 得分 ${demo.total} 分` + (isEditing ? '' : '；未配置的時段不計分')
  const currentLabel = timePeriodLabel(current)

  const handleEdit = () => { setDraft(config); setCoeffDraft(coefficient); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setCoeffDraft(coefficient); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!Number.isFinite(coeffDraft) || coeffDraft <= 0) { message.warning(t(D('coeffRequired'))); return }
    if (!descDraft.trim()) { message.warning(t(K('descriptionRequired'))); return }
    onSave(draft, coeffDraft, descDraft.trim())
    setEditing(false)
  }

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(t(K('fixConfigFirst'), { error: validationError })); return }
    setPreviewOpen(true)
  }
  const resetPreview = () => { setCurrent(DEMO_PERIOD); setDistance(DEMO_DISTANCE) }

  return (
    <section aria-label={`${ruleName}分時段滿分配置`}>
      <div className="organic-score-toolbar">
        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{t(D('tag'))}</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? t(K('editing')) : hasSavedConfig ? t(K('saved')) : t(K('template'))}
          {t(D('notWired'))}
        </span>
        {/* 靠右成组：修改人／时间在按钮左侧，与通用计分项工具条位置一致 */}
        <Space style={{ marginLeft: 'auto' }} size={12}>
          {!isEditing && (updatedBy || updatedAt) && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
              {updatedBy && <>{t(K('updatedBy'))}<span style={{ color: 'var(--text-2)' }}>{updatedBy}</span></>}
              {updatedBy && updatedAt && <span style={{ margin: '0 4px' }}>·</span>}
              {updatedAt && <span>{updatedAt}</span>}
            </span>
          )}
          {/* 详情只读模式下父级 Form disabled 会连带禁用按钮，试算必须保留可用，因此显式 disabled={false} */}
          <Button ref={previewTrigger} aria-label={t(D('previewAria'))} disabled={false} size="small" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
            {t(K('preview'))}
          </Button>
          {!isEditing && !readOnly && (
            <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={handleEdit}
              style={{ borderRadius: 6, borderColor: 'var(--brand)', color: 'var(--brand)', fontSize: 12, height: 28 }}>{t(K('edit'))}</Button>
          )}
        </Space>
      </div>

      {!isEditing ? <>
        <AlgorithmSection title={t(K('sectionDetail'))} icon={<FieldTimeOutlined />} tone="strategy"
          extra={<FormulaHint formula={t(D('formula'))} example={demoExample} />}>
          <div className="organic-score-panel organic-score-list">
            {view.items.length > 0 ? view.items.map((item, i) => (
              <ScoreRow key={`${item.periodValue}-${i}`} index={i} label={item.periodName || item.periodValue} score={item.score} kind="base" />
            )) : (
              <div className="organic-score-note" style={{ margin: 0 }}>{t(D('empty'))}</div>
            )}
            {/* 衰减系数只有一个配置：不随时段增行，单独一行展示 */}
            <ScoreRow label={t(D('coeffLabel'))} score={viewCoeff} kind="decay" hint={t(D('coeffSingleHint'))} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', background: 'var(--info-soft)', borderRadius: 6,
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t(D('calcPrefix'))}{t(D('formula'))}</span>
          </div>
        </AlgorithmSection>

        <p className="organic-score-note">備注：距離越遠得分越低，最低為 0 分；未配置滿分的時段不計分。衰減係數全局單一，所有時段共用。</p>
        {/* 评分说明是规则的 description 字段，与其它计分项一样在详情尾部展示 */}
        <div className="organic-score-note">{description}</div>
      </> : <>
        <AlgorithmSection title={t(K('sectionDetail'))} icon={<FieldTimeOutlined />} tone="strategy"
          extra={<FormulaHint formula={t(D('formula'))} example={demoExample} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DecayPeriodRowsEditor items={draft.items} onChange={items => setDraft({ items })} />
            {/* 衰减系数单一配置：与时段行编辑器分区展示，避免被误读为每时段各一个 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderTop: '1px dashed var(--border-3)', paddingTop: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{t(D('coeffLabel'))}</span>
              <InputNumber aria-label={t(D('coeffLabel'))} value={coeffDraft} min={0.1} max={100} step={0.1} style={{ width: 130 }}
                onChange={val => setCoeffDraft(val ?? DECAY_DEFAULT_COEFFICIENT)} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(D('coeffEditHint'))}</span>
            </div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title={t(K('sectionDescription'))} icon={<QuestionCircleOutlined />} tone="info">
          <div className="organic-score-panel">
            <Input.TextArea aria-label={t(K('descriptionAria'))} value={descDraft} rows={2} maxLength={120} showCount
              placeholder={t(K('descriptionPlaceholder'))} onChange={e => setDescDraft(e.target.value)} />
          </div>
        </AlgorithmSection>

        {validationError && <Alert type="warning" showIcon message={validationError} style={{ marginBottom: 12 }} />}
        <div className="organic-score-edit-actions">
          <span className="algorithm-form__hint" style={{ margin: 0 }}>{t(D('saveHint'))}</span>
          <Button size="small" onClick={handleCancel}>{t(K('cancel'))}</Button>
          <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>{t(K('save'))}</Button>
        </div>
      </>}

      <ConfigProvider componentDisabled={false}>
        <Modal title={t(K('previewTitle'), { name: ruleName })} open={previewOpen} onCancel={() => setPreviewOpen(false)}
          centered width={760} afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          footer={<Space><Button onClick={resetPreview}>{t(K('reset'))}</Button><Button onClick={() => setPreviewOpen(false)}>{t(K('close'))}</Button></Space>}>
          <AlgorithmSection title={t(K('ruleSection'))} icon={<QuestionCircleOutlined />} tone="info">
            <p className="algorithm-form__hint">{t(D('formula'))}，最低 0 分；滿分取當前時段配置值，衰減係數全局單一。</p>
            <p className="algorithm-form__hint">當前所屬時段由業務系統依門店營業與下單時間判定並傳入，此處不改時段歸屬、只配滿分與衰減係數。</p>
          </AlgorithmSection>
          <AlgorithmSection title={t(K('exampleSection'))} icon={<CalculatorOutlined />} tone="info">
            {view.items.length === 0 ? (
              <Alert type="info" showIcon message={t(D('exampleEmpty'))} />
            ) : <>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{t(K('pickPeriod'))}</div>
              <Radio.Group aria-label={t(K('radioGroupAria'))} value={current} onChange={e => setCurrent(e.target.value as string)}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {TIME_PERIOD_KEYS.map(period => {
                  const item = view.items.find(configured => configured.periodValue === period)
                  return (
                    <Radio key={period} value={period}>
                      {item
                        ? t(D('option'), { label: TIME_PERIOD_LABELS[period], score: item.score })
                        : t(D('optionUnconfigured'), { label: TIME_PERIOD_LABELS[period] })}
                    </Radio>
                  )
                })}
              </Radio.Group>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t(D('distanceLabel'))}</span>
                <InputNumber aria-label={t(D('distanceLabel'))} value={distance} min={0} max={100} step={0.5} style={{ width: 120 }}
                  addonAfter="km" onChange={val => setDistance(val ?? 0)} />
              </div>
              {preview.unconfigured && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={t(D('unconfiguredAlert'), { label: currentLabel })} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
                  <span>{t(D('maxScoreRow'), { label: currentLabel })}</span>
                  <span style={{ fontWeight: 600 }}>{preview.maxScore} {t(K('scoreUnit'))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
                  <span>{t(D('decayRow'))}</span>
                  <span style={{ fontWeight: 600 }}>- {preview.coefficient} × {distance} km</span>
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: 'var(--warning-soft)', border: '1px solid var(--brand-border)', borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{t(D('totalLabel'))}</span>
                <output aria-label={t(K('totalAria'))} aria-live="polite" style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand)' }}>{preview.total} {t(K('scoreUnit'))}</output>
              </div>
            </>}
          </AlgorithmSection>
        </Modal>
      </ConfigProvider>
    </section>
  )
}

/** 时段展示文案：枚举外的未知值原样回显，不让界面出现空白 */
function timePeriodLabel(value: string): string {
  return TIME_PERIOD_LABELS[value as keyof typeof TIME_PERIOD_LABELS] ?? value
}

/** 模块内的一行公式+示例：放在区块标题右侧，不另占一块区域 */
function FormulaHint({ formula, example }: { formula: string; example: string }) {
  const { t } = useTranslation()
  return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t(K('formulaPrefix'))}{formula}{' · '}{t(K('examplePrefix'))}{example}</span>
}