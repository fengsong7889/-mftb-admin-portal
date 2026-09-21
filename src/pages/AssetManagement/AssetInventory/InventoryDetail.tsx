/**
 * 盘点详情/执行页
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Button, Descriptions, Space, Table, Tag, Select, Input, Modal, message, Segmented, TreeSelect, Empty, Spin,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AimOutlined, CheckCircleOutlined, ExclamationCircleOutlined, ClockCircleOutlined,
  ExportOutlined, SaveOutlined, EditOutlined, FileSearchOutlined, ProfileOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import StatCards, { type StatCardItem } from '../../../components/StatCards'
import {
  fetchInventoryTask, fetchInventoryItems, fetchInventoryOptions, searchInventoryEmployees,
  saveInventoryItem, batchCheckInventory, prepareCloseInventory, completeInventory, cancelInventoryTask,
  downloadInventoryCsv, newInventoryRequestKey,
  type InventoryTaskRecord, type InventoryItemRecord, type InventoryItemQuery,
  type InventoryOptions, type InventoryEmployeeOption, type SaveItemPayload,
} from '../../../api/eamInventory'
import {
  ITEM_STATUS_LABEL_KEY, ITEM_STATUS_COLOR, RESULT_LABEL_KEY, RESULT_COLOR,
  HOLDER_TYPE_LABEL_KEY, CHECK_METHOD_LABEL_KEY, TASK_STATUS_LABEL_KEY, TASK_STATUS_COLOR,
} from './inventoryMeta'

interface Props {
  taskId: number
  onBack: () => void
}

/** 模块标题栏（28×28 图标色块 + 15px/600 标题 + 右侧延伸分隔线，对齐详情页规范 §D.3） */
function SectionTitle({ icon, iconBg, title, extra }: {
  icon: React.ReactNode; iconBg: string; title: string; extra?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra}
    </div>
  )
}

interface EditorState {
  status: string
  actualLocationId?: number | null
  actualLocationOther?: string | null
  actualHolderType?: string | null
  actualHolderId?: number | null
  actualHolderExternal?: string | null
  checkMethod?: string | null
  remark?: string | null
}

