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
  QuestionCircleOutlined, TagOutlined, CalculatorOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import ScoreRow from './AlgorithmForm/ScoreRow'
import {
  STORE_LABELS, computeStoreLabelScore, storeLabelText, validateStoreLabelScoreConfig,
  type StoreLabelScore, type StoreLabelScoreConfig,
} from './organicTrafficConfig'

/**
 * 门店标签计分面板（STB_04，原语义编码 STB_LABEL）：配置方式对齐金字招牌（COM_10）的「标签 → 分值」清单，
 * 但口径不同——门店标签由门店资料手动指定，一家门店同时只有一个标签，因此是命中一档即停、不累加。
 * 本面板只负责「标签 → 分值」映射，不负责标签的赋值入口（在门店资料侧维护）。
 */

/** i18n 命名空间前缀（与 organicTrafficScore 其余面板一致） */
const K = (key: string) => `organicTrafficScore.storeLabel.${key}`

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: StoreLabelScoreConfig
  /** 后端是否已有已保存的配置（决定工具条提示「已保存配置 / 示例模板」） */
  hasSavedConfig: boolean
  /** 评分说明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  /** 最后修改人 / 最后修改时间：只读态工具条展示，与通用计分项同位置同格式 */
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: StoreLabelScoreConfig, description: string) => void
}

/** 试算默认选中的标签：与门店最常见的高阶身份对齐，改分值时示例即时跟随 */
const DEMO_LABEL = 'gold'

export default function StoreLabelScorePanel({ ruleName, config, hasSavedConfig, description, updatedBy, updatedAt, readOnly = false, onSave }: Props) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StoreLabelScoreConfig>(config)
  /** 评分说明编辑值：取消时回滚到已保存值 */
  const [descDraft, setDescDraft] = useState(description)
  /** 试算：模拟某门店当前持有的标签（单选） */
  const [owned, setOwned] = useState<string>(DEMO_LABEL)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewTrigger = useRef<HTMLButtonElement>(null)

  const isEditing = editing && !readOnly
  const view = isEditing ? draft : config
  const validationError = useMemo(() => validateStoreLabelScoreConfig(draft), [draft])
  const preview = useMemo(() => computeStoreLabelScore(view, owned), [view, owned])
  /** 模块内示例：固定拿「金牌」一档，改分值时示例总分即时跟随 */
  const demo = useMemo(() => computeStoreLabelScore(view, DEMO_LABEL), [view])
  /** 示例文案：只读态补一句「未配置的标签不计分」，把边界说清 */
  const demoExample = isEditing
    ? t(K('formulaExample'), { score: demo.total })
    : t(K('formulaExample'), { score: demo.total }) + t(K('formulaExampleUnconfigured'))

  const handleEdit = () => { setDraft(config); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!descDraft.trim()) { message.warning(t(K('descriptionRequired'))); return }
    onSave(draft, descDraft.trim())
    setEditing(false)
  }

  /* ── 标签行增删改 ── */
  const patchRow = (index: number, patch: Partial<StoreLabelScore>) =>
    setDraft(prev => ({ items: prev.items.map((item, i) => i === index ? { ...item, ...patch } : item) }))
  const pickLabel = (index: number, value: string) => {
    const meta = STORE_LABELS.find(item => item.value === value)
    patchRow(index, { labelValue: value, labelName: meta?.label ?? value })
  }
  const addRow = () => setDraft(prev => ({ items: [...prev.items, { labelValue: '', labelName: '', score: 10 }] }))
  const removeRow = (index: number) => setDraft(prev => ({ items: prev.items.filter((_, i) => i !== index) }))

  /** 下拉选项：已被其他行选中的标签禁用，避免同一标签配两档分 */
  const labelOptions = (index: number) => {
    const usedByOthers = new Set(draft.items.filter((_, i) => i !== index).map(item => item.labelValue).filter(Boolean))
    return STORE_LABELS.map(label => ({
      value: label.value,
      disabled: usedByOthers.has(label.value),
      label: label.label,
    }))
  }
  const allLabelsUsed = draft.items.length >= STORE_LABELS.length

  const handleOpenPreview = () => {
    if (isEditing && validationError) { message.warning(t(K('fixConfigFirst'), { error: validationError })); return }
    setPreviewOpen(true)
  }
  const resetPreview = () => setOwned(DEMO_LABEL)

  return (
    <section aria-label={t(K('panelAria'), { name: ruleName })}>
      <div className="organic-score-toolbar">
        <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>{t(K('tag'))}</Tag>
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
          <Button ref={previewTrigger} aria-label={t(K('preview'))} disabled={false} size="small" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={handleOpenPreview}>
            {t(K('preview'))}
          </Button>
          {!isEditing && !readOnly && (
            <Button size="small" icon={<EditOutlined aria-hidden="true" />} onClick={handleEdit}
              style={{ borderRadius: 6, borderColor: 'var(--brand)', color: 'var(--brand)', fontSize: 12, height: 28 }}>{t(K('edit'))}</Button>
          )}
        </Space>
      </div>

      {!isEditing ? <>
        <AlgorithmSection title={t(K('sectionDetail'))} icon={<TagOutlined />} tone="strategy"
          extra={<FormulaHint formula={t(K('formula'))} example={demoExample} />}>
          {view.items.length > 0 ? (
            <div className="organic-score-panel organic-score-list">
              {view.items.map((item, i) => (
                <ScoreRow key={`${item.labelValue}-${i}`} index={i} label={storeLabelText(item.labelValue)} score={item.score} />
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
        <AlgorithmSection title={t(K('sectionDetail'))} icon={<TagOutlined />} tone="strategy"
          extra={<FormulaHint formula={t(K('formula'))} example={demoExample} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t(K('configuredCount'), { count: draft.items.length })}</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addRow} disabled={allLabelsUsed} style={{ color: 'var(--brand)' }}>
                {allLabelsUsed ? t(K('allUsed')) : t(K('add'))}
              </Button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t(K('editHint'))}</div>
            {draft.items.map((item, i) => (
              <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                <Select aria-label={t(K('rowLabelAria'), { index: i + 1 })} style={{ width: 200 }} placeholder={t(K('rowLabelPlaceholder'))}
                  value={item.labelValue || undefined} options={labelOptions(i)} onChange={value => pickLabel(i, value)} />
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
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{t(K('pickLabel'))}</div>
              <Radio.Group aria-label={t(K('radioGroupAria'))} value={owned} onChange={e => setOwned(e.target.value as string)}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {STORE_LABELS.map(label => {
                  const item = view.items.find(configured => configured.labelValue === label.value)
                  return (
                    <Radio key={label.value} value={label.value}>
                      {item
                        ? t(K('option'), { label: label.label, score: item.score })
                        : t(K('optionUnconfigured'), { label: label.label })}
                    </Radio>
                  )
                })}
              </Radio.Group>
              {preview.unconfigured && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={t(K('unconfiguredAlert'), { label: storeLabelText(owned) })} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {preview.matched ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2)' }}>
                    <span>{storeLabelText(owned)}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>+{preview.matched.score} {t(K('scoreUnit'))}</span>
                  </div>
                ) : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t(K('noMatch'))}</span>}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: 'var(--warning-soft)', border: '1px solid #FFE7D1', borderRadius: 8,
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

/** 模块内的一行公式+示例：放在区块标题右侧，不另占一块区域 */
function FormulaHint({ formula, example }: { formula: string; example: string }) {
  const { t } = useTranslation()
  return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('organicTrafficScore.storeLabel.formulaPrefix')}{formula}{' · '}{t('organicTrafficScore.storeLabel.examplePrefix')}{example}</span>
}
