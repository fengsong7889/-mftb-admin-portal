/**
 * 任務類型配置 —— 任务类型字典维护（业务可配置）
 *
 * 对应后端 rdm_task_type_config：任务类型下拉选项 / 图例色 / 聚合桶 / 写校验四件事同源。
 * 不同公司研发细分不同（如 APP 拆 Android/iOS），在此新增类型即可，无需改代码。
 * <p>code 为身份键：创建后不可修改、不可删除，仅可停用（保护存量任务历史引用）；
 * 停用只影响下拉与图例展示，存量任务照常解析。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Select, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { invalidateTaskTypeDict } from '@/hooks/useTaskTypeDict'
import {
  fetchTaskTypeAll,
  updateTaskTypeStatus,
  RDM_TASK_TYPE_CATEGORY,
  type RdmTaskTypeOption,
} from '@/api/rdmTaskType'
import '../index.css'

/** 聚合桶标签（与后端 RdmTaskTypeConfig.CATEGORIES 同源；新增/编辑表单已移入独立页） */

export default function TaskTypeConfig() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-task-type-config:edit')

  const [all, setAll] = useState<RdmTaskTypeOption[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState<string>()
  const [statusFilter, setStatusFilter] = useState<number>()
  const [searchForm] = Form.useForm<{ keyword?: string; status?: number }>()
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

  /** 新增/編輯已改為獨立頁：列表只負責搜索、狀態切換與入口 */

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
          <Button type="link" size="small" onClick={() => navigate(`/rdm-task-type-config-form?id=${record.id}`)}>{t('common.edit')}</Button>
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-task-type-config-form')}>{t('rdm.taskTypeConfig.add')}</Button>
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
    </div>
  )
}
