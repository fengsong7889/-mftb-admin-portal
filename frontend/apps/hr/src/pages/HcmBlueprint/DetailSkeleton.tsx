/**
 * 詳情頁骨架（階段 B 預覽）
 *
 * 按 §D 詳情頁規範：DetailPageHeader 組件 + 白色模塊卡片（Descriptions）+ 底部「操作記錄」收尾，
 * 詳情模式不渲染任何保存/提交按鈕。示範鍵值取自 blueprint.ts。
 */
import { Descriptions, Tag } from 'antd'
import {
  IdcardOutlined,
  AuditOutlined,
  BankOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import type { HcmDemo, HcmSystemBlueprint } from './blueprint'

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed',
  borderRadius: 8,
  background: '#fff',
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 模塊卡標題行：28×28 色塊圖標 + 15px/600 標題 + 右側延伸分隔線（§C.3） */
function CardTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: '#e6f7ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14, color: '#1890ff', display: 'inline-flex' }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra}
    </div>
  )
}

export default function DetailSkeleton({ blueprint, demo }: { blueprint: HcmSystemBlueprint; demo: HcmDemo }) {
  return (
    <div className="content-area">
      <DetailPageHeader
        title={`${demo.entity}詳情`}
        tags={<Tag color="orange">預覽數據</Tag>}
        meta={<>{demo.detailPairs[0]?.value} · 最後更新人 系統管理員 · 2026-10-23 18:20</>}
        onBack={() => { /* 階段 B 骨架：由外層切回列表 */ }}
      />

      <div style={cardStyle}>
        <CardTitle icon={<IdcardOutlined />} title="基本信息" />
        <Descriptions column={3} size="middle">
          {demo.detailPairs.map((pair) => (
            <Descriptions.Item key={pair.label} label={pair.label}>{pair.value}</Descriptions.Item>
          ))}
        </Descriptions>
      </div>

      <div style={cardStyle}>
        <CardTitle
          icon={<BankOutlined />}
          title="歸屬與權限"
          extra={<span style={{ fontSize: 12, color: '#8c8c8c' }}>系統 {blueprint.code} · 寫入方 {blueprint.tablePrefix}</span>}
        />
        <Descriptions column={3} size="middle">
          <Descriptions.Item label="所屬系統">{blueprint.name}</Descriptions.Item>
          <Descriptions.Item label="可見範圍">按僱傭關係 + 法人過濾</Descriptions.Item>
          <Descriptions.Item label="字段權限">敏感字段按角色脫敏</Descriptions.Item>
          <Descriptions.Item label="審批關聯">
            <Tag>OA 審批實例</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="業務執行狀態">獨立於審批狀態</Descriptions.Item>
          <Descriptions.Item label="審計">不可變審計，保留發生時快照</Descriptions.Item>
        </Descriptions>
      </div>

      {/* §D.4：詳情頁以「最後更新」收尾，禁止完整操作日誌表格 */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          <AuditOutlined style={{ marginRight: 6 }} />
          最後更新人：<span style={{ color: '#595959' }}>系統管理員</span>
        </span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          最後更新時間：<span style={{ color: '#595959' }}>2026-10-23 18:20:11</span>
        </span>
      </div>
    </div>
  )
}
