import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Alert, Button, Card, Col, DatePicker, Row, Space, Table, Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ExportOutlined, InfoCircleOutlined,
  MedicineBoxOutlined, ReloadOutlined, SearchOutlined, ShopOutlined,
  TrophyOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import StatCards, { type StatCardItem } from '../../components/StatCards'
import type { OptionItem } from '../../api/types'
import {
  AdOrderStatus, DeliveryStatus, DiagnoseVerdict, SANDBOX_STORE_POOL,
  generateMerchantDiagnose,
  type DiagnoseCheckItem, type DisplayPosition, type MerchantDiagnoseResult, type PurchasedAd,
} from '../../api/mock/trafficSandboxMock'
import { REGION_LABEL_KEY, TIME_SLOT_OPTIONS } from '../Recommend/constants'

/** 訂單狀態 → Tag 顏色與文案 key */
const ORDER_STATUS_META: Record<AdOrderStatus, { color: string; key: string }> = {
  [AdOrderStatus.PENDING]: { color: 'default', key: 'merchantDiagnose.orderPending' },
  [AdOrderStatus.PROMOTING]: { color: 'processing', key: 'merchantDiagnose.orderPromoting' },
  [AdOrderStatus.PROMOTED]: { color: 'success', key: 'merchantDiagnose.orderPromoted' },
  [AdOrderStatus.REFUNDED]: { color: 'error', key: 'merchantDiagnose.orderRefunded' },
  [AdOrderStatus.CANCELLED]: { color: 'default', key: 'merchantDiagnose.orderCancelled' },
}

/** 投放狀態 → Tag 顏色與文案 key */
const DELIVERY_STATUS_META: Record<DeliveryStatus, { color: string; key: string }> = {
  [DeliveryStatus.PENDING]: { color: 'warning', key: 'merchantDiagnose.deliveryPending' },
  [DeliveryStatus.DELIVERED]: { color: 'success', key: 'merchantDiagnose.deliveryDelivered' },
  [DeliveryStatus.REFUNDED]: { color: 'error', key: 'merchantDiagnose.deliveryRefunded' },
}

