/**
 * AI 使用申請頁面
 *
 * 三種申請類型：
 * - model_only：AI 模型申請（選模型 + 能力）
 * - model_and_quota：AI 模型 + 額度申請（選模型 + 能力 + 額度）
 * - quota_only：額度申請（僅額度）
 *
 * 模型選擇區分「已授權模型」（只讀展示）和「可申請模型」（可勾選），
 * 每個模型附帶能力標籤（hover 展示業務場景描述）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, message, Radio, Select, Tag, Tooltip } from 'antd'
import {
  ArrowLeftOutlined, SendOutlined, CheckCircleOutlined,
  LockOutlined, WalletOutlined, QuestionCircleOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { submitAiAccessRequest, type AiRequestType, type UsageFrequency } from '../../api/aiAccessRequest'
import { fetchModels, type AiModel } from '../../api/aiModel'
import { fetchMyModels, type MyModel } from '../../api/aiMyCenter'
import { addApprovalRecord, generateFlowNo, formatNow } from '../../utils/approvalStore'
import { useAuth } from '../../contexts/AuthContext'

const { TextArea } = Input

/** reason → 申請類型映射 */
const REASON_TO_TYPE: Record<string, AiRequestType> = {
  'no-models': 'model_only',
  'no-quota': 'quota_only',
  'no-both': 'model_and_quota',
  'topup': 'quota_only',
  'add-model': 'model_only',
}

/** 是否有模型權限 */
function hasModelPermission(reason: string): boolean {
  return reason === 'no-quota' || reason === 'topup' || reason === 'add-model'
}

/** 是否有額度 */
function hasQuota(reason: string): boolean {
  return reason === 'no-models' || reason === 'topup' || reason === 'add-model'
}

/** 能力標籤 → 業務場景化描述 */
const CAPABILITY_TOOLTIPS: Record<string, string> = {
  visionSupport: 'aiApply.capTipVision',
  functionCalling: 'aiApply.capTipFunction',
  jsonMode: 'aiApply.capTipJson',
  streaming: 'aiApply.capTipStream',
  thinkingMode: 'aiApply.capTipThink',
}

/** 能力標籤顯示名 */
const CAPABILITY_LABELS: Record<string, string> = {
  visionSupport: 'aiApply.capVision',
  functionCalling: 'aiApply.capFunction',
  jsonMode: 'aiApply.capJson',
  streaming: 'aiApply.capStream',
  thinkingMode: 'aiApply.capThink',
}

/** 從 AiModel 提取啟用的能力列表 */
function getModelCapabilities(m: AiModel): string[] {
  const caps: string[] = []
  if (m.visionSupport === 1) caps.push('visionSupport')
  if (m.functionCalling === 1) caps.push('functionCalling')
  if (m.jsonMode === 1) caps.push('jsonMode')
  if (m.streaming === 1) caps.push('streaming')
  if (m.thinkingMode === 1) caps.push('thinkingMode')
  return caps
}

/** 使用場景選項 */
const SCENARIO_OPTIONS: { value: string; i18nKey: string }[] = [
  { value: 'copywriting', i18nKey: 'aiApply.scenarioCopywriting' },
  { value: 'data_analysis', i18nKey: 'aiApply.scenarioDataAnalysis' },
  { value: 'image_understanding', i18nKey: 'aiApply.scenarioImage' },
  { value: 'code_assist', i18nKey: 'aiApply.scenarioCode' },
  { value: 'customer_service', i18nKey: 'aiApply.scenarioCS' },
  { value: 'translation', i18nKey: 'aiApply.scenarioTranslation' },
  { value: 'other', i18nKey: 'aiApply.scenarioOther' },
]

