/**
 * 歸還管理（物資管理 - 領用借用）
 *
 * 同一路由內視圖切換：歸還記錄列表 ⇄ 歸還登記表單 ⇄ 歸還詳情（含內聯處置/找回）
 * 支持 URL ?borrowId= 直接進入借用歸還（由借用管理「歸還」跳轉）
 *
 * 階段三：已接通真實后端 API。
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchReturnList, fetchReturnDetail, registerReturn, disposeReturn, recoverReturn,
  type ReturnRow, type ReturnQuery, type ReturnRegisterDTO, type ReturnDispositionDTO, type ReturnRecoverDTO,
} from '../../../api/eamReturn'
import ReturnList from './ReturnList'
import ReturnForm from './ReturnForm'
import ReturnDetail from './ReturnDetail'

type View = 'list' | 'add' | 'detail'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function AssetReturn() {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()

  const canEdit = user?.role === 'admin' || hasPermission('asset-return:edit')

  /* ----- 视图路由 ----- */
  const mode = pathname.split('/')[2] || 'list'
  const view: View = mode === 'add' ? 'add'
    : mode === 'detail' ? 'detail'
    : 'list'

  const recordId = parseId(searchParams.get('id'))
  const claimId = parseId(searchParams.get('claimId'))
  const borrowId = parseId(searchParams.get('borrowId'))
  const assetId = parseId(searchParams.get('assetId'))

  /* ----- 数据状态 ----- */
  const [listData, setListData] = useState<{ records: ReturnRow[]; total: number }>()
  const [detail, setDetail] = useState<ReturnRow>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  /* ----- 列表查询 ----- */
  const handleQuery = useCallback(async (query: ReturnQuery) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchReturnList(query)
      setListData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 详情查询 ----- */
  const handleLoadDetail = useCallback(async (id: number) => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await fetchReturnDetail(id)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /* ----- 自动加载详情 ----- */
  useEffect(() => {
    if (view === 'detail' && recordId != null) {
      handleLoadDetail(recordId)
    }
  }, [view, recordId, handleLoadDetail])

  /* ----- 登记提交 ----- */
  const handleSubmit = useCallback(async (dto: ReturnRegisterDTO) => {
    const id = await registerReturn(dto)
    message.success('歸還登記成功')
    navigate(`/asset-return/detail?id=${id}&result=1`)
  }, [navigate])

  /* ----- 处置提交 ----- */
  const handleDispose = useCallback(async (dto: ReturnDispositionDTO) => {
    if (recordId == null) return
    await disposeReturn(recordId, dto)
    const msgs = ['處置登記成功']
    if (dto.disposition === 'scrapped' || dto.disposition === 'written_off') msgs.push('已自動創建報廢記錄')
    if (dto.disposition === 'apply_repair') msgs.push('已自動創建維修記錄並流入維修管理菜單')
    message.success(msgs.join('，'))
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  /* ----- 找回提交 ----- */
  const handleRecover = useCallback(async (dto: ReturnRecoverDTO) => {
    if (recordId == null) return
    await recoverReturn(recordId, dto)
    message.success('找回登記成功')
    handleLoadDetail(recordId)
  }, [recordId, handleLoadDetail])

  const back = () => navigate('/asset-return')

  return (
    <div className="content-area claim-module return-module">
      {view === 'list' && (
        <ReturnList
          data={listData}
          loading={loading}
          error={error}
          onQuery={handleQuery}
          canEdit={canEdit}
        />
      )}

      {view === 'add' && (
        <ReturnForm
          claimId={claimId}
          borrowId={borrowId}
          assetId={assetId}
          operatorName={user?.name}
          canEdit={canEdit}
          loading={loading}
          onSubmit={handleSubmit}
          onBack={back}
        />
      )}

      {view === 'detail' && recordId != null && (
        <ReturnDetail
          record={detail}
          loading={loading}
          error={error}
          canEdit={canEdit}
          showResult={searchParams.get('result') === '1'}
          editMode={searchParams.get('editMode') === '1'}
          onBack={back}
          onRefresh={() => handleLoadDetail(recordId)}
          onDispose={handleDispose}
          onRecover={handleRecover}
        />
      )}

      {view === 'detail' && recordId == null && (
        <div className="claim-notice">缺少有效的歸還記錄 ID。<button onClick={back}>返回列表</button></div>
      )}
    </div>
  )
}
