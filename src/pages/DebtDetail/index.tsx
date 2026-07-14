import {useState, useMemo } from 'react'
import { Button, Table, Tag, Progress, Popconfirm, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/** 还款明细记录类型 */
interface RepaymentRecord {
  key: string
  date: string
  channel: string
  amount: number
  remark: string
  operator: string
  operateTime: string
  canDelete: boolean
}

/** 模拟还款明细数据 */
const repaymentData: RepaymentRecord[] = [
  { key: '1', date: '2026-1-1', channel: '推廣金扣款', amount: 1000, remark: '該筆退款，通過扣款核銷欠款金額，扣款流程編號：1234567890', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '2', date: '2026-2-1', channel: '營業額扣款', amount: 1300, remark: '本期分期債願單推送營業額結算', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '3', date: '2026-3-1', channel: '推廣金扣款', amount: 1500, remark: '該筆退款，通過扣款核銷欠款金額，扣款流程編號：1234567890', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '4', date: '2026-4-1', channel: '營業額扣款', amount: 1600, remark: '本期退款6000，商家申請協商，急需資金周轉並得到審批同意，先暫且扣1000元！', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '5', date: '2026-5-1', channel: '推廣金扣款', amount: 1800, remark: '該筆退款，通過扣款核銷欠款金額，扣款流程編號：1234567890', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '6', date: '2026-6-1', channel: '營業額扣款', amount: 2000, remark: '本期退款6000，商家申請協商，急需資金周轉並得到審批同意，先暫且扣1000元！', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '7', date: '2026-7-1', channel: '對公轉賬', amount: 2100, remark: '商家通過轉賬方式償還本期賬單', operator: '荀彧', operateTime: '2026-3-8 9:12:21', canDelete: true },
  { key: '8', date: '2026-9-1', channel: '轉移結算', amount: 6800, remark: '商戶合供，已轉移剩餘欠款至「B集團」，新賬單編號QK12345678901', operator: 'system', operateTime: '2026-3-8 9:12:21', canDelete: false },
]

/** 格式化金额 */
const fmtAmt = (val: number) => val.toLocaleString()

export default function DebtDetail() {
  const navigate = useNavigate()
  const [data, setData] = useState(repaymentData)

  /** 账单信息（模拟） */
  const billInfo = {
    billNo: 'QK20251212000001',
    debtTotal: 26000,
    paidAmount: 6000,
    remainAmount: 20000,
    status: 'unsettled',
  }

  /** 还款进度百分比 */
  const progressPercent = Math.round((billInfo.paidAmount / billInfo.debtTotal) * 100)

  /** 删除还款记录 */
  const handleDelete = (key: string) => {
    setData((prev) => prev.filter((item) => item.key !== key))
    message.success('刪除成功')
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'date', title: '還款日期' },
    { key: 'channel', title: '還款渠道' },
    { key: 'amount', title: '還款金額' },
    { key: 'remark', title: '備註' },
    { key: 'operator', title: '操作人' },
    { key: 'operateTime', title: '操作時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('debt-detail', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<RepaymentRecord> = [
    { title: '還款日期', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: '還款渠道', dataIndex: 'channel', key: 'channel', width: 130,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '還款金額', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 360 },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 90 },
    { title: '操作時間', dataIndex: 'operateTime', key: 'operateTime', width: 170 },
    {
      title: '操作', key: 'action', width: 80, align: 'center',
      render: (_, record) => (
        record.canDelete ? (
          <Popconfirm title="確認刪除該還款記錄？" onConfirm={() => handleDelete(record.key)} okText="確認" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
        ) : (
          <span style={{ color: '#999' }}>--</span>
        )
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 还款信息头部 */}
      <div className="debt-detail-header">
        <div className="debt-detail-title-row">
          <Button type="link" onClick={() => navigate('/debt-reconcile')} className="debt-detail-back-link">
            <ArrowLeftOutlined /> 返回
          </Button>
          <h3 className="debt-detail-title">還款信息</h3>
        </div>

        {/* 进度条区域 */}
        <div className="debt-detail-progress-card">
          <div className="debt-detail-progress-top">
            <div className="debt-detail-bill-info">
              <span className="debt-detail-bill-label">賬單編號</span>
              <span className="debt-detail-bill-no">{billInfo.billNo}</span>
            </div>
            <Tag color="pink" className="debt-detail-status-tag">
              {billInfo.status === 'settled' ? '已結清' : '未結清'}
            </Tag>
          </div>
          <div className="debt-detail-progress-bar">
            <span className="debt-detail-progress-label">還款進度</span>
            <Progress
              percent={progressPercent}
              strokeColor="#52C41A"
              trailColor="#E8E8E8"
              showInfo={true}
              format={(p) => `${p}%`}
              className="debt-detail-progress"
            />
          </div>
        </div>

        {/* 三组关键数值 */}
        <div className="debt-detail-metrics">
          <div className="debt-detail-metric">
            <span className="debt-detail-metric-label">欠款總額</span>
            <span className="debt-detail-metric-value" style={{ color: '#E8720C' }}>{fmtAmt(billInfo.debtTotal)}</span>
          </div>
          <div className="debt-detail-metric">
            <span className="debt-detail-metric-label">已還金額</span>
            <span className="debt-detail-metric-value" style={{ color: '#2E7D32' }}>{fmtAmt(billInfo.paidAmount)}</span>
          </div>
          <div className="debt-detail-metric">
            <span className="debt-detail-metric-label">剩餘待還</span>
            <span className="debt-detail-metric-value" style={{ color: '#E53935' }}>{fmtAmt(billInfo.remainAmount)}</span>
          </div>
        </div>
      </div>

      {/* 还款明细列表 */}
      <div className="debt-detail-table-section">
        <div className="debt-detail-table-header">
          <h4 className="debt-detail-subtitle">📋 還款明細</h4>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('新增扣款功能')}>
            新增扣款
          </Button>
        </div>
        <Table<RepaymentRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          pagination={false}
          size="middle"
          bordered={false}
          scroll={{ x: 1100 }}
        />
      </div>

      {/* 底部返回按钮 */}
      <div className="debt-detail-footer">
        <Button className="debt-detail-back-btn" onClick={() => navigate('/debt-reconcile')}>
          返回
        </Button>
      </div>
    </div>
  )
}
