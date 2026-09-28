import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  CYCLE_STATUS, CYCLE_TYPE, type PerfCycle, changePerfCycleStatus, createPerfCycle, fetchPerfCycles, updatePerfCycle,
} from '../../api/hrPerformance'
import {
  CYCLE_STATUS_LABEL_KEY, CYCLE_STATUS_TABS, CYCLE_STATUS_TAG_COLOR, CYCLE_TYPE_LABEL_KEY, CYCLE_TYPE_ORDER,
  PERF_MENU, PERF_PLAN_PATH, PERF_TEMPLATE_PATH,
} from './meta'

/** 周期表单值：日期用 Dayjs 承载，提交前转成 ISO 日期串 */
interface CycleFormValues {
  code: string
  name: string
  cycleType: string
  period: [Dayjs, Dayjs]
  remark?: string
}

/**
 * 考核周期管理（週期與計劃菜单的入口页）。
 * <p>
 * 只有已发布周期能发起计划；关闭前必须没有未结束计划，这两条由服务端把关，
 * 前端只按状态收敛可点按钮，避免误以为「点了没反应」。
 */
export default function PerfCycleList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission(`${PERF_MENU.ADMIN}:create`)
  const canEdit = hasPermission(`${PERF_MENU.ADMIN}:edit`)

  const [rows, setRows] = useState<PerfCycle[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [status, setStatus] = useState('all')
  const [keyword, setKeyword] = useState<string>()
  const [form] = Form.useForm<{ keyword?: string }>()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PerfCycle | null>(null)
  const [saving, setSaving] = useState(false)
  const [cycleForm] = Form.useForm<CycleFormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPerfCycles({
        page, size, keyword: keyword || undefined,
        status: status === 'all' ? undefined : status,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, status, keyword])

  useEffect(() => { load() }, [load])

  const typeLabel = (code: string) => (CYCLE_TYPE_LABEL_KEY[code] ? t(CYCLE_TYPE_LABEL_KEY[code]) : code)
  const statusLabel = (code?: string) => (code && CYCLE_STATUS_LABEL_KEY[code]
    ? t(CYCLE_STATUS_LABEL_KEY[code]) : (code || '-'))

  const openCreate = () => {
    setEditing(null)
    cycleForm.resetFields()
    cycleForm.setFieldsValue({ cycleType: CYCLE_TYPE.QUARTER })
    setModalOpen(true)
  }

  const openEdit = (row: PerfCycle) => {
    setEditing(row)
    cycleForm.setFieldsValue({
      code: row.code,
      name: row.name,
      cycleType: row.cycleType,
      period: [dayjs(row.periodStart), dayjs(row.periodEnd)],
      remark: row.remark || undefined,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await cycleForm.validateFields()
    const payload: PerfCycle = {
      code: values.code.trim(),
      name: values.name.trim(),
      cycleType: values.cycleType,
      periodStart: values.period[0].format('YYYY-MM-DD'),
      periodEnd: values.period[1].format('YYYY-MM-DD'),
      remark: values.remark?.trim(),
    }
    setSaving(true)
    try {
      if (editing?.id) {
        await updatePerfCycle(editing.id, payload)
      } else {
        await createPerfCycle(payload)
      }
      message.success(t('common.saveSuccess'))
      setModalOpen(false)
      load()
    } catch {
      // 请求层已提示（编码重复/周期类型锁定等后端校验都在此路径）
    } finally {
      setSaving(false)
    }
  }

  const handleChangeStatus = (row: PerfCycle, next: string) => {
    const label = CYCLE_STATUS_LABEL_KEY[next] ? t(CYCLE_STATUS_LABEL_KEY[next]) : next
    Modal.confirm({
      title: t('hrPerf.changeCycleStatusConfirm', { name: row.name, status: label }),
      content: next === CYCLE_STATUS.CLOSED ? t('hrPerf.closeCycleTip') : undefined,
      onOk: async () => {
        await changePerfCycleStatus(row.id as number, next)
        message.success(t('hrPerf.cycleStatusUpdated'))
        load()
      },
    })
  }

  const columns = useMemo<TableColumnsType<PerfCycle>>(() => [
    { title: t('hrPerf.cycleReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    { title: t('hrPerf.cycleCode'), dataIndex: 'code', key: 'code', width: 120 },
    { title: t('hrPerf.cycleName'), dataIndex: 'name', key: 'name', width: 200 },
    {
      title: t('hrPerf.cycleType'), dataIndex: 'cycleType', key: 'cycleType', width: 100,
      render: (v: string) => <Tag color="cyan">{typeLabel(v)}</Tag>,
    },
    {
      title: t('hrPerf.period'), key: 'period', width: 210,
      render: (_, r) => `${r.periodStart} ~ ${r.periodEnd}`,
    },
    {
      title: t('hrPerf.planCount'), dataIndex: 'planCount', key: 'planCount', width: 110,
      render: (v: number, r) => (v
        ? <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`${PERF_PLAN_PATH}?cycleId=${r.id}`)}>{v}</Button>
        : <span style={{ color: '#8C8C8C' }}>0</span>),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={CYCLE_STATUS_TAG_COLOR[v]}>{statusLabel(v)}</Tag>,
    },
    { title: t('common.colRemark'), dataIndex: 'remark', key: 'remark', width: 180, render: (v: string) => v || '-' },
    { title: t('common.colUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 110, render: (v: string) => v || '-' },
    {
      title: t('common.colUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 230, fixed: 'right',
      render: (_, r) => {
        const draft = r.status === CYCLE_STATUS.DRAFT
        const published = r.status === CYCLE_STATUS.PUBLISHED
        return (
          <Space size={0}>
            {canEdit && (draft || published) && (<>
              <Button type="link" size="small" onClick={() => openEdit(r)}>{t('common.edit')}</Button>
              <span className="action-split">|</span>
            </>)}
            {canEdit && draft && (<>
              <Button type="link" size="small" onClick={() => handleChangeStatus(r, CYCLE_STATUS.PUBLISHED)}>
                {t('hrPerf.publish')}
              </Button>
              <span className="action-split">|</span>
            </>)}
            {canEdit && published && (<>
              <Button type="link" size="small" onClick={() => handleChangeStatus(r, CYCLE_STATUS.DRAFT)}>
                {t('hrPerf.withdraw')}
              </Button>
              <span className="action-split">|</span>
            </>)}
            {canEdit && published && (<>
              <Button type="link" size="small" onClick={() => handleChangeStatus(r, CYCLE_STATUS.CLOSED)}>
                {t('hrPerf.close')}
              </Button>
              <span className="action-split">|</span>
            </>)}
            <Button type="link" size="small" onClick={() => navigate(`${PERF_PLAN_PATH}?cycleId=${r.id}`)}>
              {t('hrPerf.viewPlans')}
            </Button>
          </Space>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, rows, canEdit, navigate])

  const { configComponent, applyConfig } = useColumnConfig('hr-perf-cycle',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('common.search')} name="keyword">
            <Input placeholder={t('hrPerf.cycleKeywordPlaceholder')} allowClear style={{ width: 220 }}
              onPressEnter={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}
                onClick={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />}
                onClick={() => { form.resetFields(); setKeyword(undefined); setPage(1) }}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Tabs
        activeKey={status}
        items={CYCLE_STATUS_TABS.map(key => ({
          key, label: key === 'all' ? t('common.all') : (CYCLE_STATUS_LABEL_KEY[key] ? t(CYCLE_STATUS_LABEL_KEY[key]) : key),
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <div className="action-section">
        <div className="action-section-left">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('hrPerf.newCycle')}</Button>
          )}
          <Button onClick={() => navigate(PERF_PLAN_PATH)}>{t('hrPerf.planLedger')}</Button>
          <Button onClick={() => navigate(PERF_TEMPLATE_PATH)}>{t('hrPerf.templateLedger')}</Button>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      <Table<PerfCycle>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (c) => t('common.total', { count: c }),
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />

      <Modal
        title={editing ? t('hrPerf.editCycle') : t('hrPerf.newCycle')}
        open={modalOpen}
        confirmLoading={saving}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={cycleForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label={t('hrPerf.cycleCode')} name="code"
            rules={[{ required: true, message: t('hrPerf.cycleCodeRequired') }]}
            extra={t('hrPerf.cycleCodeTip')}>
            <Input maxLength={32} placeholder="2026Q3" disabled={!!editing && editing.status !== CYCLE_STATUS.DRAFT} />
          </Form.Item>
          <Form.Item label={t('hrPerf.cycleName')} name="name"
            rules={[{ required: true, message: t('hrPerf.cycleNameRequired') }]}>
            <Input maxLength={64} placeholder={t('hrPerf.cycleNamePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('hrPerf.cycleType')} name="cycleType"
            rules={[{ required: true, message: t('hrPerf.cycleTypeRequired') }]}
            extra={editing && editing.status !== CYCLE_STATUS.DRAFT ? t('hrPerf.cycleTypeLockedTip') : undefined}>
            <Select placeholder={t('common.pleaseSelect')}
              options={CYCLE_TYPE_ORDER.map(code => ({ value: code, label: typeLabel(code) }))} />
          </Form.Item>
          <Form.Item label={t('hrPerf.period')} name="period"
            rules={[{ required: true, message: t('hrPerf.periodRequired') }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('common.colRemark')} name="remark">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
