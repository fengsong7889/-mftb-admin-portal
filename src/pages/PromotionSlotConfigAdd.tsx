import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Select, Space, message, Table, Tag, Switch, Popover, Modal, Radio, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, QuestionCircleOutlined, AppstoreOutlined, ShopOutlined } from '@ant-design/icons'
import BrandTag from '../components/BrandTag'
import DetailPageHeader from '../components/DetailPageHeader'
import {
  fetchAdAlgorithms, fetchWaterfallDetail, createWaterfall, updateWaterfall,
} from '../api/adPromotion'
import { isBackendUnavailable } from '../api/request'
import type { WaterfallStrategyRequest } from '../api/adPromotion'
import { fetchWaterfallCategories, fetchCategoryCandidates } from '../api/waterfallCatalog'
import type { WaterfallCategory } from '../api/waterfallCatalog'
import {
  type WaterfallBusinessType, type WaterfallContentType, type WaterfallLayoutColumns,
  type AlgoSlotDraft, type FixedContentSlot, type WaterfallDraft, type WaterfallBizChannel,
  ALGO_TYPE_LABEL, ALGO_TYPE_COLOR,
  CONTENT_TYPE_OPTIONS, LAYOUT_OPTIONS, BUSINESS_TYPE_LABEL_KEY, BIZ_CHANNEL_OPTIONS,
  serverKey, localKey,
} from './waterfallConfig/types'
import {
  getExtension, setExtension, getLocalStrategy, upsertLocalStrategy,
  buildDraftFromServer, newLocalId,
} from './waterfallConfig/waterfallExtStore'
import { writeDraft, consumeDraft, newSessionKey } from './waterfallConfig/waterfallDraft'
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const editIdParam = searchParams.get('id') || ''
  const localIdParam = searchParams.get('localId') || ''
  const bizParam = (searchParams.get('biz') as WaterfallBusinessType | null) || 'delivery'
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'

  const isLocal = !!localIdParam
  const isServer = !isLocal && !!editIdParam
  const isEdit = isLocal || isServer
  const isNew = !isEdit

  const [form] = Form.useForm()
  /** 业务线：新增来自 Tab 参数；编辑来自记录 */
  const [businessType, setBusinessType] = useState<WaterfallBusinessType>(isNew ? bizParam : 'delivery')
  const [contentType, setContentType] = useState<WaterfallContentType>('store')
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
    return newSessionKey(bizParam)
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
  const draftConsumedRef = useRef(false)

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
    fetchAdAlgorithms({ page: 1, size: 200, status: 1 })
      .then(res => {
        const filtered = (res.records ?? []).filter(a => !a.algoCode?.startsWith('SFJZ'))
        setAlgorithmOptions(filtered.map(a => ({ label: a.algoName, value: a.algoCode as string, type: a.algoType, brand: a.brand as string | undefined })))
      })
      .catch(() => { /* 保留降级空选项 */ })
  }, [])

  /** 团购分类 */
  useEffect(() => {
    if (!isGroupBuy) { setCategories([]); return }
    const brand = form.getFieldValue('app') as string | undefined
    fetchWaterfallCategories(contentType, brand).then(setCategories).catch(() => setCategories([]))
  }, [isGroupBuy, contentType, location.key, form])

  /** 团购候选（预览补位） */
  useEffect(() => {
    if (!isGroupBuy || fallbackCategoryIds.length === 0) { setCandidates([]); return }
    const brand = form.getFieldValue('app') as string | undefined
    const exclude = fixedSlots.map(s => s.itemId)
    fetchCategoryCandidates({ contentType, brand, categoryIds: fallbackCategoryIds, excludeItemIds: exclude, limit: 20 })
      .then(list => setCandidates(list.map(i => ({ id: i.id, name: i.name, image: i.image, rating: i.rating, monthlySales: i.monthlySales, price: i.price, originPrice: i.originPrice, distance: i.distance, deliveryTime: i.deliveryTime }))))
      .catch(() => setCandidates([]))
  }, [isGroupBuy, contentType, fallbackCategoryIds, fixedSlots, location.key, form])

  /** 自然流量兜底算法选项（算法库 algoType=7） */
  const naturalAlgoOptions = useMemo(() => algorithmOptions.filter(a => a.type === 7), [algorithmOptions])

  /** 编辑/详情：加载数据 */
  useEffect(() => {
    if (isNew) return
    if (isLocal) {
      const d = getLocalStrategy(localIdParam)
      if (d) applyDraft(d)
      else message.error(t('promotionSlotConfig:recordNotFound'))
      return
    }
    const id = Number(editIdParam)
    // 坑位页返回的草稿优先
    const returned = consumeDraft(serverKey(id))
    fetchWaterfallDetail(id)
      .then(detail => {
        const ext = getExtension(id)
        const base = buildDraftFromServer(detail, ext)
        if (returned) { base.algoSlots = returned.algoSlots; base.fixedSlots = returned.fixedSlots }
        applyDraft(base)
        setDraftKey(serverKey(id))
      })
      .catch(err => {
        if (isBackendUnavailable(err)) { message.warning(t('promotionSlotConfig:backendUnavailable')) }
        else message.error(t('promotionSlotConfig:loadDetailFailed'))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIdParam, localIdParam, location.key])

  /** 新增模式：应用坑位页返回的草稿 */
  useEffect(() => {
    if (!isNew || draftConsumedRef.current) return
    const returned = consumeDraft(draftKey)
    if (returned) {
      setAlgoSlots(returned.algoSlots)
      setFixedSlots(returned.fixedSlots)
      draftConsumedRef.current = true
      setHasUnsavedChanges(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const applyDraft = (d: WaterfallDraft) => {
    form.setFieldsValue({ promotionName: d.strategyName, app: d.brand })
    setBusinessType(d.businessType)
    setContentType(d.contentType)
    setLayoutColumns(d.layoutColumns)
    setBizChannel(d.bizChannel ?? 'food')
    setFilterDislike(d.filterDislike === 1)
    setNaturalAlgoId(d.naturalAlgoId ?? undefined)
    setNaturalAlgoName(d.naturalAlgoName)
    setAlgoSlots(d.algoSlots)
    setFallbackCategoryIds(d.fallbackCategoryIds)
    setFixedSlots(d.fixedSlots)
    setDraftKey(d.key)
  }

  /** 组装当前草稿 */
  const buildDraft = (): WaterfallDraft => {
    const values = form.getFieldsValue()
    return {
      key: draftKey,
      source: isLocal ? 'local' : 'server',
      id: isServer ? Number(editIdParam) : undefined,
      localId: isLocal ? localIdParam : (isNew && isGroupBuy ? draftKey.replace(/^new_/, '') : undefined),
      strategyName: values.promotionName || '',
      brand: values.app,
      businessType,
      contentType,
      layoutColumns,
      bizChannel,
      filterDislike: filterDislike ? 1 : 2,
      status: 1,
      naturalAlgoId: naturalAlgoId ?? null,
      naturalAlgoName,
      algoSlots,
      fallbackCategoryIds,
      fixedSlots,
      businessConfirmed: true,
    }
  }

  /** 进入坑位配置页 */
  const handleGoSlots = () => {
    writeDraft(buildDraft())
    const q = new URLSearchParams({ key: draftKey })
    if (isDetailMode) q.set('mode', 'detail')
    navigate(`/promotion-slot-config-slots?${q.toString()}`)
  }

  /** 内容类型切换（团购）：清理不兼容的分类/坑位 */
  const handleChangeContentType = (next: WaterfallContentType) => {
    if (next === contentType) return
    const hasConfig = fallbackCategoryIds.length > 0 || fixedSlots.length > 0
    if (!hasConfig) { setContentType(next); return }
    Modal.confirm({
      title: t('promotionSlotConfig:switchContentTypeTitle'),
      content: t('promotionSlotConfig:switchContentTypeContent'),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      onOk: () => { setContentType(next); setFallbackCategoryIds([]); setFixedSlots([]); setHasUnsavedChanges(true) },
    })
  }

  /** 品牌切换（团购）：清理不兼容配置 */
  const handleChangeBrand = () => {
    if (!isGroupBuy) return
    const hasConfig = fallbackCategoryIds.length > 0 || fixedSlots.length > 0
    if (hasConfig) { setFallbackCategoryIds([]); setFixedSlots([]) }
  }

  const toggleSlotStatus = (position: number) => {
    if (isGroupBuy) setFixedSlots(prev => prev.map(s => s.position === position ? { ...s, status: s.status === 1 ? 2 : 1 } : s))
    else setAlgoSlots(prev => prev.map(s => s.position === position ? { ...s, status: s.status === 1 ? 2 : 1 } : s))
    setHasUnsavedChanges(true)
  }

  const deleteSlot = (position: number) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: t('promotionSlotConfig:deleteSlotConfirm', { pos: position }),
      okText: t('common:confirm'), cancelText: t('common:cancel'), okButtonProps: { danger: true },
      onOk: () => {
        if (isGroupBuy) setFixedSlots(prev => prev.filter(s => s.position !== position))
        else setAlgoSlots(prev => prev.filter(s => s.position !== position))
        setHasUnsavedChanges(true)
      },
    })
  }

  const handleBack = () => {
    if (hasUnsavedChanges && !isDetailMode) {
      Modal.confirm({
        title: t('promotionSlotConfig:discardConfirmTitle'),
        content: t('promotionSlotConfig:discardConfirmContent'),
        okText: t('promotionSlotConfig:discardConfirmOk'), cancelText: t('promotionSlotConfig:discardConfirmCancel'),
        okButtonProps: { danger: true },
        onOk: () => navigate('/promotion-slot-config'),
      })
    } else navigate('/promotion-slot-config')
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (!isGroupBuy && !naturalAlgoId) { message.warning(t('promotionSlotConfig:fallbackAlgoRequired')); return }
      if (isGroupBuy && fallbackCategoryIds.length === 0) { message.warning(t('promotionSlotConfig:categoryFallbackRequired')); return }
      setSaving(true)

      if (!isGroupBuy) {
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
        const effectiveLayout: WaterfallLayoutColumns = bizChannel === 'supermarket' ? 1 : layoutColumns
        const extOk = serverId != null && setExtension(serverId, { businessType: 'delivery', contentType: 'store', layoutColumns: effectiveLayout, bizChannel, fallbackCategoryIds: [], fixedSlots: [], confirmed: true })
        message.success(t('promotionSlotConfig:saveSuccessMsg'))
        if (!extOk) message.warning(t('promotionSlotConfig:extSaveFailed'))
        navigate('/promotion-slot-config')
        return
      }

      // 团购：整体存本地（后端不支持这些字段），不向算法坑位接口塞门店/商品
      const draft = buildDraft()
      const localId = isLocal ? localIdParam : newLocalId()
      const saved: WaterfallDraft = { ...draft, source: 'local', localId, key: localKey(localId) }
      const ok = upsertLocalStrategy(saved)
      if (!ok) { message.error(t('promotionSlotConfig:localSaveFailed')); setSaving(false); return }
      message.success(t('promotionSlotConfig:localSaveSuccess'))
      navigate('/promotion-slot-config')
    } catch {
      /* validateFields 失败由表单提示 */
    } finally {
      setSaving(false)
    }
  }

  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tAlgoTypeLabel = useCallback((v: number) => (ALGO_TYPE_LABEL[v] ? t(ALGO_TYPE_LABEL[v]) : t('promotionSlotConfig:algoTypeFallback', { type: v })), [t])

  const phoneTitle = useMemo(() => {
    const app = form.getFieldValue('app') as string | undefined
    return t('promotionSlotConfig:waterfallPreview', { appName: app ? t(APP_LABEL[app] || 'common:flashBee') : t('common:flashBee') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, businessType, t])

  /** 团购预览卡片序列 */
  const previewCards = useMemo<PreviewCard[]>(() => {
    if (!isGroupBuy) return []
    const maxPos = Math.max(8, ...fixedSlots.map(s => s.position), 0)
    return buildGroupBuyPreview(fixedSlots, candidates, maxPos)
  }, [isGroupBuy, fixedSlots, candidates])

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
    { title: t('promotionSlotConfig:colStatus'), dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (_: unknown, r) => <Switch size="small" checked={r.status === 1} disabled={isDetailMode} onChange={() => toggleSlotStatus(r.position)} /> },
    ...(!isDetailMode ? [{ title: t('common:colAction'), key: 'action', width: 90, align: 'center' as const, render: (_: unknown, r: AlgoSlotDraft) => <Button type="link" size="small" danger onClick={() => deleteSlot(r.position)}>{t('common:delete')}</Button> }] : []),
  ]
  const fixedColumns: ColumnsType<FixedContentSlot> = [
    { title: t('promotionSlotConfig:colPosition'), dataIndex: 'position', key: 'position', width: 90, align: 'center', render: (v: number) => <Tag color="green">{t('promotionSlotConfig:posNum', { pos: v })}</Tag> },
    { title: contentType === 'store' ? t('promotionSlotConfig:colStore') : t('promotionSlotConfig:colProduct'), dataIndex: 'itemName', key: 'itemName', ellipsis: true, render: (text: string) => <strong>{text}</strong> },
    { title: t('promotionSlotConfig:colItemId'), dataIndex: 'itemId', key: 'itemId', width: 140, render: (v: string) => <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{v}</code> },
    { title: t('promotionSlotConfig:colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 120, render: (v?: string) => v || '-' },
    { title: t('promotionSlotConfig:colStatus'), dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (_: unknown, r) => <Switch size="small" checked={r.status === 1} disabled={isDetailMode} onChange={() => toggleSlotStatus(r.position)} /> },
    ...(!isDetailMode ? [{ title: t('common:colAction'), key: 'action', width: 90, align: 'center' as const, render: (_: unknown, r: FixedContentSlot) => <Button type="link" size="small" danger onClick={() => deleteSlot(r.position)}>{t('common:delete')}</Button> }] : []),
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isGroupBuy ? '#E8720C' : '#1890ff' }}>
                {isNew ? t('promotionSlotConfig:addSlotConfig') : t('promotionSlotConfig:editSlotConfig')}
                <Tag color={isGroupBuy ? 'orange' : 'blue'} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{t(BUSINESS_TYPE_LABEL_KEY[businessType])}</Tag>
              </h2>
            </div>
          </div>
        </div>
      )}

      {isGroupBuy && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('promotionSlotConfig:localOnlyBanner')} />
      )}

      {/* 基础信息 */}
      <div style={cardShellStyle}>
        {cardTitle(<AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', t('promotionSlotConfig:basicInfo'))}
        <Form form={form} layout="vertical" disabled={isDetailMode} onValuesChange={() => setHasUnsavedChanges(true)}>
          <div style={{ display: 'grid', gridTemplateColumns: isGroupBuy ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('promotionSlotConfig:waterfallNameLabel')} name="promotionName" rules={[{ required: true, message: t('promotionSlotConfig:enterWaterfallName') }]} style={{ marginBottom: 0 }}>
              <Input placeholder={t('promotionSlotConfig:enterWaterfallName')} allowClear />
            </Form.Item>
            <Form.Item label={t('common:brand')} name="app" rules={[{ required: true, message: t('common:selectBrand') }]} style={{ marginBottom: 0 }}>
              <Select placeholder={t('common:selectBrand')} options={tAppOptions} onChange={handleChangeBrand} />
            </Form.Item>
            {isGroupBuy ? (
              <>
                <Form.Item label={t('promotionSlotConfig:colBusinessType')} style={{ marginBottom: 0 }}>
                  <Input value={t(BUSINESS_TYPE_LABEL_KEY[businessType])} disabled />
                </Form.Item>
                <Form.Item label={t('promotionSlotConfig:colContentType')} style={{ marginBottom: 0 }}>
                  <Select value={contentType} disabled={isDetailMode} onChange={handleChangeContentType} options={CONTENT_TYPE_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))} />
                </Form.Item>
              </>
            ) : (
              <Form.Item label={t('promotionSlotConfig:colBizChannel')} style={{ marginBottom: 0 }}>
                <Select
                  value={bizChannel}
                  disabled={isDetailMode}
                  onChange={(v: WaterfallBizChannel) => { setBizChannel(v); if (v === 'supermarket') setLayoutColumns(1); setHasUnsavedChanges(true) }}
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
          {(isGroupBuy || bizChannel === 'food') && (
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('promotionSlotConfig:colLayout')}</div>
              <Radio.Group value={layoutColumns} disabled={isDetailMode} onChange={e => { setLayoutColumns(e.target.value as WaterfallLayoutColumns); setHasUnsavedChanges(true) }}>
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
            <Switch checked={filterDislike} disabled={isDetailMode} checkedChildren={t('promotionSlotConfig:enabled')} unCheckedChildren={t('promotionSlotConfig:disabled')} onChange={c => { setFilterDislike(c); setHasUnsavedChanges(true) }} />
          </div>
          {!isGroupBuy && (
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
                style={{ width: '100%', maxWidth: 320 }} disabled={isDetailMode}
                options={naturalAlgoOptions.map(a => ({ label: a.label, value: a.value }))}
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>{t('promotionSlotConfig:naturalFallbackHint')}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 兜底区域（仅团购分类兜底；外卖自然流量兜底已移入上方展示与过滤设置） */}
          {isGroupBuy && (
            <div style={cardShellStyle}>
              {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#FFF7F0', t('promotionSlotConfig:categoryFallback'), (
                <Tag color="orange" style={{ margin: 0 }}>{t('promotionSlotConfig:mockDataTag')}</Tag>
              ))}
              <Select
                mode="multiple"
                allowClear
                disabled={isDetailMode}
                style={{ width: '100%' }}
                placeholder={t('promotionSlotConfig:selectCategoryPlaceholder')}
                value={fallbackCategoryIds}
                optionFilterProp="label"
                onChange={(vals: string[]) => { setFallbackCategoryIds(vals); setHasUnsavedChanges(true) }}
                options={categories.map(c => ({ label: c.name, value: c.id }))}
                maxTagCount="responsive"
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                {t('promotionSlotConfig:categoryFallbackHint')}
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
              isGroupBuy ? t('promotionSlotConfig:fixedContentSlots') : t('promotionSlotConfig:slotAlgoList'),
              !isDetailMode ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleGoSlots} size="small">{t('promotionSlotConfig:addEditBtn')}</Button>
              ) : undefined,
            )}
            {isGroupBuy ? (
              <Table<FixedContentSlot> columns={fixedColumns} dataSource={fixedSlots} rowKey="position" size="small" pagination={false} scroll={{ y: 360 }} locale={{ emptyText: t('promotionSlotConfig:noFixedSlot') }} />
            ) : (
              <Table<AlgoSlotDraft> columns={algoColumns} dataSource={algoSlots} rowKey="position" size="small" pagination={false} scroll={{ y: 360 }} locale={{ emptyText: t('promotionSlotConfig:noConfiguredSlot') }} />
            )}
          </div>
        </div>

        {/* 右侧：手机预览 */}
        <WaterfallPreview
          businessType={businessType}
          contentType={contentType}
          layoutColumns={layoutColumns}
          phoneTitle={phoneTitle}
          algoSlots={algoSlots.filter(s => s.status === 1).map(s => ({ position: s.position, algorithmName: s.algorithmName, algorithmType: s.algorithmType }))}
          previewCards={previewCards}
          naturalFallbackName={naturalAlgoName ?? naturalAlgoOptions.find(a => a.value === naturalAlgoId)?.label}
          phoneTime={phoneTime}
        />
      </div>

      {!isDetailMode && (
        <div className="form-footer">
          <Space>
            <Button onClick={handleBack}>{t('common:cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>{t('common:save')}</Button>
          </Space>
        </div>
      )}
    </div>
  )
}
