import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select, Tag, message, Modal, Space } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandTag from '../components/BrandTag'
import { fetchAdAlgorithms } from '../api/adPromotion'
import { fetchWaterfallCategories, searchWaterfallCatalog } from '../api/waterfallCatalog'
import type { WaterfallCategory, WaterfallCatalogItem } from '../api/waterfallCatalog'
import { readDraft, writeDraft } from './waterfallConfig/waterfallDraft'
import type {
  WaterfallDraft, AlgoSlotDraft, FixedContentSlot, WaterfallContentType, WaterfallStatus,
} from './waterfallConfig/types'

/** 可选算法条目 */
interface AlgorithmOption {
  label: string
  value: string
  type: number
  brand?: string
}

/** 算法类型标签（与算法库 algo_type 枚举对齐） */
const ALGO_TYPE_LABEL: Record<number, string> = {
  1: 'recommend:algoInvincibleStar',
  2: 'recommend:algoNewStoreAd',
  3: 'recommend:algoHotReviveAd',
  4: 'recommend:algoExclusiveMerchant',
  5: 'recommend:algoPopularMerchant',
  6: 'recommend:algoGuessYouLike',
  7: 'recommend:algoOrganicTraffic',
  11: 'recommend:algoBrandMerchant',
  12: 'recommend:algoGoldAd',
  13: 'recommend:algoGoldenSignboard',
  14: 'recommend:algoProductPromo',
  15: 'recommend:algoTrafficAd',
}

/** 算法类型颜色 */
const ALGO_TYPE_COLOR: Record<number, string> = {
  1: 'gold', 2: 'green', 3: 'magenta', 4: 'purple', 5: 'red',
  6: 'blue', 7: 'lime', 11: 'orange', 12: 'cyan', 13: 'geekblue',
  14: 'volcano', 15: 'yellow',
}

/** 坑位算法分配配色 */
const SLOT_TYPE_STYLE: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: '#FFF1B8', border: '#D4A017', text: '#8B6914' },
  2: { bg: '#D9F7BE', border: '#52C41A', text: '#237804' },
  3: { bg: '#FFD6E7', border: '#EB2F96', text: '#C41D7F' },
  4: { bg: '#EFDBFF', border: '#9254DE', text: '#531DAB' },
  5: { bg: '#FFD8D8', border: '#FF4D4F', text: '#A8071A' },
  6: { bg: '#BAE7FF', border: '#1890FF', text: '#096DD9' },
  7: { bg: '#E8FFB3', border: '#73D13D', text: '#389E0D' },
  11: { bg: '#FFE7D1', border: '#E8720C', text: '#AD4E00' },
  12: { bg: '#B5F5EC', border: '#13C2C2', text: '#086E6E' },
  13: { bg: '#D6E4FF', border: '#2F54EB', text: '#1D39C4' },
  14: { bg: '#FFD8BF', border: '#FA541C', text: '#CB3B00' },
  15: { bg: '#E6FFFB', border: '#08979C', text: '#006D75' },
}
const DEFAULT_SLOT_STYLE = { bg: '#FFF1B8', border: '#D4A017', text: '#8B6914' }
/** 团购固定内容坑位配色（门店=橙，商品=蓝） */
const CONTENT_STYLE: Record<WaterfallContentType, { bg: string; border: string; text: string }> = {
  store: { bg: '#FFE7D1', border: '#E8720C', text: '#AD4E00' },
  product: { bg: '#BAE7FF', border: '#1890FF', text: '#096DD9' },
}

/** 估算文本渲染寬度：CJK 按 fontSize、其餘按 0.62*fontSize 計算 */
const estimateTextWidth = (text: string, fontSize: number) => {
  let w = 0
  for (const ch of text) w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.62
  return w
}

/** 统一的坑位视图条目（网格渲染用，屏蔽算法/内容差异） */
interface SlotCell {
  position: number
  label: string
  subLabel: string
  style: { bg: string; border: string; text: string }
  typeColor: string
  typeLabel: string
}

