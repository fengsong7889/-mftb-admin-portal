/**
 * 赔付管理 — 入口组件
 *
 * 同一路由内视图切换：列表 ⇄ 详情 ⇄ 定责 ⇄ 免赔 ⇄ 收款 ⇄ 退款 ⇄ 找回复核
 * 已接通真实后端 API。
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchCompensationList, fetchCompensationDetail,
  setLiability, waiveCompensation, addPayment, reviewCompensation,
  type CompensationRow, type CompensationQuery,
  type LiabilityDTO, type WaiveDTO, type PaymentDTO, type ReviewDTO,
} from '../../../api/eamCompensation'
import CompensationList from './CompensationList'
import CompensationDetail from './CompensationDetail'
import CompensationLiability from './CompensationLiability'
import CompensationWaive from './CompensationWaive'
import CompensationPayment from './CompensationPayment'
import CompensationRefund from './CompensationRefund'
import CompensationReview from './CompensationReview'
import CompensationForm from './CompensationForm'

type View = 'list' | 'detail' | 'liability' | 'waive' | 'payment' | 'refund' | 'review' | 'add'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function AssetCompensation() {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()

  const canEdit = user?.role === 'admin' || hasPermission('asset-compensation:edit')

  const mode = pathname.split('/')[2] || 'list'
  const isNew = searchParams.get('new') === '1'
  const view: View = isNew ? 'add'
    : mode === 'detail' ? 'detail'
    : mode === 'liability' ? 'liability'
    : mode === 'waive' ? 'waive'
    : mode === 'payment' ? 'payment'
    : mode === 'refund' ? 'refund'
    : mode === 'review' ? 'review'
    : 'list'

  const recordId = parseId(searchParams.get('id'))

  /* ----- 数据状态 ----- */
  const [listData, setListData] = useState<{ records: CompensationRow[]; total: number }>()
  const [detail, setDetail] = useState<CompensationRow>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  /* ----- 列表查询 ----- */
  const handleQuery = useCallback(async (query: CompensationQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchCompensationList(query)
      setListData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 详情查询 ----- */
  const handleLoadDetail = useCallback(async (id: number) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchCompensationDetail(id)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 自动加载详情 ----- */
  useEffect(() => {
    if (view !== 'list' && recordId != null) {
      handleLoadDetail(recordId)
    }
  }, [view, recordId, handleLoadDetail])

  /* ----- 操作回调 ----- */
  const handleLiability = useCallback(async (dto: LiabilityDTO) => {
    if (recordId == null) return
    await setLiability(recordId, dto)
    message.success('定责成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const handleWaive = useCallback(async (dto: WaiveDTO) => {
    if (recordId == null) return
    await waiveCompensation(recordId, dto)
    message.success('免赔成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const handlePayment = useCallback(async (dto: PaymentDTO) => {
    if (recordId == null) return
    await addPayment(recordId, dto)
    message.success('收款登记成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const handleRefund = useCallback(async (dto: PaymentDTO) => {
    if (recordId == null) return
    await addPayment(recordId, dto)
    message.success('退款登记成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const handleReview = useCallback(async (dto: ReviewDTO) => {
    if (recordId == null) return
    await reviewCompensation(recordId, dto)
    message.success('找回复核成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const back = () => navigate('/asset-compensation')
  const backToDetail = () => recordId != null ? navigate(`/asset-compensation/detail?id=${recordId}`) : back()

  return (
    <div className="content-area claim-module return-module">
      {view === 'list' && (
        <CompensationList data={listData} loading={loading} error={error} onQuery={handleQuery} canEdit={canEdit} onCreate={() => navigate('/asset-compensation/add?new=1')} />
      )}

      {view === 'add' && (
        <CompensationForm
          onBack={back}
          onCreated={(compId) => {
            navigate(`/asset-compensation/detail?id=${compId}`, { replace: true })
          }}
        />
      )}

      {view === 'detail' && recordId != null && (
        <CompensationDetail
          record={detail} loading={loading} error={error} canEdit={canEdit}
          onBack={back} onRefresh={() => handleLoadDetail(recordId)}
        />
      )}

      {view === 'liability' && recordId != null && (
        <CompensationLiability record={detail} loading={loading} canEdit={canEdit} onSubmit={handleLiability} onBack={backToDetail} />
      )}

      {view === 'waive' && recordId != null && (
        <CompensationWaive record={detail} loading={loading} canEdit={canEdit} onSubmit={handleWaive} onBack={backToDetail} />
      )}

      {view === 'payment' && recordId != null && (
        <CompensationPayment record={detail} loading={loading} canEdit={canEdit} onSubmit={handlePayment} onBack={backToDetail} />
      )}

      {view === 'refund' && recordId != null && (
        <CompensationRefund record={detail} loading={loading} canEdit={canEdit} onSubmit={handleRefund} onBack={backToDetail} />
      )}

      {view === 'review' && recordId != null && (
        <CompensationReview record={detail} loading={loading} canEdit={canEdit} onSubmit={handleReview} onBack={backToDetail} />
      )}

      {view !== 'list' && recordId == null && (
        <div className="claim-notice">缺少有效的赔付记录 ID。<button onClick={back}>返回列表</button></div>
      )}
    </div>
  )
}
