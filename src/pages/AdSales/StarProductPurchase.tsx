/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Card, Modal, Select, Space, Spin, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { AlgorithmType, APP_OPTIONS } from '@mftb/contracts/recommendConstants'
import { AdBusinessType, StarTarget } from '@mftb/contracts/starAlgorithm'
import {
  fetchAdAlgorithms, fetchAdInventory, placeAdStarOrder, lockAdCells, unlockAdCells,
  appTypeToBrand,
  type AdInventoryCell, type AdInventoryVO,
} from '@/api/adPromotion'
import { searchWaterfallCatalog, type WaterfallCatalogItem } from '@/api/waterfallCatalog'
import { fetchFinAccountBalance } from '@/api/finance'
import { getSystemRuleValue } from '@/hooks/useSystemRules'
import { REGION_LIST } from '../_shared/ad-promotion/gridConstants'
import { readWeekdayShort } from '../_shared/ad-promotion/weekdayLabels'
import { RECOMMEND_TYPE_CONFIGS } from './types'
import './StarProductPurchase.css'

/** 商品维度全天售卖格子的时段标识（与后端 AdSalesStarServiceImpl.ALL_DAY_SLOT 对齐） */
const ALL_DAY_SLOT = 'fullDay'
/** 团购到店业务频道（商品星星唯一开放频道） */
const GROUP_BUY_CHANNEL = 4
const DEFAULT_LOCK_SECONDS = 60

/** 购物车条目：商圈×日期全天格 */
interface ProductCartItem {
  /** key = `${bizDate}|${region}` */
  key: string
  bizDate: string
  region: number
  cellPrice: number
  /** 加购锁定时间戳，超时自动释放 */
  lockTime: number
}

const cellKeyOf = (bizDate: string, region: number) => `${bizDate}|${region}`

/**
 * 团购商品无敌星星选购：选择「品牌 → 商品星星算法 → 商品」后按 商圈×日期 全天格子加购，
 * 从商品归属集团的推广金账户扣款。不选门店——适用门店由团购业务系统预配置（方案 D5）。
 * 商品目录当前为 Mock 适配层：归属集团字段来自假数据，真实目录接口就绪前不开放生产售卖。
 */
