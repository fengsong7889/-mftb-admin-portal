/**
 * 領用管理（物資管理 - 領用管理）
 *
 * URL 深鏈：
 *   /asset-claim                          → 員工維度匯總列表
 *   /asset-claim/add?employeeId=...&assetId=... → 領用登記（查詢參數僅預填）
 *   /asset-claim/detail?employeeId=...    → 員工資產詳情
 *   /asset-claim/record?id=...            → 只讀領用及憑證詳情
 *
 * 階段三：已接通真實後端 API。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Modal, message } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import { parseClaimId, type ClaimAssetOption, type ClaimEmployee, type ClaimPage, type ClaimQuery, type ClaimRegistration, type ClaimRow, type ClaimSummaryData } from './claimViewTypes'
import ClaimList from './ClaimList'
import ClaimForm from './ClaimForm'
import EmployeeAssetDetail from './EmployeeAssetDetail'
import ClaimRecordDetail from './ClaimRecordDetail'
import { fetchEmployeeSummary, fetchClaimList, fetchClaimDetail, fetchClaimStats, fetchClaimEmployeeOptions, registerClaim, cancelClaim, resendClaimSignNotification } from '../../../api/eamClaim'
import { fetchDepartments } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import { fetchAssetList, fetchAssetDetail } from '../../../api/asset'
import { CLAIM_STATUS, type ClaimStatsData, type ClaimStatus } from './claimViewTypes'
import './index.css'

type View = 'list' | 'add' | 'detail' | 'record'

function useView(): [View, URLSearchParams] {
  const [params] = useSearchParams()
  const path = window.location.hash.replace(/^#/, '').split('?')[0]
  if (path.endsWith('/add')) return ['add', params]
  if (path.endsWith('/detail')) return ['detail', params]
  if (path.endsWith('/record')) return ['record', params]
  return ['list', params]
}

export default function AssetClaim() {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const [view, params] = useView()

  const canAdd = hasPermission('asset-claim:edit') || user?.role === 'admin'
  const canProxy = user?.role === 'admin' || (user?.functionRoleCodes?.includes('admin') ?? false)

  /* ----- 數據狀態 ----- */
  const [summaryData, setSummaryData] = useState<ClaimSummaryData | undefined>()
  const [detailData, setDetailData] = useState<ClaimPage<ClaimRow> | undefined>()
  const [detailEmployee, setDetailEmployee] = useState<ClaimEmployee | undefined>()
  const [detailStats, setDetailStats] = useState<ClaimStatsData | undefined>()
  const [recordData, setRecordData] = useState<ClaimRow | undefined>()
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  // 領用登記表單數據源：可領用閑置資產 / 在職員工
  //（此前父組件未提供 onAssetQuery/onEmployeeQuery/assets/employees，導致 ClaimForm 三個下拉永久 disabled — BUG-01）
  const [assetPage, setAssetPage] = useState<ClaimPage<ClaimAssetOption> | undefined>()
  const [employeePage, setEmployeePage] = useState<ClaimPage<ClaimEmployee> | undefined>()
  const [initialAsset, setInitialAsset] = useState<ClaimAssetOption | undefined>()
  const [initialEmployee, setInitialEmployee] = useState<ClaimEmployee | undefined>()

  /* ----- 加載部門列表 ----- */
  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => {})
  }, [])

  /* ----- 匯總列表查詢 ----- */
  const handleQuerySummary = useCallback(async (query: ClaimQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchEmployeeSummary(query)
      setSummaryData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 員工詳情查詢 ----- */
  const handleQueryDetail = useCallback(async (empId: number, query: ClaimQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchClaimList({ ...query, employeeId: empId })
      setDetailData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 領用記錄詳情查詢 ----- */
  const handleQueryRecord = useCallback(async (claimId: number) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchClaimDetail(claimId)
      setRecordData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 可領用閑置資產查詢（供領用登記表單「資產編號」下拉；僅 status=idle） ----- */
  const handleAssetQuery = useCallback(async (query: ClaimQuery) => {
    try {
      const res = await fetchAssetList({ page: query.page, size: query.size, keyword: query.keyword, status: 'idle' })
      setAssetPage({
        total: res.total,
        records: res.records || [],
      })
    } catch {
      setAssetPage({ records: [], total: 0 })
    }
  }, [])

  /* ----- 在職員工查詢（供領用登記表單「領用人」下拉；走領用模塊專用接口，免員工管理權限，支持選擇本人登記） ----- */
  const handleEmployeeQuery = useCallback(async (query: ClaimQuery) => {
    try {
      setEmployeePage(await fetchClaimEmployeeOptions(query.keyword))
    } catch {
      setEmployeePage({ records: [], total: 0 })
    }
  }, [])

  const goList = useCallback(() => navigate('/asset-claim'), [navigate])
  const goDetail = useCallback((employeeId: number) => navigate(`/asset-claim/detail?employeeId=${employeeId}`), [navigate])
  const goAdd = useCallback((fromEmployeeId?: number, fromAssetId?: number) => {
    const sp = new URLSearchParams()
    if (fromEmployeeId) sp.set('employeeId', String(fromEmployeeId))
    if (fromAssetId) sp.set('assetId', String(fromAssetId))
    navigate(`/asset-claim/add?${sp.toString()}`)
  }, [navigate])
  const goRecord = useCallback((id: number, tab?: ClaimStatus) => {
    const sp = new URLSearchParams()
    sp.set('id', String(id))
    if (tab) sp.set('tab', tab)
    navigate(`/asset-claim/record?${sp.toString()}`)
  }, [navigate])

  const employeeId = useMemo(() => {
    const raw = params.get('employeeId')
    return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined
  }, [params])

  /* ----- 穩定的 onQuery 回調（避免子組件 useEffect 因引用變化重複觸發） ----- */
  const onQueryDetail = useCallback((q: ClaimQuery) => {
    if (employeeId != null) handleQueryDetail(employeeId, q)
  }, [employeeId, handleQueryDetail])

  const recordId = useMemo(() => parseClaimId(params.get('id')), [params])
  const recordTab = useMemo(() => {
    const raw = params.get('tab')
    const validTabs = Object.values(CLAIM_STATUS) as string[]
    return raw && validTabs.includes(raw) ? raw as ClaimStatus : undefined
  }, [params])

  /* ----- 自动加载 ----- */
  useEffect(() => {
    if (view === 'detail' && employeeId != null) {
      // 註：列表數據由 EmployeeAssetDetail 子組件的 useEffect + onQueryDetail 首次觸發，避免重複請求
      // 加載員工基本信息（供詳情頁頭部展示；走領用模塊專用接口，免員工管理權限）
      fetchClaimEmployeeOptions(undefined, employeeId).then((res) => {
        const emp = res.records[0]
        if (emp) setDetailEmployee(emp)
      }).catch(() => {})
      // 加載個人統計
      fetchClaimStats({ employeeId }).then(setDetailStats).catch(() => {})
    }
    if (view === 'record' && recordId != null) {
      handleQueryRecord(recordId)
    }
    // 離開 detail 視圖時清理緩存
    if (view !== 'detail') {
      setDetailEmployee(undefined)
      setDetailStats(undefined)
    }
  }, [view, employeeId, recordId, handleQueryDetail, handleQueryRecord])

  const assetIdParam = useMemo(() => parseClaimId(params.get('assetId')), [params])

  /* ----- 領用登記深鏈預填：?assetId= 帶入資產、?employeeId= 帶入領用人 ----- */
  useEffect(() => {
    if (view !== 'add') return
    if (assetIdParam != null) {
      fetchAssetDetail(assetIdParam).then(setInitialAsset).catch(() => {})
    }
    if (employeeId != null) {
      fetchClaimEmployeeOptions(undefined, employeeId).then((res) => {
        const e = res.records[0]
        if (e) setInitialEmployee(e)
      }).catch(() => {})
    }
  }, [view, assetIdParam, employeeId])

  /* ----- 登记提交 ----- */
  const handleSubmitClaim = useCallback(async (values: ClaimRegistration) => {
    const claimId = await registerClaim(values)
    message.success('領用登記成功')
    // 代辦模式直接到詳情，標準模式到記錄詳情
    goRecord(claimId)
  }, [goRecord])

  /* ----- 取消領用 ----- */
  const handleCancelClaim = useCallback(async (claimId: number, reason: string) => {
    await cancelClaim(claimId, reason)
    message.success('已取消領用')
    if (view === 'record') handleQueryRecord(claimId)
  }, [view, handleQueryRecord])

  /* ----- 歸還（跳轉歸還登記表單頁） ----- */
  const goReturn = useCallback((claimId: number) => {
    navigate(`/asset-return/add?claimId=${claimId}`)
  }, [navigate])

  /* ----- 重新推送簽署通知 ----- */
  const handleResendSignNotify = useCallback(async (claimId: number) => {
    await resendClaimSignNotification(claimId)
    // 刷新記錄詳情以更新事件流水
    if (view === 'record') handleQueryRecord(claimId)
  }, [view, handleQueryRecord])

  /* ----- 查看簽收憑證 ----- */
  const handleViewEvidence = useCallback(() => {
    if (!recordData?.signatureImageUrl) {
      message.warning('暫無簽收憑證')
      return
    }
    Modal.info({
      title: '簽收憑證',
      width: 600,
      content: (
        <div style={{ textAlign: 'center' }}>
          <img
            src={recordData.signatureImageUrl}
            alt="簽收憑證"
            style={{ maxWidth: '100%', maxHeight: '70vh', border: '1px solid #f0f0f0', borderRadius: 8 }}
          />
        </div>
      ),
      okText: '關閉',
    })
  }, [recordData])

  /* ----- 下載簽收憑證 ----- */
  const handleDownloadEvidence = useCallback(() => {
    if (!recordData?.signatureImageUrl) {
      message.warning('暫無簽收憑證')
      return
    }
    const link = document.createElement('a')
    link.href = recordData.signatureImageUrl
    link.download = `簽收憑證_${recordData.claimNo}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    message.success('憑證已下載')
  }, [recordData])

  return (
    <div className="content-area claim-module">

      {view === 'list' && (
        <ClaimList
          onAdd={() => goAdd()}
          onManage={goDetail}
          canAdd={canAdd}
          data={summaryData}
          loading={loading}
          error={error}
          departments={departments}
          onQuery={handleQuerySummary}
        />
      )}

      {view === 'detail' && employeeId != null && (
        <EmployeeAssetDetail
          employeeId={employeeId}
          employee={detailEmployee}
          stats={detailStats}
          data={detailData}
          loading={loading}
          error={error}
          canAdd={canAdd}
          initialTab={(() => {
            const raw = params.get('tab')
            const validTabs = Object.values(CLAIM_STATUS) as string[]
            return raw && validTabs.includes(raw) ? raw as ClaimStatus : undefined
          })()}
          onBack={goList}
          onAddClaim={() => goAdd(employeeId)}
          onView={(record) => goRecord(record.id, record.status)}
          onQuery={onQueryDetail}
        />
      )}

      {view === 'detail' && employeeId == null && (
        <div className="claim-notice">缺少有效的 employeeId 參數。<button onClick={goList}>返回匯總列表</button></div>
      )}

      {view === 'add' && (
        <ClaimForm
          onBack={() => {
            const fromEmp = parseClaimId(params.get('employeeId'))
            if (fromEmp) goDetail(fromEmp)
            else goList()
          }}
          employeeId={parseClaimId(params.get('employeeId'))}
          assetId={assetIdParam}
          initialAsset={initialAsset}
          initialEmployee={initialEmployee}
          assets={assetPage}
          employees={employeePage}
          departments={departments}
          operatorName={user?.name}
          operatorEmpNo={user?.empId}
          canProxy={canProxy}
          loading={loading}
          error={error}
          onAssetQuery={handleAssetQuery}
          onEmployeeQuery={handleEmployeeQuery}
          onSubmit={handleSubmitClaim}
        />
      )}

      {view === 'record' && recordId != null && (
        <ClaimRecordDetail
          record={recordData}
          loading={loading}
          error={error}
          onBack={() => {
            const fromEmp = recordData?.employeeId
            if (fromEmp) {
              const sp = new URLSearchParams()
              sp.set('employeeId', String(fromEmp))
              if (recordTab) sp.set('tab', recordTab)
              navigate(`/asset-claim/detail?${sp.toString()}`)
            }
            else goList()
          }}
          onCancel={handleCancelClaim}
          onGoReturn={goReturn}
          onResendSignNotify={handleResendSignNotify}
          onViewEvidence={handleViewEvidence}
          onDownloadEvidence={handleDownloadEvidence}
        />
      )}

      {view === 'record' && recordId == null && (
        <div className="claim-notice">缺少有效的領用記錄 ID。<button onClick={goList}>返回匯總列表</button></div>
      )}
    </div>
  )
}
