/**
 * 归还详情 — 接通真实后端 API
 */
import { Alert, Button, Descriptions, Result, Spin, Steps, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { ReturnRow } from '../../../api/eamReturn'
import { ReturnHeader, ReturnSection } from './ReturnLayout'

const SOURCE_LABEL: Record<string, string> = { claim: '领用归还', borrow: '借用归还', historical: '历史资产归还' }
const STATUS_LABEL: Record<string, string> = { completed: '正常完成', exception_pending: '异常处理中', exception_closed: '异常已结束' }
const STATUS_COLOR: Record<string, string> = { completed: 'success', exception_pending: 'processing', exception_closed: 'default' }
const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '损坏', lost: '遗失' }
const CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'error', lost: 'warning' }
const DISPOSITION_LABEL: Record<string, string> = { idle: '已收回·可使用', scrapped: '已登记报废', written_off: '遗失已核销' }

interface Props {
  record?: ReturnRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  showResult?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function ReturnDetail({ record, loading = false, error, canEdit = false, showResult = false, onBack, onRefresh }: Props) {
  const navigate = useNavigate()

  if (loading && !record) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return <Result status="error" title="加载失败" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  }

  if (!record) {
    return <Result status="warning" title="记录不存在" subTitle="该归还记录不存在或已失效。" extra={<Button onClick={onBack}>返回列表</Button>} />
  }

  const status = record.returnStatus
  const isException = record.assetCondition !== 'normal'
  const canDispose = canEdit && isException && !record.disposition
  const canRecover = canEdit && record.assetCondition === 'lost' && !record.recovered

  return <>
    <ReturnHeader title={`归还详情 · ${record.returnNo}`} onBack={onBack} />

    {showResult && <Alert className="claim-notice" showIcon type="success" message="归还登记已完成，数据已保存。" />}

    <ReturnSection title="归还事实">
      <Descriptions bordered column={3} items={[
        { key: 'no', label: '归还单号', children: record.returnNo },
        { key: 'asset', label: '资产', children: `${record.assetName} (${record.assetNo})` },
        { key: 'source', label: '归还来源', children: SOURCE_LABEL[record.sourceType] || record.sourceType },
        { key: 'holder', label: '原持有人', children: record.empName },
        { key: 'returnUser', label: '实际归还人', children: record.actualReturneeName || record.empName },
        { key: 'operator', label: '操作人', children: record.operatorName },
        { key: 'date', label: '归还日期', children: record.returnDate },
        { key: 'condition', label: '验收状况', children: <Tag color={CONDITION_COLOR[record.assetCondition]}>{CONDITION_LABEL[record.assetCondition] || record.assetCondition}</Tag> },
        { key: 'status', label: '处理状态', children: <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status] || status}</Tag> },
        { key: 'reason', label: '归还说明', children: record.returnReason || '—', span: 3 },
        ...(record.conditionNote ? [{ key: 'note', label: '状况备注', children: record.conditionNote, span: 3 }] : []),
        ...(record.exceptionReason ? [{ key: 'exReason', label: '异常原因', children: record.exceptionReason, span: 3 }] : []),
      ]} />
    </ReturnSection>

    <ReturnSection title="处理进度">
      <Steps size="small" current={status === 'exception_pending' ? 1 : 2}
        items={[{ title: '验收登记' }, { title: '实物 / 责任处理' }, { title: '处理结束' }]} />
      {record.disposition && (
        <Descriptions column={2} style={{ marginTop: 16 }}>
          <Descriptions.Item label="处置结果">{DISPOSITION_LABEL[record.disposition] || record.disposition}</Descriptions.Item>
          <Descriptions.Item label="处置日期">{record.dispositionDate || '—'}</Descriptions.Item>
        </Descriptions>
      )}
      {record.recovered === 1 && (
        <Descriptions column={2} style={{ marginTop: 16 }}>
          <Descriptions.Item label="找回日期">{record.recoveredDate || '—'}</Descriptions.Item>
          <Descriptions.Item label="找回说明">{record.recoveredNote || '—'}</Descriptions.Item>
        </Descriptions>
      )}
      <div className="return-actions" style={{ marginTop: 16 }}>
        {canDispose && <Button onClick={() => navigate(`/asset-return/dispose?id=${record.id}`)}>登记处置结果</Button>}
        {canRecover && <Button onClick={() => navigate(`/asset-return/recover?id=${record.id}`)}>登记遗失找回</Button>}
        {record.compensationId && (
          <Button type="primary" onClick={() => navigate(`/asset-compensation/detail?id=${record.compensationId}`)}>
            查看关联赔付单
          </Button>
        )}
      </div>
    </ReturnSection>

    <ReturnSection title="操作记录">
      <Descriptions column={2} items={[
        { key: 'operator', label: '最后更新人', children: record.operatorName },
        { key: 'time', label: '最后更新时间', children: record.updatedAt },
        { key: 'created', label: '创建时间', children: record.createdAt },
      ]} />
    </ReturnSection>
  </>
}
