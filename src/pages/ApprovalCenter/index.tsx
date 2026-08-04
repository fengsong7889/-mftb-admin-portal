import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
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
import type { FinApprovalQuery } from '../../api/finance'

const { RangePicker } = DatePicker

/** 審批類型 */
const approvalTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '充值', value: 'recharge' },
  { label: '扣款', value: 'deduct' },
  { label: '轉賬', value: 'transfer' },
  { label: '合併', value: 'merge' },
  { label: '推廣贈送', value: 'gift' },
]

/** 流程狀態 */
const flowStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '審批中', value: 'pending' },
  { label: '已通過', value: 'approved' },
  { label: '已駁回', value: 'rejected' },
  { label: '已撤銷', value: 'cancelled' },
]

/** 當前節點 */
const currentNodeOptions = [
  { label: '全部', value: 'all' },
  { label: '業務主管審批', value: 'business' },
  { label: '運營主管審批', value: 'operation' },
  { label: '財務主管審批', value: 'finance' },
]

/** 審批狀態 */
const _approvalStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '通過', value: 'approved' },
  { label: '駁回', value: 'rejected' },
  { label: '待審批', value: 'pending' },
]

const approvalTypeMap: Record<string, string> = { recharge: '充值', deduct: '扣款', transfer: '轉賬', merge: '合併', gift: '推廣贈送' }
const flowStatusMap: Record<string, string> = { pending: '審批中', approved: '已通過', rejected: '已駁回', cancelled: '已撤銷' }
const _approvalStatusMap: Record<string, string> = { approved: '通過', rejected: '駁回', pending: '待審批' }

