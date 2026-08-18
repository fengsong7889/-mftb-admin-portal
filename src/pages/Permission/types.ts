/** 权限管理模块类型定义 */

/** 功能权限模块 */
export interface PermissionModule {
  key: string
  name: string
  children?: PermissionModule[]
}

/** 功能操作枚举 */
export const PERMISSION_ACTIONS = [
  { key: 'view', label: '查看' },
  { key: 'create', label: '新增' },
  { key: 'edit', label: '編輯' },
  { key: 'delete', label: '刪除' },
  { key: 'import', label: '導入' },
  { key: 'export', label: '導出' },
  { key: 'enable', label: '啟用' },
  { key: 'disable', label: '停用' },
] as const

/** 菜单功能映射（每个菜单实际包含的功能操作） */
export const MENU_ACTIONS_MAP: Record<string, Array<{ key: string; label: string }>> = {
  // 首页
  'home': [
    { key: 'view', label: '查看' },
  ],
  // 商戶集團管理
  'merchant-group-list': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 門店管理
  'store-list': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'export', label: '導出' },
  ],
  // 商家推廣工具 - 數據看板
  'promotion-dashboard': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 算法庫
  'promotion-algorithm': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 瀑布流策略
  'promotion-slot-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 銷售定價
  'promotion-waterfall': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
  ],
  // 廣告銷售
  'ad-sales': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'export', label: '導出' },
  ],
  // 詞庫管理（商家推廣工具）
  'promotion-word-library': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
  ],
  // 店鋪推廣（推廣通）
  'promotion-sales-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'export', label: '導出' },
  ],
  // 推廣通 - 數據概覽
  'promotion-report-overview': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 推廣通 - 訂單效果報表
  'promotion-report-order': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 推廣通 - 推薦類型對比
  'promotion-report-compare': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 全局配置
  'global-config': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 维度策略
  'channel-strategy': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 底纹配置
  'hint-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 热搜配置
  'hot-search-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 权重干预
  'search-weight-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 分词词库
  'word-segmentation': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
  ],
  // 同义词库
  'synonym-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
  ],
  // 热搜词库
  'hot-search-library': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
  ],
  // 停用词库
  'stop-words': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'import', label: '導入' },
    { key: 'export', label: '導出' },
  ],
  // 搜索校验
  'search-verify': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 底纹校验
  'hint-verify': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 热搜校验
  'hot-search-verify': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 底纹报表
  'hint-report': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 热搜报表
  'hot-search-report': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 账户余额
  'account-balance': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
    { key: 'export', label: '導出' },
  ],
  // 批次查询
  'batch-query': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 明细查询
  'detail-query': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 债务明细
  'debt-detail': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 欠款对账
  'debt-reconcile': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
    { key: 'import', label: '還款導入' },
  ],
  // 核销对账
  'writeoff-reconcile': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 审批中心
  'approval-center': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 推广赠送（商家推广工具-赠送管理）
  'gift-detail': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'export', label: '導出' },
  ],
  // 消费明细（商家推广工具-赠送管理）
  'gift-consume-detail': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 权限管理
  'permission': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 集团人事
  'hr': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 登录日志
  'login-log': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
    { key: 'forceLogout', label: '下線' },
  ],
  // 员工管理
  'employee-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 组织管理
  'organization-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 职位管理
  'position-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 角色管理
  'role-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 功能权限
  'function-permission': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 数据权限
  'data-permission': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 菜单管理
  'menu-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 菜單配置
  'menu-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 多語言配置
  'translation-manage': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 規則配置
  'rule-config': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 流程配置
  'workflow-config': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 系统模板
  'system-template': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 布局设置
  'layout-settings': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 基础设置
  'basic-settings': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 用户意见反馈
  'user-feedback': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 用户列表
  'user-list': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 用户头像管理
  'user-avatar': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 用户冻结列表
  'user-frozen': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 设备号冻结列表
  'device-frozen': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 用户收货地图特殊收录
  'user-location-special': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 用户收货地图黑名单
  'user-location-blacklist': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 白名单
  'whitelist': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 运营平台工具
  'operation-platform': [
    { key: 'view', label: '查看' },
  ],
  // 投放列表
  'delivery-list': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 商家入驻
  'merchant-onboarding': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
  ],
  // 商家意见
  'merchant-feedback': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 集团列表
  'group-list': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 集团权限
  'group-permission': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 门店基础信息管理
  'store-basic-info': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 合同管理
  'contract-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
  ],
  // 集团门店品牌库管理
  'group-brand-library': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 商品标签
  'product-tags': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 商品参数
  'product-params': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 门店管理
  'store-management': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 门店营业品类
  'store-categories': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 商品平台分类
  'product-platform-categories': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 团购门店管理
  'group-buy-store': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
  // 团购商品管理
  'group-buy-product': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
  ],
}

