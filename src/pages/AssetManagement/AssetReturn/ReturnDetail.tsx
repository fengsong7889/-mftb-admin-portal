/**
 * 归还详情 — 接通真实后端 API
 *
 * 模块拆分（自上而下）：
 *   1. 资产信息  2. 领用信息  3. 签收信息与凭证
 *   4. 处理进度  5. 验收信息
 * 样式基准：采购订单详情 — DetailPageHeader + 无边框模块卡片 + Descriptions column=4 + footer。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Empty, Result, Space, Spin, Steps, Tag } from 'antd'
import {
  FileTextOutlined, ProfileOutlined, InboxOutlined,
  FileProtectOutlined, RollbackOutlined, AppstoreOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetParameters from '../../../components/AssetParameters'
import BrandTag from '../../../components/BrandTag'
import type { ReturnRow } from '../../../api/eamReturn'
import { fetchClaimDetail } from '../../../api/eamClaim'
import type { ClaimRow } from '../AssetClaim/claimViewTypes'
import { fetchBorrowDetail, type BorrowRow } from '../../../api/eamBorrow'
import { fetchAssetDetail, type AssetItem } from '../../../api/asset'

const SOURCE_LABEL: Record<string, string> = { claim: '領用歸還', borrow: '借用歸還', historical: '歷史資產歸還' }
const STATUS_LABEL: Record<string, string> = { completed: '正常完成', exception_pending: '異常處理中', exception_closed: '異常已結束' }
const STATUS_COLOR: Record<string, string> = { completed: 'success', exception_pending: 'processing', exception_closed: 'default' }
const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'error', lost: 'warning' }
const DISPOSITION_LABEL: Record<string, string> = { idle: '已收回·可使用', scrapped: '已登記報廢', written_off: '遺失已核銷' }

const CLAIM_STATUS_META: Record<string, { label: string; color: string }> = {
  pending_signature: { label: '待簽領用', color: 'processing' },
  claimed: { label: '在用', color: 'success' },
  returned: { label: '已歸還', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  transferred: { label: '已調撥', color: 'orange' },
}
const SIGNATURE_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待本人簽署', color: 'processing' },
  signed: { label: '本人已簽', color: 'success' },
  proxy_pending: { label: '代辦未簽', color: 'warning' },
  not_required: { label: '已取消，無需簽署', color: 'default' },
}

/** 详情卡片统一样式 */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 模块标题行 */
function SectionTitle({ icon, iconBg, title, tag }: { icon: React.ReactNode; iconBg: string; title: string; tag?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

interface Props {
  record?: ReturnRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  showResult?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function ReturnDetail({ record, loading = false, error, canEdit = false, showResult = false, onBack, onRefresh: _onRefresh }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /** 加载来源详情（领用 / 借用 / 资产台账），供模块 1-3 展示 */
  const [source, setSource] = useState<ClaimRow | BorrowRow | AssetItem | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)

  useEffect(() => {
    if (!record || error) { setSource(null); return }
    let alive = true
    setSourceLoading(true)
    const fetcher = record.claimId
      ? fetchClaimDetail(record.claimId)
      : record.borrowId
        ? fetchBorrowDetail(record.borrowId)
        : fetchAssetDetail(record.assetId)
    fetcher.then(d => { if (alive) setSource(d) }).catch(() => { if (alive) setSource(null) })
      .finally(() => { if (alive) setSourceLoading(false) })
    return () => { alive = false }
  }, [record?.id, error])

  if (loading && !record) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return <Result status="error" title="加載失敗" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  }

  if (!record) {
    return <Result status="warning" title="記錄不存在" subTitle="該歸還記錄不存在或已失效。" extra={<Button onClick={onBack}>返回列表</Button>} />
  }

  const status = record.returnStatus
  const isException = record.assetCondition !== 'normal'
  const canDispose = canEdit && isException && !record.disposition
  const canRecover = canEdit && record.assetCondition === 'lost' && !record.recovered

  const cr = source as ClaimRow | undefined
  const br = source as BorrowRow | undefined
  const ai = source as AssetItem | undefined
  const isClaim = !!record.claimId
  const isBorrow = !!record.borrowId

  return <>
    {/* ====== 详情页头部 ====== */}
    <DetailPageHeader
      title={t('asset.returnDetailTitle', { defaultValue: '歸還詳情' })}
      tags={
        <Space>
          <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status] || status}</Tag>
          <Tag color={CONDITION_COLOR[record.assetCondition]}>{CONDITION_LABEL[record.assetCondition] || record.assetCondition}</Tag>
        </Space>
      }
      meta={record.returnNo}
      onBack={onBack}
      extra={
        <Space>
          {canDispose && (
            <Button onClick={() => navigate(`/asset-return/dispose?id=${record.id}`)}
              style={{ borderRadius: 8, height: 36, padding: '0 16px' }}>
              登記處置結果
            </Button>
          )}
          {canRecover && (
            <Button onClick={() => navigate(`/asset-return/recover?id=${record.id}`)}
              style={{ borderRadius: 8, height: 36, padding: '0 16px' }}>
              登記遺失找回
            </Button>
          )}
          {record.compensationId && (
            <Button type="primary" onClick={() => navigate(`/asset-compensation/detail?id=${record.compensationId}`)}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>
              查看關聯賠付單
            </Button>
          )}
        </Space>
      }
    />

    {showResult && <Alert className="claim-notice" showIcon type="success" message="歸還登記已完成，數據已保存。" style={{ marginBottom: 16 }} />}

    <Spin spinning={sourceLoading}>
      {/* ====== 模块 1：处理进度 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle
          icon={<ProfileOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
          iconBg="#fff7e6"
          title="處理進度"
        />
        <Steps size="small" current={status === 'exception_pending' ? 1 : 2}
          items={[{ title: '驗收登記' }, { title: '實物 / 責任處理' }, { title: '處理結束' }]} />
        {record.disposition && (
          <Descriptions column={4} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="處置結果">{DISPOSITION_LABEL[record.disposition] || record.disposition}</Descriptions.Item>
            <Descriptions.Item label="處置日期">{record.dispositionDate || '—'}</Descriptions.Item>
          </Descriptions>
        )}
        {record.recovered === 1 && (
          <Descriptions column={4} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="找回日期">{record.recoveredDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="找回說明">{record.recoveredNote || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </div>
    
      {/* ====== 模块 2：资产信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<InboxOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="資產信息" />
        {source ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="領用編號">
              {isClaim ? <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cr?.claimNo}</span>
                : isBorrow ? <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{br?.borrowNo}</span>
                : <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ai?.assetNo}</span>}
            </Descriptions.Item>
            <Descriptions.Item label="資產編號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.assetNo}</span></Descriptions.Item>
            <Descriptions.Item label="資產名稱">{record.assetName}</Descriptions.Item>
            <Descriptions.Item label="所屬品牌">
              {isClaim && cr?.companyBrand ? <BrandTag value={cr.companyBrand} />
                : !isClaim && !isBorrow && ai?.companyBrand ? <BrandTag value={ai.companyBrand} />
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="資產品牌">{cr?.brand || ai?.brand || '—'}</Descriptions.Item>
            <Descriptions.Item label="資產分類">{cr?.assetType || ai?.assetType || '—'}</Descriptions.Item>
            <Descriptions.Item label="購買時價值">
              {(cr?.purchaseValue ?? ai?.purchaseValue) != null
                ? `MOP ${Number(cr?.purchaseValue ?? ai?.purchaseValue).toLocaleString()}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="管理部門">{cr?.adminDepartment || ai?.adminDepartment || '—'}</Descriptions.Item>
          </Descriptions>
        ) : <Empty description="資產信息尚未加載" />}
        {source && <AssetParameters asset={source} current />}
        {/* 领用配件快照 */}
        {cr?.accessories && cr.accessories.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>領用配件</span>
              <Tag color="orange" style={{ fontSize: 11 }}>{cr.accessories.length} 項</Tag>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cr.accessories.map((acc, idx) => (
                <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                  {acc.name} × {acc.qty}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ====== 模块 3：领用信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="領用信息" />
        {source ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label={isClaim ? '領用人' : isBorrow ? '借用人' : '使用人'}>
              {isClaim && cr?.empNo ? `${cr.empName}（${cr.empNo}）`
                : cr?.empName || br?.holderName || ai?.userName || '—'}
            </Descriptions.Item>
            <Descriptions.Item label={isClaim ? '領用時部門' : isBorrow ? '借用部門' : '所在部門'}>
              {cr?.department || br?.department || ai?.department || '—'}
            </Descriptions.Item>
            <Descriptions.Item label={isClaim ? '領用日期' : isBorrow ? '借用日期' : '使用日期'}>
              {cr?.claimDate || br?.startDate || ai?.claimDate || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="實際登記時間">{cr?.createdAt || br?.createdAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="登記操作人">
              {(() => {
                const name = cr?.operator || br?.operatorName || record.operatorName || '—'
                const no = cr?.operatorEmpNo || record.operatorNo
                return no ? `${name}（${no}）` : name
              })()}
            </Descriptions.Item>
            <Descriptions.Item label={isClaim ? '領用狀態' : isBorrow ? '借用狀態' : '資產狀態'}>
              {isClaim && cr?.status
                ? <Tag color={CLAIM_STATUS_META[cr.status]?.color}>{CLAIM_STATUS_META[cr.status]?.label ?? cr.status}</Tag>
                : isBorrow
                  ? <Tag color={br?.status === 'active' ? 'success' : br?.status === 'overdue' ? 'error' : 'default'}>
                      {br?.status === 'active' ? '借用中' : br?.status === 'overdue' ? '已逾期' : br?.status === 'returned' ? '已歸還' : br?.status}
                    </Tag>
                  : <Tag color={ai?.status === 'in_use' ? 'success' : 'default'}>{ai?.status || '—'}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="領用用途" span={2}>{cr?.claimReason || br?.purpose || '—'}</Descriptions.Item>
            {cr?.remark && <Descriptions.Item label="備註" span={4}>{cr.remark}</Descriptions.Item>}
          </Descriptions>
        ) : <Empty description="領用信息尚未加載" />}
      </div>

      {/* ====== 模块 4：签收信息与凭证（仅领用归还） ====== */}
      {isClaim && cr && (
        <div style={detailCardStyle}>
          <SectionTitle icon={<FileProtectOutlined style={{ fontSize: 14, color: '#fa8c16' }} />} iconBg="#fff7e6" title="簽收信息與憑證" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 48px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>簽收狀態：</span>
              <Tag color={SIGNATURE_META[cr.signatureStatus]?.color} style={{ marginInlineEnd: 0 }}>
                {SIGNATURE_META[cr.signatureStatus]?.label ?? cr.signatureStatus}
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>實際簽署時間：</span>
              <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{cr.signedAt || '—'}</span>
            </div>
          </div>
        </div>
      )}


      {/* ====== 模块 5：验收信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<RollbackOutlined style={{ fontSize: 14, color: '#52c41a' }} />} iconBg="#f6ffed" title="驗收信息" />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="歸還來源">{SOURCE_LABEL[record.sourceType] || record.sourceType}</Descriptions.Item>
          <Descriptions.Item label="歸還日期">{record.returnDate}</Descriptions.Item>
          <Descriptions.Item label="實際歸還人">
            {(() => {
              const name = record.actualReturneeName || record.empName || '—'
              const no = record.actualReturneeNo
              return no ? `${name}（${no}）` : name
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="操作人">
            {(() => {
              const name = record.operatorName || '—'
              const no = record.operatorNo
              return no ? `${name}（${no}）` : name
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="驗收狀況">
            <Tag color={CONDITION_COLOR[record.assetCondition]}>{CONDITION_LABEL[record.assetCondition] || record.assetCondition}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={record.assetCondition === 'normal' ? '歸還說明' : '異常說明'} span={4}>
            {record.assetCondition === 'normal' ? (record.returnReason || '—') : (record.exceptionReason || '—')}
          </Descriptions.Item>
        </Descriptions>
      </div>
    </Spin>

    {/* ====== 最後更新（詳情頁規範 footer） ====== */}
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: '12px 24px',
      border: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'flex-end', gap: 24,
    }}>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{record.operatorNo ? `${record.operatorName || '-'}（${record.operatorNo}）` : (record.operatorName || '-')}</span></span>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{record.updatedAt || '-'}</span></span>
    </div>
  </>
}
