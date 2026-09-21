/**
 * 遺失單列表頁
 *
 * - 展示所有遺失單（單號/資產/來源/使用人/部門/登記日期/未結天數/狀態/跟進/更新人/更新日期/操作）
 * - 支持按遺失單號、資產編號/名稱、來源、使用人、部門、狀態、登記日期、最後更新人、最後更新日期搜索
 * - 操作列：詳情（只讀）、跟進（已核銷僅詳情）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { type Dayjs } from 'dayjs'
import BrandTag from '../../../components/BrandTag'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import { fetchLossList, type LossRow, type LossQuery } from '../../../api/eamLoss'

interface Props {
  onViewDetail: (lossId: number) => void
  onFollowUp: (lossId: number) => void
  onCreate: () => void
}

interface Filters {
  lossNo?: string
  assetKeyword?: string
  sourceType?: string
  originalHolderName?: string
  department?: string
  status?: string
  lossDates?: [Dayjs, Dayjs]
  updatedBy?: string
  updateDates?: [Dayjs, Dayjs]
  companyBrand?: number
}

/** 狀態標籤配色 */
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  searching: { color: 'orange', label: '尋找中' },
  found_pending: { color: 'blue', label: '待驗收' },
  recovered: { color: 'green', label: '已找回' },
  written_off: { color: 'default', label: '已核銷' },
}

const SOURCE_MAP: Record<string, { color: string; label: string }> = {
  return: { color: 'blue', label: '歸還驗收' },
  claim: { color: 'orange', label: '領用報失' },
  borrow: { color: 'purple', label: '借用報失' },
  direct: { color: 'cyan', label: '主動報失' },
}

