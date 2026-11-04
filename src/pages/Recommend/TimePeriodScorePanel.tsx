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
  computeTimePeriodScore, validateTimePeriodScoreConfig,
  type TimePeriodScore, type TimePeriodScoreConfig,
} from './organicTrafficConfig'

/**
 * 主營時段加分面板（STB_01）：交互形式对齐門店標籤（StoreLabelScorePanel），
 * 差异只在命中依据——門店標籤看门店当前持有的标签，本项看业务系统传入的当前时段。
 *
 * 口径：早餐 / 午餐 / 下午茶 / 晚餐 / 宵夜 五个时段各自独立配分，可自由增删，同一时段不得重复；
 * 当前时段命中一檔即停、不累加，未配置的时段不加分（不设兜底分）。
 * 时段边界不在本面板配置：本仓库只配「时段 → 分值」，归属判定由业务系统传值。
 *
 * 时段名称取 organicTrafficConfig 的 TIME_PERIOD_LABELS（与配送分层、时段推荐广告同一套五餐段口径），
 * 不在语言包里再抄一份，避免三处漂移；语言包只承载面板 chrome 文案。
 */

/** i18n 命名空间前缀（与 storeLabel 面板同一套键名结构） */
const K = (key: string) => `organicTrafficScore.timePeriod.${key}`

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: TimePeriodScoreConfig
  /** 是否已有已保存的配置（决定工具条提示「已保存配置 / 默认模板」） */
  hasSavedConfig: boolean
  /** 评分说明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  /** 最后修改人 / 最后修改时间：只读态工具条展示，与通用计分项同位置同格式 */
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: TimePeriodScoreConfig, description: string) => void
}

/** 试算默认选中的时段：与默认预填档一致，改分值时示例即时跟随 */
const DEMO_PERIOD: keyof typeof TIME_PERIOD_LABELS = 'lunch'

