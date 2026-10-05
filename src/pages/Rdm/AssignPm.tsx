/**
 * 分配产品经理 —— 需求池/技术负责人视角的独立操作页
 *
 * 为什么不用弹窗（AGENTS.md §9.1）：分配会改变需求归属、直接让需求跳出需求池并通知产品经理，
 * 属于有副作用的正式操作；独立页面能列出被分配的每条需求、能刷新、能从详情页回跳，
 * 出问题时也知道自己在动哪些单子。弹窗里只放一个下拉，用户确认后根本不知道动了谁。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SendOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RdmFormHeader from './components/RdmFormHeader'
import { batchAssign, fetchProductOptions, fetchRequirementDetail, type RdmProductOption, type RdmRequirementDetail } from '../../api/rdm'
import { RDM_PRIORITY_LABEL, RDM_STATUS_LABEL, RDM_STATUS_COLOR, type RdmPriority, type RdmStatus } from '../../constants/rdm'
import './index.css'

/** 选中的产品经理（确认框与提交都要用名字，避免提交后再去反查） */
interface PickedPm {
  userId: number
  name: string
  loadText: string
}

export default function AssignPm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idsParam = searchParams.get('ids') ?? ''
  // useMemo 让 ids 引用稳定：它每次渲染重建会让下面的 useCallback 失效（依赖里必须能安全写 ids）
  const ids = useMemo(() => idsParam
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0), [idsParam])

  const [rows, setRows] = useState<RdmRequirementDetail[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [picked, setPicked] = useState<PickedPm | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  /** 分配完回到来源视角（需求池 / 交付中台账），不回列表页第一屏 */
  const backPath = searchParams.get('from') === 'requirement' ? '/rdm-requirement' : '/rdm-intake'

  const load = useCallback(async () => {
    if (ids.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    // 逐条取详情：列表接口按视角过滤，跨视角批量选中时可能查不全，逐条取最稳
    const list = await Promise.all(ids.map(id => fetchRequirementDetail(id).catch(() => null)))
    setRows(list.filter((r): r is RdmRequirementDetail => !!r))
    setLoading(false)
  }, [ids])

  useEffect(() => {
    fetchProductOptions().then(setPmOptions).catch(() => setPmOptions([]))
  }, [])

  useEffect(() => { void load() }, [load])

  const columns: TableColumnsType<RdmRequirementDetail> = [
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    { title: '標題', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: '優先級', dataIndex: 'priority', key: 'priority', width: 110,
      render: (v: string) => RDM_PRIORITY_LABEL[v as RdmPriority] ?? v,
    },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string) => (
        <Tag color={RDM_STATUS_COLOR[v as RdmStatus] ?? 'default'} style={{ margin: 0 }}>
          {RDM_STATUS_LABEL[v as RdmStatus] ?? v}
        </Tag>
      ),
    },
    { title: '提出人', dataIndex: 'submitterName', key: 'submitterName', width: 110 },
    {
      title: '現負責產品', dataIndex: 'pmName', key: 'pmName', width: 120,
      render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>未分配</span>,
    },
  ]

  /** 确认后再提交：分配会通知对方并让需求离开需求池 */
  const handleSubmit = () => {
    if (ids.length === 0) {
      message.warning('未指定要分配的需求')
      return
    }
    if (!picked) {
      message.warning('請選擇產品經理')
      return
    }
    const target = picked
    Modal.confirm({
      title: `確認把 ${ids.length} 條需求分配給 ${target.name}？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>產品經理：</span><b>{target.name}</b></div>
          <div className="confirm-info-row"><span>當前負荷：</span><b>{target.loadText}</b></div>
          <div className="confirm-info-row"><span>需求：</span><b>{rows.map(r => r.reqNo).join('、') || `${ids.length} 條`}</b></div>
          <div className="confirm-info-row"><span>狀態影響：</span><b>需求直接進入「已分配·待受理」，並向對方發送待辦提醒</b></div>
        </div>
      ),
      okText: '確認分配',
      cancelText: '取消',
      onOk: () => runAssign(target),
    })
  }

  const runAssign = async (target: PickedPm) => {
    setSubmitting(true)
    try {
      await batchAssign(ids, { userId: target.userId, name: target.name })
      message.success(`已分配 ${ids.length} 條需求給 ${target.name}`)
      navigate(backPath)
    } catch (err) {
      // 分配接口是静默请求，失败必须在这里说清，否则页面停在原地让人以为卡在加载
      message.error(err instanceof Error && err.message ? err.message : '分配失敗，請重試')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title="分配產品經理"
        backText="返回列表"
        onBack={() => navigate(backPath)}
        meta={`已選 ${ids.length} 條需求，分配後將跳過需求池直接進入產品受理，並向被指派人發送待辦提醒`}
      />

      {rows.length < ids.length && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`有 ${ids.length - rows.length} 條需求載入失敗或已被刪除，將不會被分配`}
        />
      )}

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><UserSwitchOutlined /></span>
          分配對象
        </div>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ fontSize: 13, color: '#595959' }}>
            候選人名下的「在途 / 容量」是實時負載，超載的人再壓需求只會整條鏈路變慢
          </div>
          <Select
            style={{ width: '100%', maxWidth: 520 }}
            placeholder="選擇產品經理"
            showSearch
            optionFilterProp="label"
            value={picked?.userId}
            onChange={(val: number) => {
              const pm = pmOptions.find(p => p.userId === val)
              if (!pm) {
                setPicked(null)
                return
              }
              setPicked({
                userId: pm.userId,
                name: pm.name,
                loadText: `在途 ${pm.activeCount}/${pm.capacity}${pm.domains.length > 0 ? ` · ${pm.domains.join('/')}` : ''}`,
              })
            }}
            options={pmOptions.map(pm => ({
              value: pm.userId,
              label: pm.domains.length > 0
                ? `${pm.name} · 在途 ${pm.activeCount}/${pm.capacity} · ${pm.domains.join('/')}`
                : `${pm.name} · 在途 ${pm.activeCount}/${pm.capacity}`,
            }))}
          />
        </Space>
      </div>

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><SendOutlined /></span>
          被分配的需求（{rows.length}）
        </div>
        <Table<RdmRequirementDetail>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </div>

      <div className="form-footer">
        <Button onClick={() => navigate(backPath)}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          確認分配
        </Button>
      </div>
    </div>
  )
}
