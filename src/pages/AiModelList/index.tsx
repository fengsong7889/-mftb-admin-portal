import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, Form, Input, Select, Table, Tag, message, Switch, Tooltip, Space, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EyeOutlined, ToolOutlined, CodeOutlined, ThunderboltOutlined, BulbOutlined, CheckCircleFilled, RobotOutlined } from '@ant-design/icons'
import {
  fetchModels,
  fetchProviders,
  updateModel,
  deleteModel,
  parseModalities,
  type AiModel,
  type AiProvider,
  type ModelQueryParams,
  type ModelType,
  type Modality,
} from '../../api'
import AnimatedNumber from '../../components/AnimatedNumber'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/* ────────────────── 展示常量 ────────────────── */

/** 模型類型標籤顏色 */
const MODEL_TYPE_TAG: Record<ModelType, string> = {
  chat: 'processing',
  completion: 'blue',
  embedding: 'purple',
  token_count: 'default',
}

const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  chat: '對話',
  completion: '文本生成',
  embedding: '向量嵌入',
  token_count: 'Token 計數',
}

/** 模态标签颜色 */
const MODALITY_TAG: Record<Modality, { color: string; label: string }> = {
  text: { color: 'blue', label: '文本' },
  image: { color: 'purple', label: '图像' },
  audio: { color: 'cyan', label: '音频' },
  video: { color: 'magenta', label: '视频' },
}

/** API 兼容格式标签 */
const API_COMPAT_LABEL: Record<string, { label: string; color: string }> = {
  openai: { label: 'OpenAI', color: 'green' },
  anthropic: { label: 'Anthropic', color: 'orange' },
  gemini: { label: 'Gemini', color: 'geekblue' },
}

/** 币种符号 */
const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
}

/** 统计卡（12.1 标准） */
const StatCard = ({ icon, value, label, color, bg }: { icon: React.ReactNode; value: React.ReactNode; label: string; color: string; bg: string }) => (
  <div
    style={{
      padding: 16, borderRadius: 12, background: bg, border: `1px solid ${color}22`, textAlign: 'center',
      transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default', position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = 'none'
    }}
  >
    <div style={{ fontSize: 20, color, marginBottom: 6 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{label}</div>
  </div>
)

/** 上下文長度格式化 */
const contextLengthText = (n?: number) => {
  if (!n) return '-'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

/** 能力胶囊 */
const CapabilityTag = ({ enabled, icon, label, color }: { enabled: boolean; icon: React.ReactNode; label: string; color: string }) => (
  <Tooltip title={enabled ? `支持${label}` : `不支持${label}`}>
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        padding: '1px 6px', borderRadius: 4,
        fontSize: 11, lineHeight: '18px',
        color: enabled ? color : '#BFBFBF',
        background: enabled ? `${color}11` : '#F5F5F5',
        border: `1px solid ${enabled ? color + '44' : '#E8E8E8'}`,
        marginRight: 2, marginBottom: 2,
        opacity: enabled ? 1 : 0.65,
        textDecoration: enabled ? 'none' : 'line-through',
      }}
    >
      {icon}
      {label}
    </span>
  </Tooltip>
)

/** 能力矩阵胶囊组 */
const CapabilityMatrix = ({ model }: { model: AiModel }) => (
  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 0 }}>
    <CapabilityTag enabled={!!model.visionSupport} icon={<EyeOutlined />} label="视觉" color="#722ED1" />
    <CapabilityTag enabled={!!model.functionCalling} icon={<ToolOutlined />} label="工具" color="#1890FF" />
    <CapabilityTag enabled={!!model.jsonMode} icon={<CodeOutlined />} label="JSON" color="#13C2C2" />
    <CapabilityTag enabled={!!model.streaming} icon={<ThunderboltOutlined />} label="流式" color="#52C41A" />
    <CapabilityTag enabled={!!model.thinkingMode} icon={<BulbOutlined />} label="思考" color="#E8720C" />
  </div>
)

/** 模态胶囊组 */
const ModalityChips = ({ modalities }: { modalities?: string }) => {
  const list = parseModalities(modalities)
  if (list.length === 0) return <span style={{ color: '#BFBFBF' }}>-</span>
  return (
    <Space size={2} wrap>
      {list.map((m) => (
        <Tag key={m} color={MODALITY_TAG[m]?.color} style={{ margin: 0, fontSize: 11 }}>
          {MODALITY_TAG[m]?.label || m}
        </Tag>
      ))}
    </Space>
  )
}