interface ApprovalRecord {
  key: string
  groupId: string
  groupName: string
  brand: string
  flowNo: string
  approvalType: string
  applicant: string
  applyTime: string
  // 業務主管
  bizApprover: string
  bizApproveTime: string
  bizApproveStatus: string
  // 運營主管
  opsApprover: string
  opsApproveTime: string
  opsApproveStatus: string
  // 財務主管
  finApprover: string
  finApproveTime: string
  finApproveStatus: string
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

/** 定位審批中流程的當前待審節點 */
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

/** 推廣贈送（TG）審批暫為前端流程：後端查詢結果需合併本地贈送審批記錄 */
function localGiftApprovals(query: FinApprovalQuery): ApprovalRecord[] {
  return (getApprovalRecords() as ApprovalRecord[])
    .filter(r => r.approvalType === 'gift' && matchesApprovalQuery(r, query))
}

export default function ApprovalCenter() {
  const navigate = useNavigate()
  // 菜单权限：approval-center
  const { user, hasPermission } = useAuth()
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
      setData([...extraGifts, ...records])
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
      title: '確認撤銷',
      content: `確定要撤銷流程編號「${record.flowNo}」的審批嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: async () => {
        // 贈送 TG 流程為前端記錄，直接本地撤銷，不調後端
        if (record.approvalType === 'gift') {
          updateApprovalRecord(record.flowNo, { flowStatus: 'cancelled' })
        } else {
          await cancelFinApproval(record.flowNo)
        }
        message.success('撤銷成功')
        await loadApprovals()
      },
    })
  }

  const handleApproveSubmit = (action: 'approve' | 'reject') => {
    form.validateFields().then((values) => {
      if (action === 'reject' && !values.rejectReason) {
        message.error('駁回時必須填寫駁回理由')
        return
      }
      message.success(action === 'approve' ? '審批通過成功' : '審批駁回成功')
      setIsApproveModalOpen(false)
    })
  }

  const handleNotify = () => {
    message.success('已向審批人發送通知')
  }

  /** 審批狀態渲染 */
  const renderApprovalStatus = (status: string) => {
    if (status === 'approved') return <Tag color="green">通過</Tag>
    if (status === 'rejected') return <Tag color="red">駁回</Tag>
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
    return <Tag color={colorMap[status]}>{flowStatusMap[status]}</Tag>
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'flowNo', title: '流程編號' },
    { key: 'approvalType', title: '審批類型' },
    { key: 'applicant', title: '申請人' },
    { key: 'applyTime', title: '申請時間' },
    { key: 'biz', title: '業務主管審批' },
    { key: 'ops', title: '運營主管審批' },
    { key: 'fin', title: '財務主管審批' },
    { key: 'flowStatus', title: '流程狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('approval-center', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<ApprovalRecord> = [
    { title: '集團ID', dataIndex: 'groupId', key: 'groupId', width: 80, fixed: 'left' },
    { title: '集團名稱', dataIndex: 'groupName', key: 'groupName', width: 110 },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 80,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    { title: '流程編號', dataIndex: 'flowNo', key: 'flowNo', width: 180, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
    {
      title: '審批類型',
      dataIndex: 'approvalType',
      key: 'approvalType',
      width: 80,
      render: (v: string) => approvalTypeMap[v] || v,
    },
    { title: '申請人', dataIndex: 'applicant', key: 'applicant', width: 100 },
    { title: '申請時間', dataIndex: 'applyTime', key: 'applyTime', width: 160 },
    // 業務主管審批 - 藍色
    {
      title: '業務主管審批',
      key: 'biz',
      children: [
        { title: '審批人', dataIndex: 'bizApprover', key: 'bizApprover', width: 110 },
        { title: '審批時間', dataIndex: 'bizApproveTime', key: 'bizApproveTime', width: 160 },
        {
          title: '審批狀態',
          dataIndex: 'bizApproveStatus',
          key: 'bizApproveStatus',
          width: 90,
          render: renderApprovalStatus,
        },
      ],
    },
    // 運營主管審批 - 橙色
    {
      title: '運營主管審批',
      key: 'ops',
      children: [
        { title: '審批人', dataIndex: 'opsApprover', key: 'opsApprover', width: 110 },
        { title: '審批時間', dataIndex: 'opsApproveTime', key: 'opsApproveTime', width: 160 },
        {
          title: '審批狀態',
          dataIndex: 'opsApproveStatus',
          key: 'opsApproveStatus',
          width: 90,
          render: renderApprovalStatus,
        },
      ],
    },
    // 財務主管審批 - 紅色
    {
      title: '財務主管審批',
      key: 'fin',
      children: [
        { title: '審批人', dataIndex: 'finApprover', key: 'finApprover', width: 110 },
        { title: '審批時間', dataIndex: 'finApproveTime', key: 'finApproveTime', width: 160 },
        {
          title: '審批狀態',
          dataIndex: 'finApproveStatus',
          key: 'finApproveStatus',
          width: 90,
          render: renderApprovalStatus,
        },
      ],
    },
    {
      title: '流程狀態',
      dataIndex: 'flowStatus',
      key: 'flowStatus',
      width: 100,
      render: renderFlowStatus,
    },
    {
      title: '駁回理由',
      dataIndex: 'rejectReason',
      key: 'rejectReason',
      width: 180,
      ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#999' }}>--</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>詳情</Button>
          {canApprove(record) && (
            <Button type="link" size="small" onClick={() => handleApprove(record)}>審批</Button>
          )}
          {canCancel(record) && (
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>撤銷</Button>
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
          <Form.Item label="集團ID" name="groupId">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱" name="groupName">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="全部" allowClear options={brandOptions} />
          </Form.Item>
          <Form.Item label="審批類型" name="approvalType">
            <Select placeholder="全部" allowClear options={approvalTypeOptions} />
          </Form.Item>
          <Form.Item label="流程編號" name="flowNo">
            <Input placeholder="請輸入流程編號" allowClear />
          </Form.Item>
          <Form.Item label="流程狀態" name="flowStatus">
            <Select placeholder="全部" allowClear options={flowStatusOptions} />
          </Form.Item>
          <Form.Item label="當前節點" name="currentNode">
            <Select placeholder="全部" allowClear options={currentNodeOptions} />
          </Form.Item>
          <Form.Item label="申請時間" name="applyTime">
            <RangePicker placeholder={['開始時間', '結束時間']} />
          </Form.Item>
          <Form.Item label="申請人" name="applicant">
            <Input placeholder="請輸入申請人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item label="審批人" name="approver">
            <Input placeholder="請輸入審批人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />}>導出</Button>
          <Button icon={<UserOutlined />} onClick={handleNotify}>審批人通知</Button>
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
            showTotal: (t) => `共 ${t} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size: size || 10 }),
          }}
          size="middle"
          bordered
          scroll={{ x: 2000 }}
        />
      </div>

      {/* 详情弹窗 */}
      <Modal
        title="審批詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={720}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>集團ID：</span>{detailRecord.groupId}</div>
              <div><span style={{ color: '#999' }}>集團名稱：</span>{detailRecord.groupName}</div>
              <div><span style={{ color: '#999' }}>所屬品牌：</span><BrandTag value={detailRecord.brand} /></div>
              <div><span style={{ color: '#999' }}>流程編號：</span>{detailRecord.flowNo}</div>
              <div><span style={{ color: '#999' }}>審批類型：</span>{approvalTypeMap[detailRecord.approvalType]}</div>
              <div><span style={{ color: '#999' }}>申請人：</span>{detailRecord.applicant}</div>
              <div><span style={{ color: '#999' }}>申請時間：</span>{detailRecord.applyTime}</div>
              <div><span style={{ color: '#999' }}>流程狀態：</span>{renderFlowStatus(detailRecord.flowStatus)}</div>
            </div>

            <h4 style={{ marginTop: 20, marginBottom: 12, fontSize: 14, color: '#333', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>審批流程</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {/* 業務主管 */}
              <div style={{ padding: 12, background: '#E3F2FD', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#1565C0', marginBottom: 8 }}>業務主管審批</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>審批人：{detailRecord.bizApprover}</div>
                  <div>時間：{detailRecord.bizApproveTime}</div>
                  <div>狀態：{renderApprovalStatus(detailRecord.bizApproveStatus)}</div>
                </div>
              </div>
              {/* 運營主管 */}
              <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#E65100', marginBottom: 8 }}>運營主管審批</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>審批人：{detailRecord.opsApprover}</div>
                  <div>時間：{detailRecord.opsApproveTime}</div>
                  <div>狀態：{renderApprovalStatus(detailRecord.opsApproveStatus)}</div>
                </div>
              </div>
              {/* 財務主管 */}
              <div style={{ padding: 12, background: '#FFEBEE', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#C62828', marginBottom: 8 }}>財務主管審批</div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>審批人：{detailRecord.finApprover}</div>
                  <div>時間：{detailRecord.finApproveTime}</div>
                  <div>狀態：{renderApprovalStatus(detailRecord.finApproveStatus)}</div>
                </div>
              </div>
            </div>

            {detailRecord.rejectReason && (
              <>
                <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 14, color: '#E53935' }}>駁回理由</h4>
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
        title="審批操作"
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        footer={null}
        width={500}
      >
        {approveRecord && (
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16, padding: 12, background: '#F8F8F8', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 2 }}>
                <div><span style={{ color: '#999' }}>流程編號：</span>{approveRecord.flowNo}</div>
                <div><span style={{ color: '#999' }}>審批類型：</span>{approvalTypeMap[approveRecord.approvalType]}</div>
                <div><span style={{ color: '#999' }}>申請人：</span>{approveRecord.applicant}</div>
              </div>
            </div>
            <Form.Item label="審批意見" name="remark">
              <Input.TextArea rows={3} placeholder="請輸入審批意見（選填）" maxLength={200} showCount />
            </Form.Item>
            <Form.Item label="駁回理由" name="rejectReason">
              <Input.TextArea rows={3} placeholder="如選擇駁回，請輸入駁回理由" maxLength={200} showCount />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button onClick={() => setIsApproveModalOpen(false)}>取消</Button>
              <Button danger onClick={() => handleApproveSubmit('reject')}>駁回</Button>
              <Button type="primary" onClick={() => handleApproveSubmit('approve')}>通過</Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  )
}
