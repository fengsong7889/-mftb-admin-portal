import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Row,
  Segmented, Select, Space, Switch, Table, Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppstoreOutlined, ExportOutlined, NodeIndexOutlined, ReloadOutlined,
  SearchOutlined, SettingOutlined, ShopOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import StatCards, { type StatCardItem } from '../../components/StatCards'
import {
  SANDBOX_ALGO_POOL, SlotKind, generateWaterfallSimulation,
  type SlotConfig, type WaterfallSimulationResult, type WaterfallSlotResult,
} from '../../api/mock/trafficSandboxMock'
import { BRAND_OPTIONS } from '../../constants/brand'
import {
  ALGO_CARD_COLOR_MAP, ALGORITHM_TYPE_OPTIONS, PLACEMENT_INTERFACE_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS, REGION_OPTIONS, Region,
  ServiceStatus, TIME_SLOT_OPTIONS, TimeSlot,
} from '../Recommend/constants'

/** 推演模式 */
enum SandboxMode {
  /** 正式配置：僅讀已啟用的策略與算法 */
  OFFICIAL = 'official',
  /** 沙盤推演：可選未上線項並臨時調整 */
  SANDBOX = 'sandbox',
}

export default function WaterfallSimulation() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [mode, setMode] = useState<SandboxMode>(SandboxMode.OFFICIAL)
  const [brand, setBrand] = useState<string>('flashBee')
  const [channel, setChannel] = useState<number>(Number(searchParams.get('channel')) || 1)
  const [placement, setPlacement] = useState<number>(Number(searchParams.get('placement')) || 1)
  const [region, setRegion] = useState<Region>((Number(searchParams.get('region')) || Region.KOKSAA) as Region)
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(TimeSlot.ALL_DAY)
  const [userId, setUserId] = useState<string>('')

  const [result, setResult] = useState<WaterfallSimulationResult | null>(null)
  const [searched, setSearched] = useState(false)

  // 沙盤臨時坑位覆蓋（僅存於組件 state，刷新即失效）
  const [slotOverrides, setSlotOverrides] = useState<SlotConfig[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isSandbox = mode === SandboxMode.SANDBOX

  /** 執行推演；overrides 顯式傳入以便調整後立即重算 */
  const runSimulation = (overrides: SlotConfig[]) => {
    const res = generateWaterfallSimulation({
      brand, channel, placement, region,
      date: date.format('YYYY-MM-DD'),
      timeSlot, userId: userId || undefined,
      sandbox: isSandbox,
      slotOverrides: overrides.length > 0 ? overrides : undefined,
    }, t)
    setResult(res)
    setSearched(true)
  }

  const handleSearch = () => {
    setSlotOverrides([])
    runSimulation([])
  }

  const handleReset = () => {
    setBrand('flashBee')
    setChannel(1)
    setPlacement(1)
    setRegion(Region.KOKSAA)
    setDate(dayjs())
    setTimeSlot(TimeSlot.ALL_DAY)
    setUserId('')
    setResult(null)
    setSearched(false)
    setSlotOverrides([])
  }

  /** 切換模式：清空沙盤調整並重算（已查詢過才重算） */
  const handleModeChange = (next: SandboxMode) => {
    setMode(next)
    setSlotOverrides([])
    if (searched) {
      const res = generateWaterfallSimulation({
        brand, channel, placement, region,
        date: date.format('YYYY-MM-DD'),
        timeSlot, userId: userId || undefined,
        sandbox: next === SandboxMode.SANDBOX,
      }, t)
      setResult(res)
    }
  }

  /** 恢復正式配置：清除沙盤坑位調整 */
  const handleRestoreOfficial = () => {
    setSlotOverrides([])
    runSimulation([])
  }

  /** 抽屉内调整坑位后即时重算 */
  const handleSlotConfigChange = (next: SlotConfig[]) => {
    setSlotOverrides(next)
    runSimulation(next)
  }

  const statItems: StatCardItem[] = useMemo(() => {
    if (!result) return []
    return [
      { key: 'total', icon: <AppstoreOutlined />, value: result.stats.totalSlots, label: t('waterfallSimulation.statTotalSlots'), color: 'info' },
      { key: 'ad', icon: <ThunderboltOutlined />, value: result.stats.adSlots, label: t('waterfallSimulation.statAdSlots'), color: 'brand' },
      { key: 'organic', icon: <NodeIndexOutlined />, value: result.stats.organicSlots, label: t('waterfallSimulation.statOrganicSlots'), color: 'success' },
      { key: 'merchant', icon: <ShopOutlined />, value: result.stats.merchantCount, label: t('waterfallSimulation.statMerchants'), color: 'system' },
    ]
  }, [result, t])

  const columns: TableColumnsType<WaterfallSlotResult> = [
    {
      title: t('waterfallSimulation.colPosition'), dataIndex: 'position', width: 90, align: 'center',
      render: (v: number) => {
        // 前三位高亮，與搜索校驗頁排名列保持一致
        const colorMap: Record<number, string> = { 1: '#FF4D4F', 2: '#FA8C16', 3: '#FAAD14' }
        const bg = colorMap[v]
        return (
          <Tag
            color={bg ? undefined : 'default'}
            style={{
              fontWeight: 700, minWidth: 30, textAlign: 'center',
              background: bg, borderColor: bg, color: bg ? '#fff' : undefined,
            }}
          >
            {v}
          </Tag>
        )
      },
    },
    {
      title: t('waterfallSimulation.colSlotKind'), dataIndex: 'kind', width: 100, align: 'center',
      render: (v: SlotKind) => (
        <Tag color={v === SlotKind.AD ? 'orange' : 'green'}>
          {v === SlotKind.AD ? t('waterfallSimulation.kindAd') : t('waterfallSimulation.kindOrganic')}
        </Tag>
      ),
    },
    {
      title: t('waterfallSimulation.colAlgoCode'), dataIndex: 'algoCode', width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    { title: t('waterfallSimulation.colAlgoName'), dataIndex: 'algoName', width: 200 },
    {
      title: t('waterfallSimulation.colAlgoType'), dataIndex: 'algoType', width: 120,
      render: (v: number) => (
        <Tag color={ALGO_CARD_COLOR_MAP[v as keyof typeof ALGO_CARD_COLOR_MAP]}>
          {t(ALGORITHM_TYPE_OPTIONS.find(o => o.value === v)?.labelKey ?? '')}
        </Tag>
      ),
    },
    {
      title: t('waterfallSimulation.colMerchant'), width: 190,
      render: (_: unknown, r: WaterfallSlotResult) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.storeName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.storeCode}</div>
        </div>
      ),
    },
    {
      title: t('waterfallSimulation.colHitSource'), width: 150,
      render: (_: unknown, r: WaterfallSlotResult) => (
        r.orderNo
          ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => navigate(`/order-detail?id=${encodeURIComponent(r.orderNo!)}&from=waterfall-simulation`)}
            >
              {r.orderNo}
            </Button>
          )
          : <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('waterfallSimulation.sourceOrganic')}</span>
      ),
    },
    {
      title: t('waterfallSimulation.colTotalScore'), dataIndex: 'totalScore', width: 110, align: 'right',
      render: (v: number | undefined, r: WaterfallSlotResult) => (
        v == null
          ? <span style={{ color: '#BFBFBF' }}>—</span>
          : (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, fontWeight: 700 }}
              onClick={() => navigate(`/merchant-score-insight?storeCode=${r.storeCode}`)}
            >
              {v}
            </Button>
          )
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面標題 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NodeIndexOutlined style={{ fontSize: 20, color: '#E8720C' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#E8720C' }}>
              {t('waterfallSimulation.title')}
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              {t('waterfallSimulation.desc')}
            </div>
          </div>
        </div>
        <Segmented<SandboxMode>
          value={mode}
          onChange={handleModeChange}
          options={[
            { label: t('trafficSandbox.modeOfficial'), value: SandboxMode.OFFICIAL },
            { label: t('trafficSandbox.modeSandbox'), value: SandboxMode.SANDBOX },
          ]}
        />
      </div>

      {/* 沙盤模式警示 */}
      {isSandbox && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12, borderRadius: 8 }}
          message={t('trafficSandbox.sandboxAlert')}
        />
      )}

      {/* 查詢條件區 */}
      <Card
        title={<Space><SearchOutlined style={{ color: '#E8720C' }} /><span>{t('trafficSandbox.conditionTitle')}</span></Space>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
      >
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.brandLabel')}</div>
            <Select value={brand} onChange={setBrand} options={BRAND_OPTIONS} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.channelLabel')}</div>
            <Select
              value={channel}
              onChange={setChannel}
              options={RECOMMEND_CHANNEL_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.placementLabel')}</div>
            <Select
              value={placement}
              onChange={setPlacement}
              options={PLACEMENT_INTERFACE_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.regionLabel')}</div>
            <Select
              value={region}
              onChange={setRegion}
              options={REGION_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.dateLabel')}</div>
            <DatePicker
              value={date}
              onChange={d => d && setDate(d)}
              allowClear={false}
              // 沙盤模式允許選未來日期以預演即將上線的配置
              disabledDate={isSandbox ? undefined : d => d.isAfter(dayjs(), 'day')}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.timeSlotLabel')}</div>
            <Select
              value={timeSlot}
              onChange={setTimeSlot}
              options={TIME_SLOT_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('waterfallSimulation.userLabel')}</div>
            <Select
              value={userId || undefined}
              onChange={v => setUserId(v ?? '')}
              placeholder={t('waterfallSimulation.userPlaceholder')}
              allowClear
              options={[
                { label: 'U100001', value: 'U100001' },
                { label: 'U100002', value: 'U100002' },
                { label: 'U100003', value: 'U100003' },
              ]}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              {t('waterfallSimulation.startSimulate')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </Col>
        </Row>
      </Card>

      {searched && result?.strategy && (
        <>
          {/* 命中策略卡 */}
          <Card
            size="small"
            title={<Space><NodeIndexOutlined style={{ color: '#1890FF' }} /><span>{t('waterfallSimulation.strategyTitle')}</span></Space>}
            style={{ marginBottom: 16, borderRadius: 8 }}
          >
            <Descriptions column={3} size="small">
              <Descriptions.Item label={t('waterfallSimulation.strategyCode')}>
                <span style={{ fontFamily: 'monospace' }}>{result.strategy.strategyCode}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfallSimulation.strategyName')}>
                {result.strategy.strategyName}
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfallSimulation.strategyStatus')}>
                {result.strategy.status === ServiceStatus.ENABLED
                  ? <Tag color="success">{t('recommend.statusEnabled')}</Tag>
                  : <Tag color="error">{t('trafficSandbox.notLaunched')}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfallSimulation.naturalAlgo')}>
                {result.strategy.naturalAlgoName}
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfallSimulation.filterDislike')}>
                <Tag color={result.strategy.filterDislike === 1 ? 'success' : 'default'}>
                  {result.strategy.filterDislike === 1
                    ? t('trafficSandbox.switchOn')
                    : t('trafficSandbox.switchOff')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfallSimulation.brandLabel')}>
                {BRAND_OPTIONS.find(o => o.value === result.strategy!.brand)?.label ?? result.strategy.brand}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 統計卡 */}
          <div style={{ marginBottom: 16 }}>
            <StatCards
              items={statItems}
              animationKey={`${region}-${channel}-${placement}-${date.format('YYYYMMDD')}-${slotOverrides.length}`}
            />
          </div>

          {/* 操作區 */}
          <div className="action-section">
            <div className="action-section-left">
              <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
              {isSandbox && (
                <>
                  <Button icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>
                    {t('waterfallSimulation.adjustSlots')}
                  </Button>
                  {slotOverrides.length > 0 && (
                    <Button onClick={handleRestoreOfficial}>
                      {t('waterfallSimulation.restoreOfficial')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 展示位序列表 */}
          <Table<WaterfallSlotResult>
            columns={columns}
            dataSource={result.slots}
            rowKey="key"
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showQuickJumper: true,
              showTotal: total => t('waterfallSimulation.slotTotal', { count: total }),
            }}
            expandable={{
              expandedRowRender: record => <CandidatePanel slot={record} />,
              rowExpandable: record => record.candidates.length > 1,
            }}
          />

          {/* 沙盤坑位調整抽屉 */}
          <SlotConfigDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            baseConfigs={result.baseSlotConfigs}
            overrides={slotOverrides}
            onChange={handleSlotConfigChange}
          />
        </>
      )}

      {/* 未命中策略空態 */}
      {searched && !result?.strategy && (
        <Card style={{ borderRadius: 8, textAlign: 'center', padding: '40px 0' }}>
          <NodeIndexOutlined style={{ fontSize: 48, color: '#BFBFBF', marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: '#8C8C8C', marginBottom: 16 }}>
            {t('waterfallSimulation.noStrategyTip')}
          </div>
          <Button type="primary" onClick={() => navigate('/promotion-slot-config')}>
            {t('waterfallSimulation.goConfigStrategy')}
          </Button>
        </Card>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <NodeIndexOutlined style={{ fontSize: 48, marginBottom: 16 }} />
          <div style={{ fontSize: 15 }}>{t('waterfallSimulation.emptyTip')}</div>
        </div>
      )}
    </div>
  )
}

/** 展開行：該坑位的候選商家競爭列表 */
function CandidatePanel({ slot }: { slot: WaterfallSlotResult }) {
  const { t } = useTranslation()
  const isAd = slot.kind === SlotKind.AD

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#595959' }}>
        {t('waterfallSimulation.candidateTitle', { position: slot.position })}
      </div>
      <Table
        size="small"
        pagination={false}
        rowKey="storeCode"
        dataSource={slot.candidates}
        columns={[
          { title: t('waterfallSimulation.candStore'), dataIndex: 'storeName', width: 200 },
          { title: t('waterfallSimulation.candStoreCode'), dataIndex: 'storeCode', width: 120 },
          {
            title: isAd ? t('waterfallSimulation.candBid') : t('waterfallSimulation.candScore'),
            dataIndex: 'bidOrScore', width: 120, align: 'right' as const,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{isAd ? `MOP ${v}` : v}</span>,
          },
          {
            title: t('waterfallSimulation.candWin'), dataIndex: 'win', width: 100, align: 'center' as const,
            render: (v: boolean) => (
              <Tag color={v ? 'success' : 'default'}>
                {v ? t('waterfallSimulation.candWinYes') : t('waterfallSimulation.candWinNo')}
              </Tag>
            ),
          },
          {
            title: t('waterfallSimulation.candLoseReason'),
            dataIndex: 'loseReasonKey',
            render: (v: string | undefined) => (
              v
                ? <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t(v)}</span>
                : <span style={{ color: '#BFBFBF' }}>—</span>
            ),
          },
        ]}
      />
    </div>
  )
}

/** 沙盤坑位調整抽屉：逐坑位換算法 / 啟停用，關閉後即時重算 */
function SlotConfigDrawer({
  open, onClose, baseConfigs, overrides, onChange,
}: {
  open: boolean
  onClose: () => void
  baseConfigs: SlotConfig[]
  overrides: SlotConfig[]
  onChange: (next: SlotConfig[]) => void
}) {
  const { t } = useTranslation()

  /** 當前生效配置：覆蓋優先，否則取基線 */
  const effective = baseConfigs.map(base => overrides.find(o => o.position === base.position) ?? base)

  /** 更新某坑位配置，合併進覆蓋列表 */
  const updateSlot = (position: number, patch: Partial<SlotConfig>) => {
    const current = effective.find(c => c.position === position)
    if (!current) return
    const next: SlotConfig = { ...current, ...patch }
    const rest = overrides.filter(o => o.position !== position)
    onChange([...rest, next].sort((a, b) => a.position - b.position))
  }

  // 沙盤模式下可選全部算法（含未上線）
  const algoOptions = SANDBOX_ALGO_POOL.map(a => ({
    value: a.algoCode,
    label: a.status === ServiceStatus.ENABLED
      ? `${a.algoName}（${a.algoCode}）`
      : `${a.algoName}（${a.algoCode}）· ${t('trafficSandbox.notLaunched')}`,
  }))

  return (
    <Drawer
      title={t('waterfallSimulation.drawerTitle')}
      open={open}
      onClose={onClose}
      width={640}
      extra={<Tag color="warning">{t('waterfallSimulation.drawerHint')}</Tag>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {effective.map(cfg => {
          const modified = overrides.some(o => o.position === cfg.position)
          return (
            <div
              key={cfg.position}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                background: modified ? '#FFF7E6' : '#FAFAFA',
                border: `1px solid ${modified ? '#FFD591' : '#F0F0F0'}`,
              }}
            >
              <Tag color="blue" style={{ fontWeight: 700, minWidth: 34, textAlign: 'center' }}>
                {cfg.position}
              </Tag>
              <Select
                value={cfg.algoCode}
                onChange={v => updateSlot(cfg.position, { algoCode: v })}
                options={algoOptions}
                style={{ flex: 1 }}
                size="small"
              />
              <Switch
                size="small"
                checked={cfg.enabled}
                onChange={v => updateSlot(cfg.position, { enabled: v })}
              />
              {modified && <Tag color="warning">{t('trafficSandbox.adjusted')}</Tag>}
            </div>
          )
        })}
      </div>
    </Drawer>
  )
}
