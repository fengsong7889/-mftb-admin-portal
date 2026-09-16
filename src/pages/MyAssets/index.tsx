/**
 * 我的资产（员工个人入口）
 *
 * 员工查看本人领用的资产列表，支持签署待签记录。
 * 当前为界面验收阶段，真实数据待第三阶段接通。
 */
import { Alert, Empty } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import { ClaimSection } from '../AssetManagement/AssetClaim/ClaimLayout'
import '../AssetManagement/AssetClaim/index.css'

export default function MyAssets() {
  const { user } = useAuth()

  return (
    <div className="content-area claim-module">
      <Alert
        type="info"
        showIcon
        message="我的资产 · 个人入口"
        description={`当前登录：${user?.name ?? '—'}（${user?.empId ?? '—'}）。此处仅展示您本人领用的资产，真实数据待第三阶段接通。`}
        style={{ marginBottom: 16 }}
      />
      <ClaimSection title="我的领用记录" icon={<AppstoreOutlined />}>
        <Empty description="暂无领用记录（界面验收阶段）" />
      </ClaimSection>
    </div>
  )
}
