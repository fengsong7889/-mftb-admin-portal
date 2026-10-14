/**
 * 新增/編輯學習路徑（/doc-learning/form，編輯帶 ?id=）—— 表單走獨立頁面路由（§9.1）
 *
 * 风格遵循 form-page-style：橙色渐变头条 + 白色 div 模块卡 + .form-footer 底部按钮。
 * 学习内容按「选择文档 → 添加 → 上移/下移」策展，保存时整体替换（后端语义）。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, InputNumber, Select, Space, Table, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, FileTextOutlined, ReadOutlined,
} from '@ant-design/icons'
import DocSectionCard from './DocSectionCard'
import {
  fetchDocNodes, fetchLearningPathDetail, createLearningPath, updateLearningPath,
  type DocNode,
} from '@/api/docCenter'
import '@/styles/components.css'

interface PathFormValues {
  name: string
  description?: string
  status: number
  sortOrder: number
}

/** 已选文档行（保留标题/空间用于展示，保存只提交 nodeId 顺序） */
interface PickedDoc {
  nodeId: number
  title: string
  spaceName: string
}

const NAME_MAX = 64
const DESC_MAX = 255

export default function DocLearningForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const rawId = params.get('id') ?? ''
  const editId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : undefined
  const isEditMode = editId != null
  const [form] = Form.useForm<PathFormValues>()
  const [docs, setDocs] = useState<DocNode[]>([])
  const [picked, setPicked] = useState<PickedDoc[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<number | undefined>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // 文檔清單一次拉取（內部工具規模，全量即可），下拉本地搜索
    fetchDocNodes({}).then(setDocs).catch(() => setDocs([]))
  }, [])

  useEffect(() => {
    if (!editId) return
    fetchLearningPathDetail(editId)
      .then(d => {
        if (!d) return
        form.setFieldsValue({ name: d.name, description: d.description, status: d.status, sortOrder: 0 })
        setPicked(d.items.map(i => ({ nodeId: i.nodeId, title: i.title, spaceName: i.spaceName })))
      })
      .catch((e: unknown) => message.error(e instanceof Error ? e.message : t('doc.loadPathFailed')))
  }, [editId, form, t])

  const docOptions = useMemo(() => (
    docs
      .filter(d => !picked.some(p => p.nodeId === d.id))
      .map(d => ({ value: d.id, label: `${d.title}（${d.spaceName}）` }))
  ), [docs, picked])

  const handleAdd = () => {
    if (selectedNodeId == null) {
      message.warning(t('doc.addDocPlaceholder'))
      return
    }
    const doc = docs.find(d => d.id === selectedNodeId)
    if (!doc) return
    setPicked(prev => [...prev, { nodeId: doc.id, title: doc.title, spaceName: doc.spaceName }])
    setSelectedNodeId(undefined)
  }

  const move = (index: number, delta: number) => {
    setPicked(prev => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const removeAt = (index: number) => {
    setPicked(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    let values: PathFormValues
    try {
      values = await form.validateFields()
    } catch {
      return // 校驗失敗：antd 已在表單項下方給出提示
    }
    if (picked.length === 0) {
      message.warning(t('doc.itemsRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        status: values.status,
        sortOrder: values.sortOrder ?? 0,
        items: picked.map(p => p.nodeId),
      }
      if (editId) {
        await updateLearningPath(editId, payload)
        message.success(t('doc.pathUpdated'))
        navigate(`/doc-learning/detail?id=${editId}`)
      } else {
        const newId = await createLearningPath(payload)
        message.success(t('doc.pathCreated'))
        navigate(newId ? `/doc-learning/detail?id=${newId}` : '/doc-learning')
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const pickedColumns: TableColumnsType<PickedDoc> = [
    {
      title: t('doc.learnColOrder'), key: 'order', width: 70, align: 'center',
      render: (_, __, index) => <span style={{ fontWeight: 600, color: '#8C8C8C' }}>{index + 1}</span>,
    },
    { title: t('doc.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true },
    { title: t('doc.colSpace'), dataIndex: 'spaceName', key: 'spaceName', width: 130 },
    {
      title: t('doc.colAction'), key: 'action', width: 210,
      render: (_, __, index) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" disabled={index === 0} onClick={() => move(index, -1)}>{t('doc.moveUp')}</Button>
          <Button type="link" size="small" disabled={index === picked.length - 1} onClick={() => move(index, 1)}>{t('doc.moveDown')}</Button>
          <Button type="link" size="small" danger onClick={() => removeAt(index)}>{t('doc.remove')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 頁面頭部：白色圓角卡片 + 橙色漸變動畫條 + 返回按鈕 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/doc-learning')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common.back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEditMode ? t('doc.editPath') : t('doc.addPath')}
            </h2>
          </div>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('doc.pathHeaderHint')}</span>
        </div>
      </div>

      <Form form={form} layout="vertical" initialValues={{ status: 1, sortOrder: 0 }}>
        {/* ── 基本信息 ── */}
        <DocSectionCard icon={<FileTextOutlined />} color="#1890ff" bg="#e6f7ff" title={t('doc.basicInfo')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item
              label={t('doc.learnNameField')} name="name"
              rules={[{ required: true, message: t('doc.learnNameRequired') }, { max: NAME_MAX, message: t('doc.nameMax') }]}
            >
              <Input placeholder={t('doc.learnNamePlaceholder')} showCount maxLength={NAME_MAX} allowClear />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Form.Item label={t('doc.learnStatusField')} name="status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 1, label: t('doc.statusOn') },
                    { value: 0, label: t('doc.statusOff') },
                  ]}
                />
              </Form.Item>
              <Form.Item label={t('doc.sortField')} name="sortOrder" rules={[{ required: true, message: t('doc.sortRequired') }]}>
                <InputNumber min={0} max={999} precision={0} style={{ width: '100%' }} placeholder={t('doc.sortPlaceholder')} />
              </Form.Item>
            </div>
            <Form.Item
              label={t('doc.learnDescField')} name="description" style={{ gridColumn: '1 / -1' }}
              rules={[{ max: DESC_MAX, message: t('doc.descMax', { max: DESC_MAX }) }]}
            >
              <Input.TextArea rows={2} maxLength={DESC_MAX} showCount placeholder={t('doc.learnDescPlaceholder')} />
            </Form.Item>
          </div>
        </DocSectionCard>

        {/* ── 學習內容 ── */}
        <DocSectionCard icon={<ReadOutlined />} color="#fa8c16" bg="#fff7e6" title={t('doc.contentTitle')}
          hint={t('doc.contentHint')}>
          <Space size={8} style={{ marginBottom: 16, width: '100%' }}>
            <Select
              value={selectedNodeId}
              onChange={setSelectedNodeId}
              options={docOptions}
              showSearch
              optionFilterProp="label"
              placeholder={t('doc.addDocPlaceholder')}
              style={{ width: 420 }}
              allowClear
            />
            <Button type="primary" onClick={handleAdd}>{t('doc.addDoc')}</Button>
          </Space>
          <Table<PickedDoc>
            rowKey="nodeId"
            columns={pickedColumns}
            dataSource={picked}
            pagination={false}
            size="middle"
            locale={{ emptyText: t('doc.emptyItems') }}
          />
        </DocSectionCard>

        {/* 底部操作按鈕（全局統一 .form-footer） */}
        <div className="form-footer">
          <Button onClick={() => navigate('/doc-learning')}>{t('doc.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('doc.learnSave')}
          </Button>
        </div>
      </Form>
    </div>
  )
}
