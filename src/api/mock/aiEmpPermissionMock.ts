/**
 * 員工AI權限 — Mock 數據
 * 列表頁 + 詳情頁共用，後續對接後端 API 時替換
 */

/* ══════════ 類型定義 ══════════ */

/** 授權來源 */
export type PermissionSource = 'department' | 'position' | 'role' | 'approval'

/** 授權來源標籤 */
export const SOURCE_LABEL: Record<PermissionSource, string> = {
  department: '部門配置',
  position: '職位配置',
  role: '角色配置',
  approval: '審批授予',
}

/** 授權來源 Tag 顏色 */
export const SOURCE_TAG_COLOR: Record<PermissionSource, string> = {
  department: 'blue',
  position: 'purple',
  role: 'cyan',
  approval: 'orange',
}

/** 模型權限項（單個模型對某員工的授權信息） */
export interface EmpModelPermission {
  modelId: number
  modelName: string
  source: PermissionSource
  /** 來源描述（如「技術部策略」「M5+ 職位策略」「申請單 AI202609070001」） */
  sourceDesc: string
  /** 能力開關 */
  visionSupport: boolean
  functionCalling: boolean
  jsonMode: boolean
  streaming: boolean
  thinkingMode: boolean
  /** 狀態：1=啟用 0=已禁用 */
  status: number
  /** 授權時間 */
  grantedAt: string
}

/** 額度記錄項 */
export interface EmpQuotaGrant {
  id: number
  source: PermissionSource
  sourceDesc: string
  quotaType: 'token' | 'request'
  quotaValue: number
  quotaPeriod: 'daily' | 'monthly'
  usedValue: number
  effectiveType: 'permanent' | 'temporary'
  effectiveAt: string
  expireAt: string | null
  overLimitAction: 'reject' | 'approve' | 'downgrade' | null
  status: number
  createdAt: string
}

/** 員工權限聚合記錄（列表頁一行） */
export interface EmpPermissionSummary {
  employeeId: number
  employeeName: string
  empId: string
  department: string
  position: string
  /** 可用模型數 */
  modelCount: number
  /** 模型權限列表（詳情頁用） */
  modelPermissions: EmpModelPermission[]
  /** 額度記錄列表 */
  quotaGrants: EmpQuotaGrant[]
  /** 最近授予時間 */
  lastGrantedAt: string
}

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

const MOCK_DEPTS = ['技術部', '運營部', '市場部', '財務部', '人力資源部', '產品部']
const MOCK_POSITIONS = ['前端工程師', '後端工程師', '運營專員', '市場經理', '產品經理', '數據分析師']

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

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
    const used = Math.floor(value * Math.random() * 0.8)
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
      status: Math.random() > 0.1 ? 1 : 0,
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
        const allDates = [...modelPerms.map((m) => m.grantedAt), ...quotaGrants.map((q) => q.createdAt)]
        allDates.sort().reverse()
        return {
          employeeId: 1001 + i,
          employeeName: ['張三', '李四', '王五', '趙六', '錢七', '孫八', '周九', '吳十',
            '鄭一', '陳二', '林小明', '黃美玲', '劉德華', '張學友', '黎明', '郭富城', '成龍', '洪金寶'][i],
          empId: `MF${String(1001 + i).padStart(5, '0')}`,
          department: MOCK_DEPTS[i % MOCK_DEPTS.length],
          position: MOCK_POSITIONS[i % MOCK_POSITIONS.length],
          modelCount,
          modelPermissions: modelPerms,
          quotaGrants,
          lastGrantedAt: allDates[0],
        }
      })
      resolve(data)
    }, 400)
  })
}
