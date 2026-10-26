import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Button, Input, Tag, Empty, Dropdown, Modal, message, Drawer, Progress, Spin, Tooltip, Popover, Select } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useMenu } from '@/contexts/MenuContext'
import { fetchPortalContext, type PortalSystem } from '@/api/portal'
import { useCurrentSystem } from '@/hooks/useCurrentSystem'
import { useRotatingMotivationQuote } from '@/hooks/useMotivationQuote'
import { useSystemNavigation } from '@/hooks/useSystemNavigation'
import { getSystemDisplayName } from '@/constants/portalSystems'
import { renderMenuIcon } from '@/components/MenuIcon'
import { fetchQuickFavorites, saveQuickFavorites, fetchAiSettings, saveAiSettings } from '@/api/auth'
import type { AiSettings } from '@/api/auth'
import { pinyin } from 'pinyin-pro'
import { translateMenuName } from '@/i18n/menuNameEn'
import PikachuFace from '@/components/PikachuFace'
import AiLogo from '@/components/AiLogo'
import ContextUsageIndicator from './ContextUsageIndicator'
import TodayMeetingCard, { TodayMeetingRestoreChip } from './TodayMeetingCard'
import { useTodayMeetingBar } from './useTodayMeetingBar'
import { FAV_KEY, loadFavorites, defaultFavorites, MAX_FAVORITES, collectHomeMenus, chineseNameToPinyinEnglish, getGreeting, MAX_IMAGE_SIZE, MAX_FILE_SIZE, DIM_SOURCE_COLOR, DIM_SOURCE_LABEL_KEY } from './homeUtils'
import AiRichText from './AiRichText'
import AgentViewCard from './AgentViewCard'
import AgentActionCard from './AgentActionCard'
import { MyMemoryDrawer, RememberMemoryModal } from './MyMemory'
import { submitFeedback } from '@/api/aiFeedback'
import { fetchVisibleQuickPrompts } from '@/api/aiQuickPrompt'
import HelpPopover from '@/components/HelpPopover'
import type { AiBlockReason } from './homeUtils'
import {
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  AccountBookOutlined,
  FileSearchOutlined,
  SwapOutlined,
  AuditOutlined,
  WalletOutlined,
  DatabaseOutlined,
  FireOutlined,
  CheckCircleOutlined,
  FontSizeOutlined,
  LineChartOutlined,
  ShoppingOutlined,
  SendOutlined,
  UserOutlined,
  ThunderboltOutlined,
  DownOutlined,
  LockOutlined,
  InfoCircleOutlined,
  PaperClipOutlined,
  CloseCircleOutlined,
  PictureOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MessageOutlined,
  SettingOutlined,
  CheckOutlined,
  UndoOutlined,
  ReloadOutlined,
  BulbOutlined,
  SaveOutlined,
  LikeOutlined,
  DislikeOutlined,
} from '@ant-design/icons'
import { sendAgentMessage, fetchEngineStatus, probeEngineStatus, getEngineMode, setEngineMode, getContextWindowOptions, formatContextWindow } from '@/api/agent'
import type { ChatMessage, ChatAttachment, LlmEngineStatus, LlmEngineMode, LlmRequestOptions, ThinkingDepth, AgentPendingAction } from '@/api/agent'
import { fetchMyQuotaUsage, fetchMyModels, fetchQuotaCheck, currencySymbol, formatNumber, formatCost } from '@/api/aiMyCenter'
import type { MyQuotaUsage, MyModel, QuotaDimension, QuotaSource, QuotaCheckResult } from '@/api/aiMyCenter'
import { fetchConversations, createConversation, updateConversation, deleteConversation, fetchDeletedConversations, restoreConversation, permanentDeleteConversation, serializeChatMessages, parseConversation, summarizeConversation } from '@/api/aiConversation'
import type { AiConversation } from '@/api/aiConversation'
import type { Conversation } from '@/api/aiConversation'
import './index.css'

/** 菜单分组英文名（英文模式查映射） */
const GROUP_NAME_EN: Record<string, string> = {
  '推廣金管理': 'Promotion Funds',
  '商戶通對賬': 'Merchant Reconciliation',
  '審批管理': 'Approval Management',
  '搜索配置': 'Search Config',
  '搜索引导': 'Search Guide',
  '搜索词库': 'Search Library',
  '報表統計': 'Reports',
  '商家推广工具': 'Merchant Promotion Tools',
  '推广通': 'Promotion Pass',
}

/**
 * 快捷入口图标映射（menuKey → 图标）
 *
 * 菜单名称/路径/分组的唯一真值源是后端菜单树（sys_menu）, 本页不再维护菜单名副本；
 * 后端 icon 字段缺失时（旧数据/新建菜单）按本表兜底展示图标。
 */
const MENU_ICON_BY_KEY: Record<string, React.ReactNode> = {
  'account-balance': <AccountBookOutlined />,
  'batch-query': <SearchOutlined />,
  'detail-query': <FileSearchOutlined />,
  'writeoff-reconcile': <AuditOutlined />,
  'debt-reconcile': <CheckCircleOutlined />,
  'approval-center': <AuditOutlined />,
  'hint-config': <FontSizeOutlined />,
  'hot-search-config': <FireOutlined />,
  'word-segmentation': <DatabaseOutlined />,
  'synonym-config': <SwapOutlined />,
  'hot-search-library': <FireOutlined />,
  'hint-report': <LineChartOutlined />,
  'hot-search-report': <LineChartOutlined />,
  'promotion-dashboard': <LineChartOutlined />,
  'promotion-algorithm': <DatabaseOutlined />,
  'promotion-slot-config': <SwapOutlined />,
  'promotion-waterfall': <WalletOutlined />,
  'promotion-sales-config': <ShoppingOutlined />,
  'promotion-report-overview': <LineChartOutlined />,
  'promotion-report-order': <LineChartOutlined />,
  'promotion-report-compare': <LineChartOutlined />,
}



/** 引擎模型 ID → 展示縮寫（膠囊位窄，只顯示供應商縮寫，完整名在下拉菜單） */
const ENGINE_LABELS: Record<string, string> = {
  'qwen3.7-flash': 'QW',
  'deepseek-chat': 'DS',
  'deepseek-v4-flash': 'DS',
  'deepseek-v4-pro': 'DS Pro',
}

/** 内建工具 toolKey → i18n 展示名（与后端 AgentTool.toolKey 同名） */
const TOOL_NAME_KEYS: Record<string, string> = {
  query_account_balance: 'home.toolNameAccountBalance',
  query_approvals: 'home.toolNameApprovals',
  query_batches: 'home.toolNameBatches',
  rdm_list_projects: 'home.toolNameRdmProjects',
  rdm_project_progress: 'home.toolNameRdmProjectProgress',
  rdm_list_iterations: 'home.toolNameRdmIterations',
  rdm_query_requirements: 'home.toolNameRdmRequirements',
  rdm_requirement_detail: 'home.toolNameRdmRequirementDetail',
  rdm_my_todos: 'home.toolNameRdmTodos',
  rdm_person_workload: 'home.toolNameRdmPersonWorkload',
  rdm_stats_overview: 'home.toolNameRdmStats',
  rdm_risks: 'home.toolNameRdmRisks',
  rdm_list_tasks: 'home.toolNameRdmTasks',
  rdm_prepare_progress_push: 'home.toolNameRdmPush',
  search_knowledge: 'home.toolNameKnowledge',
  lookup_glossary: 'home.toolNameGlossary',
}



/** 未開通原因 → Hero 引導卡標題 i18n key（標題直接突出缺失項） */
const BLOCKED_TITLE_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedNoModelsTitle',
  'no-quota': 'home.aiBlockedNoQuotaTitle',
  'no-both': 'home.aiBlockedNoBothTitle',
  'quota-exhausted': 'home.aiQuotaExhaustedTitle',
  'needs-approval': 'home.aiNeedsApprovalTitle',
  'check-failed': 'home.aiCheckFailedTitle',
}

/** 未開通原因 → Hero 引導卡描述 i18n key */
const BLOCKED_DESC_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedNoModelsDesc',
  'no-quota': 'home.aiBlockedNoQuotaDesc',
  'no-both': 'home.aiBlockedNoBothDesc',
  'quota-exhausted': 'home.aiQuotaExhaustedDesc',
  'needs-approval': 'home.aiNeedsApprovalDesc',
  'check-failed': 'home.aiCheckFailedDesc',
}

/** 未開通原因 → 模型選擇下拉面板標題/描述 i18n key */
const ENGINE_PANEL_TITLE_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.enginePanelNoModelsTitle',
  'no-quota': 'home.enginePanelNoQuotaTitle',
  'no-both': 'home.enginePanelNoBothTitle',
  'quota-exhausted': 'home.aiQuotaExhaustedTitle',
  'needs-approval': 'home.aiNeedsApprovalTitle',
  'check-failed': 'home.aiCheckFailedTitle',
}
const ENGINE_PANEL_DESC_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.enginePanelNoModelsDesc',
  'no-quota': 'home.enginePanelNoQuotaDesc',
  'no-both': 'home.enginePanelNoBothDesc',
  'quota-exhausted': 'home.aiQuotaExhaustedDesc',
  'needs-approval': 'home.aiNeedsApprovalDesc',
  'check-failed': 'home.aiCheckFailedDesc',
}



