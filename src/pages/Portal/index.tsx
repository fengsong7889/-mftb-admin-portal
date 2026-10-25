/**
 * 企业门户：通过两个 Tab 分别展示已授权与未授权系统。
 *
 * 已授权系统以 `/api/portal/context` 为准；未授权展示目录仅供前端界面确认。
 * 已授权卡片整体可点击，进入对应系统首页；未授权卡片不可进入系统，
 * 卡片下方展示「我要申请」，点击弹出确认框，确认后进入系統權限申請页发起 XTSQ 审批流程。
 * 权限请求失败时展示重试，不将接口异常误判为全部未授权。
 *
 * 整体版式参考企业门户通行做法（顶部横幅 + 概览指标 + 业务域分组应用墙 + 指引带），
 * 分组与筛选只做视觉归类，授权判定仍以门户接口返回为唯一依据。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Empty, Input, Modal, Spin, Tabs, message } from 'antd'
import {
  AccountBookOutlined, AppstoreOutlined, ClockCircleOutlined, CloseOutlined, ControlOutlined,
  DeploymentUnitOutlined, LockOutlined, PartitionOutlined, RiseOutlined, SafetyCertificateOutlined,
  ScheduleOutlined, SearchOutlined, MobileOutlined, StarFilled, StarOutlined, TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../../api/portal'
import { fetchMySystemAccessRequests } from '../../api/systemAccessRequest'
import { fetchPortalFavorites, savePortalFavorites } from '../../api/auth'
import { useRotatingMotivationQuote } from '../../hooks/useMotivationQuote'
import { useCurrentSystem } from '../../hooks/useCurrentSystem'
import { getPortalSystemKey, getSystemDisplayName } from '../../constants/portalSystems'
import { useAuth } from '../../contexts/AuthContext'
import { chineseNameToPinyinEnglish } from '../Home/homeUtils'
import AnimatedNumber from '../../components/AnimatedNumber'
import SystemArtwork, { type PortalArtworkStyle } from './SystemArtwork'
import appMerchantPromo from '../../assets/app-merchant-promo.jpg'
import appConsumerPromo from '../../assets/app-consumer-promo.jpg'
import './index.css'

/**
 * 前端界面确认阶段的展示目录，与 SystemPortalSchemaInitializer.seedSystems 的业务系统逐行对齐。
 * 全量目录接口目前仅权限管理员可用，暂不在门户调用；后续接入门户专用目录接口。
 * 此目录只用于展示未授权系统，不参与授权判断，不能据此放行入口。
 * 名称必须与 `sys_system.name` 完全一致（展示时还会再过一层 portal.systems.*.name 语言包），
 * 否则未授权卡片与已授权卡片、授权中心会出现同名系统不同写法。
 * 新增文案待 i18n 解耦后重构。
 */
const PORTAL_SYSTEM_CATALOG: readonly PortalSystem[] = [
  {
    code: 'ads', name: '廣告推薦系統', nameEn: 'Ads & Recommendation',
    description: '廣告銷售、商家推廣、推廣通、團購秒殺', icon: 'AimOutlined',
  },
  {
    code: 'merchant', name: '商戶運營系統', nameEn: 'Merchant Ops',
    description: '商戶集團、門店、門店數據、地圖規劃', icon: 'ShopOutlined',
  },
  {
    code: 'seller', name: '店鋪經營系統',
  },
  {
    code: 'search', name: '搜索運營系統', nameEn: 'Search Ops',
    description: '搜索詞庫、引導、策略、校驗、報表', icon: 'SearchOutlined',
  },
  {
    code: 'finance', name: '財務結算系統', nameEn: 'Finance & Settlement',
    description: '賬戶餘額、批次、明細、對賬、審批中心', icon: 'AccountBookOutlined',
  },
  {
    code: 'ai', name: '人工智能系統', nameEn: 'Artificial Intelligence',
    description: '模型、配額、授權、MCP、審計、能耗', icon: 'RobotOutlined',
  },
  {
    code: 'organization', name: '組織編制系統', nameEn: 'Organization & Headcount',
    description: '法人主體、管理組織、職位職級與崗位編制', icon: 'ApartmentOutlined',
  },
  {
    code: 'payroll', name: '薪酬福利系統', nameEn: 'Payroll & Benefits',
    description: '薪酬項目、薪酬標準（定調薪）、核算批次與工資單', icon: 'MoneyCollectOutlined',
  },
  {
    code: 'hr', name: '人力資源系統', nameEn: 'Human Resources',
    description: '員工、組織、職位、員工動態', icon: 'TeamOutlined',
  },
  {
    code: 'attendance', name: '考勤假勤系統', nameEn: 'Workforce & Attendance',
    description: '打卡、排班、節假日、請假額度與考勤匯總', icon: 'ClockCircleOutlined',
  },
  {
    code: 'eam', name: '物資管理系統', nameEn: 'EAM',
    description: '資產、耗材、採購、庫存、盤點', icon: 'InboxOutlined',
  },
  {
    code: 'rdm', name: '產研交付系統', nameEn: 'R&D Delivery',
    description: '需求提交、審批、分配、研發交付、驗收上線與產出看板', icon: 'ProjectOutlined',
  },
  {
    code: 'oa', name: '流程審批系統', nameEn: 'Workflow Approval',
    description: '流程中心、流程事項、審批配置、員工自助', icon: 'SolutionOutlined',
  },
  {
    code: 'meeting', name: '會議管理系統', nameEn: 'Meeting Management',
    description: '會議室檔案、忙閒選房、預約邀約與參會日程', icon: 'VideoCameraOutlined',
  },
  {
    code: 'doc', name: '文檔中心系統', nameEn: 'Document Center',
    description: '需求文檔、人事行政制度與培訓課程的統一索引與查閱入口', icon: 'CloudOutlined',
  },
  {
    code: 'iam', name: '權限管理系統', nameEn: 'IAM',
    description: '角色、功能授權、數據授權、菜單配置', icon: 'SafetyCertificateOutlined',
  },
  {
    code: 'platform', name: '平台支撐系統', nameEn: 'Platform',
    description: '通知渠道、規則、版本', icon: 'SettingOutlined',
  },
  {
    code: 'i18n', name: '翻譯管理系統',
  },
]

