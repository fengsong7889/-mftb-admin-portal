import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Empty, Tooltip, Button, Space, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  StarFilled,
  StarOutlined,
  AccountBookOutlined,
  SwapOutlined,
  ScissorOutlined,
  GiftOutlined,
  MergeCellsOutlined,
  RobotOutlined,
  DollarOutlined,
  BankOutlined,
  TeamOutlined,
  ScheduleOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  ExportOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import BrandTag from '../../../components/BrandTag'
import { useAuth } from '../../../contexts/AuthContext'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../../constants/brand'
import { getApprovalRecords, updateApprovalRecord } from '../../../utils/approvalStore'
import { fetchFinApprovals, cancelFinApproval } from '../../../api/finance'
import type { FinApprovalQuery, ApprovalNodeInstance } from '../../../api/finance'
import './index.css'

const { RangePicker } = DatePicker

const FAVORITES_STORAGE_KEY = 'process_center_favorites'

/** 单个流程定义 */
interface ProcessItem {
  key: string
  name: string
  description: string
  icon: React.ReactNode
  route: string
  enabled: boolean
  categoryColor: string
}

/** 流程分类 */
interface ProcessCategory {
  key: string
  name: string
  icon: React.ReactNode
  color: string
  processes: Omit<ProcessItem, 'categoryColor'>[]
}

/** 全部流程目录（Phase 1 前端硬编码） */
const PROCESS_CATALOG: ProcessCategory[] = [
  {
    key: 'finance',
    name: 'processCenter.catFinance',
    icon: <DollarOutlined />,
    color: '#E8720C',
    processes: [
      {
        key: 'recharge',
        name: 'processCenter.procRecharge',
        description: 'processCenter.procRechargeDesc',
        icon: <AccountBookOutlined />,
        route: '/recharge-add?from=process-center',
        enabled: true,
      },
      {
        key: 'transfer',
        name: 'processCenter.procTransfer',
        description: 'processCenter.procTransferDesc',
        icon: <SwapOutlined />,
        route: '/transfer-add?from=process-center',
        enabled: true,
      },
      {
        key: 'deduct',
        name: 'processCenter.procDeduct',
        description: 'processCenter.procDeductDesc',
        icon: <ScissorOutlined />,
        route: '/deduct-add?from=process-center',
        enabled: true,
      },
      {
        key: 'gift',
        name: 'processCenter.procGift',
        description: 'processCenter.procGiftDesc',
        icon: <GiftOutlined />,
        route: '/gift-add?from=process-center',
        enabled: true,
      },
      {
        key: 'merge',
        name: 'processCenter.procMerge',
        description: 'processCenter.procMergeDesc',
        icon: <MergeCellsOutlined />,
        route: '/merge-add?from=process-center',
        enabled: true,
      },
    ],
  },
  {
    key: 'ai',
    name: 'processCenter.catAI',
    icon: <RobotOutlined />,
    color: '#1890FF',
    processes: [
      {
        key: 'ai_access',
        name: 'processCenter.procAiAccess',
        description: 'processCenter.procAiAccessDesc',
        icon: <RobotOutlined />,
        route: '/ai-access-apply',
        enabled: true,
      },
    ],
  },
  {
    key: 'hr',
    name: 'processCenter.catHR',
    icon: <TeamOutlined />,
    color: '#52C41A',
    processes: [
      {
        key: 'leave',
        name: 'processCenter.procLeave',
        description: 'processCenter.procLeaveDesc',
        icon: <ScheduleOutlined />,
        route: '',
        enabled: false,
      },
      {
        key: 'overtime',
        name: 'processCenter.procOvertime',
        description: 'processCenter.procOvertimeDesc',
        icon: <ScheduleOutlined />,
        route: '',
        enabled: false,
      },
    ],
  },
  {
    key: 'admin',
    name: 'processCenter.catAdmin',
    icon: <BankOutlined />,
    color: '#722ED1',
    processes: [
      {
        key: 'procurement',
        name: 'processCenter.procProcurement',
        description: 'processCenter.procProcurementDesc',
        icon: <BankOutlined />,
        route: '',
        enabled: false,
      },
    ],
  },
]

/** 将目录展平为带 categoryColor 的流程列表 */
function flattenProcesses(): ProcessItem[] {
  return PROCESS_CATALOG.flatMap((cat) =>
    cat.processes.map((p) => ({ ...p, categoryColor: cat.color })),
  )
}

/** 读取 localStorage 中的常用流程 key 列表 */
function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 写入常用流程 key 列表 */
function saveFavorites(keys: string[]) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(keys))
}

