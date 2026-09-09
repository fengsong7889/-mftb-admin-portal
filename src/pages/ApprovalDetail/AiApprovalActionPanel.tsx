/**
 * AI 使用申請「審批操作區」
 *
 * 審批人在審批詳情頁配置：
 * 1. 授權範圍：勾選允許訪問的模型及對應能力開關；
 * 2. 額度設置：設定本次申請的臨時或永久額度（type + 值 + 週期 + 超額動作）；
 *
 * 審批通過後由後端「審批即授權」單事務自動下發模型權限與個人額度（ai_quota_override）。
 */
import { useEffect, useState } from 'react'
import { Checkbox, DatePicker, InputNumber, Radio, Select, Tag, Modal } from 'antd'
import {
  CheckSquareOutlined, SafetyOutlined, WalletOutlined,
  PlusOutlined, CloseOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { fetchModels, type AiModel } from '../../api/aiModel'
import { modelToConfig, type AiGrantDraft, type AiGrantModelConfig } from './aiGrantDraft'

/** 能力字段类型（仅包含布尔能力开关） */
type CapabilityKey = 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'

/** 能力字段 → i18n key */
const CAPABILITY_LABEL_KEYS: Record<CapabilityKey, string> = {
  visionSupport: 'aiApply.capVision',
  functionCalling: 'aiApply.capFunction',
  jsonMode: 'aiApply.capJson',
  streaming: 'aiApply.capStream',
  thinkingMode: 'aiApply.capThink',
}

interface Props {
  requestType: string
  requestedModels?: number[] | null
  draft: AiGrantDraft
  onChange: (draft: AiGrantDraft) => void
}

export default function AiApprovalActionPanel({ requestType, requestedModels, draft, onChange }: Props) {
  const { t } = useTranslation()
  const [models, setModels] = useState<AiModel[]>([])
  /** 添加模型弹窗 */
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchModels({ status: 1 })
      .then((list) => {
        if (cancelled) return
        setModels(list)
        // 申請人勾選的模型補齊默認能力配置（按模型自身能力全開）並加進 selectedModels
        // （解決 fallback draft.selectedModels 為空而「授權範圍」不顯示所選模型）
        const configs = { ...draft.modelConfigs }
        const selected = [...draft.selectedModels]
        let changed = false
        for (const id of requestedModels ?? []) {
          if (!selected.includes(id)) { selected.push(id); changed = true }
          if (!configs[id]) {
            const m = list.find((x) => x.id === id)
            if (m) { configs[id] = modelToConfig(m); changed = true }
          }
        }
        if (changed) onChange({ ...draft, selectedModels: selected, modelConfigs: configs })
      })
      .catch(() => { /* 後端不可用時保留空模型列表 */ })
    return () => { cancelled = true }
    // 僅加載時執行一次，draft 變化不觸發重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showModelScope = requestType !== 'quota_only'
  const showQuota = requestType !== 'model_only'

  /** 已選模型列表（只展示員工申請的 + 審批人額外添加的） */
  const selectedModelDetails = draft.selectedModels
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as AiModel[]

  /** 添加模型弹窗中可選的模型（排除已選） */
  const availableModels = models.filter((m) => !draft.selectedModels.includes(m.id))

  const toggleModel = (m: AiModel) => {
    const isSelected = draft.selectedModels.includes(m.id)
    const selectedModels = isSelected
      ? draft.selectedModels.filter((id) => id !== m.id)
      : [...draft.selectedModels, m.id]
    const modelConfigs = { ...draft.modelConfigs }
    if (!isSelected && !modelConfigs[m.id]) modelConfigs[m.id] = modelToConfig(m)
    onChange({ ...draft, selectedModels, modelConfigs })
  }

  const toggleCapability = (modelId: number, key: CapabilityKey) => {
    const cfg = draft.modelConfigs[modelId]
    if (!cfg) return
    onChange({
      ...draft,
      modelConfigs: { ...draft.modelConfigs, [modelId]: { ...cfg, [key]: !cfg[key] } },
    })
  }

  /** 更新模型生效類型 */
  const updateModelEffectiveType = (modelId: number, effectiveType: 'permanent' | 'temporary') => {
    const cfg = draft.modelConfigs[modelId]
    if (!cfg) return
    onChange({
      ...draft,
      modelConfigs: {
        ...draft.modelConfigs,
        [modelId]: { ...cfg, effectiveType, expireAt: effectiveType === 'permanent' ? null : cfg.expireAt },
      },
    })
  }

  /** 更新模型到期時間 */
  const updateModelExpireAt = (modelId: number, expireAt: string | null) => {
    const cfg = draft.modelConfigs[modelId]
    if (!cfg) return
    onChange({
      ...draft,
      modelConfigs: { ...draft.modelConfigs, [modelId]: { ...cfg, expireAt } },
    })
  }

  return (
    <div className="approval-section approval-section--grant">
      <div className="approval-section-title approval-section-title--orange">
        <SafetyOutlined style={{ marginRight: 6 }} />
        {t('approvalDetail.aiGrantTitle')}
      </div>
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <SafetyOutlined />
        {t('approvalDetail.aiGrantAutoHint')}
      </div>

      {/* ====== 授權範圍 ====== */}
      {showModelScope && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {t('approvalDetail.aiGrantScopeTitle')}
              <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                border: '1px dashed #E8720C', borderRadius: 6, padding: '2px 10px',
                background: '#fff', color: '#E8720C', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <PlusOutlined /> {t('approvalDetail.aiGrantAddModel')}
            </button>
          </div>
          {selectedModelDetails.length === 0 && (
            <div style={{ fontSize: 12, color: '#8C8C8C', padding: '12px 0' }}>
              {t('approvalDetail.aiGrantNoModel')}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedModelDetails.map((m) => {
              const cfg = draft.modelConfigs[m.id]
              const isRequested = requestedModels?.includes(m.id)
              return (
                <div
                  key={m.id}
                  style={{
                    border: '1px solid #E8720C', borderRadius: 8, padding: '12px 14px',
                    background: '#fff7e6', position: 'relative',
                  }}
                >
                  {/* 模型名稱行 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CheckSquareOutlined style={{ color: '#E8720C', fontSize: 14 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>{m.name || m.modelKey}</span>
                    {m.providerName && <span style={{ fontSize: 11, color: '#8c8c8c' }}>({m.providerName})</span>}
                    {isRequested && (
                      <Tag color="blue" style={{ fontSize: 11, margin: 0, lineHeight: '18px' }}>
                        {t('approvalDetail.aiGrantRequested')}
                      </Tag>
                    )}
                    {/* 移除按鈕 */}
                    <CloseOutlined
                      style={{ color: '#8C8C8C', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}
                      onClick={() => toggleModel(m)}
                      title={t('common.delete')}
                    />
                  </div>
                  {/* 能力開關 */}
                  {cfg && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {(Object.keys(CAPABILITY_LABEL_KEYS) as CapabilityKey[]).map((key) => (
                          <Checkbox
                            key={key}
                            checked={cfg[key] as boolean}
                            onChange={() => toggleCapability(m.id, key)}
                            style={{ fontSize: 12 }}
                          >
                            {t(CAPABILITY_LABEL_KEYS[key])}
                          </Checkbox>
                        ))}
                      </div>
                      {/* 生效類型 + 到期時間 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, color: '#595959' }}>{t('approvalDetail.aiGrantModelEffective')}：</span>
                          <Radio.Group
                            size="small"
                            value={cfg.effectiveType}
                            onChange={(e) => updateModelEffectiveType(m.id, e.target.value)}
                          >
                            <Radio.Button value="permanent">{t('approvalDetail.aiGrantEffectivePermanent')}</Radio.Button>
                            <Radio.Button value="temporary">{t('approvalDetail.aiGrantEffectiveTemporary')}</Radio.Button>
                          </Radio.Group>
                        </div>
                        {cfg.effectiveType === 'temporary' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, color: '#595959' }}>{t('approvalDetail.aiGrantExpireAt')}：</span>
                            <DatePicker
                              showTime
                              size="small"
                              value={cfg.expireAt ? dayjs(cfg.expireAt) : null}
                              onChange={(d: Dayjs | null) => updateModelExpireAt(m.id, d ? d.format('YYYY-MM-DD HH:mm:ss') : null)}
                              disabledDate={(d: Dayjs) => d.isBefore(dayjs().startOf('day'))}
                              placeholder={t('approvalDetail.aiGrantExpirePlaceholder')}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ====== 添加模型弹窗 ====== */}
      <Modal
        title={t('approvalDetail.aiGrantAddModelTitle')}
        open={showAddModal}
        onCancel={() => setShowAddModal(false)}
        footer={null}
        width={560}
      >
        <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
          {t('approvalDetail.aiGrantAddModelHint')}
        </div>
        {availableModels.length === 0 && (
          <div style={{ fontSize: 13, color: '#8C8C8C', padding: '20px 0', textAlign: 'center' }}>
            {t('approvalDetail.aiGrantNoAvailableModel')}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
          {availableModels.map((m) => (
            <div
              key={m.id}
              onClick={() => toggleModel(m)}
              style={{
                border: '1px solid #e8eaed', borderRadius: 8, padding: '10px 14px',
                cursor: 'pointer', background: '#fff', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#E8720C'; e.currentTarget.style.background = '#fff7e6' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e8eaed'; e.currentTarget.style.background = '#fff' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PlusOutlined style={{ color: '#E8720C', fontSize: 14 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>{m.name || m.modelKey}</span>
                {m.providerName && <span style={{ fontSize: 11, color: '#8c8c8c' }}>({m.providerName})</span>}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* ====== 額度設置 ====== */}
      {showQuota && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <WalletOutlined />
            {t('approvalDetail.aiGrantQuotaTitle')}
            <span style={{ color: '#ff4d4f' }}>*</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('approvalDetail.aiGrantQuotaType')}</div>
              <Select
                value={draft.quotaType}
                onChange={(v) => onChange({ ...draft, quotaType: v })}
                style={{ width: '100%' }}
                options={[
                  { label: t('approvalDetail.aiGrantQuotaTypeRequests'), value: 'requests' },
                  { label: t('approvalDetail.aiGrantQuotaTypeTokens'), value: 'tokens' },
                ]}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('approvalDetail.aiGrantQuotaValue')}</div>
              <InputNumber
                value={draft.quotaValue}
                onChange={(v) => onChange({ ...draft, quotaValue: v })}
                min={1}
                precision={0}
                style={{ width: '100%' }}
                placeholder={t('approvalDetail.aiGrantQuotaValuePlaceholder')}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('approvalDetail.aiGrantQuotaPeriod')}</div>
              <Select
                value={draft.quotaPeriod}
                onChange={(v) => onChange({ ...draft, quotaPeriod: v })}
                style={{ width: '100%' }}
                options={[
                  { label: t('approvalDetail.aiGrantQuotaPeriodDaily'), value: 'daily' },
                  { label: t('approvalDetail.aiGrantQuotaPeriodMonthly'), value: 'monthly' },
                ]}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('approvalDetail.aiGrantOverLimit')}</div>
              <Select
                value={draft.overLimitAction}
                onChange={(v) => onChange({ ...draft, overLimitAction: v })}
                style={{ width: '100%' }}
                options={[
                  { label: t('approvalDetail.aiGrantOverLimitReject'), value: 'reject' },
                  { label: t('approvalDetail.aiGrantOverLimitApprove'), value: 'approve' },
                  { label: t('approvalDetail.aiGrantOverLimitDowngrade'), value: 'downgrade' },
                ]}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('approvalDetail.aiGrantEffectiveType')}</div>
              <Radio.Group
                value={draft.effectiveType}
                onChange={(e) => onChange({ ...draft, effectiveType: e.target.value })}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="permanent">{t('approvalDetail.aiGrantEffectivePermanent')}</Radio.Button>
                <Radio.Button value="temporary">{t('approvalDetail.aiGrantEffectiveTemporary')}</Radio.Button>
              </Radio.Group>
            </div>
            {draft.effectiveType === 'temporary' && (
              <div>
                <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>
                  {t('approvalDetail.aiGrantExpireAt')}
                  <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>
                </div>
                <DatePicker
                  showTime
                  value={draft.expireAt ? dayjs(draft.expireAt) : null}
                  onChange={(d: Dayjs | null) => onChange({
                    ...draft,
                    expireAt: d ? d.format('YYYY-MM-DD HH:mm:ss') : null,
                  })}
                  disabledDate={(d: Dayjs) => d.isBefore(dayjs().startOf('day'))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 憑證已移至頁面底部「相關憑證」區域統一展示，此處不再重複 */}
    </div>
  )
}
