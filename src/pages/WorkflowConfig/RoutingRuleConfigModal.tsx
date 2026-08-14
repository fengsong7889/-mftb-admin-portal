/**
 * 路由規則配置彈窗
 *
 * 流程級別的路由規則管理：每條規則 = 條件 + 激活哪些節點。
 * 支持新增/刪除/編輯規則、條件配置、激活節點選擇、優先級排序。
 */
import { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Tag, Select, Input, Switch, Divider, Checkbox, message, Empty, Popconfirm } from 'antd'
import {
  ThunderboltOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  NodeIndexOutlined,
  EditOutlined,
} from '@ant-design/icons'
import {
  AMOUNT_OPERATOR_OPTIONS,
  CONDITION_OPERATOR_LABELS,
  CONDITION_BRAND_OPTIONS,
  CONDITION_CHANNEL_OPTIONS,
  CONDITION_AD_TYPE_OPTIONS,
  getConditionFieldOptions,
} from './types'
import type { RoutingRule, NodeCondition, ConditionOperator, WorkflowNode } from './types'

interface Props {
  open: boolean
  rules: RoutingRule[]
  nodes: WorkflowNode[]
  workflowType?: string
  onOk: (rules: RoutingRule[]) => void
  onCancel: () => void
}

/* ==================== 單條規則的條件編輯面板 ==================== */

interface ConditionEditorProps {
  conditions: NodeCondition[]
  workflowType?: string
  onChange: (conditions: NodeCondition[]) => void
}

function ConditionEditor({ conditions, workflowType, onChange }: ConditionEditorProps) {
  const gift = workflowType === 'gift'
  const numericField = gift ? 'giftDays' : 'amount'
  const fieldOptions = getConditionFieldOptions(workflowType)
  const numericLabel = fieldOptions.find(f => f.value === numericField)?.label || (gift ? '贈送天數' : '審批金額')

  const getCond = (field: string) => conditions.find(c => c.field === field)

  // 數字條件
  const numCond = getCond(numericField)
  const numericEnabled = !!numCond
  const numericOp = numCond?.operator || 'eq'
  const numericVal = String(numCond?.value ?? '')

  // 枚舉條件
  const brandCond = getCond('brand')
  const channelCond = getCond('businessChannel')
  const adCond = getCond('adType')
  const brandVal = brandCond && Array.isArray(brandCond.value) ? brandCond.value : CONDITION_BRAND_OPTIONS.map(o => o.value)
  const channelVal = channelCond && Array.isArray(channelCond.value) ? channelCond.value : CONDITION_CHANNEL_OPTIONS.map(o => o.value)
  const adTypeVal = adCond && Array.isArray(adCond.value) ? adCond.value : CONDITION_AD_TYPE_OPTIONS.map(o => o.value)

  const updateCondition = (field: string, operator: ConditionOperator, value: number | string[]) => {
    const next = conditions.filter(c => c.field !== field)
    next.push({ field, operator, value })
    onChange(next)
  }

  const removeCondition = (field: string) => {
    onChange(conditions.filter(c => c.field !== field))
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, color: '#262626', minWidth: 110, flexShrink: 0,
  }

  return (
    <div style={{ padding: 12, background: '#FFFBE6', borderRadius: 6, border: '1px solid #FFE58F' }}>
      {/* 數字條件 */}
      <div style={rowStyle}>
        <div style={labelStyle}>{numericLabel}</div>
        <Switch size="small" checked={numericEnabled}
          onChange={v => v ? updateCondition(numericField, numericOp, Number(numericVal) || 0) : removeCondition(numericField)}
          checkedChildren="啟用" unCheckedChildren="關閉" style={{ flexShrink: 0 }} />
        {numericEnabled && (
          <>
            <Select value={numericOp} onChange={v => updateCondition(numericField, v, Number(numericVal) || 0)}
              options={AMOUNT_OPERATOR_OPTIONS} style={{ width: 70, flexShrink: 0 }} />
            <Input type="number" placeholder={`輸入${numericLabel}`} value={numericVal}
              onChange={e => updateCondition(numericField, numericOp, Number(e.target.value) || 0)} style={{ flex: 1 }} />
          </>
        )}
      </div>

      {/* 品牌 */}
      <div style={rowStyle}>
        <div style={labelStyle}>所屬品牌</div>
        <Select mode="multiple" placeholder="全部" options={CONDITION_BRAND_OPTIONS}
          value={brandVal} onChange={v => v.length > 0 ? updateCondition('brand', 'in', v) : removeCondition('brand')}
          allowClear style={{ flex: 1 }} maxTagCount="responsive" />
      </div>

      {/* 頻道 */}
      <div style={rowStyle}>
        <div style={labelStyle}>業務頻道</div>
        <Select mode="multiple" placeholder="全部" options={CONDITION_CHANNEL_OPTIONS}
          value={channelVal} onChange={v => v.length > 0 ? updateCondition('businessChannel', 'in', v) : removeCondition('businessChannel')}
          allowClear style={{ flex: 1 }} maxTagCount="responsive" />
      </div>

      {/* 廣告類型（僅贈送流程） */}
      {gift && (
        <div style={{ ...rowStyle, marginBottom: 0 }}>
          <div style={labelStyle}>廣告類型</div>
          <Select mode="multiple" placeholder="全部" options={CONDITION_AD_TYPE_OPTIONS}
            value={adTypeVal} onChange={v => v.length > 0 ? updateCondition('adType', 'in', v) : removeCondition('adType')}
            allowClear style={{ flex: 1 }} maxTagCount="responsive" />
        </div>
      )}

      <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
        多項條件之間為「且」關係，所有啟用的條件同時滿足時激活對應節點
      </div>
    </div>
  )
}