export default function AiAccessApply() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const reason = searchParams.get('reason') ?? 'no-both'
  const initialType = REASON_TO_TYPE[reason] ?? 'model_and_quota'

  /* ---- 表單狀態 ---- */
  const [requestType, setRequestType] = useState<AiRequestType>(initialType)
  const [selectedModels, setSelectedModels] = useState<number[]>([])
  const [usageDesc, setUsageDesc] = useState('')
  const [usageScenarios, setUsageScenarios] = useState<string[]>([])
  const [usageFrequency, setUsageFrequency] = useState<UsageFrequency | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /* ---- 模型數據 ---- */
  const [allModels, setAllModels] = useState<AiModel[]>([])
  const [myModels, setMyModels] = useState<MyModel[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchModels({ status: 1 }).catch(() => []),
      fetchMyModels().catch(() => []),
    ]).then(([all, my]) => {
      setAllModels(all)
      setMyModels(my)
      setModelsLoaded(true)
    })
  }, [])

  /** 已授權模型 ID 集合 */
  const authorizedModelIds = useMemo(
    () => new Set(myModels.map((m) => m.modelId)),
    [myModels],
  )

  /** 已授權模型（含完整信息，用於展示） */
  const authorizedModels = useMemo(
    () => allModels.filter((m) => authorizedModelIds.has(m.id)),
    [allModels, authorizedModelIds],
  )

  /** 可申請模型（未授權的啟用模型） */
  const availableModels = useMemo(
    () => allModels.filter((m) => !authorizedModelIds.has(m.id)),
    [allModels, authorizedModelIds],
  )

  /** 是否顯示模型選擇區（僅額度申請不顯示） */
  const showModelSection = requestType !== 'quota_only'

  /* ---- 狀態摘要 ---- */
  const hasModels = hasModelPermission(reason)
  const hasQuotaFlag = hasQuota(reason)
  const isBlockedEntry = !['topup', 'add-model'].includes(reason)

  const statusItems = useMemo(() => {
    const items: { icon: React.ReactNode; text: string; ok: boolean }[] = []
    if (!hasModels) {
      items.push({ icon: <LockOutlined />, text: t('home.aiBlockedNoModelsTitle'), ok: false })
    }
    if (!hasQuotaFlag) {
      items.push({ icon: <WalletOutlined />, text: t('home.aiBlockedNoQuotaTitle'), ok: false })
    }
    if (hasModels && hasQuotaFlag) {
      items.push({ icon: <CheckCircleOutlined />, text: t('aiApply.hasBoth'), ok: true })
    } else if (hasModels) {
      items.push({ icon: <CheckCircleOutlined />, text: t('aiApply.hasModel'), ok: true })
    } else if (hasQuotaFlag) {
      items.push({ icon: <CheckCircleOutlined />, text: t('aiApply.hasQuota'), ok: true })
    }
    return items
  }, [hasModels, hasQuotaFlag, t])

  /* ---- 申請類型動態禁用 ---- */
  const typeOptions = useMemo(() => {
    const opts: { label: string; value: AiRequestType; disabled?: boolean; disabledTip?: string }[] = [
      { label: t('aiApply.typeModelOnly'), value: 'model_only' },
      { label: t('aiApply.typeModelAndQuota'), value: 'model_and_quota' },
      { label: t('aiApply.typeQuotaOnly'), value: 'quota_only' },
    ]
    if (!hasModels) {
      const qo = opts.find((o) => o.value === 'quota_only')
      if (qo) { qo.disabled = true; qo.disabledTip = t('aiApply.noModelCannotSelectQuota') }
    }
    if (!hasQuotaFlag) {
      const mo = opts.find((o) => o.value === 'model_only')
      if (mo) { mo.disabled = true; mo.disabledTip = t('aiApply.noQuotaCannotSelectModel') }
    }
    return opts
  }, [hasModels, hasQuotaFlag, t])

  const { user } = useAuth()

  /* ---- 提交 ---- */
  const handleSubmit = useCallback(async () => {
    if (!usageDesc.trim()) {
      message.warning(t('aiApply.usageRequired'))
      return
    }
    if (showModelSection && selectedModels.length === 0) {
      message.warning(t('aiApply.modelRequired'))
      return
    }
    setSubmitting(true)
    try {
      await submitAiAccessRequest({
        requestType,
        requestedModels: showModelSection && selectedModels.length > 0 ? selectedModels : undefined,
        usageDescription: usageDesc.trim(),
        usageScenarios: usageScenarios.length > 0 ? usageScenarios : undefined,
        usageFrequency: usageFrequency ?? undefined,
      })
      // 寫入審批記錄，使申請出現在審批中心
      const applicant = user ? `${user.name}(${user.empId})` : '未知'
      const flowNo = generateFlowNo('ai_access')
      addApprovalRecord({
        key: `ai_${Date.now()}`,
        groupId: '--',
        groupName: user?.name || '--',
        brand: '--',
        flowNo,
        approvalType: 'ai_access',
        applicant,
        applyTime: formatNow(),
        bizApprover: '--',
        bizApproveTime: '',
        bizApproveStatus: 'pending',
        opsApprover: '--',
        opsApproveTime: '',
        opsApproveStatus: 'pending',
        finApprover: '--',
        finApproveTime: '',
        finApproveStatus: '--',
        flowStatus: 'pending',
        rejectReason: '',
        extra: {
          requestType,
          requestedModels: selectedModels.length > 0 ? selectedModels : undefined,
          usageDescription: usageDesc.trim(),
          usageScenarios: usageScenarios.length > 0 ? usageScenarios : undefined,
          usageFrequency: usageFrequency ?? undefined,
        },
      })
      message.success(t('aiApply.submitSuccess'))
      navigate('/')
    } catch {
      message.error(t('aiApply.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }, [requestType, selectedModels, usageDesc, usageScenarios, usageFrequency, navigate, t, showModelSection, user])

  /* ---- 渲染能力標籤 ---- */
  const renderCapabilityTags = (model: AiModel) => {
    const caps = getModelCapabilities(model)
    if (caps.length === 0) return null
    return (
      <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8, flexWrap: 'wrap' }}>
        {caps.map((cap) => (
          <Tooltip key={cap} title={t(CAPABILITY_TOOLTIPS[cap])} placement="top">
            <Tag
              style={{
                fontSize: 11, borderRadius: 4, cursor: 'help',
                margin: 0, padding: '0 6px', lineHeight: '20px',
              }}
              color="geekblue"
            >
              {t(CAPABILITY_LABELS[cap])}
              <QuestionCircleOutlined style={{ fontSize: 10, marginLeft: 3, opacity: 0.6 }} />
            </Tag>
          </Tooltip>
        ))}
      </span>
    )
  }

  return (
    <div className="content-area" style={{ padding: 24 }}>
      {/* ====== 頁面頭部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
          animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>
              {t('aiApply.backToHome')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {t('aiApply.pageTitle')}
            </h2>
          </div>
        </div>
      </div>

      {/* ====== 當前狀態摘要 ====== */}
      {isBlockedEntry && (
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '16px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LockOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiApply.currentStatus')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {statusItems.map((item, i) => (
            <Tag key={i} color={item.ok ? 'success' : 'error'} icon={item.icon}
              style={{ fontSize: 13, padding: '4px 12px' }}>
              {item.text}
            </Tag>
          ))}
        </div>
      </div>
      )}

      {/* ====== 申請類型 ====== */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SendOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiApply.applyInfo')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('aiApply.requestType')}</div>
          <Select value={requestType} onChange={(v) => { setRequestType(v); if (v === 'quota_only') setSelectedModels([]) }}
            style={{ width: 360 }}
            options={typeOptions.map((o) => ({
              label: o.disabled ? (
                <Tooltip title={o.disabledTip}>
                  <span style={{ color: '#bfbfbf' }}>{o.label}</span>
                </Tooltip>
              ) : o.label,
              value: o.value,
              disabled: o.disabled,
            }))}
          />
        </div>
      </div>

      {/* ====== 模型選擇區（僅 model_only / model_and_quota 展示） ====== */}
      {showModelSection && modelsLoaded && (
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleOutlined style={{ fontSize: 14, color: '#722ed1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiApply.modelSelect')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('aiApply.modelHint')}</span>
          </div>

          {/* 已授權模型 */}
          {authorizedModels.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: '#52c41a', marginBottom: 10, fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                {t('aiApply.authorizedModels')}（{authorizedModels.length}）
              </div>
              <div style={{
                border: '1px solid #f6ffed', borderRadius: 8, background: '#fcfff9', padding: '12px 16px',
              }}>
                {authorizedModels.map((m) => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', padding: '6px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}>
                    <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8, fontSize: 14 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>{m.name || m.modelKey}</span>
                    {m.providerName && (
                      <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>({m.providerName})</span>
                    )}
                    {renderCapabilityTags(m)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 可申請模型 */}
          {availableModels.length > 0 ? (
            <div>
              <div style={{ fontSize: 13, color: '#1890ff', marginBottom: 10, fontWeight: 600 }}>
                <LockOutlined style={{ marginRight: 6 }} />
                {t('aiApply.availableModels')}（{t('aiApply.clickToSelect')}）
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availableModels.map((m) => {
                  const isSelected = selectedModels.includes(m.id)
                  return (
                    <div key={m.id}
                      onClick={() => setSelectedModels((prev) =>
                        prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                      )}
                      style={{
                        border: `1px solid ${isSelected ? '#1890ff' : '#e8eaed'}`,
                        borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                        background: isSelected ? '#e6f7ff' : '#fff',
                        transition: 'all 0.2s', minWidth: 200,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          border: `2px solid ${isSelected ? '#1890ff' : '#d9d9d9'}`,
                          background: isSelected ? '#1890ff' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s', flexShrink: 0,
                        }}>
                          {isSelected && <CheckCircleOutlined style={{ color: '#fff', fontSize: 12 }} />}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name || m.modelKey}</span>
                        {m.providerName && (
                          <span style={{ fontSize: 11, color: '#8c8c8c' }}>({m.providerName})</span>
                        )}
                      </div>
                      <div style={{ marginTop: 6 }}>{renderCapabilityTags(m)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#8c8c8c', fontSize: 13 }}>
              {t('aiApply.allModelsAuthorized')}
            </div>
          )}

          {/* 底部提示 */}
          <div style={{ marginTop: 16, fontSize: 12, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 6 }}>
            <QuestionCircleOutlined />
            {t('aiApply.modelSelectHint')}
          </div>
        </div>
      )}

      {/* ====== 用途說明 ====== */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiApply.usageInfo')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 用途說明 */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
              {t('aiApply.usageDescription')} <span style={{ color: '#ff4d4f' }}>*</span>
            </div>
            <TextArea
              value={usageDesc}
              onChange={(e) => setUsageDesc(e.target.value)}
              placeholder={t('aiApply.usagePlaceholder')}
              rows={4}
              maxLength={1000}
              showCount
            />
          </div>

          {/* 使用場景（多選標籤）+ 使用頻率 並排 */}
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
              {t('aiApply.usageScenarios')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SCENARIO_OPTIONS.map((s) => {
                const active = usageScenarios.includes(s.value)
                return (
                  <Tag
                    key={s.value}
                    onClick={() => setUsageScenarios((prev) =>
                      prev.includes(s.value) ? prev.filter((v) => v !== s.value) : [...prev, s.value],
                    )}
                    style={{
                      cursor: 'pointer', fontSize: 13, padding: '4px 12px', borderRadius: 6,
                      border: `1px solid ${active ? '#1890ff' : '#d9d9d9'}`,
                      background: active ? '#e6f7ff' : '#fff',
                      color: active ? '#1890ff' : '#595959',
                      transition: 'all 0.2s',
                    }}
                  >
                    {t(s.i18nKey)}
                  </Tag>
                )
              })}
            </div>
          </div>

          {/* 使用頻率 */}
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
              {t('aiApply.usageFrequency')}
            </div>
            <Radio.Group
              value={usageFrequency}
              onChange={(e) => setUsageFrequency(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="occasional">{t('aiApply.freqOccasional')}</Radio.Button>
              <Radio.Button value="regular">{t('aiApply.freqRegular')}</Radio.Button>
              <Radio.Button value="heavy">{t('aiApply.freqHeavy')}</Radio.Button>
            </Radio.Group>
          </div>
        </div>
      </div>

      {/* ====== 底部操作按鈕 ====== */}
      <div className="form-footer">
        <Button onClick={() => navigate('/')}>{t('aiApply.cancel')}</Button>
        <Button type="primary" icon={<SendOutlined />} onClick={handleSubmit} loading={submitting}>
          {t('aiApply.submit')}
        </Button>
      </div>
    </div>
  )
}
