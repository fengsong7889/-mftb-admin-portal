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
  // 商户推广工具 - 数据看板
  'recommend-dashboard': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 算法配置
  'recommend-algorithm': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 坑位配置
  'recommend-slot': [
    { key: 'view', label: '查看' },
    { key: 'create', label: '新增' },
    { key: 'edit', label: '編輯' },
    { key: 'delete', label: '刪除' },
    { key: 'enable', label: '啟用' },
    { key: 'disable', label: '停用' },
  ],
  // 销售价格
  'recommend-pricing': [
    { key: 'view', label: '查看' },
    { key: 'edit', label: '編輯' },
  ],
  // 订单列表
  'recommend-order': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 投放日历
  'recommend-calendar': [
    { key: 'view', label: '查看' },
  ],
  // 效果报表
  'recommend-effect-report': [
    { key: 'view', label: '查看' },
    { key: 'export', label: '導出' },
  ],
  // 营收报表
  'recommend-revenue-report': [
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
  // 权限管理
  'permission': [
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
    key: 'recommend',
    name: '商戶推廣工具',
    children: [
      { key: 'recommend-dashboard', name: '數據看板' },
      { key: 'recommend-algorithm', name: '算法配置' },
      {
        key: 'recommend-slot-group',
        name: '瀑布流配置',
        children: [
          { key: 'recommend-slot', name: '坑位配置' },
          { key: 'recommend-pricing', name: '銷售價格' },
        ],
      },
      {
        key: 'recommend-order-group',
        name: '訂單管理',
        children: [
          { key: 'recommend-order', name: '訂單列表' },
          { key: 'recommend-calendar', name: '投放日曆' },
        ],
      },
      {
        key: 'recommend-report-group',
        name: '統計報表',
        children: [
          { key: 'recommend-effect-report', name: '效果報表' },
          { key: 'recommend-revenue-report', name: '營收報表' },
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
        name: '商戶推廣工具',
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
    key: 'permission',
    name: '權限管理',
    children: [
      { key: 'function-permission', name: '功能權限' },
      { key: 'data-permission', name: '數據權限' },
    ],
  },
  {
    key: 'system',
    name: '系統設置',
    children: [
      { key: 'menu-management', name: '菜單管理' },
      { key: 'system-template', name: '系統模板' },
      { key: 'layout-settings', name: '布局設置' },
      { key: 'basic-settings', name: '基礎設置' },
    ],
  },
  {
    key: 'user-management',
    name: '用戶管理',
    children: [
      { key: 'user-feedback', name: '用戶意見反饋' },
      { key: 'user-list', name: '用戶列表' },
      { key: 'user-avatar', name: '用戶頭像管理' },
      { key: 'user-frozen', name: '用戶凍結列表' },
      { key: 'device-frozen', name: '設備號凍結列表' },
      { key: 'user-location-special', name: '用戶收貨地圖特殊收錄' },
      { key: 'user-location-blacklist', name: '用戶收貨地圖黑名單' },
      { key: 'whitelist', name: '白名單(內外測試人員)' },
    ],
  },
  {
    key: 'operation-platform',
    name: '運營平台工具',
  },
  {
    key: 'operation-delivery',
    name: '運營投放管理',
    children: [
      { key: 'delivery-list', name: '投放列表' },
    ],
  },
  {
    key: 'merchant-group',
    name: '商戶集團管理',
    children: [
      { key: 'merchant-onboarding', name: '商家入駐' },
      { key: 'merchant-feedback', name: '商家意見' },
      { key: 'group-list', name: '集團列表' },
      { key: 'group-permission', name: '集團權限(運營主管)' },
      { key: 'store-basic-info', name: '門店基礎信息管理' },
      { key: 'contract-management', name: '合同管理' },
      { key: 'group-brand-library', name: '集團門店品牌庫管理' },
    ],
  },
  {
    key: 'delivery-business',
    name: '到家業務(外賣)',
    children: [
      { key: 'product-tags', name: '商品標簽' },
      { key: 'product-params', name: '商品參數' },
      { key: 'store-management', name: '門店管理' },
      { key: 'store-categories', name: '門店營業品類' },
      { key: 'product-platform-categories', name: '商品平台分類' },
    ],
  },
  {
    key: 'group-buy-business',
    name: '到店業務(團購)',
    children: [
      { key: 'group-buy-store', name: '團購門店管理' },
      { key: 'group-buy-product', name: '商品管理' },
    ],
  },
]

/** localStorage Key */
export const STORAGE_KEYS = {
  ROLES: 'permission_roles',
  USER_ACCOUNTS: 'permission_user_accounts',
  LOCATION_GROUPS: 'permission_location_groups',
  MERCHANT_GROUPS: 'permission_merchant_groups',
} as const
