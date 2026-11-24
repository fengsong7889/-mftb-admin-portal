/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Result, Select, Spin, Switch, message } from 'antd'
import { LockOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import DetailPageHeader from '@/components/DetailPageHeader'
import HelpPopover, { type HelpSection } from '@/components/HelpPopover'
import {
  appTypeToBrand, brandToAppType, createAdAlgorithm, fetchAdAlgorithmDetail, fetchAdAlgorithmRevisions,
  fetchAlgorithmWaterfallReferences, publishAdAlgorithmRevision, updateAdAlgorithm, type AlgorithmRevision, type WaterfallReference,
} from '@/api/adPromotion'
import { PrototypeHeader, PrototypeNotice, PrototypeSection, SimilarEngineIcon } from './PrototypeParts'
import InsertStyleTrial from './InsertStyleTrial'
import { FieldGroup } from '../TrafficAlgorithmConfig/sections'
import { DecayTrial, RankTrial, SimilarityTrial } from '../TrafficAlgorithmConfig/trialCalc'
import type { TrafficAlgorithmValues } from '../TrafficAlgorithmConfig/config'
import { RANK_FACTOR_OPTIONS, RANK_TIE_BREAK_OPTIONS, RANK_TIE_TO_FACTOR, deadTieBreaks } from '../TrafficAlgorithmConfig/config'
import { TagDecayReference } from '../TagDecaySettings'
import { TAG_DECAY_POLICY, useTagDecayPolicy } from '../TagDecaySettings/store'
import '../TrafficAlgorithmConfig/index.css'
import {
  BRAND_OPTIONS, CATEGORY_LEVEL_OPTIONS, INSERT_STYLE_OPTIONS, NUMBER_FIELDS, PROTOTYPE_DEFAULTS, SIMILAR_ALGO_NAME, SIMILAR_PREVIEW_TYPE,
  SOURCE_OPTIONS, numberPrecision, readSimilarParams, serializeSimilarParams, validatePrototype,
  type Business, type Factor, type NumericField, type PrototypeValues, type TieBreak,
} from './prototype'
import { sceneByCode, SCENE_STRATEGY, SCENE_OVERRIDES, type OverrideField } from './scenes'

/** 行内只放一条公式/结论，长说明收进问号弹层；凡有计算公式的参数项都带试算入口（与投流广告同形态）。 */
function FormulaRow({ formula, title, ariaLabel, content, trial }: {
  formula: string; title: string; ariaLabel: string; content: HelpSection[]; trial?: ReactNode
}) {
  return <div className="traffic-config__formula-row">
    <code className="traffic-config__formula">{formula}</code>
    <HelpPopover title={title} ariaLabel={ariaLabel} content={content} />
    {trial}
  </div>
}

/** type17 的独立路由分支：真实读写算法库接口，但不进入旧算法表单分支。 */
export default function SimilarRecommendationConfig({ searchParams }: { searchParams: URLSearchParams }) {
  const navigate = useNavigate()
  const tab: Business = searchParams.get('tab') === 'groupBuy' ? 'groupBuy' : 'delivery'
  const initialScene = Number(searchParams.get('scene')) || 1
  const listPath = `/promotion-algorithm?type=${SIMILAR_PREVIEW_TYPE}&tab=${tab}&scene=${initialScene}`
  const idParam = searchParams.get('id')
  const readOnly = searchParams.get('mode') === 'detail'
  const handleEdit = () => { const next = new URLSearchParams(searchParams); next.delete('mode'); navigate(`/promotion-algorithm-add?${next}`) }
  return <ConfigForm key={`${tab}/${idParam ?? 'new'}/${readOnly}/${initialScene}`} business={tab} initialScene={initialScene} algorithmId={idParam ? Number(idParam) : null}
    readOnly={readOnly} onEdit={handleEdit} onBack={() => navigate(listPath)} />
}

interface Loaded { values: PrototypeValues; name: string; brand: string; updatedBy?: string; updatedAt?: string }

function ConfigForm({ business, initialScene, algorithmId, readOnly, onEdit, onBack }: {
  business: Business; initialScene: number; algorithmId: number | null; readOnly: boolean; onEdit: () => void; onBack: () => void
}) {
  const { hasPermission } = useAuth()
  const [form] = Form.useForm<PrototypeValues>()
  const [loaded, setLoaded] = useState<Loaded | null>(algorithmId ? null : { values: { ...PROTOTYPE_DEFAULTS, business, scene: initialScene }, name: '', brand: business === 'groupBuy' ? 'mFood' : 'flashBee' })
  const [loadError, setLoadError] = useState('')
  const [revisions, setRevisions] = useState<AlgorithmRevision[]>([])
  const [refs, setRefs] = useState<WaterfallReference[]>([])
  const [values, setValues] = useState<PrototypeValues>(() => ({ ...PROTOTYPE_DEFAULTS, business, scene: initialScene }))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // 场景 4/5/6 的专属策略/触发覆盖草稿（schema 驱动）；场景 1 沿用表单富配置。
  const [sceneDraft, setSceneDraft] = useState<Record<string, string | number | boolean | string[]>>({})
  const sceneKey = sceneByCode(values.scene)?.key
  const canCreate = hasPermission('promotion-algorithm:create')
  const canEdit = hasPermission('promotion-algorithm:edit')
  const disabled = readOnly || !canEdit || !loaded
  const sourceOptions = SOURCE_OPTIONS.filter(option => values.modes.includes(option.value))
  const { policy } = useTagDecayPolicy()
  // 公式试算复用投流同款试算弹层：把引擎字段映射到投流试算的字段名，数值口径不变、不另造一套数学。
  const trialValues = useMemo<Partial<TrafficAlgorithmValues>>(() => ({
    similarityMetric: values.metric,
    userPreferenceMinScore: values.userMinimum, merchantPreferenceMinScore: values.merchantMinimum,
    rankPreset: values.rankPreset, rankFactors: values.factors, rankTieBreak: values.tieBreak,
    merchantDecayDays: policy.values.merchantDecayDays, merchantDecayPoints: policy.values.merchantDecayPoints,
    merchantTagIdleClearDays: policy.values.merchantTagIdleClearDays,
    userDecayDays: policy.values.userDecayDays, userDecayPoints: policy.values.userDecayPoints,
    userTagIdleClearDays: policy.values.userTagIdleClearDays,
  }), [values.metric, values.userMinimum, values.merchantMinimum, values.rankPreset, values.factors, values.tieBreak, policy])

  useEffect(() => {
    if (!algorithmId) return
    let active = true
    setLoadError('')
    Promise.all([fetchAdAlgorithmDetail(algorithmId), fetchAdAlgorithmRevisions(algorithmId).catch(() => [] as AlgorithmRevision[])])
      .then(([detail, revisionList]) => {
        if (!active) return
        if (detail.algoType !== SIMILAR_PREVIEW_TYPE) throw new Error('當前記錄不是全域相似策略算法')
        const parsed = detail.params ? JSON.parse(detail.params) : {}
        const formValues = { ...readSimilarParams(parsed, business), name: detail.algoName, brand: detail.brand ?? '' }
        setLoaded({ values: formValues, name: detail.algoName, brand: detail.brand ?? '', updatedBy: detail.updatedBy, updatedAt: detail.updatedAt })
        setRevisions(revisionList)
      })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : '加載失敗') })
    return () => { active = false }
  }, [algorithmId, business])

  useEffect(() => {
    if (!loaded) return
    form.setFieldsValue(loaded.values)
    setValues(loaded.values)
  }, [loaded, form])

  // 详情页展示场景引用：删除保护同源于服务端，此处仅供预览。
  useEffect(() => {
    if (!readOnly || !algorithmId) return
    let active = true
    fetchAlgorithmWaterfallReferences(algorithmId).then(list => { if (active) setRefs(list) }).catch(() => { if (active) setRefs([]) })
    return () => { active = false }
  }, [readOnly, algorithmId])

  // 切换场景时重置专属草稿为注册表预设（场景 1 不使用草稿）。
  useEffect(() => {
    const key = sceneByCode(values.scene)?.key
    const init: Record<string, string | number | boolean | string[]> = {}
    for (const field of [...(SCENE_STRATEGY[key!] ?? []), ...(SCENE_OVERRIDES[key!]?.fields ?? [])]) init[field.key] = field.defaultValue
    setSceneDraft(init)
  }, [values.scene])

  const handleChange = (changed: Partial<PrototypeValues>, next: PrototypeValues) => {
    const updated = { ...values, ...next, business, tagDecayPolicy: TAG_DECAY_POLICY }
    if (changed.modes?.length) {
      if (!changed.modes.includes(next.slot1)) updated.slot1 = changed.modes[0]
      if (!changed.modes.includes(next.slot2)) updated.slot2 = changed.modes[0]
      form.setFieldsValue({ slot1: updated.slot1, slot2: updated.slot2 })
    }
    setValues(updated)
    setDirty(true)
    form.setFields((Object.keys(changed) as (keyof PrototypeValues)[]).map(name => ({ name, errors: [] })))
  }
  const handleBack = () => {
    if (!dirty) { onBack(); return }
    Modal.confirm({ className: 'custom-confirm-modal', icon: <div className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></div>,
      title: '放棄尚未保存的變更？', content: '離開將放棄本頁未保存的調整，已保存的算法與版本不受影響。',
      okText: '放棄變更', cancelText: '繼續編輯', okButtonProps: { danger: true }, onOk: onBack })
  }
  const handleSave = async () => {
    if (disabled) return
    const current: PrototypeValues = { ...values, ...form.getFieldsValue(true), business, tagDecayPolicy: TAG_DECAY_POLICY }
    const issues = validatePrototype(current)
    form.setFields(issues.map(issue => ({ name: issue.name, errors: [issue.message] })))
    if (issues.length) { message.warning(issues[0].message); form.scrollToField(issues[0].name); return }
    if (current.scene !== 1) { message.warning('該場景算法的保存待後端場景協議（遷移 340／協議 v2）就緒；當前為配置預覽。'); return }
    setSaving(true)
    try {
      const payload = {
        algoName: current.name.trim(), algoType: SIMILAR_PREVIEW_TYPE, brand: appTypeToBrand(brandToAppType(current.brand)),
        params: serializeSimilarParams(current, business),
      }
      if (algorithmId) await updateAdAlgorithm(algorithmId, payload)
      else await createAdAlgorithm(payload)
      message.success(algorithmId ? '算法已更新；綁定仍引用舊版本，需發布新版本並顯式升級' : '算法已新增；發布版本後才可被瀑布流引用')
      onBack()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失敗，請檢查配置')
    } finally {
      setSaving(false)
    }
  }
  const handlePublish = async () => {
    if (!algorithmId || !canEdit) return
    try {
      const published = await publishAdAlgorithmRevision(algorithmId, { expectedRevision: revisions[0]?.revision ?? 0 })
      setRevisions(prev => [published, ...prev])
      message.success(`已發布版本 V${published.revision}；瀑布流綁定需顯式選擇該版本`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '發布失敗')
    }
  }
  const number = (name: NumericField, hidden = false) => {
    const { label, unit, min, max } = NUMBER_FIELDS[name]
    // 单位走 suffix 置于输入框后方：标签不再包含（单），避免被固定列宽裁切。
    // 所有数字参数均不得为空（validatePrototype 同步重验），统一标必填星号。
    return <Form.Item key={name} name={name} label={label} hidden={hidden} layout="horizontal" required>
      <InputNumber min={min} max={max} precision={numberPrecision(name)} suffix={unit ? <span className="traffic-config__unit">{unit}</span> : undefined} />
    </Form.Item>
  }
  // 页头主标题只保留操作词；场景名移入副题并带磁铁图标（沿用原引擎名副题格式，各场景全局统一）。
  const sceneName = sceneByCode(values.scene)?.name ?? SIMILAR_ALGO_NAME
  const title = readOnly ? '算法詳情' : algorithmId ? '編輯算法' : '新增算法'
  const subtitle = <><SimilarEngineIcon /> {sceneName}</>
  // 同分决胜完全复用投流单一真源词表与联动显示：自定义模式仅可选已勾因子映射＋随机＋热度（同投流口径）；
  // 两模式均剔除与主排序同轴的死选项（匹配优先×匹配分高者优先等，同分后比同轴永远打不平）；
  // 稳定商家 ID 不作选项——决胜仍同分时按商家 ID 确定性兜底（问号内说明）。
  const deadTies = deadTieBreaks(values.rankPreset, values.factors ?? [])
  const insertTieOptions = values.rankPreset === 'custom'
    ? RANK_TIE_BREAK_OPTIONS.filter(o => {
      // RANK_TIE_TO_FACTOR 是投流侧的单一真源（Record<string, string>），在本表单要收到 Factor 才能与已勾因子比对。
      const factor = RANK_TIE_TO_FACTOR[o.value] as Factor | undefined
      return (o.value === 'random' || o.value === 'tagHeat' || (factor !== undefined && (values.factors ?? []).includes(factor))) && !deadTies.includes(o.value)
    })
    : RANK_TIE_BREAK_OPTIONS.filter(o => !deadTies.includes(o.value))
  useEffect(() => {
    if (!insertTieOptions.some(o => o.value === values.tieBreak)) {
      // 选项值来自共享词表（string），回写表单时收到 TieBreak 结合类型，不靠默认值兼容。
      form.setFieldsValue({ tieBreak: ((insertTieOptions.find(o => o.value === 'quality') ?? insertTieOptions[0])?.value ?? 'quality') as TieBreak })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.rankPreset, values.tieBreak, values.factors, form])
  // 场景 4/5/6 专属字段渲染器（schema 驱动，与绑定区同口径）。
  const renderSceneField = (field: OverrideField) => {
    const fid = `scene-${field.key}`
    const hidden = field.dependsOn ? sceneDraft[field.dependsOn.key] !== field.dependsOn.equals : false
    const val = sceneDraft[field.key]
    const set = (next: string | number | boolean | string[]) => setSceneDraft(prev => ({ ...prev, [field.key]: next }))
    let control
    if (field.kind === 'select') control = <Select id={fid} disabled={disabled} value={val as string | number} onChange={set} options={field.options} />
    else if (field.kind === 'multi') control = <Select id={fid} mode="multiple" disabled={disabled} value={(val as string[]) ?? []} onChange={set} options={field.options} />
    else if (field.kind === 'number') control = <InputNumber id={fid} disabled={disabled} min={field.min} max={field.max} precision={field.precision ?? 0} value={val as number}
      suffix={field.unit ? <span className="traffic-config__unit">{field.unit}</span> : undefined} onChange={next => { if (next != null) set(next) }} />
    else control = <Switch id={fid} disabled={disabled} checked={val === true} onChange={set} />
    return <div key={field.key} className="scene-override-field" hidden={hidden}><label htmlFor={fid}>{field.label}</label>{control}</div>
  }

  if (loadError) return <div className="content-area"><Result status="warning" title="加載失敗" subTitle={loadError}
    extra={<Button onClick={onBack}>返回列表</Button>} /></div>
  if (!loaded) return <div className="content-area"><Spin style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} /></div>

  return <div className={`content-area similar-prototype algorithm-form-page${readOnly ? ' algorithm-form-page--detail' : ''}`}>
    {readOnly ? <DetailPageHeader title={title} meta={loaded.name ? `${sceneName} · ${loaded.name}` : sceneName} onBack={handleBack} onEdit={canEdit ? onEdit : undefined} menuKey="promotion-algorithm" />
      : <PrototypeHeader title={title} subtitle={subtitle} onBack={handleBack} />}
    {!readOnly && <PrototypeNotice />}
    {readOnly && revisions.length > 0 && <Alert className="similar-prototype__notice" type="info" showIcon
      message={`已發布 ${revisions.length} 個不可變版本，最新 V${revisions[0].revision}（${revisions[0].createdBy ?? '—'}）`}
      description="運行側只讀綁定版本；編輯當前參數不會改變已發布版本。" />}
    <Form<PrototypeValues> form={form} layout="vertical" disabled={disabled} initialValues={loaded.values} onValuesChange={handleChange}>
      <PrototypeSection readOnly={readOnly} title="基礎信息">
        <div className="similar-prototype__grid similar-prototype__grid--basic">
          <Form.Item name="name" label="算法名稱" rules={[{ required: true, whitespace: true, message: '請填寫算法名稱' }, { max: 100, message: '名稱最多 100 字' }]}><Input maxLength={100} placeholder="例如：漢堡類商家相似推薦" /></Form.Item>
          <Form.Item name="brand" label="所屬品牌" rules={[{ required: true, message: '請選擇品牌' }]}><Select options={BRAND_OPTIONS} disabled={disabled || !!algorithmId} /></Form.Item>
        </div>
        <p className="similar-prototype__hint">業務範圍與歸屬場景均由算法庫頁簽決定，不在表單內重複展示；本算法不作為可售廣告或基礎坑位算法，各場景的策略／排序／觸發／展示獨立配置，標籤底座共享。</p>
      </PrototypeSection>
      <PrototypeSection readOnly={readOnly} title="標籤與相似計算" extra={<HelpPopover title="標籤計分邊界" ariaLabel="標籤計分邊界說明" content={[
        { label: '既有計分', body: '商家按完成訂單商品走量，每件其標準標籤 +1；用戶按不同商品類型計分，同訂單同類型多件不重複、不同類型同標籤各 +1。僅已完成訂單。', tone: 'info' },
        { label: '不新增行為加分', body: '點擊與返回只選定本次錨點，不增加標籤分。商家與用戶使用不同門檻；原始累計與衰減後有效分分開。', tone: 'warn' },
      ]} />}>
        {/* 统计范围固定为全部历史：与投流同款只读口径卡，避免配置人员误以为可选时间窗。 */}
        <div className="traffic-config__fixed-stats" role="note" aria-label="標籤統計範圍固定口徑">
          <div className="traffic-config__fixed-stats-items">
            <div className="traffic-config__fixed-stats-item"><span>商家標籤統計範圍</span><strong>全部歷史 <LockOutlined aria-hidden /> 固定口徑</strong></div>
            <div className="traffic-config__fixed-stats-item"><span>用戶標籤統計範圍</span><strong>全部歷史 <LockOutlined aria-hidden /> 固定口徑</strong></div>
          </div>
          <p>標籤畫像一律基於全部歷史已完成訂單累計，不提供 7/30/90 天等自定義窗口；時效性由下方全局衰變規則統一遞減，原始累計不因衰變刪除。</p>
        </div>
        {/* 在售可用性为硬性退出而非降权：写进界面以免被误读为“排后面就行”。 */}
        <div className="traffic-config__note">
          <strong>在售可用性過濾（硬性退出候補，非降權）</strong>
          <p>候補商家必須同時滿足「標籤畫像命中」與「當前有在售可購買商品」。系統會計算並過濾掉有標籤但無對應在售商品的商家（全店下架、無可購買 SKU、已停售），此類商家不參與相似度計算，也不佔用推薦數量額度。</p>
          <p>售罄、休息中、超出配送範圍等即時不可購買狀態同樣不進入本輪名單；該檢查在準入門檻與相似度計算之前完成，因此「相似分很高但買不到」的商家不會出現在瀑布流。執行側由推薦服務統一校驗（當前配置完成、運行未接入）。</p>
        </div>
        <p className="traffic-config__hint">兩側以標準標籤 ID 對齊，按並集構造向量、缺失側補 0；僅已完成訂單產生標籤增量。</p>
        <TagDecayReference />
        {/* 子标题分区与投流「標籤與興趣匹配」同构：① 准入門檻（双侧门槛+有效分公式）② 相似度計算（算法选择+sim 公式）。 */}
        <h4 className="traffic-config__subtitle">① 準入門檻</h4>
        <FieldGroup caption="偏好門檻">
          <div className="similar-grid-3">
            {number('merchantMinimum')}{number('userMinimum')}
          </div>
          <p className="traffic-config__hint">商家標籤由眾多買家訂單聚合（賣 10 單=+10），用戶標籤僅本人訂單累加（買 10 次才+10），量級不對稱，故商家門檻應顯著高於用戶門檻。</p>
        </FieldGroup>
        {/* 带公式的参数项一律提供试算入口：形态与投流计分项试算一致（公式行 + 问号弹层 + 试算弹层）。 */}
        <FormulaRow formula="有效分 = max(0, 原始累計 − floor(經過天數 ÷ 衰變週期) × 每次減分)"
          title="標籤有效分與準入門檻" ariaLabel="標籤有效分口徑說明" trial={<DecayTrial values={trialValues} />} content={[
            { label: '計分來源', body: '商家按完成訂單商品走量，每件其標準標籤 +1；用戶按不同商品類型計分（同訂單同類型多件不重複、不同類型同標籤各 +1）。僅已完成訂單，取消與全額退款不產生增量。', tone: 'info' },
            { label: '門檻作用', body: '商家有效分 ≥ 商家門檻、用戶有效分 ≥ 用戶門檻才計入有效標籤；未達標標籤在向量中記 0，不參與匹配、覆蓋與相似度。兩側門檻獨立設定。', tone: 'warn' },
            { label: '為何兩側量級不同', body: '商家標籤由眾多買家訂單聚合（賣 10 單=+10），用戶標籤僅本人訂單累加（買 10 次=+10），因此商家預設門檻（50）顯著高於用戶（10），不可互相沿用。', tone: 'neutral' },
            { label: '衰變執行體', body: '週期/減分/閒置清理來自算法庫頂部「全局標籤衰變規則」，單一真源不分廣告副本；本處只引用不複製。A 增量刷新時鐘與 B 飽和壓縮第二階段接入後端計算。', tone: 'warn' },
          ]} />
        <h4 className="traffic-config__subtitle">② 相似度計算</h4>
        <FieldGroup caption="相似度算法（引擎級）">
          <div className="similar-grid-3">
            <Form.Item layout="horizontal" name="metric" label="相似度算法" required><Select options={[{ value: 'cosine', label: '余弦相似度' }, { value: 'weightedJaccard', label: '加權 Jaccard' }]} /></Form.Item>
          </div>
        </FieldGroup>
        <FormulaRow formula={values.metric === 'cosine' ? 'sim(A,B) = Σ(aᵢ·bᵢ) ÷ (√Σaᵢ² × √Σbᵢ²)' : 'sim(A,B) = Σ min(aᵢ,bᵢ) ÷ Σ max(aᵢ,bᵢ)'}
          title="相似度算法與口徑" ariaLabel="相似度算法說明" trial={<SimilarityTrial values={trialValues} />} content={[
            { label: '計算口徑', body: '兩側獨立篩出有效標籤，統一標籤 ID 按並集對齊，缺失一側補 0；分母使用完整向量，不只保留共同標籤。零向量不產生相似候補。', tone: 'info' },
            { label: '作用對象', body: '本引擎的相似度首先用於 被點擊商家 × 候補商家 的 I2I 比較（商家相似度準入）；同時被復用於 用戶 × 用戶 找鄰居，協同路的商家得分是 CF 投票、不是相似度本身。', tone: 'neutral' },
            { label: '指標不可混用門檻', body: '余弦對絕對量級不敏感（只看分布對齊）；加權 Jaccard 對量級敏感。切換指標後商家／用戶門檻需重新校準，不能沿用另一指標的數值。', tone: 'warn' },
          ]} />
      </PrototypeSection>
      {values.scene === 1 && <PrototypeSection readOnly={readOnly} title="推薦策略與排序（引擎級）" extra={<HelpPopover title="來源與排序" ariaLabel="推薦來源與排序說明" content={[
        { label: '商家相似', body: '被點擊商家與候選商家按有效標籤計算相似度。', tone: 'info' },
        { label: '用戶協同', body: '以用戶標籤找前 20 位相似鄰居，再彙總其有效成交商家計算 CF。不是用戶×商家直接匹配；無真實資料時該路為空。', tone: 'neutral' },
        { label: '同類目', body: '按商家主營類目碼在所選「類目匹配層級」精確比對，不虛構上級類目、不做模糊歸併；該路不產生相似度（匹配分記 0）。各路分數不直接混排，某位不足僅回補其他已啟用來源。', tone: 'neutral' },
      ]} />}>
        <FieldGroup caption="推薦模式" help={<HelpPopover title="沿用投流相似推薦規則集" ariaLabel="場景1規則集說明"
          content="本場景即投流廣告「相似推薦」模块拆出後的獨立算法，沿用其規則集：來源／準入／觸發／數量／頻控／排序均在此配置；其它場景各自獨立策略。" />}>
          {/* 合并後的唯一相似度試算入口：商家準入／用戶協同兩處彈層同源，收攏到推薦模式多選後，避免重複入口。 */}
          <div className="similar-inline-row">
            <Form.Item layout="horizontal" name="modes" label="推薦模式" rules={[{ required: true, message: '至少選擇一種來源' }]}><Checkbox.Group options={SOURCE_OPTIONS} /></Form.Item>
            <SimilarityTrial values={trialValues} />
          </div>
        </FieldGroup>
        <FieldGroup caption="商家相似度準入">
          <div className="similar-grid-3">{number('threshold', !values.modes.includes('merchantSimilar'))}</div>
          <p className="similar-prototype__hint">比較對象固定為：被點擊商家 × 候補商家；兩側都使用商家標籤門檻。</p>
          <FormulaRow formula={`入選 = sim(被點擊商家, 候補商家) × 100 ≥ ${values.threshold}%`}
            title="商家相似度準入" ariaLabel="商家相似度準入說明" content={[
              { label: '判定順序', body: '先按商家標籤門檻篩出兩側有效標籤並計算相似度，再與本門檻比對；未達標候補直接退出，不因名額不足而放寬。', tone: 'info' },
              { label: '與用戶門檻分離', body: '本門檻只約束返回後的商家相似路；用戶協同的鄰居門檻、普通投流的覆蓋比例均獨立設定。', tone: 'neutral' },
              { label: '試算邊界', body: '試算彈層使用匿名样例，不讀取真實消費者與商家數據、不產生曝光或扣量；門檻校準以同批候選的分布對照為準。', tone: 'warn' },
            ]} />
        </FieldGroup>
        <div hidden={!values.modes.includes('userSimilar')}>
          <FieldGroup caption="用戶協同準入">
            <div className="similar-grid-3">{number('userThreshold')}</div>
            <p className="similar-prototype__hint">此門檻僅用於返回後用戶協同；無真實鄰居成交資料時該路為空，不偽造結果。</p>
            <FormulaRow formula="CF(u,m) = Σ sim(u,v)·I(v 有效成交 m) ÷ Σ sim(u,v)"
              title="用戶協同與 CF 得分" ariaLabel="用戶協同口徑說明" content={[
                { label: '找鄰居', body: '當前用戶與其他用戶各取達標標籤，按並集對齊補零算相似度；排除本人、零相似與未達本門檻者，取前 20 位鄰居。', tone: 'info' },
                { label: '投票得分', body: '同一鄰居對同一商家只計一次支持；僅統計有效完成、未取消/未全額退款訂單。CF 分不是相似度本身。', tone: 'neutral' },
                { label: '輸出邊界', body: '鄰居成交過的非投流店可作行為輸入，但不能成為付費輸出；無有效鄰居時返回空候補，不構造隨機推薦。', tone: 'warn' },
              ]} />
          </FieldGroup>
        </div>
        {/* 類目層級仅在同類目來源勾選時可見可配；字段保持挂载，取消勾选不丢历史值。 */}
        <div hidden={!values.modes.includes('sameCategory')}>
          <FieldGroup caption="同類目推薦（同類目商家推薦）" help={<HelpPopover title="類目匹配層級" ariaLabel="類目匹配層級說明" content={[
            { label: '層級語義', body: '一級＝同大類（覆蓋面最寬、量大但相關性弱）；二級＝同品類（預設，兼顧相關與覆蓋）；三級＝近同細分（最準、候補最少）。', tone: 'info' },
            { label: '匹配方式', body: '按商家主營類目碼在所選層級精確比對，不虛構上級類目、不做模糊歸併；類目缺失的商家不進入該路候補。', tone: 'neutral' },
            { label: '與標籤路區分', body: '同類目不產生相似度（匹配分記 0），只作穩定保量補充；某位來源不足時仍按固定順序回補其他已啟用來源。', tone: 'warn' },
            { label: '持久化邊界', body: '服務端參數協議 v1 白名單尚未包含 categoryMatchLevel，本輪為配置預覽；第二階段隨後端白名單與校驗一併保存。', tone: 'warn' },
          ]} />}>
            <div className="similar-grid-3">
              <Form.Item layout="horizontal" name="categoryLevel" label="類目匹配層級" required><Select options={CATEGORY_LEVEL_OPTIONS} /></Form.Item>
            </div>
            <p className="similar-prototype__hint">層級越深候補越少但相關性越強；與標籤兩路不相加分數，僅在本位內排序。</p>
          </FieldGroup>
        </div>
        <FieldGroup caption="觸發條件">
          <div className="similar-grid-3">
            <Form.Item layout="horizontal" name="triggerMode" label="觸發條件" required><Select options={[{ value: 'instant', label: '無停留門檻，返回時展示' }, { value: 'dwell', label: '停留達標後，返回時展示' }]} /></Form.Item>
            {number('dwellSeconds', values.triggerMode !== 'dwell')}
          </div>
        </FieldGroup>
        <FieldGroup caption="推薦數量" help={<HelpPopover title="推薦數量" ariaLabel="推薦數量說明" content={[
          { label: '目標 1–2 家', body: '候選不足允許 0 或 1 家；不放寬履約、屏蔽、付費資格與頻控來湊數。', tone: 'warn' },
          { label: '按位取來源', body: '第 1/2 位只可選已勾選模式；某位不足時按固定順序回補其餘已啟用來源，跨位去重。', tone: 'info' },
        ]} />}>
          <div className="traffic-fields-inline">
            {number('count')}
            <Form.Item layout="horizontal" name="slot1" label="第 1 位優先來源" required><Select options={sourceOptions} /></Form.Item>
            <Form.Item layout="horizontal" name="slot2" label="第 2 位優先來源" hidden={values.count !== 2} required><Select options={sourceOptions} /></Form.Item>
          </div>
        </FieldGroup>
        {/* 频控拆用户/商家两维子标题（同投流「排序规则」①/② 模式）：触发频次限「发起推荐」，展示频控限「同商家曝光」。 */}
        <h4 className="traffic-config__subtitle">① 用戶頻控</h4>
        <FieldGroup caption="單用戶每日觸發限制">
          <div className="traffic-fields-inline">
            <Form.Item layout="horizontal" name="dailyMode" label="單用戶每日限制" required><Select options={[{ value: 'unlimited', label: '不限制業務次數' }, { value: 'limited', label: '限制次數' }]} /></Form.Item>
            {number('dailyLimit', values.dailyMode !== 'limited')}
          </div>
          <p className="similar-prototype__hint">限制「發起推薦」的頻率：達每日上限後本會話不再發起點擊後推薦，坑位交回瀑布流；與商家曝光次數分開計數。</p>
        </FieldGroup>
        <h4 className="traffic-config__subtitle">② 商家頻控</h4>
        <FieldGroup caption="同商家展示頻控" help={<HelpPopover
          title="同商家展示頻控口徑"
          ariaLabel="同商家展示頻控說明"
          width={560}
          maxHeight={420}
          content={[
            { label: '出現機制（上限非配額）', body: '「2 小時內最多 50 次」是允許出現的次數上限，不是保證出現的配額：商家每輪仍須通過召回範圍、通用準入（付費/營業/可購買）、本算法準入與排序（相似度/匹配達標），實際贏得坑位並曝光才計數一次；得分再高也不會跳過排序主動推送，不存在衰減遞減邏輯。', tone: 'info' },
            { label: '窗口口徑', body: '滾動窗口：以當前請求時刻回看「同商家統計窗口」時長（支持 0.5 小時粒度）累計曝光次數；窗口滑出即恢復資格，不整點重置、不刷新清零。', tone: 'neutral' },
            { label: '達到上限後', body: '該商家退出本算法本輪候选池，由同來源其餘候选回補；本算法候选不足時交瀑布流自然流兜底，不為湊數放寬上限或強行展示。', tone: 'warn' },
            { label: '計數範圍（獨立計數）', body: '本頻控按全域相似策略算法實例獨立計數：同一瀑布流共存無敵星星、新店廣告、投流等多種廣告類型，各類型（及同類型多實例）的頻控語義各自獨立，不跨類型或跨實例共享計數（各自在自己的表單內配置）；同一用戶在本算法內跨會話共用計數，不按坑位、頁面或算法版本清零。與其他廣告類型同屏重複由瀑布流層跨坑位去重承擔，兩層語義不同、不互相替代。', tone: 'neutral' },
          ]}
        />}>
          <div className="traffic-fields-inline">
            {number('merchantFreqHours')}{number('merchantFreqTimes')}
          </div>
          <p className="similar-prototype__hint">觸發次數與商家曝光次數分開；跨會話共用頻控，不按坑位或算法版本清零。</p>
        </FieldGroup>
        {/* 插入优先级提升为与①②同级的编号子标题（不再隶属商家频控）；配置形态参照投流「匹配路径排序」。 */}
        <h4 className="traffic-config__subtitle">③ 插入優先級</h4>
        <FieldGroup caption="插入候选打分與填充" help={<HelpPopover
          title="插入優先級口徑"
          ariaLabel="插入優先級說明"
          width={560}
          maxHeight={420}
          content={[
            { label: '作用邊界', body: '只決定本次點擊插入候选內誰先占坑（合計最多 2 家），不改變瀑布流坑位數量與本廣告其他排序。', tone: 'info' },
            { label: '與投流排序分工', body: '此處不再繼承某條投流算法的排序。自然模式禁止消耗優先或流量因子，不相容時在瀑布流引用處阻止保存與試算。', tone: 'warn' },
            { label: '因子歸一（0~1）', body: '匹配分＝商家相似度；質量＝商家質量分 ÷ 5；距離＝1 − min(直線距離 ÷ 最大直線距離, 1)；剩餘比例＝剩餘曝光 ÷ 總曝光（僅投流）；匹配標籤熱度＝商家在命中交集標籤上有效分之和 ÷ 本輪候选最大值（供給強度軸，與匹配分互補不重複）。', tone: 'neutral' },
            { label: '同分決勝與坑位填充', body: '同分按「同分決勝」打破平局（自定義模式隨已勾因子聯動顯示）；決勝仍同分時按商家 ID 確定性兜底（非選項），保證同一輸入順序可重現；某位來源不足時按固定順序回補其餘已啟用來源，跨位按商家 ID 去重。', tone: 'neutral' },
          ]}
        />}>
          <div className="traffic-fields-inline">
            <Form.Item layout="horizontal" name="rankPreset" label="排序策略" required><Select options={[{ value: 'matchFirst', label: '匹配優先' }, { value: 'consumeFirst', label: '消耗優先（僅投流模式）' }, { value: 'custom', label: '自定義因子' }]} /></Form.Item>
          </div>
          <p className="similar-prototype__hint">{values.rankPreset === 'matchFirst' ? '匹配優先＝按商家相似度得分（sim）從高到低排序；同分走「同分決勝」。' : values.rankPreset === 'consumeFirst' ? '消耗優先＝在匹配達標的商家中按流量包剩餘量從多到少排序；同分走「同分決勝」。' : '自定義因子＝所選因子歸一後等權相加，綜合分高者優先；剩餘比例不等於剩餘次數。'}</p>
          {/* 照搬投流结构：hidden 套外层裸 div——display:flex 的类会压过 [hidden] 的 UA 默认 display:none。 */}
          <div hidden={values.rankPreset !== 'custom'}>
            <div className="traffic-fields-inline">
              <Form.Item layout="horizontal" name="factors" label="參與排序因子" required={values.rankPreset === 'custom'}><Checkbox.Group options={RANK_FACTOR_OPTIONS} /></Form.Item>
            </div>
          </div>
          <div className="traffic-fields-inline">
            <Form.Item layout="horizontal" name="tieBreak" label="同分決勝" required><Select options={insertTieOptions} /></Form.Item>
          </div>
          <p className="similar-prototype__hint">{values.rankPreset === 'custom' ? '自定義模式：同分決勝只能從已勾選因子映射、隨機探索或匹配標籤熱度中選擇（隨勾選聯動顯示），未勾選的因子不會進入決勝；僅勾單因子時該同軸決勝項同樣剔除。' : '預設模式：無因子勾選，同分決勝是獨立於主排序的次級準則，用主排序未用的維度打破平局；與主排序同軸的選項已剔除（如匹配優先無「匹配分高者优先」——同分已意味着相似度相等，再比匹配分永遠打不平）。'}</p>
          <p className="similar-prototype__hint">管線：召回範圍 → 通用準入 → 相似度分（相關性，主排序）→ 可選因子（熱度/餘量/質量/距離）等權綜合 → 按坑位取前 1–2 家；插入排序只作用於本次點擊的插入候选。此處不再繼承某條投流算法的排序，自然模式禁止消耗優先或流量因子。</p>
          <FormulaRow formula={values.rankPreset === 'matchFirst' ? 'score = sim(被點擊商家, 候補商家)（匹配優先・單軸）'
            : values.rankPreset === 'consumeFirst' ? 'score = 流量包剩餘量（匹配達標者內）' : 'score = Σ(所選因子歸一分) ÷ 所選因子數'}
            title="插入排序公式" ariaLabel="插入排序公式說明" trial={<RankTrial values={trialValues} prefix="rank" />} content={[
              { label: '因子歸一', body: '匹配分＝商家相似度；質量＝商家質量分 ÷ 5；距離＝1 − min(直線距離 ÷ 最大距離, 1)；剩餘比例＝剩餘曝光 ÷ 總曝光（僅投流）；匹配標籤熱度＝命中交集標籤有效分之和 ÷ 候选最大值。', tone: 'info' },
              { label: '預設與自定義', body: '匹配優先＝只按相似度降序；自定義＝勾選因子各自歸一後等權相加，比綜合分而非單科最高。', tone: 'neutral' },
              { label: '同分決勝', body: '僅在主排序同分時啟用，不引入未勾選的維度；與主排序同軸的選項被剔除（死選項）；決勝仍同分時按商家 ID 確定性兜底（非選項），保證同一輸入順序可重現。', tone: 'warn' },
              { label: '作用邊界', body: '只決定插入候補內誰先占坑，不改變坑位數量與頻控；各路分數不跨來源混排。', tone: 'neutral' },
            ]} />
        </FieldGroup>
        {/* 插入樣式独立成编号子模块：只调消费者端回插瞬间的呈现，不碰召回/排序/计费；試算即所見。 */}
        <h4 className="traffic-config__subtitle">④ 插入樣式</h4>
        <FieldGroup caption="回插動效與高亮" help={<HelpPopover
          title="插入樣式口徑"
          ariaLabel="插入樣式說明"
          width={560}
          maxHeight={420}
          content={[
            { label: '作用邊界', body: '只影響推薦卡插入瀑布流瞬間的動效與高亮，不改變召回、準入、排序、頻控與計費；關閉動效（直接插入）不影響任何業務口徑。', tone: 'info' },
            { label: '三種風格', body: '漸變插入＝透明度＋輕縮放淡入，最不打斷瀏覽；滑入插入＝自下方滑入，強調「新出現」；直接插入＝無動效，適合低動效偏好與無障礙場景。', tone: 'neutral' },
            { label: '高亮語義', body: '插入高亮以品牌橙描邊＋微光暈短暫標記新卡，幫助用戶識別「這是剛插入的相似推薦」；高亮不改變卡片內容與扣量標記。', tone: 'warn' },
            { label: '持久化邊界', body: '動效參數當前僅供預覽與消費者端呈現，v1 協議不下發；第二階段隨 scene_config 遷移後端。', tone: 'warn' },
          ]}
        />}>
          <div className="traffic-fields-inline">
            <Form.Item layout="horizontal" name="insertStyle" label="插入動效" required><Select options={INSERT_STYLE_OPTIONS} /></Form.Item>
            <Form.Item layout="horizontal" name="insertAnimMs" label="動效時長" required>
              <InputNumber min={120} max={1200} step={60} precision={0} suffix={<span className="traffic-config__unit">ms</span>} />
            </Form.Item>
            <Form.Item layout="horizontal" name="insertHighlight" label="插入高亮" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <div className="similar-inline-row">
            <p className="similar-prototype__hint">{values.insertStyle === 'fade' ? '漸變插入：透明度＋輕縮放淡入，過渡最柔和。' : values.insertStyle === 'slide' ? '滑入插入：自下方滑入，強調新卡出現。' : '直接插入：無動效，立即占位。'}{values.insertHighlight ? ' 新卡以品牌橙描邊短暫高亮。' : ' 不施加高亮。'} 點右側試算，在匿名瀑布流中查看實際插入效果。</p>
            <InsertStyleTrial values={values} />
          </div>
        </FieldGroup>
      </PrototypeSection>}
      {values.scene !== 1 && <PrototypeSection readOnly={readOnly} title="推薦策略與排序（場景專屬）" extra={<HelpPopover title="場景獨立策略" ariaLabel="場景獨立策略說明" content={[
        { label: '為何獨立', body: '找相似為 I2I＋供給強度排序；收藏頁為 U2I 偏好強度排序；搜索引導為相關性／距離排序。各場景規則與排序不同，不共享一套 rank 配置。', tone: 'info' },
        { label: '共享底座', body: '標籤計分與全局衰變仍單一真源；場景只獨立策略／排序／觸發／展示，不複製標籤底座。', tone: 'neutral' },
      ]} />}>
        <p className="similar-prototype__hint">本場景（{sceneByCode(values.scene)?.name}）使用獨立策略與排序；標籤底座仍引用全局衰變規則。</p>
        <div className="scene-override-grid">{(SCENE_STRATEGY[sceneKey!] ?? []).map(renderSceneField)}</div>
        <h5 className="scene-override-block__title" style={{ marginTop: 12 }}>觸發與展示</h5>
        <div className="scene-override-grid">{(SCENE_OVERRIDES[sceneKey!]?.fields ?? []).map(renderSceneField)}</div>
        <p className="scene-override-note">該場景算法的保存與執行待後端場景協議（遷移 340／協議 v2）就緒；當前為配置預覽。</p>
      </PrototypeSection>}
      {readOnly && algorithmId != null && <PrototypeSection readOnly title="場景引用">
        {refs.length === 0 ? <p className="similar-prototype__hint">尚未被任何場景綁定或坑位引用；此時刪除不會被服務端引用保護阻擋。</p>
          : <ul className="similar-scene-refs">{refs.map((ref, index) => <li key={index}><span>{ref.strategyName}</span>
            <em>{ref.refType === 'similar' ? `場景綁定 · ${sceneByCode(1)?.name ?? ''}` : '基礎坑位引用'}</em></li>)}</ul>}
      </PrototypeSection>}
    </Form>
    {readOnly ? <div className="similar-prototype__footer"><span>最後更新人：{loaded.updatedBy || '—'}</span><span>最後更新：{loaded.updatedAt ?? '—'}</span></div>
      : <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        {algorithmId && canEdit && <Button icon={<SendOutlined />} onClick={handlePublish}>發布新版本</Button>}
        <Button type="primary" icon={<SaveOutlined />} disabled={!canCreate && !canEdit} loading={saving} onClick={handleSave}>保存</Button>
      </div>}
  </div>
}