/** 获取菜单的功能操作（如果未定义则返回默认功能） */
export const getMenuActions = (menuKey: string) => {
  return MENU_ACTIONS_MAP[menuKey] || PERMISSION_ACTIONS
}

/** 功能权限（菜单+操作） */
export interface MenuPermission {
  menuKey: string // 菜单key
  actions: string[] // 允许的操作：view, create, edit, delete, import, export, enable, disable
}

/** 功能角色 */
export interface Role {
  id: string
  name: string
  description: string
  permissions: MenuPermission[] // 菜单权限列表
  userCount: number
  createdAt: string
  status: 'active' | 'inactive' // 状态：启用/停用
}

/** 员工账号 */
export interface UserAccount {
  empId: string
  name: string
  username: string
  roles: string[] // 角色ID数组，支持多角色
  department?: string
}

/** 地点数据组 */
export interface LocationGroup {
  id: string
  name: string
  description: string
  country: string // 授权国家（单个）
  locations: string[] // 地点key数组
  userCount: number
  createdAt: string
  status: 'active' | 'inactive' // 状态：启用/停用
}

/** 商家数据组 */
export interface MerchantGroup {
  id: string
  name: string
  description: string
  country: string // 授权国家（单个）
  merchants: string[] // 商家ID数组
  userCount: number
  createdAt: string
  status: 'active' | 'inactive' // 状态：启用/停用
}

