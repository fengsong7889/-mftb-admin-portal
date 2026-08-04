/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, FileTextOutlined, ProfileOutlined,
} from '@ant-design/icons'
import BrandTag from '../../components/BrandTag'
import { getBatchRecordByKey } from '../../utils/approvalStore'
import type { BatchStoreRecord } from '../../utils/approvalStore'
import { fetchFinBatchDetail, fetchFinDetails } from '../../api/finance'
import type { FinBatch, FinDetail } from '../../api/finance'

/** 批次類型標題映射（僅充值/轉賬/合併生成批次，扣款不生成批次） */
const typeTitleMap: Record<string, string> = {
  recharge: '充值信息',
  transfer: '轉賬信息',
  merge: '合併信息',
}

/** 批次類型 Tag（與批次查詢列表配色一致） */
const typeTagMap: Record<string, { label: string; color: string }> = {
  recharge: { label: '充值', color: 'blue' },
  transfer: { label: '轉賬', color: 'green' },
  merge: { label: '合併', color: 'orange' },
}

/** 結算方式映射 */
const payMethodMap: Record<string, string> = {
  corporate: '對公轉賬',
  mixed: '混合支付',
  revenue: '營業額支付',
}

/** 交易明細行 */
interface FlowRow {
  key: string
  tradeType: string
  storeId: string
  storeName: string
  channel: string
  changeType: string
  tradeTime: string
  virtualChange: number
  actualChange: number | null
  relatedId: string
}

/** 營業額扣款門店行 */
interface DeductStoreRow {
  key: string
  storeId: string
  storeName: string
  amount: number
  deducted: number
}

/** 欠款償還門店行 */
interface RepayStoreRow {
  key: string
  storeId: string
  storeName: string
  bd: string
  amount: number
}

/** Mock 明細（列表 Mock 行無真實 extra 時兜底展示） */
const mockDetail: BatchStoreRecord = {
  key: 'mock',
  groupId: '20261212312',
  groupName: '廣州酒家',
  brand: 'mFood',
  batchType: 'recharge',
  batchNo: 'PC1234567890',
  flowNo: 'CZ202601160000',
  tradeTime: '2026-01-16 09:16:21',
  isActual: '是',
  virtualAmount: 26000,
  actualAmount: 26000,
  discountAmount: 6000,
  applicant: '朱棣(002)',
  bd: '關山月(001)',
  remark: '新店首充，獎勵多',
  extra: {
    payMethod: 'mixed',
    bankAmount: 20000,
    revenueAmount: 600,
    bd: '關山月(001)',
    remark: '新店首充，獎勵多',
    deductStores: [
      { storeId: '123456789', storeLabel: '廣州酒家食品有限公司', amount: 200 },
      { storeId: '123456781', storeLabel: '陶陶居食品有限公司', amount: 200 },
      { storeId: '123456782', storeLabel: '點都德食品有限公司', amount: 200 },
    ],
  },
}

/** 生成明細ID（Mock，與 approvalStore 明細ID格式一致：MX+日期+序號） */
const genDetailId = (i: number) => `MX20260616${String(i).padStart(4, '0')}`

/** 子表格（營業額扣款門店 / 欠款償還門店）單頁上限：超出則分頁，未超出全量展示 */
const SUB_TABLE_PAGE_SIZE = 5

/** 分類型 Mock extra（列表 Mock 行兜底，保證對方集團等必填數據完整） */
const mockExtraByType: Record<string, Record<string, unknown>> = {
  transfer: {
    direction: 'out',
    toGroupId: '20261298121913',
    toGroupName: '海底撈',
    transferAmount: 26000,
    remark: '集團間餘額調撥',
  },
  merge: {
    direction: 'out',
    sourceVirtualBalance: 26000,
    sourceDebtAmount: 600,
    targetGroupId: '20261298121913',
    targetGroupName: '海底撈',
    repayStores: [
      { storeId: '123456789', storeLabel: '廣州酒家食品有限公司', bd: '關山月(001)', amount: 600 },
    ],
    remark: '集團合併，資產轉移',
  },
}

/** 詳情頁區塊容器（全局統一：白底 + 圓角 8 + 陰影） */
const sectionStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
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

/** 版塊標題（全局統一：左側色條 + 圖標 + 虛線分隔） */
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
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
    </div>
  )
}

