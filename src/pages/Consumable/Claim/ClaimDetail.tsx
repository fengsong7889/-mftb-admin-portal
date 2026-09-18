/**
 * 耗材领用详情 独立页（含审批 / 出库 / 撤销操作）
 *
 * 遵循详情页规范：模块卡片不加 border、Descriptions 展示、底部「最后更新」footer
 * 操作按状态与权限渲染：pending→审批；approved→出库；pending/approved→撤销
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Descriptions, Table, Tag, Input, Modal, message, Space, Spin } from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  fetchConsumableClaimDetail, fetchMyConsumableClaimDetail, approveConsumableClaim, issueConsumableClaim, cancelConsumableClaim,
  type ConsumableClaim, type ConsumableClaimItem,
} from '../../../api/consumable'
import { useAuth } from '../../../contexts/AuthContext'
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_COLOR, type ClaimStatus } from './constants'

interface Props {
  id: number
  onBack: () => void
}

export default function ClaimDetail({ id, onBack }: Props) {
  const { hasPermission } = useAuth()
  const [loading, setLoading] = useState(false)
  const [claim, setClaim] = useState<ConsumableClaim | null>(null)
  const [approveRemark, setApproveRemark] = useState('')
  // 管理操作（审批/出库）需 consumable-claim:edit 授权；admin 直通。员工仅可提交/撤销本人单
  const canManage = hasPermission('consumable-claim:edit')
  // 无全量查看权的员工走开放的「我的详情」接口（后端校验归属）
  const canViewAll = hasPermission('consumable-claim:view')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setClaim(await (canViewAll ? fetchConsumableClaimDetail(id) : fetchMyConsumableClaimDetail(id)))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [id, canViewAll])

  useEffect(() => { load() }, [load])

  const handleApprove = (pass: boolean) => {
    Modal.confirm({
      title: pass ? '確認通過該領用申請？' : '確認駁回該領用申請？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>領用單號：</span><b>{claim?.claimNo}</b></div>
          <div className="confirm-info-row"><span>申請人：</span><b>{claim?.applicantName}</b></div>
          {approveRemark && <div className="confirm-info-row"><span>審批意見：</span><b>{approveRemark}</b></div>}
          <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
            {pass ? '通過後進入待出庫，庫存保持佔用。' : '駁回後釋放佔用庫存。'}
          </div>
        </div>
      ),
      okText: pass ? '確認通過' : '確認駁回',
      okButtonProps: pass ? undefined : { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await approveConsumableClaim({ claimId: id, pass, remark: approveRemark })
          message.success(pass ? '已通過' : '已駁回')
          setApproveRemark('')
          load()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '審批失敗')
        }
      },
    })
  }

  const handleIssue = () => {
    Modal.confirm({
      title: '確認出庫核銷？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>領用單號：</span><b>{claim?.claimNo}</b></div>
          <div className="confirm-info-row"><span>總數量：</span><b>{claim?.totalQty}</b></div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>出庫後扣減庫存且不可撤銷，耗材領用無歸還流程。</div>
        </div>
      ),
      okText: '確認出庫',
      cancelText: '取消',
      onOk: async () => {
        try {
          await issueConsumableClaim(id)
          message.success('出庫成功')
          load()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '出庫失敗')
        }
      },
    })
  }

  const handleCancel = () => {
    let reason = ''
    Modal.confirm({
      title: '確認撤銷該領用單？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <Input.TextArea placeholder="撤銷原因（選填）" rows={2} onChange={e => { reason = e.target.value }} />
      ),
      okText: '確認撤銷',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await cancelConsumableClaim(id, reason)
          message.success('已撤銷')
          load()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '撤銷失敗')
        }
      },
    })
  }

  const columns: TableColumnsType<ConsumableClaimItem> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '名稱', dataIndex: 'itemName', key: 'itemName', width: 160, ellipsis: true },
    { title: '規格型號', dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '出庫倉庫', dataIndex: 'locationName', key: 'locationName', width: 130, render: (v: string) => v || '-' },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 90, align: 'right', render: (v: number, r) => `${v} ${r.unit ?? ''}` },
    { title: '成本單價', dataIndex: 'unitCost', key: 'unitCost', width: 100, align: 'right', render: (v?: number) => `¥${(v ?? 0).toFixed(2)}` },
    { title: '小計', key: 'subtotal', width: 100, align: 'right', render: (_: unknown, r) => `¥${((r.unitCost ?? 0) * r.qty).toFixed(2)}` },
  ]

  if (!claim) return <Spin spinning={loading}><div style={{ minHeight: 200 }} /></Spin>

  const status = claim.status as ClaimStatus
  const totalAmount = claim.items.reduce((s, i) => s + (i.unitCost ?? 0) * i.qty, 0)

  return (
    <Spin spinning={loading}>
      {/* 详情页头部 */}
      <div className="detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >返回</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#262626' }}>耗材領用詳情</h2>
          <Tag color={CLAIM_STATUS_COLOR[status]}>{CLAIM_STATUS_LABEL[status]}</Tag>
        </div>
        <Space>
          {canManage && status === 'pending' && (
            <>
              <Button danger onClick={() => handleApprove(false)}>駁回</Button>
              <Button type="primary" onClick={() => handleApprove(true)}>審批通過</Button>
            </>
          )}
          {canManage && status === 'approved' && (
            <Button type="primary" onClick={handleIssue}>出庫核銷</Button>
          )}
          {(status === 'pending' || status === 'approved') && (
            <Button onClick={handleCancel}>撤銷</Button>
          )}
        </Space>
      </div>

      {/* 基本信息 */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, color: '#1890ff' }}>📋</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>领用信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="領用單號">{claim.claimNo}</Descriptions.Item>
          <Descriptions.Item label="申請人">{claim.applicantName}{claim.applicantEmpId ? `（${claim.applicantEmpId}）` : ''}</Descriptions.Item>
          <Descriptions.Item label="申請部門">{claim.department || '-'}</Descriptions.Item>
          <Descriptions.Item label="申請時間">{claim.createdAt || '-'}</Descriptions.Item>
          <Descriptions.Item label="領用事由" span={4}>{claim.reason}</Descriptions.Item>
          {status !== 'pending' && (
            <>
              <Descriptions.Item label="審批人">{claim.approverName || '-'}</Descriptions.Item>
              <Descriptions.Item label="審批時間">{claim.approvedAt || '-'}</Descriptions.Item>
              <Descriptions.Item label="審批意見" span={2}>{claim.approveRemark || '-'}</Descriptions.Item>
            </>
          )}
          {status === 'issued' && (
            <>
              <Descriptions.Item label="出庫操作人">{claim.issueOperator || '-'}</Descriptions.Item>
              <Descriptions.Item label="出庫時間" span={3}>{claim.issuedAt || '-'}</Descriptions.Item>
            </>
          )}
          {status === 'cancelled' && (
            <Descriptions.Item label="撤銷原因" span={4}>{claim.cancelReason || '-'}</Descriptions.Item>
          )}
        </Descriptions>
        {status === 'pending' && canManage && (
          <div style={{ marginTop: 12 }}>
            <Input.TextArea placeholder="審批意見（選填）" rows={2} value={approveRemark}
              onChange={e => setApproveRemark(e.target.value)} maxLength={200} />
          </div>
        )}
      </div>

      {/* 领用明细 */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, color: '#FA8C16' }}>🧾</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>领用明细</span>
          <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{claim.totalKinds} 項 / 共 {claim.totalQty}</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 13, color: '#595959' }}>成本合計：<b style={{ color: '#E8720C' }}>¥{totalAmount.toFixed(2)}</b></span>
        </div>
        <Table<ConsumableClaimItem>
          columns={columns}
          dataSource={claim.items}
          rowKey={(r) => r.id ?? `${r.itemId}-${r.locationId}`}
          pagination={false}
          size="middle"
          scroll={{ x: 840 }}
        />
      </div>

      {/* 最后更新 footer */}
      <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{claim.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{claim.updatedAt || '-'}</span></span>
      </div>
    </Spin>
  )
}
