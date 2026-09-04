import { useMemo } from 'react'
import { Button, Select, Switch, Tag, Tooltip, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EyeOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import type { AiModel } from '../../../api'
import {
  CAPABILITY_FIELDS,
  CAPABILITY_SHORT_FIELDS,
  MODEL_TYPE_TAG,
  MODEL_TYPE_LABEL,
  modelSupports,
  type CapabilityKey,
  type ModelAuthConfig,
} from './modelAuthCapability'

/**
 * 模型授權配置分區（能力顆粒度）
 * 復用部門模型權控的「按需添加模型 + 能力開關卡片」交互：
 * - 編輯模式：下拉添加模型 → 卡片內按模型本身能力上限開放能力開關
 * - 只讀模式：卡片展示能力矩陣（✓/✗）
 */

interface ModelAuthSectionEditableProps {
  models: AiModel[]
  value: ModelAuthConfig[]
  onChange: (configs: ModelAuthConfig[]) => void
  /** 數據不出域（0/1），傳入後顯示開關 */
  dataResidency?: number
  /** 數據不出域變更回調 */
  onDataResidencyChange?: (value: number) => void
}

export function ModelAuthSection({ models, value, onChange, dataResidency, onDataResidencyChange }: ModelAuthSectionEditableProps) {
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

  const residencyOn = dataResidency === 1

  /** 尚未添加的模型（數據不出域開啟時僅私有化模型） */
  const availableModelOptions = useMemo(
    () => models
      .filter((m) => !value.some((a) => a.modelId === m.id))
      .filter((m) => !residencyOn || m.deployType === 'private')
      .map((m) => ({
        value: m.id,
        label: `${m.name}${m.type ? `（${MODEL_TYPE_LABEL[m.type] || m.type}）` : ''}`,
      })),
    [models, value, residencyOn],
  )

  /* ── 添加 / 移除模型（添加時默認開啟模型支持的全部能力） ── */
  const handleAddModel = (modelId: number) => {
    const m = modelMap.get(modelId)
    if (!m) return
    onChange([...value, {
      modelId,
      visionSupport: modelSupports(m, 'visionSupport') ? 1 : 0,
      functionCalling: modelSupports(m, 'functionCalling') ? 1 : 0,
      jsonMode: modelSupports(m, 'jsonMode') ? 1 : 0,
      streaming: modelSupports(m, 'streaming') ? 1 : 0,
      thinkingMode: modelSupports(m, 'thinkingMode') ? 1 : 0,
    }])
  }

  const handleRemoveModel = (modelId: number) => {
    onChange(value.filter((a) => a.modelId !== modelId))
  }

  /* ── 能力開關 ── */
  const handleCapabilityToggle = (modelId: number, field: CapabilityKey, checked: number) => {
    onChange(value.map((a) => (a.modelId === modelId ? { ...a, [field]: checked } : a)))
  }

  /** 數據不出域開關：開啟時自動移除已添加的公有云模型 */
  const handleResidencyChange = (checked: boolean) => {
    const val = checked ? 1 : 0
    onDataResidencyChange?.(val)
    if (checked) {
      const removed = value.filter((a) => modelMap.get(a.modelId)?.deployType !== 'private')
      if (removed.length > 0) {
        onChange(value.filter((a) => modelMap.get(a.modelId)?.deployType === 'private'))
        message.warning(`已開啟數據不出域，自動移除 ${removed.length} 個公有雲模型`)
      }
    }
  }

  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EyeOutlined style={{ fontSize: 14, color: '#722ED1' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>模型授權配置</span>
        <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>能力顆粒度</Tag>
        <Tooltip title="模型來自「模型信息」中已啟用的真實模型；按需添加，授權細化到模型能力維度">
          <span style={{ fontSize: 12, color: '#8C8C8C', cursor: 'help' }}>按需添加模型</span>
        </Tooltip>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>

      {/* 數據不出域開關（僅當父組件傳入回調時顯示） */}
      {onDataResidencyChange && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: '#F9F0FF', borderRadius: 6, border: '1px solid #D3ADF7', marginBottom: 16,
        }}>
          <Switch size="small" checked={residencyOn} onChange={handleResidencyChange} />
          <span style={{ fontSize: 13, color: '#722ED1', fontWeight: 500 }}>數據不出域</span>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>
            開啟後僅可選擇私有化部署模型，已添加的公有雲模型將被自動移除
          </span>
        </div>
      )}

      {/* 添加模型 */}
      <div style={{ marginBottom: 16 }}>
        <Select
          showSearch
          placeholder="選擇要授權的模型（添加一個、展示一個）"
          value={undefined}
          onChange={handleAddModel}
          optionFilterProp="label"
          options={availableModelOptions}
          notFoundContent={residencyOn ? '暫無私有化部署模型可添加' : '所有已啟用模型均已添加'}
          style={{ width: '100%' }}
          suffixIcon={<PlusOutlined />}
        />
      </div>

      {value.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#8C8C8C', fontSize: 13, background: '#FAFAFA', borderRadius: 8, border: '1px dashed #D9D9D9' }}>
          尚未添加任何模型，請從上方下拉框選擇模型進行授權
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {value.map((auth) => {
            const model = modelMap.get(auth.modelId)
            if (!model) return null
            return (
              <div key={auth.modelId} style={{
                border: '1px solid #D3ADF7', borderRadius: 10, padding: '16px',
                background: '#F9F0FF', transition: 'all 0.25s',
              }}>
                {/* 模型头部 + 移除 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>{model.name}</span>
                    {model.type && (
                      <Tag color={MODEL_TYPE_TAG[model.type]} style={{ fontSize: 11 }}>
                        {MODEL_TYPE_LABEL[model.type] || model.type}
                      </Tag>
                    )}
                    <Tag color={model.deployType === 'private' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
                      {model.deployType === 'private' ? '私有化' : '公有云'}
                    </Tag>
                  </div>
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => handleRemoveModel(auth.modelId)}>移除</Button>
                </div>

                {/* 能力开关 */}
                <div style={{ borderTop: '1px solid #E8D5F5', paddingTop: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {CAPABILITY_FIELDS.map(({ key, label, color, tip }) => {
                      const supported = modelSupports(model, key)
                      return (
                        <Tooltip key={key} title={supported ? tip : `該模型本身不支持「${label}」，無法開放給授權對象`}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            background: !supported ? '#FAFAFA' : (auth[key] ? `${color}0A` : '#F5F5F5'),
                            border: `1px solid ${!supported ? '#F0F0F0' : (auth[key] ? color + '30' : '#E8E8E8')}`,
                            opacity: supported ? 1 : 0.65,
                            transition: 'all 0.2s',
                          }}>
                            <span style={{ fontSize: 12, color: supported ? '#595959' : '#BFBFBF', whiteSpace: 'nowrap' }}>{label}</span>
                            <Switch
                              size="small"
                              disabled={!supported}
                              checked={supported && !!auth[key]}
                              unCheckedChildren={supported ? undefined : '不支持'}
                              onChange={(checked) => handleCapabilityToggle(auth.modelId, key, checked ? 1 : 0)}
                            />
                          </div>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C' }}>
        已授權 <strong style={{ color: '#722ED1' }}>{value.length}</strong> 個模型
      </div>
    </div>
  )
}

interface ModelAuthSectionReadonlyProps {
  models: AiModel[]
  configs: ModelAuthConfig[]
}

/** 只讀模式：詳情頁能力矩陣展示（與部門模型權控詳情頁一致） */
export function ModelAuthSectionReadonly({ models, configs }: ModelAuthSectionReadonlyProps) {
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EyeOutlined style={{ fontSize: 14, color: '#722ED1' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>授權模型</span>
        <Tag color="purple">{configs.length} 個模型</Tag>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {configs.map((config) => {
          const model = modelMap.get(config.modelId)
          return (
            <div key={config.modelId} style={{
              border: '1px solid #D3ADF7', borderRadius: 10, padding: 16,
              background: '#F9F0FF',
            }}>
              {/* 模型头部 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>
                    {model?.name ?? `模型 #${config.modelId}`}
                  </span>
                  {model?.type && (
                    <Tag color={MODEL_TYPE_TAG[model.type]} style={{ fontSize: 11 }}>
                      {MODEL_TYPE_LABEL[model.type] || model.type}
                    </Tag>
                  )}
                </div>
                <Tag color="success" style={{ fontSize: 11 }}>已授權</Tag>
              </div>

              {/* 能力矩阵 */}
              <div style={{ borderTop: '1px solid #E8D5F5', paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>能力配置</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CAPABILITY_SHORT_FIELDS.map(({ key, label, color }) => {
                    const supported = config[key] === 1
                    return (
                      <div key={key} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 6,
                        background: supported ? `${color}0A` : '#F5F5F5',
                        border: `1px solid ${supported ? color + '30' : '#E8E8E8'}`,
                      }}>
                        {supported ? (
                          <CheckCircleFilled style={{ fontSize: 12, color }} />
                        ) : (
                          <CloseCircleFilled style={{ fontSize: 12, color: '#BFBFBF' }} />
                        )}
                        <span style={{ fontSize: 12, color: supported ? '#262626' : '#BFBFBF' }}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
        {configs.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#BFBFBF' }}>
            暫無授權模型
          </div>
        )}
      </div>
    </div>
  )
}
