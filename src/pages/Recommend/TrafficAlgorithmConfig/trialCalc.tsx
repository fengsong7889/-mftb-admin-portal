/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/* 投流配置公式试算：覆盖率/衰减/相似度/坑位排序/历史曝光比例五处公式的交互式试算。
 * 交互形态对齐自然流量计分面板试算（小按钮+弹层、输入即时重算、只读态仍可用）；
 * 纯函数导出供单测，弹层只做演示计算，不写库、不替代后端重验。 */
import { useState, type ReactNode } from 'react'
import { Alert, Button, ConfigProvider, Input, InputNumber, Modal, Select, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { CalculatorOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { RANK_TIE_BREAK_OPTIONS, TRAFFIC_FIELDS, rankField, trafficOptionKey, trafficUnitKey, type RankPrefix, type TrafficAlgorithmValues } from './config'
import { computeCoverage, decayState, evaluateMatchingTrial, evaluateClickTrial, collaborativeScores, normalizeRank, rankScore, tieBreakOrder, type RankNorms, type TagScore, type TrialMerchant, type RankInput, type Neighbor } from './trialCalcMath'

/** 试算触发按钮：只读态父 Form disabled 会连带禁用按钮，试算必须保留可用（对齐自然流量面板）。 */
function TrialTrigger({ aria, onClick }: { aria: string; onClick: () => void }) {
  return (
    <Button type="link" size="small" disabled={false} aria-label={aria} icon={<CalculatorOutlined aria-hidden />} onClick={onClick}>
      试算
    </Button>
  )
}

function TrialModal({ open, onClose, title, width = 600, maxHeight = 480, children }: { open: boolean; onClose: () => void; title: string; width?: number | string; maxHeight?: number | string; children: ReactNode }) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={width} title={title}>
      <ConfigProvider componentDisabled={false}>
        <div className="traffic-trial" style={{ maxHeight, overflowY: 'auto' }}>{children}</div>
      </ConfigProvider>
    </Modal>
  )
}

function Num({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string
}) {
  return (
    <label className="traffic-trial__field">
      <span>{label}</span>
      {/* 显式 aria-label：包装 label 内嵌数值控件的可访问名在不同渲染环境下不稳定，试算输入需确定性命名。 */}
      <InputNumber size="small" aria-label={label} value={value} min={min} max={max} step={step} style={{ width: 110 }} addonAfter={unit} onChange={v => onChange(typeof v === 'number' ? v : 0)} />
    </label>
  )
}

