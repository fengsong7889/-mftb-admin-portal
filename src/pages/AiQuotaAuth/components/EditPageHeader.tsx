/**
 * EditPageHeader — 編輯頁頂部標題欄（全局統一：橙色頂條 + 橙色返回按鈕）
 * 結構：漸變橙色頂條 + 返回按鈕 | 分隔線 | 藍色標題
 * 用於所有 Edit 頁（DeptQuotaEdit、EmpQuotaEdit、DeptAuthGroupEdit）。
 */
import type { ReactNode } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface EditPageHeaderProps {
  /** 頁面標題（可傳入 i18n key 或 ReactNode） */
  title: ReactNode
  /** 返回按鈕點擊回調 */
  onBack: () => void
}

export default function EditPageHeader({ title, onBack }: EditPageHeaderProps) {
  const { t } = useTranslation()
  return (
    <div style={{
      position: 'relative', background: '#fff', marginBottom: 16,
      borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <div style={{
        height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
        backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
              height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {title}
          </h2>
        </div>
      </div>
    </div>
  )
}
