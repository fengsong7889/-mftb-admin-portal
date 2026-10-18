import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import HelpPopover from '@/components/HelpPopover'
import {
  DIFF_CODE,
  fetchProfileDiffReport,
  syncEmploymentPeriods,
} from '@/api/hrEmployment'
import type { DiffCode, DiffSeverity, ProfileDiffItem, ProfileDiffReport } from '@/api/hrEmployment'

/** 类别码 → i18n key（文案随语言切换，后端只回类别码） */
const CODE_LABEL_KEY: Record<DiffCode, string> = {
  [DIFF_CODE.NO_POSITION_RECORD]: 'hrEmployment.diff.NO_POSITION_RECORD',
  [DIFF_CODE.START_ANCHOR_MISSING]: 'hrEmployment.diff.START_ANCHOR_MISSING',
  [DIFF_CODE.DEPT_MISMATCH]: 'hrEmployment.diff.DEPT_MISMATCH',
  [DIFF_CODE.POSITION_MISMATCH]: 'hrEmployment.diff.POSITION_MISMATCH',
  [DIFF_CODE.RESIGNED_ACCOUNT_ACTIVE]: 'hrEmployment.diff.RESIGNED_ACCOUNT_ACTIVE',
  [DIFF_CODE.ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED]: 'hrEmployment.diff.ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED',
  [DIFF_CODE.PERIOD_NOT_REGISTERED]: 'hrEmployment.diff.PERIOD_NOT_REGISTERED',
  [DIFF_CODE.PERIOD_COUNT_MISMATCH]: 'hrEmployment.diff.PERIOD_COUNT_MISMATCH',
  [DIFF_CODE.PERIOD_END_DATE_UNKNOWN]: 'hrEmployment.diff.PERIOD_END_DATE_UNKNOWN',
  [DIFF_CODE.FUTURE_ASSIGNMENT]: 'hrEmployment.diff.FUTURE_ASSIGNMENT',
}

const SEVERITY_COLOR: Record<DiffSeverity, string> = {
  INFO: 'default',
  WARN: 'warning',
  ERROR: 'error',
}

interface Props {
  open: boolean
  onClose: () => void
  /** 是否有权「按任职事实登记」（employee-management:edit） */
  canRegister: boolean
}

/**
 * 雇佣数据核对清单（方案 §7.1 的迁移前置门禁产物）。
 *
 * 为什么做成人能看懂的清单而不是后台跑一次迁移：双轨期间的原则是
 * 「不一致先暴露、由 HR 判定来源」，代码替 HR 选一个答案就是把假数据写进库。
 * 因此这里唯一的写动作是「按任职事实登记雇佣期间」，而且只允许对
 * 「派生得出但尚未登记」的行点名执行 —— 缺锚点、段数不符的行必须人工处理，不给按钮。
 */
