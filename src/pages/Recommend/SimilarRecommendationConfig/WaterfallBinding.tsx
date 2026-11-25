/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useMemo, useState, useId } from 'react'
import { Button, Select, Switch, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import HelpPopover from '@/components/HelpPopover'
import {
  fetchAdAlgorithms, fetchAdAlgorithmRevisions, fetchWaterfallRecommendation, updateWaterfallRecommendation,
  type AdAlgorithm, type AlgorithmRevision, type WaterfallRecommendation,
} from '@/api/adPromotion'
import SimilarTrialButton from './TrialButton'
import { SIMILAR_ALGO_NAME, readSimilarParams, type PrototypeValues } from './prototype'
import { sceneFromParams } from './scenes'
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

/** 瀑布流“展示與過濾設置”内的相似推荐场景绑定：选择即启用意图，保存走独立 PUT。
 * 界面按 2026-11-25 用户口径精简：删除「引擎版本」手选，字段更名「交互式推薦算法」且非必填——
 * 啟用開關可隨時關閉（關閉即不啟用綁定），算法下拉可清空；保存绑定时自动引用该算法最新已发布版本。
 * 与展示佈局／過濾不喜歡／自然流量兜底算法同排四配置（表单侧栅格 minmax 220 保证四列）。 */
export default function WaterfallBinding(props: Props) {
  const { user } = useAuth()
  const key = JSON.stringify([user?.username ?? '', props.waterfallId, props.brand, props.businessType, props.bizChannel, props.contentType])
  return <BindingSession key={key} {...props} />
}

function BindingSession({ waterfallId, brand, businessType, bizChannel, contentType, columns, readOnly }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const [binding, setBinding] = useState<WaterfallRecommendation | null>(null)
  const [algorithms, setAlgorithms] = useState<AdAlgorithm[]>([])
  const [revisionsByAlgo, setRevisionsByAlgo] = useState<Record<number, AlgorithmRevision[]>>({})
  const [trafficOptions, setTrafficOptions] = useState<AdAlgorithm[]>([])
  const [algorithmId, setAlgorithmId] = useState<number | undefined>(undefined)
  const [enabled, setEnabled] = useState(false)
  const [scope, setScope] = useState<1 | 2>(1)
  const [trafficIds, setTrafficIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const disabled = readOnly || waterfallId == null || contentType !== 'store'
  // 引用过滤：只列出交互式推薦（场景 1）的引擎算法，APP 側同口径，不串場景。
  const sceneAlgorithms = useMemo(() => algorithms.filter(a => {
    try { return sceneFromParams(a.params ? JSON.parse(a.params) : null) === 1 } catch { return false }
  }), [algorithms])
  const selectedAlgorithm = sceneAlgorithms.find(a => a.id === algorithmId)
  // 引擎版本不再手选：保存时自动引用该算法最新已发布版本（列表首项即最新版本）。
  const selectedRevision = selectedAlgorithm ? revisionsByAlgo[selectedAlgorithm.id as number]?.[0] : undefined

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
          setAlgorithmId(res.algorithmId)
          setEnabled(res.enabled === 1)
          setScope(res.candidateScope === 2 ? 2 : 1)
          setTrafficIds(res.trafficAlgorithmIds ?? [])
        }
      })
      .catch(() => { if (active) setBinding(null) })
    return () => { active = false }
  }, [waterfallId])
  // 版本随可用算法一次性拉取，仅用于取各算法最新发布版与试算参数；算法停用后不再作为新选项。
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
  const blocked = contentType !== 'store' ? t('recommend.similar.binding.productBlocked', { defaultValue: '本期僅支援商家內容；商品瀑布流暫不開放相似推薦綁定。' })
    : waterfallId == null ? t('recommend.similar.binding.draftBlocked', { defaultValue: '請先保存為正式瀑布流記錄，再配置場景綁定。' })
    : enabled && !selectedAlgorithm ? t('recommend.similar.binding.needAlgorithm', { defaultValue: '開啟後須選擇交互式推薦算法；不需要請關閉開關。' })
    : enabled && selectedAlgorithm && !selectedRevision ? t('recommend.similar.binding.needRevision', { defaultValue: '所選算法尚未發布版本，請先在算法庫發布新版本後再保存綁定。' })
    : enabled && selectedAlgorithm && scope === 2 && trafficIds.length === 0 ? t('recommend.similar.binding.needTraffic', { defaultValue: '僅投流候選必須至少選擇一個允許的投流算法。' }) : ''
  // 已配置過綁定但當前關閉/清空：仍允許保存以持久化「停用」，版本沿用上次綁定值。
  const canPersistOff = !!binding?.configured && (!enabled || !selectedAlgorithm)

  const handleSave = async () => {
    if (disabled || waterfallId == null) return
    setSaving(true)
    try {
      // 版本由服务端解析该算法的「最新已发布版本」（2026-11-25）：客户端不再拼 algorithmRevisionId；
      // 停用/清空时不传 algorithmId，服务端沿用上次绑定版本持久化 enabled=0。
      const saved = await updateWaterfallRecommendation(waterfallId, {
        sceneCode: 1, algorithmId: selectedAlgorithm?.id, enabled: enabled ? 1 : 0,
        candidateScope: scope, businessType, bizChannel, trafficAlgorithmIds: scope === 2 ? trafficIds : [],
        expectedVersion: binding?.configured ? binding.version : null,
      })
      setBinding(saved)
      message.success(t('recommend.similar.binding.saved', { defaultValue: '相似推薦場景綁定已保存' }))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('recommend.similar.binding.saveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  return <div className="similar-binding" aria-label={t('recommend.similar.binding.aria', { defaultValue: '交互式推薦算法綁定' })}>
    <div className="similar-binding__label"><label htmlFor={`${id}-algorithm`}>{t('recommend.similar.binding.field', { defaultValue: '交互式推薦算法' })}</label>
      <HelpPopover title={t('recommend.similar.binding.helpTitle', { defaultValue: '交互式推薦綁定口徑' })} ariaLabel={t('recommend.similar.binding.helpAria', { defaultValue: '交互式推薦綁定說明' })} content={[
        { label: t('recommend.similar.binding.helpScope', { defaultValue: '綁定口徑' }), body: t('recommend.similar.binding.helpScopeBody', { defaultValue: '直接選取「全域相似策略」算法庫·交互式推薦頁簽下配置的算法實例；非必填，開關關閉或清空選擇即不啟用綁定。保存時自動引用該算法最新發布版本。' }), tone: 'info' },
        { label: t('recommend.similar.binding.helpVersion', { defaultValue: '版本語義' }), body: t('recommend.similar.binding.helpVersionBody', { defaultValue: '算法編輯或新發布不會自動改變已綁定版本；需在本處重新保存綁定纔會升級到最新發布版本，運行側只讀綁定版本。' }), tone: 'warn' },
        { label: t('recommend.similar.binding.helpContract', { defaultValue: '場景契約' }), body: t('recommend.similar.binding.helpContractBody', { defaultValue: '每個場景由註冊表聲明觸發／種子／展示／付費資格四項契約；其它場景綁定待遷移 340 與專屬瀑布流／APP 契約，當前僅交互式推薦可綁定。' }), tone: 'neutral' },
      ]} />
      {trialValues && <SimilarTrialButton values={trialValues} binding={trialBinding} columns={columns} disabled={!enabled || !!blocked} />}
    </div>
    <div className="similar-binding__row">
      <Switch id={`${id}-enabled`} aria-label={t('recommend.similar.binding.enableAria', { defaultValue: '啟用交互式推薦' })} disabled={disabled} checked={enabled} onChange={setEnabled} checkedChildren={t('recommend.trafficCfg.on', { defaultValue: '開啟' })} unCheckedChildren={t('recommend.trafficCfg.off', { defaultValue: '關閉' })} />
      <Select id={`${id}-algorithm`} aria-label={t('recommend.similar.binding.field', { defaultValue: '交互式推薦算法' })} value={algorithmId} disabled={disabled || !enabled} allowClear showSearch optionFilterProp="label"
        placeholder={t('recommend.similar.binding.placeholder', { defaultValue: '未啟用（可不選）' })}
        onChange={setAlgorithmId}
        notFoundContent={t('recommend.similar.binding.notFound', { defaultValue: '請先在算法庫「全域相似策略」的交互式推薦頁簽新增算法並發布版本' })}
        options={sceneAlgorithms.map(a => ({ value: a.id as number, label: `${a.algoName}（${a.algoCode}）` }))} />
    </div>
    {enabled && selectedAlgorithm && <div className="similar-binding__options">
      <label htmlFor={`${id}-scope`}>{t('recommend.similar.binding.candidateScope', { defaultValue: '候選範圍' })}</label>
      <Select id={`${id}-scope`} value={scope} disabled={disabled}
        options={[{ value: 1, label: t('recommend.similar.binding.scopeNatural', { defaultValue: '全部合格商家（自然推薦）' }) }, { value: 2, label: t('recommend.similar.binding.scopeTraffic', { defaultValue: '僅有效投流商家（有效曝光扣量）' }) }]}
        onChange={value => setScope(value)} />
      {scope === 2 && <><label htmlFor={`${id}-traffic`}>{t('recommend.similar.binding.trafficAlgorithms', { defaultValue: '允許的投流算法' })}</label>
        <Select id={`${id}-traffic`} mode="multiple" allowClear disabled={disabled} placeholder={t('recommend.similar.binding.trafficPlaceholder', { defaultValue: '至少選擇一個' })}
          value={trafficIds} onChange={setTrafficIds}
          options={trafficOptions.map(a => ({ value: a.id as number, label: `${a.algoName}（${a.algoCode}）` }))} /></>}
      <Button size="small" type="primary" disabled={disabled || !!blocked || saving} onClick={handleSave}>{t('recommend.similar.binding.save', { defaultValue: '保存綁定' })}</Button>
    </div>}
    {canPersistOff && <div className="similar-binding__options">
      <Button size="small" type="primary" disabled={disabled || saving} onClick={handleSave}>{t('recommend.similar.binding.saveOff', { defaultValue: '保存綁定（停用）' })}</Button>
    </div>}
    {blocked && <p role="status" className="similar-binding__error">{blocked}</p>}
  </div>
}
