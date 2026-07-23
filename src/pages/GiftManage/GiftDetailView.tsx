import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Tag, Image, Empty, Input, Select, DatePicker, Pagination, Modal, InputNumber, message } from 'antd'
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
import dayjs from 'dayjs'
import BrandTag from '../../components/BrandTag'

const { RangePicker } = DatePicker

/* ---- 數字動畫 Hook（與訂單詳情推廣數據卡片一致） ---- */
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

/* ---- 動畫數字組件 ---- */
function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}</>
}


const adTypeMap: Record<string, string> = {
  new_store: '新店廣告',
  revival: '盤活復蘇',
  exclusive: '獨家商家',
  gold: '金牌商家',
  ka: '人氣商家(KA)',
}

const adTypeColorMap: Record<string, string> = {
  new_store: '#52C41A',
  revival: '#E8720C',
  exclusive: '#722ED1',
  gold: '#FAAD14',
  ka: '#1890FF',
}

/** 空圖占位（憑證加載失敗降級） */
const IMG_FALLBACK =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNiZmJmYmYiIGZvbnQtc2l6ZT0iMTIiPuWHreivgTwvdGV4dD48L3N2Zz4='

/** 單筆贈送記錄 */
interface GiftRecord {
  key: string
  /** 贈送ID（用於消費明細菜單關聯） */
  giftId: string
  /** 審批流程編號 */
  approvalNo: string
  giftDate: string
  giftDays: number
  /** 剩餘可用天數 */
  remainingDays: number
  validDays: number
  expireDate: string
  reason: string
  credentials: string[]
}

/** Mock 商家數據：一個詳情僅一個廣告類型，包含多筆贈送記錄 */
const mockMerchantMap: Record<string, {
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  brand: string
  adType: string
  records: GiftRecord[]
}> = {
  '1': {
    groupId: 'G001',
    groupName: '美味餐廳集團',
    storeId: 'S1001',
    storeName: '澳門總店',
    brand: '2',
    adType: 'new_store',
    records: [
      {
        key: '1-1',
        giftId: '2401-001',
        approvalNo: 'SP202401150001',
        giftDate: '2024-01-15',
        giftDays: 15,
        remainingDays: 8,
        validDays: 180,
        expireDate: '2024-07-15',
        reason: '新集團入駐扶持計劃：為幫助新入駐的美味餐廳集團快速起步，經業務主管與運營主管聯合評估，決定給予首批新店廣告推廣天數扶持。該集團旗下門店在澳門地區具備較強的品牌影響力，預計可帶動平台整體訂單量增長，故予以重點扶持，助力其在平台冷啟動階段獲得足夠的曝光資源。',
        credentials: [
          'https://zos.alipayobjects.com/rmsportal/HDJoMRJAbsFCOzO/f.png',
          'https://gw.alipayobjects.com/zos/antfincdn/LlvErxo8H9/photo-1503185912284-5271ff81b9a8.webp',
        ],
      },
      {
        key: '1-2',
        giftId: '2403-001',
        approvalNo: 'SP202403010002',
        giftDate: '2024-03-01',
        giftDays: 15,
        remainingDays: 0,
        validDays: 90,
        expireDate: '2024-05-30',
        reason: '春季大促活動額外支持，配合平台三月大促為商家追加新店廣告推廣資源。',
        credentials: [
          'https://gw.alipayobjects.com/zos/antfincdn/cV16ZqzMjW/photo-1473091540282-9b846e7965e3.webp',
        ],
      },
      {
        key: '1-3',
        giftId: '2405-001',
        approvalNo: 'SP202405100003',
        giftDate: '2024-05-10',
        giftDays: 10,
        remainingDays: 10,
        validDays: 60,
        expireDate: '2024-07-09',
        reason: '商家經營週年慶回饋。',
        credentials: [],
      },
    ],
  },
  '2': {
    groupId: 'G002',
    groupName: '生鮮超市集團',
    storeId: 'S1002',
    storeName: '氹仔分店',
    brand: '1',
    adType: 'revival',
    records: [
      {
        key: '2-1',
        giftId: '2310-001',
        approvalNo: 'SP202310010001',
        giftDate: '2023-10-01',
        giftDays: 30,
        remainingDays: 12,
        validDays: 180,
        expireDate: '2024-04-01',
        reason: '集團盤活復蘇計劃：針對近期經營數據下滑的生鮮超市集團，啟動盤活復蘇專項扶持，通過贈送盤活復蘇廣告推廣天數，幫助商家重新獲得平台流量，恢復經營活力。',
        credentials: [
          'https://gw.alipayobjects.com/zos/antfincdn/LlvErxo8H9/photo-1503185912284-5271ff81b9a8.webp',
        ],
      },
      {
        key: '2-2',
        giftId: '2401-002',
        approvalNo: 'SP202401100002',
        giftDate: '2024-01-10',
        giftDays: 30,
        remainingDays: 0,
        validDays: 120,
        expireDate: '2024-05-10',
        reason: '盤活復蘇二期支持，延續扶持政策。',
        credentials: [],
      },
    ],
  },
  '3': {
    groupId: 'G003',
    groupName: '時尚百貨集團',
    storeId: 'S1003',
    storeName: '新馬路店',
    brand: '2',
    adType: 'exclusive',
    records: [
      {
        key: '3-1',
        giftId: '2401-003',
        approvalNo: 'SP202401010001',
        giftDate: '2024-01-01',
        giftDays: 45,
        remainingDays: 45,
        validDays: 365,
        expireDate: '2024-12-31',
        reason: '獨家商家簽約扶持：時尚百貨集團與平台達成年度獨家合作協議，作為簽約權益之一，平台為其提供獨家商家廣告推廣天數扶持，保障其在合作期內的優先曝光權益。',
        credentials: [
          'https://zos.alipayobjects.com/rmsportal/HDJoMRJAbsFCOzO/f.png',
          'https://gw.alipayobjects.com/zos/antfincdn/cV16ZqzMjW/photo-1473091540282-9b846e7965e3.webp',
          'https://gw.alipayobjects.com/zos/antfincdn/LlvErxo8H9/photo-1503185912284-5271ff81b9a8.webp',
        ],
      },
    ],
  },
}

