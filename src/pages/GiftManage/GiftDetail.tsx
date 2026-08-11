import { useState, useCallback, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Modal, Form, InputNumber, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  PlusOutlined,
  AuditOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import type { GiftRecordItem } from '../../api/gift'
import { fetchGiftRecords, deductGiftDays } from '../../api/gift'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import type { StoreItem } from '../../api/store'
import { fetchStoresByGroup } from '../../api/store'
import { getApprovalRecords } from '../../utils/approvalStore'

export default function GiftDetail() {
  const { t } = useTranslation('giftDetail')
  const navigate = useNavigate()
  // 菜单权限：gift-detail
  const { hasPermission } = useAuth()

  /** 廣告類型 */
  const adTypeOptions = [
    { label: t('common:all'), value: '' },
    { label: t('adTypeNewStore'), value: 'new_store' },
    { label: t('adTypeRevival'), value: 'revival' },
    { label: t('adTypeExclusive'), value: 'exclusive' },
    { label: t('adTypeGold'), value: 'gold' },
    { label: t('adTypeKa'), value: 'ka' },
  ]

  const adTypeMap: Record<string, string> = {
    new_store: t('adTypeNewStore'),
    revival: t('adTypeRevival'),
    exclusive: t('adTypeExclusive'),
    gold: t('adTypeGold'),
    ka: t('adTypeKa'),
  }
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
  const [_selectedRows, setSelectedRows] = useState<GiftRecordItem[]>([])

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

  // 審批中的贈送申請數（TG 流程為本地記錄，列表加載時同步刷新）
  const [pendingGiftCount, setPendingGiftCount] = useState(0)
  useEffect(() => {
    setPendingGiftCount(
      getApprovalRecords().filter(r => r.approvalType === 'gift' && r.flowStatus === 'pending').length,
    )
  }, [dataSource])

  /** 跳轉審批中心並自動篩選贈送類型流程（含審批中/已駁回等全部狀態） */
  const handleGoApproval = () => {
    navigate('/approval-center?approvalType=gift')
  }

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
      message.error(t('common:queryFailed'))
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
    message.success(t('common:exportDev'))
  }

  const handleViewDetail = (record: GiftRecordItem) => {
    // 列表按门店+广告类型聚合，明细页以 storeId+adType 加载逐笔记录
    navigate(`/gift-detail-view?storeId=${record.storeId}&adType=${record.adType}`)
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

  const _handleDeduct = (record: GiftRecordItem) => {
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
      message.success(t('deductSuccess'))
      setDeductModalVisible(false)
      loadData()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(t('deductFailed'))
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
      title: t('colGroupInfo'),
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
      title: t('colStoreInfo'),
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
      title: t('common:brand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brand: string) => <BrandTag value={brand} />,
    },
    {
      title: t('colAdType'),
      dataIndex: 'adType',
      key: 'adType',
      width: 110,
      render: (adType: string) => adTypeMap[adType] || adType,
    },
    {
      title: t('colRemainingDays'),
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      render: (days: number, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
            {days} {t('dayUnit')}
          </span>
          {(record.recordCount ?? 1) > 1 && (
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('giftCountTip', { count: record.recordCount })}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: t('common:action'),
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
            {t('giftConsumeDetail')}
          </Button>
          {hasPermission('gift-detail:create') && (
            <Button
              type="link"
              size="small"
              onClick={() => handleGift(record)}
            >
              {t('gift')}
            </Button>
          )}
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
          <Form.Item name="groupInfo" label={t('searchGroupIdName')}>
            <Select
              placeholder={t('searchGroupIdPlaceholder')}
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
          <Form.Item name="storeInfo" label={t('searchStoreIdName')}>
            <Select
              placeholder={t('searchStoreIdPlaceholder')}
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
          <Form.Item name="brand" label={t('common:brand')}>
            <Select
              placeholder={t('common:all')}
              allowClear
              options={brandOptions}
              value={searchBrand || undefined}
              onChange={(v) => setSearchBrand(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="adType" label={t('colAdType')}>
            <Select
              placeholder={t('common:all')}
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
                {t('common:search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common:reset')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按鈕 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('gift-detail:export') && (
            <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
              {t('common:export')}
            </Button>
          )}
          <Button icon={<AuditOutlined />} onClick={handleGoApproval}>{t('viewApprovalProgress')}</Button>
          {pendingGiftCount > 0 && (
            <span
              onClick={handleGoApproval}
              style={{ color: '#E8720C', fontSize: 13, cursor: 'pointer', alignSelf: 'center' }}
            >
              {t('pendingApprovalTip', { count: pendingGiftCount })}
            </span>
          )}
        </div>
        <div className="action-section-right">
          {hasPermission('gift-detail:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {t('addGift')}
            </Button>
          )}
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
          showTotal: (total) => t('common:total', { count: total }),
        }}
        scroll={{ x: 1500 }}
      />

      {/* 扣除彈窗 */}
      <Modal
        title={t('deductTitle')}
        open={deductModalVisible}
        onOk={handleDeductOk}
        onCancel={() => setDeductModalVisible(false)}
        okText={t('confirmDeduct')}
        cancelText={t('common:cancel')}
        okButtonProps={{ danger: true }}
        width={500}
      >
        {currentRecord && (
          <div style={{ marginTop: 16 }}>
            <div style={{ padding: '12px 16px', background: '#FFF7E6', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#595959' }}>
                <span>{t('groupLabel')}：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{currentRecord.groupName}</span>
                <span style={{ margin: '0 12px' }}>|</span>
                <span>{t('adTypeLabel')}：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{adTypeMap[currentRecord.adType]}</span>
              </div>
              <div style={{ fontSize: 13, color: '#595959', marginTop: 8 }}>
                <span>{t('remainingDaysLabel')}：</span>
                <span style={{ color: '#52C41A', fontWeight: 700, fontSize: 16 }}>{currentRecord.remainingDays} {t('dayUnit')}</span>
              </div>
            </div>
            <Form form={deductForm} layout="vertical">
              <Form.Item
                name="deductDays"
                label={t('deductDaysLabel')}
                rules={[
                  { required: true, message: t('inputDeductDays') },
                  {
                    type: 'number',
                    min: 1,
                    max: currentRecord.remainingDays,
                    message: t('deductDaysMax', { max: currentRecord.remainingDays }),
                  },
                ]}
              >
                <InputNumber
                  placeholder={t('deductDaysPlaceholder')}
                  min={1}
                  max={currentRecord.remainingDays}
                  style={{ width: '100%' }}
                  addonAfter={t('dayUnit')}
                />
              </Form.Item>
              <Form.Item
                name="reason"
                label={t('deductReasonLabel')}
                rules={[{ required: true, message: t('deductReasonPlaceholder') }]}
              >
                <Input.TextArea
                  placeholder={t('deductReasonPlaceholder')}
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
