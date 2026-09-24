import { useMemo, useState, useEffect } from 'react'
import { Layout, Menu, message } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandLogo from './BrandLogo'
import { useAuth } from '../contexts/AuthContext'
import { useMenu } from '../contexts/MenuContext'
import {
  useCurrentSystem,
  resolveSystemFromPathname,
  isBusinessSystemCode,
} from '../hooks/useCurrentSystem'
import { useSystemNavigation } from '../hooks/useSystemNavigation'
import type { MenuVO } from '../api/menu'
import { OFFLINE_MENUS } from '../constants/offlineMenus'
import { keyToPath, pathToKey } from '../constants/menuDataSource'
import type { OfflineMenuNode } from '../constants/offlineMenus'
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
  ControlOutlined,
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
  RobotOutlined,
  IdcardOutlined,
  SolutionOutlined,
  ScheduleOutlined,
  MenuOutlined,
  HistoryOutlined,
  ExperimentOutlined,
  NodeIndexOutlined,
  DeploymentUnitOutlined,
  TrophyOutlined,
  MedicineBoxOutlined,
  CloudServerOutlined,
  ToolOutlined,
  DesktopOutlined, // AI 模型相关
  KeyOutlined, // AI 使用申請
  BlockOutlined, // MCP 服務
  BankOutlined, // 权限管理相关
  DollarOutlined, // 额度策略
  UnlockOutlined, // 員工AI權額管理
  InboxOutlined, // 物资管理一级菜单
  AppstoreAddOutlined, // 资产入库
  UserAddOutlined, // 资产领用/归还
  RollbackOutlined, // 资产转移/归还
  DeleteOutlined, // 报废
  TagsOutlined, // 资产分类
  TagOutlined, // 资产标签
  ContactsOutlined, // 供应商管理
  BarcodeOutlined, // 產品庫
  EnvironmentOutlined, // 仓库维护
  ShoppingCartOutlined, // 采购申请
  FileDoneOutlined, // 采购订单
  ImportOutlined, // 验收入库
  BellOutlined, // 通知渠道配置
  GoldOutlined, // 耗材管理分组
  ProfileOutlined, // 耗材档案
  FundOutlined, // 消耗统计
  AlertOutlined, // 库存预警
  TranslationOutlined, // 多语言管理
} from '@ant-design/icons'

const { Sider } = Layout

type MenuItem = Required<MenuProps>['items'][number]

