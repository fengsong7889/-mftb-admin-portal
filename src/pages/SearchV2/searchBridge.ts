// 页面层桥接：把后端配置实体与 U1 原型的通用展示模型（PrototypeRecord）互转。
// 后端可达且有数据时以后端为真值；不可达时保留原型样例（离线可预览）。
// 说明：这是「原型 UI」到「实体契约」的视图模型映射，非算法；真实检索/生效仍属 B1（依赖 ES）。
// ads 域（搜索投流包/周期位）属 B3（财务/交付），本批不接后端，保持原型。
import {
  fetchGuidance, createGuidance, updateGuidance,
  fetchLexicon, createLexicon, updateLexicon,
  fetchScenario, createScenario, updateScenario,
  fetchIntervention, createIntervention, updateIntervention,
  fetchRelease, createRelease, approveIntervention, submitRelease, approveRelease,
  type SearchGuidanceItem, type SearchLexiconItem, type SearchScenarioItem,
  type SearchInterventionItem, type SearchReleaseItem,
} from '@/api/searchConfig'
import { STATUS, SCENE_LABEL, SEARCH_SCENES, type Pane, type PrototypeRecord, type PrototypeStatus, type SearchSceneCode } from './prototypeData'

/** 已接后端的配置面板（ads 属 B3 未接；overview/lab/analytics 非记录域）。 */
export const WIRED_PANES: Pane[] = ['guidance', 'lexicon', 'scenarios', 'interventions', 'releases']

const GUID_TYPE: Record<string, number> = { '底紋詞': 1, '自然熱搜': 2, '推廣搜索': 3, '候選熱詞': 4 }
const GUID_TYPE_L: Record<number, string> = { 1: '底紋詞', 2: '自然熱搜', 3: '推廣搜索', 4: '候選熱詞' }
const SOURCE_CODE: Record<string, number> = { '人工策劃': 1, '去重搜索趨勢': 2, '商業計劃': 3 }
const SOURCE_LABEL: Record<number, string> = { 1: '人工策劃', 2: '去重搜索趨勢', 3: '商業計劃' }
const REGION_CODE: Record<string, string | undefined> = { '全城': undefined, '澳門': 'MACAU', '氹仔': 'TAIPA' }
const REGION_LABEL: Record<string, string> = { MACAU: '澳門', TAIPA: '氹仔' }
const APPROVAL_CODE: Record<string, number> = { [STATUS.DRAFT]: 1, [STATUS.APPROVED]: 2, [STATUS.PAUSED]: 3 }
const APPROVAL_LABEL: Record<number, PrototypeStatus> = { 1: STATUS.DRAFT, 2: STATUS.APPROVED, 3: STATUS.PAUSED }
const LEX_TYPE: Record<string, number> = { '業務詞': 1, '實體別名': 2, '有向同義詞': 3, '糾錯詞': 4, '禁限詞': 5 }
const LEX_TYPE_L: Record<number, string> = { 1: '業務詞', 2: '實體別名', 3: '有向同義詞', 4: '糾錯詞', 5: '禁限詞' }
const ACTION_TYPE: Record<string, number> = { '泛詞降權': 1, '精確準入': 2, '臨時扶持': 3, '同集團打散': 4 }
const ACTION_TYPE_L: Record<number, string> = { 1: '泛詞降權', 2: '精確準入', 3: '臨時扶持', 4: '同集團打散' }
const REL_STATUS_L: Record<number, PrototypeStatus> = { 0: STATUS.DRAFT, 1: STATUS.REVIEW, 2: STATUS.APPROVED, 3: STATUS.SCHEDULED, 4: STATUS.LIVE, 5: STATUS.PAUSED, 6: STATUS.PAUSED }

