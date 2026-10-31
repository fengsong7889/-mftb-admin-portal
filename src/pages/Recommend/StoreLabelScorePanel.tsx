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
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import ScoreRow from './AlgorithmForm/ScoreRow'
import {
  STORE_LABELS, computeStoreLabelScore, storeLabelText, validateStoreLabelScoreConfig,
  type StoreLabelScore, type StoreLabelScoreConfig,
} from './organicTrafficConfig'

/**
 * 门店标签计分面板（STB_LABEL）：配置方式对齐金字招牌（COM_10）的「标签 → 分值」清单，
 * 但口径不同——门店标签由门店资料手动指定，一家门店同时只有一个标签，因此是命中一档即停、不累加。
 * 本面板只负责「标签 → 分值」映射，不负责标签的赋值入口（在门店资料侧维护）。
 */

interface Props {
  ruleName: string
  /** 已保存值或页面草稿；面板不直接改它，只在保存时回调上抛 */
  config: StoreLabelScoreConfig
  hasDraft: boolean
  /** 评分说明（规则 description 字段，保存时随配置一并上抛给父级写库） */
  description: string
  /** 最后修改人 / 最后修改时间：只读态工具条展示，与通用计分项同位置同格式 */
  updatedBy?: string
  updatedAt?: string
  readOnly?: boolean
  onSave: (config: StoreLabelScoreConfig, description: string) => void
}

/** 计分口径：标签取门店当前值，单选取一，未配置不得分 */
const SCORE_BASIS_NOTE = '計分口徑：門店標籤取自門店資料（默認手動更新，可直接指定當前門店標籤），一家門店同時只有一個標籤；按當前標籤命中對應分值，命中一檔即停、不累加，未配置分值的標籤不計分。'

/** 试算默认选中的标签：与门店最常见的高阶身份对齐，改分值时示例即时跟随 */
const DEMO_LABEL = 'gold'