/** 坑位配置獨立頁面：从表单页写入的完整草稿读取，配置完成后写回草稿并返回 */
export default function PromotionSlotConfigSlots() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftKey = searchParams.get('key') || ''
  const readOnly = searchParams.get('mode') === 'detail'

  const [draft, setDraft] = useState<WaterfallDraft | null>(() => readDraft(draftKey))

  const isGroupBuy = draft?.businessType === 'groupBuy'
  const contentType = draft?.contentType ?? 'store'
  const brand = draft?.brand

  /** 算法库选项（delivery 模式） */
  const [algorithmOptions, setAlgorithmOptions] = useState<AlgorithmOption[]>([])
  const [currentAlgo, setCurrentAlgo] = useState<AlgorithmOption | null>(null)
  const [selectedAlgoType, setSelectedAlgoType] = useState<number | null>(null)
  const [selectedAlgoBrand, setSelectedAlgoBrand] = useState<string | undefined>(undefined)

  /** 团购目录（groupBuy 模式） */
  const [categories, setCategories] = useState<WaterfallCategory[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined)
  const [resourceOptions, setResourceOptions] = useState<WaterfallCatalogItem[]>([])
  const [resourceLoading, setResourceLoading] = useState(false)
  const [currentResource, setCurrentResource] = useState<WaterfallCatalogItem | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [totalPositions, setTotalPositions] = useState<number>(100)
  const slotGridRef = useRef<HTMLDivElement | null>(null)
  const [slotCellWidth, setSlotCellWidth] = useState(0)

  /** 无草稿（直接进入/会话过期）：回列表 */
  useEffect(() => {
    if (!draft) {
      message.warning(t('promotionSlotConfig:draftMissing'))
      navigate('/promotion-slot-config', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 加载可选算法（delivery：排除自然流量/人气商家/金字招牌） */
  useEffect(() => {
    if (isGroupBuy) return
    fetchAdAlgorithms({ page: 1, size: 200, status: 1 })
      .then(res => {
        if (res.records.length > 0) {
          setAlgorithmOptions(
            res.records
              .filter(a => a.algoType !== 7 && a.algoType !== 5 && !a.algoCode?.startsWith('SFJZ'))
              .map(a => ({ label: a.algoName, value: a.algoCode as string, type: a.algoType, brand: a.brand as string | undefined })),
          )
        }
      })
      .catch(() => { /* 保留空选项 */ })
  }, [isGroupBuy])

  /** 加载团购分类（groupBuy） */
  useEffect(() => {
    if (!isGroupBuy) return
    fetchWaterfallCategories(contentType, brand).then(setCategories).catch(() => setCategories([]))
  }, [isGroupBuy, contentType, brand])

  /** 搜索团购资源（groupBuy，防抖） */
  const doSearchResource = useCallback((keyword?: string, categoryId?: string) => {
    if (!isGroupBuy) return
    setResourceLoading(true)
    searchWaterfallCatalog({ contentType, brand, categoryId, keyword, page: 1, size: 50 })
      .then(res => setResourceOptions(res.records))
      .catch(() => setResourceOptions([]))
      .finally(() => setResourceLoading(false))
  }, [isGroupBuy, contentType, brand])

  useEffect(() => {
    if (!isGroupBuy) return
    doSearchResource(undefined, categoryFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroupBuy, categoryFilter])

  const handleResourceSearch = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearchResource(value, categoryFilter), 300)
  }

  /** 測量坑位單格寬度 */
  useEffect(() => {
    if (slotGridRef.current) {
      setSlotCellWidth((slotGridRef.current.clientWidth - 8 * 9) / 10)
    }
  }, [totalPositions, isGroupBuy])

  const tAlgoTypeLabel = useCallback((v: number) => (ALGO_TYPE_LABEL[v] ? t(ALGO_TYPE_LABEL[v]) : t('promotionSlotConfig:algoTypeFallback', { type: v })), [t])

  /** 网格统一条目 */
  const cells = useMemo<SlotCell[]>(() => {
    if (!draft) return []
    if (isGroupBuy) {
      return draft.fixedSlots.map(s => ({
        position: s.position,
        label: s.itemName,
        subLabel: contentType === 'store' ? t('promotionSlotConfig:contentTypeStore') : t('promotionSlotConfig:contentTypeProduct'),
        style: CONTENT_STYLE[contentType],
        typeColor: contentType === 'store' ? 'orange' : 'blue',
        typeLabel: s.categoryName || '',
      }))
    }
    return draft.algoSlots.map(s => ({
      position: s.position,
      label: s.algorithmName,
      subLabel: tAlgoTypeLabel(s.algorithmType),
      style: SLOT_TYPE_STYLE[s.algorithmType] ?? DEFAULT_SLOT_STYLE,
      typeColor: ALGO_TYPE_COLOR[s.algorithmType] ?? 'default',
      typeLabel: '',
    }))
  }, [draft, isGroupBuy, contentType, t, tAlgoTypeLabel])

  const assignedByPos = useMemo(() => new Map(cells.map(c => [c.position, c])), [cells])

  /** 分配/移除某坑位（delivery 算法） */
  const toggleAlgoPosition = (pos: number) => {
    if (!draft) return
    setDraft(prev => {
      if (!prev) return prev
      const slots = prev.algoSlots
      const existing = slots.find(s => s.position === pos)
      if (existing) {
        if (currentAlgo && currentAlgo.value !== existing.algorithmId) {
          return { ...prev, algoSlots: slots.map(s => s.position === pos ? { ...s, algorithmId: currentAlgo.value, algorithmName: currentAlgo.label, algorithmType: currentAlgo.type, brand: currentAlgo.brand } : s).sort((a, b) => a.position - b.position) }
        }
        return { ...prev, algoSlots: slots.filter(s => s.position !== pos) }
      }
      if (!currentAlgo) { message.warning(t('promotionSlotConfig:selectAlgoFirst')); return prev }
      const added: AlgoSlotDraft = { position: pos, algorithmId: currentAlgo.value, algorithmName: currentAlgo.label, algorithmType: currentAlgo.type, brand: currentAlgo.brand, status: 1 }
      return { ...prev, algoSlots: [...slots, added].sort((a, b) => a.position - b.position) }
    })
  }

  /** 分配/移除某坑位（groupBuy 门店/商品） */
  const toggleFixedPosition = (pos: number) => {
    if (!draft) return
    const existing = draft.fixedSlots.find(s => s.position === pos)
    if (existing) {
      if (currentResource && currentResource.id !== existing.itemId) {
        Modal.confirm({
          title: t('promotionSlotConfig:replaceSlotTitle'),
          content: t('promotionSlotConfig:replaceSlotContent', { pos, name: currentResource.name }),
          okText: t('common:confirm'),
          cancelText: t('common:cancel'),
          onOk: () => {
            setDraft(prev => prev ? { ...prev, fixedSlots: prev.fixedSlots.map(s => s.position === pos ? { ...s, itemId: currentResource.id, itemName: currentResource.name, brand: currentResource.brand, categoryId: currentResource.categoryId, categoryName: categories.find(c => c.id === currentResource.categoryId)?.name, status: 1 as WaterfallStatus } : s).sort((a, b) => a.position - b.position) } : prev)
          },
        })
      } else {
        setDraft(prev => prev ? { ...prev, fixedSlots: prev.fixedSlots.filter(s => s.position !== pos) } : prev)
      }
      return
    }
    if (!currentResource) { message.warning(t('promotionSlotConfig:selectResourceFirst')); return }
    // 同一门店/商品不能重复固定到多个启用坑位
    const dup = draft.fixedSlots.find(s => s.itemId === currentResource.id)
    if (dup) { message.error(t('promotionSlotConfig:duplicateResource', { pos: dup.position })); return }
    const added: FixedContentSlot = { position: pos, contentType, itemId: currentResource.id, itemName: currentResource.name, brand: currentResource.brand, categoryId: currentResource.categoryId, categoryName: categories.find(c => c.id === currentResource.categoryId)?.name, status: 1 }
    setDraft(prev => prev ? { ...prev, fixedSlots: [...prev.fixedSlots, added].sort((a, b) => a.position - b.position) } : prev)
  }

  const togglePosition = (pos: number) => {
    if (readOnly) return
    if (isGroupBuy) toggleFixedPosition(pos)
    else toggleAlgoPosition(pos)
  }

  const removePosition = (pos: number) => {
    if (readOnly) return
    setDraft(prev => {
      if (!prev) return prev
      return isGroupBuy
        ? { ...prev, fixedSlots: prev.fixedSlots.filter(s => s.position !== pos) }
        : { ...prev, algoSlots: prev.algoSlots.filter(s => s.position !== pos) }
    })
  }

  const clearAllPositions = () => {
    setDraft(prev => prev ? (isGroupBuy ? { ...prev, fixedSlots: [] } : { ...prev, algoSlots: [] }) : prev)
  }

  const handleBack = () => navigate(-1)

  const handleSave = () => {
    if (!draft) return
    writeDraft(draft)
    message.success(t('promotionSlotConfig:slotConfigApplied'))
    navigate(-1)
  }

  /** 模块卡片标题行 */
  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string, extra?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  if (!draft) return null

  return (
    <div className="content-area">
      {/* 页面头部 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              {t('common:back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isGroupBuy
                ? t('promotionSlotConfig:contentPosConfig', { type: contentType === 'store' ? t('promotionSlotConfig:contentTypeStore') : t('promotionSlotConfig:contentTypeProduct') })
                : t('promotionSlotConfig:addEditPosConfig')}
            </h2>
          </div>
        </div>
      </div>

      {/* 区域一：选择器（delivery=算法；groupBuy=门店/商品） */}
      <div style={cardShellStyle}>
        {cardTitle(
          <AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
          '#fff7e6',
          isGroupBuy ? t('promotionSlotConfig:resourceSelectSection') : t('promotionSlotConfig:algoSelectSection'),
        )}
        {isGroupBuy ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('promotionSlotConfig:colCategory')}</div>
              <Select
                allowClear
                placeholder={t('promotionSlotConfig:allCategories')}
                style={{ width: '100%' }}
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={categories.map(c => ({ label: c.name, value: c.id }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
                <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                {contentType === 'store' ? t('promotionSlotConfig:selectStore') : t('promotionSlotConfig:selectProduct')}
              </div>
              <Select
                showSearch
                filterOption={false}
                placeholder={t('promotionSlotConfig:searchResourcePlaceholder')}
                style={{ width: '100%' }}
                loading={resourceLoading}
                value={currentResource?.id}
                onSearch={handleResourceSearch}
                onChange={(value) => {
                  const item = resourceOptions.find(r => r.id === value) ?? null
                  setCurrentResource(item)
                }}
                options={resourceOptions.map(r => ({ label: `${r.name}（${r.id}）`, value: r.id }))}
                disabled={readOnly}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('common:brand')}</div>
              <div style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
                {currentResource ? <BrandTag value={currentResource.brand} /> : <span style={{ color: '#bfbfbf' }}>{t('promotionSlotConfig:selectResourceFirst')}</span>}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
                <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                {t('promotionSlotConfig:colAlgoName')}
              </div>
              <Select
                placeholder={t('promotionSlotConfig:selectAlgoPlaceholder')}
                showSearch optionFilterProp="label" style={{ width: '100%' }}
                value={currentAlgo?.value}
                options={algorithmOptions.map(a => ({ label: a.label, value: a.value }))}
                onChange={(value) => {
                  const algo = algorithmOptions.find(a => a.value === value) ?? null
                  setSelectedAlgoType(algo ? algo.type : null)
                  setSelectedAlgoBrand(algo ? algo.brand : undefined)
                  setCurrentAlgo(algo)
                }}
                disabled={readOnly}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('promotionSlotConfig:colAlgoType')}</div>
              <Input value={selectedAlgoType !== null ? tAlgoTypeLabel(selectedAlgoType) : ''} disabled placeholder={t('promotionSlotConfig:selectAlgoFirst')} style={{ color: selectedAlgoType !== null ? '#333' : '#bfbfbf' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('common:brand')}</div>
              <div style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
                {selectedAlgoBrand ? <BrandTag value={selectedAlgoBrand} /> : <span style={{ color: '#bfbfbf' }}>{t('promotionSlotConfig:selectAlgoFirst')}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 区域二：展示位配置 */}
      <div style={cardShellStyle}>
        {cardTitle(
          <AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
          '#fff7e6',
          t('promotionSlotConfig:posConfigSection'),
          <Select
            value={totalPositions}
            onChange={(val) => setTotalPositions(val)}
            style={{ width: 130, fontSize: 13 }}
            className="slot-pos-select"
            options={[
              { label: t('promotionSlotConfig:topN', { count: 100 }), value: 100 },
              { label: t('promotionSlotConfig:topN', { count: 200 }), value: 200 },
              { label: t('promotionSlotConfig:topN', { count: 300 }), value: 300 },
              { label: t('promotionSlotConfig:topN', { count: 500 }), value: 500 },
            ]}
          />,
        )}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          {/* 左侧：展示位选择 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ maxHeight: 520, overflowY: 'auto', padding: 12, background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6 }}>
              <div ref={slotGridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 8 }}>
                {Array.from({ length: totalPositions }, (_, i) => i + 1).map(pos => {
                  const assigned = assignedByPos.get(pos)
                  return (
                    <div
                      key={pos}
                      onClick={() => togglePosition(pos)}
                      style={{
                        position: 'relative', height: 44, borderRadius: 6,
                        border: assigned ? `2px solid ${assigned.style.border}` : '1px solid #d9d9d9',
                        background: assigned ? assigned.style.bg : '#fff',
                        cursor: readOnly ? 'default' : 'pointer', transition: 'all 0.2s', overflow: 'hidden',
                      }}
                      title={assigned ? `${pos}：${assigned.label}` : undefined}
                    >
                      {assigned ? (
                        <>
                          <span style={{ position: 'absolute', top: 2, left: 4, zIndex: 1, fontSize: 10, fontWeight: 700, lineHeight: 1, color: assigned.style.text }}>{pos}</span>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '8px 2px 2px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, color: assigned.style.text, whiteSpace: 'nowrap' }}>{assigned.subLabel}</span>
                            {slotCellWidth > 0 && estimateTextWidth(assigned.label, 9) > slotCellWidth - 6 ? (
                              <div style={{ width: '100%', overflow: 'hidden', height: 11, lineHeight: '11px' }}>
                                <span className="slot-marquee-text" style={{ fontSize: 9, fontWeight: 500, color: assigned.style.text }}>{assigned.label}</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 9, fontWeight: 500, lineHeight: 1, color: assigned.style.text, whiteSpace: 'nowrap' }}>{assigned.label}</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#333' }}>
                          {t('promotionSlotConfig:posNum', { pos })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 右侧：已选坑位统计 */}
          <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', border: cells.length > 0 ? '1px solid #ffd591' : '1px solid #f0f0f0', borderRadius: 8, background: cells.length > 0 ? '#fff7e6' : '#fafafa', padding: '12px 10px 12px 12px', maxHeight: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>{t('promotionSlotConfig:slotStats', { count: cells.length })}</span>
              {cells.length > 0 && !readOnly && (
                <Button size="small" onClick={clearAllPositions} style={{ fontSize: 12, padding: '0 8px', height: 22 }}>{t('promotionSlotConfig:clearAll')}</Button>
              )}
            </div>
            {cells.length > 0 ? (
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...cells].sort((a, b) => a.position - b.position).map(cell => (
                  <div key={cell.position} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 6, background: cell.style.bg, border: `1px solid ${cell.style.border}` }}>
                    <Tag color={cell.typeColor} style={{ margin: 0, flexShrink: 0 }}>{cell.subLabel}</Tag>
                    <span style={{ fontSize: 12, fontWeight: 600, color: cell.style.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.label}</span>
                    <Tag style={{ margin: 0, fontSize: 11, background: '#fff', borderColor: cell.style.border, color: cell.style.text }}>{t('promotionSlotConfig:posNum', { pos: cell.position })}</Tag>
                    {!readOnly && (
                      <Button type="link" size="small" danger style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => removePosition(cell.position)}>{t('common:delete')}</Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#bfbfbf', fontSize: 13 }}>{t('promotionSlotConfig:noPosSelected')}</div>
            )}
          </div>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="form-footer">
        <Space>
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          {!readOnly && <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>{t('promotionSlotConfig:applyAndBack')}</Button>}
        </Space>
      </div>
    </div>
  )
}
