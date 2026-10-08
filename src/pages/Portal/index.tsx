/**
 * 企业门户：通过两个 Tab 分别展示已授权与未授权系统。
 *
 * 已授权系统以 `/api/portal/context` 为准；未授权展示目录仅供前端界面确认。
 * 已授权卡片整体可点击，进入对应系统首页；未授权卡片不可进入系统，
 * 卡片下方展示「我要申请」，点击弹出确认框引导用户进入权限申请流程。
 * 权限请求失败时展示重试，不将接口异常误判为全部未授权。
 *
 * 整体版式参考企业门户通行做法（顶部横幅 + 概览指标 + 业务域分组应用墙 + 指引带），
 * 分组与筛选只做视觉归类，授权判定仍以门户接口返回为唯一依据。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Empty, Input, Modal, Spin, Tabs } from 'antd'
import {
  AccountBookOutlined, AppstoreOutlined, ControlOutlined, DeploymentUnitOutlined,
  FileProtectOutlined, GlobalOutlined, LockOutlined, PartitionOutlined,
  QuestionCircleOutlined, RiseOutlined, SafetyCertificateOutlined, SearchOutlined,
  TeamOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../../api/portal'
import { useCurrentSystem } from '../../hooks/useCurrentSystem'
import { getPortalSystemKey } from '../../constants/portalSystems'
import { useAuth } from '../../contexts/AuthContext'
import AnimatedNumber from '../../components/AnimatedNumber'
import SystemArtwork, { type PortalArtworkStyle } from './SystemArtwork'
import './index.css'

/**
 * 前端界面确认阶段的展示目录，与 SystemPortalSchemaInitializer 的十个业务系统对齐。
 * 全量目录接口目前仅权限管理员可用，暂不在门户调用；后续接入门户专用目录接口。
 * 此目录只用于展示未授权系统，不参与授权判断，不能据此放行入口。
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
    code: 'seller', name: '商家工作台',
  },
  {
    code: 'search', name: '搜索運營系統', nameEn: 'Search Ops',
    description: '搜索詞庫、引導、策略、校驗、報表', icon: 'SearchOutlined',
  },
  {
    code: 'finance', name: '財務系統', nameEn: 'Finance',
    description: '賬戶餘額、批次、明細、對賬、審批中心', icon: 'AccountBookOutlined',
  },
  {
    code: 'ai', name: 'AI 管理系統', nameEn: 'AI Hub',
    description: '模型、配額、授權、MCP、審計、能耗', icon: 'RobotOutlined',
  },
  {
    code: 'hr', name: 'HR 系統', nameEn: 'Human Resources',
    description: '員工、組織、職位、員工動態', icon: 'TeamOutlined',
  },
  {
    code: 'eam', name: '物資管理系統', nameEn: 'EAM',
    description: '資產、耗材、採購、庫存、盤點', icon: 'InboxOutlined',
  },
  {
    code: 'oa', name: 'OA 系統', nameEn: 'OA',
    description: '流程中心、流程事項、審批配置、員工自助', icon: 'SolutionOutlined',
  },
  {
    code: 'iam', name: '權限中心', nameEn: 'IAM',
    description: '角色、功能授權、數據授權、菜單配置', icon: 'SafetyCertificateOutlined',
  },
  {
    code: 'platform', name: '平台配置', nameEn: 'Platform',
    description: '通知、多語言、規則、版本、翻譯工作台', icon: 'SettingOutlined',
  },
  {
    code: 'i18n', name: '翻譯中心',
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
    key: 'org', nameKey: 'portal.domain.org', nameFallback: '組織與協同辦公',
    descKey: 'portal.domain.orgDesc', descFallback: '人事組織、流程審批與產研交付',
    icon: <TeamOutlined />, tone: '#1890FF', toneBg: '#E6F7FF',
    codes: ['hr', 'oa', 'rdm'],
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

/** 插画风格候选：產研協同提供两套构图，进页时随机抽一套，不给员工做选择。 */
const ARTWORK_STYLES: readonly PortalArtworkStyle[] = ['pipeline', 'gantt']

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
 * 横幅励志语：语料全部来自语言包 `portal.quotes` 数组（繁中/英/日/韩/俄各一套 30 条）。
 * 轮换间隔 5 秒，一轮 30 条走完才会重洗，约 2.5 分钟内不会看到重复。
 */
const QUOTE_ROTATE_MS = 5000

