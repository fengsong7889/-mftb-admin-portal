/**
 * 资产盘点页
 *
 * 物资部定期盘点：
 *  - 发起盘点任务（任务名称 + 盘点人）
 *  - 录入实盘结果（正常 / 缺失 / 损坏）
 *  - 生成盘点报告：应盘 / 实盘 / 差异
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, Table, Tag, Modal, message, DatePicker, Card, Row, Col,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, AuditOutlined, ToolOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchInventoryList, createInventory, submitInventoryResult,
  type AssetInventoryRecord,
} from '../../../api/asset'

export default function AssetInventory() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AssetInventoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [currentTask, setCurrentTask] = useState<AssetInventoryRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [keyword, setKeyword] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchInventoryList({ page, size: 10 })
      setData(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, t])

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

  const handleOpenReport = (record: AssetInventoryRecord) => {
    setCurrentTask(record)
    setReportOpen(true)
  }

  const handleSubmitReport = async () => {
    if (!currentTask) return
    try {
      setSubmitting(true)
      await submitInventoryResult(currentTask.taskNo, [
        // 模拟数据：实际项目里这里要列出每个资产逐个录入
        { assetId: 1, status: 'normal' },
        { assetId: 2, status: 'normal' },
        { assetId: 3, status: 'lost' },
      ])
      message.success(t('asset.reportSubmitted'))
      setReportOpen(false)
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const columns: TableColumnsType<AssetInventoryRecord> = [
    { title: t('asset.colTaskNo'), dataIndex: 'taskNo', key: 'taskNo', width: 130 },
    { title: t('asset.colTaskName'), dataIndex: 'taskName', key: 'taskName', width: 220 },
    { title: t('asset.colInventoryDate'), dataIndex: 'inventoryDate', key: 'inventoryDate', width: 120 },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 120 },
    { title: t('asset.colExpectedCount'), dataIndex: 'expectedCount', key: 'expectedCount', width: 100, align: 'right' },
    { title: t('asset.colActualCount'), dataIndex: 'actualCount', key: 'actualCount', width: 100, align: 'right' },
    {
      title: t('asset.colDiffCount'), dataIndex: 'diffCount', key: 'diffCount', width: 100, align: 'right',
      render: (v: number) => v === 0 ? <span style={{ color: '#52C41A' }}>0</span> : <span style={{ color: '#FF4D4F' }}>{v}</span>,
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (s: 'in_progress' | 'completed') => s === 'completed'
        ? <Tag color="success">{t('asset.statusCompleted')}</Tag>
        : <Tag color="processing">{t('asset.statusInProgress')}</Tag>,
    },
    { title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: t('common.colAction'), key: 'action', width: 130, fixed: 'right',
      render: (_: unknown, record) => record.status === 'in_progress' ? (
        <Button type="link" size="small" icon={<AuditOutlined />} onClick={() => handleOpenReport(record)}>
          {t('asset.btnSubmitReport')}
        </Button>
      ) : (
        <Button type="link" size="small" icon={<AuditOutlined />} onClick={() => handleOpenReport(record)}>
          {t('common.detail')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('asset.colTaskName')}>
            <Input placeholder={t('asset.taskNamePh')} allowClear value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<ReloadOutlined />} onClick={loadData}>{t('common.search')}</Button>
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
        scroll={{ x: 1300 }}
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

      {/* 提交盘点结果 */}
      <Modal
        title={currentTask ? `${t('asset.modalSubmitReport')} - ${currentTask.taskNo}` : ''}
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={null}
        width={680}
        destroyOnClose
      >
        {currentTask && (
          <>
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Row gutter={16}>
                <Col span={12}><b>{t('asset.colTaskName')}:</b> {currentTask.taskName}</Col>
                <Col span={12}><b>{t('asset.colInventoryDate')}:</b> {currentTask.inventoryDate}</Col>
                <Col span={12} style={{ marginTop: 8 }}><b>{t('asset.colOperator')}:</b> {currentTask.operator}</Col>
                <Col span={12} style={{ marginTop: 8 }}><b>{t('asset.colExpectedCount')}:</b> {currentTask.expectedCount}</Col>
              </Row>
            </Card>
            <p style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 16 }}>
              {t('asset.reportPlaceholder')}
            </p>
            <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Button onClick={() => setReportOpen(false)} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
              <Button type="primary" icon={<ToolOutlined />} onClick={handleSubmitReport} loading={submitting}>
                {t('asset.btnSubmitReport')}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