// [keyToPath 已迁移至 constants/menuDataSource.ts]
// [旧数据已删除，以下为占位注释]
const _OLD_KEY_TO_PATH_REMOVED = {
  _removed: true,
  /*
  'store-list': '/store-list',
  // 财务管理 - 推广金管理
  'account-balance': '/account-balance',
  'consume-risk': '/consume-risk',
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
  'system-authorization': '/system-authorization',
  // 商家推广工具 - 词库管理
  'promotion-word-library': '/promotion-word-library',
  // 商家推广工具 - 流量沙盤
  'waterfall-simulation': '/waterfall-simulation',
  'algorithm-simulation': '/algorithm-simulation',
  'merchant-score-insight': '/merchant-score-insight',
  'merchant-promotion-diagnose': '/merchant-promotion-diagnose',
  // 商家推广工具
  'promotion-dashboard': '/promotion-dashboard',
  'promotion-algorithm': '/promotion-algorithm',
  'promotion-slot-config': '/promotion-slot-config',
  'promotion-waterfall': '/promotion-waterfall',
  'promotion-sales-config': '/promotion-sales-config',
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
  // 團購管理
  'group-purchase-dashboard': '/group-purchase-dashboard',
  'flash-sale-register': '/flash-sale-register',
  'flash-sale-stats': '/flash-sale-stats',
  'flash-sale-price': '/flash-sale-price',
  // 推广通(父菜单,无需映射)
  // 'promotion-tool': '/promotion-tool',
  // 系统配置
  'menu-config': '/menu-config',
  'translation-manage': '/i18n-center/workbench',
  // 多语言管理（i18n-center 独立模块）
  'i18n-language': '/i18n-center/language',
  'i18n-import-export': '/i18n-center/import-export',
  'i18n-mt-engine': '/i18n-center/mt-engine',
  'i18n-dashboard': '/i18n-center/dashboard',
  'rule-config': '/rule-config',
  'notification-config': '/notification-config',
  'workflow-config': '/workflow-config',
    'version-history': '/version-history',
  // 智能中心(AI)
  'ai_model_hub': '/ai-model-hub',
  'ai_quota_auth': '/ai-quota-auth',
  'ai-operation-auth': '/ai-operation-auth',
  'ai-access-request': '/ai-access-apply',
  'ai-mcp-service': '/ai-mcp-service',
  'ai-conversation-audit': '/ai-conversation-audit',
  'ai_usage_stats': '/ai-usage-stats',
  'ai_energy_detail': '/ai-energy-detail',
  // 智能中心(AI) - 拆分后的新菜单 key
  'ai-model-provider': '/ai-model-provider',
  'ai-model-list': '/ai-model-list',
  'ai-auth': '/ai-auth',
  // AI 模型授权管理 / 配额管理（二级菜单）
  'ai-dept-model-auth': '/ai-dept-model-auth',
  'ai-emp-model-auth': '/ai-emp-model-auth',
  'ai-pos-auth': '/ai-pos-auth',
  'ai-dept-quota': '/ai-dept-quota',
  'ai-emp-quota': '/ai-emp-quota',
  // OA中心
  'oa-requests': '/oa-requests',
  'process-center': '/process-center',
  // 门店数据配置
  'store-data-config': '/store-data-config',
  // 地图規劃
  'map-planning': '/map-planning',
  // 赠送管理子页面
  'gift-add': '/gift-add',
  'gift-detail-view': '/gift-detail-view',
  // AI 子页面（编辑/详情）
  'ai-model-edit': '/ai-model-edit',
  'ai-model-detail': '/ai-model-detail',
  'ai-dept-auth-edit': '/ai-dept-auth-edit',
  'ai-dept-auth-detail': '/ai-dept-auth-detail',
  'ai-pos-auth-edit': '/ai-pos-auth-edit',
  'ai-pos-auth-detail': '/ai-pos-auth-detail',
  'ai-role-auth-edit': '/ai-role-auth-edit',
  'ai-role-auth-detail': '/ai-role-auth-detail',
  'ai-dept-quota-edit': '/ai-dept-quota-edit',
  'ai-dept-quota-detail': '/ai-dept-quota-detail',
  // 員工AI權額管理
  'ai-emp-permission': '/ai-emp-permission',
  'ai-emp-permission-detail': '/ai-emp-permission-detail',
  // 物資管理（EAM 完整 19 個子菜單）
  'asset-dashboard':     '/asset-dashboard',
  'asset-supplier':      '/asset-supplier',
  'asset-list':          '/asset-list',
  'asset-category':      '/asset-category',
  'asset-model':         '/asset-model',
  'asset-location':      '/asset-location',
  'param-library':       '/param-library',
  'asset-tag':           '/asset-tag',
  'asset-inbound':       '/asset-inbound',
  'asset-claim':         '/asset-claim',
  'asset-borrow':        '/asset-borrow',
  'asset-return':        '/asset-return',
  'asset-transfer-list': '/asset-transfer-list',
  'asset-handover':      '/asset-handover',
  'asset-repair':        '/asset-repair',
  'asset-loss':          '/asset-loss',
  'asset-compensation':  '/asset-compensation',
  'asset-scrap':         '/asset-scrap',
  'asset-flow':          '/asset-flow',
  'asset-inventory':     '/asset-inventory',
  // EAM 採購
  'purchase-order':      '/purchase-order',
  'purchase-request':    '/oa-purchase-request',
  // 耗材管理（消耗品/MRO）
  'consumable-dashboard': '/consumable-dashboard',
  'consumable-item':      '/consumable-item',
  'consumable-claim':     '/consumable-claim',
  'consumable-stock':     '/consumable-stock',
  'consumable-stock-txn': '/consumable-stock-txn',
  'consumable-alert':     '/consumable-alert',
  */
}

