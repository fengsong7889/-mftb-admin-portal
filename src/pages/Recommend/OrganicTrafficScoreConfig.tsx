import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Table, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Switch, Tabs, Popover } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SettingOutlined, PlusOutlined, SaveOutlined, SearchOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ServiceStatus } from './constants'
import {
  ScoreDimension, ScoreMode,
  SCORE_DIMENSION_ICON, SCORE_DIMENSION_COLOR,
  SCORE_MODE_COLOR,
  DEFAULT_DIMENSION_WEIGHT, DIMENSION_WEIGHT_TOTAL,
  DEFAULT_SCORE_TIMER_MINUTES, DEFAULT_ORGANIC_SCORE_RULES,
  RANGE_SCORE_KEYS, DEFAULT_RANGE_SCORES,
  type OrganicScoreRule, type RangeScores,
} from './organicTrafficConfig'

/** 數值計數動畫（1200ms，遵循數據指標統計卡標準） */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>()
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])
  return value
}

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}{suffix}</>
}

/** 維度順序（界面展示順序） */
const DIMENSION_ORDER: ScoreDimension[] = [
  ScoreDimension.COMMERCIAL,
  ScoreDimension.STORE,
  ScoreDimension.PLATFORM,
]

/** 評分項表格每頁條數 */
const RULE_PAGE_SIZE = 10

/** 評分項表格高度（固定高度，避免頁面隨評分項增多無限變長） */
const RULE_TABLE_HEIGHT = 400

/** 新增/編輯評分項的表單值 */
interface RuleFormValues {
  name: string
  description: string
  mode: ScoreMode
  score: number
  /** 統計天數（可選，僅部分規則需要） */
  statDays?: number
  /** 配送範圍分層分數（僅配送範圍規則使用） */
  rangeScores?: RangeScores
  status: ServiceStatus
}

/** 判斷是否為配送範圍規則（需配置短程/中程/遠程/跨橋分數，不需要分值字段） */
const isDeliveryRange = (id?: string) => !!id && id.startsWith('PLT_02')

/** 判斷是否需要統計天數（僅訂單、好評、差評等時效性指標需要） */
const needsStatDays = (id?: string) => {
  if (!id) return false
  return ['STO_02A', 'STO_02B', 'STO_03'].includes(id)
}

interface Props {
  /** 詳情模式：只讀，隱藏所有編輯入口 */
  readOnly?: boolean
}

/**
 * 自然流量算法參數配置：3 個維度的商家評分規則。
 * 自然流量不售賣坑位，商家靠綜合得分高低較量排名。
 */
