/**
 * 领用管理（物资管理 - 领用管理）
 *
 * URL 深链：
 *   /asset-claim                          → 员工维度汇总列表
 *   /asset-claim/add?employeeId=...&assetId=... → 领用登记（查询参数仅预填）
 *   /asset-claim/detail?employeeId=...    → 员工资产详情
 *   /asset-claim/record?id=...            → 只读领用及凭证详情
 *
 * 阶段三：已接通真实后端 API。
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
import { CLAIM_STATUS, type ClaimStatsData } from './claimViewTypes'
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

  /* ----- 数据状态 ----- */
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

  /* ----- 加载部门列表 ----- */
  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => {})
  }, [])

  /* ----- 汇总列表查询 ----- */
  const handleQuerySummary = useCallback(async (query: ClaimQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchEmployeeSummary(query)
      setSummaryData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 员工详情查询 ----- */
  const handleQueryDetail = useCallback(async (empId: number, query: ClaimQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchClaimList({ ...query, employeeId: empId })
      setDetailData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 领用记录详情查询 ----- */
  const handleQueryRecord = useCallback(async (claimId: number) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchClaimDetail(claimId)
      setRecordData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
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

  /* ----- 在職員工查詢（供領用登記表單「領用人」下拉；走领用模块专用接口，免员工管理权限，支持选择本人登记） ----- */
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
  const goRecord = useCallback((id: number) => navigate(`/asset-claim/record?id=${id}`), [navigate])

  const employeeId = useMemo(() => {
    const raw = params.get('employeeId')
    return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined
  }, [params])

  /* ----- 稳定的 onQuery 回调（避免子组件 useEffect 因引用变化重复触发） ----- */
  const onQueryDetail = useCallback((q: ClaimQuery) => {
    if (employeeId != null) handleQueryDetail(employeeId, q)
  }, [employeeId, handleQueryDetail])

  const recordId = useMemo(() => parseClaimId(params.get('id')), [params])

  /* ----- 自动加载 ----- */
  useEffect(() => {
    if (view === 'detail' && employeeId != null) {
      // 注：列表数据由 EmployeeAssetDetail 子组件的 useEffect + onQueryDetail 首次触发，避免重复请求
      // 加载员工基本信息（供详情页头部展示；走领用模块专用接口，免员工管理权限）
      fetchClaimEmployeeOptions(undefined, employeeId).then((res) => {
        const emp = res.records[0]
        if (emp) setDetailEmployee(emp)
      }).catch(() => {})
      // 加载个人统计
      fetchClaimStats({ employeeId }).then(setDetailStats).catch(() => {})
    }
    if (view === 'record' && recordId != null) {
      handleQueryRecord(recordId)
    }
    // 离开 detail 视图时清理缓存
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
    message.success('领用登记成功')
    // 代办模式直接到详情，标准模式到记录详情
    goRecord(claimId)
  }, [goRecord])

  /* ----- 取消领用 ----- */
  const handleCancelClaim = useCallback(async (claimId: number, reason: string) => {
    await cancelClaim(claimId, reason)
    message.success('已取消领用')
    if (view === 'record') handleQueryRecord(claimId)
  }, [view, handleQueryRecord])

  /* ----- 归还（跳转归还登记表单页） ----- */
  const goReturn = useCallback((claimId: number) => {
    navigate(`/asset-return/add?claimId=${claimId}`)
  }, [navigate])

  /* ----- 重新推送签署通知 ----- */
  const handleResendSignNotify = useCallback(async (claimId: number) => {
    await resendClaimSignNotification(claimId)
    // 刷新记录详情以更新事件流水
    if (view === 'record') handleQueryRecord(claimId)
  }, [view, handleQueryRecord])

  /* ----- 查看签收凭证 ----- */
  const handleViewEvidence = useCallback(() => {
    if (!recordData?.signatureImageUrl) {
      message.warning('暂无签收凭证')
      return
    }
    Modal.info({
      title: '签收凭证',
      width: 600,
      content: (
        <div style={{ textAlign: 'center' }}>
          <img
            src={recordData.signatureImageUrl}
            alt="签收凭证"
            style={{ maxWidth: '100%', maxHeight: '70vh', border: '1px solid #f0f0f0', borderRadius: 8 }}
          />
        </div>
      ),
      okText: '关闭',
    })
  }, [recordData])

  /* ----- 下载签收凭证 ----- */
  const handleDownloadEvidence = useCallback(() => {
    if (!recordData?.signatureImageUrl) {
      message.warning('暂无签收凭证')
      return
    }
    const link = document.createElement('a')
    link.href = recordData.signatureImageUrl
    link.download = `签收凭证_${recordData.claimNo}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    message.success('凭证已下载')
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
          onBack={goList}
          onAddClaim={() => goAdd(employeeId)}
          onView={(record) => goRecord(record.id)}
          onQuery={onQueryDetail}
        />
      )}

      {view === 'detail' && employeeId == null && (
        <div className="claim-notice">缺少有效的 employeeId 参数。<button onClick={goList}>返回汇总列表</button></div>
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
            if (fromEmp) goDetail(fromEmp)
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
        <div className="claim-notice">缺少有效的领用记录 ID。<button onClick={goList}>返回汇总列表</button></div>
      )}
    </div>
  )
}