/** pathToKey 从 menuDataSource 导入（见上方 import），此处 re-export 保持外部消费者兼容 */
export { pathToKey } from '../constants/menuDataSource'
// eslint-disable-next-line @typescript-eslint/no-unused-vars

/**
 * 离线菜单（前端唯一保留的本地菜单定义, 见 src/constants/offlineMenus.ts）
 *
 * 菜单名称/层级/排序/图标的唯一真值源是后端 sys_menu, 因此这里不再维护整棵静态菜单树：
 * - 已对接真实后端的菜单：完全由后端菜单树提供, 后端不可用时不展示（避免本地副本与服务器不一致）；
 * - 仍依赖 mock 的菜单：保留在 OFFLINE_MENUS, 后端不可用时照常展示, 可用时仅补挂 DB 中缺失的项。
 */
const buildOfflineMenuItem = (node: OfflineMenuNode, excludeKeys?: Set<string>): MenuItem | null => {
  // 补挂时跳过 DB 已有的后代，否则同一 menuKey 会在不同层级重复出现（antd Menu duplicate key）
  if (excludeKeys?.has(node.key)) return null
  const children = (node.children ?? [])
    .map((child) => buildOfflineMenuItem(child, excludeKeys))
    .filter((child): child is MenuItem => child !== null)
  return {
    key: node.key,
    icon: keyToIcon[node.key],
    label: translateMenuName(node.key, node.label),
    ...(children.length > 0 ? { children } : {}),
  } as MenuItem
}

/** 收集后端菜单树全部 key（含停用项）：停用的菜单不得被本地副本"复活" */
const collectMenuTreeKeys = (menus: MenuVO[], acc = new Set<string>()): Set<string> => {
  for (const m of menus) {
    acc.add(m.menuKey)
    if (m.children?.length) collectMenuTreeKeys(m.children, acc)
  }
  return acc
}

