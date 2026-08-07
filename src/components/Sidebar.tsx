import { useMemo, useState, useEffect } from 'react'
import { Layout, Menu, message, Modal, Input } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandLogo from './BrandLogo'
import { useAuth } from '../contexts/AuthContext'
import { fetchMenuTree } from '../api/menu'
import type { MenuVO } from '../api/menu'
import { translateMenuName } from '../i18n/menuNameEn'
import { renderMenuIcon } from './MenuIcon'
import type { ReactNode } from 'react'
import {
  AccountBookOutlined,
  WalletOutlined,
  SearchOutlined,
  FileSearchOutlined,
  SwapOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  ScissorOutlined,
  FontSizeOutlined,
  FireOutlined,
  BarChartOutlined,
  LineChartOutlined,
  AimOutlined,
  ReadOutlined,
  HomeOutlined,
  ColumnHeightOutlined,
  SettingOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  StopOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
  PieChartOutlined,
  GiftOutlined,
  DashboardOutlined,
  TeamOutlined,
  ShopOutlined,
  MoneyCollectOutlined,
  CrownOutlined,
  LockOutlined,
  FileTextOutlined,
  ShoppingFilled,
  RedEnvelopeOutlined,
  UserOutlined,
  ApartmentOutlined,
  IdcardOutlined,
  SolutionOutlined,
  ScheduleOutlined,
  MenuOutlined,
} from '@ant-design/icons'

const { Sider } = Layout

type MenuItem = Required<MenuProps>['items'][number]

/** 菜单 key → 路由路径 映射 */
const keyToPath: Record<string, string> = {
  // 首頁
  'home': '/',
  // 商戶集團管理
  'merchant-group-list': '/merchant-group-list',
  'store-list': '/store-list',
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

  // 集團人事
  'employee-management': '/employee-management',
  'organization-management': '/organization-management',
  'position-management': '/position-management',
  'login-log': '/login-log',
  // 權限管理
  'role-management': '/role-management',
  'function-permission': '/function-permission',
  'data-permission': '/data-permission',
  // 商家推广工具 - 词库管理
  'promotion-word-library': '/promotion-word-library',
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
  // 商家推广工具 - 訂單管理（独立key，复用同一页面）
  'merchant-order-manage': '/merchant-order-manage',
  // 广告销售（商家推广工具下，复用店铺推广页面）
  'ad-sales': '/ad-sales',
  // 推广赠送（一级菜单「赠送管理」下）
  'gift-detail': '/gift-detail',
  // 消费明细（一级菜单「赠送管理」下）
  'gift-consume-detail': '/gift-consume-detail',
  // 推广通 - 報表分析
  'promotion-report-overview': '/promotion-report-overview',
  'promotion-report-order': '/promotion-report-order',
  'promotion-report-compare': '/promotion-report-compare',
  // 推广通(父菜单,无需映射)
  // 'promotion-tool': '/promotion-tool',
  // 系统配置
  'menu-config': '/menu-config',
'translation-manage': '/translation-manage',
}

