import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Alert, Button, Card, Col, Collapse, DatePicker, Descriptions, Row,
  Segmented, Select, Space, Table, Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeploymentUnitOutlined, ExportOutlined, InboxOutlined, ReloadOutlined,
  RiseOutlined, SearchOutlined, ShopOutlined, TrophyOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import StatCards, { type StatCardItem } from '../../components/StatCards'
import type { OptionItem } from '../../api/types'
import {
  HitSource, SANDBOX_ALGO_POOL, findSandboxAlgorithm, generateAlgorithmSimulation,
  type AlgorithmHitMerchant, type AlgorithmMissMerchant, type AlgorithmSimulationResult,
  type AlgorithmTrialParams,
} from '../../api/mock/trafficSandboxMock'
import {
  ALGO_CARD_COLOR_MAP, ALGORITHM_TYPE_OPTIONS, BID_MODE_OPTIONS, BidMode,
  RANKING_STAGE_OPTIONS, RECALL_DIMENSION_COLOR, RECALL_DIMENSION_OPTIONS,
  RankingStage, RecallDimension, REGION_LABEL_KEY, REGION_OPTIONS, Region,
  ServiceStatus, TIME_SLOT_OPTIONS, TimeSlot,
} from '../Recommend/constants'

/** 推演模式（與瀑布流推演頁保持一致） */
enum SandboxMode {
  OFFICIAL = 'official',
  SANDBOX = 'sandbox',
}

