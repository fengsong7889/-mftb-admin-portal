/**
 * 需求验收 —— 业务验收人视角（三个队列）
 *
 * 为什么拆成三个队列，而不是一个「待我驗收」：
 * 服务端把验收分成两件独立的事实，界面上混成一个就会误导操作。
 * 1. 上線前預驗收（scope=acceptance，状态 uat_pending）：逐项判定用例，通过才能发起发布放行；
 *    不通过会把需求退回研发返工并作废在途放行单。
 * 2. 上線後待評分（scope=acceptance_post，状态 released）：确认上线后是否真解决了业务问题，
 *    必须打 1-5 分，这一份才是正式满意度口径。
 * 3. 我的驗收記錄（scope=acceptance_history）：我作为验收人签过的单子，用于回看与导出。
 *
 * <p>历史页原先走 scope=all，而 SCOPE_ALL 在服务端只放行 PMO/超管 —— 普通业务验收人
 * 打开「歷史驗收」拿到的是空列表，看起来像"没有记录"，实际是被权限挡在门外。
 * 现在三个页签都用按验收人字段收敛的 scope，任何角色都能读到属于自己的那一份，
 * 且不会因此看到别人的单。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Segmented, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import HelpPopover from '../../components/HelpPopover'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import { fetchDeliveryItems, fetchRequirementPage, fetchScopeCounts, type RdmDeliveryItemListItem, type RdmRequirementRow } from '../../api/rdm'
import { exportRequirementRows } from './requirementExport'
import {
  RDM_ACCEPTANCE_PATH_LABEL,
  RDM_ACCEPTANCE_TYPE_LABEL,
  RDM_ACCEPT_RESULT,
  RDM_DELIVERY_ITEM_STATUS,
  RDM_DELIVERY_ITEM_STATUS_COLOR,
  RDM_DELIVERY_ITEM_STATUS_LABEL,
  RDM_SCOPE,
  RDM_STATUS,
  type RdmScope,
} from '../../constants/rdm'
import './index.css'

/** 页签 → 服务端 scope：一一对应，不在前端二次过滤（否则计数与列表必然分叉） */
const TAB_SCOPE: Record<string, RdmScope> = {
  pre: RDM_SCOPE.ACCEPTANCE,
  post: RDM_SCOPE.ACCEPTANCE_POST,
  history: RDM_SCOPE.ACCEPTANCE_HISTORY,
}

/** 单次拉取上限：超出要在界面上说明，不能让人以为"就这么几条" */
const FETCH_SIZE = 100

/** 页签 → 导出文件名用的中文标签 */
const TAB_LABEL: Record<string, string> = {
  pre: '上線前預驗收',
  post: '上線後待評分',
  history: '我的驗收記錄',
}

/** 验收结论展示映射 */
const RESULT_TAG: Record<string, { text: string; color: string }> = {
  [RDM_ACCEPT_RESULT.PASS]: { text: '驗收通過', color: 'success' },
  [RDM_ACCEPT_RESULT.CONDITIONAL]: { text: '有條件通過', color: 'warning' },
  [RDM_ACCEPT_RESULT.FAIL]: { text: '驗收不通過', color: 'error' },
}

/**
 * 验收中心的统一来源标记：
 * 1. 验收表单页据此决定「返回」回本列表还是回需求详情（见 AcceptanceForm）；
 * 2. 需求详情是多个列表共用的落地页，带 from 才能让侧栏高亮留在验收中心，
 *    而不是被钉回默认归属（需求跟进清单）。只影响高亮，不参与鉴权。
 */
const ACCEPTANCE_FROM_QUERY = 'from=rdm-acceptance'
/** 详情落地页：href 形式给 <a>，path 形式给 navigate */
const detailHref = (reqId: number) => `#/rdm-detail?id=${reqId}&tab=gate&${ACCEPTANCE_FROM_QUERY}`
const detailPath = (reqId: number) => `/rdm-detail?id=${reqId}&tab=gate&${ACCEPTANCE_FROM_QUERY}`