/* ==================== 條件文本展示 ==================== */

function conditionToText(conditions: NodeCondition[], workflowType?: string): string {
  if (!conditions || conditions.length === 0) return '無條件（始終匹配）'
  const fieldOptions = getConditionFieldOptions(workflowType)
  return conditions.map(c => {
    const fieldLabel = fieldOptions.find(f => f.value === c.field)?.label || c.field
    const opLabel = CONDITION_OPERATOR_LABELS[c.operator] || c.operator
    const v = Array.isArray(c.value) ? c.value.join('、') : c.value
    return `${fieldLabel} ${opLabel} ${v}`
  }).join(' 且 ')
}

/* ==================== 主彈窗 ==================== */

export default function RoutingRuleConfigModal({ open, rules, nodes, workflowType, onOk, onCancel }: Props) {
  const [editRules, setEditRules] = useState<RoutingRule[]>([])
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)

  /* 初始化 */
  useEffect(() => {
    if (open) {
      setEditRules(rules.length > 0 ? JSON.parse(JSON.stringify(rules)) : [{
        id: `rr_${Date.now()}`,
        name: '默認規則',
        conditions: [],
        activatedNodeIds: nodes.map(n => n.id),
        priority: 999,
      }])
      setExpandedRuleId(null)
    }
  }, [open, rules, nodes])

  const addRule = useCallback(() => {
    const newRule: RoutingRule = {
      id: `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `規則 ${editRules.length + 1}`,
      conditions: [],
      activatedNodeIds: nodes.map(n => n.id),
      priority: editRules.length + 1,
    }
    setEditRules(prev => [...prev, newRule])
    setExpandedRuleId(newRule.id)
  }, [editRules.length, nodes])

  const removeRule = useCallback((id: string) => {
    setEditRules(prev => prev.filter(r => r.id !== id))
    if (expandedRuleId === id) setExpandedRuleId(null)
  }, [expandedRuleId])

  const updateRule = useCallback((id: string, patch: Partial<RoutingRule>) => {
    setEditRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [])

  const moveRule = useCallback((index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= editRules.length) return
    setEditRules(prev => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next.map((r, i) => ({ ...r, priority: i + 1 }))
    })
  }, [editRules.length])

  const handleOk = () => {
    if (editRules.length === 0) {
      message.warning('至少需要一條路由規則')
      return
    }
    for (const r of editRules) {
      if (!r.name.trim()) {
        message.warning('規則名稱不能為空')
        return
      }
      if (r.activatedNodeIds.length === 0) {
        message.warning(`規則「${r.name}」未選擇任何激活節點`)
        return
      }
    }
    onOk(editRules.map((r, i) => ({ ...r, priority: i + 1 })))
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NodeIndexOutlined style={{ color: '#722ED1' }} />
          <span>路由規則設置</span>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="確認"
      cancelText="取消"
      width={720}
      destroyOnClose
      styles={{ body: { maxHeight: '65vh', overflowY: 'auto', padding: '16px 24px' } }}
    >
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>
        路由規則決定每次提交時根據條件激活哪些審批節點。規則按優先級從上到下匹配，第一條匹配的規則生效。
      </div>

      {editRules.length === 0 && (
        <Empty description="暫無路由規則" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={addRule}>添加規則</Button>
        </Empty>
      )}

      {editRules.map((rule, idx) => {
        const isExpanded = expandedRuleId === rule.id
        const isDefault = rule.conditions.length === 0
        return (
          <div key={rule.id} style={{
            border: '1px solid #e8eaed', borderRadius: 8, marginBottom: 12,
            borderLeft: `4px solid ${isDefault ? '#52C41A' : '#722ED1'}`,
            overflow: 'hidden',
          }}>
            {/* 規則頭部 */}
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, background: '#FAFAFA' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: '#722ED1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {idx + 1}
              </div>
              <Input
                value={rule.name}
                onChange={e => updateRule(rule.id, { name: e.target.value })}
                style={{ width: 160, fontWeight: 600 }}
                bordered={false}
                placeholder="規則名稱"
              />
              {isDefault && (
                <Tag color="green" style={{ margin: 0, fontSize: 11 }}>默認規則</Tag>
              )}
              <Tag style={{ margin: 0, fontSize: 11 }}>
                激活 {rule.activatedNodeIds.length}/{nodes.length} 個節點
              </Tag>
              <div style={{ flex: 1 }} />
              <Button size="small" type="text" icon={<EditOutlined />}
                onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                style={{ fontSize: 12, color: isExpanded ? '#722ED1' : '#8C8C8C' }}>
                {isExpanded ? '收起' : '編輯'}
              </Button>
              <Button size="small" type="text" icon={<ArrowUpOutlined />}
                disabled={idx === 0} onClick={() => moveRule(idx, -1)}
                style={{ fontSize: 12, color: idx === 0 ? '#D9D9D9' : '#8C8C8C' }} />
              <Button size="small" type="text" icon={<ArrowDownOutlined />}
                disabled={idx === editRules.length - 1} onClick={() => moveRule(idx, 1)}
                style={{ fontSize: 12, color: idx === editRules.length - 1 ? '#D9D9D9' : '#8C8C8C' }} />
              <Popconfirm title={`刪除規則「${rule.name}」？`} onConfirm={() => removeRule(rule.id)}
                okText="刪除" cancelText="取消" okButtonProps={{ danger: true }}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ fontSize: 12 }} />
              </Popconfirm>
            </div>

            {/* 展開時編輯條件和節點 */}
            {isExpanded && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #F0F0F0' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>匹配條件</div>
                  <ConditionEditor
                    conditions={rule.conditions}
                    workflowType={workflowType}
                    onChange={conds => updateRule(rule.id, { conditions: conds })}
                  />
                  {rule.conditions.length === 0 && (
                    <div style={{ fontSize: 11, color: '#52C41A', marginTop: 4 }}>
                      未設置條件 = 默認規則，始終匹配
                    </div>
                  )}
                </div>

                <Divider style={{ margin: '8px 0' }} />

                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>激活節點</div>
                  <Checkbox.Group
                    value={rule.activatedNodeIds}
                    onChange={vals => updateRule(rule.id, { activatedNodeIds: vals as string[] })}
                    style={{ width: '100%' }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {nodes.map(n => (
                        <Checkbox key={n.id} value={n.id} style={{ margin: 0 }}>
                          <span style={{ fontSize: 13 }}>#{n.sortOrder} {n.name}</span>
                        </Checkbox>
                      ))}
                    </div>
                  </Checkbox.Group>
                </div>
              </div>
            )}

            {/* 收起時展示摘要 */}
            {!isExpanded && (
              <div style={{
                padding: '6px 16px 8px', borderTop: '1px solid #F0F0F0',
                fontSize: 12, color: '#595959', display: 'flex', gap: 16, flexWrap: 'wrap',
              }}>
                <div>
                  <span style={{ color: '#8C8C8C' }}>條件：</span>
                  <ThunderboltOutlined style={{ color: '#FA8C16', marginRight: 4 }} />
                  {conditionToText(rule.conditions, workflowType)}
                </div>
                <div>
                  <span style={{ color: '#8C8C8C' }}>激活：</span>
                  {rule.activatedNodeIds.map(nid => {
                    const n = nodes.find(nd => nd.id === nid)
                    return n ? <Tag key={nid} style={{ fontSize: 11, marginBottom: 0 }}>#{n.sortOrder} {n.name}</Tag> : null
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {editRules.length > 0 && (
        <Button type="dashed" icon={<PlusOutlined />} onClick={addRule} block style={{ marginTop: 4 }}>
          添加規則
        </Button>
      )}
    </Modal>
  )
}