export default function AlgorithmSimulation() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [mode, setMode] = useState<SandboxMode>(SandboxMode.OFFICIAL)
  const [algoCode, setAlgoCode] = useState<string | undefined>()
  const [region, setRegion] = useState<Region | undefined>()
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(TimeSlot.ALL_DAY)

  const [result, setResult] = useState<AlgorithmSimulationResult | null>(null)
  const [searched, setSearched] = useState(false)

  // 參數試算：null 表示未試算
  const [trial, setTrial] = useState<AlgorithmTrialParams | null>(null)

  const isSandbox = mode === SandboxMode.SANDBOX

  /** 算法遠程搜索：正式配置僅列啟用算法，沙盤模式含未上線算法 */
  const fetchAlgoOptions = async (keyword: string): Promise<OptionItem[]> => {
    const kw = keyword.trim().toLowerCase()
    return SANDBOX_ALGO_POOL
      .filter(a => isSandbox || a.status === ServiceStatus.ENABLED)
      .filter(a => !kw || a.algoCode.toLowerCase().includes(kw) || a.algoName.toLowerCase().includes(kw))
      .slice(0, 20)
      .map(a => ({
        value: a.algoCode,
        label: a.status === ServiceStatus.ENABLED
          ? `${a.algoCode} ${a.algoName}`
          : `${a.algoCode} ${a.algoName} · ${t('trafficSandbox.notLaunched')}`,
      }))
  }

  /** 基線結果（不含試算），用於沙盤對比區 */
  const baseResult = useMemo(() => {
    if (!algoCode || !searched) return null
    return generateAlgorithmSimulation({
      algoCode, region, date: date.format('YYYY-MM-DD'), timeSlot, sandbox: isSandbox,
    })
  }, [algoCode, region, date, timeSlot, isSandbox, searched])

  const runSimulation = (trialParams: AlgorithmTrialParams | null) => {
    if (!algoCode) return
    setResult(generateAlgorithmSimulation({
      algoCode, region, date: date.format('YYYY-MM-DD'), timeSlot,
      sandbox: isSandbox,
      trial: trialParams ?? undefined,
    }))
    setSearched(true)
  }

  const handleSearch = () => {
    setTrial(null)
    runSimulation(null)
  }

  const handleReset = () => {
    setAlgoCode(undefined)
    setRegion(undefined)
    setDate(dayjs())
    setTimeSlot(TimeSlot.ALL_DAY)
    setResult(null)
    setSearched(false)
    setTrial(null)
  }

  /** 切換模式：清空試算；若當前算法在正式模式下不可選則一併清空 */
  const handleModeChange = (next: SandboxMode) => {
    setMode(next)
    setTrial(null)
    if (next === SandboxMode.OFFICIAL && algoCode) {
      const algo = findSandboxAlgorithm(algoCode)
      if (algo && algo.status !== ServiceStatus.ENABLED) {
        setAlgoCode(undefined)
        setResult(null)
        setSearched(false)
        return
      }
    }
    if (searched && algoCode) {
      setResult(generateAlgorithmSimulation({
        algoCode, region, date: date.format('YYYY-MM-DD'), timeSlot,
        sandbox: next === SandboxMode.SANDBOX,
      }))
    }
  }

  /** 修改單個試算參數並即時重算 */
  const handleTrialChange = (patch: Partial<AlgorithmTrialParams>) => {
    if (!result) return
    const next: AlgorithmTrialParams = { ...(trial ?? result.effective), ...patch }
    setTrial(next)
    runSimulation(next)
  }

  const handleClearTrial = () => {
    setTrial(null)
    runSimulation(null)
  }

  const statItems: StatCardItem[] = useMemo(() => {
    if (!result) return []
    return [
      { key: 'hit', icon: <ShopOutlined />, value: result.stats.hitCount, label: t('algorithmSimulation.statHitCount'), color: 'info' },
      { key: 'sold', icon: <TrophyOutlined />, value: result.stats.soldSlots, label: t('algorithmSimulation.statSoldSlots'), color: 'brand' },
      { key: 'stock', icon: <InboxOutlined />, value: result.stats.remainingStock, label: t('algorithmSimulation.statRemainingStock'), color: 'success' },
      { key: 'avg', icon: <RiseOutlined />, value: result.stats.avgScore, label: t('algorithmSimulation.statAvgScore'), color: 'system' },
    ]
  }, [result, t])

  /** 判斷某字段是否被試算調整過 */
  const isAdjusted = (field: keyof AlgorithmTrialParams) =>
    result?.adjustedFields.includes(field) ?? false

  /** 已調整字段的角標 */
  const adjustedTag = (field: keyof AlgorithmTrialParams) =>
    isAdjusted(field) ? <Tag color="warning" style={{ marginLeft: 6 }}>{t('trafficSandbox.adjusted')}</Tag> : null

  const hitColumns: TableColumnsType<AlgorithmHitMerchant> = [
    {
      title: t('algorithmSimulation.colRank'), dataIndex: 'rank', width: 70, align: 'center',
      render: (v: number) => {
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
      title: t('algorithmSimulation.colStoreCode'), dataIndex: 'storeCode', width: 120,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#595959' }}>{v}</span>,
    },
    {
      title: t('algorithmSimulation.colStoreName'), dataIndex: 'storeName', width: 200,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    { title: t('algorithmSimulation.colGroupName'), dataIndex: 'groupName', width: 150 },
    {
      title: t('algorithmSimulation.colRegion'), dataIndex: 'region', width: 110,
      render: (v: number) => t(REGION_LABEL_KEY[v] ?? ''),
    },
    {
      title: t('algorithmSimulation.colHitSource'), width: 160,
      render: (_: unknown, r: AlgorithmHitMerchant) => (
        r.hitSource === HitSource.ORDER && r.orderNo
          ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => navigate(`/order-detail?id=${encodeURIComponent(r.orderNo!)}&from=algorithm-simulation`)}
            >
              {r.orderNo}
            </Button>
          )
          : <Tag color="green">{t('algorithmSimulation.sourceQualified')}</Tag>
      ),
    },
    {
      title: t('algorithmSimulation.colBidPrice'), dataIndex: 'bidPrice', width: 110, align: 'right',
      render: (v: number) => `MOP ${v.toLocaleString()}`,
    },
    {
      title: t('algorithmSimulation.colScore'), dataIndex: 'score', width: 100, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 700, color: '#1890FF' }}>{v}</span>,
    },
    {
      title: t('algorithmSimulation.colRankBasis'),
      render: (_: unknown, r: AlgorithmHitMerchant) => (
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t(r.rankBasisKey)}</span>
      ),
    },
  ]

  const missColumns: TableColumnsType<AlgorithmMissMerchant> = [
    { title: t('algorithmSimulation.colStoreCode'), dataIndex: 'storeCode', width: 120 },
    { title: t('algorithmSimulation.colStoreName'), dataIndex: 'storeName', width: 200 },
    {
      title: t('algorithmSimulation.colMissReason'),
      render: (_: unknown, r: AlgorithmMissMerchant) => (
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t(r.missReasonKey)}</span>
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
          <DeploymentUnitOutlined style={{ fontSize: 20, color: '#E8720C' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#E8720C' }}>
              {t('algorithmSimulation.title')}
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              {t('algorithmSimulation.desc')}
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
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
              {t('algorithmSimulation.algoLabel')}
              <span style={{ color: '#FF4D4F', marginLeft: 4 }}>*</span>
            </div>
            <RemoteSearchSelect
              // 模式切換後重建組件，避免殘留上一模式的算法選項
              key={mode}
              value={algoCode}
              onChange={setAlgoCode}
              placeholder={t('algorithmSimulation.algoPlaceholder')}
              fetchOptions={fetchAlgoOptions}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={5}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.regionLabel')}</div>
            <Select
              value={region}
              onChange={setRegion}
              placeholder={t('common.all')}
              allowClear
              options={REGION_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.dateLabel')}</div>
            <DatePicker
              value={date}
              onChange={d => d && setDate(d)}
              allowClear={false}
              disabledDate={isSandbox ? undefined : d => d.isAfter(dayjs(), 'day')}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.timeSlotLabel')}</div>
            <Select
              value={timeSlot}
              onChange={setTimeSlot}
              options={TIME_SLOT_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={3} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} disabled={!algoCode}>
              {t('algorithmSimulation.startSimulate')}
            </Button>
          </Col>
        </Row>
        <Row style={{ marginTop: 12 }}>
          <Col span={24}>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </Col>
        </Row>
      </Card>

      {searched && result && (
        <>
          {/* 算法配置摘要卡 */}
          <Card
            size="small"
            title={<Space><DeploymentUnitOutlined style={{ color: '#1890FF' }} /><span>{t('algorithmSimulation.summaryTitle')}</span></Space>}
            style={{ marginBottom: 16, borderRadius: 8 }}
            extra={
              result.algo.status === ServiceStatus.ENABLED
                ? <Tag color="success">{t('recommend.statusEnabled')}</Tag>
                : <Tag color="error">{t('trafficSandbox.notLaunched')}</Tag>
            }
          >
            <Descriptions column={3} size="small">
              <Descriptions.Item label={t('algorithmSimulation.fieldAlgoCode')}>
                <span style={{ fontFamily: 'monospace' }}>{result.algo.algoCode}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('algorithmSimulation.fieldAlgoName')}>
                {result.algo.algoName}
              </Descriptions.Item>
              <Descriptions.Item label={t('algorithmSimulation.fieldAlgoType')}>
                <Tag color={ALGO_CARD_COLOR_MAP[result.algo.algoType]}>
                  {t(ALGORITHM_TYPE_OPTIONS.find(o => o.value === result.algo.algoType)?.labelKey ?? '')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={<>{t('algorithmSimulation.fieldRecallDimension')}{adjustedTag('recallDimension')}</>}>
                <Tag color={RECALL_DIMENSION_COLOR[result.effective.recallDimension]}>
                  {t(RECALL_DIMENSION_OPTIONS.find(o => o.value === result.effective.recallDimension)?.labelKey ?? '')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={<>{t('algorithmSimulation.fieldRankingStage')}{adjustedTag('rankingStage')}</>}>
                {t(RANKING_STAGE_OPTIONS.find(o => o.value === result.effective.rankingStage)?.labelKey ?? '')}
              </Descriptions.Item>
              <Descriptions.Item label={<>{t('algorithmSimulation.fieldBidMode')}{adjustedTag('bidMode')}</>}>
                {t(BID_MODE_OPTIONS.find(o => o.value === result.effective.bidMode)?.labelKey ?? '')}
              </Descriptions.Item>
              <Descriptions.Item label={<>{t('algorithmSimulation.fieldSlotCount')}{adjustedTag('slotCount')}</>}>
                {result.effective.slotCount}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 參數試算面板（僅沙盤推演模式） */}
          {isSandbox && (
            <Card
              size="small"
              title={<Space><RiseOutlined style={{ color: '#722ED1' }} /><span>{t('algorithmSimulation.trialTitle')}</span></Space>}
              style={{ marginBottom: 16, borderRadius: 8 }}
              extra={
                trial && (
                  <Button size="small" onClick={handleClearTrial}>
                    {t('algorithmSimulation.clearTrial')}
                  </Button>
                )
              }
            >
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
                {t('algorithmSimulation.trialHint')}
              </div>
              <Row gutter={16}>
                <Col span={6}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.fieldRecallDimension')}</div>
                  <Select
                    value={result.effective.recallDimension}
                    onChange={v => handleTrialChange({ recallDimension: v as RecallDimension })}
                    options={RECALL_DIMENSION_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.fieldRankingStage')}</div>
                  <Select
                    value={result.effective.rankingStage}
                    onChange={v => handleTrialChange({ rankingStage: v as RankingStage })}
                    options={RANKING_STAGE_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.fieldBidMode')}</div>
                  <Select
                    value={result.effective.bidMode}
                    onChange={v => handleTrialChange({ bidMode: v as BidMode })}
                    options={BID_MODE_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('algorithmSimulation.fieldSlotCount')}</div>
                  <Select
                    value={result.effective.slotCount}
                    onChange={v => handleTrialChange({ slotCount: v })}
                    options={[1, 2, 3, 4, 5, 8, 10, 20].map(n => ({ label: String(n), value: n }))}
                    style={{ width: '100%' }}
                  />
                </Col>
              </Row>
            </Card>
          )}

          {/* 統計卡 */}
          <div style={{ marginBottom: 16 }}>
            <StatCards
              items={statItems}
              animationKey={`${result.algo.algoCode}-${region ?? 'all'}-${date.format('YYYYMMDD')}-${result.adjustedFields.join(',')}`}
            />
          </div>

          {/* 沙盤對比區 */}
          {isSandbox && trial && baseResult && (
            <TrialComparePanel base={baseResult} current={result} />
          )}

          {/* 操作區 */}
          <div className="action-section">
            <div className="action-section-left">
              <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
            </div>
          </div>

          {/* 命中商家表 */}
          <Table<AlgorithmHitMerchant>
            columns={hitColumns}
            dataSource={result.hits}
            rowKey="key"
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showQuickJumper: true,
              showTotal: total => t('algorithmSimulation.hitTotal', { count: total }),
            }}
          />

          {/* 未命中商家抽樣區 */}
          <Collapse
            style={{ marginTop: 16, background: '#fff', borderRadius: 8 }}
            items={[{
              key: 'miss',
              label: (
                <span style={{ fontWeight: 600 }}>
                  {t('algorithmSimulation.missTitle', { count: result.misses.length })}
                </span>
              ),
              children: (
                <Table<AlgorithmMissMerchant>
                  columns={missColumns}
                  dataSource={result.misses}
                  rowKey="key"
                  size="small"
                  pagination={false}
                />
              ),
            }]}
          />
        </>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <DeploymentUnitOutlined style={{ fontSize: 48, marginBottom: 16 }} />
          <div style={{ fontSize: 15 }}>{t('algorithmSimulation.emptyTip')}</div>
        </div>
      )}
    </div>
  )
}

/** 沙盤對比區：試算前後命中商家數與 Top10 變化 */
function TrialComparePanel({
  base, current,
}: {
  base: AlgorithmSimulationResult
  current: AlgorithmSimulationResult
}) {
  const { t } = useTranslation()

  const baseTop10 = base.hits.slice(0, 10)
  const currentTop10 = current.hits.slice(0, 10)
  const baseTopCodes = new Set(baseTop10.map(h => h.storeCode))
  const currentTopCodes = new Set(currentTop10.map(h => h.storeCode))

  /** 新進 Top10 的商家 */
  const entered = currentTop10.filter(h => !baseTopCodes.has(h.storeCode))
  /** 跌出 Top10 的商家 */
  const dropped = baseTop10.filter(h => !currentTopCodes.has(h.storeCode))
  const hitDelta = current.stats.hitCount - base.stats.hitCount

  return (
    <Card
      size="small"
      title={<Space><RiseOutlined style={{ color: '#722ED1' }} /><span>{t('algorithmSimulation.compareTitle')}</span></Space>}
      style={{ marginBottom: 16, borderRadius: 8 }}
    >
      <Row gutter={16}>
        <Col span={6}>
          <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>
              {t('algorithmSimulation.compareHitCount')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {base.stats.hitCount}
              <span style={{ margin: '0 6px', color: '#BFBFBF' }}>→</span>
              {current.stats.hitCount}
              <span style={{
                marginLeft: 8, fontSize: 13,
                color: hitDelta === 0 ? '#8C8C8C' : hitDelta > 0 ? '#52C41A' : '#FF4D4F',
              }}>
                {hitDelta > 0 ? `+${hitDelta}` : hitDelta}
              </span>
            </div>
          </div>
        </Col>
        <Col span={9}>
          <div style={{ fontSize: 12, color: '#52C41A', fontWeight: 600, marginBottom: 6 }}>
            {t('algorithmSimulation.compareEntered', { count: entered.length })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {entered.length === 0
              ? <span style={{ fontSize: 12, color: '#BFBFBF' }}>{t('algorithmSimulation.compareNone')}</span>
              : entered.map(h => <Tag key={h.storeCode} color="success">{h.storeName}</Tag>)}
          </div>
        </Col>
        <Col span={9}>
          <div style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 600, marginBottom: 6 }}>
            {t('algorithmSimulation.compareDropped', { count: dropped.length })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {dropped.length === 0
              ? <span style={{ fontSize: 12, color: '#BFBFBF' }}>{t('algorithmSimulation.compareNone')}</span>
              : dropped.map(h => <Tag key={h.storeCode} color="error">{h.storeName}</Tag>)}
          </div>
        </Col>
      </Row>
    </Card>
  )
}
