/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useMemo, useState, useId } from 'react'
import { Button, Select, Switch, message } from 'antd'
import { useAuth } from '@/contexts/AuthContext'
import HelpPopover from '@/components/HelpPopover'
import {
  fetchAdAlgorithms, fetchAdAlgorithmRevisions, fetchWaterfallRecommendation, updateWaterfallRecommendation,
  type AdAlgorithm, type AlgorithmRevision, type WaterfallRecommendation,
} from '@/api/adPromotion'
import SimilarTrialButton from './TrialButton'
import { SIMILAR_ALGO_NAME, readSimilarParams, type PrototypeValues } from './prototype'
import { SIMILAR_SCENES, sceneByCode, sceneFromParams } from './scenes'
import './index.css'

interface Props {
  /** 正式瀑布流主键；本地草稿无正式记录时不开放绑定保存 */
  waterfallId?: number
  brand?: string
  /** 1=外卖到家 2=团购到店 */
  businessType: number
  /** 1=美食外卖 2=超市百货 3=团购到店 */
  bizChannel: number
  contentType: 'store' | 'product'
  columns: 1 | 2
  readOnly: boolean
}

/** 瀑布流“展示与过滤设置”内的相似推荐场景绑定：场景注册表驱动，选择即启用意图，保存走独立 PUT。
 * 界面按 2026-11-21 用户口径保持精简：只留场景选择与引擎版本绑定，
 * 场景契约标签/描述段落/覆盖项预设块已撤除（原型算法表单侧仍保留完整配置）。 */
export default function WaterfallBinding(props: Props) {
  const { user } = useAuth()
  const key = JSON.stringify([user?.username ?? '', props.waterfallId, props.brand, props.businessType, props.bizChannel, props.contentType])
  return <BindingSession key={key} {...props} />
}

