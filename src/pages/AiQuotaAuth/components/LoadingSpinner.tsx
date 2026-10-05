/**
 * LoadingSpinner — 頁面加載中的居中 Spinner（全局統一）
 * 用於所有 Edit / Detail 頁的初始加載狀態。
 */
import { Spin } from 'antd'

export default function LoadingSpinner() {
  return (
    <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Spin size="large" />
    </div>
  )
}