/** 審批類型映射（i18n key） */
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
  approvalNodes?: ApprovalNodeInstance[]
  bizApprover?: string
  bizApproveTime?: string
  bizApproveStatus?: string
  opsApprover?: string
  opsApproveTime?: string
  opsApproveStatus?: string
  finApprover?: string
  finApproveTime?: string
  finApproveStatus?: string
  flowStatus: string
  rejectReason: string
}

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

function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

function matchesApprovalQuery(r: ApprovalRecord, query: FinApprovalQuery): boolean {
  if (query.groupId && !r.groupId.includes(query.groupId)) return false
  if (query.groupName && !r.groupName.includes(query.groupName)) return false
  if (query.brand && r.brand !== query.brand) return false
  if (query.approvalType && r.approvalType !== query.approvalType) return false
  if (query.flowNo && !r.flowNo.includes(query.flowNo)) return false
  if (query.flowStatus && r.flowStatus !== query.flowStatus) return false
  if (query.applicant && !r.applicant.includes(query.applicant)) return false
  if (query.approver) {
    const hit = [r.bizApprover, r.opsApprover, r.finApprover].some(a => a?.includes(query.approver!))
    if (!hit) return false
  }
  if (query.applyFrom && r.applyTime.slice(0, 10) < query.applyFrom) return false
  if (query.applyTo && r.applyTime.slice(0, 10) > query.applyTo) return false
  return true
}

function localFrontendApprovals(query: FinApprovalQuery): ApprovalRecord[] {
  return (getApprovalRecords() as ApprovalRecord[])
    .filter(r => r.approvalType === 'gift' && matchesApprovalQuery(r, query))
}

/** 定位審批中流程的當前待審節點 */
function resolveCurrentNode(r: ApprovalRecord): string {
  if (r.flowStatus !== 'pending') return ''
  if (r.bizApproveStatus === 'pending') return 'business'
  if (r.opsApproveStatus === 'pending') return 'operation'
  return 'finance'
}

