/**
 * 产研交付（RDM）个人工作台 —— 角色化布局配置层
 *
 * 为什么需要这一层：个人工作台是所有人进入 RDM 的第一屏，但研发、测试、项目经理、
 * 业务方关心的对象完全不同（任务 / 测试批次 / 项目进度 / 我的提交）。旧版把 9 个区块
 * 平铺给所有人，研发进来先看到「我提交的需求」、测试看到的是需求列表 —— 首屏对多数
 * 角色是无效的。这里改成「系统按身份推荐 + 个人有限调整」：
 * - 首次进入即有可用内容（不像完全自定义那样给一张空白板）；
 * - 个人只能显隐与排序自己有权访问的区块，不能凭空造入口。
 *
 * 口径边界（严格遵守）：
 * - 身份只用于**界面编排**，不作为授权依据；后端每个端点仍独立鉴权与收敛数据范围。
 * - 区块声明 menuKey，未持有该菜单权限的区块既不进推荐，也不出现在可勾选清单。
 * - 个人布局优先从后端加载（按账号隔离），localStorage 作为离线缓存；
 *   后端不可用时回退 localStorage，确保页面仍能正常展示。
 */
import { useEffect, useRef, useState } from 'react'
import { fetchWorkbenchLayout, saveWorkbenchLayout } from '../../api/auth'
import type { WorkbenchLayoutData } from '../../api/auth'

/* ==================== 工作身份 ==================== */

/**
 * 工作身份（不是 sys_role，也不等价于后端 roleNames）。
 * <p>一个可以同时是研发 + 验收人，也可以只是提出人。
 */
export type RdmIdentity =
  | 'submitter'
  | 'approver'
  | 'dispatcher'
  | 'product'
  | 'developer'
  | 'tester'
  | 'acceptor'
  | 'releaser'
  | 'projectMgr'

export const RDM_IDENTITY_LABEL: Record<RdmIdentity, string> = {
  submitter: '需求提出人',
  approver: '準入審批人',
  dispatcher: '技術負責人',
  product: '產品經理',
  developer: '研發工程師',
  tester: '測試工程師',
  acceptor: '業務驗收人',
  releaser: '發布負責人',
  projectMgr: '項目管理者',
}

/**
 * 主身份优先级。
 * <p>多身份者只有一组区块排在首屏最前，其余身份的区块往后追加。执行类角色（研发/测试/发布/验收）
 * 的工作对象最具体，因此排在聚合类角色之前；纯业务方落到 submitter。
 */
const IDENTITY_PRIORITY: RdmIdentity[] = [
  'developer', 'tester', 'releaser', 'acceptor', 'product', 'dispatcher', 'projectMgr', 'approver', 'submitter',
]

/** 前端可使用的权限探针（直接取 AuthContext 的同名方法，语义一致） */
export interface RdmAccessProbe {
  hasMenuPermission: (menuKey: string) => boolean
  hasPermission: (permission: string) => boolean
  /** sys_user.role=admin：后端代码直通全量，前端也按项目管理者看待 */
  isAdmin?: boolean
}

export interface IdentitySource {
  /** 后端 /rdm/workbench 下发的身份标签（服务端按权限判定，比自己猜可靠） */
  roleNames?: string[]
  access: RdmAccessProbe
  /** 当前是否真有「需求審批（我是審批人）」待办：审批人由 OA 流程指派决定，菜单权限推不出来 */
  hasApprovalTodo?: boolean
}

/** roleNames 是否命中某标签（兼容繁简，后端历史版本两种写法都出现过） */
function hasRoleLabel(roleNames: string[], traditional: string, simplified: string): boolean {
  return roleNames.some(name => name.includes(traditional) || name.includes(simplified))
}