export default function StoreLabelScorePanel({ ruleName, config, hasDraft, description, updatedBy, updatedAt, readOnly = false, onSave }: Props) {
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

  const handleEdit = () => { setDraft(config); setDescDraft(description); setEditing(true) }
  const handleCancel = () => { setEditing(false); setDraft(config); setDescDraft(description) }
  const handleSave = () => {
    if (validationError) { message.warning(validationError); return }
    if (!descDraft.trim()) { message.warning('請填寫評分說明'); return }
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
    if (isEditing && validationError) { message.warning(`請先修正配置：${validationError}`); return }
    setPreviewOpen(true)
  }
  const resetPreview = () => setOwned(DEMO_LABEL)

  return (
    <section aria-label={`${ruleName}計分配置`}>
      <div className="organic-score-toolbar">
        <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>標籤計分 · 按門店當前標籤命中一檔即停</Tag>
        <span className="algorithm-form__hint" style={{ margin: 0 }}>
          {isEditing ? '編輯中' : hasDraft ? '當前頁面草稿' : '示例模板'} · 未接入真實門店標籤
        </span>
        {/* 靠右成组：修改人／时间在按钮左侧，与通用计分项工具条位置一致 */}
        <Space style={{ marginLeft: 'auto' }} size={12}>
          {!isEditing && (updatedBy || updatedAt) && (
            <span style={{ fontSize: 11, color: '#8C8C8C', whiteSpace: 'nowrap' }}>
              {updatedBy && <>修改人：<span style={{ color: '#595959' }}>{updatedBy}</span></>}
              {updatedBy && updatedAt && <span style={{ margin: '0 4px' }}>·</span>}
              {updatedAt && <span>{updatedAt}</span>}
            </span>
          )}
          {/* 详情只读模式下父级 Form disabled 会连带禁用按钮，试算必须保留可用，因此显式 disabled={false} */}
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
        <AlgorithmSection title="標籤分值明細" icon={<TagOutlined />} tone="strategy"
          extra={<FormulaHint formula="得分 = 門店當前標籤對應的分值" example={`金牌 = ${demo.total} 分；未配置的標籤不計分`} />}>
          {view.items.length > 0 ? (
            <div className="organic-score-panel organic-score-list">
              {view.items.map((item, i) => (
                <ScoreRow key={`${item.labelValue}-${i}`} index={i} label={storeLabelText(item.labelValue)} score={item.score} />
              ))}
            </div>
          ) : (
            <div className="organic-score-panel">
              <div className="organic-score-note" style={{ margin: 0 }}>尚未配置任何標籤分值，右上角點擊「編輯」添加標籤與分值</div>
            </div>
          )}
        </AlgorithmSection>

        <p className="organic-score-note">{SCORE_BASIS_NOTE}</p>
        {/* 评分说明是规则的 description 字段，与其它计分项一样在详情尾部展示 */}
        <div className="organic-score-note">{description}</div>
      </> : <>
        <AlgorithmSection title="標籤分值明細" icon={<TagOutlined />} tone="strategy"
          extra={<FormulaHint formula="得分 = 門店當前標籤對應的分值" example={`金牌 = ${demo.total} 分`} />}>
          <div className="organic-score-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>已配置標籤（{draft.items.length}）</span>
              <Button size="small" type="link" icon={<PlusOutlined aria-hidden="true" />} onClick={addRow} disabled={allLabelsUsed} style={{ color: '#E8720C' }}>
                {allLabelsUsed ? '全部標籤已配置' : '添加標籤'}
              </Button>
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>同一標籤只能配一行；分值為 0～1000 的整數；未列出的標籤不計分</div>
            {draft.items.map((item, i) => (
              <div key={i} className="organic-score-edit-row" style={{ flexWrap: 'wrap' }}>
                <Select aria-label={`第 ${i + 1} 行門店標籤`} style={{ width: 200 }} placeholder="選擇門店標籤"
                  value={item.labelValue || undefined} options={labelOptions(i)} onChange={value => pickLabel(i, value)} />
                <span style={{ fontSize: 13, color: '#595959' }}>→ 得</span>
                <InputNumber aria-label={`第 ${i + 1} 行標籤分值`} value={item.score} min={0} max={1000}
                  onChange={value => patchRow(i, { score: value ?? 0 })} style={{ width: 120 }} addonAfter="分" />
                <Button aria-label={`刪除第 ${i + 1} 行`} size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(i)} />
              </div>
            ))}
            {draft.items.length === 0 && <div style={{ fontSize: 12, color: '#8C8C8C' }}>尚未配置任何標籤，點擊「添加標籤」開始</div>}
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
          <span className="algorithm-form__hint" style={{ margin: 0 }}>評分說明會寫入後端；標籤分值僅存當前頁面草稿</span>
          <Button size="small" onClick={handleCancel}>取消</Button>
          <Button size="small" type="primary" icon={<SaveOutlined aria-hidden="true" />} onClick={handleSave}>保存</Button>
        </div>
      </>}

      <ConfigProvider componentDisabled={false}>
        <Modal title={`${ruleName} · 試算與說明`} open={previewOpen} onCancel={() => setPreviewOpen(false)}
          centered width={760} afterOpenChange={open => { if (!open) previewTrigger.current?.focus() }}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          footer={<Space><Button onClick={resetPreview}>重置試算</Button><Button onClick={() => setPreviewOpen(false)}>關閉</Button></Space>}>
          <AlgorithmSection title="規則說明" icon={<QuestionCircleOutlined />} tone="info">
            <p className="algorithm-form__hint">得分 = 門店當前標籤對應的分值；每個標籤的分值在上方「標籤分值明細」配置，未配置的標籤不計分。</p>
            <p className="algorithm-form__hint">{SCORE_BASIS_NOTE}</p>
            <p className="algorithm-form__hint">標籤的賦值入口在門店資料（默認手動更新，可直接指定當前門店標籤），此處不改標籤、只配分值。</p>
          </AlgorithmSection>
          <AlgorithmSection title="示例試算" icon={<CalculatorOutlined />} tone="info">
            {view.items.length === 0 ? (
              <Alert type="info" showIcon message="尚未配置標籤分值，先保存至少一個標籤再試算。" />
            ) : <>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>選擇該門店當前的標籤（一家門店只有一個）：</div>
              <Radio.Group aria-label="門店當前標籤" value={owned} onChange={e => setOwned(e.target.value as string)}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {STORE_LABELS.map(label => {
                  const item = view.items.find(configured => configured.labelValue === label.value)
                  return (
                    <Radio key={label.value} value={label.value}>
                      {label.label}（{item ? `+${item.score} 分` : '未配置，不計分'}）
                    </Radio>
                  )
                })}
              </Radio.Group>
              {preview.unconfigured && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={`門店標籤「${storeLabelText(owned)}」未配置分值，本次不計分`} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {preview.matched && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#595959' }}>
                    <span>{storeLabelText(owned)}</span><span style={{ color: '#52C41A', fontWeight: 600 }}>+{preview.matched.score} 分</span>
                  </div>
                )}
                {!preview.matched && <span style={{ fontSize: 13, color: '#8C8C8C' }}>未命中任何已配置標籤，得分 0 分</span>}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: '#FFF7E6', border: '1px solid #FFE7D1', borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>單項總得分 = 當前標籤對應分值（不累加）</span>
                <output aria-label="單項總得分" aria-live="polite" style={{ fontSize: 24, fontWeight: 700, color: '#E8720C' }}>{preview.total} 分</output>
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
  return <span style={{ fontSize: 12, color: '#8C8C8C' }}>公式：{formula}{' · '}例：{example}</span>
}