export default function AiModelList() {
  const navigate = useNavigate()
  /* ── 數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [loading, setLoading] = useState(false)

  /** 加載模型列表 */
  const loadModels = async (params?: ModelQueryParams) => {
    setLoading(true)
    try {
      const data = await fetchModels(params)
      setModels(data)
    } catch (error) {
      console.error('Failed to load models:', error)
      message.error('加載模型列表失敗')
    } finally {
      setLoading(false)
    }
  }

  /** 加載供應商列表（用於過濾選項和供應商名稱映射） */
  const loadProviders = async () => {
    try {
      const data = await fetchProviders()
      setProviders(data)
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }

  useEffect(() => {
    loadModels()
    loadProviders()
  }, [])

  /** 供應商 id → 名稱映射 */
  const providerName = useMemo((): Record<string, string> => {
    const map: Record<string, string> = {}
    providers.forEach((p) => { map[String(p.id)] = p.name })
    return map
  }, [providers])

  /* ── 查詢條件 ── */
  const [queryName, setQueryName] = useState('')
  const [queryProvider, setQueryProvider] = useState<string | undefined>(undefined)
  const [queryType, setQueryType] = useState<string | undefined>(undefined)
  const [queryStatus, setQueryStatus] = useState<string | undefined>(undefined)
  const [queryModality, setQueryModality] = useState<string | undefined>(undefined)
  const [queryUpdatedBy, setQueryUpdatedBy] = useState('')
  const [queryUpdateDate, setQueryUpdateDate] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [tick, setTick] = useState(0)

  const [applied, setApplied] = useState({
    name: '',
    provider: undefined as string | undefined,
    type: undefined as string | undefined,
    status: undefined as number | undefined,
    modality: undefined as string | undefined,
    updatedBy: '',
    updateDateStart: null as dayjs.Dayjs | null,
    updateDateEnd: null as dayjs.Dayjs | null,
  })

  const handleSearch = () => {
    const nextApplied = {
      name: queryName.trim(),
      provider: queryProvider,
      type: queryType,
      status: queryStatus ? Number(queryStatus) : undefined,
      modality: queryModality,
      updatedBy: queryUpdatedBy.trim(),
      updateDateStart: queryUpdateDate?.[0] || null,
      updateDateEnd: queryUpdateDate?.[1] || null,
    }
    setApplied(nextApplied)
    setTick((prev) => prev + 1)
    // 從後端按名稱/狀態/模態/類型篩選（供應商/更新人/更新時間在客戶端篩選）
    const params: ModelQueryParams = {}
    if (nextApplied.name) params.name = nextApplied.name
    if (nextApplied.status !== undefined) params.status = nextApplied.status
    if (nextApplied.modality) params.modality = nextApplied.modality
    if (nextApplied.type) params.type = nextApplied.type
    loadModels(params)
  }

  const handleReset = () => {
    setQueryName('')
    setQueryProvider(undefined)
    setQueryType(undefined)
    setQueryStatus(undefined)
    setQueryModality(undefined)
    setQueryUpdatedBy('')
    setQueryUpdateDate(null)
    setApplied({ name: '', provider: undefined, type: undefined, status: undefined, modality: undefined, updatedBy: '', updateDateStart: null, updateDateEnd: null })
    setTick((prev) => prev + 1)
    loadModels()
  }

  /** 在已加載的模型上做客戶端過濾（供應商/更新人/更新時間） */
  const filteredModels = useMemo(() => models.filter((m) => {
    if (applied.provider && String(m.providerId) !== applied.provider) return false
    if (applied.updatedBy && !(m.updatedBy || '').includes(applied.updatedBy)) return false
    if (applied.updateDateStart && m.updatedAt) {
      if (dayjs(m.updatedAt).isBefore(applied.updateDateStart.startOf('day'))) return false
    }
    if (applied.updateDateEnd && m.updatedAt) {
      if (dayjs(m.updatedAt).isAfter(applied.updateDateEnd.endOf('day'))) return false
    }
    return true
  }), [models, applied])

  /* ── 模型啟停（二次確認） ── */
  const handleToggleModel = async (row: AiModel) => {
    const toDisable = row.status === 1
    const newStatus = toDisable ? 0 : 1
    const actionText = toDisable ? '停用' : '啟用'

    Modal.confirm({
      title: `確認${actionText}該模型？`,
      content: `${actionText}後「${row.name}」${toDisable ? '將立即不可調用，所有用戶端同步失效' : '將恢復可用，用戶端可正常調用'}`,
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          await updateModel(row.id, {
            modelKey: row.modelKey,
            name: row.name,
            providerId: row.providerId ?? undefined,
            version: row.version,
            description: row.description,
            apiCompat: row.apiCompat,
            modalities: row.modalities,
            visionSupport: row.visionSupport,
            functionCalling: row.functionCalling,
            jsonMode: row.jsonMode,
            streaming: row.streaming,
            thinkingMode: row.thinkingMode,
            type: row.type,
            contextWindow: row.contextWindow,
            maxOutputTokens: row.maxOutputTokens,
            inputPrice: row.inputPrice,
            outputPrice: row.outputPrice,
            cachedInputPrice: row.cachedInputPrice,
            currency: row.currency,
            concurrencyLimit: row.concurrencyLimit,
            status: newStatus,
            sortOrder: row.sortOrder,
            updatedBy: 'admin',
          })
          message.success(`${row.name} 已${actionText}`)
          loadModels()
        } catch (error) {
          console.error('Toggle failed:', error)
          message.error(error instanceof Error ? error.message : '操作失败')
        }
      },
    })
  }

  /* ── 刪除模型 ── */
  const handleDeleteModel = (row: AiModel) => {
    Modal.confirm({
      title: '確認刪除該模型？',
      content: `刪除後「${row.name}」將從模型庫中移除，後續不可恢復。`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteModel(row.id)
          message.success('模型已刪除')
          loadModels()
        } catch (error) {
          console.error('Delete failed:', error)
          message.error(error instanceof Error ? error.message : '刪除失敗')
        }
      },
    })
  }

  /* ── 編輯 / 詳情：跳轉到獨立頁面 ── */

  /* ── 統計卡 ── */
  const stats = [
    { label: '接入模型', value: <AnimatedNumber value={models.length} />, icon: <RobotOutlined />, color: '#722ED1', bg: '#F9F0FF' },
    { label: '啟用中模型', value: <AnimatedNumber value={models.filter((m) => m.status === 1).length} />, icon: <CheckCircleFilled style={{ color: '#52C41A' }} />, color: '#52C41A', bg: '#F6FFED' },
    { label: '視覺模型', value: <AnimatedNumber value={models.filter((m) => m.visionSupport === 1).length} />, icon: <EyeOutlined />, color: '#1890FF', bg: '#E6F7FF' },
    { label: '供應商數', value: <AnimatedNumber value={providers.length} />, icon: <span>🏢</span>, color: '#E8720C', bg: '#FFF7E6' },
  ]

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'name', title: '模型名稱' },
    { key: 'providerName', title: '供應商' },
    { key: 'type', title: '類型' },
    { key: 'modalities', title: '支持模態' },
    { key: 'capabilities', title: '能力矩陣' },
    { key: 'context', title: '上下文' },
    { key: 'price', title: '輸入/輸出單價' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent } = useColumnConfig('ai-model-list', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<AiModel> = [
    {
      title: '模型名稱', key: 'name', width: 220, fixed: 'left',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, color: '#262626' }}>{row.name}</div>
          <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace' }}>{row.modelKey}</span>
            {row.version && <span style={{ marginLeft: 6, color: '#BFBFBF' }}>· {row.version}</span>}
          </div>
        </div>
      ),
    },
    {
      title: '供應商', key: 'providerName', width: 140,
      render: (_, row) => row.providerName || providerName[String(row.providerId)] || row.providerId || '-',
    },
    {
      title: '類型', key: 'type', width: 110, align: 'center',
      render: (_, row) => row.type ? <Tag color={MODEL_TYPE_TAG[row.type as ModelType]}>{MODEL_TYPE_LABEL[row.type as ModelType] || row.type}</Tag> : '-',
    },
    {
      title: '支持模態', key: 'modalities', width: 150,
      render: (_, row) => <ModalityChips modalities={row.modalities} />,
    },
    {
      title: '能力矩陣', key: 'capabilities', width: 300,
      render: (_, row) => <CapabilityMatrix model={row} />,
    },
    {
      title: '上下文 / 最大輸出', key: 'context', width: 150,
      render: (_, row) => (
        <div style={{ fontSize: 12 }}>
          <div>↑ <span style={{ color: '#1890FF', fontWeight: 600 }}>{contextLengthText(row.contextWindow)}</span></div>
          <div style={{ color: '#8C8C8C', marginTop: 2 }}>↓ {contextLengthText(row.maxOutputTokens)}</div>
        </div>
      ),
    },
    {
      title: '輸入 / 輸出單價', key: 'price', width: 180, align: 'right',
      render: (_, row) => {
        const sym = CURRENCY_SYMBOL[row.currency || 'CNY']
        return (
          <div style={{ fontSize: 12 }}>
            <div>
              <span style={{ color: '#8C8C8C' }}>入 </span>
              <span style={{ color: '#52C41A', fontWeight: 600 }}>{sym}{row.inputPrice ?? '-'}</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ color: '#8C8C8C' }}>出 </span>
              <span style={{ color: '#E8720C', fontWeight: 600 }}>{sym}{row.outputPrice ?? '-'}</span>
              <span style={{ color: '#BFBFBF', fontSize: 10, marginLeft: 2 }}>/百萬</span>
            </div>
          </div>
        )
      },
    },
    {
      title: '狀態', key: 'status', width: 100, align: 'center',
      render: (_, row: AiModel) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleToggleModel(row)}
        />
      ),
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      render: (v?: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-',
    },
    {
      title: '操作', key: 'action', width: 180, align: 'center', fixed: 'right',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => navigate(`/ai-model-detail?id=${row.id}`)}>詳情</Button>
          <Button type="link" onClick={() => navigate(`/ai-model-edit?id=${row.id}`)}>編輯</Button>
          <Button type="link" danger onClick={() => handleDeleteModel(row)}>刪除</Button>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜單界面頂部沒有菜單名稱 */}

      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="模型名稱">
            <Input value={queryName} placeholder="請輸入模型名稱" allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label="供應商">
            <Select
              value={queryProvider}
              placeholder="全部"
              allowClear
              options={providers.map((p) => ({ value: String(p.id), label: p.name }))}
              onChange={(v) => setQueryProvider(v)}
            />
          </Form.Item>
          <Form.Item label="類型">
            <Select
              value={queryType}
              placeholder="全部"
              allowClear
              options={Object.entries(MODEL_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              onChange={(v) => setQueryType(v)}
            />
          </Form.Item>
          <Form.Item label="支持模態">
            <Select
              value={queryModality}
              placeholder="全部"
              allowClear
              options={Object.entries(MODALITY_TAG).map(([value, { label }]) => ({ value, label }))}
              onChange={(v) => setQueryModality(v)}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              value={queryStatus}
              placeholder="全部"
              allowClear
              options={[{ value: '1', label: '啟用' }, { value: '0', label: '停用' }]}
              onChange={(v) => setQueryStatus(v)}
            />
          </Form.Item>
          <Form.Item label="最後更新人">
            <Input value={queryUpdatedBy} placeholder="請輸入更新人" allowClear onChange={(e) => setQueryUpdatedBy(e.target.value)} />
          </Form.Item>
          <Form.Item label="最後更新時間">
            <DatePicker.RangePicker
              value={queryUpdateDate}
              style={{ width: '100%' }}
              allowClear
              onChange={(dates) => setQueryUpdateDate(dates)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 數據指標統計卡（切換查詢條件時重新觸發計數動畫） */}
      <div
        key={tick}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}
      >
        {stats.map((stat, i) => (
          <StatCard key={i} {...stat} />
        ))}
      </div>

      {/* 操作區：右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => message.info('新增模型將在後端 API 完整支持後開放，當前請聯繫管理員')}
          >
            新增
          </Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={filteredModels}
        pagination={false}
        scroll={{ x: 1760 }}
      />
    </div>
  )
}

