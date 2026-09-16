/**
 * 员工资产管理详情页
 *
 * 从领用管理列表点击「管理」进入，展示某位员工的领用资产全貌：
 *  - 顶部：DetailPageHeader（紫色渐变顶条 + 返回按钮 + 员工姓名）
 *  - 员工信息卡：姓名 / 工号 / 部门 / 在用资产数 / 已归还数
 *  - Tab 1「在用资产」：该员工当前持有的资产列表，支持「详情」跳转资产台账，支持「继续领用」
 *  - Tab 2「已归还资产」：历史记录，仅查看
 *
 * 注意：此页面仅做领用操作，归还操作统一在「归还管理」菜单处理
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Tabs } from 'antd'
import { PlusOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import ClaimStats from './ClaimStats'
import ClaimRecordTable from './ClaimRecordTable'
import { ClaimSection } from './ClaimLayout'
import { CLAIM_STATUS, type ClaimEmployee, type ClaimPage, type ClaimQuery, type ClaimRow, type ClaimStatsData, type ClaimStatus } from './claimViewTypes'

interface Props {
  employeeId: number
  employee?: ClaimEmployee
  stats?: ClaimStatsData
  data?: ClaimPage<ClaimRow>
  loading?: boolean
  error?: string
  canAdd?: boolean
  onBack: () => void
  onAddClaim: () => void
  onView: (record: ClaimRow) => void
  onQuery?: (query: ClaimQuery) => void
}

/* ---- 状态标签 ---- */
const STATUS_TABS: { key: ClaimStatus; label: string }[] = [
  { key: CLAIM_STATUS.PENDING, label: '待签领用' },
  { key: CLAIM_STATUS.CLAIMED, label: '在用资产' },
  { key: CLAIM_STATUS.RETURNED, label: '已归还资产' },
  { key: CLAIM_STATUS.CANCELLED, label: '已取消' },
]

export default function EmployeeAssetDetail({ employeeId, employee, stats, data, loading, error, canAdd, onBack, onAddClaim, onView, onQuery }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState<ClaimQuery>({ page: 1, size: 10, status: CLAIM_STATUS.CLAIMED })
  const empName = employee?.empName ?? '员工信息待加载'
  const empNo = employee?.empNo ?? '—'
  const department = employee?.department ?? '—'

  useEffect(() => { onQuery?.(query) }, [query, onQuery])

  /* ----- 员工信息卡 ----- */
  const renderInfoCard = () => (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* 头像 */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #E8720C, #FFB347)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {empName.charAt(0)}
        </div>
        {/* 基本信息 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#262626', marginBottom: 4 }}>
            {empName}
            <span style={{ fontSize: 13, fontWeight: 400, color: '#8c8c8c', marginLeft: 8 }}>
              {empNo}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: '#595959' }}>
            <span><TeamOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />{department || '—'}</span>
          </div>
        </div>
        <span className="claim-muted">员工 ID：{employeeId}</span>
      </div>
    </div>
  )

  return (
    <div>
      {/* ====== 顶部标题栏 ====== */}
      <DetailPageHeader
        title={t('asset.claimAssetsTitle', { name: empName })}
        meta={`${empNo} · ${department}`}
        onBack={onBack}
      />

      {renderInfoCard()}
      <ClaimStats personal data={error ? undefined : stats} scopeKey={String(employeeId)} />
      {error && <Alert type="error" showIcon message={error} className="claim-notice" />}
      <ClaimSection title="员工领用记录" icon={<UserOutlined />}>
        <div className="claim-table-tools">
          <span className="claim-muted">当前部门仅用于身份展示；每次领用保留当时部门。归还请在归还管理办理。</span>
          {canAdd && <Button type="primary" icon={<PlusOutlined />} onClick={onAddClaim}>{t('asset.continueClaim')}</Button>}
        </div>
        <Tabs activeKey={query.status} items={STATUS_TABS} onChange={(status) => setQuery({ page: 1, size: query.size, status: status as ClaimStatus })} />
        <ClaimRecordTable data={error ? undefined : data} query={query} loading={loading} pageKey="employee-claim-records" onQuery={setQuery} onView={onView} />
      </ClaimSection>
    </div>
  )
}