/** 地点选项 */
export const locationOptions = [
  // 华南地区
  { key: 'guangzhou', label: '广州' },
  { key: 'shenzhen', label: '深圳' },
  { key: 'zhuhai', label: '珠海' },
  { key: 'dongguan', label: '东莞' },
  { key: 'foshan', label: '佛山' },
  { key: 'zhongshan', label: '中山' },
  { key: 'huizhou', label: '惠州' },
  { key: 'jiangmen', label: '江门' },
  { key: 'zhaoqing', label: '肇庆' },
  { key: 'qingyuan', label: '清远' },
  // 华东地区
  { key: 'shanghai', label: '上海' },
  { key: 'hangzhou', label: '杭州' },
  { key: 'nanjing', label: '南京' },
  { key: 'suzhou', label: '苏州' },
  { key: 'wuxi', label: '无锡' },
  { key: 'ningbo', label: '宁波' },
  { key: 'hefei', label: '合肥' },
  { key: 'wenzhou', label: '温州' },
  { key: 'changzhou', label: '常州' },
  { key: 'nantong', label: '南通' },
  { key: 'shaoxing', label: '绍兴' },
  { key: 'jiaxing', label: '嘉兴' },
  { key: 'taizhou_zj', label: '台州' },
  // 华北地区
  { key: 'beijing', label: '北京' },
  { key: 'tianjin', label: '天津' },
  { key: 'shijiazhuang', label: '石家庄' },
  { key: 'taiyuan', label: '太原' },
  { key: 'datong', label: '大同' },
  { key: 'baoding', label: '保定' },
  { key: 'tangshan', label: '唐山' },
  { key: 'handan', label: '邯郸' },
  { key: 'langfang', label: '廊坊' },
  { key: 'cangzhou', label: '沧州' },
  { key: 'chengde', label: '承德' },
  { key: 'zhangjiakou', label: '张家口' },
  // 西南地区
  { key: 'chengdu', label: '成都' },
  { key: 'chongqing', label: '重庆' },
  { key: 'kunming', label: '昆明' },
  { key: 'guiyang', label: '贵阳' },
  { key: 'mianyang', label: '绵阳' },
  { key: 'zunyi', label: '遵义' },
  { key: 'dali', label: '大理' },
  { key: 'liuzhou', label: '柳州' },
  { key: 'nanning', label: '南宁' },
  { key: 'deyang', label: '德阳' },
  { key: 'meishan', label: '眉山' },
  { key: 'leshan', label: '乐山' },
  { key: 'zigong', label: '自贡' },
  { key: 'yibin', label: '宜宾' },
  { key: 'nanchong', label: '南充' },
  // 华中地区
  { key: 'wuhan', label: '武汉' },
  { key: 'changsha', label: '长沙' },
  { key: 'zhengzhou', label: '郑州' },
  { key: 'nanchang', label: '南昌' },
  { key: 'xiangyang', label: '襄阳' },
  { key: 'yichang', label: '宜昌' },
  { key: 'zhuzhou', label: '株洲' },
  { key: 'luoyang', label: '洛阳' },
  { key: 'kaifeng', label: '开封' },
  // 东北地区
  { key: 'shenyang', label: '沈阳' },
  { key: 'dalian', label: '大连' },
  { key: 'harbin', label: '哈尔滨' },
  { key: 'changchun', label: '长春' },
  { key: 'anjing', label: '安庆' },
  { key: 'jilin', label: '吉林' },
  { key: 'qiqihar', label: '齐齐哈尔' },
  { key: 'mudanjiang', label: '牡丹江' },
  { key: 'yingkou', label: '营口' },
  // 西北地区
  { key: 'xian', label: '西安' },
  { key: 'lanzhou', label: '兰州' },
  { key: 'yinchuan', label: '银川' },
  { key: 'xining', label: '西宁' },
  { key: 'wulumuqi', label: '乌鲁木齐' },
  { key: 'tianshui', label: '天水' },
  { key: 'yanan', label: '延安' },
  { key: 'jiayuguan', label: '嘉峪关' },
  { key: 'shihezi', label: '石河子' },
  // 港澳台地区
  { key: 'hongkong', label: '香港' },
  { key: 'macau', label: '澳门' },
  { key: 'taipa', label: '氹仔' },
  { key: 'coloane', label: '路环' },
  { key: 'kowloon', label: '九龙' },
  { key: 'new_territories', label: '新界' },
  { key: 'hong_kong_island', label: '香港岛' },
  { key: 'taipa_cotai', label: '氹仔路氹' },
  // 海外地区
  { key: 'singapore', label: '新加坡' },
  { key: 'tokyo', label: '东京' },
  { key: 'seoul', label: '首尔' },
  { key: 'bangkok', label: '曼谷' },
  { key: 'kuala_lumpur', label: '吉隆坡' },
  { key: 'jakarta', label: '雅加达' },
  { key: 'manila', label: '马尼拉' },
  { key: 'ho_chi_minh', label: '胡志明' },
  { key: 'sydney', label: '悉尼' },
  // 海峡西岸
  { key: 'fuzhou', label: '福州' },
  { key: 'xiamen', label: '厦门' },
  { key: 'quanzhou', label: '泉州' },
  { key: 'zhangzhou', label: '漳州' },
  { key: 'putian', label: '莆田' },
  { key: 'sanming', label: '三明' },
]