/**
 * 推导当前登录人的工作身份。
 * <p>三个证据源按可靠性排序，缺任一个都不影响其余判定：
 * 1. 后端 roleNames —— 审批/产品/验收等由服务端权限矩阵判定，前端无法自行推导；
 * 2. 菜单权限 —— 研发/测试/发布是「有没有那个工作台」的直接事实；
 * 3. 待办存在性 —— 准入审批人是流程指派的，只有真的有待办才算这个身份。
 * <p>v3.13 之后分配权仍是 rdm-intake:edit（新锚点 rdm-requirement:dispatch 双轨过渡），
 * 所以两个锚点任一命中即认。
 */
export function deriveRdmIdentities(source: IdentitySource): RdmIdentity[] {
  const { access } = source
  const roleNames = source.roleNames ?? []
  const out = new Set<RdmIdentity>()

  // 提出人：提需求入口对所有登录用户开放，人人都是潜在提出人
  out.add('submitter')

  if (hasRoleLabel(roleNames, '項目經理', '项目经理') || access.isAdmin) out.add('projectMgr')
  if (hasRoleLabel(roleNames, '技術負責人', '技术负责人')
    || access.hasPermission('rdm-intake:edit')
    || access.hasPermission('rdm-requirement:dispatch')) out.add('dispatcher')
  if (hasRoleLabel(roleNames, '產品經理', '产品经理') || access.hasPermission('rdm-requirement:edit')) out.add('product')
  if (hasRoleLabel(roleNames, '業務驗收人', '业务验收人') || access.hasPermission('rdm-acceptance:create')) out.add('acceptor')
  if (access.hasMenuPermission('rdm-delivery-board')) out.add('developer')
  if (access.hasMenuPermission('rdm-delivery-test')) out.add('tester')
  if (access.hasMenuPermission('rdm-delivery-release')) out.add('releaser')
  if (source.hasApprovalTodo) out.add('approver')

  return IDENTITY_PRIORITY.filter(id => out.has(id))
}

/* ==================== 区块注册表 ==================== */

export type RdmSectionKey =
  | 'metrics'
  | 'delivery-metrics'
  | 'todo-board'
  | 'dev-tasks'
  | 'test-batches'
  | 'issues'
  | 'release-batches'
  | 'role-todos'
  | 'need-action'
  | 'my-projects'
  | 'my-tracking'
  | 'activity'

export interface RdmSectionMeta {
  key: RdmSectionKey
  /** 区块名，配置面板与面板标题共用 */
  label: string
  /** 一句话说明「给谁看什么」，配置面板展示，避免用户乱勾 */
  hint: string
  /** 哪些身份推荐该区块 */
  identities: RdmIdentity[]
  /** 需要持有的菜单权限；不满足则区块既不进推荐也不可选（不扩权） */
  menuKey?: string
}

/**
 * 区块清单：数组顺序 = 全部区块在配置面板里的默认展示顺序，
 * 也是「新区块上线时补到用户已保存布局」的插入基准。
 */
