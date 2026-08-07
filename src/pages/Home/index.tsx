import { useState, useEffect, useRef, useMemo } from 'react'
import { Input, Tag, Empty, Card, Tabs } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Line, Column } from '@ant-design/charts'
import { fetchMenuTree } from '../../api/menu'
import type { MenuVO } from '../../api/menu'
import { translateMenuName } from '../../i18n/menuNameEn'
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
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FontSizeOutlined,
  LineChartOutlined,
  ShoppingOutlined,
  UserAddOutlined,
  RiseOutlined,
  NotificationOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import './index.css'

/** 菜单分组英文名（首页分类 Tag，英文模式查映射） */
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

/** 所有可用菜单 */
const allMenus = [
  { key: 'account-balance', label: '賬戶餘額', icon: <AccountBookOutlined />, path: '/account-balance', group: '推廣金管理' },
  { key: 'batch-query', label: '批次查詢', icon: <SearchOutlined />, path: '/batch-query', group: '推廣金管理' },
  { key: 'detail-query', label: '明細查詢', icon: <FileSearchOutlined />, path: '/detail-query', group: '推廣金管理' },
  { key: 'writeoff-reconcile', label: '充消對賬', icon: <AuditOutlined />, path: '/writeoff-reconcile', group: '商戶通對賬' },
  { key: 'debt-reconcile', label: '欠款對賬', icon: <CheckCircleOutlined />, path: '/debt-reconcile', group: '商戶通對賬' },
  { key: 'approval-center', label: '審批中心', icon: <AuditOutlined />, path: '/approval-center', group: '審批管理' },
  { key: 'search-config', label: '搜索配置', icon: <SearchOutlined />, path: '/search-config', group: '搜索配置' },
  { key: 'hint-config', label: '底紋配置', icon: <FontSizeOutlined />, path: '/hint-config', group: '搜索引导' },
  { key: 'hot-search-config', label: '熱搜配置', icon: <FireOutlined />, path: '/hot-search-config', group: '搜索引导' },
  { key: 'word-segmentation', label: '分詞管理', icon: <DatabaseOutlined />, path: '/word-segmentation', group: '搜索词库' },
  { key: 'synonym-config', label: '同義詞配置', icon: <SwapOutlined />, path: '/synonym-config', group: '搜索词库' },
  { key: 'hot-search-library', label: '熱搜詞庫', icon: <FireOutlined />, path: '/hot-search-library', group: '搜索词库' },
  { key: 'hint-report', label: '底紋報表', icon: <LineChartOutlined />, path: '/hint-report', group: '報表統計' },
  { key: 'hot-search-report', label: '熱搜報表', icon: <LineChartOutlined />, path: '/hot-search-report', group: '報表統計' },
  // 商家推广工具
  { key: 'promotion-dashboard', label: '數據看板', icon: <LineChartOutlined />, path: '/promotion-dashboard', group: '商家推广工具' },
  { key: 'promotion-algorithm', label: '算法庫', icon: <DatabaseOutlined />, path: '/promotion-algorithm', group: '商家推广工具' },
  { key: 'promotion-slot-config', label: '瀑布流策略', icon: <SwapOutlined />, path: '/promotion-slot-config', group: '商家推广工具' },
  { key: 'promotion-waterfall', label: '銷售定價', icon: <WalletOutlined />, path: '/promotion-waterfall', group: '商家推广工具' },
  { key: 'merchant-order-manage', label: '訂單管理', icon: <FileSearchOutlined />, path: '/merchant-order-manage', group: '商家推广工具' },
  // 推广通
  { key: 'promotion-sales-config', label: '店鋪推廣', icon: <ShoppingOutlined />, path: '/promotion-sales-config', group: '推广通' },
  { key: 'promotion-order-manage', label: '訂單管理', icon: <FileSearchOutlined />, path: '/promotion-order-manage', group: '推广通' },
  { key: 'promotion-report-overview', label: '數據概覽', icon: <LineChartOutlined />, path: '/promotion-report-overview', group: '推广通' },
  { key: 'promotion-report-order', label: '訂單效果報表', icon: <LineChartOutlined />, path: '/promotion-report-order', group: '推广通' },
  { key: 'promotion-report-compare', label: '推薦類型對比', icon: <LineChartOutlined />, path: '/promotion-report-compare', group: '推广通' },
]

