import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import HelpPopover from '@/components/HelpPopover'
import { fetchLifecycleEmployeeOptions, HR_LIFECYCLE_TYPE } from '@/api/hrLifecycle'
import type { HrEmployeeBrief } from '@/api/hrLifecycle'
import {
  OFFBOARDING_TASK_STATUS,
  assignOffboardingReceiver,
  fetchOffboardingTasks,
  retryOffboardingTask,
} from '@/api/hrOffboarding'
import type { OffboardingTaskItem } from '@/api/hrOffboarding'

const TASK_TYPE_LABEL_KEY: Record<string, string> = {
  EAM_ASSET_HANDOVER: 'hrOffboarding.type.EAM_ASSET_HANDOVER',
  OA_TODO_TRANSFER: 'hrOffboarding.type.OA_TODO_TRANSFER',
}

const STATUS_LABEL_KEY: Record<string, string> = {
  PENDING: 'hrOffboarding.status.PENDING',
  RUNNING: 'hrOffboarding.status.RUNNING',
  DONE: 'hrOffboarding.status.DONE',
  SKIPPED: 'hrOffboarding.status.SKIPPED',
  FAILED: 'hrOffboarding.status.FAILED',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  DONE: 'success',
  SKIPPED: 'default',
  FAILED: 'error',
}

interface Props {
  open: boolean
  requestId: number | null
  reqNo?: string
  onClose: () => void
  /** 是否可指定接收人/重试（后端同样按 hr-dimission:edit 裁决，界面隐藏只是 UX） */
  canManage: boolean
}

/**
 * 离职交接联动面板：资产交接与 OA 待办改派的执行状态、失败原因与重试入口。
 *
 * 为什么把「指定接收人」放在这里而不是离职表单里必填：离职办理不该被「还没决定给谁」卡住，
 * 但资产与待办又必须有明确接手人 —— 所以任务先停在等待态，这里补一个人就能推进。
 * 接收人只能选在职员工（服务端还会再校验一次人员范围与是否本人）。
 */
