/**
 * 分类与标签治理（P0）：挂在治理页面下的独立子页。
 *
 * 约束：
 * - 分类只做导航，不承载权限；权限仍在空间 + ACL + 密级；
 * - 停用分类前必须为空（后端强校验），前端只做提示；
 * - 标签按空间维护，文档保存时也会自动建档，避免“先建词表才能用”。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Empty, Form, Input, Modal, Select, Space, Table, Tag, Tree, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ClusterOutlined, PlusOutlined, ReloadOutlined, TagsOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createDocCategory, createDocTag, disableDocCategory, disableDocTag,
  fetchDocCategoryTree, fetchDocKnowledgeSpaces, fetchDocTags, updateDocCategory,
  type DocCategoryNode, type DocKnowledgeSpace, type DocTag,
} from '@/api/docKnowledge'
import { useAuth } from '@/contexts/AuthContext'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

function flatten(nodes: DocCategoryNode[], depth = 0): { id: number; name: string; depth: number }[] {
  return nodes.flatMap(node => [
    { id: node.id, name: node.name, depth },
    ...flatten(node.children ?? [], depth + 1),
  ])
}

interface TaxonomyNode { key: string; title: string; children: TaxonomyNode[] }

function toTreeData(nodes: DocCategoryNode[]): TaxonomyNode[] {
  return nodes.map(node => ({
    key: String(node.id),
    title: `${node.name}${node.docCount > 0 ? ` (${node.docCount})` : ''}`,
    children: toTreeData(node.children ?? []),
  }))
}

export default function DocTaxonomy() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-library:edit')
  const [tagForm] = Form.useForm<{ name: string; color?: string }>()
  const [spaces, setSpaces] = useState<DocKnowledgeSpace[]>([])
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [categories, setCategories] = useState<DocCategoryNode[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [tags, setTags] = useState<DocTag[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSpaces = useCallback(() => {
    fetchDocKnowledgeSpaces().then(rows => {
      setSpaces(rows)
      if (spaceId == null && rows[0]) setSpaceId(rows[0].id)
    }).catch(() => setSpaces([]))
  }, [spaceId])

  const loadCategories = useCallback(async (targetSpaceId: number) => {
    try {
      setCategories(await fetchDocCategoryTree(targetSpaceId))
    } catch {
      setCategories([])
    }
  }, [])

  const loadTags = useCallback(async (targetSpaceId: number) => {
    try {
      setTags(await fetchDocTags(targetSpaceId))
    } catch {
      setTags([])
    }
  }, [])

  const refresh = useCallback(async () => {
    if (spaceId == null) return
    setLoading(true)
    try {
      await Promise.all([loadCategories(spaceId), loadTags(spaceId)])
    } finally {
      setLoading(false)
    }
  }, [spaceId, loadCategories, loadTags])

  useEffect(() => { loadSpaces() }, [loadSpaces])
  useEffect(() => { if (spaceId != null) void refresh() }, [spaceId, refresh])

  const categoryOptions = useMemo(() => flatten(categories), [categories])

  const handleSpaceChange = (value: number) => {
    setSpaceId(value)
    setSelectedCategoryId(null)
    setCategories([])
    setTags([])
  }

  const askName = (title: string, initial: string, onOk: (name: string) => Promise<void>) => {
    let value = initial
    Modal.confirm({
      title,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">+</span></span>,
      content: <Input defaultValue={initial} maxLength={100} onChange={event => { value = event.target.value }} />,
      okText: t('docKnowledge.save'),
      cancelText: t('docKnowledge.cancel'),
      onOk: async () => {
        if (!value.trim()) {
          message.warning(t('docKnowledge.categoryNameRequired'))
          throw new Error('name required')
        }
        try {
          await onOk(value.trim())
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('docKnowledge.operationFailed'))
          throw error
        }
      },
    })
  }

  const handleAddCategory = (child: boolean) => {
    if (spaceId == null) return
    askName(child ? t('docKnowledge.categoryAddChild') : t('docKnowledge.categoryAdd'), '', async name => {
      await createDocCategory(spaceId, { name, parentId: child ? selectedCategoryId : null })
      message.success(t('docKnowledge.categoryCreated'))
      await refresh()
    })
  }

  const handleRenameCategory = () => {
    if (spaceId == null || selectedCategoryId == null) {
      message.warning(t('docKnowledge.categorySelectFirst'))
      return
    }
    const current = categoryOptions.find(item => item.id === selectedCategoryId)
    askName(t('docKnowledge.categoryRename'), current?.name ?? '', async name => {
      await updateDocCategory(selectedCategoryId, { name })
      message.success(t('docKnowledge.categoryUpdated'))
      await refresh()
    })
  }

  const handleDisableCategory = () => {
    if (selectedCategoryId == null) {
      message.warning(t('docKnowledge.categorySelectFirst'))
      return
    }
    Modal.confirm({
      title: t('docKnowledge.categoryDisable'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: t('docKnowledge.categoryDisableHint'),
      okText: t('docKnowledge.disable'),
      okButtonProps: { danger: true },
      cancelText: t('docKnowledge.cancel'),
      onOk: async () => {
        try {
          await disableDocCategory(selectedCategoryId)
          message.success(t('docKnowledge.categoryDisabled'))
          setSelectedCategoryId(null)
          await refresh()
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('docKnowledge.operationFailed'))
          throw error
        }
      },
    })
  }

  const handleCreateTag = async () => {
    if (spaceId == null) return
    let values: { name: string; color?: string }
    try {
      values = await tagForm.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      await createDocTag({ name: values.name.trim(), color: values.color?.trim(), global: false }, spaceId)
      message.success(t('docKnowledge.tagCreated'))
      tagForm.resetFields()
      await loadTags(spaceId)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDisableTag = (tag: DocTag) => {
    Modal.confirm({
      title: t('docKnowledge.tagDisable'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: t('docKnowledge.tagDisableHint', { name: tag.name }),
      okText: t('docKnowledge.disable'),
      okButtonProps: { danger: true },
      cancelText: t('docKnowledge.cancel'),
      onOk: async () => {
        try {
          await disableDocTag(tag.id)
          message.success(t('docKnowledge.tagDisabled'))
          await loadTags(spaceId!)
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('docKnowledge.operationFailed'))
          throw error
        }
      },
    })
  }

  const tagColumns: ColumnsType<DocTag> = [
    { title: t('docKnowledge.tagName'), dataIndex: 'name', render: (value: string) => <Tag color="blue">{value}</Tag> },
    { title: t('docKnowledge.tagScope'), dataIndex: 'spaceId', width: 140, render: (value: number) => value === 0 ? t('docKnowledge.tagGlobal') : t('docKnowledge.tagSpace') },
    {
      title: t('docKnowledge.colAction'), width: 100,
      render: (_, row) => <Button type="link" size="small" danger onClick={() => handleDisableTag(row)}>{t('docKnowledge.disable')}</Button>,
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.taxonomyScope')} description={t('docKnowledge.taxonomyScopeHint')} />
      {!canEdit && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('docKnowledge.noEditPermission')} />}

      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<ClusterOutlined />} title={t('docKnowledge.taxonomyTitle')} />
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            style={{ width: 260 }}
            placeholder={t('docKnowledge.selectSpace')}
            value={spaceId ?? undefined}
            options={spaces.map(space => ({ value: space.id, label: space.name }))}
            onChange={handleSpaceChange}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>{t('docKnowledge.reload')}</Button>
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddCategory(false)}>{t('docKnowledge.categoryAdd')}</Button>}
          {canEdit && <Button onClick={() => handleAddCategory(true)} disabled={selectedCategoryId == null}>{t('docKnowledge.categoryAddChild')}</Button>}
          {canEdit && <Button onClick={handleRenameCategory} disabled={selectedCategoryId == null}>{t('docKnowledge.categoryRename')}</Button>}
          {canEdit && <Button danger onClick={handleDisableCategory} disabled={selectedCategoryId == null}>{t('docKnowledge.categoryDisable')}</Button>}
        </Space>
        {categories.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.categoryEmpty')} />
        ) : (
          <Tree
            treeData={toTreeData(categories)}
            selectedKeys={selectedCategoryId == null ? [] : [String(selectedCategoryId)]}
            onSelect={keys => setSelectedCategoryId(keys[0] ? Number(keys[0]) : null)}
            defaultExpandAll
          />
        )}
      </div>

      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<TagsOutlined />} title={t('docKnowledge.tagTitle')} />
        {canEdit && (
          <Form form={tagForm} layout="inline" style={{ marginBottom: 16 }}>
            <Form.Item name="name" label={t('docKnowledge.tagName')} rules={[{ required: true, whitespace: true, max: 64 }]}>
              <Input maxLength={64} placeholder={t('docKnowledge.tagNamePlaceholder')} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="color" label={t('docKnowledge.tagColor')}>
              <Input maxLength={16} placeholder="#1890FF" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTag} loading={saving}>{t('docKnowledge.tagCreate')}</Button>
            </Form.Item>
          </Form>
        )}
        <Table rowKey="id" size="small" pagination={false} dataSource={tags} columns={tagColumns}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.tagEmpty')} /> }} />
      </div>
    </div>
  )
}
