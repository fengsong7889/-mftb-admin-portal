/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useAuth } from '@/contexts/AuthContext'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import BrandTag from '@/components/BrandTag'
import {
  brandToAppType, deleteAdAlgorithm, fetchAdAlgorithms, fetchAlgorithmWaterfallReferences,
  updateAdAlgorithmStatus, type AdAlgorithm,
} from '@/api/adPromotion'
import { PrototypeHeader, PrototypeNotice, SimilarEngineIcon } from './PrototypeParts'
import { SIMILAR_ALGO_NAME, SIMILAR_PREVIEW_TYPE } from './prototype'
import { CREATABLE_SCENES, sceneFromParams } from './scenes'

interface SearchValues { code?: string; name?: string; brand?: string; status?: number; updatedBy?: string; updatedAt?: [dayjs.Dayjs, dayjs.Dayjs] }

/** 相似推荐引擎算法列表：服务端分页，usage=library 显式声明用途才返回 type17。 */
export default function SimilarAlgorithmLibrary() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'groupBuy' ? 'groupBuy' : 'delivery'
  // 场景 Tab 即列表的场景筛选：算法实例 scene-scoped，APP 引用同口径过滤。
  const scene = Number(params.get('scene')) || 1
  const { hasPermission } = useAuth()
  const [form] = Form.useForm<SearchValues>()
  const [filter, setFilter] = useState<SearchValues>({})
  const [rows, setRows] = useState<AdAlgorithm[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })

  const load = useCallback(async (page: number, size: number, values: SearchValues) => {
    setLoading(true)
    try {
      const res = await fetchAdAlgorithms({
        page, size, algoType: SIMILAR_PREVIEW_TYPE, usage: 'library',
        code: values.code || undefined, name: values.name || undefined,
        brand: values.brand || undefined, status: values.status, updatedBy: values.updatedBy || undefined,
        updatedFrom: values.updatedAt?.[0]?.startOf('day').toISOString(),
        updatedTo: values.updatedAt?.[1]?.endOf('day').toISOString(),
      })
      const filtered = (res.records ?? []).filter(record => {
        let parsed: unknown
        try { parsed = record.params ? JSON.parse(record.params) : null } catch { parsed = null }
        return sceneFromParams(parsed) === scene
      })
      setRows(filtered)
      setTotal(filtered.length)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加載失敗，請重試')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [scene])
  useEffect(() => { void load(pagination.current, pagination.pageSize, filter) }, [load, pagination.current, pagination.pageSize, filter, tab, scene])

  const columnMeta = useMemo(() => [
    { key: 'code', title: t('algorithm.colAlgorithmId') }, { key: 'name', title: t('algorithm.colAlgorithmName') },
    { key: 'brand', title: t('common.colBrand') }, { key: 'status', title: t('common.colStatus') },
    { key: 'updatedBy', title: t('algorithm.colLastUpdater') }, { key: 'updatedAt', title: t('algorithm.colLastUpdateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])
  const { configComponent, applyConfig } = useColumnConfig('similar-recommendation-list', columnMeta, [{ key: 'action', visible: true, locked: 'tail' }])
  const goForm = (id?: number, detail = false) => {
    const query = new URLSearchParams({ type: String(SIMILAR_PREVIEW_TYPE), tab, scene: String(scene) })
    if (id != null) query.set('id', String(id))
    if (detail) query.set('mode', 'detail')
    navigate(`/promotion-algorithm-add?${query}`)
  }
  const canCreate = hasPermission('promotion-algorithm:create')
  const canEdit = hasPermission('promotion-algorithm:edit')

  const handleToggleStatus = (record: AdAlgorithm) => {
    const next = record.status === 1 ? 2 : 1
    const run = async () => {
      try {
        await updateAdAlgorithmStatus(record.id as number, next)
        message.success(next === 1 ? '已啟用' : '已停用；綁定該算法的場景將停止新決策')
        void load(pagination.current, pagination.pageSize, filter)
      } catch (error) { message.error(error instanceof Error ? error.message : '操作失敗') }
    }
    if (next === 2) {
      Modal.confirm({ className: 'custom-confirm-modal', icon: <div className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></div>,
        title: '停用算法？', content: '停用後綁定該算法的瀑布流場景不會產生新推薦；基礎坑位與投流訂單不受影響。',
        okText: '停用', cancelText: '取消', okButtonProps: { danger: true }, onOk: run })
      return
    }
    void run()
  }
  const handleDelete = async (record: AdAlgorithm) => {
    let refs: Awaited<ReturnType<typeof fetchAlgorithmWaterfallReferences>> = []
    try { refs = await fetchAlgorithmWaterfallReferences(record.id as number) } catch { /* 查询失败不阻断确认流程 */ }
    Modal.confirm({ className: 'custom-confirm-modal', icon: <div className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></div>,
      title: t('common.confirmDelete'),
      content: <div><p>刪除後不可恢復；仍被瀑布流場景綁定引用時後端會拒絕。</p>
        {refs.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>{refs.map((ref, i) => <li key={i}>{ref.strategyName}（{ref.refType ?? 'slot'}）</li>)}</ul>}</div>,
      okText: t('common.delete'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteAdAlgorithm(record.id as number)
          message.success(t('common.deleteSuccess'))
          void load(pagination.current, pagination.pageSize, filter)
        } catch (error) { message.error(error instanceof Error ? error.message : '刪除失敗') }
      } })
  }

  const columns: ColumnsType<AdAlgorithm> = [
    { key: 'code', dataIndex: 'algoCode', title: t('algorithm.colAlgorithmId'), width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { key: 'name', dataIndex: 'algoName', title: t('algorithm.colAlgorithmName'), width: 200 },
    { key: 'brand', dataIndex: 'brand', title: t('common.colBrand'), width: 100, render: (v: string) => { const app = brandToAppType(v); return app ? <BrandTag value={app} /> : '-' } },
    { key: 'status', dataIndex: 'status', title: t('common.colStatus'), width: 100, render: (_: unknown, r) => <Switch checked={r.status === 1} disabled={!canEdit}
      checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} onChange={() => handleToggleStatus(r)} /> },
    { key: 'updatedBy', dataIndex: 'updatedBy', title: t('algorithm.colLastUpdater'), width: 120, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span> },
    { key: 'updatedAt', dataIndex: 'updatedAt', title: t('algorithm.colLastUpdateTime'), width: 180, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'}</span> },
    { key: 'action', title: t('common.colAction'), width: 260, render: (_, r) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => goForm(r.id, true)}>{t('common.detail')}</Button>
      {canEdit && <Button type="link" size="small" onClick={() => goForm(r.id)}>{t('common.edit')}</Button>}
      {hasPermission('promotion-algorithm:delete') && <Button type="link" size="small" danger onClick={() => handleDelete(r)}>{t('common.delete')}</Button>}
    </Space> },
  ]
  return <div className="content-area similar-prototype">
    <PrototypeHeader title={t('algorithm.algorithmList')} subtitle={<><SimilarEngineIcon /> {SIMILAR_ALGO_NAME}</>}
      onBack={() => navigate(`/promotion-algorithm?tab=${tab}`)} />
    <PrototypeNotice />
    <Tabs activeKey={String(scene)} onChange={key => { const next = new URLSearchParams(params); next.set('scene', key); setParams(next); setPagination(p => ({ ...p, current: 1 })) }}
      items={CREATABLE_SCENES.map(item => ({ key: String(item.code), disabled: item.code !== 1,
        label: item.code === 1 ? item.name : `${item.name}（待開發）` }))} />
    <div className="search-section"><Form form={form} layout="inline" onFinish={next => { setFilter(next); setPagination(p => ({ ...p, current: 1 })) }}>
      <Form.Item name="code" label={t('algorithm.colAlgorithmId')}><Input placeholder={t('waterfall.placeholderSearch')} allowClear /></Form.Item>
      <Form.Item name="name" label={t('algorithm.colAlgorithmName')}><Input placeholder={t('waterfall.placeholderSearch')} allowClear /></Form.Item>
      <Form.Item name="brand" label={t('common.colBrand')}><Select placeholder={t('common.all')} allowClear
        options={[{ value: 'flashBee', label: t('common.flashBee') }, { value: 'mFood', label: t('recommend.appMfood') }]} /></Form.Item>
      <Form.Item name="status" label={t('common.colStatus')}><Select placeholder={t('common.all')} allowClear
        options={[{ value: 1, label: t('common.enable') }, { value: 2, label: t('common.disable') }]} /></Form.Item>
      <Form.Item name="updatedBy" label={t('algorithm.colLastUpdater')}><Input placeholder={t('waterfall.placeholderSearch')} allowClear /></Form.Item>
      <Form.Item name="updatedAt" label={t('algorithm.colLastUpdateTime')}><DatePicker.RangePicker placeholder={[t('common.startDate'), t('common.endDate')]} allowClear /></Form.Item>
      <Form.Item><div className="search-actions">
        <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
        <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setFilter({}); setPagination(p => ({ ...p, current: 1 })) }}>{t('common.reset')}</Button>
      </div></Form.Item>
    </Form></div>
    <div className="action-section"><Space>
      {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => goForm()}>{t('algorithm.addAlgorithm')}</Button>}
    </Space>{configComponent}</div>
    <Table<AdAlgorithm> rowKey="id" loading={loading} columns={applyConfig(columns)} dataSource={rows} scroll={{ x: 'max-content' }}
      pagination={{ ...pagination, total, showSizeChanger: true, showQuickJumper: true, showTotal: count => t('common.total', { count }),
        onChange: (current, pageSize) => setPagination({ current: pagination.pageSize === pageSize ? current : 1, pageSize }) }} />
  </div>
}
