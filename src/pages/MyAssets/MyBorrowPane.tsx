/**
 * 我的资产 — 借用页签
 *
 * 数据源 /api/eam/borrows/my 与 /my/stats（登录即可，后端强制 holderId = 当前登录人），
 * 因此未授予「借用管理」菜单权限的员工同样能看到本人借用记录。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Table, Tabs, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ExclamationCircleOutlined, FieldTimeOutlined, InboxOutlined, RotateLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import AssetParameters from '../../components/AssetParameters'
import BrandTag from '../../components/BrandTag'
import { useAssetParameterCatalog } from '../../hooks/useAssetParameterCatalog'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchMyBorrowStats, fetchMyBorrows, type BorrowQuery, type BorrowRow, type BorrowStatsData } from '../../api/eamBorrow'
import { BORROW_STATUS_COLOR, BORROW_STATUS_LABEL } from '../AssetManagement/AssetBorrow/borrowStatus'
import { ClaimSection } from '../AssetManagement/AssetClaim/ClaimLayout'
import { TransferError } from '../AssetManagement/AssetTransfer/TransferLayout'
import { useTransferData } from '../AssetManagement/AssetTransfer/useTransferData'
import MyAssetsStats, { type MyAssetsStatItem } from './MyAssetsStats'

const TAB_ALL = 'all'
type BorrowTab = typeof TAB_ALL | BorrowRow['status']

interface Props {
  scopeKey: string
  onOpen: (id: number) => void
}

export default function MyBorrowPane({ scopeKey, onOpen }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const [tab, setTab] = useState<BorrowTab>(TAB_ALL)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  const query = useMemo<BorrowQuery>(() => ({
    page,
    size,
    status: tab === TAB_ALL ? undefined : tab,
  }), [page, size, tab])

  const fetcher = useCallback(() => fetchMyBorrows(query), [query])
  const { data, loading, error, refresh } = useTransferData(fetcher)

  /** 本人借用统计（失败保持未加载态，卡片显示 —） */
  const [stats, setStats] = useState<BorrowStatsData>()
  useEffect(() => {
    let active = true
    fetchMyBorrowStats().then((result) => { if (active) setStats(result) }).catch(() => { if (active) setStats(undefined) })
    return () => { active = false }
  }, [])

  const statItems = useMemo<MyAssetsStatItem[]>(() => [
    { key: 'total', label: t('myAssets.borrowStatTotal', '本人借用記錄'), value: stats?.totalCount, icon: <InboxOutlined />, color: '#1890FF', background: '#E6F7FF' },
    { key: 'active', label: t('myAssets.borrowStatActive', '借用中'), value: stats?.activeCount, icon: <FieldTimeOutlined />, color: '#52C41A', background: '#F6FFED' },
    { key: 'overdue', label: t('myAssets.borrowStatOverdue', '已逾期'), value: stats?.overdueCount, icon: <ExclamationCircleOutlined />, color: '#FF4D4F', background: '#FFF1F0' },
    { key: 'returned', label: t('myAssets.borrowStatReturned', '已歸還'), value: stats?.returnedCount, icon: <RotateLeftOutlined />, color: '#E8720C', background: '#FFF7E6' },
  ], [stats, t])

  const tabs: { key: BorrowTab; label: string }[] = [
    { key: TAB_ALL, label: t('myAssets.tabAll', '全部記錄') },
    { key: 'active', label: t('myAssets.borrowStatActive', '借用中') },
    { key: 'overdue', label: t('myAssets.borrowStatOverdue', '已逾期') },
    { key: 'returned', label: t('myAssets.borrowStatReturned', '已歸還') },
  ]

  const columns = useMemo<TableColumnsType<BorrowRow>>(() => [
    { key: 'borrowNo', title: t('asset.colBorrowNo'), dataIndex: 'borrowNo', width: 175, fixed: 'left' },
    {
      key: 'asset', title: t('asset.colAssetName'), width: 200,
      render: (_, row) => <>{row.assetName}<div className="claim-muted">{row.assetNo}</div></>,
    },
    { key: 'companyBrand', title: t('asset.colCompanyBrand', '所屬品牌'), dataIndex: 'companyBrand', width: 100, render: (value?: number | null) => (value ? <BrandTag value={value} /> : '—') },
    { key: 'params', title: t('asset.paramInfoTitle'), width: 240, render: (_, row) => <AssetParameters asset={row} compact catalog={paramCatalog} /> },
    { key: 'startDate', title: t('myAssets.colStartDate', '借出日期'), dataIndex: 'startDate', width: 120 },
    {
      key: 'dueDate', title: t('myAssets.colDueDate', '到期日期'), dataIndex: 'dueDate', width: 120,
      render: (value: string, row) => <span style={{ color: row.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: row.status === 'overdue' ? 600 : 400 }}>{value}</span>,
    },
    { key: 'overdueDays', title: t('myAssets.colOverdueDays', '逾期天數'), width: 100, align: 'center', render: (_, row) => (row.status === 'overdue' ? row.overdueDays ?? '—' : '—') },
    { key: 'renewCount', title: t('myAssets.colRenewCount', '續借次數'), dataIndex: 'renewCount', width: 100, align: 'center' },
    { key: 'purpose', title: t('myAssets.colPurpose', '借用用途'), dataIndex: 'purpose', width: 180, ellipsis: true, render: (value?: string) => value || '—' },
    { key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 110, render: (value: string) => <Tag color={BORROW_STATUS_COLOR[value]}>{BORROW_STATUS_LABEL[value] || value}</Tag> },
    {
      key: 'action', title: t('common.colAction'), width: 90, fixed: 'right',
      render: (_, row) => <Button type="link" size="small" onClick={() => onOpen(row.id)}>{t('common.detail')}</Button>,
    },
  ], [onOpen, paramCatalog, t])

  const { applyConfig, configComponent } = useColumnConfig('my-borrow-records',
    columns.map((column) => ({ key: String(column.key), title: String(column.title) })))

  const overdueCount = stats?.overdueCount ?? 0

  return (
    <ClaimSection title={t('myAssets.borrowSection', '我的借用記錄')} icon={<FieldTimeOutlined />}>
      <MyAssetsStats items={statItems} scopeKey={scopeKey} ariaLabel={t('myAssets.borrowSection', '我的借用記錄')} />
      <TransferError error={error} retry={refresh} />
      {overdueCount > 0 && (
        <Alert
          type="error"
          showIcon
          className="claim-notice"
          message={t('myAssets.borrowOverdueAlert', '您有 {{count}} 筆借用已逾期', { count: overdueCount })}
          description={t('myAssets.borrowOverdueDesc', '逾期資產請盡快歸還或申請續借，歸還與續借由資產管理員在借用管理內辦理。')}
          action={<Button size="small" type="link" onClick={() => { setTab('overdue'); setPage(1) }}>{t('myAssets.goHandle', '去處理')}</Button>}
        />
      )}
      <div className="claim-table-tools">
        <span className="claim-muted">{t('myAssets.borrowNote', '僅展示本人名下的借用記錄；續借、歸還請聯繫資產管理員辦理。')}</span>
        {configComponent}
      </div>
      <Tabs
        activeKey={tab}
        items={tabs.map((item) => ({ key: item.key, label: item.label }))}
        onChange={(key) => { setTab(key as BorrowTab); setPage(1) }}
      />
      <Table<BorrowRow>
        rowKey="id"
        columns={applyConfig(columns) as TableColumnsType<BorrowRow>}
        dataSource={error ? [] : data?.records ?? []}
        loading={loading}
        size="middle"
        scroll={{ x: 1445 }}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        pagination={{
          current: page,
          pageSize: size,
          total: data?.total ?? 0,
          showQuickJumper: true,
          showSizeChanger: true,
          showTotal: (count) => t('asset.totalItems', { total: count }),
          onChange: (next, nextSize) => { setPage(nextSize === size ? next : 1); setSize(nextSize) },
        }}
      />
    </ClaimSection>
  )
}
