/**
 * DetailPageHeader — 詳情頁頂部標題欄（全局統一規範）
 *
 * 結構：紫色漸變頂條（流動動畫）+ 內容行（橙色返回按鈕 | 分隔線 | 藍色標題 + 狀態標籤 | 右側操作區）
 * 編輯按鈕：紫色 primary（呼應詳情頁紫色頂條），並按菜單權限門控——
 *   - admin 自動放行；
 *   - 非 admin 需持有 `${menuKey}:edit` 授權（hasPermission），無編輯權限則不渲染編輯按鈕；
 *   - 未傳 onEdit（無編輯頁）時也不渲染。
 *
 * 適用範圍：全系統所有由列表「詳情」按鈕進入的詳情頁。
 */
import type { ReactNode } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

interface DetailPageHeaderProps {
  /** 詳情頁標題（固定文案，不取數據名稱） */
  title: ReactNode
  /** 標題右側狀態標籤（如 啟用/停用 Tag） */
  tags?: ReactNode
  /** 標題下方 meta 行（如 名稱 · 最後更新人 · 時間） */
  meta?: ReactNode
  /** 返回按鈕點擊 */
  onBack: () => void
  /** 編輯按鈕點擊；不傳則不展示編輯按鈕 */
  onEdit?: () => void
  /** 編輯權限對應的菜單 key（ROUTE_MENU_KEY_MAP）；傳入後按 `${menuKey}:edit` 門控編輯按鈕 */
  menuKey?: string
  /** 右側自定義操作區；傳入則完全替代默認的紫色編輯按鈕 */
  extra?: ReactNode
}

export default function DetailPageHeader({ title, tags, meta, onBack, onEdit, menuKey, extra }: DetailPageHeaderProps) {
  const { hasPermission } = useAuth()
  const canEdit = !!onEdit && (!menuKey || hasPermission(`${menuKey}:edit`))

  return (
    <div style={{
      position: 'relative', background: '#fff', marginBottom: 16,
      borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      {/* 頂部漸變裝飾線（詳情頁全局規範：紫色） */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #722ED1, #B37FEB, #D3ADF7, #B37FEB, #722ED1)',
        backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            返回
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
              {tags}
            </div>
            {meta && <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{meta}</div>}
          </div>
        </div>
        {extra ?? (canEdit && (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={onEdit}
            style={{
              backgroundColor: '#722ED1', borderColor: '#722ED1', borderRadius: 8,
              height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(114,46,209,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            編輯
          </Button>
        ))}
      </div>
    </div>
  )
}
