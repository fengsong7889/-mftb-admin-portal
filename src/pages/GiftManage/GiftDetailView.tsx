import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button, Tag, Image, Empty, Input, Select, DatePicker, Pagination, Modal, InputNumber, message, Spin } from 'antd'
import {
  ArrowLeftOutlined,
  ShopOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  MinusCircleOutlined,
  DownOutlined,
  UpOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import BrandTag from '../../components/BrandTag'
import type { GiftRecordItem } from '../../api/gift'
import { fetchGiftRecordDetail, fetchGiftRecordsByStore, deductGiftDays } from '../../api/gift'
import { fillGiftApprovalNoFallback } from '../../utils/approvalStore'

const { RangePicker } = DatePicker

/* ---- 數字動畫 Hook ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}</>
}

const adTypeColorMap: Record<string, string> = {
  new_store: '#52C41A',
  revival: '#E8720C',
  exclusive: '#722ED1',
  gold: '#FAAD14',
  ka: '#1890FF',
}

const IMG_FALLBACK =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNiZmJmYmYiIGZvbnQtc2l6ZT0iMTIiPuWHreivgTwvdGV4dD48L3N2Zz4='

/** 将 API GiftRecordItem 映射为页面内部记录结构 */
interface GiftRecord {
  key: string
  giftId: string
  approvalNo: string
  giftDate: string
  giftDays: number
  remainingDays: number
  validDays: number
  expireDate: string
  reason: string
  credentials: string[]
}

function mapToRecord(item: GiftRecordItem, fallbackApprovalNo?: string): GiftRecord {
  return {
    key: String(item.id),
    giftId: item.giftId,
    approvalNo: item.approvalNo || fallbackApprovalNo || '',
    giftDate: item.giftDate || '',
    giftDays: item.totalDays,
    remainingDays: item.remainingDays,
    validDays: item.validDays,
    expireDate: item.expireDate || '',
    reason: item.reason,
    credentials: item.credentials || [],
  }
}

const PAGE_SIZE = 5

type GiftStatus = 'valid' | 'exhausted'
const getStatus = (r: GiftRecord): GiftStatus => (r.remainingDays > 0 ? 'valid' : 'exhausted')

export default function GiftDetailView() {
  const { t } = useTranslation('giftDetailView')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recordId = searchParams.get('id')
  const storeIdParam = searchParams.get('storeId')
  const adTypeParam = searchParams.get('adType')

  const adTypeMap: Record<string, string> = {
    new_store: t('adTypeNewStore'),
    revival: t('adTypeRevival'),
    exclusive: t('adTypeExclusive'),
    gold: t('adTypeGold'),
    ka: t('adTypeKa'),
  }

  const [loading, setLoading] = useState(true)
  const [merchantInfo, setMerchantInfo] = useState<{
    groupId: number; groupCode?: string; groupName: string
    storeId: number; storeCode?: string; storeName: string
    brand: string; adType: string
  } | null>(null)
  const [records, setRecords] = useState<GiftRecord[]>([])

  /** 篩選條件 */
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | GiftStatus>('all')
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const [applied, setApplied] = useState<{ keyword: string; status: 'all' | GiftStatus; dateRange: [string, string] | null }>({
    keyword: '', status: 'all', dateRange: null,
  })
  const [page, setPage] = useState(1)

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [deductTarget, setDeductTarget] = useState<GiftRecord | null>(null)
  const [deductDays, setDeductDays] = useState<number>(1)
  const [deductReason, setDeductReason] = useState('')

  // 加载数据：以门店+广告类型加载逐笔赠送记录（兼容旧入口：仅传记录 ID 时先反查门店与广告类型）
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let sid = storeIdParam ? Number(storeIdParam) : NaN
      let adType = adTypeParam || ''
      if ((!sid || !adType) && recordId) {
        const detail = await fetchGiftRecordDetail(Number(recordId))
        sid = detail.storeId
        adType = detail.adType
      }
      if (!sid || !adType) { setLoading(false); return }

      const list = await fetchGiftRecordsByStore({ storeId: sid, adType })
      // 存量记录未写入流程编号时，以本地已通过审批流程兜底展示
      const flowMap = fillGiftApprovalNoFallback(list)
      if (list.length > 0) {
        const first = list[0]
        setMerchantInfo({
          groupId: first.groupId,
          groupCode: first.groupCode,
          groupName: first.groupName,
          storeId: first.storeId,
          storeCode: first.storeCode,
          storeName: first.storeName,
          brand: first.brand,
          adType: first.adType,
        })
      }
      setRecords(list.map(item => mapToRecord(item, flowMap.get(item.id))))
    } catch {
      message.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [recordId, storeIdParam, adTypeParam])

  useEffect(() => {
    loadData()
  }, [loadData])

  const adColor = adTypeColorMap[merchantInfo?.adType || ''] || '#E8720C'

  const stats = useMemo(() => {
    const totalGift = records.reduce((s, r) => s + r.giftDays, 0)
    const remaining = records.reduce((s, r) => s + r.remainingDays, 0)
    const consumed = totalGift - remaining
    const validCount = records.filter(r => r.remainingDays > 0).length
    const exhaustedCount = records.length - validCount
    return { totalGift, remaining, consumed, count: records.length, validCount, exhaustedCount }
  }, [records])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (applied.keyword) {
        const kw = applied.keyword.trim().toLowerCase()
        if (!r.giftId.toLowerCase().includes(kw) && !r.approvalNo.toLowerCase().includes(kw)) return false
      }
      if (applied.status !== 'all' && getStatus(r) !== applied.status) return false
      if (applied.dateRange) {
        const [start, end] = applied.dateRange
        if (r.giftDate < start || r.giftDate > end) return false
      }
      return true
    })
  }, [records, applied])

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredRecords.slice(start, start + PAGE_SIZE)
  }, [filteredRecords, page])

  const handleSearch = () => {
    setApplied({ keyword, status: statusFilter, dateRange })
    setPage(1)
  }

  const handleReset = () => {
    setKeyword('')
    setStatusFilter('all')
    setDateRange(null)
    setApplied({ keyword: '', status: 'all', dateRange: null })
    setPage(1)
  }

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openDeduct = (record: GiftRecord) => {
    setDeductTarget(record)
    setDeductDays(1)
    setDeductReason('')
  }

  const handleDeductConfirm = async () => {
    if (!deductTarget) return
    if (deductDays < 1 || deductDays > deductTarget.remainingDays) {
      message.error(t('deductRangeError'))
      return
    }
    try {
      // 通过 giftId 找到对应的原始记录 ID
      const originalRecord = records.find(r => r.key === deductTarget.key)
      if (!originalRecord) return

      await deductGiftDays(Number(originalRecord.key), {
        deductDays,
        reason: deductReason,
      })
      message.success(t('deductSuccess', { days: deductDays, giftId: deductTarget.giftId }))
      setDeductTarget(null)
      loadData() // 重新加载数据
    } catch {
      message.error(t('deductFailed'))
    }
  }

  const statCards = [
    { label: t('statTotalGift'), value: stats.totalGift, unit: t('statUnitDay'), color: '#1890FF', bg: '#E6F4FF' },
    { label: t('statConsumed'), value: stats.consumed, unit: t('statUnitDay'), color: '#FF7A45', bg: '#FFF2E8' },
    { label: t('statRemaining'), value: stats.remaining, unit: t('statUnitDay'), color: '#52C41A', bg: '#F6FFED' },
    { label: t('statCount'), value: stats.count, unit: t('statUnitValid', { valid: stats.validCount, exhausted: stats.exhaustedCount }), color: '#722ED1', bg: '#F9F0FF' },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('loading')} />
      </div>
    )
  }

  if (!merchantInfo) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Empty description={t('notFound')} />
      </div>
    )
  }

  return (
    <div>
      {/* 頁面標題 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/gift-detail')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}
            >
              {t('common:back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('pageTitle')}</h2>
          </div>
        </div>
      </div>

      {/* 商家基本信息 */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <h3 style={{
          margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#262626',
          borderBottom: '1px dashed rgba(0,0,0,0.08)', paddingBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ShopOutlined style={{ color: '#E8720C' }} />
          {t('merchantInfo')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>{t('groupId')}</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{merchantInfo.groupCode || merchantInfo.groupId}</div>
          </div>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>{t('groupName')}</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{merchantInfo.groupName}</div>
          </div>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>{t('storeIdName')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>
              <span style={{ color: '#8C8C8C', fontSize: 12 }}>{merchantInfo.storeCode || merchantInfo.storeId}</span>
              <span style={{ marginLeft: 8 }}>{merchantInfo.storeName}</span>
            </div>
          </div>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>{t('common:brand')}</div>
            <div><BrandTag value={merchantInfo.brand} /></div>
          </div>
        </div>
      </div>

      {/* 統計概覽 */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          paddingBottom: 12, borderBottom: '1px dashed rgba(0,0,0,0.08)',
        }}>
          <div style={{ width: 6, height: 20, borderRadius: 3, background: adColor }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
            <WalletOutlined style={{ color: adColor }} />
            {t('giftOverview')}
          </h3>
          <Tag style={{
            background: `${adColor}15`, color: adColor,
            border: `1px solid ${adColor}40`, fontSize: 13, padding: '2px 12px', margin: 0,
          }}>
            {adTypeMap[merchantInfo.adType] || merchantInfo.adType}
          </Tag>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {statCards.map(c => (
            <div
              key={c.label}
              style={{
                background: c.bg, borderRadius: 10, padding: '16px 20px',
                border: `1px solid ${c.color}22`, cursor: 'default',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 8 }}>{c.label}</div>
              <div>
                <span style={{ fontSize: 28, fontWeight: 700, color: c.color }}>
                  <AnimatedNumber value={c.value} />
                </span>
                <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 6 }}>{c.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 贈送記錄 */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {/* 篩選欄 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
          marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed rgba(0,0,0,0.08)',
        }}>
          <Input
            allowClear
            placeholder={t('filterPlaceholder')}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 220 }}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { label: t('statusAll'), value: 'all' },
              { label: t('statusValid'), value: 'valid' },
              { label: t('statusExhausted'), value: 'exhausted' },
            ]}
          />
          <RangePicker
            value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
            onChange={(_, strings) => {
              if (strings && strings[0] && strings[1]) setDateRange([strings[0], strings[1]])
              else setDateRange(null)
            }}
            placeholder={[t('dateStart'), t('dateEnd')]}
            style={{ width: 260 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common:search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common:reset')}</Button>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#595959' }}>
            {t('totalRecords', { count: filteredRecords.length })}
          </span>
        </div>

        {/* 記錄卡片列表 */}
        {filteredRecords.length === 0 ? (
          <Empty description={t('noMatch')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pagedRecords.map(record => {
              const expanded = expandedKeys.has(record.key)
              const status = getStatus(record)
              const noRemaining = record.remainingDays <= 0
              return (
                <div
                  key={record.key}
                  style={{ border: '1px solid #f0f0f0', borderRadius: 10, overflow: 'hidden', background: '#FCFCFC' }}
                >
                  {/* 卡片頭部 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20,
                    padding: '14px 20px', background: '#fff',
                    borderBottom: expanded ? '1px solid #f0f0f0' : 'none',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 12px', borderRadius: 6,
                      background: '#FAFAFA', border: '1px solid #E8E8E8', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('giftIdLabel')}</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 700, fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>{record.giftId}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('giftDateLabel')}</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{record.giftDate}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('giftDaysLabel')}</span>
                      <span style={{ fontSize: 15, color: '#262626', fontWeight: 600 }}>{record.giftDays}</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('dayUnit')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('remainingDaysLabel')}</span>
                      <span style={{ fontSize: 16, color: noRemaining ? '#8C8C8C' : '#52C41A', fontWeight: 700 }}>{record.remainingDays}</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('dayUnit')}</span>
                      <Tag color={status === 'valid' ? 'success' : 'default'} style={{ margin: 0 }}>
                        {status === 'valid' ? t('statusValid') : t('statusExhausted')}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('validDaysLabel')}</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{record.validDays} {t('validDaysUnit')}</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('expireDatePrefix', { date: record.expireDate })}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('approvalNoLabel')}</span>
                      <span style={{ fontSize: 13, color: '#595959', fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>{record.approvalNo}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                      <Button
                        type="link" danger icon={<MinusCircleOutlined />}
                        disabled={noRemaining} onClick={() => openDeduct(record)}
                        style={{ padding: '4px 8px', borderRadius: 4, fontSize: 13, fontWeight: 500 }}
                      >
                        {t('deductDays')}
                      </Button>
                      <Button
                        type="link" icon={<EyeOutlined />}
                        onClick={() => navigate(`/gift-consume-detail?giftId=${record.giftId}`)}
                        style={{ color: '#E8720C', padding: '4px 8px', borderRadius: 4, fontSize: 13, fontWeight: 500 }}
                      >
                        {t('viewDetail')}
                      </Button>
                      <Button
                        type="text" icon={expanded ? <UpOutlined /> : <DownOutlined />}
                        onClick={() => toggleExpand(record.key)}
                        style={{ color: '#8C8C8C', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}
                      >
                        {expanded ? t('collapse') : t('detail')}
                      </Button>
                    </div>
                  </div>

                  {/* 卡片內容 */}
                  {expanded && (
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ marginBottom: record.credentials.length > 0 ? 16 : 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, color: '#8C8C8C', marginBottom: 8,
                        }}>
                          <FileTextOutlined />
                          {t('giftReasonLabel')}
                        </div>
                        <div style={{
                          fontSize: 13, color: '#262626', lineHeight: 1.8,
                          padding: '12px 16px', background: '#fff', borderRadius: 8,
                          border: '1px solid #f0f0f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {record.reason || '—'}
                        </div>
                      </div>

                      {record.credentials.length > 0 && (
                        <div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 12, color: '#8C8C8C', marginBottom: 8,
                          }}>
                            <PaperClipOutlined />
                            {t('certificateLabel', { count: record.credentials.length })}
                          </div>
                          <Image.PreviewGroup>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              {record.credentials.map((url, i) => (
                                <Image
                                  key={i}
                                  src={url}
                                  width={88}
                                  height={88}
                                  style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8' }}
                                  fallback={IMG_FALLBACK}
                                />
                              ))}
                            </div>
                          </Image.PreviewGroup>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {filteredRecords.length > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={filteredRecords.length}
              onChange={setPage}
              showTotal={(total) => t('common:totalRecords', { count: total })}
            />
          </div>
        )}
      </div>

      {/* 底部操作欄 */}
      <div className="form-footer" style={{
        display: 'flex', justifyContent: 'center', padding: '16px 24px',
        background: '#fff', borderTop: '1px solid #f0f0f0',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.04)', borderRadius: '0 0 8px 8px',
      }}>
        <Button
          size="large" icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/gift-detail')}
          style={{ height: 38, minWidth: 96, borderRadius: 8 }}
        >
          {t('backToList')}
        </Button>
      </div>

      {/* 扣除天數彈窗 */}
      <Modal
        title={t('deductModalTitle')}
        open={!!deductTarget}
        onCancel={() => setDeductTarget(null)}
        onOk={handleDeductConfirm}
        okText={t('confirmDeduct')}
        cancelText={t('common:cancel')}
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        {deductTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8, paddingBottom: 24 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>{t('giftIdLabel')}</div>
                <div style={{ fontSize: 14, color: '#262626', fontWeight: 700, fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>{deductTarget.giftId}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>{t('currentRemaining')}</div>
                <div style={{ fontSize: 14, color: '#52C41A', fontWeight: 700 }}>{deductTarget.remainingDays} {t('dayUnit')}</div>
              </div>
            </div>
            <div>
              <div style={{ color: '#262626', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#FF4D4F', marginRight: 4 }}>*</span>{t('deductDaysField')}
              </div>
              <InputNumber
                min={1}
                max={deductTarget.remainingDays}
                value={deductDays}
                onChange={v => setDeductDays(v || 1)}
                style={{ width: '100%' }}
                addonAfter={t('dayUnit')}
              />
            </div>
            <div>
              <div style={{ color: '#262626', fontSize: 13, marginBottom: 4 }}>{t('deductReasonField')}</div>
              <Input.TextArea
                rows={3}
                placeholder={t('deductReasonPlaceholder')}
                value={deductReason}
                onChange={e => setDeductReason(e.target.value)}
                maxLength={200}
                showCount
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
