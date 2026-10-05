/**
 * 资产领用记录列表表格（管理端与员工自助端共用）。
 *
 * 核心设计：领用状态（status）与签收状态（signatureStatus）是两个独立维度，
 * 可以出现“已领用但仅代办未签”的组合，因此两列分开渲染，不能互相推导。
 * 可签条件集中在 {@link canSignClaim}，表格与行内按钮共用同一判断。
 *
 * 列配置交给 useColumnConfig(pageKey)，每个调用页传自己的 pageKey，
 * 用户隐藏列的偏好按页保存；新增列时必须同时给 columns 与 pageKey 映射，
 * 否则新列无法被用户控制。
 *
 * 文案目前混用：本文件大多为硬编码繁体（与 zh-TW 默认语言对齐），
 * 只有确实需要跟随语言切换的条目走 t()。
 */
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

/**
 * 领用状态 → 标签文案与颜色。
 *
 * ⚠️ 技术债：其余 label 都是可直接渲染的繁体文案，唯独 transferred 一项存的是
 * i18n key。ClaimStatusTag 对该值做了特判才正常显示。**不要把这一行“修正”成直接
 * 改文案，也不要去掉特判**，否则单元格会原样输出 transfer.transferred 字面量。
 * 彻底做法是把整表文案迁入 i18n 资源文件，目前尚未做。
 */
const STATUS_META: Record<ClaimStatus, { label: string; color: string }> = {
  // 异常终止类状态（遺失/報廢/送修）表示领用因非正常归还而结束，颜色区分责任性质而非严重程度
  pending_signature: { label: '待簽領用', color: 'processing' },
  claimed: { label: '在用', color: 'success' },
  returned: { label: '已歸還', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  transferred: { label: 'transfer.transferred', color: 'orange' },
  loss_closed: { label: '異常終止·遺失', color: 'warning' },
  scrap_closed: { label: '異常終止·報廢', color: 'error' },
  repair_closed: { label: '異常終止·送修', color: 'processing' },
}
/** 签收状态 → 标签。与领用状态正交，重点在于区分“本人已签”与“代办未签” */
const SIGNATURE_META: Record<SignatureStatus, { label: string; color: string }> = {
  pending: { label: '待本人簽署', color: 'processing' },
  signed: { label: '本人已簽', color: 'success' },
  proxy_pending: { label: '代辦未簽', color: 'warning' },
  not_required: { label: '已取消，無需簽署', color: 'default' },
}
export function ClaimStatusTag({ status }: { status: ClaimStatus }) {
  const { t } = useTranslation()
  const meta = STATUS_META[status]
  return <Tag color={meta?.color}>{status === CLAIM_STATUS.TRANSFERRED ? t('transfer.transferred') : meta?.label ?? t('transfer.unknown')}</Tag>
}
export function SignatureStatusTag({ status }: { status: SignatureStatus }) {
  const meta = SIGNATURE_META[status]
  return <Tag color={meta?.color}>{meta?.label ?? '未知簽署狀態'}</Tag>
}
/**
 * 是否还能发起签署：两种合法情形，其余一律不可签。
 * 1) 待领用 + 待本人签署 —— 首次签署；2) 在用 + 代办未签 —— 代办人已经领走，
 * 需事后由本人补签。已归仍保持未签的历史记录不允许回头补签。
 */
export function canSignClaim(record: ClaimRow): boolean {
  return (record.status === CLAIM_STATUS.PENDING && record.signatureStatus === SIGNATURE_STATUS.PENDING)
    || (record.status === CLAIM_STATUS.CLAIMED && record.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING)
}
interface Props {
  data?: ClaimPage<ClaimRow>
  /** 当前筛选与分页条件（受控，由父组件持有，保证筛选区与表格单一数据源） */
  query: ClaimQuery
  loading?: boolean
  /** 列配置存储的页键，每页必须唯一 */
  pageKey: string
  onQuery: (query: ClaimQuery) => void
  onView: (record: ClaimRow) => void
  /** 不传则不渲染签署入口（员工自助端等只读场景），操作列宽度随之收缩 */
  onSign?: (record: ClaimRow) => void
}
export default function ClaimRecordTable({ data, query, loading, pageKey, onQuery, onView, onSign }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const columns: TableColumnsType<ClaimRow> = [
    { key: 'claimNo', title: '領用編號', dataIndex: 'claimNo', width: 180 },
    { key: 'assetNo', title: t('asset.assetNo'), dataIndex: 'assetNo', width: 180 },
    { key: 'assetName', title: t('asset.assetNameLabel'), dataIndex: 'assetName', width: 180, ellipsis: true },
    { key: 'params', title: t('asset.paramInfoTitle'), width: 240, render: (_, asset) => <AssetParameters asset={asset} compact catalog={paramCatalog} /> },
    { key: 'companyBrand', title: '所屬品牌', dataIndex: 'companyBrand', width: 120, render: (value?: number) => value ? <BrandTag value={value} /> : '—' },
    { key: 'brand', title: '資產品牌', dataIndex: 'brand', width: 110 },
    { key: 'status', title: '領用狀態', dataIndex: 'status', width: 110, render: (value: ClaimStatus) => <ClaimStatusTag status={value} /> },
    { key: 'signatureStatus', title: '簽收狀態', dataIndex: 'signatureStatus', width: 150, render: (value: SignatureStatus, row) => <Tooltip title={row.proxyReason}><span><SignatureStatusTag status={value} /></span></Tooltip> },
    { key: 'claimDate', title: t('asset.colClaimDate'), dataIndex: 'claimDate', width: 120 },
    { key: 'returnDate', title: t('asset.colReturnDate'), dataIndex: 'returnDate', width: 120, render: (value?: string) => value || '—' },
    { key: 'assetCondition', title: '資產驗收', dataIndex: 'assetCondition', width: 110, render: (value?: string) => value ? <Tag color={RETURN_CONDITION_COLOR[value]}>{RETURN_CONDITION_LABEL[value] ?? value}</Tag> : '—' },
    { key: 'operator', title: t('asset.colOperator'), dataIndex: 'operator', width: 110 },
    // 代办未签时行内按钮文案为“補簽”，与首次签署区分
    { key: 'action', title: t('asset.colAction'), fixed: 'right', width: onSign ? 160 : 90, render: (_, row) => <>
      <Button type="link" size="small" onClick={() => onView(row)}>{t('common.detail')}</Button>
      {onSign && canSignClaim(row) && <><span className="action-split">|</span><Button type="link" size="small" onClick={() => onSign(row)}>{row.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING ? '補簽' : '簽署'}</Button></>}
    </> },
  ]
  const { applyConfig, configComponent } = useColumnConfig(pageKey, columns.map((column) => ({ key: String(column.key), title: String(column.title) })))
  return <>
    <div className="claim-table-tools"><span className="claim-muted">領用狀態與員工簽收狀態分別記錄，代辦不等於本人已簽。</span>{configComponent}</div>
    <Table<ClaimRow> rowKey="id" columns={applyConfig(columns)} dataSource={data?.records ?? []} loading={loading} size="middle" scroll={{ x: 1400 }}
      locale={{ emptyText: <Empty description={t('common.noData')} /> }}
      pagination={{ current: query.page, pageSize: query.size, total: data?.total ?? 0, showQuickJumper: true, showSizeChanger: true,
        showTotal: (count) => t('asset.totalItems', { total: count }), onChange: (page, size) => onQuery({ ...query, page: size === query.size ? page : 1, size }) }} />
  </>
}
