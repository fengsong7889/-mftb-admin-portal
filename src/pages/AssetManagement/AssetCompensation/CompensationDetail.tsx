/**
 * 赔付详情 — 接通真实后端 API
 */
import { Alert, Button, Descriptions, Empty, Result, Spin, Table, Tabs, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { CompensationRow } from '../../../api/eamCompensation'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

/* ----- 状态元数据 ----- */
const DAMAGE_LABEL: Record<string, string> = { damage: '损坏', loss: '遗失' }
const CAUSE_LABEL: Record<string, string> = { human: '人为', natural: '自然', third_party: '第三方', quality: '质量' }
const PARTY_LABEL: Record<string, string> = { employee: '员工', department: '部门', company: '公司', none: '未定' }
const STATUS_LABEL: Record<string, string> = {
  pending: '待定责', confirmed: '已定责', partially_paid: '部分收款',
  paid: '已结清', waived: '已免赔', refund_pending: '待退款',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'default', confirmed: 'processing', partially_paid: 'processing',
  paid: 'success', waived: 'default', refund_pending: 'error',
}

function formatMoney(cents: number): string {
  return `MOP ${(cents / 100).toFixed(2)}`
}

interface Props {
  record?: CompensationRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function CompensationDetail({ record, loading = false, error, canEdit = false, onBack, onRefresh: _onRefresh }: Props) {
  const navigate = useNavigate()

  if (loading && !record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (error) return <Result status="error" title="加载失败" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  if (!record) return <Result status="warning" title="记录不存在" extra={<Button onClick={onBack}>返回列表</Button>} />

  const pending = record.status === 'pending' && !record.reviewRequired
  const confirmed = ['confirmed', 'partially_paid', 'paid'].includes(record.status) && !record.reviewRequired
  const refund = record.status === 'refund_pending'

  return <>
    <ReturnHeader title={`赔付详情 · ${record.compNo}`} onBack={onBack} />
    {record.reviewRequired > 0 && <Alert className="claim-notice" type="warning" showIcon message="待找回复核"
      description="资产已找回，原赔付记录保留，需人工复核金额并决定是否退款。" />}
    {refund && <Alert className="claim-notice" type="error" showIcon message="待退款" description="已收金额超过复核后应赔金额，需登记退款冲减。" />}
    <ReturnSection title="赔付基本信息">
      <Descriptions bordered column={3} items={[
        { key: 'no', label: '赔付单号', children: record.compNo },
        { key: 'asset', label: '资产', children: `${record.assetName} · ${record.assetNo}` },
        { key: 'holder', label: '原持有人', children: record.holderName },
        { key: 'damageType', label: '损失类型', children: <Tag color={record.damageType === 'loss' ? 'error' : 'warning'}>{DAMAGE_LABEL[record.damageType] || record.damageType}</Tag> },
        { key: 'return', label: '关联归还单', children: record.returnId ? <Button type="link" onClick={() => navigate(`/asset-return/detail?id=${record.returnId}`)}>查看</Button> : '—' },
        { key: 'status', label: '状态', children: record.reviewRequired > 0 ? <Tag color="warning">待找回复核</Tag> : <Tag color={STATUS_COLOR[record.status] || 'default'}>{STATUS_LABEL[record.status] || record.status}</Tag> },
        { key: 'party', label: '责任对象', children: record.party ? <Tag>{PARTY_LABEL[record.party] || record.party}</Tag> : '待定' },
        { key: 'responsible', label: '责任人', children: record.responsibleName || '待定' },
        { key: 'department', label: '责任部门', children: record.department || '待定' },
        { key: 'cause', label: '原因', children: record.cause ? CAUSE_LABEL[record.cause] : '待定' },
        { key: 'basis', label: '定责依据', children: record.basis || '待定' },
        { key: 'amount', label: '应赔金额', children: record.status === 'pending' ? '待定' : formatMoney(record.amount) },
        { key: 'netPaid', label: '净收款', children: formatMoney(record.netPaid) },
        { key: 'reason', label: '异常说明', children: record.reason || record.waiveReason || '—' },
      ]} />
    </ReturnSection>
    <Tabs items={[
      {
        key: 'payments', label: '收款 / 退款记录',
        children: record.payments?.length ? <Table rowKey="id" size="small" pagination={false}
          dataSource={record.payments} columns={[
            { key: 'type', title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag color={v === 'payment' ? 'success' : 'error'}>{v === 'payment' ? '收款' : '退款'}</Tag> },
            { key: 'amount', title: '金额', dataIndex: 'amount', width: 130, align: 'right', render: (v: number) => formatMoney(v) },
            { key: 'date', title: '业务日期', dataIndex: 'paymentDate', width: 120 },
            { key: 'reason', title: '说明', dataIndex: 'reason' },
            { key: 'operator', title: '操作人', dataIndex: 'operatorName', width: 130 },
          ]} /> : <Empty description="暂无收款 / 退款记录" />,
      },
      {
        key: 'reviews', label: '找回复核记录',
        children: record.reviews?.length ? <Table rowKey="id" size="small" pagination={false}
          dataSource={record.reviews} columns={[
            { key: 'date', title: '复核日期', dataIndex: 'reviewDate', width: 120 },
            { key: 'before', title: '原应赔', dataIndex: 'beforeAmount', width: 130, align: 'right', render: (v: number) => formatMoney(v) },
            { key: 'after', title: '复核后应赔', dataIndex: 'afterAmount', width: 130, align: 'right', render: (v: number) => formatMoney(v) },
            { key: 'reason', title: '调整理由', dataIndex: 'reason' },
            { key: 'operator', title: '操作人', dataIndex: 'operatorName', width: 130 },
          ]} /> : <Empty description="暂无复核记录" />,
      },
    ]} />
    <ReturnSection title="操作记录">
      <Descriptions column={2} items={[
        { key: 'operator', label: '最后更新人', children: record.operatorName },
        { key: 'time', label: '最后更新时间', children: record.updatedAt },
      ]} />
    </ReturnSection>
    <div className="form-footer">
      {canEdit && pending && <Button onClick={() => navigate(`/asset-compensation/liability?id=${record.id}`)}>定责</Button>}
      {canEdit && pending && <Button onClick={() => navigate(`/asset-compensation/waive?id=${record.id}`)}>免赔</Button>}
      {canEdit && confirmed && <Button onClick={() => navigate(`/asset-compensation/payment?id=${record.id}`)}>收款</Button>}
      {canEdit && refund && <Button onClick={() => navigate(`/asset-compensation/refund?id=${record.id}`)}>登记退款</Button>}
      {canEdit && record.reviewRequired > 0 && <Button type="primary" onClick={() => navigate(`/asset-compensation/review?id=${record.id}`)}>找回复核</Button>}
    </div>
  </>
}
