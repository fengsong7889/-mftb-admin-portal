import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Tag, Tabs, Modal, Descriptions, Empty } from 'antd'
import {
  TeamOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useWorkflowConfig } from '../../hooks/useWorkflowConfig'
import {
  APPROVAL_TYPE_OPTIONS,
  APPROVER_TYPE_LABELS,
  APPROVAL_RULE_LABELS,
  REJECT_BEHAVIOR_LABELS,
  BRAND_CONFIG_OPTIONS,
} from './types'
import type { WorkflowNode, WorkflowDefinition, ApproverConfig } from './types'
import { getApproverOptions } from './options'

/** 流程類型標籤映射（複用 APPROVAL_TYPE_OPTIONS） */
const typeLabelMap = Object.fromEntries(APPROVAL_TYPE_OPTIONS.map(o => [o.value, o.label]))

/** 從 approverConfig 獲取展示文本 */
function approverConfigText(cfg: ApproverConfig | undefined): string {
  if (!cfg) return '未配置'
  if (!cfg.byBrand) {
    const s = cfg.default
    const typeLabel = APPROVER_TYPE_LABELS[s.approverType]
    if (s.approverType === 'initiator_leader') return typeLabel
    const options = getApproverOptions(s.approverType)
    const names = s.approverIds.map(v => options.find(o => o.value === v)?.label || v).join('、')
    return `${typeLabel}：${names || '未選擇'}`
  }
  const parts: string[] = []
  for (const brand of BRAND_CONFIG_OPTIONS) {
    const s = cfg.brands[brand.value]
    if (s) {
      const typeLabel = APPROVER_TYPE_LABELS[s.approverType]
      const names = s.approverType === 'initiator_leader' ? '' :
        '：' + s.approverIds.map(v => getApproverOptions(s.approverType).find(o => o.value === v)?.label || v).join('、')
      parts.push(`${brand.label}: ${typeLabel}${names}`)
    }
  }
  return parts.join('；') || '未配置'
}