function BindingSession({ waterfallId, brand, businessType, bizChannel, contentType, columns, readOnly }: Props) {
  const id = useId()
  const [binding, setBinding] = useState<WaterfallRecommendation | null>(null)
  const [algorithms, setAlgorithms] = useState<AdAlgorithm[]>([])
  const [revisionsByAlgo, setRevisionsByAlgo] = useState<Record<number, AlgorithmRevision[]>>({})
  const [trafficOptions, setTrafficOptions] = useState<AdAlgorithm[]>([])
  const [revisionId, setRevisionId] = useState<number | undefined>(undefined)
  const [enabled, setEnabled] = useState(false)
  const [scope, setScope] = useState<1 | 2>(1)
  const [trafficIds, setTrafficIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  // 场景注册表状态：首期仅「詳情返回插入」有后端绑定持久化，其余场景仅可选择、不可保存。
  const [sceneCode, setSceneCode] = useState<number>(1)
  const scene = sceneByCode(sceneCode) ?? SIMILAR_SCENES[0]
  const persisted = scene.code === 1
  const disabled = readOnly || waterfallId == null || contentType !== 'store'
  // 引用过滤：只列出归属当前场景的引擎算法，APP 側同口径，不串場景。
  const sceneAlgorithms = useMemo(() => algorithms.filter(a => {
    try { return sceneFromParams(a.params ? JSON.parse(a.params) : null) === sceneCode } catch { return false }
  }), [algorithms, sceneCode])

  useEffect(() => {
    if (!brand) { setAlgorithms([]); setTrafficOptions([]); return }
    let active = true
    fetchAdAlgorithms({ page: 1, size: 100, algoType: 17, status: 1, brand, usage: 'scenario' })
      .then(res => { if (active) setAlgorithms(res.records ?? []) }).catch(() => { if (active) setAlgorithms([]) })
    fetchAdAlgorithms({ page: 1, size: 200, algoType: 15, status: 1, brand })
      .then(res => { if (active) setTrafficOptions(res.records ?? []) }).catch(() => { if (active) setTrafficOptions([]) })
    return () => { active = false }
  }, [brand])
  useEffect(() => {
    if (waterfallId == null) { setBinding(null); return }
    let active = true
    fetchWaterfallRecommendation(waterfallId)
      .then(res => {
        if (!active) return
        setBinding(res)
        if (res.configured) {
          // 当前后端只会返回已持久化的场景 1；注册表就绪后多场景绑定直接按 sceneCode 恢复。
          setSceneCode(sceneByCode(res.sceneCode)?.code ?? 1)
          setRevisionId(res.algorithmRevisionId)
          setEnabled(res.enabled === 1)
          setScope(res.candidateScope === 2 ? 2 : 1)
          setTrafficIds(res.trafficAlgorithmIds ?? [])
        }
      })
      .catch(() => { if (active) setBinding(null) })
    return () => { active = false }
  }, [waterfallId])
  // 版本选项随可用算法一次性拉取；算法停用后其版本不再作为新选项，已绑定版本显示为失效。
  useEffect(() => {
    if (sceneAlgorithms.length === 0) { setRevisionsByAlgo({}); return }
    let active = true
    Promise.all(sceneAlgorithms.map(a => fetchAdAlgorithmRevisions(a.id as number).catch(() => [] as AlgorithmRevision[])))
      .then(lists => { if (!active) return
        const map: Record<number, AlgorithmRevision[]> = {}
        sceneAlgorithms.forEach((a, i) => { map[a.id as number] = lists[i] })
        setRevisionsByAlgo(map)
      })
    return () => { active = false }
  }, [sceneAlgorithms])

  const allRevisions = useMemo(() => Object.values(revisionsByAlgo).flat(), [revisionsByAlgo])
  const selectedRevision = allRevisions.find(r => r.id === revisionId)
  const trialValues: PrototypeValues | null = useMemo(() => {
    if (!selectedRevision) return null
    try {
      // 名称不属于参数协议：试算展示用算法名补齐，避免校验把试算挡在名称上。
      return { ...readSimilarParams(selectedRevision.params, businessType === 2 ? 'groupBuy' : 'delivery'),
        name: selectedRevision.algorithmName || SIMILAR_ALGO_NAME }
    } catch { return null }
  }, [selectedRevision, businessType])
  // 试算使用匿名权益样例：真实扣量以服务端允许集合与订单权益为准。
  const trialBinding = { enabled: !!selectedRevision && enabled, trafficOnly: scope === 2, trafficSources: scope === 2 && trafficIds.length > 0 ? ['sample-traffic-a', 'sample-traffic-b'] : [] }
  const blocked = !persisted ? ''
    : contentType !== 'store' ? '本期僅支援商家內容；商品瀑布流暫不開放相似推薦綁定。'
    : waterfallId == null ? '請先保存為正式瀑布流記錄，再配置場景綁定。'
    : revisionId != null && !selectedRevision ? '已綁定版本不可用（算法停用或版本缺失），請改選或停用綁定。'
    : !selectedRevision ? '請選擇算法與已發布版本；未選擇即禁用。'
    : scope === 2 && trafficIds.length === 0 ? '僅投流候選必須至少選擇一個允許的投流算法。' : ''

  const handleSave = async () => {
    if (disabled || !persisted || waterfallId == null || !selectedRevision) return
    setSaving(true)
    try {
      const saved = await updateWaterfallRecommendation(waterfallId, {
        sceneCode: 1, algorithmRevisionId: selectedRevision.id, enabled: enabled ? 1 : 0,
        candidateScope: scope, businessType, bizChannel, trafficAlgorithmIds: scope === 2 ? trafficIds : [],
        expectedVersion: binding?.configured ? binding.version : null,
      })
      setBinding(saved)
      message.success('相似推薦場景綁定已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  return <div className="similar-binding" aria-label="相似推薦場景綁定">
    <div className="similar-binding__label"><label htmlFor={`${id}-scene`}>推薦場景</label>
      <HelpPopover title="場景註冊表與綁定" ariaLabel="多場景綁定說明" content={[
        { label: '場景契約', body: '每個場景由註冊表聲明觸發／種子／展示／付費資格四項契約；引擎版本被多場景復用，場景差異由算法實例承載。', tone: 'info' },
        { label: '詳情返回插入', body: '綁定持久化已開放：選定發布版本後所有商家詳情返回統一使用該規則。', tone: 'neutral' },
        { label: '找相似／收藏／搜索', body: '綁定持久化與真實渲染待遷移 340 與專屬瀑布流／APP 契約；此處先固化契約，不計入已啟用。', tone: 'warn' },
      ]} />
    </div>
    <Select id={`${id}-scene`} aria-label="推薦場景" value={sceneCode} disabled={disabled}
      onChange={setSceneCode}
      options={SIMILAR_SCENES.map(item => ({ value: item.code, disabled: item.status === 'reserved',
        label: `${item.icon} ${item.name}${item.status === 'reserved' ? '（預留・不可綁定）' : ''}` }))} />
    {persisted && <div className="similar-binding__engine">
      <div className="similar-binding__label"><label htmlFor={`${id}-revision`}>引擎版本</label>
        <HelpPopover title={SIMILAR_ALGO_NAME} ariaLabel="全域相似策略說明" content={[
          { label: '統一觸發', body: '綁定發布版本後，所有商家詳情返回統一使用這條規則，不因投流、星星、新店或自然位置而分別觸發。未選擇版本即禁用。', tone: 'info' },
          { label: '候選範圍', body: '全部合格商家採自然推薦，不扣廣告額度；僅投流模式只選允許集合內的有效權益商家，按有效曝光扣量。候選不足不自動放寬。', tone: 'neutral' },
          { label: '版本語義', body: '編輯算法不會改變已綁定版本；升級需在算法頁發布新版本後在此顯式改選。', tone: 'warn' },
        ]} />
        {trialValues && <SimilarTrialButton values={trialValues} binding={trialBinding} columns={columns} disabled={!enabled || !!blocked} />}
      </div>
      <Select id={`${id}-revision`} aria-label="引擎版本" value={revisionId} disabled={disabled} allowClear showSearch optionFilterProp="label"
        placeholder={waterfallId == null ? '需正式瀑布流記錄' : '未選擇即禁用'}
        onChange={value => setRevisionId(value)}
        notFoundContent="請先在算法庫建立並發布全域相似策略算法"
        options={allRevisions.map(r => ({ value: r.id, label: `${r.algorithmName ?? '算法'} · V${r.revision}` }))} />
      {selectedRevision && <div className="similar-binding__options">
        <label htmlFor={`${id}-enabled`}>啟用場景</label>
        <Switch id={`${id}-enabled`} disabled={disabled} checked={enabled} onChange={setEnabled} />
        <label htmlFor={`${id}-scope`}>候選範圍</label>
        <Select id={`${id}-scope`} value={scope} disabled={disabled}
          options={[{ value: 1, label: '全部合格商家（自然推薦）' }, { value: 2, label: '僅有效投流商家（有效曝光扣量）' }]}
          onChange={value => setScope(value)} />
        {scope === 2 && <><label htmlFor={`${id}-traffic`}>允許的投流算法</label>
          <Select id={`${id}-traffic`} mode="multiple" allowClear disabled={disabled} placeholder="至少選擇一個"
            value={trafficIds} onChange={setTrafficIds}
            options={trafficOptions.map(a => ({ value: a.id as number, label: `${a.algoName}（${a.algoCode}）` }))} /></>}
        <Button size="small" type="primary" disabled={disabled || !!blocked || saving} onClick={handleSave}>保存綁定</Button>
      </div>}
    </div>}
    {!persisted && <p role="status" className="similar-binding__pending">該場景綁定持久化與執行待遷移 340 及專屬瀑布流／APP 契約，當前不可綁定。</p>}
    {blocked && <p role="status" className="similar-binding__error">{blocked}</p>}
  </div>
}