function channelFrom(surface: number, biz?: number): SearchSceneCode {
  if (surface === 1) return SEARCH_SCENES.HOME
  if (surface === 3) return SEARCH_SCENES.STORE
  return biz === 2 ? SEARCH_SCENES.MARKET : biz === 3 ? SEARCH_SCENES.GROUPBUY : SEARCH_SCENES.DELIVERY
}
function surfaceFrom(channel: string): number {
  return channel === SEARCH_SCENES.HOME ? 1 : channel === SEARCH_SCENES.STORE ? 3 : 2
}
function bizFrom(channel: string): number | undefined {
  return channel === SEARCH_SCENES.DELIVERY ? 1 : channel === SEARCH_SCENES.MARKET ? 2 : channel === SEARCH_SCENES.GROUPBUY ? 3 : undefined
}
function regionOf(code?: string): string {
  return (code && REGION_LABEL[code]) || '全城'
}
function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(0, days - 1))
  return d.toISOString().slice(0, 10)
}
const TODAY = () => new Date().toISOString().slice(0, 10)
function daysBetween(start?: string, end?: string): number {
  if (!start || !end) return 7
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

// ── guidance ──
function guidanceToRecord(item: SearchGuidanceItem): PrototypeRecord {
  return {
    id: String(item.id), pane: 'guidance', name: item.configName ?? item.displayText,
    channel: channelFrom(item.surface, item.bizChannel), region: regionOf(item.regionCode),
    kind: GUID_TYPE_L[item.wordType] ?? '底紋詞',
    status: APPROVAL_LABEL[item.approvalStatus ?? 1] ?? STATUS.DRAFT,
    values: { text: item.displayText, target: item.targetQuery, priority: item.priority, source: SOURCE_LABEL[item.source ?? 1], start: item.startDate, end: item.endDate },
    updatedAt: item.updatedAt ? `後端 · ${item.updatedAt}` : '後端真值',
  }
}
function recordToGuidance(r: PrototypeRecord): SearchGuidanceItem {
  const v = r.values
  return {
    wordType: GUID_TYPE[r.kind] ?? 1, configName: r.name, displayText: String(v.text ?? r.name), targetQuery: String(v.target ?? v.text ?? r.name),
    brand: 'flashBee', surface: surfaceFrom(r.channel), bizChannel: bizFrom(r.channel), regionCode: REGION_CODE[r.region],
    priority: v.priority != null ? Number(v.priority) : 1, source: typeof v.source === 'string' ? SOURCE_CODE[v.source] : 1,
    startDate: v.start ? String(v.start) : undefined, endDate: v.end ? String(v.end) : undefined,
    approvalStatus: APPROVAL_CODE[r.status] ?? 1, status: 1,
  }
}

// ── lexicon ──
function lexiconToRecord(item: SearchLexiconItem): PrototypeRecord {
  return {
    id: String(item.id), pane: 'lexicon', name: item.entryName ?? `${item.sourceTerm} → ${item.targetTerm}`,
    channel: SEARCH_SCENES.ALL, region: '全城', kind: LEX_TYPE_L[item.wordType] ?? '業務詞',
    status: item.status === 2 ? STATUS.PAUSED : STATUS.LIVE,
    values: { source: item.sourceTerm, target: item.targetTerm, category: item.categoryId, evidence: item.evidence },
    updatedAt: item.updatedAt ? `後端 · ${item.updatedAt}` : '後端真值',
  }
}
function recordToLexicon(r: PrototypeRecord): SearchLexiconItem {
  const v = r.values
  return {
    wordType: LEX_TYPE[r.kind] ?? 1, entryName: r.name, sourceTerm: String(v.source ?? ''), targetTerm: String(v.target ?? ''),
    categoryId: v.category ? String(v.category) : undefined, brand: 'flashBee', evidence: v.evidence ? String(v.evidence) : '人工審核樣例', status: 1,
  }
}

// ── scenario ─
function scenarioToRecord(item: SearchScenarioItem): PrototypeRecord {
  return {
    id: String(item.id), pane: 'scenarios', name: item.scenarioName ?? `${SCENE_LABEL[channelFrom(item.surface, item.bizChannel)]}基準策略`,
    channel: channelFrom(item.surface, item.bizChannel), region: '全城', kind: '場景策略',
    status: item.status === 2 ? STATUS.PAUSED : STATUS.LIVE,
    values: { relevance: item.weightRelevance, quality: item.weightQuality, distance: item.weightDistance, heat: item.weightHeat, window: item.candidateWindow, ads: item.adLimitPerPage },
    updatedAt: item.updatedAt ? `後端 · ${item.updatedAt}` : '後端真值',
  }
}
function recordToScenario(r: PrototypeRecord): SearchScenarioItem {
  const v = r.values
  return {
    scenarioName: r.name,
    surface: surfaceFrom(r.channel), bizChannel: bizFrom(r.channel),
    weightRelevance: Number(v.relevance ?? 65), weightQuality: Number(v.quality ?? 15), weightDistance: Number(v.distance ?? 15), weightHeat: Number(v.heat ?? 5),
    candidateWindow: v.window != null ? Number(v.window) : 200, adLimitPerPage: Number(v.ads ?? 0), status: 1,
  }
}

// ── intervention ──
function interventionToRecord(item: SearchInterventionItem): PrototypeRecord {
  return {
    id: String(item.id), pane: 'interventions', name: item.ruleName ?? `${item.targetName ?? item.targetId} · ${ACTION_TYPE_L[item.actionType] ?? ''}`,
    channel: channelFrom(item.surface ?? 2, item.bizChannel), region: regionOf(item.regionCode), kind: ACTION_TYPE_L[item.actionType] ?? '泛詞降權',
    status: APPROVAL_LABEL[item.approvalStatus ?? 1] ?? STATUS.DRAFT,
    values: { merchant: item.targetName ?? item.targetId, terms: item.scopeTerms, factor: item.multiplier, days: daysBetween(item.startDate, item.endDate), reason: item.reason },
    updatedAt: item.updatedAt ? `後端 · ${item.updatedAt}` : '後端真值',
  }
}
function recordToIntervention(r: PrototypeRecord): SearchInterventionItem {
  const v = r.values
  const action = ACTION_TYPE[r.kind] ?? 1
  const noMultiplier = action === 2 || action === 4
  const days = v.days != null ? Number(v.days) : 7
  return {
    ruleName: r.name,
    // targetName 取“被干预对象名”，与上方 ruleName（规则名稱）语义不同；targetId 应存实体 ID 而暂仍取名称（已登记缺陷）
    targetType: 1, targetId: String(v.merchant ?? r.name), targetName: String(v.merchant ?? ''),
    actionType: action, scopeTerms: v.terms ? String(v.terms) : undefined, multiplier: noMultiplier ? 1 : Number(v.factor ?? 1),
    reason: String(v.reason ?? '流量治理'), startDate: TODAY(), endDate: todayPlus(days), approvalStatus: APPROVAL_CODE[r.status] ?? 1, status: 1,
  }
}

// ── release ──
function releaseToRecord(item: SearchReleaseItem): PrototypeRecord {
  return {
    id: String(item.id), pane: 'releases', name: item.releaseName ?? item.versionNo, channel: SEARCH_SCENES.ALL, region: '全城', kind: '配置版本',
    status: REL_STATUS_L[item.status ?? 0] ?? STATUS.DRAFT,
    values: { version: item.versionNo, changes: item.changeSummary, rollback: item.rollbackVersion },
    updatedAt: item.updatedAt ? `後端 · ${item.updatedAt}` : '後端真值',
  }
}
function recordToRelease(r: PrototypeRecord): SearchReleaseItem {
  const v = r.values
  return { versionNo: String(v.version ?? r.name), releaseName: r.name, changeSummary: String(v.changes ?? ''), rollbackVersion: String(v.rollback ?? '') }
}

const TO_RECORD: Record<string, (raw: never) => PrototypeRecord> = {
  guidance: guidanceToRecord as never, lexicon: lexiconToRecord as never, scenarios: scenarioToRecord as never,
  interventions: interventionToRecord as never, releases: releaseToRecord as never,
}
const FETCHERS: Record<string, () => Promise<unknown[]>> = {
  guidance: fetchGuidance, lexicon: fetchLexicon, scenarios: fetchScenario, interventions: fetchIntervention, releases: fetchRelease,
}

/** 拉取全部已接后端的配置域；仅返回成功响应的域（离线/失败的域不纳入，调用方保留其原型样例）。 */
export async function loadConfigPanes(): Promise<{ records: PrototypeRecord[]; responded: Pane[] }> {
  const results = await Promise.allSettled(
    WIRED_PANES.map(pane => FETCHERS[pane]().then(items => ({ pane, items }))),
  )
  const records: PrototypeRecord[] = []
  const responded: Pane[] = []
  for (const res of results) {
    if (res.status === 'fulfilled') {
      responded.push(res.value.pane)
      records.push(...(res.value.items as never[]).map(TO_RECORD[res.value.pane]))
    }
  }
  return { records, responded }
}

/** 保存配置记录到后端；成功返回后端 id 字符串，失败（不可用/校验拒绝）抛出交由调用方回退。 */
export async function saveConfigRecord(record: PrototypeRecord, pane: Pane, backendId?: string): Promise<string> {
  const isUpdate = backendId != null && /^\d+$/.test(backendId)
  const idNum = isUpdate ? Number(backendId) : undefined
  if (pane === 'guidance') {
    const p = recordToGuidance(record); return isUpdate ? (await updateGuidance(idNum!, p), backendId!) : String(await createGuidance(p))
  }
  if (pane === 'lexicon') {
    const p = recordToLexicon(record); return isUpdate ? (await updateLexicon(idNum!, p), backendId!) : String(await createLexicon(p))
  }
  if (pane === 'scenarios') {
    const p = recordToScenario(record); return isUpdate ? (await updateScenario(idNum!, p), backendId!) : String(await createScenario(p))
  }
  if (pane === 'interventions') {
    const p = recordToIntervention(record); return isUpdate ? (await updateIntervention(idNum!, p), backendId!) : String(await createIntervention(p))
  }
  // releases：仅新建草稿（提交/审批走独立端点，见 advanceStatus）
  return String(await createRelease(recordToRelease(record)))
}

/**
 * 审批流转真实落库：干预通过/驳回、发布送审/审批走各自端点（后端已测）。
 * 仅对已接后端且为数字 id 的记录生效；其余返回 false 由调用方回退本地演示。
 */
export async function advanceStatus(pane: Pane, backendId: string, target: PrototypeStatus): Promise<boolean> {
  if (!/^\d+$/.test(backendId)) return false
  const id = Number(backendId)
  try {
    if (pane === 'interventions' && target === STATUS.APPROVED) await approveIntervention(id, true)
    else if (pane === 'interventions' && target === STATUS.PAUSED) await approveIntervention(id, false)
    else if (pane === 'releases' && target === STATUS.REVIEW) await submitRelease(id)
    else if (pane === 'releases' && target === STATUS.APPROVED) await approveRelease(id)
    else return false
    return true
  } catch {
    return false
  }
}
