import { useState, useEffect, useMemo, useCallback } from 'react'
import { Table, Button, Input, Select, Form, Space, Tag, Modal, InputNumber, AutoComplete, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import FlashSaleTierCell from '../../../components/FlashSaleTierCell'
import FlashSaleImportModal from '../../../components/FlashSaleImportModal'
import {
  fetchFlashSalePeriods,
  fetchFlashSaleRegisters,
  importFlashSaleRegisters,
} from '../../../api/flashSale'
import type { FlashSalePeriod, FlashSaleRegisterVO, FlashSaleTier } from '../../../api/flashSale'
import { fetchStoreOptions } from '../../../api/store'
import type { ParsedFlashSaleExcel } from '../../../utils/flashSaleImport'
import {
  SUBSIDY_TYPE_LABEL,
  SUBSIDY_TYPE_TAG_COLOR,
  SUBSIDY_TYPE_OPTIONS,
  FLASH_PRODUCT_TYPE_LABEL,
  FLASH_PRODUCT_TYPE_OPTIONS,
  FLASH_PRICE_TYPE,
  MAX_PURCHASE_PRESETS,
} from '../../../constants/flashSale'

/** 编辑/新增弹窗的阶梯行 */
interface TierFormRow {
  key: number
  tierPrice?: number
  tierStock?: number
  tierSubsidy?: number
}

let tierRowSeed = 1

/** 团购管理 - 秒杀商品登记 */
export default function FlashSaleRegister() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<FlashSaleRegisterVO[]>([])
  const [periods, setPeriods] = useState<FlashSalePeriod[]>([])
  const [periodNo, setPeriodNo] = useState<number | undefined>(undefined)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [importVisible, setImportVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editing, setEditing] = useState<FlashSaleRegisterVO | null>(null)
  const [saving, setSaving] = useState(false)
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])
  const [tierRows, setTierRows] = useState<TierFormRow[]>([])

  /** 加载期数下拉 */
  const fetchPeriods = useCallback(async () => {
    try {
      const list = await fetchFlashSalePeriods()
      setPeriods(list)
      return list
    } catch {
      return [] as FlashSalePeriod[]
    }
  }, [])

  /** 加载列表 */
  const fetchList = useCallback(async (page = 1, pageSize = 10, overridePeriod?: number) => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const res = await fetchFlashSaleRegisters({
        periodNo: overridePeriod ?? periodNo,
        subsidyType: values.subsidyType,
        productType: values.productType,
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
    fetchPeriods().then(list => {
      const latest = list[0]?.periodNo
      setPeriodNo(latest)
      fetchList(1, 10, latest)
    })
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

  /** 搜索门店下拉 */
  const handleSearchStores = async (keyword: string) => {
    try {
      const opts = await fetchStoreOptions(keyword)
      setStoreOptions(opts.map(o => ({ label: String(o.label), value: String(o.label) })))
    } catch {
      setStoreOptions([])
    }
  }

  /** 打开新增弹窗 */
  const handleOpenCreate = () => {
    setEditing(null)
    editForm.resetFields()
    setTierRows([])
    setEditVisible(true)
  }

  /** 打开编辑弹窗 */
  const handleOpenEdit = (record: FlashSaleRegisterVO) => {
    setEditing(record)
    editForm.setFieldsValue({
      subsidyType: record.subsidyType,
      storeNames: record.storeNames ? record.storeNames.split(',') : [],
      productId: record.productId,
      productName: record.productName,
      productType: record.productType,
      maxPurchase: record.maxPurchase,
      priceType: record.priceType,
      originalPrice: record.originalPrice,
      groupPrice: record.groupPrice,
      flashSalePrice: record.flashSalePrice,
      flashSaleStock: record.flashSaleStock,
    })
    setTierRows(record.tiers.map(tier => ({
      key: tierRowSeed++,
      tierPrice: tier.tierPrice,
      tierStock: tier.tierStock,
      tierSubsidy: tier.tierSubsidy ?? undefined,
    })))
    setEditVisible(true)
  }

  /** 保存（新增/编辑统一走导入 upsert） */
  const handleSave = async () => {
    if (!periodNo) {
      message.warning('請先選擇期數')
      return
    }
    try {
      const values = await editForm.validateFields()
      const priceType: string = values.priceType
      const tiers: FlashSaleTier[] = priceType === FLASH_PRICE_TYPE.TIER
        ? tierRows
          .filter(r => r.tierPrice !== undefined)
          .map((r, idx) => ({
            tierNo: idx + 1,
            tierPrice: r.tierPrice ?? 0,
            tierStock: r.tierStock ?? 0,
            tierSubsidy: r.tierSubsidy ?? 0,
          }))
        : []
      if (priceType === FLASH_PRICE_TYPE.TIER && tiers.length === 0) {
        message.warning('階梯價格至少需要一個階梯')
        return
      }
      setSaving(true)
      const result = await importFlashSaleRegisters(periodNo, [{
        seqNo: editing?.seqNo ?? null,
        subsidyType: values.subsidyType,
        storeNames: (values.storeNames || []).join(','),
        productId: values.productId,
        productName: values.productName,
        productType: values.productType,
        maxPurchase: values.maxPurchase,
        priceType,
        originalPrice: values.originalPrice ?? null,
        groupPrice: values.groupPrice ?? null,
        flashSalePrice: priceType === FLASH_PRICE_TYPE.SINGLE ? (values.flashSalePrice ?? null) : null,
        flashSaleStock: priceType === FLASH_PRICE_TYPE.SINGLE ? (values.flashSaleStock ?? null) : null,
        currentSales: editing?.currentSales ?? null,
        tiers,
      }])
      if (result.errors.length > 0) {
        message.error(result.errors[0].reason)
      } else {
        message.success(editing ? '已更新' : '新增成功')
        setEditVisible(false)
        fetchList(1, pagination.pageSize)
      }
    } catch {
      // 表单校验失败不提示
    } finally {
      setSaving(false)
    }
  }

  /** 导入解析完成 */
  const handleImportParsed = async (parsed: ParsedFlashSaleExcel) => {
    if (!periodNo) {
      message.warning('請先選擇期數')
      return
    }
    if (parsed.registerRows.length === 0) {
      message.warning('文件中未解析到登記數據（sheet 名需包含「登記」）')
      return
    }
    const result = await importFlashSaleRegisters(periodNo, parsed.registerRows)
    if (result.errors.length > 0) {
      message.warning(`導入完成：成功 ${result.successCount} 條，失敗 ${result.errors.length} 條（${result.errors[0].reason}）`)
    } else {
      message.success(`導入成功 ${result.successCount} 條`)
    }
    fetchList(1, pagination.pageSize)
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'subsidyType', title: '補貼類型' },
    { key: 'bdNames', title: 'BD' },
    { key: 'storeNames', title: '門店名稱' },
    { key: 'productName', title: '商品名稱' },
    { key: 'productType', title: '商品類型' },
    { key: 'productId', title: '商品ID' },
    { key: 'maxPurchase', title: '每人最多購買' },
    { key: 'flashSaleStock', title: '秒殺庫存' },
    { key: 'priceTiers', title: '秒殺價階梯' },
    { key: 'originalPrice', title: '原價' },
    { key: 'groupPrice', title: '團購價' },
    { key: 'flashSalePrice', title: '秒殺價' },
    { key: 'currentSales', title: '本期秒殺銷量' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('flash-sale-register', columnMeta)

  /** 表格列定义 */
  const columns: TableColumnsType<FlashSaleRegisterVO> = [
    {
      title: '補貼類型',
      dataIndex: 'subsidyType',
      key: 'subsidyType',
      width: 100,
      fixed: 'left',
      render: (val: string) => <Tag color={SUBSIDY_TYPE_TAG_COLOR[val]}>{SUBSIDY_TYPE_LABEL[val] ?? val}</Tag>,
    },
    { title: 'BD', dataIndex: 'bdNames', key: 'bdNames', width: 90 },
    { title: '門店名稱', dataIndex: 'storeNames', key: 'storeNames', width: 180, ellipsis: true },
    {
      title: '商品名稱',
      dataIndex: 'productName',
      key: 'productName',
      width: 200,
      ellipsis: true,
      render: (val: string, record) => (
        <span>
          {record.blacklist && (
            <Tag color="error" style={{ marginRight: 4 }}>近3期黑榜</Tag>
          )}
          {val}
        </span>
      ),
    },
    {
      title: '商品類型',
      dataIndex: 'productType',
      key: 'productType',
      width: 90,
      render: (val: string) => FLASH_PRODUCT_TYPE_LABEL[val] ?? val,
    },
    { title: '商品ID', dataIndex: 'productId', key: 'productId', width: 150 },
    { title: '每人最多購買', dataIndex: 'maxPurchase', key: 'maxPurchase', width: 110 },
    {
      title: '秒殺庫存',
      dataIndex: 'flashSaleStock',
      key: 'flashSaleStock',
      width: 90,
      align: 'right',
      render: (val: number | null, record) =>
        record.priceType === FLASH_PRICE_TYPE.TIER
          ? <span style={{ color: '#8C8C8C' }}>{record.tiers.reduce((s, tier) => s + (tier.tierStock || 0), 0)}</span>
          : (val ?? '-'),
    },
    {
      title: '秒殺價階梯（價/庫存/補貼）',
      dataIndex: 'tiers',
      key: 'priceTiers',
      width: 220,
      render: (_: unknown, record) => <FlashSaleTierCell tiers={record.tiers} showSubsidy />,
    },
    {
      title: '原價',
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 90,
      align: 'right',
      render: (val: number | null) => val !== null && val !== undefined ? `MOP ${Number(val).toFixed(2)}` : '-',
    },
    {
      title: '團購價',
      dataIndex: 'groupPrice',
      key: 'groupPrice',
      width: 90,
      align: 'right',
      render: (val: number | null) => val !== null && val !== undefined ? `MOP ${Number(val).toFixed(2)}` : '-',
    },
    {
      title: '秒殺價',
      dataIndex: 'flashSalePrice',
      key: 'flashSalePrice',
      width: 90,
      align: 'right',
      render: (val: number | null, record) =>
        record.priceType === FLASH_PRICE_TYPE.SINGLE && val !== null && val !== undefined
          ? <span style={{ color: '#E8720C', fontWeight: 600 }}>MOP {Number(val).toFixed(2)}</span>
          : <span style={{ color: '#8C8C8C' }}>階梯</span>,
    },
    { title: '本期秒殺銷量', dataIndex: 'currentSales', key: 'currentSales', width: 110, align: 'right' },
    {
      title: '操作',
      key: 'action',
      width: 70,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button type="link" style={{ padding: '0 4px', fontSize: 13 }} onClick={() => handleOpenEdit(record)}>
          編輯
        </Button>
      ),
    },
  ]

  const priceTypeWatch = Form.useWatch('priceType', editForm)

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
          <Form.Item name="subsidyType" label="補貼類型">
            <Select placeholder="全部" allowClear options={SUBSIDY_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="productType" label="商品類型">
            <Select placeholder="全部" allowClear options={FLASH_PRODUCT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="bd" label="BD">
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>新增</Button>
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
        scroll={{ x: 1700 }}
        size="middle"
      />

      {/* 批量导入弹窗 */}
      <FlashSaleImportModal
        open={importVisible}
        onClose={() => setImportVisible(false)}
        hint="支持秒殺數據分析 Excel（.xlsx / .xls），自動解析「登記」sheet 的階梯價/庫存/補貼"
        onParsed={handleImportParsed}
      />

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editing ? '編輯秒殺商品登記' : `新增秒殺商品登記（第${periodNo ?? '-'}期）`}
        open={editVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setEditVisible(false)}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" initialValues={{ priceType: FLASH_PRICE_TYPE.SINGLE }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="subsidyType" label="補貼類型" rules={[{ required: true, message: '請選擇補貼類型' }]}>
              <Select placeholder="請選擇" options={SUBSIDY_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="productType" label="商品類型">
              <Select placeholder="請選擇" allowClear options={FLASH_PRODUCT_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="storeNames" label="門店（引用門店管理，BD 保存時自動帶出）" style={{ gridColumn: '1 / -1' }}>
              <Select
                mode="multiple"
                placeholder="請搜索門店名稱"
                showSearch
                filterOption={false}
                onSearch={handleSearchStores}
                options={storeOptions}
              />
            </Form.Item>
            <Form.Item name="productId" label="商品ID" rules={[{ required: true, message: '請輸入商品ID' }]}>
              <Input placeholder="請輸入商品ID" allowClear />
            </Form.Item>
            <Form.Item name="productName" label="商品名稱">
              <Input placeholder="請輸入商品名稱" allowClear />
            </Form.Item>
            <Form.Item name="maxPurchase" label="每人最多購買">
              <AutoComplete placeholder="不限購" options={MAX_PURCHASE_PRESETS.map(v => ({ value: v }))} allowClear />
            </Form.Item>
            <Form.Item name="priceType" label="價格類型">
              <Select
                options={[
                  { label: '單一價格', value: FLASH_PRICE_TYPE.SINGLE },
                  { label: '階梯價格', value: FLASH_PRICE_TYPE.TIER },
                ]}
              />
            </Form.Item>
            <Form.Item name="originalPrice" label="原價">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="原價" addonAfter="MOP" />
            </Form.Item>
            <Form.Item name="groupPrice" label="團購價">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="團購價" addonAfter="MOP" />
            </Form.Item>
            {priceTypeWatch === FLASH_PRICE_TYPE.SINGLE && (
              <>
                <Form.Item name="flashSalePrice" label="秒殺價">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="秒殺價" addonAfter="MOP" />
                </Form.Item>
                <Form.Item name="flashSaleStock" label="秒殺庫存">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="庫存" addonAfter="份" />
                </Form.Item>
              </>
            )}
          </div>
          {priceTypeWatch === FLASH_PRICE_TYPE.TIER && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>秒殺價階梯（階梯價 / 庫存 / 補貼）</div>
              {tierRows.map((row, idx) => (
                <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 46 }}>階梯{idx + 1}</span>
                  <InputNumber min={0} placeholder="價格" addonAfter="MOP" style={{ width: 150 }}
                    value={row.tierPrice} onChange={v => setTierRows(list => list.map(r => r.key === row.key ? { ...r, tierPrice: v ?? undefined } : r))} />
                  <InputNumber min={0} placeholder="庫存" addonAfter="份" style={{ width: 130 }}
                    value={row.tierStock} onChange={v => setTierRows(list => list.map(r => r.key === row.key ? { ...r, tierStock: v ?? undefined } : r))} />
                  <InputNumber min={0} placeholder="補貼" addonAfter="MOP" style={{ width: 140 }}
                    value={row.tierSubsidy} onChange={v => setTierRows(list => list.map(r => r.key === row.key ? { ...r, tierSubsidy: v ?? undefined } : r))} />
                  <Button type="link" danger size="small" style={{ padding: '0 4px' }}
                    disabled={tierRows.length <= 1}
                    onClick={() => setTierRows(list => list.length <= 1 ? list : list.filter(r => r.key !== row.key))}>
                    刪除
                  </Button>
                </div>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} style={{ width: '100%', color: '#E8720C', borderColor: '#E8720C' }}
                onClick={() => setTierRows(list => [...list, { key: tierRowSeed++ }])}>
                添加階梯
              </Button>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  )
}
