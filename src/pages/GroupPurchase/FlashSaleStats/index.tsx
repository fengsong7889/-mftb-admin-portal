import { useState, useEffect, useMemo, useCallback } from 'react'
import { Table, Button, Input, Select, Form, Space, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import FlashSaleTierCell from '../../../components/FlashSaleTierCell'
import FlashSaleImportModal from '../../../components/FlashSaleImportModal'
import { fetchFlashSalePeriods, fetchFlashSaleStats, importFlashSaleStats } from '../../../api/flashSale'
import type { FlashSalePeriod, FlashSaleStatsVO } from '../../../api/flashSale'
import type { ParsedFlashSaleExcel } from '../../../utils/flashSaleImport'
import {
  SUBSIDY_TYPE_LABEL,
  SUBSIDY_TYPE_TAG_COLOR,
  SUBSIDY_TYPE_OPTIONS,
  SUBSIDY_NONE,
  LAST_PERIOD_NONE_DATA,
  FLASH_PRICE_TYPE,
  FLASH_PRICE_TYPE_LABEL,
} from '../../../constants/flashSale'

/** 团购管理 - 秒杀商品统计 */
export default function FlashSaleStats() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<FlashSaleStatsVO[]>([])
  const [periods, setPeriods] = useState<FlashSalePeriod[]>([])
  const [periodNo, setPeriodNo] = useState<number | undefined>(undefined)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [importVisible, setImportVisible] = useState(false)

  /** 加载列表 */
  const fetchList = useCallback(async (page = 1, pageSize = 10, overridePeriod?: number) => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const res = await fetchFlashSaleStats({
        periodNo: overridePeriod ?? periodNo,
        subsidyType: values.subsidyType,
        bd: values.bd,
        keyword: values.keyword,
        page,
        size: pageSize,
      })
      setDataSource(res.records)
      setPagination({ current: page, pageSize, total: res.total })
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [form, periodNo, t])

  useEffect(() => {
    fetchFlashSalePeriods().then(list => {
      setPeriods(list)
      const latest = list[0]?.periodNo
      setPeriodNo(latest)
      fetchList(1, 10, latest)
    }).catch(() => { /* 静默 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 查询 */
  const handleSearch = () => {
    fetchList(1, pagination.pageSize)
  }

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    fetchList(1, pagination.pageSize)
  }

  /** 期数切换 */
  const handlePeriodChange = (value: number) => {
    setPeriodNo(value)
    fetchList(1, pagination.pageSize, value)
  }

  /** 分页变化 */
  const handleTableChange = (pag: { current?: number; pageSize?: number }) => {
    fetchList(pag.current, pag.pageSize)
  }

  /** 导出 */
  const handleExport = () => {
    message.info('导出功能开发中...')
  }

  /** 导入解析完成 */
  const handleImportParsed = async (parsed: ParsedFlashSaleExcel) => {
    if (!periodNo) {
      message.warning('請先選擇期數')
      return
    }
    if (parsed.statsRows.length === 0) {
      message.warning('文件中未解析到統計數據（sheet 名需包含「銷量」或「統計」）')
      return
    }
    const result = await importFlashSaleStats(periodNo, parsed.statsRows)
    if (result.errors.length > 0) {
      message.warning(`導入完成：成功 ${result.successCount} 條，失敗 ${result.errors.length} 條（${result.errors[0].reason}）`)
    } else {
      message.success(`導入成功 ${result.successCount} 條`)
    }
    fetchList(1, pagination.pageSize)
  }

  /** 渲染环比值（null = 无上期数据） */
  const renderChange = (value: number | null | undefined) => {
    if (value === null || value === undefined) return <span style={{ color: '#BFBFBF' }}>-</span>
    const color = value > 0 ? '#52C41A' : value < 0 ? '#FF4D4F' : '#8C8C8C'
    const prefix = value > 0 ? '+' : ''
    return <span style={{ color, fontWeight: 500 }}>{prefix}{(value * 100).toFixed(1)}%</span>
  }

  /** 上期有无补贴展示 */
  const renderLastPeriodSubsidy = (val: string | null | undefined) => {
    if (!val || val === SUBSIDY_NONE) return <Tag color="default">否</Tag>
    if (val === LAST_PERIOD_NONE_DATA) return <span style={{ color: '#BFBFBF' }}>無上期數據</span>
    return <Tag color={SUBSIDY_TYPE_TAG_COLOR[val]}>{SUBSIDY_TYPE_LABEL[val] ?? val}</Tag>
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'productId', title: '商品ID' },
    { key: 'productName', title: '商品名稱' },
    { key: 'storeNames', title: '商品門店' },
    { key: 'priceType', title: '類型' },
    { key: 'flashSalePrice', title: '秒殺價' },
    { key: 'orderUsers', title: '下單用戶' },
    { key: 'totalPrice', title: '總價' },
    { key: 'totalOrders', title: '訂單總數' },
    { key: 'totalSales', title: '商品總銷量' },
    { key: 'actualAmount', title: '實付金額' },
    { key: 'orderUsersChange', title: '下單用戶環比' },
    { key: 'totalPriceChange', title: '總價環比' },
    { key: 'totalOrdersChange', title: '訂單總數環比' },
    { key: 'totalSalesChange', title: '銷量環比' },
    { key: 'actualAmountChange', title: '實付環比' },
    { key: 'subsidyType', title: '是否補貼品' },
    { key: 'discountRate', title: '折扣率' },
    { key: 'lastPeriodSubsidy', title: '上期有無補貼' },
    { key: 'bdName', title: '所屬BD' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('flash-sale-stats', columnMeta)

  /** 表格列定义 */
  const columns: TableColumnsType<FlashSaleStatsVO> = [
    { title: '商品ID', dataIndex: 'productId', key: 'productId', width: 150, fixed: 'left' },
    { title: '商品名稱', dataIndex: 'productName', key: 'productName', width: 200, fixed: 'left', ellipsis: true },
    { title: '商品門店', dataIndex: 'storeNames', key: 'storeNames', width: 200, ellipsis: true },
    {
      title: '類型',
      dataIndex: 'priceType',
      key: 'priceType',
      width: 100,
      render: (val: string) => (
        <Tag color={val === FLASH_PRICE_TYPE.TIER ? 'orange' : 'blue'}>
          {FLASH_PRICE_TYPE_LABEL[val] ?? val}
        </Tag>
      ),
    },
    {
      title: '秒殺價',
      dataIndex: 'flashSalePrice',
      key: 'flashSalePrice',
      width: 190,
      render: (_: unknown, record) =>
        record.priceType === FLASH_PRICE_TYPE.TIER
          ? <FlashSaleTierCell tiers={record.tiers} />
          : record.flashSalePrice !== null && record.flashSalePrice !== undefined
            ? <span style={{ color: '#E8720C', fontWeight: 600 }}>MOP {Number(record.flashSalePrice).toFixed(2)}</span>
            : <span style={{ color: '#BFBFBF' }}>-</span>,
    },
    { title: '下單用戶', dataIndex: 'orderUsers', key: 'orderUsers', width: 100, align: 'right' },
    {
      title: '總價',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 110,
      align: 'right',
      render: (val: number | null) => val !== null && val !== undefined ? `MOP ${Number(val).toFixed(2)}` : '-',
    },
    { title: '訂單總數', dataIndex: 'totalOrders', key: 'totalOrders', width: 100, align: 'right' },
    { title: '商品總銷量', dataIndex: 'totalSales', key: 'totalSales', width: 110, align: 'right' },
    {
      title: '實付金額',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 110,
      align: 'right',
      render: (val: number | null) => val !== null && val !== undefined ? `MOP ${Number(val).toFixed(2)}` : '-',
    },
    { title: '下單用戶環比', dataIndex: 'orderUsersChange', key: 'orderUsersChange', width: 110, align: 'right', render: renderChange },
    { title: '總價環比', dataIndex: 'totalPriceChange', key: 'totalPriceChange', width: 100, align: 'right', render: renderChange },
    { title: '訂單總數環比', dataIndex: 'totalOrdersChange', key: 'totalOrdersChange', width: 110, align: 'right', render: renderChange },
    { title: '銷量環比', dataIndex: 'totalSalesChange', key: 'totalSalesChange', width: 100, align: 'right', render: renderChange },
    { title: '實付環比', dataIndex: 'actualAmountChange', key: 'actualAmountChange', width: 100, align: 'right', render: renderChange },
    {
      title: '是否補貼品',
      dataIndex: 'subsidyType',
      key: 'subsidyType',
      width: 100,
      render: (val: string) =>
        !val || val === SUBSIDY_NONE
          ? <Tag color="default">否</Tag>
          : <Tag color={SUBSIDY_TYPE_TAG_COLOR[val]}>{SUBSIDY_TYPE_LABEL[val] ?? val}</Tag>,
    },
    {
      title: '折扣率',
      dataIndex: 'discountRate',
      key: 'discountRate',
      width: 90,
      align: 'right',
      render: (val: number | null) => val !== null && val !== undefined ? `${(Number(val) * 100).toFixed(2)}%` : '-',
    },
    {
      title: '上期有無補貼',
      dataIndex: 'lastPeriodSubsidy',
      key: 'lastPeriodSubsidy',
      width: 110,
      render: renderLastPeriodSubsidy,
    },
    { title: '所屬BD', dataIndex: 'bdName', key: 'bdName', width: 90 },
  ]

  return (
    <div className="content-area">
      {/* 搜索区域 */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="periodNo" label="期數">
            <Select
              value={periodNo}
              onChange={handlePeriodChange}
              options={periods.map(p => ({ label: `第${p.periodNo}期`, value: p.periodNo }))}
            />
          </Form.Item>
          <Form.Item name="subsidyType" label="是否補貼品">
            <Select
              placeholder="全部"
              allowClear
              options={[...SUBSIDY_TYPE_OPTIONS, { value: SUBSIDY_NONE, label: '否' }]}
            />
          </Form.Item>
          <Form.Item name="bd" label="所屬BD">
            <Input placeholder="請輸入BD姓名" allowClear />
          </Form.Item>
          <Form.Item name="keyword" label="商品ID/名稱">
            <Input placeholder="請輸入商品ID或名稱" allowClear />
          </Form.Item>
          <Form.Item className="search-actions">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按钮区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-import" icon={<ImportOutlined />} onClick={() => setImportVisible(true)}>
            批量導入
          </Button>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 表格区域 */}
      <Table
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 條`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 2600 }}
        size="middle"
      />

      {/* 批量导入弹窗 */}
      <FlashSaleImportModal
        open={importVisible}
        onClose={() => setImportVisible(false)}
        hint="支持秒殺數據分析 Excel（.xlsx / .xls），自動解析「有銷量」sheet 的環比/補貼/階梯數據"
        onParsed={handleImportParsed}
      />
    </div>
  )
}
