import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Table, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Radio, Tabs, Segmented } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SettingOutlined, PlusOutlined, SaveOutlined, SearchOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { ServiceStatus } from './constants'
import {
  ScoreDimension, StoreSubDimension, ScoreMode,
  SCORE_DIMENSION_LABEL, SCORE_DIMENSION_DESC, SCORE_DIMENSION_ICON, SCORE_DIMENSION_COLOR,
  STORE_SUB_DIMENSION_LABEL, SCORE_MODE_LABEL, SCORE_MODE_COLOR, SCORE_MODE_OPTIONS,
  DEFAULT_DIMENSION_WEIGHT, DEFAULT_STORE_SUB_WEIGHT, DIMENSION_WEIGHT_TOTAL,
  DEFAULT_SCORE_TIMER_MINUTES, DEFAULT_ORGANIC_SCORE_RULES,
  type OrganicScoreRule,
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
  ScoreDimension.USER,
  ScoreDimension.PLATFORM,
]

/** 店鋪維度子維度順序 */
const STORE_SUB_ORDER: StoreSubDimension[] = [StoreSubDimension.BASIC_INFO, StoreSubDimension.OPERATION]

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
  status: ServiceStatus
}

interface Props {
  /** 詳情模式：只讀，隱藏所有編輯入口 */
  readOnly?: boolean
}

/**
 * 自然流量算法參數配置：4 個維度的商家評分規則。
 * 自然流量不售賣坑位，商家靠綜合得分高低較量排名。
 */
