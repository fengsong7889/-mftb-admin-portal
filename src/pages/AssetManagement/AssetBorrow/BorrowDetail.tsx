/**
 * 借用详情 — 接通真实后端 API
 */
import { Alert, Button, Descriptions, Result, Spin, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { BorrowRow } from '../../../api/eamBorrow'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

const STATUS_LABEL: Record<string, string> = { active: '借用中', overdue: '已逾期', returned: '已归还', cancelled: '已取消' }
const STATUS_COLOR: Record<string, string> = { active: 'processing', overdue: 'error', returned: 'success', cancelled: 'default' }

interface Props {
  record?: BorrowRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  canReturn?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function BorrowDetail({ record, loading = false, error, canEdit = false, canReturn = false, onBack, onRefresh }: Props) {
  const navigate = useNavigate()

  if (loading && !record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (error) return <Result status="error" title="加载失败" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  if (!record) return <Result status="warning" title="记录不存在" extra={<Button onClick={onBack}>返回列表</Button>} />

  const overdueDays = record.status === 'overdue' ? (record.overdueDays ?? dayjs().diff(record.dueDate, 'day')) : 0

  return <>
    <ReturnHeader title={`借用详情 · ${record.borrowNo}`} onBack={onBack} />
    {record.status === 'overdue' && <Alert className="claim-notice" type="error" showIcon message={`已逾期 ${overdueDays} 天，请尽快归还或续借`} />}
    {record.returnId && <Alert className="claim-notice" type="success" showIcon message="已归还"
      description={<Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/asset-return/detail?id=${record.returnId}`)}>查看归还单</Button>} />}

    <ReturnSection title="借用信息">
      <Descriptions bordered column={3} items={[
        { key: 'no', label: '借用单号', children: record.borrowNo },
        { key: 'asset', label: '资产', children: `${record.assetName} (${record.assetNo})` },
        { key: 'holder', label: '借用人', children: record.holderName },
        { key: 'department', label: '借用部门', children: record.department },
        { key: 'start', label: '借出日期', children: record.startDate },
        { key: 'due', label: '到期日期', children: <span style={{ color: record.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: record.status === 'overdue' ? 600 : 400 }}>{record.dueDate}</span> },
        { key: 'overdue', label: '逾期天数', children: overdueDays > 0 ? overdueDays : '—' },
        { key: 'renew', label: '续借次数', children: record.renewCount },
        { key: 'purpose', label: '借用用途', children: record.purpose || '—' },
        { key: 'status', label: '状态', children: <Tag color={STATUS_COLOR[record.status]}>{STATUS_LABEL[record.status] || record.status}</Tag> },
        { key: 'operator', label: '操作人', children: record.operatorName },
      ]} />
    </ReturnSection>

    <ReturnSection title="操作记录">
      <Descriptions column={2} items={[
        { key: 'created', label: '创建时间', children: record.createdAt },
        { key: 'updated', label: '最后更新', children: record.updatedAt },
      ]} />
    </ReturnSection>

    {record.status !== 'returned' && record.status !== 'cancelled' && (
      <div className="form-footer">
        {canEdit && <Button onClick={() => navigate(`/asset-borrow/renew?id=${record.id}`)}>续借</Button>}
        {canReturn && <Button type="primary" onClick={() => navigate(`/asset-return/add?borrowId=${record.id}`)}>归还</Button>}
      </div>
    )}
  </>
}
