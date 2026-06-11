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
  'debt-detail': '/debt-detail',
  // 财务管理 - 审批管理
  'approval-center': '/approval-center',
  'approval-detail': '/approval-detail',
  // 搜索管理 - 搜索配置
  'search-config': '/search-config',
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
  // 搜索管理 - 报表统计
  'hint-report': '/hint-report',
  'hot-search-report': '/hot-search-report',
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
    key: 'search',
    icon: <DatabaseOutlined />,
    label: '搜索管理',
    children: [
      {
        key: 'search-config',
        icon: <SettingOutlined />,
        label: '搜索配置',
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
            label: '權重管理',
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
]

interface SidebarProps {
  collapsed: boolean
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = location.pathname === '/' ? 'home' : (pathToKey[location.pathname] || 'home')

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
        defaultOpenKeys={['finance', 'promotion', 'search', 'search-guide']}
        className="sidebar-menu"
      />
    </Sider>
  )
}
