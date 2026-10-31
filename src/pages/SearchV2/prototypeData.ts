// U1 界面样例：只保存在组件内存，不是生产契约或搜索算法；界面确认后统一接 i18n。
export const PANES = [
  { key: 'overview', title: 'searchV2.pane.overview.title', subtitle: 'searchV2.pane.overview.subtitle', icon: 'DashboardOutlined' },
  { key: 'guidance', title: 'searchV2.pane.guidance.title', subtitle: 'searchV2.pane.guidance.subtitle', icon: 'CompassOutlined' },
  { key: 'lexicon', title: 'searchV2.pane.lexicon.title', subtitle: 'searchV2.pane.lexicon.subtitle', icon: 'BookOutlined' },
  { key: 'scenarios', title: 'searchV2.pane.scenarios.title', subtitle: 'searchV2.pane.scenarios.subtitle', icon: 'SlidersOutlined' },
  { key: 'interventions', title: 'searchV2.pane.interventions.title', subtitle: 'searchV2.pane.interventions.subtitle', icon: 'ControlOutlined' },
  { key: 'ads', title: 'searchV2.pane.ads.title', subtitle: 'searchV2.pane.ads.subtitle', icon: 'AimOutlined' },
  { key: 'lab', title: 'searchV2.pane.lab.title', subtitle: 'searchV2.pane.lab.subtitle', icon: 'ExperimentOutlined' },
  { key: 'analytics', title: 'searchV2.pane.analytics.title', subtitle: 'searchV2.pane.analytics.subtitle', icon: 'LineChartOutlined' },
  { key: 'releases', title: 'searchV2.pane.releases.title', subtitle: 'searchV2.pane.releases.subtitle', icon: 'BranchesOutlined' },
] as const
export type Pane = typeof PANES[number]['key']
export type RecordPane = Exclude<Pane, 'overview' | 'lab' | 'analytics'>
export const SCENES = [
  { value: 'home', label: '大首頁', description: '按頻道分組，不直接比較不同對象得分', query: '漢堡' },
  { value: 'delivery', label: '美食外賣', description: '商家卡與匹配菜品，強調配送與可售', query: '漢堡' },
  { value: 'market', label: '超市百貨', description: '商品卡與規格，強調價格和庫存', query: '紙巾' },
  { value: 'groupbuy', label: '團購到店', description: '套餐卡與適用門店，不使用配送門檻', query: '雙人餐' },
  { value: 'store', label: '店內搜索', description: '鎖定本店商品，不展示跨商家廣告', query: '漢堡' },
] as const
export type Scene = typeof SCENES[number]['value']
export const options = (labels: readonly string[]) => labels.map(value => ({ label: value, value }))
export const CHANNELS = ['全部場景', '大首頁', '美食外賣', '超市百貨', '團購到店', '店內搜索']
export const REGIONS = ['全城', '澳門', '氹仔']
export const STATUS = { DRAFT: '草稿', REVIEW: '待審核', APPROVED: '已批准', SCHEDULED: '待生效', LIVE: '生效示意', PAUSED: '已暫停' } as const
export type PrototypeStatus = typeof STATUS[keyof typeof STATUS]
export type DraftValues = Record<string, string | number | undefined>
export interface PrototypeRecord {
  id: string
  pane: RecordPane
  name: string
  channel: string
  region: string
  kind: string
  status: PrototypeStatus
  values: DraftValues
  updatedAt: string
}
export interface FieldDefinition {
  key: string
  label: string
  type?: 'number' | 'select' | 'date' | 'remark'
  options?: string[]
  required?: boolean
  min?: number
  max?: number
  initial?: string | number
  help?: string
}
export const KINDS: Record<RecordPane, string[]> = {
  guidance: ['底紋詞', '自然熱搜', '推廣搜索', '候選熱詞'],
  lexicon: ['業務詞', '實體別名', '有向同義詞', '糾錯詞', '禁限詞'],
  scenarios: ['場景策略'],
  interventions: ['泛詞降權', '精確准入', '臨時扶持', '同集團打散'],
  ads: ['搜索投流包', '推廣搜索週期位'],
  releases: ['配置版本'],
}
export const FIELD_SCHEMAS: Record<RecordPane, FieldDefinition[]> = {
  guidance: [
    { key: 'text', label: '展示詞', required: true },
    { key: 'target', label: '提交搜索詞', required: true, help: '點擊推薦詞才提交搜索；不支援任意外鏈。付費詞在獨立推廣區展示「廣告」。' },
    { key: 'priority', label: '展示次序', type: 'number', min: 1, max: 20, initial: 1 },
    { key: 'source', label: '候選來源', type: 'select', options: ['人工策劃', '去重搜索趨勢', '商業計劃'], initial: '人工策劃' },
    { key: 'start', label: '開始日期', type: 'date', required: true },
    { key: 'end', label: '結束日期', type: 'date', required: true },
  ],
  lexicon: [
    { key: 'source', label: '原詞／別名', required: true },
    { key: 'target', label: '標準詞／實體', required: true },
    { key: 'category', label: '適用類目', type: 'select', options: ['餐飲', '飲品', '日用品', '到店套餐'], initial: '餐飲' },
    { key: 'evidence', label: '來源依據', required: true, help: '別名需證明唯一實體歸屬；同義詞有方向，不以類目相近代替真正等價。' },
  ],
  scenarios: [
    { key: 'relevance', label: '相關性 R（%）', type: 'number', min: 60, max: 100, initial: 65 },
    { key: 'quality', label: '品質 Q（%）', type: 'number', min: 0, max: 40, initial: 15 },
    { key: 'distance', label: '距離 D（%）', type: 'number', min: 0, max: 40, initial: 15 },
    { key: 'heat', label: '熱度 H（%）', type: 'number', min: 0, max: 40, initial: 5 },
    { key: 'window', label: '候選窗口', type: 'number', min: 20, max: 200, initial: 200 },
    { key: 'ads', label: '首 20 張廣告上限', type: 'number', min: 0, max: 4, initial: 4 },
  ],
  interventions: [
    { key: 'merchant', label: '目標商家（虛構樣例）', type: 'select', options: ['示例星港漢堡集團', '示例南灣小廚', '示例海風生活超市'], required: true },
    { key: 'terms', label: '適用詞／精確准入詞', required: true, help: '精確准入只接受審核後的店名、品牌或唯一別名；泛詞如「漢堡」不能自動獲得豁免。' },
    { key: 'factor', label: '干預乘數 B', type: 'number', min: 0.3, max: 1.2, initial: 0.8 },
    { key: 'days', label: '有效天數', type: 'number', min: 1, max: 14, initial: 7 },
    { key: 'reason', label: '干預原因', type: 'remark', required: true },
  ],
  ads: [
    { key: 'merchant', label: '投放對象（虛構樣例）', type: 'select', options: ['示例南灣小廚', '示例海風生活超市', '示例氹仔雙人套餐'], required: true },
    { key: 'terms', label: '定向詞', required: true },
    { key: 'match', label: '匹配方式', type: 'select', options: ['精確關鍵詞', '真實供給自動匹配'], initial: '真實供給自動匹配' },
    { key: 'quota', label: '擬購曝光次數', type: 'number', min: 100, max: 100000, initial: 1000 },
    { key: 'daily', label: '每日投放上限', type: 'number', min: 1, max: 10000, initial: 100 },
    { key: 'slot', label: '資源位', type: 'select', options: ['搜索結果首屏', '搜索激活頁推廣區'], initial: '搜索結果首屏' },
    { key: 'start', label: '排期開始', type: 'date', required: true },
    { key: 'end', label: '排期結束', type: 'date', required: true },
    { key: 'negative', label: '排除詞' },
  ],
  releases: [
    { key: 'version', label: '擬發佈版本', required: true },
    { key: 'changes', label: '變更摘要', type: 'remark', required: true },
    { key: 'rollback', label: '兼容回退版本', required: true },
  ],
}

