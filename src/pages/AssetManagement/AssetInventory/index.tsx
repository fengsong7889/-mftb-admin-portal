/**
 * 资产盘点页
 *
 * 物资部定期盘点：
 *  - 发起盘点任务（任务名称 + 盘点人）
 *  - 查看盘点明细（逐资产核对状态：正常 / 缺失 / 损坏）
 *  - 提交盘点结果，自动生成差异报告
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, Table, Tag, Modal, message, Card, Row, Col, Select, Space,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchInventoryList, fetchInventoryDetail, createInventory, submitInventoryResult, cancelInventory,
  type AssetInventoryRecord, type InventoryItemRecord,
} from '../../../api/asset'

export default function AssetInventory() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AssetInventoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [currentTask, setCurrentTask] = useState<AssetInventoryRecord | null>(null)
  const [detailItems, setDetailItems] = useState<InventoryItemRecord[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchInventoryList({ page, size: 10, keyword: keyword || undefined, status: statusFilter })
      setData(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, keyword, statusFilter, t])

  useEffect(() => { loadData() }, [loadData])

  const handleCreate = async () => {
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      const taskNo = await createInventory(v.taskName, v.operator)
      message.success(t('asset.inventoryCreated', { taskNo }))
      setCreateOpen(false)
      form.resetFields()
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenDetail = async (record: AssetInventoryRecord) => {
    setCurrentTask(record)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const detail = await fetchInventoryDetail(record.id)
      setDetailItems(detail.items || [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
      setDetailItems([])
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCancel = (record: AssetInventoryRecord) => {
    Modal.confirm({
      title: t('asset.cancelInventoryConfirm', { defaultValue: '確定要取消該盤點任務嗎？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm', { defaultValue: '確認' }),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await cancelInventory(record.id)
          message.success(t('asset.inventoryCancelled', { defaultValue: '盤點任務已取消' }))
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const handleSubmitReport = async () => {
    if (!currentTask) return
    // 收集所有非 pending 状态的明细作为已盘点结果
    const items = detailItems
      .filter(i => i.status !== 'pending')
      .map(i => ({ assetId: i.assetId, status: i.status as 'normal' | 'lost' | 'damaged', remark: i.remark }))
    if (items.length === 0) {
      message.warning(t('asset.noItemsChecked', { defaultValue: '尚未核對任何資產，請先在明細中標記狀態' }))
      return
    }
    try {
      setSubmitting(true)
      await submitInventoryResult(currentTask.taskNo, items)
      message.success(t('asset.reportSubmitted'))
      setDetailOpen(false)
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /** 明细表中修改单条资产盘点状态 */
  const handleItemStatusChange = (itemId: number, newStatus: string) => {
    setDetailItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, status: newStatus as InventoryItemRecord['status'] } : i
    ))
  }

  const columns: TableColumnsType<AssetInventoryRecord> = [
    { title: t('asset.colTaskNo'), dataIndex: 'taskNo', key: 'taskNo', width: 150 },
    { title: t('asset.colTaskName'), dataIndex: 'taskName', key: 'taskName', width: 220 },
    { title: t('asset.colInventoryDate'), dataIndex: 'inventoryDate', key: 'inventoryDate', width: 120 },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 120 },
    { title: t('asset.colExpectedCount'), dataIndex: 'expectedCount', key: 'expectedCount', width: 100, align: 'right' },
    { title: t('asset.colActualCount'), dataIndex: 'actualCount', key: 'actualCount', width: 100, align: 'right' },
    {
      title: t('asset.colDiffCount'), dataIndex: 'diffCount', key: 'diffCount', width: 100, align: 'right',
      render: (v: number) => v === 0
        ? <span style={{ color: '#52C41A' }}>0</span>
        : <span style={{ color: '#FF4D4F' }}>{v}</span>,
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (s: AssetInventoryRecord['status']) => {
        if (s === 'completed') return <Tag color="success">{t('asset.statusCompleted')}</Tag>
        if (s === 'cancelled') return <Tag color="default">{t('asset.statusCancelled', { defaultValue: '已取消' })}</Tag>
        return <Tag color="processing">{t('asset.statusInProgress')}</Tag>
      },
    },
    { title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record) => {
        const actions: React.ReactNode[] = []
        // 详情按钮
        actions.push(
          <Button key="detail" type="link" size="small" onClick={() => handleOpenDetail(record)}>
            {record.status === 'in_progress' ? t('asset.btnSubmitReport') : t('common.detail')}
          </Button>
        )
        // 取消按钮（仅进行中状态）
        if (record.status === 'in_progress') {
          actions.push(
            <Button key="cancel" type="link" size="small" danger onClick={() => handleCancel(record)}>
              {t('common.cancel')}
            </Button>
          )
        }
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            {actions}
          </Space>
        )
      },
    },
  ]

  /** 盘点明细表格列 */
  const itemColumns: TableColumnsType<InventoryItemRecord> = [
    { title: t('asset.colAssetNo', { defaultValue: '資產編號' }), dataIndex: 'assetNo', key: 'assetNo', width: 130 },
    { title: t('asset.colAssetName', { defaultValue: '資產名稱' }), dataIndex: 'assetName', key: 'assetName', width: 180, ellipsis: true },
    { title: t('asset.colAssetType', { defaultValue: '分類' }), dataIndex: 'assetType', key: 'assetType', width: 100 },
    { title: t('asset.colLocation', { defaultValue: '位置' }), dataIndex: 'location', key: 'location', width: 120, ellipsis: true },
    {
      title: t('asset.colCheckStatus', { defaultValue: '盤點狀態' }), dataIndex: 'status', key: 'status', width: 130,
      render: (s: InventoryItemRecord['status'], record) => {
        if (currentTask?.status !== 'in_progress') {
          // 只读模式
          const colorMap: Record<string, string> = { pending: 'default', normal: 'success', lost: 'error', damaged: 'warning' }
          const labelMap: Record<string, string> = {
            pending: t('asset.checkPending', { defaultValue: '未盤' }),
            normal: t('asset.checkNormal', { defaultValue: '正常' }),
            lost: t('asset.checkLost', { defaultValue: '缺失' }),
            damaged: t('asset.checkDamaged', { defaultValue: '損壞' }),
          }
          return <Tag color={colorMap[s]}>{labelMap[s]}</Tag>
        }
        return (
          <Select
            size="small"
            value={s}
            style={{ width: 90 }}
            onChange={(val) => handleItemStatusChange(record.id, val)}
            options={[
              { value: 'pending', label: t('asset.checkPending', { defaultValue: '未盤' }) },
              { value: 'normal', label: t('asset.checkNormal', { defaultValue: '正常' }) },
              { value: 'lost', label: t('asset.checkLost', { defaultValue: '缺失' }) },
              { value: 'damaged', label: t('asset.checkDamaged', { defaultValue: '損壞' }) },
            ]}
          />
        )
      },
    },
    { title: t('asset.colRemark', { defaultValue: '備註' }), dataIndex: 'remark', key: 'remark', ellipsis: true },
  ]

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('asset.colTaskName')}>
            <Input
              placeholder={t('asset.taskNamePh')}
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => { setPage(1); loadData() }}
            />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')}>
            <Select
              allowClear
              style={{ width: 120 }}
              placeholder={t('common.all', { defaultValue: '全部' })}
              value={statusFilter}
              onChange={(val) => { setStatusFilter(val); setPage(1) }}
              options={[
                { value: 'in_progress', label: t('asset.statusInProgress') },
                { value: 'completed', label: t('asset.statusCompleted') },
                { value: 'cancelled', label: t('asset.statusCancelled', { defaultValue: '已取消' }) },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => { setPage(1); loadData() }}>
                {t('common.search')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('asset.btnNewInventory')}
          </Button>
        </div>
      </div>

      <Table<AssetInventoryRecord>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{
          current: page, pageSize: 10, total,
          onChange: (p) => setPage(p || 1),
        }}
        scroll={{ x: 1400 }}
      />

      {/* 发起盘点弹窗 */}
      <Modal
        title={t('asset.modalNewInventory')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t('asset.colTaskName')} name="taskName" rules={[{ required: true, message: t('asset.taskNameRequired') }]}>
            <Input placeholder={t('asset.taskNamePh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colOperator')} name="operator" rules={[{ required: true, message: t('asset.operatorRequired') }]}>
            <Input placeholder={t('asset.userNamePh')} allowClear />
          </Form.Item>
          <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8 }}>
            <Button onClick={() => setCreateOpen(false)} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} loading={submitting}>
              {t('common.save')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 盘点详情 / 提交盘点结果 */}
      <Modal
        title={currentTask ? `${currentTask.status === 'in_progress' ? t('asset.modalSubmitReport') : t('common.detail')} - ${currentTask.taskNo}` : ''}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={currentTask?.status === 'in_progress' ? (
          <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <Button onClick={() => setDetailOpen(false)} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleSubmitReport} loading={submitting}>
              {t('asset.btnSubmitReport')}
            </Button>
          </div>
        ) : null}
        width={900}
        destroyOnClose
      >
        {currentTask && (
          <>
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Row gutter={16}>
                <Col span={12}><b>{t('asset.colTaskName')}:</b> {currentTask.taskName}</Col>
                <Col span={12}><b>{t('asset.colInventoryDate')}:</b> {currentTask.inventoryDate}</Col>
                <Col span={12} style={{ marginTop: 8 }}><b>{t('asset.colOperator')}:</b> {currentTask.operator}</Col>
                <Col span={12} style={{ marginTop: 8 }}>
                  <b>{t('asset.colExpectedCount')}:</b> {currentTask.expectedCount}
                  {currentTask.status !== 'in_progress' && (
                    <>
                      {' '} | <b>{t('asset.colActualCount')}:</b> {currentTask.actualCount}
                      {' '} | <b>{t('asset.colDiffCount')}:</b>{' '}
                      <span style={{ color: currentTask.diffCount === 0 ? '#52C41A' : '#FF4D4F' }}>
                        {currentTask.diffCount}
                      </span>
                    </>
                  )}
                </Col>
              </Row>
            </Card>
            <Table<InventoryItemRecord>
              columns={itemColumns}
              dataSource={detailItems}
              rowKey="id"
              loading={detailLoading}
              size="small"
              pagination={detailItems.length > 10 ? { pageSize: 10, size: 'small' } : false}
              scroll={{ y: 400 }}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
