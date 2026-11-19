/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/* 投流配置公式试算的纯逻辑层（与试算弹层组件分离，对齐自然流量 organicTrafficConfig 的分层惯例）。
 * 只做演示计算，不写库、不替代后端重验。 */

export interface SimRow { label: string; a: number; b: number }

export interface TagScore { label: string; score: number }

/** 样例标签名代替标准标签 ID；重复行取最高有效分，不重复计覆盖、不叠加分值。 */
function selectedTags(tags: TagScore[], minimum: number): Map<string, number> {
  const scores = new Map<string, number>()
  for (const tag of tags) {
    const id = tag.label.normalize('NFKC').trim()
    if (!id || !Number.isFinite(tag.score) || tag.score <= 0 || tag.score < minimum) continue
    scores.set(id, Math.max(scores.get(id) ?? 0, tag.score))
  }
  return scores
}

/** 两侧独立过门槛，覆盖率用交集；相似度使用并集维度，单侧不存在或不达标时补零。 */
export function matchOf(user: TagScore[], merchant: TagScore[], uMin: number, mMin: number) {
  const userSelected = selectedTags(user, uMin)
  const merchantSelected = selectedTags(merchant, mMin)
  const coveredLabels = [...userSelected.keys()].filter(id => merchantSelected.has(id))
  const rows: SimRow[] = [...new Set([...userSelected.keys(), ...merchantSelected.keys()])]
    .map(label => ({ label, a: merchantSelected.get(label) ?? 0, b: userSelected.get(label) ?? 0 }))
  return { userSelCount: userSelected.size, merchantSelCount: merchantSelected.size,
    coveredCount: coveredLabels.length, coveredLabels, coldStart: userSelected.size === 0,
    coverage: computeCoverage(coveredLabels.length, userSelected.size), rows }
}

/** 覆盖率＝覆盖数÷用户达标偏好标签总数（百分数）；分母 0 记 0，封顶 100。 */
export function computeCoverage(covered: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, (covered / total) * 100)
}

/** 衰减：steps=floor(t/decayDays)，score=max(0, initial−steps×decayPoints)。 */
export function computeDecay(initial: number, t: number, decayDays: number, decayPoints: number) {
  const steps = decayDays > 0 ? Math.floor(t / decayDays) : 0
  return { steps, score: Math.max(0, initial - steps * decayPoints) }
}

/** 相似度中间量与两族结果；rows 为参与计算的标签向量（调用方先按门槛过滤）。 */
export function computeSimilarity(rows: SimRow[], metric: string) {
  const dot = rows.reduce((s, r) => s + r.a * r.b, 0)
  const sumA2 = rows.reduce((s, r) => s + r.a * r.a, 0)
  const sumB2 = rows.reduce((s, r) => s + r.b * r.b, 0)
  const sumMin = rows.reduce((s, r) => s + Math.min(r.a, r.b), 0)
  const sumMax = rows.reduce((s, r) => s + Math.max(r.a, r.b), 0)
  const denom = Math.sqrt(sumA2) * Math.sqrt(sumB2)
  const cosine = denom > 0 ? dot / denom : 0
  const jaccard = sumMax > 0 ? sumMin / sumMax : 0
  return { dot, sumA2, sumB2, sumMin, sumMax, cosine, jaccard, value: metric === 'weightedJaccard' ? jaccard : cosine }
}

export interface RankNorms { match: number; traffic: number; quality: number; distance: number; remaining: number }
export interface RankInput { match: number; remaining: number; total: number; quality: number; distance: number; qualityKnown?: boolean }
/** 自定义因子归一；剩余次数单独保留，消费预设不能误用比例或冷启动的方向。
 * 暂无评分不获得质量加分（记0），但不被过滤——付费资格与评分解耦。 */
export function normalizeRank(raw: RankInput, maxDistance: number): RankNorms {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return {
    match: clamp(raw.match), remaining: raw.remaining,
    traffic: raw.total > 0 ? clamp(raw.remaining / raw.total) : 0,
    quality: raw.qualityKnown === false ? 0 : clamp(raw.quality / 5),
    distance: maxDistance > 0 ? 1 - clamp(raw.distance / maxDistance) : 0,
  }
}
/** 消耗优先按绝对剩余次数降序；自定义空选或非法选项不生成误导性的默认得分。 */
export function rankScore(preset: string, factors: string[], n: RankNorms): number | null {
  if (preset === 'matchFirst') return n.match
  if (preset === 'consumeFirst') return n.remaining
  if (preset !== 'custom' || !factors.length || factors.some(f => !['match', 'traffic', 'quality', 'distance'].includes(f))) return null
  const selected = [...new Set(factors)] as Array<'match' | 'traffic' | 'quality' | 'distance'>
  return selected.reduce((sum, factor) => sum + n[factor], 0) / selected.length
}

