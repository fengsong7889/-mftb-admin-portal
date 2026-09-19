/**
 * 維修記錄全局列表
 *
 * - 展示所有資產的維修記錄（單號/資產/故障/維修方/費用/狀態）
 * - 支持按狀態、關鍵詞搜索
 * - 點擊資產編號跳轉資產詳情，點擊行跳轉維修詳情
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker, InputNumber, Row, Col } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { exportToCSV } from '../../../utils/exportCSV'
import dayjs from 'dayjs'
import {
  fetchRepairList, fetchAssetList, updateRepair, deleteRepair,
  type AssetRepairRecord, type AssetItem,
} from '../../../api/asset'

interface Props {
  onViewAsset: (assetNo: string) => void
  onViewDetail: (assetId: number) => void
}

export default function RepairList({ onViewAsset, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetRepairRecord[]>([])
  const [filters, setFilters] = useState<{ keyword?: string; status?: 'repairing' | 'done' }>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const [assetList, setAssetList] = useState<AssetItem[]>([])
  const [assetKeyword, setAssetKeyword] = useState('')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<AssetRepairRecord | null>(null)
  const [editForm] = Form.useForm()
  const [editSubmitting, setEditSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRepairList({ status: filters.status })
      let list = res
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase()
        list = list.filter(
          (r) =>
            r.assetNo.toLowerCase().includes(kw) ||
            r.assetName.toLowerCase().includes(kw) ||
            r.faultDesc.toLowerCase().includes(kw) ||
            r.repairBy.toLowerCase().includes(kw) ||
            r.applicant.toLowerCase().includes(kw),
        )
      }
      setDataSource(list)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword || undefined,
      status: v.status || undefined,
    })
  }
  const handleReset = () => { form.resetFields(); setFilters({}) }

  const handleExport = () => {
    const cols = [
      { title: t('asset.colAssetNo'), dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { title: t('asset.colRepairDate'), dataIndex: 'repairDate' },
      { title: t('asset.colFaultDesc'), dataIndex: 'faultDesc' },
      { title: t('asset.colRepairContent'), dataIndex: 'repairContent' },
      { title: t('asset.colRepairBy'), dataIndex: 'repairBy' },
      { title: t('asset.colCost'), dataIndex: 'cost' },
      { title: t('asset.colStatus'), dataIndex: 'status' },
      { title: t('asset.colFinishDate'), dataIndex: 'finishDate' },
      { title: t('asset.colApplicant'), dataIndex: 'applicant' },
      { title: t('asset.colCauseType'), dataIndex: 'causeType' },
    ]
    exportToCSV(`repair_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  const handleOpenAssetModal = () => {
    setAssetModalOpen(true)
    setAssetKeyword('')
    searchAssets('')
  }

  const searchAssets = async (keyword: string) => {
    setAssetSearchLoading(true)
    try {
      const res = await fetchAssetList({ keyword: keyword || undefined, page: 1, size: 20 })
      setAssetList(res.records)
    } catch {
      setAssetList([])
    } finally {
      setAssetSearchLoading(false)
    }
  }

  const handleSelectAsset = (asset: AssetItem) => {
    setAssetModalOpen(false)
    onViewDetail(asset.id)
  }

  const REPAIR_BY_OPTIONS = [
    { value: 'HP 授权维修点', labelKey: 'repairByHp' },
    { value: 'Dell 售后', labelKey: 'repairByDell' },
    { value: '联想服务中心', labelKey: 'repairByLenovo' },
    { value: 'Apple Store', labelKey: 'repairByApple' },
    { value: '自修', labelKey: 'repairBySelf' },
    { value: '其他第三方', labelKey: 'repairByOther' },
  ]

  const handleEdit = (record: AssetRepairRecord) => {
    setEditingRecord(record)
    editForm.setFieldsValue({
      repairDate: dayjs(record.repairDate),
      faultDesc: record.faultDesc,
      repairContent: record.repairContent,
      repairBy: record.repairBy,
      cost: record.cost,
      applicant: record.applicant,
      causeType: record.causeType,
    })
    setEditModalOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!editingRecord) return
    try {
      const v = await editForm.validateFields()
      setEditSubmitting(true)
      await updateRepair(editingRecord.id, {
        repairDate: v.repairDate.format('YYYY-MM-DD'),
        faultDesc: v.faultDesc,
        repairContent: v.repairContent,
        repairBy: v.repairBy,
        cost: v.cost,
        applicant: v.applicant,
        causeType: v.causeType,
      })
      message.success(t('asset.repairUpdated', '維修記錄已更新'))
      setEditModalOpen(false)
      editForm.resetFields()
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = (record: AssetRepairRecord) => {
    Modal.confirm({
      title: t('asset.confirmDeleteRepair', '確認刪除此維修記錄？'),
      content: `${record.assetNo} - ${record.faultDesc}`,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRepair(record.id)
          message.success(t('asset.repairDeleted', '維修記錄已刪除'))
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.statusRepairing'), value: 'repairing' },
    { label: t('asset.statusRepaired'), value: 'done' },
  ]

  const allColumns: TableColumnsType<AssetRepairRecord> = [
    {
      key: 'assetNo', title: t('asset.colAssetNo'), dataIndex: 'assetNo', width: 140, fixed: 'left',
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={(e) => { e.stopPropagation(); onViewAsset(v) }}
        >
          {v}
        </Button>
      ),
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 180, ellipsis: true },
    { key: 'repairDate', title: t('asset.colRepairDate'), dataIndex: 'repairDate', width: 120 },
    { key: 'faultDesc', title: t('asset.colFaultDesc'), dataIndex: 'faultDesc', width: 200, ellipsis: true },
    { key: 'repairContent', title: t('asset.colRepairContent'), dataIndex: 'repairContent', width: 200, ellipsis: true },
    { key: 'repairBy', title: t('asset.colRepairBy'), dataIndex: 'repairBy', width: 140 },
    {
      key: 'cost', title: t('asset.colCost'), dataIndex: 'cost', width: 120, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 100,
      render: (s: 'repairing' | 'done') => s === 'repairing'
        ? <Tag color="processing">{t('asset.statusRepairing')}</Tag>
        : <Tag color="success">{t('asset.statusRepaired')}</Tag>,
    },
    {
      key: 'finishDate', title: t('asset.colFinishDate'), dataIndex: 'finishDate', width: 120,
      render: (v: string | null) => v || '-',
    },
    { key: 'applicant', title: t('asset.colApplicant'), dataIndex: 'applicant', width: 110 },
    {
      key: 'causeType', title: t('asset.colCauseType'), dataIndex: 'causeType', width: 120,
      render: (v: string) => v ? <Tag>{t(`asset.cause${v.charAt(0).toUpperCase() + v.slice(1)}`)}</Tag> : '-',
    },
    {
      key: 'action', title: t('common.colAction'), width: 140, fixed: 'right',
      render: (_: unknown, r: AssetRepairRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onViewDetail(r.assetId) }}>{t('common.detail')}</Button>
          {r.status === 'repairing' && (
            <>
              <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); handleEdit(r) }}>{t('common.edit')}</Button>
              <Button type="link" size="small" danger onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>{t('common.delete')}</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'repairDate', title: t('asset.colRepairDate') },
    { key: 'faultDesc', title: t('asset.colFaultDesc') },
    { key: 'repairContent', title: t('asset.colRepairContent') },
    { key: 'repairBy', title: t('asset.colRepairBy') },
    { key: 'cost', title: t('asset.colCost') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'finishDate', title: t('asset.colFinishDate') },
    { key: 'applicant', title: t('asset.colApplicant') },
    { key: 'causeType', title: t('asset.colCauseType') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-repair', columnMeta, [
    { key: 'assetNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  /* ----- 行选择 ----- */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={statusOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Space>
            <Button className="btn-export" icon={<ExportOutlined />} disabled={selectedRowKeys.length === 0} onClick={handleExport}>
              {t('common.export')}
            </Button>
          </Space>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAssetModal}>
            {t('asset.btnNewRepair', '新增維修')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<AssetRepairRecord>
        columns={applyConfig(allColumns) as TableColumnsType<AssetRepairRecord>}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1700 }}
        rowSelection={rowSelection}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.assetId),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
      />

      {/* ====== 選擇資產彈窗 ====== */}
      <Modal
        title={t('asset.selectAssetForRepair', '選擇資產 - 新增維修記錄')}
        open={assetModalOpen}
        onCancel={() => setAssetModalOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <div style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder={t('asset.searchByKeyword', '輸入資產編號/名稱搜索')}
            allowClear
            value={assetKeyword}
            onChange={(e) => setAssetKeyword(e.target.value)}
            onSearch={searchAssets}
            style={{ width: '100%' }}
          />
        </div>
        <Table<AssetItem>
          columns={[
            { title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
              render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
            { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', ellipsis: true },
            { title: t('asset.colAssetType'), dataIndex: 'assetType', key: 'assetType', width: 100 },
            { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 120, ellipsis: true },
            { title: t('asset.colUserName'), dataIndex: 'userName', key: 'userName', width: 100 },
            {
              key: 'action', title: t('common.colAction'), width: 80, fixed: 'right' as const,
              render: (_: unknown, record: AssetItem) => (
                <Button type="link" size="small" onClick={() => handleSelectAsset(record)}>{t('common.select', '選擇')}</Button>
              ),
            },
          ]}
          dataSource={assetList}
          rowKey="id"
          loading={assetSearchLoading}
          size="small"
          pagination={false}
          scroll={{ x: 700, y: 320 }}
          locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        />
      </Modal>

      {/* ====== 編輯維修記錄彈窗 ====== */}
      <Modal
        title={t('asset.modalEditRepair', '編輯維修記錄')}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields() }}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colRepairDate')} name="repairDate" rules={[{ required: true, message: t('asset.repairDateRequired') }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('asset.colRepairBy')} name="repairBy" rules={[{ required: true, message: t('asset.repairByRequired') }]}>
                <Select placeholder={t('asset.repairByPh')}>
                  {REPAIR_BY_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{t(`asset.${o.labelKey}`)}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('asset.colFaultDesc')} name="faultDesc" rules={[{ required: true, message: t('asset.faultDescRequired') }]}>
            <Input.TextArea rows={2} placeholder={t('asset.faultDescPh')} maxLength={300} showCount />
          </Form.Item>
          <Form.Item label={t('asset.colRepairContent')} name="repairContent" rules={[{ required: true, message: t('asset.repairContentRequired') }]}>
            <Input.TextArea rows={2} placeholder={t('asset.repairContentPh')} maxLength={300} showCount />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colCost')} name="cost">
                <InputNumber min={0} step={50} addonAfter="MOP" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('asset.colApplicant')} name="applicant" rules={[{ required: true, message: t('asset.applicantRequired') }]}>
                <Input placeholder={t('asset.userNamePh')} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8 }}>
            <Button onClick={() => { setEditModalOpen(false); editForm.resetFields() }} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleEditSubmit} loading={editSubmitting}>{t('common.save')}</Button>
          </div>
        </Form>
      </Modal>
    </>
  )
}