/**
 * 门户业务域配置：仅用于分组标题、筛选胶囊与概览统计的视觉归类。
 * 编码键取 getPortalSystemKey 归一化结果，未命中的系统统一落到「其他应用」，
 * 因此新增业务系统不会因漏配而从门户消失。文案取 portal.domain.*，五种语言包均已提供。
 */
interface PortalDomain {
  key: string
  nameKey: string
  nameFallback: string
  descKey: string
  descFallback: string
  icon: ReactNode
  tone: string
  toneBg: string
  codes: readonly string[]
}

const PORTAL_DOMAINS: readonly PortalDomain[] = [
  {
    key: 'growth', nameKey: 'portal.domain.growth', nameFallback: '營銷與商家增長',
    descKey: 'portal.domain.growthDesc', descFallback: '廣告投放、門店經營與搜索轉化',
    icon: <RiseOutlined />, tone: '#E8720C', toneBg: '#FFF7E6',
    codes: ['ads', 'search', 'merchant', 'merchantWorkbench'],
  },
  {
    key: 'biz', nameKey: 'portal.domain.biz', nameFallback: '經營與資產支撐',
    descKey: 'portal.domain.bizDesc', descFallback: '資金賬戶、財務對賬與物資資產管理',
    icon: <AccountBookOutlined />, tone: '#52C41A', toneBg: '#F6FFED',
    codes: ['finance', 'eam'],
  },
  {
    key: 'org', nameKey: 'portal.domain.org', nameFallback: '組織與人事',
    descKey: 'portal.domain.orgDesc', descFallback: '人事組織、職位異動與考勤假勤',
    icon: <TeamOutlined />, tone: '#1890FF', toneBg: '#E6F7FF',
    codes: ['hr', 'attendance'],
  },
  {
    /*
     * 協作與交付：把"人怎么把事协同做完"的四个系统放在一起——
     * 流程审批（oa）是协同的审批面、产研交付（rdm）是协同的交付面、会议（meeting）是协同的时间面、
     * 文檔中心（doc）是协同的知识面（需求文檔沉澱交付的來龍去脈，制度/培訓支撐全員落地）。
     * 会议原先落到「其他應用」不是因为它没有业务属性，而是因为它同时带行政与协作两种属性：
     * 会议室档案/预约规则/黑名单由行政维护（治理面），但真正的使用者是全员排期开会（协作面）。
     * 门户分类按使用者视角划分，所以归协作；行政治理入口留在系统内部的「預約規則」菜单。
     * 文檔中心同理：內容橫跨人事/行政/產品，但使用視角是全員在系統內查閱知識，
     * 空間治理入口留在系統內的「空間管理」菜单。
     */
    key: 'collab', nameKey: 'portal.domain.collab', nameFallback: '協作與交付',
    descKey: 'portal.domain.collabDesc', descFallback: '流程審批、產研交付、會議與知識協作',
    icon: <ScheduleOutlined />, tone: '#0958D9', toneBg: '#E6F0FF',
    codes: ['oa', 'rdm', 'meeting', 'doc'],
  },
  {
    key: 'govern', nameKey: 'portal.domain.govern', nameFallback: '智能與平台治理',
    descKey: 'portal.domain.governDesc', descFallback: 'AI 能力、權限授權與平台配置',
    icon: <ControlOutlined />, tone: '#722ED1', toneBg: '#F9F0FF',
    codes: ['ai', 'iam', 'platform', 'translation'],
  },
]

const PORTAL_DOMAIN_OTHER: PortalDomain = {
  key: 'other', nameKey: 'portal.domain.other', nameFallback: '其他應用',
  descKey: 'portal.domain.otherDesc', descFallback: '尚未歸類的業務系統',
  icon: <AppstoreOutlined />, tone: '#595959', toneBg: '#FAFAFA', codes: [],
}

/** 归一化编码 → 业务域，避免同一系统因编码别名被分到两组。 */
const DOMAIN_BY_SYSTEM_KEY = new Map(
  PORTAL_DOMAINS.flatMap((domain) => domain.codes.map((code) => [code, domain.key] as const)),
)

function resolveDomain(code: string, name: string): PortalDomain {
  const identity = getPortalSystemKey(code, name) ?? code
  return PORTAL_DOMAINS.find((domain) => domain.key === DOMAIN_BY_SYSTEM_KEY.get(identity)) ?? PORTAL_DOMAIN_OTHER
}

/** 问候语取 portal.greeting.* 语言包，按小时分段；默认值仅在语言包缺失时兜底。 */
function greetingOf(hour: number): { key: string; fallback: string } {
  if (hour < 5) return { key: 'lateNight', fallback: '凌晨好' }
  if (hour < 9) return { key: 'morning', fallback: '早上好' }
  if (hour < 12) return { key: 'forenoon', fallback: '上午好' }
  if (hour < 14) return { key: 'noon', fallback: '中午好' }
  if (hour < 18) return { key: 'afternoon', fallback: '下午好' }
  return { key: 'evening', fallback: '晚上好' }
}

/** 视图模型：artworkName 固定为接口返回的原始名称，保证插画场景不随界面语言漂移。 */
type ViewSystem = PortalSystem & { artworkName: string }

/** 插画构图候选：目前產研交付与广告推荐各自提供两套，进门户时逐档轮换，不给员工做选择。 */
const ARTWORK_STYLES: readonly PortalArtworkStyle[] = ['primary', 'alternate']
/** 只记录上次实际展示的档位；与业务导航状态（current_system_code 等）分开，不互相覆盖。 */
const ARTWORK_STYLE_KEY = 'portal_artwork_style'

/**
 * 取下一档构图：随机抽会让员工连续几次进门户看到同一套（两套时概率 50%），
 * 改成按上次展示结果往后推一档，就能保证每次重进或刷新都换一套。
 * 这里只读不写：渲染必须保持无副作用，否则 StrictMode 双调用会一次推进两档。
 */