/** 无新增计数的天数单独计时，不被衰减任务更新时间重置；原始订单历史不删除。 */
export function decayState(initial: number, elapsed: number, period: number, points: number, idleDays: number, clearDays: number | null, minimum: number) {
  const decayed = computeDecay(initial, elapsed, period, points)
  const expired = clearDays !== null && clearDays > 0 && idleDays >= clearDays
  const score = expired ? 0 : decayed.score
  return { ...decayed, score, expired, qualified: score > 0 && score >= minimum }
}

export interface TrialMerchant { id: string; name: string; tags: TagScore[]; remaining: number; total: number; quality: number; distance: number; qualityKnown?: boolean; paid: boolean; category?: string }
export interface TrialSettings {
  userMinimum: number; merchantMinimum: number; coverageMinimum: number; metric: string;
  qualityPreference?: { enabled: boolean; line: number }; preset: string; factors: string[]; tieRule: string; direction: string; maxDistance: number
  /** 冷启动勾选维度（集合语义、无优先级）：距离/流量归一等权综合分，质量软优选；不传默认距离＋流量。 */
  coldStartDimensions?: readonly string[]
  /** 示例中由调用方给定的已展示/频控排除集合，不模拟真实计数。 */
  excludedMerchantIds?: readonly string[]
}

/** 两场景共用资格检查；样例必须明确标记已购本广告，不能把缺失资格当作已购。 */
function merchantExclusion(m: TrialMerchant, settings: TrialSettings): string {
  if (!m.id || ![m.remaining, m.total, m.distance].every(Number.isFinite) || m.total <= 0 || m.remaining < 0 || m.remaining > m.total || m.distance < 0
    || (m.qualityKnown !== false && (!Number.isFinite(m.quality) || m.quality < 0 || m.quality > 5))) return '样例数据无效'
  if (m.paid !== true) return '未购本广告，仅自然层可考虑'
  if (m.remaining === 0) return '剩余曝光次数已耗尽'
  if (!Number.isFinite(settings.maxDistance) || m.distance > settings.maxDistance) return '超出示例最大直线距离'
  if (settings.excludedMerchantIds?.includes(m.id)) return '已在本次排除集合中（已展示或频控）'
  return ''
}

const slotCount = (count: number) => Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0

/** 冷启动层内软优选分组：启用且已评分达线者先，其余合格者后；不跨层、不作硬准入。 */
function coldQualityGroup(m: TrialMerchant, pref?: { enabled: boolean; line: number }): number {
  return pref?.enabled && m.qualityKnown !== false && m.quality >= pref.line ? 0 : 1
}

/** 兴趣匹配局部试算，返回过程与排除原因；不会假装已模拟时段、真实支付资格或曝光计数。
 * 质量不再硬过滤；覆盖率关闭时仍须至少一个共同达标标签。 */
