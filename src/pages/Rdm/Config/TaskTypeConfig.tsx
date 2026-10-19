/**
 * 任務類型配置 —— 任务类型字典维护（业务可配置）
 *
 * 对应后端 rdm_task_type_config：任务类型下拉选项 / 图例色 / 聚合桶 / 写校验四件事同源。
 * 不同公司研发细分不同（如 APP 拆 Android/iOS），在此新增类型即可，无需改代码。
 * <p>code 为身份键：创建后不可修改、不可删除，仅可停用（保护存量任务历史引用）；
 * 停用只影响下拉与图例展示，存量任务照常解析。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Select, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import HelpPopover from '../../../components/HelpPopover'
import { invalidateTaskTypeDict } from '../../../hooks/useTaskTypeDict'
import {
  createTaskType,
  fetchTaskTypeAll,
  updateTaskType,
  updateTaskTypeStatus,
  RDM_TASK_TYPE_CATEGORY,
  type RdmTaskTypeOption,
} from '../../../api/rdmTaskType'
import '../index.css'

/** 聚合桶选项（与后端 RdmTaskTypeConfig.CATEGORIES 同源） */
const CATEGORY_OPTIONS = [
  { value: RDM_TASK_TYPE_CATEGORY.DESIGN, label: 'design' },
  { value: RDM_TASK_TYPE_CATEGORY.QA, label: 'qa' },
  { value: RDM_TASK_TYPE_CATEGORY.DEV, label: 'dev' },
] as const

interface TaskTypeFormValues {
  code?: string
  label?: string
  color?: string
  category?: string
  sortOrder?: number
  remark?: string
}

