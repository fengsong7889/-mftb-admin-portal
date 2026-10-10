/**
 * 车辆档案（物资管理（EAM）下的「車輛管理」分组成员）
 *
 * URL 深链：
 *   /vehicle-files                     → 车辆档案列表
 *   /vehicle-files/add                 → 新增车辆档案
 *   /vehicle-files/edit?id=            → 编辑车辆档案
 *   /vehicle-files/detail?id=          → 车辆详情（含归属授权与驾驶资格 Tab）
 *   /vehicle-files/qualification       → 新增驾驶资格核验记录（?vehicleId=）
 *
 * 数据流沿用项目约定：本文件持有异步加载与提交（useCallback 下发），
 * 子组件只做 UI 与事件派发，不直接调 API。
 *
 * 边界：这里维护的是「车辆运行档案」。资产的购置价值、采购入库、长期领用保管、
 * 报废仍由资产台账（EAM）负责，两者通过 eamAssetId 弱关联，一次出车不改资产持有人。
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import {
  changeDirectRegister, changeVehicleStatus, createVehicle, fetchVehicleDetail,
  fetchVehicles, saveQualification, updateVehicle,
  toIsoDate, type VehicleQuery,
} from '../../../api/vehicle'
import { toVehicleFile, toVehicleSavePayload } from '../vehicleAdapter'
import type { VehicleFile, VehicleFileFormValues } from '../vehicleTypes'
import type { QualificationSave } from '../../../api/vehicle'
import VehicleFileList from './VehicleFileList'
import VehicleFileForm from './VehicleFileForm'
import VehicleFileDetail from './VehicleFileDetail'
import QualificationForm from './QualificationForm'

type View = 'list' | 'add' | 'edit' | 'detail' | 'qualification'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function VehicleFiles() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { user, hasPermission } = useAuth()
  const canEdit = user?.role === 'admin' || hasPermission('vehicle-files:edit')

  const mode = pathname.split('/')[2] || 'list'
  const view: View = mode === 'add' ? 'add'
    : mode === 'edit' ? 'edit'
    : mode === 'detail' ? 'detail'
    : mode === 'qualification' ? 'qualification'
    : 'list'
  const recordId = parseId(searchParams.get('id'))

  const [data, setData] = useState<{ records: VehicleFile[]; total: number }>({ records: [], total: 0 })
  const [detail, setDetail] = useState<VehicleFile>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [reload, setReload] = useState(0)
  /** 列表当前查询条件：详情/表单返回后按同样条件刷新，避免"改完回到第一页全量列表" */
  const [lastQuery, setLastQuery] = useState<VehicleQuery>({ page: 1, size: 10 })

  const back = useCallback(() => navigate('/vehicle-files'), [navigate])
  const refresh = useCallback(() => setReload(n => n + 1), [])

  const handleQuery = useCallback(async (query: VehicleQuery) => {
    setLastQuery(query)
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetchVehicles(query)
      setData({ records: (res.records ?? []).map(toVehicleFile), total: res.total ?? 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
      setData({ records: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'list') void handleQuery(lastQuery)
    // lastQuery 变化由 handleQuery 自身驱动，这里只响应视图与显式刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, reload])

  const handleLoadDetail = useCallback(async (id: number) => {
    setLoading(true)
    setError(undefined)
    try {
      setDetail(toVehicleFile(await fetchVehicleDetail(id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
      setDetail(undefined)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if ((view === 'detail' || view === 'edit') && recordId != null) void handleLoadDetail(recordId)
  }, [view, recordId, handleLoadDetail])

  const handleSave = useCallback(async (values: VehicleFileFormValues, editing?: VehicleFile) => {
    setSaving(true)
    try {
      const payload = toVehicleSavePayload({
        ...values,
        insuranceValidUntil: toIsoDate(values.insuranceValidUntil),
        inspectionValidUntil: toIsoDate(values.inspectionValidUntil),
      }, editing)
      const id = editing ? await updateVehicle(editing.id, payload) : await createVehicle(payload)
      message.success(editing ? '車輛檔案已更新' : '車輛檔案已創建')
      navigate(`/vehicle-files/detail?id=${id}`)
      refresh()
    } catch (err) {
      // request.ts 已统一弹错，这里不重复弹，只保住表单不被吞掉状态
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [navigate, refresh])

  const handleToggleDirect = useCallback(async (record: VehicleFile, enabled: boolean, reason: string) => {
    try {
      await changeDirectRegister(record.id, {
        enabled, reason, expectVersion: record.version ?? 0, requestKey: `${Date.now()}`,
      })
      message.success(`已${enabled ? '啟用' : '停用'}授權直接登記`)
      refresh()
      if (view === 'detail' && recordId != null) void handleLoadDetail(recordId)
    } catch (err) {
      console.error(err)
    }
  }, [refresh, view, recordId, handleLoadDetail])

  const handleChangeStatus = useCallback(async (record: VehicleFile, status: string, reason: string) => {
    try {
      await changeVehicleStatus(record.id, {
        status, reason, expectVersion: record.version ?? 0, requestKey: `${Date.now()}`,
      })
      message.success('運行狀態已更新')
      refresh()
      if (view === 'detail' && recordId != null) void handleLoadDetail(recordId)
    } catch (err) {
      console.error(err)
    }
  }, [refresh, view, recordId, handleLoadDetail])

  const handleSaveQualification = useCallback(async (payload: QualificationSave) => {
    try {
      await saveQualification({ ...payload, validUntil: toIsoDate(payload.validUntil) ?? '' })
      message.success('駕駛資格核驗記錄已保存')
      refresh()
      return true
    } catch {
      return false
    }
  }, [refresh])

  return (
    <>
      {view === 'list' && (
        <VehicleFileList
          data={data}
          loading={loading}
          error={error}
          onQuery={handleQuery}
          canEdit={canEdit}
          onToggleDirect={handleToggleDirect}
          onChangeStatus={handleChangeStatus}
        />
      )}

      {(view === 'add' || view === 'edit') && (
        <VehicleFileForm
          record={view === 'edit' ? detail : undefined}
          loading={loading}
          saving={saving}
          onSubmit={handleSave}
          onBack={back}
        />
      )}

      {view === 'detail' && (
        detail ? (
          <VehicleFileDetail
            record={detail}
            loading={loading}
            onBack={back}
            onEdit={() => navigate(`/vehicle-files/edit?id=${detail.id}`)}
            onToggleDirect={handleToggleDirect}
            onChangeStatus={handleChangeStatus}
            onAddQualification={() => navigate(`/vehicle-files/qualification?vehicleId=${detail.id}`)}
          />
        ) : (
          <div className="content-area">
            {loading ? '加載中…' : (error ?? '缺少有效的車輛 ID。')}
            <a onClick={back}>返回車輛檔案</a>
          </div>
        )
      )}

      {view === 'qualification' && (
        <QualificationForm
          vehicleId={parseId(searchParams.get('vehicleId'))}
          saving={saving}
          onSubmit={handleSaveQualification}
          onBack={() => navigate(`/vehicle-files/detail?id=${searchParams.get('vehicleId') ?? ''}`)}
        />
      )}
    </>
  )
}
