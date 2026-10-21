/**
 * 需求详情 —— 全角色协同主视图
 *
 * 信息架构（对齐云效「正文优先、属性侧置、按需展开」，但保留本系统全部业务闸门）：
 * 1. 头部即需求标题本身，不再用通用的「需求詳情」占掉第一屏；
 * 2. 处理条一屏回答「现在轮到谁、我该做什么」，主动作只有一个，其余收进「更多操作」；
 * 3. 左侧正文（现状/期望/定位/附件）优先，右侧属性栏只放决策要用的字段，同一信息不再多处重复；
 * 4. 交付过程、发布放行、验收追溯、审批与变更按「一级页签」分区，页签内不再套页签；
 * 5. 动作仍由服务端 allowedActions 驱动（空数组=无权，绝不回退本地推导），
 *    必填字段、二次确认、发布四眼、基线冻结等业务约束一律不因界面简化而放宽。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AutoComplete,
  Button,
  DatePicker,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Rate,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AimOutlined,
  AuditOutlined,
  BellOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RightOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import DetailPageHeader from '../../components/DetailPageHeader'
import HelpPopover from '../../components/HelpPopover'
import RemarkTextArea from '../../components/RemarkTextArea'
import { buildRdmDetailPath, resolveRdmDetailBackPath } from '../../constants/menuDataSource'
import { useAuth } from '../../contexts/AuthContext'
import RequirementStageBar from './components/RequirementStageBar'
import AcceptanceTraceCard from './components/AcceptanceTraceCard'
import ReleasePanel from './components/ReleasePanel'
import { ChangeSection, DeliverySummaryBar, PlanSection, TaskSection } from './components/RequirementSections'
import { ComplexityTag, PriorityTag, StatusTag, TypeTag } from './components/Tags'
import { fetchVersionHistory } from '../../api/versionHistory'
import { fetchDocNodes, DOC_STATUS_COLOR, type DocNode, type DocStatus } from '../../api/docCenter'
import {
  RDM_INTAKE_MODE_LABEL,
  addComment,
  addStructureChild,
  changeRequirementIteration,
  copyRequirement,
  fetchDeliveryItems,
  fetchDeliverySummary,
  fetchIterations,
  fetchProductOptions,
  fetchProjectPage,
  fetchRequirementAncestors,
  fetchRequirementDetail,
  fetchRequirementPage,
  fetchRequirementTree,
  fetchTransitions,
  removeStructureChild,
  transitionRequirement,
  urgeRequirement,
  type RdmDeliveryItemListItem,
  type RdmDeliverySummary,
  type RdmIterationItem,
  type RdmProductOption,
  type RdmProjectListItem,
  type RdmRequirementDetail,
  type RdmStructureTreeNode,
  type RdmTransitionRow,
} from '../../api/rdm'
import {
  RDM_ACTION,
  RDM_ACTION_LABEL,
  RDM_ACTION_OPTIONAL_FIELDS,
  RDM_ACTION_REQUIRED_FIELDS,
  RDM_ACTION_TONE,
  RDM_ANCHOR_LABEL,
  RDM_DELIVERY_ITEM_STATUS_COLOR,
  RDM_DELIVERY_ITEM_STATUS_LABEL,
  RDM_ITERATION_STATUS,
  RDM_ACCEPT_RESULT_LABEL,
  RDM_ACCEPTANCE_OPEN_STATUS,
  RDM_PROJECT_STATUS,
  RDM_REQUIREMENT_KIND,
  RDM_REQUIREMENT_KIND_LABEL,
  RDM_ROLE_LABEL,
  RDM_SOURCE_CHANNEL_LABEL,
  RDM_STATUS,
  RDM_STATUS_LABEL,
  RDM_STAGE_LABEL,
  RDM_TERMINAL_STATUS,
  RDM_TEST_BATCH_STATUS_LABEL,
  formatRdmReqNo,
  RDM_STATUS_STAGE,
  type RdmAcceptResult,
  type RdmAction,
  type RdmActionField,
  type RdmActionTone,
  type RdmRoleCode,
  type RdmSourceChannel,
  type RdmStage,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/**
 * 沟通评论长度上限。
 * 库表 rdm_comment.content 是 TEXT，不设业务上限；这里限 500 与 RDM 域其它长文本
 * （迭代说明、延期原因）保持同一口径，只为防止把整篇文档粘进评论框。
 */
const COMMENT_MAX_LENGTH = 500

/**
 * 可选上线版本：来自 sys_version_history（之前硬编码三个号，
 * 真实版本对不上时会让人无法关联，而放行单的版本字段又要求匹配）。
 * 用 AutoComplete 而不是 Select：版本可能刚建还没进列表，不能把人锁在下拉里。
 */
const VERSION_FALLBACK_HINT = '無發布版本記錄，可直接輸入版本號（與放行單里的版本一致才能上線）'

/**
 * 少数动作需要额外说明后果（其余只看「執行後」状态就够）。
 * <p>只写能从流转配置确定的事实，不写「計不計失敗」这类系统未定义的判断。
 */
const ACTION_EFFECT_HINT: Partial<Record<RdmAction, string>> = {
  [RDM_ACTION.SUBMIT]: '進入準入審批，由審批人決定是否受理',
  [RDM_ACTION.SUBMIT_POOL]: '跳過準入審批，需求直接進入需求池等待分配產品經理',
  [RDM_ACTION.ACCEPT]: '已受理；若已存在 PRD / 評審記錄，狀態會自動對齊到事實位置',
}

/** 审批节点状态文案 */
const APPROVAL_STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: '待審批', color: 'processing' },
  approved: { text: '已通過', color: 'success' },
  rejected: { text: '已駁回', color: 'error' },
}

/**
 * 主动作优先序：同一状态下服务端可能同时给多个动作，但「下一步」只能有一个。
 * 排序按业务动线（推进 > 受理 > 计划 > 交付 > 验收 > 收尾），驳回/挂起/阻塞等
 * 逆向动作永远不抢主位——它们是该走「更多操作」的判断，不是默认路径。
 */
const PRIMARY_ACTION_ORDER: RdmAction[] = [
  RDM_ACTION.SUBMIT, RDM_ACTION.RESUBMIT, RDM_ACTION.SUBMIT_POOL,
  RDM_ACTION.APPROVE_INTAKE,
  RDM_ACTION.DISPATCH, RDM_ACTION.ACCEPT, RDM_ACTION.START_EVALUATE, RDM_ACTION.UNHOLD,
  RDM_ACTION.PRD_START, RDM_ACTION.REVIEW_START, RDM_ACTION.REVIEW_PASS, RDM_ACTION.SCHEDULE,
  RDM_ACTION.DESIGN_START, RDM_ACTION.DESIGN_DONE,
  RDM_ACTION.DEV_START, RDM_ACTION.DEV_DONE, RDM_ACTION.TEST_START, RDM_ACTION.TEST_DONE, RDM_ACTION.SUBMIT_UAT,
  RDM_ACTION.UAT_PASS, RDM_ACTION.RELEASE, RDM_ACTION.VERIFY, RDM_ACTION.CLOSE,
]

/** 主动作对应的「现在轮到你做什么」，只写动作名等于没提示 */
const ACTION_HINT: Partial<Record<RdmAction, string>> = {
  [RDM_ACTION.SUBMIT]: '需求仍是草稿，補充內容後提交才會開始流轉',
  [RDM_ACTION.RESUBMIT]: '準入審批被駁回，按理由修改後重新提交（會發起新一輪審批）',
  [RDM_ACTION.SUBMIT_POOL]: '免審直送：確認內容無誤後提交即進入需求池等待分配',
  [RDM_ACTION.APPROVE_INTAKE]: '你是當前審批人：確認必要性、範圍與是否重複後裁決',
  [RDM_ACTION.DISPATCH]: '需求在池中等待指派：按負責域與剩餘容量選產品經理',
  [RDM_ACTION.REASSIGN]: '需換人受理：改派原因必填，舊受理人保留已做的貢獻',
  [RDM_ACTION.START_EVALUATE]: '請評估技術可行性、範圍與工時，再決定受理或駁回',
  [RDM_ACTION.ACCEPT]: '受理需給出承諾出 PRD 的日期，這是後續逾期判定的基準',
  [RDM_ACTION.UNHOLD]: '需求被掛起：確認是否仍需推進，恢復後重新計時效',
  [RDM_ACTION.PRD_START]: '請編寫 PRD，驗收標準會直接成為業務驗收檢查項',
  [RDM_ACTION.REVIEW_START]: 'PRD 就緒後發起評審，讓研發/測試確認方案與可測性',
  [RDM_ACTION.REVIEW_PASS]: '請給出評審結論：通過後才能凍結節點基線',
  [RDM_ACTION.SCHEDULE]: '請排定計劃上線日期，需求才會進入研發階段',
  [RDM_ACTION.DESIGN_START]: '請啟動 UI 設計並指派負責人',
  [RDM_ACTION.DESIGN_DONE]: '設計產出已完成，確認後進入開發',
  [RDM_ACTION.DEV_START]: '請拆解任務並啟動開發',
  [RDM_ACTION.DEV_DONE]: '開發完成後推進到聯調/測試，任務需帶交付說明',
  [RDM_ACTION.TEST_START]: '請啟動測試並明確用例範圍',
  [RDM_ACTION.TEST_DONE]: '測試完成後轉業務驗收，由業務方逐項確認',
  [RDM_ACTION.SUBMIT_UAT]: '請提交上線前預驗收，業務方需逐條給出檢查項結論',
  [RDM_ACTION.UAT_PASS]: '預驗收已通過，確認後進入發布放行',
  [RDM_ACTION.RELEASE]: '需有他人裁決且未過期的放行單才能確認上線',
  [RDM_ACTION.VERIFY]: '上線後請由業務驗收人給出 1-5 分滿意度',
  [RDM_ACTION.CLOSE]: '交付已確認，歸檔後不可再流轉',
  [RDM_ACTION.REOPEN]: '歸檔需求需重新打開才能繼續推進',
}

/** 无动作时按状态解释「球在谁手上」，避免用户以为页面坏了 */
const STATUS_WAIT_HINT: Partial<Record<RdmStatus, string>> = {
  [RDM_STATUS.DRAFT]: '草稿只有自己能看到，提交後才會進入審批或需求池',
  [RDM_STATUS.INTAKE_PENDING]: '準入審批中，等待當前審批人裁決',
  [RDM_STATUS.INTAKE_REJECTED]: '準入審批被駁回，需提出人修改後重新提交',
  [RDM_STATUS.POOL]: '需求在池中等待技術負責人分配產品經理',
  [RDM_STATUS.ASSIGNED]: '已分配，等待產品經理受理',
  [RDM_STATUS.EVALUATING]: '產品經理評估中，結論出來後會通知你',
  [RDM_STATUS.REJECTED]: '產品駁回了需求，可查看理由後決定是否重開',
  [RDM_STATUS.ON_HOLD]: '需求被掛起暫緩，等待確認是否繼續推進',
  [RDM_STATUS.ACCEPTED]: '已受理，等待產品經理編寫 PRD',
  [RDM_STATUS.PRD_DESIGNING]: 'PRD 編寫中',
  [RDM_STATUS.REVIEWING]: '評審中，等待評審人給出結論',
  [RDM_STATUS.REVIEW_PASSED]: '評審通過，等待排期與凍結基線',
  [RDM_STATUS.SCHEDULED]: '已排期，等待設計/開發啟動',
  [RDM_STATUS.DESIGNING]: 'UI 設計中',
  [RDM_STATUS.DEVELOPING]: '研發進行中，進度與工時由任務上報彙總',
  [RDM_STATUS.INTEGRATION]: '聯調中',
  [RDM_STATUS.TESTING]: '測試中',
  [RDM_STATUS.TEST_PASSED]: '測試通過，等待轉業務驗收',
  [RDM_STATUS.UAT_PENDING]: '等待業務驗收人逐項確認檢查項',
  [RDM_STATUS.UAT_REJECTED]: '驗收未通過，已退回研發返工',
  [RDM_STATUS.RELEASED]: '已上線，等待上線後的業務驗收打分',
  [RDM_STATUS.VERIFIED]: '交付已確認，等待歸檔',
  [RDM_STATUS.CLOSED]: '需求已歸檔，如需繼續請由管理員重新打開',
}

