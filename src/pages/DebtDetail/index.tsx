import { useState, useMemo } from 'react'
import { Button, Table, Tag, Progress, Popconfirm, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  FileTextOutlined,
  ProfileOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import type { DebtRepaymentRecord } from '../../utils/approvalStore'
import { getAllDebtBills } from '../DebtReconcile/mockBills'

/** 格式化金額（千分位 + 兩位小數） */
const fmtAmt = (val: number) => val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 賬單狀態展示映射 */
const statusMeta: Record<string, { label: string; color: string }> = {
  unsettled: { label: '未結清', color: 'error' },
  settled: { label: '已結清', color: 'success' },
  transferred: { label: '已轉結', color: 'processing' },
}

/** 賬單來源展示映射（與欠款對賬列表配色一致） */
const sourceTagMap: Record<string, { label: string; color: string }> = {
  recharge: { label: '充值營業額扣款', color: 'blue' },
  merge: { label: '合併欠款轉入', color: 'purple' },
}

/** 還款渠道 Tag 配色 */
const channelColorMap: Record<string, string> = {
  推廣金扣款: 'blue',
  營業額扣款: 'orange',
  對公轉賬: 'green',
  轉移結算: 'purple',
}

/** 詳情頁區塊容器（全局統一：白底 + 圓角 8 + 陰影） */
const sectionStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 四列信息網格（全局統一：標籤在上、值在下） */
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px',
}

/** 標籤值展示項（全局統一：標籤在上、值在下） */
function InfoItem({ label, value, valueStyle }: { label: string; value: React.ReactNode; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#262626', fontWeight: 500, ...valueStyle }}>{value}</div>
    </div>
  )
}

/** 版塊標題（全局統一：左側色條 + 圖標 + 虛線分隔，支持右側操作區） */
function SectionTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
      paddingBottom: 12, borderBottom: '1px dashed rgba(0,0,0,0.08)',
    }}>
      <div style={{ width: 6, height: 20, borderRadius: 3, background: '#E8720C' }} />
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#E8720C' }}>{icon}</span>
        {title}
      </h3>
      {extra && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{extra}</div>}
    </div>
  )
}

export default function DebtDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const billNoParam = searchParams.get('billNo') || ''

  /** 按賬單編號定位欠款單（未匹配時取第一條演示） */
  const bill = useMemo(() => {
    const all = getAllDebtBills()
    return all.find(b => b.billNo === billNoParam) || all[0]
  }, [billNoParam])

  const [data, setData] = useState<DebtRepaymentRecord[]>(bill?.repayments || [])

  /** 還款進度百分比 */
  const progressPercent = bill && bill.debtTotal > 0
    ? Math.round((bill.paidAmount / bill.debtTotal) * 100)
    : 0

  /** 刪除還款記錄 */
  const handleDelete = (key: string) => {
    setData((prev) => prev.filter((item) => item.key !== key))
    message.success('刪除成功')
  }

  /** 列配置元數據 */
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
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<DebtRepaymentRecord> = [
    { title: '還款日期', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: '還款渠道', dataIndex: 'channel', key: 'channel', width: 130,
      render: (v: string) => <Tag color={channelColorMap[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '還款金額', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 380 },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 110 },
    { title: '操作時間', dataIndex: 'operateTime', key: 'operateTime', width: 170 },
    {
      title: '操作', key: 'action', width: 80, align: 'center',
      render: (_, record) => (
        record.canDelete ? (
          <Popconfirm title="確認刪除該還款記錄？" onConfirm={() => handleDelete(record.key)} okText="確認" cancelText="取消">
            <Button type="link" size="small" danger>刪除</Button>
          </Popconfirm>
        ) : (
          <span style={{ color: '#999' }}>--</span>
        )
      ),
    },
  ]

  if (!bill) {
    return (
      <div>
        <div style={sectionStyle}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/debt-reconcile')}>返回</Button>
          <span style={{ marginLeft: 16, color: '#8C8C8C' }}>未找到對應欠款單</span>
        </div>
      </div>
    )
  }

  const status = statusMeta[bill.status] || { label: bill.status, color: 'default' }
  const sourceTag = sourceTagMap[bill.source] || { label: bill.source, color: 'default' }

  return (
    <div>
      {/* 頂部導航欄（全局詳情頁統一樣式） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        {/* 頂部漸變裝飾線 */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/debt-reconcile')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}
            >
              返回
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#262626' }}>還款信息</h2>
              <Tag color={status.color} style={{ margin: 0, fontSize: 12, padding: '2px 10px', borderRadius: 4, fontWeight: 500 }}>
                {status.label}
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {/* 欠款單信息 */}
      <div style={sectionStyle}>
        <SectionTitle icon={<FileTextOutlined />} title="欠款單信息" />
        <div style={gridStyle}>
          <InfoItem label="賬單編號" value={bill.billNo} valueStyle={{ fontWeight: 600 }} />
          <InfoItem label="關聯批次號" value={bill.batchNo} />
          <InfoItem label="流程編號" value={bill.flowNo} />
          <InfoItem label="賬單來源" value={<Tag color={sourceTag.color} style={{ margin: 0 }}>{sourceTag.label}</Tag>} />
          <InfoItem label="集團ID" value={bill.groupId} />
          <InfoItem label="集團名稱" value={bill.groupName} />
          <InfoItem label="所屬品牌" value={<BrandTag value={bill.brand} />} />
          <InfoItem label="門店ID" value={bill.storeId} />
          <InfoItem label="門店名稱" value={bill.storeName} />
          <InfoItem label="業務頻道" value={bill.channel} />
          <InfoItem label="歸屬BD" value={bill.bd || '--'} />
          <InfoItem label="借款日期" value={bill.loanDate} />
        </div>

        {/* 還款進度 */}
        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', margin: '20px 0' }} />
        <div className="debt-detail-progress-card" style={{ marginBottom: 16 }}>
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

        {/* 三組關鍵指標 */}
        <div className="debt-detail-metrics">
          <div className="debt-detail-metric">
            <span className="debt-detail-metric-label">欠款總額</span>
            <span className="debt-detail-metric-value" style={{ color: '#E8720C' }}>{fmtAmt(bill.debtTotal)}</span>
          </div>
          <div className="debt-detail-metric">
            <span className="debt-detail-metric-label">已還金額</span>
            <span className="debt-detail-metric-value" style={{ color: '#52C41A' }}>{fmtAmt(bill.paidAmount)}</span>
          </div>
          <div className="debt-detail-metric">
            <span className="debt-detail-metric-label">剩餘待還</span>
            <span className="debt-detail-metric-value" style={{ color: bill.remainAmount > 0 ? '#FF4D4F' : '#52C41A' }}>{fmtAmt(bill.remainAmount)}</span>
          </div>
        </div>
      </div>

      {/* 還款明細 */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <SectionTitle
          icon={<ProfileOutlined />}
          title="還款明細"
          extra={
            <>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('新增扣款功能')}>
                新增扣款
              </Button>
              {configComponent}
            </>
          }
        />
        <Table<DebtRepaymentRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          pagination={false}
          size="middle"
          bordered={false}
          scroll={{ x: 1120 }}
        />
      </div>
    </div>
  )
}
