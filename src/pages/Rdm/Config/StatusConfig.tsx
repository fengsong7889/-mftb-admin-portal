/**
 * 状态机配置 —— 生命周期状态定义与流转规则
 *
 * 配置即事实来源（对应 rdm_status_def / rdm_transition）：
 * 新增业务环节不改代码，只在此维护状态与「谁能推进、必填什么」。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { BranchesOutlined, UnorderedListOutlined } from '@ant-design/icons'
import StatusSwitch from '../components/StatusSwitch'
import { fetchStatusDefs, fetchTransitions, setTransitionEnabled, setStatusEnabled, type RdmStatusDefRow, type RdmTransitionRow } from '../../../api/rdm'
import {
  RDM_ACTION_LABEL,
  RDM_ROLE_LABEL,
  RDM_STAGE_LABEL,
  RDM_STATUS_LABEL,
  type RdmAction,
  type RdmRoleCode,
  type RdmStage,
  type RdmStatus,
} from '../../../constants/rdm'
import '../index.css'

export default function StatusConfig() {
  const [statusDefs, setStatusDefs] = useState<RdmStatusDefRow[]>([])
  const [transitions, setTransitions] = useState<RdmTransitionRow[]>([])
  const [enabledMap, setEnabledMap] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchStatusDefs(), fetchTransitions()])
      .then(([sd, tr]) => {
        setStatusDefs(sd)
        setTransitions(tr)
        setEnabledMap(Object.fromEntries(tr.map(t => [t.id, t.enabled])))
      })
      .catch(() => message.error('配置載入失敗'))
      .finally(() => setLoading(false))
  }, [])

  const statusLabel = (code: string) => RDM_STATUS_LABEL[code as RdmStatus] ?? code

  /**
   * 启停流转规则：失败时回滚开关并抛出。
   * <p>提示由 StatusSwitch 统一发，这里不再自己 message，避免同一动作双弹；
   * 且失败必须抛出，否则开关会停在已翻转但服务端未改的假成功状态。
   */
  const handleToggleTransition = async (id: number, checked: boolean) => {
    setEnabledMap(prev => ({ ...prev, [id]: checked }))
    try {
      const next = await setTransitionEnabled(id, checked)
      setTransitions(next)
    } catch (err) {
      setEnabledMap(prev => ({ ...prev, [id]: !checked }))
      throw err
    }
  }

  /** 启停状态定义（服务端会拒停仍有需求的状态，拒因原文回显） */
  const handleToggleStatus = async (code: string, checked: boolean) => {
    const next = await setStatusEnabled(code, checked)
    setStatusDefs(next)
  }

  const statusColumns: TableColumnsType<RdmStatusDefRow> = useMemo(() => [
    { title: '排序', dataIndex: 'sortNo', key: 'sortNo', width: 70, align: 'center' },
    { title: '狀態編碼', dataIndex: 'code', key: 'code', width: 160, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: '狀態名稱', dataIndex: 'label', key: 'label', width: 140 },
    {
      title: '所屬階段', dataIndex: 'stage', key: 'stage', width: 120,
      render: (v: string) => <Tag color="orange" style={{ margin: 0 }}>{RDM_STAGE_LABEL[v as RdmStage] ?? v}</Tag>,
    },
    {
      title: '終態', dataIndex: 'finalFlag', key: 'finalFlag', width: 90,
      render: (v: boolean) => (v ? <Tag color="red">是</Tag> : <span style={{ color: '#8C8C8C' }}>否</span>),
    },
    {
      title: '啟用', key: 'enabled', width: 90,
      render: (_, r) => (
        <StatusSwitch
          checked={r.enabled}
          target={`狀態「${statusLabel(r.code)}」`}
          onConfirm={(next: boolean) => handleToggleStatus(r.code, next)}
        />
      ),
    },
  ], [])

  const transitionColumns: TableColumnsType<RdmTransitionRow> = useMemo(() => [
    {
      title: '流轉', key: 'flow', width: 300,
      render: (_, r) => (
        <Space size={6}>
          <Tag style={{ margin: 0 }}>{statusLabel(r.fromStatus)}</Tag>
          <BranchesOutlined style={{ color: '#8C8C8C' }} />
          <Tag color="blue" style={{ margin: 0 }}>{statusLabel(r.toStatus)}</Tag>
        </Space>
      ),
    },
    {
      title: '動作', dataIndex: 'actionCode', key: 'actionCode', width: 140,
      render: (v: string) => RDM_ACTION_LABEL[v as RdmAction] ?? v,
    },
    {
      title: '允許角色', key: 'roles', width: 240,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.allowedRoles.map(role => (
            <Tag key={role} color="purple" style={{ margin: 0 }}>{RDM_ROLE_LABEL[role as RdmRoleCode] ?? role}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '必填字段', key: 'required', width: 200,
      render: (_, r) => (r.requiredFields.length
        ? <Space size={4} wrap>{r.requiredFields.map(f => <Tag key={f} color="gold" style={{ margin: 0 }}>{f}</Tag>)}</Space>
        : <span style={{ color: '#8C8C8C' }}>無</span>),
    },
    {
      title: '啟用', key: 'enabled', width: 90,
      render: (_, r) => (
        <StatusSwitch
          checked={enabledMap[r.id] ?? r.enabled}
          target={`流轉動作「${r.actionName}」（${r.fromStatus} → ${r.toStatus}）`}
          onConfirm={(next: boolean) => handleToggleTransition(r.id, next)}
        />
      ),
    },
  ], [enabledMap])

  return (
    <div className="content-area">
      <Tabs
        defaultActiveKey="status"
        items={[
          {
            key: 'status',
            label: <span><UnorderedListOutlined /> 狀態定義（{statusDefs.length}）</span>,
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="狀態即生命週期的節點；業務方看到的是 6 個摺疊階段，研發看到的是細分狀態，兩套語義在同一份配置裡維護。"
                />
                <Table<RdmStatusDefRow>
                  className="nowrap-table"
                  rowKey="code"
                  size="small"
                  loading={loading}
                  columns={statusColumns}
                  dataSource={statusDefs}
                  pagination={false}
                  scroll={{ x: 720 }}
                />
              </>
            ),
          },
          {
            key: 'transition',
            label: <span><BranchesOutlined /> 流轉規則（{transitions.length}）</span>,
            children: (
              <>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="流轉規則決定「誰能把需求推進到哪一步、必須先填什麼」。關閉後對應按鈕在詳情頁立即消失，無需發版。"
                />
                <Table<RdmTransitionRow>
                  className="nowrap-table"
                  rowKey="id"
                  size="small"
                  loading={loading}
                  columns={transitionColumns}
                  dataSource={transitions}
                  pagination={false}
                  scroll={{ x: 1000 }}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  )
}