export default function LossList({ onViewDetail, onFollowUp, onCreate }: Props) {
  const { numericOptions } = useCompanyBrand()
  const [form] = Form.useForm<Filters>()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<LossRow[]>([])
  const [_total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const loadData = useCallback(async (p: number, ps: number) => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const query: LossQuery = { page: p, size: ps }
      if (values.lossNo) query.lossNo = values.lossNo
      if (values.assetKeyword) query.assetKeyword = values.assetKeyword
      if (values.sourceType) query.sourceType = values.sourceType
      if (values.originalHolderName) query.originalHolderName = values.originalHolderName
      if (values.department) query.department = values.department
      if (values.status) query.status = values.status
      if (values.lossDates?.[0]) query.startDate = values.lossDates[0].format('YYYY-MM-DD')
      if (values.lossDates?.[1]) query.endDate = values.lossDates[1].format('YYYY-MM-DD')
      if (values.updatedBy) query.updatedBy = values.updatedBy
      if (values.updateDates?.[0]) query.updateStartDate = values.updateDates[0].format('YYYY-MM-DD')
      if (values.updateDates?.[1]) query.updateEndDate = values.updateDates[1].format('YYYY-MM-DD')
      if (values.companyBrand) query.companyBrand = values.companyBrand
      const res = await fetchLossList(query)
      setDataSource(res.records)
      setTotal(res.total)
    } catch {
      setDataSource([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => { loadData(page, pageSize) }, [page, pageSize, loadData])

  const handleSearch = () => { setPage(1); loadData(1, pageSize) }
  const handleReset = () => { form.resetFields(); setPage(1); loadData(1, pageSize) }

  const allColumns: TableColumnsType<LossRow> = [
    { title: '遺失單號', key: 'lossNo', dataIndex: 'lossNo', width: 150, fixed: 'left' },
    { title: '資產編號', key: 'assetNo', dataIndex: 'assetNo', width: 120 },
    { title: '資產名稱', key: 'assetName', dataIndex: 'assetName', width: 160, ellipsis: true },
    {
      title: '所屬品牌', key: 'companyBrand', dataIndex: 'companyBrand', width: 100,
      render: (v: number | null | undefined) => v ? <BrandTag value={v} /> : '-',
    },
    {
      title: '來源', key: 'sourceType', dataIndex: 'sourceType', width: 110,
      render: (v: string) => {
        const s = SOURCE_MAP[v]
        return s ? <Tag color={s.color}>{s.label}</Tag> : v
      },
    },
    { title: '遺失時使用人', key: 'originalHolderName', dataIndex: 'originalHolderName', width: 120 },
    { title: '遺失時所在部門', key: 'originalDepartment', dataIndex: 'originalDepartment', width: 130, ellipsis: true },
    { title: '登記日期', key: 'lossDate', dataIndex: 'lossDate', width: 110 },
    { title: '未結天數', key: 'openDays', dataIndex: 'openDays', width: 90, align: 'right', render: (v: number) => v != null ? `${v} 天` : '-' },
    {
      title: '狀態', key: 'status', dataIndex: 'status', width: 100,
      render: (v: string) => {
        const s = STATUS_MAP[v]
        return s ? <Tag color={s.color}>{s.label}</Tag> : v
      },
    },
    { title: '跟進次數', key: 'followUpCount', dataIndex: 'followUpCount', width: 90, align: 'right', render: (v: number) => v ?? 0 },
    { title: '最後更新人', key: 'updatedByName', dataIndex: 'updatedByName', width: 110 },
    { title: '最後更新時間', key: 'updatedAt', dataIndex: 'updatedAt', width: 160 },
    {
      title: '操作', key: 'action', width: 140, fixed: 'right',
      render: (_, record) => {
        const isWrittenOff = record.status === 'written_off'
        return (
          <span>
            <a onClick={() => onViewDetail(record.id)} style={{ color: '#E8720C' }}>
              詳情
            </a>
            {!isWrittenOff && (
              <>
                <span className="action-split" />
                <a onClick={() => onFollowUp(record.id)} style={{ color: '#1890FF' }}>
                  跟進
                </a>
              </>
            )}
          </span>
        )
      },
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'lossNo', title: '遺失單號' },
    { key: 'assetNo', title: '資產編號' },
    { key: 'assetName', title: '資產名稱' },
    { key: 'companyBrand', title: '所屬品牌' },
    { key: 'sourceType', title: '來源' },
    { key: 'originalHolderName', title: '遺失時使用人' },
    { key: 'originalDepartment', title: '遺失時所在部門' },
    { key: 'lossDate', title: '登記日期' },
    { key: 'openDays', title: '未結天數' },
    { key: 'status', title: '狀態' },
    { key: 'followUpCount', title: '跟進次數' },
    { key: 'updatedByName', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('asset-loss', columnMeta, [
    { key: 'lossNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="遺失單號" name="lossNo">
            <Input placeholder="請輸入遺失單號" allowClear />
          </Form.Item>
          <Form.Item label="資產編號/名稱" name="assetKeyword">
            <Input placeholder="資產編號或名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="companyBrand">
            <Select placeholder="全部" allowClear options={numericOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="來源" name="sourceType">
            <Select placeholder="全部" allowClear options={[
              { value: 'return', label: '歸還驗收' },
              { value: 'direct', label: '主動報失' },
              { value: 'claim', label: '領用報失' },
              { value: 'borrow', label: '借用報失' },
            ]} />
          </Form.Item>
          <Form.Item label="遺失時使用人" name="originalHolderName">
            <Input placeholder="使用人姓名" allowClear />
          </Form.Item>
          <Form.Item label="所在部門" name="department">
            <Input placeholder="部門名稱" allowClear />
          </Form.Item>
          <Form.Item label="登記日期" name="lossDates">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear options={[
              { value: 'searching', label: '尋找中' },
              { value: 'found_pending', label: '待驗收' },
              { value: 'recovered', label: '已找回' },
              { value: 'written_off', label: '已核銷' },
            ]} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="更新人姓名" allowClear />
          </Form.Item>
          <Form.Item label="最後更新日期" name="updateDates">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>登記遺失</Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<LossRow>
        rowKey="id"
        columns={applyConfig(allColumns) as TableColumnsType<LossRow>}
        dataSource={dataSource}
        loading={loading}
        size="middle"
        scroll={{ x: 1700 }}
        locale={{ emptyText: <Empty description="無此資料" /> }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />
    </>
  )
}