/** 国家选项 */
export const countryOptions = [
  { key: 'china', label: '中国' },
  { key: 'hongkong', label: '香港' },
  { key: 'macau', label: '澳门' },
  { key: 'taiwan', label: '台湾' },
  { key: 'japan', label: '日本' },
  { key: 'south_korea', label: '韩国' },
  { key: 'singapore', label: '新加坡' },
  { key: 'malaysia', label: '马来西亚' },
  { key: 'thailand', label: '泰国' },
  { key: 'vietnam', label: '越南' },
  { key: 'philippines', label: '菲律宾' },
  { key: 'indonesia', label: '印度尼西亚' },
  { key: 'usa', label: '美国' },
  { key: 'uk', label: '英国' },
  { key: 'australia', label: '澳大利亚' },
]

/** 国家与城市映射 */
export const countryLocationMap: Record<string, string[]> = {
  china: [
    'guangzhou', 'shenzhen', 'zhuhai', 'dongguan', 'foshan', 'zhongshan', 'huizhou', 'jiangmen', 'zhaoqing', 'qingyuan',
    'shanghai', 'hangzhou', 'nanjing', 'suzhou', 'wuxi', 'ningbo', 'hefei', 'wenzhou', 'changzhou', 'nantong', 'shaoxing', 'jiaxing', 'taizhou_zj',
    'beijing', 'tianjin', 'shijiazhuang', 'taiyuan', 'datong', 'baoding', 'tangshan', 'handan', 'langfang', 'cangzhou', 'chengde', 'zhangjiakou',
    'chengdu', 'chongqing', 'kunming', 'guiyang', 'mianyang', 'zunyi', 'dali', 'liuzhou', 'nanning', 'deyang', 'meishan', 'leshan', 'zigong', 'yibin', 'nanchong',
    'wuhan', 'changsha', 'zhengzhou', 'nanchang', 'xiangyang', 'yichang', 'zhuzhou', 'luoyang', 'kaifeng',
    'shenyang', 'dalian', 'harbin', 'changchun', 'anjing', 'jilin', 'qiqihar', 'mudanjiang', 'yingkou',
    'xian', 'lanzhou', 'yinchuan', 'xining', 'wulumuqi', 'tianshui', 'yanan', 'jiayuguan', 'shihezi',
    'fuzhou', 'xiamen', 'quanzhou', 'zhangzhou', 'putian', 'sanming',
  ],
  hongkong: ['hongkong', 'kowloon', 'new_territories', 'hong_kong_island'],
  macau: ['macau', 'taipa', 'coloane', 'taipa_cotai'],
  taiwan: ['taipei', 'kaohsiung', 'taichung', 'tainan'],
  japan: ['tokyo', 'osaka', 'kyoto', 'nagoya', 'sapporo', 'fukuoka'],
  south_korea: ['seoul', 'busan', 'incheon', 'daegu', 'daejeon'],
  singapore: ['singapore'],
  malaysia: ['kuala_lumpur', 'penang', 'johor_bahru', 'malacca'],
  thailand: ['bangkok', 'chiang_mai', 'phuket', 'pattaya'],
  vietnam: ['ho_chi_minh', 'hanoi', 'da_nang', 'hai_phong'],
  philippines: ['manila', 'cebu', 'davao', 'quezon_city'],
  indonesia: ['jakarta', 'surabaya', 'bandung', 'medan', 'bali'],
  usa: ['new_york', 'los_angeles', 'chicago', 'houston', 'phoenix'],
  uk: ['london', 'manchester', 'birmingham', 'edinburgh', 'glasgow'],
  australia: ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide'],
}

