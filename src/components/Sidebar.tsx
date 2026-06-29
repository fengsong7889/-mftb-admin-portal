import { Layout, Menu } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AccountBookOutlined,
  WalletOutlined,
  SearchOutlined,
  FileSearchOutlined,
  SwapOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  FundOutlined,
  DatabaseOutlined,
  ScissorOutlined,
  FontSizeOutlined,
  EyeOutlined,
  FireOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PlusOutlined,
  AimOutlined,
  ReadOutlined,
  HomeOutlined,
  ColumnHeightOutlined,
  SettingOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  StopOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
  AppstoreOutlined,
  DollarOutlined,
  OrderedListOutlined,
  CalendarOutlined,
  PieChartOutlined,
  ExperimentOutlined,
  BlockOutlined,
  GiftOutlined,
  TagOutlined,
  ClockCircleOutlined,
  UserOutlined,
  DashboardOutlined,
} from '@ant-design/icons'

const { Sider } = Layout

type MenuItem = Required<MenuProps>['items'][number]

/** 菜单 key → 路由路径 映射 */
const keyToPath: Record<string, string> = {
  // 首頁
  'home': '/',
  // 财务管理 - 推广金管理
  'account-balance': '/account-balance',
  'batch-query': '/batch-query',
  'detail-query': '/detail-query',
  // 财务管理 - 商户通对账
  'writeoff-reconcile': '/writeoff-reconcile',
  'debt-reconcile': '/debt-reconcile',
  // 财务管理 - 审批管理
  'approval-center': '/approval-center',
  // 搜索管理 - 搜索引导
  'hint-config': '/hint-config',
  'hint-preview': '/hint-preview',
  'hot-search-config': '/hot-search-config',
  'hot-search-preview': '/hot-search-preview',
  'search-weight-config': '/search-weight-config',
  // 搜索管理 - 搜索词库
  'word-segmentation': '/word-segmentation',
  'synonym-config': '/synonym-config',
  'hot-search-library': '/hot-search-library',
  'stop-words': '/stop-words',
  // 搜索管理 - 报表统计
  'hint-report': '/hint-report',
  'hot-search-report': '/hot-search-report',
  // 搜索配置管理(新系统)
  'global-config': '/global-config',
  'channel-strategy': '/channel-strategy',
  // 搜索校驗
  'search-verify': '/search-verify',
  'search-verify-detail': '/search-verify-detail',
  'hint-verify': '/hint-verify',
  'hot-search-verify': '/hot-search-verify',
  // 推薦管理
  'recommend-dashboard': '/recommend-dashboard',
  'recommend-recall-strategy': '/recommend-recall-strategy',
  'recommend-recall-source': '/recommend-recall-source',
  'recommend-recall-analysis': '/recommend-recall-analysis',
  'recommend-ranking-coarse': '/recommend-ranking-coarse',
  'recommend-ranking-fine': '/recommend-ranking-fine',
  'recommend-ranking-rerank': '/recommend-ranking-rerank',
  'recommend-strategy-adtype': '/recommend-strategy-adtype',
  'recommend-strategy-orchestration': '/recommend-strategy-orchestration',
  'recommend-strategy-timeslot': '/recommend-strategy-timeslot',
  'recommend-ab-test': '/recommend-ab-test',
  'recommend-slot': '/recommend-slot',
  'recommend-pricing': '/recommend-pricing',
  'recommend-merchant-rule': '/recommend-merchant-rule',
  'recommend-package': '/recommend-package',
  'recommend-order': '/recommend-order',
  'recommend-calendar': '/recommend-calendar',
  'recommend-effect-report': '/recommend-effect-report',
  'recommend-revenue-report': '/recommend-revenue-report',
  'recommend-user-profile': '/recommend-user-profile',
  'recommend-algorithm-monitor': '/recommend-algorithm-monitor',
  'recommend-algorithm': '/recommend-algorithm',
  // 權限管理
  'function-permission': '/function-permission',
  'data-permission': '/data-permission',
  // 系統設置
  // 注意:以下菜单项暂未实现对应页面
  // 'menu-management': '/menu-management',
  // 'system-template': '/system-template',
  // 'layout-settings': '/layout-settings',
  // 'basic-settings': '/basic-settings',
  // 用戶管理
  'user-feedback': '/user-feedback',
  'user-list': '/user-list',
  'user-avatar': '/user-avatar',
  'user-frozen': '/user-frozen',
  'device-frozen': '/device-frozen',
  'user-location-special': '/user-location-special',
  'user-location-blacklist': '/user-location-blacklist',
  'whitelist': '/whitelist',
  // 運營投放管理
  'delivery-list': '/delivery-list',
  // 商戶集團管理
  'merchant-onboarding': '/merchant-onboarding',
  'merchant-feedback': '/merchant-feedback',
  'group-list': '/group-list',
  'group-permission': '/group-permission',
  'store-basic-info': '/store-basic-info',
  'contract-management': '/contract-management',
  'group-brand-library': '/group-brand-library',
  // 到家業務(外賣)
  'product-tags': '/product-tags',
  'product-params': '/product-params',
  'store-management': '/store-management',
  'store-categories': '/store-categories',
  'product-platform-categories': '/product-platform-categories',
  // 到店業務(團購)
  'group-buy-store': '/group-buy-store',
  'group-buy-product': '/group-buy-product',
  // 商家推广工具
  'promotion-dashboard': '/promotion-dashboard',
  'promotion-algorithm': '/promotion-algorithm',
  'promotion-slot-config': '/promotion-slot-config',
  'promotion-waterfall': '/promotion-waterfall',
  'promotion-sales-config': '/promotion-sales-config',
  'promotion-order-manage': '/promotion-order-manage',
  // 推广通 - 報表分析
  'promotion-report-overview': '/promotion-report-overview',
  'promotion-report-order': '/promotion-report-order',
  'promotion-report-compare': '/promotion-report-compare',
  // 地圖規劃
  'map-planning': '/map-planning',
  // 推广通(父菜单,无需映射)
  // 'promotion-tool': '/promotion-tool',
}

