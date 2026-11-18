/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, Modal, Space, Switch, message } from 'antd'
import { AppstoreOutlined, DeleteOutlined, PlusOutlined, ProfileOutlined, SaveOutlined, TagsOutlined } from '@ant-design/icons'
import RemarkTextArea from '@/components/RemarkTextArea'
import {
  createCpmTemplate, fetchCpmTemplates, updateCpmTemplate,
  type CpmCategoryDef, type CpmTemplateVO,
} from '@/api/cpm'
import CpmFormHeader from './CpmFormHeader'
import './cpm.css'

/**
 * 模板新增/编辑独立页（§9.1）。
 * 详情模式 = 有 id 且非 mode=edit 时只读；分类词表用行编辑器（键/显示名/提示语）。
 *
 * 词表校验口径与后端 CpmTemplateService.validateCategories 一致（key slug、去重、必填显示名）——
 * 前端先拦是 UX，后端拦才是边界；两边规则不同的时候以「后端会拒」为设计基线。
 */

interface FormValues {
  name: string
  templateKey: string
  roleHint: string
  workHoursEnabled: boolean
  remark?: string
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/

export default function TemplateForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editingId = params.get('id') ? Number(params.get('id')) : null
  const isDetail = !!editingId && params.get('mode') !== 'edit'

  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<CpmTemplateVO | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [categories, setCategories] = useState<CpmCategoryDef[]>([{ key: '', label: '', hint: '' }])

  useEffect(() => {
    if (!editingId) {
      form.setFieldsValue({ workHoursEnabled: false })
      return
    }
    let alive = true
    fetchCpmTemplates()
      .then(list => {
        if (!alive) return
        const found = list.find(t => t.id === editingId)
        if (!found) {
          setNotFound(true)
          return
        }
        setExisting(found)
        setCategories(found.categories.length > 0 ? found.categories.map(c => ({ ...c })) : [{ key: '', label: '', hint: '' }])
        form.setFieldsValue({
          name: found.name,
          templateKey: found.templateKey,
          roleHint: found.roleHint,
          workHoursEnabled: found.workHoursEnabled,
          remark: found.remark ?? undefined,
        })
      })
      .catch(() => alive && setNotFound(true))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  if (notFound) {
    return (
      <div className="content-area">
        <CpmFormHeader title="模板不存在" />
      </div>
    )
  }

  const patchCategory = (index: number, patch: Partial<CpmCategoryDef>) => {
    setCategories(list => list.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const cleaned = categories
      .map(c => ({ key: (c.key ?? '').trim(), label: (c.label ?? '').trim(), hint: c.hint?.trim() || undefined }))
      .filter(c => c.key || c.label)
    if (cleaned.length === 0 || cleaned.some(c => !c.key || !c.label)) {
      message.warning('每組分類需要同時填寫鍵與顯示名')
      return
    }
    if (cleaned.some(c => !KEY_PATTERN.test(c.key))) {
      message.warning('分類鍵需小寫字母開頭、2-32 位字母/數字/下劃線')
      return
    }
    if (new Set(cleaned.map(c => c.key)).size !== cleaned.length) {
      message.warning('分類鍵不可重複')
      return
    }
    Modal.confirm({
      title: `確認${existing ? '保存模板修改' : '新增模板'}？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>名稱：</span><b>{values.name}</b></div>
          <div className="confirm-info-row"><span>分類數：</span><b>{cleaned.length} 組</b></div>
          <div className="confirm-info-row"><span>生效範圍：</span><b>選用該模板的員工記錄頁與 AI 歸類白名單</b></div>
        </div>
      ),
      okText: '確認保存',
      cancelText: '取消',
      onOk: async () => {
        setSaving(true)
        try {
          const payload = {
            templateKey: values.templateKey.trim(),
            name: values.name.trim(),
            roleHint: values.roleHint?.trim() ?? '',
            categories: cleaned,
            workHoursEnabled: !!values.workHoursEnabled,
            remark: values.remark,
          }
          if (existing) {
            await updateCpmTemplate(existing.id, payload)
          } else {
            await createCpmTemplate(payload)
          }
          message.success('已保存')
          navigate('/cpm-template')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <div className="content-area">
      <CpmFormHeader title={isDetail ? '模板詳情' : existing ? '編輯模板' : '新增模板'} />

      <Form form={form} layout="vertical" disabled={isDetail}>
        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--info"><AppstoreOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">基本信息</span>
            <div className="cpm-card__line" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="name" label="模板名稱" rules={[{ required: true, message: '請填寫名稱' }]}>
              <Input placeholder="如：產品經理" maxLength={32} />
            </Form.Item>
            <Form.Item
              name="templateKey"
              label="模板鍵"
              rules={[
                { required: true, message: '請填寫模板鍵' },
                { pattern: KEY_PATTERN, message: '小写字母开头的 2-32 位字母/数字/下划线' },
              ]}
              extra="後端 biz_cpm_template.template_key"
            >
              <Input placeholder="如：product" maxLength={32} disabled={isDetail || !!existing} />
            </Form.Item>
            <Form.Item name="roleHint" label="崗位提示" rules={[{ required: true, message: '請填寫崗位提示' }]}>
              <Input placeholder="如：需求與跨部門協作為主" maxLength={64} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>工時輸入:</span>
            <Form.Item name="workHoursEnabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="開啟" unCheckedChildren="關閉" disabled={isDetail} />
            </Form.Item>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>開啟後記錄頁出現工時快選；僅用於分布統計，不進任何評價口徑</span>
          </div>
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--warn"><TagsOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">分類詞表</span>
            <div className="cpm-card__line" />
            <span className="cpm-card__extra">通用性来自结构统一，岗位差异只落在这里（方案 §九）</span>
          </div>
          <div className="cpm-cat__row" style={{ fontWeight: 500, color: 'var(--text-2)', fontSize: 13 }}>
            <span>分類鍵</span><span>顯示名</span><span>錄入提示語（placeholder 即引导）</span><span />
          </div>
          {categories.map((c, i) => (
            <div className="cpm-cat__row" key={i}>
              <Input
                value={c.key}
                placeholder="develop"
                maxLength={32}
                disabled={isDetail}
                onChange={e => patchCategory(i, { key: e.target.value })}
              />
              <Input
                value={c.label}
                placeholder="開發"
                maxLength={16}
                disabled={isDetail}
                onChange={e => patchCategory(i, { label: e.target.value })}
              />
              <Input
                value={c.hint ?? ''}
                placeholder="如：完成XX接口，進度70%"
                maxLength={64}
                disabled={isDetail}
                onChange={e => patchCategory(i, { hint: e.target.value })}
              />
              {!isDetail && (
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={categories.length <= 1}
                  onClick={() => setCategories(list => list.filter((_, idx) => idx !== i))}
                />
              )}
            </div>
          ))}
          {!isDetail && (
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => setCategories(list => [...list, { key: '', label: '', hint: '' }])}
            >
              添加分類
            </Button>
          )}
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--ok"><ProfileOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">備註</span>
            <div className="cpm-card__line" />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder="模板用途/变更原因（选填，200 字以内）" />
          </Form.Item>
        </div>
      </Form>

      {!isDetail && (
        <div className="form-footer">
          <Space>
            <Button onClick={() => navigate(-1)}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>保存</Button>
          </Space>
        </div>
      )}
    </div>
  )
}
