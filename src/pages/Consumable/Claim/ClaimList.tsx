/**
 * 耗材领用列表（范围 Tab + 查询区 + 表格）
 *
 * 简化流程：提交即自动通过并出库，新单直接为已出库（无审批/出库节点）
 * Tab 只切换数据范围（全部 / 我的领用），单据状态改由查询区「狀態」下拉筛选
 * 行操作：详情；历史 pending/approved 单可撤销（本人或管理员）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Table, Tabs, Modal, message, Space, Tag, Input, Select, TreeSelect, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import {
  fetchConsumableClaims, fetchMyConsumableClaims, cancelConsumableClaim, issueConsumableClaim,
  type ConsumableClaim,
} from '../../../api/consumable'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { buildDeptTree } from '../../AssetManagement/AssetClaim/claimViewTypes'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { CLAIM_STATUS_LABEL_KEY, CLAIM_STATUS_ORDER, CLAIM_STATUS_COLOR, type ClaimStatus } from './constants'
import { exportToCSV } from '../../../utils/exportCSV'

interface Props {
  onAdd: () => void
  onDetail: (id: number) => void
}

/** Tab 仅表示数据范围，不再承载状态语义（状态由查询区筛选） */
type TabKey = 'all' | 'mine'

/** 查询区表单值与已生效查询条件共用同一结构 */
interface ClaimFilters {
  claimNo?: string
  applicantName?: string
  departmentId?: number
  status?: ClaimStatus
}

