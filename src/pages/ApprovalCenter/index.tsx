import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { useAuth } from '../../contexts/AuthContext'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { getApprovalRecords, updateApprovalRecord } from '../../utils/approvalStore'
import { fetchFinApprovals, cancelFinApproval } from '../../api/finance'
import type { FinApprovalQuery, ApprovalNodeInstance } from '../../api/finance'

const { RangePicker } = DatePicker

/** 審批類型映射（i18n key，value 為英文枚舉碼） */
const approvalTypeMapKeys: Record<string, string> = {
  recharge: 'approvalCenter.typeRecharge',
  deduct: 'approvalCenter.typeDeduct',
  transfer: 'approvalCenter.typeTransfer',
  merge: 'approvalCenter.typeMerge',
  gift: 'approvalCenter.typeGift',
}

/** 流程狀態映射（i18n key） */
const flowStatusMapKeys: Record<string, string> = {
  pending: 'approvalCenter.flowPending',
  approved: 'approvalCenter.flowApproved',
  rejected: 'approvalCenter.flowRejected',
  cancelled: 'approvalCenter.flowCancelled',
}

interface ApprovalRecord {
  key: string
  groupId: string
  groupName: string
  brand: string
  flowNo: string
  approvalType: string
  applicant: string
  applyTime: string
  // 动态审批节点（新格式）
  approvalNodes?: ApprovalNodeInstance[]
  // 旧格式兼容字段（无 approvalNodes 时使用）
  bizApprover?: string
  bizApproveTime?: string
  bizApproveStatus?: string
  opsApprover?: string
  opsApproveTime?: string
  opsApproveStatus?: string
  finApprover?: string
  finApproveTime?: string
  finApproveStatus?: string
  // 流程
  flowStatus: string
  rejectReason: string
}

/** 搜索區篩選條件 */
interface ApprovalFilters {
  groupId?: string
  groupName?: string
  brand?: string
  approvalType?: string
  flowNo?: string
  flowStatus?: string
  currentNode?: string
  applyTime?: [Dayjs, Dayjs]
  applicant?: string
  approver?: string
}

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 定位審批中流程的當前待審節點（固定三級：業務 → 運營 → 財務） */
function resolveCurrentNode(r: ApprovalRecord): string {
  if (r.flowStatus !== 'pending') return ''
  if (r.bizApproveStatus === 'pending') return 'business'
  if (r.opsApproveStatus === 'pending') return 'operation'
  return 'finance'
}

/** 單條記錄是否命中當前篩選條件 */
function matchesApprovalQuery(r: ApprovalRecord, query: FinApprovalQuery): boolean {
  if (query.groupId && !r.groupId.includes(query.groupId)) return false
  if (query.groupName && !r.groupName.includes(query.groupName)) return false
  if (query.brand && r.brand !== query.brand) return false
  if (query.approvalType && r.approvalType !== query.approvalType) return false
  if (query.flowNo && !r.flowNo.includes(query.flowNo)) return false
  if (query.flowStatus && r.flowStatus !== query.flowStatus) return false
  if (query.currentNode && resolveCurrentNode(r) !== query.currentNode) return false
  if (query.applicant && !r.applicant.includes(query.applicant)) return false
  if (query.approver) {
    const hit = [r.bizApprover, r.opsApprover, r.finApprover].some(a => a?.includes(query.approver!))
    if (!hit) return false
  }
  if (query.applyFrom && r.applyTime.slice(0, 10) < query.applyFrom) return false
  if (query.applyTo && r.applyTime.slice(0, 10) > query.applyTo) return false
  return true
}

/** 贈送（ZS）審批暫為前端流程：後端查詢結果需合併本地贈送審批記錄 */
function localGiftApprovals(query: FinApprovalQuery): ApprovalRecord[] {
  return (getApprovalRecords() as ApprovalRecord[])
    .filter(r => r.approvalType === 'gift' && matchesApprovalQuery(r, query))
}