export default function OrganicTrafficScoreConfig({ readOnly = false }: Props) {
  const [rules, setRules] = useState<OrganicScoreRule[]>(DEFAULT_ORGANIC_SCORE_RULES)
  const [dimensionWeight, setDimensionWeight] = useState<Record<ScoreDimension, number>>(DEFAULT_DIMENSION_WEIGHT)
  const [storeSubWeight, setStoreSubWeight] = useState<Record<StoreSubDimension, number>>(DEFAULT_STORE_SUB_WEIGHT)
  const [timerMinutes, setTimerMinutes] = useState<number>(DEFAULT_SCORE_TIMER_MINUTES)

  // 維度切換與表格內篩選（避免所有維度平鋪導致頁面過長）
  const [activeDimension, setActiveDimension] = useState<ScoreDimension>(ScoreDimension.COMMERCIAL)
  const [activeStoreSub, setActiveStoreSub] = useState<StoreSubDimension>(StoreSubDimension.BASIC_INFO)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | undefined>(undefined)

  // 排名規則說明彈窗
  const [ruleModalOpen, setRuleModalOpen] = useState(false)

  // 新增/編輯彈窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<OrganicScoreRule | null>(null)
  const [modalDimension, setModalDimension] = useState<ScoreDimension>(ScoreDimension.COMMERCIAL)
  const [modalSubDimension, setModalSubDimension] = useState<StoreSubDimension | undefined>(undefined)
  const [ruleForm] = Form.useForm<RuleFormValues>()

  /** 權重總和（用於校驗提示） */
  const weightTotal = useMemo(
    () => DIMENSION_ORDER.reduce((sum, d) => sum + (dimensionWeight[d] || 0), 0),
    [dimensionWeight],
  )
  const storeSubWeightTotal = storeSubWeight[StoreSubDimension.BASIC_INFO] + storeSubWeight[StoreSubDimension.OPERATION]

  /** 按維度（含子維度）取規則 */
  const getRules = (dimension: ScoreDimension, subDimension?: StoreSubDimension) =>
    rules.filter(r => r.dimension === dimension && (subDimension === undefined || r.subDimension === subDimension))

  /** 按維度取規則並疊加關鍵字 / 狀態篩選 */
  const getFilteredRules = (dimension: ScoreDimension, subDimension?: StoreSubDimension) => {
    const kw = keyword.trim().toLowerCase()
    return getRules(dimension, subDimension).filter(r => {
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

  /** 切換店鋪子維度時重置篩選條件 */
  const handleStoreSubChange = (key: string) => {
    setActiveStoreSub(Number(key) as StoreSubDimension)
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
  const handleOpenAdd = (dimension: ScoreDimension, subDimension?: StoreSubDimension) => {
    setEditingRule(null)
    setModalDimension(dimension)
    setModalSubDimension(subDimension)
    ruleForm.setFieldsValue({
      name: '',
      description: '',
      mode: ScoreMode.FIXED,
      score: 50,
      status: ServiceStatus.ENABLED,
    })
    setModalOpen(true)
  }

  /** 打開編輯彈窗 */
  const handleOpenEdit = (record: OrganicScoreRule) => {
    setEditingRule(record)
    setModalDimension(record.dimension)
    setModalSubDimension(record.subDimension)
    ruleForm.setFieldsValue({
      name: record.name,
      description: record.description,
      mode: record.mode,
      score: record.score,
      status: record.status,
    })
    setModalOpen(true)
  }

  /** 保存評分項（新增或編輯） */
  const handleSaveRule = async () => {
    const values = await ruleForm.validateFields()
    if (editingRule) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...values } : r))
      message.success(`已更新評分項「${values.name}」`)
    } else {
      const prefix = modalDimension === ScoreDimension.COMMERCIAL ? 'COM'
        : modalDimension === ScoreDimension.USER ? 'USR'
        : modalDimension === ScoreDimension.PLATFORM ? 'PLT'
        : modalSubDimension === StoreSubDimension.BASIC_INFO ? 'STB' : 'STO'
      const newRule: OrganicScoreRule = {
        id: `${prefix}_CUSTOM_${Date.now()}`,
        dimension: modalDimension,
        subDimension: modalSubDimension,
        builtin: false,
        ...values,
      }
      setRules(prev => [...prev, newRule])
      message.success(`已新增評分項「${values.name}」`)
    }
    setModalOpen(false)
  }

  /** 啟用/停用評分項 */
  const handleToggleStatus = (record: OrganicScoreRule) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}評分項「${record.name}」嗎？停用後該項不再參與自然流量得分計算。`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        setRules(prev => prev.map(r => r.id === record.id ? { ...r, status: newStatus } : r))
        message.success(`已${actionText}「${record.name}」`)
      },
    })
  }

  /** 刪除自定義評分項 */
  const handleDelete = (record: OrganicScoreRule) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除評分項「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setRules(prev => prev.filter(r => r.id !== record.id))
        message.success('刪除成功')
      },
    })
  }

  /** 分值調整（表格內聯編輯） */
  const handleScoreChange = (id: string, score: number | null) => {
    if (score === null) return
    setRules(prev => prev.map(r => r.id === id ? { ...r, score } : r))
  }

  const buildColumns = (): ColumnsType<OrganicScoreRule> => [
    { title: '評分項ID', dataIndex: 'id', key: 'id', width: 150, render: (v: string) => <Tag color="blue">{v}</Tag> },
    {
      title: '評分項名稱', dataIndex: 'name', key: 'name', width: 200,
      render: (v: string, record) => (
        <Space size={4}>
          <span style={{ fontWeight: 500, color: '#262626' }}>{v}</span>
          {!record.builtin && <Tag color="orange">自定義</Tag>}
        </Space>
      ),
    },
    { title: '計分說明', dataIndex: 'description', key: 'description', render: (v: string) => <span style={{ color: '#8C8C8C', fontSize: 12 }}>{v}</span> },
    {
      title: '計分方式', dataIndex: 'mode', key: 'mode', width: 110,
      render: (v: ScoreMode) => <Tag color={SCORE_MODE_COLOR[v]}>{SCORE_MODE_LABEL[v]}</Tag>,
    },
    {
      title: '分值', dataIndex: 'score', key: 'score', width: 110,
      render: (v: number, record) => (
        <InputNumber
          value={v}
          min={-100}
          max={100}
          size="small"
          style={{ width: 84 }}
          disabled={readOnly}
          onChange={val => handleScoreChange(record.id, val)}
        />
      ),
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 90,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'success' : 'default'}>
          {v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 170,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" disabled={readOnly} onClick={() => handleOpenEdit(record)}>編輯</Button>
          <Button
            type="link"
            size="small"
            disabled={readOnly}
            danger={record.status === ServiceStatus.ENABLED}
            style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === ServiceStatus.ENABLED ? '停用' : '啟用'}
          </Button>
          {!record.builtin && (
            <Button type="link" size="small" danger disabled={readOnly} onClick={() => handleDelete(record)}>刪除</Button>
          )}
        </Space>
      ),
    },
  ]

  /** 渲染一組評分項：篩選工具條 + 分頁表格 */
  const renderRulePanel = (dimension: ScoreDimension, subDimension?: StoreSubDimension) => {
    const total = getRules(dimension, subDimension)
    const data = getFilteredRules(dimension, subDimension)
    const enabledCount = total.filter(r => r.status === ServiceStatus.ENABLED).length
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            placeholder="搜索評分項名稱 / ID / 計分說明"
            style={{ width: 260 }}
            onChange={e => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            value={statusFilter}
            placeholder="全部狀態"
            style={{ width: 130 }}
            options={[
              { label: '啟用', value: ServiceStatus.ENABLED },
              { label: '停用', value: ServiceStatus.DISABLED },
            ]}
            onChange={val => setStatusFilter(val)}
          />
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>
            共 {total.length} 項 · 啟用 {enabledCount} 項{data.length !== total.length ? ` · 篩選出 ${data.length} 項` : ''}
          </span>
          {!readOnly && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ marginLeft: 'auto' }}
              onClick={() => handleOpenAdd(dimension, subDimension)}
            >
              新增配置
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
            showTotal: t => `共 ${t} 項`,
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
          {SCORE_DIMENSION_LABEL[dimension]}
        </span>
        <Tag color={color} style={{ background: '#fff', color, border: `1px solid ${color}44`, margin: 0 }}>
          權重 {dimensionWeight[dimension]}%
        </Tag>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{SCORE_DIMENSION_DESC[dimension]}</span>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SettingOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>算法參數</span>
        <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>評分維度</Tag>
        <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setRuleModalOpen(true)}>
          自然流量排名規則說明
        </Button>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>自然流量按綜合得分高低排名</span>
      </div>
      {/* 4 個維度權重統計卡（帶計數動畫與 hover 動效） */}
      <div key={weightTotal} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
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
                {SCORE_DIMENSION_LABEL[dimension]} · 啟用 {enabledCountMap[dimension]} 項
              </div>
            </div>
          )
        })}
      </div>

      {/* 維度權重與定時器配置：單行 5 列緊湊佈局 */}
      <div style={{
        padding: '14px 20px', background: '#fff', border: '1px solid #f0f0f0',
        borderRadius: 8, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ width: 4, height: 14, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>維度權重與計算配置</span>
          <span style={{ fontSize: 12, color: weightTotal === DIMENSION_WEIGHT_TOTAL ? '#52C41A' : '#FF4D4F' }}>
            當前合計 {weightTotal}%{weightTotal === DIMENSION_WEIGHT_TOTAL ? '' : `（需等於 ${DIMENSION_WEIGHT_TOTAL}%）`}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {DIMENSION_ORDER.map(dimension => (
            <div key={dimension}>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{SCORE_DIMENSION_LABEL[dimension]}</div>
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
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>得分重算定時器</div>
            <InputNumber
              value={timerMinutes}
              min={1}
              max={1440}
              addonAfter="分鐘"
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
                {SCORE_DIMENSION_ICON[dimension]} {SCORE_DIMENSION_LABEL[dimension]}
                <span style={{ color: '#8C8C8C', marginLeft: 4 }}>
                  ({getRules(dimension).length})
                </span>
              </span>
            ),
            children: (
              <>
                {renderDimensionHeader(dimension)}
                {dimension === ScoreDimension.STORE ? (
                  <>
                    {/* 店鋪維度子維度權重 + 子維度切換 */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14,
                      padding: '10px 16px', background: '#FAFAFA', borderRadius: 8,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#262626', whiteSpace: 'nowrap' }}>子維度權重</span>
                      {STORE_SUB_ORDER.map(sub => (
                        <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{STORE_SUB_DIMENSION_LABEL[sub]}</span>
                          <InputNumber
                            value={storeSubWeight[sub]}
                            min={0}
                            max={DIMENSION_WEIGHT_TOTAL}
                            addonAfter="%"
                            style={{ width: 120 }}
                            disabled={readOnly}
                            onChange={val => setStoreSubWeight(prev => ({ ...prev, [sub]: val ?? 0 }))}
                          />
                        </div>
                      ))}
                      <span style={{ fontSize: 12, color: storeSubWeightTotal === DIMENSION_WEIGHT_TOTAL ? '#52C41A' : '#FF4D4F' }}>
                        合計 {storeSubWeightTotal}%
                      </span>
                    </div>
                    <Segmented
                      value={activeStoreSub}
                      style={{ marginBottom: 14 }}
                      onChange={val => handleStoreSubChange(String(val))}
                      options={STORE_SUB_ORDER.map(sub => ({
                        value: sub,
                        label: `${STORE_SUB_DIMENSION_LABEL[sub]}（${getRules(ScoreDimension.STORE, sub).length}）`,
                      }))}
                    />
                    {renderRulePanel(ScoreDimension.STORE, activeStoreSub)}
                  </>
                ) : (
                  renderRulePanel(dimension)
                )}
              </>
            ),
          }))}
        />
      </div>

      {/* 自然流量排名規則說明彈窗 */}
      <Modal
        title="自然流量排名規則說明"
        open={ruleModalOpen}
        width={680}
        onCancel={() => setRuleModalOpen(false)}
        footer={<Button onClick={() => setRuleModalOpen(false)}>關閉</Button>}
      >
        <div style={{ fontSize: 13, lineHeight: 2, color: '#595959', marginTop: 12 }}>
          <div>1. 自然流量不售賣坑位，同一坑位內所有符合條件的商家<strong>靠綜合得分高低較量排名</strong>，得分越高排序越前。</div>
          <div>2. 綜合得分 = Σ（維度權重 × 該維度得分率），維度得分率 = 該維度啟用項實得分之和 ÷ 啟用項滿分之和。</div>
          <div>3. 店鋪維度得分率 = 基礎信息得分率 × 基礎信息權重 + 店鋪運營得分率 × 店鋪運營權重。</div>
          <div>4. 扣分降權項為負分，命中後直接從對應維度得分中扣減；停用的評分項不參與計算，也不計入滿分分母。</div>
          <div>5. 4 個維度權重合計必須等於 {DIMENSION_WEIGHT_TOTAL}%，店鋪維度下子維度權重合計也必須等於 {DIMENSION_WEIGHT_TOTAL}%。</div>
          <div>6. 得分由系統按定時器週期重算，同分商家按「店鋪評分 → 近30天訂單量 → 距離」依次比較。</div>
          <div>7. 系統內置評分項不可刪除，僅可編輯、調整分值與啟用/停用；自定義項可刪除。</div>
        </div>
      </Modal>

      {/* 新增/編輯評分項彈窗 */}
      <Modal
        title={editingRule ? '編輯評分項' : '新增評分項'}
        open={modalOpen}
        onOk={handleSaveRule}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={640}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="所屬維度">
            <Input
              disabled
              value={
                modalSubDimension !== undefined
                  ? `${SCORE_DIMENSION_LABEL[modalDimension]} · ${STORE_SUB_DIMENSION_LABEL[modalSubDimension]}`
                  : SCORE_DIMENSION_LABEL[modalDimension]
              }
            />
          </Form.Item>
          <Form.Item label="評分項名稱" name="name" rules={[{ required: true, message: '請輸入評分項名稱' }]}>
            <Input placeholder="如：購買金字招牌廣告" maxLength={30} showCount />
          </Form.Item>
          <Form.Item label="計分說明" name="description" rules={[{ required: true, message: '請輸入計分說明' }]}>
            <Input.TextArea placeholder="說明該項的計分依據與取值口徑" rows={3} maxLength={120} showCount />
          </Form.Item>
          <Form.Item label="計分方式" name="mode" rules={[{ required: true, message: '請選擇計分方式' }]}>
            <Select options={SCORE_MODE_OPTIONS} placeholder="請選擇計分方式" />
          </Form.Item>
          <Form.Item
            label="分值"
            name="score"
            rules={[{ required: true, message: '請輸入分值' }]}
            extra="加分項填正值，扣分降權項填負值，取值範圍 -100 ~ 100"
          >
            <InputNumber min={-100} max={100} style={{ width: '100%' }} placeholder="請輸入分值" />
          </Form.Item>
          <Form.Item label="狀態" name="status" rules={[{ required: true, message: '請選擇狀態' }]}>
            <Radio.Group>
              <Radio value={ServiceStatus.ENABLED}>啟用</Radio>
              <Radio value={ServiceStatus.DISABLED}>停用</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