export default function TaskTypeConfig() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-task-type-config:edit')

  const [all, setAll] = useState<RdmTaskTypeOption[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState<string>()
  const [statusFilter, setStatusFilter] = useState<number>()
  const [searchForm] = Form.useForm<{ keyword?: string; status?: number }>()
  const [form] = Form.useForm<TaskTypeFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RdmTaskTypeOption | null>(null)
  const [saving, setSaving] = useState(false)
  const [modal, contextHolder] = Modal.useModal()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAll(await fetchTaskTypeAll())
    } catch {
      message.error(t('rdm.taskTypeConfig.loadFail'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const tableData = useMemo(() => {
    let list = all
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(d => d.code.toLowerCase().includes(kw) || d.label.toLowerCase().includes(kw))
    }
    if (statusFilter != null) list = list.filter(d => d.enabled === statusFilter)
    return list
  }, [all, keyword, statusFilter])

  const handleSearch = () => {
    const v = searchForm.getFieldsValue()
    setKeyword(v.keyword?.trim() || undefined)
    setStatusFilter(v.status)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setStatusFilter(undefined)
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ category: RDM_TASK_TYPE_CATEGORY.DEV, sortOrder: (all.length ? Math.max(...all.map(i => i.sortOrder ?? 0)) : 0) + 1, color: '#1890FF' })
    setModalOpen(true)
  }

  const openEdit = (record: RdmTaskTypeOption) => {
    setEditing(record)
    form.resetFields()
    form.setFieldsValue({ label: record.label, color: record.color, category: record.category, sortOrder: record.sortOrder ?? 0, remark: record.remark ?? undefined })
    setModalOpen(true)
  }

  /** 保存：新增走 create，编辑走 update（code 身份键不传）；成功后失效字典缓存并刷新 */
  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        await updateTaskType(editing.id, values)
        message.success(t('common.updateSuccess'))
      } else {
        await createTaskType(values)
        message.success(t('common.createSuccess'))
      }
      invalidateTaskTypeDict()
      setModalOpen(false)
      await load()
    } catch {
      // 失败原因由请求层统一提示（如「任務類型編碼已存在」），此处不双弹
    } finally {
      setSaving(false)
    }
  }

  /** §B.8 强制：状态 Switch 切换必须先二次确认，确认后才调接口 */
  const handleToggleStatus = (record: RdmTaskTypeOption, checked: boolean) => {
    modal.confirm({
      title: t(checked ? 'rdm.taskTypeConfig.enableConfirm' : 'rdm.taskTypeConfig.disableConfirm', { name: record.label }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateTaskTypeStatus(record.id, checked ? 1 : 0)
        message.success(t(checked ? 'common.enableSuccess' : 'common.disableSuccess'))
        invalidateTaskTypeDict()
        await load()
      },
    })
  }

  const categoryLabel = (v?: string | null) => {
    switch (v) {
      case RDM_TASK_TYPE_CATEGORY.DESIGN: return t('rdm.taskTypeConfig.categoryDesign')
      case RDM_TASK_TYPE_CATEGORY.QA: return t('rdm.taskTypeConfig.categoryQa')
      case RDM_TASK_TYPE_CATEGORY.DEV: return t('rdm.taskTypeConfig.categoryDev')
      default: return v ?? '-'
    }
  }

  const categoryTag = (v?: string | null) => {
    const color = v === RDM_TASK_TYPE_CATEGORY.DESIGN ? 'magenta' : v === RDM_TASK_TYPE_CATEGORY.QA ? 'cyan' : 'geekblue'
    return <Tag color={color} style={{ margin: 0 }}>{categoryLabel(v)}</Tag>
  }

  const columns: TableColumnsType<RdmTaskTypeOption> = [
    { title: t('rdm.taskTypeConfig.colSort'), dataIndex: 'sortOrder', key: 'sortOrder', width: 70, align: 'center', render: (v?: number) => v ?? '-' },
    { title: t('rdm.taskTypeConfig.colCode'), dataIndex: 'code', key: 'code', width: 150, render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: t('rdm.taskTypeConfig.colLabel'), dataIndex: 'label', key: 'label', width: 160 },
    {
      title: t('rdm.taskTypeConfig.colColor'), dataIndex: 'color', key: 'color', width: 110,
      render: (v: string) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: v, border: '1px solid rgba(0,0,0,0.08)' }} />
          {v}
        </span>
      ),
    },
    { title: t('rdm.taskTypeConfig.colCategory'), dataIndex: 'category', key: 'category', width: 110, render: (v: string) => categoryTag(v) },
    {
      title: t('common.colStatus'), dataIndex: 'enabled', key: 'enabled', width: 100,
      render: (v: number, record) => (
        canEdit
          ? <Switch checked={v === 1} onChange={(checked) => handleToggleStatus(record, checked)} />
          : <Tag color={v === 1 ? 'success' : 'default'}>{t(v === 1 ? 'rdm.taskTypeConfig.enabled' : 'rdm.taskTypeConfig.disabled')}</Tag>
      ),
    },
    { title: t('common.colUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 130, render: (v?: string | null) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 90,
      render: (_, record) => (
        canEdit ? (
          <Button type="link" size="small" onClick={() => openEdit(record)}>{t('common.edit')}</Button>
        ) : <span style={{ color: '#8C8C8C' }}>{t('rdm.taskTypeConfig.readOnly')}</span>
      ),
    },
  ]

  const { configComponent, applyConfig } = useColumnConfig('rdm-task-type-config', columns.map(col => ({ key: String(col.key), title: String(col.title) })), [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {contextHolder}

      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('common.keyword')} name="keyword">
            <Input placeholder={t('rdm.taskTypeConfig.searchPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={[{ value: 1, label: t('rdm.taskTypeConfig.enabled') }, { value: 0, label: t('rdm.taskTypeConfig.disabled') }]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('rdm.taskTypeConfig.add')}</Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={false}
      />

      {/* 新增/编辑弹窗（字典行级配置用 Modal 表单，遵循「新增/编辑独立页」之外的既有配置页交互） */}
      <Modal
        title={editing ? t('rdm.taskTypeConfig.editTitle') : t('rdm.taskTypeConfig.addTitle')}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label={t('rdm.taskTypeConfig.formCode')}
            name="code"
            rules={[{ required: true, message: t('rdm.taskTypeConfig.formCodePlaceholder') }, { pattern: /^[a-z0-9_]{1,32}$/, message: t('rdm.taskTypeConfig.formCodePlaceholder') }]}
            extra={editing ? t('rdm.taskTypeConfig.formCodeHint') : undefined}
          >
            <Input placeholder={t('rdm.taskTypeConfig.formCodePlaceholder')} disabled={!!editing} maxLength={32} />
          </Form.Item>
          <Form.Item label={t('rdm.taskTypeConfig.formLabel')} name="label" rules={[{ required: true, message: t('rdm.taskTypeConfig.formLabel') }]}>
            <Input placeholder={t('rdm.taskTypeConfig.formLabelPlaceholder')} maxLength={64} />
          </Form.Item>
          <Form.Item label={t('rdm.taskTypeConfig.formColor')} name="color" rules={[{ required: true, message: '#RRGGBB' }, { pattern: /^#[0-9A-Fa-f]{6}$/, message: '#RRGGBB' }]}>
            <Input placeholder="#RRGGBB" maxLength={7} />
          </Form.Item>
          <Form.Item
            label={(
              <span>
                {t('rdm.taskTypeConfig.formCategory')}
                <HelpPopover
                  title={t('rdm.taskTypeConfig.categoryHelpTitle')}
                  ariaLabel={t('rdm.taskTypeConfig.categoryHelpTitle')}
                  content={[
                    { tone: 'info', body: t('rdm.taskTypeConfig.categoryHelpDesign') },
                    { tone: 'info', body: t('rdm.taskTypeConfig.categoryHelpQa') },
                    { tone: 'success', body: t('rdm.taskTypeConfig.categoryHelpDev') },
                  ]}
                />
              </span>
            )}
            name="category"
            rules={[{ required: true, message: t('rdm.taskTypeConfig.formCategory') }]}
            extra={t('rdm.taskTypeConfig.formCategoryHint')}
          >
            <Select options={CATEGORY_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
          </Form.Item>
          <Form.Item label={t('rdm.taskTypeConfig.formSort')} name="sortOrder" extra={t('rdm.taskTypeConfig.formSortHint')} rules={[{ required: true, message: t('rdm.taskTypeConfig.formSort') }]}>
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