export default function TimePeriodScorePanel({ ruleName, config, hasSavedConfig, description, updatedBy, updatedAt, readOnly = false, onSave }: Props) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TimePeriodScoreConfig>(config)
  /** 评分说明编辑值：取消时回滚到已保存值 */
  const [descDraft, setDescDraft] = useState(description)
  /** 试算：模拟业务系统传入的当前时段（单选） */
  const [current, setCurrent] = useState<string>(DEMO_PERIOD)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)

  const isEditing = editing && !readOnly
  const view = isEditing ? draft : config
  const validationError = useMemo(() => validateTimePeriodScoreConfig(draft), [draft])
  const preview = useMemo(() => computeTimePeriodScore(view, current), [view, current])
  /** 模块内示例：固定按「午餐」演示，改分值时示例总分即时跟随 */
  const demo = useMemo(() => computeTimePeriodScore(view, DEMO_PERIOD), [view])
  /** 示例文案：只读态补一句「未配置的时段不计分」，把边界说清 */
  const demoExample = isEditing
    ? t(K('formulaExample'), { score: demo.total })
    : t(K('formulaExample'), { score: demo.total }) + t(K('formulaExampleUnconfigured'))
  const currentLabel = timePeriodLabel(current)

  const handleEdit = () => { setDraft(config); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!descDraft.trim()) { message.warning(t(K('descriptionRequired'))); return }
    onSave(draft, descDraft.trim())
    setEditing(false)
  }

  /* ── 时段行增删改 ── */
  const patchRow = (index: number, patch: Partial<TimePeriodScore>) =>
    setDraft(prev => ({ items: prev.items.map((item, i) => i === index ? { ...item, ...patch } : item) }))
  /** 选中枚举即带出名称快照，历史数据在枚举调整后仍可读 */
  const pickPeriod = (index: number, value: string) =>
    patchRow(index, { periodValue: value, periodName: TIME_PERIOD_LABELS[value as keyof typeof TIME_PERIOD_LABELS] ?? value })
  const addRow = () => setDraft(prev => ({ items: [...prev.items, { periodValue: '', periodName: '', score: 10 }] }))
  const removeRow = (index: number) => setDraft(prev => ({ items: prev.items.filter((_, i) => i !== index) }))

  /** 下拉选项：已被其他行选中的时段禁用，避免同一时段配两档分 */
  const periodOptions = (index: number) => {
    const usedByOthers = new Set(draft.items.filter((_, i) => i !== index).map(item => item.periodValue).filter(Boolean))
    return TIME_PERIOD_KEYS.map(period => ({
      value: period,
      disabled: usedByOthers.has(period),
      label: TIME_PERIOD_LABELS[period],
    }))
  }
  const allPeriodsUsed = draft.items.length >= TIME_PERIOD_KEYS.length

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(t(K('fixConfigFirst'), { error: validationError })); return }
    setPreviewOpen(true)
  }
  const resetPreview = () => setCurrent(DEMO_PERIOD)

  return (
    <section aria-label={t(K('panelAria'), { name: ruleName })}>
      <div className="organic-score-toolbar">
        <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>{t(K('tag'))}</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? t(K('editing')) : hasSavedConfig ? t(K('saved')) : t(K('template'))}{t(K('notWired'))}
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
          <Button ref={previewTrigger} aria-label={t(K('previewAria'))} disabled={false} size="small" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
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
          extra={<FormulaHint formula={t(K('formula'))} example={demoExample} />}>
          {view.items.length > 0 ? (
            <div className="organic-score-panel organic-score-list">
              {view.items.map((item, i) => (
                <ScoreRow key={`${item.periodValue}-${i}`} index={i} label={item.periodName || item.periodValue} score={item.score} />
              ))}
            </div>
          ) : (
            <div className="organic-score-panel">
              <div className="organic-score-note" style={{ margin: 0 }}>{t(K('empty'))}</div>
            </div>
          )}
        </AlgorithmSection>

        <p className="organic-score-note">{t(K('basisNote'))}</p>
        {/* 评分说明是规则的 description 字段，与其它计分项一样在详情尾部展示 */}
        <div className="organic-score-note">{description}</div>
      </> : <>
        <AlgorithmSection title={t(K('sectionDetail'))} icon={<FieldTimeOutlined />} tone="strategy"
          extra={<FormulaHint formula={t(K('formula'))} example={demoExample} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                {t(K('configuredCount'), { count: draft.items.length, total: TIME_PERIOD_KEYS.length })}
              </span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addRow} disabled={allPeriodsUsed} style={{ color: 'var(--brand)' }}>
                {allPeriodsUsed ? t(K('allUsed')) : t(K('add'))}
              </Button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t(K('editHint'))}</div>
            {draft.items.map((item, i) => (
              <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                <Select aria-label={t(K('rowLabelAria'), { index: i + 1 })} style={{ width: 200 }} placeholder={t(K('rowLabelPlaceholder'))}
                  value={item.periodValue || undefined} options={periodOptions(i)} onChange={value => pickPeriod(i, value)} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t(K('rowArrow'))}</span>
                <InputNumber aria-label={t(K('rowScoreAria'), { index: i + 1 })} value={item.score} min={0} max={1000}
                  onChange={value => patchRow(i, { score: value ?? 0 })} style={{ width: 120 }} addonAfter={t(K('scoreUnit'))} />
                <Button aria-label={t(K('rowDeleteAria'), { index: i + 1 })} size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(i)} />
              </div>
            ))}
            {draft.items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t(K('addEmpty'))}</div>}
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
          <span className="algorithm-form__hint" style={{ margin: 0 }}>{t(K('saveHint'))}</span>
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
            <p className="algorithm-form__hint">{t(K('ruleFormula'))}</p>
            <p className="algorithm-form__hint">{t(K('basisNote'))}</p>
            <p className="algorithm-form__hint">{t(K('ruleSource'))}</p>
          </AlgorithmSection>
          <AlgorithmSection title={t(K('exampleSection'))} icon={<CalculatorOutlined />} tone="info">
            {view.items.length === 0 ? (
              <Alert type="info" showIcon message={t(K('exampleEmpty'))} />
            ) : <>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{t(K('pickPeriod'))}</div>
              <Radio.Group aria-label={t(K('radioGroupAria'))} value={current} onChange={e => setCurrent(e.target.value as string)}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {TIME_PERIOD_KEYS.map(period => {
                  const item = view.items.find(configured => configured.periodValue === period)
                  return (
                    <Radio key={period} value={period}>
                      {item
                        ? t(K('option'), { label: TIME_PERIOD_LABELS[period], score: item.score })
                        : t(K('optionUnconfigured'), { label: TIME_PERIOD_LABELS[period] })}
                    </Radio>
                  )
                })}
              </Radio.Group>
              {preview.unconfigured && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={t(K('unconfiguredAlert'), { label: currentLabel })} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {preview.matched ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
                    <span>{preview.matched.periodName}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>+{preview.matched.score} {t(K('scoreUnit'))}</span>
                  </div>
                ) : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t(K('noMatch'))}</span>}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: 'var(--warning-soft)', border: '1px solid var(--brand-border)', borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{t(K('total'))}</span>
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