/** 商家模拟数据 */
export const merchantOptions = [
  // 中国商家
  { id: 'G10001', name: '美味集團有限公司', address: '廣東省廣州市', country: 'china' },
  { id: 'G10002', name: '閃蜂科技有限公司', address: '廣東省深圳市', country: 'china' },
  { id: 'G10005', name: '金龍餐飲管理公司', address: '廣東省珠海市', country: 'china' },
  { id: 'G10006', name: '星輝餐飲集團', address: '珠海', country: 'china' },
  { id: 'G10007', name: '佳味食品科技有限公司', address: '廣東省廣州市', country: 'china' },
  { id: 'G10009', name: '雲端科技餐飲集團', address: '廣東省深圳市', country: 'china' },
  // 港澳商家
  { id: 'G10003', name: '鮮味餐飲集團', address: '澳門', country: 'macau' },
  { id: 'G10004', name: '速達物流有限公司', address: '氹仔', country: 'macau' },
  { id: 'G10008', name: '鵬程餐飲有限公司', address: '澳門', country: 'macau' },
  { id: 'G10010', name: '合眾餐飲管理有限公司', address: '氹仔', country: 'macau' },
  // 日本商家
  { id: 'G10011', name: '東京餐飲株式会社', address: '東京都', country: 'japan' },
  { id: 'G10012', name: '大阪美食集团', address: '大阪市', country: 'japan' },
  { id: 'G10013', name: '京都料理公司', address: '京都市', country: 'japan' },
  // 韩国商家
  { id: 'G10014', name: '首尔餐饮集团', address: '首尔特别市', country: 'south_korea' },
  { id: 'G10015', name: '釜山美食公司', address: '釜山广域市', country: 'south_korea' },
  // 新加坡商家
  { id: 'G10016', name: '新加坡美食中心', address: '新加坡', country: 'singapore' },
  { id: 'G10017', name: '狮城餐饮集团', address: '新加坡', country: 'singapore' },
  // 泰国商家
  { id: 'G10018', name: '曼谷美食公司', address: '曼谷', country: 'thailand' },
  { id: 'G10019', name: '清迈餐饮集团', address: '清迈', country: 'thailand' },
  // 马来西亚商家
  { id: 'G10020', name: '吉隆坡餐饮中心', address: '吉隆坡', country: 'malaysia' },
  { id: 'G10021', name: '槟城美食集团', address: '槟城', country: 'malaysia' },
  // 越南商家
  { id: 'G10022', name: '胡志明餐饮公司', address: '胡志明市', country: 'vietnam' },
  { id: 'G10023', name: '河内美食集团', address: '河内', country: 'vietnam' },
  // 美国商家
  { id: 'G10024', name: '纽约餐饮集团', address: '纽约', country: 'usa' },
  { id: 'G10025', name: '洛杉矶美食公司', address: '洛杉矶', country: 'usa' },
  // 英国商家
  { id: 'G10026', name: '伦敦餐饮中心', address: '伦敦', country: 'uk' },
  { id: 'G10027', name: '曼彻斯特美食集团', address: '曼彻斯特', country: 'uk' },
  // 澳大利亚商家
  { id: 'G10028', name: '悉尼餐饮集团', address: '悉尼', country: 'australia' },
  { id: 'G10029', name: '墨尔本美食公司', address: '墨尔本', country: 'australia' },
]

