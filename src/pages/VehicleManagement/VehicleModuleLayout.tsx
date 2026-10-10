/**
 * 用车管理 — 模块共享 UI 原子（页头 / 模块卡片 / 最后更新尾栏 / 演示提示 / 标识标签）
 *
 * 为什么单独成文件：四个页面模块（车辆档案、我的用车、用车办理、用车台账）的页头、
 * 卡片、审计尾栏结构完全一致。此前 AssetTransfer 与 AssetClaim 各写一套（内联 vs
 * className）导致「改领用样式调拨跟着变」的隐式耦合，这里统一走一份内联实现，
 * 并严格对齐 frontend-ui-design-spec §A/§C/§D 的令牌。
 */
import type { ReactNode } from 'react'
import { Button, Tag } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { TRIP_FLAG_COLOR, TRIP_FLAG_LABEL } from './vehicleMeta'
import type { TripFlag } from './vehicleTypes'

/** 模块卡片图标语义配色（§C.3 约定） */
export type ToneKey = 'info' | 'config' | 'success' | 'special'

const TONE: Record<ToneKey, { bg: string; color: string }> = {
  info: { bg: '#e6f7ff', color: '#1890ff' },
  config: { bg: '#fff7e6', color: '#fa8c16' },
  success: { bg: '#f6ffed', color: '#52c41a' },
  special: { bg: '#f9f0ff', color: '#722ed1' },
}

/** 表单页头（新增/编辑）：橙色渐变顶条 + 返回 + 标题；操作按钮一律放页面底部 */
export function VehicleFormPageHeader({ title, onBack, meta }: { title: string; onBack: () => void; meta?: ReactNode }) {
  return (
    <div style={{
      position: 'relative', background: '#fff', marginBottom: 16,
      borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
        backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
              padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            返回
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
            {meta && <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{meta}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 模块卡片：白底无边框 + 图标色块标题 + 右侧延伸分隔线（禁止 antd Card 彩色标题头） */
export function VehicleSection({ icon, tone = 'info', title, tag, hint, children }: {
  icon: ReactNode
  tone?: ToneKey
  title: string
  tag?: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  const c = TONE[tone]
  return (
    <div style={{
      borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: c.bg, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 14, color: c.color, display: 'flex' }}>{icon}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
        {tag}
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        {hint && <span style={{ fontSize: 12, color: '#8C8C8C', flexShrink: 0 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** 详情页尾栏：只展示最后更新人与时间（§D.4，禁止完整操作日志表格堆在详情底部） */
export function VehicleUpdateFooter({ updatedBy, updatedAt }: { updatedBy: string; updatedAt: string }) {
  return (
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'flex-end', gap: 24,
    }}>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>
        最後更新人：<span style={{ color: '#595959' }}>{updatedBy}</span>
      </span>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>
        最後更新時間：<span style={{ color: '#595959' }}>{updatedAt}</span>
      </span>
    </div>
  )
}

/** 行程异常标识（与主状态分离，可叠加） */
export function VehicleFlagTags({ flags }: { flags?: TripFlag[] }) {
  if (!flags?.length) return <span style={{ color: '#8C8C8C', fontSize: 12 }}>—</span>
  return (
    <>
      {flags.map(f => (
        <Tag key={f} color={TRIP_FLAG_COLOR[f] ?? 'default'} style={{ marginRight: 4 }}>{TRIP_FLAG_LABEL[f] ?? f}</Tag>
      ))}
    </>
  )
}

/** 只读信息块（详情态复用表单卡片，避免再写一套样式） */
export function VehicleFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#262626' }}>{children}</div>
    </div>
  )
}
