import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Form, Input, Select, Radio, InputNumber, Button, Tag, message, Modal, Popconfirm } from 'antd'
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
  ThunderboltOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useWorkflowConfig } from '../../hooks/useWorkflowConfig'
import {
  APPROVAL_TYPE_OPTIONS,
  APPROVER_TYPE_LABELS,
  APPROVAL_RULE_LABELS,
  REJECT_BEHAVIOR_LABELS,
  CONDITION_OPERATOR_LABELS,
  CONDITION_FIELD_OPTIONS,
  getConditionFieldOptions,
} from './types'
import type { WorkflowNode, WorkflowDefinition, ApproverType, NodeCondition } from './types'
import { getApproverOptions } from './options'
import ApproverConfigModal from './ApproverConfigModal'
import ConditionConfigModal from './ConditionConfigModal'

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

  /* 條件配置彈窗 */
  const [conditionModalOpen, setConditionModalOpen] = useState(false)
  const [editingConditionNode, setEditingConditionNode] = useState<WorkflowNode | null>(null)

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

  /* 打開條件配置 */
  const handleEditCondition = useCallback((node: WorkflowNode) => {
    setEditingConditionNode(node)
    setConditionModalOpen(true)
  }, [])

  /* 審批人配置確認 */
  const handleApproverOk = useCallback((values: {
    name: string
    approverType: ApproverType
    approverIds: string[]
    approvalRule: WorkflowNode['approvalRule']
    ccUserIds: string[]
  }) => {
    if (editingApproverNode) {
      /* 編輯已有節點的審批人信息 */
      setNodes(prev => prev.map(n => n.id === editingApproverNode.id ? { ...n, ...values } : n))
    } else {
      /* 新增節點：追加到末尾 */
      const newId = `nd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const newNode: WorkflowNode = {
        ...values,
        id: newId,
        sortOrder: nodes.length + 1,
        condition: [],
        timeoutHours: null,
      }
      setNodes(prev => [...prev, newNode])
    }
    setApproverModalOpen(false)
    setEditingApproverNode(null)
  }, [editingApproverNode, nodes.length])

  /* 條件配置確認 */
  const handleConditionOk = useCallback((conditions: NodeCondition[]) => {
    if (editingConditionNode) {
      setNodes(prev => prev.map(n => n.id === editingConditionNode.id ? { ...n, condition: conditions } : n))
    }
    setConditionModalOpen(false)
    setEditingConditionNode(null)
  }, [editingConditionNode])

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

  /* 條件文本 */
  const getConditionText = useCallback((node: WorkflowNode) => {
    if (!node.condition || node.condition.length === 0) return ''
    const fieldOptions = getConditionFieldOptions(approvalType)
    return node.condition.map(c => {
      const fieldLabel = fieldOptions.find(f => f.value === c.field)?.label || c.field
      const opLabel = CONDITION_OPERATOR_LABELS[c.operator] || c.operator
      const v = Array.isArray(c.value) ? c.value.join('、') : c.value
      return `${fieldLabel} ${opLabel} ${v}`
    }).join(' 且 ')
  }, [approvalType])

  /* 審批人圖標 */
  const getApproverIcon = useCallback((type: ApproverType) => {
    const map: Record<ApproverType, React.ReactNode> = {
      person: <UserOutlined style={{ fontSize: 12 }} />,
      role: <TeamOutlined style={{ fontSize: 12 }} />,
      department_leader: <ApartmentOutlined style={{ fontSize: 12 }} />,
      initiator_leader: <CrownOutlined style={{ fontSize: 12 }} />,
    }
    return map[type]
  }, [])

  /* 審批人展示文本 */
  const getApproverText = useCallback((node: WorkflowNode) => {
    const typeLabel = APPROVER_TYPE_LABELS[node.approverType]
    if (node.approverType === 'initiator_leader') return typeLabel
    const options = getApproverOptions(node.approverType)
    const names = node.approverIds
      .map(v => options.find(o => o.value === v)?.label || v)
      .join('、')
    return `${typeLabel}：${names || '未選擇'}`
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
      if (n.approverIds.length === 0 && n.approverType !== 'initiator_leader') {
        message.warning(`節點「${n.name}」未配置審批人`)
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
                {(node.condition?.length ?? 0) > 0 ? (
                  <Tag color="orange" icon={<ThunderboltOutlined />} style={{ margin: 0, fontSize: 11 }}>
                    {getConditionText(node)}
                  </Tag>
                ) : (
                  <Tag style={{ margin: 0, fontSize: 11 }}>無條件</Tag>
                )}
                <div style={{ flex: 1 }} />
                {/* 配置入口：審批人與條件分離 */}
                <Button size="small" type="link" icon={<SettingOutlined />}
                  onClick={() => handleEditApprover(node)}
                  style={{ color: '#E8720C', fontSize: 12 }}>
                  審批人設置
                </Button>
                <Button size="small" type="link" icon={<ThunderboltOutlined />}
                  onClick={() => handleEditCondition(node)}
                  style={{ color: '#FA8C16', fontSize: 12 }}>
                  條件設置
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
                  {getApproverIcon(node.approverType)}
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
                  {APPROVAL_RULE_LABELS[node.approvalRule]}
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
                {(node.condition?.length ?? 0) > 0 && (
                  <div>
                    <span style={{ color: '#8C8C8C' }}>條件：</span>
                    <span style={{ color: '#FA8C16' }}>{getConditionText(node)}</span>
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

      {/* ── 條件配置彈窗 ── */}
      <ConditionConfigModal
        open={conditionModalOpen}
        nodeName={editingConditionNode?.name || ''}
        conditions={editingConditionNode?.condition ?? []}
        workflowType={approvalType}
        onOk={handleConditionOk}
        onCancel={() => { setConditionModalOpen(false); setEditingConditionNode(null) }}
      />
    </div>
  )
}
