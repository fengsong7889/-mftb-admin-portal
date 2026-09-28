/**
 * 我的资产 — 耗材领用页签
 *
 * 数据源 /api/eam/consumables/claims/my 与 /my/stats（登录即可，后端强制 applicantId = 当前登录人）。
 * 耗材领用「提交即出库」，无归还流程，因此页签按单据状态划分。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Table, Tabs, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { AuditOutlined, CheckCircleOutlined, DatabaseOutlined, InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import BrandTag from '../../components/BrandTag'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchMyConsumableClaimStats, fetchMyConsumableClaims, type ConsumableClaim, type ConsumableClaimStats } from '../../api/consumable'
import { CLAIM_STATUS_COLOR, type ClaimStatus } from '../Consumable/Claim/constants'
import { ClaimSection } from '../AssetManagement/AssetClaim/ClaimLayout'
import { TransferError } from '../AssetManagement/AssetTransfer/TransferLayout'
import { useTransferData } from '../AssetManagement/AssetTransfer/useTransferData'
import MyAssetsStats, { type MyAssetsStatItem } from './MyAssetsStats'

const TAB_ALL = 'all'
type ConsumableTab = typeof TAB_ALL | ClaimStatus

interface Props {
  scopeKey: string
  onOpen: (id: number) => void
}

export default function MyConsumablePane({ scopeKey, onOpen }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ConsumableTab>(TAB_ALL)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  const fetcher = useCallback(
    () => fetchMyConsumableClaims({ page, size, status: tab === TAB_ALL ? undefined : tab }),
    [page, size, tab],
  )
  const { data, loading, error, refresh } = useTransferData(fetcher)

  /** 本人耗材领用统计（失败保持未加载态，卡片显示 —） */
  const [stats, setStats] = useState<ConsumableClaimStats>()
  useEffect(() => {
    let active = true
    fetchMyConsumableClaimStats().then((result) => { if (active) setStats(result) }).catch(() => { if (active) setStats(undefined) })
    return () => { active = false }
  }, [])

  const statusLabels: Record<ClaimStatus, string> = {
    pending: t('myAssets.consumablePending', '待發放'),
    approved: t('myAssets.consumableApproved', '待出庫'),
    rejected: t('myAssets.consumableRejected', '已駁回'),
    issued: t('myAssets.consumableIssued', '已出庫'),
    cancelled: t('myAssets.consumableCancelled', '已撤銷'),
  }

  const statItems: MyAssetsStatItem[] = [
    { key: 'total', label: t('myAssets.consumableStatTotal', '本人領用單數'), value: stats?.claimCount, icon: <InboxOutlined />, color: '#1890FF', background: '#E6F7FF' },
    { key: 'pending', label: statusLabels.pending, value: stats?.pendingCount, icon: <AuditOutlined />, color: '#722ED1', background: '#F9F0FF' },
    { key: 'approved', label: statusLabels.approved, value: stats?.approvedCount, icon: <DatabaseOutlined />, color: '#FA8C16', background: '#FFF7E6' },
    { key: 'issued', label: statusLabels.issued, value: stats?.issuedCount, icon: <CheckCircleOutlined />, color: '#52C41A', background: '#F6FFED' },
  ]

  const tabs: { key: ConsumableTab; label: string }[] = [
    { key: TAB_ALL, label: t('myAssets.tabAll', '全部記錄') },
    { key: 'pending', label: statusLabels.pending },
    { key: 'issued', label: statusLabels.issued },
    { key: 'cancelled', label: statusLabels.cancelled },
  ]

  const columns: TableColumnsType<ConsumableClaim> = [
    { key: 'claimNo', title: t('myAssets.colClaimNo', '領用單號'), dataIndex: 'claimNo', width: 170, fixed: 'left', render: (value: string) => <span style={{ fontFamily: 'monospace' }}>{value}</span> },
    { key: 'reason', title: t('myAssets.colReason', '領用事由'), dataIndex: 'reason', width: 220, ellipsis: true, render: (value?: string) => value || '—' },
    { key: 'companyBrand', title: t('asset.colCompanyBrand', '所屬品牌'), dataIndex: 'companyBrand', width: 100, render: (value?: number | null) => (value ? <BrandTag value={value} /> : '—') },
    { key: 'totalKinds', title: t('myAssets.colKinds', '品類數'), dataIndex: 'totalKinds', width: 90, align: 'center' },
    { key: 'totalQty', title: t('myAssets.colQty', '總數量'), dataIndex: 'totalQty', width: 90, align: 'center' },
    { key: 'costAmount', title: t('myAssets.colCost', '成本金額'), dataIndex: 'costAmount', width: 120, align: 'right', render: (value?: number) => `MOP ${(value ?? 0).toFixed(2)}` },
    { key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 110, render: (value: ClaimStatus) => <Tag color={CLAIM_STATUS_COLOR[value]}>{statusLabels[value] ?? value}</Tag> },
    { key: 'createdAt', title: t('myAssets.colAppliedAt', '申請時間'), dataIndex: 'createdAt', width: 165, ellipsis: true, render: (value?: string) => value || '—' },
    {
      key: 'action', title: t('common.colAction'), width: 90, fixed: 'right',
      render: (_, row) => <Button type="link" size="small" onClick={() => onOpen(row.id)}>{t('common.detail')}</Button>,
    },
  ]

  const { applyConfig, configComponent } = useColumnConfig('my-consumable-records',
    columns.map((column) => ({ key: String(column.key), title: String(column.title) })))

  return (
    <ClaimSection title={t('myAssets.consumableSection', '我的耗材領用記錄')} icon={<DatabaseOutlined />}>
      <MyAssetsStats items={statItems} scopeKey={scopeKey} ariaLabel={t('myAssets.consumableSection', '我的耗材領用記錄')} />
      <TransferError error={error} retry={refresh} />
      <div className="claim-table-tools">
        <span className="claim-muted">{t('myAssets.consumableNote', '僅展示本人提交的耗材領用單；耗材為一次性領用，無歸還流程。')}</span>
        {configComponent}
      </div>
      <Tabs
        activeKey={tab}
        items={tabs.map((item) => ({ key: item.key, label: item.label }))}
        onChange={(key) => { setTab(key as ConsumableTab); setPage(1) }}
      />
      <Table<ConsumableClaim>
        rowKey="id"
        columns={applyConfig(columns) as TableColumnsType<ConsumableClaim>}
        dataSource={error ? [] : data?.records ?? []}
        loading={loading}
        size="middle"
        scroll={{ x: 1175 }}
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