/** 菜单权限映射（用于生成权限树） */
export const menuPermissionTree: PermissionModule[] = [
  {
    key: 'home',
    name: '首頁',
  },
  {
    key: 'merchant_group',
    name: '商戶集團管理',
    children: [
      { key: 'merchant-group-list', name: '集團管理' },
      { key: 'store-list', name: '門店管理' },
    ],
  },
  {
    key: 'merchant_promotion',
    name: '商家推廣工具',
    children: [
      { key: 'promotion-dashboard', name: '數據看板' },
      { key: 'promotion-algorithm', name: '算法庫' },
      { key: 'promotion-slot-config', name: '瀑布流策略' },
      { key: 'promotion-waterfall', name: '銷售定價' },
      {
        key: 'gift-manage',
        name: '贈送管理',
        children: [
          { key: 'gift-detail', name: '推廣贈送' },
          { key: 'gift-consume-detail', name: '消費明細' },
        ],
      },
      { key: 'ad-sales', name: '廣告銷售' },
      { key: 'promotion-word-library', name: '詞庫管理' },
    ],
  },
  {
    key: 'promotion-tool',
    name: '推廣通',
    children: [
      { key: 'promotion-sales-config', name: '店鋪推廣' },
      {
        key: 'promotion-report-group',
        name: '報表分析',
        children: [
          { key: 'promotion-report-overview', name: '數據概覽' },
          { key: 'promotion-report-order', name: '訂單效果報表' },
          { key: 'promotion-report-compare', name: '推薦類型對比' },
        ],
      },
    ],
  },
  {
    key: 'search',
    name: '搜索管理',
    children: [
      {
        key: 'search-config-new',
        name: '搜索配置',
        children: [
          { key: 'global-config', name: '全局配置' },
          { key: 'channel-strategy', name: '維度策略' },
        ],
      },
      {
        key: 'search-guide',
        name: '搜索引導',
        children: [
          { key: 'hint-config', name: '底紋配置' },
          { key: 'hot-search-config', name: '熱搜配置' },
          { key: 'search-weight-config', name: '權重干預' },
        ],
      },
      {
        key: 'search-library',
        name: '搜索詞庫',
        children: [
          { key: 'word-segmentation', name: '分詞詞庫' },
          { key: 'synonym-config', name: '同義詞庫' },
          { key: 'hot-search-library', name: '熱搜詞庫' },
          { key: 'stop-words', name: '停用詞庫' },
        ],
      },
      {
        key: 'search-verify-group',
        name: '效果校驗',
        children: [
          { key: 'search-verify', name: '搜索校驗' },
          { key: 'hint-verify', name: '底紋校驗' },
          { key: 'hot-search-verify', name: '熱搜校驗' },
        ],
      },
      {
        key: 'report',
        name: '報表統計',
        children: [
          { key: 'hint-report', name: '底紋報表' },
          { key: 'hot-search-report', name: '熱搜報表' },
        ],
      },
    ],
  },
  {
    key: 'finance',
    name: '財務管理',
    children: [
      {
        key: 'promotion',
        name: '推廣金管理',
        children: [
          { key: 'account-balance', name: '賬戶餘額' },
          { key: 'batch-query', name: '批次查詢' },
          { key: 'detail-query', name: '明細查詢' },
        ],
      },
      {
        key: 'merchant-reconcile',
        name: '商戶通對賬',
        children: [
          { key: 'writeoff-reconcile', name: '充消對賬' },
          { key: 'debt-reconcile', name: '欠款對賬' },
        ],
      },
      {
        key: 'approval',
        name: '審批管理',
        children: [
          { key: 'approval-center', name: '審批中心' },
        ],
      },
    ],
  },
  {
    key: 'hr',
    name: '集團人事',
    children: [
      { key: 'employee-management', name: '員工管理' },
      { key: 'organization-management', name: '組織管理' },
      { key: 'position-management', name: '職位管理' },
      { key: 'login-log', name: '員工動態' },
    ],
  },
  {
    key: 'permission',
    name: '權限管理',
    children: [
      { key: 'role-management', name: '角色管理' },
      { key: 'function-permission', name: '功能授權' },
      { key: 'data-permission', name: '數據授權' },
    ],
  },
  {
    key: 'system-config',
    name: '系統配置',
    children: [
      { key: 'menu-config', name: '菜單配置' },
      { key: 'translation-manage', name: '多語言配置' },
      { key: 'rule-config', name: '規則配置' },
      { key: 'workflow-config', name: '流程配置' },
    ],
  },
]

/**
 * 已接入權限校驗的受控菜單 key（叶子菜单）
 * 無對應菜單權限（任一 action）時：側邊欄隱藏該菜單、路由禁止訪問
 * 其餘原型菜單暫不受控，所有登錄用戶可見
 */