export function evaluateInterestTrial(user: TagScore[], merchants: TrialMerchant[], settings: TrialSettings) {
  const results = merchants.map(m => {
    const match = matchOf(user, m.tags, settings.userMinimum, settings.merchantMinimum)
    const sim = computeSimilarity(match.rows, settings.metric)
    const norm = normalizeRank({ ...m, match: sim.value }, settings.maxDistance)
    const score = match.coldStart ? 0 : rankScore(settings.preset, settings.factors, norm)
    let reason = merchantExclusion(m, settings)
    if (reason) { /* 资格不通过时，不用标签或评分原因覆盖它。 */ }
    else if (!match.coldStart && match.coveredCount === 0) reason = '没有双方达标的共同标签'
    else if (!match.coldStart && settings.coverageMinimum > 0 && match.coverage < settings.coverageMinimum) reason = '未达到最低覆盖比例'
    else if (score === null) reason = '排序策略未配置有效因子'
    return { m, match, sim, norm, score, reason, admitted: reason === '' }
  })
  // 冷启动综合分：勾选的距离/流量归一后等权平均；最大余量取本轮合格候选，避免被排除商家拉偏尺度。
  if (results.some(r => r.match.coldStart)) {
    const dims = settings.coldStartDimensions ?? ['distance', 'remainingTraffic']
    const maxRemaining = Math.max(0, ...results.filter(r => r.admitted).map(r => r.m.remaining))
    for (const r of results) {
      if (!r.match.coldStart) continue
      const parts: number[] = []
      if (dims.includes('distance')) parts.push(r.norm.distance)
      if (dims.includes('remainingTraffic')) {
        const ratio = maxRemaining > 0 ? Math.min(1, r.m.remaining / maxRemaining) : 0
        parts.push(settings.direction === 'lessFirst' ? 1 - ratio : ratio)
      }
      r.score = parts.length > 0 ? parts.reduce((s, x) => s + x, 0) / parts.length : 0
    }
  }
  const ranked = results.filter(r => r.admitted).sort((a, b) => {
    if (a.match.coldStart) {
      return coldQualityGroup(a.m, settings.qualityPreference) - coldQualityGroup(b.m, settings.qualityPreference)
        || (b.score ?? 0) - (a.score ?? 0)
    }
    return (b.score ?? 0) - (a.score ?? 0) || tieBreakOrder(a.m, b.m, settings.tieRule, 'moreFirst')
  })
  return { results, ranked, rejected: results.filter(r => !r.admitted) }
}

/** purchased 为已过滤取消/全额退款的有效消费者成交商家 ID 集合，非广告销售订单。 */
export interface Neighbor { id: string; tags: TagScore[]; purchased: string[] }
export const MAX_NEIGHBORS = 20
/** 标签找邻居：用户×用户同门槛完整向量；排除零相似/未达门槛；取前 MAX_NEIGHBORS。
 * CF(u,m)=Σ sim(u,v)·I(v成交m) ÷ Σ sim(u,v)；同一邻居对同一商家只计一次支持。 */
export function collaborativeScores(user: TagScore[], neighbors: Neighbor[], opts: { currentUserId: string; userMinimum: number; metric: string; threshold: number }) {
  // 先按消费者 ID 去重、排除本人，再取邻居；重复记录不能占用多个邻居名额或支持票。
  const unique = new Map<string, Neighbor>()
  for (const n of neighbors) if (n.id && n.id !== opts.currentUserId && !unique.has(n.id)) unique.set(n.id, n)
  const valid = Boolean(opts.currentUserId) && Number.isFinite(opts.threshold) && opts.threshold >= 1 && opts.threshold <= 100
  const sims = (valid ? [...unique.values()] : [])
    .map(n => ({ n, sim: computeSimilarity(matchOf(user, n.tags, opts.userMinimum, opts.userMinimum).rows, opts.metric).value }))
    .filter(x => x.sim > 0 && x.sim * 100 + 1e-10 >= opts.threshold)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, MAX_NEIGHBORS)
  const denom = sims.reduce((s, x) => s + x.sim, 0)
  const acc = new Map<string, { num: number; support: number }>()
  for (const x of sims) for (const store of new Set(x.n.purchased)) {
    if (!store) continue
    const e = acc.get(store) ?? { num: 0, support: 0 }
    e.num += x.sim; e.support += 1; acc.set(store, e)
  }
  return { neighbors: sims, denom,
    scores: [...acc.entries()].map(([store, e]) => ({ store, cf: denom > 0 ? e.num / denom : 0, support: e.support })).sort((a, b) => b.cf - a.cf) }
}

export type TrialSource = 'direct' | 'coldStart' | 'merchantSimilar' | 'userSimilar' | 'sameCategory'
export interface TrialCandidate { m: TrialMerchant; source: TrialSource; matchScore: number | null; score: number }

function uniqueCandidates(items: TrialCandidate[]): TrialCandidate[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.m.id)) return false
    seen.add(item.m.id)
    return true
  })
}

/** 来源内按当前排序配置算分，来源间绝不把 CF 和商家相似度混成同一个排行榜。 */
function rankSource(items: Array<{ m: TrialMerchant; matchScore: number | null }>, source: TrialSource, settings: TrialSettings): TrialCandidate[] {
  return uniqueCandidates(items.flatMap(({ m, matchScore }) => {
    const norm = normalizeRank({ ...m, match: matchScore ?? 0 }, settings.maxDistance)
    const score = rankScore(settings.preset, settings.factors, norm)
    return score === null ? [] : [{ m, source, matchScore, score }]
  }).sort((a, b) => b.score - a.score || tieBreakOrder(a.m, b.m, settings.tieRule, 'moreFirst')))
}