/** Fisher-Yates 洗牌，返回一轮不重复的下标顺序。 */
function shuffledOrder(size: number): number[] {
  const order = Array.from({ length: size }, (_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order
}

/** 从牌堆取下一条；牌堆空了就重洗，并保证新轮首条不与上一条相同。 */
function drawQuote(deck: number[], size: number, previous: number): number {
  if (deck.length === 0) {
    const order = shuffledOrder(size)
    if (order[0] === previous && order.length > 1) {
      ;[order[0], order[order.length - 1]] = [order[order.length - 1], order[0]]
    }
    deck.push(...order)
  }
  return deck.shift() ?? 0
}

/**
 * 读取当前语言的励志语数组。
 * returnObjects 让 i18next 直接返回数组，语言包缺该键时由 fallbackLng（英文）兜底；
 * 数据库翻译包只会写入扁平字符串，因此必须校验类型，非数组则视为无语料。
 */
function useMotivationQuotes(): string[] {
  const { t } = useTranslation()
  // 不做 memo：30 条字符串的过滤开销极低，而直接求值可保证语言切换后一定拿到新语料
  const raw = t('portal.quotes', { returnObjects: true }) as unknown
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

/**
 * 励志语轮播：独立组件自持 5 秒定时器，与时钟同理避免拖整页重渲染。
 * 父级以语言为 key 重挂载，切换语言时牌堆与文案同步重置。
 */
function PortalMotivationQuote({ quotes }: { quotes: readonly string[] }) {
  const { i18n } = useTranslation()
  const deck = useRef<number[]>([])
  const [index, setIndex] = useState(() => drawQuote(deck.current, quotes.length, -1))

  useEffect(() => {
    if (quotes.length < 2) return undefined
    const timer = window.setInterval(() => {
      setIndex((current) => drawQuote(deck.current, quotes.length, current))
    }, QUOTE_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [quotes.length])

  const text = quotes.length > 0 ? quotes[index % quotes.length] : ''
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

export default function Portal() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { setCurrentSystemCode } = useCurrentSystem()
  const { user } = useAuth()

  const [systems, setSystems] = useState<PortalSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null)
  /** 未授权系统点击后弹出的申请确认框，记录当前待申请的系统。 */
  const [requestSystem, setRequestSystem] = useState<PortalSystem | null>(null)
  /** Tab 与业务域筛选只决定展示范围，不改变任何系统的准入结果。 */
  const [activeTab, setActiveTab] = useState('authorized')
  const [domain, setDomain] = useState('all')
  /**
   * 插画风格随机抽一次：Portal 是路由级组件，登录进入与每次从系统内返回门户都会重新挂载，
   * 所以懒初始化恰好等价于「每次回到门户重新随机」，不写本地存储也不固定偏好。
   */
  const [artworkStyle] = useState<PortalArtworkStyle>(
    () => ARTWORK_STYLES[Math.floor(Math.random() * ARTWORK_STYLES.length)],
  )

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

  const unauthorizedSystems = useMemo(() => {
    const authorizedCodes = new Set(systems.map((system) => system.code))
    return PORTAL_SYSTEM_CATALOG.filter((system) => !authorizedCodes.has(system.code))
  }, [systems])

  /** 横幅问候与页脚年份只取挂载时刻，避免每分钟重渲染打断卡片插画的悬停播放。 */
  const now = useMemo(() => new Date(), [])
  const greeting = greetingOf(now.getHours())
  /** 励志语语料来自语言包并跟随界面语言，切换语言时整块重挂载重置牌堆。 */
  const motivationQuotes = useMotivationQuotes()

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

  const handleEnter = (sys: PortalSystem) => {
    if (loading || loadError) return
    if (!systems.some((system) => system.code === sys.code)) {
      // 未授权系统不直接进入，弹窗告知用户需先申请权限
      setRequestSystem(sys)
      return
    }
    // 系统首页不依赖首个菜单；菜单权限仍由首页和侧边栏读取服务端导航。
    setCurrentSystemCode(sys.code)
    navigate('/')
  }

  /** 确认申请：进入 OA 流程中心发起权限申请（申请表单流程后续接入）。 */
  const handleConfirmRequest = () => {
    setRequestSystem(null)
    navigate('/process-center')
  }

  /** 卡片文案跟随界面语言，artworkName 保留原始名称以锁定插画场景。 */
  const toView = (system: PortalSystem): ViewSystem => {
    const translationKey = getPortalSystemKey(system.code, system.name) ?? system.code
    return {
      ...system,
      artworkName: system.name,
      name: t(`portal.systems.${translationKey}.name`, { defaultValue: system.name }),
      description: t(`portal.systems.${translationKey}.description`, { defaultValue: system.description ?? '' }),
    }
  }

  /** 单卡结构保持原样（整卡即按钮、无独立操作按钮与图标），只调整外层分组容器。 */
  const renderCard = (sys: ViewSystem, hasAccess: boolean) => (
    <div
      key={sys.code}
      className="portal-card-shell"
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHoveredSystem(sys.code) }}
      onPointerLeave={() => setHoveredSystem(current => current === sys.code ? null : current)}
      onPointerCancel={() => setHoveredSystem(current => current === sys.code ? null : current)}
    >
      <button
        type="button"
        className={`portal-card${hasAccess ? '' : ' is-locked'}`}
        data-system={sys.code}
        title={!hasAccess ? t('portal.requestAccess') : undefined}
        onClick={() => handleEnter(sys)}
        aria-label={`${sys.name} · ${hasAccess ? t('portal.enter') : t('portal.requestAccess')}`}
      >
        <span className="portal-card-cover">
          <SystemArtwork code={sys.code} name={sys.artworkName} active={hoveredSystem === sys.code} style={artworkStyle} />
          {!hasAccess && <span className="portal-card-lock" aria-hidden="true"><LockOutlined /></span>}
        </span>
        <span className="portal-card-body">
          <span className="portal-card-title">{sys.name}</span>
          {sys.description ? <span className="portal-card-desc">{sys.description}</span> : null}
          {!hasAccess && (
            <span className="portal-card-locked-prompt">
              <SafetyCertificateOutlined aria-hidden="true" />
              <span>{t('portal.requestAccess')}</span>
            </span>
          )}
        </span>
      </button>
    </div>
  )

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

  /** 概览指标卡配色沿用设计令牌 A.1 与 B.7 统计卡色板，数值统一走计数动画。 */
  const stats = [
    { key: 'authorized', icon: <AppstoreOutlined />, tone: '#1890FF', bg: '#E6F7FF', value: systems.length, suffix: '', label: t('portal.statAuthorized', '已授權系統') },
    { key: 'requestable', icon: <SafetyCertificateOutlined />, tone: '#E8720C', bg: '#FFF7E6', value: unauthorizedSystems.length, suffix: '', label: t('portal.statRequestable', '可申請系統') },
    { key: 'domain', icon: <PartitionOutlined />, tone: '#52C41A', bg: '#F6FFED', value: authorizedDomainCount, suffix: ` / ${PORTAL_DOMAINS.length}`, label: t('portal.statDomain', '覆蓋業務板塊') },
    { key: 'total', icon: <DeploymentUnitOutlined />, tone: '#722ED1', bg: '#F9F0FF', value: totalSystemCount, suffix: '', label: t('portal.statTotal', '平台接入應用') },
  ]

  /** 底部指引带：把原本孤零的一行灰字提示扩展为四张说明卡，补足页面下沿信息量。 */
  const guides = [
    { key: 'access', icon: <SafetyCertificateOutlined />, tone: '#E8720C', title: t('portal.guideAccess', '權限說明'), desc: t('portal.accessNote') },
    { key: 'apply', icon: <FileProtectOutlined />, tone: '#1890FF', title: t('portal.guideApply', '申請指引'), desc: t('portal.guideApplyDesc', '在「未獲得權限」分頁點擊卡片即可發起權限申請，審批通過後自動開通。') },
    { key: 'locale', icon: <GlobalOutlined />, tone: '#52C41A', title: t('portal.guideLocale', '語言與地區'), desc: t('portal.guideLocaleDesc', '頂欄可切換國家與語言，系統名稱與簡介跟随界面語言展示。') },
    { key: 'search', icon: <QuestionCircleOutlined />, tone: '#722ED1', title: t('portal.guideSearch', '搜索與篩選'), desc: t('portal.guideSearchDesc', '搜索支持系統名稱與簡介關鍵字，業務板塊膠囊可快速縮小範圍。') },
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
                {t('portal.heroEyebrow', '麥峰科技 · 統一工作入口')}
              </span>
            </div>
            {/* 职位/部门已在右上角展示，横幅只保留工号与一句问候 */}
            <div className="portal-hero-greeting">
              <span className="portal-hero-hello">
                {t('portal.greetingLine', '{{greeting}}，{{name}}{{empId}}', {
                  greeting: t(`portal.greeting.${greeting.key}`, greeting.fallback),
                  name: user?.name || t('portal.heroUserFallback', '同事'),
                  empId: user?.empId ? t('portal.greetingEmpIdSuffix', '（{{empId}}）', { empId: user.empId }) : '',
                })}
              </span>
              <PortalMotivationQuote key={i18n.language} quotes={motivationQuotes} />
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
          </div>
        ))}
      </div>

      {/* 业务板块筛选：放在 Tabs 外部，不改变卡片自身的可访问性结构 */}
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
                  {!loading && !loadError && <span className="portal-tab-count">{systems.length}</span>}
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
                  {!loading && !loadError && <span className="portal-tab-count">{unauthorizedSystems.length}</span>}
                </span>
              ),
              children: renderSystemPanel(unauthorizedSystems, false),
            },
          ]}
        />
      </div>

      {/* 指引带与页脚：填充页面下沿，把入口说明固定在同一屏内 */}
      <div className="portal-guides">
        {guides.map((item) => (
          <div key={item.key} className="portal-guide-card">
            <span className="portal-guide-icon" style={{ background: `${item.tone}14`, color: item.tone }}>{item.icon}</span>
            <span className="portal-guide-title">{item.title}</span>
            <span className="portal-guide-desc">{item.desc}</span>
          </div>
        ))}
      </div>

      <footer className="portal-footer">
        <span className="portal-footer-brand">
          <ThunderboltOutlined aria-hidden="true" />
          {t('portal.footerBrand', '麥峰企業門戶 · 業務系統統一入口')}
        </span>
        <span className="portal-footer-copy">{t('portal.footerCopy', '© {{year}} 麥峰科技', { year: now.getFullYear() })}</span>
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