/** 把离线菜单补挂进后端菜单树：DB 已有的 key 一律以 DB 为准, 仅追加 DB 中完全缺失的子项 */
const attachOfflineMenus = (items: MenuItem[], dbKeys: Set<string>): MenuItem[] =>
  items.map((item) => {
    const key = String((item as { key?: string }).key ?? '')
    const withChildren = item as MenuItem & { children?: MenuItem[] }
    const offlineNode = OFFLINE_MENUS.find((n) => n.key === key)
    if (!offlineNode?.children?.length) return withChildren
    const children = withChildren.children
      ? attachOfflineMenus(withChildren.children, dbKeys)
      : []
    const existing = new Set(children.map((c) => String((c as { key?: string }).key ?? '')))
    const missing = offlineNode.children
      .filter((c) => !existing.has(c.key) && !dbKeys.has(c.key))
      .map((c) => buildOfflineMenuItem(c, dbKeys))
      .filter((c): c is MenuItem => c !== null)
    return { ...withChildren, children: [...children, ...missing] } as MenuItem
  })

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
  // 商家推廣工具 - 流量沙盤
  'traffic-sandbox': <ExperimentOutlined />,
  'waterfall-simulation': <NodeIndexOutlined />,
  'algorithm-simulation': <DeploymentUnitOutlined />,
  'merchant-score-insight': <TrophyOutlined />,
  'merchant-promotion-diagnose': <MedicineBoxOutlined />,
  // 推廣通顶级菜单（后端 menu_key 为下划线命名 promotion_tool）
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
  'consume-risk': <SafetyCertificateOutlined />,
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
  // OA中心
  'oa-center': <SolutionOutlined />,
  'oa-requests': <FileTextOutlined />,
  'process-center': <AppstoreOutlined />,
  // 團購管理
  'group-purchase': <ShoppingFilled />,
  'group-purchase-dashboard': <DashboardOutlined />,
  'flash-sale-register': <FileTextOutlined />,
  'flash-sale-stats': <BarChartOutlined />,
  'flash-sale-price': <MoneyCollectOutlined />,
  'permission': <LockOutlined />,
  'role-management': <SolutionOutlined />,
  'function-permission': <AppstoreOutlined />,
  'data-permission': <DatabaseOutlined />,
  'system-authorization': <SafetyCertificateOutlined />,
  'system-config': <SettingOutlined />,
  'menu-config': <MenuOutlined />,
  'translation-manage': <TranslationOutlined />,
  'i18n-center': <TranslationOutlined />,
  'i18n-language': <GlobalOutlined />,
  'i18n-import-export': <ImportOutlined />,
  'i18n-mt-engine': <ToolOutlined />,
  'i18n-dashboard': <DashboardOutlined />,
  'rule-config': <SwapOutlined />,
  'workflow-config': <ApartmentOutlined />,
  'version-history': <HistoryOutlined />,
  'notification-config': <BellOutlined />,
  // 智能中心 (AI)
  'ai-assistant': <RobotOutlined />,
  'ai_model_hub': <CloudServerOutlined />,
  'ai_quota_auth': <SafetyCertificateOutlined />,
  'ai-operation-auth': <ToolOutlined />,   // AI 权控管理
  'ai-access-request': <KeyOutlined />,    // AI 使用申請
  'ai-mcp-service': <BlockOutlined />,     // MCP 服務
  'ai-conversation-audit': <AuditOutlined />, // 对话审计
  'ai-usage-stats': <LineChartOutlined />,
  'ai_usage_stats': <LineChartOutlined />,
  'ai-energy-detail': <FileSearchOutlined />,
  'ai_energy_detail': <FileSearchOutlined />,
  'ai-energy-billing': <ThunderboltOutlined />,
  'ai-models': <DesktopOutlined />,        // AI 模型管理 - 电脑显示器
  'models': <DesktopOutlined />,
  'ai-auth-quota': <SafetyCertificateOutlined />, // 授权与配额 - 安全证书
  'ai-model-provider': <CloudServerOutlined />,  // 供应商管理 - 云服务器
  'model-provider': <CloudServerOutlined />,
  'ai-model-list': <AppstoreOutlined />,   // 模型接入 - 应用商店
  'model-list': <AppstoreOutlined />,
  'ai-auth': <BankOutlined />,             // 权限管理 - 银行/金融机构
  'ai-quota': <DollarOutlined />,          // 额度策略 - 金额符号（与授权与配额去重）
  // AI 模型授权管理 / 配额管理（分组 + 子菜单图标）
  'ai-dept-model-auth': <ApartmentOutlined />,    // 按部门配置模型 - 组织架构
  'ai-emp-model-auth': <TeamOutlined />,          // 按员工/角色配置模型 - 团队
  'ai-pos-auth': <IdcardOutlined />,             // 按职位授权 - 职位徽章
  'ai-role-auth': <UserOutlined />,              // 角色授权 - 用户
  'ai-auth-manage': <SafetyCertificateOutlined />, // 模型授权管理 - 安全认证
  'ai-quota-manage': <DollarOutlined />,       // 配额管理 - 金额符号
  'ai-dept-quota': <AccountBookOutlined />,    // 部门额度 - 账本
  'ai-emp-quota': <MoneyCollectOutlined />,    // 员工额度 - 收款
  'ai-emp-permission': <UnlockOutlined />,     // 員工AI權額管理 - 解鎖/權限管理
  // 物資管理
  'asset-management': <InboxOutlined />,
  'asset-supplier':   <ContactsOutlined />, // 供應商管理
  'asset-basic':      <ControlOutlined />, // 控制面板，与系統配置的齿轮区分
  'eam-master-data':  <DatabaseOutlined />, // 基礎配置（替代 asset-basic）
  'eam-procurement':  <ShoppingCartOutlined />, // 採購與供應
  'asset-category':   <TagsOutlined />,      // 分類庫
  'asset-model':      <BarcodeOutlined />,   // 品牌產品庫
  'asset-location':   <EnvironmentOutlined />, // 倉庫管理
  'asset-dashboard':  <DashboardOutlined />,
  'asset-inbound':    <ImportOutlined />,
  'asset-handover':   <TeamOutlined />,
  'asset-compensation': <DollarOutlined />,
  'asset-flow-ops':   <SwapOutlined />,
  'asset-maintenance': <ToolOutlined />,
  'asset-purchase':   <ShoppingCartOutlined />,
  'consumable-ops':   <GoldOutlined />,
  'consumable-dashboard': <DashboardOutlined />,
  'consumable-item':  <ProfileOutlined />,
  'consumable-inbound': <ImportOutlined />,
  'consumable-report': <FundOutlined />,
  'consumable-claim': <UserAddOutlined />,
  'consumable-stock': <DatabaseOutlined />,
  'consumable-stock-txn': <SwapOutlined />,
  'consumable-alert': <AlertOutlined />,
  'asset-list':       <AppstoreOutlined />,
  'asset-add':        <AppstoreAddOutlined />,
  'asset-claim':      <UserAddOutlined />,
  'asset-transfer':   <SwapOutlined />,
  'asset-return':     <RollbackOutlined />,
  'asset-scrap':      <DeleteOutlined />,
  'asset-repair':     <ToolOutlined />,
  'asset-loss':       <SearchOutlined />,
  'asset-inventory':  <AuditOutlined />,
  'param-library':    <DatabaseOutlined />,
  'asset-tag':        <TagOutlined />,
  // 採購
  'purchase-order':   <FileDoneOutlined />,
  'purchase-request': <ShoppingCartOutlined />,
}