export default function Home() {
  const navigate = useNavigate()
  const { t, i18n: i18nInstance } = useTranslation()
  const { user, hasMenuPermission } = useAuth()
  const { currentSystemCode } = useCurrentSystem()
  // 会议栏数据/收起状态提升到页面层：收起后整栏不占行高，恢复入口在问候栏右侧
  const meetingBar = useTodayMeetingBar()
  const systemNavigation = useSystemNavigation(currentSystemCode)
  const [systems, setSystems] = useState<PortalSystem[]>([])

  useEffect(() => {
    let cancelled = false
    fetchPortalContext().then((context) => {
      if (cancelled) return
      setSystems(context.systems ?? [])
    }).catch(() => {
      if (!cancelled) setSystems([])
    })
    return () => { cancelled = true }
  }, [user?.username])

  const getSystemName = (system: PortalSystem) => getSystemDisplayName(t, system, i18nInstance.language)
  const currentSystem = systems.find((system) => system.code === currentSystemCode)
  const systemName = currentSystemCode
    ? getSystemName(currentSystem ?? { code: currentSystemCode, name: currentSystemCode })
    : '個人工作台'
  const isAiCenter = currentSystemCode === 'ai'

  useEffect(() => {
    setSearchText('')
    setShowAddMenu(false)
  }, [currentSystemCode])
  const [searchText, setSearchText] = useState('')
  const [favorites, setFavorites] = useState<string[]>(defaultFavorites)
  /** 标记首次加载（后端/localStorage）是否已完成，防止挂载时默认值覆盖云端数据 */
  const favoritesLoadedRef = useRef(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const { menuTree, status: menuStatus, refresh: refreshMenus } = useMenu()
  const menusLoading = currentSystemCode
    ? systemNavigation.loading || (!systemNavigation.loaded && !systemNavigation.error)
    : menuStatus === 'loading'
  const menusError = currentSystemCode
    ? !!systemNavigation.error
    : menuStatus === 'offline' || menuStatus === 'error'
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  /* ── 多会话状态 ── */
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [deletedConversations, setDeletedConversations] = useState<AiConversation[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  /** 消息排队队列（最多 3 条） */
  const [messageQueue, setMessageQueue] = useState<{ id: string; text: string; attachments: ChatAttachment[] }[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ── 附件状态 ── */
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  /** 当前活跃会话 */
  const activeConversation = conversations.find((c) => c.id === activeConvId)
  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation])

  /** 加载会话列表 */
  useEffect(() => {
    let cancelled = false
    fetchConversations().then((list) => {
      if (cancelled) return
      // 必须走 parseConversation：以前这里自己手写了一遍字段列表（注释还写着“复用”），
      // 新增 toolTraces 后只有这条路径没加，导致刷新时工具痕迹被静默丢弃（实测字段比对报出）
      const parsed = list.map((c) => parseConversation(c))
      setConversations(parsed)
      // 默认激活最新会话，若无则自动创建一个
      if (parsed.length > 0) {
        setActiveConvId(parsed[0].id)
      } else {
        handleCreateConversation()
      }
    }).catch(() => {
      // 后端不可用，创建一个本地会话
      if (!cancelled) {
        const localConv: Conversation = { id: Date.now(), title: '新對話', messages: [], totalTokens: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        setConversations([localConv])
        setActiveConvId(localConv.id)
      }
    })
    return () => { cancelled = true }
  }, [])

  /** 新建会话 */
  const handleCreateConversation = async () => {
    try {
      const conv = await createConversation()
      const newConv: Conversation = { id: conv.id, title: conv.title, messages: [], totalTokens: conv.totalTokens ?? 0, createdAt: conv.createdAt, updatedAt: conv.updatedAt }
      setConversations((prev) => [newConv, ...prev])
      setActiveConvId(newConv.id)
    } catch {
      // 后端不可用，本地创建
      const localConv: Conversation = { id: Date.now(), title: '新對話', messages: [], totalTokens: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setConversations((prev) => [localConv, ...prev])
      setActiveConvId(localConv.id)
    }
  }

  /** 删除会话 */
  const handleDeleteConversation = async (convId: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (conversations.length <= 1) {
      message.warning(t('home.convDeleteLast'))
      return
    }
    Modal.confirm({
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('home.convDeleteConfirm'),
      centered: true,
      className: 'custom-confirm-modal',
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteConversation(convId)
        } catch { /* 后端不可用静默 */ }
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== convId)
          if (activeConvId === convId && next.length > 0) {
            setActiveConvId(next[0].id)
          }
          return next
        })
        // 刷新回收站列表
        loadDeletedConversations()
      },
    })
  }

  /** 加载回收站列表 */
  const loadDeletedConversations = async () => {
    try {
      const list = await fetchDeletedConversations()
      setDeletedConversations(list)
    } catch { /* 后端不可用静默 */ }
  }

  /** 恢复已删除的会话 */
  const handleRestoreConversation = async (convId: number) => {
    try {
      await restoreConversation(convId)
      message.success(t('home.convRestored'))
      // 重新加载活跃会话列表和回收站
      const [activeList, deletedList] = await Promise.all([
        fetchConversations(),
        fetchDeletedConversations(),
      ])
      const parsed = activeList.map((c) => {
        let msgs: ChatMessage[] = []
        try {
          const raw: any[] = JSON.parse(c.messages) // eslint-disable-line @typescript-eslint/no-explicit-any
          if (Array.isArray(raw)) {
            msgs = raw.map((m) => ({
              id: m.id as string,
              role: m.role as 'user' | 'assistant',
              content: m.content as string,
              attachments: m.attachments as ChatAttachment[] | undefined,
              timestamp: m.timestamp ? new Date(m.timestamp as string) : new Date(),
            }))
          }
        } catch { /* 损坏数据回退空 */ }
        return { id: c.id, title: c.title, messages: msgs, totalTokens: c.totalTokens ?? 0, createdAt: c.createdAt, updatedAt: c.updatedAt } as Conversation
      })
      setConversations(parsed)
      setDeletedConversations(deletedList)
      // 切换到恢复的会话
      setActiveConvId(convId)
    } catch {
      message.error(t('common.error'))
    }
  }

  /** 永久删除会话 */
  const handlePermanentDelete = (convId: number) => {
    Modal.confirm({
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('home.convPermanentDeleteConfirm'),
      centered: true,
      className: 'custom-confirm-modal',
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await permanentDeleteConversation(convId)
          message.success(t('home.convPermanentDeleted'))
          setDeletedConversations((prev) => prev.filter((c) => c.id !== convId))
        } catch {
          message.error(t('common.error'))
        }
      },
    })
  }

  /** 更新活跃会话的消息（debounce 保存到后端；opts.immediate 用于回复完成那一轮，不等防抖窗口） */
  const updateActiveMessages = useCallback((
    updater: (prev: ChatMessage[]) => ChatMessage[],
    opts?: { immediate?: boolean },
  ) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeConvId)
      if (idx === -1) return prev
      const updated = [...prev]
      const conv = { ...updated[idx], messages: updater(updated[idx].messages), updatedAt: new Date().toISOString() }
      // 自动更新标题：取第一条用户消息的前 20 个字符
      if (conv.messages.length > 0 && conv.title === '新對話') {
        const firstUser = conv.messages.find((m) => m.role === 'user')
        if (firstUser) conv.title = firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '')
      }
      updated[idx] = conv
      // debounce 保存到后端；回复完成那一轮要立即落库，不能等 2 秒：
      // 实测用户在回复后 2 秒内刷新时，最后一条 assistant 消息（含工具痕迹）会丢
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        updateConversation(conv.id, {
          title: conv.title,
          messages: serializeChatMessages(conv.messages),
        }).catch(() => { /* 静默失败 */ })
      }, opts?.immediate ? 0 : 2000)
      return updated
    })
  }, [activeConvId])

  /** 确认卡状态变化后回写消息并立即落库，刷新后不丢“已发送/已取消”状态 */
  const handleActionUpdated = useCallback((messageId: string, actionId: number, next: AgentPendingAction) => {
    updateActiveMessages((prev) => prev.map((m) => m.id === messageId ? {
      ...m,
      pendingActions: (m.pendingActions ?? []).map((a) => a.id === actionId ? { ...a, ...next } : a),
    } : m), { immediate: true })
  }, [updateActiveMessages])

  /* ── 记忆 / 反馈（二期）── */
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [rememberOpen, setRememberOpen] = useState(false)
  const [rememberText, setRememberText] = useState('')
  const [feedbackTarget, setFeedbackTarget] = useState<ChatMessage | null>(null)
  const [feedbackReason, setFeedbackReason] = useState<string | undefined>(undefined)

  const openRemember = useCallback((msg: ChatMessage) => {
    setRememberText(msg.content.slice(0, 500))
    setRememberOpen(true)
  }, [])

  const handleFeedback = useCallback(async (msg: ChatMessage, rating: 1 | -1, reason?: string) => {
    try {
      await submitFeedback({
        conversationPk: activeConvId ?? undefined,
        messageId: msg.id,
        rating,
        reason,
        answerPreview: msg.content.slice(0, 500),
        toolKeys: (msg.toolTraces ?? []).map((tr) => tr.toolKey).join(','),
      })
      updateActiveMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, feedback: rating } : m), { immediate: true })
      message.success(t('home.feedbackThanks', { defaultValue: '感謝反饋' }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('home.feedbackFailed', { defaultValue: '反饋提交失敗' }))
    }
  }, [activeConvId, updateActiveMessages, t])

  /* ── 當前引擎（模型通道 / 使用權限）── */
  const [engine, setEngine] = useState<LlmEngineStatus | null>(null)

  /* ── 上下文窗口 & 思考模式設定 ── */
  const [contextWindow, setContextWindow] = useState<number | null>(null)
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>('xhigh')
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 快捷提問彈層：選中一條即回填輸入框並收起，避免彈層擋住聊天區 */
  const [quickOpen, setQuickOpen] = useState(false)
  /** 标记 AI 设置首次加载（后端/localStorage）是否已完成，防止挂载时默认值覆盖云端数据 */
  const aiSettingsLoadedRef = useRef(false)
  const aiSettingsSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  /* ── 我的用量 ── */
  const [usageOpen, setUsageOpen] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)
  const [myUsage, setMyUsage] = useState<MyQuotaUsage | null>(null)

  /* ── 我的授權模型與網關已接入模型（modelKey → 引擎模式） ── */
  const [myModels, setMyModels] = useState<MyModel[]>([])
  const [connectedModels, setConnectedModels] = useState<Record<string, LlmEngineMode>>({})

  /* ── 開通狀態判定依據（接口成功返回才置 true，網絡故障不誤判為未開通） ── */
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [usageLoaded, setUsageLoaded] = useState(false)

  /* ── 配額校驗結果（後端綜合所有維度給出處置動作） ── */
  const [quotaCheck, setQuotaCheck] = useState<QuotaCheckResult | null>(null)
  const [quotaCheckLoaded, setQuotaCheckLoaded] = useState(false)
  /** 额度校验接口本身是否失败（且从未拿到任何结果）——驱动 fail-closed 拦截态 */
  const [quotaCheckFailed, setQuotaCheckFailed] = useState(false)

  /** 打開「我的用量」抽屜（每次打開重新拉取，與能耗統計同源） */
  const handleOpenUsage = () => {
    setUsageOpen(true)
    setUsageLoading(true)
    fetchMyQuotaUsage()
      .then((data) => { setMyUsage(data); setUsageLoaded(true) })
      .catch(() => { /* 靜默失敗：保留上次數據，不影響開通態判定 */ })
      .finally(() => setUsageLoading(false))
  }

  /**
   * 被限制的通道：取代理側 /api/llm/status 回傳的 denied（primary/off-peak）
   * 代理已用登錄 JWT 回源後端換取賬號並讀白名單計算，前端不再自行判定權限，
   * 只消費服務端結論做彈窗告知；真正的攔截發生在代理側（改本地數據也繞不過）
   */
  const deniedChannels = useMemo(() => engine?.denied ?? [], [engine])

  /**
   * 未開通判定（僅在接口成功返回後下結論，網絡故障不誤傷正常用戶）：
   * - 無授權模型 = 無模型權限（模型權限是使用前提）
   * - 無任何額度配置 = 無可用額度，同樣不可用
   * - 後端配額校驗結果優先：reject → quota-exhausted，approve → needs-approval
   * - 前端兆底：所有维度 100% → quota-exhausted
   * 多種原因分開提示，引導用戶聯繫管理員開通對應權限
   */
  const noModels = modelsLoaded && myModels.length === 0
  // 内置系统管理员（unlimited）没有额度维度属正常，不能判成「未配置额度」
  const noQuota = usageLoaded && !myUsage?.unlimited && (myUsage?.dimensions.length ?? 0) === 0
  
  // 前端兆底：所有维度都已达到或超过 100%（当后端校验未加载时使用）
  const quotaExhaustedFallback = useMemo(() => {
    if (!usageLoaded || !myUsage || myUsage.dimensions.length === 0) return false
    return myUsage.dimensions.every((dim) => {
      const quota = Number(dim.quotaValue) || 0
      const used = Number(dim.usedValue) || 0
      if (quota <= 0) return false
      return used >= quota
    })
  }, [usageLoaded, myUsage])
  
  // 降级模式：后端返回 action=downgrade 时启用，允许发送但显示标识
  const downgradeMode = quotaCheckLoaded && quotaCheck?.action === 'downgrade'
  
  // 综合判定 blockReason：后端配额校验优先，前端兆底兜底
  const blockReason: AiBlockReason | null = useMemo(() => {
    // 模型权限是使用前提：无授权模型时无论配额校验结果如何都必须阻塞
    if (noModels) {
      return noQuota ? 'no-both' : 'no-models'
    }
    // 后端配额校验结果优先（已加载时以服务端结论为准）
    if (quotaCheckLoaded && quotaCheck) {
      if (quotaCheck.action === 'reject') {
        // quotaConfigured=false：从未配过额度，引导去「AI 使用申請」；
        // 否则是已有额度但用完了，引导申请加量。两种文案不能混。
        return quotaCheck.quotaConfigured === false ? 'no-quota' : 'quota-exhausted'
      }
      if (quotaCheck.action === 'approve') return 'needs-approval'
      // downgrade / allow → 不阻塞
      return null
    }
    // 校验接口本身失败且从未拿到任何结果 → fail-closed，不得静默当作可用
    if (quotaCheckFailed && !quotaCheckLoaded) return 'check-failed'
    // 后端未返回时，前端兆底判定
    if (noQuota) return 'no-quota'
    return quotaExhaustedFallback ? 'quota-exhausted' : null
  }, [noModels, noQuota, quotaCheckLoaded, quotaCheck, quotaCheckFailed, quotaExhaustedFallback])
  const aiBlocked = blockReason !== null

  /** 定時刷新引擎路由結果（手動切換 / 代理重啟後同步到膠囊） */
  useEffect(() => {
    let cancelled = false
    const load = () => fetchEngineStatus().then((s) => { if (!cancelled) setEngine(s) })
    load()
    const timer = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  /** 加載我的授權模型；並分別探測兩條通道得到網關真實接入的模型清單 */
  useEffect(() => {
    let cancelled = false
    fetchMyModels()
      .then((list) => { if (!cancelled) { setMyModels(list); setModelsLoaded(true) } })
      .catch(() => { /* 靜默失敗：下拉回退空態提示，不參與開通態判定 */ })
    Promise.all([probeEngineStatus('primary'), probeEngineStatus('off-peak')]).then(([primary, offPeak]) => {
      if (cancelled) return
      const map: Record<string, LlmEngineMode> = {}
      // 僅記錄通道真實匹配的模型：off-peak 未配置時代理會回落到 primary，
      // 若不校驗 channel 會把 primary 的模型誤標為 off-peak，導致點擊時觸發無權限彈窗
      if (primary?.model && primary.channel === 'primary') map[primary.model] = 'primary'
      if (offPeak?.model && offPeak.channel === 'off-peak') map[offPeak.model] = 'off-peak'
      setConnectedModels(map)
    })
    return () => { cancelled = true }
  }, [])

  /** 从后端加载当前用户的快捷入口（后端不可用或返回空时回退 localStorage） */
  useEffect(() => {
    let cancelled = false
    const loadFromLocal = () => {
      if (!cancelled && user?.username) {
        const cached = loadFavorites(user.username)
        setFavorites(cached)
      }
    }
    fetchQuickFavorites().then((keys) => {
      if (cancelled) return
      if (keys && keys.length > 0) {
        setFavorites(keys)
      } else {
        // 后端返回空，回退 localStorage
        loadFromLocal()
      }
    }).catch(() => {
      // 后端不可用，回退 localStorage
      loadFromLocal()
    }).finally(() => {
      if (!cancelled) favoritesLoadedRef.current = true
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 从后端加载当前用户的 AI 助手偏好设置（后端不可用或返回空时回退 localStorage） */
  useEffect(() => {
    let cancelled = false
    const AI_SETTINGS_LS_KEY = `ai_settings:${user?.username ?? ''}`
    const loadFromLocal = () => {
      if (!cancelled && user?.username) {
        try {
          const raw = localStorage.getItem(AI_SETTINGS_LS_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as AiSettings
            if (parsed.engineMode) setEngineMode(parsed.engineMode)
            if (parsed.contextWindow) setContextWindow(parsed.contextWindow)
            if (parsed.thinkingEnabled !== undefined) setThinkingEnabled(parsed.thinkingEnabled)
            if (parsed.thinkingDepth) setThinkingDepth(parsed.thinkingDepth)
          }
        } catch { /* 损坏数据忽略，使用默认值 */ }
      }
    }
    fetchAiSettings().then((settings) => {
      if (cancelled) return
      if (settings && Object.keys(settings).length > 0) {
        // 后端有数据，应用到状态
        if (settings.engineMode) setEngineMode(settings.engineMode)
        if (settings.contextWindow) setContextWindow(settings.contextWindow)
        if (settings.thinkingEnabled !== undefined) setThinkingEnabled(settings.thinkingEnabled)
        if (settings.thinkingDepth) setThinkingDepth(settings.thinkingDepth)
      } else {
        // 后端返回空，回退 localStorage
        loadFromLocal()
      }
    }).catch(() => {
      // 后端不可用，回退 localStorage
      loadFromLocal()
    }).finally(() => {
      if (!cancelled) aiSettingsLoadedRef.current = true
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 持久化 AI 设置：防抖写后端 + localStorage */
  useEffect(() => {
    if (!aiSettingsLoadedRef.current) return // 首次加载未完成前不写回
    if (!user?.username) return
    // 防抖 1 秒，避免用户快速切换时频繁请求
    if (aiSettingsSaveTimerRef.current) clearTimeout(aiSettingsSaveTimerRef.current)
    aiSettingsSaveTimerRef.current = setTimeout(() => {
      const settings: AiSettings = {
        engineMode: getEngineMode(),
        contextWindow,
        thinkingEnabled,
        thinkingDepth,
      }
      // 同时写 localStorage 作为离线缓存
      localStorage.setItem(`ai_settings:${user.username}`, JSON.stringify(settings))
      saveAiSettings(settings).catch(() => { /* 后端不可用时仅保留 localStorage */ })
    }, 1000)
    return () => {
      if (aiSettingsSaveTimerRef.current) clearTimeout(aiSettingsSaveTimerRef.current)
    }
  }, [contextWindow, thinkingEnabled, thinkingDepth, engine?.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // 后端菜单树已从 MenuContext 共享获取，无需单独 fetch

  /** 初始加載我的用量數據（用於資訊條與開通態判定） */
  useEffect(() => {
    let cancelled = false
    fetchMyQuotaUsage().then((data) => {
      if (!cancelled) { setMyUsage(data); setUsageLoaded(true) }
    }).catch(() => { /* 靜默失敗，不影響首頁加載，不參與開通態判定 */ })
    return () => { cancelled = true }
  }, [])

  /**
   * 额度校验拉取（综合所有维度给出处置动作），供首屏、60s 轮询与手动重试共用。
   *
   * 失败时必须置 quotaCheckFailed：旧实现只留一行注释就静默吞掉错误，
   * 使 blockReason 落到 `return null` 的 fail-open 分支——后端已经会拒，但界面看起来可用，
   * 用户敲下去才报错。成功时才清位，避免 60s 轮询开始时闪一下未拦截态。
   */
  const loadQuotaCheck = useCallback(() => {
    fetchQuotaCheck()
      .then((result) => { setQuotaCheck(result); setQuotaCheckLoaded(true); setQuotaCheckFailed(false) })
      .catch(() => { setQuotaCheckFailed(true) })
  }, [])

  useEffect(() => {
    loadQuotaCheck()
    const timer = setInterval(loadQuotaCheck, 60000)
    return () => clearInterval(timer)
  }, [loadQuotaCheck])

  const menuList = useMemo(() => {
    // 空导航是有效结果；加载中或失败时不回退到全量菜单，避免串入其他系统。
    const tree = currentSystemCode
      ? systemNavigation.loaded && !systemNavigation.error ? systemNavigation.tree : []
      : menuStatus === 'online' ? menuTree ?? [] : []
    return collectHomeMenus(tree, hasMenuPermission, currentSystemCode).map((menu) => ({
      ...menu,
      icon: renderMenuIcon(menu.icon) ?? MENU_ICON_BY_KEY[menu.key] ?? <SearchOutlined />,
    }))
  }, [currentSystemCode, systemNavigation.loaded, systemNavigation.error, systemNavigation.tree, menuStatus, menuTree, hasMenuPermission])

  // 只过滤展示，不将当前系统收藏子集覆盖到用户的全局收藏。
  const visibleFavorites = favorites.flatMap((key) => {
    const menu = menuList.find((item) => item.key === key)
    return menu ? [menu] : []
  })

  /** 时钟 */
  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  /** 勵志語錄：與企業門戶橫幅共用公共 Hook 與 `portal.quotes` 同一語料源 */
  const { text: motivationQuote, index: quoteIndex } = useRotatingMotivationQuote()

  /** 引擎模式 → 展示文案（手動模式顯示真實模型名） */
  const engineModeLabel = (mode: LlmEngineMode): string => {
    if (mode === 'auto') return t('home.engineCostSaving')
    return modelDisplayName(modeModelKey(mode)) ?? mode
  }

  /** 内建工具 toolKey → 展示名（工具气泡用）；未登记的工具直接显示原 key，不编造名字 */
  const toolDisplayName = (key: string): string => {
    const labelKey = TOOL_NAME_KEYS[key]
    return labelKey ? t(labelKey) : key
  }

  /** 模型展示名：優先授權模型清單，其次縮寫映射，最後原始標識 */
  const modelDisplayName = (modelKey: string | null | undefined): string | null => {
    if (!modelKey) return null
    return myModels.find((m) => m.modelKey === modelKey)?.modelName ?? ENGINE_LABELS[modelKey] ?? modelKey
  }

  /** 引擎模式 → 網關已接入的模型標識（探測結果反查） */
  const modeModelKey = (mode: LlmEngineMode): string | null =>
    Object.entries(connectedModels).find(([, mapped]) => mapped === mode)?.[0] ?? null

  /** 快捷提问：优先用后端配置（按系统/角色收敛），无配置或后端不可用时回落内置 */
  const [remoteQuickQuestions, setRemoteQuickQuestions] = useState<Array<{ id: number; question: string }>>([])
  useEffect(() => {
    let cancelled = false
    fetchVisibleQuickPrompts(currentSystemCode ?? undefined)
      .then((list) => { if (!cancelled) setRemoteQuickQuestions(list ?? []) })
      .catch(() => { if (!cancelled) setRemoteQuickQuestions([]) })
    return () => { cancelled = true }
  }, [currentSystemCode])

  const QUICK_QUESTION_ICONS = [<SearchOutlined />, <AuditOutlined />, <ThunderboltOutlined />, <LineChartOutlined />]

  /** 快捷提问 */
  const fallbackQuickQuestions = currentSystemCode ? [
    { icon: <SearchOutlined />, text: isAiCenter ? '如何規劃跨系統的數據分析？' : `介紹${systemName}的常用功能` },
    { icon: <AuditOutlined />, text: '查詢資料與新增資料需要哪些不同權限？' },
    { icon: <ThunderboltOutlined />, text: isAiCenter ? '跨系統操作前需要確認哪些資訊？' : `如何整理${systemName}的日常工作？` },
    { icon: <LineChartOutlined />, text: isAiCenter ? '如何定義廣告消費排行的統計口徑？' : `如何確定${systemName}的報表統計口徑？` },
  ] : [
    { icon: <SearchOutlined />, text: t('home.quickQ0') },
    { icon: <AuditOutlined />, text: t('home.quickQ1') },
    { icon: <ThunderboltOutlined />, text: t('home.quickQ2') },
    { icon: <LineChartOutlined />, text: t('home.quickQ3') },
  ]

  const quickQuestions = remoteQuickQuestions.length > 0
    ? remoteQuickQuestions.map((q, index) => ({
        icon: QUICK_QUESTION_ICONS[index % QUICK_QUESTION_ICONS.length],
        text: q.question,
      }))
    : fallbackQuickQuestions

  /** 消息自动滚动 */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const translateGroup = (zh: string) => (
    i18nInstance.language?.startsWith('en') ? (GROUP_NAME_EN[zh] ?? zh) : zh
  )

  /** 日期时间本地化 */
  const dateLocale = i18nInstance.language?.startsWith('en') ? 'en-MO' : 'zh-Hant-MO'

  /** 模糊匹配：searchText 的每個字符按順序出現在 target 中即可命中 */
  const fuzzyMatch = (target: string, searchText: string): boolean => {
    if (!searchText) return false
    const t = target.toLowerCase()
    const s = searchText.toLowerCase()
    // 1. 精確子串匹配（優先）
    if (t.includes(s)) return true
    // 2. 字符順序模糊匹配：s 的每個字符在 t 中按順序出現
    let ti = 0
    for (let si = 0; si < s.length; si++) {
      const idx = t.indexOf(s[si], ti)
      if (idx === -1) return false
      ti = idx + 1
    }
    return true
  }

  const filteredMenus = searchText.trim()
    ? menuList.filter((m) => {
        const label = translateMenuName(m.key, m.label, m.nameEn)
        const group = translateGroup(m.group)
        // 中文/英文模糊匹配
        if (fuzzyMatch(label, searchText) || fuzzyMatch(group, searchText)) return true
        // 拼音匹配：將中文 label 轉拼音後再匹配（去除空格以支持連續拼音搜索）
        if (/[\u4e00-\u9fa5]/.test(label)) {
          const py = pinyin(label, { toneType: 'none' }).toLowerCase().replace(/\s+/g, '')
          if (fuzzyMatch(py, searchText)) return true
        }
        return false
      })
    : menuList

  const addFavorite = (key: string) => {
    if (!favorites.includes(key)) {
      if (favorites.length >= MAX_FAVORITES) {
        message.warning(`最多收藏 ${MAX_FAVORITES} 個菜單，請先移除不常用的項目`)
        return
      }
      setFavorites([...favorites, key])
    }
    setShowAddMenu(false)
    setSearchText('')
  }

  const removeFavorite = (key: string) => {
    setFavorites(favorites.filter((k) => k !== key))
  }

  /** 持久化快捷入口：优先存后端，同时写 localStorage 作为离线缓存 */
  useEffect(() => {
    if (!favoritesLoadedRef.current) return // 首次加载未完成前不写回，避免默认值覆盖云端数据
    if (user?.username) {
      localStorage.setItem(FAV_KEY(user.username), JSON.stringify(favorites))
      saveQuickFavorites(favorites).catch(() => { /* 后端不可用时仅保留 localStorage */ })
    }
  }, [favorites, user?.username])

  /** 发送消息（sending 时进入排队队列） */
  const handleSend = async (preset?: string) => {
    const text = (preset ?? inputText).trim()
    if (!text) return
    // 未開通兗底：輸入區已禁用，這裡防快捷提問等入口繞過
    if (aiBlocked) {
      message.warning(t('home.aiBlockedSendMsg'))
      return
    }

    // 正在发送中 → 进入排队队列（最多 3 条）
    if (sending) {
      if (messageQueue.length >= 3) {
        message.warning(t('home.aiQueueFull'))
        return
      }
      const queueItem = {
        id: `queue-${Date.now()}`,
        text,
        attachments: attachments.length > 0 ? [...attachments] : [],
      }
      setMessageQueue((prev) => [...prev, queueItem])
      setInputText('')
      setAttachments([])
      return
    }
  
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: new Date(),
    }
    const newMessages = [...messages, userMsg]
    updateActiveMessages(() => newMessages)
    setInputText('')
    setAttachments([])
    setSending(true)
  
    try {
      const reply = await sendAgentMessage(newMessages, llmRequestOptions)
      updateActiveMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.text,
        timestamp: new Date(),
        // 后端标记为异常提示（无权/额度/超时/熔断）时：按错误态展示且不入库、不进上下文
        isError: !!reply.errorKind,
        toolTraces: reply.traces,
        views: reply.views,
        pendingActions: reply.pendingActions,
        memorySuggestion: reply.memorySuggestion,
      }], { immediate: true })
      // 累积 tokens 并更新会话
      if (activeConvId && !reply.errorKind) {
        setConversations((prev) => prev.map((c) =>
          c.id === activeConvId ? { ...c, totalTokens: (c.totalTokens ?? 0) + reply.tokens } : c
        ))
        updateConversation(activeConvId, {
          title: undefined,
          messages: undefined,
          totalTokens: (activeConversation?.totalTokens ?? 0) + reply.tokens,
        }).catch(() => {})
      }
    } catch {
      updateActiveMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('home.aiServiceError'),
        timestamp: new Date(),
        isError: true,
      }])
    } finally {
      setSending(false)
    }
  }

  /** 当 sending 变为 false 且有排队消息时，自动处理下一条（定义在 llmRequestOptions 之后） */
  const processNextInQueueRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!sending && messageQueue.length > 0 && processNextInQueueRef.current) {
      processNextInQueueRef.current()
    }
  }, [sending, messageQueue.length])

  /** 删除排队中的消息 */
  const handleRemoveQueueItem = (id: string) => {
    setMessageQueue((prev) => prev.filter((item) => item.id !== id))
  }

  /** 压缩当前会话：调用服务端真实摘要，保留最近 N 条消息；失败不伪造摘要 */
  const handleCompressConversation = async () => {
    if (!activeConvId || messages.length <= 7) {
      message.info(t('home.convCompressNoNeed'))
      return
    }
    try {
      const result = await summarizeConversation(activeConvId)
      if (!result.compressed) {
        message.info(t('home.convCompressNoNeed'))
        return
      }
      const keepCount = result.keptCount || 6
      const compressed: ChatMessage[] = [
        {
          id: `compress-${Date.now()}`,
          role: 'assistant',
          content: `[歷史摘要]\n${result.summary}\n\n（已壓縮 ${result.coveredCount} 條舊消息，保留最近 ${keepCount} 條）`,
          timestamp: new Date(),
        },
        ...messages.slice(-keepCount),
      ]
      const estimatedTokens = Math.round(
        compressed.reduce((sum, m) => sum + m.content.length, 0) / 4,
      )
      updateActiveMessages(() => compressed)
      setConversations((prev) => prev.map((c) =>
        c.id === activeConvId ? { ...c, totalTokens: estimatedTokens, messages: compressed } : c,
      ))
      updateConversation(activeConvId, {
        messages: serializeChatMessages(compressed),
        totalTokens: estimatedTokens,
      }).catch(() => {})
      message.success(t('home.convCompressed'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('home.aiServiceError')
      message.error(msg)
    }
  }

  const dateStr = currentTime.toLocaleDateString(dateLocale, {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
  const timeStr = currentTime.toLocaleTimeString(dateLocale, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  const isEmpty = messages.length === 0

  /* ── 引擎模式（提前声明，供能力计算使用） ── */
  const engineMode = engine?.mode ?? getEngineMode()

  /* ── 当前模型能力计算 ── */
  const currentCapabilities = useMemo(() => {
    if (engineMode === 'auto') {
      // AUTO 模式：取所有授权模型能力的并集
      const caps = { text: true, image: false, audio: false, video: false, file: false, toolCalling: false, thinking: false }
      myModels.forEach((m) => {
        if (m.modalities) {
          const mods = m.modalities.split(',').map((s) => s.trim())
          if (mods.includes('image')) caps.image = true
          if (mods.includes('audio')) caps.audio = true
          if (mods.includes('video')) caps.video = true
        }
        if (m.visionSupport) caps.image = true
        if (m.functionCalling) caps.toolCalling = true
        if (m.thinkingMode) caps.thinking = true
      })
      // 有图片支持即表示支持文件上传
      caps.file = caps.image
      return caps
    }
    // 指定模型：找当前引擎对应的模型
    const currentModelKey = engine?.model
    const model = myModels.find((m) => m.modelKey === currentModelKey)
    if (!model) return { text: true, image: false, audio: false, video: false, file: false, toolCalling: false, thinking: false }
    const mods = model.modalities?.split(',').map((s) => s.trim()) ?? []
    return {
      text: true,
      image: mods.includes('image') || model.visionSupport,
      audio: mods.includes('audio'),
      video: mods.includes('video'),
      file: mods.includes('image') || model.visionSupport,
      toolCalling: model.functionCalling,
      thinking: model.thinkingMode,
    }
  }, [engineMode, myModels, engine?.model])

  /* ── 上下文窗口選項（按模型實際上限過濾） & 思考模式可用性 ── */
  const contextWindowOptions = useMemo(() => {
    if (engineMode === 'auto') {
      // AUTO 模式：取所有授權模型的最小上下文窗口
      const mins = myModels
        .map((m) => m.contextWindow)
        .filter((v): v is number => v != null && v > 0)
      if (mins.length === 0) return [128_000]
      const minMax = Math.min(...mins)
      return getContextWindowOptions(minMax)
    }
    // 指定模型：用當前引擎對應的模型
    const currentModelKey = engine?.model
    const model = myModels.find((m) => m.modelKey === currentModelKey)
    return getContextWindowOptions(model?.contextWindow ?? null)
  }, [engineMode, myModels, engine?.model])

  /** 思考模式是否可用（AUTO 模式下需所有模型都支持） */
  const thinkingAvailable = useMemo(() => {
    if (engineMode === 'auto') {
      return myModels.length > 0 && myModels.every((m) => m.thinkingMode)
    }
    const currentModelKey = engine?.model
    const model = myModels.find((m) => m.modelKey === currentModelKey)
    return model?.thinkingMode ?? false
  }, [engineMode, myModels, engine?.model])

  /** 初始化上下文窗口默認值（選項變化時自動調整） */
  useEffect(() => {
    if (contextWindowOptions.length > 0) {
      // 如果當前選擇不在選項中，默認選最後一個（最大）
      if (!contextWindow || !contextWindowOptions.includes(contextWindow)) {
        setContextWindow(contextWindowOptions[contextWindowOptions.length - 1])
      }
    }
  }, [contextWindowOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 構建 LLM 請求選項 */
  const llmRequestOptions = useMemo((): LlmRequestOptions => {
    const opts: LlmRequestOptions = {}
    if (contextWindow) opts.contextWindow = contextWindow
    if (thinkingEnabled && thinkingAvailable) opts.thinkingDepth = thinkingDepth
    // V0 §B.6：当前会话主键 → 后端写 ai_conversation_event（QUOTA_CHARGE/TOOL_CALL/…）
    if (activeConvId) opts.conversationPk = activeConvId
    // 当前业务系统：后端据此只取「共用 + 本系统」的骨架/护栏，不再把全部系统规则压给模型
    if (currentSystemCode) opts.systemCode = currentSystemCode
    return opts
  }, [contextWindow, thinkingEnabled, thinkingAvailable, thinkingDepth, activeConvId, currentSystemCode])

  /** 处理排队中的下一条消息 */
  const processNextInQueue = useCallback(async () => {
    if (messageQueue.length === 0) return
    const next = messageQueue[0]
    setMessageQueue((prev) => prev.slice(1))

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: next.text,
      attachments: next.attachments.length > 0 ? next.attachments : undefined,
      timestamp: new Date(),
    }
    const newMessages = [...messages, userMsg]
    updateActiveMessages(() => newMessages)
    setSending(true)

    try {
      const reply = await sendAgentMessage(newMessages, llmRequestOptions)
      updateActiveMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.text,
        timestamp: new Date(),
        isError: !!reply.errorKind,
        toolTraces: reply.traces,
        views: reply.views,
        pendingActions: reply.pendingActions,
        memorySuggestion: reply.memorySuggestion,
      }], { immediate: true })
      // 累积 tokens
      if (activeConvId && !reply.errorKind) {
        setConversations((prev) => prev.map((c) =>
          c.id === activeConvId ? { ...c, totalTokens: (c.totalTokens ?? 0) + reply.tokens } : c
        ))
        updateConversation(activeConvId, {
          totalTokens: (activeConversation?.totalTokens ?? 0) + reply.tokens,
        }).catch(() => {})
      }
    } catch {
      updateActiveMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('home.aiServiceError'),
        timestamp: new Date(),
        isError: true,
      }])
    } finally {
      setSending(false)
    }
  }, [messageQueue, messages, updateActiveMessages, llmRequestOptions, t, activeConvId, activeConversation?.totalTokens])

  // 将 processNextInQueue 赋值给 ref，供 useEffect 调用
  useEffect(() => {
    processNextInQueueRef.current = processNextInQueue
  }, [processNextInQueue])

  /* ── 文件处理 ── */

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/')
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
      if (file.size > maxSize) {
        message.warning(t('home.fileTooLarge'))
        return
      }
      if (isImage) {
        // 图片 → base64 data URL
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments((prev) => [...prev, {
            type: 'image',
            name: file.name,
            data: reader.result as string,
            mimeType: file.type,
          }])
        }
        reader.readAsDataURL(file)
      } else {
        // 其他文件 → 读取文本内容
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments((prev) => [...prev, {
            type: 'file',
            name: file.name,
            data: reader.result as string,
            mimeType: file.type,
          }])
        }
        reader.readAsText(file)
      }
    })
  }, [t])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /** 拖拽处理 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }, [isDragging])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (currentCapabilities.image || currentCapabilities.file) {
      handleFileSelect(e.dataTransfer.files)
    }
  }, [currentCapabilities, handleFileSelect])

  /** 賬號所選頭像：支持 pikachu / DiceBear URL / base64 三種 */
  const avatarKey = user?.avatar ?? ''
  const isPikachuAvatar = !avatarKey || avatarKey.startsWith('pikachu-')
  const avatarExpression = isPikachuAvatar ? (avatarKey.replace('pikachu-', '') || 'default') : ''
  const isCustomOrPresetAvatar = avatarKey.startsWith('https://') || avatarKey.startsWith('data:')

  /** 頭部資訊條已用百分比：取日维度中最緊的一個，無日维度時回退月维度 */
  const infoBarUsedPercent = useMemo(() => {
    if (!myUsage || myUsage.dimensions.length === 0) return null
    const usedOf = (dim: QuotaDimension): number | null => {
      const quota = Number(dim.quotaValue) || 0
      if (quota <= 0) return null
      return Math.min(100, Math.round((Number(dim.usedValue) / quota) * 100))
    }
    const pick = (period: 'daily' | 'monthly') => myUsage!.dimensions
      .filter((d) => d.period === period)
      .map(usedOf)
      .filter((v): v is number => v !== null)
    const daily = pick('daily')
    const pool = daily.length > 0 ? daily : pick('monthly')
    return pool.length > 0 ? Math.max(...pool) : null
  }, [myUsage])

  /** 當前引擎：auto 模式只顯示策略名（模型多時拼接會溢位）；手動模式顯示指定模型名稱 */
  const engineName = engine?.model ? (modelDisplayName(engine.model) ?? engine.model) : null
  const engineChipText = engine?.killSwitch
    // 全局熍断期间不能仍显示「在線」：用户会以为系统坏了，而实际是管理员已急停
    ? t('home.engineChipKilled')
    : blockReason
      ? (blockReason === 'quota-exhausted' || blockReason === 'no-quota'
          ? t('home.engineChipNoQuota')
          : blockReason === 'needs-approval'
            ? t('home.engineChipNeedsApproval')
            : blockReason === 'check-failed'
              ? t('home.engineChipCheckFailed')
              : t('home.engineChipNoModels'))
      : engine
        ? engineMode === 'auto' ? t('home.engineCostSaving') : (engineName ?? t('home.aiEngineNotDetected'))
        : t('home.aiEngineNotDetected')

  /** 高亮項 */
  const selectedEngineKey = engineMode

  /** 已接入網關的授權模型（未接入者不展示） */
  const availableModels = myModels.filter((m) => connectedModels[m.modelKey])

  /** 模型選擇器展示列表：有模型權限但額度阻塞時，展示全部授權模型（不受 connectedModels 限制） */
  const selectorModels = (myModels.length > 0 && blockReason && blockReason !== 'no-models' && blockReason !== 'no-both')
    ? myModels
    : availableModels

  /** 引擎模式下拉：智能路由 + 指定模型兩組；只展示已接入網關的授權模型 */
  const engineMenuItems: MenuProps['items'] = [
    {
      type: 'group',
      label: t('home.engineSmartRouting'),
      children: [
        {
          key: 'auto',
          label: (
            <div className="home-ai-engine-opt">
              <strong>{t('home.engineCostSaving')}</strong>
              <span>{t('home.engineCostSavingDesc')}</span>
            </div>
          ),
        },
      ],
    },
    {
      type: 'group',
      label: t('home.engineSpecifiedModel'),
      children: selectorModels.length === 0
        ? [{
            key: 'no-models',
            disabled: true,
            label: (
              <div className="home-ai-engine-opt" style={{ opacity: 0.55 }}>
                <span>{t('home.engineNoModels')}</span>
              </div>
            ),
          }]
        : selectorModels.map((model) => ({
            key: connectedModels[model.modelKey] ?? model.modelKey,
            label: (
              <div className="home-ai-engine-opt">
                <strong>{model.modelName}</strong>
                <span>{model.providerName ? `${model.providerName} · ` : ''}{model.modelKey}</span>
              </div>
            ),
          })),
    },
  ]

  /** 無權限提示：沿用全局確認彈窗規範，只保留「我知道了」按鈕 */
  const showModelDeniedModal = (model: string) => {
    Modal.warning({
      title: t('home.engineModelDeniedTitle'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 480,
      content: t('home.engineModelDeniedContent', { model, username: user?.username ?? '--' }),
      okText: '我知道了',
    })
  }

  /** 省錢優先受限告知：自動調度範疇被權限收窄，故障時沒有備選模型可接管，只提醒不阻止切換 */
  const showAutoLimitedModal = (channels: string[]) => {
    const names = channels.map((channel) => modelDisplayName(modeModelKey(channel as LlmEngineMode)) ?? channel)
    Modal.warning({
      title: t('home.engineAutoLimitedTitle'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: t('home.engineAutoLimitedContent', { username: user?.username ?? '--', models: names.join('、') }),
      okText: '我知道了',
    })
  }

  /** 選擇引擎模式 */
  const handleEngineModeSelect: MenuProps['onClick'] = ({ key }) => {
    if (key === 'no-models') {
      message.info(t('home.enginePendingMsg'))
      return
    }
    const next = key as LlmEngineMode
    if ((next === 'primary' || next === 'off-peak') && deniedChannels.includes(next)) {
      showModelDeniedModal(modelDisplayName(modeModelKey(next)) ?? next)
      return
    }
    setEngineMode(next)
    fetchEngineStatus().then(setEngine)
    if (next === 'auto' && deniedChannels.length > 0) {
      showAutoLimitedModal(deniedChannels)
      return
    }
    message.success(t('home.engineSwitchSuccess', { mode: engineModeLabel(next) }))
  }

  /** 代理回傳的受限清單到位後校正：已固定到無權限通道時自動回到省錢優先 */
  useEffect(() => {
    if ((engineMode === 'primary' || engineMode === 'off-peak') && deniedChannels.includes(engineMode)) {
      setEngineMode('auto')
      fetchEngineStatus().then(setEngine)
      message.info(t('home.engineAutoSwitchMsg', { model: modelDisplayName(modeModelKey(engineMode)) ?? engineMode }))
    }
  }, [engineMode, deniedChannels]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="home-page">
      {/* 精简问候栏 */}
      <div className="home-greeting">
        <div className="home-greeting-left">
          <div className={`home-greeting-avatar${isPikachuAvatar ? ' home-greeting-avatar--pikachu' : ''}`}>
            {isPikachuAvatar ? <PikachuFace expression={avatarExpression} size={44} /> : isCustomOrPresetAvatar ? <img src={avatarKey} alt="avatar" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} /> : <UserOutlined />}
          </div>
          <div className="home-greeting-text">
            <h2>{getGreeting(currentTime.getHours(), t)}，{(!i18nInstance.language?.startsWith('zh') ? chineseNameToPinyinEnglish(user?.name || '') : user?.name) || t('home.greetingPartner')} {t('home.partnerEmoji')}</h2>
            {motivationQuote && <p className="home-greeting-quote" key={quoteIndex}>{motivationQuote}</p>}
          </div>
        </div>
        <div className="home-greeting-right">
          {/* 会议栏收起后的恢复入口：放在问候栏内，不额外占行 */}
          <TodayMeetingRestoreChip bar={meetingBar} />
          <div className="home-greeting-clock">
            <div className="home-greeting-time">{timeStr}</div>
            <div className="home-greeting-date">{dateStr}</div>
          </div>
        </div>
      </div>

      {/* 今日會議概览：无 meeting-my 菜单、后端不可用、今日无会或用户已收起时整栏不渲染 */}
      <TodayMeetingCard bar={meetingBar} />

      {/* 主区域：左 AI 助手 + 右快捷入口 */}
      <div className="home-main-grid">
      {/* AI 助手（核心） */}
      <div className="home-ai">
        <div className="home-ai-header">
          <div className="home-ai-avatar"><AiLogo size={32} /></div>
          <div className="home-ai-title">
            <h3>
              {t('home.aiTitle')}
              {/* 内测口径说明是三句话长文本：按规范走 HelpPopover（白底 Tooltip 阅读体验差、移开即消失） */}
              <HelpPopover
                title={t('home.aiBeta')}
                ariaLabel={t('home.aiBetaTipAria')}
                placement="bottomLeft"
                width={360}
                content={[
                  { tone: 'warn', label: t('home.aiBetaTipLabelStage'), body: t('home.aiBetaTip') },
                  { tone: 'info', label: t('home.aiBetaTipLabelAction'), body: t('home.aiBetaTipAction') },
                ]}
              >
                <span className="home-ai-badge"><InfoCircleOutlined className="home-ai-badge-icon" />{t('home.aiBeta')}</span>
              </HelpPopover>
            </h3>
            <span className={`home-ai-status${aiBlocked || engine?.killSwitch ? ' home-ai-status--blocked' : ''}`}>
              <i />{engine?.killSwitch ? t('home.engineChipKilled') : aiBlocked ? t('home.aiBlockedBadge') : t('home.aiOnline')}
            </span>
          </div>
          <div className="home-ai-badges">
            {/* 額度資訊並入頭部：原本獨立一行的資訊條取消，把高度讓給聊天區 */}
            {!aiBlocked && (
              // 用 div 而非 button：Progress 内部是块级节点，放进 button 属非法嵌套
              <div
                className="home-ai-usage-pill"
                role="button"
                tabIndex={0}
                onClick={handleOpenUsage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenUsage() }
                }}
              >
                <DatabaseOutlined style={{ fontSize: 12 }} />
                <span className="home-ai-usage-pill-label">{t('home.aiMyUsage')}</span>
                {infoBarUsedPercent !== null ? (
                  <>
                    <Progress
                      percent={infoBarUsedPercent}
                      size="small"
                      showInfo={false}
                      strokeColor={infoBarUsedPercent < 40 ? '#52C41A' : infoBarUsedPercent < 80 ? '#FAAD14' : '#FF4D4F'}
                      style={{ width: 36, margin: 0 }}
                    />
                    <span
                      className="home-ai-usage-pill-value"
                      style={{ color: infoBarUsedPercent < 40 ? '#52C41A' : infoBarUsedPercent < 80 ? '#FAAD14' : '#FF4D4F' }}
                    >
                      {infoBarUsedPercent === 0
                        ? t('home.usageAvailableFull')
                        : infoBarUsedPercent === 100
                          ? t('home.usageUsedFull')
                          : t('home.usageUsedPercent', { percent: infoBarUsedPercent })}
                    </span>
                  </>
                ) : (
                  // 未配額度不等於“沒數據”：空值直接說明「無額度限制」，不顯示破折號
                  <span className="home-ai-usage-pill-value">
                    {myUsage?.unlimited ? t('home.usageUnlimitedValue') : t('home.infoBarNoQuotaLimit')}
                  </span>
                )}
              </div>
            )}
            {/* 内置系統管理員默認全部模型 + 不限额，不再展示「申請加量/加模型」常駐入口 */}
            {!aiBlocked && user?.role !== 'admin' && (
              <button
                type="button"
                className="home-ai-apply-pill"
                onClick={() => navigate('/ai-access-apply?reason=topup')}
                title={t('home.aiApplyMore')}
              >
                <PlusOutlined style={{ fontSize: 9 }} />
                {t('home.aiApplyMore')}
              </button>
            )}
            <Dropdown
              menu={aiBlocked
                ? { items: [] }
                : { items: engineMenuItems, selectable: true, selectedKeys: [selectedEngineKey], onClick: handleEngineModeSelect }}
              popupRender={aiBlocked && blockReason
                /* 未開通時下拉不再展示智能路由選項，替換為原因說明面板 */
                ? () => (
                  <div className="home-ai-engine-panel">
                    <div className="home-ai-engine-panel-icon"><LockOutlined /></div>
                    <div className="home-ai-engine-panel-title">{t(ENGINE_PANEL_TITLE_KEY[blockReason])}</div>
                    <div className="home-ai-engine-panel-desc">{t(ENGINE_PANEL_DESC_KEY[blockReason])}</div>
                  </div>
                )
                : undefined}
              trigger={['click']}
              placement="bottomRight"
              rootClassName={aiBlocked ? 'home-ai-engine-dropdown' : undefined}
            >
              <button
                type="button"
                className={`home-ai-engine${aiBlocked ? ' home-ai-engine--blocked' : engineMode !== 'auto' ? ' home-ai-engine--manual' : ''}`}
              >
                <i />
                {engineChipText}
                <DownOutlined className="home-ai-engine-caret" />
              </button>
            </Dropdown>
            {/* 上下文窗口 & 思考模式設定 */}
            {!aiBlocked && (
              <Popover
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                trigger="click"
                placement="bottomRight"
                title={null}
                content={
                  <div className="home-ai-settings-panel">
                    {/* 上下文窗口 */}
                    <div className="home-ai-settings-section">
                      <div className="home-ai-settings-label">{t('home.settingsContextWindow')}</div>
                      <div className="home-ai-settings-options">
                        {contextWindowOptions.map((cw) => (
                          <div
                            key={cw}
                            className={`home-ai-settings-option${contextWindow === cw ? ' active' : ''}`}
                            onClick={() => setContextWindow(cw)}
                          >
                            {formatContextWindow(cw)}
                            {contextWindow === cw && <CheckOutlined className="home-ai-settings-check" />}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 思考模式 */}
                    {thinkingAvailable && (
                      <div className="home-ai-settings-section">
                        <div className="home-ai-settings-label-row">
                          <span className="home-ai-settings-label">{t('home.settingsThinkingMode')}</span>
                          <button
                            type="button"
                            className={`home-ai-thinking-toggle${thinkingEnabled ? ' on' : ' off'}`}
                            onClick={() => setThinkingEnabled(!thinkingEnabled)}
                          >
                            <span className="home-ai-thinking-toggle-dot" />
                          </button>
                        </div>
                        {thinkingEnabled && (
                          <div className="home-ai-settings-options">
                            {(['low', 'medium', 'high', 'xhigh', 'max'] as ThinkingDepth[]).map((d) => (
                              <div
                                key={d}
                                className={`home-ai-settings-option${thinkingDepth === d ? ' active' : ''}`}
                                onClick={() => setThinkingDepth(d)}
                              >
                                {t(`home.thinkingDepth${d.charAt(0).toUpperCase() + d.slice(1)}`)}
                                {thinkingDepth === d && <CheckOutlined className="home-ai-settings-check" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* 模型能力：原先独占底部一行，收进设置面板，减少常驻信息干扰 */}
                    {(currentCapabilities.text || currentCapabilities.image || currentCapabilities.audio
                      || currentCapabilities.video || currentCapabilities.toolCalling || currentCapabilities.thinking) && (
                      <div className="home-ai-settings-section">
                        <div className="home-ai-settings-label">{t('home.aiCapability')}</div>
                        <div className="home-ai-settings-caps">
                          {currentCapabilities.text && (
                            <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                              <FileTextOutlined /> {t('home.capText')}
                            </Tag>
                          )}
                          {currentCapabilities.image && (
                            <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                              <PictureOutlined /> {t('home.capImage')}
                            </Tag>
                          )}
                          {currentCapabilities.audio && (
                            <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                              🎤 {t('home.capAudio')}
                            </Tag>
                          )}
                          {currentCapabilities.video && (
                            <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                              🎤 {t('home.capVideo')}
                            </Tag>
                          )}
                          {currentCapabilities.toolCalling && (
                            <Tag className="home-ai-cap-tag home-ai-cap-tag--tool" bordered={false}>
                              <ThunderboltOutlined /> {t('home.capToolCalling')}
                            </Tag>
                          )}
                          {currentCapabilities.thinking && (
                            <Tag className="home-ai-cap-tag home-ai-cap-tag--think" bordered={false}>
                              💭 {t('home.capThinking')}
                            </Tag>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                }
              >
                <button
                  type="button"
                  className="home-ai-settings-btn"
                  title={t('home.settingsTitle')}
                >
                  <SettingOutlined />
                </button>
              </Popover>
            )}
          </div>
        </div>

        {/* 会话标签栏 */}
        <div className="home-ai-tabs">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`home-ai-tab${conv.id === activeConvId ? ' home-ai-tab--active' : ''}`}
              onClick={() => setActiveConvId(conv.id)}
            >
              <MessageOutlined className="home-ai-tab-icon" />
              <span className="home-ai-tab-title">{conv.title}</span>
              {conversations.length > 1 && (
                <button
                  type="button"
                  className="home-ai-tab-close"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  <CloseCircleOutlined />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="home-ai-tab-add" onClick={() => handleCreateConversation()} title={t('home.convNew')}>
            <PlusOutlined />
          </button>
          <button type="button" className="home-ai-tab-add" onClick={() => setMemoryOpen(true)} title={t('home.memoryTitle', { defaultValue: '我的記憶' })}>
            <BulbOutlined />
          </button>
          {conversations.length > 3 && (
            <Popover
              trigger="click"
              title={t('home.convHistory')}
              content={
                <div className="home-ai-history-list">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`home-ai-history-item${conv.id === activeConvId ? ' active' : ''}`}
                      onClick={() => { setActiveConvId(conv.id) }}
                    >
                      <MessageOutlined />
                      <span>{conv.title}</span>
                      <span className="home-ai-history-time">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              }
              placement="bottomRight"
            >
              <button type="button" className="home-ai-tab-history" title={t('home.convHistory')}>
                <HistoryOutlined />
              </button>
            </Popover>
          )}
          {/* 回收站 */}
          <Popover
            trigger="click"
            title={t('home.convTrash')}
            onOpenChange={(open) => { if (open) loadDeletedConversations() }}
            content={
              <div className="home-ai-trash-list">
                {deletedConversations.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.convTrashEmpty')} style={{ margin: '12px 0' }} />
                ) : (
                  deletedConversations.map((conv) => (
                    <div key={conv.id} className="home-ai-trash-item">
                      <div className="home-ai-trash-item-info" onClick={() => handleRestoreConversation(conv.id)}>
                        <MessageOutlined />
                        <div className="home-ai-trash-item-text">
                          <span className="home-ai-trash-item-title">{conv.title}</span>
                          <span className="home-ai-trash-item-time">{conv.deletedAt ? new Date(conv.deletedAt).toLocaleDateString() : ''}</span>
                        </div>
                      </div>
                      <div className="home-ai-trash-item-actions">
                        <Tooltip title={t('home.convRestore')}>
                          <button type="button" className="home-ai-trash-restore-btn" onClick={() => handleRestoreConversation(conv.id)}>
                            <UndoOutlined />
                          </button>
                        </Tooltip>
                        <Tooltip title={t('home.convPermanentDelete')}>
                          <button type="button" className="home-ai-trash-delete-btn" onClick={() => handlePermanentDelete(conv.id)}>
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))
                )}
              </div>
            }
            placement="bottomRight"
          >
            <button type="button" className="home-ai-tab-trash" title={t('home.convTrash')}>
              <DeleteOutlined />
              {deletedConversations.length > 0 && (
                <span className="home-ai-tab-trash-badge">{deletedConversations.length}</span>
              )}
            </button>
          </Popover>
        </div>

        <div className="home-ai-body">
          {/* 新對話 + 阻塞：顯示引導卡片 */}
          {isEmpty && blockReason ? (
            <div className="home-ai-hero">
              <div className="home-ai-hero-card">
                <div className="home-ai-hero-icon home-ai-hero-icon--blocked">
                  <LockOutlined />
                </div>
                <h4>{t(BLOCKED_TITLE_KEY[blockReason])}</h4>
                <p>{t(BLOCKED_DESC_KEY[blockReason])}</p>
                {blockReason === 'check-failed' ? (
                  /* 校验取不到状态时「去申请」是误导：申请解决不了接口失败，
                     而提醒条只在非空会话渲染，所以空态必须自己带重试入口 */
                  <button type="button" className="home-ai-blocked-action" onClick={loadQuotaCheck}>
                    <ReloadOutlined />
                    {t('home.aiCheckFailedRetryBtn')}
                  </button>
                ) : blockReason === 'needs-approval' ? (
                  <button type="button" className="home-ai-blocked-action" onClick={() => navigate(`/ai-access-apply?reason=needs-approval`)}>
                    <SendOutlined />
                    {t('home.aiBlockedApplyBtn')}
                  </button>
                ) : (
                  <button type="button" className="home-ai-blocked-action" onClick={() => navigate(`/ai-access-apply?reason=${blockReason}`)}>
                    <WalletOutlined />
                    {t('home.aiBlockedViewUsage')}
                  </button>
                )}
              </div>
            </div>
          ) : isEmpty ? (
            /* 新對話 + 未阻塞：正常 Hero */
            <div className="home-ai-hero">
              <div className="home-ai-hero-icon"><AiLogo size={64} /></div>
              <h4>{t('home.aiHeroTitle')}</h4>
              <p>{currentSystemCode ? isAiCenter ? '在這裡規劃跨系統工作，查詢與操作均需對應授權。' : `從${systemName}開始，整理問題、分析思路與工作步驟。` : t('home.aiHeroDesc')}</p>
              <div className="home-ai-suggest">
                {quickQuestions.map((q) => (
                  <button type="button" key={q.text} className="home-ai-suggest-item" onClick={() => setInputText(q.text)}>
                    <span className="home-ai-suggest-icon" aria-hidden="true">{q.icon}</span>
                    <span>{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 歷史對話：無論是否阻塞都顯示消息列表（不遮罩） */
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`home-chat-bubble ${msg.role}`}>
                  <div className={`home-chat-avatar${msg.role === 'user' && !isPikachuAvatar && !isCustomOrPresetAvatar ? ' home-chat-avatar--default' : ''}`}>
                    {msg.role === 'assistant' ? <AiLogo size={32} /> : isPikachuAvatar ? <PikachuFace expression={avatarExpression} size={32} /> : isCustomOrPresetAvatar ? <img src={avatarKey} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : <UserOutlined />}
                  </div>
                  <div className="home-chat-content">
                    {/* 本轮服务端实际调用的内建工具：不展示出来，用户会以为数据是编的（审计事件里其实有 TOOL_CALL） */}
                    {msg.role === 'assistant' && !!msg.toolTraces?.length && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {msg.toolTraces.map((tr, i) => (
                          <span key={`${tr.toolKey}-${i}`}
                            style={{
                              fontSize: 11, lineHeight: '18px', padding: '0 8px', borderRadius: 4,
                              color: tr.success ? '#1890FF' : '#FF4D4F',
                              background: tr.success ? '#E6F7FF' : '#FFEBEE',
                              border: `1px solid ${tr.success ? '#91D5FF' : '#FFA39E'}`,
                            }}>
                            {toolDisplayName(tr.toolKey)}{tr.elapsedMs ? ` · ${tr.elapsedMs}ms` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* 错误提示按危险色区分，不能用普通回复气泡假装成功 */}
                    <div className="home-chat-text"
                      style={msg.isError ? { color: '#FF4D4F', background: '#FFF1F0', border: '1px solid #FFCCC7', borderRadius: 8, padding: '8px 12px' } : undefined}>
                      {msg.role === 'assistant' ? <AiRichText text={msg.content} /> : msg.content}
                    </div>
                    {msg.role === 'assistant' && !!msg.views?.length && (
                      <div className="home-chat-views">
                        {msg.views.map((v) => <AgentViewCard key={v.id} view={v} />)}
                      </div>
                    )}
                    {msg.role === 'assistant' && !!msg.pendingActions?.length && (
                      <div className="home-chat-actions">
                        {msg.pendingActions.map((a) => (
                          <AgentActionCard key={a.id} action={a}
                            onUpdated={(next) => handleActionUpdated(msg.id, a.id, next)} />
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' && !msg.isError && (
                      <div className="home-chat-msg-actions">
                        {msg.memorySuggestion && (
                          <Button type="link" size="small" icon={<BulbOutlined />}
                            className="home-memory-suggestion"
                            onClick={() => { setRememberText(msg.memorySuggestion ?? ''); setRememberOpen(true) }}>
                            {t('home.memorySuggestion', {
                              defaultValue: '記住“{{text}}”',
                              text: msg.memorySuggestion,
                            })}
                          </Button>
                        )}
                        <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => openRemember(msg)}>
                          {t('home.remember', { defaultValue: '記住這條' })}
                        </Button>
                        <Tooltip title={t('home.feedbackUp', { defaultValue: '有幫助' })}>
                          <Button type="text" size="small" className={msg.feedback === 1 ? 'is-active' : ''}
                            icon={<LikeOutlined />} onClick={() => handleFeedback(msg, 1)} />
                        </Tooltip>
                        <Tooltip title={t('home.feedbackDown', { defaultValue: '沒幫助' })}>
                          <Button type="text" size="small" className={msg.feedback === -1 ? 'is-active' : ''}
                            icon={<DislikeOutlined />} onClick={() => { setFeedbackTarget(msg); setFeedbackReason(undefined) }} />
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="home-chat-bubble assistant">
                  <div className="home-chat-avatar"><AiLogo size={32} /></div>
                  <div className="home-chat-content">
                    <div className="home-chat-text home-chat-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* 快捷提問與模型能力不再各佔一行：快捷提問收進輸入區按鈕，能力收進右上角設定面板 */}

        {/* 附件预览区 */}
        {attachments.length > 0 && (
          <div className="home-ai-attachments">
            {attachments.map((att, idx) => (
              <div key={idx} className={`home-ai-attachment home-ai-attachment--${att.type}`}>
                {att.type === 'image' ? (
                  <img src={att.data} alt={att.name} className="home-ai-attachment-preview" />
                ) : (
                  <div className="home-ai-attachment-file">
                    <FileTextOutlined />
                    <span>{att.name}</span>
                  </div>
                )}
                <button type="button" className="home-ai-attachment-remove" onClick={() => removeAttachment(idx)}>
                  <CloseCircleOutlined />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 排队状态提示 */}
        {sending && !isEmpty && !blockReason && (
          <div className="home-ai-queue-status">
            <span className="home-ai-queue-status-dot" />
            <span>{t('home.aiThinking')}</span>
          </div>
        )}

        {/* 排队消息列表 */}
        {messageQueue.length > 0 && (
          <div className="home-ai-queue-list">
            <div className="home-ai-queue-header">
              <span className="home-ai-queue-header-text">{t('home.aiQueueWaiting', { count: messageQueue.length })}</span>
            </div>
            {messageQueue.map((item, idx) => (
              <div key={item.id} className="home-ai-queue-item">
                <span className="home-ai-queue-item-index">{idx + 1}</span>
                <span className="home-ai-queue-item-text">{item.text}</span>
                <button
                  type="button"
                  className="home-ai-queue-item-remove"
                  onClick={() => handleRemoveQueueItem(item.id)}
                  title={t('home.aiQueueRemove')}
                >
                  <CloseCircleOutlined />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 降级模式标识 */}
        {downgradeMode && (
          <div className="home-ai-downgrade-bar">
            <SwapOutlined />
            <span>{t('home.aiDowngradeModeLabel')}</span>
            {quotaCheck?.downgradeModelName && (
              <span className="home-ai-downgrade-bar-model">{quotaCheck.downgradeModelName}</span>
            )}
          </div>
        )}

        {/* 历史对话阻塞提醒条：输入框上方显示，含申请按钮或不可申请提示 */}
        {!isEmpty && blockReason && (
          <div className="home-ai-blocked-reminder">
            <LockOutlined />
            <span className="home-ai-blocked-reminder-text">
              {blockReason === 'quota-exhausted'
                ? t('home.aiQuotaExhaustedReminder')
                : blockReason === 'needs-approval'
                  ? t('home.aiNeedsApprovalReminder')
                  : blockReason === 'check-failed'
                    ? t('home.aiCheckFailedReminder')
                    : t('home.aiBlockedReminder')}
            </span>
            {/* 校验失败时给「重新校验」而不是「我要申请」：申请解决不了取不到状态的问题 */}
            {blockReason === 'check-failed' ? (
              <button type="button" className="home-ai-blocked-reminder-btn" onClick={loadQuotaCheck}>
                <ReloadOutlined />
                {t('home.aiCheckFailedRetryBtn')}
              </button>
            ) : blockReason !== 'quota-exhausted' && (
              <button type="button" className="home-ai-blocked-reminder-btn" onClick={() => navigate(`/ai-access-apply?reason=${blockReason}`)}>
                <SendOutlined />
                {t('home.aiBlockedApplyBtn')}
              </button>
            )}
          </div>
        )}

        {/* 输入区（含拖拽、附件按钮） */}
        <div
          className={`home-ai-input${isDragging ? ' home-ai-input--dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && <div className="home-ai-drag-overlay">{t('home.dragHint')}</div>}
          {/* 快捷提問：原本占一整行，收进输入区左侧按钮，点开即可选择 */}
          {!isEmpty && !blockReason && quickQuestions.length > 0 && (
            <Popover
              open={quickOpen}
              onOpenChange={setQuickOpen}
              trigger="click"
              placement="topLeft"
              content={
                <div className="home-ai-quick-panel">
                  {quickQuestions.map((q) => (
                    <button
                      type="button"
                      key={q.text}
                      className="home-ai-quick-btn"
                      onClick={() => { setInputText(q.text); setQuickOpen(false) }}
                    >
                      {q.icon} {q.text}
                    </button>
                  ))}
                </div>
              }
            >
              <button
                type="button"
                className="home-ai-tool-btn"
                title={t('home.aiQuickPrompt')}
                aria-label={t('home.aiQuickPrompt')}
              >
                <ThunderboltOutlined />
              </button>
            </Popover>
          )}
          {(currentCapabilities.file || currentCapabilities.image) && !aiBlocked && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                accept={currentCapabilities.image ? 'image/*,.pdf,.txt,.csv,.json,.md' : '.pdf,.txt,.csv,.json,.md'}
                multiple
                onChange={(e) => { handleFileSelect(e.target.files); e.target.value = '' }}
              />
              <button
                type="button"
                className="home-ai-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title={t('home.attachFile')}
              >
                <PaperClipOutlined />
              </button>
            </>
          )}
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={() => handleSend()}
            placeholder={aiBlocked ? t('home.aiInputBlocked') : downgradeMode ? t('home.aiInputDowngradePlaceholder') : sending ? t('home.aiInputQueuePlaceholder') : t('home.aiInputPlaceholder')}
            className="home-ai-field"
            disabled={aiBlocked}
          />
          <button
            className="home-ai-send"
            onClick={() => handleSend()}
            disabled={(!inputText.trim() && attachments.length === 0) || aiBlocked}
          >
            <SendOutlined />
          </button>
          {/* 上下文窗口使用率图标 */}
          {!isEmpty && !aiBlocked && (
            <ContextUsageIndicator
              usedTokens={activeConversation?.totalTokens ?? 0}
              contextWindow={contextWindow || undefined}
              onCompress={handleCompressConversation}
              onNewChat={handleCreateConversation}
              t={t}
            />
          )}
        </div>
      </div>

      {/* 菜单搜索与收藏共用当前系统的可见菜单集。 */}
      <div className="home-quick" aria-label="系統菜單">
        <div className="home-quick-head">
          <span className="home-quick-label">{t('home.quickEntryLabel')}</span>
          <span className="home-quick-scope">{currentSystemCode ? `${systemName} · 本系統菜單` : '已授權菜單'}</span>
          <div className="home-quick-search" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setShowAddMenu(false)
          }}>
            <Input
              prefix={<SearchOutlined />}
              placeholder={currentSystemCode ? '搜尋本系統菜單' : t('home.quickEntrySearchPlaceholder')}
              aria-label="搜尋菜單"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onFocus={() => setShowAddMenu(true)}
              onKeyDown={(event) => { if (event.key === 'Escape') setShowAddMenu(false) }}
              disabled={menusLoading || menusError}
              allowClear
              className="home-quick-field"
            />
            {showAddMenu && !menusLoading && !menusError && (
              <div className="home-quick-dropdown">
                {filteredMenus.length > 0 ? filteredMenus.map((menu) => (
                  <div key={menu.key} className="home-quick-item">
                    <button type="button" className="home-quick-item-open" onClick={() => navigate(menu.path)}>
                      <span className="home-quick-item-icon" aria-hidden="true">{menu.icon}</span>
                      <span className="home-quick-item-label">
                        {translateMenuName(menu.key, menu.label, menu.nameEn)}
                        <small>{translateGroup(menu.group)}</small>
                      </span>
                    </button>
                    <Button
                      type="text"
                      size="small"
                      aria-label={`${favorites.includes(menu.key) ? '已收藏' : '收藏'} ${translateMenuName(menu.key, menu.label, menu.nameEn)}`}
                      disabled={favorites.includes(menu.key)}
                      icon={favorites.includes(menu.key) ? <CheckOutlined /> : <PlusOutlined />}
                      onClick={() => addFavorite(menu.key)}
                    />
                  </div>
                )) : (
                  <div className="home-quick-dropdown-empty">{t('home.quickEntryNoResult', '無匹配結果')}</div>
                )}
              </div>
            )}
          </div>
          <span className="home-quick-hint">點擊菜單進入頁面，點擊「＋」加入收藏。</span>
        </div>
        <div className="home-quick-list">
          {menusLoading ? (
            <div className="home-quick-feedback" role="status"><Spin /><span>{t('common.loading')}</span></div>
          ) : menusError ? (
            <Empty description="菜單載入失敗，請重試" image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button onClick={() => { void (currentSystemCode ? systemNavigation.refetch() : refreshMenus()) }}>{t('portal.retry')}</Button>
            </Empty>
          ) : menuList.length === 0 ? (
            <Empty description="本系統暫無可用菜單" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : visibleFavorites.length === 0 ? (
            <Empty description={t('home.quickEntryEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : visibleFavorites.map((menu) => (
            <div key={menu.key} className="home-quick-chip">
              <button type="button" className="home-quick-chip-open" onClick={() => navigate(menu.path)}>
                <span className="home-quick-chip-icon" aria-hidden="true">{menu.icon}</span>
                <span className="home-quick-chip-label">{translateMenuName(menu.key, menu.label, menu.nameEn)}</span>
              </button>
              <button
                type="button"
                className="home-quick-chip-remove"
                aria-label={`移除收藏 ${translateMenuName(menu.key, menu.label, menu.nameEn)}`}
                onClick={() => removeFavorite(menu.key)}
              ><DeleteOutlined /></button>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* 我的用量抽屜（真實額度维度 + 實際用量，與能耗統計同源） */}
      <Drawer
        title={t('home.usageTitle')}
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        width={520}
      >
        {usageLoading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}><Spin /></div>
        ) : myUsage ? (
          <>
            {/* 整體用量統計卡（biz_llm_usage 實時聚合） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: t('home.usageTodayTokens'), value: formatNumber(myUsage.usage.todayTokens), icon: <ThunderboltOutlined />, color: '#1890FF', bg: '#E6F7FF' },
                { label: t('home.usageTodayRequests'), value: formatNumber(myUsage.usage.todayRequests), icon: <LineChartOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                {
                  label: t('home.usageTodayCosts'),
                  value: myUsage.usage.todayCosts.map((c) => `${currencySymbol(c.currency)}${formatCost(c.cost)}`).join(' / ') || '--',
                  icon: <WalletOutlined />, color: '#52C41A', bg: '#F6FFED',
                },
                { label: t('home.usageMonthTokens'), value: formatNumber(myUsage.usage.monthTokens), icon: <DatabaseOutlined />, color: '#722ED1', bg: '#F9F0FF' },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    padding: 16, borderRadius: 12, background: stat.bg, border: `1px solid ${stat.color}22`, textAlign: 'center',
                    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default', position: 'relative', overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* 我的額度维度（員工/部門/職位/角色，已用按請求明細實時聚合） */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('home.usageQuotaDimsTitle')}</div>
            {myUsage.dimensions.length === 0 ? (
              myUsage.unlimited ? (
                // 内置系统管理员：无额度维度属预期，展示为不限额而非「未配置额度」空态
                <div style={{ border: '1px dashed #B7EB8F', background: '#F6FFED', borderRadius: 12, padding: '20px 16px', textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ width: 40, height: 40, margin: '0 auto 10px', borderRadius: '50%', background: '#F6FFED', border: '1px solid #D9F7BE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#389E0D', fontSize: 18 }}>
                    <CheckCircleOutlined />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 6 }}>{t('home.usageDimsUnlimited')}</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.7 }}>{t('home.usageDimsUnlimitedHint')}</div>
                </div>
              ) : (
                <div style={{ border: '1px dashed #FFD591', background: '#FFFBF5', borderRadius: 12, padding: '20px 16px', textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ width: 40, height: 40, margin: '0 auto 10px', borderRadius: '50%', background: '#FFF7E6', border: '1px solid #FFE7BA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D46B08', fontSize: 18 }}>
                    <LockOutlined />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 6 }}>{t('home.usageDimsEmpty')}</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.7 }}>{t('home.usageDimsEmptyHint')}</div>
                </div>
              )
            ) : (
              myUsage.dimensions.map((dim, i) => {
                const quota = Number(dim.quotaValue) || 0
                const used = Number(dim.usedValue) || 0
                const rawPercent = quota > 0 ? (used / quota) * 100 : 0
                const percent = Math.min(100, Math.round(rawPercent))
                const over = quota > 0 && used > quota
                const color = over ? '#FF4D4F' : rawPercent >= (dim.softThreshold ?? 80) ? '#FAAD14' : '#52C41A'
                const unit = dim.quotaType === 'token' ? t('home.usageUnitToken') : dim.quotaType === 'request' ? t('home.usageUnitRequest') : ''
                const fmt = (value: number) => (dim.quotaType === 'cost' ? `${currencySymbol(dim.currency)}${formatCost(value)}` : formatNumber(value))
                return (
                  <div
                    key={`${dim.source}-${dim.period}-${dim.quotaType}-${dim.modelId ?? 'all'}-${i}`}
                    style={{ border: '1px solid #F0F0F0', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <Tag color={DIM_SOURCE_COLOR[dim.source]} style={{ marginRight: 0 }}>{t(DIM_SOURCE_LABEL_KEY[dim.source])}</Tag>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dim.sourceName}</span>
                        {dim.source !== 'employee' && (
                          <Tooltip title={t('home.usageDimSharedTeamTooltip')}>
                            <span style={{ fontSize: 11, color: '#1890FF', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                              <InfoCircleOutlined />{t('home.usageDimSharedTeamHint')}
                            </span>
                          </Tooltip>
                        )}
                      </div>
                      <Tag style={{ marginRight: 0, color: '#8C8C8C' }}>{dim.modelName ?? t('home.usageDimAllModels')}</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Tag style={{ marginRight: 0 }}>
                        {t(dim.period === 'daily' ? 'home.usageDimPeriodDaily' : 'home.usageDimPeriodMonthly')}
                        ·{t(dim.quotaType === 'token' ? 'home.usageDimTypeToken' : dim.quotaType === 'cost' ? 'home.usageDimTypeCost' : 'home.usageDimTypeRequest')}
                      </Tag>
                      <span style={{ fontSize: 12, fontWeight: 600, color }}>
                        {over
                          ? t('home.usageDimOver', { value: `${fmt(used - quota)}${unit ? ` ${unit}` : ''}` })
                          : t('home.usageDimRemaining', { value: `${fmt(Math.max(0, quota - used))}${unit ? ` ${unit}` : ''}` })}
                      </span>
                    </div>
                    <Progress percent={percent} strokeColor={color} format={(p) => `${p}%`} size="small" />
                    <div style={{ fontSize: 12, color: '#595959', marginTop: 2 }}>
                      {t('home.usageDimUsedPercent', { percent })} · {fmt(used)} / {fmt(quota)}{unit ? ` ${unit}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 4 }}>
                      {dim.period === 'daily' ? t('home.usageDimResetDaily') : t('home.usageDimResetOn', { date: dim.resetDate })}
                    </div>
                  </div>
                )
              })
            )}

            {/* 最近使用記錄 */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('home.usageRecentTitle')}</div>
            {myUsage.recentRecords.length === 0 ? (
              <Empty description={t('home.usageEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              myUsage.recentRecords.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F0F0F0' }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{r.model} · {r.mode}</div>
                    <div style={{ fontSize: 11, color: '#8C8C8C' }}>{r.time}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{formatNumber(r.promptTokens + r.completionTokens)} {t('home.usageUnitToken')}</div>
                    <div style={{ fontSize: 11, color: '#8C8C8C' }}>{r.currency ? `${currencySymbol(r.currency)}${formatCost(r.cost)}` : '--'}</div>
                  </div>
                </div>
              ))
            )}
            <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
              {t('home.usageRecentHint')}
            </div>
          </>
        ) : (
          <Empty description={t('home.usageEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Drawer>

      <MyMemoryDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <RememberMemoryModal open={rememberOpen} initialContent={rememberText}
        onClose={() => setRememberOpen(false)} />
      <Modal
        open={!!feedbackTarget}
        title={t('home.feedbackTitle', { defaultValue: '告訴我們哪裡不好' })}
        onCancel={() => setFeedbackTarget(null)}
        onOk={async () => {
          if (!feedbackTarget) return
          await handleFeedback(feedbackTarget, -1, feedbackReason)
          setFeedbackTarget(null)
        }}
        okText={t('common.submit', { defaultValue: '提交' })}
        destroyOnClose
      >
        <Select
          style={{ width: '100%' }}
          placeholder={t('home.feedbackReasonPlaceholder', { defaultValue: '選擇原因（可選）' })}
          value={feedbackReason}
          onChange={setFeedbackReason}
          options={[
            { value: 'wrong', label: t('home.feedbackReasonWrong', { defaultValue: '答非所問' }) },
            { value: 'data', label: t('home.feedbackReasonData', { defaultValue: '數據不對' }) },
            { value: 'verbose', label: t('home.feedbackReasonVerbose', { defaultValue: '太囉嗦' }) },
            { value: 'permission', label: t('home.feedbackReasonPermission', { defaultValue: '權限提示不清' }) },
          ]}
        />
      </Modal>
    </div>
  )
}