export const CONTROLLED_MENU_KEYS: string[] = [
  // 首頁
  'home',
  // 商戶集團管理
  'merchant-group-list',
  'store-list',
  // 商家推廣工具
  'promotion-dashboard',
  'promotion-algorithm',
  'promotion-slot-config',
  'promotion-waterfall',
  'ad-sales',
  'promotion-word-library',
  // 商家推廣工具 - 贈送管理
  'gift-detail',
  'gift-consume-detail',
  // 推廣通
  'promotion-sales-config',
  'promotion-report-overview',
  'promotion-report-order',
  'promotion-report-compare',
  // 搜索管理 - 搜索配置
  'global-config',
  'channel-strategy',
  // 搜索管理 - 搜索引導
  'hint-config',
  'hot-search-config',
  'search-weight-config',
  // 搜索管理 - 搜索詞庫
  'word-segmentation',
  'synonym-config',
  'hot-search-library',
  'stop-words',
  // 搜索管理 - 效果校驗
  'search-verify',
  'hint-verify',
  'hot-search-verify',
  // 搜索管理 - 報表統計
  'hint-report',
  'hot-search-report',
  // 財務管理
  'account-balance',
  'batch-query',
  'detail-query',
  'writeoff-reconcile',
  'debt-reconcile',
  'approval-center',
  // 集團人事
  'employee-management',
  'organization-management',
  'position-management',
  'login-log',
  // 權限管理
  'role-management',
  'function-permission',
  'data-permission',
  // 系統配置
  'menu-config',
  'translation-manage',
  'rule-config',
  'workflow-config',
]

/**
 * 受控路由路徑 → 菜單 key 映射（含二級頁面歸屬其入口菜單）
 * 用於路由守衛判斷當前頁面所需的菜單權限
 */
export const ROUTE_MENU_KEY_MAP: Record<string, string> = {
  // 首頁
  '/': 'home',
  // 商戶集團管理
  '/merchant-group-list': 'merchant-group-list',
  '/store-list': 'store-list',
  // 商家推廣工具
  '/promotion-dashboard': 'promotion-dashboard',
  '/promotion-algorithm': 'promotion-algorithm',
  '/promotion-algorithm-add': 'promotion-algorithm',
  '/promotion-algorithm-flow': 'promotion-algorithm',
  '/promotion-slot-config': 'promotion-slot-config',
  '/promotion-slot-config-add': 'promotion-slot-config',
  '/promotion-slot-config-slots': 'promotion-slot-config',
  '/promotion-waterfall': 'promotion-waterfall',
  '/promotion-waterfall1': 'promotion-waterfall',
  '/promotion-waterfall-add': 'promotion-waterfall',
  '/ad-sales': 'ad-sales',
  '/promotion-word-library': 'promotion-word-library',
  // 商家推廣工具 - 贈送管理
  '/gift-detail': 'gift-detail',
  '/gift-add': 'gift-detail',
  '/gift-detail-view': 'gift-detail',
  '/gift-consume-detail': 'gift-consume-detail',
  // 推廣通
  '/promotion-sales-config': 'promotion-sales-config',
  '/promotion-order-manage': 'promotion-sales-config',
  '/merchant-order-manage': 'promotion-sales-config',
  '/order-detail': 'promotion-sales-config',
  '/promotion-report-overview': 'promotion-report-overview',
  '/promotion-report-order': 'promotion-report-order',
  '/promotion-report-compare': 'promotion-report-compare',
  // 搜索管理 - 搜索配置
  '/global-config': 'global-config',
  '/channel-strategy': 'channel-strategy',
  // 搜索管理 - 搜索引導
  '/hint-config': 'hint-config',
  '/hint-preview': 'hint-config',
  '/hot-search-config': 'hot-search-config',
  '/hot-search-preview': 'hot-search-config',
  '/search-weight-config': 'search-weight-config',
  // 搜索管理 - 搜索詞庫
  '/word-segmentation': 'word-segmentation',
  '/synonym-config': 'synonym-config',
  '/hot-search-library': 'hot-search-library',
  '/stop-words': 'stop-words',
  // 搜索管理 - 效果校驗
  '/search-verify': 'search-verify',
  '/search-verify-detail/:id': 'search-verify',
  '/hint-verify': 'hint-verify',
  '/hot-search-verify': 'hot-search-verify',
  // 搜索管理 - 報表統計
  '/hint-report': 'hint-report',
  '/hot-search-report': 'hot-search-report',
  // 財務管理 - 推廣金管理
  '/account-balance': 'account-balance',
  '/recharge-add': 'account-balance',
  '/transfer-add': 'account-balance',
  '/deduct-add': 'account-balance',
  '/merge-add': 'account-balance',
  '/batch-query': 'batch-query',
  '/batch-detail': 'batch-query',
  '/detail-query': 'detail-query',
  // 財務管理 - 商戶通對賬
  '/writeoff-reconcile': 'writeoff-reconcile',
  '/debt-reconcile': 'debt-reconcile',
  '/debt-detail': 'debt-reconcile',
  // 財務管理 - 審批管理
  '/approval-center': 'approval-center',
  '/approval-detail': 'approval-center',
  // 集團人事
  '/employee-management': 'employee-management',
  '/organization-management': 'organization-management',
  '/position-management': 'position-management',
  '/login-log': 'login-log',
  // 權限管理
  '/role-management': 'role-management',
  '/function-permission': 'function-permission',
  '/data-permission': 'data-permission',
  // 系統配置
  '/menu-config': 'menu-config',
  '/translation-manage': 'translation-manage',
  '/rule-config': 'rule-config',
  '/workflow-config': 'workflow-config',
}