export default function OrganicTrafficScoreConfig({ readOnly = false }: Props) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<OrganicScoreRule[]>(DEFAULT_ORGANIC_SCORE_RULES)

  /** 維度標籤（依賴 t，定義在組件內以便響應語言切換） */
  const DIM_LABEL: Record<ScoreDimension, string> = {
    [ScoreDimension.COMMERCIAL]: t('organicTrafficScore.dimCommercial'),
    [ScoreDimension.STORE]: t('organicTrafficScore.dimStore'),
    [ScoreDimension.PLATFORM]: t('organicTrafficScore.dimPlatform'),
  }
  /** 維度說明（依賴 t） */
  const DIM_DESC: Record<ScoreDimension, string> = {
    [ScoreDimension.COMMERCIAL]: t('organicTrafficScore.descCommercial'),
    [ScoreDimension.STORE]: t('organicTrafficScore.descStore'),
    [ScoreDimension.PLATFORM]: t('organicTrafficScore.descPlatform'),
  }
  /** 計分方式標籤（依賴 t） */
  const MODE_LABEL: Record<ScoreMode, string> = {
    [ScoreMode.RULE_BONUS]: t('organicTrafficScore.modeRuleBonus'),
    [ScoreMode.DECAY]: t('organicTrafficScore.modeDecay'),
    [ScoreMode.RULE_DEDUCTION]: t('organicTrafficScore.modeRuleDeduction'),
    [ScoreMode.AMOUNT_MULTIPLIER]: t('organicTrafficScore.modeAmountMultiplier'),
  }
  /** 配送範圍分層標籤（依賴 t） */
  const RANGE_LABEL: Record<keyof RangeScores, string> = {
    short: t('organicTrafficScore.rangeShort'),
    medium: t('organicTrafficScore.rangeMedium'),
    long: t('organicTrafficScore.rangeLong'),
    crossBridge: t('organicTrafficScore.rangeCrossBridge'),
  }
  /** 計分方式選項（依賴 t） */
  const MODE_OPTIONS = [
    { label: MODE_LABEL[ScoreMode.RULE_BONUS], value: ScoreMode.RULE_BONUS },
    { label: MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
    { label: MODE_LABEL[ScoreMode.RULE_DEDUCTION], value: ScoreMode.RULE_DEDUCTION },
    { label: MODE_LABEL[ScoreMode.AMOUNT_MULTIPLIER], value: ScoreMode.AMOUNT_MULTIPLIER },
  ]
  const [dimensionWeight, setDimensionWeight] = useState<Record<ScoreDimension, number>>(DEFAULT_DIMENSION_WEIGHT)
  const [timerMinutes, setTimerMinutes] = useState<number>(DEFAULT_SCORE_TIMER_MINUTES)

  // 維度切換與表格內篩選（避免所有維度平鋪導致頁面過長）
  const [activeDimension, setActiveDimension] = useState<ScoreDimension>(ScoreDimension.COMMERCIAL)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | undefined>(undefined)

  // 排名規則說明彈窗
  const [ruleModalOpen, setRuleModalOpen] = useState(false)

  // 新增/編輯彈窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<OrganicScoreRule | null>(null)
  const [modalDimension, setModalDimension] = useState<ScoreDimension>(ScoreDimension.COMMERCIAL)
  const [ruleForm] = Form.useForm<RuleFormValues>()
  /** 監聽彈窗內計分方式，金額倍率時分值字段填倍率 */
  const ruleFormMode = Form.useWatch('mode', ruleForm)

  /** 權重總和（用於校驗提示） */
  const weightTotal = useMemo(
    () => DIMENSION_ORDER.reduce((sum, d) => sum + (dimensionWeight[d] || 0), 0),
    [dimensionWeight],
  )

  /** 按維度取規則 */
  const getRules = (dimension: ScoreDimension) =>
    rules.filter(r => r.dimension === dimension)

  /** 按維度取規則並疊加關鍵字 / 狀態篩選 */
  const getFilteredRules = (dimension: ScoreDimension) => {
    const kw = keyword.trim().toLowerCase()
    return getRules(dimension).filter(r => {
      const matchStatus = statusFilter === undefined || r.status === statusFilter
      const matchKeyword = kw === ''
        || r.name.toLowerCase().includes(kw)
        || r.id.toLowerCase().includes(kw)
        || r.description.toLowerCase().includes(kw)
      return matchStatus && matchKeyword
    })
  }

  /** 切換維度時重置篩選條件 */
  const handleDimensionChange = (key: string) => {
    setActiveDimension(Number(key) as ScoreDimension)
    setKeyword('')
    setStatusFilter(undefined)
  }

  /** 各維度啟用項數量（統計卡） */
  const enabledCountMap = useMemo(() => {
    const map = {} as Record<ScoreDimension, number>
    DIMENSION_ORDER.forEach(d => {
      map[d] = rules.filter(r => r.dimension === d && r.status === ServiceStatus.ENABLED).length
    })
    return map
  }, [rules])

  /** 打開新增彈窗 */
  const handleOpenAdd = (dimension: ScoreDimension) => {
    setEditingRule(null)
    setModalDimension(dimension)
    ruleForm.setFieldsValue({
      name: '',
      description: '',
      mode: ScoreMode.RULE_BONUS,
      score: 50,
      statDays: undefined,
      rangeScores: undefined,
      status: ServiceStatus.ENABLED,
    })
    setModalOpen(true)
  }

  /** 打開編輯彈窗 */
  const handleOpenEdit = (record: OrganicScoreRule) => {
    setEditingRule(record)
    setModalDimension(record.dimension)
    ruleForm.setFieldsValue({
      name: record.name,
      description: record.description,
      mode: record.mode,
      score: record.score,
      statDays: record.statDays,
      rangeScores: record.rangeScores,
      status: record.status,
    })
    setModalOpen(true)
  }

  /** 保存評分項（新增或編輯） */
  const handleSaveRule = async () => {
    const values = await ruleForm.validateFields()
    if (editingRule) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...values } : r))
      message.success(t('organicTrafficScore.updateSuccess', { name: values.name }))
    } else {
      const prefix = modalDimension === ScoreDimension.COMMERCIAL ? 'COM'
        : modalDimension === ScoreDimension.PLATFORM ? 'PLT' : 'ST'
      const newRule: OrganicScoreRule = {
        id: `${prefix}_CUSTOM_${Date.now()}`,
        dimension: modalDimension,
        builtin: false,
        ...values,
      }
      setRules(prev => [...prev, newRule])
      message.success(t('organicTrafficScore.addSuccess', { name: values.name }))
    }
    setModalOpen(false)
  }

  /** 啟用/停用評分項 */
  const handleToggleStatus = (record: OrganicScoreRule) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('organicTrafficScore.confirmToggle', { action: actionText }),
      content: t('organicTrafficScore.confirmToggleContent', { action: actionText, name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => {
        setRules(prev => prev.map(r => r.id === record.id ? { ...r, status: newStatus } : r))
        message.success(t('organicTrafficScore.toggleSuccess', { action: actionText, name: record.name }))
      },
    })
  }

  /** 刪除自定義評分項 */
  const handleDelete = (record: OrganicScoreRule) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('organicTrafficScore.confirmDeleteContent', { name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        setRules(prev => prev.filter(r => r.id !== record.id))
        message.success(t('common.deleteSuccess'))
      },
    })
  }

  /** 分值調整（表格內聯編輯） */
  const handleScoreChange = (id: string, score: number | null) => {
    if (score === null) return
    setRules(prev => prev.map(r => r.id === id ? { ...r, score } : r))
  }

  const buildColumns = (): ColumnsType<OrganicScoreRule> => [
    { title: t('organicTrafficScore.colRuleId'), dataIndex: 'id', key: 'id', width: 150, render: (v: string) => <Tag color="blue">{v}</Tag> },
    {
      title: t('organicTrafficScore.colRuleName'), dataIndex: 'name', key: 'name', width: 200,
      render: (v: string, record) => (
        <Space size={4}>
          <span style={{ fontWeight: 500, color: '#262626' }}>{v}</span>
          {!record.builtin && <Tag color="orange">{t('organicTrafficScore.custom')}</Tag>}
        </Space>
      ),
    },
    { title: t('organicTrafficScore.colScoringDesc'), dataIndex: 'description', key: 'description', render: (v: string) => <span style={{ color: '#8C8C8C', fontSize: 12 }}>{v}</span> },
    {
      title: t('organicTrafficScore.colScoringMode'), dataIndex: 'mode', key: 'mode', width: 110,
      render: (v: ScoreMode) => <Tag color={SCORE_MODE_COLOR[v]}>{MODE_LABEL[v]}</Tag>,
    },
    {
      title: t('organicTrafficScore.colScore'), dataIndex: 'score', key: 'score', width: 130,
      render: (v: number, record) => {
        if (record.rangeScores) {
          return (
            <Popover
              title={<span style={{ fontSize: 13, fontWeight: 600 }}>{record.name} · {t('organicTrafficScore.tieredScore')}</span>}
              content={
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 20px', minWidth: 160 }}>
                  {RANGE_SCORE_KEYS.map(key => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: '#8C8C8C', fontSize: 12 }}>{RANGE_LABEL[key]}</span>
                      <span style={{ fontWeight: 600, color: '#262626' }}>{record.rangeScores![key]} {t('organicTrafficScore.scoreUnit')}</span>
                    </div>
                  ))}
                </div>
              }
              trigger="hover"
            >
              <Button type="link" size="small" style={{ padding: '0 4px', fontSize: 12 }}>
                {t('organicTrafficScore.viewTiered')}
              </Button>
            </Popover>
          )
        }
        return (
          <InputNumber
            value={v}
            min={-100}
            max={100}
            size="small"
            style={{ width: 84 }}
            disabled={readOnly}
            onChange={val => handleScoreChange(record.id, val)}
          />
        )
      },
    },
    {
      title: t('organicTrafficScore.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'success' : 'default'}>
          {v === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')}
        </Tag>
      ),
    },
    {
      title: t('organicTrafficScore.colAction'), key: 'action', width: 170,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" disabled={readOnly} onClick={() => handleOpenEdit(record)}>{t('common.edit')}</Button>
          <Button
            type="link"
            size="small"
            disabled={readOnly}
            danger={record.status === ServiceStatus.ENABLED}
            style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === ServiceStatus.ENABLED ? t('common.disable') : t('common.enable')}
          </Button>
          {!record.builtin && (
            <Button type="link" size="small" danger disabled={readOnly} onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
          )}
        </Space>
      ),
    },
  ]

  /** 渲染一組評分項：篩選工具條 + 分頁表格 */
  const renderRulePanel = (dimension: ScoreDimension) => {
    const total = getRules(dimension)
    const data = getFilteredRules(dimension)
    const enabledCount = total.filter(r => r.status === ServiceStatus.ENABLED).length
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            placeholder={t('organicTrafficScore.searchPlaceholder')}
            style={{ width: 260 }}
            onChange={e => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            value={statusFilter}
            placeholder={t('organicTrafficScore.allStatus')}
            style={{ width: 130 }}
            options={[
              { label: t('common.enable'), value: ServiceStatus.ENABLED },
              { label: t('common.disable'), value: ServiceStatus.DISABLED },
            ]}
            onChange={val => setStatusFilter(val)}
          />
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>
            {t('organicTrafficScore.statsTotal', { total: total.length, enabled: enabledCount })}{data.length !== total.length ? t('organicTrafficScore.statsFiltered', { count: data.length }) : ''}
          </span>
          {!readOnly && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ marginLeft: 'auto' }}
              onClick={() => handleOpenAdd(dimension)}
            >
              {t('organicTrafficScore.addConfig')}
            </Button>
          )}
        </div>
        <Table
          rowKey="id"
          size="small"
          columns={buildColumns()}
          dataSource={data}
          scroll={{ x: 1100, y: RULE_TABLE_HEIGHT }}
          pagination={{
            pageSize: RULE_PAGE_SIZE,
            showSizeChanger: true,
            size: 'small',
            showTotal: (total) => t('common.total', { count: total }),
          }}
        />
      </>
    )
  }

  /** 維度面板頭：維度說明 + 權重標籤 */
  const renderDimensionHeader = (dimension: ScoreDimension) => {
    const { color, bg } = SCORE_DIMENSION_COLOR[dimension]
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        padding: '10px 14px', background: bg, borderRadius: 8,
        borderLeft: `4px solid ${color}`,
      }}>
        <span style={{ fontSize: 15 }}>{SCORE_DIMENSION_ICON[dimension]}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#262626', whiteSpace: 'nowrap' }}>
          {DIM_LABEL[dimension]}
        </span>
        <Tag color={color} style={{ background: '#fff', color, border: `1px solid ${color}44`, margin: 0 }}>
          {t('organicTrafficScore.weightLabel')} {dimensionWeight[dimension]}%
        </Tag>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{DIM_DESC[dimension]}</span>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SettingOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('organicTrafficScore.pageTitle')}</span>
        <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('organicTrafficScore.scoringDimension')}</Tag>
        <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setRuleModalOpen(true)}>
          {t('organicTrafficScore.rankingRuleDesc')}
        </Button>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('organicTrafficScore.rankingSummary')}</span>
      </div>
      {/* 3 個維度權重統計卡（帶計數動畫與 hover 動效） */}
      <div key={weightTotal} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {DIMENSION_ORDER.map(dimension => {
          const { color, bg } = SCORE_DIMENSION_COLOR[dimension]
          return (
            <div
              key={dimension}
              style={{
                padding: 16, borderRadius: 12, background: bg,
                border: `1px solid ${color}22`, textAlign: 'center',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
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
              <div style={{ fontSize: 20, marginBottom: 6 }}>{SCORE_DIMENSION_ICON[dimension]}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>
                <AnimatedNumber value={dimensionWeight[dimension]} suffix="%" />
              </div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
                {DIM_LABEL[dimension]} · {t('organicTrafficScore.enabledCount', { count: enabledCountMap[dimension] })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 維度權重與定時器配置：單行 4 列緊湊佈局 */}
      <div style={{
        padding: '14px 20px', background: '#fff', border: '1px solid #f0f0f0',
        borderRadius: 8, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ width: 4, height: 14, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('organicTrafficScore.dimensionWeightConfig')}</span>
          <span style={{ fontSize: 12, color: weightTotal === DIMENSION_WEIGHT_TOTAL ? '#52C41A' : '#FF4D4F' }}>
            {`${t('organicTrafficScore.currentTotal', { total: weightTotal })}${weightTotal === DIMENSION_WEIGHT_TOTAL ? '' : `（${t('organicTrafficScore.needEqual', { total: DIMENSION_WEIGHT_TOTAL })}）`}`}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {DIMENSION_ORDER.map(dimension => (
            <div key={dimension}>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{DIM_LABEL[dimension]}</div>
              <InputNumber
                value={dimensionWeight[dimension]}
                min={0}
                max={DIMENSION_WEIGHT_TOTAL}
                addonAfter="%"
                style={{ width: '100%' }}
                disabled={readOnly}
                onChange={val => setDimensionWeight(prev => ({ ...prev, [dimension]: val ?? 0 }))}
              />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('organicTrafficScore.scoreRecalcTimer')}</div>
            <InputNumber
              value={timerMinutes}
              min={1}
              max={1440}
              addonAfter={t('organicTrafficScore.minutesUnit')}
              style={{ width: '100%' }}
              disabled={readOnly}
              onChange={val => setTimerMinutes(val ?? DEFAULT_SCORE_TIMER_MINUTES)}
            />
          </div>
        </div>
      </div>

      {/* 各維度評分項配置：Tabs 切換，頁面高度固定不隨評分項增多而拉長 */}
      <div style={{
        padding: '4px 20px 16px', background: '#fff',
        border: '1px solid #f0f0f0', borderRadius: 8,
      }}>
        <Tabs
          activeKey={String(activeDimension)}
          onChange={handleDimensionChange}
          items={DIMENSION_ORDER.map(dimension => ({
            key: String(dimension),
            label: (
              <span style={{ fontSize: 13 }}>
                {SCORE_DIMENSION_ICON[dimension]} {DIM_LABEL[dimension]}
                <span style={{ color: '#8C8C8C', marginLeft: 4 }}>
                  ({getRules(dimension).length})
                </span>
              </span>
            ),
            children: (
              <>
                {renderDimensionHeader(dimension)}
                {renderRulePanel(dimension)}
              </>
            ),
          }))}
        />
      </div>

      {/* 自然流量排名規則說明彈窗 */}
      <Modal
        title={t('organicTrafficScore.rankingRuleTitle')}
        open={ruleModalOpen}
        width={680}
        onCancel={() => setRuleModalOpen(false)}
        footer={<Button onClick={() => setRuleModalOpen(false)}>{t('organicTrafficScore.close')}</Button>}
      >
        <div style={{ fontSize: 13, lineHeight: 2, color: '#595959', marginTop: 12 }}>
          <div dangerouslySetInnerHTML={{ __html: t('organicTrafficScore.rule1') }} />
          <div>{t('organicTrafficScore.rule2')}</div>
          <div>{t('organicTrafficScore.rule3')}</div>
          <div>{t('organicTrafficScore.rule4', { total: DIMENSION_WEIGHT_TOTAL })}</div>
          <div>{t('organicTrafficScore.rule5')}</div>
          <div>{t('organicTrafficScore.rule6')}</div>
        </div>
      </Modal>

      {/* 新增/編輯評分項彈窗 */}
      <Modal
        title={editingRule ? t('organicTrafficScore.editRule') : t('organicTrafficScore.addRule')}
        open={modalOpen}
        onOk={handleSaveRule}
        onCancel={() => setModalOpen(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={640}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t('organicTrafficScore.dimension')}>
            <Input
              disabled
              value={DIM_LABEL[modalDimension]}
            />
          </Form.Item>
          <Form.Item label={t('organicTrafficScore.ruleName')} name="name" rules={[{ required: true, message: t('organicTrafficScore.ruleNameRequired') }]}>
            <Input placeholder={t('organicTrafficScore.namePlaceholder')} maxLength={30} showCount />
          </Form.Item>
          <Form.Item label={t('organicTrafficScore.scoringDesc')} name="description" rules={[{ required: true, message: t('organicTrafficScore.scoringDescRequired') }]}>
            <Input.TextArea placeholder={t('organicTrafficScore.descPlaceholder')} rows={3} maxLength={120} showCount />
          </Form.Item>
          <Form.Item label={t('organicTrafficScore.scoringMode')} name="mode" rules={[{ required: true, message: t('organicTrafficScore.scoringModeRequired') }]}>
            <Select options={MODE_OPTIONS} placeholder={t('organicTrafficScore.selectScoringMode')} />
          </Form.Item>
          {!isDeliveryRange(editingRule?.id) && (
            <Form.Item
              label={t('organicTrafficScore.score')}
              name="score"
              rules={[{ required: !isDeliveryRange(editingRule?.id), message: t('organicTrafficScore.scoreRequired') }]}
              extra={ruleFormMode === ScoreMode.AMOUNT_MULTIPLIER
                ? t('organicTrafficScore.scoreExtraMultiplier')
                : t('organicTrafficScore.scoreExtraNormal')}
            >
              <InputNumber min={-100} max={100} style={{ width: '100%' }} placeholder={t('organicTrafficScore.scorePlaceholder')} />
            </Form.Item>
          )}
          {isDeliveryRange(editingRule?.id) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#262626', marginBottom: 8 }}>{t('organicTrafficScore.deliveryRangeTiered')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {RANGE_SCORE_KEYS.map(key => (
                  <Form.Item
                    key={key}
                    label={RANGE_LABEL[key]}
                    name={['rangeScores', key]}
                    rules={[{ required: true, message: t('organicTrafficScore.rangeScoreRequired', { label: RANGE_LABEL[key] }) }]}
                    style={{ marginBottom: 0 }}
                    initialValue={DEFAULT_RANGE_SCORES[key]}
                  >
                    <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder={t('organicTrafficScore.scoreInputPlaceholder')} addonAfter={t('organicTrafficScore.scoreUnit')} />
                  </Form.Item>
                ))}
              </div>
            </div>
          )}
          {(editingRule ? needsStatDays(editingRule.id) : false) && (
            <Form.Item
              label={t('organicTrafficScore.statDays')}
              name="statDays"
              extra={t('organicTrafficScore.statDaysExtra')}
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} placeholder={t('organicTrafficScore.statDaysPlaceholder')} addonAfter={t('organicTrafficScore.daysUnit')} />
            </Form.Item>
          )}
          <Form.Item
            label={t('organicTrafficScore.status')}
            name="status"
            valuePropName="checked"
            getValueProps={v => ({ checked: v === ServiceStatus.ENABLED })}
            normalize={(checked: boolean) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
            rules={[{ required: true, message: t('organicTrafficScore.statusRequired') }]}
          >
            <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
