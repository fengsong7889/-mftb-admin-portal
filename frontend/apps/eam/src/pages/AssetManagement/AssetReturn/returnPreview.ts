import dayjs from 'dayjs'

// 仅用于第一阶段交互验收，不是 API、持久化层或业务安全校验。
export const CONDITION = { normal: '正常', damaged: '损坏', lost: '遗失', unknown: '历史未记录' } as const
export const RETURN_STATUS = { completed: '正常完成', exception_pending: '异常处理中', exception_closed: '异常已结束' } as const
export const SOURCE = { claim: '领用归还', borrow: '借用归还', historical: '历史资产归还' } as const
export const PHYSICAL = { idle: '已收回 · 可使用', pending_disposal: '已收回 · 待处置', lost: '未收回 · 遗失', scrapped: '已登记报废', written_off: '遗失已核销' } as const
export const COMP_STATUS = { pending: '待定责', confirmed: '待收款', partially_paid: '部分收款', paid: '已收清', waived: '已免赔', refund_pending: '待退款' } as const
export const BORROW_STATUS = { borrowing: '借用中', overdue: '已逾期', returned: '已归还' } as const
export const CAUSE = { human: '人为原因', natural: '自然损耗', third_party: '第三方原因', quality: '质量问题' } as const
export const PARTY = { employee: '员工', third_party: '供应商 / 第三方', company: '公司承担' } as const
export type Condition = Exclude<keyof typeof CONDITION, 'unknown'>
export type SourceType = keyof typeof SOURCE
export interface Evidence { uid: string; name: string; url: string }
export interface PreviewAsset { id: number; assetNo: string; assetName: string }
export interface Candidate extends PreviewAsset {
  source: SourceType; sourceId?: number; sourceNo: string; holder: string; department: string; startDate: string
}
export interface PreviewBorrow extends PreviewAsset {
  id: number; assetId: number; borrowNo: string; holder: string; department: string; startDate: string; dueDate: string
  purpose: string; renewCount: number; returnId?: number; updatedAt: string; operator: string
}
export interface PreviewReturn extends PreviewAsset {
  id: number; assetId: number; returnNo: string; source: SourceType; sourceId?: number; sourceNo: string
  holder: string; department: string; returnUser: string; proxyReason?: string; historicalReason?: string
  date: string; condition: keyof typeof CONDITION; reason: string; location?: string
  physical: keyof typeof PHYSICAL; compensationId?: number; evidence: Evidence[]; operator: string; updatedAt: string
  recovered?: { date: string; condition: 'normal' | 'damaged'; reason: string; location: string; evidence: Evidence[] }
  disposal?: { date: string; result: string; reason: string; evidence: Evidence[] }
}
export interface PreviewCompensation extends PreviewAsset {
  id: number; assetId: number; compNo: string; returnId?: number; holder: string; damageType: 'damage' | 'loss'
  status: keyof typeof COMP_STATUS; amount: number; netPaid: number; reviewRequired: boolean
  cause?: keyof typeof CAUSE; party?: keyof typeof PARTY; responsible?: string; department?: string; basis?: string
  reason: string; operator: string; updatedAt: string
  payments: { id: number; type: 'payment' | 'refund'; amount: number; date: string; reason: string; evidence: Evidence[]; operator: string }[]
  reviews: { date: string; before: number; after: number; reason: string }[]
}
export interface PreviewState { returns: PreviewReturn[]; borrows: PreviewBorrow[]; compensations: PreviewCompensation[]; candidates: Candidate[]; idleAssets: PreviewAsset[] }
export const DEMO_EMPLOYEES = [
  { value: '林晓（演示）', label: '林晓 · E-DEMO-001', department: '运营部' },
  { value: '陈宇（演示）', label: '陈宇 · E-DEMO-002', department: '技术部' },
  { value: '周宁（演示）', label: '周宁 · E-DEMO-003', department: '行政部' },
]
export const DEMO_DEPARTMENTS = [{ title: '演示公司', value: 'company', selectable: false, children: ['运营部', '技术部', '行政部'].map(value => ({ title: value, value })) }]
export const DEMO_LOCATIONS = ['澳门仓 · A区', '氹仔仓 · B区', '检测暂存区'].map(value => ({ label: value, value }))
export const options = (meta: Record<string, string>) => Object.entries(meta).map(([value, label]) => ({ value, label }))
export const today = () => dayjs().format('YYYY-MM-DD')
const daysAgo = (days: number) => dayjs().subtract(days, 'day').format('YYYY-MM-DD')
export const money = (value: number) => `MOP ${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const previewUrl = (path: string, query: Record<string, string | number> = {}) => `${path}?${new URLSearchParams({ preview: '1', ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) })}`

export function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : undefined
}
export function sourceParameterError(params: URLSearchParams): string | undefined {
  const keys = ['claimId', 'borrowId', 'assetId'].filter(key => params.has(key))
  if (keys.length > 1) return '来源参数冲突，请只指定一个领用单、借用单或资产。'
  if (keys.some(key => params.getAll(key).length !== 1 || parseId(params.get(key)) == null)) return '来源 ID 无效，请从来源列表重新进入。'
  if (keys.length && params.get('preview') !== '1') return '此入口指向真实业务记录。界面验收阶段尚未接通来源查询，不使用演示数据替代该记录。'
}
export function borrowStatus(b: PreviewBorrow): keyof typeof BORROW_STATUS {
  return b.returnId ? 'returned' : b.dueDate < today() ? 'overdue' : 'borrowing'
}
export function returnStatus(r: PreviewReturn, c?: PreviewCompensation): keyof typeof RETURN_STATUS {
  if (r.condition === 'normal' || r.condition === 'unknown') return 'completed'
  const physicalClosed = ['idle', 'scrapped', 'written_off'].includes(r.physical)
  return physicalClosed && c && !c.reviewRequired && ['paid', 'waived'].includes(c.status) ? 'exception_closed' : 'exception_pending'
}
export function compensationStatus(amount: number, netPaid: number): keyof typeof COMP_STATUS {
  if (netPaid > amount) return 'refund_pending'
  if (amount === 0) return 'waived'
  if (netPaid === amount) return 'paid'
  return netPaid > 0 ? 'partially_paid' : 'confirmed'
}
export function createPreviewState(): PreviewState {
  const assets = ['MacBook Pro 14', '便携投影仪', '办公显示器', 'iPad Air', '办公笔记本', '条码扫描器', '会议摄像头', '备用平板'].map((assetName, index) => ({ id: 9001 + index, assetNo: `DEMO-ZC-${String(index + 1).padStart(3, '0')}`, assetName }))
  const candidates: Candidate[] = [
    { ...assets[0], source: 'claim', sourceId: 101, sourceNo: 'DEMO-LY-0101', holder: DEMO_EMPLOYEES[0].value, department: '运营部', startDate: daysAgo(20) },
    { ...assets[1], source: 'borrow', sourceId: 201, sourceNo: 'DEMO-JY-0201', holder: DEMO_EMPLOYEES[1].value, department: '技术部', startDate: daysAgo(10) },
    { ...assets[2], source: 'historical', sourceNo: '无有效来源 · 历史在用资产', holder: '', department: '行政部', startDate: daysAgo(60) },
  ]
  const returns: PreviewReturn[] = [
    { ...assets[3], id: 301, assetId: assets[3].id, returnNo: 'DEMO-GH-0301', source: 'borrow', sourceId: 202, sourceNo: 'DEMO-JY-0202', holder: DEMO_EMPLOYEES[0].value, department: '运营部', returnUser: DEMO_EMPLOYEES[2].value, proxyReason: '出差，由同事代还', date: daysAgo(2), condition: 'normal', reason: '项目结束', location: '澳门仓 · A区', physical: 'idle', evidence: [], operator: '演示验收员', updatedAt: daysAgo(2) },
    { ...assets[4], id: 302, assetId: assets[4].id, returnNo: 'DEMO-GH-0302', source: 'claim', sourceId: 102, sourceNo: 'DEMO-LY-0102', holder: DEMO_EMPLOYEES[1].value, department: '技术部', returnUser: DEMO_EMPLOYEES[1].value, date: daysAgo(1), condition: 'damaged', reason: '屏幕破裂，待检测确认原因', location: '检测暂存区', physical: 'pending_disposal', compensationId: 401, evidence: [], operator: '演示验收员', updatedAt: daysAgo(1) },
    { ...assets[5], id: 303, assetId: assets[5].id, returnNo: 'DEMO-GH-0303', source: 'claim', sourceId: 103, sourceNo: 'DEMO-LY-0103', holder: DEMO_EMPLOYEES[2].value, department: '行政部', returnUser: DEMO_EMPLOYEES[2].value, date: daysAgo(3), condition: 'lost', reason: '外勤途中遗失，未收回实物', physical: 'lost', compensationId: 402, evidence: [], operator: '演示验收员', updatedAt: daysAgo(3) },
  ]
  const borrows: PreviewBorrow[] = [
    { ...assets[1], id: 201, assetId: assets[1].id, borrowNo: 'DEMO-JY-0201', holder: DEMO_EMPLOYEES[1].value, department: '技术部', startDate: daysAgo(10), dueDate: daysAgo(2), purpose: '活动演示', renewCount: 0, updatedAt: daysAgo(10), operator: '演示登记员' },
    { ...assets[3], id: 202, assetId: assets[3].id, borrowNo: 'DEMO-JY-0202', holder: DEMO_EMPLOYEES[0].value, department: '运营部', startDate: daysAgo(12), dueDate: daysAgo(1), purpose: '门店培训', renewCount: 1, returnId: 301, updatedAt: daysAgo(2), operator: '演示登记员' },
  ]
  const compensations: PreviewCompensation[] = returns.filter(r => r.compensationId).map(r => ({
    id: r.compensationId!, assetId: r.assetId, assetNo: r.assetNo, assetName: r.assetName, compNo: `DEMO-PF-${r.compensationId}`, returnId: r.id, holder: r.holder, damageType: r.condition === 'lost' ? 'loss' : 'damage',
    status: r.id === 303 ? 'partially_paid' : 'pending', amount: r.id === 303 ? 80000 : 0, netPaid: r.id === 303 ? 30000 : 0, reviewRequired: false, reason: r.reason, operator: r.operator, updatedAt: r.updatedAt,
    ...(r.id === 303 ? { party: 'employee' as const, responsible: r.holder, cause: 'human' as const, basis: '折旧价值' } : {}),
    payments: r.id === 303 ? [{ id: 1, type: 'payment', amount: 30000, date: daysAgo(2), reason: '演示首笔收款', evidence: [], operator: '演示收款员' }] : [], reviews: [],
  }))
  return { returns, borrows, compensations, candidates, idleAssets: assets.slice(6) }
}
let state = createPreviewState()
const listeners = new Set<() => void>()
export const getPreviewState = () => state
export const subscribePreview = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function updatePreview(update: (current: PreviewState) => PreviewState) {
  state = update(state)
  listeners.forEach(listener => listener())
}
export function resetPreview() { state = createPreviewState(); listeners.forEach(listener => listener()) }
export const nextPreviewId = (records: { id: number }[]) => Math.max(1000, ...records.map(r => r.id)) + 1

export interface ReturnDraft {
  candidate: Candidate; date: string; condition: Condition; returnUser: string; holder: string; proxyReason?: string
  historicalReason?: string; reason: string; location?: string; evidence: Evidence[]; operator: string
}
export function addPreviewReturn(draft: ReturnDraft): number {
  const id = nextPreviewId(state.returns)
  const compensationId = draft.condition !== 'normal' ? nextPreviewId(state.compensations) : undefined
  const record: PreviewReturn = {
    ...draft.candidate, id, assetId: draft.candidate.id, returnNo: `DEMO-GH-${id}`, holder: draft.holder, returnUser: draft.returnUser,
    proxyReason: draft.proxyReason, historicalReason: draft.historicalReason, date: draft.date, condition: draft.condition,
    reason: draft.reason, location: draft.condition === 'lost' ? undefined : draft.location, evidence: draft.evidence,
    physical: draft.condition === 'normal' ? 'idle' : draft.condition === 'lost' ? 'lost' : 'pending_disposal',
    compensationId, operator: draft.operator, updatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  }
  updatePreview(s => ({
    ...s, returns: [record, ...s.returns], candidates: s.candidates.filter(c => c.id !== draft.candidate.id),
    borrows: s.borrows.map(b => record.source === 'borrow' && b.id === record.sourceId ? { ...b, returnId: id, updatedAt: record.updatedAt } : b),
    compensations: compensationId ? [{ id: compensationId, assetId: record.assetId, assetNo: record.assetNo, assetName: record.assetName,
      compNo: `DEMO-PF-${compensationId}`, returnId: id, holder: record.holder, damageType: record.condition === 'lost' ? 'loss' : 'damage',
      status: 'pending', amount: 0, netPaid: 0, reviewRequired: false, reason: record.reason, operator: record.operator, updatedAt: record.updatedAt, payments: [], reviews: [] }, ...s.compensations] : s.compensations,
  }))
  return id
}