export default function AcceptanceList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('pre')
  const [rows, setRows] = useState<RdmRequirementRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  /** V3：验收视角（需求级 / 交付项级），默认需求级，保持既有行为不变 */
  const [acceptanceMode, setAcceptanceMode] = useState<'requirement' | 'deliveryItem'>('requirement')
  /** V3：交付项验收子队列（待產品 / 待業務 / 已完成） */
  const [diQueue, setDiQueue] = useState<'product' | 'business' | 'done'>('product')
  const [diItems, setDiItems] = useState<RdmDeliveryItemListItem[]>([])
  const [diLoading, setDiLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRequirementPage({ scope: TAB_SCOPE[tab], size: FETCH_SIZE, page: 1 })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      message.error('驗收清單載入失敗')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  /** 页签计数走服务端同一份 scopeCounts：口径与列表一字不差 */
  useEffect(() => {
    fetchScopeCounts().then(setCounts).catch(() => setCounts({}))
  }, [])

  /** V3：拉取交付项（读接口失败则优雅降级为空，不影响需求级验收） */
  const loadDeliveryItems = useCallback(() => {
    setDiLoading(true)
    fetchDeliveryItems({ pageNo: 1, pageSize: 300 })
      .then(res => setDiItems(res.records ?? []))
      .catch(() => setDiItems([]))
      .finally(() => setDiLoading(false))
  }, [])

  /** V3：仅在切到交付项验收视角时才拉取，避免无谓请求 */
  useEffect(() => {
    if (acceptanceMode === 'deliveryItem') loadDeliveryItems()
  }, [acceptanceMode, loadDeliveryItems])

  const baseColumns: TableColumnsType<RdmRequirementRow> = [
    {
      title: '需求標題', dataIndex: 'title', key: 'title', width: 280, ellipsis: true,
      render: (v: string, r) => (
        <span className="rdm-v3-req-title-cell">
          <a className="rdm-table-title__link" title={v} href={detailHref(r.id)}>{v}</a>
          {r.flowVersion === 3 && <Tag className="rdm-v3-di-badge" color="geekblue">交付項級</Tag>}
        </span>
      ),
    },
    { title: '需求類型', dataIndex: 'reqType', key: 'reqType', width: 100, render: (v: string) => <TypeTag reqType={v} /> },
    { title: '優先級', dataIndex: 'priority', key: 'priority', width: 110, render: (v: string) => <PriorityTag priority={v} /> },
    { title: '提出人', dataIndex: 'submitterName', key: 'submitter', width: 110, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: '提出部門', dataIndex: 'submitDeptName', key: 'submitDeptName', width: 200, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 100, render: (v?: string | null) => v ?? '-' },
  ]

  const pendingColumns: TableColumnsType<RdmRequirementRow> = [
    ...baseColumns,
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string, r) => <StatusTag status={v} overdue={r.overdueFlag ?? false} />,
    },
    {
      title: '等待天數', key: 'stay', width: 100,
      render: (_, r) => {
        // 已归档需求不再计算等待天数：归档后数字没有管理意义
        if (r.status === RDM_STATUS.CLOSED) return '-'
        const days = Math.round((r.stayHours ?? 0) / 24)
        return <span style={{ color: days > 3 ? '#CF1322' : '#595959' }}>{days || '-'} 天</span>
      },
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-acceptance-form?id=${r.id}&tab=gate&${ACCEPTANCE_FROM_QUERY}`)}>去預驗收</Button>
          <Button type="link" size="small" onClick={() => navigate(detailPath(r.id))}>詳情</Button>
        </Space>
      ),
    },
  ]

  /** 上线后待评分：看的是「上了什么版本、什么时候上的」，不是预验收的用例数 */
  const postColumns: TableColumnsType<RdmRequirementRow> = [
    ...baseColumns,
    { title: '當前狀態', dataIndex: 'status', key: 'status', width: 120, render: (v: string) => <StatusTag status={v} /> },
    { title: '上線版本', dataIndex: 'versionNo', key: 'versionNo', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: '上線時間', dataIndex: 'actualReleaseDate', key: 'actualReleaseDate', width: 120, render: (v?: string | null) => v ?? '-' },
    {
      title: '已給結論', key: 'concluded', width: 120,
      render: (_, r) => {
        const meta = r.acceptanceResult ? RESULT_TAG[r.acceptanceResult] : undefined
        return meta
          ? <Tag color={meta.color} style={{ margin: 0 }}>{meta.text}</Tag>
          : <span style={{ color: '#8C8C8C' }}>未評分</span>
      },
    },
    {
      title: '操作', key: 'action', width: 170, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-acceptance-form?id=${r.id}&tab=gate&${ACCEPTANCE_FROM_QUERY}`)}>
            業務驗收（已上線）
          </Button>
          <Button type="link" size="small" onClick={() => navigate(detailPath(r.id))}>詳情</Button>
        </Space>
      ),
    },
  ]

  const historyColumns: TableColumnsType<RdmRequirementRow> = [
    ...baseColumns,
    { title: '狀態', dataIndex: 'status', key: 'status', width: 130, render: (v: string) => <StatusTag status={v} /> },
    {
      title: '驗收結論', dataIndex: 'acceptanceResult', key: 'acceptanceResult', width: 120,
      render: (v?: string | null) => {
        const meta = v ? RESULT_TAG[v] : undefined
        return meta ? <Tag color={meta.color} style={{ margin: 0 }}>{meta.text}</Tag> : <span style={{ color: '#8C8C8C' }}>待驗收</span>
      },
    },
    {
      title: '滿意度', dataIndex: 'acceptanceScore', key: 'acceptanceScore', width: 110,
      render: (v?: number | null) => (v ? <span style={{ color: '#52C41A', fontWeight: 600 }}>{v} / 5</span> : '-'),
    },
    { title: '上線版本', dataIndex: 'versionNo', key: 'versionNo', width: 100, render: (v?: string | null) => v ?? '-' },
    { title: '上線時間', dataIndex: 'actualReleaseDate', key: 'actualReleaseDate', width: 120, render: (v?: string | null) => v ?? '-' },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right',
      render: (_, r) => <Button type="link" size="small" onClick={() => navigate(detailPath(r.id))}>詳情</Button>,
    },
  ]

  /**
   * 列配置：三个页签列集不同，必须各自一个 pageKey，
   * 否则在历史页隐掉的列会回到待验收页签里。
   */
  const pendingMeta = useMemo(() => ([
    { key: 'title', title: '需求標題' },
    { key: 'reqNo', title: '需求編號' },
    { key: 'reqType', title: '需求類型' },
    { key: 'priority', title: '優先級' },
    { key: 'submitter', title: '提出人' },
    { key: 'submitDeptName', title: '提出部門' },
    { key: 'pmName', title: '產品經理' },
    { key: 'status', title: '當前狀態' },
    { key: 'stay', title: '等待天數' },
    { key: 'action', title: '操作' },
  ]), [])
  const postMeta = useMemo(() => ([
    { key: 'title', title: '需求標題' },
    { key: 'reqNo', title: '需求編號' },
    { key: 'reqType', title: '需求類型' },
    { key: 'priority', title: '優先級' },
    { key: 'submitter', title: '提出人' },
    { key: 'submitDeptName', title: '提出部門' },
    { key: 'pmName', title: '產品經理' },
    { key: 'status', title: '當前狀態' },
    { key: 'versionNo', title: '上線版本' },
    { key: 'actualReleaseDate', title: '上線時間' },
    { key: 'concluded', title: '已給結論' },
    { key: 'action', title: '操作' },
  ]), [])
  const historyMeta = useMemo(() => ([
    { key: 'title', title: '需求標題' },
    { key: 'reqNo', title: '需求編號' },
    { key: 'priority', title: '優先級' },
    { key: 'submitter', title: '提出人' },
    { key: 'submitDeptName', title: '提出部門' },
    { key: 'status', title: '狀態' },
    { key: 'acceptanceResult', title: '驗收結論' },
    { key: 'acceptanceScore', title: '滿意度' },
    { key: 'versionNo', title: '上線版本' },
    { key: 'actualReleaseDate', title: '上線時間' },
    { key: 'action', title: '操作' },
  ]), [])
  // locked 只能放在第三个参数（defaultConfig）：hook 从 allColumns 不读该字段
  const pendingCfg = useColumnConfig('rdm-acceptance-pending', pendingMeta, [
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const postCfg = useColumnConfig('rdm-acceptance-post', postMeta, [
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'reqType', visible: false },
    { key: 'pmName', visible: false },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const historyCfg = useColumnConfig('rdm-acceptance-history', historyMeta, [
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const activeCfg = tab === 'pre' ? pendingCfg : tab === 'post' ? postCfg : historyCfg
  const activeColumns = tab === 'pre' ? pendingColumns : tab === 'post' ? postColumns : historyColumns
  const visibleColumns = activeCfg.applyConfig(activeColumns) as TableColumnsType<RdmRequirementRow>
  const tableWidth = visibleColumns.reduce((sum, col) => sum + Number(col.width ?? 120), 0)
  const tabLabel = (key: string, label: string) => `${label}${counts[key] != null ? ` (${counts[key]})` : ''}`

  /** 导出当前页签已加载的记录：不足 total 时必须说明，不能静默导一半 */
  const handleExport = async () => {
    if (rows.length === 0) {
      message.warning('當前清單沒有數據可導出')
      return
    }
    try {
      await exportRequirementRows(rows, TAB_LABEL[tab])
      if (rows.length < total) {
        message.warning(`已導出 ${rows.length} 條（共 ${total} 條），僅本次載入的範圍。需導全部請縮小範圍或聯繫管理員`)
      } else {
        message.success(`已導出 ${rows.length} 條`)
      }
    } catch {
      message.error('導出失敗，請重試')
    }
  }

  /** V3：交付项归属哪个验收子队列（用已定义的状态枚举判定，不臆测 acceptanceStatus） */
  const diQueueOf = (di: RdmDeliveryItemListItem): 'product' | 'business' | 'done' | null => {
    if (di.status === RDM_DELIVERY_ITEM_STATUS.DONE) return 'done'
    if (di.status === RDM_DELIVERY_ITEM_STATUS.RELEASED_PENDING) return 'business'
    if (di.status === RDM_DELIVERY_ITEM_STATUS.PENDING_ACCEPTANCE) return 'product'
    return null
  }

  const DI_QUEUE_LABEL: Record<'product' | 'business' | 'done', string> = {
    product: '待產品驗收',
    business: '待業務驗收',
    done: '已完成',
  }

  /** V3：当前子队列下的交付项 */
  const diRows = useMemo(() => diItems.filter(di => diQueueOf(di) === diQueue), [diItems, diQueue])

  /** V3：交付项验收队列的列 */
  const diColumns: TableColumnsType<RdmDeliveryItemListItem> = [
    {
      title: '交付項', dataIndex: 'title', key: 'title', width: 240, ellipsis: true,
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <a className="rdm-table-title__link" title={v} onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${r.id}`)}>{v}</a>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.itemNo}</div>
        </div>
      ),
    },
    {
      title: '需求', key: 'req', width: 220, ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <a className="rdm-table-title__link" title={r.reqTitle} href={detailHref(r.reqId)}>{r.reqTitle}</a>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.reqNo}</div>
        </div>
      ),
    },
    {
      title: '驗收類型', key: 'acceptanceType', width: 110,
      render: (_, r) => {
        const q = diQueueOf(r)
        const label = q === 'done' ? '已完成' : RDM_ACCEPTANCE_TYPE_LABEL[q === 'business' ? 'business' : 'product']
        return <Tag color={q === 'done' ? 'success' : q === 'business' ? 'gold' : 'processing'} style={{ margin: 0 }}>{label}</Tag>
      },
    },
    {
      title: '路徑', dataIndex: 'acceptancePath', key: 'acceptancePath', width: 180,
      render: (v?: string) => <span style={{ fontSize: 12 }}>{v ? (RDM_ACCEPTANCE_PATH_LABEL[v] ?? v) : '-'}</span>,
    },
    {
      title: '階段', dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => (
        <Tag color={RDM_DELIVERY_ITEM_STATUS_COLOR[v] ?? 'default'} style={{ margin: 0 }}>
          {RDM_DELIVERY_ITEM_STATUS_LABEL[v] ?? v}
        </Tag>
      ),
    },
    { title: '簽署人', dataIndex: 'coordinatorUserName', key: 'coordinatorUserName', width: 110, render: (v?: string) => v || '-' },
    { title: '結論', dataIndex: 'acceptanceStatus', key: 'acceptanceStatus', width: 110, render: (v?: string) => v || <span style={{ color: '#8C8C8C' }}>-</span> },
    { title: '輪次', dataIndex: 'scopeVersion', key: 'scopeVersion', width: 80, render: (v?: number) => (v ? `v${v}` : '-') },
    { title: '時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 120, render: (v?: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 150, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          {diQueueOf(r) !== 'done' && (
            <Button type="link" size="small" onClick={() => navigate(`/rdm-acceptance-form?id=${r.reqId}&deliveryItemId=${r.id}&tab=gate`)}>驗收</Button>
          )}
          <Button type="link" size="small" onClick={() => navigate(`/rdm-delivery-item?mode=view&id=${r.id}`)}>詳情</Button>
        </Space>
      ),
    },
  ]

  /** V3：交付项验收视角（与需求级验收完全隔离，不影响既有页签） */
  const renderDeliveryItemAcceptance = () => (
    <>
      <div className="action-section">
        <div className="action-section-left">
          <Segmented
            value={diQueue}
            onChange={v => setDiQueue(v as 'product' | 'business' | 'done')}
            options={[
              { label: '待產品驗收', value: 'product' },
              { label: '待業務驗收', value: 'business' },
              { label: '已完成', value: 'done' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadDeliveryItems}>刷新</Button>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="交付項驗收（分批交付 V3）：以交付項為粒度逐項驗收，產品驗收通過後方可發布；路徑 B 允許先上線後補業務驗收。"
      />

      <Table<RdmDeliveryItemListItem>
        className="nowrap-table"
        rowKey="id"
        loading={diLoading}
        columns={diColumns}
        tableLayout="fixed"
        dataSource={diRows}
        scroll={{ x: 1400 }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
        }}
      />

      {diRows.length === 0 && !diLoading && (
        <div style={{ textAlign: 'center', color: '#8C8C8C', padding: 24 }}>
          <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 6 }} />當前沒有{DI_QUEUE_LABEL[diQueue]}的交付項
        </div>
      )}
    </>
  )

  return (
    <div className="content-area">
      <div className="rdm-v3-acceptance-mode" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Segmented
          value={acceptanceMode}
          onChange={v => setAcceptanceMode(v as 'requirement' | 'deliveryItem')}
          options={[{ label: '需求驗收', value: 'requirement' }, { label: '交付項驗收', value: 'deliveryItem' }]}
        />
        {/* 两种验收粒度长期并存，不解释清楚就会变成用户二选一的猜谜 */}
        <HelpPopover
          title={t('rdm.acceptance.viewHelpTitle')}
          ariaLabel="驗收視角區別說明"
          placement="bottomLeft"
          width={440}
          content={[
            { tone: 'info', label: t('rdm.acceptance.viewHelpReqLabel'), body: t('rdm.acceptance.viewHelpReqBody') },
            { tone: 'success', label: t('rdm.acceptance.viewHelpDiLabel'), body: t('rdm.acceptance.viewHelpDiBody') },
            { tone: 'neutral', label: t('rdm.acceptance.viewHelpWhichLabel'), body: t('rdm.acceptance.viewHelpWhichBody') },
          ]}
        />
      </div>

      {acceptanceMode === 'deliveryItem' ? (
        renderDeliveryItemAcceptance()
      ) : (
      <>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'pre', label: tabLabel(RDM_SCOPE.ACCEPTANCE, '上線前預驗收') },
          { key: 'post', label: tabLabel(RDM_SCOPE.ACCEPTANCE_POST, '上線後待評分') },
          { key: 'history', label: tabLabel(RDM_SCOPE.ACCEPTANCE_HISTORY, '我的驗收記錄') },
        ]}
      />

      <div className="action-section">
        <div className="action-section-left">
          {tab !== 'history' && (
            <Tag icon={<ClockCircleOutlined />} color="orange" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 6 }}>
              {tab === 'pre'
                ? '此處為上線前預驗收：逐項判定檢查項後才能發起發布放行，不通過會退回研發返工'
                : '此處為上線後正式驗收：需給 1-5 分滿意度，這才是質量口徑裡的正式分數'}
            </Tag>
          )}
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出本頁</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        </div>
        <div className="action-section-right">{activeCfg.configComponent}</div>
      </div>

      {rows.length > 0 && rows.length < total && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`本頁只載入前 ${FETCH_SIZE} 條（共 ${total} 條），請用關鍵字縮小範圍後再逐頁處理`}
        />
      )}

      <Table<RdmRequirementRow>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={visibleColumns}
        tableLayout="fixed"
        dataSource={rows}
        scroll={{ x: tableWidth }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
        }}
      />

      {tab === 'pre' && rows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: '#8C8C8C', padding: 24 }}>
          <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 6 }} />當前沒有待預驗收的需求
        </div>
      )}
      </>
      )}
    </div>
  )
}
