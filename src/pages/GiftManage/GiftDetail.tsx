import { useState, useCallback, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Modal, Form, InputNumber, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useNavigate } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import type { GiftRecordItem } from '../../api/gift'
import { fetchGiftRecords, deductGiftDays } from '../../api/gift'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import type { StoreItem } from '../../api/store'
import { fetchStoresByGroup } from '../../api/store'

/** 廣告類型 */
const adTypeOptions = [
  { label: '全部', value: '' },
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '獨家商家', value: 'exclusive' },
  { label: '金牌商家', value: 'gold' },
  { label: '人氣商家', value: 'ka' },
]

const adTypeMap: Record<string, string> = {
  new_store: '新店廣告',
  revival: '盤活復蘇',
  exclusive: '獨家商家',
  gold: '金牌商家',
  ka: '人氣商家',
}

export default function GiftDetail() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [deductModalVisible, setDeductModalVisible] = useState(false)
  const [currentRecord, setCurrentRecord] = useState<GiftRecordItem | null>(null)
  const [deductForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<GiftRecordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  // 勾选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [selectedRows, setSelectedRows] = useState<GiftRecordItem[]>([])

  // 搜索条件（已生效）
  const [groupId, setGroupId] = useState<number | undefined>()
  const [storeId, setStoreId] = useState<number | undefined>()
  const [brand, setBrand] = useState('')
  const [adType, setAdType] = useState('')

  // 搜索条件（表单暂存）
  const [searchGroupId, setSearchGroupId] = useState<number | undefined>()
  const [searchStoreId, setSearchStoreId] = useState<number | undefined>()
  const [searchBrand, setSearchBrand] = useState('')
  const [searchAdType, setSearchAdType] = useState('')

  // 集团/门店下拉
  const [groups, setGroups] = useState<MerchantGroupItem[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])

  // 加载集团下拉
  useEffect(() => {
    fetchAllMerchantGroups()
      .then(setGroups)
      .catch(() => {})
  }, [])

  // 当搜索集团变化时加载门店下拉
  useEffect(() => {
    if (searchGroupId) {
      fetchStoresByGroup(searchGroupId)
        .then(setStores)
        .catch(() => setStores([]))
    } else {
      setStores([])
    }
    setSearchStoreId(undefined)
  }, [searchGroupId])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchGiftRecords({
        page, size,
        groupId: groupId || undefined,
        storeId: storeId || undefined,
        brand: brand || undefined,
        adType: adType || undefined,
      })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      message.error('查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [page, size, groupId, storeId, brand, adType])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSearch = () => {
    setGroupId(searchGroupId)
    setStoreId(searchStoreId)
    setBrand(searchBrand)
    setAdType(searchAdType)
    setPage(1)
  }

  const handleReset = () => {
    form.resetFields()
    setSearchGroupId(undefined)
    setSearchStoreId(undefined)
    setSearchBrand('')
    setSearchAdType('')
    setGroupId(undefined)
    setStoreId(undefined)
    setBrand('')
    setAdType('')
    setPage(1)
  }

  const handleExport = () => {
    message.success('導出功能開發中...')
  }

  const handleViewDetail = (record: GiftRecordItem) => {
    navigate(`/gift-detail-view?id=${record.id}`)
  }

  const handleAdd = () => {
    navigate('/gift-add')
  }

  const handleGift = (record: GiftRecordItem) => {
    const params = new URLSearchParams({
      mode: 'gift',
      group: `${record.groupId}`,
      store: `${record.storeId}`,
      brand: record.brand,
      adType: record.adType,
    })
    navigate(`/gift-add?${params.toString()}`)
  }

  const handleDeduct = (record: GiftRecordItem) => {
    setCurrentRecord(record)
    deductForm.resetFields()
    setDeductModalVisible(true)
  }

  const handleDeductOk = async () => {
    if (!currentRecord) return
    try {
      const values = await deductForm.validateFields()
      await deductGiftDays(currentRecord.id, {
        deductDays: values.deductDays,
        reason: values.reason,
      })
      message.success('扣除成功')
      setDeductModalVisible(false)
      loadData()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('扣除失敗，請重試')
    }
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const handleSelectChange = (keys: React.Key[], rows: GiftRecordItem[]) => {
    setSelectedRowKeys(keys)
    setSelectedRows(rows)
  }

  const columns: TableColumnsType<GiftRecordItem> = [
    {
      title: '集團ID/集團名稱',
      key: 'groupInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.groupCode || record.groupId}</span>
          <span>{record.groupName}</span>
        </Space>
      ),
    },
    {
      title: '門店ID/門店名稱',
      key: 'storeInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.storeCode || record.storeId}</span>
          <span>{record.storeName}</span>
        </Space>
      ),
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brand: string) => <BrandTag value={brand} />,
    },
    {
      title: '廣告類型',
      dataIndex: 'adType',
      key: 'adType',
      width: 110,
      render: (adType: string) => adTypeMap[adType] || adType,
    },
    {
      title: '剩餘天數',
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      render: (days: number) => (
        <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
          {days} 天
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => handleViewDetail(record)}
          >
            贈送明細
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleGift(record)}
          >
            贈送
          </Button>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('gift-detail', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])
  const configuredColumns = applyConfig(columns)

  return (
    <div className="content-area">
      {/* 搜索區域 */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ width: '100%' }}>
          <Form.Item name="groupInfo" label="集團ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchGroupId}
              onChange={setSearchGroupId}
              options={groups.map(g => ({
                label: `${g.groupCode} - ${g.groupName}`,
                value: g.id,
              }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="storeInfo" label="門店ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchStoreId}
              onChange={setSearchStoreId}
              disabled={!searchGroupId}
              options={stores.map(s => ({
                label: `${s.storeCode} - ${s.storeName}`,
                value: s.id,
              }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="brand" label="所屬品牌">
            <Select
              placeholder="全部"
              allowClear
              options={brandOptions}
              value={searchBrand || undefined}
              onChange={(v) => setSearchBrand(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="adType" label="廣告類型">
            <Select
              placeholder="全部"
              allowClear
              options={adTypeOptions}
              value={searchAdType || undefined}
              onChange={(v) => setSearchAdType(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item className="search-actions">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按鈕 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增贈送
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Table
        columns={configuredColumns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        onChange={handleTableChange}
        rowSelection={{
          selectedRowKeys,
          onChange: handleSelectChange,
          columnWidth: 40,
          fixed: true,
        }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
        }}
        scroll={{ x: 1500 }}
      />

      {/* 扣除彈窗 */}
      <Modal
        title="扣除贈送天數"
        open={deductModalVisible}
        onOk={handleDeductOk}
        onCancel={() => setDeductModalVisible(false)}
        okText="確認扣除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={500}
      >
        {currentRecord && (
          <div style={{ marginTop: 16 }}>
            <div style={{ padding: '12px 16px', background: '#FFF7E6', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#595959' }}>
                <span>集團：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{currentRecord.groupName}</span>
                <span style={{ margin: '0 12px' }}>|</span>
                <span>廣告類型：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{adTypeMap[currentRecord.adType]}</span>
              </div>
              <div style={{ fontSize: 13, color: '#595959', marginTop: 8 }}>
                <span>剩餘天數：</span>
                <span style={{ color: '#52C41A', fontWeight: 700, fontSize: 16 }}>{currentRecord.remainingDays} 天</span>
              </div>
            </div>
            <Form form={deductForm} layout="vertical">
              <Form.Item
                name="deductDays"
                label="扣除天數"
                rules={[
                  { required: true, message: '請輸入扣除天數' },
                  {
                    type: 'number',
                    min: 1,
                    max: currentRecord.remainingDays,
                    message: `扣除天數不能超過 ${currentRecord.remainingDays} 天`,
                  },
                ]}
              >
                <InputNumber
                  placeholder="請輸入扣除天數"
                  min={1}
                  max={currentRecord.remainingDays}
                  style={{ width: '100%' }}
                  addonAfter="天"
                />
              </Form.Item>
              <Form.Item
                name="reason"
                label="扣除原因"
                rules={[{ required: true, message: '請輸入扣除原因' }]}
              >
                <Input.TextArea
                  placeholder="請輸入扣除原因"
                  rows={3}
                  maxLength={200}
                  showCount
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  )
}