function nextArtworkStyle(): PortalArtworkStyle {
  const shown = localStorage.getItem(ARTWORK_STYLE_KEY)
  const index = ARTWORK_STYLES.findIndex(style => style === shown)
  return ARTWORK_STYLES[(index + 1) % ARTWORK_STYLES.length]
}

/**
 * 常用（员工手动收藏）与最近使用（进入系统时自动记录）按用户名隔离持久化。
 * key 与首页快捷入口的 `home_favorites:*` 分开：两者语义不同（菜单 key vs 系统编码），
 * 且都是「整份覆盖写入」，共用一份会互相抹掉对方的数据。
 */
const FAVORITES_KEY = (username: string) => `portal_favorites:${username}`
const RECENT_KEY = (username: string) => `portal_recent:${username}`
/** 收藏不设上限：常用与否由员工自己判断，系统总量只会越来越多。最近使用是滚动窗口，保留最后访问的若干个。 */
const MAX_RECENT = 8
/**
 * 常用带单行可见上限：超过就把容器限高，其余用「+N 展开」折叠（评审 F7）。
 * 不设上限时 20 个收藏约 5 行 ≈ 250px，会把卡片墙直接挤出首屏。
 */
const FAVORITES_CLAMP_THRESHOLD = 4

/** 入场自动播的卡片数（评审 M3①）：首屏一行 = 5 列，只让「看得见的」动起来。 */
const AUTOPLAY_CARD_COUNT = 5
/** 播完即停：6s 主周期 + 4 张×0.35s 错峰余量，多给 600ms 避免最后一帧被截断。 */
const AUTOPLAY_DURATION_MS = 6600