/** 详情页一级页签 key（同时作为 URL ?tab= 的取值，深链与后退都对得上） */
type DetailTab = 'activity' | 'task' | 'plan' | 'gate' | 'records'

const TAB_KEYS: DetailTab[] = ['activity', 'task', 'plan', 'gate', 'records']

/**
 * 可调整迭代的状态白名单（与后端 RdmConstants.IN_PROGRESS_STATUS 同源：pool→uat_rejected）。
 * <p>已上线/验收/关闭的需求要先 reopen 才能换迭代；服务端会再校验一次，这里只决定按钮显隐。
 */
const ITERATION_ADJUSTABLE_STATUS: RdmStatus[] = [
  RDM_STATUS.POOL, RDM_STATUS.ASSIGNED, RDM_STATUS.EVALUATING, RDM_STATUS.ON_HOLD,
  RDM_STATUS.ACCEPTED, RDM_STATUS.PRD_DESIGNING, RDM_STATUS.REVIEWING, RDM_STATUS.REVIEW_PASSED,
  RDM_STATUS.SCHEDULED, RDM_STATUS.DESIGNING, RDM_STATUS.DEVELOPING, RDM_STATUS.INTEGRATION,
  RDM_STATUS.TESTING, RDM_STATUS.TEST_PASSED, RDM_STATUS.UAT_PENDING, RDM_STATUS.UAT_REJECTED,
]

/** 可挂迭代的项目状态（与 IterationForm/RequirementSubmit 同口径：排除已关闭与全部交付） */
const USABLE_PROJECT_STATUS: string[] = [
  RDM_PROJECT_STATUS.PREPARING,
  RDM_PROJECT_STATUS.IN_PROGRESS,
  RDM_PROJECT_STATUS.PARTIAL_DELIVERED,
]

/** 受理前的状态（可存在“受理前就写了 PRD”的历史越级数据，用于风险提示） */
const PRE_ACCEPT_STATUSES: string[] = [
  RDM_STATUS.ASSIGNED,
  RDM_STATUS.EVALUATING,
  RDM_STATUS.ON_HOLD,
]

/** 活动流条目：评论与流转记录合并成一条时间线，但数据源与审计记录不变 */
type ActivityItem =
  | { kind: 'comment'; id: string; time: string; author: string; role?: string | null; content: string; internal?: boolean }
  | { kind: 'transition'; id: string; time: string; author: string; role?: string | null; content: string; status: string; overdue?: boolean; durationHours?: number | null }