/** 判定一个顶级 Sidebar item 是否属于指定系统：
 *  - menuTree 中同级 menuKey 对应节点的 systemCode 匹配即命中；
 *  - 未匹配→菜单树不中属于当前系统，隐藏；
 *  - 当前系统为 null 时本函数不被调用（外层已判断）。*/
function belongsToSystem(item: MenuItem | null, menuTree: MenuVO[], systemCode: string): boolean {
  if (!item) return false
  const key = String(item.key)
  const hit = (nodes: MenuVO[]): boolean => {
    for (const n of nodes) {
      if (n.menuKey === key) return n.systemCode === systemCode
      if (n.children?.length && hit(n.children)) return true
    }
    return false
  }
  // 未命中当前系统就隐藏，不能仅因菜单存在而放行其他系统的节点。
  return hit(menuTree)
}

/** 需要隱藏的菜單項（不在側邊欄顯示，但路由和權限保留） */
const HIDDEN_MENU_KEYS = new Set([
  'ai-access-request', // AI 使用申請：功能入口已整合至智能中心其他菜單
])

/** 后端菜单树 → 侧边栏 Menu items（过滤停用项，名称/层级/排序实时同步；图标优先取后端 icon 字段，否则按 key 匹配） */
const buildMenuItemsFromVO = (menus: MenuVO[]): MenuItem[] => {
  return menus
    .filter((m) => m.status === 1 && !HIDDEN_MENU_KEYS.has(m.menuKey))
    .map((m) => {
      const children = m.children?.length ? buildMenuItemsFromVO(m.children) : undefined
      return {
        key: m.menuKey,
        icon: renderMenuIcon(m.icon) ?? keyToIcon[m.menuKey],
        label: translateMenuName(m.menuKey, m.name, m.nameEn),
        ...(children && children.length > 0 ? { children } : {}),
      } as MenuItem
    })
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

/** 遞歸查找目標 key 的所有祖先 key（從根到父，不含自身） */
const findAncestorKeys = (items: MenuItem[], targetKey: string, path: string[] = []): string[] => {
  for (const item of items) {
    if (!item) continue
    if (item.key === targetKey) return path
    const children = (item as MenuItem & { children?: MenuItem[] }).children
    if (children?.length) {
      const found = findAncestorKeys(children, targetKey, [...path, String(item.key)])
      if (found.length > 0) return found
    }
  }
  return []
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n: i18nInstance } = useTranslation()
  const { hasMenuPermission } = useAuth()
  const { menuTree, status: menuStatus } = useMenu()
  const { currentSystemCode, setCurrentSystemCode } = useCurrentSystem()
  // Round 6：锁到业务系统时优先拉服务端剪枝导航（与后端 strict-mode 同源）；
  // 未锁 / 接口失败 → 降级到旧的全量 menuTree 客户端过滤，不阻断入口。
  const systemNavigation = useSystemNavigation(currentSystemCode)
  const [openKeys, setOpenKeys] = useState<string[]>([])

  /** 自动同步 currentSystemCode：
   *  - 菜单树就绪后，若当前 pathname 属于某业务系统→写入；
   *  - 当前处于门户/工作台等无系统上下文页面→保持旧值，不主动清空，避免刷新时 Sidebar 无菜单可展。 */
  useEffect(() => {
    if (!menuTree) return
    const sys = resolveSystemFromPathname(location.pathname, menuTree)
    if (isBusinessSystemCode(sys) && sys !== currentSystemCode) {
      setCurrentSystemCode(sys)
    }
  }, [menuTree, location.pathname, currentSystemCode, setCurrentSystemCode])

  /** 按当前登录人权限过滤后的可见菜单：
   *  1) currentSystemCode 已锁 + 服务端导航非空 → 直接用服务端剪枝树（已仅包含当前用户可访问菜单），
   *     保留 filterMenusByPermission 作为本地 revision 无变更时的双重无洞防护；
   *  2) 否则回退旧行为：后端菜单树可用 → 以 DB 为唯一真值 + 补挂离线菜单 + 客户端过滤；
   *     后端不可用 → 只展离线清单；语言变化时重算菜单名称 */
  const visibleMenuItems = useMemo(() => {
    if (currentSystemCode && systemNavigation.loaded) {
      const serverItems = buildMenuItemsFromVO(systemNavigation.tree)
      return filterMenusByPermission(serverItems, hasMenuPermission)
    }
    const items = menuTree
      ? attachOfflineMenus(buildMenuItemsFromVO(menuTree), collectMenuTreeKeys(menuTree))
      : OFFLINE_MENUS
        .map((node) => buildOfflineMenuItem(node))
        .filter((item): item is MenuItem => item !== null)
    const scoped = currentSystemCode && menuTree
      ? items.filter((item): item is MenuItem => !!item && belongsToSystem(item, menuTree, currentSystemCode))
      : items
    return filterMenusByPermission(scoped, hasMenuPermission)
  }, [menuTree, hasMenuPermission, i18nInstance.language, currentSystemCode, systemNavigation.tree, systemNavigation.loaded])

  const selectedKey = location.pathname === '/' ? 'home'
    : location.pathname.startsWith('/search-verify-detail') ? 'search-verify'
    // 充值頁面：高亮「賬戶餘額」
    : location.pathname === '/recharge-add' ? 'account-balance'
    // 審批流程編輯頁：高亮「審批流程」
    : location.pathname.startsWith('/workflow-config/') ? 'workflow-config'
    : location.pathname.startsWith('/version-history-detail') ? 'version-history'
    // 訂單列表 / 訂單詳情：按來源高亮（from=ad-sales 歸屬「廣告銷售」，否則歸屬「店鋪推廣」）
    : (location.pathname === '/promotion-order-manage' || location.pathname === '/order-detail')
      ? (new URLSearchParams(location.search).get('from') === 'ad-sales' ? 'ad-sales' : 'promotion-sales-config')
    : (pathToKey[location.pathname] || 'home')

  /** 路由變化時自動展開對應的父級菜單（刷新/直接跳轉均生效） */
  useEffect(() => {
    const ancestors = findAncestorKeys(visibleMenuItems, selectedKey)
    if (ancestors.length > 0) {
      setOpenKeys((prev) => {
        const merged = new Set([...prev, ...ancestors])
        return [...merged]
      })
    }
  }, [selectedKey, visibleMenuItems])

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const path = keyToPath[key]
    if (path) {
      navigate(path)
    } else {
      message.info(t('sidebar.underDevelopment'))
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
      {menuStatus !== 'loading' && menuTree === null && (
        <div className="sidebar-offline-tip" title={t('sidebar.offlineMenuTip')}>
          {collapsed ? '!' : t('sidebar.offlineMenuTip')}
        </div>
      )}
      <Menu
        mode="inline"
        theme="dark"
        items={visibleMenuItems}
        onClick={handleMenuClick}
        selectedKeys={[selectedKey]}
        openKeys={collapsed ? undefined : openKeys}
        onOpenChange={setOpenKeys}
        inlineCollapsed={collapsed}
        className="sidebar-menu"
      />
    </Sider>
  )
}
