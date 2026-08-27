import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button, Card, Col, Collapse, DatePicker, Row, Select, Space, Table, Tag, Tooltip,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalculatorOutlined, ExportOutlined, ReloadOutlined, SearchOutlined, TrophyOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import AnimatedNumber from '../../components/AnimatedNumber'
import type { OptionItem } from '../../api/types'
import {
  SANDBOX_STORE_POOL, ScoreDimension, ScoreMode, generateScoreInsight,
  type ScoreDimensionDetail, type ScoreInsightResult, type ScoreRuleDetail,
} from '../../api/mock/trafficSandboxMock'
import { BRAND_OPTIONS } from '../../constants/brand'
import { RECOMMEND_CHANNEL_OPTIONS } from '../Recommend/constants'

/** 維度 → 展示配色與文案 key */
const DIMENSION_META: Record<ScoreDimension, { color: string; bg: string; key: string }> = {
  [ScoreDimension.COMMERCIAL]: { color: '#1890FF', bg: '#E6F7FF', key: 'scoreInsight.dimCommercial' },
  [ScoreDimension.STORE]: { color: '#52C41A', bg: '#F6FFED', key: 'scoreInsight.dimStore' },
  [ScoreDimension.PLATFORM]: { color: '#722ED1', bg: '#F9F0FF', key: 'scoreInsight.dimPlatform' },
}

/** 計分方式 → Tag 顏色與文案 key */
const SCORE_MODE_META: Record<ScoreMode, { color: string; key: string }> = {
  [ScoreMode.RULE_ADD]: { color: 'green', key: 'scoreInsight.modeRuleAdd' },
  [ScoreMode.DECAY]: { color: 'cyan', key: 'scoreInsight.modeDecay' },
  [ScoreMode.RULE_DEDUCT]: { color: 'red', key: 'scoreInsight.modeRuleDeduct' },
  [ScoreMode.AMOUNT_RATIO]: { color: 'gold', key: 'scoreInsight.modeAmountRatio' },
  [ScoreMode.TIER]: { color: 'blue', key: 'scoreInsight.modeTier' },
  [ScoreMode.CONDITION]: { color: 'purple', key: 'scoreInsight.modeCondition' },
}

