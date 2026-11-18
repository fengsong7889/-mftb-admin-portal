/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, Progress, Segmented, Select, Slider, Space, message } from 'antd'
import { LinkOutlined, SaveOutlined, SettingOutlined, EditOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  createCpmItem, fetchCpmItem, fetchCpmTemplates, updateCpmItem,
  type CpmItemVO, type CpmTemplateVO,
} from '@/api/cpm'
import CpmFormHeader from './CpmFormHeader'
import { CPM_STATUS_LABELS, CpmStatus, type CpmStatusValue } from './meta'

/**
 * 条目新增/编辑独立页（§9.1）。
 * 行内快捷操作覆盖 90% 场景，本页承载详情描述/来源关联/工时等完整字段。
 *
 * 来源关联一期口径：手填对象号 + 标题快照，重复导入由后端
 * UNIQUE(user_id, source_type, source_ref) 硬拒；RDM/会议的挑选器（复用各自查询接口）
 * 属体验增强，登记在剩余项清单。
 */

interface FormValues {
  title: string
  detail?: string
  category: string
  status: CpmStatusValue
  progress: number
  workDate: Dayjs
  workHours?: number
  sourceType: string
  sourceRef?: string
  sourceLabel?: string
}

export default function WorklogItemForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editingId = params.get('id') ? Number(params.get('id')) : null

  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<CpmTemplateVO[]>([])
  const [item, setItem] = useState<CpmItemVO | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const status = Form.useWatch('status', form)
  const sourceType = Form.useWatch('sourceType', form)
  const progress = Form.useWatch('progress', form)

  const activeTemplate = templates.find(t => t.templateKey === (item?.templateKey ?? 'general')) ?? templates[0]
  const categories = activeTemplate?.categories ?? []
  const showWorkHours = activeTemplate?.workHoursEnabled ?? false

  useEffect(() => {
    let alive = true
    fetchCpmTemplates().then(list => { if (alive) setTemplates(list.filter(t => t.enabled)) }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!editingId) {
      form.setFieldsValue({
        status: CpmStatus.DOING, progress: 0, workDate: dayjs(), sourceType: 'manual', category: categories[0]?.key,
      })
      return
    }
    let alive = true
    fetchCpmItem(editingId)
      .then(found => {
        if (!alive) return
        setItem(found)
        form.setFieldsValue({
          title: found.title, detail: found.detail ?? undefined, category: found.category, status: found.status,
          progress: found.progress, workDate: dayjs(found.workDate), workHours: found.workHours ?? undefined,
          sourceType: found.sourceType, sourceRef: found.sourceRef ?? undefined, sourceLabel: found.sourceLabel ?? undefined,
        })
      })
      .catch(err => alive && setLoadError(err instanceof Error ? err.message : '載入失敗'))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, categories.length])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        title: values.title.trim(),
        detail: values.detail?.trim() || undefined,
        category: values.category,
        status: values.status,
        progress: values.status === CpmStatus.DONE ? 100 : values.progress,
        workDate: values.workDate.format('YYYY-MM-DD'),
        workHours: values.workHours,
        templateKey: activeTemplate?.templateKey,
        sourceType: values.sourceType === 'manual' ? undefined : values.sourceType,
        sourceRef: values.sourceType === 'manual' ? undefined : values.sourceRef?.trim() || undefined,
        sourceLabel: values.sourceType === 'manual' ? undefined : values.sourceLabel?.trim() || undefined,
        version: item?.version,
      }
      if (editingId && item) {
        await updateCpmItem(item.id, payload)
        message.success('已更新')
      } else {
        await createCpmItem(payload)
        message.success('已記錄')
      }
      navigate('/cpm-my')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <CpmFormHeader title={editingId ? '編輯工作記錄' : '新增工作記錄'} />

      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }} message="條目載入失敗" description={loadError} />
      )}

      <Form form={form} layout="vertical" disabled={!!editingId && !item}>
        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--info"><EditOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">基本信息</span>
            <div className="cpm-card__line" />
          </div>
          <Form.Item name="title" label="事项标题" rules={[{ required: true, message: '請填寫標題' }]}>
            <Input placeholder="一句话说清楚做了什么，如：完成XX接口联调" maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="detail" label="事项说明">
            <Input.TextArea rows={4} maxLength={2000} showCount placeholder="补充背景、结论、链接等（选填）" style={{ resize: 'none' }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="category" label="分類" rules={[{ required: true, message: '請選擇分類' }]}>
              <Select options={categories.map(c => ({ value: c.key, label: c.label }))} placeholder="選擇分類" />
            </Form.Item>
            <Form.Item name="workDate" label="歸屬日期" rules={[{ required: true, message: '請選擇日期' }]} extra="默認今天">
              <DatePicker style={{ width: '100%' }} allowClear={false} />
            </Form.Item>
            {showWorkHours ? (
              <Form.Item name="workHours" label="工時（小時）" extra="僅分布統計，不作為績效依據">
                <Select
                  placeholder="選填"
                  allowClear
                  options={[0.5, 1, 2, 4, 8].map(h => ({ value: h, label: `${h}h` }))}
                />
              </Form.Item>
            ) : (
              <Form.Item name="workHours" hidden><Input /></Form.Item>
            )}
          </div>
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--warn"><SettingOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">狀態與進度</span>
            <div className="cpm-card__line" />
            <span className="cpm-card__extra">狀態改「已完成」時進度自動 100%</span>
          </div>
          <Form.Item name="status" label="狀態" rules={[{ required: true }]}>
            <Segmented
              options={Object.values(CpmStatus).map(s => ({ label: CPM_STATUS_LABELS[s], value: s }))}
              onChange={v => { if (v === CpmStatus.DONE) form.setFieldValue('progress', 100) }}
            />
          </Form.Item>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>進度:</span>
            <div style={{ flex: 1, maxWidth: 360 }}>
              <Form.Item name="progress" noStyle>
                <Slider disabled={status === CpmStatus.DONE} marks={{ 0: '0', 50: '50', 100: '100' }} />
              </Form.Item>
            </div>
            <Progress type="circle" size={44} percent={progress ?? 0} />
          </div>
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--purple"><LinkOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">關聯業務對象（選填）</span>
            <div className="cpm-card__line" />
            <span className="cpm-card__extra">按「人+來源+對象號」去重，重複導入會被後端拒絕</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="sourceType" label="來源">
              <Select
                options={[
                  { value: 'manual', label: '不關聯（手動記錄）' },
                  { value: 'rdm_requirement', label: 'RDM 需求' },
                  { value: 'meeting_action', label: '會議行動項' },
                ]}
                onChange={() => form.setFieldsValue({ sourceRef: undefined, sourceLabel: undefined })}
              />
            </Form.Item>
            {sourceType && sourceType !== 'manual' ? (
              <>
                <Form.Item name="sourceRef" label="對象號" rules={[{ required: true, message: '請填寫需求單號/行動項 ID' }]}>
                  <Input placeholder="如 REQ-2026-1118 或 ACT-3301" maxLength={64} />
                </Form.Item>
                <Form.Item name="sourceLabel" label="對象標題快照">
                  <Input placeholder="導入時的名字（後續對象改名不影響此處展示）" maxLength={200} />
                </Form.Item>
              </>
            ) : (
              <Form.Item name="sourceRef" hidden><Input /></Form.Item>
            )}
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Space>
          <Button onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()} disabled={!!editingId && !item}>保存</Button>
        </Space>
      </div>
    </div>
  )
}
