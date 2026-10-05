/**
 * 版本追溯 —— 需求 ↔ 版本 双向可查
 *
 * 设计口径：业务方问「我的需求上了吗」，研发问「这个版本带了什么」。
 * 所以左侧按版本列，右侧一次给出该版本的需求清单与验收结果；
 * 从需求详情进来时（?reqId=）反向定位版本，并把该需求高亮置顶。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Select, Space, Spin, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BranchesOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  ReloadOutlined,
  RollbackOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import StatCards from '../../components/StatCards'
import { fetchVersionHistory } from '../../api/versionHistory'
import type { VersionHistoryRecord } from '../../api/versionHistory'
import { fetchRequirementTrace, fetchVersionTrace, type RdmVersionTrace } from '../../api/rdm'
import {
  RDM_ACCEPT_RESULT,
  RDM_ACCEPT_RESULT_COLOR,
  RDM_ACCEPT_RESULT_LABEL,
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_STATUS_LABEL,
  type RdmAcceptResult,
  type RdmPriority,
  type RdmReqType,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

/** 版本列表兜底（后端版本历史不可用时仍可演示追溯） */
const FALLBACK_VERSIONS = ['2.9.0', '2.10.0', '2.11.0']

export default function VersionTrace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const initialVersion = searchParams.get('versionNo') ?? ''

  const [versions, setVersions] = useState<VersionHistoryRecord[]>([])
  const [versionNo, setVersionNo] = useState<string>(initialVersion)
  const [trace, setTrace] = useState<RdmVersionTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [sourceReqId, setSourceReqId] = useState(reqId)

  /** 版本下拉：来自 sys_version_history（发布记录），字段含发布日期与摘要 */
  useEffect(() => {
    fetchVersionHistory({ page: 1, size: 30 })
      .then(res => setVersions(res.records ?? []))
      .catch(() => setVersions([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (sourceReqId) {
        // 需求 → 版本：先拿到该需求关联的版本号
        const byReq = await fetchRequirementTrace(sourceReqId)
        setTrace(byReq)
        if (byReq.versionNo) setVersionNo(byReq.versionNo)
        return
      }
      const target = versionNo || versions[0]?.versionNo || FALLBACK_VERSIONS[0]
      if (!versionNo) setVersionNo(target)
      setTrace(await fetchVersionTrace(target))
    } catch {
      message.error('追溯數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [sourceReqId, versionNo, versions])

  useEffect(() => { void load() }, [load])

  const versionOptions = useMemo(() => (
    versions.length
      ? versions.map(v => ({ value: v.versionNo, label: `${v.versionNo}（${v.releaseDate ?? '-'}）` }))
      : FALLBACK_VERSIONS.map(v => ({ value: v, label: v }))
  ), [versions])

  const columns: TableColumnsType<RdmVersionTrace['requirements'][number]> = useMemo(() => [
    {
      title: '需求', dataIndex: 'title', key: 'title', width: 280,
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.reqNo}</div>
        </div>
      ),
    },
    {
      title: '類型 / 優先級', key: 'type', width: 150,
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag style={{ margin: 0 }}>{RDM_REQ_TYPE_LABEL[r.reqType as RdmReqType] ?? r.reqType ?? '-'}</Tag>
          <Tag color="orange" style={{ margin: 0 }}>{RDM_PRIORITY_LABEL[r.priority as RdmPriority] ?? r.priority ?? '-'}</Tag>
        </Space>
      ),
    },
    { title: '提出部門', dataIndex: 'submitDeptName', key: 'submitDeptName', width: 120, render: (v?: string | null) => v ?? '-' },
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 100, render: (v?: string | null) => v ?? '-' },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag style={{ margin: 0 }}>{RDM_STATUS_LABEL[v as RdmStatus] ?? v}</Tag>,
    },
    {
      title: '驗收結論', key: 'acceptance', width: 150,
      render: (_, r) => {
        const key = (r.acceptanceResult ?? RDM_ACCEPT_RESULT.PASS) as RdmAcceptResult
        return (
          <Space size={4}>
            <Tag color={RDM_ACCEPT_RESULT_COLOR[key] ?? 'default'} style={{ margin: 0 }}>
              {RDM_ACCEPT_RESULT_LABEL[key] ?? r.acceptanceResult ?? '待驗收'}
            </Tag>
            {r.acceptanceScore != null && <span style={{ fontSize: 12, color: '#8C8C8C' }}>{r.acceptanceScore}/5</span>}
          </Space>
        )
      },
    },
    {
      title: '返工', dataIndex: 'reworkCount', key: 'reworkCount', width: 90,
      render: (v?: number | null) => v && v > 0
        ? <Tooltip title="驗收退回累計次數"><Tag color="error" style={{ margin: 0 }}>{v} 次</Tag></Tooltip>
        : <span style={{ color: '#52C41A' }}>無</span>,
    },
    { title: '計劃上線', dataIndex: 'planReleaseDate', key: 'planReleaseDate', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: '實際上線', dataIndex: 'actualReleaseDate', key: 'actualReleaseDate', width: 110, render: (v?: string | null) => v ?? '-' },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_, r) => <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>詳情</Button>,
    },
  ], [navigate])

  /**
   * 列配置（§E.3：列表页必须可隐显/排序）。
   * <p>必须放在下面的 loading 提前 return 之前：hook 不能处在条件分支后面，
   * 否则渲染次数不一致会报 out-of-order hooks。
   */
  const { configComponent, applyConfig } = useColumnConfig('rdm-version-trace', [
    { key: 'title', title: '需求' },
    { key: 'type', title: '類型 / 優先級' },
    { key: 'submitDeptName', title: '提出部門' },
    { key: 'pmName', title: '產品經理' },
    { key: 'status', title: '狀態' },
    { key: 'acceptance', title: '驗收結論' },
    { key: 'reworkCount', title: '返工' },
    { key: 'planReleaseDate', title: '計劃上線' },
    { key: 'actualReleaseDate', title: '實際上線' },
    { key: 'action', title: '操作' },
  ], [
    // locked 只能写在第三个参数（defaultConfig）：hook 从 allColumns 不读该字段
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  if (loading && !trace) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  const stats = trace?.stats ?? { total: 0, released: 0, acceptancePass: 0, avgScore: 0 }

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BranchesOutlined style={{ color: '#1890FF' }} />
          需求 ↔ 版本追溯
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            上線必須關聯版本，版本可反查需求，兩側都能追到源頭
          </span>
        </div>
        <Space size={8} wrap>
          <Select
            style={{ width: 240 }}
            value={versionNo || undefined}
            placeholder="選擇版本"
            options={versionOptions}
            onChange={v => { setVersionNo(v); setSourceReqId(0) }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          {sourceReqId > 0 && (
            <Button icon={<RollbackOutlined />} onClick={() => { setSourceReqId(0); void navigate('/rdm-version-trace') }}>
              退出需求視圖
            </Button>
          )}
          <Button icon={<ExportOutlined />} onClick={() => void navigate('/rdm-requirement')}>需求台賬</Button>
          {configComponent}
        </Space>
      </div>

      {sourceReqId > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="當前為「需求 → 版本」視圖：已定位該需求所屬版本，並列出同版本一起上線的其它需求。"
        />
      )}

      {trace && !trace.versionNo && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="該需求尚未關聯上線版本"
          description="需求只有在執行「確認上線」時才會綁定版本號；未綁定版本的需求無法參與追溯，也無法統計版本吞吐。"
        />
      )}

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><TagsOutlined /></span>
          版本 {trace?.versionNo ?? '-'}
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            {trace?.releaseDate ?? '未記錄發佈日期'}
            {trace?.commitHash ? ` · commit ${trace.commitHash}` : ''}
          </span>
        </div>
        {trace?.summary && <div style={{ fontSize: 13, color: '#595959', marginBottom: 12 }}>{trace.summary}</div>}
        <StatCards
          animationKey={trace?.versionNo ?? 'none'}
          items={[
            { key: 'total', icon: <TagsOutlined />, value: stats.total, label: '本版需求數', color: 'info' },
            { key: 'released', icon: <CheckCircleOutlined />, value: stats.released, label: '已上線', color: 'success' },
            { key: 'pass', icon: <CheckCircleOutlined />, value: stats.acceptancePass, label: '驗收通過', color: 'brand' },
            { key: 'score', icon: <CheckCircleOutlined />, value: Number(stats.avgScore.toFixed(1)), decimals: 1, suffix: ' / 5', label: '平均滿意度', color: 'system' },
          ]}
        />
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><BranchesOutlined /></span>
          本版上線需求明細
          <span className="rdm-card-title-split" />
        </div>
        <Table<RdmVersionTrace['requirements'][number]>
          rowKey="reqId"
          size="small"
          loading={loading}
          columns={applyConfig(columns) as TableColumnsType<RdmVersionTrace['requirements'][number]>}
          dataSource={[...(trace?.requirements ?? [])].sort((a, b) => (b.reqId === sourceReqId ? 1 : 0) - (a.reqId === sourceReqId ? 1 : 0))}
          scroll={{ x: 1500 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 條`,
          }}
          locale={{ emptyText: '該版本暫無關聯需求（版本記錄存在但需求未綁定版本號，或該版本尚未發布）' }}
        />
      </div>
    </div>
  )
}
