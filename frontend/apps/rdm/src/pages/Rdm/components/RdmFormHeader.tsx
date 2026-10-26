/**
 * RDM 表单页统一头部（AGENTS.md §C.2 / §C.6 的唯一实现）
 *
 * 为什么抽成组件：这些页面的头部规范是固定的四件套（3px 品牌橙渐变流动条 +
 * 圆角 12 白卡片 + 橙色实心返回钮 + #1890ff 标题）。原先 7 个页面各写一遍内联样式，
 * 结果就是同一条渐变条出现橙/绿/紫/青/蓝五种颜色、圆角 8 与 12 混用、
 * 标题色 #262626 与 #1890ff 混用 —— 收敛到一个组件后，规范只有一份，改一次全体生效。
 *
 * 约束（不得在本组件放宽）：
 * - 头部右侧只允许放只读信息或筛选控件，**禁止**放保存/提交按钮（§9.1：操作统一在 .form-footer）。
 * - 色值全部取自 §A.1 已登记令牌，禁止新增色。
 */
import type { ReactNode } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

interface RdmFormHeaderProps {
  /** 页面标题，如「新增需求」 */
  title: ReactNode
  /** 返回回调 */
  onBack: () => void
  /** 返回按钮文案（默认「返回」；从上级对象回来时可写「返回需求」） */
  backText?: string
  /** 标题右侧的只读标记（如状态标签） */
  badge?: ReactNode
  /** 标题下方说明行 */
  meta?: ReactNode
  /** 头部右侧区域：只放筛选/只读信息，不放提交类按钮 */
  right?: ReactNode
}

/** §A.1 品牌橙系（渐变条第三色固定 #FFB347） */
const GRADIENT = 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)'

export default function RdmFormHeader({ title, onBack, backText = '返回', badge, meta, right }: RdmFormHeaderProps) {
  return (
    <div style={{
      position: 'relative',
      background: '#fff',
      marginBottom: 16,
      borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* 橙色渐变顶条（3px，全局 keyframes，禁止组件内另定义） */}
      <div style={{
        height: 3,
        background: GRADIENT,
        backgroundSize: '200% 100%',
        animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        animation: 'headerFadeSlideIn 0.5s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#E8720C',
              borderColor: '#E8720C',
              borderRadius: 8,
              height: 36,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              flexShrink: 0,
            }}
          >
            {backText}
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
              {badge}
            </div>
            {meta && <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{meta}</div>}
          </div>
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  )
}