export default function ClaimList({ onAdd, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<ClaimFilters>()
  const { hasPermission } = useAuth()
  // canViewAll: 可看全量领用单（管理视图）；canManage: 可撤销历史单。admin 两者皆 true
  const canViewAll = hasPermission('consumable-claim:view')
  const canManage = hasPermission('consumable-claim:edit')
  const [tab, setTab] = useState<TabKey>(canViewAll ? 'all' : 'mine')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableClaim[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<ClaimFilters>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])

  useEffect(() => {
    // 部门仅用于查询筛选，加载失败不阻塞列表
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const query = {
        page, size,
        claimNo: filters.claimNo || undefined,
        applicantName: filters.applicantName || undefined,
        departmentId: filters.departmentId,
        status: filters.status,
      }
      const res = tab === 'mine'
        ? await fetchMyConsumableClaims(query)
        : await fetchConsumableClaims(query)
      setRows(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('consumable.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [tab, page, size, filters, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setPage(1)
    setFilters({
      claimNo: v.claimNo?.trim() || undefined,
      applicantName: v.applicantName?.trim() || undefined,
      departmentId: v.departmentId,
      status: v.status,
    })
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleExport = () => {
    if (rows.length === 0) { message.warning(t('consumable.exportEmpty')); return }
    const cols = [
      { title: t('consumable.claimNo'), dataIndex: 'claimNo' },
      { title: t('consumable.claimApplicant'), dataIndex: 'applicantName' },
      { title: t('consumable.claimDepartment'), dataIndex: 'department', render: (v: string) => v || '-' },
      { title: t('consumable.claimReason'), dataIndex: 'reason', render: (v: string) => v || '-' },
      { title: t('consumable.claimKinds'), dataIndex: 'totalKinds' },
      { title: t('consumable.totalQty'), dataIndex: 'totalQty' },
      { title: t('common.colStatus'), dataIndex: 'status', render: (v: string) => { const k = CLAIM_STATUS_LABEL_KEY[v as ClaimStatus]; return k ? t(k) : v } },
      { title: t('consumable.claimAppliedAt'), dataIndex: 'createdAt', render: (v: string) => v || '-' },
    ]
    exportToCSV(`consumable_claims_${new Date().toISOString().slice(0, 10)}`, cols, rows)
    message.success(t('consumable.exportSuccess'))
  }

  const handleIssue = (record: ConsumableClaim) => {
    Modal.confirm({
      title: t('consumable.issueTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('consumable.claimNo')}：</span><b>{record.claimNo}</b></div>
          <div className="confirm-info-row"><span>{t('consumable.claimApplicant')}：</span><b>{record.applicantName}</b></div>
          <div className="confirm-info-row"><span>{t('consumable.totalQty')}：</span><b>{record.totalQty}</b></div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>{t('consumable.issueNote')}</div>
        </div>
      ),
      okText: t('consumable.issueOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await issueConsumableClaim(record.id)
          message.success(t('consumable.issueSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('consumable.issueFailed'))
        }
      },
    })
  }

  const handleCancel = (record: ConsumableClaim) => {
    let reason = ''
    Modal.confirm({
      title: t('consumable.revokeTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('consumable.claimNo')}：</span><b>{record.claimNo}</b></div>
          <div style={{ marginTop: 8 }}>
            <Input.TextArea placeholder={t('consumable.revokeReasonPh')} rows={2} onChange={e => { reason = e.target.value }} />
          </div>
        </div>
      ),
      okText: t('consumable.revokeOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await cancelConsumableClaim(record.id, reason)
          message.success(t('consumable.revokeSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('consumable.revokeFailed'))
        }
      },
    })
  }

  /* ── 列字段配置（title 跟随当前语言；key 保持穩定以免影響已保存的列配置） ── */
  const columnMeta = useMemo(() => [
    { key: 'claimNo', title: t('consumable.claimNo') },
    { key: 'applicantName', title: t('consumable.claimApplicant') },
    { key: 'department', title: t('consumable.claimDepartment') },
    { key: 'reason', title: t('consumable.claimReason') },
    { key: 'totalKinds', title: t('consumable.claimKinds') },
    { key: 'totalQty', title: t('consumable.totalQty') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'createdAt', title: t('consumable.claimAppliedAt') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('consumable-claim', columnMeta, [
    { key: 'claimNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<ConsumableClaim> = [
    { title: t('consumable.claimNo'), dataIndex: 'claimNo', key: 'claimNo', width: 160, ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: t('consumable.claimApplicant'), dataIndex: 'applicantName', key: 'applicantName', width: 100, ellipsis: true },
    { title: t('consumable.claimDepartment'), dataIndex: 'department', key: 'department', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: t('consumable.claimReason'), dataIndex: 'reason', key: 'reason', width: 180, ellipsis: true },
    { title: t('consumable.claimKinds'), dataIndex: 'totalKinds', key: 'totalKinds', width: 80, align: 'center' },
    { title: t('consumable.totalQty'), dataIndex: 'totalQty', key: 'totalQty', width: 80, align: 'center' },
    { title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (v: ClaimStatus) => <Tag color={CLAIM_STATUS_COLOR[v]}>{t(CLAIM_STATUS_LABEL_KEY[v])}</Tag> },
    { title: t('consumable.claimAppliedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 165, ellipsis: true, render: (v: string) => v || '-' },
    { title: t('common.colAction'), key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableClaim) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>{t('common.detail')}</Button>
          {canManage && (record.status === 'pending' || record.status === 'approved') && (
            <Button type="link" size="small" onClick={() => handleIssue(record)}>{t('consumable.claimIssue')}</Button>
          )}
          {(canManage || tab === 'mine') && (record.status === 'pending' || record.status === 'approved') && (
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>{t('consumable.claimRevoke')}</Button>
          )}
        </Space>
      ) },
  ]

  return (
    <>
      {/* 查询区（4 列 Grid：單號/申請人/部門/狀態） */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('consumable.claimNo')} name="claimNo">
            <Input placeholder={t('consumable.phClaimNo')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('consumable.claimApplicant')} name="applicantName">
            <Input placeholder={t('consumable.phApplicant')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('consumable.claimDepartment')} name="departmentId">
            <TreeSelect treeData={deptTree} placeholder={t('consumable.phDepartment')} allowClear showSearch
              treeDefaultExpandAll treeNodeFilterProp="title" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear
              options={CLAIM_STATUS_ORDER.map(k => ({ label: t(CLAIM_STATUS_LABEL_KEY[k]), value: k }))} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>{t('consumable.claimBtnNew')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 范围切换：状态筛选已下沉到查询区，Tab 只区分全量与本人 */}
      <Tabs
        activeKey={tab}
        onChange={(k) => { setTab(k as TabKey); setPage(1) }}
        items={[
          ...(canViewAll ? [{ key: 'all', label: t('common.all') }] : []),
          { key: 'mine', label: t('consumable.claimTabMine') },
        ]}
      />

      <Table<ConsumableClaim>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (n) => t('common.total', { count: n }),
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />
    </>
  )
}
