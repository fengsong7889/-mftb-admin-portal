/**
 * PhoneMockup - 手機預覽框架組件
 * 在 HintVerify 和 HotSearchVerify 等頁面共用
 */
import { WifiOutlined } from '@ant-design/icons'

interface PhoneMockupProps {
  children: React.ReactNode
}

const PhoneMockup = ({ children }: PhoneMockupProps) => (
  <div style={{
    width: 375, height: 720, flexShrink: 0,
    background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
    borderRadius: 40, padding: '60px 20px 30px',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
    border: '10px solid #1a1a1a', position: 'relative',
  }}>
    {/* 頂部狀態欄 */}
    <div style={{
      position: 'absolute', top: 16, left: 0, right: 0,
      padding: '0 24px', display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', fontSize: 12, color: '#333', fontWeight: 600,
    }}>
      <span>9:41</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <WifiOutlined style={{ fontSize: 14 }} />
        <span style={{ fontSize: 11 }}>📶</span>
        <span style={{ fontSize: 11 }}>🔋</span>
      </div>
    </div>
    {/* 屏幕內容區 */}
    <div style={{
      background: '#fff', borderRadius: 24, padding: '16px 16px 24px',
      height: 'calc(100% - 20px)', overflow: 'hidden',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
    }}>
      {children}
    </div>
  </div>
)

export default PhoneMockup