export default function ProcessCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())

  const allProcesses = useMemo(() => flattenProcesses(), [])

  /** 根据搜索关键词过滤流程目录 */
  const filteredCatalog = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return PROCESS_CATALOG

    return PROCESS_CATALOG.map((cat) => ({
      ...cat,
      processes: cat.processes.filter(
        (p) =>
          t(p.name).toLowerCase().includes(kw) ||
          t(p.description).toLowerCase().includes(kw),
      ),
    })).filter((cat) => cat.processes.length > 0)
  }, [keyword, t])

  /** 常用流程列表（按收藏顺序） */
  const favoriteProcesses = useMemo(() => {
    return favorites
      .map((key) => allProcesses.find((p) => p.key === key))
      .filter((p): p is ProcessItem => !!p && p.enabled)
  }, [favorites, allProcesses])

  /** 切换收藏状态 */
  const toggleFavorite = useCallback(
    (procKey: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setFavorites((prev) => {
        const next = prev.includes(procKey)
          ? prev.filter((k) => k !== procKey)
          : [...prev, procKey]
        saveFavorites(next)
        return next
      })
    },
    [],
  )

  const handleProcessClick = (proc: ProcessItem) => {
    if (!proc.enabled || !proc.route) return
    navigate(proc.route)
  }

  const isFavorite = (key: string) => favorites.includes(key)

  /* ==================== 审批记录列表 ==================== */
  const { user, hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const [approvalData, setApprovalData] = useState<ApprovalRecord[]>([])
  const [approvalTotal, setApprovalTotal] = useState(0)
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalFilters, setApprovalFilters] = useState<ApprovalFilters>({})
  const [approvalPagination, setApprovalPagination] = useState({ page: 1, size: 10 })
  const [approvalSearchForm] = Form.useForm<ApprovalFilters>()

  const approvalTypeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.typeRecharge'), value: 'recharge' },
    { label: t('approvalCenter.typeDeduct'), value: 'deduct' },
    { label: t('approvalCenter.typeTransfer'), value: 'transfer' },
    { label: t('approvalCenter.typeMerge'), value: 'merge' },
    { label: t('approvalCenter.typeGift'), value: 'gift' },
  ]

  const flowStatusOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.flowPending'), value: 'pending' },
    { label: t('approvalCenter.flowApproved'), value: 'approved' },
    { label: t('approvalCenter.flowRejected'), value: 'rejected' },
    { label: t('approvalCenter.flowCancelled'), value: 'cancelled' },
  ]

  const currentNodeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.nodeBusiness'), value: 'business' },
    { label: t('approvalCenter.nodeOperation'), value: 'operation' },
    { label: t('approvalCenter.nodeFinance'), value: 'finance' },
  ]

  useEffect(() => {
    const approvalType = searchParams.get('approvalType')
    if (approvalType) {
      const initial = { approvalType }
      setApprovalFilters(initial)
      approvalSearchForm.setFieldsValue(initial)
    }
  }, [searchParams, approvalSearchForm])

  const buildApprovalQuery = useCallback((): FinApprovalQuery => ({
    page: approvalPagination.page,
    size: approvalPagination.size,
    groupId: approvalFilters.groupId?.trim() || undefined,
    groupName: approvalFilters.groupName?.trim() || undefined,
    brand: pickValue(approvalFilters.brand),
    approvalType: pickValue(approvalFilters.approvalType),
    flowNo: approvalFilters.flowNo?.trim() || undefined,
    flowStatus: pickValue(approvalFilters.flowStatus),
    currentNode: pickValue(approvalFilters.currentNode),
    applicant: approvalFilters.applicant?.trim() || undefined,
    approver: approvalFilters.approver?.trim() || undefined,
    applyFrom: approvalFilters.applyTime?.[0]?.format('YYYY-MM-DD'),
    applyTo: approvalFilters.applyTime?.[1]?.format('YYYY-MM-DD'),
  }), [approvalFilters, approvalPagination])

  const loadApprovals = useCallback(async () => {
    const query = buildApprovalQuery()
    setApprovalLoading(true)
    try {
      const res = await fetchFinApprovals(query).catch(() => null)
      const records = ((res?.records ?? []) as ApprovalRecord[]).map(r => ({
        ...r,
        key: r.key || r.flowNo,
      }))
      const extraLocal = localFrontendApprovals(query)
        .filter(g => !records.some(r => r.flowNo === g.flowNo))
      const merged = [...extraLocal, ...records]
      merged.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setApprovalData(merged)
      setApprovalTotal((res?.total ?? 0) + extraLocal.length)
    } catch {
      const localOnly = localFrontendApprovals(buildApprovalQuery())
      setApprovalData(localOnly)
      setApprovalTotal(localOnly.length)
    } finally {
      setApprovalLoading(false)
    }
  }, [buildApprovalQuery])

  useEffect(() => {
    void loadApprovals()
  }, [loadApprovals])

  const handleApprovalSearch = () => {
    setApprovalFilters(approvalSearchForm.getFieldsValue())
    setApprovalPagination(p => ({ ...p, page: 1 }))
  }

  const handleApprovalReset = () => {
    approvalSearchForm.resetFields()
    setApprovalFilters({})
    setApprovalPagination({ page: 1, size: 10 })
  }

  const handleApprovalDetail = (record: ApprovalRecord) => {
    navigate(`/approval-detail?type=${record.approvalType}&flowNo=${record.flowNo}`)
  }

  const isCurrentUser = useCallback((person?: string) => {
    if (!user || !person || person === '--') return false
    return (
      (!!user.name && person.includes(user.name)) ||
      (!!user.empId && person.includes(user.empId)) ||
      (!!user.username && person.includes(user.username))
    )
  }, [user])

  const canApprove = useCallback((record: ApprovalRecord) => {
    if (!hasPermission('approval-center:edit')) return false
    if (record.flowStatus !== 'pending') return false
    const node = resolveCurrentNode(record)
    const approver = node === 'business' ? record.bizApprover : node === 'operation' ? record.opsApprover : record.finApprover
    return isCurrentUser(approver)
  }, [isCurrentUser, hasPermission])

  const canCancel = useCallback((record: ApprovalRecord) => {
    if (!hasPermission('approval-center:edit')) return false
    return record.flowStatus === 'pending' && isCurrentUser(record.applicant)
  }, [isCurrentUser, hasPermission])

  const handleCancelApproval = (record: ApprovalRecord) => {
    Modal.confirm({
      title: t('approvalCenter.cancelTitle'),
      content: t('approvalCenter.cancelContent', { flowNo: record.flowNo }),
      okText: t('approvalCenter.cancelOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
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

  const handleNotify = () => {
    message.success(t('approvalCenter.notifySuccess'))
  }

  const renderApprovalStatus = (status?: string) => {
    if (status === 'approved') return <Tag color="green">{t('approvalCenter.statusApproved')}</Tag>
    if (status === 'rejected') return <Tag color="red">{t('approvalCenter.statusRejected')}</Tag>
    if (status === 'pending') return <span style={{ color: '#999' }}>--</span>
    return '--'
  }

  const renderFlowStatus = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'processing',
      approved: 'success',
      rejected: 'error',
      cancelled: 'default',
    }
    return <Tag color={colorMap[status]}>{flowStatusMapKeys[status] ? t(flowStatusMapKeys[status]) : status}</Tag>
  }

  const approvalColumnMeta = useMemo(() => [
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

  const { configComponent: approvalConfigComponent, applyConfig: applyApprovalConfig } = useColumnConfig(
    'process-center-approvals', approvalColumnMeta,
    [{ key: 'action', visible: true, locked: 'tail' as const }]
  )

  const approvalColumns: TableColumnsType<ApprovalRecord> = [
    { title: t('common.colGroupId'), dataIndex: 'groupId', key: 'groupId', width: 100, fixed: 'left' },
    { title: t('common.colGroupName'), dataIndex: 'groupName', key: 'groupName', width: 150 },
    {
      title: t('common.colBrand'), dataIndex: 'brand', key: 'brand', width: 80,
      render: (v: string) => <BrandTag value={v} />,
    },
    {
      title: t('common.colFlowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 180,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>,
    },
    {
      title: t('approvalCenter.colApprovalType'), dataIndex: 'approvalType', key: 'approvalType', width: 90,
      render: (v: string) => (approvalTypeMapKeys[v] ? t(approvalTypeMapKeys[v]) : v),
    },
    { title: t('approvalCenter.colApplicant'), dataIndex: 'applicant', key: 'applicant', width: 130 },
    {
      title: t('approvalCenter.colApplyTime'), dataIndex: 'applyTime', key: 'applyTime', width: 180,
      render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-',
    },
    {
      title: t('approvalCenter.colBiz'), key: 'biz',
      children: [
        { title: t('approvalCenter.colApprover'), key: 'biz_approver', width: 130, render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.bizApprover || '--'}</span> },
        { title: t('approvalCenter.colApproveTime'), key: 'biz_time', width: 180, render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.bizApproveTime || '--'}</span> },
        { title: t('approvalCenter.colApproveStatus'), key: 'biz_status', width: 90, render: (_: unknown, r: ApprovalRecord) => renderApprovalStatus(r.bizApproveStatus) },
      ],
    },
    {
      title: t('approvalCenter.colOps'), key: 'ops',
      children: [
        { title: t('approvalCenter.colApprover'), key: 'ops_approver', width: 130, render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.opsApprover || '--'}</span> },
        { title: t('approvalCenter.colApproveTime'), key: 'ops_time', width: 180, render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.opsApproveTime || '--'}</span> },
        { title: t('approvalCenter.colApproveStatus'), key: 'ops_status', width: 90, render: (_: unknown, r: ApprovalRecord) => renderApprovalStatus(r.opsApproveStatus) },
      ],
    },
    {
      title: t('approvalCenter.colFin'), key: 'fin',
      children: [
        { title: t('approvalCenter.colApprover'), key: 'fin_approver', width: 130, render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.finApprover || '--'}</span> },
        { title: t('approvalCenter.colApproveTime'), key: 'fin_time', width: 180, render: (_: unknown, r: ApprovalRecord) => <span style={{ whiteSpace: 'nowrap' }}>{r.finApproveTime || '--'}</span> },
        { title: t('approvalCenter.colApproveStatus'), key: 'fin_status', width: 90, render: (_: unknown, r: ApprovalRecord) => renderApprovalStatus(r.finApproveStatus) },
      ],
    },
    {
      title: t('approvalCenter.colFlowStatus'), dataIndex: 'flowStatus', key: 'flowStatus', width: 100,
      render: renderFlowStatus,
    },
    {
      title: t('approvalCenter.colRejectReason'), dataIndex: 'rejectReason', key: 'rejectReason', width: 180, ellipsis: true,
      render: (v: string) => v || <span style={{ color: '#999' }}>--</span>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 140, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleApprovalDetail(record)}>{t('common.detail')}</Button>
          {canApprove(record) && (
            <Button type="link" size="small" onClick={() => handleApprovalDetail(record)}>{t('approvalCenter.approve')}</Button>
          )}
          {canCancel(record) && (
            <Button type="link" size="small" danger onClick={() => handleCancelApproval(record)}>{t('approvalCenter.cancel')}</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area process-center">
      {/* 顶部搜索 */}
      <div className="process-center-header">
        <div className="process-center-title">{t('processCenter.pageTitle')}</div>
        <div className="process-center-subtitle">{t('processCenter.pageSubtitle')}</div>
        <div className="process-center-search">
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder={t('processCenter.searchPlaceholder')}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>
      </div>

      {/* 常用审批流程 */}
      {favoriteProcesses.length > 0 && !keyword.trim() && (
        <div className="process-favorites">
          <div className="process-favorites-header">
            <span className="process-favorites-icon"><ThunderboltOutlined /></span>
            <span className="process-favorites-name">{t('processCenter.favoritesTitle')}</span>
          </div>
          <div className="process-favorites-grid">
            {favoriteProcesses.map((proc) => (
              <div
                key={proc.key}
                className="process-card process-card-favorite"
                onClick={() => handleProcessClick(proc)}
              >
                <div
                  className="process-card-icon"
                  style={{
                    background: `${proc.categoryColor}10`,
                    color: proc.categoryColor,
                  }}
                >
                  {proc.icon}
                </div>
                <div className="process-card-info">
                  <div className="process-card-name">{t(proc.name)}</div>
                  <div className="process-card-desc">{t(proc.description)}</div>
                </div>
                <Tooltip title={t('processCenter.unpin')}>
                  <span
                    className="process-card-star"
                    onClick={(e) => toggleFavorite(proc.key, e)}
                  >
                    <StarFilled style={{ color: '#faad14' }} />
                  </span>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 流程目录 */}
      {filteredCatalog.length === 0 ? (
        <Empty description={t('processCenter.noResult')} style={{ marginTop: 80 }} />
      ) : (
        <div className="process-center-body">
          {filteredCatalog.map((cat) => (
            <div className="process-category" key={cat.key}>
              <div className="process-category-header">
                <span
                  className="process-category-icon"
                  style={{ background: cat.color }}
                >
                  {cat.icon}
                </span>
                <span className="process-category-name">{t(cat.name)}</span>
                <span className="process-category-count">{cat.processes.length}</span>
              </div>
              <div className="process-category-grid">
                {cat.processes.map((proc) => {
                  const fullProc: ProcessItem = { ...proc, categoryColor: cat.color }
                  const fav = isFavorite(proc.key)
                  return (
                    <div
                      key={proc.key}
                      className={`process-card${!proc.enabled ? ' process-card-disabled' : ''}`}
                      onClick={() => handleProcessClick(fullProc)}
                    >
                      <div
                        className="process-card-icon"
                        style={{
                          background: proc.enabled
                            ? `${cat.color}10`
                            : '#f5f5f5',
                          color: proc.enabled ? cat.color : '#bfbfbf',
                        }}
                      >
                        {proc.icon}
                      </div>
                      <div className="process-card-info">
                        <div className="process-card-name">{t(proc.name)}</div>
                        <div className="process-card-desc">{t(proc.description)}</div>
                      </div>
                      {proc.enabled ? (
                        <Tooltip title={fav ? t('processCenter.unpin') : t('processCenter.pin')}>
                          <span
                            className="process-card-star"
                            onClick={(e) => toggleFavorite(proc.key, e)}
                          >
                            {fav
                              ? <StarFilled style={{ color: '#faad14' }} />
                              : <StarOutlined style={{ color: '#d9d9d9' }} />
                            }
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="process-card-badge">{t('processCenter.comingSoon')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 审批记录列表 */}
      <div className="process-center-approval-section" style={{ marginTop: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>{t('processCenter.approvalRecordsTitle')}</div>
          <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4 }}>{t('processCenter.approvalRecordsSubtitle')}</div>
        </div>

        {/* 查询区域 */}
        <div className="search-section">
          <Form form={approvalSearchForm} layout="inline">
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
                <Button type="primary" icon={<SearchOutlined />} onClick={handleApprovalSearch}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={handleApprovalReset}>{t('common.reset')}</Button>
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
            {approvalConfigComponent}
          </div>
        </div>

        {/* 列表区域 */}
        <div className="table-section">
          <Table<ApprovalRecord>
            columns={applyApprovalConfig(approvalColumns)}
            dataSource={approvalData}
            rowKey="flowNo"
            loading={approvalLoading}
            rowSelection={{}}
            pagination={{
              current: approvalPagination.page,
              pageSize: approvalPagination.size,
              total: approvalTotal,
              showTotal: (total) => t('common.total', { count: total }),
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              onChange: (page, size) => setApprovalPagination({ page, size: size || 10 }),
            }}
            size="middle"
            bordered
            scroll={{ x: 2340 }}
          />
        </div>
      </div>
    </div>
  )
}
