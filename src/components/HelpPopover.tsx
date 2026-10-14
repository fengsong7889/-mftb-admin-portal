import type { ReactNode } from 'react'
import { Popover } from 'antd'
import { QuestionCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'

/**
 * 全站统一的「字段/规则说明」问号（或信息图标）组件。
 *
 * 设计动机：历史上大量说明直接用 antd `Tooltip` 承载多句长文本，白底无层次、
 * 鼠标一移开即消失，阅读体验很差。本组件统一为「点击问号 → 结构化 Popover」：
 * 有标题、有分区、有语义配色、可停留滚动，替代散落的 `<Tooltip><QuestionCircleOutlined/></Tooltip>`。
 *
 * 用法：
 * - 简单释义：`<HelpPopover title="API 兼容" content="一句话到一段话的说明文字" ariaLabel="..." />`
 * - 结构化说明：`content` 传 `HelpSection[]`，按 tone 渲染带色分区卡
 * - 完全自定义：`content` 传任意 JSX
 * - 自定义触发节点：传 `children`（如把一个 Tag 变成说明入口）
 *
 * 规范见 AGENTS.md「问号/提示说明统一用 HelpPopover」。
 */

/** 分区语义色调，取值均来自设计令牌，禁止随意新增色值 */
export type HelpTone = 'neutral' | 'info' | 'warn' | 'danger' | 'success'

export interface HelpSection {
  /** 分区小标题（可选），以对应 tone 的强调色加粗显示 */
  label?: ReactNode
  /** 分区正文：字符串自动按行/换行舒适排版，也可传自定义 JSX */
  body: ReactNode
  /** 语义色调，决定底色与强调色，默认 neutral */
  tone?: HelpTone
}

interface HelpPopoverProps {
  /** 浮层标题（建议一句话点题） */
  title: ReactNode
  /** 说明内容：字符串 / HelpSection[] / 任意 JSX */
  content: string | HelpSection[] | ReactNode
  /** 触发图标的无障碍标签（必填，供读屏与测试定位） */
  ariaLabel: string
  /** 触发图标类型，默认问号 */
  icon?: 'question' | 'info'
  /** 浮层位置，默认 top */
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'right' | 'left'
  /** 浮层正文宽度，默认 360 */
  width?: number
  /** 自定义触发节点；传入后替代默认问号图标（ariaLabel 仍会加到该节点上） */
  children?: ReactNode
}

/** tone → 底色 / 描边 / 强调色，全部取自 §A.1 设计令牌 */
const TONE_STYLE: Record<HelpTone, { background: string; border: string; accent: string }> = {
  neutral: { background: '#FAFAFA', border: '#F0F0F0', accent: '#595959' },
  info: { background: '#E6F7FF', border: '#91D5FF', accent: '#1890FF' },
  warn: { background: '#FFF7E6', border: '#FFE7D1', accent: '#E8720C' },
  danger: { background: '#FFF2F0', border: '#FFCCC7', accent: '#FF4D4F' },
  success: { background: '#F6FFED', border: '#B7EB8F', accent: '#52C41A' },
}

/** 判断是否为 HelpSection[]（区分于任意 JSX 与字符串） */
function isSections(content: unknown): content is HelpSection[] {
  return Array.isArray(content) && content.every(item => item && typeof item === 'object' && 'body' in (item as object))
}

function SectionCard({ section }: { section: HelpSection }) {
  const tone = TONE_STYLE[section.tone ?? 'neutral']
  return (
    <div style={{ background: tone.background, border: `1px solid ${tone.border}`, borderRadius: 6, padding: '8px 12px' }}>
      {section.label != null && (
        <div style={{ fontSize: 13, fontWeight: 600, color: tone.accent, marginBottom: section.body ? 4 : 0 }}>{section.label}</div>
      )}
      {typeof section.body === 'string'
        ? <div style={{ fontSize: 13, lineHeight: 1.7, color: '#595959', whiteSpace: 'pre-line' }}>{section.body}</div>
        : section.body}
    </div>
  )
}

export default function HelpPopover({
  title, content, ariaLabel, icon = 'question', placement = 'top', width = 360, children,
}: HelpPopoverProps) {
  const body = isSections(content) ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {content.map((section, i) => <SectionCard key={i} section={section} />)}
    </div>
  ) : typeof content === 'string' ? (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: '#595959', whiteSpace: 'pre-line' }}>{content}</div>
  ) : (
    content
  )

  const TriggerIcon = icon === 'info' ? InfoCircleOutlined : QuestionCircleOutlined

  return (
    <Popover
      trigger="click"
      placement={placement}
      overlayStyle={{ maxWidth: width + 40 }}
      title={<span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{title}</span>}
      content={<div style={{ width }}>{body}</div>}
    >
      {children ?? (
        <TriggerIcon aria-label={ariaLabel} style={{ color: '#8C8C8C', cursor: 'pointer', marginLeft: 4 }} />
      )}
    </Popover>
  )
}
