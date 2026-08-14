import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Form, Input, Select, Radio, InputNumber, Button, Tag, message, Popconfirm, Checkbox } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CrownOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SettingOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import { useWorkflowConfig } from '../../hooks/useWorkflowConfig'
import {
  APPROVAL_TYPE_OPTIONS,
  APPROVER_TYPE_LABELS,
  APPROVAL_RULE_LABELS,
  REJECT_BEHAVIOR_LABELS,
  BRAND_CONFIG_OPTIONS,
  getApproverSettingForBrand,
  createDefaultApproverConfig,
} from './types'
import type { WorkflowNode, WorkflowDefinition, ApproverConfig, RoutingRule } from './types'
import { getApproverOptions } from './options'
import ApproverConfigModal from './ApproverConfigModal'
import RoutingRuleConfigModal from './RoutingRuleConfigModal'

export default function WorkflowEditor() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const { getWorkflow, addWorkflow, updateWorkflow } = useWorkflowConfig()

  const existing = isNew ? undefined : getWorkflow(id || '')

  /* 表單 */
  const [form] = Form.useForm()
  const [name, setName] = useState(existing?.name || '')
  const [approvalType, setApprovalType] = useState(existing?.approvalType || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [rejectBehavior, setRejectBehavior] = useState(existing?.rejectBehavior || 'restart' as const)
  const [timeoutHours, setTimeoutHours] = useState<number | null>(existing?.timeoutHours ?? null)

  /* 節點列表 */
  const [nodes, setNodes] = useState<WorkflowNode[]>(existing?.nodes || [])

  /* 審批人配置彈窗 */
  const [approverModalOpen, setApproverModalOpen] = useState(false)
  const [editingApproverNode, setEditingApproverNode] = useState<WorkflowNode | null>(null)

  /* 路由規則 */
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>(existing?.routingRules || [])
  const [routingRuleModalOpen, setRoutingRuleModalOpen] = useState(false)

  /* 節點顏色 */
  const nodeColors = ['#1890FF', '#52C41A', '#E8720C', '#722ED1', '#13C2C2', '#EB2F96', '#FA8C16', '#2F54EB']

  /* 打開新增節點（審批人配置彈窗） */
  const handleAddNode = useCallback(() => {
    setEditingApproverNode(null)
    setApproverModalOpen(true)
  }, [])

  /* 打開編輯審批人 */
  const handleEditApprover = useCallback((node: WorkflowNode) => {
    setEditingApproverNode(node)
    setApproverModalOpen(true)
  }, [])

  /* 審批人配置確認 */
  const handleApproverOk = useCallback((values: {
    name: string
    approverConfig: ApproverConfig
    ccUserIds: string[]
  }) => {
    if (editingApproverNode) {
      /* 編輯已有節點 */
      setNodes(prev => prev.map(n => n.id === editingApproverNode.id
        ? { ...n, name: values.name, approverConfig: values.approverConfig, ccUserIds: values.ccUserIds }
        : n))
    } else {
      /* 新增節點 */
      const newId = `nd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const newNode: WorkflowNode = {
        id: newId,
        name: values.name,
        sortOrder: nodes.length + 1,
        approverConfig: values.approverConfig,
        ccUserIds: values.ccUserIds,
        timeoutHours: null,
      }
      setNodes(prev => [...prev, newNode])
    }
    setApproverModalOpen(false)
    setEditingApproverNode(null)
  }, [editingApproverNode, nodes.length])

  /* 路由規則確認 */
  const handleRoutingRulesOk = useCallback((rules: RoutingRule[]) => {
    setRoutingRules(rules)
    setRoutingRuleModalOpen(false)
  }, [])

  /* 節點上移/下移 */
  const handleMoveNode = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= nodes.length) return
    setNodes(prev => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next.map((n, i) => ({ ...n, sortOrder: i + 1 }))
    })
  }, [nodes.length])

  /* 刪除節點（卡片上的 Popconfirm 已確認，直接執行） */
  const handleDeleteNode = useCallback((nodeId: string, nodeName: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId).map((n, i) => ({ ...n, sortOrder: i + 1 })))
    message.success(`「${nodeName}」已刪除`)
  }, [])

  /* 審批人展示文本（基於 approverConfig） */
  const getApproverText = useCallback((node: WorkflowNode) => {
    const cfg = node.approverConfig
    if (!cfg) return '未配置'
    if (!cfg.byBrand) {
      const s = cfg.default
      const typeLabel = APPROVER_TYPE_LABELS[s.approverType]
      if (s.approverType === 'initiator_leader') return typeLabel
      const options = getApproverOptions(s.approverType)
      const names = s.approverIds.map(v => options.find(o => o.value === v)?.label || v).join('、')
      return `${typeLabel}：${names || '未選擇'}`
    }
    // 按品牌時簡要展示
    const parts: string[] = []
    for (const brand of BRAND_CONFIG_OPTIONS) {
      const s = cfg.brands[brand.value]
      if (s) {
        const typeLabel = APPROVER_TYPE_LABELS[s.approverType]
        parts.push(`${brand.label}: ${typeLabel}`)
      }
    }
    if (cfg.default) {
      const typeLabel = APPROVER_TYPE_LABELS[cfg.default.approverType]
      parts.unshift(`默認: ${typeLabel}`)
    }
    return parts.join('；') || '未配置'
  }, [])

  /* 審批規則展示 */
  const getApprovalRuleText = useCallback((node: WorkflowNode) => {
    const cfg = node.approverConfig
    if (!cfg) return ''
    if (!cfg.byBrand) return APPROVAL_RULE_LABELS[cfg.default.approvalRule]
    const parts: string[] = []
    for (const brand of BRAND_CONFIG_OPTIONS) {
      const s = cfg.brands[brand.value]
      if (s) parts.push(`${brand.label}: ${APPROVAL_RULE_LABELS[s.approvalRule]}`)
    }
    return parts.join('；') || APPROVAL_RULE_LABELS[cfg.default?.approvalRule || 'any']
  }, [])

  /* 保存 */
  const handleSave = () => {
    if (!name.trim()) {
      message.warning('請輸入流程名稱')
      return
    }
    if (!approvalType) {
      message.warning('請選擇流程類型')
      return
    }
    if (nodes.length === 0) {
      message.warning('請至少添加一個審批節點')
      return
    }
    for (const n of nodes) {
      const cfg = n.approverConfig
      if (!cfg) {
        message.warning(`節點「${n.name}」未配置審批人`)
        return
      }
      if (!cfg.byBrand && cfg.default.approverIds.length === 0 && cfg.default.approverType !== 'initiator_leader') {
        message.warning(`節點「${n.name}」未配置審批人`)
        return
      }
    }
    if (routingRules.length === 0) {
      message.warning('請至少添加一條路由規則')
      return
    }
    for (const r of routingRules) {
      if (r.activatedNodeIds.length === 0) {
        message.warning(`路由規則「${r.name}」未激活任何節點`)
        return
      }
    }

    const base = {
      name: name.trim(),
      approvalType,
      description,
      rejectBehavior,
      timeoutHours,
      nodes,
      routingRules,
      updatedAt: new Date().toISOString(),
    }

    if (isNew) {
      addWorkflow({ ...base, workflowKey: `wf_${Date.now()}` } as WorkflowDefinition)
      message.success('流程已創建')
    } else {
      updateWorkflow(id || '', base)
      message.success('流程已保存')
    }
    navigate('/workflow-config')
  }

  return (
    <div className="content-area">
      {/* ── 頂部標題欄 ── */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/workflow-config')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              返回
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isNew ? '新增審批流程' : `${existing?.name || ''}編輯`}
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* ── A. 基本信息區 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E6F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ApartmentOutlined style={{ fontSize: 14, color: '#1890FF' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Form layout="vertical" form={form} requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="流程名稱" required>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：充值審批" maxLength={30} />
            </Form.Item>
            <Form.Item label="流程類型" required>
              <Select value={approvalType} onChange={v => setApprovalType(v)}
                placeholder="選擇流程類型" options={APPROVAL_TYPE_OPTIONS}
                disabled={!isNew && !!existing} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="駁回策略">
              <Radio.Group value={rejectBehavior} onChange={e => setRejectBehavior(e.target.value)}>
                {(Object.entries(REJECT_BEHAVIOR_LABELS) as [string, string][]).map(([k, v]) => (
                  <Radio key={k} value={k}>{v}</Radio>
                ))}
              </Radio.Group>
            </Form.Item>
            <Form.Item label="全局超時提醒（小時）">
              <InputNumber value={timeoutHours} onChange={v => setTimeoutHours(v)} min={1} max={720}
                style={{ width: '100%' }} placeholder="不限" />
            </Form.Item>
          </div>
          <Form.Item label="流程描述">
            <Input.TextArea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="簡要描述此審批流程的用途" rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </div>

      {/* ── B2. 路由規則區 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FFF0F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <NodeIndexOutlined style={{ fontSize: 14, color: '#EB2F96' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>路由規則</span>
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400, marginLeft: 4 }}>
            根據條件決定每次提交激活哪些審批節點
          </span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <Button type="primary" size="small" icon={<SettingOutlined />} onClick={() => setRoutingRuleModalOpen(true)}
            style={{ borderRadius: 6, backgroundColor: '#722ED1', borderColor: '#722ED1' }}>
            設置規則
          </Button>
        </div>

        {routingRules.length === 0 ? (
          <div style={{
            padding: '24px 0', textAlign: 'center', color: '#BFBFBF',
            border: '2px dashed #F0F0F0', borderRadius: 8,
          }}>
            <ExclamationCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
            <div>尚未配置路由規則，請點擊「設置規則」</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {routingRules.sort((a, b) => a.priority - b.priority).map((rule, idx) => {
              const isDefault = rule.conditions.length === 0
              return (
                <div key={rule.id} style={{
                  padding: '10px 16px', border: '1px solid #e8eaed', borderRadius: 6,
                  borderLeft: `4px solid ${isDefault ? '#52C41A' : '#722ED1'}`,
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', background: '#722ED1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>
                  <span style={{ fontWeight: 600 }}>{rule.name}</span>
                  {isDefault && <Tag color="green" style={{ margin: 0, fontSize: 11 }}>默認</Tag>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                    激活 {rule.activatedNodeIds.length}/{nodes.length} 個節點
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {rule.activatedNodeIds.map(nid => {
                      const n = nodes.find(nd => nd.id === nid)
                      return n ? <Tag key={nid} style={{ fontSize: 11, margin: 0 }}>#{n.sortOrder} {n.name}</Tag> : null
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── C. 審批節點列表 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F9F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeamOutlined style={{ fontSize: 14, color: '#722ED1' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>審批節點</span>
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400, marginLeft: 4 }}>
            共 {nodes.length} 個節點，按順序依次審批
          </span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddNode} style={{ borderRadius: 6 }}>
            添加節點
          </Button>
        </div>

        {nodes.length === 0 && (
          <div style={{
            padding: '40px 0', textAlign: 'center', color: '#BFBFBF',
            border: '2px dashed #F0F0F0', borderRadius: 8, marginBottom: 16,
          }}>
            <ExclamationCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
            <div>暫無審批節點，請點擊右上角按鈕添加</div>
          </div>
        )}

        {/* 節點卡片列表 */}
        {nodes.map((node, idx) => {
          const color = nodeColors[idx % nodeColors.length]
          const isFirst = idx === 0
          const isLast = idx === nodes.length - 1
          return (
            <div key={node.id} style={{
              border: '1px solid #e8eaed', borderRadius: 8, marginBottom: 12,
              overflow: 'hidden', transition: 'all 0.2s',
              borderLeft: `4px solid ${color}`,
            }}>
              {/* 卡片頭部 */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>
                  {node.sortOrder}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                  {node.name}
                </span>
                {node.approverConfig?.byBrand && (
                  <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>按品牌區分</Tag>
                )}
                <div style={{ flex: 1 }} />
                <Button size="small" type="link" icon={<SettingOutlined />}
                  onClick={() => handleEditApprover(node)}
                  style={{ color: '#E8720C', fontSize: 12 }}>
                  審批人設置
                </Button>
                {/* 排序調整 */}
                <Button size="small" type="text" icon={<ArrowUpOutlined />}
                  disabled={isFirst}
                  onClick={() => handleMoveNode(idx, -1)}
                  style={{ fontSize: 12, color: isFirst ? '#D9D9D9' : '#8C8C8C' }} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />}
                  disabled={isLast}
                  onClick={() => handleMoveNode(idx, 1)}
                  style={{ fontSize: 12, color: isLast ? '#D9D9D9' : '#8C8C8C' }} />
                <Popconfirm
                  title={`刪除節點「${node.name}」？`}
                  okText="刪除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDeleteNode(node.id, node.name)}
                >
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ fontSize: 12 }} />
                </Popconfirm>
              </div>
              {/* 卡片內容 */}
              <div style={{
                padding: '10px 16px 12px', borderTop: '1px solid #F5F5F5',
                display: 'flex', gap: 24, fontSize: 12, color: '#595959', flexWrap: 'wrap',
                background: '#FAFAFA',
              }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#8C8C8C' }}>審批人：</span>
                  <span
                    style={{ color: '#1890FF', cursor: 'pointer', textDecoration: 'underline dotted' }}
                    onClick={() => handleEditApprover(node)}
                    title="點擊查看/修改審批人"
                  >
                    {getApproverText(node)}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#8C8C8C' }}>規則：</span>
                  {getApprovalRuleText(node)}
                </div>
                {node.ccUserIds.length > 0 && (
                  <div>
                    <span style={{ color: '#8C8C8C' }}>抄送：</span>
                    {node.ccUserIds.length} 人
                  </div>
                )}
                {node.timeoutHours && (
                  <div>
                    <span style={{ color: '#8C8C8C' }}>超時：</span>
                    {node.timeoutHours} 小時
                  </div>
                )}
              </div>
            </div>
          )
        })}

      </div>

      {/* ── 底部操作欄 ── */}
      <div className="form-footer">
        <Button onClick={() => navigate('/workflow-config')}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
      </div>

      {/* ── 審批人配置彈窗 ── */}
      <ApproverConfigModal
        open={approverModalOpen}
        node={editingApproverNode}
        nextSortOrder={nodes.length + 1}
        onOk={handleApproverOk}
        onCancel={() => { setApproverModalOpen(false); setEditingApproverNode(null) }}
      />

      {/* ── 路由規則配置彈窗 ── */}
      <RoutingRuleConfigModal
        open={routingRuleModalOpen}
        rules={routingRules}
        nodes={nodes}
        workflowType={approvalType}
        onOk={handleRoutingRulesOk}
        onCancel={() => setRoutingRuleModalOpen(false)}
      />
    </div>
  )
}