/** 默认常用菜单 */
const defaultFavorites = [
  'account-balance',
  'batch-query',
  'detail-query',
  'approval-center',
  'hint-config',
  'hot-search-config',
  'word-segmentation',
  'hint-report',
  'hot-search-report',
]

/** 待办事项 */
const todoItems = [
  { id: 1, count: 3, type: 'warning' as const },
  { id: 2, count: 5, type: 'info' as const },
  { id: 3, count: 2, type: 'info' as const },
  { id: 4, count: 1, type: 'error' as const },
]

/** 系统通知（内容由语言包 home.notifList 提供） */
const notifications = [
  { id: 1, read: false },
  { id: 2, read: false },
  { id: 3, read: true },
  { id: 4, read: true },
]

/** 系统公告（内容由语言包 home.announceList 提供） */
const announcements = [
  { id: 1, read: false },
  { id: 2, read: true },
  { id: 3, read: true },
]

/** 订单趋势数据 */
const orderTrendData = [
  { date: '06-17', delivery: 120, groupBuy: 45, supermarket: 38 },
  { date: '06-18', delivery: 132, groupBuy: 52, supermarket: 42 },
  { date: '06-19', delivery: 101, groupBuy: 48, supermarket: 35 },
  { date: '06-20', delivery: 134, groupBuy: 58, supermarket: 45 },
  { date: '06-21', delivery: 90, groupBuy: 40, supermarket: 32 },
  { date: '06-22', delivery: 150, groupBuy: 62, supermarket: 50 },
  { date: '06-23', delivery: 165, groupBuy: 68, supermarket: 55 },
]

/** 充值趋势数据 */
const rechargeTrendData = [
  { date: '06-17', amount: 12000 },
  { date: '06-18', amount: 15000 },
  { date: '06-19', amount: 8000 },
  { date: '06-20', amount: 22000 },
  { date: '06-21', amount: 18000 },
  { date: '06-22', amount: 25000 },
  { date: '06-23', amount: 28000 },
]

/** 用户增长数据 */
const userGrowthData = [
  { date: '06-17', users: 85 },
  { date: '06-18', users: 92 },
  { date: '06-19', users: 78 },
  { date: '06-20', users: 105 },
  { date: '06-21', users: 95 },
  { date: '06-22', users: 118 },
  { date: '06-23', users: 135 },
]

