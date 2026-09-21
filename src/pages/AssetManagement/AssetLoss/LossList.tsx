/**
 * 遺失單列表頁
 *
 * - 展示所有遺失單（單號/資產/來源/原持有人/部門/登記日期/未結天數/狀態/跟進/操作）
 * - 支持按遺失單號、資產編號/名稱、原持有人、部門、來源、狀態、登記日期搜索
 * - 點擊行進入遺失單詳情
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { type Dayjs } from 'dayjs'
import { fetchLossList, type LossRow, type LossQuery } from '../../../api/eamLoss'

interface Props {
  onViewDetail: (lossId: number) => void
  onCreate: () => void
}

interface Filters {
  keyword?: string
  status?: string
  sourceType?: string
  lossDates?: [Dayjs, Dayjs]
}

/** 狀態標籤配色 */
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  searching: { color: 'orange', label: '尋找中' },
  found_pending: { color: 'blue', label: '待驗收' },
  recovered: { color: 'green', label: '已找回' },
  written_off: { color: 'default', label: '已核銷' },
}

const SOURCE_MAP: Record<string, string> = {
  return: '歸還驗收',
  claim: '領用報失',
  borrow: '借用報失',
  direct: '主動報失',
}

export default function LossList({ onViewDetail, onCreate }: Props) {
  const [form] = Form.useForm<Filters>()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<LossRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const loadData = useCallback(async (p: number, ps: number) => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const query: LossQuery = { page: p, size: ps }
      if (values.keyword) query.keyword = values.keyword
      if (values.status) query.status = values.status
      if (values.sourceType) query.sourceType = values.sourceType
      if (values.lossDates?.[0]) query.startDate = values.lossDates[0].format('YYYY-MM-DD')
      if (values.lossDates?.[1]) query.endDate = values.lossDates[1].format('YYYY-MM-DD')
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
    { title: '遺失單號', dataIndex: 'lossNo', width: 150, fixed: 'left' },
    { title: '資產編號', dataIndex: 'assetNo', width: 120 },
    { title: '資產名稱', dataIndex: 'assetName', width: 160, ellipsis: true },
    { title: '來源', dataIndex: 'sourceType', width: 100, render: (v: string) => SOURCE_MAP[v] || v },
    { title: '原持有人', dataIndex: 'originalHolderName', width: 100 },
    { title: '原部門', dataIndex: 'originalDepartment', width: 120, ellipsis: true },
    { title: '登記日期', dataIndex: 'lossDate', width: 110 },
    { title: '未結天數', dataIndex: 'openDays', width: 90, align: 'right', render: (v: number) => v != null ? `${v} 天` : '-' },
    {
      title: '狀態', dataIndex: 'status', width: 100,
      render: (v: string) => {
        const s = STATUS_MAP[v]
        return s ? <Tag color={s.color}>{s.label}</Tag> : v
      },
    },
    { title: '跟進次數', dataIndex: 'followUpCount', width: 100, align: 'right', render: (v: number) => v ?? 0 },
    { title: '最近跟進', dataIndex: 'lastFollowUpAt', width: 160 },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_, record) => (
        <a onClick={() => onViewDetail(record.id)} style={{ color: '#E8720C' }}>
          查看
        </a>
      ),
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'lossNo', title: '遺失單號' },
    { key: 'assetNo', title: '資產編號' },
    { key: 'assetName', title: '資產名稱' },
    { key: 'sourceType', title: '來源' },
    { key: 'originalHolderName', title: '原持有人' },
    { key: 'originalDepartment', title: '原部門' },
    { key: 'lossDate', title: '登記日期' },
    { key: 'openDays', title: '未結天數' },
    { key: 'status', title: '狀態' },
    { key: 'followUpCount', title: '跟進次數' },
    { key: 'lastFollowUpAt', title: '最近跟進' },
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
          <Form.Item label="關鍵詞" name="keyword">
            <Input placeholder="單號/資產/持有人" allowClear />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear options={[
              { value: 'searching', label: '尋找中' },
              { value: 'found_pending', label: '待驗收' },
              { value: 'recovered', label: '已找回' },
              { value: 'written_off', label: '已核銷' },
            ]} />
          </Form.Item>
          <Form.Item label="來源" name="sourceType">
            <Select placeholder="全部" allowClear options={[
              { value: 'return', label: '歸還驗收' },
              { value: 'direct', label: '主動報失' },
              { value: 'claim', label: '領用報失' },
              { value: 'borrow', label: '借用報失' },
            ]} />
          </Form.Item>
          <Form.Item label="登記日期" name="lossDates">
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
        scroll={{ x: 1400 }}
        locale={{ emptyText: <Empty description="無此資料" /> }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.id),
          style: { cursor: 'pointer' },
        })}
      />
    </>
  )
}