/** 覆盖率试算：输入用户达标标签总数与商家覆盖数，即时看覆盖率与门槛判定。 */
export function CoverageTrial({ values }: { values: Partial<TrafficAlgorithmValues> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [total, setTotal] = useState(5)
  const [covered, setCovered] = useState(2)
  const enabled = values.coverageFilterEnabled === true
  const threshold = enabled ? (values.matchThreshold ?? 30) : 0
  const valid = covered <= total
  const cov = computeCoverage(covered, total)
  const pass = valid && covered > 0 && (threshold === 0 || cov >= threshold)
  return (
    <>
      <TrialTrigger aria="覆盖率试算" onClick={() => setOpen(true)} />
      <TrialModal open={open} onClose={() => setOpen(false)} title="覆盖率试算">
        <div className="traffic-trial__fields">
          <Num label={t('recommend.trafficCfg.trial.t23', { defaultValue: '用户达标偏好标签总数' })} value={total} onChange={setTotal} min={0} max={50} unit={t(trafficUnitKey('个'), { defaultValue: '个' })} />
          <Num label={t('recommend.trafficCfg.trial.t24', { defaultValue: '商家覆盖的偏好标签数' })} value={covered} onChange={setCovered} min={0} max={50} unit={t(trafficUnitKey('个'), { defaultValue: '个' })} />
        </div>
        <div className="traffic-trial__formula">{!valid ? '请修正输入' : total === 0 ? '用户无达标标签，不计算覆盖率' : `覆盖率 = ${covered} ÷ ${total} = ${cov.toFixed(1)}%`}</div>
        <div className="traffic-trial__result">
          <span>{enabled ? `最低覆盖比例 ${threshold}%` : '覆盖过滤关闭（仍须共同标签）'}</span>
          <Tag color={pass ? 'success' : 'error'}>{!valid ? '覆盖数量不能大于总数' : total === 0 ? '无偏好，走冷启动' : pass ? '满足标签准入' : '不满足标签准入'}</Tag>
        </div>
        <p className="traffic-trial__note">只验证标签准入；关闭覆盖率过滤后仍须存在共同达标标签。实际推荐还受质量、配送、时段及频控约束。</p>
      </TrialModal>
    </>
  )
}

/** 衰减试算：选商家/用户侧，读当前配置参数，输入初始分与经过天数即时重算。 */
export function DecayTrial({ values }: { values: Partial<TrafficAlgorithmValues> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'merchant' | 'user'>('merchant')
  const [initial, setInitial] = useState(12)
  const [elapsed, setElapsed] = useState(30)
  const decayDays = (side === 'merchant' ? values.merchantDecayDays : values.userDecayDays) ?? 7
  const decayPoints = (side === 'merchant' ? values.merchantDecayPoints : values.userDecayPoints) ?? 1
  const [idleDays, setIdleDays] = useState(0)
  const clearDays = (side === 'merchant' ? values.merchantTagIdleClearDays : values.userTagIdleClearDays) ?? null
  const minimum = (side === 'merchant' ? values.merchantPreferenceMinScore : values.userPreferenceMinScore) ?? 10
  const { steps, score, expired, qualified } = decayState(initial, elapsed, decayDays, decayPoints, idleDays, clearDays, minimum)
  return (
    <>
      <TrialTrigger aria="衰减试算" onClick={() => setOpen(true)} />
      <TrialModal open={open} onClose={() => setOpen(false)} title="标签有效分衰减试算">
        <div className="traffic-trial__fields">
          <label className="traffic-trial__field">
            <span>侧</span>
            <Select value={side} onChange={setSide} style={{ width: 100 }} options={[{ label: t('recommend.trafficCfg.merchant', { defaultValue: '商家' }), value: 'merchant' }, { label: t('recommend.trafficCfg.user', { defaultValue: '用户' }), value: 'user' }]} />
          </label>
          <Num label={t('recommend.trafficCfg.trial.t25', { defaultValue: '初始分' })} value={initial} onChange={setInitial} min={0} max={1000} unit={t(trafficUnitKey('分'), { defaultValue: '分' })} />
          <Num label={t('recommend.trafficCfg.trial.t26', { defaultValue: '经过天数 t' })} value={elapsed} onChange={setElapsed} min={0} max={365} unit={t(trafficUnitKey('天'), { defaultValue: '天' })} />
          <Num label="距最后有效订单新增" value={idleDays} onChange={setIdleDays} min={0} max={365} unit="天" />
        </div>
        <div className="traffic-trial__formula">score = max(0, {initial} − {steps} × {decayPoints})；{expired ? `闲置达到 ${clearDays} 天，清零后` : '周期衰减后'}有效分 = {score}</div>
        <div className="traffic-trial__result">
          <span>当前配置：每 {decayDays} 天减 {decayPoints} 分</span>
          <Tag color={qualified ? 'success' : 'default'}>{expired ? '无新增到期，退出有效标签' : score === 0 ? '已归零，不参与匹配' : qualified ? '仍达到偏好门槛' : '有正分，但未达偏好门槛'}</Tag>
        </div>
        <p className="traffic-trial__note">闲置计时不因定时衰减重置；清理只影响推荐有效分，不删除原始订单历史。清理天数：{clearDays ?? '不启用'}；偏好门槛：{minimum} 分。</p>
      </TrialModal>
    </>
  )
}

type MerchantDemo = TrialMerchant
const DEMO_USER: TagScore[] = [
  { label: '汉堡', score: 12 },
  { label: '鸡翅', score: 10 },
  { label: '甜品', score: 30 },
  { label: '沙拉', score: 15 },
  { label: '奶茶', score: 4 },
]
const DEMO_MERCHANTS: MerchantDemo[] = [
  { id: 'A', paid: true, category: '快餐', name: '商家 A', tags: [{ label: '汉堡', score: 90 }, { label: '鸡翅', score: 50 }, { label: '甜品', score: 55 }, { label: '奶茶', score: 80 }], remaining: 900, total: 1000, quality: 4, distance: 4 },
  { id: 'B', paid: true, category: '快餐', name: '商家 B', tags: [{ label: '汉堡', score: 60 }, { label: '沙拉', score: 20 }, { label: '奶茶', score: 70 }], remaining: 1900, total: 10000, quality: 4, distance: 2 },
  { id: 'C', paid: true, category: '快餐', name: '商家 C', tags: [{ label: '汉堡', score: 40 }, { label: '鸡翅', score: 55 }, { label: '甜品', score: 60 }], remaining: 400, total: 2000, quality: 4.5, distance: 1 },
  { id: 'D', category: '快餐', name: '商家 D（未购）', tags: [{ label: '汉堡', score: 95 }, { label: '鸡翅', score: 60 }, { label: '甜品', score: 65 }], remaining: 500, total: 1000, quality: 4.8, distance: 1, paid: false },
  { id: 'E', paid: true, category: '快餐', name: '商家 E（暂无评分）', tags: [{ label: '汉堡', score: 70 }, { label: '甜品', score: 55 }], remaining: 300, total: 1000, quality: 0, distance: 2, qualityKnown: false },
]
const DEMO_MAX_DISTANCE = 5

/** 相似度试算·推荐推演：四模块双栏——①标签准入 ②相似度计算 ③同分决胜 ④最终结果排序。
 * 门槛/算法/策略/决胜均读当前配置；落选商家给原因；输入即时重算；大面板尽量一屏看全。 */
export function SimilarityTrial({ values }: { values: Partial<TrafficAlgorithmValues> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<TagScore[]>(DEMO_USER)
  const [merchants, setMerchants] = useState<MerchantDemo[]>(DEMO_MERCHANTS)
  const [availableSlots, setAvailableSlots] = useState(3)
  // 弹层关闭时不重算：父表单每次键入都会重渲染本组件，CF/全量匹配只在打开时计算。
  if (!open) return <TrialTrigger aria="相似度试算" onClick={() => setOpen(true)} />
  const metric = values.similarityMetric ?? 'cosine'
  const metricLabel = t(trafficOptionKey('similarityMetric', metric), { defaultValue: TRAFFIC_FIELDS.similarityMetric.options?.find(o => o.value === metric)?.label })
  const uMin = values.userPreferenceMinScore ?? 10
  const mMin = values.merchantPreferenceMinScore ?? 50
  const covMin = values.coverageFilterEnabled ? (values.matchThreshold ?? 30) : 0
  const preset = values.rankPreset ?? 'matchFirst'
  const factors = values.rankFactors ?? []
  const direction = values.remainingTrafficDirection ?? 'moreFirst'
  const coldDims = values.newUserDimensions ?? ['distance', 'remainingTraffic']
  const scoringLabels = coldDims.filter(d => d !== 'qualityScore').map(d => d === 'remainingTraffic' ? '剩余流量包' : '距离')
  const coldRule = `${scoringLabels.length > 0 ? `${scoringLabels.join(' + ')} 等权综合、分高者先` : '无综合分维度'}${coldDims.includes('qualityScore') ? '，质量分软优选达线者先' : ''}`
  const tieRule = values.rankTieBreak ?? 'trafficDirection'
  const tieLabel = RANK_TIE_BREAK_OPTIONS.find(o => o.value === tieRule)?.label ?? '未配置'
  const presetLabel = preset === 'matchFirst' ? t('recommend.trafficCfg.matchFirst', { defaultValue: '匹配优先' }) : preset === 'consumeFirst' ? t('recommend.trafficCfg.consumeFirst', { defaultValue: '消耗优先' }) : `自定义因子（${(factors.length > 0 ? factors : ['match', 'quality', 'distance']).join('+')} 等权）`
  const trial = evaluateMatchingTrial({ currentUserId: 'current-user', user, neighbors: DEMO_NEIGHBORS, merchants,
    settings: { userMinimum: uMin, merchantMinimum: mMin, coverageMinimum: covMin, metric,
      qualityPreference: { enabled: (values.newUserDimensions ?? []).includes('qualityScore'), line: values.qualityScoreThreshold ?? 3.5 },
      coldStartDimensions: coldDims,
      preset, factors, tieRule, direction, maxDistance: DEMO_MAX_DISTANCE, availableSlots,
      userSimilarEnabled: values.matchingUserSimilarEnabled === true, userSimilarThreshold: values.matchingUserSimilarThreshold ?? Number.NaN,
      mode: values.matchingUserSimilarMode ?? 'fill', ratio: values.matchingUserSimilarRatio ?? 10 },
  })
  const { results, ranked, rejected } = trial.direct
  const { coldStart } = trial
  const loadExample = (example: string) => {
    const next = structuredClone(DEMO_MERCHANTS)
    let tags = structuredClone(DEMO_USER)
    if (example === 'weak') {
      tags = [{ label: '汉堡', score: 100 }, { label: '沙拉', score: 10 }]
      next[0].tags = [{ label: '汉堡', score: 50 }]
      next[1].tags = [{ label: '沙拉', score: 50 }]
      next[2].tags = [{ label: '甜品', score: 80 }]
    }
    if (example === 'balance' || example === 'tie') {
      tags = [{ label: '汉堡', score: 100 }, { label: '鸡翅', score: 50 }]
      next.forEach(m => { m.tags = [{ label: '汉堡', score: 100 }, { label: '鸡翅', score: 50 }] })
    }
    if (example === 'collaborative') {
      // 当前用户和邻居保持原样，只让 A 直接匹配；其它已购店可被邻居成交召回。
      next.slice(1).forEach(m => { m.tags = [{ label: '寿司', score: 80 }] })
      setAvailableSlots(3)
    }
    if (example === 'cold') tags.forEach(tag => { tag.score = 0 })
    setUser(tags)
    setMerchants(next)
  }
  let tiePair: { a: (typeof ranked)[number]; b: (typeof ranked)[number] } | null = null
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i - 1].score === ranked[i].score) { tiePair = { a: ranked[i - 1], b: ranked[i] }; break }
  }
  const tieOrder = tiePair ? tieBreakOrder(tiePair.a.m, tiePair.b.m, tieRule, 'moreFirst') : 0
  const tieText = tiePair
    ? (tieRule === 'random' || tieOrder === 0 ? `本例同分：${tiePair.a.m.name} vs ${tiePair.b.m.name}，试算按输入顺序展示，未模拟随机` : `本例同分：${tiePair.a.m.name} vs ${tiePair.b.m.name} → ${tieOrder < 0 ? tiePair.a.m.name : tiePair.b.m.name} 胜出`)
    : '本例未出现同分；最终得分相同时将自动按当前决胜规则排序。'
  const tieDesc = tieRule === 'quality' ? '最终得分相同时，质量分高者先展示。'
    : tieRule === 'distance' ? '最终得分相同时，距离近者先展示。'
    : tieRule === 'trafficDirection' ? '最终得分相同时，剩余曝光次数多者先；不读取冷启动方向。'
    : '本地未模拟随机抽签；同分时按输入顺序显示，不代表线上随机结果。'
  const patchUser = (i: number, key: keyof TagScore, v: string | number) => setUser(us => us.map((t, j) => (j === i ? { ...t, [key]: v } : t)))
  const patchMerchant = (mi: number, patch: Partial<MerchantDemo>) => setMerchants(ms => ms.map((m, j) => (j === mi ? { ...m, ...patch } : m)))
  const patchTag = (mi: number, ti: number, key: keyof TagScore, v: string | number) =>
    setMerchants(ms => ms.map((m, j) => (j === mi ? { ...m, tags: m.tags.map((t, k) => (k === ti ? { ...t, [key]: v } : t)) } : m)))
  return (
    <>
      <TrialModal open={open} onClose={() => setOpen(false)} title="兴趣匹配试算 · 标签与商家" width="min(1160px, calc(100vw - 48px))" maxHeight="calc(100vh - 140px)">
        <Alert type="info" showIcon message="局部试算：当前用户 → 候选商家" description="直接匹配优先，不足时按普通投流协同开关补充；无用户标签走冷启动。全部输出只选已购本广告商家。本例视为同一区域/餐段，未模拟真实频控、跨时段补齐、自然流或扣量；输入不写库。" />
        <div className="traffic-trial__fields">
          <Button onClick={() => loadExample('default')}>重置示例</Button>
          <Button onClick={() => loadExample('weak')}>强弱偏好</Button>
          <Button onClick={() => loadExample('balance')}>余额与比例对照</Button>
          <Button onClick={() => loadExample('tie')}>匹配同分</Button>
          <Button onClick={() => loadExample('cold')}>无用户偏好</Button>
          <Button onClick={() => loadExample('collaborative')}>协同补充案例</Button>
          <Num label="示例普通投流可用坑位" value={availableSlots} onChange={setAvailableSlots} min={0} max={1000} unit="个" />
        </div>
        <p className="traffic-trial__note">普通投流协同{values.matchingUserSimilarEnabled
          ? (values.matchingUserSimilarMode === 'ratio'
            ? `按比例预留 ${values.matchingUserSimilarRatio ?? 10}%：本例 ${trial.limit} 个坑位预留 ${trial.quota} 位给协同（向下取整）`
            : '不足时补充')
          : '未开启'}；展示数量按本轮可用坑位，不受点击后两家上限限制。</p>
        {coldStart && <Alert type="warning" showIcon message={`无有效偏好：本例按冷启动规则（${coldRule}）展示，不调用用户协同；未勾选维度不参与。`} />}
        <div className="traffic-trial__grid">
          <div className="traffic-trial__module">
            <div className="traffic-trial__module-title">① 标签准入（用户 ≥ {uMin} 入选；商家 ≥ {mMin} 达标；重合者计覆盖）</div>
            <div className="traffic-trial__rows">
              {user.map((tag, i) => (
                <div className="traffic-trial__row" key={i}>
                  <Input size="small" value={tag.label} style={{ width: 70 }} aria-label={`用户标签${i + 1}`} onChange={e => patchUser(i, 'label', e.target.value)} />
                  <Num label={t('recommend.trafficCfg.trial.t27', { defaultValue: '用户分' })} value={tag.score} onChange={v => patchUser(i, 'score', v)} min={0} max={1000} />
                  <Tag color={tag.score >= uMin ? 'success' : 'default'}>{tag.score >= uMin ? t('recommend.trafficCfg.sel', { defaultValue: '入选' }) : t('recommend.trafficCfg.unsel', { defaultValue: '未入选' })}</Tag>
                  <Button size="small" type="text" danger aria-label={`删除用户标签${i + 1}`} icon={<DeleteOutlined />} onClick={() => setUser(us => us.filter((_, j) => j !== i))} />
                </div>
              ))}
              {user.length < 8 && (
                <Button size="small" type="link" style={{ color: 'var(--brand)' }} icon={<PlusOutlined aria-hidden />} onClick={() => setUser(us => [...us, { label: `标签${us.length + 1}`, score: 0 }])}>{t('recommend.trafficCfg.addRow', { defaultValue: '加一行' })}</Button>
              )}
            </div>
            {results.map((r, mi) => (
              <div className="traffic-trial__merchant" key={r.m.name}>
                <div className="traffic-trial__row">
                  <strong>{r.m.name}</strong>
                  <span>覆盖率 = {r.match.coveredCount} ÷ {r.match.userSelCount} = {r.match.coverage.toFixed(1)}%</span>
                  <Tag color={r.admitted ? 'success' : 'error'}>{r.admitted ? (coldStart ? '冷启动候选' : '满足直接匹配准入') : r.reason}</Tag>
                </div>
                <div className="traffic-trial__rows">
                  {r.m.tags.map((tag, ti) => {
                    const covered = r.match.coveredLabels.includes(tag.label.normalize('NFKC').trim())
                    return (
                      <div className="traffic-trial__row" key={ti}>
                        <Input size="small" value={tag.label} style={{ width: 70 }} aria-label={`${r.m.name}标签${ti + 1}`} onChange={e => patchTag(mi, ti, 'label', e.target.value)} />
                        <Num label={t('recommend.trafficCfg.trial.t28', { defaultValue: '商家分' })} value={tag.score} onChange={v => patchTag(mi, ti, 'score', v)} min={0} max={1000} />
                        <Tag color={tag.score >= mMin ? 'success' : 'default'}>{tag.score >= mMin ? t('recommend.trafficCfg.qual', { defaultValue: '达标' }) : t('recommend.trafficCfg.unqual', { defaultValue: '未达标' })}</Tag>
                        {covered && <Tag color="processing">{t('recommend.trafficCfg.counted', { defaultValue: '计入' })}</Tag>}
                        <Button size="small" type="text" danger aria-label={`删除${r.m.name}标签${ti + 1}`} icon={<DeleteOutlined />} onClick={() => patchMerchant(mi, { tags: r.m.tags.filter((_, k) => k !== ti) })} />
                      </div>
                    )
                  })}
                  {r.m.tags.length < 8 && (
                    <Button size="small" type="link" style={{ color: 'var(--brand)' }} icon={<PlusOutlined aria-hidden />} onClick={() => patchMerchant(mi, { tags: [...r.m.tags, { label: `标签${r.m.tags.length + 1}`, score: 0 }] })}>{t('recommend.trafficCfg.addRow', { defaultValue: '加一行' })}</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="traffic-trial__col">
            <div className="traffic-trial__module">
              <div className="traffic-trial__module-title">② 完整向量相似度（当前：{metricLabel}）</div>
              {results.map(r => (
                <div className="traffic-trial__rows" key={r.m.name}>
                  <div className="traffic-trial__row">
                    <strong>{r.m.name}</strong>
                    <span>维度：{r.match.rows.map(x => `${x.label}(${x.a}, ${x.b})`).join('、') || '无'}（商家分，用户分）</span>
                  </div>
                  <div className="traffic-trial__formula">Σ(a·b)={r.sim.dot}；Σa²={r.sim.sumA2}；Σb²={r.sim.sumB2}；Σmin={r.sim.sumMin}；Σmax={r.sim.sumMax}</div>
                  <div className="traffic-trial__result">
                    <Tag color={metric === 'cosine' ? 'processing' : 'default'}>余弦 {(r.sim.cosine * 100).toFixed(1)}%</Tag>
                    <Tag color={metric === 'weightedJaccard' ? 'processing' : 'default'}>加权 Jaccard {(r.sim.jaccard * 100).toFixed(1)}%</Tag>
                  </div>
                </div>
              ))}
            </div>
            <div className="traffic-trial__module">
              <div className="traffic-trial__module-title">③ 来源内同分决胜（当前：{tieLabel}）</div>
              <p className="traffic-trial__note">直接匹配优先，协同仅补空位；不同来源的分数不混排。</p>
              <p className="traffic-trial__note">{tieDesc}</p>
              <div className="traffic-trial__result"><Tag color="processing">{coldStart ? `冷启动按 ${coldRule}，不用普通匹配得分。` : tieText}</Tag></div>
            </div>
            <div className="traffic-trial__module">
              <div className="traffic-trial__module-title">④ 最终结果排序（当前策略：{presetLabel}；直接匹配＝{metricLabel}，协同＝CF）</div>
              {results.map((r, mi) => (
                <div className="traffic-trial__row" key={r.m.name}>
                  <strong>{r.m.name}</strong>
                  <Num label="剩余曝光次数" value={r.m.remaining} onChange={v => patchMerchant(mi, { remaining: v })} min={0} max={1000000} />
                  <Num label="总曝光次数" value={r.m.total} onChange={v => patchMerchant(mi, { total: v })} min={1} max={1000000} />
                  {r.m.qualityKnown === false ? <Tag>暂无评分</Tag> : <Num label={t('recommend.trafficCfg.trial.t30', { defaultValue: '质量分' })} value={r.m.quality} onChange={v => patchMerchant(mi, { quality: v })} min={0} max={5} step={0.5} />}
                  <Num label={t('recommend.trafficCfg.trial.t31', { defaultValue: '距离' })} value={r.m.distance} onChange={v => patchMerchant(mi, { distance: v })} min={0} max={50} unit={t(trafficUnitKey('km'), { defaultValue: 'km' })} />
                </div>
              ))}
              <div className="traffic-trial__rows" aria-label="普通投流最终名单">
                {trial.selected.map((r, i) => (
                  <div className="traffic-trial__row" key={r.m.id}>
                    <Tag color="processing">#{i + 1}</Tag><strong>{r.m.name}</strong>
                    <Tag>{r.source === 'userSimilar' ? '用户协同补充' : coldStart ? '冷启动' : '直接兴趣匹配'}</Tag>
                    <span>{coldStart ? t('recommend.trafficCfg.trial.composite', { defaultValue: '综合排序值' }) : '排序值'} {r.score.toFixed(4)}{!coldStart && preset === 'consumeFirst' ? ' 次' : ''}{r.matchScore === null ? '' : `；${r.source === 'userSimilar' ? 'CF' : '相似度'} ${(r.matchScore * 100).toFixed(2)}%`}</span>
                  </div>
                ))}
                <p>本轮选中 {trial.selected.length} 家；缺口 {trial.shortfall} 家，交既有补齐规则处理，不在本地伪造自然结果。</p>
              </div>
              {rejected.filter(r => !trial.selected.some(s => s.m.id === r.m.id)).map(r => (
                <div className="traffic-trial__row" key={r.m.id}>
                  <Tag color="error">未选入本轮</Tag><strong>{r.m.name}</strong><span>直接匹配：{r.reason}</span>
                </div>
              ))}
              {trial.cf && <CollaborativeEvidence cf={trial.cf} user={user} minimum={uMin} merchants={merchants} />}
              {!trial.cf && values.matchingUserSimilarEnabled && <p className="traffic-trial__note">本轮无需协同：直接候选已满足坑位，或当前用户无有效标签。</p>}
            </div>
          </div>
        </div>
        <p className="traffic-trial__note">示例最大直线距离 {DEMO_MAX_DISTANCE}km；两侧标签分别达标后合并维度，缺失侧补 0。同名重复行取最高分；覆盖率门槛 {covMin === 0 ? '已关闭' : `${covMin}%`}。两种算法结果仅供对照，不等同真实曝光效果。</p>
      </TrialModal>
    </>
  )
}

const DEMO_NEIGHBORS: Neighbor[] = [
  { id: '邻居甲', tags: [{ label: '汉堡', score: 12 }, { label: '鸡翅', score: 10 }, { label: '甜品', score: 28 }], purchased: ['A', 'C', 'D'] },
  { id: '邻居乙', tags: [{ label: '汉堡', score: 11 }, { label: '甜品', score: 26 }], purchased: ['A', 'A', 'B', 'D'] },
  { id: '邻居丙', tags: [{ label: '沙拉', score: 40 }], purchased: ['B'] },
]

/** 两场景复用的匿名协同过程；只把已过订单有效性过滤的商家 ID 集合作为输入。 */
function CollaborativeEvidence({ cf, user, minimum, merchants }: { cf: ReturnType<typeof collaborativeScores>; user: TagScore[]; minimum: number; merchants: TrialMerchant[] }) {
  const storeName = (id: string) => DEMO_MERCHANTS.find(m => m.id === id)?.name ?? id
  const tags = (items: TagScore[]) => items.filter(x => x.score > 0 && x.score >= minimum).map(x => `${x.label}:${x.score}`).join('、') || '无'
  return <div className="traffic-trial__rows" aria-label="协同计算过程">
    <div className="traffic-trial__module-title">用户协同：标签找邻居，再推荐其成交店</div>
    <p>当前用户入选标签（≥ {minimum} 分）：{tags(user)}</p>
    {cf.neighbors.map(x => <div className="traffic-trial__row" key={x.n.id}>
      <strong>{x.n.id}</strong><span>标签：{tags(x.n.tags)}</span>
      <span>用户相似度 {(x.sim * 100).toFixed(2)}%</span>
      <span>有效成交：{[...new Set(x.n.purchased)].map(storeName).join('、') || '无'}</span>
    </div>)}
    {cf.neighbors.length === 0 && <p>无有效邻居，协同返回空，不随机推荐。</p>}
    <div className="traffic-trial__formula">Σ邻居相似度 = {cf.denom.toFixed(4)}</div>
    {cf.scores.map(s => <div className="traffic-trial__row" key={s.store}>
      <strong>{storeName(s.store)}</strong><span>支持邻居 {s.support} 人</span>
      <span>CF = {(s.cf * cf.denom).toFixed(4)} ÷ {cf.denom.toFixed(4)} = {(s.cf * 100).toFixed(2)}%</span>
      {/* 用户不投流、只有商家投流：邻居成交店须已购本广告才可被推荐，否则仅作行为输入。 */}
      <Tag color={merchants.some(m => m.id === s.store && m.paid === true) ? 'success' : 'error'}>
        {merchants.some(m => m.id === s.store && m.paid === true) ? '投流·可推荐' : '非投流·不推荐'}
      </Tag>
    </div>)}
    <p className="traffic-trial__note">同一邻居重复成交仅计一次支持；商家 D 未购，即使 CF 最高也只作行为输入，不进入投流名单。样例不含真实消费者信息。</p>
  </div>
}

/** 点击后推荐：来源内排序、业务可选来源顺序，实际选取最多两家付费商家。 */
export function ClickRecTrial({ values }: { values: Partial<TrafficAlgorithmValues> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const metric = values.similarityMetric ?? 'cosine'
  const uMin = values.userPreferenceMinScore ?? 10
  const mMin = values.merchantPreferenceMinScore ?? 50
  const modes = values.similarRecModes ?? ['merchantSimilar']
  const [availableSlots, setAvailableSlots] = useState(2)
  if (!open) return <TrialTrigger aria="点击后推荐试算" onClick={() => setOpen(true)} />
  const anchor = DEMO_MERCHANTS[0]
  const prefix = values.similarRankMode === 'independent' ? 'similarRank' : 'rank'
  const { layers, selected, cf, limit, shortfall, rejected } = evaluateClickTrial({
    currentUserId: 'current-user', anchorMerchantId: anchor.id,
    anchorTags: anchor.tags, user: DEMO_USER, neighbors: DEMO_NEIGHBORS, merchants: DEMO_MERCHANTS,
    settings: { userMinimum: uMin, merchantMinimum: mMin, coverageMinimum: 0, metric,
      preset: values[rankField(prefix, 'Preset')] ?? 'matchFirst', factors: values[rankField(prefix, 'Factors')] ?? [],
      tieRule: values[rankField(prefix, 'TieBreak')] ?? 'quality', direction: 'moreFirst', maxDistance: DEMO_MAX_DISTANCE,
      similarityThreshold: values.similarityThreshold ?? Number.NaN, userSimilarThreshold: values.userSimilarThreshold ?? Number.NaN,
      modes, anchorCategory: anchor.category, enabled: values.generativeRecommendEnabled === true,
      requestedCount: values.generativeMerchantCount ?? 0, availableSlots,
      slot1Source: values.similarRecSlot1Source ?? 'merchantSimilar', slot2Source: values.similarRecSlot2Source ?? 'userSimilar' },
  })
  const sourceLabel: Record<string, string> = { merchantSimilar: '商家相似', userSimilar: '用户协同', sameCategory: '同类目' }
  return (
    <>
      <TrialModal open={open} onClose={() => setOpen(false)} title="点击后推荐试算 · 分层来源" width="min(1160px, calc(100vw - 48px))" maxHeight="calc(100vh - 140px)">
        <Alert type="info" showIcon message="局部试算：被点击商家 → 付费推荐名单" description="读取业务为第 1/2 位选择的优先来源，按位取人、不足回补其余已启用来源。候选需已购本广告，排除被点击商家、按商家 ID 去重。仅模拟选取，不执行真实瀑布流插入、曝光或扣量。" />
        <div className="traffic-trial__fields">
          <Num label="示例点击后可用投流坑位" value={availableSlots} onChange={setAvailableSlots} min={0} max={5} unit="个" />
          <span>配置数量 {values.generativeMerchantCount ?? '待配置'} 家；本轮最多 {limit} 家；{prefix === 'rank' ? '沿用投流坑位排序' : '独立排序'}；第 1 位优先 {sourceLabel[values.similarRecSlot1Source ?? 'merchantSimilar'] ?? '商家相似'}{limit >= 2 ? `，第 2 位优先 ${sourceLabel[values.similarRecSlot2Source ?? 'userSimilar'] ?? '用户协同'}` : ''}</span>
        </div>
        <div className="traffic-trial__grid">
          <div className="traffic-trial__module">
            <div className="traffic-trial__module-title">当前算法：{t(trafficOptionKey('similarityMetric', metric), { defaultValue: '余弦' })}</div>
            {cf ? <CollaborativeEvidence cf={cf} user={DEMO_USER} minimum={uMin} merchants={DEMO_MERCHANTS} /> : <p>点击后用户协同未启用；不影响普通投流的协同开关。</p>}
            <div className="traffic-trial__module-title">资格排除</div>
            {rejected.map(x => <p key={x.m.id}>{x.m.name}：{x.reason}</p>)}
          </div>
          <div className="traffic-trial__col">
            <div className="traffic-trial__module">
              <div className="traffic-trial__module-title">各来源候选（来源内排序，最终选取时去重）</div>
              {layers.map(l => (
                <div className="traffic-trial__rows" key={l.source}>
                  <div className="traffic-trial__module-title">{sourceLabel[l.source] ?? l.source}</div>
                  {l.items.map(x => (
                    <div className="traffic-trial__row" key={x.m.name}>
                      <strong>{x.m.name}</strong>
                      <span>{x.matchScore === null ? '类目补充，无相似度' : `${l.source === 'userSimilar' ? 'CF' : '商家相似度'} ${(x.matchScore * 100).toFixed(2)}%`}；排序值 {x.score.toFixed(4)}</span>
                    </div>
                  ))}
                  {l.items.length === 0 && <p className="traffic-trial__note">本层无合格候选。</p>}
                </div>
              ))}
              <div className="traffic-trial__rows" aria-label="点击后最终名单">
                <div className="traffic-trial__module-title">本轮最终选取（合计最多 2 家）</div>
                {selected.map((x, i) => <div className="traffic-trial__row" key={x.m.id}>
                  <Tag color="processing">#{i + 1}</Tag><strong>{x.m.name}</strong><Tag>{sourceLabel[x.source]}</Tag>
                </div>)}
                <p>本轮选中 {selected.length} 家；缺口 {shortfall} 家。不强行补位，自然兜底由瀑布流决定。</p>
                <p className="traffic-trial__note">同分随机未模拟；仍同分时保持样例输入顺序，不代表线上随机结果。</p>
              </div>
            </div>
          </div>
        </div>
      </TrialModal>
    </>
  )
}

type RankRaw = RankInput
const DEMO_A: RankRaw = { match: 0.9, remaining: 900, total: 1000, quality: 4, distance: 4 }
const DEMO_B: RankRaw = { match: 0.3, remaining: 1900, total: 10000, quality: 4.5, distance: 1 }

/** 坑位排序试算：两商家原始值→归一→按当前预设/因子打分，即时看谁先。 */
export function RankTrial({ values, prefix }: { values: Partial<TrafficAlgorithmValues>; prefix: RankPrefix }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [a, setA] = useState<RankRaw>(DEMO_A)
  const [b, setB] = useState<RankRaw>(DEMO_B)
  const [maxDistance, setMaxDistance] = useState(5)
  const preset = values[rankField(prefix, 'Preset')] ?? 'matchFirst'
  const factors = values[rankField(prefix, 'Factors')] ?? []
  const invalidSample = [a, b].some(row => row.total <= 0 || row.remaining < 0 || row.remaining > row.total)
  const na = normalizeRank(a, maxDistance)
  const nb = normalizeRank(b, maxDistance)
  const sa = rankScore(preset, factors, na)
  const sb = rankScore(preset, factors, nb)
  const name = prefix === 'rank' ? t('recommend.trafficCfg.slotRank', { defaultValue: '坑位排序' }) : t('recommend.trafficCfg.indepPriority', { defaultValue: '独立优先级' })
  const row = (label: string, raw: RankRaw, set: (v: RankRaw) => void, n: RankNorms, s: number | null) => (
    <div className="traffic-trial__row">
      <strong>{label}</strong>
      <Num label={t('recommend.trafficCfg.trial.t32', { defaultValue: '匹配分' })} value={raw.match} onChange={v => set({ ...raw, match: v })} min={0} max={1} step={0.1} />
      <Num label="剩余曝光次数" value={raw.remaining} onChange={v => set({ ...raw, remaining: v })} min={0} max={1000000} />
      <Num label="总曝光次数" value={raw.total} onChange={v => set({ ...raw, total: v })} min={1} max={1000000} />
      <Num label={t('recommend.trafficCfg.trial.t34', { defaultValue: '质量分' })} value={raw.quality} onChange={v => set({ ...raw, quality: v })} min={0} max={5} step={0.5} />
      <Num label={t('recommend.trafficCfg.trial.t35', { defaultValue: '距离' })} value={raw.distance} onChange={v => set({ ...raw, distance: v })} min={0} max={50} unit={t(trafficUnitKey('km'), { defaultValue: 'km' })} />
      <span>归一：匹配{n.match.toFixed(2)} 剩余比例{n.traffic.toFixed(2)} 质量{n.quality.toFixed(2)} 距离{n.distance.toFixed(2)} → 排序值 {s?.toFixed(4) ?? '请配置有效因子'}</span>
    </div>
  )
  return (
    <>
      <TrialTrigger aria={`${name}试算`} onClick={() => setOpen(true)} />
      <TrialModal open={open} onClose={() => setOpen(false)} title={`${name}试算`}>
        <div className="traffic-trial__fields">
          <Num label={t('recommend.trafficCfg.trial.t36', { defaultValue: '最大直线距离' })} value={maxDistance} onChange={setMaxDistance} min={1} max={50} unit={t(trafficUnitKey('km'), { defaultValue: 'km' })} />
          <span className="traffic-trial__note">当前策略：{preset === 'matchFirst' ? t('recommend.trafficCfg.matchFirst', { defaultValue: '匹配优先' }) : preset === 'consumeFirst' ? t('recommend.trafficCfg.consumeFirst', { defaultValue: '消耗优先' }) : `自定义因子（${(factors.length > 0 ? factors : ['match', 'quality', 'distance']).join('+')} 等权）`}；消耗优先比较绝对剩余次数，自定义比较归一分。</span>
        </div>
        <div className="traffic-trial__rows">
          {row('商家 A', a, setA, na, sa)}
          {row('商家 B', b, setB, nb, sb)}
        </div>
        <div className="traffic-trial__result">
          <Tag color="processing">{invalidSample ? '剩余次数必须在 0 与总次数之间' : sa === null || sb === null ? '请先选择有效排序因子' : sa === sb ? (tieBreakOrder(a, b, values[rankField(prefix, 'TieBreak')] ?? 'quality', 'moreFirst') < 0 ? '同分决胜：A 先' : tieBreakOrder(a, b, values[rankField(prefix, 'TieBreak')] ?? 'quality', 'moreFirst') > 0 ? '同分决胜：B 先' : '仍同分，未模拟随机') : sa > sb ? 'A 先展示' : 'B 先展示'}</Tag>
        </div>
        <p className="traffic-trial__note">仅比较已合格候选：消耗优先按剩余曝光次数降序，不受冷启动方向影响；自定义使用归一分。此处不模拟标签准入与频控。</p>
      </TrialModal>
    </>
  )
}

/** 历史曝光比例试算：P(i)=剩余i÷Σ剩余（只读历史策略的公式演示）。 */
export function ExposureTrial() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [ra, setRa] = useState(100)
  const [rb, setRb] = useState(60)
  const [rc, setRc] = useState(40)
  const sum = ra + rb + rc
  const p = (v: number) => (sum > 0 ? ((v / sum) * 100).toFixed(1) : '0.0')
  return (
    <>
      <TrialTrigger aria="曝光比例试算" onClick={() => setOpen(true)} />
      <TrialModal open={open} onClose={() => setOpen(false)} title="历史曝光比例试算">
        <div className="traffic-trial__fields">
          <Num label={t('recommend.trafficCfg.trial.t37', { defaultValue: 'A 剩余曝光量' })} value={ra} onChange={setRa} min={0} max={100000} />
          <Num label={t('recommend.trafficCfg.trial.t38', { defaultValue: 'B 剩余曝光量' })} value={rb} onChange={setRb} min={0} max={100000} />
          <Num label={t('recommend.trafficCfg.trial.t39', { defaultValue: 'C 剩余曝光量' })} value={rc} onChange={setRc} min={0} max={100000} />
        </div>
        <div className="traffic-trial__formula">Σ剩余 = {sum}；P(A)={p(ra)}%；P(B)={p(rb)}%；P(C)={p(rc)}%</div>
        <p className="traffic-trial__note">历史策略「剩余流量包比例分配」的公式演示；当前目标口径为兴趣匹配优先，本试算不改变保存策略。</p>
      </TrialModal>
    </>
  )
}