/** 数字动画 Hook */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const from = 0
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(from + (target - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

/** 递归收集菜单 key → 名称映射（与数据库实时同步） */
const collectMenuNames = (menus: MenuVO[], map: Record<string, string>) => {
  menus.forEach((m) => {
    map[m.menuKey] = m.name
    if (m.children?.length) collectMenuNames(m.children, map)
  })
}

export default function Home() {
  const navigate = useNavigate()
  const { t, i18n: i18nInstance } = useTranslation()
  const [searchText, setSearchText] = useState('')
  const [favorites, setFavorites] = useState<string[]>(defaultFavorites)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [menuNameMap, setMenuNameMap] = useState<Record<string, string>>({})
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  /** 加载后端菜单名称（菜单配置修改后实时同步） */
  useEffect(() => {
    let cancelled = false
    fetchMenuTree().then((tree) => {
      if (!cancelled) {
        const map: Record<string, string> = {}
        collectMenuNames(tree, map)
        setMenuNameMap(map)
      }
    })
    return () => { cancelled = true }
  }, [])

  /** 合并后端菜单名称后的可用菜单列表 */
  const menuList = useMemo(() => (
    allMenus.map((m) => (menuNameMap[m.key] ? { ...m, label: menuNameMap[m.key] } : m))
  ), [menuNameMap])

  // 数字动画
  const orderDelivery = useCountUp(165)
  const orderGroupBuy = useCountUp(68)
  const orderSupermarket = useCountUp(55)
  const newUsers = useCountUp(135)
  const rechargeAmount = useCountUp(28000)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return t('home.dateFormat', { year, month, day, hours, minutes, seconds })
  }

  const getWeekday = (date: Date) => t(`home.weekdays.${date.getDay()}`)

  /** 菜单分组名：英文模式查映射 */
  const translateGroup = (zh: string) => (
    i18nInstance.language?.startsWith('en') ? (GROUP_NAME_EN[zh] ?? zh) : zh
  )

  const filteredMenus = searchText
    ? menuList.filter((m) => {
        const label = translateMenuName(m.key, m.label)
        const group = translateGroup(m.group)
        return label.includes(searchText) || group.includes(searchText)
      })
    : []

  const addFavorite = (key: string) => {
    if (!favorites.includes(key)) {
      setFavorites([...favorites, key])
    }
    setShowAddMenu(false)
    setSearchText('')
  }

  const removeFavorite = (key: string) => {
    setFavorites(favorites.filter((k) => k !== key))
  }

  const getMenuInfo = (key: string) => menuList.find((m) => m.key === key)

  const getLineData = () => {
    const result: unknown[] = []
    orderTrendData.forEach(item => {
      result.push({ date: item.date, value: item.delivery, type: t('home.deliveryOrders') })
      result.push({ date: item.date, value: item.groupBuy, type: t('home.groupBuyOrders') })
      result.push({ date: item.date, value: item.supermarket, type: t('home.supermarketOrders') })
    })
    return result
  }

  const lineConfig = {
    data: getLineData(),
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
    legend: {
      position: 'top' as const,
    },
  }

  const columnConfig = {
    data: rechargeTrendData,
    xField: 'date',
    yField: 'amount',
    label: {
      position: 'middle' as const,
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
    xAxis: {
      label: {
        autoHide: true,
        autoRotate: false,
      },
    },
  }

  const _areaConfig = {
    data: userGrowthData,
    xField: 'date',
    yField: 'users',
    smooth: true,
    areaStyle: {
      fill: 'l(270) 0:#001529 0.5:#1890ff 1:#1890ff',
    },
    line: {
      style: {
        stroke: '#1890ff',
        lineWidth: 2,
      },
    },
  }

  return (
    <div className="home-page">
      {/* 欢迎横幅 */}
      <div className="home-welcome home-welcome--animated">
        <div className="home-welcome-left">
          <h2>{t('home.welcomeBack')} <span className="home-welcome-emoji">🐝</span></h2>
          <div className="home-welcome-marquee">
            <div className="home-welcome-marquee-track">
              <span className="home-welcome-marquee-text">
                {[t('home.tips0'), t('home.tips1')].join('  ·  ')}
              </span>
              <span className="home-welcome-marquee-text" aria-hidden>
                {[t('home.tips0'), t('home.tips1')].join('  ·  ')}
              </span>
            </div>
          </div>
        </div>
        <div className="home-welcome-right">
          <div className="home-welcome-datetime">{formatDate(currentTime)}</div>
          <div className="home-welcome-weekday">{getWeekday(currentTime)}</div>
        </div>
      </div>

      {/* 个人工作台和待办事项 */}
      <div className="home-workspace-todo-grid">
        {/* 个人工作台 */}
        <div className="home-section">
          <div className="home-section-header">
            <h3>{t('home.workspaceTitle')}</h3>
          </div>
          <div className="home-workspace-search">
            <Input
              prefix={<SearchOutlined style={{ color: '#999', fontSize: 14 }} />}
              placeholder={t('home.searchPlaceholder')}
              size="middle"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onFocus={() => setShowAddMenu(true)}
              allowClear
              className="home-search-input home-search-input--compact"
            />
            {showAddMenu && searchText && filteredMenus.length > 0 && (
              <div className="home-search-dropdown">
                {filteredMenus.map((menu) => (
                  <div
                    key={menu.key}
                    className={`home-search-item ${favorites.includes(menu.key) ? 'is-added' : ''}`}
                    onClick={() => !favorites.includes(menu.key) && addFavorite(menu.key)}
                  >
                    <span className="home-search-item-icon">{menu.icon}</span>
                    <span className="home-search-item-label">{translateMenuName(menu.key, menu.label)}</span>
                    <Tag>{translateGroup(menu.group)}</Tag>
                    {favorites.includes(menu.key) ? (
                      <span className="home-search-item-added">{t('home.added')}</span>
                    ) : (
                      <PlusOutlined className="home-search-item-add" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="home-favorites home-favorites--compact">
            {favorites.length === 0 ? (
              <Empty description={t('home.emptyFavorites')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              favorites.map((key) => {
                const menu = getMenuInfo(key)
                if (!menu) return null
                return (
                  <div
                    key={key}
                    className="home-fav-card home-fav-card--compact"
                    onClick={() => navigate(menu.path)}
                  >
                    <div className="home-fav-icon">{menu.icon}</div>
                    <span className="home-fav-label">{translateMenuName(menu.key, menu.label)}</span>
                    <button
                      className="home-fav-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFavorite(key)
                      }}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                )
              })
            )}
            <div className="home-fav-add home-fav-add--compact" onClick={() => setShowAddMenu(true)}>
              <PlusOutlined style={{ fontSize: 20, color: '#B0B0B0' }} />
              <span>{t('home.addMenu')}</span>
            </div>
          </div>
        </div>

        {/* 待办事项 */}
        <div className="home-section">
          <div className="home-section-header">
            <h3>{t('home.todoTitle')}</h3>
            <Tag color="red">{todoItems.reduce((s, t) => s + t.count, 0)}</Tag>
          </div>
          <div className="home-todo-list">
            {todoItems.map((item) => (
              <div 
                key={item.id} 
                className="home-todo-item"
                onClick={() => navigate('/approval-center')}
                style={{ cursor: 'pointer' }}
              >
                <div className="home-todo-left">
                  {item.type === 'error' && <ExclamationCircleOutlined style={{ color: '#E53935' }} />}
                  {item.type === 'warning' && <ClockCircleOutlined style={{ color: '#E8720C' }} />}
                  {item.type === 'info' && <CheckCircleOutlined style={{ color: '#1976D2' }} />}
                  <span>{t(`home.todos.${item.id - 1}.title`)}</span>
                </div>
                <Tag color={item.type === 'error' ? 'red' : item.type === 'warning' ? 'orange' : 'blue'}>
                  {item.count}
                </Tag>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 数据统计卡片和通知区域 */}
      <div className="home-stats-grid">
        {/* 左侧：三个统计卡片 */}
        <div className="home-stats-cards">
          {/* 订单数据卡片 - 横向布局 */}
          <Card className="home-stat-card home-stat-card--gradient-blue" hoverable>
            <div className="home-stat-header">
              <div className="home-stat-icon-badge" style={{ background: 'rgba(24,144,255,0.1)' }}>
                <ShoppingOutlined style={{ color: '#1890ff', fontSize: 18 }} />
              </div>
              <span className="home-stat-title">{t('home.todayOrders')}</span>
              <Tag color="blue" className="home-stat-live-tag">LIVE</Tag>
            </div>
            <div className="home-stat-content home-stat-content--horizontal">
              <div className="home-stat-item">
                <div className="home-stat-label">{t('home.deliveryOrders')}</div>
                <div className="home-stat-value home-stat-value--animated" style={{ color: '#1890ff' }}>{orderDelivery}</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +12%
                </div>
              </div>
              <div className="home-stat-divider" />
              <div className="home-stat-item">
                <div className="home-stat-label">{t('home.groupBuyOrders')}</div>
                <div className="home-stat-value home-stat-value--animated" style={{ color: '#722ed1' }}>{orderGroupBuy}</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +8%
                </div>
              </div>
              <div className="home-stat-divider" />
              <div className="home-stat-item">
                <div className="home-stat-label">{t('home.supermarketOrders')}</div>
                <div className="home-stat-value home-stat-value--animated" style={{ color: '#fa8c16' }}>{orderSupermarket}</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +15%
                </div>
              </div>
            </div>
          </Card>

          {/* 新用户统计卡片 */}
          <Card className="home-stat-card home-stat-card--gradient-green" hoverable>
            <div className="home-stat-header">
              <div className="home-stat-icon-badge" style={{ background: 'rgba(82,196,26,0.1)' }}>
                <UserAddOutlined style={{ color: '#52c41a', fontSize: 18 }} />
              </div>
              <span className="home-stat-title">{t('home.newUsersToday')}</span>
            </div>
            <div className="home-stat-content home-stat-content--single">
              <div className="home-stat-item">
                <div className="home-stat-label">{t('home.newUsers')}</div>
                <div className="home-stat-value home-stat-value--animated" style={{ color: '#52c41a', fontSize: 26 }}>{newUsers}</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +18% {t('home.vsYesterday')}
                </div>
              </div>
            </div>
          </Card>

          {/* 推广金统计卡片 */}
          <Card className="home-stat-card home-stat-card--gradient-gold" hoverable>
            <div className="home-stat-header">
              <div className="home-stat-icon-badge" style={{ background: 'rgba(250,173,20,0.1)' }}>
                <WalletOutlined style={{ color: '#faad14', fontSize: 18 }} />
              </div>
              <span className="home-stat-title">{t('home.rechargeTitle')}</span>
            </div>
            <div className="home-stat-content home-stat-content--single">
              <div className="home-stat-item">
                <div className="home-stat-label">{t('home.todayRecharge')}</div>
                <div className="home-stat-value home-stat-value--animated" style={{ color: '#faad14', fontSize: 24 }}>
                  MOP {rechargeAmount.toLocaleString()}
                </div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +22% {t('home.vsYesterday')}
                </div>
                <div className="home-stat-extra">{t('home.rechargeCount', { count: 12 })}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* 右侧：系统通知和公告 */}
        <Card className="home-notification-card-compact">
          <Tabs
            defaultActiveKey="1"
            size="small"
            items={[
              {
                key: '1',
                label: <span><NotificationOutlined /> {t('home.notifications')}</span>,
                children: (
                  <div className="home-notification-list-compact">
                    {notifications.slice(0, 3).map((n) => (
                      <div key={n.id} className={`home-notification-item-compact ${n.read ? '' : 'unread'}`}>
                        <div className="home-notification-title-compact">
                          {!n.read && <span className="home-notification-dot" />}
                          {t(`home.notifList.${n.id - 1}.title`)}
                        </div>
                        <div className="home-notification-time-compact">{t(`home.notifList.${n.id - 1}.time`)}</div>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: '2',
                label: <span><BulbOutlined /> {t('home.announcements')}</span>,
                children: (
                  <div className="home-notification-list-compact">
                    {announcements.slice(0, 3).map((n) => (
                      <div key={n.id} className={`home-notification-item-compact ${n.read ? '' : 'unread'}`}>
                        <div className="home-notification-title-compact">
                          {!n.read && <span className="home-notification-dot" />}
                          {t(`home.announceList.${n.id - 1}.title`)}
                        </div>
                        <div className="home-notification-time-compact">{t(`home.announceList.${n.id - 1}.time`)}</div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {/* 数据图表区域 - 并排展示 */}
      <div className="home-charts-grid">
        <Card title={t('home.orderTrend')} className="home-chart-card">
          <Line {...lineConfig} height={300} />
        </Card>
        <Card title={t('home.rechargeTrend')} className="home-chart-card">
          <Column {...columnConfig} height={300} />
        </Card>
      </div>
    </div>
  )
}
