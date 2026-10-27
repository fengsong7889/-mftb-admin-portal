/**
 * 组织编制模块的页面骨架复用件。
 *
 * 为什么抽出来：法人/组织/职务族/职位/岗位五套表单页的头部、色块标题行完全一致，
 * 复制五份会让「换一个规范」变成改五处（历史上就出现过两套头部并存）。
 * 这里只放纯展示件，不放业务逻辑。
 */
import type { CSSProperties, ReactNode } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

export const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed',
  borderRadius: 8,
  background: '#fff',
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

export const grid3: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 16,
}

/** 模块卡标题行：28×28 色块 + 15px/600 标题 + 右侧延伸分隔线（§C.3） */
export function CardTitle({ icon, title, tone = 'blue', extra }: {
  icon: ReactNode
  title: string
  tone?: 'blue' | 'orange'
  extra?: ReactNode
}) {
  const palette = tone === 'blue' ? { bg: '#e6f7ff', color: '#1890ff' } : { bg: '#fff7e6', color: '#fa8c16' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, color: palette.color, display: 'inline-flex' }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra}
    </div>
  )
}

/** 表单页头部：橙色渐变顶条 + 橙色返回按钮 + 蓝色标题（§C.2） */
export function FormHeader({ title, extra, onBack }: { title: string; extra?: ReactNode; onBack: () => void }) {
  return (
    <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
        backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
              padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            返回
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
        </div>
        {extra}
      </div>
    </div>
  )
}

/** 详情页底部「最后更新」条（§D.4：只展示最后更新人与时间，不给完整操作日志） */
export function UpdatedFooter({ by, at }: { by?: string; at?: string }) {
  return (
    <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最后更新人：<span style={{ color: '#595959' }}>{by || '-'}</span></span>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最后更新时间：<span style={{ color: '#595959' }}>{at || '-'}</span></span>
    </div>
  )
}

/** 把毫秒时间戳（后端 Jackson 全局配置）格式化为本地时间；空值返回空串 */
export function formatTimestamp(value?: number | null): string {
  return value ? new Date(Number(value)).toLocaleString() : ''
}