export default function BatchDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recordKey = searchParams.get('key') || ''
  const typeParam = searchParams.get('type') || 'recharge'
  const batchNoParam = searchParams.get('batchNo') || ''
  const groupIdParam = searchParams.get('groupId') || ''

  /** 後端不可用時的降級批次：本地審批寫入記錄優先，Mock 行兜底 */
  const fallbackRecord = useCallback((): BatchStoreRecord => {
    const stored = getBatchRecordByKey(recordKey)
    if (stored) return stored
    return {
      ...mockDetail,
      batchType: typeParam,
      batchNo: batchNoParam || mockDetail.batchNo,
      virtualAmount: typeParam === 'recharge' ? mockDetail.virtualAmount : -26000,
      extra: typeParam === 'recharge' ? mockDetail.extra : mockExtraByType[typeParam] || {},
    }
  }, [recordKey, typeParam, batchNoParam])

  const [record, setRecord] = useState<BatchStoreRecord>(fallbackRecord)
  /** 真實交易明細（null = 後端不可用，改用本地推導的流水） */
  const [details, setDetails] = useState<FinDetail[] | null>(null)

  useEffect(() => {
    if (!batchNoParam) return
    let cancelled = false
    const load = async () => {
      const batch = await fetchFinBatchDetail(batchNoParam, groupIdParam || undefined).catch(() => null)
      if (cancelled) return
      if (!batch) {
        setRecord(fallbackRecord())
        setDetails(null)
        return
      }
      setRecord({ ...batch, key: `${batch.batchNo}-${batch.groupId}` } as BatchStoreRecord)
      const rows = await fetchFinDetails({ page: 1, size: 200, batchNo: batchNoParam, groupId: groupIdParam || undefined }).catch(() => null)
      if (!cancelled) setDetails(rows?.records ?? [])
    }
    void load()
    return () => { cancelled = true }
  }, [batchNoParam, groupIdParam, fallbackRecord])

  const extra = useMemo(() => (record.extra || {}) as Record<string, any>, [record.extra])
  const batchType = record.batchType
  const remark = extra.remark || (record.remark !== '--' ? record.remark : '')
  const typeTag = typeTagMap[batchType] || typeTagMap.recharge

  /** 營業額扣款門店（充值）：已扣金額取本批次該門店的扣款明細合計 */
  const deductStores: DeductStoreRow[] = useMemo(() =>
    ((extra.deductStores as any[]) || []).map((s, i) => {
      const deducted = details
        ? details
          .filter(d => d.storeId === s.storeId && d.tradeType === '扣款')
          .reduce((sum, d) => sum + Math.abs(Number(d.virtualChange) || 0), 0)
        : (s.deducted ?? 80)
      return {
        key: String(i),
        storeId: s.storeId,
        storeName: s.storeLabel?.replace(`(${s.storeId})`, '') || s.storeLabel || '',
        amount: s.amount,
        deducted: extra.payMethod ? deducted : 0,
      }
    }), [extra, details])

  /** 欠款償還門店（合併） */
  const repayStores: RepayStoreRow[] = useMemo(() =>
    ((extra.repayStores as any[]) || []).map((s, i) => ({
      key: String(i),
      storeId: s.storeId,
      storeName: s.storeLabel?.replace(`(${s.storeId})`, '') || s.storeLabel || '',
      bd: s.bd || '--',
      amount: s.amount,
    })), [extra])

  /** 交易明細：真實明細優先，後端不可用時按批次類型本地推導 */
  const flowRows = useMemo<FlowRow[]>(() => {
    if (details && details.length > 0) {
      return details.map((d, i) => ({
        key: String(i + 1),
        tradeType: d.tradeType,
        storeId: d.storeId || '--',
        storeName: d.storeName || '--',
        channel: d.channel || '--',
        changeType: d.changeType,
        tradeTime: d.tradeTime,
        virtualChange: Number(d.virtualChange) || 0,
        actualChange: d.actualChange === null || d.actualChange === undefined ? null : Number(d.actualChange),
        relatedId: `明細ID：${d.detailId}`,
      }))
    }
    const t = record.tradeTime
    const rows: FlowRow[] = []
    let i = 1
    const push = (row: Omit<FlowRow, 'key' | 'tradeTime' | 'relatedId'>) => {
      rows.push({ ...row, key: String(i), tradeTime: t, relatedId: `明細ID：${genDetailId(i)}` })
      i += 1
    }
    if (batchType === 'recharge') {
      const virtual = record.virtualAmount || 0
      const actual = record.actualAmount ?? 0
      push({ tradeType: '充值', storeId: '--', storeName: '--', channel: '外賣', changeType: '充值', virtualChange: virtual, actualChange: record.actualAmount === null ? null : actual })
      deductStores.forEach(s => {
        push({ tradeType: '扣款', storeId: s.storeId, storeName: s.storeName, channel: '外賣', changeType: '充值批次扣款', virtualChange: -s.deducted, actualChange: -s.deducted })
      })
    } else if (batchType === 'transfer') {
      const amount = Math.abs(Number(extra.transferAmount) || record.virtualAmount || 0)
      if (extra.direction === 'in') {
        push({ tradeType: '轉入', storeId: '--', storeName: '--', channel: '外賣', changeType: '轉賬轉入', virtualChange: amount, actualChange: null })
      } else {
        push({ tradeType: '轉出', storeId: '--', storeName: '--', channel: '外賣', changeType: '轉賬轉出', virtualChange: -amount, actualChange: null })
      }
    } else if (batchType === 'merge') {
      const balance = Math.abs(Number(extra.sourceVirtualBalance) || record.virtualAmount || 0)
      if (extra.direction === 'in') {
        push({ tradeType: '轉入', storeId: '--', storeName: '--', channel: '外賣', changeType: '合併轉入', virtualChange: balance, actualChange: null })
      } else {
        repayStores.forEach(s => {
          push({ tradeType: '扣款', storeId: s.storeId, storeName: s.storeName, channel: '外賣', changeType: '欠款償還', virtualChange: -s.amount, actualChange: null })
        })
        push({ tradeType: '轉出', storeId: '--', storeName: '--', channel: '外賣', changeType: '合併轉出', virtualChange: -balance, actualChange: null })
      }
    }
    return rows
  }, [batchType, record, extra, deductStores, repayStores, details])

  /** 金額渲染（+藍 / -紅） */
  const renderChange = (val: number | null) => {
    if (val === null || val === undefined) return <span style={{ color: '#999' }}>--</span>
    const positive = val >= 0
    return (
      <span style={{ color: positive ? '#1976D2' : '#FF4D4F', fontWeight: 600 }}>
        {positive ? '+' : '-'}{Math.abs(val).toLocaleString()}
      </span>
    )
  }

  /** 交易明細列 */
  const flowColumns: TableColumnsType<FlowRow> = [
    { title: '序號', dataIndex: 'key', key: 'key', width: 60, align: 'center' },
    { title: '交易類型', dataIndex: 'tradeType', key: 'tradeType', width: 90, align: 'center' },
    { title: '門店ID', dataIndex: 'storeId', key: 'storeId', width: 110, align: 'center', render: (v: string) => v === '--' ? <span style={{ color: '#999' }}>--</span> : v },
    { title: '門店名稱', dataIndex: 'storeName', key: 'storeName', width: 140, align: 'center', render: (v: string) => v === '--' ? <span style={{ color: '#999' }}>--</span> : v },
    { title: '業務頻道', dataIndex: 'channel', key: 'channel', width: 90, align: 'center' },
    { title: '變動類別', dataIndex: 'changeType', key: 'changeType', width: 150, align: 'center' },
    { title: '交易時間', dataIndex: 'tradeTime', key: 'tradeTime', width: 170, align: 'center' },
    { title: '虛擬賬戶變動金額', dataIndex: 'virtualChange', key: 'virtualChange', width: 140, align: 'center', render: renderChange },
    { title: '實收賬戶變動金額', dataIndex: 'actualChange', key: 'actualChange', width: 140, align: 'center', render: renderChange },
    { title: '關聯信息', dataIndex: 'relatedId', key: 'relatedId', width: 190, align: 'center', render: (v: string) => <span style={{ color: '#8C8C8C' }}>{v}</span> },
  ]

  /** 營業額扣款門店列（充值） */
  const deductStoreColumns: TableColumnsType<DeductStoreRow> = [
    { title: '扣款門店ID', dataIndex: 'storeId', key: 'storeId', align: 'center' },
    { title: '扣款門店名稱', dataIndex: 'storeName', key: 'storeName', align: 'center' },
    { title: '扣款金額', dataIndex: 'amount', key: 'amount', align: 'center', render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{v.toLocaleString()}</span> },
    { title: '已扣金額', dataIndex: 'deducted', key: 'deducted', align: 'center', render: (v: number) => <span style={{ color: '#1976D2', fontWeight: 600 }}>{v.toLocaleString()}</span> },
  ]

  /** 欠款償還門店列（合併） */
  const repayStoreColumns: TableColumnsType<RepayStoreRow> = [
    { title: '門店ID', dataIndex: 'storeId', key: 'storeId', align: 'center' },
    { title: '門店名稱', dataIndex: 'storeName', key: 'storeName', align: 'center' },
    { title: '歸屬BD', dataIndex: 'bd', key: 'bd', align: 'center' },
    { title: '償還金額', dataIndex: 'amount', key: 'amount', align: 'center', render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{v.toLocaleString()}</span> },
  ]

  /** 四列信息網格（全局統一：標籤在上、值在下） */
  const gridStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px',
  }

  /** 充值信息版塊 */
  const renderRechargeInfo = () => {
    const payMethod = payMethodMap[extra.payMethod as string] || '--'
    /** 虛擬賬戶充值金額（到賬總額） */
    const virtualAmount = Number(record.virtualAmount) || 0
    /** 實收賬戶充值金額（非實收批次為 null，展示 --） */
    const actualAmount = record.actualAmount === null || record.actualAmount === undefined
      ? null : Number(record.actualAmount)
    /** 優惠金額：記錄有值優先，否則按 虛擬到賬 - 實收 推導 */
    const discountAmount = record.discountAmount === null || record.discountAmount === undefined
      ? (actualAmount !== null ? Math.max(virtualAmount - actualAmount, 0) : 0)
      : Number(record.discountAmount)
    return (
      <>
        <div style={gridStyle}>
          <InfoItem label="充值批次號" value={record.batchNo} />
          <InfoItem label="流程編號" value={record.flowNo} />
          <InfoItem label="集團ID" value={record.groupId} />
          <InfoItem label="集團名稱" value={record.groupName} />
          <InfoItem label="所屬品牌" value={<BrandTag value={record.brand} />} />
          <InfoItem label="是否實收" value={record.isActual} />
          <InfoItem label="申請人" value={record.applicant || '--'} />
          <InfoItem label="歸屬BD" value={record.bd || '--'} />
        </div>
        {/* 充值金額信息：虛擬到賬 / 實收 / 優惠 */}
        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', margin: '20px 0' }} />
        <div style={gridStyle}>
          <InfoItem
            label="虛擬賬戶充值金額"
            value={virtualAmount.toLocaleString()}
            valueStyle={{ color: '#1890FF', fontWeight: 600 }}
          />
          <InfoItem
            label="實收賬戶充值金額"
            value={actualAmount === null ? <span style={{ color: '#999' }}>--</span> : actualAmount.toLocaleString()}
            valueStyle={{ color: '#52C41A', fontWeight: 600 }}
          />
          <InfoItem
            label="優惠金額"
            value={discountAmount.toLocaleString()}
            valueStyle={{ color: '#FF4D4F', fontWeight: 600 }}
          />
        </div>
        {record.isActual === '是' && (
          <>
            <div style={{ ...gridStyle, marginTop: 20 }}>
              <InfoItem label="結算方式" value={payMethod} />
              <InfoItem label="銀行轉賬金額" value={(Number(extra.bankAmount) || 0).toLocaleString()} valueStyle={{ color: '#E8720C', fontWeight: 600 }} />
              <InfoItem label="營業額支付金額" value={(Number(extra.revenueAmount) || 0).toLocaleString()} valueStyle={{ color: '#E8720C', fontWeight: 600 }} />
            </div>
            {deductStores.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 4, height: 14, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
                  營業額扣款門店
                </div>
                <Table<DeductStoreRow>
                  columns={deductStoreColumns}
                  dataSource={deductStores}
                  pagination={deductStores.length > SUB_TABLE_PAGE_SIZE ? {
                    pageSize: SUB_TABLE_PAGE_SIZE,
                    showTotal: (total) => `共 ${total} 條`,
                    size: 'small',
                  } : false}
                  size="small"
                  bordered={false}
                />
              </div>
            )}
          </>
        )}
      </>
    )
  }

  /** 轉賬信息版塊 */
  const renderTransferInfo = () => {
    const isIn = extra.direction === 'in'
    const amount = Math.abs(Number(extra.transferAmount) || record.virtualAmount || 0)
    return (
      <div style={gridStyle}>
        <InfoItem label="轉賬批次號" value={record.batchNo} />
        <InfoItem label="流程編號" value={record.flowNo} />
        <InfoItem label="集團ID" value={record.groupId} />
        <InfoItem label="集團名稱" value={record.groupName} />
        <InfoItem label="所屬品牌" value={<BrandTag value={record.brand} />} />
        <InfoItem label="轉賬方向" value={isIn ? <Tag color="green">轉入</Tag> : <Tag color="red">轉出</Tag>} />
        <InfoItem label={isIn ? '轉出集團ID' : '轉入集團ID'} value={isIn ? (extra.fromGroupId || '--') : (extra.toGroupId || '--')} />
        <InfoItem label={isIn ? '轉出集團名稱' : '轉入集團名稱'} value={isIn ? (extra.fromGroupName || '--') : (extra.toGroupName || '--')} />
        <InfoItem
          label="轉賬金額"
          value={`${isIn ? '+' : '-'}${amount.toLocaleString()}`}
          valueStyle={{ color: isIn ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}
        />
        <InfoItem label="申請人" value={record.applicant || '--'} />
      </div>
    )
  }

  /** 合併信息版塊 */
  const renderMergeInfo = () => {
    const isIn = extra.direction === 'in'
    const balance = Math.abs(Number(extra.sourceVirtualBalance) || record.virtualAmount || 0)
    const debtAmount = Number(extra.sourceDebtAmount) || 0
    return (
      <>
        <div style={gridStyle}>
          <InfoItem label="合併批次號" value={record.batchNo} />
          <InfoItem label="流程編號" value={record.flowNo} />
          <InfoItem label="集團ID" value={record.groupId} />
          <InfoItem
            label="集團名稱"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {record.groupName}
                {isIn
                  ? <Tag color="green" style={{ margin: 0 }}>存續集團</Tag>
                  : <Tag color="red" style={{ margin: 0 }}>註銷集團</Tag>}
              </span>
            }
          />
          <InfoItem label="所屬品牌" value={<BrandTag value={record.brand} />} />
          <InfoItem label={isIn ? '註銷集團ID' : '存續集團ID'} value={isIn ? (extra.sourceGroupId || '--') : (extra.targetGroupId || '--')} />
          <InfoItem
            label={isIn ? '註銷集團名稱' : '存續集團名稱'}
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {isIn ? (extra.sourceGroupName || '--') : (extra.targetGroupName || '--')}
                {isIn
                  ? <Tag color="red" style={{ margin: 0 }}>註銷集團</Tag>
                  : <Tag color="green" style={{ margin: 0 }}>存續集團</Tag>}
              </span>
            }
          />
          <InfoItem
            label="轉移餘額"
            value={`${isIn ? '+' : '-'}${balance.toLocaleString()}`}
            valueStyle={{ color: isIn ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}
          />
          {!isIn && debtAmount > 0 && (
            <InfoItem label="欠款總額" value={debtAmount.toLocaleString()} valueStyle={{ color: '#FF4D4F', fontWeight: 600 }} />
          )}
          <InfoItem label="申請人" value={record.applicant || '--'} />
        </div>
        {!isIn && debtAmount > 0 && repayStores.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 14, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
              欠款償還門店
            </div>
            <Table<RepayStoreRow>
              columns={repayStoreColumns}
              dataSource={repayStores}
              pagination={repayStores.length > SUB_TABLE_PAGE_SIZE ? {
                pageSize: SUB_TABLE_PAGE_SIZE,
                showTotal: (total) => `共 ${total} 條`,
                size: 'small',
              } : false}
              size="small"
              bordered={false}
            />
          </div>
        )}
      </>
    )
  }

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
              onClick={() => navigate('/batch-query')}
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>批次明細</h2>
              <Tag color={typeTag.color} style={{ margin: 0, fontSize: 12, padding: '2px 10px', borderRadius: 4, fontWeight: 500 }}>
                {typeTag.label}
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {/* 批次基本信息 */}
      <div style={sectionStyle}>
        <SectionTitle icon={<FileTextOutlined />} title={typeTitleMap[batchType] || '批次信息'} />
        {batchType === 'recharge' && renderRechargeInfo()}
        {batchType === 'transfer' && renderTransferInfo()}
        {batchType === 'merge' && renderMergeInfo()}

        {/* 備註信息 */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
          <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>備註信息</div>
          <div style={{ fontSize: 14, color: '#595959', lineHeight: 1.6 }}>{remark || '--'}</div>
        </div>
      </div>

      {/* 交易明細（流水數據） */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <SectionTitle icon={<ProfileOutlined />} title="交易明細" />
        <Table<FlowRow>
          columns={flowColumns}
          dataSource={flowRows}
          pagination={{
            total: flowRows.length,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1280 }}
        />
      </div>
    </div>
  )
}
