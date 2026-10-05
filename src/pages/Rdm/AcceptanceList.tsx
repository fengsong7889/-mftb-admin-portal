/**
 * 需求验收 —— 业务验收人视角（待验收 + 历史验收记录）
 *
 * 验收是需求闭环的最后一道闸：未提交验收结论的需求不能进入「已上线」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import { fetchRequirementPage, type RdmRequirementRow } from '../../api/rdm'
import { exportRequirementRows } from './requirementExport'
import { RDM_ACCEPT_RESULT, RDM_STATUS, type RdmStatus } from '../../constants/rdm'
import './index.css'

/** 已完成验收环节的状态 */
const HISTORY_STATUSES: RdmStatus[] = [RDM_STATUS.RELEASED, RDM_STATUS.VERIFIED, RDM_STATUS.UAT_REJECTED]

/** 验收结论展示映射 */
const RESULT_TAG: Record<string, { text: string; color: string }> = {
  [RDM_ACCEPT_RESULT.PASS]: { text: '驗收通過', color: 'success' },
  [RDM_ACCEPT_RESULT.CONDITIONAL]: { text: '有條件通過', color: 'warning' },
  [RDM_ACCEPT_RESULT.FAIL]: { text: '驗收不通過', color: 'error' },
}

export default function AcceptanceList() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState<RdmRequirementRow[]>([])
  const [history, setHistory] = useState<RdmRequirementRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [todo, done] = await Promise.all([
        fetchRequirementPage({ scope: 'acceptance', size: 100, page: 1 }),
        fetchRequirementPage({ scope: 'all', size: 100, page: 1 }),
      ])
      setPending(todo.records ?? [])
      setHistory((done.records ?? []).filter(r => HISTORY_STATUSES.some(s => s === r.status)))
    } catch {
      message.error('驗收列表載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const baseColumns: TableColumnsType<RdmRequirementRow> = [
    {
      title: '需求標題', dataIndex: 'title', key: 'title', width: 260,
      render: (v: string, r) => <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.id}`)}>{v}</a>,
    },
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 148 },
    { title: '需求類型', dataIndex: 'reqType', key: 'reqType', width: 100, render: (v: string) => <TypeTag reqType={v} /> },
    { title: '優先級', dataIndex: 'priority', key: 'priority', width: 110, render: (v: string) => <PriorityTag priority={v} /> },
    { title: '提出人/部門', key: 'submitter', width: 150, render: (_, r) => `${r.submitterName}${r.submitDeptName ? ` · ${r.submitDeptName}` : ''}` },
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 100, render: (v?: string | null) => v ?? '-' },
    {
      title: '提交時間', dataIndex: 'submitTime', key: 'submitTime', width: 150,
      render: (v?: string | null) => <span style={{ whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'}</span>,
    },
  ]

  const pendingColumns: TableColumnsType<RdmRequirementRow> = [
    ...baseColumns,
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string, r) => <StatusTag status={v} overdue={r.overdueFlag ?? false} />,
    },
    {
      title: '等待天數', key: 'stay', width: 100,
      render: (_, r) => {
        const days = Math.round((r.stayHours ?? 0) / 24)
        return <span style={{ color: days > 3 ? '#CF1322' : '#595959' }}>{days || '-'} 天</span>
      },
    },
    {
      title: '操作', key: 'action', width: 150, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-acceptance-form?id=${r.id}`)}>去驗收</Button>
          <span className="action-split">|</span>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.id}`)}>詳情</Button>
        </Space>
      ),
    },
  ]

  const historyColumns: TableColumnsType<RdmRequirementRow> = [
    ...baseColumns,
    { title: '狀態', dataIndex: 'status', key: 'status', width: 130, render: (v: string) => <StatusTag status={v} /> },
    {
      title: '驗收結論', dataIndex: 'acceptanceResult', key: 'acceptanceResult', width: 120,
      render: (v?: string | null) => {
        const meta = v ? RESULT_TAG[v] : undefined
        return meta ? <Tag color={meta.color} style={{ margin: 0 }}>{meta.text}</Tag> : <span style={{ color: '#8C8C8C' }}>待驗收</span>
      },
    },
    {
      title: '滿意度', dataIndex: 'acceptanceScore', key: 'acceptanceScore', width: 110,
      render: (v?: number | null) => (v ? <span style={{ color: '#52C41A', fontWeight: 600 }}>{v} / 5</span> : '-'),
    },
    { title: '上線版本', dataIndex: 'versionNo', key: 'versionNo', width: 100, render: (v?: string | null) => v ?? '-' },
    {
      title: '上線時間', dataIndex: 'actualReleaseDate', key: 'actualReleaseDate', width: 120,
      render: (v?: string | null) => v ?? '-',
    },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right',
      render: (_, r) => <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.id}`)}>詳情</Button>,
    },
  ]

  const rowsForTab = tab === 'pending' ? pending : history

  /**
   * 列配置：两个 Tab 的列集不同，必须各自一个 pageKey，
   * 否则在历史 Tab 隐掉的列会回到待验收集里。
   */
  const pendingMeta = useMemo(() => [
    { key: 'title', title: '需求標題' },
    { key: 'reqNo', title: '需求編號' },
    { key: 'reqType', title: '需求類型' },
    { key: 'priority', title: '優先級' },
    { key: 'submitter', title: '提出人/部門' },
    { key: 'pmName', title: '產品經理' },
    { key: 'submitTime', title: '提交時間' },
    { key: 'status', title: '當前狀態' },
    { key: 'stay', title: '等待天數' },
    { key: 'action', title: '操作' },
  ], [])
  const historyMeta = useMemo(() => [
    { key: 'title', title: '需求標題' },
    { key: 'reqNo', title: '需求編號' },
    { key: 'status', title: '狀態' },
    { key: 'acceptanceResult', title: '驗收結論' },
    { key: 'acceptanceScore', title: '滿意度' },
    { key: 'versionNo', title: '上線版本' },
    { key: 'actualReleaseDate', title: '上線時間' },
    { key: 'action', title: '操作' },
  ], [])
  // locked 只能放在第三个参数（defaultConfig）：hook 从 allColumns 不读该字段
  const pendingCfg = useColumnConfig('rdm-acceptance-pending', pendingMeta, [
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const historyCfg = useColumnConfig('rdm-acceptance-history', historyMeta, [
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const activeCfg = tab === 'pending' ? pendingCfg : historyCfg

  /** 导出当前 Tab 的验收记录（与页面同一份数据） */
  const handleExport = async () => {
    if (rowsForTab.length === 0) {
      message.warning('當前列表沒有數據可導出')
      return
    }
    try {
      await exportRequirementRows(rowsForTab, tab === 'pending' ? '待我驗收' : '歷史驗收')
      message.success(`已導出 ${rowsForTab.length} 條`)
    } catch {
      message.error('導出失敗，請重試')
    }
  }

  return (
    <div className="content-area">
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'pending', label: `待我驗收 (${pending.length})` },
          { key: 'history', label: `歷史驗收 (${history.length})` },
        ]}
      />

      <div className="action-section">
        <div className="action-section-left">
          {tab === 'pending' ? (
            <Tag icon={<ClockCircleOutlined />} color="orange" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 6 }}>
              驗收通過後產研才能確認上線，請及時處理避免逾期預警
            </Tag>
          ) : (
            <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出驗收記錄</Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        </div>
        <div className="action-section-right">{activeCfg.configComponent}</div>
      </div>

      <Table<RdmRequirementRow>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={(tab === 'pending'
          ? activeCfg.applyConfig(pendingColumns)
          : activeCfg.applyConfig(historyColumns)) as TableColumnsType<RdmRequirementRow>}
        dataSource={rowsForTab}
        scroll={{ x: 1500 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
        }}
      />

      {tab === 'pending' && pending.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: '#8C8C8C', padding: 24 }}>
          <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 6 }} />當前沒有待驗收的需求
        </div>
      )}
    </div>
  )
}
