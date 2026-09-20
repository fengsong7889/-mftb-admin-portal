import { Button, Empty, Table, Tag, Tooltip } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import BrandTag from '../../../components/BrandTag'
import AssetParameters from '../../../components/AssetParameters'
import { useAssetParameterCatalog } from '../../../hooks/useAssetParameterCatalog'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { CLAIM_STATUS, SIGNATURE_STATUS, type ClaimPage, type ClaimQuery, type ClaimRow, type ClaimStatus, type SignatureStatus } from './claimViewTypes'

const RETURN_CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const RETURN_CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'warning', lost: 'error' }

const STATUS_META: Record<ClaimStatus, { label: string; color: string }> = {
  pending_signature: { label: '待签领用', color: 'processing' },
  claimed: { label: '在用', color: 'success' },
  returned: { label: '已归还', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  transferred: { label: 'transfer.transferred', color: 'orange' },
}
const SIGNATURE_META: Record<SignatureStatus, { label: string; color: string }> = {
  pending: { label: '待本人签署', color: 'processing' },
  signed: { label: '本人已签', color: 'success' },
  proxy_pending: { label: '代办未签', color: 'warning' },
  not_required: { label: '已取消，无需签署', color: 'default' },
}
export function ClaimStatusTag({ status }: { status: ClaimStatus }) {
  const { t } = useTranslation()
  const meta = STATUS_META[status]
  return <Tag color={meta?.color}>{status === CLAIM_STATUS.TRANSFERRED ? t('transfer.transferred') : meta?.label ?? t('transfer.unknown')}</Tag>
}
export function SignatureStatusTag({ status }: { status: SignatureStatus }) {
  const meta = SIGNATURE_META[status]
  return <Tag color={meta?.color}>{meta?.label ?? '未知签署状态'}</Tag>
}
export function canSignClaim(record: ClaimRow): boolean {
  return (record.status === CLAIM_STATUS.PENDING && record.signatureStatus === SIGNATURE_STATUS.PENDING)
    || (record.status === CLAIM_STATUS.CLAIMED && record.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING)
}
interface Props {
  data?: ClaimPage<ClaimRow>
  query: ClaimQuery
  loading?: boolean
  pageKey: string
  onQuery: (query: ClaimQuery) => void
  onView: (record: ClaimRow) => void
  onSign?: (record: ClaimRow) => void
}
export default function ClaimRecordTable({ data, query, loading, pageKey, onQuery, onView, onSign }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const columns: TableColumnsType<ClaimRow> = [
    { key: 'claimNo', title: '领用编号', dataIndex: 'claimNo', width: 180 },
    { key: 'assetNo', title: t('asset.assetNo'), dataIndex: 'assetNo', width: 180 },
    { key: 'assetName', title: t('asset.assetNameLabel'), dataIndex: 'assetName', width: 180, ellipsis: true },
    { key: 'params', title: t('asset.paramInfoTitle'), width: 240, render: (_, asset) => <AssetParameters asset={asset} compact catalog={paramCatalog} /> },
    { key: 'companyBrand', title: '所屬品牌', dataIndex: 'companyBrand', width: 120, render: (value?: number) => value ? <BrandTag value={value} /> : '—' },
    { key: 'brand', title: '资产品牌', dataIndex: 'brand', width: 110 },
    { key: 'status', title: '领用状态', dataIndex: 'status', width: 110, render: (value: ClaimStatus) => <ClaimStatusTag status={value} /> },
    { key: 'signatureStatus', title: '签收状态', dataIndex: 'signatureStatus', width: 150, render: (value: SignatureStatus, row) => <Tooltip title={row.proxyReason}><span><SignatureStatusTag status={value} /></span></Tooltip> },
    { key: 'claimDate', title: t('asset.colClaimDate'), dataIndex: 'claimDate', width: 120 },
    { key: 'returnDate', title: t('asset.colReturnDate'), dataIndex: 'returnDate', width: 120, render: (value?: string) => value || '—' },
    { key: 'assetCondition', title: '资产验收', dataIndex: 'assetCondition', width: 110, render: (value?: string) => value ? <Tag color={RETURN_CONDITION_COLOR[value]}>{RETURN_CONDITION_LABEL[value] ?? value}</Tag> : '—' },
    { key: 'operator', title: t('asset.colOperator'), dataIndex: 'operator', width: 110 },
    { key: 'action', title: t('asset.colAction'), fixed: 'right', width: onSign ? 160 : 90, render: (_, row) => <>
      <Button type="link" size="small" onClick={() => onView(row)}>{t('common.detail')}</Button>
      {onSign && canSignClaim(row) && <><span className="action-split">|</span><Button type="link" size="small" onClick={() => onSign(row)}>{row.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING ? '补签' : '签署'}</Button></>}
    </> },
  ]
  const { applyConfig, configComponent } = useColumnConfig(pageKey, columns.map((column) => ({ key: String(column.key), title: String(column.title) })))
  return <>
    <div className="claim-table-tools"><span className="claim-muted">领用状态与员工签收状态分别记录，代办不等于本人已签。</span>{configComponent}</div>
    <Table<ClaimRow> rowKey="id" columns={applyConfig(columns)} dataSource={data?.records ?? []} loading={loading} size="middle" scroll={{ x: 1400 }}
      locale={{ emptyText: <Empty description={t('common.noData')} /> }}
      pagination={{ current: query.page, pageSize: query.size, total: data?.total ?? 0, showQuickJumper: true, showSizeChanger: true,
        showTotal: (count) => t('asset.totalItems', { total: count }), onChange: (page, size) => onQuery({ ...query, page: size === query.size ? page : 1, size }) }} />
  </>
}