export default function RequirementDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const id = Number(searchParams.get('id') ?? 0)
  const tabParam = searchParams.get('tab') as DetailTab | null
  const activeTab: DetailTab = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'activity'

  /**
   * 站内再跳详情（子需求 / 主需求 / 结构祖先）时把来源菜单带过去：
   * <p>详情是提需求/認領分配/需求跟進清單三张列表共用的落地页，侧栏高亮跟随 from（见
   * menuDataSource.resolveRdmDetailMenuKey）；丢了 from 就会在用户没换菜单的情况下跳高亮。
   */
  const goDetail = (reqId: number) => navigate(buildRdmDetailPath({ id: reqId, from: searchParams.get('from') }))
  /** 正文加载失败时的返回落点：跟随进入来源，无来源才回需求跟进清单 */
  const backListPath = resolveRdmDetailBackPath(searchParams.toString())

  const [detail, setDetail] = useState<RdmRequirementDetail | null>(null)
  /** 正文取数状态：失败要能说清为什么，不能伪装成「一直在载入」 */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transitions, setTransitions] = useState<RdmTransitionRow[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  const [summary, setSummary] = useState<RdmDeliverySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [iterationCode, setIterationCode] = useState<string>()
  /** 归属体系改造：动作弹窗里的所属项目（dispatch/accept 选填，schedule 必填） */
  const [actionProjectId, setActionProjectId] = useState<number | undefined>()
  const [projectOptions, setProjectOptions] = useState<RdmProjectListItem[]>([])
  /** 调整迭代弹窗（独立于流转动作：属性变更不走状态机） */
  const [iterModalOpen, setIterModalOpen] = useState(false)
  const [iterModalProjectId, setIterModalProjectId] = useState<number | undefined>()
  const [iterModalCode, setIterModalCode] = useState<string | undefined>()
  const [iterModalRemark, setIterModalRemark] = useState('')
  const [iterModalSaving, setIterModalSaving] = useState(false)
  const [activeAction, setActiveAction] = useState<RdmAction | null>(null)
  const [remark, setRemark] = useState('')
  const [planDate, setPlanDate] = useState<dayjs.Dayjs | null>(null)
  const [promisedDate, setPromisedDate] = useState<dayjs.Dayjs | null>(null)
  const [holdUntil, setHoldUntil] = useState<dayjs.Dayjs | null>(null)
  const [versionNo, setVersionNo] = useState<string>()
  /** 满意度不预置 5 分：预置后「必填满意度」校验永远提前满足，等于代理业务方打分 */
  const [score, setScore] = useState<number | undefined>()
  const [pmUserId, setPmUserId] = useState<number>()
  /** 可关联的上线版本（来自 sys_version_history） */
  const [versionOptions, setVersionOptions] = useState<{ value: string; label: string }[]>([])
  const [comment, setComment] = useState('')
  const [activityFilter, setActivityFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [showAllProps, setShowAllProps] = useState(false)
  /** 文檔中心掛接了本需求的關聯文檔；無 doc-library 權限(403)或無文檔時靜默隱藏卡片 */
  const [reqDocs, setReqDocs] = useState<DocNode[]>([])
  /** V3：交付項清單（flowVersion=3 時拉取） */
  const [deliveryItems, setDeliveryItems] = useState<RdmDeliveryItemListItem[]>([])
  const [deliveryItemsLoading, setDeliveryItemsLoading] = useState(false)
  /** V3：聚合需求的結構子樹 */
  const [structureTree, setStructureTree] = useState<RdmStructureTreeNode[]>([])
  const [structureLoading, setStructureLoading] = useState(false)
  /** V3：執行需求的結構祖先鏈（麵包屑） */
  const [ancestors, setAncestors] = useState<RdmStructureTreeNode[]>([])
  /** V3：添加子需求弹窗 */
  const [childModalOpen, setChildModalOpen] = useState(false)
  const [childCandidates, setChildCandidates] = useState<{ value: number; label: string }[]>([])
  const [childCandidatesLoading, setChildCandidatesLoading] = useState(false)
  const [childSelected, setChildSelected] = useState<number | undefined>()
  const [childSubmitting, setChildSubmitting] = useState(false)

  useEffect(() => {
    if (!id) { setReqDocs([]); return }
    // 關聯文檔錨 doc-library:view：無該授權時直接不發請求（後端必然 403），
    // 否則每打開一次需求詳情都會被全局攔截器彈一次無權限 toast。
    if (!hasPermission('doc-library:view')) { setReqDocs([]); return }
    // 兜底 silent：權限剛被回收/前端權限快照過期時仍 403，也只靜默隱藏卡片。
    fetchDocNodes({ bizType: 'REQ', bizId: id }, { silent: true })
      .then(setReqDocs)
      .catch(() => setReqDocs([]))
  }, [id, hasPermission])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    /*
     * 辅助候选不能再排在正文前面：原先先 await 四个辅助接口再取正文，
     * 形成「max(辅助) + 正文」的串行瀑布；远程库上 product-managers 与 iterations
     * 各有几十次 SQL 往返，详情页因此白屏数秒。
     * 现在：正文单独取并直接决定首屏；流转表只是降级备胎，fire-and-forget；
     * PM/迭代/版本三份下拉改成点开动作弹窗时才拉（见 ensureActionOptions）。
     */
    void fetchTransitions().then(setTransitions).catch(() => {
      // 拉不到只是少一个降级备胎（正常路径由服务端 allowedActions 驱动），不挡正文也不提示
    })
    try {
      const data = await fetchRequirementDetail(id)
      setDetail(data)
      if (!data) setError('需求不存在或已被刪除')
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '需求載入失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  /** 交付摘要独立取：与正文并行，保证页签计数与任务联动后的进度一致 */
  const loadSummary = useCallback(async () => {
    if (!id) return
    setSummaryLoading(true)
    try {
      setSummary(await fetchDeliverySummary(id))
    } catch {
      // 交付摘要失败不影响需求主体展示，页签计数留空即可（不假造成 0 个任务）
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])
  /*
   * 交付摘要只在进入页面（或切换需求）时拉一次。
   * 旧写法依赖里带了 detail?.status：首帧 detail 还没到时先打一次，正文到达后
   * 状态从 undefined 变成真值又打一次，同一个最重的聚合接口白打两遍。
   * 状态真的流转时，执行动作的地方已经显式 loadSummary()（见流转弹窗与评审结论）。
   */
  useEffect(() => { void loadSummary() }, [loadSummary])

  /** V3：拉取交付項清單（只在 flowVersion=3 且有需求 ID 時） */
  useEffect(() => {
    if (!id || detail?.flowVersion !== 3) { setDeliveryItems([]); return }
    setDeliveryItemsLoading(true)
    fetchDeliveryItems({ reqId: id, pageNo: 1, pageSize: 100 })
      .then(res => setDeliveryItems(res.records ?? []))
      .catch(() => setDeliveryItems([]))
      .finally(() => setDeliveryItemsLoading(false))
  }, [id, detail?.flowVersion])

  /** V3：聚合需求拉結構子樹 */
  const loadStructureTree = useCallback(async () => {
    if (!id || detail?.requirementKind !== RDM_REQUIREMENT_KIND.AGGREGATE) { setStructureTree([]); return }
    setStructureLoading(true)
    try {
      setStructureTree(await fetchRequirementTree(id))
    } catch {
      setStructureTree([])
    } finally {
      setStructureLoading(false)
    }
  }, [id, detail?.requirementKind])

  useEffect(() => { void loadStructureTree() }, [loadStructureTree])

  /** V3：執行需求拉結構祖先鏈（麵包屑） */
  useEffect(() => {
    if (!id || !detail?.structureParentReqId) { setAncestors([]); return }
    let cancelled = false
    fetchRequirementAncestors(id)
      .then(res => { if (!cancelled) setAncestors(res ?? []) })
      .catch(() => { if (!cancelled) setAncestors([]) })
    return () => { cancelled = true }
  }, [id, detail?.structureParentReqId])

  /** V3：打开「添加子需求」弹窗，拉同项目下可选的执行需求（排除已挂子节点） */
  const openChildModal = () => {
    setChildSelected(undefined)
    setChildModalOpen(true)
    setChildCandidatesLoading(true)
    const existingIds = new Set<number>()
    const collect = (nodes: RdmStructureTreeNode[]) => nodes.forEach(n => { existingIds.add(n.reqId); collect(n.children ?? []) })
    collect(structureTree)
    fetchRequirementPage({
      page: 1, size: 200,
      projectId: detail?.projectId ?? undefined,
      requirementKind: RDM_REQUIREMENT_KIND.EXECUTION,
    })
      .then(res => {
        const rows = (res.records ?? []).filter(r =>
          r.id !== id && !existingIds.has(r.id) &&
          (!r.requirementKind || r.requirementKind === RDM_REQUIREMENT_KIND.EXECUTION))
        setChildCandidates(rows.map(r => ({ value: r.id, label: `${formatRdmReqNo(r.reqNo)} · ${r.title}` })))
      })
      .catch(() => setChildCandidates([]))
      .finally(() => setChildCandidatesLoading(false))
  }

  /** V3：提交挂子需求 */
  const submitAddChild = async () => {
    if (!childSelected || !id) return
    setChildSubmitting(true)
    try {
      await addStructureChild({ parentReqId: id, childReqId: childSelected })
      message.success('子需求已掛接')
      setChildModalOpen(false)
      await loadStructureTree()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '掛接失敗')
    } finally {
      setChildSubmitting(false)
    }
  }

  /** V3：移除子需求 */
  const handleRemoveChild = async (childReqId: number) => {
    if (!id) return
    try {
      await removeStructureChild({ parentReqId: id, childReqId })
      message.success('子需求已移除')
      await loadStructureTree()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '移除失敗')
    }
  }

  /**
   * 后端下发的可执行动作。数组存在就以后端为准，**空数组也算**：
   * 空的含义是「你这个角色在这个状态下没有可做的事」，
   * 而 `detail?.allowedActions?.length` 这种写法会把「无权」当成「字段缺失」，
   * 回退到本地流转表后反而将分配/验收/归档按钮摆给无关角色（点了才被后端拒）。
   * <p>toStatus 一并保留：草稿提交弹窗要告诉用户「执行后进入哪个状态」。
   */
  const serverActions = detail?.allowedActions
  const availableActions = useMemo(() => {
    if (serverActions) {
      return serverActions.map(a => ({
        key: a.actionCode,
        actionCode: a.actionCode as RdmAction,
        actionName: a.actionName || RDM_ACTION_LABEL[a.actionCode as RdmAction] || a.actionCode,
        toStatus: a.toStatus as RdmStatus,
        tone: (a.tone ?? RDM_ACTION_TONE[a.actionCode as RdmAction] ?? 'default') as RdmActionTone,
        requiredFields: (a.requiredFields ?? []) as RdmActionField[],
      }))
    }
    // 只有字段缺失（后端降级/历史数据）才按本地流转表推导，用于原型演示
    const seen = new Set<string>()
    return transitions
      .filter(t => {
        if (!t.enabled || t.fromStatus !== detail?.status || seen.has(t.actionCode)) return false
        seen.add(t.actionCode)
        return true
      })
      .map(t => ({
        key: String(t.id),
        actionCode: t.actionCode as RdmAction,
        actionName: t.actionName || RDM_ACTION_LABEL[t.actionCode as RdmAction] || t.actionCode,
        toStatus: t.toStatus as RdmStatus,
        tone: (RDM_ACTION_TONE[t.actionCode as RdmAction] ?? 'default') as RdmActionTone,
        requiredFields: (RDM_ACTION_REQUIRED_FIELDS[t.actionCode as RdmAction] ?? []) as RdmActionField[],
      }))
  }, [serverActions, transitions, detail])

  /**
   * 主动作 + 其余动作（全部平铺到页面底部操作栏，不再收进「更多操作」下拉）。
   * <p>逆向动作（駁回/掛起/阻塞/撤回/退回）不参与主动作竞选，避免默认按钮把人往回推。
   */
  const { primaryAction, otherActions } = useMemo(() => {
    const reverse = new Set<string>([
      RDM_ACTION.REJECT, RDM_ACTION.REJECT_INTAKE, RDM_ACTION.HOLD, RDM_ACTION.BLOCK,
      RDM_ACTION.WITHDRAW, RDM_ACTION.REVIEW_REJECT, RDM_ACTION.TEST_REJECT, RDM_ACTION.UAT_FAIL, RDM_ACTION.REASSIGN,
    ])
    const forward = availableActions.filter(a => !reverse.has(a.actionCode))
    const rank = (code: RdmAction) => {
      const idx = PRIMARY_ACTION_ORDER.indexOf(code)
      return idx < 0 ? PRIMARY_ACTION_ORDER.length + 1 : idx
    }
    const ordered = [...forward].sort((a, b) => rank(a.actionCode) - rank(b.actionCode))
    const [primary, ...rest] = ordered
    return {
      primaryAction: primary,
      otherActions: [...rest, ...availableActions.filter(a => reverse.has(a.actionCode))],
    }
  }, [availableActions])

  const requiredFields: RdmActionField[] = useMemo(
    () => (activeAction ? availableActions.find(a => a.actionCode === activeAction)?.requiredFields ?? [] : []),
    [activeAction, availableActions],
  )

  /** 选填字段（如排期时的所属迭代）：不拦截提交，但必须给地方填 */
  const optionalFields: RdmActionField[] = useMemo(
    () => (activeAction ? RDM_ACTION_OPTIONAL_FIELDS[activeAction] ?? [] : []),
    [activeAction],
  )

  /** 说明是否必填：驳回/退回/阻塞必须留下理由，否则业务方不知道自己被退在哪 */
  const remarkRequired = requiredFields.includes('remark') || requiredFields.includes('blockReason')

  /**
   * 当前动作的显示名。
   * <p>必须优先取流转配置里的 actionName，而不是静态 RDM_ACTION_LABEL：
   * 同一个 actionCode 在不同起始状态下名字不同（如 reassign 在已分配→需求池叫「退回需求池」，
   * 在池内→已分配叫「改派」），写死映射会把面板标题显示成错误的动作（实测发生过）。
   */
  const activeActionName = activeAction
    ? availableActions.find(a => a.actionCode === activeAction)?.actionName
      ?? RDM_ACTION_LABEL[activeAction] ?? activeAction
    : ''

  /** 下一步文案：有动作就说清要判断什么，没动作就说清在等谁（不写「等 2 个动作」这种废话） */
  const nextStepHint = useMemo(() => {
    const prds = summary?.prds ?? []
    const reviews = summary?.reviews ?? []
    const pendingReviews = reviews.filter(r => r.conclusion === 'pending').length
    /*
     * V3 分批交付：需求层只到受理，PRD/设计/开发/测试/验收以交付项为推进单位，
     * 需求状态不再逐段变化（阶段条改由交付项推导）。
     */
    if (detail?.flowVersion === 3 && detail.status === RDM_STATUS.ACCEPTED) {
      const stageLabel = detail.deliveryStage
        ? RDM_STAGE_LABEL[detail.deliveryStage as RdmStage] ?? detail.deliveryStage
        : null
      if ((detail.deliveryItemCount ?? 0) > 0) {
        return `V3 分批交付：交付項已推導至「${stageLabel}」（${detail.deliveryDoneCount ?? 0}/${detail.deliveryItemCount} 完成），下一步在交付項清單中推進`
      }
      return prds.length > 0
        ? `V3 分批交付：PRD 已就緒（${prds.length} 份${pendingReviews > 0 ? `，${pendingReviews} 個評審進行中` : ''}），下一步建立交付項或提交排期`
        : 'V3 分批交付：已受理，等待產品經理編寫 PRD；設計/開發/測試/驗收按交付項推進'
    }
    /*
     * 已受理但 PRD 已存在（V2）：不能再提示「去写 PRD」。
     * 先保存过草稿的需求会停在受理态，主按钮仍是「開始寫 PRD」，
     * 这里明确告诉人下一步到底该做什么，而不是让人重新写一遍。
     */
    if (detail?.status === RDM_STATUS.ACCEPTED && prds.length > 0) {
      /*
       * 存量数据（本次修正前就已写好 PRD）会停在「已受理 + PRD 已存在」，
       * 此时主按钮仍是「開始寫 PRD」；直接说清点下去只推流程、不丢内容，
       * 避免用户以为要重写一遍。
       */
      if (primaryAction?.actionCode === RDM_ACTION.PRD_START) {
        return 'PRD 已就緒：點「開始寫 PRD」把流程推進到 PRD 設計（不會清空已寫內容），接著發起評審'
      }
      return pendingReviews > 0
        ? 'PRD 已就緒，評審進行中：等待評審人給出結論，通過後即可提交排期'
        : 'PRD 已就緒：下一步發起評審，評審通過後提交排期（無需重寫 PRD）'
    }
    if (primaryAction) {
      const base = ACTION_HINT[primaryAction.actionCode] ?? `可執行「${primaryAction.actionName}」推進本需求`
      // 动作按钮已全部平铺到页面底部：不指路会让人在处理条右侧干等找不到入口
      const tail = otherActions.length > 0 ? `另有 ${otherActions.length} 個動作，` : ''
      return `${base}（${tail}執行入口在頁面底部）`
    }
    return STATUS_WAIT_HINT[detail?.status as RdmStatus]
      ?? (serverActions
        ? `當前狀態由${detail?.currentHandler ?? '下一位處理人'}推進，你在這個環節沒有可執行動作`
        : '當前狀態無可執行動作')
  }, [primaryAction, otherActions.length, serverActions, detail, summary])

  /** 风险提示：同一风险只出现一次，处理条展示最需要行动的一项，其余可展开 */
  const riskItems = useMemo(() => {
    if (!detail) return [] as { tone: 'danger' | 'warn'; text: string }[]
    const items: { tone: 'danger' | 'warn'; text: string }[] = []
    if (detail.sla?.overdue && !RDM_TERMINAL_STATUS.includes(detail.status as RdmStatus)) {
      items.push({ tone: 'danger', text: `已逾期 ${Math.abs(detail.sla.remainHours)} 小時，請盡快推進或調整排期` })
    }
    if (detail.blockedFlag) {
      items.push({ tone: 'danger', text: `阻塞中：${detail.blockedReason ?? '已標記阻塞，未填原因'}` })
    }
    if (detail.rejectReason) {
      items.push({ tone: 'warn', text: `最新駁回理由：${detail.rejectReason}` })
    }
    if ((detail.reworkCount ?? 0) > 0) {
      items.push({ tone: 'warn', text: `驗收返工 ${detail.reworkCount} 次，返工原因見「驗收與發布」` })
    }
    /*
     * 歷史越級數據：受理前就寫了 PRD / 出了評審結論。
     * 不提醒的话，用户会看到「評審已通過」与「接受需求」同时出现，以为系統壞了；
     * 提醒后也說清接受需求之后會發生什麼。
     */
    if (PRE_ACCEPT_STATUSES.includes(detail.status)
        && (summary?.prds.length ?? 0) > 0) {
      items.push({
        tone: 'warn',
        text: detail.flowVersion === 3
          ? '尚未受理就已存在 PRD / 評審記錄：V3 分批交付按交付項推進，接受需求後即可繼續'
          : '尚未受理就已存在 PRD / 評審記錄（歷史越級操作）：接受需求後會自動對齊到事實狀態',
      })
    }
    return items
  }, [detail, summary])

  /**
   * 阶段条上每个节点的停留天数：把时间轴里细分状态的停留时长按阶段汇总。
   * <p>不足一天按一天计（0 天会被读成「没花时间」，而实际是刚进入）；
   * 还没走过的阶段不输出，节点下方宁可不显示也不编一个 0。
   */
  const stageStayDays = useMemo(() => {
    // 已归档需求不再计算停留：归档是终点，节点上的天数只增不减，展示会误导成还在推进
    if (detail?.status === RDM_STATUS.CLOSED) return {}
    const hoursByStage: Partial<Record<RdmStage, number>> = {}
    for (const node of detail?.timeline ?? []) {
      const st = RDM_STATUS_STAGE[node.status as RdmStatus]
      if (!st || node.durationHours == null) continue
      hoursByStage[st] = (hoursByStage[st] ?? 0) + node.durationHours
    }
    const days: Partial<Record<RdmStage, number>> = {}
    for (const [st, hours] of Object.entries(hoursByStage)) {
      if (hours && hours > 0) days[st as RdmStage] = Math.max(Math.round(hours / 24), 1)
    }
    return days
  }, [detail?.timeline, detail?.status])

  /**
   * V3 階段條的推導口徑（只讀投影）：
   * 交付項完成數 + 各狀態分佈 + 「需求狀態仍停在哪」。
   * <p>必須同時說清兩件事，否則是「進度條點在開發、狀態却寫已受理」的矛盾觀感。
   * <p>非 V3 需求返回 undefined，階段條行為完全不變。
   */
  const v3StageHint = useMemo(() => {
    if (!detail || detail.flowVersion !== 3) return undefined
    const statusLabel = RDM_STATUS_LABEL[detail.status as RdmStatus] ?? detail.status
    const total = detail.deliveryItemCount ?? 0
    const done = detail.deliveryDoneCount ?? 0
    if (total === 0) {
      return `V3 分批交付：階段由交付項推導，目前尚無交付項（需求狀態：${statusLabel}）`
    }
    const dist = Object.entries(detail.deliveryItemStatusCounts ?? {})
      .map(([code, count]) => `${RDM_DELIVERY_ITEM_STATUS_LABEL[code] ?? code} ${count}`)
      .join(' · ')
    return `V3 分批交付：階段由交付項推導 · ${done}/${total} 完成${dist ? `（${dist}）` : ''} · 需求狀態仍為「${statusLabel}」`
  }, [detail])

  /** 合并评论与流转记录成一条活动流（按时间倒序；内部记录的服务端可见性不变） */
  const activityItems = useMemo<ActivityItem[]>(() => {
    if (!detail) return []
    const comments: ActivityItem[] = detail.comments.map(c => ({
      kind: 'comment',
      id: `c-${c.id}`,
      time: c.createdAt,
      author: c.authorName,
      role: c.authorRole,
      content: c.content,
      internal: c.internal,
    }))
    const flows: ActivityItem[] = detail.timeline.map(t => ({
      kind: 'transition',
      id: `t-${t.id}`,
      time: t.time,
      author: t.operatorName,
      role: t.operatorRole,
      content: `${RDM_ACTION_LABEL[t.actionCode as RdmAction] ?? t.statusLabel ?? RDM_STATUS_LABEL[t.status as RdmStatus] ?? t.status}${t.remark ? ` · ${t.remark}` : ''}`,
      status: t.status,
      overdue: t.overdue,
      durationHours: t.durationHours,
    }))
    const merged = [...comments, ...flows].sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
    return activityFilter === 'comment' ? merged.filter(i => i.kind === 'comment')
      : activityFilter === 'transition' ? merged.filter(i => i.kind === 'transition')
        : merged
  }, [detail, activityFilter])

  /** 参与人：一人多角色合并成一行，但底层角色关系与权限判定不变 */
  const participants = useMemo(() => {
    if (!detail) return [] as { userId: number; name: string; empNo?: string | null; roles: string[] }[]
    const map = new Map<number, { userId: number; name: string; empNo?: string | null; roles: string[] }>()
    detail.roles.forEach(r => {
      const exist = map.get(r.userId)
      if (exist) {
        if (!exist.roles.includes(r.roleCode)) exist.roles.push(r.roleCode)
        return
      }
      map.set(r.userId, { userId: r.userId, name: r.name, empNo: r.empNo, roles: [r.roleCode] })
    })
    return [...map.values()]
  }, [detail])

  const canEditDelivery = hasPermission('rdm-requirement:edit') || hasPermission('rdm-delivery-board:edit')
  const closed = detail?.status === RDM_STATUS.CLOSED

  /** 动作必填字段校验：不通过时弹窗保持打开，让人补完再点 */
  const validateActionFields = (fields: RdmActionField[]): boolean => {
    if (fields.includes('remark') && !remark.trim()) {
      message.warning('請填寫說明（駁回/退回理由必填）')
      return false
    }
    if (fields.includes('blockReason') && !remark.trim()) {
      message.warning('標記阻塞必須填寫阻塞原因')
      return false
    }
    if (fields.includes('planDate') && !planDate) { message.warning('請選擇計劃上線日期'); return false }
    if (fields.includes('promisedDate') && !promisedDate) { message.warning('請選擇承諾出需求（PRD）日期'); return false }
    if (fields.includes('holdUntil') && !holdUntil) { message.warning('請選擇復審日期'); return false }
    if (fields.includes('pm') && !pmUserId) { message.warning('請選擇產品經理'); return false }
    if (fields.includes('versionNo') && !versionNo) { message.warning('請選擇上線版本'); return false }
    if (fields.includes('score') && !score) { message.warning('請給出交付滿意度評分'); return false }
    // 归属体系改造硬闸门（与后端 applyProjectAndIteration 同口径）：排期必须挂项目+迭代
    if (fields.includes('project') && !actionProjectId) { message.warning('請選擇所屬項目'); return false }
    if (fields.includes('iteration') && !iterationCode) { message.warning('請選擇所屬迭代'); return false }
    return true
  }

  /** 组装流转入参：只有动作声明了 score 才带上，避免把未评分当成真实满意度 */
  const buildTransitionPayload = (
    actionCode: RdmAction,
    fields: RdmActionField[],
  ): Parameters<typeof transitionRequirement>[1] => {
    const pm = pmOptions.find(p => p.userId === pmUserId)
    return {
      actionCode,
      remark: remark || undefined,
      planDate: planDate?.format('YYYY-MM-DD'),
      promisedDate: promisedDate?.format('YYYY-MM-DD'),
      holdUntil: holdUntil?.format('YYYY-MM-DD'),
      versionNo,
      score: fields.includes('score') ? score : undefined,
      pmUserId,
      pmName: pm?.name,
      iterationCode,
      projectId: actionProjectId ?? null,
    }
  }

  /** 确认后才跑：执行流转并刷新详情 */
  const runTransition = async (
    action: { actionCode: RdmAction; actionName: string },
    payload: Parameters<typeof transitionRequirement>[1],
  ) => {
    if (!detail) return
    setSaving(true)
    try {
      await transitionRequirement(detail.id, payload)
      message.success(`已執行「${action.actionName}」，需求狀態已更新`)
      resetActionForm()
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      // 必须透传后端真实文案：流转失败往往是业务闸门（未放行/版本不符），
      // 给一句「请重试」会让人反复点同一个被拒的动作
      message.error(err instanceof Error && err.message ? err.message : '流轉失敗，請重試')
      throw err
    } finally {
      setSaving(false)
    }
  }

  /** 当前弹窗对应的动作行（决定「執行後」状态与后果说明） */
  const execActionRow = activeAction
    ? availableActions.find(a => a.actionCode === activeAction) ?? null
    : null

  /**
   * 弹窗里点「確認執行」：状态流转是影响最大的写操作，弹窗本身已经承担了二次确认，
   * 不再叠一层 Modal.confirm；必填字段与补充说明都在同一处填完。
   * <p>失败时保留弹窗（错误文案由 runTransition 透传后端），让人改完直接重试。
   */
  const confirmAction = async () => {
    if (!activeAction || !execActionRow) return
    if (!validateActionFields(execActionRow.requiredFields)) return
    try {
      await runTransition(execActionRow, buildTransitionPayload(activeAction, execActionRow.requiredFields))
    } catch {
      // 失败原因已弹提示，保留弹窗供修正后重试
    }
  }

  /** 只清动作字段值，不动当前展开的动作（切换动作时复用） */
  const clearActionFields = () => {
    setRemark('')
    setPlanDate(null)
    setPromisedDate(null)
    setHoldUntil(null)
    setVersionNo(undefined)
    setScore(undefined)
    setPmUserId(undefined)
    setIterationCode(undefined)
    setActionProjectId(undefined)
  }

  const resetActionForm = () => {
    setActiveAction(null)
    clearActionFields()
  }

  const handleComment = async () => {
    if (!comment.trim() || !detail) return
    try {
      await addComment(detail.id, comment.trim())
      setComment('')
      message.success('已發布溝通記錄')
      await load()
    } catch {
      message.error('發布失敗，請重試')
    }
  }

  const handleUrge = async () => {
    if (!detail) return
    try {
      await urgeRequirement(detail.id)
      message.success('已催辦當前處理人')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '催辦失敗，請重試')
    }
  }

  const switchTab = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  /** 动作弹窗的下拉候选（產品經理 / 迭代 / 上线版本）：拉过一次就缓存 */
  const actionOptionsFetched = useRef(false)
  const actionOptionsPending = useRef(false)
  const [actionOptionsLoading, setActionOptionsLoading] = useState(false)

  /**
   * 按需拉取动作弹窗的下拉候选。
   * <p>这三份数据只在点开动作、真正要填表时才有用，而远程库上
   * product-managers（逐人算在途负载）与 iterations（逐个迭代算需求数/工時）
   * 各要几十次 SQL 往返；挂在首屏会把详情页白屏时间拖到数秒。
   * <p>失败不记入已加载，下次点开弹窗会重试（三个接口都是静默请求，不会刷 toast）。
   */
  const ensureActionOptions = useCallback(() => {
    if (actionOptionsFetched.current || actionOptionsPending.current) return
    actionOptionsPending.current = true
    setActionOptionsLoading(true)
    void Promise.all([
      fetchProductOptions().catch(() => null),
      fetchIterations().catch(() => null),
      // 版本列表拉不到不拦人：AutoComplete 仍可手工输入
      fetchVersionHistory({ page: 1, size: 20 }).catch(() => null),
      // 归属体系改造：项目候选（dispatch/accept/schedule 弹窗与调整迭代弹窗共用）
      fetchProjectPage({ pageNo: 1, pageSize: 200 }).catch(() => null),
    ]).then(([pms, iters, versions, projects]) => {
      if (pms) setPmOptions(pms)
      if (iters) setIterations(iters)
      if (versions) {
        setVersionOptions((versions.records ?? []).map(v => ({
          value: v.versionNo,
          label: v.releaseDate ? `${v.versionNo}（${v.releaseDate.slice(0, 10)}）` : v.versionNo,
        })))
      }
      if (projects) {
        setProjectOptions((projects.records ?? []).filter(p => USABLE_PROJECT_STATUS.includes(p.status)))
      }
      if (pms && iters && versions && projects) actionOptionsFetched.current = true
    }).finally(() => {
      actionOptionsPending.current = false
      setActionOptionsLoading(false)
    })
  }, [])

  /**
   * 打开动作执行弹窗。
   * <p>每次从干净字段开始——残留上一次填的日期/版本，
   * 会让人以为新动作已经带上了刚才的值。
   */
  const openActionModal = (code: RdmAction) => {
    setActiveAction(code)
    clearActionFields()
    ensureActionOptions()
  }

  /**
   * 迭代候选按项目联动（与后端 applyProjectAndIteration 的一致性校验同口径）：
   * 选了项目就只给该项目下的迭代 + 无项目的 hotfix（平台级热修）；未选项目时给全部未关闭迭代。
   */
  const iterationOptionsFor = (pid?: number) => iterations
    .filter(i => i.status !== RDM_ITERATION_STATUS.CLOSED)
    .filter(i => pid == null || i.projectId == null || i.projectId === pid)
    .map(i => ({
      value: i.code,
      label: `${i.name}（${i.startDate ?? '-'} ~ ${i.endDate ?? '-'}）${i.projectId == null ? ' · 未掛項目' : ''}`,
    }))

  /** 打开「调整迭代」弹窗：预填当前项目与迭代，拉候选 */
  const openIterationModal = () => {
    if (!detail) return
    setIterModalProjectId(detail.projectId ?? undefined)
    setIterModalCode(detail.iterationCode ?? undefined)
    setIterModalRemark('')
    setIterModalOpen(true)
    ensureActionOptions()
  }

  /**
   * 提交「调整迭代」：属性变更而非状态流转，走独立端点。
   * <p>后端会同步未完成任务的迭代归属并留痕通知，成功后刷新正文与交付摘要。
   */
  const submitChangeIteration = async () => {
    if (!detail) return
    if (!iterModalCode) { message.warning('請選擇目標迭代'); return }
    if (iterModalCode === detail.iterationCode && (iterModalProjectId ?? null) === (detail.projectId ?? null)) {
      message.warning('項目與迭代均未變更'); return
    }
    setIterModalSaving(true)
    try {
      await changeRequirementIteration(detail.id, {
        projectId: iterModalProjectId ?? null,
        iterationCode: iterModalCode,
        remark: iterModalRemark.trim() || undefined,
      })
      message.success('迭代已調整，未完成任務已同步')
      setIterModalOpen(false)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      // 透传后端真实文案（迭代已关闭/不属于所选项目/无权等都是业务闸门）
      message.error(err instanceof Error && err.message ? err.message : '調整失敗，請重試')
    } finally {
      setIterModalSaving(false)
    }
  }

  /**
   * 複製需求：交付流程鎖定後需要換交付方式時的補捙路徑。
   * <p>生成一條草稿（不繼承項目/迭代/流程版本），確認後跳提交頁繼續編輯。
   */
  const handleCopyRequirement = () => {
    if (!detail) return
    Modal.confirm({
      title: '複製需求',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div>將以當前需求為模板建立一條<b>草稿</b>，確認內容後再提交。</div>
          <div style={{ color: '#8C8C8C', fontSize: 12, marginTop: 8 }}>
            複製：標題、類型、優先級、規模、現狀與痛點、期望結果、業務價值、期望日期、需求對象、驗收人、意向產品經理。<br />
            不複製：附件（需重新上傳）、所屬項目/迭代、交付流程（分配/認領時重新確定）、評審/PRD/任務/交付項/驗收記錄。
          </div>
        </div>
      ),
      okText: '確認複製',
      cancelText: '取消',
      onOk: async () => {
        const created = await copyRequirement(detail.id)
        message.success('已複製為草稿，請確認後提交')
        navigate(`/rdm-submit?id=${created.id}`)
      },
    })
  }

  if (!detail) {
    return (
      <div className="content-area">
        <div style={{ padding: 60, textAlign: 'center', color: '#8C8C8C' }}>
          {!id ? '未指定需求編號，請從清單進入詳情'
            : error ? error
            : loading ? '需求載入中…' : '需求不存在或已被刪除'}
          {error && (
            <div style={{ marginTop: 12 }}>
              <Button type="primary" onClick={() => void load()}>重試</Button>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => navigate(backListPath)}>{t('rdm.reqDetail.backToList')}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="content-area rdm-detail">
      {/* ── 头部：标题直接用需求名称（进页第一眼就知道是哪个需求），编号/提出人/提交时间放 meta 行 ── */}
      <DetailPageHeader
        title={
          /* 需求标题最长 200 字，单行省略 + hover 看全文，避免撑高头部把状态标签挤到下一行 */
          <span className="rdm-detail-header-title" title={detail.title}>{detail.title}</span>
        }
        tags={
          <Space size={6}>
            <StatusTag status={detail.status} overdue={detail.overdueFlag ?? false} />
            <TypeTag reqType={detail.reqType} />
            <PriorityTag priority={detail.priority} />
          </Space>
        }
        meta={`${formatRdmReqNo(detail.reqNo)} · 提出人 ${detail.submitterName}${detail.submitDeptName ? `（${detail.submitDeptName}）` : ''} · 提交於 ${detail.submitTime ?? '-'}`}
        onBack={() => navigate(-1)}
        extra={
          <Space>
            <Button icon={<BellOutlined />} onClick={handleUrge}>催辦</Button>
          </Space>
        }
      />

      {/* ── 处理条：一眼看清「轮到谁 + 我该做什么」，动作只留一个主位 ── */}
      <div className="rdm-action-bar">
        {/* 流程节点：提交动作到底部后处理条横向空间腾出来了，九阶段直接铺开，不再收进弹窗 */}
        <div className="rdm-action-bar-stages">
          <RequirementStageBar
            status={detail.status}
            overdue={detail.overdueFlag ?? false}
            stayDays={stageStayDays}
            derivedStage={detail.flowVersion === 3 && detail.deliveryStage ? detail.deliveryStage as RdmStage : null}
            derivedHint={v3StageHint}
          />
        </div>
        <div className="rdm-action-bar-left">
          <div className="rdm-action-bar-next">
            <span className="rdm-action-bar-label">下一步</span>
            <span className="rdm-action-bar-hint">{nextStepHint}</span>
            {/* 阶段口径是多句说明，按规范走 HelpPopover；原「查看流程」弹窗已被顶部直铺的阶段条取代 */}
            <HelpPopover
              title="階段口徑說明"
              ariaLabel="階段口徑說明"
              placement="bottomLeft"
              width={400}
              content={[
                { tone: 'info', label: '業務方視角', body: '只看這 9 個摺疊階段，每個節點對應一個明確的責任人，回答「我的需求到哪了、該催誰」。' },
                { tone: 'info', label: '產研視角', body: '看細分狀態，回答「這一步誰該做什麼、卡在哪」。' },
                { tone: 'neutral', body: '細分狀態與流轉規則仍由「需求配置 · 狀態與流轉」維護；階段摺疊以產品生命週期 9 段為準。' },
              ]}
            >
              <span className="rdm-judge-trigger"><InfoCircleOutlined /> 階段口徑</span>
            </HelpPopover>
          </div>
          <div className="rdm-action-bar-meta">
            <span>當前處理人：<b>{detail.currentHandler ?? '待分配'}</b></span>
            <span>承諾：<b>PRD {detail.promisedPrdDate ?? '-'}</b> / <b>上線 {detail.planReleaseDate ?? detail.expectDate ?? '-'}</b></span>
            {riskItems.length > 0 && (
              <Popover
                trigger="click"
                placement="bottomLeft"
                content={
                  <div className="rdm-risk-popover">
                    {riskItems.map((r, i) => (
                      <div key={i} className={`rdm-risk-popover-item ${r.tone}`}>{r.text}</div>
                    ))}
                  </div>
                }
              >
                <Tag color={riskItems[0].tone === 'danger' ? 'error' : 'warning'} style={{ margin: 0, cursor: 'pointer' }}>
                  {riskItems[0].text} <DownOutlined style={{ fontSize: 10 }} />
                </Tag>
              </Popover>
            )}
            {/* 审批单是状态跳转入口（不是流转动作），留在状态区跟着看，不占底部按钮位 */}
            {detail.intakeFlowNo && (
              <Tooltip title="審批動作在 OA 審批中心完成，本頁只展示同一份事實">
                <Button
                  type="link"
                  size="small"
                  icon={<AuditOutlined />}
                  style={{ padding: 0, height: 'auto', fontSize: 12 }}
                  onClick={() => navigate(`/approval-detail?flowNo=${encodeURIComponent(detail.intakeFlowNo ?? '')}&type=rdm_intake`)}
                >
                  審批單
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* 审批判断口径：长说明走 HelpPopover，不用 Tooltip 承载多句文本 */}
        {detail.status === RDM_STATUS.INTAKE_PENDING && (
          <div className="rdm-action-bar-judge">
            <HelpPopover
              title="審批判斷口徑"
              ariaLabel="審批判斷口徑說明"
              placement="bottomLeft"
              width={420}
              content={[
                { tone: 'info', label: '是否必要', body: '要解決的業務問題是否真實存在、影響面多大。' },
                { tone: 'info', label: '範圍是否清楚', body: '期望結果能否逐條驗收，有沒有把方案當成需求。' },
                { tone: 'info', label: '是否重複', body: '同部門同菜單是否已有在途或已交付的同類需求。' },
                { tone: 'neutral', body: '「退回補充」（需求回到提出人補料、不計駁回）需後端新增 return_supplement 流轉，尚未接通，因此本頁不提供該按鈕。' },
              ]}
            >
              <span className="rdm-judge-trigger"><InfoCircleOutlined /> 審批要判斷什麼</span>
            </HelpPopover>
            {!serverActions?.some(a => a.actionCode === RDM_ACTION.APPROVE_INTAKE) && (
              <span className="rdm-judge-note">你不在當前審批節點（或前序節點尚未審完），動作已不提供；可點「審批單」查看完整鏈路。</span>
            )}
          </div>
        )}

      </div>

      <div className="rdm-detail-grid">
        {/* ════ 左侧：正文 + 分区页签 ════ */}
        <div className="rdm-detail-main">
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><AimOutlined /></span>
              需求內容
              <span className="rdm-card-title-split" />
              <span className="rdm-todo-hint">業務事實與定位，產研據此判斷怎麼做</span>
            </div>
            <BlockLabel text="現狀與痛點" />
            <CollapsibleText text={detail.description ?? '-'} />
            {detail.expectResult && (
              <>
                <BlockLabel text="期望結果（做成什麼樣就滿足）" />
                <CollapsibleText text={detail.expectResult} />
              </>
            )}
            {detail.targets.length > 0 && (
              <>
                <BlockLabel text="需求定位" />
                <Space size={8} wrap>
                  {detail.targets.map((t, i) => (
                    <span key={i} className="rdm-target-chip">
                      {t.systemName ? `${t.systemName} / ` : ''}{t.menuName ?? (RDM_ANCHOR_LABEL[t.anchorType as keyof typeof RDM_ANCHOR_LABEL] ?? t.anchorType)}
                      {t.anchorName ? ` · ${t.anchorName}` : ''}
                      {t.anchorDesc ? ` · ${t.anchorDesc}` : ''}
                    </span>
                  ))}
                </Space>
              </>
            )}
            {/* 附件独立于定位对象展示：只提内容不带定位时也要能看到截图 */}
            {detail.attachments.length > 0 && (
              <>
                <BlockLabel text={`附件（${detail.attachments.length}）`} />
                <Space size={8} wrap>
                  {detail.attachments.filter(a => (a.fileType ?? '').startsWith('image/')).map(att => (
                    <a key={`img-${att.id}`} href={att.fileUrl} target="_blank" rel="noreferrer" title={att.fileName}>
                      <img
                        src={att.fileUrl}
                        alt={att.fileName}
                        style={{
                          width: 148, height: 84, objectFit: 'cover',
                          border: '1px solid #e8eaed', borderRadius: 6,
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    </a>
                  ))}
                </Space>
                <Space size={8} wrap style={{ marginTop: 6 }}>
                  {detail.attachments.filter(a => !(a.fileType ?? '').startsWith('image/')).map(att => (
                    <Tag key={att.id} icon={<PaperClipOutlined />} style={{ margin: 0 }}>
                      {att.fileUrl ? <a href={att.fileUrl} target="_blank" rel="noreferrer">{att.fileName}</a> : att.fileName}
                    </Tag>
                  ))}
                </Space>
              </>
            )}
            {detail.targets[0]?.screenshotUrl && (
              <>
                <BlockLabel text="現狀截圖" />
                <a href={detail.targets[0].screenshotUrl!} target="_blank" rel="noreferrer">
                  <img
                    src={detail.targets[0].screenshotUrl!}
                    alt="現狀截圖"
                    style={{ maxWidth: 360, border: '1px solid #e8eaed', borderRadius: 6 }}
                  />
                </a>
              </>
            )}
            {detail.businessValue && (
              <div className="rdm-value-line">
                <span className="rdm-value-line-label">業務價值</span>
                <span>{detail.businessValue}</span>
              </div>
            )}
          </div>

          <div className="rdm-card rdm-detail-tabs">
            <Tabs
              activeKey={activeTab}
              onChange={switchTab}
              items={[
                {
                  key: 'activity',
                  label: `動態與評論（${detail.comments.length + detail.timeline.length}）`,
                  children: (
                    <>
                      <div className="rdm-activity-toolbar">
                        <Segmented
                          value={activityFilter}
                          onChange={v => setActivityFilter(v as string)}
                          options={[
                            { label: '全部', value: 'all' },
                            { label: '僅評論', value: 'comment' },
                            { label: '僅流轉', value: 'transition' },
                          ]}
                        />
                        <span className="rdm-todo-hint">標註「內部」的記錄業務方不可見</span>
                      </div>
                      {activityItems.length === 0 && <div className="rdm-empty-hint">還沒有動態，可在下方補充說明。</div>}
                      {activityItems.map(item => (
                        <div key={item.id} className="rdm-activity-item">
                          <span className="rdm-icon-block" style={{ background: '#FFF7F0', color: '#E8720C', width: 28, height: 28 }}>
                            {item.author.slice(0, 1)}
                          </span>
                          <div className="rdm-activity-body">
                            <div className="rdm-activity-text">
                              {item.kind === 'comment'
                                ? item.content
                                : (
                                  <Space size={6} wrap>
                                    <StatusTag status={item.status} overdue={item.overdue} />
                                    <span>{item.content}</span>
                                    {!closed && item.durationHours != null && item.durationHours > 0 && (
                                      <span style={{ fontSize: 12, color: '#D46B08' }}>
                                        <ClockCircleOutlined /> 停留 {(item.durationHours / 24).toFixed(1)} 天
                                      </span>
                                    )}
                                  </Space>
                                )}
                            </div>
                            <div className="rdm-activity-meta">
                              {item.author}
                              {item.role ? ` · ${RDM_ROLE_LABEL[item.role as RdmRoleCode] ?? item.role}` : ''}
                              {' · '}{item.time}
                              {item.kind === 'comment' && item.internal && <Tag color="purple" style={{ margin: '0 0 0 6px' }}>內部</Tag>}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* 评论输入：对齐备注输入框统一标准——独占一整行、3 行高、带字数统计、禁止拖拽改高 */}
                      <div className="rdm-comment-box">
                        <TextArea
                          rows={3}
                          maxLength={COMMENT_MAX_LENGTH}
                          showCount
                          placeholder="補充說明或回覆，@ 同事可觸發釘釘提醒"
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                        />
                        <div className="rdm-comment-box-actions">
                          <Button type="primary" onClick={handleComment} disabled={!comment.trim()}>發布</Button>
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: 'task',
                  label: `子任務（${summary ? `${summary.taskDone ?? 0}/${summary.taskTotal ?? 0}` : summaryLoading ? '…' : '-' }）`,
                  children: (
                    <>
                      <DeliverySummaryBar summary={summary} />
                      <TaskSection summary={summary} editable={canEditDelivery && !closed} canCreate={canEditDelivery && !closed} reqId={detail.id} />
                    </>
                  ),
                },
                {
                  key: 'plan',
                  label: `方案與計劃（${(summary?.prds.length ?? 0) + (summary?.milestones?.length ?? 0)}）`,
                  children: (
                    <>
                      <PlanSection
                        summary={summary}
                        status={detail.status}
                        planReleaseDate={detail.planReleaseDate}
                        editable={canEditDelivery && !closed}
                        canCreate={canEditDelivery && !closed}
                        reqId={detail.id}
                        onReviewDecided={() => { void load(); void loadSummary() }}
                      />
                      {reqDocs.length > 0 && (
                        <>
                          <SectionTitleDocs count={reqDocs.length} />
                          <Table<DocNode>
                            rowKey="id"
                            size="small"
                            pagination={false}
                            columns={docColumns(navigate)}
                            dataSource={reqDocs}
                          />
                        </>
                      )}
                    </>
                  ),
                },
                {
                  key: 'gate',
                  label: '驗收與發布',
                  children: (
                    <>
                      {/* V3：聚合需求的結構子需求 */}
                      {detail.requirementKind === RDM_REQUIREMENT_KIND.AGGREGATE && (
                        <div className="rdm-v3-delivery-items">
                          <div className="rdm-section-title">
                            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><BranchesOutlined /></span>
                            結構子需求
                            {structureTree.length > 0 && <Tag color="purple" style={{ margin: 0 }}>{structureTree.length}</Tag>}
                            <span className="rdm-card-title-split" />
                            <span className="rdm-todo-hint">聚合需求下掛的執行需求，各自分批交付</span>
                            {canEditDelivery && (
                              <Button type="link" size="small" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={openChildModal}>
                                添加子需求
                              </Button>
                            )}
                          </div>
                          {structureLoading ? (
                            <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>
                          ) : structureTree.length === 0 ? (
                            <div className="rdm-empty-hint">尚未掛接結構子需求</div>
                          ) : (
                            <Table<RdmStructureTreeNode>
                              rowKey="reqId"
                              size="small"
                              pagination={false}
                              dataSource={structureTree}
                              columns={[
                                { title: '編號', dataIndex: 'reqNo', key: 'reqNo', width: 140 },
                                {
                                  title: '標題', dataIndex: 'title', key: 'title', ellipsis: true,
                                  render: (v: string, r) => (
                                    <a style={{ color: '#2F54EB' }} onClick={() => goDetail(r.reqId)}>{v}</a>
                                  ),
                                },
                                {
                                  title: '種類', dataIndex: 'requirementKind', key: 'requirementKind', width: 90,
                                  render: (v: string) => (
                                    <Tag color={v === 'aggregate' ? 'purple' : 'cyan'} style={{ margin: 0 }}>
                                      {RDM_REQUIREMENT_KIND_LABEL[v] ?? v}
                                    </Tag>
                                  ),
                                },
                                {
                                  title: '狀態', dataIndex: 'status', key: 'status', width: 100,
                                  render: (v: string) => <StatusTag status={v as RdmStatus} />,
                                },
                                {
                                  title: '交付進度', key: 'deliveryProgress', width: 100,
                                  render: (_, r) => `${r.deliveryDoneCount ?? 0}/${r.deliveryItemCount ?? 0}`,
                                },
                                ...(canEditDelivery ? [{
                                  title: '操作', key: 'action', width: 70, fixed: 'right' as const,
                                  render: (_: unknown, r: RdmStructureTreeNode) => (
                                    <Popconfirm title="確定移除該子需求？" description="移除後該執行需求不再掛在本聚合需求下" onConfirm={() => handleRemoveChild(r.reqId)} okText="移除" cancelText="取消">
                                      <Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button>
                                    </Popconfirm>
                                  ),
                                }] : []),
                              ]}
                            />
                          )}
                        </div>
                      )}
                      {/* V3：交付項清單（只在 flowVersion=3 時展示） */}
                      {detail.flowVersion === 3 && (
                        <div className="rdm-v3-delivery-items">
                          <div className="rdm-section-title">
                            <span className="rdm-icon-block" style={{ background: '#F0F5FF', color: '#2F54EB' }}><CheckCircleOutlined /></span>
                            交付項清單
                            {deliveryItems.length > 0 && <Tag color="blue" style={{ margin: 0 }}>{deliveryItems.length}</Tag>}
                            <span className="rdm-card-title-split" />
                            <span className="rdm-todo-hint">分批交付模式下，每個交付項獨立驗收與發布</span>
                            {/* 交付項的唯一創建入口：必須挂需求（後端 createItem 强制 reqId） */}
                            {canEditDelivery && (
                              <Button
                                type="link"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => navigate(
                                  `/rdm-delivery-item?mode=create&reqId=${detail.id}`
                                  + (detail.projectId ? `&projectId=${detail.projectId}` : '')
                                  + (detail.projectName ? `&projectName=${encodeURIComponent(detail.projectName)}` : ''),
                                )}
                              >
                                新增交付項
                              </Button>
                            )}
                          </div>
                          {deliveryItemsLoading ? (
                            <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>
                          ) : deliveryItems.length === 0 ? (
                            <div className="rdm-empty-hint">尚未建立交付項</div>
                          ) : deliveryItems.length === 1 ? (
                            /* 只有一個交付項時展開顯示，不用表格 */
                            <div className="rdm-v3-delivery-single">
                              <div className="rdm-v3-delivery-single-title">
                                {deliveryItems[0].title}
                                <Tag color={RDM_DELIVERY_ITEM_STATUS_COLOR[deliveryItems[0].status] ?? 'default'} style={{ margin: 0 }}>
                                  {RDM_DELIVERY_ITEM_STATUS_LABEL[deliveryItems[0].status] ?? deliveryItems[0].status}
                                </Tag>
                                <Button
                                  type="link"
                                  size="small"
                                  style={{ marginLeft: 'auto' }}
                                  onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${deliveryItems[0].id}`)}
                                >
                                  {t('rdm.reqDetail.advanceDelivery')}
                                </Button>
                              </div>
                              <div className="rdm-v3-delivery-single-meta">
                                <span>協調人：{deliveryItems[0].coordinatorUserName || '-'}</span>
                                <span>計劃結束：{deliveryItems[0].planEndDate || '-'}</span>
                                <span>測試：{deliveryItems[0].testStatus
                                  ? (RDM_TEST_BATCH_STATUS_LABEL[deliveryItems[0].testStatus] ?? deliveryItems[0].testStatus)
                                  : t('rdm.deliveryItem.noTest')}</span>
                                <span>驗收：{deliveryItems[0].acceptanceStatus
                                  ? (RDM_ACCEPT_RESULT_LABEL[deliveryItems[0].acceptanceStatus as RdmAcceptResult] ?? deliveryItems[0].acceptanceStatus)
                                  : t('rdm.deliveryItem.noAcceptance')}</span>
                              </div>
                            </div>
                          ) : (
                            <Table<RdmDeliveryItemListItem>
                              rowKey="id"
                              size="small"
                              pagination={false}
                              dataSource={deliveryItems}
                              columns={[
                                { title: '交付項', dataIndex: 'title', key: 'title', ellipsis: true, width: 200 },
                                { title: '協調人', dataIndex: 'coordinatorUserName', key: 'coordinator', width: 90, render: (v?: string | null) => v || '-' },
                                {
                                  title: '狀態', dataIndex: 'status', key: 'status', width: 100,
                                  render: (v: string) => (
                                    <Tag color={RDM_DELIVERY_ITEM_STATUS_COLOR[v] ?? 'default'} style={{ margin: 0 }}>
                                      {RDM_DELIVERY_ITEM_STATUS_LABEL[v] ?? v}
                                    </Tag>
                                  ),
                                },
                                { title: '計劃結束', dataIndex: 'planEndDate', key: 'planEndDate', width: 110, render: (v?: string | null) => v || '-' },
                                { title: '測試', dataIndex: 'testStatus', key: 'testStatus', width: 90,
                                  render: (v?: string | null) => v ? (RDM_TEST_BATCH_STATUS_LABEL[v] ?? v) : '-' },
                                { title: '驗收', dataIndex: 'acceptanceStatus', key: 'acceptanceStatus', width: 100,
                                  render: (v?: string | null) => v ? (RDM_ACCEPT_RESULT_LABEL[v as RdmAcceptResult] ?? v) : '-' },
                                {
                                  title: '操作', key: 'action', width: 60, fixed: 'right',
                                  render: (_, r) => (
                                    <Button type="link" size="small" onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${r.id}`)}>詳情</Button>
                                  ),
                                },
                              ]}
                            />
                          )}
                        </div>
                      )}
                      <ReleasePanel
                        key={`gate-${detail.id}-${detail.status}`}
                        reqId={detail.id}
                        status={detail.status}
                        flowVersion={detail.flowVersion}
                        editable={canEditDelivery}
                      />
                      <AcceptanceTraceCard detail={detail} />
                    </>
                  ),
                },
                {
                  key: 'records',
                  label: `更多記錄（${(summary?.changes.length ?? 0) + detail.timeline.length}）`,
                  children: (
                    <>
                      <ChangeSection summary={summary} canCreate={!closed} reqId={detail.id} />
                      <IntakePolicySection detail={detail} navigate={navigate} />
                      <div className="rdm-section-title" style={{ marginTop: 16 }}>
                        <span className="rdm-icon-block" style={{ background: '#F5F5F5', color: '#595959' }}><HistoryOutlined /></span>
                        全生命週期記錄
                        <span className="rdm-card-title-split" />
                        <span className="rdm-todo-hint">共 {detail.timeline.length} 個節點，每一步誰在什麼時候做的都有留痕</span>
                      </div>
                      <Timeline
                        items={detail.timeline.map(node => ({
                          color: node.overdue ? 'red' : node === detail.timeline[0] ? 'blue' : 'gray',
                          children: (
                            <div>
                              <Space size={6} wrap>
                                <StatusTag status={node.status} />
                                <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>{node.operatorName}</span>
                                {node.operatorRole && (
                                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                                    {RDM_ROLE_LABEL[node.operatorRole as RdmRoleCode] ?? node.operatorRole}
                                  </span>
                                )}
                              </Space>
                              <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
                                {node.time}{node.remark ? ` · ${node.remark}` : ''}
                              </div>
                            </div>
                          ),
                        }))}
                      />
                    </>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {/* ════ 右侧：属性栏（同一信息只在这里出现一次） ════ */}
        <aside className="rdm-detail-side">
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><FileProtectOutlined /></span>
              屬性
              <span className="rdm-card-title-split" />
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto' }}
                onClick={() => setShowAllProps(v => !v)}
              >
                {showAllProps ? '收起' : '更多'}
              </Button>
            </div>
            <div className="rdm-prop-list">
              {/* 类型/优先级/规模统一走标签组件，与标题栏同一口径（历史旧码不会变裸文本或空白） */}
              <PropRow label="需求類型" value={<TypeTag reqType={detail.reqType} />} />
              <PropRow label="優先級" value={<PriorityTag priority={detail.priority} />} />
              {/* 历史旧编码统一走标签组件，与标题栏口径一致（不渲染成空白，也不裸文本） */}
              <PropRow label="預期規模" value={detail.complexity ? <ComplexityTag complexity={detail.complexity} /> : '待產品評估'} />
              <PropRow label="產品經理" value={detail.pmName ?? <span style={{ color: '#FF4D4F' }}>未分配</span>} />
              <PropRow label="業務驗收人" value={detail.acceptorName ?? detail.submitterName} />
              <PropRow label="業務期望" value={detail.expectDate ?? '未填寫'} />
              <PropRow label="承諾出 PRD" value={detail.promisedPrdDate ?? '未承諾'} />
              <PropRow label="計劃上線" value={detail.planReleaseDate ?? <span style={{ color: '#8C8C8C' }}>待排期</span>} />
              {/* 归属体系改造：项目与迭代是一等属性，不再收进「更多」里（有值即常显） */}
              <PropRow label="所屬項目" value={detail.projectId ? (
                <a style={{ color: '#2F54EB' }} onClick={() => navigate(`/rdm-project-detail?id=${detail.projectId}`)}>
                  {detail.projectName ?? `項目 #${detail.projectId}`}
                </a>
              ) : <span style={{ color: '#8C8C8C' }}>未掛項目</span>} />
              <PropRow label="所屬迭代" value={detail.iterationCode
                ? (detail.iterationName ? `${detail.iterationName} · ${detail.iterationCode}` : detail.iterationCode)
                : <span style={{ color: '#8C8C8C' }}>未關聯</span>} />
              {/* 交付流程：业务方提交时不选；准入后在分配/认领时由产研确定（默认 V3） */}
              <PropRow label="交付流程" value={
                detail.flowVersion === 3
                  ? 'V3 分批交付'
                  : (['pool', 'assigned', 'evaluating'].includes(detail.status)
                    ? <span style={{ color: '#E8720C' }}>V2 待產研確認（分配/認領時確定）</span>
                    : 'V2 整需求交付')
              } />
              {showAllProps && (
                <>
                  <PropRow label="技術負責人" value={detail.dispatcherName ?? '-'} />
                  <PropRow label="研發負責人" value={detail.devOwnerName ?? '-'} />
                  <PropRow label="分配時間" value={detail.distributeTime ?? '-'} />
                  <PropRow label="受理時間" value={detail.acceptTime ?? '-'} />
                  <PropRow label="實際上線" value={detail.actualReleaseDate ?? '-'} />
                  <PropRow label="關聯版本" value={detail.versionNo ?? '-'} />
                  <PropRow label="驗收結論" value={
                    (() => {
                      const raw = detail.acceptance?.result ?? detail.acceptanceResult
                      return raw ? (RDM_ACCEPT_RESULT_LABEL[raw as RdmAcceptResult] ?? raw) : '-'
                    })()
                  } />
                  <PropRow label="滿意度" value={detail.acceptanceScore != null ? `${detail.acceptanceScore} / 5` : '-'} />
                  <PropRow label="返工 / 變更 / 駁回" value={`${detail.reworkCount ?? 0} / ${detail.changeCount ?? 0} / ${detail.rejectCount ?? 0} 次`} />
                  <PropRow label="掛起復審" value={detail.onHoldUntil ?? '-'} />
                  <PropRow label="來源渠道" value={RDM_SOURCE_CHANNEL_LABEL[detail.sourceChannel as RdmSourceChannel] ?? detail.sourceChannel ?? '-'} />
                  <PropRow label="流程版本" value={detail.flowVersion ? `V${detail.flowVersion}` : '-'} />
                  {detail.parentReqNo && <PropRow label="來源需求" value={<span style={{ color: '#1890FF' }}>{detail.parentReqNo}</span>} />}
                  {/* V3 新增屬性 */}
                  {detail.requirementKind && (
                    <PropRow label="需求種類" value={
                      <Tag color={detail.requirementKind === 'aggregate' ? 'purple' : 'cyan'} style={{ margin: 0 }}>
                        {RDM_REQUIREMENT_KIND_LABEL[detail.requirementKind] ?? detail.requirementKind}
                      </Tag>
                    } />
                  )}
                  {detail.structureParentReqId && (
                    <PropRow label="主需求" value={
                      <a style={{ color: '#2F54EB' }} onClick={() => goDetail(detail.structureParentReqId!)}>
                        {detail.structureParentReqNo ?? `需求 #${detail.structureParentReqId}`}
                      </a>
                    } />
                  )}
                  {ancestors.length > 0 && (
                    <PropRow label="結構位置" value={
                      <Space size={2} wrap>
                        {ancestors.map((a, idx) => (
                          <span key={a.reqId} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            {idx > 0 && <RightOutlined style={{ fontSize: 10, color: '#BFBFBF' }} />}
                            <a style={{ color: '#2F54EB' }} onClick={() => goDetail(a.reqId)}>
                              {formatRdmReqNo(a.reqNo)}
                            </a>
                          </span>
                        ))}
                        <RightOutlined style={{ fontSize: 10, color: '#BFBFBF' }} />
                        <span style={{ color: '#595959' }}>本需求</span>
                      </Space>
                    } />
                  )}
                  {detail.flowVersion === 3 && detail.deliveryItemCount != null && (
                    <PropRow label="交付進度" value={`${detail.deliveryDoneCount ?? 0}/${detail.deliveryItemCount}`} />
                  )}
                </>
              )}
            </div>

            <div className="rdm-participant-block">
              <div className="rdm-participant-title">參與人（{participants.length}）</div>
              {participants.map(p => (
                <div key={p.userId} className="rdm-participant-row">
                  <span style={{ color: '#262626' }}>{p.name}</span>
                  <Space size={4} wrap style={{ marginLeft: 'auto' }}>
                    {p.roles.map(role => (
                      <Tag key={role} color="geekblue" style={{ margin: 0 }}>{RDM_ROLE_LABEL[role as RdmRoleCode] ?? role}</Tag>
                    ))}
                  </Space>
                  <span style={{ fontSize: 12, color: '#8C8C8C', width: 72, textAlign: 'right' }}>{p.empNo ?? '-'}</span>
                </div>
              ))}
              {participants.length === 0 && <div className="rdm-empty-hint">尚無參與人記錄</div>}
            </div>
          </div>
        </aside>
      </div>

      {/* ── 最后更新（详情页统一收尾，不再单开操作记录卡片）── */}
      <div className="rdm-detail-footer">
        <span>最後更新時間：<b>{detail.updatedAt ?? '-'}</b></span>
        {/* 與最後更新時間區分：這裡只統計狀態流轉，不包括 PRD/欄位編輯 */}
        <span title={t('rdm.reqDetail.lastFlowHint')}>
          {t('rdm.reqDetail.lastFlowLabel')}：<b>{detail.timeline[0]?.operatorName ?? '-'}</b>{detail.timeline[0] ? ` · ${detail.timeline[0].time}` : ''}
        </span>
      </div>

      {/* ── 底部操作栏：所有流转动作按全局规范放页面底部，主按钮靠右 ── */}
      <div className="form-footer rdm-detail-actions">
        <Button onClick={() => navigate(-1)}>返回</Button>
        {availableActions.length === 0 && (
          <div className="rdm-action-bar-locked">
            {detail.flowVersion === 3 && detail.status === RDM_STATUS.ACCEPTED
              ? 'V3 分批交付：需求層已受理，後續動作在交付項 / 發布批次中執行'
              : serverActions ? '你在這個環節沒有可執行動作' : '當前狀態無可執行動作'}
          </div>
        )}
        {RDM_ACCEPTANCE_OPEN_STATUS.includes(detail.status) && (
          <Button
            icon={<CheckCircleOutlined />}
            onClick={() => navigate(`/rdm-acceptance-form?id=${detail.id}&tab=gate`)}
          >
            {detail.status === RDM_STATUS.RELEASED || detail.status === RDM_STATUS.VERIFIED ? '業務驗收（已上線）' : '業務驗收'}
          </Button>
        )}
        {/* 归属体系改造：调整迭代（属性变更非流转，独立入口）——研发 bug/需求不足要放另外版本时直接换迭代 */}
        {ITERATION_ADJUSTABLE_STATUS.includes(detail.status as RdmStatus)
          && (hasPermission('rdm-requirement:edit') || hasPermission('rdm-requirement:dispatch')) && (
          <Button icon={<SwapOutlined />} onClick={openIterationModal}>調整迭代</Button>
        )}
        {/* 複製需求：流程版本鎖定後需要換交付方式的補捙路徑（生成草稿） */}
        {hasPermission('rdm-requirement:create') && (
          <Button icon={<CopyOutlined />} onClick={handleCopyRequirement}>複製需求</Button>
        )}
        {/* 原先收进「更多操作」下拉的动作全部平铺：藏在下拉里让人根本看不见能做什么 */}
        {otherActions.map(a => (
          <Button key={a.actionCode} danger={a.tone === 'danger'} onClick={() => openActionModal(a.actionCode)}>
            {a.actionName}
          </Button>
        ))}
        {/* 主按钮统一品牌橙实心（AGENTS §B.1）：绿/蓝等内联色不在按钮语义表内 */}
        {primaryAction && (
          <Button
            type="primary"
            icon={primaryAction.tone === 'success' ? <CheckCircleOutlined /> : <SendOutlined />}
            onClick={() => openActionModal(primaryAction.actionCode)}
          >
            {primaryAction.actionName}
          </Button>
        )}
      </div>

      {/*
        动作执行弹窗：二次确认 + 必填字段 + 补充说明一次做完。
        原先是「顶部按钮 → 就地展开面板填 → 确认执行 → 再弹一层 confirm」，入口与确认分两处。
      */}
      <Modal
        title={`確認執行「${activeActionName}」？`}
        open={!!activeAction}
        className="custom-confirm-modal"
        width={600}
        okText="確認執行"
        cancelText="取消"
        /* 驳回/退回/阻塞这类危险动作的确认按钮走红色 danger，其余保持品牌橙（AGENTS §B.1） */
        okButtonProps={{ danger: remarkRequired }}
        confirmLoading={saving}
        onOk={confirmAction}
        onCancel={resetActionForm}
      >
        <div className="confirm-info-card" style={{ marginBottom: 16 }}>
          <div className="confirm-info-row"><span>需求：</span><b>{formatRdmReqNo(detail.reqNo)} · {detail.title}</b></div>
          <div className="confirm-info-row"><span>當前狀態：</span><b>{RDM_STATUS_LABEL[detail.status as RdmStatus] ?? detail.status}</b></div>
          <div className="confirm-info-row">
            <span>執行後：</span>
            <b>{execActionRow ? RDM_STATUS_LABEL[execActionRow.toStatus as RdmStatus] ?? execActionRow.toStatus : '-'}</b>
          </div>
          {activeAction && ACTION_EFFECT_HINT[activeAction] && (
            <div className="confirm-info-row"><span>影響：</span><b>{ACTION_EFFECT_HINT[activeAction]}</b></div>
          )}
        </div>

        {(requiredFields.length > 0 || optionalFields.length > 0) && (
          <div className="rdm-action-modal-fields">
            {requiredFields.includes('pm') && (
              <div>
                <div className="rdm-action-modal-label">選擇產品經理 *</div>
                <Select
                  placeholder="輸入姓名搜索"
                  value={pmUserId}
                  onChange={setPmUserId}
                  showSearch
                  optionFilterProp="label"
                  loading={actionOptionsLoading}
                  options={pmOptions.map(pm => ({
                    value: pm.userId,
                    label: `${pm.name} · 在途 ${pm.activeCount}/${pm.capacity}`,
                  }))}
                />
              </div>
            )}
            {requiredFields.includes('promisedDate') && (
              <div>
                <div className="rdm-action-modal-label">承諾出 PRD 日期 *</div>
                <DatePicker style={{ width: '100%' }} value={promisedDate} onChange={setPromisedDate} />
              </div>
            )}
            {requiredFields.includes('planDate') && (
              <div>
                <div className="rdm-action-modal-label">計劃上線日期 *</div>
                <DatePicker style={{ width: '100%' }} value={planDate} onChange={setPlanDate} />
              </div>
            )}
            {requiredFields.includes('holdUntil') && (
              <div>
                <div className="rdm-action-modal-label">復審日期 *</div>
                <DatePicker style={{ width: '100%' }} value={holdUntil} onChange={setHoldUntil} />
              </div>
            )}
            {requiredFields.includes('versionNo') && (
              <div>
                <div className="rdm-action-modal-label">關聯上線版本 *</div>
                <AutoComplete
                  style={{ width: '100%' }}
                  value={versionNo}
                  onChange={v => setVersionNo(typeof v === 'string' ? v : undefined)}
                  options={versionOptions}
                  filterOption={(input, option) => (option?.label ?? '').includes(input)}
                />
                {!actionOptionsLoading && versionOptions.length === 0 && (
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{VERSION_FALLBACK_HINT}</div>
                )}
              </div>
            )}
            {/* 归属体系改造：项目选择（schedule 必填 / dispatch、accept 选填），迭代候选随项目联动 */}
            {(requiredFields.includes('project') || optionalFields.includes('project')) && (
              <div>
                <div className="rdm-action-modal-label">
                  所屬項目{requiredFields.includes('project') ? ' *' : '（選填，分配時可順手掛項目）'}
                </div>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  placeholder="選擇進行中的項目"
                  value={actionProjectId}
                  onChange={pid => {
                    setActionProjectId(pid)
                    // 换项目后已选迭代若不属于新项目则清空，避免提交时被后端一致性校验打回
                    if (iterationCode) {
                      const cur = iterations.find(i => i.code === iterationCode)
                      if (cur && cur.projectId != null && pid != null && cur.projectId !== pid) {
                        setIterationCode(undefined)
                      }
                    }
                  }}
                  loading={actionOptionsLoading}
                  notFoundContent="暫無可用項目"
                  options={projectOptions.map(p => ({ value: p.id, label: `${p.projectNo} · ${p.name}` }))}
                />
              </div>
            )}
            {(requiredFields.includes('iteration') || optionalFields.includes('iteration')) && (
              <div>
                <div className="rdm-action-modal-label">
                  所屬迭代{requiredFields.includes('iteration') ? ' *' : '（選填，選了才進產能對賬）'}
                </div>
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  value={iterationCode}
                  onChange={setIterationCode}
                  loading={actionOptionsLoading}
                  notFoundContent="暫無迭代，可先到「迭代排期」新建"
                  options={iterationOptionsFor(actionProjectId)}
                />
              </div>
            )}
            {requiredFields.includes('score') && (
              <div>
                <div className="rdm-action-modal-label">交付滿意度 *</div>
                <Rate value={score} onChange={setScore} />
              </div>
            )}
          </div>
        )}

        <div className="rdm-action-modal-label">
          {remarkRequired ? '說明 / 理由 *' : '補充說明'}
          {!remarkRequired && <span style={{ color: '#8C8C8C' }}>（選填，會寫進流轉記錄）</span>}
        </div>
        <RemarkTextArea
          placeholder={remarkRequired
            ? '駁回/退回時請寫清原因，便於業務理解'
            : '例：口徑已與財務確認，跨月對帳每月可省 6 人時'}
          value={remark}
          onChange={e => setRemark(e.target.value)}
        />
      </Modal>

      {/*
        调整迭代弹窗（归属体系改造）：项目+迭代联动选择，未完成任务由后端同步。
        场景：研发 bug / 需求不足要放另外版本，直接把需求换到其它迭代（对齐 Jira Move to sprint）。
      */}
      <Modal
        title="調整迭代"
        open={iterModalOpen}
        className="custom-confirm-modal"
        width={560}
        okText="確認調整"
        cancelText="取消"
        confirmLoading={iterModalSaving}
        okButtonProps={{ disabled: !iterModalCode }}
        onOk={submitChangeIteration}
        onCancel={() => setIterModalOpen(false)}
      >
        <div className="confirm-info-card" style={{ marginBottom: 16 }}>
          <div className="confirm-info-row"><span>需求：</span><b>{formatRdmReqNo(detail.reqNo)} · {detail.title}</b></div>
          <div className="confirm-info-row"><span>當前迭代：</span><b>{detail.iterationCode ?? '未掛'}</b></div>
        </div>
        <div className="rdm-action-modal-fields">
          <div>
            <div className="rdm-action-modal-label">所屬項目</div>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="選擇進行中的項目"
              value={iterModalProjectId}
              onChange={pid => {
                setIterModalProjectId(pid)
                // 换项目后已选迭代若不属于新项目则清空，避免提交被后端一致性校验打回
                if (iterModalCode) {
                  const cur = iterations.find(i => i.code === iterModalCode)
                  if (cur && cur.projectId != null && pid != null && cur.projectId !== pid) {
                    setIterModalCode(undefined)
                  }
                }
              }}
              loading={actionOptionsLoading}
              notFoundContent="暫無可用項目"
              options={projectOptions.map(p => ({ value: p.id, label: `${p.projectNo} · ${p.name}` }))}
            />
          </div>
          <div>
            <div className="rdm-action-modal-label">目標迭代 *</div>
            <Select
              style={{ width: '100%' }}
              placeholder="選擇要換入的迭代"
              value={iterModalCode}
              onChange={setIterModalCode}
              loading={actionOptionsLoading}
              notFoundContent="暫無迭代，可先到「迭代排期」新建"
              options={iterationOptionsFor(iterModalProjectId)}
            />
          </div>
        </div>
        <div className="rdm-action-modal-label" style={{ marginTop: 12 }}>
          調整原因<span style={{ color: '#8C8C8C' }}>（選填，會寫進流轉記錄）</span>
        </div>
        <RemarkTextArea
          placeholder="例：測試發現遺留缺陷，本迭代產能不足，順延到下一迭代"
          value={iterModalRemark}
          onChange={e => setIterModalRemark(e.target.value)}
        />
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
          調整後本需求下未完成的任務會同步換到目標迭代（已完成/已取消的任務保留歷史事實）。
        </div>
      </Modal>

      <Modal
        title="添加結構子需求"
        open={childModalOpen}
        onCancel={() => setChildModalOpen(false)}
        onOk={submitAddChild}
        okText="掛接"
        cancelText="取消"
        confirmLoading={childSubmitting}
        okButtonProps={{ disabled: !childSelected }}
      >
        <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
          從本項目下的執行需求中選擇一條掛到本聚合需求下；已掛接的需求不會重複出現。
        </div>
        <Select
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          loading={childCandidatesLoading}
          placeholder={childCandidates.length === 0 && !childCandidatesLoading ? '暫無可掛接的執行需求' : '選擇執行需求'}
          value={childSelected}
          onChange={setChildSelected}
          options={childCandidates}
          notFoundContent={childCandidatesLoading ? <Spin size="small" /> : '無匹配需求'}
        />
      </Modal>
    </div>
  )
}

/** 小节标题（关联文档用，与 RequirementSections 内的样式一致） */
function SectionTitleDocs({ count }: { count: number }) {
  return (
    <div className="rdm-section-title">
      <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><LinkOutlined /></span>
      關聯文檔（{count}）
      <span className="rdm-card-title-split" />
      <span className="rdm-todo-hint">正文存於文檔中心，點擊標題在系統內查閱</span>
    </div>
  )
}

/** 关联文档列 */
function docColumns(navigate: (path: string) => void): TableColumnsType<DocNode> {
  return [
    {
      title: '文檔', dataIndex: 'title', key: 'title',
      render: (v: string, r) => <a style={{ color: '#E8720C' }} onClick={() => navigate(`/doc-center/detail?id=${r.id}`)}>{v}</a>,
    },
    { title: '類型', dataIndex: 'docType', key: 'docType', width: 100, render: (v: string, r) => <Tag style={{ margin: 0 }}>{r.docTypeLabel ?? v}</Tag> },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 110,
      render: (v: string, r) => <Tag color={DOC_STATUS_COLOR[v as DocStatus]} style={{ margin: 0 }}>{r.statusLabel ?? v}</Tag>,
    },
    { title: '負責人', dataIndex: 'ownerName', key: 'ownerName', width: 110 },
    { title: '更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
  ]
}

/** 准入审批策略与轮次（放在「更多记录」：正在审批时处理条已给直达入口） */
function IntakePolicySection({ detail, navigate }: {
  detail: RdmRequirementDetail
  navigate: (path: string) => void
}) {
  return (
    <>
      <div className="rdm-section-title">
        <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AuditOutlined /></span>
        需求準入審批
        <span className="rdm-card-title-split" />
        {detail.intakeFlowNo && (
          <Button
            type="link"
            size="small"
            icon={<RightOutlined />}
            style={{ padding: 0, height: 'auto' }}
            onClick={() => navigate(`/approval-detail?flowNo=${encodeURIComponent(detail.intakeFlowNo ?? '')}&type=rdm_intake`)}
          >
            前往審批單
          </Button>
        )}
      </div>
      {(detail.intakePolicyName || detail.intakeRoundNo) && (
        <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
          命中策略：{detail.intakePolicyName || '默認策略'}（版本 {detail.intakePolicyVersion || 'v1'}）
          {detail.intakeRoundNo ? ` · 第 ${detail.intakeRoundNo} 輪提交` : ''}
          {detail.intakeMode ? ` · 裁決 ${RDM_INTAKE_MODE_LABEL[detail.intakeMode as keyof typeof RDM_INTAKE_MODE_LABEL] ?? detail.intakeMode}` : ''}
        </div>
      )}
      {detail.approvalNodes.length === 0 && (
        <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>
          {detail.intakeFlowNo
            ? '審批節點載入中，可點「前往審批單」到 OA 審批中心處理。'
            : (detail.needApproval === 0
              ? '本輪按準入策略免審直送技術部（裁定依據見下方命中鏈路）。'
              : '本單尚未發起準入審批（草稿或未經提交）。')}
        </div>
      )}
      {detail.intakeExplain && detail.intakeExplain.length > 0 && (
        <ul className="rdm-judge-list">
          {detail.intakeExplain.map((line, idx) => <li key={idx}>{line}</li>)}
        </ul>
      )}
      {detail.approvalNodes.map((node, idx) => {
        const meta = APPROVAL_STATUS_LABEL[node.status] ?? { text: node.status, color: 'default' }
        return (
          <div key={idx} className="rdm-risk-item">
            <Tag color={meta.color} style={{ margin: 0 }}>{meta.text}</Tag>
            <span>{node.nodeName}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8C8C8C' }}>
              {node.approverName}{node.time ? ` · ${dayjs(node.time).format('MM-DD HH:mm')}` : ''}
            </span>
          </div>
        )
      })}
      {detail.approvalNodes[0]?.comment && (
        <div style={{ fontSize: 12, color: '#595959', marginTop: 6 }}>審批意見：{detail.approvalNodes[0].comment}</div>
      )}
    </>
  )
}

/** 属性行 */
function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rdm-prop-row">
      <span className="rdm-prop-label">{label}</span>
      <span className="rdm-prop-value">{value}</span>
    </div>
  )
}

/**
 * 长正文折叠块。
 * <p>历史需求的「现状与痛点」常有几百字，整段铺开会把附件、定位和操作推到多屏之后；
 * 用 hover 展开会造成鼠标扫过就跳版，所以改成显式的「展開/收起」按钮，
 * 且只在真的超过阈值时才出现按钮。
 */
const CLAMP_THRESHOLD = 220

function CollapsibleText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > CLAMP_THRESHOLD
  const collapsed = long && !expanded

  return (
    <div>
      <div className={`rdm-desc-block${collapsed ? ' rdm-clamped' : ''}`}>{text}</div>
      {long && (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', marginTop: 4, fontSize: 12 }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '收起' : `展開全文（${text.length} 字）`}
        </Button>
      )}
    </div>
  )
}

/** 内容分块小标题 */
function BlockLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 12, color: '#8C8C8C', margin: '12px 0 6px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 3, height: 12, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
      {text}
    </div>
  )
}
