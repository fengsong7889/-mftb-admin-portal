/**
 * 供應商管理列表（全宽表格布局）
 *
 * - 搜索区：名稱/編碼/聯繫人/狀態
 * - 表格列：編碼、名稱、聯繫人、聯繫電話、開戶銀行、銀行賬號、備註、狀態、操作
 * - 操作列：詳情 | 修改 | 停用(啟用) | 刪除
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space, Switch } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchSupplierList, deleteSupplier, toggleSupplierStatus, type EamSupplier,
} from '../../../api/eam'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import '../AssetCategory/index.css'

type SupplierRow = EamSupplier

interface Props {
  onAdd: () => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  name?: string
  code?: string
  contactPerson?: string
  status?: string
}

export default function SupplierList({ onAdd, onEdit, onView }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchCode, setSearchCode] = useState<string>()
  const [searchContact, setSearchContact] = useState<string>()
  const [searchStatus, setSearchStatus] = useState<string>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchSupplierList()
      setSuppliers(list)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('common.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setSearchName(v.name || undefined)
    setSearchCode(v.code || undefined)
    setSearchContact(v.contactPerson || undefined)
    setSearchStatus(v.status || undefined)
  }

  const handleReset = () => {
    form.resetFields()
    setSearchName(undefined)
    setSearchCode(undefined)
    setSearchContact(undefined)
    setSearchStatus(undefined)
  }

  /** 表格数据：按搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = suppliers
    if (searchName) {
      list = list.filter(s => s.name.toLowerCase().includes(searchName.toLowerCase()))
    }
    if (searchCode) {
      list = list.filter(s => s.code.toLowerCase().includes(searchCode.toLowerCase()))
    }
    if (searchContact) {
      list = list.filter(s => (s.contactPerson ?? '').toLowerCase().includes(searchContact.toLowerCase()))
    }
    if (searchStatus) {
      list = list.filter(s => s.status === searchStatus)
    }
    return list
  }, [suppliers, searchName, searchCode, searchContact, searchStatus])

  const handleDelete = (record: SupplierRow) => {
    Modal.confirm({
      title: t('asset.confirmDeleteSupplier'),
      content: `${record.name}（${record.code}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteSupplier(record.id)
          message.success(t('common.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('common.deleteFailed'))
        }
      },
    })
  }

  /** 停用/啟用切換 */
  const handleToggle = (record: SupplierRow) => {
    const enabling = record.status !== 'enabled'
    Modal.confirm({
      title: enabling ? t('asset.confirmEnableSupplier') : t('asset.confirmDisableSupplier'),
      content: `${record.name}（${record.code}）`,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await toggleSupplierStatus(record.id)
          message.success(enabling ? t('common.enableSuccess') : t('common.disableSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('common.operationFailed'))
        }
      },
    })
  }

  const handleExport = () => {
    if (tableData.length === 0) {
      message.warning(t('asset.noDataExport'))
      return
    }
    message.success(t('common.exportDev'))
  }

  /* ── 列字段配置 ── */
  const columnMeta = useMemo(() => [
    { key: 'code', title: t('asset.colCode') },
    { key: 'name', title: t('asset.supplierNameLabel') },
    { key: 'contactCount', title: t('asset.contactPersonCol') },
    { key: 'bankName', title: t('asset.bankNameLabel') },
    { key: 'bankAccount', title: t('asset.bankAccountLabel') },
    { key: 'remark', title: t('asset.colRemark') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-supplier', columnMeta)

  const columns: TableColumnsType<SupplierRow> = [
    {
      title: t('asset.colCode'), dataIndex: 'code', key: 'code', width: 110, ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: t('asset.supplierNameLabel'), dataIndex: 'name', key: 'name', width: 200, ellipsis: true,
    },
    {
      title: t('asset.contactPersonCol'), dataIndex: 'contactCount', key: 'contactCount', width: 90, align: 'center',
      render: (v: number | undefined) => v ? <Tag color="blue">{t('common.total', { count: v })}</Tag> : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('asset.bankNameLabel'), dataIndex: 'bankName', key: 'bankName', width: 200, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.bankAccountLabel'), dataIndex: 'bankAccount', key: 'bankAccount', width: 180, ellipsis: true,
      render: (v: string | undefined) => v
        ? <span style={{ fontFamily: 'monospace' }}>{v}</span>
        : '-',
    },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string, record: SupplierRow) => (
        <Switch
          checked={v === 'enabled'}
          checkedChildren={t('common.enable')}
          unCheckedChildren={t('common.disable')}
          style={{
            backgroundColor: v === 'enabled' ? '#E8720C' : '#D9D9D9',
          }}
          onClick={() => handleToggle(record)}
        />
      ),
    },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: SupplierRow) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.supplierNameLabel')} name="name">
            <Input placeholder={t('asset.supplierNamePh')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('asset.colCode')} name="code">
            <Input placeholder={t('asset.locCodePh')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('asset.contactPersonCol')} name="contactPerson">
            <Input placeholder={t('asset.contactPersonPh')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ minWidth: 120 }}
              options={[
                { label: t('common.enable'), value: 'enabled' },
                { label: t('common.disable'), value: 'disabled' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            {t('asset.addSupplierBtn')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Table<SupplierRow>
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('asset.locPaginationTotal', { count: total }),
        }}
      />
    </>
  )
}
