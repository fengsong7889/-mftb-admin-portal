/**
 * 借用管理 — 接通真实后端 API
 *
 * URL 深链：
 *   /asset-borrow          → 借用列表
 *   /asset-borrow/add      → 借用登记
 *   /asset-borrow/detail   → 借用详情
 *   /asset-borrow/renew    → 续借登记
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchBorrowList, fetchBorrowDetail, registerBorrow, renewBorrow,
  type BorrowRow, type BorrowQuery, type BorrowRegisterDTO,
} from '../../../api/eamBorrow'
import BorrowList from './BorrowList'
import BorrowForm from './BorrowForm'
import BorrowDetail from './BorrowDetail'
import BorrowRenew from './BorrowRenew'

type View = 'list' | 'add' | 'detail' | 'renew'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function AssetBorrow() {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()

  const canEdit = user?.role === 'admin' || hasPermission('asset-borrow:edit')
  const canReturn = user?.role === 'admin' || hasPermission('asset-return:edit')

  /* ----- 视图路由 ----- */
  const mode = pathname.split('/')[2] || 'list'
  const view: View = mode === 'add' ? 'add'
    : mode === 'detail' ? 'detail'
    : mode === 'renew' ? 'renew'
    : 'list'

  const recordId = parseId(searchParams.get('id'))

  /* ----- 数据状态 ----- */
  const [listData, setListData] = useState<{ records: BorrowRow[]; total: number }>()
  const [detail, setDetail] = useState<BorrowRow>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  /* ----- 列表查询 ----- */
  const handleQuery = useCallback(async (query: BorrowQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchBorrowList(query)
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
      const data = await fetchBorrowDetail(id)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 自动加载详情 ----- */
  useEffect(() => {
    if (['detail', 'renew'].includes(view) && recordId != null) {
      handleLoadDetail(recordId)
    }
  }, [view, recordId, handleLoadDetail])

  /* ----- 登记提交 ----- */
  const handleSubmit = useCallback(async (dto: BorrowRegisterDTO) => {
    const id = await registerBorrow(dto)
    message.success('借用登记成功')
    navigate(`/asset-borrow/detail?id=${id}`)
  }, [navigate])

  /* ----- 续借提交 ----- */
  const handleRenew = useCallback(async (newDueDate: string) => {
    if (recordId == null) return
    await renewBorrow(recordId, { newDueDate })
    message.success('续借成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const back = () => navigate('/asset-borrow')

  return (
    <div className="content-area claim-module">
      {view === 'list' && (
        <BorrowList
          data={listData}
          loading={loading}
          error={error}
          onQuery={handleQuery}
          canEdit={canEdit}
          canReturn={canReturn}
        />
      )}

      {view === 'add' && (
        <BorrowForm
          operatorName={user?.name}
          canEdit={canEdit}
          loading={loading}
          onSubmit={handleSubmit}
          onBack={back}
        />
      )}

      {view === 'detail' && recordId != null && (
        <BorrowDetail
          record={detail}
          loading={loading}
          error={error}
          canEdit={canEdit}
          canReturn={canReturn}
          onBack={back}
          onRefresh={() => handleLoadDetail(recordId)}
        />
      )}

      {view === 'renew' && recordId != null && (
        <BorrowRenew
          record={detail}
          loading={loading}
          canEdit={canEdit}
          onSubmit={handleRenew}
          onBack={() => recordId != null && navigate(`/asset-borrow/detail?id=${recordId}`)}
        />
      )}

      {['detail', 'renew'].includes(view) && recordId == null && (
        <div className="claim-notice">缺少有效的借用记录 ID。<button onClick={back}>返回列表</button></div>
      )}
    </div>
  )
}
