/**
 * 模块卡片标题行（§C.3 全局统一风格）。
 *
 * <p>结构固定为「28×28 圆角色块图标 + 15px/600 标题 + 可选 Tag + 右侧延伸分隔线 + 可选灰字说明」，
 * 是新增/编辑/详情页每个模块卡片的第一行。
 *
 * <p>为什么提成共享组件：会议域原先在 4 个文件里各抄了一份同样的 JSX 与色值，
 * 改一次分隔线或配色要同步 4 处，历史上一改就漏一处（同一模块在不同页面配色不一致）。
 * 色值不再由调用方传十六进制，而是收敛成 §C.3 的四种语义 tone，避免随意引入调色板外的新色。
 */
import type { CSSProperties, ReactNode } from 'react'

/** §C.3 图标色块配色约定：底色 + 图标色成对出现，不接受调用方自填色值 */
const TONE_PALETTE = {
  /** 基础信息 / 选择类 */
  info: { bg: '#e6f7ff', color: '#1890ff' },
  /** 参数 / 策略 / 配置类 */
  warn: { bg: '#fff7e6', color: '#fa8c16' },
  /** 图片 / 成功类 */
  success: { bg: '#f6ffed', color: '#52c41a' },
  /** 高级 / 特殊类 */
  purple: { bg: '#f9f0ff', color: '#722ed1' },
} as const

export type CardTitleTone = keyof typeof TONE_PALETTE

interface Props {
  icon: ReactNode
  tone?: CardTitleTone
  title: ReactNode
  /** 标题右侧的可选标签（如「週期」「必填」） */
  tag?: ReactNode
  /** 分隔线右侧的灰字说明：写"这里的值留空会怎样"这类口径，而不是重复标题 */
  note?: ReactNode
}

const iconBoxStyle: CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export default function CardTitle({ icon, tone = 'info', title, tag, note }: Props) {
  const palette = TONE_PALETTE[tone]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ ...iconBoxStyle, background: palette.bg }}>
        <span style={{ fontSize: 14, color: palette.color }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {note && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{note}</span>}
    </div>
  )
}
