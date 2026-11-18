/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import {
  deleteCpmTemplate, fetchCpmTemplates, setCpmTemplateStatus,
  type CpmTemplateVO,
} from '@/api/cpm'
import './cpm.css'

/**
 * P6 模板管理（cpm-template，治理侧）。
 *
 * 模板只配「分类词表 + 提示语 + 工时开关」，不配字段结构（方案 §九：
 * 自定义字段引擎过度设计、违背低录入成本，刻意不做）。内置 5 套不可删除、可停用——
 * 后端同样硬拒删除内置模板，前端的 warning 只是少跑一次网络。
 */

export default function TemplateList() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [filters, setFilters] = useState<{ keyword?: string; enabled?: string }>({})
  const [data, setData] = useState<CpmTemplateVO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchCpmTemplates())
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const keyword = (filters.keyword ?? '').trim()
  const rows = data.filter(t =>
    (!keyword || t.name.includes(keyword) || t.roleHint.includes(keyword))
    && (!filters.enabled || (filters.enabled === 'on') === t.enabled),
  )

  const handleToggle = (t: CpmTemplateVO, checked: boolean) => {
    Modal.confirm({
      title: `確定要${checked ? '啟用' : '停用'}模板「${t.name}」嗎？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>影響範圍：</span><b>選用該模板的員工下一次記錄即生效</b></div>
          {t.builtin && <div className="confirm-info-row"><span>內置模板：</span><b>停用後不再出現在推薦，存量記錄分類不受影響</b></div>}
        </div>
      ),
      okText: '確認',
      cancelText: '取消',
      onOk: async () => { await setCpmTemplateStatus(t.id, checked); await reload() },
    })
  }

  const handleDelete = (t: CpmTemplateVO) => {
    if (t.builtin) {
      message.warning('內置模板不可刪除，可停用')
      return
    }
    Modal.confirm({
      title: '確定刪除該模板？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>模板：</span><b>{t.name}</b></div>
          <div className="confirm-info-row"><span>後果：</span><b>使用該模板的員工將回退到「通用」詞表；歷史條目分類標籤保留原值</b></div>
        </div>
      ),
      okText: '確認刪除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => { await deleteCpmTemplate(t.id); await reload() },
    })
  }

  const rawColumns = [
    { key: 'name', title: '模板名稱', render: (_: unknown, t: CpmTemplateVO) => (
      <Space direction="vertical" size={0}>
        <span style={{ fontWeight: 500 }}>{t.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.templateKey} · {t.roleHint}</span>
      </Space>
    ) },
    { key: 'categories', title: '分類詞表', render: (_: unknown, t: CpmTemplateVO) => (
      <Space size={4} wrap>
        {t.categories.map(c => <Tag key={c.key} style={{ marginInlineEnd: 0 }}>{c.label}</Tag>)}
      </Space>
    ) },
    { key: 'workHours', title: '工時輸入', render: (_: unknown, t: CpmTemplateVO) => (
      t.workHoursEnabled ? <Tag color="blue">開啟</Tag> : <Tag>關閉</Tag>
    ) },
    { key: 'builtin', title: '類型', render: (_: unknown, t: CpmTemplateVO) => (
      t.builtin ? <Tag color="purple">內置</Tag> : <Tag>自定義</Tag>
    ) },
    { key: 'enabled', title: '狀態', render: (_: unknown, t: CpmTemplateVO) => (
      <Switch
        checked={t.enabled}
        checkedChildren="啟用"
        unCheckedChildren="停用"
        onChange={checked => handleToggle(t, checked)}
      />
    ) },
    { key: 'action', title: '操作', render: (_: unknown, t: CpmTemplateVO) => (
      <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => navigate(`/cpm-template-form?id=${t.id}`)}>詳情</Button>
        <Button type="link" size="small" onClick={() => navigate(`/cpm-template-form?id=${t.id}&mode=edit`)}>編輯</Button>
        <Button type="link" size="small" danger onClick={() => handleDelete(t)}>刪除</Button>
      </Space>
    ) },
  ]

  const { applyConfig, configComponent } = useColumnConfig(
    'cpm-template',
    rawColumns.map(c => ({ key: c.key as string, title: c.title as string })),
    [
      { key: 'name', visible: true, locked: 'head' as const },
      { key: 'action', visible: true, locked: 'tail' as const },
    ],
  )

  return (
    <div className="content-area">
      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }} message="模板載入失敗" description={loadError}
          action={<Button size="small" onClick={() => void reload()}>重試</Button>} />
      )}
      {/* 1. 搜索区 */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <Form.Item name="keyword" label="關鍵詞">
            <Input placeholder="模板名稱 / 崗位提示" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="狀態">
            <Select allowClear placeholder="全部" style={{ width: '100%' }} options={[{ value: 'on', label: '啟用' }, { value: 'off', label: '停用' }]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => setFilters(form.getFieldsValue())}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setFilters({}) }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 2. 操作区（无统计卡：模板配置页的“数量”不属于业务口径） */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/cpm-template-form')}>新增模板</Button>
          {configComponent}
        </div>
      </div>

      {/* 3. 表格 */}
      <Table
        rowKey="id"
        columns={applyConfig(rawColumns)}
        dataSource={rows}
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => `共 ${total} 筆`,
        }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  )
}
