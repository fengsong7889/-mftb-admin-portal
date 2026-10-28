/**
 * 人工智能系统 · 功能地图（与后端 AiMenuLayout 同源的展示副本）
 *
 * 为什么放在页面上：用户反馈「大部分菜单不知道具体作用」。菜单树只能表达层级，
 * 表达不了「管什么、谁来用、对谁生效」；这里用一张表把三件事一次讲清。
 *
 * 维护约束：与 `backend/.../config/AiMenuLayout.java` 的分组和显示名保持一致；
 * 菜单 key 不在此处参与鉴权，只用于帮助读者与授权中心对照。
 */

export interface AiMenuEntry {
  /** 功能入口显示名（与后端 name 一致） */
  name: string
  /** menu_key：与授权中心的菜单 key 对照 */
  key: string
  /** 管什么 */
  duty: string
  /** 对谁生效 / 生效范围 */
  scope: string
}

export interface AiMenuGroup {
  group: string
  groupKey: string
  /** 这组解决的业务问题 */
  purpose: string
  /** 谁主要使用 */
  audience: string
  entries: AiMenuEntry[]
}

export const AI_MENU_MAP: AiMenuGroup[] = [
  {
    group: '總覽',
    groupKey: 'ai-grp-overview',
    purpose: '先看整体：配置缺什么、最近改了什么',
    audience: '平台运营、应用负责人（按权限）',
    entries: [
      { name: '平台總覽', key: 'agent-overview', duty: '配置就绪与阻断项、上线顺序', scope: '只读 / 平台共用' },
      { name: '助手總覽', key: 'ai-assistant-overview', duty: '助手配置入口、问题与近期变更', scope: '只读 / 助手运营' },
    ],
  },
  {
    group: '應用管理',
    groupKey: 'ai-grp-app',
    purpose: '一个应用从登记到发布，以及助手怎么回答',
    audience: '应用负责人、助手运营',
    entries: [
      { name: '智能應用', key: 'agent-apps', duty: '用途、负责人、版本与发布', scope: '单应用' },
      { name: '回答規則', key: 'ai-assistant-profile', duty: '系统指令、领域规则与输出结构', scope: '公共或业务系统' },
      { name: '快捷提問', key: 'ai-assistant-quick-prompt', duty: '向员工推荐的常用问题', scope: '按范围' },
      { name: '推送模板', key: 'ai-assistant-push-template', duty: '通知标题、正文与变量', scope: '模板级（不含渠道凭据）' },
    ],
  },
  {
    group: '模型與工具',
    groupKey: 'ai-grp-model',
    purpose: '能用哪些模型、AI 能替人做什么，以及谁被允许做',
    audience: '模型管理员、集成人员、授权管理员',
    entries: [
      { name: '模型接入', key: 'ai-model-list', duty: '启停、部署参数、价格与通道使用范围', scope: '模型级' },
      { name: '模型供應商', key: 'ai-model-provider', duty: '上游连接与凭据维护', scope: '供应商级' },
      { name: '工具管理', key: 'ai-mcp-service', duty: '工具是否已接入、是否可被调用', scope: '工具级（安装≠授权）' },
      { name: '工具能力說明', key: 'ai-assistant-capability', duty: '告诉模型何时该用该工具', scope: '工具级' },
      { name: '工具與通道授權', key: 'ai-operation-auth', duty: '人员范围、参数限制、通道账号白名单、急停', scope: '工具或通道级' },
    ],
  },
  {
    group: '知識管理',
    groupKey: 'ai-grp-knowledge',
    purpose: 'AI 读什么、谁能读、术语口径怎么统一',
    audience: '知识编辑、数据授权、业务专家',
    entries: [
      { name: '知識庫', key: 'ai-assistant-knowledge', duty: '正文、启停、分块与检索测试', scope: '文档级' },
      { name: '知識授權', key: 'agent-knowledge', duty: '谁能检索哪份文档', scope: '文档级（读取≠外发）' },
      { name: '業務術語', key: 'ai-assistant-glossary', duty: '术语、别名与口径说明', scope: '公共或业务系统' },
    ],
  },
  {
    group: '授權與額度',
    groupKey: 'ai-grp-grant',
    purpose: '三种规则不要混：能用哪个模型、用了多少、花了多少钱',
    audience: '授权管理员、额度管理员、预算管理员',
    entries: [
      { name: '員工使用診斷', key: 'ai-emp-permission', duty: '某人能用什么、为什么被拦、来源在哪', scope: '单员工（只读 + 定向调整）' },
      { name: '部門模型授權', key: 'ai-dept-model-auth', duty: '部门可用的模型与能力', scope: '部门' },
      { name: '員工模型授權', key: 'ai-emp-model-auth', duty: '按职位或自定义人员组授予模型', scope: '职位 / 人员组' },
      { name: '部門額度', key: 'ai-dept-quota', duty: '部门 Tokens/次数/费用上限与超额动作', scope: '部门（共享或人均）' },
      { name: '員工額度', key: 'ai-emp-quota', duty: '职位、人员组、员工专属的用量上限', scope: '组或本人' },
      { name: '費用預算', key: 'agent-budget', duty: '金额预算的预占与结算，不授予模型权限', scope: '员工 + 自然月' },
      { name: '用量匯總', key: 'ai_usage_stats', duty: '按模型、按员工看请求量与费用', scope: '授权范围内全量' },
      { name: '調用明細', key: 'ai_energy_detail', duty: '逐次调用记录与计量可信度', scope: '单次调用' },
      { name: '使用申請', key: 'ai-access-request', duty: '申请模型或额度，进入 OA 审批', scope: '本人' },
    ],
  },
  {
    group: '運行與質量',
    groupKey: 'ai-grp-run',
    purpose: '跑得怎么样、该谁处理、质量从哪改进',
    audience: '发起人、审批/执行/核实人、质量运营',
    entries: [
      { name: '運行記錄', key: 'agent-runs', duty: '本人运行的状态、步骤与结果', scope: '本人' },
      { name: '操作審批', key: 'agent-actions', duty: '待审批、待执行、结果待核实', scope: '单提案（三种职责分权）' },
      { name: '評測與發布記錄', key: 'agent-evaluation', duty: '安全策略回归结果与发布记录', scope: '应用 / 策略' },
      { name: '用戶反饋', key: 'ai-assistant-feedback', duty: '赞踩、低分工具与原因分布', scope: '反馈记录（只读）' },
    ],
  },
  {
    group: '安全與治理',
    groupKey: 'ai-grp-security',
    purpose: '数据能不能出去、内容安不安全、出了事怎么查',
    audience: '数据负责人、准入审批、安全与审计',
    entries: [
      { name: '數據外發管理', key: 'agent-data', duty: '系统数据分级 + 模型端点批准', scope: '系统与端点（登记与批准分开）' },
      { name: '內容安全規則', key: 'ai-assistant-guardrail', duty: '关键词/正则的拦截、替换与提醒', scope: '输入 / 输出' },
      { name: '記憶策略', key: 'ai-assistant-memory', duty: '保留期、存储上限与注入条数', scope: '全局' },
      { name: '對話審計', key: 'ai-conversation-audit', duty: '对话内容与模型调用留痕', scope: '授权范围内' },
      { name: '配置變更審計', key: 'ai-assistant-audit', duty: '谁在什么时候改了哪条配置', scope: '配置项' },
    ],
  },
]

/** 功能入口总数（与后端菜单盘点口径一致：32 个叶子入口） */
export const AI_MENU_ENTRY_COUNT = AI_MENU_MAP.reduce((sum, group) => sum + group.entries.length, 0)
