import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Select, Space, message, Table, Tag, Switch, Popover, Modal, Radio, Alert, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, QuestionCircleOutlined, AppstoreOutlined, ShopOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons'
import BrandTag from '../components/BrandTag'
import DetailPageHeader from '../components/DetailPageHeader'
import {
  fetchAdAlgorithms, fetchWaterfallDetail, createWaterfall, updateWaterfall,
} from '../api/adPromotion'
import { isBackendUnavailable } from '../api/request'
import type { WaterfallStrategyRequest } from '../api/adPromotion'
import { fetchWaterfallCategories, fetchCategoryCandidates, fetchCatalogByIds } from '../api/waterfallCatalog'
import { parseWaterfallExcel, resolveWaterfallImport, createWaterfallImportTemplate, type WaterfallImportIssue } from './waterfallConfig/waterfallImport'
import type { WaterfallCategory } from '../api/waterfallCatalog'
import {
  type WaterfallBusinessType, type WaterfallContentType, type WaterfallLayoutColumns,
  type AlgoSlotDraft, type FixedContentSlot, type WaterfallDraft, type WaterfallBizChannel, type WaterfallDisplayCategoryMode, type WaterfallSortMode,
  ALGO_TYPE_LABEL, ALGO_TYPE_COLOR,
  CONTENT_TYPE_OPTIONS, LAYOUT_OPTIONS, BUSINESS_TYPE_LABEL_KEY, BIZ_CHANNEL_OPTIONS,
  serverKey, localKey, getDisplayCategoryMode, GROUP_BUY_CHANNEL, SUPERMARKET_CHANNEL, NATURAL_ALGORITHM_TYPE, DEFAULT_WATERFALL_SORT,
} from './waterfallConfig/types'
import {
  getExtension, setExtension, getLocalStrategy, upsertLocalStrategy,
  buildDraftFromServer, newLocalId,
} from './waterfallConfig/waterfallExtStore'
import { writeDraft, readDraft, clearDraft, newSessionKey } from './waterfallConfig/waterfallDraft'
import { buildGroupBuyPreview, type PreviewCard } from './waterfallConfig/previewLayout'
import WaterfallPreview from './waterfallConfig/WaterfallPreview'

/** 品牌选项（与后端 brand 枚举对齐） */
const APP_OPTIONS = [
  { labelKey: 'common:flashBee', value: 'flashBee' },
  { labelKey: 'recommend:appMfood', value: 'mFood' },
]
const APP_LABEL: Record<string, string> = { flashBee: 'common:flashBee', mFood: 'recommend:appMfood' }

/** 可选算法条目 */
interface AlgorithmOption { label: string; value: string; type: number; brand?: string }

/** 团购候选资源条目（预览补位用） */
interface CandidateLite { id: string; name: string; image?: string; rating?: number; monthlySales?: number; price?: number; originPrice?: number; distance?: string; deliveryTime?: string }

export default function PromotionSlotConfigAdd() {
  const [params] = useSearchParams()
  const identity = params.get('localId') ? `local_${params.get('localId')}` : params.get('id') ? `server_${params.get('id')}` : `new_${params.get('biz') || 'delivery'}_${params.get('draftKey') || 'initial'}`
  return <PromotionSlotConfigForm key={identity} />
}

function PromotionSlotConfigForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const editIdParam = searchParams.get('id') || ''
  const localIdParam = searchParams.get('localId') || ''
  const bizParam = (searchParams.get('biz') as WaterfallBusinessType | null) || 'delivery'
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'

  const isLocal = !!localIdParam
  const isServer = !isLocal && !!editIdParam
  const isEdit = isLocal || isServer
  const isNew = !isEdit

  const [form] = Form.useForm<{ promotionName: string; app: string }>()
  const brand: string | undefined = Form.useWatch('app', form)
  /** 业务线：新增来自 Tab 参数；编辑来自记录 */
  const [businessType, setBusinessType] = useState<WaterfallBusinessType>(isNew ? bizParam : 'delivery')
  const [contentType, setContentType] = useState<WaterfallContentType>('store')
  const [displayCategoryMode, setDisplayCategoryMode] = useState<WaterfallDisplayCategoryMode>('algorithm')
  const [strategyStatus, setStrategyStatus] = useState<1 | 2>(1)
  const [sortMode, setSortMode] = useState<WaterfallSortMode>(DEFAULT_WATERFALL_SORT)
  const [importing, setImporting] = useState(false)
  const [importIssues, setImportIssues] = useState<WaterfallImportIssue[]>([])
  const importBusyRef = useRef(false)
  const [layoutColumns, setLayoutColumns] = useState<WaterfallLayoutColumns>(1)
  /** 外卖到家业务频道（美食外卖/超市百货） */
  const [bizChannel, setBizChannel] = useState<WaterfallBizChannel>('food')
  const [filterDislike, setFilterDislike] = useState(false)
  const [naturalAlgoId, setNaturalAlgoId] = useState<string | undefined>(undefined)
  const [naturalAlgoName, setNaturalAlgoName] = useState<string | undefined>(undefined)
  const [algoSlots, setAlgoSlots] = useState<AlgoSlotDraft[]>([])
  const [fallbackCategoryIds, setFallbackCategoryIds] = useState<string[]>([])
  const [fixedSlots, setFixedSlots] = useState<FixedContentSlot[]>([])
  /** 草稿归属 key（表单页 <-> 坑位页传递用） */
  const [draftKey, setDraftKey] = useState<string>(() => {
    if (localIdParam) return localKey(localIdParam)
    if (editIdParam) return serverKey(Number(editIdParam))
    const sessionKey = searchParams.get('draftKey')
    return sessionKey?.startsWith(`new_${bizParam}_`) ? sessionKey : newSessionKey(bizParam)
  })
  const [algorithmOptions, setAlgorithmOptions] = useState<AlgorithmOption[]>([])
  const [categories, setCategories] = useState<WaterfallCategory[]>([])
  const [candidates, setCandidates] = useState<CandidateLite[]>([])
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [phoneTime, setPhoneTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })

  const isGroupBuy = businessType === 'groupBuy'
  const isSupermarket = !isGroupBuy && bizChannel === 'supermarket'
  const supportsContentConfig = isGroupBuy || isSupermarket
  const catalogChannel = isSupermarket ? 'supermarket' : 'groupBuy'
  const algorithmChannel = isGroupBuy ? GROUP_BUY_CHANNEL : isSupermarket ? SUPERMARKET_CHANNEL : undefined
  const useAlgorithmSlots = !supportsContentConfig || displayCategoryMode === 'algorithm'

  const applyDraft = useCallback((d: WaterfallDraft) => {
    form.setFieldsValue({ promotionName: d.strategyName, app: d.brand })
    setBusinessType(d.businessType)
    setContentType(d.contentType)
    setDisplayCategoryMode(getDisplayCategoryMode(d))
    setSortMode(d.sortMode ?? DEFAULT_WATERFALL_SORT)
    setStrategyStatus(d.status ?? 1)
    setLayoutColumns(d.layoutColumns)
    setBizChannel(d.bizChannel ?? 'food')
    setFilterDislike(d.filterDislike === 1)
    setNaturalAlgoId(d.naturalAlgoId ?? undefined)
    setNaturalAlgoName(d.naturalAlgoName)
    setAlgoSlots(d.algoSlots)
    setFallbackCategoryIds(d.fallbackCategoryIds)
    setFixedSlots(d.fixedSlots)
    setDraftKey(d.key)
  }, [form])

  useEffect(() => {
    if (isNew && searchParams.get('draftKey') !== draftKey) {
      const params = new URLSearchParams(searchParams)
      params.set('draftKey', draftKey)
      setSearchParams(params, { replace: true })
    }
  }, [isNew, searchParams, draftKey, setSearchParams])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setPhoneTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
    }
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  /** 加载算法库（外卖兜底/坑位；团购不使用假算法） */
  useEffect(() => {
    let active = true
    setAlgorithmOptions([])
    fetchAdAlgorithms({ page: 1, size: 200, status: 1, ...(supportsContentConfig ? { brand, channel: algorithmChannel } : {}) })
      .then(res => {
        const filtered = (res.records ?? []).filter(a => a.algoCode && !a.algoCode.startsWith('SFJZ') && (!supportsContentConfig || (a.channel === algorithmChannel && a.brand === brand)))
        if (active) setAlgorithmOptions(filtered.map(a => ({ label: a.algoName, value: a.algoCode, type: a.algoType, brand: a.brand })))
      })
      .catch(() => { /* 保留降级空选项 */ })
    return () => { active = false }
  }, [supportsContentConfig, algorithmChannel, brand])

  /** 团购分类 */
  useEffect(() => {
    setCategories([])
    if (!supportsContentConfig || useAlgorithmSlots || !brand) return
    let active = true
    fetchWaterfallCategories(contentType, brand, catalogChannel).then(list => { if (active) setCategories(list) }).catch(() => { if (active) setCategories([]) })
    return () => { active = false }
  }, [supportsContentConfig, useAlgorithmSlots, contentType, brand, catalogChannel])

  /** 团购候选（预览补位） */
  useEffect(() => {
    setCandidates([])
    if (!supportsContentConfig || useAlgorithmSlots || !brand || fallbackCategoryIds.length === 0) return
    let active = true
    const exclude = fixedSlots.filter(s => s.status === 1).map(s => s.itemId)
    fetchCategoryCandidates({ contentType, brand, categoryIds: fallbackCategoryIds, excludeItemIds: exclude, sortMode, channel: catalogChannel, limit: 20 })
      .then(list => { if (active) setCandidates(list) })
      .catch(() => { if (active) setCandidates([]) })
    return () => { active = false }
  }, [supportsContentConfig, useAlgorithmSlots, contentType, fallbackCategoryIds, fixedSlots, brand, sortMode, catalogChannel])

  /** 自然流量兜底算法选项（算法库 algoType=7） */
  const naturalAlgoOptions = useMemo(() => algorithmOptions.filter(a => a.type === NATURAL_ALGORITHM_TYPE), [algorithmOptions])

  /** 编辑/详情：加载数据 */
  useEffect(() => {
    const key = isLocal ? localKey(localIdParam) : isServer ? serverKey(Number(editIdParam)) : draftKey
    const returned = readDraft(key)
    if (returned && !isDetailMode && (!isNew || returned.businessType === bizParam)) {
      applyDraft(returned)
      setHasUnsavedChanges(true)
      return
    }
    if (isNew) return
    if (isLocal) {
      const d = getLocalStrategy(localIdParam)
      if (d) applyDraft(d)
      else message.error(t('promotionSlotConfig:recordNotFound'))
      return
    }
    let active = true
    const id = Number(editIdParam)
    fetchWaterfallDetail(id)
      .then(detail => { if (active) applyDraft(buildDraftFromServer(detail, getExtension(id))) })
      .catch(err => {
        if (!active) return
        if (isBackendUnavailable(err)) message.warning(t('promotionSlotConfig:backendUnavailable'))
        else message.error(t('promotionSlotConfig:loadDetailFailed'))
      })
    return () => { active = false }
  }, [editIdParam, localIdParam, location.key, isNew, isLocal, isServer, isDetailMode, draftKey, bizParam, applyDraft, t])

  /** 组装当前草稿 */
  const buildDraft = (): WaterfallDraft => {
    const values = form.getFieldsValue()
    return {
      key: draftKey,
      source: isLocal || isGroupBuy || (!isServer && !useAlgorithmSlots) ? 'local' : 'server',
      id: isServer ? Number(editIdParam) : undefined,
      localId: isLocal ? localIdParam : (isNew && (isGroupBuy || !useAlgorithmSlots) ? draftKey.replace(/^new_/, '') : undefined),
      strategyName: values.promotionName || '',
      brand: values.app,
      businessType,
      contentType,
      displayCategoryMode: useAlgorithmSlots ? 'algorithm' : displayCategoryMode,
      sortMode,
      layoutColumns,
      bizChannel,
      filterDislike: filterDislike ? 1 : 2,
      status: strategyStatus,
      naturalAlgoId: useAlgorithmSlots ? naturalAlgoId ?? null : null,
      naturalAlgoName: useAlgorithmSlots ? naturalAlgoName : undefined,
      algoSlots: useAlgorithmSlots ? algoSlots : [],
      fallbackCategoryIds: useAlgorithmSlots ? [] : fallbackCategoryIds,
      fixedSlots: useAlgorithmSlots ? [] : fixedSlots,
      businessConfirmed: true,
    }
  }

  /** 进入坑位配置页 */
  const handleGoSlots = async () => {
    if (importBusyRef.current) return
    try { await form.validateFields() } catch { return }
    if (!writeDraft(buildDraft())) { message.error(t('promotionSlotConfig:localSaveFailed')); return }
    const q = new URLSearchParams({ key: draftKey })
    if (isDetailMode) q.set('mode', 'detail')
    navigate(`/promotion-slot-config-slots?${q.toString()}`)
  }

  /** 内容类型切换（团购）：清理不兼容的分类/坑位 */
  const handleChangeContentType = (next: WaterfallContentType) => {
    if (next === contentType || importBusyRef.current) return
    setImportIssues([])
    const hasConfig = fallbackCategoryIds.length > 0 || fixedSlots.length > 0
    if (!hasConfig) { setContentType(next); setHasUnsavedChanges(true); return }
    Modal.confirm({
      title: t('promotionSlotConfig:switchContentTypeTitle'),
      className: 'custom-confirm-modal',
      content: t('promotionSlotConfig:switchContentTypeContent'),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      onOk: () => { setContentType(next); setFallbackCategoryIds([]); setFixedSlots([]); setHasUnsavedChanges(true) },
    })
  }

  /** 品牌切换（团购）：清理不兼容配置 */
  const handleChangeBrand = () => {
    if (!supportsContentConfig) return
    setImportIssues([])
    setFallbackCategoryIds([])
    setFixedSlots([])
    setAlgoSlots([])
    setNaturalAlgoId(undefined)
    setNaturalAlgoName(undefined)
    setCandidates([])
  }

  const handleChangeBizChannel = (next: WaterfallBizChannel) => {
    if (next === bizChannel) return
    const apply = () => {
      setBizChannel(next)
      setContentType('store')
      setDisplayCategoryMode('algorithm')
      setFallbackCategoryIds([])
      setFixedSlots([])
      setAlgoSlots([])
      setNaturalAlgoId(undefined)
      setNaturalAlgoName(undefined)
      setImportIssues([])
      setHasUnsavedChanges(true)
    }
    if (fixedSlots.length || algoSlots.length || fallbackCategoryIds.length || naturalAlgoId) {
      Modal.confirm({ title: t('promotionSlotConfig:switchChannelTitle'), content: t('promotionSlotConfig:switchChannelHint'), className: 'custom-confirm-modal', okText: t('common:confirm'), cancelText: t('common:cancel'), onOk: apply })
    } else apply()
  }

  const toggleSlotStatus = (position: number) => {
    if (!useAlgorithmSlots) setFixedSlots(prev => prev.map(s => s.position === position ? { ...s, status: s.status === 1 ? 2 : 1 } : s))
    else setAlgoSlots(prev => prev.map(s => s.position === position ? { ...s, status: s.status === 1 ? 2 : 1 } : s))
    setHasUnsavedChanges(true)
  }

  const deleteSlot = (position: number) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      className: 'custom-confirm-modal',
      content: t(useAlgorithmSlots ? 'promotionSlotConfig:deleteSlotConfirm' : 'promotionSlotConfig:deleteFixedSlotConfirm', { pos: position }),
      okText: t('common:confirm'), cancelText: t('common:cancel'), okButtonProps: { danger: true },
      onOk: () => {
        if (!useAlgorithmSlots) setFixedSlots(prev => prev.filter(s => s.position !== position))
        else setAlgoSlots(prev => prev.filter(s => s.position !== position))
        setHasUnsavedChanges(true)
      },
    })
  }

  const handleReturnToList = () => {
    clearDraft()
    navigate(`/promotion-slot-config?biz=${businessType}`)
  }

  const handleBack = () => {
    if (importBusyRef.current) return
    if (hasUnsavedChanges && !isDetailMode) {
      Modal.confirm({
        title: t('promotionSlotConfig:discardConfirmTitle'),
        content: t('promotionSlotConfig:discardConfirmContent'),
        okText: t('promotionSlotConfig:discardConfirmOk'), cancelText: t('promotionSlotConfig:discardConfirmCancel'),
        okButtonProps: { danger: true },
        className: 'custom-confirm-modal',
        onOk: handleReturnToList,
      })
    } else handleReturnToList()
  }

  const handleSave = async () => {
    if (importBusyRef.current) return
    try {
      const values = await form.validateFields()
      if (useAlgorithmSlots && !naturalAlgoId) { message.warning(t('promotionSlotConfig:fallbackAlgoRequired')); return }
      if (supportsContentConfig && displayCategoryMode === 'category' && fallbackCategoryIds.length === 0) { message.warning(t('promotionSlotConfig:categoryFallbackRequired')); return }
      if (supportsContentConfig && displayCategoryMode === 'custom' && fallbackCategoryIds.length === 0 && !fixedSlots.some(s => s.status === 1)) { message.warning(t('promotionSlotConfig:customContentRequired')); return }
      setSaving(true)

      if (isServer && isSupermarket && !useAlgorithmSlots) {
        const draft = buildDraft()
        const ok = setExtension(Number(editIdParam), { businessType, bizChannel, contentType, displayCategoryMode, sortMode, layoutColumns, fallbackCategoryIds, fixedSlots, confirmed: true, localDraft: draft })
        if (!ok) { message.error(t('promotionSlotConfig:localSaveFailed')); return }
        message.success(t('promotionSlotConfig:localSaveSuccess'))
        handleReturnToList()
        return
      }

      if (!isGroupBuy && !isLocal && useAlgorithmSlots) {
        // 外卖：基础字段走后端接口，扩展字段走本地
        const request: WaterfallStrategyRequest = {
          strategyName: values.promotionName,
          brand: values.app,
          naturalAlgoId: naturalAlgoId ?? null,
          filterDislike: filterDislike ? 1 : 2,
          status: isServer ? undefined : 1,
          slots: algoSlots.map(item => ({ slotPosition: item.position, algoId: item.algorithmId, status: item.status })),
        }
        let serverId = isServer ? Number(editIdParam) : undefined
        try {
          if (isServer) { const res = await updateWaterfall(serverId as number, request); serverId = res.id ?? serverId }
          else { const res = await createWaterfall(request); serverId = res.id }
        } catch { message.error(t('promotionSlotConfig:saveFailed')); setSaving(false); return }
        const extOk = serverId != null && setExtension(serverId, { businessType: 'delivery', contentType: isSupermarket ? contentType : 'store', displayCategoryMode: 'algorithm', sortMode, layoutColumns, bizChannel, fallbackCategoryIds: [], fixedSlots: [], confirmed: true })
        message.success(t('promotionSlotConfig:saveSuccessMsg'))
        if (!extOk) message.warning(t('promotionSlotConfig:extSaveFailed'))
        handleReturnToList()
        return
      }

      // 团购：整体存本地（后端不支持这些字段），不向算法坑位接口塞门店/商品
      const draft = buildDraft()
      const localId = isLocal ? localIdParam : newLocalId()
      const saved: WaterfallDraft = { ...draft, source: 'local', localId, key: localKey(localId) }
      const ok = upsertLocalStrategy(saved)
      if (!ok) { message.error(t('promotionSlotConfig:localSaveFailed')); setSaving(false); return }
      message.success(t('promotionSlotConfig:localSaveSuccess'))
      handleReturnToList()
    } catch {
      /* validateFields 失败由表单提示 */
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await createWaterfallImportTemplate()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${contentType}-waterfall-template.xlsx`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { message.error(t('promotionSlotConfig:templateFailed')) }
  }

  const handleImport = async (file: File) => {
    if (isDetailMode || useAlgorithmSlots || importBusyRef.current) return
    if (!brand) { message.warning(t('common:selectBrand')); return }
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 2 * 1024 * 1024) { message.warning(t('promotionSlotConfig:importFileInvalid')); return }
    importBusyRef.current = true
    setImporting(true)
    setImportIssues([])
    try {
      const parsed = await parseWaterfallExcel(await file.arrayBuffer())
      if (parsed.issues.length) { setImportIssues(parsed.issues); return }
      const items = await fetchCatalogByIds(contentType, parsed.rows.map(row => row.itemId), catalogChannel)
      const result = resolveWaterfallImport(parsed.rows, items, fixedSlots, contentType, brand)
      if (result.issues.length) { setImportIssues(result.issues); return }
      setFixedSlots(result.slots)
      setHasUnsavedChanges(true)
      message.success(t('promotionSlotConfig:importSuccess', { count: parsed.rows.length }))
    } catch { message.error(t('promotionSlotConfig:importFailed')) }
    finally { importBusyRef.current = false; setImporting(false) }
  }

  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tAlgoTypeLabel = useCallback((v: number) => (ALGO_TYPE_LABEL[v] ? t(ALGO_TYPE_LABEL[v]) : t('promotionSlotConfig:algoTypeFallback', { type: v })), [t])

  const phoneTitle = t('promotionSlotConfig:waterfallPreview', { appName: t(APP_LABEL[brand ?? 'flashBee'] || 'common:flashBee') })

  /** 团购预览卡片序列 */
  const previewCards = useMemo<PreviewCard[]>(() => {
    if (!supportsContentConfig || useAlgorithmSlots) return []
    const maxPos = Math.max(8, ...fixedSlots.map(s => s.position), 0)
    return buildGroupBuyPreview(fixedSlots, candidates, maxPos)
  }, [supportsContentConfig, useAlgorithmSlots, fixedSlots, candidates])

  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }
  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string, extra?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  /** 坑位表格列（团购/外卖共用，按模式切换列内容） */
  const algoColumns: ColumnsType<AlgoSlotDraft> = [
    { title: t('promotionSlotConfig:colPosition'), dataIndex: 'position', key: 'position', width: 90, align: 'center', render: (v: number) => <Tag color="green">{t('promotionSlotConfig:posNum', { pos: v })}</Tag> },
    { title: t('promotionSlotConfig:colAlgoName'), dataIndex: 'algorithmName', key: 'algorithmName', ellipsis: true, render: (text: string) => <strong>{text}</strong> },
    { title: t('promotionSlotConfig:colAlgoType'), dataIndex: 'algorithmType', key: 'algorithmType', width: 120, render: (v: number) => <Tag color={ALGO_TYPE_COLOR[v] ?? 'default'}>{tAlgoTypeLabel(v)}</Tag> },
    { title: t('common:brand'), dataIndex: 'brand', key: 'brand', width: 100, render: (v: string | undefined, r) => { const b = v ?? algorithmOptions.find(a => a.value === r.algorithmId)?.brand; return b ? <BrandTag value={b} /> : '-' } },
    { title: t('promotionSlotConfig:colStatus'), dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (_: unknown, r) => <Switch size="small" checked={r.status === 1} disabled={isDetailMode || importing} onChange={() => toggleSlotStatus(r.position)} /> },
    ...(!isDetailMode ? [{ title: t('common:colAction'), key: 'action', width: 90, align: 'center' as const, render: (_: unknown, r: AlgoSlotDraft) => <Button type="link" size="small" danger disabled={importing} onClick={() => deleteSlot(r.position)}>{t('common:delete')}</Button> }] : []),
  ]
  const fixedColumns: ColumnsType<FixedContentSlot> = [
    { title: t('promotionSlotConfig:colPosition'), dataIndex: 'position', key: 'position', width: 90, align: 'center', render: (v: number) => <Tag color="green">{t('promotionSlotConfig:posNum', { pos: v })}</Tag> },
    { title: contentType === 'store' ? t('promotionSlotConfig:colStore') : t('promotionSlotConfig:colProduct'), dataIndex: 'itemName', key: 'itemName', ellipsis: true, render: (text: string) => <strong>{text}</strong> },
    { title: t('promotionSlotConfig:colItemId'), dataIndex: 'itemId', key: 'itemId', width: 140, render: (v: string) => <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{v}</code> },
    { title: t('common:brand'), dataIndex: 'brand', key: 'brand', width: 100, render: (v?: string) => v ? <BrandTag value={v} /> : '-' },
    { title: t('promotionSlotConfig:colStatus'), dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (_: unknown, r) => <Switch size="small" checked={r.status === 1} disabled={isDetailMode || importing} onChange={() => toggleSlotStatus(r.position)} /> },
    ...(!isDetailMode ? [{ title: t('common:colAction'), key: 'action', width: 90, align: 'center' as const, render: (_: unknown, r: FixedContentSlot) => <Button type="link" size="small" danger disabled={importing} onClick={() => deleteSlot(r.position)}>{t('common:delete')}</Button> }] : []),
  ]

  return (
    <div className="content-area">
      {isDetailMode ? (
        <DetailPageHeader title={t('promotionSlotConfig:slotConfigDetail')} onBack={handleBack} onEdit={() => { const p = new URLSearchParams(searchParams); p.delete('mode'); navigate(`/promotion-slot-config-add?${p.toString()}`) }} menuKey="promotion-slot-config" />
      ) : (
        <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                {t('common:back')}
              </Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isNew ? t('promotionSlotConfig:addSlotConfig') : t('promotionSlotConfig:editSlotConfig')}
                <Tag color={isGroupBuy ? 'orange' : 'blue'} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{t(BUSINESS_TYPE_LABEL_KEY[businessType])}</Tag>
              </h2>
            </div>
          </div>
        </div>
      )}

      {supportsContentConfig && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t(isGroupBuy ? 'promotionSlotConfig:localOnlyBanner' : 'promotionSlotConfig:supermarketLocalBanner')} />
      )}

      {/* 基础信息 */}
      <div style={cardShellStyle}>
        {cardTitle(<AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', t('promotionSlotConfig:basicInfo'))}
        <Form form={form} layout="vertical" disabled={isDetailMode || importing} onValuesChange={() => setHasUnsavedChanges(true)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('promotionSlotConfig:waterfallNameLabel')} name="promotionName" rules={[{ required: true, message: t('promotionSlotConfig:enterWaterfallName') }]} style={{ marginBottom: 0 }}>
              <Input placeholder={t('promotionSlotConfig:enterWaterfallName')} allowClear />
            </Form.Item>
            <Form.Item label={t('common:brand')} name="app" rules={[{ required: true, message: t('common:selectBrand') }]} style={{ marginBottom: 0 }}>
              <Select placeholder={t('common:selectBrand')} options={tAppOptions} onChange={handleChangeBrand} />
            </Form.Item>
            {isGroupBuy ? (
              <Form.Item label={t('promotionSlotConfig:colBizChannel')} style={{ marginBottom: 0 }}>
                <Select value="groupBuy" disabled options={[{ label: t('promotionSlotConfig:bizGroupBuy'), value: 'groupBuy' }]} />
              </Form.Item>
            ) : (
              <Form.Item label={t('promotionSlotConfig:colBizChannel')} style={{ marginBottom: 0 }}>
                <Select
                  value={bizChannel}
                  disabled={isDetailMode || importing}
                  onChange={handleChangeBizChannel}
                  options={BIZ_CHANNEL_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
                />
              </Form.Item>
            )}
          </div>
        </Form>
      </div>

      {/* 展示与过滤设置 */}
      <div style={cardShellStyle}>
        {cardTitle(<AppstoreOutlined style={{ fontSize: 14, color: '#722ed1' }} />, '#f9f0ff', t('promotionSlotConfig:displayFilterSection'))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
          {supportsContentConfig && (
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('promotionSlotConfig:displayDimension')}</div>
              <Radio.Group name="waterfall-dimension" aria-label={t('promotionSlotConfig:displayDimension')} value={contentType} disabled={isDetailMode || importing} onChange={e => handleChangeContentType(e.target.value as WaterfallContentType)}>
                {CONTENT_TYPE_OPTIONS.map(o => <Radio.Button key={o.value} value={o.value}>{t(o.labelKey)}</Radio.Button>)}
              </Radio.Group>
            </div>
          )}
          {!isGroupBuy && bizChannel === 'food' && (
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('promotionSlotConfig:colLayout')}</div>
              <Radio.Group name="waterfall-layout" value={layoutColumns} disabled={isDetailMode || importing} onChange={e => { setLayoutColumns(e.target.value as WaterfallLayoutColumns); setHasUnsavedChanges(true) }}>
                {LAYOUT_OPTIONS.map(o => <Radio key={o.value} value={o.value}>{t(o.labelKey)}</Radio>)}
              </Radio.Group>
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
              {t('promotionSlotConfig:filterDislike')}
              <Popover content={<div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>{t('promotionSlotConfig:filterDislikePopover')}</div>} trigger="hover">
                <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 13, cursor: 'pointer', marginLeft: 6 }} />
              </Popover>
            </div>
            <Switch aria-label={t('promotionSlotConfig:filterDislike')} checked={filterDislike} disabled={isDetailMode || importing} checkedChildren={t('promotionSlotConfig:enabled')} unCheckedChildren={t('promotionSlotConfig:disabled')} onChange={c => { setFilterDislike(c); setHasUnsavedChanges(true) }} />
          </div>
          {supportsContentConfig && (
            <div>
              <label htmlFor="waterfall-display-category" style={{ display: 'block', fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('promotionSlotConfig:displayCategory')}</label>
              <Select<WaterfallDisplayCategoryMode>
                id="waterfall-display-category"
                value={displayCategoryMode}
                disabled={isDetailMode || importing}
                style={{ width: '100%' }}
                onChange={value => { setDisplayCategoryMode(value); setHasUnsavedChanges(true) }}
                options={[
                  { value: 'algorithm', label: t('promotionSlotConfig:sourceAlgorithm') },
                  { value: 'category', label: t(contentType === 'store' ? 'promotionSlotConfig:storeCategories' : 'promotionSlotConfig:productCategories') },
                  { value: 'custom', label: t('promotionSlotConfig:sourceCustom') },
                ]}
              />
              <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>{t(`promotionSlotConfig:sourceHint_${displayCategoryMode}`)}</div>
            </div>
          )}
          {!supportsContentConfig && (
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
                <span style={{ color: '#FF4D4F', marginRight: 4 }}>*</span>
                {t('promotionSlotConfig:naturalFallback')}
                <Popover content={<div style={{ maxWidth: 320, fontSize: 12, lineHeight: '20px', color: '#595959' }}>{t('promotionSlotConfig:naturalFallbackPopover')}</div>} trigger="hover">
                  <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 13, cursor: 'pointer', marginLeft: 6 }} />
                </Popover>
              </div>
              <Select
                value={naturalAlgoId}
                onChange={(val) => { setNaturalAlgoId(val); setNaturalAlgoName(algorithmOptions.find(a => a.value === val)?.label); setHasUnsavedChanges(true) }}
                placeholder={t('promotionSlotConfig:selectFallbackAlgo')} allowClear showSearch optionFilterProp="label"
                style={{ width: '100%', maxWidth: 320 }} disabled={isDetailMode || importing}
                options={naturalAlgoOptions.map(a => ({ label: a.label, value: a.value }))}
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>{t('promotionSlotConfig:naturalFallbackHint')}</div>
            </div>
          )}
        </div>
        {supportsContentConfig && !useAlgorithmSlots && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('promotionSlotConfig:overallSort')}</div>
            <Radio.Group name="waterfall-sort" aria-label={t('promotionSlotConfig:overallSort')} value={sortMode} disabled={isDetailMode || importing} onChange={event => { setSortMode(event.target.value as WaterfallSortMode); setHasUnsavedChanges(true) }}>
              <Radio value="score">{t('promotionSlotConfig:sortScore')}</Radio>
              <Radio value="sales">{t(contentType === 'store' ? 'promotionSlotConfig:sortStoreSales' : 'promotionSlotConfig:sortProductSales')}</Radio>
              <Radio value="distance">{t('promotionSlotConfig:sortDistance')}</Radio>
              <Radio value="random">{t('promotionSlotConfig:sortRandom')}</Radio>
            </Radio.Group>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>{t('promotionSlotConfig:overallSortHint')}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          {/* 兜底区域（仅团购分类兜底；外卖自然流量兜底已移入上方展示与过滤设置） */}
          {supportsContentConfig && useAlgorithmSlots && (
            <div style={cardShellStyle}>
              {cardTitle(<AppstoreOutlined style={{ fontSize: 14, color: '#FA8C16' }} />, '#FFF7F0', t('promotionSlotConfig:naturalFallback'))}
              <Select
                aria-label={t('promotionSlotConfig:naturalFallback')}
                value={naturalAlgoId}
                disabled={isDetailMode || importing || !brand}
                showSearch allowClear optionFilterProp="label"
                style={{ width: '100%' }}
                placeholder={t('promotionSlotConfig:selectFallbackAlgo')}
                options={naturalAlgoOptions.map(a => ({ label: a.label, value: a.value }))}
                onChange={value => { setNaturalAlgoId(value); setNaturalAlgoName(naturalAlgoOptions.find(a => a.value === value)?.label); setHasUnsavedChanges(true) }}
              />
              <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>{t('promotionSlotConfig:channelAlgorithmHint')}</div>
            </div>
          )}
          {supportsContentConfig && !useAlgorithmSlots && (
            <div style={cardShellStyle}>
              {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#FFF7F0', t('promotionSlotConfig:categoryFallback'), (
                <Tag color={displayCategoryMode === 'custom' ? 'default' : 'orange'} style={{ margin: 0 }}>{t(displayCategoryMode === 'custom' ? 'promotionSlotConfig:optionalFallback' : 'promotionSlotConfig:requiredFallback')}</Tag>
              ))}
              <Select
                mode="multiple"
                allowClear
                disabled={isDetailMode || importing || !brand}
                aria-label={t('promotionSlotConfig:categoryFallback')}
                style={{ width: '100%' }}
                placeholder={t(contentType === 'store' ? 'promotionSlotConfig:selectStoreCategories' : 'promotionSlotConfig:selectProductCategories')}
                value={fallbackCategoryIds}
                optionFilterProp="label"
                onChange={(vals: string[]) => { setFallbackCategoryIds(vals); setHasUnsavedChanges(true) }}
                options={categories.map(c => ({ label: c.name, value: c.id }))}
                maxTagCount="responsive"
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                {t(displayCategoryMode === 'custom' ? 'promotionSlotConfig:customFallbackHint' : 'promotionSlotConfig:categoryFallbackHint')}
                {fallbackCategoryIds.length > 0 && (
                  <span style={{ marginLeft: 8, color: '#E8720C' }}>{t('promotionSlotConfig:matchedCount', { count: candidates.length + fixedSlots.filter(s => s.status === 1).length })}</span>
                )}
              </div>
            </div>
          )}

          {/* 坑位列表 */}
          <div style={cardShellStyle}>
            {cardTitle(
              <AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, '#fff7e6',
              useAlgorithmSlots ? t('promotionSlotConfig:slotAlgoList') : t('promotionSlotConfig:fixedContentSlots'),
            )}
            {!isDetailMode && (
              <div className="action-section">
                {!useAlgorithmSlots && <div className="action-section-left">
                  <Space wrap>
                    <Upload accept=".xlsx" maxCount={1} showUploadList={false} disabled={importing || !brand} beforeUpload={file => { void handleImport(file); return false }}>
                      <Button className="btn-import" icon={<UploadOutlined />} loading={importing} disabled={!brand}>{t('promotionSlotConfig:batchImport')}</Button>
                    </Upload>
                    <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>{t('promotionSlotConfig:downloadImportTemplate')}</Button>
                  </Space>
                </div>}
                <div className="action-section-right">
                  <Button type="primary" icon={<PlusOutlined />} disabled={importing} onClick={handleGoSlots}>{t('promotionSlotConfig:addEditBtn')}</Button>
                </div>
              </div>
            )}
            {!useAlgorithmSlots && !isDetailMode && <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: '20px', marginBottom: 12 }}>{t('promotionSlotConfig:importHint')}</div>}
            {!useAlgorithmSlots && importIssues.length > 0 && !isDetailMode && (
              <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('promotionSlotConfig:importRejected', { count: importIssues.length })}
                description={<ul style={{ margin: 0, paddingLeft: 20, maxHeight: 160, overflowY: 'auto' }}>{importIssues.map((issue, index) => (
                  <li key={`${issue.row}-${issue.code}-${index}`}>{issue.row > 0 ? t('promotionSlotConfig:importRow', { row: issue.row }) : ''}{issue.itemId ? ` ${issue.itemId}：` : ''}{t(`promotionSlotConfig:importIssue_${issue.code}`)}</li>
                ))}</ul>}
              />
            )}
            {!useAlgorithmSlots ? (
              <Table<FixedContentSlot> columns={fixedColumns} dataSource={fixedSlots} rowKey="position" size="small" pagination={false} scroll={{ y: 360 }} locale={{ emptyText: t('promotionSlotConfig:noFixedSlot') }} />
            ) : (
              <Table<AlgoSlotDraft> columns={algoColumns} dataSource={algoSlots} rowKey="position" size="small" pagination={false} scroll={{ y: 360 }} locale={{ emptyText: t('promotionSlotConfig:noConfiguredSlot') }} />
            )}
          </div>
        </div>

        {/* 右侧：手机预览 */}
        <div>
          {supportsContentConfig && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#595959', marginRight: 12 }}>{t('promotionSlotConfig:colLayout')}</span>
              <Radio.Group name="waterfall-layout" aria-label={t('promotionSlotConfig:colLayout')} value={layoutColumns} disabled={isDetailMode || importing} onChange={e => { setLayoutColumns(e.target.value as WaterfallLayoutColumns); setHasUnsavedChanges(true) }}>
                {LAYOUT_OPTIONS.map(o => <Radio key={o.value} value={o.value}>{t(o.labelKey)}</Radio>)}
              </Radio.Group>
            </div>
          )}
        <WaterfallPreview
          businessType={businessType}
          bizChannel={bizChannel}
          displayCategoryMode={displayCategoryMode}
          contentType={contentType}
          layoutColumns={layoutColumns}
          phoneTitle={phoneTitle}
          algoSlots={algoSlots.filter(s => s.status === 1).map(s => ({ position: s.position, algorithmName: s.algorithmName, algorithmType: s.algorithmType }))}
          previewCards={previewCards}
          naturalFallbackName={naturalAlgoName ?? naturalAlgoOptions.find(a => a.value === naturalAlgoId)?.label}
          phoneTime={phoneTime}
        />
        </div>
      </div>

      {!isDetailMode && (
        <div className="form-footer">
          <Space>
            <Button disabled={importing} onClick={handleBack}>{t('common:cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} disabled={importing} onClick={handleSave} loading={saving}>{t('common:save')}</Button>
          </Space>
        </div>
      )}
    </div>
  )
}
