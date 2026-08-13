import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Tag, Tabs, Modal, Descriptions, Empty } from 'antd'
import {
  ArrowLeftOutlined,
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CrownOutlined,
  ThunderboltOutlined,
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
import type { WorkflowNode, WorkflowDefinition, ApproverType } from './types'
import { getApproverOptions } from './options'

/** 流程類型標籤映射（複用 APPROVAL_TYPE_OPTIONS） */
const typeLabelMap = Object.fromEntries(APPROVAL_TYPE_OPTIONS.map(o => [o.value, o.label]))

/** 審批人圖標 */
function approverIcon(type: ApproverType) {
  const map: Record<ApproverType, React.ReactNode> = {
    person: <UserOutlined />,
    role: <TeamOutlined />,
    department_leader: <ApartmentOutlined />,
    initiator_leader: <CrownOutlined />,
  }
  return map[type]
}

/** 審批人展示文本 */
function approverText(node: WorkflowNode) {
  if (node.approverType === 'initiator_leader') return APPROVER_TYPE_LABELS[node.approverType]
  const options = getApproverOptions(node.approverType)
  const names = node.approverIds.map(v => options.find(o => o.value === v)?.label || v).join('、')
  return `${APPROVER_TYPE_LABELS[node.approverType]}：${names || '未選擇'}`
}

/** 條件文本 */
function conditionText(node: WorkflowNode, workflowType?: string) {
  if (!node.condition || node.condition.length === 0) return ''
  const fieldOptions = getConditionFieldOptions(workflowType)
  return node.condition.map(c => {
    const fieldLabel = fieldOptions.find(f => f.value === c.field)?.label || c.field
    const opLabel = CONDITION_OPERATOR_LABELS[c.operator] || c.operator
    const v = Array.isArray(c.value) ? c.value.join('、') : c.value
    return `${fieldLabel} ${opLabel} ${v}`
  }).join(' 且 ')
}

export default function WorkflowDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { getWorkflow } = useWorkflowConfig()
  const workflow: WorkflowDefinition | undefined = getWorkflow(id || '')

  const [activeTab, setActiveTab] = useState('config')
  const [viewNode, setViewNode] = useState<WorkflowNode | null>(null)

  if (!workflow) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Empty description="流程不存在或已被刪除">
          <Button type="primary" onClick={() => navigate('/workflow-config')}>返回列表</Button>
        </Empty>
      </div>
    )
  }

  const nodeColors = ['#1890FF', '#52C41A', '#E8720C', '#722ED1', '#13C2C2', '#EB2F96', '#FA8C16', '#2F54EB']

  /* ── Tab1：流程配置查看（只讀） ── */
  const renderConfig = () => (
    <div>
      {/* 基本信息 */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E6F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ApartmentOutlined style={{ fontSize: 14, color: '#1890FF' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={2} size="middle" labelStyle={{ color: '#8C8C8C', width: 120 }} contentStyle={{ color: '#262626' }}>
          <Descriptions.Item label="流程名稱">
            <span style={{ fontWeight: 600 }}>{workflow.name}</span>
          </Descriptions.Item>
          <Descriptions.Item label="流程類型">
            <Tag color={typeLabelMap[workflow.approvalType] ? '#1890FF' : undefined}>
              {typeLabelMap[workflow.approvalType] || workflow.approvalType}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="狀態">
            {workflow.enabled ? <Tag color="success">啟用</Tag> : <Tag color="default">停用</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="審批節點">
            <span style={{ fontWeight: 600 }}>{workflow.nodes.length} 個</span>
          </Descriptions.Item>
          <Descriptions.Item label="駁回策略">
            {REJECT_BEHAVIOR_LABELS[workflow.rejectBehavior]}
          </Descriptions.Item>
          <Descriptions.Item label="全局超時提醒">
            {workflow.timeoutHours ? `${workflow.timeoutHours} 小時` : '不限'}
          </Descriptions.Item>
          <Descriptions.Item label="流程描述" span={2}>
            {workflow.description || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="最後更新人">
            {workflow.updatedBy || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="最後更新時間">
            {workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString('zh-TW', { hour12: false }) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </div>

      {/* 節點列表（只讀卡片） */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F9F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeamOutlined style={{ fontSize: 14, color: '#722ED1' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>審批節點</span>
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400, marginLeft: 4 }}>
            點擊審批人可查看明細
          </span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        {workflow.nodes.map((node, idx) => {
          const color = nodeColors[idx % nodeColors.length]
          return (
            <div key={node.id} style={{
              border: '1px solid #e8eaed', borderRadius: 8, marginBottom: 12,
              overflow: 'hidden', borderLeft: `4px solid ${color}`,
            }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>
                  {node.sortOrder}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{node.name}</span>
                {(node.condition?.length ?? 0) > 0 ? (
                  <Tag color="orange" icon={<ThunderboltOutlined />} style={{ margin: 0, fontSize: 11 }}>
                    {conditionText(node, workflow.approvalType)}
                  </Tag>
                ) : (
                  <Tag style={{ margin: 0, fontSize: 11 }}>無條件</Tag>
                )}
              </div>
              <div style={{
                padding: '10px 16px 12px', borderTop: '1px solid #F5F5F5',
                display: 'flex', gap: 24, fontSize: 12, color: '#595959', flexWrap: 'wrap',
                background: '#FAFAFA',
              }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#8C8C8C' }}>審批人：</span>
                  {approverIcon(node.approverType)}
                  <span
                    style={{ color: '#1890FF', cursor: 'pointer', textDecoration: 'underline dotted' }}
                    onClick={() => setViewNode(node)}
                    title="點擊查看審批人明細"
                  >
                    {approverText(node)}
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  /* ── Tab2：流程圖（規則流轉可視化） ── */
  const renderFlow = () => (
    <div style={{
      border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
      padding: '32px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      overflowX: 'auto',
    }}>
      <div style={{ minWidth: 480, maxWidth: 720, margin: '0 auto' }}>
        {/* 開始 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '6px 20px', borderRadius: 20,
            background: '#F6FFED', border: '1px solid #B7EB8F', color: '#52C41A',
            fontWeight: 600, fontSize: 13,
          }}>
            開始
          </div>
        </div>

        {workflow.nodes.map((node, idx) => {
          const color = nodeColors[idx % nodeColors.length]
          return (
            <div key={node.id}>
              {/* 連線（帶條件標籤） */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                <div style={{ width: 2, height: 28, background: '#D9D9D9' }} />
                {(node.condition?.length ?? 0) > 0 && (
                  <div style={{
                    display: 'inline-block', padding: '2px 10px', margin: '4px 0',
                    background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 4,
                    fontSize: 11, color: '#D46B08', maxWidth: 420, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <ThunderboltOutlined style={{ marginRight: 4 }} />
                    條件：{conditionText(node, workflow.approvalType)}
                  </div>
                )}
                <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid #D9D9D9' }} />
              </div>

              {/* 節點卡片 */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  display: 'inline-block', minWidth: 260, textAlign: 'left',
                  border: `1px solid ${color}55`, borderRadius: 8, padding: '12px 16px',
                  background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  borderLeft: `4px solid ${color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {node.sortOrder}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{node.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#595959', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {approverIcon(node.approverType)}
                      <span style={{ color: '#1890FF', cursor: 'pointer', textDecoration: 'underline dotted' }}
                        onClick={() => setViewNode(node)}>
                        {approverText(node)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: '#8C8C8C' }}>規則：</span>
                      {node.approvalRule === 'all' ? '會簽' : '單人通過'}
                    </span>
                    {node.timeoutHours && <span>超時 {node.timeoutHours}h</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* 結束 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
          <div style={{ width: 2, height: 28, background: '#D9D9D9' }} />
          <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid #D9D9D9' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '6px 20px', borderRadius: 20,
            background: '#FFF1F0', border: '1px solid #FFA39E', color: '#FF4D4F',
            fontWeight: 600, fontSize: 13,
          }}>
            結束
          </div>
        </div>
      </div>
    </div>
  )

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
                {workflow.name}詳情
              </h2>
              {workflow.enabled ? <Tag color="success" style={{ margin: 0 }}>啟用</Tag> : <Tag style={{ margin: 0 }}>停用</Tag>}
            </div>
          </div>
        </div>
      </div>

      {/* ── 詳情 Tabs：流程配置查看 / 流程圖 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'config', label: '流程配置', children: renderConfig() },
            { key: 'flow', label: '流程圖', children: renderFlow() },
          ]}
        />
      </div>

      {/* ── 審批人明細彈窗（只讀） ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {viewNode && approverIcon(viewNode.approverType)}
            <span>審批人明細：{viewNode?.name}</span>
          </div>
        }
        open={viewNode != null}
        onCancel={() => setViewNode(null)}
        footer={null}
        width={520}
      >
        {viewNode && (
          <Descriptions column={1} size="middle" labelStyle={{ color: '#8C8C8C', width: 110 }}>
            <Descriptions.Item label="審批人類型">
              {APPROVER_TYPE_LABELS[viewNode.approverType]}
            </Descriptions.Item>
            <Descriptions.Item label="審批人">
              {viewNode.approverType === 'initiator_leader' ? (
                <span style={{ color: '#52C41A' }}>自動取發起人的直屬主管</span>
              ) : (
                viewNode.approverIds.map(v => {
                  const opt = getApproverOptions(viewNode.approverType).find(o => o.value === v)
                  return <Tag key={v} style={{ marginBottom: 4 }}>{opt?.label || v}</Tag>
                })
              )}
            </Descriptions.Item>
            <Descriptions.Item label="審批規則">
              {APPROVAL_RULE_LABELS[viewNode.approvalRule]}
            </Descriptions.Item>
            <Descriptions.Item label="抄送人員">
              {viewNode.ccUserIds.length > 0
                ? viewNode.ccUserIds.map(v => {
                    const opt = getApproverOptions('person').find(o => o.value === v)
                    return <Tag key={v} style={{ marginBottom: 4 }}>{opt?.label || v}</Tag>
                  })
                : '無'}
            </Descriptions.Item>
            <Descriptions.Item label="節點超時">
              {viewNode.timeoutHours ? `${viewNode.timeoutHours} 小時` : '不限'}
            </Descriptions.Item>
            <Descriptions.Item label="激活條件">
              {(viewNode.condition?.length ?? 0) > 0 ? (
                <Tag color="orange" icon={<ThunderboltOutlined />}>{conditionText(viewNode, workflow.approvalType)}</Tag>
              ) : '無條件，始終參與審批'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