export default function MerchantPromotionDiagnose() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [storeCode, setStoreCode] = useState<string | undefined>()
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [result, setResult] = useState<MerchantDiagnoseResult | null>(null)
  const [searched, setSearched] = useState(false)

  /** 門店遠程搜索：按門店ID或名稱匹配 */
  const fetchStoreOptions = async (keyword: string): Promise<OptionItem[]> => {
    const kw = keyword.trim().toLowerCase()
    return SANDBOX_STORE_POOL
      .filter(s => !kw || s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw))
      .slice(0, 20)
      .map(s => ({ value: s.code, label: `${s.code} ${s.name}` }))
  }

  const handleSearch = () => {
    if (!storeCode) return
    setResult(generateMerchantDiagnose({ storeCode, date: date.format('YYYY-MM-DD') }))
    setSearched(true)
  }

  const handleReset = () => {
    setStoreCode(undefined)
    setDate(dayjs())
    setResult(null)
    setSearched(false)
  }

  const statItems: StatCardItem[] = useMemo(() => {
    if (!result) return []
    return [
      { key: 'ads', icon: <ShopOutlined />, value: result.stats.activeAdCount, label: t('merchantDiagnose.statActiveAds'), color: 'info' },
      { key: 'positions', icon: <TrophyOutlined />, value: result.stats.displayPositionCount, label: t('merchantDiagnose.statPositions'), color: 'brand' },
      { key: 'exposed', icon: <CheckCircleOutlined />, value: result.stats.exposedSlotCount, label: t('merchantDiagnose.statExposed'), color: 'success' },
      { key: 'score', icon: <MedicineBoxOutlined />, value: result.stats.organicTotalScore, label: t('merchantDiagnose.statOrganicScore'), color: 'system' },
    ]
  }, [result, t])

  /** 診斷結論橫幅配置 */
  const verdictBanner = useMemo(() => {
    if (!result) return null
    switch (result.verdict) {
      case DiagnoseVerdict.NORMAL:
        return {
          type: 'success' as const,
          icon: <CheckCircleOutlined />,
          message: t('merchantDiagnose.verdictNormal', { count: result.stats.exposedSlotCount }),
        }
      case DiagnoseVerdict.PURCHASED_NOT_SHOWN:
        return {
          type: 'warning' as const,
          icon: <WarningOutlined />,
          message: t('merchantDiagnose.verdictNotShown', {
            reason: result.primaryReasonKey ? t(result.primaryReasonKey, { algoCode: result.purchasedAds[0]?.algoCode ?? '—' }) : '',
          }),
        }
      default:
        return {
          type: 'info' as const,
          icon: <InfoCircleOutlined />,
          message: t('merchantDiagnose.verdictNotPurchased', { score: result.stats.organicTotalScore }),
        }
    }
  }, [result, t])

  const adColumns: TableColumnsType<PurchasedAd> = [
    {
      title: t('merchantDiagnose.colOrderNo'), dataIndex: 'orderNo', width: 160,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/order-detail?id=${encodeURIComponent(v)}&from=merchant-promotion-diagnose`)}>
          {v}
        </Button>
      ),
    },
    { title: t('merchantDiagnose.colAlgoName'), dataIndex: 'algoName', width: 200 },
    { title: t('merchantDiagnose.colBizDate'), dataIndex: 'bizDate', width: 110 },
    {
      title: t('merchantDiagnose.colTimeSlot'), dataIndex: 'timeSlot', width: 100,
      render: (v: number) => t(TIME_SLOT_OPTIONS.find(o => o.value === v)?.labelKey ?? ''),
    },
    {
      title: t('merchantDiagnose.colRegion'), dataIndex: 'region', width: 110,
      render: (v: number) => t(REGION_LABEL_KEY[v] ?? ''),
    },
    {
      title: t('merchantDiagnose.colOrderStatus'), dataIndex: 'orderStatus', width: 100,
      render: (v: AdOrderStatus) => <Tag color={ORDER_STATUS_META[v].color}>{t(ORDER_STATUS_META[v].key)}</Tag>,
    },
    {
      title: t('merchantDiagnose.colDeliveryStatus'), dataIndex: 'deliveryStatus', width: 100,
      render: (v: DeliveryStatus) => <Tag color={DELIVERY_STATUS_META[v].color}>{t(DELIVERY_STATUS_META[v].key)}</Tag>,
    },
    {
      title: t('merchantDiagnose.colAmount'), dataIndex: 'actualAmount', width: 110, align: 'right',
      render: (v: number) => `MOP ${v.toLocaleString()}`,
    },
  ]

  const positionColumns: TableColumnsType<DisplayPosition> = [
    {
      title: t('merchantDiagnose.colChannel'), dataIndex: 'channel', width: 110,
      render: (v: number) => t(`recommend.channel${['Home', 'Delivery', 'Supermarket', 'GroupBuy'][v - 1] ?? 'Home'}`),
    },
    {
      title: t('merchantDiagnose.colPlacement'), dataIndex: 'placement', width: 120,
      render: (v: number) => t(`recommend.placement${['HomeFeed', 'DeliveryFeed', 'SupermarketFeed', 'GroupBuyFeed'][v - 1] ?? 'HomeFeed'}`),
    },
    {
      title: t('merchantDiagnose.colRegion'), dataIndex: 'region', width: 110,
      render: (v: number) => t(REGION_LABEL_KEY[v] ?? ''),
    },
    {
      title: t('merchantDiagnose.colStrategy'), width: 200,
      render: (_: unknown, r: DisplayPosition) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.strategyName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.strategyCode}</div>
        </div>
      ),
    },
    {
      title: t('merchantDiagnose.colPosition'), dataIndex: 'position', width: 90, align: 'center',
      render: (v: number) => <Tag color="blue" style={{ fontWeight: 700 }}>{v}</Tag>,
    },
    { title: t('merchantDiagnose.colSourceAlgo'), dataIndex: 'algoName', width: 200 },
    {
      title: t('merchantDiagnose.colShown'), dataIndex: 'shown', width: 90, align: 'center',
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'}>
          {v ? t('merchantDiagnose.shownYes') : t('merchantDiagnose.shownNo')}
        </Tag>
      ),
    },
    {
      title: t('merchantDiagnose.colAction'), width: 120, align: 'center',
      render: (_: unknown, r: DisplayPosition) => (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/waterfall-simulation?region=${r.region}&channel=${r.channel}&placement=${r.placement}`)}
        >
          {t('merchantDiagnose.viewWaterfall')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面標題 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MedicineBoxOutlined style={{ fontSize: 20, color: '#E8720C' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#E8720C' }}>
              {t('merchantDiagnose.title')}
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              {t('merchantDiagnose.desc')}
            </div>
          </div>
        </div>
      </div>

      {/* 查詢條件區 */}
      <Card
        title={<Space><SearchOutlined style={{ color: '#E8720C' }} /><span>{t('trafficSandbox.conditionTitle')}</span></Space>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
              {t('merchantDiagnose.storeLabel')}
              <span style={{ color: '#FF4D4F', marginLeft: 4 }}>*</span>
            </div>
            <RemoteSearchSelect
              value={storeCode}
              onChange={setStoreCode}
              placeholder={t('merchantDiagnose.storePlaceholder')}
              fetchOptions={fetchStoreOptions}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('merchantDiagnose.dateLabel')}</div>
            <DatePicker
              value={date}
              onChange={d => d && setDate(d)}
              allowClear={false}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={10} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} disabled={!storeCode}>
              {t('merchantDiagnose.startDiagnose')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </Col>
        </Row>
      </Card>

      {searched && result && (
        <>
          {/* 診斷結論橫幅 */}
          {verdictBanner && (
            <Alert
              type={verdictBanner.type}
              showIcon
              icon={verdictBanner.icon}
              style={{ marginBottom: 16, borderRadius: 8, fontSize: 15 }}
              message={
                <div style={{ fontWeight: 600 }}>
                  {result.storeName}（{result.storeCode}）· {verdictBanner.message}
                </div>
              }
            />
          )}

          {/* 統計卡 */}
          <div style={{ marginBottom: 16 }}>
            <StatCards items={statItems} animationKey={`${result.storeCode}-${date.format('YYYYMMDD')}`} />
          </div>

          {/* 導出 */}
          <div className="action-section">
            <div className="action-section-left">
              <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
            </div>
          </div>

          {/* 區塊一：已購買廣告 */}
          <Card
            title={<Space><ShopOutlined style={{ color: '#1890FF' }} /><span>{t('merchantDiagnose.sectionPurchased')}</span></Space>}
            size="small"
            extra={<Tag color="blue">{t('merchantDiagnose.adCount', { count: result.purchasedAds.length })}</Tag>}
            style={{ marginBottom: 16, borderRadius: 8 }}
          >
            <Table<PurchasedAd>
              columns={adColumns}
              dataSource={result.purchasedAds}
              pagination={false}
              size="small"
              locale={{ emptyText: t('merchantDiagnose.noPurchasedAd') }}
            />
          </Card>

          {/* 區塊二：實際展示位置 */}
          <Card
            title={<Space><TrophyOutlined style={{ color: '#E8720C' }} /><span>{t('merchantDiagnose.sectionPositions')}</span></Space>}
            size="small"
            extra={<Tag color="orange">{t('merchantDiagnose.positionCount', { count: result.displayPositions.length })}</Tag>}
            style={{ marginBottom: 16, borderRadius: 8 }}
          >
            <Table<DisplayPosition>
              columns={positionColumns}
              dataSource={result.displayPositions}
              pagination={false}
              size="small"
              locale={{ emptyText: t('merchantDiagnose.noPosition') }}
            />
          </Card>

          {/* 區塊三：未展示原因診斷 */}
          <Card
            title={<Space><MedicineBoxOutlined style={{ color: '#722ED1' }} /><span>{t('merchantDiagnose.sectionChecks')}</span></Space>}
            size="small"
            style={{ borderRadius: 8 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.checks.map(check => (
                <CheckRow key={check.key} check={check} onFix={path => navigate(path)} />
              ))}
            </div>
          </Card>
        </>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <MedicineBoxOutlined style={{ fontSize: 48, marginBottom: 16 }} />
          <div style={{ fontSize: 15 }}>{t('merchantDiagnose.emptyTip')}</div>
        </div>
      )}
    </div>
  )
}

/** 單條診斷檢查項 */
function CheckRow({ check, onFix }: { check: DiagnoseCheckItem; onFix: (path: string) => void }) {
  const { t } = useTranslation()
  const failed = !check.passed

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 8,
      background: failed ? '#FFF1F0' : '#FAFAFA',
      border: `1px solid ${failed ? '#FFCCC7' : '#F0F0F0'}`,
    }}>
      {failed
        ? <CloseCircleOutlined style={{ color: '#FF4D4F', fontSize: 16, marginTop: 2 }} />
        : <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 16, marginTop: 2 }} />}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: failed ? '#CF1322' : '#262626' }}>
          {t(check.labelKey)}
        </div>
        <div style={{ fontSize: 12, color: failed ? '#CF1322' : '#8C8C8C', marginTop: 2 }}>
          {t(check.detailKey, check.detailParams)}
        </div>
        {failed && check.fixKey && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#E8720C' }}>{t(check.fixKey, check.detailParams)}</span>
            {check.fixPath && (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onFix(check.fixPath!)}>
                {t('merchantDiagnose.goFix')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
