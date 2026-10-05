/**
 * AiModelList 展示常量與共用組件
 * 在列表頁 (index.tsx) 和詳情頁 (AiModelDetail.tsx) 之間共用
 */
import { Tag, Tooltip, Space } from 'antd'
import { EyeOutlined, ToolOutlined, CodeOutlined, ThunderboltOutlined, BulbOutlined } from '@ant-design/icons'
import { parseModalities, type AiModel, type ModelType, type Modality } from '../../api'

/* ────────────────── 展示常量 ────────────────── */

/** 模型類型標籤顏色 */
export const MODEL_TYPE_TAG: Record<ModelType, string> = {
  chat: 'processing',
  completion: 'blue',
  embedding: 'purple',
  token_count: 'default',
}

export const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  chat: '對話',
  completion: '文本生成',
  embedding: '向量嵌入',
  token_count: 'Token 計數',
}

/** 模态标签颜色 */
export const MODALITY_TAG: Record<Modality, { color: string; label: string }> = {
  text: { color: 'blue', label: '文本' },
  image: { color: 'purple', label: '图像' },
  audio: { color: 'cyan', label: '音频' },
  video: { color: 'magenta', label: '视频' },
}

/** API 兼容格式标签 */
export const API_COMPAT_LABEL: Record<string, { label: string; color: string }> = {
  openai: { label: 'OpenAI', color: 'green' },
  anthropic: { label: 'Anthropic', color: 'orange' },
  gemini: { label: 'Gemini', color: 'geekblue' },
}

/** 币种符号 */
export const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
}

/** 上下文長度格式化 */
export const contextLengthText = (n?: number) => {
  if (!n) return '-'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

/* ────────────────── 共用組件 ────────────────── */

/** 能力胶囊 */
export const CapabilityTag = ({ enabled, icon, label, color }: { enabled: boolean; icon: React.ReactNode; label: string; color: string }) => (
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
export const CapabilityMatrix = ({ model }: { model: AiModel }) => (
  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 0 }}>
    <CapabilityTag enabled={!!model.visionSupport} icon={<EyeOutlined />} label="视觉" color="#722ED1" />
    <CapabilityTag enabled={!!model.functionCalling} icon={<ToolOutlined />} label="工具" color="#1890FF" />
    <CapabilityTag enabled={!!model.jsonMode} icon={<CodeOutlined />} label="JSON" color="#13C2C2" />
    <CapabilityTag enabled={!!model.streaming} icon={<ThunderboltOutlined />} label="流式" color="#52C41A" />
    <CapabilityTag enabled={!!model.thinkingMode} icon={<BulbOutlined />} label="思考" color="#E8720C" />
  </div>
)

/** 模态胶囊组 */
export const ModalityChips = ({ modalities }: { modalities?: string }) => {
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