const record = (id: string, pane: RecordPane, name: string, channel: string, kind: string, values: DraftValues, status: PrototypeStatus = STATUS.DRAFT, region = '全城'): PrototypeRecord =>
  ({ id: `DEMO-${id}`, pane, name, channel, kind, values, status, region, updatedAt: '示例快照 · 未連接伺服器' })
const dates = { start: '2026-11-01', end: '2026-11-07' }
export function createSampleRecords(): PrototypeRecord[] {
  return [
    record('G01', 'guidance', '午餐想吃什麼', '美食外賣', '底紋詞', { text: '午餐想吃什麼', target: '午餐', priority: 1, source: '人工策劃', ...dates }, STATUS.APPROVED),
    record('G02', 'guidance', '紙巾日常補貨', '超市百貨', '自然熱搜', { text: '紙巾', target: '紙巾', priority: 2, source: '去重搜索趨勢', ...dates }, STATUS.REVIEW),
    record('G03', 'guidance', '週末雙人餐', '團購到店', '推廣搜索', { text: '週末雙人餐', target: '雙人餐', priority: 1, source: '商業計劃', ...dates }, STATUS.SCHEDULED, '氹仔'),
    record('G04', 'guidance', '下午茶趨勢候選', '美食外賣', '候選熱詞', { text: '奶茶', target: '奶茶', priority: 3, source: '去重搜索趨勢', ...dates }),
    record('L01', 'lexicon', '漢堡英文同義', '美食外賣', '有向同義詞', { source: 'burger', target: '漢堡', category: '餐飲', evidence: '商品品類詞表樣例' }, STATUS.APPROVED),
    record('L02', 'lexicon', '星港品牌別名', '美食外賣', '實體別名', { source: '星港', target: '示例星港漢堡集團', category: '餐飲', evidence: '虛構品牌唯一別名示例' }, STATUS.REVIEW),
    record('L03', 'lexicon', '紙巾錯詞候選', '超市百貨', '糾錯詞', { source: '紙斤', target: '紙巾', category: '日用品', evidence: '人工糾錯樣例' }),
    ...SCENES.map((s, i) => record(`S0${i + 1}`, 'scenarios', `${s.label}基準策略`, s.label, '場景策略', {
      relevance: [65, 65, 75, 70, 90][i], quality: [15, 15, 10, 15, 0][i], distance: [15, 15, 10, 10, 0][i], heat: [5, 5, 5, 5, 10][i], window: 200, ads: s.value === 'store' ? 0 : s.value === 'home' ? 2 : 4,
    }, STATUS.APPROVED)),
    record('I01', 'interventions', '星港泛詞流量均衡', '美食外賣', '泛詞降權', { merchant: '示例星港漢堡集團', terms: '漢堡、午餐', factor: 0.8, days: 7, reason: '流量集中度觀察實驗；不影響精確找店。' }, STATUS.REVIEW),
    record('I02', 'interventions', '品牌精確准入樣例', '美食外賣', '精確准入', { merchant: '示例星港漢堡集團', terms: '星港、星港漢堡', factor: 1, days: 14, reason: '僅用於展示精確詞與泛詞的差異。' }),
    record('A01', 'ads', '南灣午餐搜索投流', '美食外賣', '搜索投流包', { merchant: '示例南灣小廚', terms: '漢堡', match: '真實供給自動匹配', quota: 1000, daily: 100, consumed: 320, reserved: 12, slot: '搜索結果首屏', ...dates }, STATUS.APPROVED, '澳門'),
    record('A02', 'ads', '雙人餐週末推廣詞', '團購到店', '推廣搜索週期位', { merchant: '示例氹仔雙人套餐', terms: '雙人餐', match: '精確關鍵詞', slot: '搜索激活頁推廣區', ...dates }, STATUS.SCHEDULED, '氹仔'),
    record('R01', 'releases', '外賣相關性基準', '美食外賣', '配置版本', { version: 'DEMO-1.0', changes: '詞庫與自然排序基準；示例快照，不代表線上已載入。', rollback: 'DEMO-0.9' }, STATUS.LIVE),
    record('R02', 'releases', '搜索商業化首屏護欄', '全部場景', '配置版本', { version: 'DEMO-1.1', changes: '首張自然結果；顯式排序無廣告；精確找店保護。', rollback: 'DEMO-1.0' }, STATUS.REVIEW),
  ]
}