const PAGE_SIZE = 5

/** 贈送狀態：可用 / 已用完 */
type GiftStatus = 'valid' | 'exhausted'
const getStatus = (r: GiftRecord): GiftStatus => (r.remainingDays > 0 ? 'valid' : 'exhausted')

export default function GiftDetailView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recordKey = searchParams.get('key') || '1'
  const merchant = mockMerchantMap[recordKey] || mockMerchantMap['1']
  const adColor = adTypeColorMap[merchant.adType] || '#E8720C'

  /** 贈送記錄置於狀態中，扣除天數後即時更新 */
  const [records, setRecords] = useState<GiftRecord[]>(merchant.records)

  /** 篩選條件 */
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | GiftStatus>('all')
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  /** 已生效的篩選條件（點擊查詢後才應用） */
  const [applied, setApplied] = useState<{ keyword: string; status: 'all' | GiftStatus; dateRange: [string, string] | null }>({
    keyword: '',
    status: 'all',
    dateRange: null,
  })
  const [page, setPage] = useState(1)

  /** 展開明細的卡片 key 集合（默認收起，節省空間） */
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  /** 扣除天數彈窗 */
  const [deductTarget, setDeductTarget] = useState<GiftRecord | null>(null)
  const [deductDays, setDeductDays] = useState<number>(1)
  const [deductReason, setDeductReason] = useState('')

  /** 統計概覽（基於全部記錄，不受篩選影響） */
  const stats = useMemo(() => {
    const totalGift = records.reduce((s, r) => s + r.giftDays, 0)
    const remaining = records.reduce((s, r) => s + r.remainingDays, 0)
    const consumed = totalGift - remaining
    const validCount = records.filter(r => r.remainingDays > 0).length
    const exhaustedCount = records.length - validCount
    return { totalGift, remaining, consumed, count: records.length, validCount, exhaustedCount }
  }, [records])

  /** 篩選後的記錄 */
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

  /** 分頁後的記錄 */
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

  const handleDeductConfirm = () => {
    if (!deductTarget) return
    if (deductDays < 1 || deductDays > deductTarget.remainingDays) {
      message.error('扣除天數需在 1 ~ 剩餘天數之間')
      return
    }
    setRecords(prev =>
      prev.map(r =>
        r.key === deductTarget.key ? { ...r, remainingDays: r.remainingDays - deductDays } : r,
      ),
    )
    message.success(`已扣除 ${deductDays} 天（贈送ID：${deductTarget.giftId}）`)
    setDeductTarget(null)
  }

  /** 統計卡片配置 */
  const statCards = [
    { label: '累計贈送', value: stats.totalGift, unit: '天', color: '#1890FF', bg: '#E6F4FF' },
    { label: '已消耗', value: stats.consumed, unit: '天', color: '#FF7A45', bg: '#FFF2E8' },
    { label: '剩餘可用', value: stats.remaining, unit: '天', color: '#52C41A', bg: '#F6FFED' },
    { label: '贈送筆數', value: stats.count, unit: `筆 · 有效 ${stats.validCount} / 用完 ${stats.exhaustedCount}`, color: '#722ED1', bg: '#F9F0FF' },
  ]

  return (
    <div>
      {/* 頁面標題 */}
      <div style={{
        position: 'relative',
        background: '#fff',
        marginBottom: 16,
        borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
        }} />
        <div style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/gift-detail')}
              style={{
                backgroundColor: '#E8720C',
                borderColor: '#E8720C',
                borderRadius: 8,
                height: 36,
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              返回
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>贈送明細</h2>
            </div>
          </div>
        </div>
      </div>

      {/* 商家基本信息 */}
      <div style={{
        background: '#fff',
        borderRadius: 8,
        padding: '20px 24px',
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <h3 style={{
          margin: '0 0 16px',
          fontSize: 16,
          fontWeight: 600,
          color: '#262626',
          borderBottom: '1px dashed rgba(0,0,0,0.08)',
          paddingBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <ShopOutlined style={{ color: '#E8720C' }} />
          商家基本信息
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>集團ID</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{merchant.groupId}</div>
          </div>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>集團名稱</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{merchant.groupName}</div>
          </div>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>門店ID/名稱</div>
            <div style={{ fontSize: 14, color: '#262626' }}>
              <span style={{ color: '#8C8C8C', fontSize: 12 }}>{merchant.storeId}</span>
              <span style={{ marginLeft: 8 }}>{merchant.storeName}</span>
            </div>
          </div>
          <div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>所屬品牌</div>
            <div><BrandTag value={merchant.brand} /></div>
          </div>
        </div>
      </div>

      {/* 統計概覽 */}
      <div style={{
        background: '#fff',
        borderRadius: 8,
        padding: '20px 24px',
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px dashed rgba(0,0,0,0.08)',
        }}>
          <div style={{ width: 6, height: 20, borderRadius: 3, background: adColor }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
            <WalletOutlined style={{ color: adColor }} />
            贈送概覽
          </h3>
          <Tag style={{
            background: `${adColor}15`,
            color: adColor,
            border: `1px solid ${adColor}40`,
            fontSize: 13,
            padding: '2px 12px',
            margin: 0,
          }}>
            {adTypeMap[merchant.adType] || merchant.adType}
          </Tag>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {statCards.map(c => (
            <div
              key={c.label}
              style={{
                background: c.bg,
                borderRadius: 10,
                padding: '16px 20px',
                border: `1px solid ${c.color}22`,
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'default',
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

      {/* 贈送記錄（篩選 + 分頁） */}
      <div style={{
        background: '#fff',
        borderRadius: 8,
        padding: '20px 24px',
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {/* 篩選欄 */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px dashed rgba(0,0,0,0.08)',
        }}>
          <Input
            allowClear
            placeholder="贈送ID / 審批編號"
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
              { label: '全部狀態', value: 'all' },
              { label: '可用', value: 'valid' },
              { label: '已用完', value: 'exhausted' },
            ]}
          />
          <RangePicker
            value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
            onChange={(_, strings) => {
              if (strings && strings[0] && strings[1]) setDateRange([strings[0], strings[1]])
              else setDateRange(null)
            }}
            placeholder={['贈送開始', '贈送結束']}
            style={{ width: 260 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#595959' }}>
            共 <span style={{ fontWeight: 600, color: adColor }}>{filteredRecords.length}</span> 筆記錄
          </span>
        </div>

        {/* 記錄卡片列表 */}
        {filteredRecords.length === 0 ? (
          <Empty description="暫無符合條件的贈送記錄" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pagedRecords.map(record => {
              const expanded = expandedKeys.has(record.key)
              const status = getStatus(record)
              const noRemaining = record.remainingDays <= 0
              return (
                <div
                  key={record.key}
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#FCFCFC',
                  }}
                >
                  {/* 卡片頭部 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 20,
                    padding: '14px 20px',
                    background: '#fff',
                    borderBottom: expanded ? '1px solid #f0f0f0' : 'none',
                  }}>
                    {/* 贈送ID（替代序號，中性樣式） */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 12px',
                      borderRadius: 6,
                      background: '#FAFAFA',
                      border: '1px solid #E8E8E8',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>贈送ID</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 700, fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>{record.giftId}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>贈送日期</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{record.giftDate}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>贈送天數</span>
                      <span style={{ fontSize: 15, color: '#262626', fontWeight: 600 }}>{record.giftDays}</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>天</span>
                    </div>
                    {/* 剩餘天數（唯一重點高亮） */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>剩餘天數</span>
                      <span style={{ fontSize: 16, color: noRemaining ? '#8C8C8C' : '#52C41A', fontWeight: 700 }}>{record.remainingDays}</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>天</span>
                      <Tag color={status === 'valid' ? 'success' : 'default'} style={{ margin: 0 }}>
                        {status === 'valid' ? '可用' : '已用完'}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>有效期</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{record.validDays} 天</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>（至 {record.expireDate}）</span>
                    </div>
                    {/* 審批編號（放在最後） */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>審批編號</span>
                      <span style={{ fontSize: 13, color: '#595959', fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>{record.approvalNo}</span>
                    </div>

                    {/* 右側操作按鈕 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                      <Button
                        type="link"
                        danger
                        icon={<MinusCircleOutlined />}
                        disabled={noRemaining}
                        onClick={() => openDeduct(record)}
                        style={{ padding: '4px 8px', borderRadius: 4, fontSize: 13, fontWeight: 500 }}
                      >
                        扣除天數
                      </Button>
                      <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/gift-consume-detail?giftId=${record.giftId}`)}
                        style={{ color: '#E8720C', padding: '4px 8px', borderRadius: 4, fontSize: 13, fontWeight: 500 }}
                      >
                        查看明細
                      </Button>
                      <Button
                        type="text"
                        icon={expanded ? <UpOutlined /> : <DownOutlined />}
                        onClick={() => toggleExpand(record.key)}
                        style={{ color: '#8C8C8C', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}
                      >
                        {expanded ? '收起' : '詳情'}
                      </Button>
                    </div>
                  </div>

                  {/* 卡片內容：贈送原因 + 憑證（默認收起） */}
                  {expanded && (
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ marginBottom: record.credentials.length > 0 ? 16 : 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: '#8C8C8C',
                          marginBottom: 8,
                        }}>
                          <FileTextOutlined />
                          贈送原因
                        </div>
                        <div style={{
                          fontSize: 13,
                          color: '#262626',
                          lineHeight: 1.8,
                          padding: '12px 16px',
                          background: '#fff',
                          borderRadius: 8,
                          border: '1px solid #f0f0f0',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {record.reason || '—'}
                        </div>
                      </div>

                      {record.credentials.length > 0 && (
                        <div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: '#8C8C8C',
                            marginBottom: 8,
                          }}>
                            <PaperClipOutlined />
                            相關憑證（{record.credentials.length}）
                          </div>
                          <Image.PreviewGroup>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              {record.credentials.map((url, i) => (
                                <Image
                                  key={i}
                                  src={url}
                                  width={88}
                                  height={88}
                                  style={{
                                    objectFit: 'cover',
                                    borderRadius: 8,
                                    border: '1px solid #e8e8e8',
                                  }}
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

        {/* 分頁 */}
        {filteredRecords.length > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={filteredRecords.length}
              onChange={setPage}
              showTotal={(total) => `共 ${total} 筆`}
            />
          </div>
        )}
      </div>

      {/* 底部操作欄 */}
      <div className="form-footer" style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '16px 24px',
        background: '#fff',
        borderTop: '1px solid #f0f0f0',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
        borderRadius: '0 0 8px 8px',
      }}>
        <Button
          size="large"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/gift-detail')}
          style={{ height: 38, minWidth: 96, borderRadius: 8 }}
        >
          返回列表
        </Button>
      </div>

      {/* 扣除天數彈窗 */}
      <Modal
        title="扣除天數"
        open={!!deductTarget}
        onCancel={() => setDeductTarget(null)}
        onOk={handleDeductConfirm}
        okText="確認扣除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        {deductTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>贈送ID</div>
                <div style={{ fontSize: 14, color: '#262626', fontWeight: 700, fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>{deductTarget.giftId}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>當前剩餘</div>
                <div style={{ fontSize: 14, color: '#52C41A', fontWeight: 700 }}>{deductTarget.remainingDays} 天</div>
              </div>
            </div>
            <div>
              <div style={{ color: '#262626', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#FF4D4F', marginRight: 4 }}>*</span>扣除天數
              </div>
              <InputNumber
                min={1}
                max={deductTarget.remainingDays}
                value={deductDays}
                onChange={v => setDeductDays(v || 1)}
                style={{ width: '100%' }}
                addonAfter="天"
              />
            </div>
            <div>
              <div style={{ color: '#262626', fontSize: 13, marginBottom: 4 }}>扣除原因</div>
              <Input.TextArea
                rows={3}
                placeholder="請輸入扣除原因（選填）"
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
