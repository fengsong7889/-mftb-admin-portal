import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Tag, Tooltip, Space, Spin, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EyeOutlined, ToolOutlined, CodeOutlined, ThunderboltOutlined, BulbOutlined, DollarOutlined, SettingOutlined, PoweroffOutlined, AppstoreOutlined, GlobalOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  getModelById,
  parseModalities,
  type AiModel,
  type ModelType,
  type Modality,
} from '../../api'

/* ────────────────── 展示常量（与列表页一致） ────────────────── */

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

const MODALITY_TAG: Record<Modality, { color: string; label: string }> = {
  text: { color: 'blue', label: '文本' },
  image: { color: 'purple', label: '图像' },
  audio: { color: 'cyan', label: '音频' },
  video: { color: 'magenta', label: '视频' },
}

const API_COMPAT_LABEL: Record<string, { label: string; color: string }> = {
  openai: { label: 'OpenAI', color: 'green' },
  anthropic: { label: 'Anthropic', color: 'orange' },
  gemini: { label: 'Gemini', color: 'geekblue' },
}

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
}

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

export default function AiModelDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const modelId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [model, setModel] = useState<AiModel | null>(null)

  /** 加载模型详情 */
  useEffect(() => {
    if (!modelId) {
      message.error('缺少模型 ID 參數')
      navigate('/ai-model-list')
      return
    }
    setLoading(true)
    getModelById(Number(modelId))
      .then((data) => setModel(data))
      .catch((err) => {
        console.error('Failed to load model:', err)
        message.error('加載模型信息失敗')
      })
      .finally(() => setLoading(false))
  }, [modelId, navigate])

  const handleBack = () => {
    navigate('/ai-model-list')
  }

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="加載中..." />
      </div>
    )
  }

  if (!model) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>模型信息加載失敗</div>
        <Button style={{ marginTop: 16 }} onClick={handleBack}>返回列表</Button>
      </div>
    )
  }

  const sym = CURRENCY_SYMBOL[model.currency || 'CNY']
  const modalities = parseModalities(model.modalities)

  /** 分区标题组件 */
  const SectionHeader = ({ icon, iconBg, iconColor, title, extra }: {
    icon: React.ReactNode; iconBg: string; iconColor: string; title: string; extra?: React.ReactNode
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {typeof icon === 'string' ? <span style={{ fontSize: 14 }}>{icon}</span> : <span style={{ fontSize: 14, color: iconColor }}>{icon}</span>}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  /** 分区容器 */
  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      {children}
    </div>
  )

  /** 字段行 */
  const FieldRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ width: 120, flexShrink: 0, color: '#8C8C8C', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#262626', fontSize: 13 }}>{value}</span>
    </div>
  )

  return (
    <div className="content-area">
      {/* 页面头部（全局統一規範：詳情頁紫色頂條 + 橙色返回 + 權限門控紫色編輯） */}
      <DetailPageHeader
        title="模型詳情"
        meta={model.name}
        onBack={handleBack}
        onEdit={() => navigate(`/ai-model-edit?id=${model.id}`)}
        menuKey="ai-model-list"
      />

      {/* 头部概览卡 */}
      <div style={{ padding: 20, background: 'linear-gradient(135deg, #F8FAFF, #EBF3FF)', borderRadius: 8, marginBottom: 16, border: '1px solid #D6E4FF' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#262626', marginBottom: 4 }}>{model.name}</div>
        {model.description && (
          <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.6, marginTop: 4 }}>{model.description}</div>
        )}
        <div style={{ marginTop: 12 }}>
          <CapabilityMatrix model={model} />
        </div>
      </div>

      {/* ═══ 分区 1：基础信息 ═══ */}
      <SectionCard>
        <SectionHeader icon={<AppstoreOutlined />} iconBg="#e6f7ff" iconColor="#1890ff" title="基础信息" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <FieldRow label="供應商" value={model.providerName || '-'} />
          <FieldRow label="模型標識" value={<span style={{ fontFamily: 'monospace' }}>{model.modelKey}</span>} />
          <FieldRow label="模型版本" value={model.version || '-'} />
          <FieldRow label="API 兼容" value={model.apiCompat ? <Tag color={API_COMPAT_LABEL[model.apiCompat]?.color}>{API_COMPAT_LABEL[model.apiCompat]?.label || model.apiCompat}</Tag> : '-'} />
          <FieldRow label="模型類型" value={model.type ? <Tag color={MODEL_TYPE_TAG[model.type]}>{MODEL_TYPE_LABEL[model.type]}</Tag> : '-'} />
          <FieldRow label="支持模態" value={<ModalityChips modalities={model.modalities} />} />
        </div>
      </SectionCard>

      {/* ═══ 分区 2：模型能力 ═══ */}
      <SectionCard>
        <SectionHeader
          icon={<EyeOutlined />} iconBg="#f9f0ff" iconColor="#722ED1" title="模型能力"
          extra={<span style={{ fontSize: 12, color: '#8C8C8C' }}>由模型供應商決定</span>}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
          {([
            { key: 'visionSupport', label: '视觉', color: '#722ED1', desc: '圖像輸入理解' },
            { key: 'functionCalling', label: '工具', color: '#1890FF', desc: '外部函數調用' },
            { key: 'jsonMode', label: 'JSON', color: '#13C2C2', desc: '結構化 JSON 輸出' },
            { key: 'streaming', label: '流式', color: '#52C41A', desc: 'SSE 流式響應' },
            { key: 'thinkingMode', label: '思考', color: '#E8720C', desc: '深度推理模式' },
          ] as Array<{ key: keyof Pick<AiModel, 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'>; label: string; color: string; desc: string }>).map(({ key, label, color, desc }) => (
            <div key={key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 8, textAlign: 'center',
              background: model[key] ? `${color}08` : '#FAFAFA',
              border: `1px solid ${model[key] ? color + '22' : '#F0F0F0'}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#595959' }}>{label}</div>
              <Tag color={model[key] ? 'success' : 'default'} style={{ margin: 0, fontSize: 11 }}>
                {model[key] ? '支持' : '不支持'}
              </Tag>
              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8, padding: '12px 16px', background: '#FAFAFA', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>模態支持</div>
          <div>當前支持：{modalities.length > 0 ? modalities.map((m) => MODALITY_TAG[m]?.label || m).join('、') : <span style={{ color: '#BFBFBF' }}>無</span>}</div>
        </div>
      </SectionCard>

      {/* ═══ 分区 3：价格信息 ═══ */}
      <SectionCard>
        <SectionHeader icon={<DollarOutlined />} iconBg="#f6ffed" iconColor="#52C41A" title="价格信息" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div style={{ padding: '14px 16px', borderRadius: 8, background: '#F6FFED', border: '1px solid #D9F7BE' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>输入单价</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#52C41A' }}>{sym}{model.inputPrice ?? '-'}</div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 8, background: '#FFF7E6', border: '1px solid #FFE7BA' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>输出单价</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#E8720C' }}>{sym}{model.outputPrice ?? '-'}</div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 8, background: '#E6FFFB', border: '1px solid #B5F5EC' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>缓存命中价</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#13C2C2' }}>
              {model.cachedInputPrice != null ? `${sym}${model.cachedInputPrice}` : '-'}
            </div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 8, background: '#FAFAFA', border: '1px solid #F0F0F0' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>计价币种</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#595959' }}>{model.currency || '-'}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>以上价格为每百万 tokens 的官方定价</div>
      </SectionCard>

      {/* ═══ 分区 4：运行参数 ═══ */}
      <SectionCard>
        <SectionHeader icon={<SettingOutlined />} iconBg="#fff7e6" iconColor="#fa8c16" title="运行参数" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
          <FieldRow label="上下文窗口" value={<span style={{ color: '#1890FF', fontWeight: 600 }}>{contextLengthText(model.contextWindow)}</span>} />
          <FieldRow label="最大輸出" value={contextLengthText(model.maxOutputTokens)} />
          <FieldRow label="並發限制" value={model.concurrencyLimit ? <span><GlobalOutlined style={{ marginRight: 4 }} />{model.concurrencyLimit.toLocaleString()} TPM</span> : '-'} />
        </div>
      </SectionCard>

      {/* ═══ 分区 5：状态与更新 ═══ */}
      <SectionCard>
        <SectionHeader icon={<PoweroffOutlined />} iconBg="#fff7e6" iconColor="#E8720C" title="状态与更新" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
          <FieldRow label="狀態" value={model.status === 1 ? <Tag color="success">啟用</Tag> : <Tag color="default">停用</Tag>} />
          <FieldRow label="最後更新人" value={model.updatedBy || '-'} />
          <FieldRow label="最後更新時間" value={model.updatedAt ? dayjs(model.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'} />
        </div>
      </SectionCard>
    </div>
  )
}