export const RDM_SECTIONS: readonly RdmSectionMeta[] = [
  {
    key: 'metrics',
    label: '需求指標',
    hint: '我提交/進行中/待處理/待驗收/逾期/已交付六項計數',
    identities: ['submitter', 'approver', 'dispatcher', 'product', 'acceptor', 'projectMgr'],
  },
  {
    key: 'dev-tasks',
    label: '我的研發任務',
    hint: '指派給我的任務，逾期與阻塞置頂',
    identities: ['developer'],
    menuKey: 'rdm-delivery-board',
  },
  {
    key: 'test-batches',
    label: '我的測試批次',
    hint: '與我相關的提測批次與執行進度',
    identities: ['tester'],
    menuKey: 'rdm-delivery-test',
  },
  {
    key: 'issues',
    label: '待閉環問題',
    hint: '與我相關的未解決/處理中/待驗證問題',
    identities: ['developer', 'tester', 'releaser'],
    menuKey: 'rdm-delivery-test',
  },
  {
    key: 'release-batches',
    label: '我的發布批次',
    hint: '與我相關的發布批次、部署進度與待裁決',
    identities: ['releaser', 'acceptor'],
    menuKey: 'rdm-delivery-release',
  },
  {
    key: 'delivery-metrics',
    label: '交付聚合指標',
    hint: '我參與項目數、待辦任務、交付項、近期到期',
    identities: ['developer', 'tester', 'releaser', 'projectMgr'],
  },
  {
    key: 'todo-board',
    label: '我的待辦',
    hint: '跨項目待辦，按我負責/等待他人/未指派分桶（已去重）',
    identities: IDENTITY_PRIORITY.filter(id => id !== 'submitter'),
  },
  {
    key: 'my-projects',
    label: '我的項目',
    hint: '我參與項目的交付項進度與阻塞',
    identities: ['dispatcher', 'product', 'developer', 'tester', 'releaser', 'projectMgr'],
    menuKey: 'rdm-dashboard-project',
  },
  {
    key: 'role-todos',
    label: '需求待辦分組',
    hint: '按角色拆分的需求待辦（審批/產品處理/驗收等）',
    identities: ['submitter', 'approver', 'dispatcher', 'product', 'acceptor', 'projectMgr'],
  },
  {
    key: 'need-action',
    label: '需要我補充',
    hint: '草稿/被駁回/掛起的需求，球在提出人手上',
    identities: ['submitter', 'approver'],
  },
  {
    key: 'my-tracking',
    label: '我的提交追蹤',
    hint: '我提的需求走到哪一步、誰在跟',
    identities: ['submitter', 'product', 'acceptor'],
  },
  {
    key: 'activity',
    label: '最近動態',
    hint: '與我相關需求的最新流轉記錄',
    identities: ['submitter', 'approver', 'dispatcher', 'product', 'projectMgr'],
  },
]

/** 身份 → 推荐区块顺序（首个身份为主模板，其余身份的区块往后追加） */
const ROLE_TEMPLATE: Record<RdmIdentity, readonly RdmSectionKey[]> = {
  // 提出人也得看「我的待辦」：三桶里的「等待他人」就是业务方追进度的依据
  submitter: ['metrics', 'need-action', 'todo-board', 'my-tracking', 'role-todos', 'activity'],
  approver: ['metrics', 'todo-board', 'role-todos', 'need-action', 'activity'],
  dispatcher: ['metrics', 'todo-board', 'role-todos', 'my-projects', 'activity'],
  product: ['metrics', 'todo-board', 'role-todos', 'my-projects', 'my-tracking'],
  developer: ['dev-tasks', 'delivery-metrics', 'todo-board', 'issues', 'my-projects', 'role-todos'],
  tester: ['test-batches', 'issues', 'delivery-metrics', 'todo-board', 'my-projects'],
  acceptor: ['release-batches', 'metrics', 'todo-board', 'role-todos', 'my-tracking'],
  releaser: ['release-batches', 'delivery-metrics', 'todo-board', 'issues', 'my-projects'],
  projectMgr: ['delivery-metrics', 'my-projects', 'metrics', 'todo-board', 'role-todos', 'activity'],
}

/* ==================== 布局计算与持久化 ==================== */

/** localStorage 键前缀：带版本号，布局结构演进时不解读旧数据 */
const STORAGE_PREFIX = 'rdm-workbench-layout:v1:'

interface StoredLayout {
  v: 1
  /** 全部候选区块的展示顺序（含已关闭的） */
  order: RdmSectionKey[]
  /** 被用户手动关闭的区块：不能被「新区块补齐」逻辑重新放出来 */
  dismissed: RdmSectionKey[]
}

const ALL_SECTION_KEYS = RDM_SECTIONS.map(s => s.key)

function isSectionKey(value: unknown): value is RdmSectionKey {
  return typeof value === 'string' && (ALL_SECTION_KEYS as string[]).includes(value)
}

function storageKey(empId: string | undefined): string | null {
  return empId ? `${STORAGE_PREFIX}${empId}` : null
}