/** 读取编码列表：脏数据一律按空处理，不能让一次坏写入把整个门户打不开。 */
function readCodeList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** 写入列表：隐私模式或配额满时返回 false，由调用方提示降级为「仅本次会话有效」，不打断进入系统。 */
function writeCodeList(key: string, list: string[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/**
 * 横幅日期时间行：24 小时制时钟 + 今天日期胶囊。
 * 独立组件并自持定时器，避免每秒重渲染整个门户而打断卡片插画的悬停播放。
 */
function PortalDateTime() {
  const { t, i18n } = useTranslation()
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const pad = (value: number) => String(value).padStart(2, '0')
  // 日期交给 Intl 按语言输出完整格式：zh-TW 为「2026年10月8日 (星期四)」，其他语言各自本地化
  const dateText = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(time)

  return (
    <div className="portal-hero-datetime">
      <span className="portal-hero-clock">{`${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`}</span>
      <span className="portal-hero-date">{t('portal.heroToday', '今天是：{{date}}', { date: dateText })}</span>
    </div>
  )
}

/**
 * 横幅励志语：语料与轮播逻辑统一收敛到 `hooks/useMotivationQuote`，
 * 与个系统首页横幅共用语言包 `portal.quotes` 同一数据源。
 */
function PortalMotivationQuote() {
  const { i18n } = useTranslation()
  const { text, index } = useRotatingMotivationQuote()
  if (!text) return null
  // 中文与日文用直角引号，其他语言不加装饰符号，分隔竖线已足够标识
  const wrapped = /^(zh|ja)/.test(i18n.language) ? `「${text}」` : text

  return (
    <span className="portal-hero-quote">
      <span className="portal-hero-quote-divider" aria-hidden="true" />
      {/* key 变化触发重挂载，使淡入动画每条都重新播放 */}
      <span className="portal-hero-quote-text" key={index}>{wrapped}</span>
    </span>
  )
}

/** 门户 Tab 白名单：仅这些页签可作为 ?tab= 深链还原目标 */
const PORTAL_TAB_KEYS = ['authorized', 'unauthorized', 'app'] as const

export default function Portal() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { setCurrentSystemCode } = useCurrentSystem()
  const { user } = useAuth()
  const isNonZh = !i18n.language?.startsWith('zh')

  const [systems, setSystems] = useState<PortalSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null)
  /** 未授权系统点击后弹出的申请确认框，记录当前待申请的系统。 */
  const [requestSystem, setRequestSystem] = useState<PortalSystem | null>(null)
  /** Tab 与业务域筛选只决定展示范围，不改变任何系统的准入结果。 */
  // 支持从 APP 返回时按 ?tab= 还原进入来源页签；无参数或非法值仍默认「已獲得權限」
  const [searchParams] = useSearchParams()
  const paramTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(
    paramTab && (PORTAL_TAB_KEYS as readonly string[]).includes(paramTab) ? paramTab : 'authorized',
  )
  const [domain, setDomain] = useState('all')
  /**
   * 插画构图逐档轮换：Portal 是路由级组件，登录进入、从系统内返回门户与刷新页面都会重新挂载，
   * 所以懒初始化恰好等价于「每次回到门户换一套」；只记住上一档是什么，不存员工偏好也不提供开关。
   */
  const [artworkStyle] = useState<PortalArtworkStyle>(nextArtworkStyle)
  /** 落盘放到挂载后，保证持久化的值就是本次真正看到的构图；重复写入同一个值，对 StrictMode 重挂载也幂等。 */
  useEffect(() => { localStorage.setItem(ARTWORK_STYLE_KEY, artworkStyle) }, [artworkStyle])
  /** 常用与最近使用只决定「谁排在第一屏」，不决定谁能进系统，准入判定始终只看后端返回。 */
  const [favorites, setFavorites] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  /**
   * 已有在途权限申請的系统编码：给未授权卡片一标「審批中」。
   * <p>没这个标记时，提交完回到门户卡片仍写「我要申請」，用户会以为提交没生效、
   * 反过来又点一次（后端虽会拒重复提交，但体验上是“按钮骗人”）。仅展示用，
   * 不参与任何准入判定；拉不到就当成无在途（不打断门户渲染）。
   */
  const [pendingRequestSystems, setPendingRequestSystems] = useState<Set<string>>(new Set())
  /** 常用带是否展开：超过单行上限时由「+N 展開」按钮收起/展开（评审 F7）。 */
  const [favoritesExpanded, setFavoritesExpanded] = useState(false)
  /**
   * 入场自动播一次（评审 M3①）：只对首屏首行的 5 张卡按 0.35s 错峰播一遍完整分镜，
   * 让用户知道「这里能动」；播完即停，不会每张卡永远在循环。
   * 用 ref 锁死「整个会话只自动播一次」，切换 Tab / 筛选不重播。
   */
  const [autoplayCodes, setAutoplayCodes] = useState<string[]>([])
  const autoplayDoneRef = useRef(false)

  /**
   * 按当前登录用户加载个人常用/最近使用；无 username（含测试桩）时保持为空，避免串号。
   * 收藏先渲染本地缓存再等云端：门户是登录后的第一屏，不该为一次偏好请求空着。
   * 云端返回数组（含空数组）以云端为准；返回 null/undefined 表示该账号从未同步过，保留本地，
   * 这样「在另一台设备上清空收藏」也能正确同步，而不会被本地残留反向覆盖回云端。
   */
  useEffect(() => {
    const username = user?.username
    if (!username) {
      setFavorites([])
      setRecent([])
      return
    }
    setFavorites(readCodeList(localStorage.getItem(FAVORITES_KEY(username))))
    setRecent(readCodeList(localStorage.getItem(RECENT_KEY(username))))
    let cancelled = false
    fetchPortalFavorites()
      .then((codes) => { if (!cancelled && Array.isArray(codes)) setFavorites(codes) })
      .catch(() => { /* 后端不可用时保留本地缓存，下次改动再尝试同步 */ })
    return () => { cancelled = true }
  }, [user?.username])

  /** 授权结果完全使用后端响应；区分请求失败和成功返回空列表。 */
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const ctx = await fetchPortalContext()
      setSystems(ctx.systems ?? [])
    } catch {
      setSystems([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 入场自动播：授权列表到手后，首屏首行几张卡错峰播一遍完整分镜（评审 M3①）。
   * 两个跳过条件：已整体播过一次（不重复骚扰）、用户开了 reduced-motion（尊重系统偏好）。
   */
  useEffect(() => {
    if (autoplayDoneRef.current || loading || loadError || systems.length === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    autoplayDoneRef.current = true
    setAutoplayCodes(systems.slice(0, AUTOPLAY_CARD_COUNT).map((system) => system.code))
    const timer = window.setTimeout(() => setAutoplayCodes([]), AUTOPLAY_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [systems, loading, loadError])

  /** 只看当前登录人自己的在途单（/my 接口服务端按登录态过滤，不信任前端参数） */
  useEffect(() => {
    let cancelled = false
    fetchMySystemAccessRequests()
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        setPendingRequestSystems(new Set(
          rows.filter((row) => row.status === 'pending').map((row) => row.systemCode),
        ))
      })
      .catch(() => { /* 后端不可用时不标记，也不能因此让门户打不开 */ })
    return () => { cancelled = true }
  }, [])

  const unauthorizedSystems = useMemo(() => {
    const authorizedCodes = new Set(systems.map((system) => system.code))
    return PORTAL_SYSTEM_CATALOG.filter((system) => !authorizedCodes.has(system.code))
  }, [systems])

  /** 横幅问候与页脚年份只取挂载时刻，避免每分钟重渲染打断卡片插画的悬停播放。 */
  const now = useMemo(() => new Date(), [])
  const greeting = greetingOf(now.getHours())
  /** 励志语语料与轮播由公共 Hook 提供，与首页横幅共用同一数据源。 */
  /** 概览指标全部来自已有数据，不伪造待办/消息类无来源数字。 */
  const totalSystemCount = useMemo(
    () => new Set([...PORTAL_SYSTEM_CATALOG.map((system) => system.code), ...systems.map((system) => system.code)]).size,
    [systems],
  )
  const authorizedDomainCount = useMemo(
    () => new Set(systems.map((system) => resolveDomain(system.code, system.name).key).filter((key) => key !== 'other')).size,
    [systems],
  )
  const activeList = activeTab === 'authorized' ? systems : unauthorizedSystems
  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>()
    activeList.forEach((system) => {
      const key = resolveDomain(system.code, system.name).key
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return counts
  }, [activeList])

  /**
   * 收藏切换：只维护本地展示顺序，不写任何准入标记。
   * 权限被后端撤销后，常用带会因下面的 `favoriteSystems` 过滤而自动消失，收藏本身不构成放行依据。
   * 不设数量上限，但每次切换都给轻提示：星标只有 28px、藏在卡片右上角，
   * 员工点完很难确认是否生效，之前「点了没反应」的困惑就来自这里。
   */
  const toggleFavorite = useCallback((code: string, name: string) => {
    const username = user?.username
    if (!username) return
    const adding = !favorites.includes(code)
    const next = adding ? [...favorites, code] : favorites.filter((item) => item !== code)
    setFavorites(next)
    if (!writeCodeList(FAVORITES_KEY(username), next)) {
      message.warning(t('portal.favNotSaved', '瀏覽器存儲不可用，本次收藏僅在当前頁面有效'))
      return
    }
    // 云端整份覆盖。失败不打断操作：本地已经生效，下次改动会再试，刷新时回退本地缓存。
    savePortalFavorites(next).catch(() => { /* 后端不可用时降级为仅本地持久化 */ })
    if (adding) {
      message.success(t('portal.favAdded', '已加入常用 · {{name}}', { name }))
      return
    }
    // × 紧贴 chip 主体、误点即删，只弹一句 toast 无从回退 → toast 里给「撤销」（评审 F5）
    const restore = () => {
      const restored = [...favorites.filter((item) => item !== code), code]
      setFavorites(restored)
      writeCodeList(FAVORITES_KEY(username), restored)
      savePortalFavorites(restored).catch(() => { /* 撤销失败不回滚 UI，下次改动重试 */ })
      message.success(t('portal.favAdded', '已加入常用 · {{name}}', { name }))
    }
    message.open({
      type: 'success',
      duration: 5,
      content: (
        <span className="portal-undo-toast">
          {t('portal.favRemoved', '已移出常用 · {{name}}', { name })}
          <button type="button" className="portal-undo-btn" onClick={restore}>
            {t('portal.favUndo', '撤銷')}
          </button>
        </span>
      ),
    })
  }, [favorites, t, user?.username])

  /** 记录最近使用：真正跳转成功前才写，弹窗引导申请的未授权系统不会被记进来。 */
  const rememberRecent = useCallback((code: string) => {
    const username = user?.username
    if (!username) return
    const next = [code, ...recent.filter((item) => item !== code)].slice(0, MAX_RECENT)
    setRecent(next)
    writeCodeList(RECENT_KEY(username), next)
  }, [recent, user?.username])

  const handleEnter = (sys: PortalSystem) => {
    if (loading || loadError) return
    if (!systems.some((system) => system.code === sys.code)) {
      // 未授权系统不直接进入，弹窗告知用户需先申请权限
      setRequestSystem(sys)
      return
    }
    rememberRecent(sys.code)
    // 系统首页不依赖首个菜单；菜单权限仍由首页和侧边栏读取服务端导航。
    setCurrentSystemCode(sys.code)
    navigate('/')
  }

  /**
   * 确认申请：进入系統權限申請页，携带系统编码发起 XTSQ 流程。
   * <p>不再跳 /process-center：那是 OA 系统内的受控菜单，「未获得权限」页签里的用户
   * 很可能连 OA 都没授权，跳过去只会看到 403——这正是「我要申請」看起来没实现的原因。
   * 申请页是仅需登录态的自助页，任何员工都能打开。
   * <p>name 只作语言包缺失时的展示兜底，系统是否存在、是否已授权一律由后端判定。
   */
  const handleConfirmRequest = () => {
    const target = requestSystem
    setRequestSystem(null)
    if (!target) return
    navigate(`/system-access-apply?system=${encodeURIComponent(target.code)}&name=${encodeURIComponent(target.name)}`)
  }

  /** 卡片文案跟随界面语言，artworkName 保留原始名称以锁定插画场景。 */
  const toView = (system: PortalSystem): ViewSystem => {
    const translationKey = getPortalSystemKey(system.code, system.name) ?? system.code
    return {
      ...system,
      artworkName: system.name,
      name: getSystemDisplayName(t, system, i18n.language),
      description: t(`portal.systems.${translationKey}.description`, { defaultValue: system.description ?? '' }),
    }
  }

  /**
   * 常用带只渲染仍然有权进入的系统：收藏里残留的编码（权限已撤销/系统已下线）自动被过滤掉。
   * 顺序固定「最近添加在前」（评审 F7）：常用带空间有限，最该露出的就是刚标的那几个。
   */
  const favoriteSystems = useMemo(() => [...favorites]
    .reverse()
    .map((code) => systems.find((system) => system.code === code))
    .filter((system): system is PortalSystem => !!system),
  [favorites, systems])

  /** 最近使用与常用去重，同一系统不在第一屏出现两次。 */
  const recentSystems = useMemo(() => recent
    .filter((code) => !favorites.includes(code))
    .map((code) => systems.find((system) => system.code === code))
    .filter((system): system is PortalSystem => !!system),
  [recent, favorites, systems])

  /** 常用带实际渲染的条目数：原口径只取收藏数，下排还有最近使用时数字就对不上（评审 F3）。 */
  const quickItemCount = favoriteSystems.length + recentSystems.length

  /** 单卡结构保持原样（整卡即按钮、卡内无独立操作按钮与图标）；收藏按钮挂在卡片外壳上，与卡按钮同级。 */
  const renderCard = (sys: ViewSystem, hasAccess: boolean) => {
    const favorited = favorites.includes(sys.code)
    const pendingRequest = !hasAccess && pendingRequestSystems.has(sys.code)
    const autoplaying = autoplayCodes.includes(sys.code)
    return (
    <div
      key={sys.code}
      className="portal-card-shell"
      data-autoplay={autoplaying ? '1' : undefined}
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHoveredSystem(sys.code) }}
      onPointerLeave={() => setHoveredSystem(current => current === sys.code ? null : current)}
      onPointerCancel={() => setHoveredSystem(current => current === sys.code ? null : current)}
    >
      <button
        type="button"
        className={`portal-card${hasAccess ? '' : ' is-locked'}`}
        data-system={sys.code}
        title={!hasAccess ? (pendingRequest ? t('portal.cardPendingRequest') : t('portal.requestAccess')) : undefined}
        onClick={() => handleEnter(sys)}
        aria-label={`${sys.name} · ${hasAccess ? t('portal.enter') : pendingRequest ? t('portal.cardPendingRequest') : t('portal.requestAccess')}`}
      >
        <span className="portal-card-cover">
          <SystemArtwork
            code={sys.code}
            name={sys.artworkName}
            active={hoveredSystem === sys.code || autoplaying}
            /* 悬停走 2.4s 微循环，入场自动播走 6s 完整分镜（评审 M3 两级策略） */
            mode={hoveredSystem === sys.code ? 'loop' : 'once'}
            style={artworkStyle}
          />
          {!hasAccess && <span className="portal-card-lock" aria-hidden="true"><LockOutlined /></span>}
        </span>
        <span className="portal-card-body">
          <span className="portal-card-title">{sys.name}</span>
          {sys.description ? <span className="portal-card-desc">{sys.description}</span> : null}
          {!hasAccess && (
            <span className="portal-card-locked-prompt">
              {pendingRequest ? <ClockCircleOutlined aria-hidden="true" /> : <SafetyCertificateOutlined aria-hidden="true" />}
              <span>{pendingRequest ? t('portal.cardPendingRequest') : t('portal.requestAccess')}</span>
            </span>
          )}
        </span>
      </button>
      {/* 未授权系统没有进入资格，也就不给收藏入口：既符合语义，也避免门户出现进不去的常用项 */}
      {hasAccess && (
        <button
          type="button"
          className={`portal-card-fav${favorited ? ' is-on' : ''}`}
          aria-label={`${favorited ? t('portal.cardUnfavorite', '取消常用') : t('portal.cardFavorite', '設為常用')} · ${sys.name}`}
          aria-pressed={favorited}
          onClick={() => toggleFavorite(sys.code, sys.name)}
        >
          {favorited ? <StarFilled aria-hidden="true" /> : <StarOutlined aria-hidden="true" />}
        </button>
      )}
    </div>
    )
  }

  /**
   * 常用带的小胶囊。
   * <p>收藏（我的意图）用业务域淡色实底 + ×，最近使用（系统记录）用无底色 + 1px 描边：
   * 「实心 = 我标的 / 空心 = 系统记的」一眼可分辨，不靠一行 12px 灰字（评审 F4）。
   * <p>色点保留，但加 title 显示业务域名，让颜色编码可学习（评审 F6①）。
   */
  const renderQuickChip = (sys: PortalSystem, removable: boolean) => {
    const view = toView(sys)
    const domain = resolveDomain(view.code, view.artworkName)
    return (
      <span
        key={sys.code}
        className={`portal-quick-item${removable ? '' : ' portal-quick-item--recent'}`}
        style={removable ? { background: domain.toneBg, borderColor: `${domain.tone}22` } : undefined}
      >
        <button
          type="button"
          className="portal-quick-open"
          onClick={() => handleEnter(sys)}
          aria-label={`${view.name} · ${t('portal.enter')}`}
        >
          <span
            className="portal-quick-dot"
            style={{ background: domain.tone }}
            title={t(domain.nameKey, domain.nameFallback)}
            aria-hidden="true"
          />
          <span className="portal-quick-name">{view.name}</span>
        </button>
        {removable && (
          <button
            type="button"
            className="portal-quick-remove"
            onClick={() => toggleFavorite(sys.code, view.name)}
            aria-label={`${t('portal.cardUnfavorite', '取消常用')} · ${view.name}`}
          >
            <CloseOutlined aria-hidden="true" />
          </button>
        )}
      </span>
    )
  }

  const renderSystemPanel = (group: readonly PortalSystem[], hasAccess: boolean) => {
    if (loading) {
      return <div className="portal-loading"><Spin size="large" /></div>
    }
    if (loadError) {
      return (
        <div className="portal-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portal.loadError')}>
            <Button type="primary" onClick={() => void load()}>{t('portal.retry')}</Button>
          </Empty>
        </div>
      )
    }

    const kw = keyword.trim().toLowerCase()
    const matched = group.map(toView).filter((system) =>
      `${system.name} ${system.description} ${system.code}`.toLowerCase().includes(kw),
    )
    if (matched.length === 0) {
      return (
        <div className="portal-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={kw
              ? t('portal.noMatch', '未匹配到系統')
              : hasAccess
                ? t('portal.noSystem', '暫未分配系統權限，請聯繫管理員')
                : t('portal.noUnauthorized')}
          >
            {hasAccess && group.length === 0 && (
              <Button type="primary" onClick={() => navigate('/')}>
                {t('portal.backToWorkbench', '返回個人工作台')}
              </Button>
            )}
          </Empty>
        </div>
      )
    }

    const filtered = domain === 'all' ? matched : matched.filter((system) => resolveDomain(system.code, system.artworkName).key === domain)
    if (filtered.length === 0) {
      return (
        <div className="portal-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portal.noDomainSystem', '該業務板塊暫無可用系統')}>
            <Button onClick={() => setDomain('all')}>{t('portal.viewAllSystems', '查看全部系統')}</Button>
          </Empty>
        </div>
      )
    }

    // 按业务域分桶，顺序固定跟随 PORTAL_DOMAINS，未归类系统落底
    const buckets = new Map<string, ViewSystem[]>()
    filtered.forEach((system) => {
      const { key } = resolveDomain(system.code, system.artworkName)
      const list = buckets.get(key)
      if (list) list.push(system)
      else buckets.set(key, [system])
    })

    return (
      <div className="portal-groups">
        {[...PORTAL_DOMAINS, PORTAL_DOMAIN_OTHER].filter((item) => buckets.has(item.key)).map((item) => {
          const list = buckets.get(item.key)!
          return (
            <section key={item.key} className="portal-group">
              <header className="portal-group-head">
                <span className="portal-group-icon" style={{ background: item.toneBg, color: item.tone }}>{item.icon}</span>
                <h2 className="portal-group-title">{t(item.nameKey, item.nameFallback)}</h2>
                <span className="portal-group-count" style={{ color: item.tone, background: item.toneBg }}>{list.length}</span>
                <span className="portal-group-line" aria-hidden="true" />
                <span className="portal-group-desc">{t(item.descKey, item.descFallback)}</span>
              </header>
              <div className="portal-grid">{list.map((system) => renderCard(system, hasAccess))}</div>
            </section>
          )
        })}
      </div>
    )
  }

  /** APP 面板：两张与系统卡同样式的入口卡（商家端 / 用户端），点击进入对应 APP 原型。 */
  const renderAppPanel = () => {
    const apps = [
      { key: 'merchant', name: t('portal.appMerchant', '商家端'), desc: t('portal.appMerchantDesc', '選購廣告、真實下單，訂單同步後台可查'), img: appMerchantPromo, status: t('portal.appMerchantStatus', '真實下單'), statusBg: '#52C41A', statusFg: '#fff' },
      { key: 'consumer', name: t('portal.appConsumer', '用戶端'), desc: t('portal.appConsumerDesc', '瀏覽正在推廣的商家與黃金時段'), img: appConsumerPromo, status: t('portal.appConsumerStatus', '數據待接入'), statusBg: '#FAAD14', statusFg: '#262626' },
    ]
    return (
      <div className="portal-groups">
        <section className="portal-group">
          <header className="portal-group-head">
            <span className="portal-group-icon" style={{ background: '#FFF7E6', color: '#E8720C' }}><MobileOutlined /></span>
            <h2 className="portal-group-title">{t('portal.appGroup', '移動應用')}</h2>
            <span className="portal-group-count" style={{ color: '#E8720C', background: '#FFF7E6' }}>2</span>
            <span className="portal-group-line" aria-hidden="true" />
            <span className="portal-group-desc">{t('portal.appGroupDesc', '原型預覽 · 數據取自真實後端')}</span>
          </header>
          <div className="portal-grid">
            {apps.map((a) => (
              <button
                key={a.key}
                type="button"
                className="portal-card"
                onClick={() => navigate(`/app-preview?app=${a.key}&from=app`)}
                aria-label={a.name}
              >
                <span className="portal-card-cover">
                  <img className="portal-card-cover-img" src={a.img} alt={a.name} />
                  <span className="portal-card-status" style={{ background: a.statusBg, color: a.statusFg }}>{a.status}</span>
                </span>
                <span className="portal-card-body">
                  <span className="portal-card-title">{a.name}</span>
                  <span className="portal-card-desc">{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  /**
   * 概览指标卡配色沿用设计令牌 A.1 与 B.7 统计卡色板，数值统一走计数动画。
   * 口径统一为「占比 + 绝对数」（评审 L4）：原先前两格是个数、第三格是比率、第四格是总数，
   * 四种格子三种量纲，其中「0 可申请」与「16 平台接入」没有对比基准就无从解读。
   * 「可申请 0」额外给一句微文案，让 0 看起来是「无待办」而不是「加载坏了」。
   */
  const stats = [
    { key: 'authorized', icon: <AppstoreOutlined />, tone: '#1890FF', bg: '#E6F7FF', value: systems.length, suffix: ` / ${totalSystemCount}`, label: t('portal.statAuthorized', '已授權系統'), hint: '' },
    // 可申請 0 → 灰显（评审 L4）：0 是「无待办」，不该跟其它三格的彩色数字抢注意力
    { key: 'requestable', icon: <SafetyCertificateOutlined />, tone: unauthorizedSystems.length === 0 ? '#BFBFBF' : '#E8720C', bg: unauthorizedSystems.length === 0 ? '#FAFAFA' : '#FFF7E6', value: unauthorizedSystems.length, suffix: ` / ${totalSystemCount}`, label: t('portal.statRequestable', '可申請系統'), hint: unauthorizedSystems.length === 0 ? t('portal.statAllGranted', '全部已開通') : '' },
    { key: 'domain', icon: <PartitionOutlined />, tone: '#52C41A', bg: '#F6FFED', value: authorizedDomainCount, suffix: ` / ${PORTAL_DOMAINS.length}`, label: t('portal.statDomain', '覆蓋業務板塊'), hint: '' },
    { key: 'total', icon: <DeploymentUnitOutlined />, tone: '#722ED1', bg: '#F9F0FF', value: totalSystemCount, suffix: '', label: t('portal.statTotal', '平台接入應用'), hint: '' },
  ]

  return (
    <div className="portal-page">
      {/* 顶部横幅：左列标题+问候，右列时钟+搜索，两列等高对齐保持低矮 */}
      <section className="portal-hero">
        <div className="portal-hero-decor" aria-hidden="true" />
        <div className="portal-hero-inner">
          <div className="portal-hero-left">
            <div className="portal-hero-heading">
              <h1 className="portal-title">{t('portal.appCenter')}</h1>
              <span className="portal-hero-eyebrow">
                <ThunderboltOutlined aria-hidden="true" />
                {t('portal.heroEyebrow', '麥峰集團 · 統一工作入口')}
              </span>
            </div>
            {/* 职位/部门已在右上角展示，横幅只保留工号与一句问候 */}
            <div className="portal-hero-greeting">
              <span className="portal-hero-hello">
                {t('portal.greetingLine', '{{greeting}}，{{name}}{{empId}}', {
                  greeting: t(`portal.greeting.${greeting.key}`, greeting.fallback),
                  name: isNonZh ? chineseNameToPinyinEnglish(user?.name || '') : (user?.name || t('portal.heroUserFallback', '同事')),
                  empId: user?.empId ? t('portal.greetingEmpIdSuffix', '（{{empId}}）', { empId: user.empId }) : '',
                })}
              </span>
              <PortalMotivationQuote key={i18n.language} />
            </div>
          </div>
          <div className="portal-hero-right">
            <PortalDateTime />
            <div className="portal-search-wrap">
              <Input
                className="portal-search"
                allowClear
                prefix={<SearchOutlined />}
                placeholder={t('portal.search', '搜尋系統')}
                aria-label={t('portal.search', '搜尋系統')}
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setHoveredSystem(null) }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 概览指标带：上提叠在横幅下沿，建立页面第一层视觉重心 */}
      <div className="portal-stats" key={`${systems.length}-${unauthorizedSystems.length}-${loading}`}>
        {stats.map((item) => (
          <div key={item.key} className="portal-stat" style={{ background: item.bg, borderColor: `${item.tone}22` }}>
            <span className="portal-stat-icon" style={{ color: item.tone }}>{item.icon}</span>
            <b className="portal-stat-value" style={{ color: item.tone }}>
              {loading || loadError ? '—' : <AnimatedNumber value={item.value} suffix={item.suffix} />}
            </b>
            <span className="portal-stat-label">{item.label}</span>
            {item.hint ? <span className="portal-stat-hint">{item.hint}</span> : null}
          </div>
        ))}
      </div>

      {/*
        我的常用：内容模块，独立白卡。它是「入口清单」，点击是导航，
        所以给块面、给标题，与下方卡片墙同属内容层。
        搜索中（结果已收敛，再排一次会互相打架）、加载中与移动 APP 页签都不展示；
        但「没有收藏也没有最近使用」时要照常渲染空态——
        这是新用户唯一知道「常用」存在的时机（评审 F1③）。
      */}
      {activeTab !== 'app' && !keyword.trim() && !loading && !loadError && (
        <section className="portal-favorites" aria-label={t('portal.quickFavorite', '我的常用')}>
          <header className="portal-favorites-head">
            <span className="portal-favorites-icon" aria-hidden="true"><StarFilled /></span>
            {/* 一张卡里可能只有最近使用（还没收藏过），标题跟着实际内容走，不挂空名 */}
            <h2 className="portal-favorites-title">
              {favoriteSystems.length > 0 ? t('portal.quickFavorite', '我的常用') : t('portal.quickRecent', '最近使用')}
            </h2>
            {quickItemCount > 0 && <span className="portal-favorites-count">{quickItemCount}</span>}
            <span className="portal-favorites-line" aria-hidden="true" />
            <span className="portal-favorites-tip">
              <StarOutlined aria-hidden="true" />
              {t('portal.favoritesTip', '在卡片右上角點 ☆ 即可加入常用')}
            </span>
          </header>

          {quickItemCount === 0 && (
            <p className="portal-favorites-empty">{t('portal.favoritesEmpty', '還沒有常用系統 · 在卡片右上角點 ☆ 添加')}</p>
          )}

          {favoriteSystems.length > 0 && (
            <>
              {/* 单行限高，超出折叠，避免常用带把卡片墙挤下去（评审 F7） */}
              <div className={`portal-favorites-chips${favoritesExpanded ? '' : ' is-clamped'}`}>
                {favoriteSystems.map((sys) => renderQuickChip(sys, true))}
              </div>
              {favoriteSystems.length > FAVORITES_CLAMP_THRESHOLD && (
                <button type="button" className="portal-favorites-more" onClick={() => setFavoritesExpanded((value) => !value)}>
                  {favoritesExpanded
                    ? t('portal.favoritesCollapse', '收起')
                    : t('portal.favoritesMore', '+{{count}} 展開', { count: favoriteSystems.length - FAVORITES_CLAMP_THRESHOLD })}
                </button>
              )}
            </>
          )}

          {recentSystems.length > 0 && (
            <div className={`portal-favorites-chips${favoriteSystems.length > 0 ? ' portal-favorites-recent' : ''}`}>
              {favoriteSystems.length > 0 && (
                <span className="portal-favorites-recent-label">
                  <ClockCircleOutlined aria-hidden="true" />{t('portal.quickRecent', '最近使用')}
                </span>
              )}
              {recentSystems.map((sys) => renderQuickChip(sys, false))}
            </div>
          )}
        </section>
      )}

      {/*
        业务板块：筛选工具条，故意不给卡片底 —— 它是控件不是内容，
        裸行紧贴下方面板，读起来就是「这排胶囊在筛下面这些卡片」。
        放在 Tabs 外部，不改变卡片自身的可访问性结构。
      */}
      {activeTab !== 'app' && (
        <div className="portal-filter">
          <span className="portal-filter-label">{t('portal.filterLabel', '業務板塊')}</span>
          <div className="portal-filter-chips">
            <Button
              type={domain === 'all' ? 'primary' : 'default'}
              className="portal-chip"
              onClick={() => { setDomain('all'); setHoveredSystem(null) }}
            >
              {t('portal.filterAll', '全部')}<em>{activeList.length}</em>
            </Button>
            {PORTAL_DOMAINS.map((item) => {
              const count = domainCounts.get(item.key) ?? 0
              if (!count) return null
              return (
                <Button
                  key={item.key}
                  type={domain === item.key ? 'primary' : 'default'}
                  className="portal-chip"
                  icon={item.icon}
                  onClick={() => { setDomain(item.key); setHoveredSystem(null) }}
                >
                  {t(item.nameKey, item.nameFallback)}<em>{count}</em>
                </Button>
              )
            })}
          </div>
          <span className="portal-filter-result">{t('portal.resultCount', '當前共 {{count}} 個系統', { count: activeList.length })}</span>
        </div>
      )}

      <div className="portal-panel">
        <Tabs
          className="portal-tabs"
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setHoveredSystem(null) }}
          items={[
            {
              key: 'authorized',
              label: (
                <span className="portal-tab-label">
                  <AppstoreOutlined aria-hidden="true" />
                  <span>{t('portal.authorized')}</span>
                  {/* 加载失败时计数是默认值 0，不是真实结果，显示「—」（评审 P0-7） */}
                  {!loading && <span className="portal-tab-count">{loadError ? '—' : systems.length}</span>}
                </span>
              ),
              children: renderSystemPanel(systems, true),
            },
            {
              key: 'unauthorized',
              label: (
                <span className="portal-tab-label">
                  <LockOutlined aria-hidden="true" />
                  <span>{t('portal.unauthorized')}</span>
                  {!loading && <span className="portal-tab-count">{loadError ? '—' : unauthorizedSystems.length}</span>}
                </span>
              ),
              children: renderSystemPanel(unauthorizedSystems, false),
            },
            {
              key: 'app',
              label: (
                <span className="portal-tab-label">
                  <MobileOutlined aria-hidden="true" />
                  <span>{t('portal.appTab', '移動 APP')}</span>
                  <span className="portal-tab-count">2</span>
                </span>
              ),
              children: renderAppPanel(),
            },
          ]}
        />
      </div>

      {/*
        页脚：原四张指引卡已删除（评审 L2）——它们解释的都是「点卡片能进系统」「右上角能切语言」
        这类一眼就懂的常识，却占 96px 高 + 24px 间距，出现在每次进门户的路径上。
        只把「怎么申请权限」收敛成右侧一个文字链，点开直接进系統權限申請页（该页无 system 参数也能打开）。
      */}
      <footer className="portal-footer">
        <span className="portal-footer-brand">
          <ThunderboltOutlined aria-hidden="true" />
          {t('portal.footerBrand', '麥峰企業門戶 · 業務系統統一入口')}
        </span>
        <span className="portal-footer-right">
          <button type="button" className="portal-footer-help" onClick={() => navigate('/system-access-apply')}>
            {t('portal.guideApply', '申請指引')}
            <span aria-hidden="true">›</span>
          </button>
          <span className="portal-footer-copy">{t('portal.footerCopy', '© {{year}} 麥峰科技', { year: now.getFullYear() })}</span>
        </span>
      </footer>

      {/* 未授权系统点击后的申请引导弹窗：关闭或进入权限申请流程二选一 */}
      <Modal
        open={!!requestSystem}
        centered
        onCancel={() => setRequestSystem(null)}
        footer={
          <div className="portal-request-footer">
            <Button onClick={() => setRequestSystem(null)}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={handleConfirmRequest}>
              {t('portal.requestApplyBtn')}
            </Button>
          </div>
        }
      >
        <div className="portal-request-body">
          <span className="portal-request-icon"><LockOutlined /></span>
          <div className="portal-request-text">
            <h3 className="portal-request-title">{t('portal.requestTitle')}</h3>
            <p className="portal-request-desc">
              {t('portal.requestDesc', { system: requestSystem?.name ?? '' })}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
