/**
 * 員工AI權額管理 — Mock 數據
 * 列表頁 + 詳情頁共用，後續對接後端 API 時替換
 */
import dayjs from 'dayjs'
import type { PermissionSource, QuotaStatus, EmpModelPermission, EmpQuotaGrant, EmpPermissionSummary } from '../empPermission'
import { SOURCE_LABEL, SOURCE_TAG_COLOR, QUOTA_STATUS_LABEL, QUOTA_STATUS_COLOR, calcQuotaStatus } from '../empPermission'

// Re-export for consumers that import from this file
export type { PermissionSource, QuotaStatus, EmpModelPermission, EmpQuotaGrant, EmpPermissionSummary }
export { SOURCE_LABEL, SOURCE_TAG_COLOR, QUOTA_STATUS_LABEL, QUOTA_STATUS_COLOR, calcQuotaStatus }

/* ══════════ Mock 數據 ══════════ */

const MOCK_MODELS = [
  { id: 1, name: 'GPT-4o' },
  { id: 2, name: 'GPT-4o Mini' },
  { id: 3, name: 'Claude 3.5 Sonnet' },
  { id: 4, name: 'Gemini 1.5 Pro' },
  { id: 5, name: 'DeepSeek V3' },
  { id: 6, name: '通義千問 Max' },
  { id: 7, name: '文心一言 4.0' },
]

/** 部門樹節點 */
export interface DeptTreeNode { id: number; name: string; children?: DeptTreeNode[] }

/** Mock 部門（帶層級結構） */
export const MOCK_DEPT_TREE: DeptTreeNode[] = [
  {
    id: 1, name: '集團總部', children: [
      { id: 2, name: '技術部', children: [{ id: 5, name: '前端組' }, { id: 6, name: '後端組' }] },
      { id: 3, name: '運營部', children: [{ id: 7, name: '內容運營組' }, { id: 8, name: '用戶增長組' }] },
      { id: 4, name: '市場部', children: [{ id: 9, name: '品牌推廣組' }] },
      { id: 10, name: '財務部' },
      { id: 11, name: '人力資源部' },
      { id: 12, name: '產品部', children: [{ id: 13, name: 'AI產品組' }] },
    ],
  },
]

/** 扁平化部門（id → name 映射 + 路徑） */
export interface FlatDept { id: number; name: string; parentId: number | null; path: string }

export function flattenDepts(nodes: DeptTreeNode[], parentId: number | null = null, path = ''): FlatDept[] {
  const result: FlatDept[] = []
  for (const n of nodes) {
    const curPath = path ? `${path} > ${n.name}` : n.name
    result.push({ id: n.id, name: n.name, parentId, path: curPath })
    if (n.children?.length) result.push(...flattenDepts(n.children, n.id, curPath))
  }
  return result
}

/** 所有末級部門（有員工的） */
const LEAF_DEPTS = [
  { id: 5, name: '前端組' },
  { id: 6, name: '後端組' },
  { id: 7, name: '內容運營組' },
  { id: 8, name: '用戶增長組' },
  { id: 9, name: '品牌推廣組' },
  { id: 10, name: '財務部' },
  { id: 11, name: '人力資源部' },
  { id: 13, name: 'AI產品組' },
]

const MOCK_POSITIONS_WITH_LEVEL = [
  { position: '前端工程師', level: 'R3' },
  { position: '後端工程師', level: 'R4' },
  { position: '運營專員', level: 'P2' },
  { position: '市場經理', level: 'M3' },
  { position: '產品經理', level: 'P4' },
  { position: '數據分析師', level: 'R3' },
]

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const MOCK_UPDATERS = ['系統管理員', '張三', '李四', '王五', '趙六', '陳主管', '劉經理', '林組長']

function randDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function buildModelPerms(count: number): EmpModelPermission[] {
  const sources: PermissionSource[] = ['department', 'position', 'role', 'approval']
  const sourceDescs: Record<PermissionSource, string[]> = {
    department: ['技術部策略', '運營部策略', '市場部策略'],
    position: ['M5+ 職位策略', 'T3+ 職位策略', 'P4+ 職位策略'],
    role: ['開發者角色', '運營管理角色', '數據分析角色'],
    approval: ['申請單 AI202609070001', '申請單 AI202608150003', '申請單 AI202609010002'],
  }
  const shuffled = [...MOCK_MODELS].sort(() => Math.random() - 0.5).slice(0, count)
  return shuffled.map((m, i) => ({
    modelId: m.id,
    modelName: m.name,
    source: sources[i % sources.length],
    sourceDesc: randItem(sourceDescs[sources[i % sources.length]]),
    visionSupport: Math.random() > 0.3,
    functionCalling: Math.random() > 0.4,
    jsonMode: Math.random() > 0.5,
    streaming: Math.random() > 0.2,
    thinkingMode: Math.random() > 0.5,
    status: Math.random() > 0.1 ? 1 : 0,
    grantedAt: randDate(180),
  }))
}

function buildQuotaGrants(count: number): EmpQuotaGrant[] {
  const sources: PermissionSource[] = ['department', 'approval', 'role']
  const sourceDescs: Record<PermissionSource, string[]> = {
    department: ['技術部月度額度', '運營部月度額度', '全公司基礎額度'],
    position: [],
    role: ['開發者角色額度', '管理層角色額度'],
    approval: ['申請單 AI202609070001', '申請單 AI202608150003', '申請單 AI202609010002'],
  }
  return Array.from({ length: count }, (_, i) => {
    const src = sources[i % sources.length]
    const isToken = Math.random() > 0.4
    const value = isToken ? randInt(5, 100) * 1000 : randInt(100, 5000)
    const used = Math.floor(value * Math.random() * 1.05) // 可能超額
    const isTemporary = Math.random() > 0.6
    return {
      id: i + 1,
      source: src,
      sourceDesc: randItem(sourceDescs[src].length ? sourceDescs[src] : ['審批授予']),
      quotaType: isToken ? 'token' : 'request',
      quotaValue: value,
      quotaPeriod: Math.random() > 0.5 ? 'daily' : 'monthly',
      usedValue: used,
      effectiveType: isTemporary ? 'temporary' : 'permanent',
      effectiveAt: randDate(90),
      expireAt: isTemporary ? randDate(-60) : null,
      overLimitAction: randItem(['reject', 'approve', 'downgrade', null]),
      status: Math.random() > 0.15 ? 1 : 0,
      createdAt: randDate(180),
    }
  })
}

/** 生成 Mock 員工權限列表 */
export function fetchMockEmpPermissions(): Promise<EmpPermissionSummary[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const data: EmpPermissionSummary[] = Array.from({ length: 18 }, (_, i) => {
        const modelCount = randInt(2, 6)
        const quotaCount = randInt(1, 3)
        const modelPerms = buildModelPerms(modelCount)
        const quotaGrants = buildQuotaGrants(quotaCount)
        const leafDept = LEAF_DEPTS[i % LEAF_DEPTS.length]
        const posLevel = MOCK_POSITIONS_WITH_LEVEL[i % MOCK_POSITIONS_WITH_LEVEL.length]
        return {
          employeeId: 1001 + i,
          employeeName: ['張三', '李四', '王五', '趙六', '錢七', '孫八', '周九', '吳十',
            '鄭一', '陳二', '林小明', '黃美玲', '劉德華', '張學友', '黎明', '郭富城', '成龍', '洪金寶'][i],
          empId: `MF${String(1001 + i).padStart(5, '0')}`,
          department: leafDept.name,
          deptId: leafDept.id,
          position: posLevel.position,
          jobLevel: posLevel.level,
          modelCount,
          modelPermissions: modelPerms,
          quotaGrants,
          lastUpdatedBy: randItem(MOCK_UPDATERS),
          lastUpdatedAt: dayjs().subtract(randInt(0, 60), 'day').format('YYYY-MM-DD HH:mm:ss'),
        }
      })
      resolve(data)
    }, 400)
  })
}
