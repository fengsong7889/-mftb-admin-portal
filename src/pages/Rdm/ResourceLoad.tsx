/**
 * 團隊負載 —— 獨立菜單頁（rdm-resource-load）
 *
 * 阶段 A：纯静态 UI，样例数据，不调用任何后端接口。
 * 正式数据接入在阶段 B，届时移除 PROTOTYPE 标记并对接 /api/rdm/resource/workload。
 *
 * 定位：
 * - 回答「谁有调度余量、谁已超载」，帮助项目经理/产品/研发/测试负责人分派工作。
 * - 跨岗位统一口径：参考负载率 = 区间内已安排剩余工时 / 同区间可用工时（非绩效评分）。
 * - 数据待完善的人明确标注，不展示为 0% 冒充空闲。
 *
 * 页面结构（§E.7/§E.8）：
 *   页面说明横幅 → 搜索区 → 统计卡片 → 操作区 → 人员负载表
 *   行内展开：个人工作明细（产品/研发/测试/协调分组）
 *   独立子视图（URL query 控制）：view=person 人员详情 / view=assign 分派表单
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatCards from '../../components/StatCards'
import HelpPopover from '../../components/HelpPopover'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { rdmTableLocale } from './components/tableLocale'
import {
  fetchResourceWorkload,
  fetchResourceMembers,
  saveResourceMember,
  removeResourceMember,
  fetchResourceUnassigned,
  assignResource,
  type RdmResourcePerson,
  type RdmResourceWorkload,
  type RdmResourceMember,
  type RdmUnassignedItem,
} from '../../api/rdm'
import EmployeeSelect from '../MeetingManagement/EmployeeSelect'
import { formatEmployee } from '../../utils/employeeDisplay'
import './index.css'

const { RangePicker } = DatePicker

/* ──────────────────────────────────────────────────────────
 * 阶段 A 样例数据 —— 正式接入后由 /api/rdm/resource/workload 替换
 * ────────────────────────────────────────────────────────── */

/** 负载状态枚举 */
type LoadStatus = 'available' | 'normal' | 'near_full' | 'overloaded' | 'data_incomplete'

/** 岗位角色 */
type RoleCode = 'pm' | 'product' | 'dev' | 'designer' | 'qa' | 'ops' | 'pmo'

/** 单日负载格 */
interface DayCell {
  day: string
  capacity: number
  planned: number
  overloaded: boolean
  leave: boolean
  weekend: boolean
}

/** 一行人员负载 */
interface PersonRow {
  userId: number
  userName: string
  empNo: string
  dept: string
  roles: RoleCode[]
  /** 各类型待办件数 */
  productReqs: number
  devTasks: number
  testTasks: number
  coordItems: number
  /** 工时口径 */
  totalCapacity: number
  totalPlanned: number
  totalActual: number
  /** 参考负载率（百分比） */
  loadRate: number
  /** 逐日余量（正=可调度，负=超载） */
  days: DayCell[]
  /** 数据完整性 */
  loadStatus: LoadStatus
  hasOverdue: boolean
  hasBlocked: boolean
  dataIncompleteReason?: string
}

/** 个人工作明细行（展开行） */
interface WorkItem {
  sourceType: 'product' | 'dev' | 'designer' | 'test' | 'coord'
  sourceLabel: string
  title: string
  phase: string
  planHours: number | null
  remainingHours: number | null
  planStart: string | null
  planFinish: string | null
  status: string
  isOverdue: boolean
  isBlocked: boolean
}

/** 角色中文标签：存 i18n key，使用处 t()（模块级常量不能用 hook） */
const ROLE_KEY: Record<RoleCode, string> = {
  pm: 'rdm.resLoad.rolePm',
  product: 'rdm.resLoad.roleProduct',
  dev: 'rdm.resLoad.roleDev',
  designer: 'rdm.resLoad.roleDesigner',
  qa: 'rdm.resLoad.roleQa',
  ops: 'rdm.resLoad.roleOps',
  pmo: 'rdm.resLoad.rolePmo',
}

/** 负载状态标签：同上存 key */
const LOAD_STATUS_KEY: Record<LoadStatus, string> = {
  available: 'rdm.resLoad.statusAvailable',
  normal: 'rdm.resLoad.statusNormal',
  near_full: 'rdm.resLoad.statusNearFull',
  overloaded: 'rdm.resLoad.statusOverloaded',
  data_incomplete: 'rdm.resLoad.statusIncomplete',
}

const LOAD_STATUS_COLOR: Record<LoadStatus, string> = {
  available: 'success',
  normal: 'processing',
  near_full: 'warning',
  overloaded: 'error',
  data_incomplete: 'default',
}