export default function StarProductPurchase() {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  const LOCK_DURATION_MS = (getSystemRuleValue<number>('ad_click_cart_lock_seconds') || DEFAULT_LOCK_SECONDS) * 1000

  const [brand, setBrand] = useState<number | undefined>(undefined)
  const [algoId, setAlgoId] = useState<number | undefined>(undefined)
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: number }>>([])
  const [algorithmLoading, setAlgorithmLoading] = useState(false)
  const [product, setProduct] = useState<WaterfallCatalogItem | null>(null)
  const [productOptions, setProductOptions] = useState<WaterfallCatalogItem[]>([])
  const [productLoading, setProductLoading] = useState(false)
  const [inventory, setInventory] = useState<AdInventoryVO | null>(null)
  const [cart, setCart] = useState<ProductCartItem[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [paying, setPaying] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cartRef = useRef<ProductCartItem[]>([])
  cartRef.current = cart

  const brandValue = brand != null ? appTypeToBrand(brand) : undefined
  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + item.cellPrice, 0), [cart])
  const cellMap = useMemo(() => {
    const map = new Map<string, AdInventoryCell>()
    for (const cell of inventory?.cells ?? []) map.set(cellKeyOf(cell.bizDate, cell.region), cell)
    return map
  }, [inventory])

  /* 商品星星算法候选：显式 targetType=2 + 团购频道有启用定价 */
  useEffect(() => {
    setAlgoId(undefined)
    setInventory(null)
    if (brand == null) { setAlgorithmOptions([]); return }
    let active = true
    setAlgorithmLoading(true)
    fetchAdAlgorithms({
      page: 1, size: 200, status: 1, algoType: AlgorithmType.INVINCIBLE_STAR,
      businessType: AdBusinessType.GROUP_BUY, targetType: StarTarget.PRODUCT,
      brand: brandValue, hasPricing: true, pricingChannel: GROUP_BUY_CHANNEL,
    })
      .then(res => {
        if (!active) return
        setAlgorithmOptions((res.records ?? []).map(a => ({
          label: a.algoCode ? `${a.algoName}(${a.algoCode})` : a.algoName,
          value: a.id as number,
        })))
      })
      .catch(() => { if (active) setAlgorithmOptions([]) })
      .finally(() => { if (active) setAlgorithmLoading(false) })
    return () => { active = false }
  }, [brand, brandValue])

  /* 商品搜索（Mock 目录适配层；真实接入后同签名替换） */
  const loadProducts = useCallback((keyword?: string) => {
    if (brand == null) { setProductOptions([]); return }
    setProductLoading(true)
    searchWaterfallCatalog({ contentType: 'product', brand: brandValue, keyword, page: 1, size: 50 })
      .then(res => setProductOptions((res.records ?? []).filter(item => item.enabled)))
      .catch(() => setProductOptions([]))
      .finally(() => setProductLoading(false))
  }, [brand, brandValue])

  useEffect(() => { setProduct(null); loadProducts() }, [loadProducts])

  const handleProductSearch = (keyword: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadProducts(keyword), 300)
  }

  /* 商品选定后：拉取推广金余额与全天库存（归属集团来自目录，真实接入后由业务系统返回） */
  useEffect(() => {
    setCart([])
    if (algoId == null || !product?.groupCode) { setInventory(null); setBalance(null); return }
    fetchAdInventory(algoId, undefined, product.groupCode, GROUP_BUY_CHANNEL)
      .then(setInventory)
      .catch(() => { setInventory(null); message.warning(t('loadInventoryFailed')) })
    fetchFinAccountBalance(product.groupCode, brandValue)
      .then(account => setBalance(account ? Number(account.virtualBalance) : null))
      .catch(() => setBalance(null))
  }, [algoId, product, brandValue, t])

  /* 释放购物车剩余的加购锁（离开页面/清空时），避免占位到超时 */
  const releaseLocks = useCallback((items: ProductCartItem[]) => {
    if (algoId == null || !product?.groupCode || items.length === 0) return
    unlockAdCells({
      algoId,
      groupCode: product.groupCode,
      channel: GROUP_BUY_CHANNEL,
      productId: product.id,
      cells: items.map(item => ({ bizDate: item.bizDate, region: item.region, mealSlot: ALL_DAY_SLOT })),
    }).catch(() => { /* 静默：锁自然过期兜底 */ })
  }, [algoId, product])

  useEffect(() => () => { releaseLocks(cartRef.current) }, [releaseLocks])

  /* 锁定超时自动释放：每 5 秒扫描一次过期条目 */
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      const expired = cartRef.current.filter(item => now - item.lockTime >= LOCK_DURATION_MS)
      if (expired.length === 0) return
      releaseLocks(expired)
      setCart(prev => prev.filter(item => now - item.lockTime < LOCK_DURATION_MS))
      message.info(t('lockExpiredMsg'))
    }, 5000)
    return () => clearInterval(timer)
  }, [LOCK_DURATION_MS, releaseLocks, t])

  /* 格子点选：加入即锁（规则4），取消即释放 */
  const handleCellToggle = (cell: AdInventoryCell) => {
    if (algoId == null || !product?.groupCode) return
    const key = cellKeyOf(cell.bizDate, cell.region)
    const existing = cart.find(item => item.key === key)
    if (existing) {
      setCart(prev => prev.filter(item => item.key !== key))
      unlockAdCells({
        algoId, groupCode: product.groupCode, channel: GROUP_BUY_CHANNEL, productId: product.id,
        cells: [{ bizDate: cell.bizDate, region: cell.region, mealSlot: ALL_DAY_SLOT }],
      }).catch(() => { /* 静默 */ })
      return
    }
    if (cell.status !== 'available') return
    lockAdCells({
      algoId, groupCode: product.groupCode, channel: GROUP_BUY_CHANNEL, productId: product.id,
      cells: [{ bizDate: cell.bizDate, region: cell.region, mealSlot: ALL_DAY_SLOT }],
    })
      .then(() => setCart(prev => [...prev, { key, bizDate: cell.bizDate, region: cell.region, cellPrice: cell.cellPrice, lockTime: Date.now() }]))
      .catch(err => {
        message.error(err instanceof Error ? err.message : t('cellUnavailableMsg'))
        fetchAdInventory(algoId, undefined, product.groupCode, GROUP_BUY_CHANNEL).then(setInventory).catch(() => {})
      })
  }

  /* 提交订单：推广金扣款（后端裁决商品必须属于其归属集团并做同格防重） */
  const handlePay = () => {
    const groupCode = product?.groupCode
    if (algoId == null || !product || !groupCode || cart.length === 0) return
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('confirmSubmitTitle'),
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.9 }}>
          <div>{t('confirmProductLine', { name: product.name, id: product.id })}</div>
          <div>{t('confirmGroupLine', { name: product.groupName ?? groupCode })}</div>
          <div>{t('confirmCellLine', { count: cart.length })}</div>
          <div>{t('confirmPayLine', { amount: totalAmount.toFixed(2) })}</div>
        </div>
      ),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      onOk: async () => {
        setPaying(true)
        try {
          const order = await placeAdStarOrder({
            algoId,
            groupCode,
            channel: GROUP_BUY_CHANNEL,
            productId: product.id,
            productName: product.name,
            cells: cart.map(item => ({ bizDate: item.bizDate, region: item.region, mealSlot: ALL_DAY_SLOT })),
          })
          setCart([])
          Modal.success({
            title: t('orderSuccessTitle'),
            content: t('orderSuccessContent', { orderNo: order.orderNo, amount: order.actualAmount }),
            okText: t('viewOrders'),
            onOk: () => handleViewOrders(),
          })
          fetchAdInventory(algoId, undefined, groupCode, GROUP_BUY_CHANNEL).then(setInventory).catch(() => {})
          fetchFinAccountBalance(groupCode, brandValue).then(account => setBalance(account ? Number(account.virtualBalance) : null)).catch(() => setBalance(null))
        } catch (err) {
          message.error(err instanceof Error ? err.message : t('submitFailed'))
          fetchAdInventory(algoId, undefined, groupCode, GROUP_BUY_CHANNEL).then(setInventory).catch(() => {})
        } finally {
          setPaying(false)
        }
      },
    })
  }

  const handleViewOrders = () => {
    const typeName = RECOMMEND_TYPE_CONFIGS.find(config => config.type === AlgorithmType.INVINCIBLE_STAR)?.name || ''
    navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`)
  }

  /* 日期行 × 商圈列的全天格子矩阵（仅预售窗口；窗口外置灰待开售） */
  const gridRows = useMemo(() => {
    if (!inventory) return []
    const today = dayjs().startOf('day')
    const windowEnd = today.add(inventory.presaleDays - 1, 'day')
    const dates: Dayjs[] = []
    for (let cursor = today; !cursor.isAfter(windowEnd.add(3, 'day')); cursor = cursor.add(1, 'day')) dates.push(cursor)
    return dates
  }, [inventory])

  const regionsShown = useMemo(() => {
    const ids = new Set((inventory?.cells ?? []).map(cell => cell.region))
    return REGION_LIST.filter(region => ids.has(Number(region.key)))
  }, [inventory])

  const columns: ColumnsType<Dayjs> = useMemo(() => [
    {
      title: t('date'),
      key: 'date',
      width: 120,
      fixed: 'left',
      render: (_, date) => (
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600 }}>{date.format('MM-DD')}</div>
          <div style={{ color: 'var(--text-3)' }}>{readWeekdayShort(t)[date.day()]}</div>
        </div>
      ),
    },
    ...regionsShown.map(region => ({
      title: region.name,
      key: String(region.key),
      width: 130,
      render: (_: unknown, date: Dayjs) => {
        const bizDate = date.format('YYYY-MM-DD')
        const cell = cellMap.get(cellKeyOf(bizDate, Number(region.key)))
        if (!cell) {
          return <div className="star-product-cell star-product-cell--off">{t('pendingSale')}</div>
        }
        const selected = cart.some(item => item.key === cellKeyOf(bizDate, cell.region))
        const disabled = cell.status !== 'available' && !selected
        const statusLabel = cell.status === 'soldOut' ? t('soldOut') : cell.status === 'unavailable' ? t('unavailableCell') : `MOP ${cell.cellPrice}`
        return (
          <button
            type="button"
            className={`star-product-cell${selected ? ' star-product-cell--selected' : ''}${disabled ? ' star-product-cell--disabled' : ''}`}
            disabled={disabled}
            aria-label={`${region.name} · ${bizDate} · ${t('fullDay')} ${statusLabel}${cell.remaining != null ? ` · ${t('remainingCount')} ${cell.remaining}` : ''}`}
            onClick={() => handleCellToggle(cell)}
          >
            <span>{statusLabel}</span>
            {cell.status === 'available' && <span className="star-product-cell__remaining">{t('remainingCount')} {cell.remaining ?? '-'}</span>}
          </button>
        )
      },
    })),
  // handleCellToggle 依赖的 state 都在闭包内重建，列随库存/购物车刷新联动
  ], [regionsShown, cellMap, cart, t]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="star-product-purchase">
      <Card size="small" title={t('choosePromoProduct')} style={{ marginBottom: 16 }}>
        <Space wrap size={16} style={{ width: '100%' }}>
          <Select
            aria-label={t('common:brand')}
            placeholder={t('common:selectBrand')}
            style={{ width: 180 }}
            value={brand}
            onChange={value => { setBrand(value); setProduct(null) }}
            options={APP_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey, { ns: 'recommend' }) }))}
          />
          <Select
            aria-label={t('productStarAlgoPh')}
            placeholder={algorithmLoading ? t('loading') : t('productStarAlgoPh')}
            style={{ width: 260 }}
            value={algoId}
            loading={algorithmLoading}
            disabled={brand == null}
            onChange={setAlgoId}
            options={algorithmOptions}
            notFoundContent={brand == null ? t('selectBrandFirst') : t('productStarAlgoEmpty')}
          />
          <Select
            aria-label={t('productSearchPh')}
            showSearch
            placeholder={t('productSearchPh')}
            style={{ width: 320 }}
            filterOption={false}
            disabled={algoId == null}
            loading={productLoading}
            value={product?.id}
            onSearch={handleProductSearch}
            onChange={value => setProduct(productOptions.find(item => item.id === value) ?? null)}
            options={productOptions.map(item => ({
              value: item.id,
              label: `${item.name}（${item.id}）`,
            }))}
          />
        </Space>
        {product?.groupCode && (
          <div className="star-product-purchase__summary">
            <span>{t('groupLabel')}：<b>{product.groupName ?? product.groupCode}</b></span>
            <span>{t('promoBalance')}：<b>{balance == null ? '--' : `MOP ${balance.toLocaleString()}`}</b></span>
            <span>{t('applyStoresLabel')}：<Tag>{t('storePresetTag')}</Tag></span>
          </div>
        )}
        {algoId != null && !product?.groupCode && product && (
          <Alert style={{ marginTop: 12 }} type="warning" showIcon message={t('productNoGroupAlert')} />
        )}
      </Card>

      <Card size="small" title={t('dayRegionGridTitle')} extra={inventory ? undefined : <Spin size="small" />}>
        {inventory ? (
          <Table<Dayjs>
            size="small"
            rowKey={date => date.format('YYYY-MM-DD')}
            columns={columns}
            dataSource={gridRows}
            pagination={false}
            scroll={{ x: 'max-content', y: 420 }}
          />
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
            {algoId != null && product ? t('loading') : t('selectAlgoProductFirst')}
          </div>
        )}
      </Card>

      <div className="star-product-purchase__footer">
        <Space size={12} wrap>
          <span>{t('selectedCellsLabel')} <b>{cart.length}</b></span>
          <span>{t('totalLabel')} <b>MOP {totalAmount.toFixed(2)}</b></span>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{t('finalPayNote')}</span>
        </Space>
        <Space size={8}>
          {cart.length > 0 && (
            <Button onClick={() => { releaseLocks(cart); setCart([]) }}>{t('clearSelection')}</Button>
          )}
          <Button type="primary" disabled={cart.length === 0 || algoId == null || !product?.groupCode}
            loading={paying} onClick={handlePay}>
            {t('submitOrderWithPromo')}
          </Button>
        </Space>
      </div>
    </div>
  )
}