export default function MerchantScoreInsight() {
  const { t } = useTranslation()

  const [storeCode, setStoreCode] = useState<string | undefined>()
  const [brand, setBrand] = useState<string>('flashBee')
  const [channel, setChannel] = useState<number>(1)
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [result, setResult] = useState<ScoreInsightResult | null>(null)
  const [searched, setSearched] = useState(false)

  // 試算狀態：屏蔽的規則編碼；為空表示未試算
  const [blockedRuleCodes, setBlockedRuleCodes] = useState<string[]>([])
  const [trialActive, setTrialActive] = useState(false)

  const fetchStoreOptions = async (keyword: string): Promise<OptionItem[]> => {
    const kw = keyword.trim().toLowerCase()
    return SANDBOX_STORE_POOL
      .filter(s => !kw || s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw))
      .slice(0, 20)
      .map(s => ({ value: s.code, label: `${s.code} ${s.name}` }))
  }

  /** 基線結果（不含試算調整），用於展示「調整前 → 調整後」差值 */
  const baseResult = useMemo(() => {
    if (!storeCode || !searched) return null
    return generateScoreInsight({ storeCode, brand, channel, date: date.format('YYYY-MM-DD') })
  }, [storeCode, brand, channel, date, searched])

  const handleSearch = () => {
    if (!storeCode) return
    setBlockedRuleCodes([])
    setTrialActive(false)
    setResult(generateScoreInsight({ storeCode, brand, channel, date: date.format('YYYY-MM-DD') }))
    setSearched(true)
  }

  const handleReset = () => {
    setStoreCode(undefined)
    setBrand('flashBee')
    setChannel(1)
    setDate(dayjs())
    setResult(null)
    setSearched(false)
    setBlockedRuleCodes([])
    setTrialActive(false)
  }

  /** 切換某規則的屏蔽狀態並即時重算 */
  const handleToggleRule = (ruleCode: string) => {
    if (!storeCode) return
    const next = blockedRuleCodes.includes(ruleCode)
      ? blockedRuleCodes.filter(c => c !== ruleCode)
      : [...blockedRuleCodes, ruleCode]
    setBlockedRuleCodes(next)
    setTrialActive(next.length > 0)
    setResult(generateScoreInsight({
      storeCode, brand, channel, date: date.format('YYYY-MM-DD'),
      blockedRuleCodes: next,
    }))
  }

  const handleClearTrial = () => {
    if (!storeCode) return
    setBlockedRuleCodes([])
    setTrialActive(false)
    setResult(generateScoreInsight({ storeCode, brand, channel, date: date.format('YYYY-MM-DD') }))
  }

  const scoreDelta = trialActive && baseResult && result
    ? result.totalScore - baseResult.totalScore
    : 0

  const ruleColumns: TableColumnsType<ScoreRuleDetail> = [
    {
      title: t('scoreInsight.colRuleCode'), dataIndex: 'ruleCode', width: 100,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#595959' }}>{v}</span>,
    },
    {
      title: t('scoreInsight.colRuleName'), dataIndex: 'nameKey', width: 130,
      render: (v: string) => t(v),
    },
    {
      title: t('scoreInsight.colMode'), dataIndex: 'mode', width: 100,
      render: (v: ScoreMode) => <Tag color={SCORE_MODE_META[v].color}>{t(SCORE_MODE_META[v].key)}</Tag>,
    },
    {
      title: t('scoreInsight.colStatDays'), dataIndex: 'statDays', width: 80, align: 'center',
      render: (v: number) => t('scoreInsight.daysValue', { days: v }),
    },
    {
      title: t('scoreInsight.colBaseScore'), dataIndex: 'baseScore', width: 90, align: 'right',
      render: (v: number) => (
        <span style={{ color: v < 0 ? '#FF4D4F' : '#595959' }}>{v > 0 ? `+${v}` : v}</span>
      ),
    },
    {
      title: t('scoreInsight.colActualScore'), dataIndex: 'actualScore', width: 100, align: 'right',
      render: (v: number, r: ScoreRuleDetail) => {
        if (!r.hit) return <span style={{ color: '#BFBFBF' }}>0</span>
        return (
          <span style={{ fontWeight: 700, color: v < 0 ? '#FF4D4F' : '#52C41A' }}>
            {v > 0 ? `+${v}` : v}
          </span>
        )
      },
    },
    {
      title: t('scoreInsight.colHitStatus'), dataIndex: 'hit', width: 90, align: 'center',
      render: (v: boolean, r: ScoreRuleDetail) => {
        if (blockedRuleCodes.includes(r.ruleCode)) {
          return <Tag color="warning">{t('scoreInsight.hitBlocked')}</Tag>
        }
        return (
          <Tag color={v ? 'success' : 'default'}>
            {v ? t('scoreInsight.hitYes') : t('scoreInsight.hitNo')}
          </Tag>
        )
      },
    },
    {
      title: t('scoreInsight.colCalcDetail'),
      render: (_: unknown, r: ScoreRuleDetail) => (
        <span style={{ fontSize: 12, color: r.hit ? '#595959' : '#8C8C8C' }}>
          {t(r.calcKey, r.calcParams)}
        </span>
      ),
    },
    {
      title: t('scoreInsight.colAction'), width: 100, align: 'center',
      render: (_: unknown, r: ScoreRuleDetail) => (
        <Button type="link" size="small" onClick={() => handleToggleRule(r.ruleCode)}>
          {blockedRuleCodes.includes(r.ruleCode)
            ? t('scoreInsight.restoreRule')
            : t('scoreInsight.blockRule')}
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
          <TrophyOutlined style={{ fontSize: 20, color: '#E8720C' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#E8720C' }}>
              {t('scoreInsight.title')}
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              {t('scoreInsight.desc')}
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
          <Col span={7}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
              {t('scoreInsight.storeLabel')}
              <span style={{ color: '#FF4D4F', marginLeft: 4 }}>*</span>
            </div>
            <RemoteSearchSelect
              value={storeCode}
              onChange={setStoreCode}
              placeholder={t('scoreInsight.storePlaceholder')}
              fetchOptions={fetchStoreOptions}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('scoreInsight.brandLabel')}</div>
            <Select value={brand} onChange={setBrand} options={BRAND_OPTIONS} style={{ width: '100%' }} />
          </Col>
          <Col span={4}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('scoreInsight.channelLabel')}</div>
            <Select
              value={channel}
              onChange={setChannel}
              options={RECOMMEND_CHANNEL_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{t('scoreInsight.dateLabel')}</div>
            <DatePicker value={date} onChange={d => d && setDate(d)} allowClear={false} style={{ width: '100%' }} />
          </Col>
          <Col span={5} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} disabled={!storeCode}>
              {t('common.search')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </Col>
        </Row>
      </Card>

      {searched && result && (
        <>
          {/* 總分主卡 */}
          <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
            <Row gutter={24} align="middle">
              <Col span={7}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>
                    {t('scoreInsight.totalScoreLabel')}
                  </div>
                  <div key={`${result.storeCode}-${result.totalScore}`} style={{ fontSize: 48, fontWeight: 700, color: '#E8720C', lineHeight: 1.1 }}>
                    <AnimatedNumber value={result.totalScore} />
                  </div>
                  {trialActive && (
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: scoreDelta < 0 ? '#FF4D4F' : '#52C41A' }}>
                      {t('scoreInsight.trialDelta', {
                        before: baseResult?.totalScore ?? 0,
                        delta: scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta,
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: '#262626' }}>
                    {result.storeName}
                  </div>
                  <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                    {result.storeCode} · {result.groupName}
                  </div>
                </div>
              </Col>
              <Col span={17}>
                {/* 三維度加權條形圖 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.dimensions.map(dim => {
                    const meta = DIMENSION_META[dim.dimension]
                    // 條長按加權分佔總分比例，總分為 0 時退化為等分
                    const percent = result.totalScore > 0
                      ? Math.max(2, Math.round(dim.weightedScore / result.totalScore * 100))
                      : 33
                    return (
                      <div key={dim.dimension}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: meta.color }}>{t(meta.key)}</span>
                          <span style={{ color: '#595959' }}>
                            {t('scoreInsight.weightFormula', {
                              raw: dim.rawScore,
                              weight: dim.weight,
                              weighted: dim.weightedScore,
                            })}
                          </span>
                        </div>
                        <div style={{ height: 10, background: '#F5F5F5', borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{
                            width: `${percent}%`, height: '100%', background: meta.color,
                            borderRadius: 5, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* 加權公式 */}
                <div style={{
                  marginTop: 14, padding: '10px 14px', background: '#FAFAFA',
                  borderRadius: 8, fontSize: 12, color: '#595959',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('scoreInsight.formulaTitle')}</div>
                  <div>
                    {result.dimensions.map((d, i) => (
                      <span key={d.dimension}>
                        {i > 0 && ' + '}
                        {t('scoreInsight.formulaItem', {
                          name: t(DIMENSION_META[d.dimension].key),
                          raw: d.rawScore,
                          weight: d.weight,
                        })}
                      </span>
                    ))}
                    {' = '}
                    <span style={{ fontWeight: 700, color: '#E8720C' }}>{result.totalScore}</span>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>

          {/* 操作區 */}
          <div className="action-section">
            <div className="action-section-left">
              <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
              {trialActive && (
                <Tooltip title={t('scoreInsight.clearTrialTip')}>
                  <Button icon={<CalculatorOutlined />} onClick={handleClearTrial}>
                    {t('scoreInsight.clearTrial')}
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* 三維度明細 */}
          <Collapse
            defaultActiveKey={result.dimensions.map(d => String(d.dimension))}
            style={{ borderRadius: 8, background: '#fff' }}
            items={result.dimensions.map(dim => ({
              key: String(dim.dimension),
              label: <DimensionHeader dim={dim} />,
              children: (
                <Table<ScoreRuleDetail>
                  columns={ruleColumns}
                  dataSource={dim.rules}
                  pagination={false}
                  size="small"
                />
              ),
            }))}
          />
        </>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <TrophyOutlined style={{ fontSize: 48, marginBottom: 16 }} />
          <div style={{ fontSize: 15 }}>{t('scoreInsight.emptyTip')}</div>
        </div>
      )}
    </div>
  )
}

/** 維度面板標題：維度名稱 + 權重 + 加權分 */
function DimensionHeader({ dim }: { dim: ScoreDimensionDetail }) {
  const { t } = useTranslation()
  const meta = DIMENSION_META[dim.dimension]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: meta.color }}>{t(meta.key)}</span>
      <Tag color="default">{t('scoreInsight.weightTag', { weight: dim.weight })}</Tag>
      <Tag style={{ background: meta.bg, borderColor: `${meta.color}44`, color: meta.color, fontWeight: 600 }}>
        {t('scoreInsight.weightedTag', { score: dim.weightedScore })}
      </Tag>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>
        {t('scoreInsight.rawScoreTag', { score: dim.rawScore })}
      </span>
    </div>
  )
}