/** 路由路径 → 菜单 key 映射（用于高亮） */
const pathToKey: Record<string, string> = {}
Object.entries(keyToPath).forEach(([key, path]) => {
  pathToKey[path] = key
})

const menuItems: MenuItem[] = [
  {
    key: 'home',
    icon: <HomeOutlined />,
    label: '首頁',
  },
  {
    key: 'system',
    icon: <SettingOutlined />,
    label: '系統設置',
    children: [
      {
        key: 'menu-management',
        icon: <AppstoreOutlined />,
        label: '菜單管理',
      },
      {
        key: 'system-template',
        icon: <ReadOutlined />,
        label: '系統模板',
      },
      {
        key: 'layout-settings',
        icon: <ColumnHeightOutlined />,
        label: '布局設置',
      },
      {
        key: 'basic-settings',
        icon: <SettingOutlined />,
        label: '基礎設置',
      },
    ],
  },
  {
    key: 'user-management',
    icon: <AuditOutlined />,
    label: '用戶管理',
    children: [
      {
        key: 'user-feedback',
        icon: <FileSearchOutlined />,
        label: '用戶意見反饋',
      },
      {
        key: 'user-list',
        icon: <OrderedListOutlined />,
        label: '用戶列表',
      },
      {
        key: 'user-avatar',
        icon: <EyeOutlined />,
        label: '用戶頭像管理',
      },
      {
        key: 'user-frozen',
        icon: <StopOutlined />,
        label: '用戶凍結列表',
      },
      {
        key: 'device-frozen',
        icon: <BlockOutlined />,
        label: '設備號凍結列表',
      },
      {
        key: 'user-location-special',
        icon: <AimOutlined />,
        label: '用戶收貨地圖特殊收錄',
      },
      {
        key: 'user-location-blacklist',
        icon: <StopOutlined />,
        label: '用戶收貨地圖黑名單',
      },
      {
        key: 'whitelist',
        icon: <SafetyCertificateOutlined />,
        label: '白名單(內外測試人員)',
      },
    ],
  },
  {
    key: 'operation-platform',
    icon: <RocketOutlined />,
    label: '運營平台工具',
  },
  {
    key: 'operation-delivery',
    icon: <FundOutlined />,
    label: '運營投放管理',
    children: [
      {
        key: 'delivery-list',
        icon: <OrderedListOutlined />,
        label: '投放列表',
      },
    ],
  },
  {
    key: 'merchant-group',
    icon: <AppstoreOutlined />,
    label: '商戶集團管理',
    children: [
      {
        key: 'merchant-onboarding',
        icon: <PlusOutlined />,
        label: '商家入駐',
      },
      {
        key: 'merchant-feedback',
        icon: <FileSearchOutlined />,
        label: '商家意見',
      },
      {
        key: 'group-list',
        icon: <OrderedListOutlined />,
        label: '集團列表',
      },
      {
        key: 'group-permission',
        icon: <SafetyCertificateOutlined />,
        label: '集團權限(運營主管)',
      },
      {
        key: 'store-basic-info',
        icon: <DatabaseOutlined />,
        label: '門店基礎信息管理',
      },
      {
        key: 'contract-management',
        icon: <ReadOutlined />,
        label: '合同管理',
      },
      {
        key: 'group-brand-library',
        icon: <AppstoreOutlined />,
        label: '集團門店品牌庫管理',
      },
    ],
  },
  {
    key: 'delivery-business',
    icon: <RocketOutlined />,
    label: '到家業務(外賣)',
    children: [
      {
        key: 'product-tags',
        icon: <TagOutlined />,
        label: '商品標簽',
      },
      {
        key: 'product-params',
        icon: <SettingOutlined />,
        label: '商品參數',
      },
      {
        key: 'store-management',
        icon: <AppstoreOutlined />,
        label: '門店管理',
      },
      {
        key: 'store-categories',
        icon: <OrderedListOutlined />,
        label: '門店營業品類',
      },
      {
        key: 'product-platform-categories',
        icon: <GlobalOutlined />,
        label: '商品平台分類',
      },
    ],
  },
  {
    key: 'group-buy-business',
    icon: <GiftOutlined />,
    label: '到店業務(團購)',
    children: [
      {
        key: 'group-buy-store',
        icon: <AppstoreOutlined />,
        label: '團購門店管理',
      },
      {
        key: 'group-buy-product',
        icon: <DatabaseOutlined />,
        label: '商品管理',
      },
    ],
  },
  {
    key: 'merchant-promotion',
    icon: <RocketOutlined />,
    label: '商家推广工具',
    children: [
      {
        key: 'promotion-dashboard',
        icon: <PieChartOutlined />,
        label: '數據看板',
      },
      {
        key: 'map-planning',
        icon: <AimOutlined />,
        label: '地圖規劃',
      },
      {
        key: 'promotion-algorithm-group',
        icon: <AppstoreOutlined />,
        label: '算法管理',
        children: [
          {
            key: 'promotion-algorithm',
            icon: <AppstoreOutlined />,
            label: '算法庫',
          },
          {
            key: 'promotion-slot-config',
            icon: <ColumnHeightOutlined />,
            label: '瀑布流策略',
          },
        ],
      },
      {
        key: 'promotion-waterfall',
        icon: <ColumnHeightOutlined />,
        label: '定價銷售配置',
      },
    ],
  },
  {
    key: 'promotion-tool',
    icon: <ThunderboltOutlined />,
    label: '推广通',
    children: [
      {
        key: 'promotion-sales-config',
        icon: <DollarOutlined />,
        label: '廣告購買',
      },
      {
        key: 'promotion-order-manage',
        icon: <OrderedListOutlined />,
        label: '訂單管理',
      },
      {
        key: 'promotion-report-group',
        icon: <BarChartOutlined />,
        label: '報表分析',
        children: [
          {
            key: 'promotion-report-overview',
            icon: <DashboardOutlined />,
            label: '數據概覽',
          },
          {
            key: 'promotion-report-order',
            icon: <LineChartOutlined />,
            label: '訂單效果報表',
          },
          {
            key: 'promotion-report-compare',
            icon: <PieChartOutlined />,
            label: '推薦類型對比',
          },
        ],
      },
    ],
  },
  {
    key: 'search',
    icon: <DatabaseOutlined />,
    label: '搜索管理',
    children: [
      {
        key: 'search-config-new',
        icon: <SettingOutlined />,
        label: '搜索配置',
        children: [
          {
            key: 'global-config',
            icon: <GlobalOutlined />,
            label: '全局配置',
          },
          {
            key: 'channel-strategy',
            icon: <ThunderboltOutlined />,
            label: '維度策略',
          },
        ],
      },
      {
        key: 'search-guide',
        icon: <AimOutlined />,
        label: '搜索引導',
        children: [
          {
            key: 'hint-config',
            icon: <FontSizeOutlined />,
            label: '底紋配置',
          },
          {
            key: 'hot-search-config',
            icon: <FireOutlined />,
            label: '熱搜配置',
          },
          {
            key: 'search-weight-config',
            icon: <ColumnHeightOutlined />,
            label: '權重干預',
          },
        ],
      },
      {
        key: 'search-library',
        icon: <ReadOutlined />,
        label: '搜索詞庫',
        children: [
          {
            key: 'word-segmentation',
            icon: <ScissorOutlined />,
            label: '分詞詞庫',
          },
          {
            key: 'synonym-config',
            icon: <SwapOutlined />,
            label: '同義詞庫',
          },
          {
            key: 'hot-search-library',
            icon: <FireOutlined />,
            label: '熱搜詞庫',
          },
          {
            key: 'stop-words',
            icon: <StopOutlined />,
            label: '停用詞庫',
          },
        ],
      },
      {
        key: 'search-verify-group',
        icon: <SafetyCertificateOutlined />,
        label: '效果校驗',
        children: [
          {
            key: 'search-verify',
            icon: <SearchOutlined />,
            label: '搜索校驗',
          },
          {
            key: 'hint-verify',
            icon: <FontSizeOutlined />,
            label: '底紋校驗',
          },
          {
            key: 'hot-search-verify',
            icon: <FireOutlined />,
            label: '熱搜校驗',
          },
        ],
      },
      {
        key: 'report',
        icon: <BarChartOutlined />,
        label: '報表統計',
        children: [
          {
            key: 'hint-report',
            icon: <LineChartOutlined />,
            label: '底紋報表',
          },
          {
            key: 'hot-search-report',
            icon: <LineChartOutlined />,
            label: '熱搜報表',
          },
        ],
      },
    ],
  },
  {
    key: 'finance',
    icon: <FundOutlined />,
    label: '財務管理',
    children: [
      {
        key: 'promotion',
        icon: <WalletOutlined />,
        label: '推廣金管理',
        children: [
          {
            key: 'account-balance',
            icon: <AccountBookOutlined />,
            label: '賬戶餘額',
          },
          {
            key: 'batch-query',
            icon: <SearchOutlined />,
            label: '批次查詢',
          },
          {
            key: 'detail-query',
            icon: <FileSearchOutlined />,
            label: '明細查詢',
          },
        ],
      },
      {
        key: 'merchant-reconcile',
        icon: <SwapOutlined />,
        label: '商戶通對賬',
        children: [
          {
            key: 'writeoff-reconcile',
            icon: <AuditOutlined />,
            label: '充消對賬',
          },
          {
            key: 'debt-reconcile',
            icon: <CheckCircleOutlined />,
            label: '欠款對賬',
          },
        ],
      },
      {
        key: 'approval',
        icon: <CheckCircleOutlined />,
        label: '審批管理',
        children: [
          {
            key: 'approval-center',
            icon: <AuditOutlined />,
            label: '審批中心',
          },
        ],
      },
    ],
  },
  {
    key: 'permission',
    icon: <SafetyCertificateOutlined />,
    label: '權限管理',
    children: [
      {
        key: 'function-permission',
        icon: <AppstoreOutlined />,
        label: '功能權限',
      },
      {
        key: 'data-permission',
        icon: <DatabaseOutlined />,
        label: '數據權限',
      },
    ],
  },
  {
    key: 'recommend',
    icon: <RocketOutlined />,
    label: '推薦管理',
    children: [
      {
        key: 'recommend-recall-group',
        icon: <AimOutlined />,
        label: '召回層配置',
        children: [
          {
            key: 'recommend-recall-strategy',
            icon: <AimOutlined />,
            label: '召回策略管理',
          },
          {
            key: 'recommend-recall-source',
            icon: <DatabaseOutlined />,
            label: '召回源配置',
          },
          {
            key: 'recommend-recall-analysis',
            icon: <BarChartOutlined />,
            label: '召回效果分析',
          },
        ],
      },
      {
        key: 'recommend-ranking-group',
        icon: <LineChartOutlined />,
        label: '排序層配置',
        children: [
          {
            key: 'recommend-ranking-coarse',
            icon: <ThunderboltOutlined />,
            label: '粗排配置',
          },
          {
            key: 'recommend-ranking-fine',
            icon: <LineChartOutlined />,
            label: '精排配置',
          },
          {
            key: 'recommend-ranking-rerank',
            icon: <SwapOutlined />,
            label: '重排策略',
          },
        ],
      },
      {
        key: 'recommend-strategy-group',
        icon: <ThunderboltOutlined />,
        label: '策略層配置',
        children: [
          {
            key: 'recommend-strategy-adtype',
            icon: <TagOutlined />,
            label: '廣告類型策略',
          },
          {
            key: 'recommend-strategy-orchestration',
            icon: <SettingOutlined />,
            label: '策略編排引擎',
          },
          {
            key: 'recommend-strategy-timeslot',
            icon: <ClockCircleOutlined />,
            label: '時段策略',
          },
          {
            key: 'recommend-ab-test',
            icon: <ExperimentOutlined />,
            label: 'A/B測試平台',
          },
        ],
      },
      {
        key: 'recommend-delivery-group',
        icon: <BlockOutlined />,
        label: '投放層配置',
        children: [
          {
            key: 'recommend-slot',
            icon: <OrderedListOutlined />,
            label: '坑位管理',
          },
          {
            key: 'recommend-pricing',
            icon: <DollarOutlined />,
            label: '定價策略',
          },
          {
            key: 'recommend-merchant-rule',
            icon: <AppstoreOutlined />,
            label: '商家推薦規則',
          },
        ],
      },
      {
        key: 'recommend-order-group',
        icon: <OrderedListOutlined />,
        label: '訂單管理',
        children: [
          {
            key: 'recommend-order',
            icon: <FileSearchOutlined />,
            label: '訂單列表',
          },
          {
            key: 'recommend-calendar',
            icon: <CalendarOutlined />,
            label: '投放日曆',
          },
          {
            key: 'recommend-package',
            icon: <GiftOutlined />,
            label: '投放包管理',
          },
        ],
      },
      {
        key: 'recommend-analytics-group',
        icon: <BarChartOutlined />,
        label: '效果分析',
        children: [
          {
            key: 'recommend-effect-report',
            icon: <LineChartOutlined />,
            label: '效果報表',
          },
          {
            key: 'recommend-revenue-report',
            icon: <FundOutlined />,
            label: '營收報表',
          },
          {
            key: 'recommend-user-profile',
            icon: <UserOutlined />,
            label: '用戶畫像',
          },
          {
            key: 'recommend-algorithm-monitor',
            icon: <DashboardOutlined />,
            label: '算法監控',
          },
        ],
      },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = location.pathname === '/' ? 'home'
    : location.pathname.startsWith('/search-verify-detail') ? 'search-verify'
    : (pathToKey[location.pathname] || 'home')

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const path = keyToPath[key]
    if (path) {
      navigate(path)
    }
  }

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={220}
      collapsedWidth={64}
      className="sidebar"
      theme="dark"
    >
      <div className="sidebar-logo">
        {collapsed ? (
          <span className="logo-icon">⚡</span>
        ) : (
          <span className="logo-text">
            <span className="logo-icon-inline">⚡</span>
            MFTB通用總後台
          </span>
        )}
      </div>
      <Menu
        mode="inline"
        theme="dark"
        items={menuItems}
        onClick={handleMenuClick}
        selectedKeys={[selectedKey]}
        defaultOpenKeys={[]}
        className="sidebar-menu"
      />
    </Sider>
  )
}