interface CollaborativeTrialInput {
  currentUserId: string; user: TagScore[]; neighbors: Neighbor[]; merchants: TrialMerchant[]
}
export interface MatchingTrialSettings extends TrialSettings {
  userSimilarEnabled: boolean; userSimilarThreshold: number; availableSlots: number
  /** fill＝直接匹配优先、协同只补缺口；ratio＝协同预留本广告坑位的固定比例（向下取整）。 */
  mode: string; ratio: number
}

/** 普通投流：先直接匹配，仅有缺口时尝试协同；无用户标签走冷启动，不套用点击后两家上限。
 * 调用方输入同一可用区域/餐段的商家集合；本函数不模拟跨时段补齐或自然流执行。 */
export function evaluateMatchingTrial(opts: CollaborativeTrialInput & { settings: MatchingTrialSettings }) {
  const { settings } = opts
  const direct = evaluateInterestTrial(opts.user, opts.merchants, settings)
  const coldStart = selectedTags(opts.user, settings.userMinimum).size === 0
  const limit = slotCount(settings.availableSlots)
  const primary = uniqueCandidates(direct.ranked.map(r => ({ m: r.m,
    source: coldStart ? 'coldStart' : 'direct', matchScore: coldStart ? null : r.sim.value, score: r.score ?? 0 })))
  // 比例模式即使直接匹配充足也要为协同预留配额；fill 模式仅在有缺口时计算协同。
  const cfNeeded = settings.userSimilarEnabled && !coldStart && (settings.mode === 'ratio' || primary.length < limit)
  const cf = cfNeeded ? collaborativeScores(opts.user, opts.neighbors, {
    currentUserId: opts.currentUserId, userMinimum: settings.userMinimum, metric: settings.metric, threshold: settings.userSimilarThreshold,
  }) : null
  const scores = new Map(cf?.scores.map(s => [s.store, s.cf]) ?? [])
  const collabPool = rankSource(opts.merchants
    .filter(m => !merchantExclusion(m, settings) && (scores.get(m.id) ?? 0) > 0)
    .map(m => ({ m, matchScore: scores.get(m.id)! })), 'userSimilar', settings)
  // 比例预留：协同先占配额（向下取整），直接匹配填其余；任一路不足时名额回补另一路，不浪费坑位。
  const quota = settings.mode === 'ratio' && cf ? Math.floor(limit * settings.ratio / 100) : 0
  let selCollab: TrialCandidate[]
  let selDirect: TrialCandidate[]
  if (quota > 0) {
    selCollab = collabPool.slice(0, quota)
    const usedC = new Set(selCollab.map(x => x.m.id))
    selDirect = primary.filter(x => !usedC.has(x.m.id)).slice(0, limit - selCollab.length)
    const usedD = new Set(selDirect.map(x => x.m.id))
    if (selDirect.length + selCollab.length < limit) {
      selCollab = [...selCollab, ...collabPool.filter(x => !usedC.has(x.m.id) && !usedD.has(x.m.id))
        .slice(0, limit - selDirect.length - selCollab.length)]
    }
  } else {
    selDirect = primary.slice(0, limit)
    const usedD = new Set(selDirect.map(x => x.m.id))
    selCollab = collabPool.filter(x => !usedD.has(x.m.id)).slice(0, limit - selDirect.length)
  }
  const selected = [...selDirect, ...selCollab]
  return { direct, primary, collaborative: selCollab, selected, cf, coldStart, limit, quota, shortfall: limit - selected.length }
}

export interface ClickTrialSettings extends TrialSettings {
  enabled: boolean; similarityThreshold: number; userSimilarThreshold: number; modes: string[]; anchorCategory?: string
  requestedCount: number; availableSlots: number; slot1Source: string; slot2Source: string
}
/** 点击后：按坑位选优先来源（第 1 位/第 2 位各选一个已勾选模式），合计≤2。
 * 某位来源无合格候选时按固定顺序回补其余已启用来源，不空坑；跨坑位按商家 ID 去重。 */
