/**
 * 归还详情 — 接通真实后端 API
 */
import { Alert, Button, Descriptions, Result, Spin, Steps, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReturnRow } from '../../../api/eamReturn'
import { ReturnHeader, ReturnSection } from './ReturnLayout'

const SOURCE_LABEL: Record<string, string> = { claim: '領用歸還', borrow: '借用歸還', historical: '歷史資產歸還' }
const STATUS_LABEL: Record<string, string> = { completed: '正常完成', exception_pending: '異常處理中', exception_closed: '異常已結束' }
const STATUS_COLOR: Record<string, string> = { completed: 'success', exception_pending: 'processing', exception_closed: 'default' }
const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'error', lost: 'warning' }
const DISPOSITION_LABEL: Record<string, string> = { idle: '已收回·可使用', scrapped: '已登記報廢', written_off: '遺失已核銷' }

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

  return <>
    <ReturnHeader title={`歸還詳情 · ${record.returnNo}`} onBack={onBack} />

    {showResult && <Alert className="claim-notice" showIcon type="success" message="歸還登記已完成，數據已保存。" />}

    <ReturnSection title="歸還事實">
      <Descriptions bordered column={3} items={[
        { key: 'no', label: '歸還單號', children: record.returnNo },
        { key: 'asset', label: t('asset.colAssetName'), children: `${record.assetName} (${record.assetNo})` },
        { key: 'source', label: '歸還來源', children: SOURCE_LABEL[record.sourceType] || record.sourceType },
        { key: 'holder', label: '原持有人', children: record.empName },
        { key: 'returnUser', label: '實際歸還人', children: record.actualReturneeName || record.empName },
        { key: 'operator', label: '操作人', children: record.operatorName },
        { key: 'date', label: '歸還日期', children: record.returnDate },
        { key: 'condition', label: '驗收狀況', children: <Tag color={CONDITION_COLOR[record.assetCondition]}>{CONDITION_LABEL[record.assetCondition] || record.assetCondition}</Tag> },
        { key: 'status', label: '處理狀態', children: <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status] || status}</Tag> },
        { key: 'reason', label: '歸還說明', children: record.returnReason || '—', span: 3 },
        ...(record.conditionNote ? [{ key: 'note', label: '狀況備註', children: record.conditionNote, span: 3 }] : []),
        ...(record.exceptionReason ? [{ key: 'exReason', label: '異常原因', children: record.exceptionReason, span: 3 }] : []),
      ]} />
    </ReturnSection>

    <ReturnSection title="處理進度">
      <Steps size="small" current={status === 'exception_pending' ? 1 : 2}
        items={[{ title: '驗收登記' }, { title: '實物 / 責任處理' }, { title: '處理結束' }]} />
      {record.disposition && (
        <Descriptions column={2} style={{ marginTop: 16 }}>
          <Descriptions.Item label="處置結果">{DISPOSITION_LABEL[record.disposition] || record.disposition}</Descriptions.Item>
          <Descriptions.Item label="處置日期">{record.dispositionDate || '—'}</Descriptions.Item>
        </Descriptions>
      )}
      {record.recovered === 1 && (
        <Descriptions column={2} style={{ marginTop: 16 }}>
          <Descriptions.Item label="找回日期">{record.recoveredDate || '—'}</Descriptions.Item>
          <Descriptions.Item label="找回說明">{record.recoveredNote || '—'}</Descriptions.Item>
        </Descriptions>
      )}
      <div className="return-actions" style={{ marginTop: 16 }}>
        {canDispose && <Button onClick={() => navigate(`/asset-return/dispose?id=${record.id}`)}>登記處置結果</Button>}
        {canRecover && <Button onClick={() => navigate(`/asset-return/recover?id=${record.id}`)}>登記遺失找回</Button>}
        {record.compensationId && (
          <Button type="primary" onClick={() => navigate(`/asset-compensation/detail?id=${record.compensationId}`)}>
            查看關聯賠付單
          </Button>
        )}
      </div>
    </ReturnSection>

    <ReturnSection title="操作記錄">
      <Descriptions column={2} items={[
        { key: 'operator', label: '最後更新人', children: record.operatorName },
        { key: 'time', label: '最後更新時間', children: record.updatedAt },
        { key: 'created', label: '創建時間', children: record.createdAt },
      ]} />
    </ReturnSection>
  </>
}
