/**
 * 人員主檔列表（/hcm-person）——C3 花名冊第一批。
 *
 * 與舊「員工管理」的關係：舊頁面以 sys_user 為事實源，本頁以 person 為事實源，
 * C6 切換前兩者並存；本頁明確標「新版主檔」，避免使用者以為同一份數據被拆成兩處。
 * 本期只做人員本身；雇傭與任職在詳情頁只讀展示，維護入口隨下一批交付。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { deletePerson, listPersons, type Person } from '../../../api/hcmPerson'

interface Filters {
  keyword?: string
  status?: number
}

export default function HcmPersonList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Person[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const res = await listPersons({ page: nextPage, size: nextSize, ...nextFilters })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    void loadData(page, pageSize, filters)
    // 三个显式参数已覆盖取数口径
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters])

  const handleSearch = () => {
    setPage(1)
    setFilters(form.getFieldsValue())
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleDelete = (record: Person) => {
    Modal.confirm({
      title: t('hcmPerson.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmPerson.name')}：</span><b>{record.name}</b></div>
          <div className="confirm-info-row"><span>{t('hcmPerson.personNo')}：</span><b>{record.personNo || '-'}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deletePerson(record.id as number)
        message.success(t('hcmPerson.deleteSuccess'))
        void loadData()
      },
    })
  }

  const columnMeta = useMemo(() => ([
    { key: 'personNo', title: t('hcmPerson.personNo') },
    { key: 'name', title: t('hcmPerson.name') },
    { key: 'mobile', title: t('hcmPerson.mobile') },
    { key: 'nationality', title: t('hcmPerson.nationality') },
    { key: 'account', title: t('hcmPerson.account') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('hcm-person', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<Person> = [
    { key: 'personNo', title: t('hcmPerson.personNo'), dataIndex: 'personNo', width: 150, render: (v: string) => v || '-' },
    { key: 'name', title: t('hcmPerson.name'), dataIndex: 'name', width: 140 },
    { key: 'mobile', title: t('hcmPerson.mobile'), dataIndex: 'mobile', width: 150 },
    { key: 'nationality', title: t('hcmPerson.nationality'), dataIndex: 'nationality', width: 110 },
    {
      key: 'account', title: t('hcmPerson.account'), dataIndex: 'sysUserId', width: 120,
      render: (value: number | null) => (value
        ? <Tag color="blue">{t('hcmPerson.hasAccount')}</Tag>
        : <Tag color="default">{t('hcmPerson.noAccount')}</Tag>),
    },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy'), dataIndex: 'updatedBy', width: 130 },
    {
      key: 'action', title: t('common.action'), width: 170, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-person-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-person-form?id=${record.id}`)}>
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
    <div className="content-area">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('hcmPerson.legacyNotice')}
      />

      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
              <Input placeholder={t('hcmPerson.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[
                { value: 1, label: t('hcmOrg.enabled') },
                { value: 0, label: t('hcmOrg.disabled') },
              ]} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <div className="search-actions" style={{ paddingTop: 26 }}>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-person-form')}>
            {t('hcmPerson.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<Person>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<Person>}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
          onChange: (nextPage, nextSize) => {
            setPage(nextSize !== pageSize ? 1 : nextPage)
            setPageSize(nextSize || 20)
          },
        }}
      />
    </div>
  )
}