/** 样例个人工作明细（阶段 A 遗留：明细接口接入后移除；文案走 t，title 用 demo key） */
type TFn = (key: string, opts?: Record<string, unknown>) => string
const buildSampleWorkItems = (t: TFn): Record<number, WorkItem[]> => ({
  101: [
    { sourceType: 'dev', sourceLabel: 'RT20261001001', title: t('rdm.resLoad.demoDev1Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 24, remainingHours: 16, planStart: '2026-10-14', planFinish: '2026-10-21', status: t('rdm.resLoad.workDoing'), isOverdue: false, isBlocked: false },
    { sourceType: 'dev', sourceLabel: 'RT20261001002', title: t('rdm.resLoad.demoDev2Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 16, remainingHours: 16, planStart: '2026-10-18', planFinish: '2026-10-25', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
    { sourceType: 'dev', sourceLabel: 'RT20260928003', title: t('rdm.resLoad.demoDev3Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 8, remainingHours: 8, planStart: '2026-10-10', planFinish: '2026-10-14', status: t('rdm.resLoad.workOverdue'), isOverdue: true, isBlocked: false },
    { sourceType: 'dev', sourceLabel: 'RT20261002004', title: t('rdm.resLoad.demoDev4Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 32, remainingHours: 32, planStart: '2026-10-20', planFinish: '2026-10-31', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
    { sourceType: 'dev', sourceLabel: 'RT20261003005', title: t('rdm.resLoad.demoDev5Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 16, remainingHours: 16, planStart: '2026-10-22', planFinish: '2026-10-28', status: t('rdm.resLoad.workBlocked'), isOverdue: false, isBlocked: true },
  ],
  102: [
    { sourceType: 'dev', sourceLabel: 'RT20261001006', title: t('rdm.resLoad.demoDev6Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 24, remainingHours: 16, planStart: '2026-10-14', planFinish: '2026-10-21', status: t('rdm.resLoad.workDoing'), isOverdue: false, isBlocked: true },
    { sourceType: 'designer', sourceLabel: t('rdm.resLoad.srcLabelDesignDoc'), title: t('rdm.resLoad.demoDesign1Title'), phase: t('rdm.resLoad.phaseDesign'), planHours: 16, remainingHours: 8, planStart: '2026-10-12', planFinish: '2026-10-18', status: t('rdm.resLoad.workDoing'), isOverdue: false, isBlocked: false },
    { sourceType: 'dev', sourceLabel: 'RT20261002007', title: t('rdm.resLoad.demoDev7Title'), phase: t('rdm.resLoad.phaseDev'), planHours: 8, remainingHours: 8, planStart: '2026-10-19', planFinish: '2026-10-22', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
  ],
  103: [
    { sourceType: 'product', sourceLabel: 'XQ20261001001', title: t('rdm.resLoad.demoProduct1Title'), phase: t('rdm.resLoad.phaseAnalysis'), planHours: 8, remainingHours: 4, planStart: '2026-10-14', planFinish: '2026-10-16', status: t('rdm.resLoad.workDoing'), isOverdue: false, isBlocked: false },
    { sourceType: 'product', sourceLabel: 'XQ20261002002', title: t('rdm.resLoad.demoProduct2Title'), phase: t('rdm.resLoad.phasePrd'), planHours: 12, remainingHours: 12, planStart: '2026-10-18', planFinish: '2026-10-22', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
    { sourceType: 'product', sourceLabel: 'XQ20261003003', title: t('rdm.resLoad.demoProduct3Title'), phase: t('rdm.resLoad.phaseAnalysis'), planHours: 8, remainingHours: 8, planStart: '2026-10-20', planFinish: '2026-10-23', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
    { sourceType: 'product', sourceLabel: 'XQ20260928004', title: t('rdm.resLoad.demoProduct4Title'), phase: t('rdm.resLoad.phaseFollowUp'), planHours: 4, remainingHours: 2, planStart: '2026-10-10', planFinish: '2026-10-14', status: t('rdm.resLoad.workOverdue'), isOverdue: true, isBlocked: false },
    { sourceType: 'coord', sourceLabel: t('rdm.resLoad.srcLabelProjectCoord'), title: t('rdm.resLoad.demoCoord1Title'), phase: t('rdm.resLoad.phaseCoord'), planHours: 2, remainingHours: 2, planStart: '2026-10-18', planFinish: '2026-10-18', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
  ],
  104: [
    { sourceType: 'test', sourceLabel: 'TB20261001001', title: t('rdm.resLoad.demoTest1Title'), phase: t('rdm.resLoad.phaseTestExec'), planHours: 16, remainingHours: 8, planStart: '2026-10-16', planFinish: '2026-10-20', status: t('rdm.resLoad.workDoing'), isOverdue: false, isBlocked: false },
    { sourceType: 'test', sourceLabel: 'TB20261002002', title: t('rdm.resLoad.demoTest2Title'), phase: t('rdm.resLoad.phaseTestExec'), planHours: 8, remainingHours: 8, planStart: '2026-10-21', planFinish: '2026-10-24', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
    { sourceType: 'test', sourceLabel: 'TB20261003003', title: t('rdm.resLoad.demoTest3Title'), phase: t('rdm.resLoad.phaseTestExec'), planHours: 8, remainingHours: 8, planStart: '2026-10-24', planFinish: '2026-10-28', status: t('rdm.resLoad.workTodo'), isOverdue: false, isBlocked: false },
  ],
})

/* ──────────────────────────────────────────────────────────
 * 主頁面組件
 * ────────────────────────────────────────────────────────── */

/** 负载率进度条颜色 */
function loadRateColor(rate: number): string {
  if (rate > 100) return '#FF4D4F'
  if (rate > 85) return '#FA8C16'
  if (rate > 0) return '#52C41A'
  return '#D9D9D9'
}

/** 负载率说明（HelpPopover 结构化内容）：模块级不能拿 hook，改为工厂函数 */
const LOAD_RATE_HELP = (t: TFn) => [
  { tone: 'info' as const, label: t('rdm.resLoad.helpRateLabel'), body: t('rdm.resLoad.helpRateBody') },
  { tone: 'neutral' as const, label: t('rdm.resLoad.helpCapacityLabel'), body: t('rdm.resLoad.helpCapacityBody') },
  { tone: 'warn' as const, label: t('rdm.resLoad.helpNearFullLabel'), body: t('rdm.resLoad.helpNearFullBody') },
  { tone: 'danger' as const, label: t('rdm.resLoad.helpOverLabel'), body: t('rdm.resLoad.helpOverBody') },
  { tone: 'neutral' as const, label: t('rdm.resLoad.helpIncompleteLabel'), body: t('rdm.resLoad.helpIncompleteBody') },
]

/** 岗位筛选选项（组件内用 t 组装） */
const ROLE_OPTIONS = (t: TFn): { value: RoleCode; label: string }[] => (
  (Object.keys(ROLE_KEY) as RoleCode[]).map(r => ({ value: r, label: t(ROLE_KEY[r]) }))
)

/** 负载状态筛选选项 */
const STATUS_OPTIONS = (t: TFn) => [
  { value: 'all', label: t('rdm.resLoad.filterAll') },
  ...(Object.keys(LOAD_STATUS_KEY) as LoadStatus[]).map(s => ({ value: s, label: t(LOAD_STATUS_KEY[s]) })),
]

/* ──────────────────────────────────
 * 分派来源 —— 全部绑定系统已有业务单据（用户决策：不提供自由填写）
 * ────────────────────────────────── */

/** 分派来源类型：产品需求 / 研发任务 / 设计任务 / 测试批次（均为系统已有单据） */
type AssignSource = 'requirement' | 'dev_task' | 'design_task' | 'test_batch'

/** 各来源的标签与「无可用单据」时的引导（跳转到对应业务页创建/受理）：文案存 key，使用处 t() */
const ASSIGN_SOURCE_KEY: Record<AssignSource, { label: string; emptyHint: string; emptyLink: string; emptyLinkText: string }> = {
  requirement: { label: 'rdm.resLoad.srcRequirement', emptyHint: 'rdm.resLoad.srcRequirementEmpty', emptyLink: '/rdm-intake', emptyLinkText: 'rdm.resLoad.srcRequirementLink' },
  dev_task: { label: 'rdm.resLoad.srcDevTask', emptyHint: 'rdm.resLoad.srcDevTaskEmpty', emptyLink: '/rdm-delivery', emptyLinkText: 'rdm.resLoad.srcDevTaskLink' },
  design_task: { label: 'rdm.resLoad.srcDesignTask', emptyHint: 'rdm.resLoad.srcDesignTaskEmpty', emptyLink: '/rdm-delivery', emptyLinkText: 'rdm.resLoad.srcDesignTaskLink' },
  test_batch: { label: 'rdm.resLoad.srcTestBatch', emptyHint: 'rdm.resLoad.srcTestBatchEmpty', emptyLink: '/rdm-test', emptyLinkText: 'rdm.resLoad.srcTestBatchLink' },
}

/** 一条待分配的业务单据 */
interface AssignableItem {
  id: number
  sourceType: AssignSource
  code: string
  title: string
  reqTitle?: string
  currentOwner?: string
  planHours?: number | null
  iterationCode?: string
  /** 任务乐观锁版本（分派写回回传） */
  planVersion?: number | null
}

/** 后端待分配项 → 前端 AssignableItem（字段同源，编号缺失回退 #id） */
function toAssignable(i: RdmUnassignedItem): AssignableItem {
  return {
    id: i.itemId,
    sourceType: i.source,
    code: i.code ?? `#${i.itemId}`,
    title: i.title ?? '',
    reqTitle: i.reqTitle ?? undefined,
    currentOwner: i.currentOwner ?? undefined,
    planHours: i.planHours ?? null,
    planVersion: i.planVersion ?? undefined,
  }
}

/** 空待分配桶（后端未就绪/无权时的初值） */
const EMPTY_UNASSIGNED: Record<AssignSource, AssignableItem[]> = {
  requirement: [], dev_task: [], design_task: [], test_batch: [],
}

/** 后端负载行 → 前端展示行（B-1：研发+设计合并、测试任务+批次合并展示；字段名与后端同源） */
function toPersonRow(p: RdmResourcePerson): PersonRow {
  return {
    userId: p.userId,
    userName: p.userName ?? `#${p.userId}`,
    empNo: p.empNo ?? '',
    dept: p.dept ?? '',
    roles: (p.roles ?? []) as RoleCode[],
    productReqs: p.productReqs ?? 0,
    devTasks: (p.devTasks ?? 0) + (p.designTasks ?? 0),
    testTasks: (p.testTasks ?? 0) + (p.testBatches ?? 0),
    coordItems: p.coordItems ?? 0,
    totalCapacity: p.totalCapacity ?? 0,
    totalPlanned: p.totalPlanned ?? 0,
    totalActual: p.totalActual ?? 0,
    loadRate: p.loadRate ?? 0,
    loadStatus: p.loadStatus as LoadStatus,
    hasOverdue: p.hasOverdue ?? false,
    hasBlocked: p.hasBlocked ?? false,
    dataIncompleteReason: p.dataIncompleteReason ?? undefined,
    days: (p.days ?? []).map(d => ({
      day: d.day,
      capacity: d.capacity ?? 0,
      planned: d.planned ?? 0,
      overloaded: d.overloaded ?? false,
      leave: d.leave ?? false,
      weekend: d.weekend ?? false,
    })),
  }
}

export default function ResourceLoad() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const view = searchParams.get('view') ?? 'list'
  const personId = Number(searchParams.get('userId') ?? 0)

  // ── 真实负载数据（B-1：对接 /rdm/resource/workload）──
  const [workload, setWorkload] = useState<RdmResourceWorkload | null>(null)
  const [loading, setLoading] = useState(false)

  // ── 名册维护（view=roster，B-2）──
  const [members, setMembers] = useState<RdmResourceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [memberEditing, setMemberEditing] = useState<RdmResourceMember | null>(null)
  const [memberPickedName, setMemberPickedName] = useState<string>('')
  const [memberForm] = Form.useForm()

  // ── 筛选状态 ──
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(), dayjs().add(13, 'day')])
  const [roleFilter, setRoleFilter] = useState<RoleCode | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [keyword, setKeyword] = useState('')
  const [deptFilter, setDeptFilter] = useState<string | undefined>(undefined)

  // ── 展开行 ──
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null)

  // ── 分派弹窗 ──
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<PersonRow | null>(null)
  const [assignSource, setAssignSource] = useState<AssignSource>('requirement')
  const [assignSelectedId, setAssignSelectedId] = useState<number | null>(null)
  const [assignForm] = Form.useForm()

  // ── 待分配工作真实数据（B-3.1，按来源分桶）──
  const [unassignedBySource, setUnassignedBySource] = useState<Record<AssignSource, AssignableItem[]>>(EMPTY_UNASSIGNED)
  const [unassignedLoading, setUnassignedLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchResourceWorkload({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') })
      setWorkload(data)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { void load() }, [load])

  // 阶段 A 样例明细（文案 i18n 化，接口接入后整体移除）
  const sampleWorkItems = useMemo(() => buildSampleWorkItems(t), [t])
  // 分派来源元信息（key → 文案）
  const srcMeta = useCallback((s: AssignSource) => {
    const k = ASSIGN_SOURCE_KEY[s]
    return { label: t(k.label), emptyHint: t(k.emptyHint), emptyLink: k.emptyLink, emptyLinkText: t(k.emptyLinkText) }
  }, [t])

  // 真实人员（后端负载行映射为前端展示行）
  const allPeople = useMemo<PersonRow[]>(() => (workload?.people ?? []).map(toPersonRow), [workload])

  // 名册加载（仅 view=roster 时）
  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      setMembers(await fetchResourceMembers())
    } finally {
      setMembersLoading(false)
    }
  }, [])

  useEffect(() => { if (view === 'roster') void loadMembers() }, [view, loadMembers])

  // 待分配真实聚合（view=unassigned 或分派弹窗打开时加载）
  const loadUnassigned = useCallback(async () => {
    setUnassignedLoading(true)
    try {
      const res = await fetchResourceUnassigned()
      setUnassignedBySource({
        requirement: (res.requirements ?? []).map(toAssignable),
        dev_task: (res.devTasks ?? []).map(toAssignable),
        design_task: (res.designTasks ?? []).map(toAssignable),
        test_batch: (res.testBatches ?? []).map(toAssignable),
      })
    } finally {
      setUnassignedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'unassigned' || assignModalOpen) void loadUnassigned()
  }, [view, assignModalOpen, loadUnassigned])

  // ── 过滤 ──
  const filtered = useMemo(() => {
    return allPeople.filter(p => {
      if (roleFilter && !p.roles.includes(roleFilter)) return false
      if (statusFilter !== 'all' && p.loadStatus !== statusFilter) return false
      if (deptFilter && p.dept !== deptFilter) return false
      if (keyword) {
        const kw = keyword.toLowerCase()
        return p.userName.toLowerCase().includes(kw) || p.empNo.toLowerCase().includes(kw) || p.dept.toLowerCase().includes(kw)
      }
      return true
    })
  }, [allPeople, roleFilter, statusFilter, deptFilter, keyword])

  // ── 统计（跟随筛选口径）──
  const stats = useMemo(() => ({
    total: filtered.length,
    available: filtered.filter(p => p.loadStatus === 'available').length,
    overloaded: filtered.filter(p => p.loadStatus === 'overloaded').length,
    incomplete: filtered.filter(p => p.loadStatus === 'data_incomplete').length,
  }), [filtered])

  const deptOptions = useMemo(() => {
    const set = new Set(allPeople.map(p => p.dept).filter(Boolean))
    return [...set].map(d => ({ value: d, label: d }))
  }, [allPeople])

  const handleReset = useCallback(() => {
    setRange([dayjs(), dayjs().add(13, 'day')])
    setRoleFilter(undefined)
    setStatusFilter('all')
    setKeyword('')
    setDeptFilter(undefined)
  }, [])

  const handleAssign = useCallback((person: PersonRow | null, presetSource?: AssignSource, presetItemId?: number) => {
    setAssignTarget(person)
    setAssignSource(presetSource ?? 'requirement')
    setAssignSelectedId(presetItemId ?? null)
    assignForm.resetFields()
    setAssignModalOpen(true)
  }, [assignForm])

  const handleAssignConfirm = useCallback(async () => {
    // 全部绑定：必须先选中一条系统已有单据（用户决策：不提供自由填写）
    if (assignSelectedId == null) {
      message.warning(t('rdm.resLoad.chooseDocWarn'))
      return
    }
    const item = unassignedBySource[assignSource].find(i => i.id === assignSelectedId)
    if (!item) {
      message.warning(t('rdm.resLoad.docMissingWarn'))
      return
    }
    const isTask = assignSource === 'dev_task' || assignSource === 'design_task'
    const isReq = assignSource === 'requirement'
    const isBatch = assignSource === 'test_batch'
    try {
      const values = await assignForm.validateFields()
      // 被分派人：从人出发时是 assignTarget；从单据出发时由表单 assignee 选定
      const target = assignTarget ?? allPeople.find(p => p.userId === values.assignee) ?? null
      if (!target) {
        message.warning(t('rdm.resLoad.chooseAssigneeWarn'))
        return
      }
      Modal.confirm({
        title: isTask ? t('rdm.resLoad.assignConfirmTitleTask') : isReq ? t('rdm.resLoad.assignConfirmTitleReq') : t('rdm.resLoad.assignConfirmTitleWork'),
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmAssignee')}</span><b>{target.userName}（{target.empNo}）</b></div>
            <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmSourceDoc')}</span><b>{item.code} · {item.title}</b></div>
            {item.reqTitle && <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmReqTitle')}</span><b>{item.reqTitle}</b></div>}
            {isTask && (
              <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmTaskHours')}</span><b>{t('rdm.resLoad.confirmTaskHoursValue')}</b></div>
            )}
            {isReq && (
              <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmAction')}</span><b>{t('rdm.resLoad.confirmReqAction')}</b></div>
            )}
            {isBatch && (
              <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmAction')}</span><b>{t('rdm.resLoad.confirmBatchAction')}</b></div>
            )}
            {target.loadStatus === 'overloaded' && (
              <div className="confirm-info-row"><span style={{ color: '#CF1322' }}>{t('rdm.resLoad.confirmOverload', { rate: target.loadRate })}</span><b style={{ color: '#CF1322' }}>{t('rdm.resLoad.confirmOverloadAction')}</b></div>
            )}
          </div>
        ),
        okText: t('rdm.resLoad.okAssign'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          // 四来源均委托各自领域写接口（任务乐观锁、需求状态 CAS、批次 pending-only+@Version）+幂等
          try {
            await assignResource({
              source: assignSource,
              itemId: item.id,
              assigneeUserId: target.userId,
              expectedPlanVersion: item.planVersion ?? null,
              clientRequestId: `rl-${assignSource}-${item.id}-${target.userId}-${Date.now()}`,
            })
            message.success(isTask ? t('rdm.resLoad.assignOkTask', { name: target.userName, empNo: target.empNo })
              : isReq ? t('rdm.resLoad.assignOkReq', { name: target.userName, empNo: target.empNo })
                : t('rdm.resLoad.assignOkBatch', { name: target.userName }))
            setAssignModalOpen(false)
            await Promise.all([load(), loadUnassigned()])
          } catch (e) {
            message.error(e instanceof Error ? t('rdm.resLoad.assignFail', { msg: e.message }) : t('rdm.resLoad.assignFailRetry'))
            setAssignModalOpen(false)
            // 并发冲突或单据状态变更后刷新待分配列表，让用户拿到最新状态再试
            await loadUnassigned()
          }
        },
      })
    } catch {
      // validateFields 失败，antd 已在字段下显示错误
    }
  }, [assignForm, assignTarget, assignSource, assignSelectedId, allPeople, unassignedBySource, load, loadUnassigned, t])

  // ── 名册维护操作（B-2）──
  const openMemberModal = useCallback((member?: RdmResourceMember) => {
    setMemberEditing(member ?? null)
    setMemberPickedName(member?.userName ?? '')
    memberForm.resetFields()
    if (member) {
      let roles: string[] = []
      if (member.roleCodes) {
        try { roles = JSON.parse(member.roleCodes) as string[] } catch { roles = [] }
      }
      memberForm.setFieldsValue({
        userIds: [member.userId],
        roleCodes: roles,
        weeklyCapacityHours: member.weeklyCapacityHours ?? undefined,
        remark: member.remark ?? undefined,
      })
    }
    setMemberModalOpen(true)
  }, [memberForm])

  const handleMemberSave = useCallback(async () => {
    try {
      const values = await memberForm.validateFields()
      const userId = (values.userIds as number[] | undefined)?.[0]
      if (!userId) { message.warning(t('rdm.resLoad.needEmployeeWarn')); return }
      const roleText = ((values.roleCodes ?? []) as string[]).map(r => t(ROLE_KEY[r as RoleCode] ?? r)).join('、') || t('rdm.resLoad.roleUnset')
      Modal.confirm({
        title: memberEditing ? t('rdm.resLoad.memberConfirmSave') : t('rdm.resLoad.memberConfirmAdd'),
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmMember')}</span><b>{memberPickedName || `#${userId}`}</b></div>
            <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmRoles')}</span><b>{roleText}</b></div>
            <div className="confirm-info-row"><span>{t('rdm.resLoad.confirmCapacity')}</span><b>{values.weeklyCapacityHours ? `${values.weeklyCapacityHours}h` : t('rdm.resLoad.capacityDefault')}</b></div>
          </div>
        ),
        okText: t('rdm.iteration.confirmOk'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          await saveResourceMember({
            userId,
            roleCodes: values.roleCodes,
            weeklyCapacityHours: values.weeklyCapacityHours,
            remark: values.remark,
            status: 1,
          })
          message.success(memberEditing ? t('rdm.resLoad.memberSaved') : t('rdm.resLoad.memberAdded'))
          setMemberModalOpen(false)
          await loadMembers()
        },
      })
    } catch {
      // validateFields 失败，antd 已在字段下显示错误
    }
  }, [memberForm, memberEditing, memberPickedName, loadMembers, t])

  const handleMemberRemove = useCallback((member: RdmResourceMember) => {
    Modal.confirm({
      title: t('rdm.resLoad.removeConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: t('rdm.resLoad.removeConfirmContent', { name: member.userName ?? '' }),
      okText: t('rdm.resLoad.removeOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (member.id != null) {
          await removeResourceMember(member.id)
          message.success(t('rdm.resLoad.memberRemoved'))
          await loadMembers()
        }
      },
    })
  }, [loadMembers, t])

  // ── 表格列 ──
  const columns: TableColumnsType<PersonRow> = useMemo(() => [
    {
      title: t('rdm.resLoad.colMember'),
      dataIndex: 'userName',
      key: 'userName',
      width: 150,
      fixed: 'left',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#262626', fontSize: 13 }}>{formatEmployee(r.userName, r.empNo)}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.dept || '-'}</div>
        </div>
      ),
    },
    {
      title: t('rdm.resLoad.colRoles'),
      key: 'roles',
      width: 130,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.roles.map(role => (
            <Tag key={role} color={role === 'qa' ? 'purple' : role === 'product' ? 'blue' : role === 'dev' ? 'orange' : 'default'} style={{ margin: 0, fontSize: 11 }}>
              {t(ROLE_KEY[role])}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t('rdm.resLoad.colProductReqs'),
      dataIndex: 'productReqs',
      key: 'productReqs',
      width: 90,
      sorter: (a, b) => a.productReqs - b.productReqs,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600, color: '#1890FF' }}>{v}</span> : <span style={{ color: '#D9D9D9' }}>0</span>,
    },
    {
      title: t('rdm.resLoad.colDevTasks'),
      dataIndex: 'devTasks',
      key: 'devTasks',
      width: 90,
      sorter: (a, b) => a.devTasks - b.devTasks,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600, color: '#E8720C' }}>{v}</span> : <span style={{ color: '#D9D9D9' }}>0</span>,
    },
    {
      title: t('rdm.resLoad.colTestTasks'),
      dataIndex: 'testTasks',
      key: 'testTasks',
      width: 90,
      sorter: (a, b) => a.testTasks - b.testTasks,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600, color: '#722ED1' }}>{v}</span> : <span style={{ color: '#D9D9D9' }}>0</span>,
    },
    {
      title: t('rdm.resLoad.colCoord'),
      dataIndex: 'coordItems',
      key: 'coordItems',
      width: 90,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600, color: '#595959' }}>{v}</span> : <span style={{ color: '#D9D9D9' }}>0</span>,
    },
    {
      title: t('rdm.resLoad.colHours'),
      key: 'hours',
      width: 180,
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {r.totalCapacity} / <b style={{ color: r.totalPlanned > r.totalCapacity ? '#CF1322' : '#262626' }}>{r.totalPlanned}</b> / {r.totalActual}
        </span>
      ),
    },
    {
      title: (
        <Space size={4}>
          {t('rdm.resLoad.colLoadRate')}
          <HelpPopover
            title={t('rdm.resLoad.helpTitle')}
            ariaLabel={t('rdm.resLoad.helpAria')}
            content={LOAD_RATE_HELP(t)}
            placement="bottomLeft"
            width={400}
          />
        </Space>
      ),
      key: 'loadRate',
      width: 160,
      sorter: (a, b) => a.loadRate - b.loadRate,
      render: (_, r) => {
        if (r.loadStatus === 'data_incomplete') {
          return (
            <Tooltip title={r.dataIncompleteReason}>
              <Tag color="default" icon={<ExclamationCircleOutlined />} style={{ margin: 0 }}>{t('rdm.resLoad.tagIncomplete')}</Tag>
            </Tooltip>
          )
        }
        return (
          <Space size={6} direction="vertical" style={{ width: '100%' }}>
            <Progress
              percent={Math.min(r.loadRate, 100)}
              size="small"
              strokeColor={loadRateColor(r.loadRate)}
              format={() => `${r.loadRate}%`}
              style={{ marginBottom: 0 }}
            />
            <Space size={4}>
              <Tag color={LOAD_STATUS_COLOR[r.loadStatus]} style={{ margin: 0, fontSize: 11 }}>
                {t(LOAD_STATUS_KEY[r.loadStatus])}
              </Tag>
              {r.hasOverdue && <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('rdm.resLoad.tagOverdue')}</Tag>}
              {r.hasBlocked && <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>{t('rdm.resLoad.tagBlocked')}</Tag>}
            </Space>
          </Space>
        )
      },
    },
    {
      title: t('rdm.resLoad.colDays', { count: range[1].diff(range[0], 'day') + 1 }),
      key: 'days',
      width: 220,
      render: (_, r) => (
        <Space size={2} wrap>
          {r.days.map(d => (
            <Tooltip
              key={d.day}
              title={
                d.weekend ? t('rdm.resLoad.tipWeekend', { day: d.day }) :
                d.leave ? t('rdm.resLoad.tipLeave', { day: d.day }) :
                t('rdm.resLoad.tipCapacity', { day: d.day, capacity: d.capacity, planned: d.planned }) + (d.overloaded ? t('rdm.resLoad.tipOverSuffix') : '')
              }
            >
              <span
                className="rdm-load-cell"
                style={{
                  background: d.weekend || d.leave ? '#F5F5F5'
                    : d.overloaded ? '#FF4D4F'
                    : d.planned > 0 ? (d.planned / d.capacity > 0.85 ? '#FA8C16' : '#52C41A')
                    : '#FFFFFF',
                  borderColor: d.weekend ? '#E8EAED' : 'transparent',
                  opacity: d.planned > 0 && !d.overloaded ? 0.4 + Math.min(0.6, d.planned / 16) : 1,
                }}
              />
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => setExpandedUserId(expandedUserId === r.userId ? null : r.userId)}>
            {expandedUserId === r.userId ? t('rdm.resLoad.btnCollapse') : t('rdm.resLoad.btnDetail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-resource-load?view=person&userId=${r.userId}`)}>
            {t('rdm.resLoad.btnPersonDetail')}
          </Button>
          <Button type="link" size="small" onClick={() => handleAssign(r)}>
            {t('rdm.resLoad.btnAssign')}
          </Button>
        </Space>
      ),
    },
  ], [range, expandedUserId, handleAssign, navigate, t])

  const columnMeta = useMemo(() => columns.map(c => ({
    key: String(c.key ?? ''),
    title: typeof c.title === 'string' ? c.title : String(c.key ?? ''),
  })), [columns])

  const { configComponent, applyConfig } = useColumnConfig('rdm-resource-load', columnMeta, [
    { key: 'userName', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const visibleColumns = applyConfig(columns) as TableColumnsType<PersonRow>

  // ── 展开行渲染 ──
  const expandedRowRender = (r: PersonRow) => {
    const items = sampleWorkItems[r.userId] ?? []
    if (items.length === 0) {
      return (
        <div style={{ padding: '12px 16px' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rdm.resLoad.emptyDetailB2')} />
        </div>
      )
    }
    const groups: Record<string, WorkItem[]> = { product: [], dev: [], test: [], coord: [] }
    items.forEach(item => { groups[item.sourceType]?.push(item) })
    const groupLabels: Record<string, { label: string; color: string; icon: string }> = {
      product: { label: t('rdm.resLoad.groupProduct'), color: '#1890FF', icon: '📋' },
      dev: { label: t('rdm.resLoad.groupDev'), color: '#E8720C', icon: '⚙️' },
      test: { label: t('rdm.resLoad.groupTest'), color: '#722ED1', icon: '🧪' },
      coord: { label: t('rdm.resLoad.groupCoord'), color: '#595959', icon: '🤝' },
    }
    return (
      <div style={{ padding: '8px 16px 12px' }}>
        {Object.entries(groups).filter(([, items]) => items.length > 0).map(([type, items]) => {
          const meta = groupLabels[type]
          return (
            <div key={type} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: meta.color, marginBottom: 6 }}>
                {meta.icon} {meta.label}（{items.length}）
              </div>
              {items.map((item, i) => (
                <div key={i} className="rdm-delivery-row">
                  <Tag color={item.isOverdue ? 'error' : item.isBlocked ? 'warning' : 'default'} style={{ margin: 0, fontSize: 11, minWidth: 56, textAlign: 'center' }}>
                    {item.status}
                  </Tag>
                  <span className="rdm-delivery-row-main">
                    <b style={{ fontWeight: 500, fontSize: 13 }}>{item.title}</b>
                    <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                      {item.sourceLabel} · {item.phase}
                      {item.planHours != null && ` · ${t('rdm.resLoad.planTag', { hours: item.planHours })}`}
                      {item.remainingHours != null && item.remainingHours !== item.planHours && ` · ${t('rdm.resLoad.remainTag', { hours: item.remainingHours })}`}
                      {item.planStart && ` · ${item.planStart} → ${item.planFinish}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // ── 分派弹窗（人员详情/待分配/主列表三个视图共用同一份）──
  const assignModalNode = (
    <Modal
      title={assignTarget ? t('rdm.resLoad.modalAssignTitle', { name: assignTarget.userName }) : t('rdm.resLoad.modalAssignTitleDefault')}
      open={assignModalOpen}
      onCancel={() => setAssignModalOpen(false)}
      onOk={handleAssignConfirm}
      okText={t('rdm.resLoad.btnPreviewConfirm')}
      cancelText={t('common.cancel')}
      width={720}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('rdm.resLoad.assignBindAlert')}
      />
      <Form form={assignForm} layout="vertical">
        {assignTarget ? (
          <div style={{
            background: '#FFF7F0', border: '1px solid #FFE7D1', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#AD4E00',
          }}>
            <div>{t('rdm.resLoad.assigneeLabel')}：<b>{assignTarget.userName}（{assignTarget.empNo}）</b> · {assignTarget.dept}</div>
            <div>{t('rdm.resLoad.assigneeLoad')}：<b>{assignTarget.loadRate}%</b>（{assignTarget.totalPlanned}h / {assignTarget.totalCapacity}h）· {t('rdm.resLoad.assigneeRemain')}：<b>{Math.max(0, assignTarget.totalCapacity - assignTarget.totalPlanned)}h</b></div>
            {assignTarget.loadStatus === 'overloaded' && (
              <div style={{ color: '#CF1322', marginTop: 4 }}>{t('rdm.resLoad.assigneeOverloadWarn')}</div>
            )}
            {assignTarget.loadStatus === 'data_incomplete' && (
              <div style={{ color: '#D46B08', marginTop: 4 }}>{t('rdm.resLoad.assigneeIncompleteWarn')}</div>
            )}
          </div>
        ) : (
          <Form.Item label={t('rdm.resLoad.assigneeLabel')} name="assignee" rules={[{ required: true, message: t('rdm.resLoad.chooseAssigneeWarn') }]}>
            <Select
              placeholder={t('rdm.resLoad.assigneePlaceholder')}
              showSearch
              optionFilterProp="label"
              options={allPeople.map(p => ({ value: p.userId, label: t('rdm.resLoad.assigneeOption', { name: p.userName, empNo: p.empNo, dept: p.dept, rate: p.loadRate }) }))}
            />
          </Form.Item>
        )}
        <div style={{ marginBottom: 12 }}>
          <div className="rdm-action-modal-label">{t('rdm.resLoad.sourceLabelSelect')}</div>
          <Segmented
            value={assignSource}
            onChange={v => { setAssignSource(v as AssignSource); setAssignSelectedId(null) }}
            options={(Object.keys(ASSIGN_SOURCE_KEY) as AssignSource[]).map(k => ({ value: k, label: srcMeta(k).label }))}
          />
        </div>
        {!unassignedLoading && unassignedBySource[assignSource].length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={srcMeta(assignSource).emptyHint}>
            <Button type="link" onClick={() => navigate(srcMeta(assignSource).emptyLink)}>
              {srcMeta(assignSource).emptyLinkText} →
            </Button>
          </Empty>
        ) : (
          <Table<AssignableItem>
            rowKey="id"
            size="small"
            loading={unassignedLoading}
            dataSource={unassignedBySource[assignSource]}
            pagination={false}
            scroll={{ y: 200 }}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: assignSelectedId ? [assignSelectedId] : [],
              onChange: keys => {
                const id = Number(keys[0])
                setAssignSelectedId(id)
                const sel = unassignedBySource[assignSource].find(i => i.id === id)
                if (sel?.planHours != null) assignForm.setFieldsValue({ planHours: sel.planHours })
              },
            }}
            columns={[
              { title: t('rdm.resLoad.colCode'), dataIndex: 'code', key: 'code', width: 150 },
              { title: t('rdm.resLoad.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true },
              { title: t('rdm.resLoad.colReqTitle'), dataIndex: 'reqTitle', key: 'reqTitle', width: 170, ellipsis: true, render: (v?: string) => v ?? '—' },
              { title: t('rdm.resLoad.colPlanHours'), dataIndex: 'planHours', key: 'planHours', width: 90, render: (v?: number | null) => v != null ? `${v}h` : <span style={{ color: '#FA8C16' }}>{t('rdm.resLoad.estimating')}</span> },
            ]}
          />
        )}
        {assignSelectedId != null && (assignSource === 'dev_task' || assignSource === 'design_task') && (
          <Alert type="info" showIcon style={{ marginTop: 16 }}
            message={t('rdm.resLoad.taskOnlyOwnerAlert')} />
        )}
        {assignSelectedId != null && assignSource === 'requirement' && (
          <Alert type="info" showIcon style={{ marginTop: 16 }}
            message={t('rdm.resLoad.reqOnlyAlert')} />
        )}
        {assignSelectedId != null && assignSource === 'test_batch' && (
          <Alert type="info" showIcon style={{ marginTop: 16 }}
            message={t('rdm.resLoad.batchOnlyAlert')} />
        )}
      </Form>
    </Modal>
  )

  // ── 子视图：待分配工作（聚合各来源无负责人/待受理的单据）──
  if (view === 'unassigned') {
    const totalAssignable = (Object.keys(unassignedBySource) as AssignSource[]).reduce((sum, k) => sum + unassignedBySource[k].length, 0)
    return (
      <div className="content-area">
        <div style={{
          position: 'relative', background: '#fff', marginBottom: 16,
          borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
            backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
          }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button type="primary" onClick={() => navigate('/rdm-resource-load')}
                style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>
                ← {t('common.back')}
              </Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('rdm.resLoad.viewTitleUnassigned')}</h2>
            </div>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('rdm.resLoad.unassignedCount', { count: totalAssignable })}</span>
          </div>
        </div>

        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={t('rdm.resLoad.unassignedAlertTitle')}
          description={t('rdm.resLoad.unassignedAlertDesc')} />
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={t('rdm.resLoad.unassignedAlertTitle2')}
          description={t('rdm.resLoad.unassignedAlertDesc2')} />

        {(Object.keys(unassignedBySource) as AssignSource[]).map(source => {
          const items = unassignedBySource[source]
          const meta = srcMeta(source)
          return (
            <div className="rdm-card" key={source}>
              <div className="rdm-card-title">
                <span className="rdm-icon-block" style={{ background: '#e6f7ff', color: '#1890ff' }}><TeamOutlined /></span>
                {meta.label}
                <Tag color="blue" style={{ marginLeft: 4 }}>{items.length}</Tag>
                <span className="rdm-card-title-split" />
              </div>
              {items.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={meta.emptyHint}>
                  <Button type="link" onClick={() => navigate(meta.emptyLink)}>{meta.emptyLinkText} →</Button>
                </Empty>
              ) : (
                <Table<AssignableItem>
                  rowKey="id"
                  size="small"
                  loading={unassignedLoading}
                  dataSource={items}
                  pagination={false}
                  columns={[
                    { title: t('rdm.resLoad.colCode'), dataIndex: 'code', key: 'code', width: 150 },
                    { title: t('rdm.resLoad.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true },
                    { title: t('rdm.resLoad.colReqTitle'), dataIndex: 'reqTitle', key: 'reqTitle', width: 180, ellipsis: true, render: (v?: string) => v ?? '—' },
                    { title: t('rdm.resLoad.colPlanHours'), dataIndex: 'planHours', key: 'planHours', width: 90, render: (v?: number | null) => v != null ? `${v}h` : <span style={{ color: '#FA8C16' }}>{t('rdm.resLoad.estimating')}</span> },
                    { title: t('rdm.resLoad.colCurrentOwner'), dataIndex: 'currentOwner', key: 'currentOwner', width: 110, render: (v?: string) => v ?? <span style={{ color: '#8C8C8C' }}>{t('rdm.resLoad.ownerUnassigned')}</span> },
                    {
                      title: t('common.colAction'), key: 'action', width: 80, fixed: 'right',
                      render: (_, r) => <Button type="link" size="small" onClick={() => handleAssign(null, source, r.id)}>{t('rdm.resLoad.btnAssign')}</Button>,
                    },
                  ]}
                />
              )}
            </div>
          )
        })}

        {assignModalNode}
      </div>
    )
  }

  // ── 子视图：名册维护（B-2）──
  if (view === 'roster') {
    const renderRoles = (codes?: string | null) => {
      if (!codes) return <span style={{ color: '#8C8C8C' }}>{t('rdm.resLoad.roleUnset')}</span>
      try {
        const arr = JSON.parse(codes) as string[]
        return arr.length
          ? arr.map(r => <Tag key={r} style={{ margin: '0 4px 0 0' }}>{t(ROLE_KEY[r as RoleCode] ?? r)}</Tag>)
          : <span style={{ color: '#8C8C8C' }}>{t('rdm.resLoad.roleUnset')}</span>
      } catch { return codes }
    }
    return (
      <div className="content-area">
        <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button type="primary" onClick={() => navigate('/rdm-resource-load')} style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>← {t('common.back')}</Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('rdm.resLoad.rosterTitle')}</h2>
            </div>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('rdm.resLoad.rosterCount', { count: members.filter(m => m.status === 1).length })}</span>
          </div>
        </div>

        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={t('rdm.resLoad.rosterAlertTitle')}
          description={t('rdm.resLoad.rosterAlertDesc')} />

        <div className="action-section">
          <div className="action-section-left">
            <Button icon={<ReloadOutlined />} onClick={loadMembers}>{t('rdm.resLoad.btnRefresh')}</Button>
          </div>
          <div className="action-section-right">
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => openMemberModal()}>{t('rdm.resLoad.btnAddMember')}</Button>
          </div>
        </div>

        <Table<RdmResourceMember>
          className="nowrap-table"
          rowKey="id"
          size="small"
          loading={membersLoading}
          dataSource={members}
          scroll={{ x: 1000 }}
          columns={[
            { title: t('rdm.resLoad.colName'), dataIndex: 'userName', key: 'userName', width: 120, render: (v?: string | null) => v ?? '-' },
            { title: t('rdm.resLoad.colEmpNo'), dataIndex: 'empNo', key: 'empNo', width: 110, render: (v?: string | null) => v ?? '-' },
            { title: t('rdm.resLoad.colDept'), dataIndex: 'dept', key: 'dept', width: 160, ellipsis: true, render: (v?: string | null) => v ?? '-' },
            { title: t('rdm.resLoad.colRoles'), dataIndex: 'roleCodes', key: 'roleCodes', width: 180, render: renderRoles },
            { title: t('rdm.resLoad.colWeeklyCapacity'), dataIndex: 'weeklyCapacityHours', key: 'weeklyCapacityHours', width: 120, render: (v?: number | null) => v ? `${v}h` : <span style={{ color: '#8C8C8C' }}>{t('rdm.resLoad.capacityFallback')}</span> },
            { title: t('rdm.resLoad.colStatus'), dataIndex: 'status', key: 'status', width: 90, render: (v?: number) => v === 1 ? <Tag color="success" style={{ margin: 0 }}>{t('rdm.resLoad.statusActive')}</Tag> : <Tag style={{ margin: 0 }}>{t('rdm.resLoad.statusRemoved')}</Tag> },
            { title: t('rdm.resLoad.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v?: string | null) => v ?? '-' },
            {
              title: t('common.colAction'), key: 'action', width: 130, fixed: 'right',
              render: (_, r) => (
                <Space size={0} split={<span className="action-split">|</span>}>
                  <Button type="link" size="small" onClick={() => openMemberModal(r)}>{t('common.edit')}</Button>
                  {r.status === 1 && <Button type="link" size="small" danger onClick={() => handleMemberRemove(r)}>{t('rdm.resLoad.btnRemove')}</Button>}
                </Space>
              ),
            },
          ]}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total: number) => t('rdm.resLoad.pagerRows', { total }) }}
          locale={rdmTableLocale(loading, t('rdm.resLoad.rosterEmpty'))}
        />

        {/* 纳入/编辑弹窗（轻量配置面板：选人+岗位+容量+备注） */}
        <Modal
          title={memberEditing ? t('rdm.resLoad.modalMemberEdit') : t('rdm.resLoad.modalMemberAdd')}
          open={memberModalOpen}
          onOk={handleMemberSave}
          onCancel={() => setMemberModalOpen(false)}
          okText={t('rdm.iteration.confirmOk')}
          cancelText={t('common.cancel')}
          width={520}
        >
          <Form form={memberForm} layout="vertical">
            <Form.Item label={t('rdm.resLoad.formEmployee')} name="userIds" rules={[{ required: true, message: t('rdm.resLoad.needEmployeeWarn') }]}>
              <EmployeeSelect single placeholder={t('rdm.resLoad.employeePlaceholder')} disabled={!!memberEditing} onPick={items => setMemberPickedName(items[0]?.name ?? '')} />
            </Form.Item>
            <Form.Item label={t('rdm.resLoad.colRoles')} name="roleCodes" extra={t('rdm.resLoad.formRolesExtra')}>
              <Select mode="multiple" placeholder={t('rdm.resLoad.rolePlaceholder')} options={ROLE_OPTIONS(t)} allowClear />
            </Form.Item>
            <Form.Item label={t('rdm.resLoad.formCapacity')} name="weeklyCapacityHours" extra={t('rdm.resLoad.formCapacityExtra')}>
              <InputNumber min={0} max={80} step={0.5} style={{ width: '100%' }} placeholder={t('rdm.resLoad.capacityPlaceholder')} />
            </Form.Item>
            <Form.Item label={t('rdm.resLoad.colRemark')} name="remark">
              <Input.TextArea rows={2} maxLength={200} showCount placeholder={t('rdm.resLoad.remarkPlaceholder')} style={{ resize: 'none' }} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  // ── 子视图：人员详情 ──
  if (view === 'person' && personId) {
    const person = allPeople.find(p => p.userId === personId)
    if (!person) {
      return (
        <div className="content-area">
          <Alert type="error" showIcon message={t('rdm.resLoad.personNotFound')} description={t('rdm.resLoad.personNotFoundDesc')} />
          <Button style={{ marginTop: 16 }} onClick={() => navigate('/rdm-resource-load')}>{t('rdm.resLoad.btnBackToLoad')}</Button>
        </div>
      )
    }
    const items = sampleWorkItems[person.userId] ?? []
    return (
      <div className="content-area">
        {/* 页面头部 */}
        <div style={{
          position: 'relative', background: '#fff', marginBottom: 16,
          borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
            backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
          }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button
                type="primary"
                onClick={() => navigate('/rdm-resource-load')}
                style={{
                  backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                  height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                }}
              >← {t('common.back')}</Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {t('rdm.resLoad.personDetailTitle', { name: person.userName })}
              </h2>
            </div>
            <Button type="primary" onClick={() => handleAssign(person)} style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }}>
              {t('rdm.resLoad.btnAssignWork')}
            </Button>
          </div>
        </div>

        {/* 基本信息卡 */}
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#e6f7ff', color: '#1890ff' }}><TeamOutlined /></span>
            {t('rdm.resLoad.basicInfo')}
            <span className="rdm-card-title-split" />
            <Tag color={LOAD_STATUS_COLOR[person.loadStatus]} style={{ margin: 0 }}>{t(LOAD_STATUS_KEY[person.loadStatus])}</Tag>
          </div>
          <div className="rdm-meta-grid">
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaEmpNo')}</div><div className="rdm-meta-item-value">{person.empNo}</div></div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaDept')}</div><div className="rdm-meta-item-value">{person.dept}</div></div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaRoles')}</div><div className="rdm-meta-item-value">{person.roles.map(r => t(ROLE_KEY[r])).join(' / ')}</div></div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaLoadRate')}</div>
              <div className="rdm-meta-item-value" style={{ color: loadRateColor(person.loadRate) }}>{person.loadRate}%</div>
            </div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaCapacityHours')}</div><div className="rdm-meta-item-value">{person.totalCapacity} h</div></div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaPlanHours')}</div><div className="rdm-meta-item-value" style={{ color: person.totalPlanned > person.totalCapacity ? '#CF1322' : undefined }}>{person.totalPlanned} h</div></div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaActualHours')}</div><div className="rdm-meta-item-value">{person.totalActual} h</div></div>
            <div><div className="rdm-meta-item-label">{t('rdm.resLoad.metaRemain')}</div>
              <div className="rdm-meta-item-value" style={{ color: person.totalCapacity - person.totalPlanned > 0 ? '#52C41A' : '#CF1322' }}>
                {Math.max(0, person.totalCapacity - person.totalPlanned)} h
              </div>
            </div>
          </div>
        </div>

        {/* 逐日热力图 */}
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#fff7e6', color: '#fa8c16' }}><ClockCircleOutlined /></span>
            {t('rdm.resLoad.heatmapTitle', { from: range[0].format('MM/DD'), to: range[1].format('MM/DD') })}
            <span className="rdm-card-title-split" />
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('rdm.resLoad.heatmapLegend')}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {person.days.map(d => (
              <Tooltip key={d.day} title={
                d.weekend ? t('rdm.resLoad.tipWeekend', { day: d.day }) :
                d.leave ? t('rdm.resLoad.tipLeave', { day: d.day }) :
                t('rdm.resLoad.tipCapacityRemain', { day: d.day, capacity: d.capacity, planned: d.planned, remain: Math.max(0, d.capacity - d.planned).toFixed(1) }) + (d.overloaded ? t('rdm.resLoad.tipOverSuffix') : '')
              }>
                <div style={{
                  width: 40, height: 40, borderRadius: 6, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', cursor: 'default',
                  background: d.weekend || d.leave ? '#F5F5F5'
                    : d.overloaded ? '#FFF1F0'
                    : d.planned / Math.max(d.capacity, 1) > 0.85 ? '#FFF7E6'
                    : d.planned > 0 ? '#F6FFED' : '#fff',
                  border: `1px solid ${d.overloaded ? '#FFCCC7' : d.planned / Math.max(d.capacity, 1) > 0.85 ? '#FFE7D1' : d.planned > 0 ? '#B7EB8F' : '#F0F0F0'}`,
                }}>
                  <span style={{ fontSize: 10, color: '#8C8C8C' }}>{d.day}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: d.overloaded ? '#CF1322' : d.planned > 0 ? '#389E0D' : '#D9D9D9' }}>
                    {d.weekend || d.leave ? '—' : `${Math.max(0, d.capacity - d.planned).toFixed(0)}h`}
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* 工作明细 */}
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#f9f0ff', color: '#722ed1' }}><AlertOutlined /></span>
            {t('rdm.resLoad.workDetail', { count: items.length })}
            <span className="rdm-card-title-split" />
          </div>
          {items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rdm.resLoad.detailEmpty')} />
          ) : (
            items.map((item, i) => (
              <div key={i} className="rdm-delivery-row">
                <Tag color={item.isOverdue ? 'error' : item.isBlocked ? 'warning' : 'default'} style={{ margin: 0, minWidth: 56, textAlign: 'center', fontSize: 11 }}>
                  {item.status}
                </Tag>
                <span className="rdm-delivery-row-main">
                  <b style={{ fontWeight: 500, fontSize: 13 }}>{item.title}</b>
                  <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                    {item.sourceLabel} · {item.phase}
                    {item.planHours != null && ` · ${t('rdm.resLoad.planTag', { hours: item.planHours })}`}
                    {item.remainingHours != null && item.remainingHours !== item.planHours && ` · ${t('rdm.resLoad.remainTag', { hours: item.remainingHours })}`}
                    {item.planStart && ` · ${item.planStart} → ${item.planFinish}`}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        {assignModalNode}
      </div>
    )
  }

  // ── 主列表视图 ──
  return (
    <div className="content-area">
      {/* 负载为真实数据（/rdm/resource/workload）；待分配与分派写回（任务/需求/批次）已接入 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={t('rdm.resLoad.mainAlertTitle')}
        description={t('rdm.resLoad.mainAlertDesc')}
      />
      {workload?.selfOnly && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('rdm.resLoad.selfOnlyAlertTitle')}
          description={t('rdm.resLoad.selfOnlyAlertDesc')}
        />
      )}

      {/* 搜索区（§E.1：4列 grid） */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('rdm.resLoad.filterDate')}>
            <RangePicker
              value={range}
              onChange={v => v && v[0] && v[1] && setRange([v[0], v[1]])}
              allowClear={false}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('rdm.resLoad.metaDept')}>
            <Select
              allowClear
              placeholder={t('rdm.resLoad.allDeptPlaceholder')}
              value={deptFilter}
              onChange={setDeptFilter}
              options={deptOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('rdm.resLoad.metaRoles')}>
            <Select
              allowClear
              placeholder={t('rdm.resLoad.allRolePlaceholder')}
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_OPTIONS(t)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('rdm.resLoad.loadStatusLabel')}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS(t)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('rdm.resLoad.searchLabel')}>
            <Input
              placeholder={t('rdm.resLoad.searchPlaceholder')}
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片（§E.8：必须在搜索区下方） */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={`${range[0].format('YYYYMMDD')}-${range[1].format('YYYYMMDD')}-${roleFilter ?? ''}-${statusFilter}-${deptFilter ?? ''}`}
          columns={4}
          items={[
            { key: 'total', icon: <TeamOutlined />, value: stats.total, label: t('rdm.resLoad.statTotal'), color: 'info' },
            { key: 'available', icon: <CheckCircleOutlined />, value: stats.available, label: t('rdm.resLoad.statAvailable'), color: 'success' },
            { key: 'overloaded', icon: <AlertOutlined />, value: stats.overloaded, label: t('rdm.resLoad.statOverloaded'), color: stats.overloaded > 0 ? 'danger' : 'success' },
            { key: 'incomplete', icon: <ExclamationCircleOutlined />, value: stats.incomplete, label: t('rdm.resLoad.statIncomplete'), color: stats.incomplete > 0 ? 'brand' : 'success' },
          ]}
        />
      </div>

      {/* 操作区（§E.2） */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<DownloadOutlined />}>{t('rdm.resLoad.btnExport')}</Button>
          <Button onClick={() => navigate('/rdm-resource-load?view=unassigned')}>{t('rdm.resLoad.viewTitleUnassigned')}</Button>
          <Button icon={<ReloadOutlined />}>{t('rdm.resLoad.btnRefresh')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => navigate('/rdm-resource-load?view=roster')}>
            {t('rdm.resLoad.rosterTitle')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 人员负载表 */}
      <Table<PersonRow>
        className="nowrap-table"
        rowKey="userId"
        size="small"
        loading={loading}
        columns={visibleColumns}
        dataSource={filtered}
        scroll={{ x: 1400 }}
        expandable={{
          expandedRowKeys: expandedUserId ? [expandedUserId] : [],
          showExpandColumn: false,
          expandedRowRender,
        }}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total: number) => t('rdm.resLoad.pagerPeople', { total }),
        }}
        locale={rdmTableLocale(loading, t('rdm.resLoad.tableEmpty'))}
      />

      {/* 分派工作弹窗（三视图共用同一份） */}
      {assignModalNode}
    </div>
  )
}