export default function InventoryDetail({ taskId, onBack }: Props) {
  const { t } = useTranslation()
  const [task, setTask] = useState<InventoryTaskRecord | null>(null)
  const [taskLoading, setTaskLoading] = useState(true)
  const [items, setItems] = useState<InventoryItemRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [itemLoading, setItemLoading] = useState(false)
  const [query, setQuery] = useState<Omit<InventoryItemQuery, 'page' | 'size'>>({})
  const [selected, setSelected] = useState<number[]>([])
  const [options, setOptions] = useState<InventoryOptions>({ locations: [], departments: [], categories: [], statuses: [] })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editor, setEditor] = useState<EditorState>({ status: 'normal' })
  const [holderOptions, setHolderOptions] = useState<{ label: string; value: number }[]>([])
  const holderCache = useRef<Map<number, InventoryEmployeeOption>>(new Map())
  const savingIds = useRef<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const [closeOpen, setCloseOpen] = useState(false)
  const [closeType, setCloseType] = useState<'COMPLETE' | 'PARTIAL'>('COMPLETE')
  const [closeReason, setCloseReason] = useState('')
  const [prepare, setPrepare] = useState<Awaited<ReturnType<typeof prepareCloseInventory>> | null>(null)
  /** 操作记录（详情页规范 §D.4：用专用 state 存最后更新人/时间） */
  const [updatedBy, setUpdatedBy] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  const isV2 = !!task && task.contractVersion >= 2
  const editable = !!task && isV2 && task.status === 'in_progress'

  const loadTask = useCallback(async () => {
    setTaskLoading(true)
    try {
      const res = await fetchInventoryTask(taskId)
      setTask(res)
      setUpdatedBy(res.updatedBy || res.operator || '')
      setUpdatedAt(res.updatedAt || '')
    } catch { /* 拦截器提示 */ } finally { setTaskLoading(false) }
  }, [taskId])

  const loadItems = useCallback(async () => {
    setItemLoading(true)
    try {
      const res = await fetchInventoryItems(taskId, { page, size, ...query })
      setItems(res.records || [])
      setTotal(res.total || 0)
    } catch { /* ignore */ } finally { setItemLoading(false) }
  }, [taskId, page, size, query])

  useEffect(() => { loadTask() }, [loadTask])
  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => { fetchInventoryOptions().then(setOptions).catch(() => undefined) }, [])

  const handleHolderSearch = useCallback(async (keyword: string) => {
    const list = await searchInventoryEmployees(keyword)
    list.forEach(e => holderCache.current.set(e.id, e))
    setHolderOptions(list.map(e => ({ value: e.id, label: `${e.name}（${e.empId || '-'}）` })))
  }, [])

  const openEditor = (item: InventoryItemRecord, preset?: string) => {
    setEditingId(item.id)
    setEditor({
      status: preset || item.status || 'normal',
      actualLocationId: item.actualLocationId ?? item.bookLocationId ?? null,
      actualLocationOther: preset && preset !== item.status ? undefined : item.actualLocationOther,
      actualHolderType: preset === 'lost' ? undefined : (item.actualHolderType || (item.holderId ? 'EMPLOYEE' : 'NONE')),
      actualHolderId: item.actualHolderId ?? item.holderId ?? null,
      actualHolderExternal: item.actualHolderExternal,
      checkMethod: item.checkMethod || 'ONSITE',
      remark: item.remark,
    })
    if ((preset || item.status) !== 'lost') {
      const hid = item.holderId
      if (hid) {
        holderCache.current.set(hid, { id: hid, name: item.holderName || '', empId: item.holderEmpNo })
        setHolderOptions(prev => (prev.some(o => o.value === hid) ? prev : [...prev, { value: hid, label: `${item.holderName}（${item.holderEmpNo || '-'}）` }]))
      }
    }
  }

  const doSave = async (item: InventoryItemRecord, payload: Omit<SaveItemPayload, 'requestKey'>) => {
    savingIds.current.add(item.id)
    setSaving(true)
    try {
      const updated = await saveInventoryItem(taskId, item.id, { ...payload, requestKey: newInventoryRequestKey() })
      setItems(prev => prev.map(it => it.id === item.id ? updated : it))
      setTask(await fetchInventoryTask(taskId))
      message.success(t('asset.invSaved', { defaultValue: '已保存' }))
      setEditingId(null)
    } catch { /* 拦截器提示 */ } finally {
      savingIds.current.delete(item.id)
      setSaving(savingIds.current.size > 0)
    }
  }

  const handleEditorSave = () => {
    const item = items.find(it => it.id === editingId)
    if (!item) return
    const status = editor.status as SaveItemPayload['status']
    if (status !== 'pending' && status !== 'lost') {
      if (!editor.actualHolderType) { message.warning(t('asset.invActualHolder', { defaultValue: '請核對實際持有人' })); return }
      if (!editor.actualLocationId && !editor.actualLocationOther) { message.warning(t('asset.invActualLocation', { defaultValue: '請核對實際位置' })); return }
      if (editor.actualHolderType === 'EMPLOYEE' && !editor.actualHolderId) { message.warning(t('asset.invHolderEmployee')); return }
      if (editor.actualHolderType === 'EXTERNAL' && !editor.actualHolderExternal) { message.warning(t('asset.invExternalNamePh')); return }
    }
    doSave(item, {
      itemRevision: item.itemRevision,
      status,
      actualLocationId: status === 'lost' ? null : (editor.actualLocationId ?? null),
      actualLocationOther: status === 'lost' ? undefined : (editor.actualLocationOther ?? undefined),
      actualHolderType: status === 'lost' ? undefined : (editor.actualHolderType as SaveItemPayload['actualHolderType']),
      actualHolderId: status === 'lost' || editor.actualHolderType !== 'EMPLOYEE' ? null : (editor.actualHolderId ?? null),
      actualHolderExternal: editor.actualHolderType === 'EXTERNAL' ? (editor.actualHolderExternal ?? undefined) : undefined,
      checkMethod: editor.checkMethod ?? undefined,
      remark: editor.remark ?? undefined,
    })
  }

  const handleBatch = () => {
    if (!selected.length) { message.warning(t('asset.invBatchCheck')); return }
    Modal.confirm({
      title: t('asset.invBatchCheck', { defaultValue: '批量核對' }),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: <div className="confirm-info-card"><div className="confirm-info-row"><span>{t('asset.colCount')}：</span><b>{selected.length}</b></div><div className="confirm-info-row"><span>{t('asset.invBatchConfirm', { defaultValue: '實物完好，位置及持有人與帳面一致' })}</span></div></div>,
      okText: t('common.confirm', { defaultValue: '確認' }),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await batchCheckInventory(taskId, selected, newInventoryRequestKey())
          message.success(t('asset.invSaved'))
          setSelected([])
          await Promise.all([loadItems(), loadTask()])
        } catch { /* ignore */ }
      },
    })
  }

  const openClose = async () => {
    if (savingIds.current.size > 0) { message.warning(t('asset.invUnsavedWarn', { defaultValue: '存在進行中的保存請求，請稍後再結束' })); return }
    try {
      const p = await prepareCloseInventory(taskId)
      setPrepare(p)
      setCloseType(p.canComplete ? 'COMPLETE' : 'PARTIAL')
      setCloseReason('')
      setCloseOpen(true)
    } catch { /* ignore */ }
  }

  const handleClose = async () => {
    if (closeType === 'PARTIAL' && !closeReason.trim()) { message.warning(t('asset.invCloseReasonPh')); return }
    if (!prepare) return
    try {
      await completeInventory(taskId, { closeType, reason: closeReason || undefined, expectedTaskRevision: prepare.taskRevision, prepareHash: prepare.prepareHash, requestKey: newInventoryRequestKey() })
      message.success(t('asset.reportSubmitted', { defaultValue: '已提交盤點結果' }))
      setCloseOpen(false)
      await Promise.all([loadTask(), loadItems()])
    } catch { /* ignore */ }
  }

  const handleCancel = () => {
    let reason = ''
    Modal.confirm({
      title: t('asset.invBtnCancel', { defaultValue: '取消任務' }),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: <Input.TextArea rows={3} placeholder={t('asset.invCloseReasonPh')} onChange={e => { reason = e.target.value }} />,
      okText: t('asset.invConfirmCancel', { defaultValue: '確認取消' }),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (!reason.trim()) { message.warning(t('asset.invCloseReasonPh')); return Promise.reject() }
        await cancelInventoryTask(taskId, { reason, expectedTaskRevision: task?.taskRevision ?? 0, requestKey: newInventoryRequestKey() })
        message.success(t('asset.inventoryCancelled', { defaultValue: '任務已取消' }))
        await Promise.all([loadTask(), loadItems()])
      },
    })
  }

  const handleExport = async (mode: string) => {
    try {
      await downloadInventoryCsv(`/eam/inventory/v2/tasks/${taskId}/export?mode=${mode}`, `asset_inventory_${task?.taskNo || taskId}_${mode}.csv`)
      message.success(t('common.exportSuccess', { defaultValue: '導出成功' }))
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : t('common.exportFailed', { defaultValue: '導出失敗' })) }
  }

  const resultTag = (key?: string | null) => key ? <Tag color={RESULT_COLOR[key]}>{t(RESULT_LABEL_KEY[key] || key)}</Tag> : <span style={{ color: '#bfbfbf' }}>-</span>

  /** 盘点范围摘要（与列表页同口径） */
  const scopeText = (r: InventoryTaskRecord) => {
    const s = r.scopeSummary
    if (!s || (s.scopeMode ?? r.scopeMode) === 'ALL') return t('asset.invScopeAll', { defaultValue: '全部適用資產' })
    const parts: string[] = []
    if (s.locationNames?.length) parts.push(s.locationNames.join('/'))
    if (s.categoryNames?.length) parts.push(s.categoryNames.join('/'))
    if (s.departmentNames?.length) parts.push(s.departmentNames.join('/'))
    return parts.length ? parts.join('、') : t('asset.invScopeCondition', { defaultValue: '按條件盤點' })
  }

  /** 负责人统一带工号 */
  const ownerText = (r: InventoryTaskRecord) => {
    const name = r.ownerName || r.operator || '-'
    return r.ownerEmpNo ? `${name}（${r.ownerEmpNo}）` : name
  }

  const columns: TableColumnsType<InventoryItemRecord> = [
    { key: 'assetNo', title: t('asset.colAssetNo'), width: 150, fixed: 'left', render: (_, r) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.assetNo}</span> },
    { key: 'assetName', title: t('asset.colAssetName'), width: 170, ellipsis: true },
    { key: 'assetType', title: t('asset.colAssetType'), width: 110 },
    { key: 'location', title: t('asset.invScopeLocations'), width: 180, ellipsis: true, render: (_, r) => r.location || '-' },
    { key: 'holder', title: t('asset.colCurrentUserName'), width: 150, render: (_, r) => {
        if (r.bookStatus === 'idle') return '-'
        return <span style={{ whiteSpace: 'nowrap' }}>{r.holderName ? `${r.holderName}${r.holderEmpNo ? `（${r.holderEmpNo}）` : ''}` : '-'}</span>
      } },
    { key: 'status', title: t('asset.colCheckStatus', { defaultValue: '實物結果' }), width: 110, render: (_, r) => <Tag color={ITEM_STATUS_COLOR[r.status]}>{t(ITEM_STATUS_LABEL_KEY[r.status] || r.status)}</Tag> },
    { key: 'locResult', title: t('asset.invActualLocation'), width: 100, render: (_, r) => resultTag(r.locationCheckResult) },
    { key: 'holderResult', title: t('asset.invActualHolder'), width: 100, render: (_, r) => resultTag(r.holderCheckResult) },
    { key: 'recheck', title: t('asset.colRecheckCount', { defaultValue: '待復核' }), width: 90, render: (_, r) => r.recheckRequired === 1 ? <Tag color="warning">{t('asset.invPeriodChange', { defaultValue: '期間變更' })}</Tag> : '-' },
    { key: 'checkedAt', title: t('asset.colOperateTime'), width: 160, render: (_, r) => r.checkedAt || '-' },
    { key: 'action', title: t('common.colAction'), width: 200, fixed: 'right', render: (_, r) => editable ? (
      <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => openEditor(r, 'normal')}>{t('asset.invOpFound', { defaultValue: '找到' })}</Button>
        <Button type="link" size="small" onClick={() => openEditor(r, 'damaged')}>{t('asset.invOpDamaged', { defaultValue: '損壞' })}</Button>
        {/* 危险（缺失）操作按规范放最后 */}
        <Button type="link" size="small" danger onClick={() => openEditor(r, 'lost')}>{t('asset.invOpLost', { defaultValue: '缺失' })}</Button>
      </Space>
    ) : <span style={{ color: '#bfbfbf' }}>-</span> },
  ]

  const stats = task?.stats
  const statItems: StatCardItem[] = [
    { key: 'expected', icon: <AimOutlined />, value: stats?.expectedCount ?? 0, label: t('asset.invStatExpected'), color: 'info' },
    { key: 'checked', icon: <CheckCircleOutlined />, value: stats?.checkedCount ?? 0, label: t('asset.invStatChecked'), color: 'success' },
    { key: 'anomaly', icon: <ExclamationCircleOutlined />, value: stats?.anomalyCount ?? 0, label: t('asset.invStatAnomaly'), color: 'brand' },
    { key: 'notChecked', icon: <ClockCircleOutlined />, value: stats?.notCheckedCount ?? 0, label: t('asset.invStatNotChecked'), color: 'system' },
  ]

  const renderEditor = () => {
    const item = items.find(it => it.id === editingId)
    if (!item) return null
    const isLost = editor.status === 'lost'
    const isPending = editor.status === 'pending'
    return (
      <div style={{ background: '#FAFAFA', border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={labelStyle}>{t('asset.colCheckStatus')}</div>
            <Select value={editor.status} style={{ width: '100%' }} onChange={v => setEditor(e => ({ ...e, status: v }))}
              options={['pending', 'normal', 'lost', 'damaged'].map(s => ({ value: s, label: t(ITEM_STATUS_LABEL_KEY[s]) }))} />
          </div>
          {!isLost && !isPending && (
            <>
              <div>
                <div style={labelStyle}>{t('asset.invActualLocation')}</div>
                <TreeSelect value={editor.actualLocationId ?? undefined} style={{ width: '100%' }} allowClear showSearch treeNodeFilterProp="title"
                  placeholder={t('asset.invScopeLocations')}
                  treeData={options.locations.map(l => ({ title: l.name, value: l.id }))}
                  onChange={v => setEditor(e => ({ ...e, actualLocationId: v }))} />
              </div>
              <div>
                <div style={labelStyle}>{t('asset.invActualHolder')}</div>
                <Select value={editor.actualHolderType} style={{ width: '100%' }} placeholder={t('asset.invHolderPending')}
                  onChange={v => setEditor(e => ({ ...e, actualHolderType: v }))}
                  options={['EMPLOYEE', 'NONE', 'EXTERNAL'].map(h => ({ value: h, label: t(HOLDER_TYPE_LABEL_KEY[h]) }))} />
              </div>
              <div>
                <div style={labelStyle}>{t('asset.invCheckMethod')}</div>
                <Select value={editor.checkMethod} style={{ width: '100%' }} onChange={v => setEditor(e => ({ ...e, checkMethod: v }))}
                  options={['ONSITE', 'HOLDER', 'DOC'].map(m => ({ value: m, label: t(CHECK_METHOD_LABEL_KEY[m]) }))} />
              </div>
            </>
          )}
        </div>
        {editor.actualHolderType === 'EMPLOYEE' && !isLost && !isPending && (
          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>{t('asset.colCurrentUserName')}</div>
            <Select showSearch filterOption={false} onSearch={handleHolderSearch} value={editor.actualHolderId ?? undefined} style={{ width: 260 }}
              placeholder={t('asset.invOwnerPh')} options={holderOptions} onChange={v => setEditor(e => ({ ...e, actualHolderId: v }))} />
          </div>
        )}
        {editor.actualHolderType === 'EXTERNAL' && !isLost && !isPending && (
          <div style={{ marginTop: 12 }}>
            <Input style={{ width: 260 }} placeholder={t('asset.invExternalNamePh')} value={editor.actualHolderExternal ?? undefined} onChange={e => setEditor(s => ({ ...s, actualHolderExternal: e.target.value }))} />
          </div>
        )}
        {!isPending && (
          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>{t('asset.colRemark')}</div>
            <Input.TextArea rows={2} maxLength={500} value={editor.remark ?? undefined} onChange={e => setEditor(s => ({ ...s, remark: e.target.value }))}
              placeholder={isLost ? t('asset.colScrapReason', { defaultValue: '請說明缺失情況' }) : t('asset.remarkPh', { defaultValue: '備註' })} />
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Space>
            <Button onClick={() => setEditingId(null)}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleEditorSave}>{t('asset.invSaveDraft')}</Button>
          </Space>
        </div>
      </div>
    )
  }

  if (taskLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }
  if (!task) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />

  const headerTags = <Tag color={TASK_STATUS_COLOR[task.status]}>{t(TASK_STATUS_LABEL_KEY[task.status] || task.status)}</Tag>
  /** 结束方式（完整完成/部分完成/已取消） */
  const closeTypeText = task.status === 'cancelled'
    ? t('asset.statusCancelled')
    : task.closeType === 'PARTIAL'
      ? t('asset.invPartial', { defaultValue: '部分完成' })
      : task.closeType === 'COMPLETE'
        ? t('asset.invComplete', { defaultValue: '完整完成' })
        : '-'
  const meta = `${task.taskNo} · ${t('asset.colOwner')}：${task.ownerName || task.operator}${task.ownerEmpNo ? `（${task.ownerEmpNo}）` : ''} · ${t('asset.colInventoryDate')}：${task.inventoryDate}`

  return (
    <>
      <DetailPageHeader
        title={<>{t('asset.invDetailTitle')}：{task.taskName}</>}
        tags={<Space size={4}>{headerTags}{!isV2 && <Tag color="default">{t('asset.invHistoryTag', { defaultValue: '歷史盤點紀錄' })}</Tag>}</Space>}
        meta={meta}
        onBack={onBack}
        extra={editable ? (
          <Space>
            <Button onClick={handleCancel} danger>{t('asset.invBtnCancel')}</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={openClose}>{t('asset.invCloseTitle', { defaultValue: '結束盤點' })}</Button>
          </Space>
        ) : (
          <Space>
            <Button className="btn-export" icon={<ExportOutlined />} onClick={() => handleExport('all')}>{t('asset.invExportAll')}</Button>
            <Button className="btn-export" icon={<ExportOutlined />} onClick={() => handleExport('missing')}>{t('asset.invExportDiff')}</Button>
            <Button className="btn-export" icon={<ExportOutlined />} onClick={() => handleExport('unchecked')}>{t('asset.invExportUnchecked')}</Button>
          </Space>
        )}
      />

      {!isV2 && <div style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 13 }}>{t('asset.invHistoryTip', { defaultValue: '歷史任務僅可查看/導出' })}</div>}

      {/* 盘点任务信息（详情页规范 §D.3：白底卡片 + 模块标题行 + Descriptions） */}
      <div className="detail-card">
        <SectionTitle
          icon={<FileSearchOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
          iconBg="#e6f7ff"
          title={t('asset.invTaskInfoTitle', { defaultValue: '盤點任務信息' })}
        />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.colTaskNo')}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{task.taskNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.colTaskName')} span={2}>{task.taskName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colStatus')}>{headerTags}</Descriptions.Item>
          <Descriptions.Item label={t('asset.invOwnerLabel')}>{ownerText(task)}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colInventoryDate')}>{task.inventoryDate || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedBy', { defaultValue: '發起人' })}>{task.createdBy || task.operator || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{task.createdAt || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colExpectedCount')}>{task.expectedCount}</Descriptions.Item>
          <Descriptions.Item label={t('asset.invColCloseType', { defaultValue: '結束方式' })}>{closeTypeText}</Descriptions.Item>
          <Descriptions.Item label={t('asset.invColClosedAt', { defaultValue: '結束時間' })}>{task.closedAt || task.cancelledAt || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.invRangeSummary')}>{scopeText(task)}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark')} span={3}>{task.remark || '-'}</Descriptions.Item>
          {(task.closeReason || task.cancelReason) && (
            <Descriptions.Item label={t('asset.colReason')} span={4}>{task.cancelReason || task.closeReason}</Descriptions.Item>
          )}
        </Descriptions>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatCards items={statItems} animationKey={`${taskId}-${stats?.checkedCount ?? 0}`} />
      </div>

      {/* 盘点明细 */}
      <div className="detail-card">
        <SectionTitle
          icon={<ProfileOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
          iconBg="#fff7e6"
          title={t('asset.invDetailListTitle', { defaultValue: '盤點明細' })}
          extra={editable && selected.length > 0 ? (
            <Button icon={<CheckCircleOutlined />} onClick={handleBatch}>{t('asset.invBatchCheck')}（{selected.length}）</Button>
          ) : undefined}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Input.Search allowClear placeholder={t('asset.searchAssetNo', { defaultValue: '資產編號/名稱' })} style={{ width: 200 }}
            onSearch={v => { setPage(1); setQuery(q => ({ ...q, keyword: v || undefined })) }} />
          <Select allowClear placeholder={t('asset.colCheckStatus')} style={{ width: 140 }}
            onChange={v => { setPage(1); setQuery(q => ({ ...q, checkProgress: v })) }}
            options={[{ value: 'checked', label: t('asset.invStatChecked') }, { value: 'unchecked', label: t('asset.invStatNotChecked') }, { value: 'recheck', label: t('asset.colRecheckCount') }]} />
          <Select allowClear placeholder={t('asset.invStatAnomaly')} style={{ width: 150 }}
            onChange={v => { setPage(1); setQuery(q => ({ ...q, anomaly: v })) }}
            options={[{ value: 'missing', label: t('asset.invItemLost') }, { value: 'damaged', label: t('asset.invItemDamaged') }, { value: 'location_diff', label: t('asset.invActualLocation') + t('asset.invResultDiff') }, { value: 'holder_diff', label: t('asset.invActualHolder') + t('asset.invResultDiff') }]} />
        </div>

        <Table<InventoryItemRecord>
          rowKey="id"
          className="nowrap-table"
          columns={columns}
          dataSource={items}
          loading={itemLoading}
          size="small"
          scroll={{ x: 1500 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} /> }}
          rowSelection={editable ? {
            selectedRowKeys: selected,
            preserveSelectedRowKeys: false,
            onChange: keys => setSelected(keys as number[]),
            getCheckboxProps: (r) => ({ disabled: r.status !== 'pending' || r.recheckRequired === 1 }),
          } : undefined}
          expandable={{
            expandedRowRender: renderEditor,
            expandedRowKeys: editingId != null ? [editingId] : [],
            showExpandColumn: false,
          }}
          pagination={{
            current: page, pageSize: size, total,
            showSizeChanger: true, showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (tt) => t('common.total', { count: tt }),
            // 每页条数变化时必须回到第 1 页
            onChange: (p, ps) => { if (ps !== size) { setSize(ps); setPage(1) } else { setPage(p) } },
          }}
        />
      </div>

      {/* 操作记录（详情页规范 §D.4：仅展示最后更新人 + 最后更新时间） */}
      <div className="detail-card">
        <SectionTitle
          icon={<EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
          iconBg="#e6f7ff"
          title={t('asset.operationRecord')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={labelStyle}>{t('asset.colUpdatedBy')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{updatedBy || '-'}</div>
          </div>
          <div>
            <div style={labelStyle}>{t('asset.colUpdatedAt')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{updatedAt || '-'}</div>
          </div>
        </div>
      </div>

      <Modal
        title={t('asset.invCloseTitle', { defaultValue: '結束盤點' })}
        open={closeOpen}
        onCancel={() => setCloseOpen(false)}
        onOk={handleClose}
        okText={t('common.confirm', { defaultValue: '確認' })}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        {prepare && (
          <>
            <div style={{ background: '#FFF7F0', border: '1px solid #FFE7D1', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <Space size="large" wrap>
                <span>{t('asset.invStatExpected')}：<b>{prepare.stats.expectedCount}</b></span>
                <span>{t('asset.invStatChecked')}：<b style={{ color: '#52C41A' }}>{prepare.checkedCount}</b></span>
                <span>{t('asset.invStatAnomaly')}：<b style={{ color: '#FF4D4F' }}>{prepare.stats.anomalyCount}</b></span>
                <span>{t('asset.invStatNotChecked')}：<b>{prepare.notCheckedCount}</b></span>
              </Space>
            </div>
            <Segmented
              block
              value={closeType}
              onChange={v => setCloseType(v as 'COMPLETE' | 'PARTIAL')}
              options={[
                { value: 'COMPLETE', label: t('asset.invComplete', { defaultValue: '完整完成' }), disabled: !prepare.canComplete },
                { value: 'PARTIAL', label: t('asset.invPartial', { defaultValue: '部分完成' }), disabled: !prepare.canPartial },
              ]}
              style={{ marginBottom: 12 }}
            />
            {closeType === 'PARTIAL' && (
              <Input.TextArea rows={3} maxLength={500} placeholder={t('asset.invCloseReasonPh')} value={closeReason} onChange={e => setCloseReason(e.target.value)} />
            )}
          </>
        )}
      </Modal>
    </>
  )
}

const labelStyle = { fontSize: 12, color: '#8c8c8c', marginBottom: 4 } as const