export function isPane(value: string): value is Pane { return PANES.some(pane => pane.key === value) }
export function isRecordPane(value: Pane): value is RecordPane { return value !== 'overview' && value !== 'lab' && value !== 'analytics' }
export function prototypeUrl(pane: Pane, view = 'list', id?: string): string {
  const query = new URLSearchParams({ prototype: 'search-v2', pane, view })
  if (id) query.set('id', id)
  return `/global-config?${query}`
}

/** 仅用于表单体验校验；不替代第二阶段后端的安全及业务校验。 */
export function validateDraft(pane: RecordPane, kind: string, values: DraftValues): string | undefined {
  if (pane === 'scenarios' && ['relevance', 'quality', 'distance', 'heat'].reduce((sum, key) => sum + Number(values[key] ?? 0), 0) !== 100) return '四項權重合計必須為 100%'
  if (values.start && values.end && String(values.start) > String(values.end)) return '結束日期不得早於開始日期'
  if (pane === 'interventions') {
    if (kind === '泛詞降權' && Number(values.factor) > 1) return '泛詞降權乘數不得超過 1'
    if (kind === '臨時扶持' && Number(values.factor) < 1) return '臨時扶持乘數不得低於 1'
    if (kind !== '精確准入' && Number(values.days) > 7) return '普通干預有效期不得超過 7 天'
    if (kind === '精確准入' && Number(values.days) > 14) return '精確准入有效期不得超過 14 天'
  }
  if (pane === 'lexicon' && values.source?.toString().trim() === values.target?.toString().trim()) return '原詞與標準詞不得相同'
}

export const SAMPLE_METRICS = [
  { id: 'M01', channel: '美食外賣', region: '澳門', query: '漢堡', searches: 2400, clicks: 1480, orders: 410, empty: 38, impressions: 520, revenue: 104 },
  { id: 'M02', channel: '超市百貨', region: '澳門', query: '紙巾', searches: 1260, clicks: 810, orders: 240, empty: 24, impressions: 210, revenue: 42 },
  { id: 'M03', channel: '團購到店', region: '氹仔', query: '雙人餐', searches: 980, clicks: 540, orders: 125, empty: 42, impressions: 160, revenue: 32 },
  { id: 'M04', channel: '美食外賣', region: '氹仔', query: '奶茶', searches: 1820, clicks: 1020, orders: 320, empty: 29, impressions: 360, revenue: 72 },
]
export const DEPENDENCIES = [
  ['ES 接入', '版本、Mapping、分析器、容量與只讀測試環境', '搜索／運維'],
  ['APP 契約', '目前查詢接口、五場景參數、舊版本兼容', 'APP／搜索'],
  ['供給資料', '門店、商品、套餐、位置、庫存與狀態版本', '交易／商戶'],
  ['投流交付', '有效曝光執行方、回執、配額與退款契約', '廣告／財務'],
  ['數據合規', '埋點口徑、留存、用戶排查授權與法務確認', '數據／法務'],
]