/** 暂无对应页面的菜单 key 集合，点击时弹出密码验证弹窗 */
const noPageKeys = new Set([
  // 用戶管理
  'user-feedback', 'user-list', 'user-avatar', 'user-frozen', 'device-frozen',
  'user-location-special', 'user-location-blacklist', 'whitelist',
  // 運營投放管理
  'delivery-list',
  // 商戶集團管理
  'merchant-onboarding', 'merchant-feedback', 'group-list', 'group-permission',
  'store-basic-info', 'contract-management', 'group-brand-library',
  // 到家業務(外賣)
  'product-tags', 'product-params', 'store-management', 'store-categories',
  'product-platform-categories',
  // 到店業務(團購)
  'group-buy-store', 'group-buy-product',
])

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
    key: 'merchant_group',
    icon: <ShopOutlined />,
    label: '商戶集團管理',
    children: [
      {
        key: 'merchant-group-list',
        icon: <ShopOutlined />,
        label: '集團管理',
      },
      {
        key: 'store-list',
        icon: <ShopOutlined />,
        label: '門店管理',
      },
    ],
  },
  {
    key: 'merchant_promotion',
    icon: <CrownOutlined />,
    label: '商家推广工具',
    children: [
      {
        key: 'promotion-dashboard',
        icon: <PieChartOutlined />,
        label: '數據看板',
      },
      {
        key: 'promotion-algorithm',
        icon: <AppstoreOutlined />,
        label: '算法库',
      },
      {
        key: 'promotion-slot-config',
        icon: <ColumnHeightOutlined />,
        label: '瀑布流策略',
      },
      {
        key: 'promotion-waterfall',
        icon: <WalletOutlined />,
        label: '銷售定價',
      },
      {
        key: 'gift-manage',
        icon: <GiftOutlined />,
        label: '贈送管理',
        children: [
          {
            key: 'gift-detail',
            icon: <RedEnvelopeOutlined />,
            label: '推廣贈送',
          },
          {
            key: 'gift-consume-detail',
            icon: <FileTextOutlined />,
            label: '消費明細',
          },
        ],
      },
      {
        key: 'ad-sales',
        icon: <ShoppingFilled />,
        label: '廣告銷售',
      },
      {
        key: 'promotion-word-library',
        icon: <ReadOutlined />,
        label: '詞庫管理',
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
        icon: <ShoppingFilled />,
        label: '店鋪推廣',
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
    icon: <SearchOutlined />,
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
    icon: <MoneyCollectOutlined />,
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
        icon: <AuditOutlined />,
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
    key: 'hr',
    icon: <TeamOutlined />,
    label: '集團人事',
    children: [
      {
        key: 'employee-management',
        icon: <UserOutlined />,
        label: '員工管理',
      },
      {
        key: 'organization-management',
        icon: <ApartmentOutlined />,
        label: '組織管理',
      },
      {
        key: 'position-management',
        icon: <IdcardOutlined />,
        label: '職位管理',
      },
      {
        key: 'login-log',
        icon: <ScheduleOutlined />,
        label: '員工動態',
      },
    ],
  },
  {
    key: 'permission',
    icon: <LockOutlined />,
    label: '權限管理',
    children: [
      {
        key: 'role-management',
        icon: <SolutionOutlined />,
        label: '角色管理',
      },
      {
        key: 'function-permission',
        icon: <AppstoreOutlined />,
        label: '功能授權',
      },
      {
        key: 'data-permission',
        icon: <DatabaseOutlined />,
        label: '數據授權',
      },
    ],
  },
  {
    key: 'system-config',
    icon: <SettingOutlined />,
    label: '系統配置',
    children: [
      {
        key: 'menu-config',
        icon: <MenuOutlined />,
        label: '菜單配置',
      },
      {
        key: 'translation-manage',
        icon: <GlobalOutlined />,
        label: '多語言配置',
      },
    ],
  },

]

interface SidebarProps {
  collapsed: boolean
}

/** 菜单 key → 图标组件 映射（后端 icon 字段为空时按 key 匹配保持现有图标样式） */
const keyToIcon: Record<string, ReactNode> = {
  'home': <HomeOutlined />,
  'merchant_group': <ShopOutlined />,
  'merchant-group-list': <ShopOutlined />,
  'store-list': <ShopOutlined />,
  'merchant_promotion': <CrownOutlined />,
  'promotion-dashboard': <PieChartOutlined />,
  'promotion-algorithm': <AppstoreOutlined />,
  'promotion-slot-config': <ColumnHeightOutlined />,
  'promotion-waterfall': <WalletOutlined />,
  'gift-manage': <GiftOutlined />,
  'gift-detail': <RedEnvelopeOutlined />,
  'gift-consume-detail': <FileTextOutlined />,
  'ad-sales': <ShoppingFilled />,
  'promotion-word-library': <ReadOutlined />,
  'promotion-tool': <ThunderboltOutlined />,
  // 兼容后端种子数据中的下划线命名（推廣通顶级菜单）
  'promotion_tool': <ThunderboltOutlined />,
  'promotion-sales-config': <ShoppingFilled />,
  'promotion-report-group': <BarChartOutlined />,
  'promotion-report-overview': <DashboardOutlined />,
  'promotion-report-order': <LineChartOutlined />,
  'promotion-report-compare': <PieChartOutlined />,
  'search': <SearchOutlined />,
  'search-config-new': <SettingOutlined />,
  'global-config': <GlobalOutlined />,
  'channel-strategy': <ThunderboltOutlined />,
  'search-guide': <AimOutlined />,
  'hint-config': <FontSizeOutlined />,
  'hot-search-config': <FireOutlined />,
  'search-weight-config': <ColumnHeightOutlined />,
  'search-library': <ReadOutlined />,
  'word-segmentation': <ScissorOutlined />,
  'synonym-config': <SwapOutlined />,
  'hot-search-library': <FireOutlined />,
  'stop-words': <StopOutlined />,
  'search-verify-group': <SafetyCertificateOutlined />,
  'search-verify': <SearchOutlined />,
  'hint-verify': <FontSizeOutlined />,
  'hot-search-verify': <FireOutlined />,
  'report': <BarChartOutlined />,
  'hint-report': <LineChartOutlined />,
  'hot-search-report': <LineChartOutlined />,
  'finance': <MoneyCollectOutlined />,
  'promotion': <WalletOutlined />,
  'account-balance': <AccountBookOutlined />,
  'batch-query': <SearchOutlined />,
  'detail-query': <FileSearchOutlined />,
  'merchant-reconcile': <AuditOutlined />,
  'writeoff-reconcile': <AuditOutlined />,
  'debt-reconcile': <CheckCircleOutlined />,
  'approval': <CheckCircleOutlined />,
  'approval-center': <AuditOutlined />,
  'hr': <TeamOutlined />,
  'employee-management': <UserOutlined />,
  'organization-management': <ApartmentOutlined />,
  'position-management': <IdcardOutlined />,
  'login-log': <ScheduleOutlined />,
  'permission': <LockOutlined />,
  'role-management': <SolutionOutlined />,
  'function-permission': <AppstoreOutlined />,
  'data-permission': <DatabaseOutlined />,
  'system-config': <SettingOutlined />,
  'menu-config': <MenuOutlined />,
'translation-manage': <GlobalOutlined />,
}

/** 后端菜单树 → 侧边栏 Menu items（过滤停用项，名称/层级/排序实时同步；图标优先取后端 icon 字段，否则按 key 匹配） */
const buildMenuItemsFromVO = (menus: MenuVO[]): MenuItem[] => {
  return menus
    .filter((m) => m.status === 1)
    .map((m) => {
      const children = m.children?.length ? buildMenuItemsFromVO(m.children) : undefined
      return {
        key: m.menuKey,
        icon: renderMenuIcon(m.icon) ?? keyToIcon[m.menuKey],
        label: m.name,
        ...(children && children.length > 0 ? { children } : {}),
      } as MenuItem
    })
}

/** 遞歸翻譯菜單 label：英文模式按 menuKey 查映射表，未覆蓋回退中文 */
const translateMenuItems = (items: MenuItem[]): MenuItem[] => {
  return items
    .map((item) => {
      if (!item) return null
      const withChildren = item as MenuItem & { children?: MenuItem[] }
      // divider / 分組等無 label 項直接透傳
      if (!('label' in item)) return item
      return {
        ...item,
        label: translateMenuName(String(item.key), String(item.label)),
        ...(withChildren.children && withChildren.children.length > 0
          ? { children: translateMenuItems(withChildren.children) }
          : {}),
      } as MenuItem
    })
    .filter((item): item is MenuItem => item !== null)
}

/** 按菜單權限遞歸過濾菜單：受控叶子菜單無授權則隱藏；父菜單子項全部隱藏時一併隱藏 */
const filterMenusByPermission = (
  items: MenuItem[],
  hasMenuPermission: (menuKey: string) => boolean,
): MenuItem[] => {
  return items
    .map((item) => {
      if (!item) return null
      const withChildren = item as MenuItem & { children?: MenuItem[] }
      if (withChildren.children && withChildren.children.length > 0) {
        const children = filterMenusByPermission(withChildren.children, hasMenuPermission)
        if (children.length === 0) return null
        return { ...withChildren, children }
      }
      return hasMenuPermission(String(item.key)) ? item : null
    })
    .filter((item): item is MenuItem => item !== null)
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n: i18nInstance } = useTranslation()
  const { hasMenuPermission } = useAuth()
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdValue, setPwdValue] = useState('')
  const [_pendingKey, setPendingKey] = useState<string>('')
  const [menuTree, setMenuTree] = useState<MenuVO[] | null>(null)

  /** 加载后端菜单树（名称/层级/排序与数据库实时同步）；加载失败时降级使用内置菜单 */
  useEffect(() => {
    let cancelled = false
    fetchMenuTree().then((tree) => {
      if (!cancelled) {
        setMenuTree(tree.length > 0 ? tree : null)
      }
    })
    return () => { cancelled = true }
  }, [])

  /** 按當前登錄人權限過濾後的可見菜單（优先后端菜单树，降级内置菜单），語言變化時重算菜單名稱 */
  const visibleMenuItems = useMemo(() => {
    const items = menuTree ? buildMenuItemsFromVO(menuTree) : menuItems
    return filterMenusByPermission(translateMenuItems(items), hasMenuPermission)
  }, [menuTree, hasMenuPermission, i18nInstance.language])

  const selectedKey = location.pathname === '/' ? 'home'
    : location.pathname.startsWith('/search-verify-detail') ? 'search-verify'
    // 充值頁面：高亮「賬戶餘額」
    : location.pathname === '/recharge-add' ? 'account-balance'
    // 訂單列表 / 訂單詳情：按來源高亮（from=ad-sales 歸屬「廣告銷售」，否則歸屬「店鋪推廣」）
    : (location.pathname === '/promotion-order-manage' || location.pathname === '/order-detail')
      ? (new URLSearchParams(location.search).get('from') === 'ad-sales' ? 'ad-sales' : 'promotion-sales-config')
    : (pathToKey[location.pathname] || 'home')

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (noPageKeys.has(key)) {
      setPendingKey(key)
      setPwdValue('')
      setPwdModalOpen(true)
      return
    }
    const path = keyToPath[key]
    if (path) {
      navigate(path)
    } else {
      message.info(t('sidebar.underDevelopment'))
    }
  }

  const handlePwdOk = () => {
    if (pwdValue === '9510') {
      message.success(t('sidebar.pwdSuccess'))
      setPwdModalOpen(false)
      setPwdValue('')
      // 验证通过后可在此处添加跳转逻辑
    } else {
      message.error(t('sidebar.pwdError'))
    }
  }

  const handlePwdCancel = () => {
    setPwdModalOpen(false)
    setPwdValue('')
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
          <BrandLogo size={32} />
        ) : (
          <span className="logo-text">
            <span className="logo-text-row">
              <BrandLogo size={28} />
              <span className="logo-text-main">{t('app.logoMain')}</span>
            </span>
            <span className="logo-text-sub">MFTB Search · Ads · Recommendation</span>
          </span>
        )}
      </div>
      <Menu
        mode="inline"
        theme="dark"
        items={visibleMenuItems}
        onClick={handleMenuClick}
        selectedKeys={[selectedKey]}
        defaultOpenKeys={[]}
        className="sidebar-menu"
      />
      <Modal
        title={t('sidebar.secureTitle')}
        open={pwdModalOpen}
        onOk={handlePwdOk}
        onCancel={handlePwdCancel}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        afterOpenChange={(open) => {
          if (open) {
            const input = document.querySelector<HTMLInputElement>('.ant-modal input[type="password"]')
            input?.focus()
          }
        }}
      >
        <Input.Password
          placeholder={t('sidebar.securePlaceholder')}
          value={pwdValue}
          onChange={(e) => setPwdValue(e.target.value)}
          onPressEnter={handlePwdOk}
        />
      </Modal>
    </Sider>
  )
}
