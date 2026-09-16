/**
 * 供應商管理 詳情頁（只讀）
 *
 * - 使用 DetailPageHeader 組件（橙色返回 + 藍色標題 + 右側編輯按鈕）
 * - 卡片式佈局：基本信息 + 聯繫人列表（表格）
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions, Tag, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { ContactsOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import {
  fetchSupplierList, fetchSupplierContacts,
  type EamSupplier, type SupplierContactItem,
} from '../../../api/eam'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

export default function SupplierDetail({ id, onBack, onEdit }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [supplier, setSupplier] = useState<EamSupplier | null>(null)
  const [contacts, setContacts] = useState<SupplierContactItem[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, contactList] = await Promise.all([
        fetchSupplierList(),
        fetchSupplierContacts(id),
      ])
      const cur = list.find((s) => s.id === id)
      if (cur) setSupplier(cur)
      setContacts(contactList || [])
    } catch {
      setSupplier(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  /* ── 樣式（對齊 OrderDetail 規範） ── */
  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: '20px 24px',
    marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  }

  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  const contactColumns: TableColumnsType<SupplierContactItem> = [
    {
      title: t('asset.contactNameLabel'), dataIndex: 'contactName', key: 'contactName', width: 150,
      render: (v: string) => v || '-',
    },
    {
      title: t('asset.contactPhoneLabel'), dataIndex: 'contactPhone', key: 'contactPhone', width: 180,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => v === 'enabled'
        ? <Tag color="green" style={{ margin: 0 }}>{t('common.enable')}</Tag>
        : <Tag color="default" style={{ margin: 0 }}>{t('common.disable')}</Tag>,
    },
    {
      title: t('asset.createdAtCol'), dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (v: string) => v || '-',
    },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span style={{ color: '#8C8C8C' }}>{t('asset.supplierNotExist')}</span>
      </div>
    )
  }

  return (
    <>
      {/* ====== 頂部標題欄（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={supplier.name}
        tags={supplier.status === 'enabled'
          ? <Tag color="green">{t('common.enable')}</Tag>
          : <Tag color="default">{t('common.disable')}</Tag>}
        meta={<>{supplier.code}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息 ====== */}
      <div style={cardStyle}>
        {cardTitle(
          <ContactsOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
          '#E6F7FF',
          t('asset.basicInfoTitle'),
        )}
        <Descriptions column={3} size="middle">
          <Descriptions.Item label={t('asset.codeLabel')}>
            <span style={{ fontFamily: 'monospace' }}>{supplier.code}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.supplierNameLabel')}>{supplier.name}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colStatus')}>
            {supplier.status === 'enabled'
              ? <Tag color="green" style={{ margin: 0 }}>{t('common.enable')}</Tag>
              : <Tag color="default" style={{ margin: 0 }}>{t('common.disable')}</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.bankNameLabel')}>{supplier.bankName || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.bankAccountLabel')}>
            {supplier.bankAccount
              ? <span style={{ fontFamily: 'monospace' }}>{supplier.bankAccount}</span>
              : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colUpdatedBy')}>{supplier.updatedBy || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUpdatedAt')} span={2}>{supplier.updatedAt || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark')} span={3}>{supplier.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 聯繫人列表 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px',
        marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {cardTitle(
          <ContactsOutlined style={{ fontSize: 14, color: '#52c41a' }} />,
          '#F6FFED',
          t('asset.contactInfoTitle'),
        )}
        <Table<SupplierContactItem>
          columns={contactColumns}
          dataSource={contacts}
          rowKey={(r) => r.id?.toString() || r.contactName + (r.contactPhone || '')}
          pagination={false}
          size="small"
          locale={{ emptyText: t('asset.noContacts') }}
        />
      </div>

      {/* ====== 最後更新 ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByColon')}<span style={{ color: '#595959' }}>{supplier.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtColon')}<span style={{ color: '#595959' }}>{supplier.updatedAt || '-'}</span></span>
      </div>
    </>
  )
}