export default function EmploymentDiffModal({ open, onClose, canRegister }: Props) {
  const { t } = useTranslation()
  const [report, setReport] = useState<ProfileDiffReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [registering, setRegistering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await fetchProfileDiffReport()
      setReport(data)
      // 重新取数后清空勾选：勾选的是「上一次的行」，数据变了就不能再照着旧行写库
      setSelectedIds([])
    } catch {
      setLoadError(true)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const handleRegister = () => {
    if (!selectedIds.length) {
      message.warning(t('hrEmployment.selectFirst'))
      return
    }
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('hrEmployment.registerConfirmTitle'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('hrEmployment.registerCountLabel')}：</span>
            <b>{selectedIds.length}</b>
          </div>
          <div className="confirm-info-row">{t('hrEmployment.registerConfirmTip')}</div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setRegistering(true)
        try {
          const result = await syncEmploymentPeriods(selectedIds)
          message.success(t('hrEmployment.registered', {
            users: result.updatedUsers,
            periods: result.periods,
            skipped: result.skippedUsers,
          }))
          await load()
        } catch {
          message.error(t('hrEmployment.registerFailed'))
        } finally {
          setRegistering(false)
        }
      },
    })
  }

  const columns: TableColumnsType<ProfileDiffItem> = [
    {
      title: t('hrEmployment.colEmployee'),
      key: 'employee',
      width: 150,
      fixed: 'left',
      render: (_: unknown, r) => (
        <div>
          <div>{r.name || '-'}</div>
          <Typography.Text type="secondary">{r.empId || '-'}</Typography.Text>
        </div>
      ),
    },
    {
      title: t('hrEmployment.colDiff'),
      key: 'codes',
      width: 260,
      render: (_: unknown, r) => (
        <Space size={4} wrap>
          <Tag color={SEVERITY_COLOR[r.severity]}>{t('hrEmployment.severity.' + r.severity)}</Tag>
          {r.codes.map(code => (
            <Tag key={code}>{CODE_LABEL_KEY[code] ? t(CODE_LABEL_KEY[code]) : code}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t('hrEmployment.colSnapshot'),
      key: 'snapshot',
      width: 200,
      render: (_: unknown, r) => (
        <div>
          <div>{r.snapshotDept || '-'}</div>
          <Typography.Text type="secondary">{r.snapshotPosition || '-'}</Typography.Text>
        </div>
      ),
    },
    {
      title: t('hrEmployment.colAssignment'),
      key: 'assignment',
      width: 220,
      render: (_: unknown, r) => (
        <div>
          <div>{r.asOfDept || '-'}</div>
          <Typography.Text type="secondary">{r.asOfPosition || '-'}</Typography.Text>
          {r.asOfCompany && <div><Typography.Text type="secondary">{r.asOfCompany}</Typography.Text></div>}
        </div>
      ),
    },
    {
      title: t('hrEmployment.colEmploymentStart'),
      key: 'start',
      width: 170,
      render: (_: unknown, r) => (
        <div>
          <div>{r.employmentStart || t('hrEmployment.startUnknown')}</div>
          <Typography.Text type="secondary">
            {t(`hrEmployment.source.${r.startDateSource ?? 'UNVERIFIED'}`)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t('hrEmployment.colPeriods'),
      key: 'periods',
      width: 130,
      render: (_: unknown, r) => `${r.registeredPeriods} / ${r.derivedPeriods}`,
    },
    {
      title: t('hrEmployment.colAccount'),
      key: 'account',
      width: 130,
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tag>{r.accountStatus === 1 ? t('hrEmployment.accountEnabled') : t('hrEmployment.accountDisabled')}</Tag>
          <Tag color={r.employmentStatus === 'resigned' ? 'red' : 'green'}>
            {r.employmentStatus === 'resigned' ? t('hrEmployment.resigned') : t('hrEmployment.active')}
          </Tag>
        </Space>
      ),
    },
  ]

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1100}
      title={
        <Space size={8}>
          <SafetyCertificateOutlined />
          <span>{t('hrEmployment.title')}</span>
          <HelpPopover
            title={t('hrEmployment.helpTitle')}
            ariaLabel={t('hrEmployment.helpAria')}
            placement="bottomRight"
            width={430}
            content={[
              { tone: 'info', label: t('hrEmployment.helpSrcLabel'), body: t('hrEmployment.helpSrcBody') },
              { tone: 'warn', label: t('hrEmployment.helpRuleLabel'), body: t('hrEmployment.helpRuleBody') },
              { tone: 'neutral', label: t('hrEmployment.helpActionLabel'), body: t('hrEmployment.helpActionBody') },
            ]}
          />
        </Space>
      }
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t('hrEmployment.refresh')}
        </Button>,
        <Button key="close" onClick={onClose}>
          {t('common.close')}
        </Button>,
        ...(canRegister
          ? [
            <Button
              key="register"
              type="primary"
              onClick={handleRegister}
              loading={registering}
              disabled={!selectedIds.length}
            >
              {t('hrEmployment.registerAction')}
            </Button>,
          ]
          : []),
      ]}
    >
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={t('hrEmployment.loadFailed')}
          action={<Button size="small" onClick={() => void load()}>{t('hrEmployment.retry')}</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      {!loadError && (
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Tag>{t('hrEmployment.scanned', { count: report?.scannedUsers ?? 0 })}</Tag>
          <Tag color={report?.diffUsers ? 'warning' : 'success'}>
            {t('hrEmployment.diffUsers', { count: report?.diffUsers ?? 0 })}
          </Tag>
          {report?.truncated && <Tag color="default">{t('hrEmployment.truncated')}</Tag>}
          {Object.entries(report?.countsByCategory ?? {}).map(([code, count]) => (
            <Tag key={code}>{CODE_LABEL_KEY[code as DiffCode] ? t(CODE_LABEL_KEY[code as DiffCode]) : code} {count}</Tag>
          ))}
        </Space>
      )}

      <Table
        size="small"
        rowKey="userId"
        loading={loading}
        columns={columns}
        dataSource={report?.items ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showSizeChanger: true, size: 'small' }}
        locale={{ emptyText: report && report.diffUsers === 0 ? t('hrEmployment.allConsistent') : undefined }}
        rowSelection={canRegister ? {
          selectedRowKeys: selectedIds,
          onChange: keys => setSelectedIds(keys as number[]),
          getCheckboxProps: record => ({
            // 与后端 registerableUsers 同一判据：只有「可派生但未登记」的行允许勾选。
            // 缺锚点/段数不符的行必须人工判定来源，让它们可点等于把一个批量按钮
            // 变成「顺手盖掉历史问题」的后门
            disabled: !record.codes.includes(DIFF_CODE.PERIOD_NOT_REGISTERED),
          }),
        } : undefined}
      />
    </Modal>
  )
}
