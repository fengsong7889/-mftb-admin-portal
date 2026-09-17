/**
 * 交接詳情 — 獨立詳情頁（列表「詳情」按鈕跳轉，禁止 Modal 彈窗）
 *
 * 結構：DetailPageHeader（紫色漸變頂條規範）+ 模塊卡片（交接信息 / 交接資產明細）+ 最後更新 footer
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——模塊卡片無邊框 + 陰影 0.06、
 * Descriptions column=4 非 bordered、頁尾最後更新條。
 * 詳情為只讀視圖，無底部操作按鈕。
 */
import { Alert, Button, Descriptions, Result, Spin, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { FileTextOutlined, ProfileOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import type { HandoverItem, HandoverRecord } from '../../../api/eam'
import { REASON_META, type HandoverReason } from './handoverMeta'

interface Props {
  record?: HandoverRecord
  loading?: boolean
  error?: string
  onBack: () => void
  /** 點擊資產編號跳轉資產台賬 */
  onViewAsset?: (assetNo: string) => void
}

const STATUS_META: Record<HandoverRecord['status'], { key: string; color: 'success' | 'error' }> = {
  done: { key: 'asset.statusHandoverDone', color: 'success' },
  cancelled: { key: 'asset.statusHandoverCancelled', color: 'error' },
}

export default function HandoverDetail({ record, loading = false, error, onBack, onViewAsset }: Props) {
  const { t } = useTranslation()

  if (loading && !record) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return <Result status="error" title={t('asset.loadFailed', { defaultValue: '加載失敗' })} subTitle={error}
      extra={<Button onClick={onBack}>{t('common.backToList', { defaultValue: '返回列表' })}</Button>} />
  }

  if (!record) {
    return <Result status="warning" title={t('asset.recordNotFound', { defaultValue: '記錄不存在' })}
      subTitle={t('asset.handoverNotFoundHint', { defaultValue: '該交接記錄不存在或已失效。' })}
      extra={<Button onClick={onBack}>{t('common.backToList', { defaultValue: '返回列表' })}</Button>} />
  }

  const statusMeta = STATUS_META[record.status]

  /* ----- 交接資產明細列 ----- */
  const itemColumns: TableColumnsType<HandoverItem> = [
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 160,
      render: (v: string) => (
        <span
          style={{ fontFamily: 'monospace', fontWeight: 600, cursor: onViewAsset ? 'pointer' : 'default', color: onViewAsset ? '#E8720C' : undefined }}
          onClick={() => { if (onViewAsset && v && !v.startsWith('#')) onViewAsset(v) }}
        >{v}</span>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 180 },
    { title: t('asset.colAssetType'), dataIndex: 'assetType', key: 'assetType', width: 140, render: (v: string | undefined) => v || '-' },
    { title: t('asset.colFromDept'), dataIndex: 'oldDepartment', key: 'oldDepartment', width: 140, render: (v: string | undefined) => v || '-' },
    { title: t('asset.colToDept'), dataIndex: 'newDepartment', key: 'newDepartment', width: 140, render: (v: string | undefined) => v || '-' },
  ]

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('asset.handoverDetailTitle')}
        tags={<Tag color={statusMeta.color}>{t(statusMeta.key)}</Tag>}
        meta={record.handoverNo}
        onBack={onBack}
      />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {/* ====== 交接信息（模塊卡片規範：無邊框 + 陰影 0.06，對齊採購訂單詳情） ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionBasic')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={4} size="middle" items={[
          { key: 'no', label: t('asset.colHandoverNo'), children: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.handoverNo}</span> },
          { key: 'status', label: t('asset.colStatus'), children: <Tag color={statusMeta.color}>{t(statusMeta.key)}</Tag> },
          { key: 'date', label: t('asset.colHandoverDate'), children: record.handoverDate },
          { key: 'count', label: t('asset.colAssetCount'), children: <Tag color="geekblue">{record.assetCount}</Tag> },
          { key: 'fromUser', label: t('asset.colFromUser'), children: `${record.fromUserName} / ${record.fromDepartment || '-'}` },
          { key: 'toUser', label: t('asset.colToUser'), children: <Tag color="blue">{record.toUserName}</Tag> },
          { key: 'toDept', label: t('asset.colToDepartment'), children: record.toDepartment || '-' },
          { key: 'reason', label: t('asset.colHandoverReason'), children: <Tag color={REASON_META[record.reason as HandoverReason]?.color || 'default'}>{t(REASON_META[record.reason as HandoverReason]?.key || 'asset.reasonOther')}</Tag> },
          { key: 'operator', label: t('asset.colOperator'), children: record.operatorName || '-' },
          { key: 'createdAt', label: t('asset.colCreatedAt'), children: record.createdAt || '—' },
          { key: 'remark', label: t('asset.colRemark'), children: record.remark || '-', span: 2 },
        ]} />
      </div>

      {/* ====== 交接資產明細 ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ProfileOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionAssetInfo')}</span>
          <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{record.assetCount}</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Table<HandoverItem>
          columns={itemColumns}
          dataSource={record.items || []}
          rowKey="assetId"
          size="small"
          pagination={false}
          locale={{ emptyText: t('common.noData', { defaultValue: '暫無數據' }) }}
        />
      </div>

      {/* ====== 最後更新（詳情頁規範 footer，對齊採購訂單詳情） ====== */}
      <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByLabel')}<span style={{ color: '#595959' }}>{record.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtLabel')}<span style={{ color: '#595959' }}>{record.updatedAt || '-'}</span></span>
      </div>
    </div>
  )
}