export default function OffboardingModal({ open, requestId, reqNo, onClose, canManage }: Props) {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<OffboardingTaskItem[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [candidates, setCandidates] = useState<HrEmployeeBrief[]>([])
  const [receiverId, setReceiverId] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    if (requestId == null) return
    setLoading(true)
    setFailed(false)
    try {
      setTasks(await fetchOffboardingTasks(requestId))
    } catch {
      setFailed(true)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    if (open) {
      setReceiverId(null)
      void load()
    }
  }, [open, load])

  const searchReceivers = useCallback(async (keyword: string) => {
    setSearching(true)
    try {
      // 只列在职员工：离职人自己不可能是接收人，系统服务账号也不在候选里
      setCandidates(await fetchLifecycleEmployeeOptions(HR_LIFECYCLE_TYPE.DIMISSION, keyword))
    } catch {
      setCandidates([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleAssign = () => {
    if (requestId == null || receiverId == null) {
      message.warning(t('hrOffboarding.pickReceiverFirst'))
      return
    }
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('hrOffboarding.assignConfirmTitle'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('hrOffboarding.receiverLabel')}：</span>
            <b>{candidates.find(c => c.userId === receiverId)?.name ?? receiverId}</b>
          </div>
          <div className="confirm-info-row">{t('hrOffboarding.assignConfirmTip')}</div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setWorking(true)
        try {
          await assignOffboardingReceiver(requestId, receiverId)
          message.success(t('hrOffboarding.assigned'))
          await load()
        } catch {
          message.error(t('hrOffboarding.assignFailed'))
        } finally {
          setWorking(false)
        }
      },
    })
  }

  const handleRetry = async (task: OffboardingTaskItem) => {
    setWorking(true)
    try {
      const summary = await retryOffboardingTask(task.id)
      message.success(summary || t('hrOffboarding.retried'))
      await load()
    } catch {
      message.error(t('hrOffboarding.retryFailed'))
    } finally {
      setWorking(false)
    }
  }

  const columns: TableColumnsType<OffboardingTaskItem> = [
    {
      title: t('hrOffboarding.colType'),
      dataIndex: 'taskType',
      key: 'taskType',
      width: 150,
      render: (v: string) => t(TASK_TYPE_LABEL_KEY[v] ?? 'hrOffboarding.type.UNKNOWN'),
    },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string, r) => (
        <Space size={4}>
          <Tag color={STATUS_COLOR[v] ?? 'default'}>{t(STATUS_LABEL_KEY[v] ?? 'hrOffboarding.status.UNKNOWN')}</Tag>
          {(r.attempts ?? 0) > 0 && <Typography.Text type="secondary">×{r.attempts}</Typography.Text>}
        </Space>
      ),
    },
    {
      title: t('hrOffboarding.colResult'),
      key: 'result',
      render: (_: unknown, r) => (
        <div>
          <div>{r.resultSummary || '-'}</div>
          {r.lastError && (
            <Typography.Text type="danger">{t('hrOffboarding.lastErrorPrefix')}{r.lastError}</Typography.Text>
          )}
          {r.targetRef && <div><Typography.Text type="secondary">{t('hrOffboarding.refPrefix')}{r.targetRef}</Typography.Text></div>}
        </div>
      ),
    },
    {
      title: t('hrOffboarding.colPlan'),
      dataIndex: 'effectiveDate',
      key: 'effectiveDate',
      width: 120,
      render: (v?: string | null) => v || '-',
    },
    {
      title: t('hrOffboarding.colUpdated'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 155,
      render: (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    ...(canManage ? [{
      title: t('common.colAction'),
      key: 'action',
      width: 90,
      render: (_: unknown, r: OffboardingTaskItem) => (
        // 按状态给不同措辞，而不是统一一个「重試」：
        //   PENDING 是首次执行（还什么都没做过，叫“重试”会让人以为已失败过）
        //   RUNNING 是定时任务正在跳，此处再发一次就是抢同一个任务
        //   FAILED 才是重试；DONE/SKIPPED 是终态（后端也会拒，这里只是不让 HR 白点）
        r.status === OFFBOARDING_TASK_STATUS.DONE || r.status === OFFBOARDING_TASK_STATUS.SKIPPED ? (
          <Typography.Text type="secondary">-</Typography.Text>
        ) : r.status === OFFBOARDING_TASK_STATUS.RUNNING ? (
          <Typography.Text type="secondary">{t('hrOffboarding.inProgress')}</Typography.Text>
        ) : (
          <Button type="link" size="small" loading={working} onClick={() => void handleRetry(r)}>
            {r.status === OFFBOARDING_TASK_STATUS.PENDING
              ? t('hrOffboarding.execute')
              : t('hrOffboarding.retry')}
          </Button>
        )
      ),
    }] : []),
  ]

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={920}
      title={
        <Space size={8}>
          <span>{t('hrOffboarding.title')}{reqNo ? ` · ${reqNo}` : ''}</span>
          <HelpPopover
            title={t('hrOffboarding.helpTitle')}
            ariaLabel={t('hrOffboarding.helpAria')}
            placement="bottomRight"
            width={400}
            content={[
              { tone: 'info', label: t('hrOffboarding.helpScopeLabel'), body: t('hrOffboarding.helpScopeBody') },
              { tone: 'warn', label: t('hrOffboarding.helpReceiverLabel'), body: t('hrOffboarding.helpReceiverBody') },
              { tone: 'neutral', label: t('hrOffboarding.helpBoundaryLabel'), body: t('hrOffboarding.helpBoundaryBody') },
            ]}
          />
        </Space>
      }
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t('hrOffboarding.refresh')}
        </Button>,
        <Button key="close" onClick={onClose}>{t('common.close')}</Button>,
        ...(canManage ? [
          <Button key="assign" type="primary" loading={working} disabled={receiverId == null} onClick={handleAssign}>
            {t('hrOffboarding.assignReceiver')}
          </Button>,
        ] : []),
      ]}
    >
      {failed && (
        <Alert
          type="error"
          showIcon
          message={t('hrOffboarding.loadFailed')}
          action={<Button size="small" onClick={() => void load()}>{t('hrOffboarding.retry')}</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      {canManage && (
        <Space size={8} style={{ marginBottom: 12 }}>
          <span>{t('hrOffboarding.receiverLabel')}</span>
          <Select
            showSearch
            allowClear
            style={{ width: 280 }}
            filterOption={false}
            loading={searching}
            placeholder={t('hrOffboarding.receiverPlaceholder')}
            onSearch={keyword => void searchReceivers(keyword)}
            onFocus={() => { if (candidates.length === 0) void searchReceivers('') }}
            value={receiverId ?? undefined}
            onChange={value => setReceiverId(typeof value === 'number' ? value : null)}
            options={candidates.map(c => ({
              value: c.userId,
              // 选人下拉统一「姓名（工號）」，部门不参与消歧
              label: `${c.name}（${c.empId}）`,
            }))}
          />
        </Space>
      )}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={tasks}
        scroll={{ x: 'max-content' }}
        pagination={false}
        locale={{ emptyText: failed ? t('common.noData') : t('hrOffboarding.empty') }}
      />
    </Modal>
  )
}
