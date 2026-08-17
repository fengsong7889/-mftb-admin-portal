import { useState, useEffect } from 'react'
import { Modal, Select, Input, Switch, Divider, message } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import {
  AMOUNT_OPERATOR_OPTIONS,
  CONDITION_BRAND_OPTIONS,
  CONDITION_CHANNEL_OPTIONS,
  CONDITION_AD_TYPE_OPTIONS,
  getConditionFieldOptions,
} from './types'
import type { NodeCondition, ConditionOperator } from './types'

interface Props {
  open: boolean
  nodeName: string
  conditions: NodeCondition[]
  workflowType?: string
  onOk: (conditions: NodeCondition[]) => void
  onCancel: () => void
}

/** 從已有條件中按字段取出值 */
function getCond(conditions: NodeCondition[], field: string): NodeCondition | undefined {
  return conditions.find(c => c.field === field)
}

/** 是否為贈送流程 */
function isGift(wfType?: string) { return wfType === 'gift' }

/** 條件配置彈窗：所有條件字段固定展示 */
export default function ConditionConfigModal({ open, nodeName, conditions, workflowType, onOk, onCancel }: Props) {
  const [enableCondition, setEnableCondition] = useState(false)

  const gift = isGift(workflowType)

  /* ── 數字類條件（金額 / 贈送天數） ── */
  const numericField = gift ? 'giftDays' : 'amount'

  const [numericEnabled, setNumericEnabled] = useState(false)
  const [numericOp, setNumericOp] = useState<ConditionOperator>('eq')
  const [numericVal, setNumericVal] = useState<string>('')

  /* ── 枚舉類條件 ── */
  const [adTypeVal, setAdTypeVal] = useState<string[]>(CONDITION_AD_TYPE_OPTIONS.map(o => o.value))
  const [brandVal, setBrandVal] = useState<string[]>(CONDITION_BRAND_OPTIONS.map(o => o.value))
  const [channelVal, setChannelVal] = useState<string[]>(CONDITION_CHANNEL_OPTIONS.map(o => o.value))

  const fieldOptions = getConditionFieldOptions(workflowType)
  const numericLabel = fieldOptions.find(f => f.value === numericField)?.label || (gift ? '贈送天數' : '審批金額')
  const brandLabel = fieldOptions.find(f => f.value === 'brand')?.label || '所屬品牌'
  const channelLabel = fieldOptions.find(f => f.value === 'businessChannel')?.label || '業務頻道'
  const adTypeLabel = fieldOptions.find(f => f.value === 'adType')?.label || '廣告類型'

  /* 打開時初始化 */
  useEffect(() => {
    if (open) {
      if (conditions.length > 0) {
        setEnableCondition(true)
        // 回填數字條件
        const numCond = getCond(conditions, numericField)
        if (numCond) {
          setNumericEnabled(true)
          setNumericOp(numCond.operator)
          setNumericVal(String(numCond.value ?? ''))
        } else {
          setNumericEnabled(false)
          setNumericOp('eq')
          setNumericVal('')
        }
        // 回填廣告類型
        const adCond = getCond(conditions, 'adType')
        setAdTypeVal(adCond && Array.isArray(adCond.value) ? adCond.value : CONDITION_AD_TYPE_OPTIONS.map(o => o.value))
        // 回填品牌
        const brandCond = getCond(conditions, 'brand')
        setBrandVal(brandCond && Array.isArray(brandCond.value) ? brandCond.value : CONDITION_BRAND_OPTIONS.map(o => o.value))
        // 回填頻道
        const channelCond = getCond(conditions, 'businessChannel')
        setChannelVal(channelCond && Array.isArray(channelCond.value) ? channelCond.value : CONDITION_CHANNEL_OPTIONS.map(o => o.value))
      } else {
        setEnableCondition(false)
        setNumericEnabled(false)
        setNumericOp('eq')
        setNumericVal('')
        setAdTypeVal(CONDITION_AD_TYPE_OPTIONS.map(o => o.value))
        setBrandVal(CONDITION_BRAND_OPTIONS.map(o => o.value))
        setChannelVal(CONDITION_CHANNEL_OPTIONS.map(o => o.value))
      }
    }
  }, [open, conditions, numericField])

  const handleOk = () => {
    if (!enableCondition) {
      onOk([])
      return
    }
    const result: NodeCondition[] = []

    // 數字條件（有用戶輸入才加入）
    if (numericEnabled) {
      if (numericVal === '' || isNaN(Number(numericVal))) {
        message.error(`請輸入「${numericLabel}」的條件值`)
        return
      }
      result.push({ field: numericField, operator: numericOp, value: Number(numericVal) })
    }

    // 廣告類型（僅贈送流程）
    if (gift && adTypeVal.length > 0) {
      result.push({ field: 'adType', operator: 'eq', value: adTypeVal })
    }

    // 品牌
    if (brandVal.length > 0) {
      result.push({ field: 'brand', operator: 'eq', value: brandVal })
    }

    // 頻道
    if (channelVal.length > 0) {
      result.push({ field: 'businessChannel', operator: 'eq', value: channelVal })
    }

    onOk(result)
  }

  /** 通用行樣式 */
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, color: '#262626', minWidth: 130, flexShrink: 0,
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined style={{ color: '#FA8C16' }} />
          <span>條件設置：{nodeName}</span>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="確認"
      cancelText="取消"
      width={620}
      destroyOnClose
      styles={{ body: { padding: '16px 24px' } }}
    >
      {/* 條件開關 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>條件分支</div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
            啟用後，僅當條件滿足時此節點才會被激活參與審批
          </div>
        </div>
        <Switch checked={enableCondition} onChange={setEnableCondition}
          checkedChildren="啟用" unCheckedChildren="關閉" />
      </div>

      {enableCondition && (
        <>
          <Divider style={{ margin: '4px 0 16px' }} />
          <div style={{ padding: 16, background: '#FFF7E6', borderRadius: 8, border: '1px solid #FFE4B8' }}>

            {/* ── 廣告類型（僅贈送流程） ── */}
            {gift && (
              <div style={rowStyle}>
                <div style={labelStyle}>{adTypeLabel}</div>
                <Select mode="multiple" placeholder="全部"
                  options={CONDITION_AD_TYPE_OPTIONS}
                  value={adTypeVal}
                  onChange={v => setAdTypeVal(v)}
                  allowClear
                  style={{ flex: 1 }}
                  maxTagCount="responsive"
                />
              </div>
            )}

            {/* ── 數字類條件（金額 / 贈送天數） ── */}
            <div style={rowStyle}>
              <div style={labelStyle}>{numericLabel}</div>
              <Switch size="small" checked={numericEnabled}
                onChange={v => setNumericEnabled(v)}
                checkedChildren="啟用" unCheckedChildren="關閉"
                style={{ flexShrink: 0 }} />
              {numericEnabled && (
                <>
                  <Select value={numericOp} onChange={v => setNumericOp(v)}
                    options={AMOUNT_OPERATOR_OPTIONS}
                    style={{ width: 70, flexShrink: 0 }} />
                  <Input type="number" placeholder={`輸入${numericLabel}`}
                    value={numericVal}
                    onChange={e => setNumericVal(e.target.value)}
                    style={{ flex: 1 }} />
                </>
              )}
            </div>

            {/* ── 品牌 ── */}
            <div style={rowStyle}>
              <div style={labelStyle}>{brandLabel}</div>
              <Select mode="multiple" placeholder="全部"
                options={CONDITION_BRAND_OPTIONS}
                value={brandVal}
                onChange={v => setBrandVal(v)}
                allowClear
                style={{ flex: 1 }}
                maxTagCount="responsive"
              />
            </div>

            {/* ── 頻道 ── */}
            <div style={{ ...rowStyle, marginBottom: 0 }}>
              <div style={labelStyle}>{channelLabel}</div>
              <Select mode="multiple" placeholder="全部"
                options={CONDITION_CHANNEL_OPTIONS}
                value={channelVal}
                onChange={v => setChannelVal(v)}
                allowClear
                style={{ flex: 1 }}
                maxTagCount="responsive"
              />
            </div>

            <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
              多項條件之間為「且」關係，所有啟用的條件同時滿足時節點才會激活
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
