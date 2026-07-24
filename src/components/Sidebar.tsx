import { useState } from 'react'
import { Layout, Menu, message, Modal, Input } from 'antd'
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
  AppstoreOutlined,
  OrderedListOutlined,
  PieChartOutlined,
  BlockOutlined,
  GiftOutlined,
  TagOutlined,
  DashboardOutlined,
  TeamOutlined,
  ShopOutlined,
  ToolOutlined,
  MoneyCollectOutlined,
  SoundOutlined,
  CrownOutlined,
  CarOutlined,
  BulbOutlined,
  LockOutlined,
  FileTextOutlined,
  StarOutlined,
  ProfileOutlined,
  BranchesOutlined,
  ShoppingFilled,
  RedEnvelopeOutlined,
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
    key: 'permission',
    icon: <LockOutlined />,
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

]

interface SidebarProps {
  collapsed: boolean
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdValue, setPwdValue] = useState('')
  const [pendingKey, setPendingKey] = useState<string>('')

  const selectedKey = location.pathname === '/' ? 'home'
    : location.pathname.startsWith('/search-verify-detail') ? 'search-verify'
    // 訂單列表 / 訂單詳情 歸屬「廣告銷售」菜單高亮
    : (location.pathname === '/promotion-order-manage' || location.pathname === '/order-detail')
      ? 'ad-sales'
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
      message.info('該功能模塊開發中，敬請期待')
    }
  }

  const handlePwdOk = () => {
    if (pwdValue === '9510') {
      message.success('密碼驗證成功')
      setPwdModalOpen(false)
      setPwdValue('')
      // 验证通过后可在此处添加跳转逻辑
    } else {
      message.error('密碼錯誤，請重新輸入')
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
      <Modal
        title="機密頁面，請輸入密碼訪問"
        open={pwdModalOpen}
        onOk={handlePwdOk}
        onCancel={handlePwdCancel}
        okText="確定"
        cancelText="取消"
        afterOpenChange={(open) => {
          if (open) {
            const input = document.querySelector<HTMLInputElement>('.ant-modal input[type="password"]')
            input?.focus()
          }
        }}
      >
        <Input.Password
          placeholder="請輸入密碼訪問"
          value={pwdValue}
          onChange={(e) => setPwdValue(e.target.value)}
          onPressEnter={handlePwdOk}
        />
      </Modal>
    </Sider>
  )
}