/**
 * 菜單 key → 路由路徑映射（從 ROUTE_MENU_KEY_MAP 反轉，每個菜單取第一個匹配的路徑）
 * 用於登錄後智能跳轉：根據用戶權限找到第一個可訪問的菜單路徑
 */
export const MENU_KEY_PATH_MAP: Record<string, string> = {}
for (const [route, menuKey] of Object.entries(ROUTE_MENU_KEY_MAP)) {
  if (!(menuKey in MENU_KEY_PATH_MAP)) {
    MENU_KEY_PATH_MAP[menuKey] = route
  }
}

/**
 * 根據用戶權限找到第一個可訪問的菜單路徑
 * 按 CONTROLLED_MENU_KEYS 順序遍歷，返回第一個有權限的菜單對應的路徑
 * admin 直接返回首頁；無任何權限時降級返回首頁
 */
export function resolveFirstAccessiblePath(
  isAdmin: boolean,
  hasMenuPermission: (menuKey: string) => boolean,
): string {
  if (isAdmin) return '/'
  for (const key of CONTROLLED_MENU_KEYS) {
    if (hasMenuPermission(key)) {
      return MENU_KEY_PATH_MAP[key] || '/'
    }
  }
  return '/'
}

/** localStorage Key */
export const STORAGE_KEYS = {
  ROLES: 'permission_roles',
  USER_ACCOUNTS: 'permission_user_accounts',
  LOCATION_GROUPS: 'permission_location_groups',
  MERCHANT_GROUPS: 'permission_merchant_groups',
  DATA_AUTHORIZATIONS: 'permission_data_authorizations',
} as const

/** 数据授权对象类型 */
export const DATA_TARGET_TYPE = {
  ROLE: 'role',
  DEPARTMENT: 'department',
} as const

export type DataTargetType = typeof DATA_TARGET_TYPE[keyof typeof DATA_TARGET_TYPE]

/** 数据授权记录（一条 = 角色/部门 → 一个商家集团） */
export interface DataAuthorization {
  id: number
  targetType: DataTargetType
  targetId: number
  targetName?: string      // 角色/部门名称（后端填充）
  groupCode: string        // 商家集团编码
  groupName?: string       // 商家集团名称（后端填充）
  status: number           // 1=启用 0=停用
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}