/**
 * 读取个人布局。
 * <p>只认自己声明过的 key：版本升级/菜单改名留下的旧 key 直接丢弃，
 * 未知 key 若保留会让区块渲染查不到实现而整块空白。
 */
function readStored(empId: string | undefined): StoredLayout | null {
  const key = storageKey(empId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; order?: unknown; dismissed?: unknown }
    if (parsed?.v !== 1) return null
    const order = Array.isArray(parsed.order) ? parsed.order.filter(isSectionKey) : []
    const dismissed = Array.isArray(parsed.dismissed) ? parsed.dismissed.filter(isSectionKey) : []
    if (order.length === 0) return null
    return { v: 1, order, dismissed }
  } catch {
    return null
  }
}

function writeStored(empId: string | undefined, layout: StoredLayout): void {
  const key = storageKey(empId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // 隐私模式/配额写不进去：本次会话仍按内存里的布局工作，不报错打扰用户
  }
}

function clearStored(empId: string | undefined): void {
  const key = storageKey(empId)
  if (!key) return
  try {
    localStorage.removeItem(key)
  } catch {
    // 忽略
  }
}

/** 区块是否可访问：菜单权限是唯一门槛，与后端鉴权同源，不额外发明条件 */
export function isSectionAccessible(meta: RdmSectionMeta, access: RdmAccessProbe): boolean {
  if (!meta.menuKey) return true
  return access.hasMenuPermission(meta.menuKey)
}

/**
 * 按身份合成推荐布局。
 * <p>主身份模板在前，其余身份推荐的区块按模板顺序追加 —— 保证多身份者一次拿到全部工作对象，
 * 而不是只能看见其中一个角色的内容。
 * <p>没有被任何在持身份推荐的区块不会自动上屏，但仍可在配置面板里手动开启：
 * 「研发不必被业务方的提交追踪占屏」和「想看还是能加回来」两个诉求同时成立。
 */
export function recommendedLayout(identities: RdmIdentity[]): RdmSectionKey[] {
  const merged: RdmSectionKey[] = []
  for (const identity of identities) {
    for (const key of ROLE_TEMPLATE[identity] ?? []) {
      if (!merged.includes(key)) merged.push(key)
    }
  }
  return merged
}

export interface WorkbenchLayout {
  /** 当前登录人的工作身份（已按优先级排序） */
  identities: RdmIdentity[]
  /** 可见区块的渲染顺序 */
  visibleKeys: RdmSectionKey[]
  /** 可勾选的全部区块（= 有权限访问的区块），顺序即配置面板展示顺序 */
  candidates: readonly RdmSectionMeta[]
  /** 是否已偏离推荐布局（决定「恢复推荐」按钮是否可用） */
  customized: boolean
  toggle: (key: RdmSectionKey, visible: boolean) => void
  move: (key: RdmSectionKey, direction: -1 | 1) => void
  /** 清空个人布局，回到当前身份的推荐布局 */
  reset: () => void
}

/**
 * 个人工作台布局 Hook。
 * <p>合并规则（同时满足「新能力不静默丢失」和「用户关掉的不再弹回来」）：
 * - 无个人布局时直接按身份推荐；
 * - 有个人布局时沿用其顺序，只补「当前身份新推荐且未被用户关过」的区块；
 *   有权限但没被推荐的区块一律不自动上屏（那是用户没要的）。
 * <p>可访问集合每次渲染重算：管理员中途改授权后刷新页面即可反映，不必重新登录；
 * 计算量是个位数数组过滤，不缓存以免闭包拿到过期权限。
 * <p>持久化：优先从后端加载，后端不可用或返回空时回退 localStorage；
 * 保存时同时写后端和 localStorage，确保跨设备同步 + 离线可用。
 */