export default function ApprovalCenter() {
  const navigate = useNavigate()
  // 菜单权限：approval-center
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()

  /** 審批類型選項 */
  const approvalTypeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.typeRecharge'), value: 'recharge' },
    { label: t('approvalCenter.typeDeduct'), value: 'deduct' },
    { label: t('approvalCenter.typeTransfer'), value: 'transfer' },
    { label: t('approvalCenter.typeMerge'), value: 'merge' },
    { label: t('approvalCenter.typeGift'), value: 'gift' },
  ]

  /** 流程狀態選項 */
  const flowStatusOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.flowPending'), value: 'pending' },
    { label: t('approvalCenter.flowApproved'), value: 'approved' },
    { label: t('approvalCenter.flowRejected'), value: 'rejected' },
    { label: t('approvalCenter.flowCancelled'), value: 'cancelled' },
  ]

  /** 當前節點選項 */
  const currentNodeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.nodeBusiness'), value: 'business' },
    { label: t('approvalCenter.nodeOperation'), value: 'operation' },
    { label: t('approvalCenter.nodeFinance'), value: 'finance' },
  ]
  const [searchParams] = useSearchParams()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [detailRecord, _setDetailRecord] = useState<ApprovalRecord | null>(null)
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false)
  const [approveRecord, _setApproveRecord] = useState<ApprovalRecord | null>(null)
  const [form] = Form.useForm()
  const [searchForm] = Form.useForm<ApprovalFilters>()
  const [data, setData] = useState<ApprovalRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  /** 入口頁可通過 URL 帶入初始篩選（如贈送明細 → /approval-center?approvalType=gift） */
  const initialFilters = useMemo<ApprovalFilters>(() => {
    const f: ApprovalFilters = {}
    const approvalType = searchParams.get('approvalType')
    const flowStatus = searchParams.get('flowStatus')
    const flowNo = searchParams.get('flowNo')
    if (approvalType) f.approvalType = approvalType
    if (flowStatus) f.flowStatus = flowStatus
    if (flowNo) f.flowNo = flowNo
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [filters, setFilters] = useState<ApprovalFilters>(initialFilters)
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** URL 初始篩選同步回搜索表單 */
  useEffect(() => {
    searchForm.setFieldsValue(initialFilters)
  }, [initialFilters, searchForm])

  /** 組裝查詢參數 */
  const buildQuery = useCallback((): FinApprovalQuery => ({
    page: pagination.page,
    size: pagination.size,
    groupId: filters.groupId?.trim() || undefined,
    groupName: filters.groupName?.trim() || undefined,
    brand: pickValue(filters.brand),
    approvalType: pickValue(filters.approvalType),
    flowNo: filters.flowNo?.trim() || undefined,
    flowStatus: pickValue(filters.flowStatus),
    currentNode: pickValue(filters.currentNode),
    applicant: filters.applicant?.trim() || undefined,
    approver: filters.approver?.trim() || undefined,
    applyFrom: filters.applyTime?.[0]?.format('YYYY-MM-DD'),
    applyTo: filters.applyTime?.[1]?.format('YYYY-MM-DD'),
  }), [filters, pagination])

  /** 加載審批列表（贈送 TG 流程為前端記錄，按流程編號去重後合併展示） */
  const loadApprovals = useCallback(async () => {
    const query = buildQuery()
    setLoading(true)
    try {
      const res = await fetchFinApprovals(query)
      const records = (res.records ?? []) as ApprovalRecord[]
      const extraGifts = localGiftApprovals(query)
        .filter(g => !records.some(r => r.flowNo === g.flowNo))
      const merged = [...extraGifts, ...records]
      // 合并后按申请时间倒序排列
      merged.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setData(merged)
      setTotal((res.total ?? 0) + extraGifts.length)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void loadApprovals()
  }, [loadApprovals])

  const handleSearch = () => {
    setFilters(searchForm.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
  }

  const handleReset = () => {
    searchForm.resetFields()
    setFilters({})
    setPagination({ page: 1, size: 10 })
  }

  const handleDetail = (record: ApprovalRecord) => {
    navigate(`/approval-detail?type=${record.approvalType}&flowNo=${record.flowNo}`)
  }

  /** 判斷人員字段（如 朱棣(002)）是否為當前登錄人（按姓名/工號匹配） */
  const isCurrentUser = useCallback((person?: string) => {
    if (!user || !person || person === '--') return false
    return (
      (!!user.name && person.includes(user.name)) ||
      (!!user.empId && person.includes(user.empId)) ||
      (!!user.username && person.includes(user.username))
    )
  }, [user])

  /** 審批按鈕：需持有編輯功能權限，且僅當前待審節點的審批人可見 */
  const canApprove = useCallback((record: ApprovalRecord) => {
    if (!hasPermission('approval-center:edit')) return false
    if (record.flowStatus !== 'pending') return false
    const node = resolveCurrentNode(record)
    const approver = node === 'business' ? record.bizApprover : node === 'operation' ? record.opsApprover : record.finApprover
    return isCurrentUser(approver)
  }, [isCurrentUser, hasPermission])

  /** 撤銷按鈕：需持有編輯功能權限，僅申請人可見，且流程仍在審批中（已通過/駁回/撤銷不顯示） */
  const canCancel = useCallback((record: ApprovalRecord) => {
    if (!hasPermission('approval-center:edit')) return false
    return record.flowStatus === 'pending' && isCurrentUser(record.applicant)
  }, [isCurrentUser, hasPermission])

  const handleApprove = (record: ApprovalRecord) => {
    navigate(`/approval-detail?type=${record.approvalType}&flowNo=${record.flowNo}`)
  }

  const handleCancel = (record: ApprovalRecord) => {
    Modal.confirm({
      title: t('approvalCenter.cancelTitle'),
      content: t('approvalCenter.cancelContent', { flowNo: record.flowNo }),
      okText: t('approvalCenter.cancelOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        // 贈送 TG 流程為前端記錄，直接本地撤銷，不調後端
        if (record.approvalType === 'gift') {
          updateApprovalRecord(record.flowNo, { flowStatus: 'cancelled' })
        } else {
          await cancelFinApproval(record.flowNo)
        }
        message.success(t('approvalCenter.cancelSuccess'))
        await loadApprovals()
      },
    })
  }

  const handleApproveSubmit = (action: 'approve' | 'reject') => {
    form.validateFields().then((values) => {
      if (action === 'reject' && !values.rejectReason) {
        message.error(t('approvalCenter.rejectReasonRequired'))
        return
      }
      message.success(action === 'approve' ? t('approvalCenter.approveSuccess') : t('approvalCenter.rejectSuccess'))
      setIsApproveModalOpen(false)
    })
  }

  const handleNotify = () => {
    message.success(t('approvalCenter.notifySuccess'))
  }

  /** 審批狀態渲染 */
  const renderApprovalStatus = (status?: string) => {
    if (status === 'approved') return <Tag color="green">{t('approvalCenter.statusApproved')}</Tag>
    if (status === 'rejected') return <Tag color="red">{t('approvalCenter.statusRejected')}</Tag>
    if (status === 'pending') return <span style={{ color: '#999' }}>--</span>
    return '--'
  }

  /** 流程狀態渲染 */
  const renderFlowStatus = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'processing',
      approved: 'success',
      rejected: 'error',
      cancelled: 'default',
    }
    return <Tag color={colorMap[status]}>{flowStatusMapKeys[status] ? t(flowStatusMapKeys[status]) : status}</Tag>
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'groupId', title: t('common.colGroupId') },
    { key: 'groupName', title: t('common.colGroupName') },
    { key: 'brand', title: t('common.colBrand') },
    { key: 'flowNo', title: t('common.colFlowNo') },
    { key: 'approvalType', title: t('approvalCenter.colApprovalType') },
    { key: 'applicant', title: t('approvalCenter.colApplicant') },
    { key: 'applyTime', title: t('approvalCenter.colApplyTime') },
    { key: 'biz', title: t('approvalCenter.colBiz') },
    { key: 'ops', title: t('approvalCenter.colOps') },
    { key: 'fin', title: t('approvalCenter.colFin') },
    { key: 'flowStatus', title: t('approvalCenter.colFlowStatus') },
    { key: 'rejectReason', title: t('approvalCenter.colRejectReason') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('approval-center', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<ApprovalRecord> = [
    { title: t('common.colGroupId'), dataIndex: 'groupId', key: 'groupId', width: 100, fixed: 'left' },
    { title: t('common.colGroupName'), dataIndex: 'groupName', key: 'groupName', width: 150 },
    {
      title: t('common.colBrand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 80,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    { title: t('common.colFlowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 180, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
    {
      title: t('approvalCenter.colApprovalType'),
      dataIndex: 'approvalType',
      key: 'approvalType',
      width: 90,
      render: (v: string) => (approvalTypeMapKeys[v] ? t(approvalTypeMapKeys[v]) : v),
    },
    { title: t('approvalCenter.colApplicant'), dataIndex: 'applicant', key: 'applicant', width: 130 },
    { title: t('approvalCenter.colApplyTime'), dataIndex: 'applyTime', key: 'applyTime', width: 180, render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-' },
    // 固定三級審批列（業務主管 → 運營主管 → 財務主管），無論流程配置如何調整均按位置映射
    {
      title: t('approvalCenter.colBiz'),
      key: 'biz',
      children: [
        {
          title: t('approvalCenter.colApprover'),
          key: 'biz_approver',
          width: 130,
          render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.bizApprover || '--'}</span>,
        },
        {
          title: t('approvalCenter.colApproveTime'),
          key: 'biz_time',
          width: 180,
          render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.bizApproveTime || '--'}</span>,
        },
        {
          title: t('approvalCenter.colApproveStatus'),
          key: 'biz_status',
          width: 90,
          render: (_: unknown, r: ApprovalRecord) => renderApprovalStatus(r.bizApproveStatus),
        },
      ],
    },
    {
      title: t('approvalCenter.colOps'),
      key: 'ops',
      children: [
        {
          title: t('approvalCenter.colApprover'),
          key: 'ops_approver',
          width: 130,
          render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.opsApprover || '--'}</span>,
        },
        {
          title: t('approvalCenter.colApproveTime'),
          key: 'ops_time',
          width: 180,
          render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.opsApproveTime || '--'}</span>,
        },
        {
          title: t('approvalCenter.colApproveStatus'),
          key: 'ops_status',
          width: 90,
          render: (_: unknown, r: ApprovalRecord) => renderApprovalStatus(r.opsApproveStatus),
        },
      ],
    },
    {
      title: t('approvalCenter.colFin'),
      key: 'fin',
      children: [
        {
          title: t('approvalCenter.colApprover'),
          key: 'fin_approver',
          width: 130,
          render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.finApprover || '--'}</span>,
        },
        {
          title: t('approvalCenter.colApproveTime'),
          key: 'fin_time',
          width: 180,
          render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.finApproveTime || '--'}</span>,
        },
        {
          title: t('approvalCenter.colApproveStatus'),
          key: 'fin_status',
          width: 90,
          render: (_: unknown, r: ApprovalRecord) => renderApprovalStatus(r.finApproveStatus),
        },
      ],
    },
    {
      title: t('approvalCenter.colFlowStatus'),
      dataIndex: 'flowStatus',
      key: 'flowStatus',
      width: 100,
      render: renderFlowStatus,
    },
    {
      title: t('approvalCenter.colRejectReason'),
      dataIndex: 'rejectReason',
      key: 'rejectReason',
      width: 180,
      ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#999' }}>--</span>,
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>{t('common.detail')}</Button>
          {canApprove(record) && (
            <Button type="link" size="small" onClick={() => handleApprove(record)}>{t('approvalCenter.approve')}</Button>
          )}
          {canCancel(record) && (
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>{t('approvalCenter.cancel')}</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('common.colGroupId')} name="groupId">
            <Input placeholder={t('common.groupIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colGroupName')} name="groupName">
            <Input placeholder={t('common.groupNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="brand">
            <Select placeholder={t('common.all')} allowClear options={brandOptions} />
          </Form.Item>
          <Form.Item label={t('approvalCenter.colApprovalType')} name="approvalType">
            <Select placeholder={t('common.all')} allowClear options={approvalTypeOptions} />
          </Form.Item>
          <Form.Item label={t('common.colFlowNo')} name="flowNo">
            <Input placeholder={t('common.flowNoPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('approvalCenter.colFlowStatus')} name="flowStatus">
            <Select placeholder={t('common.all')} allowClear options={flowStatusOptions} />
          </Form.Item>
          <Form.Item label={t('approvalCenter.currentNode')} name="currentNode">
            <Select placeholder={t('common.all')} allowClear options={currentNodeOptions} />
          </Form.Item>
          <Form.Item label={t('approvalCenter.applyTime')} name="applyTime">
            <RangePicker placeholder={[t('common.startTime'), t('common.endTime')]} />
          </Form.Item>
          <Form.Item label={t('approvalCenter.colApplicant')} name="applicant">
            <Input placeholder={t('approvalCenter.applicantPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('approvalCenter.colApprover')} name="approver">
            <Input placeholder={t('approvalCenter.approverPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
          <Button icon={<UserOutlined />} onClick={handleNotify}>{t('approvalCenter.notifyApprover')}</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section approval-table">
        <Table<ApprovalRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          rowKey="flowNo"
          loading={loading}
          rowSelection={{}}
          pagination={{
            current: pagination.page,
            pageSize: pagination.size,
            total,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size: size || 10 }),
          }}
          size="middle"
          bordered
          scroll={{ x: 2340 }}
        />
      </div>

      {/* 详情弹窗 */}
      <Modal
        title={t('approvalCenter.detailTitle')}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={720}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>{t('common.colGroupId')}：</span>{detailRecord.groupId}</div>
              <div><span style={{ color: '#999' }}>{t('common.colGroupName')}：</span>{detailRecord.groupName}</div>
              <div><span style={{ color: '#999' }}>{t('common.colBrand')}：</span><BrandTag value={detailRecord.brand} /></div>
              <div><span style={{ color: '#999' }}>{t('common.colFlowNo')}：</span>{detailRecord.flowNo}</div>
              <div><span style={{ color: '#999' }}>{t('approvalCenter.colApprovalType')}：</span>{approvalTypeMapKeys[detailRecord.approvalType] ? t(approvalTypeMapKeys[detailRecord.approvalType]) : detailRecord.approvalType}</div>
              <div><span style={{ color: '#999' }}>{t('approvalCenter.colApplicant')}：</span>{detailRecord.applicant}</div>
              <div><span style={{ color: '#999' }}>{t('approvalCenter.colApplyTime')}：</span>{detailRecord.applyTime}</div>
              <div><span style={{ color: '#999' }}>{t('approvalCenter.colFlowStatus')}：</span>{renderFlowStatus(detailRecord.flowStatus)}</div>
            </div>

            <h4 style={{ marginTop: 20, marginBottom: 12, fontSize: 14, color: '#333', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>{t('approvalCenter.flowSection')}</h4>
            {detailRecord.approvalNodes?.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${detailRecord.approvalNodes.length}, 1fr)`, gap: '16px' }}>
                {detailRecord.approvalNodes.map((node, idx) => (
                  <div key={node.nodeId || idx} style={{ padding: 12, background: '#f6f6f6', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, color: '#333', marginBottom: 8 }}>
                      {node.nodeName}
                      {node.approvalRule === 'all' && <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>{t('approvalCenter.countersign')}</Tag>}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                      {node.approvers?.map((a, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{a.status === 'skipped' ? <s style={{ color: '#bbb' }}>{a.name}</s> : a.name}</span>
                          {renderApprovalStatus(a.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {/* 業務主管 */}
              <div style={{ padding: 12, background: '#E3F2FD', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#1565C0', marginBottom: 8 }}>{t('approvalCenter.colBiz')}</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>{t('approvalCenter.approverColon')}{detailRecord.bizApprover}</div>
                  <div>{t('approvalCenter.timeColon')}{detailRecord.bizApproveTime}</div>
                  <div>{t('approvalCenter.statusColon')}{renderApprovalStatus(detailRecord.bizApproveStatus)}</div>
                </div>
              </div>
              {/* 運營主管 */}
              <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#E65100', marginBottom: 8 }}>{t('approvalCenter.colOps')}</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>{t('approvalCenter.approverColon')}{detailRecord.opsApprover}</div>
                  <div>{t('approvalCenter.timeColon')}{detailRecord.opsApproveTime}</div>
                  <div>{t('approvalCenter.statusColon')}{renderApprovalStatus(detailRecord.opsApproveStatus)}</div>
                </div>
              </div>
              {/* 財務主管 */}
              <div style={{ padding: 12, background: '#FFEBEE', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#C62828', marginBottom: 8 }}>{t('approvalCenter.colFin')}</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>{t('approvalCenter.approverColon')}{detailRecord.finApprover}</div>
                  <div>{t('approvalCenter.timeColon')}{detailRecord.finApproveTime}</div>
                  <div>{t('approvalCenter.statusColon')}{renderApprovalStatus(detailRecord.finApproveStatus)}</div>
                </div>
              </div>
            </div>
            )}

            {detailRecord.rejectReason && (
              <>
                <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 14, color: '#E53935' }}>{t('approvalCenter.rejectReasonTitle')}</h4>
                <div style={{ padding: 12, background: '#FFF8F8', borderRadius: 8, color: '#666', fontSize: 13 }}>
                  {detailRecord.rejectReason}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title={t('approvalCenter.operateTitle')}
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        footer={null}
        width={500}
      >
        {approveRecord && (
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16, padding: 12, background: '#F8F8F8', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 2 }}>
                <div><span style={{ color: '#999' }}>{t('common.colFlowNo')}：</span>{approveRecord.flowNo}</div>
                <div><span style={{ color: '#999' }}>{t('approvalCenter.colApprovalType')}：</span>{approvalTypeMapKeys[approveRecord.approvalType] ? t(approvalTypeMapKeys[approveRecord.approvalType]) : approveRecord.approvalType}</div>
                <div><span style={{ color: '#999' }}>{t('approvalCenter.colApplicant')}：</span>{approveRecord.applicant}</div>
              </div>
            </div>
            <Form.Item label={t('approvalCenter.opinionLabel')} name="remark">
              <Input.TextArea rows={3} placeholder={t('approvalCenter.opinionPlaceholder')} maxLength={200} showCount />
            </Form.Item>
            <Form.Item label={t('approvalCenter.rejectReasonLabel')} name="rejectReason">
              <Input.TextArea rows={3} placeholder={t('approvalCenter.rejectPlaceholder')} maxLength={200} showCount />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button onClick={() => setIsApproveModalOpen(false)}>{t('common.cancel')}</Button>
              <Button danger onClick={() => handleApproveSubmit('reject')}>{t('approvalCenter.statusRejected')}</Button>
              <Button type="primary" onClick={() => handleApproveSubmit('approve')}>{t('approvalCenter.statusApproved')}</Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  )
}