/** 從 approverConfig 獲取規則文本 */
function approvalRuleText(cfg: ApproverConfig | undefined): string {
  if (!cfg) return ''
  if (!cfg.byBrand) return APPROVAL_RULE_LABELS[cfg.default.approvalRule]
  const parts: string[] = []
  for (const brand of BRAND_CONFIG_OPTIONS) {
    const s = cfg.brands[brand.value]
    if (s) parts.push(`${brand.label}: ${APPROVAL_RULE_LABELS[s.approvalRule]}`)
  }
  return parts.join('；') || APPROVAL_RULE_LABELS[cfg.default?.approvalRule || 'any']
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
                {node.approverConfig?.byBrand && (
                  <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>按品牌區分</Tag>
                )}
              </div>
              <div style={{
                padding: '10px 16px 12px', borderTop: '1px solid #F5F5F5',
                display: 'flex', gap: 24, fontSize: 12, color: '#595959', flexWrap: 'wrap',
                background: '#FAFAFA',
              }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#8C8C8C' }}>審批人：</span>
                  <span
                    style={{ color: '#1890FF', cursor: 'pointer', textDecoration: 'underline dotted' }}
                    onClick={() => setViewNode(node)}
                    title="點擊查看審批人明細"
                  >
                    {approverConfigText(node.approverConfig)}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#8C8C8C' }}>規則：</span>
                  {approvalRuleText(node.approverConfig)}
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

      {/* 路由規則區域 */}
      {workflow.routingRules && workflow.routingRules.length > 0 && (
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginTop: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FFF0F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NodeIndexOutlined style={{ fontSize: 14, color: '#EB2F96' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>路由規則</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workflow.routingRules.sort((a, b) => a.priority - b.priority).map((rule, idx) => {
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
                    激活 {rule.activatedNodeIds.length}/{workflow.nodes.length} 個節點
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {rule.activatedNodeIds.map(nid => {
                      const n = workflow.nodes.find(nd => nd.id === nid)
                      return n ? <Tag key={nid} style={{ fontSize: 11, margin: 0 }}>#{n.sortOrder} {n.name}</Tag> : null
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
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
              {/* 連線 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                <div style={{ width: 2, height: 28, background: '#D9D9D9' }} />
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
                      <span style={{ color: '#1890FF', cursor: 'pointer', textDecoration: 'underline dotted' }}
                        onClick={() => setViewNode(node)}>
                        {approverConfigText(node.approverConfig)}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: '#8C8C8C' }}>規則：</span>
                      {approvalRuleText(node.approverConfig)}
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
      {/* ── 頂部標題欄（全局統一規範：詳情頁紫色頂條 + 橙色返回 + 權限門控紫色編輯） ── */}
      <DetailPageHeader
        title="審批流程詳情"
        tags={workflow.enabled ? <Tag color="success" style={{ margin: 0 }}>啟用</Tag> : <Tag style={{ margin: 0 }}>停用</Tag>}
        meta={workflow.name}
        onBack={() => navigate('/workflow-config')}
        onEdit={() => navigate(`/workflow-config/${id}`)}
        menuKey="workflow-config"
      />

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
            <TeamOutlined style={{ color: '#E8720C' }} />
            <span>審批人明細：{viewNode?.name}</span>
          </div>
        }
        open={viewNode != null}
        onCancel={() => setViewNode(null)}
        footer={null}
        width={560}
      >
        {viewNode && (() => {
          const cfg = viewNode.approverConfig
          if (!cfg.byBrand) {
            const s = cfg.default
            return (
              <Descriptions column={1} size="middle" labelStyle={{ color: '#8C8C8C', width: 110 }}>
                <Descriptions.Item label="審批人類型">{APPROVER_TYPE_LABELS[s.approverType]}</Descriptions.Item>
                <Descriptions.Item label="審批人">
                  {s.approverType === 'initiator_leader' ? (
                    <span style={{ color: '#52C41A' }}>自動取發起人的直屬主管</span>
                  ) : (
                    s.approverIds.map(v => {
                      const opt = getApproverOptions(s.approverType).find(o => o.value === v)
                      return <Tag key={v} style={{ marginBottom: 4 }}>{opt?.label || v}</Tag>
                    })
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="審批規則">{APPROVAL_RULE_LABELS[s.approvalRule]}</Descriptions.Item>
                <Descriptions.Item label="抄送人員">
                  {viewNode.ccUserIds.length > 0
                    ? viewNode.ccUserIds.map(v => {
                        const opt = getApproverOptions('person').find(o => o.value === v)
                        return <Tag key={v} style={{ marginBottom: 4 }}>{opt?.label || v}</Tag>
                      })
                    : '無'}
                </Descriptions.Item>
                <Descriptions.Item label="節點超時">{viewNode.timeoutHours ? `${viewNode.timeoutHours} 小時` : '不限'}</Descriptions.Item>
              </Descriptions>
            )
          }
          // 按品牌區分展示
          return (
            <div>
              {BRAND_CONFIG_OPTIONS.map(brand => {
                const s = cfg.brands[brand.value]
                if (!s) return null
                return (
                  <div key={brand.value} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#262626' }}>
                      <Tag color="purple">{brand.label}</Tag>
                    </div>
                    <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C', width: 110 }}>
                      <Descriptions.Item label="審批人類型">{APPROVER_TYPE_LABELS[s.approverType]}</Descriptions.Item>
                      <Descriptions.Item label="審批人">
                        {s.approverType === 'initiator_leader' ? (
                          <span style={{ color: '#52C41A' }}>自動取發起人的直屬主管</span>
                        ) : (
                          s.approverIds.map(v => {
                            const opt = getApproverOptions(s.approverType).find(o => o.value === v)
                            return <Tag key={v} style={{ marginBottom: 4 }}>{opt?.label || v}</Tag>
                          })
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="審批規則">{APPROVAL_RULE_LABELS[s.approvalRule]}</Descriptions.Item>
                    </Descriptions>
                  </div>
                )
              })}
              <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C', width: 110 }}>
                <Descriptions.Item label="抄送人員">
                  {viewNode.ccUserIds.length > 0
                    ? viewNode.ccUserIds.map(v => {
                        const opt = getApproverOptions('person').find(o => o.value === v)
                        return <Tag key={v} style={{ marginBottom: 4 }}>{opt?.label || v}</Tag>
                      })
                    : '無'}
                </Descriptions.Item>
                <Descriptions.Item label="節點超時">{viewNode.timeoutHours ? `${viewNode.timeoutHours} 小時` : '不限'}</Descriptions.Item>
              </Descriptions>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
