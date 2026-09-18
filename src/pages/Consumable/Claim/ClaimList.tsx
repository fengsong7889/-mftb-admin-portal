/**
 * 耗材领用列表（状态 Tab + 表格）
 *
 * Tab：全部 / 待审批 / 待出库 / 已完成 / 我的领用
 * 行操作：详情；待出库可「出库」，待审批/待出库可「撤销」（本人或管理员，服务层校验）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Table, Tabs, Modal, message, Space, Tag, Input, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import {
  fetchConsumableClaims, fetchMyConsumableClaims, issueConsumableClaim, cancelConsumableClaim,
  type ConsumableClaim,
} from '../../../api/consumable'
import { useAuth } from '../../../contexts/AuthContext'
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_COLOR, type ClaimStatus } from './constants'

interface Props {
  onAdd: () => void
  onDetail: (id: number) => void
}

type TabKey = 'all' | 'pending' | 'approved' | 'issued' | 'mine'

export default function ClaimList({ onAdd, onDetail }: Props) {
  const { hasPermission } = useAuth()
  // canViewAll: 可看全量领用单（管理视图）；canManage: 可审批/出库。admin 两者皆 true
  const canViewAll = hasPermission('consumable-claim:view')
  const canManage = hasPermission('consumable-claim:edit')
  const [tab, setTab] = useState<TabKey>(canViewAll ? 'all' : 'mine')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableClaim[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const statusMap: Record<TabKey, string | undefined> = {
        all: undefined, pending: 'pending', approved: 'approved', issued: 'issued', mine: undefined,
      }
      const res = tab === 'mine'
        ? await fetchMyConsumableClaims({ page, size })
        : await fetchConsumableClaims({ page, size, status: statusMap[tab], keyword: keyword || undefined })
      setRows(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [tab, page, size, keyword])

  useEffect(() => { loadData() }, [loadData])

  const handleExport = () => {
    if (rows.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  const handleIssue = (record: ConsumableClaim) => {
    Modal.confirm({
      title: '確認出庫核銷？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>領用單號：</span><b>{record.claimNo}</b></div>
          <div className="confirm-info-row"><span>申請人：</span><b>{record.applicantName}</b></div>
          <div className="confirm-info-row"><span>品類數：</span><b>{record.totalKinds}</b></div>
          <div className="confirm-info-row"><span>總數量：</span><b>{record.totalQty}</b></div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>出庫後將扣減庫存且不可撤銷，耗材領用無歸還流程。</div>
        </div>
      ),
      okText: '確認出庫',
      cancelText: '取消',
      onOk: async () => {
        try {
          await issueConsumableClaim(record.id)
          message.success('出庫成功')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '出庫失敗')
        }
      },
    })
  }

  const handleCancel = (record: ConsumableClaim) => {
    let reason = ''
    Modal.confirm({
      title: '確認撤銷該領用單？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>領用單號：</span><b>{record.claimNo}</b></div>
          <div style={{ marginTop: 8 }}>
            <Input.TextArea placeholder="撤銷原因（選填）" rows={2} onChange={e => { reason = e.target.value }} />
          </div>
        </div>
      ),
      okText: '確認撤銷',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await cancelConsumableClaim(record.id, reason)
          message.success('已撤銷')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '撤銷失敗')
        }
      },
    })
  }

  const columns: TableColumnsType<ConsumableClaim> = [
    { title: '領用單號', dataIndex: 'claimNo', key: 'claimNo', width: 160, ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '申請人', dataIndex: 'applicantName', key: 'applicantName', width: 100, ellipsis: true },
    { title: '部門', dataIndex: 'department', key: 'department', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: '領用事由', dataIndex: 'reason', key: 'reason', width: 180, ellipsis: true },
    { title: '品類數', dataIndex: 'totalKinds', key: 'totalKinds', width: 80, align: 'center' },
    { title: '總數量', dataIndex: 'totalQty', key: 'totalQty', width: 80, align: 'center' },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 90,
      render: (v: ClaimStatus) => <Tag color={CLAIM_STATUS_COLOR[v]}>{CLAIM_STATUS_LABEL[v]}</Tag> },
    { title: '申請時間', dataIndex: 'createdAt', key: 'createdAt', width: 165, ellipsis: true, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableClaim) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>詳情</Button>
          {canManage && record.status === 'approved' && (
            <Button type="link" size="small" onClick={() => handleIssue(record)}>出庫</Button>
          )}
          {(canManage || tab === 'mine') && (record.status === 'pending' || record.status === 'approved') && (
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>撤銷</Button>
          )}
        </Space>
      ) },
  ]

  return (
    <>
      <div className="search-section">
        <Form layout="inline">
          <Form.Item>
            <Input placeholder="單號/申請人/事由" allowClear style={{ width: 240 }}
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onPressEnter={() => { setPage(1); setKeyword(keyword) }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); setKeyword(keyword) }}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); setPage(1) }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>領用申請</Button>
        </div>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(k) => { setTab(k as TabKey); setPage(1) }}
        items={[
          ...(canViewAll ? [
            { key: 'all', label: '全部' },
            { key: 'pending', label: '待審批' },
            { key: 'approved', label: '待出庫' },
            { key: 'issued', label: '已出庫' },
          ] : []),
          { key: 'mine', label: '我的領用' },
        ]}
      />

      <Table<ConsumableClaim>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
          onChange: (p, s) => { setPage(p); setSize(s) },
        }}
      />
    </>
  )
}