export function useRdmWorkbenchLayout(input: {
  empId?: string
  identities: RdmIdentity[]
  access: RdmAccessProbe
}): WorkbenchLayout {
  const { empId, identities, access } = input
  const [stored, setStored] = useState<StoredLayout | null>(() => readStored(empId))
  /** 标记首次加载（后端/localStorage）是否已完成，防止挂载时默认值覆盖云端数据 */
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 从后端加载布局（后端不可用时回退 localStorage）
  useEffect(() => {
    let cancelled = false
    fetchWorkbenchLayout().then((data) => {
      if (cancelled) return
      if (data && data.v === 1 && Array.isArray(data.order) && data.order.length > 0) {
        // 后端有数据，转换为 StoredLayout
        const order = data.order.filter(isSectionKey)
        const dismissed = (data.dismissed ?? []).filter(isSectionKey)
        if (order.length > 0) {
          setStored({ v: 1, order, dismissed })
          // 同时更新 localStorage 缓存
          writeStored(empId, { v: 1, order, dismissed })
        }
      }
      // 后端返回空或格式不对：保留 localStorage 里已加载的值（readStored 在 useState 初始化时已执行）
    }).catch(() => {
      // 后端不可用：localStorage 已在 useState 初始化时加载，无需额外处理
    }).finally(() => {
      if (!cancelled) loadedRef.current = true
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 保存布局到后端 + localStorage（防抖 1 秒）
  const persistToBackend = (next: StoredLayout) => {
    if (!loadedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const data: WorkbenchLayoutData = { v: 1, order: next.order, dismissed: next.dismissed }
      // 同时写 localStorage 作为离线缓存
      writeStored(empId, next)
      saveWorkbenchLayout(data).catch(() => { /* 后端不可用时仅保留 localStorage */ })
    }, 1000)
  }

  const candidates = RDM_SECTIONS.filter(meta => isSectionAccessible(meta, access))
  const allowed = candidates.map(meta => meta.key)
  const recommended = recommendedLayout(identities).filter(key => allowed.includes(key))

  let order: RdmSectionKey[]
  let dismissed: RdmSectionKey[]
  if (!stored) {
    order = [...recommended]
    dismissed = []
  } else {
    order = stored.order.filter(key => allowed.includes(key))
    dismissed = stored.dismissed.filter(key => allowed.includes(key))
    for (const key of recommended) {
      if (!order.includes(key) && !dismissed.includes(key)) order.push(key)
    }
  }

  const persist = (next: StoredLayout) => {
    setStored(next)
    writeStored(empId, next)
    persistToBackend(next)
  }

  const layout: WorkbenchLayout = {
    identities,
    visibleKeys: order.filter(key => !dismissed.includes(key)),
    candidates,
    customized: stored !== null,
    toggle: (key, visible) => persist({
      v: 1,
      // 开启过又关掉、或从未进过顺序的区块，都要先有位置才能排序
      order: order.includes(key) || !visible ? order : [...order, key],
      dismissed: visible ? dismissed.filter(item => item !== key) : [...dismissed, key],
    }),
    move: (key, direction) => {
      // 只在可见序列里换位：把已关闭的区块算进偏移会让用户点了没反应
      const visible = order.filter(key => !dismissed.includes(key))
      const from = visible.indexOf(key)
      const to = from + direction
      if (from < 0 || to < 0 || to >= visible.length) return
      const swapped = [...visible]
      const moved = swapped[to]
      swapped[to] = swapped[from]
      swapped[from] = moved
      let cursor = 0
      persist({
        v: 1,
        order: order.map(item => (dismissed.includes(item) ? item : swapped[cursor++])),
        dismissed,
      })
    },
    reset: () => {
      clearStored(empId)
      setStored(null)
      // 同时清空后端布局（写空对象，区别于 null 表示“同步过且已清空”）
      if (loadedRef.current) {
        saveWorkbenchLayout({ v: 1, order: [], dismissed: [] }).catch(() => {})
      }
    },
  }
  return layout
}