export function evaluateClickTrial(opts: CollaborativeTrialInput & { anchorMerchantId: string; anchorTags: TagScore[]; settings: ClickTrialSettings }) {
  const { settings } = opts
  const limit = settings.enabled ? Math.min(2, slotCount(settings.requestedCount), slotCount(settings.availableSlots)) : 0
  const order: TrialSource[] = ['merchantSimilar', 'userSimilar', 'sameCategory']
  const checked = opts.merchants.map(m => ({ m, reason: m.id === opts.anchorMerchantId ? '被点击商家不重复推荐' : merchantExclusion(m, settings) }))
  const eligible = checked.filter(x => !x.reason).map(x => x.m)
  const layers: Array<{ source: TrialSource; items: TrialCandidate[] }> = []
  const cf = settings.enabled && settings.modes.includes('userSimilar') ? collaborativeScores(opts.user, opts.neighbors, {
    currentUserId: opts.currentUserId, userMinimum: settings.userMinimum, metric: settings.metric, threshold: settings.userSimilarThreshold,
  }) : null
  if (settings.enabled && settings.modes.includes('merchantSimilar')) {
    layers.push({ source: 'merchantSimilar', items: rankSource(eligible
      .map(m => ({ m, matchScore: computeSimilarity(matchOf(opts.anchorTags, m.tags, settings.merchantMinimum, settings.merchantMinimum).rows, settings.metric).value }))
      .filter(x => x.matchScore > 0 && x.matchScore * 100 + 1e-10 >= settings.similarityThreshold), 'merchantSimilar', settings) })
  }
  if (settings.enabled && settings.modes.includes('userSimilar')) {
    const scores = new Map(cf?.scores.map(s => [s.store, s.cf]) ?? [])
    layers.push({ source: 'userSimilar', items: rankSource(eligible
      .filter(m => (scores.get(m.id) ?? 0) > 0).map(m => ({ m, matchScore: scores.get(m.id)! })), 'userSimilar', settings) })
  }
  if (settings.enabled && settings.modes.includes('sameCategory') && settings.anchorCategory) {
    layers.push({ source: 'sameCategory', items: rankSource(eligible
      .filter(m => m.category === settings.anchorCategory).map(m => ({ m, matchScore: null })), 'sameCategory', settings) })
  }
  const orderedLayers = order.flatMap(source => layers.filter(layer => layer.source === source))
  const combined = uniqueCandidates(orderedLayers.flatMap(l => l.items))
  const used = new Set<string>()
  const selected: TrialCandidate[] = []
  const takeFrom = (source: string): boolean => {
    for (const item of orderedLayers.find(l => l.source === source)?.items ?? []) {
      if (selected.length >= limit) return false
      if (used.has(item.m.id)) continue
      selected.push(item); used.add(item.m.id); return true
    }
    return false
  }
  // 存量配置可能指向已取消勾选的来源：运行时回退到首个已启用来源，不空坑。
  const s1 = settings.modes.includes(settings.slot1Source) ? settings.slot1Source : (settings.modes[0] ?? 'merchantSimilar')
  const s2 = settings.modes.includes(settings.slot2Source) ? settings.slot2Source : (settings.modes[0] ?? 'merchantSimilar')
  if (limit >= 1) takeFrom(s1)
  if (limit >= 2 && !takeFrom(s2)) {
    for (const source of order) if (source !== s2 && takeFrom(source)) break
  }
  for (const source of order) { if (selected.length >= limit) break; takeFrom(source) }
  return { layers: orderedLayers, combined, selected, cf, limit,
    shortfall: limit - selected.length, rejected: checked.filter(x => x.reason) }
}

export interface TieRaw { quality: number; distance: number; remaining: number; qualityKnown?: boolean }
/** 同分决胜：返回负数＝a 先、正数＝b 先、0＝仍同分（随机探索）。与配置页 RANK_TIE_BREAK_OPTIONS 同口径。 */
export function tieBreakOrder(a: TieRaw, b: TieRaw, rule: string, direction: string): number {
  if (rule === 'quality') return (b.qualityKnown === false ? 0 : b.quality) - (a.qualityKnown === false ? 0 : a.quality)
  if (rule === 'distance') return a.distance - b.distance
  if (rule === 'trafficDirection') return direction === 'lessFirst' ? a.remaining - b.remaining : b.remaining - a.remaining
  return 0
}
