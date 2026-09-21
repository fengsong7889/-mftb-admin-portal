/**
 * 員工資產管理詳情頁
 *
 * 從領用管理列表點擊「管理」進入，展示某位員工的領用資產全貌：
 *  - 頂部：DetailPageHeader（紫色漸變頂條 + 返回按鈕 + 員工姓名）
 *  - 員工信息卡：姓名 / 工號 / 部門 / 在用資產數 / 已歸還數
 *  - Tab 1「在用資產」：該員工當前持有的資產列表，支持「詳情」跳轉資產台賬，支持「繼續領用」
 *  - Tab 2「已歸還資產」：歷史記錄，僅查看
 *
 * 注意：此頁面僅做領用操作，歸還操作統一在「歸還管理」菜單處理
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
  /** 初始激活的標籤（從 URL tab 參數恢復） */
  initialTab?: ClaimStatus
  onBack: () => void
  onAddClaim: () => void
  onView: (record: ClaimRow) => void
  onQuery?: (query: ClaimQuery) => void
}

/* ---- 狀態標籤 ---- */
const STATUS_TABS: { key: ClaimStatus; label: string }[] = [
  { key: CLAIM_STATUS.PENDING, label: '待簽領用' },
  { key: CLAIM_STATUS.CLAIMED, label: '在用資產' },
  { key: CLAIM_STATUS.RETURNED, label: '已歸還資產' },
  { key: CLAIM_STATUS.CANCELLED, label: '已取消' },
  { key: CLAIM_STATUS.TRANSFERRED, label: 'transfer.transferred' },
]

export default function EmployeeAssetDetail({ employeeId, employee, stats, data, loading, error, canAdd, initialTab, onBack, onAddClaim, onView, onQuery }: Props) {
  const { t } = useTranslation()
  const statusTabs = STATUS_TABS.map(tab => tab.key === CLAIM_STATUS.TRANSFERRED ? { ...tab, label: t(tab.label) } : tab)
  const [query, setQuery] = useState<ClaimQuery>({ page: 1, size: 10, status: initialTab ?? CLAIM_STATUS.CLAIMED })
  const empName = employee?.empName ?? '員工信息待加載'
  const empNo = employee?.empNo ?? '—'
  const department = employee?.department ?? '—'

  useEffect(() => { onQuery?.(query) }, [query, onQuery])

  /* ----- 員工信息卡 ----- */
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
        <Tabs activeKey={query.status} items={statusTabs} onChange={(status) => setQuery({ page: 1, size: query.size, status: status as ClaimStatus })} />
        <ClaimRecordTable data={error ? undefined : data} query={query} loading={loading} pageKey="employee-claim-records" onQuery={setQuery} onView={onView} />
      </ClaimSection>
    </div>
  )
}
