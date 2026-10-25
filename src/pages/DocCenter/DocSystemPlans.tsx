/**
 * 系统方案库：归档系统建设/整改生成的 MD 文件，供后续改造追溯。
 * 列表只读；正文来自后端归档快照，不依赖原文件是否还存在。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Input, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileTextOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  fetchDocSystemPlanSystems, fetchDocSystemPlans, scanDocSystemPlans,
  type DocSystemPlan,
} from '@/api/docCatalog'
import { formatDocKnowledgeTime } from '@/api/docKnowledge'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

export default function DocSystemPlans() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DocSystemPlan[]>([])
  const [total, setTotal] = useState(0)
  const [systems, setSystems] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [system, setSystem] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const result = await fetchDocSystemPlans({ keyword, system, page: targetPage, size })
      setRows(result.records)
      setTotal(result.total)
      setPage(result.page)
      setSystems(await fetchDocSystemPlanSystems())
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [keyword, system, page, size, t])

  useEffect(() => { void load(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await scanDocSystemPlans()
      message.success(t('docKnowledge.systemPlanScanned', {
        inserted: result.inserted ?? 0, updated: result.updated ?? 0,
      }))
      await load(1)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.systemPlanScanFailed'))
    } finally {
      setScanning(false)
    }
  }

  const columns: ColumnsType<DocSystemPlan> = [
    {
      title: t('docKnowledge.colTitle'), dataIndex: 'title', ellipsis: true,
      render: (value: string, row) => (
        <a onClick={() => navigate(`/doc-system-plans/detail?id=${row.id}`)}>
          <FileTextOutlined style={{ marginRight: 6, color: '#1890ff' }} />{value}
        </a>
      ),
    },
    { title: t('docKnowledge.systemPlanSystem'), dataIndex: 'systemName', width: 130 },
    { title: t('docKnowledge.systemPlanType'), dataIndex: 'planType', width: 110, render: (value: string) => <Tag color="blue">{value}</Tag> },
    { title: t('docKnowledge.systemPlanGeneratedAt'), dataIndex: 'generatedAt', width: 170, render: (value: string | number) => formatDocKnowledgeTime(value) },
    { title: t('docKnowledge.systemPlanSource'), dataIndex: 'sourcePath', ellipsis: true },
    { title: t('docKnowledge.systemPlanHash'), dataIndex: 'contentHash', width: 110, render: (value: string) => value.slice(0, 8) },
    { title: t('docKnowledge.updatedAt'), dataIndex: 'updatedAt', width: 170, render: (value: string | number) => formatDocKnowledgeTime(value) },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.systemPlansTitle')} description={t('docKnowledge.systemPlansHint')} />
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<FileTextOutlined />} title={t('docKnowledge.systemPlansTitle')}
          extra={(
            <Space>
              <Input.Search allowClear value={keyword} onChange={e => setKeyword(e.target.value)}
                onSearch={() => void load(1)} placeholder={t('docKnowledge.searchPlaceholder')} style={{ width: 240 }} />
              <Select allowClear value={system} onChange={setSystem} style={{ width: 180 }}
                placeholder={t('docKnowledge.systemPlanSystem')}
                options={systems.map(item => ({ value: item, label: item }))} />
              <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('docKnowledge.reload')}</Button>
              <Button type="primary" icon={<SyncOutlined />} onClick={handleScan} loading={scanning}>
                {t('docKnowledge.systemPlanScan')}
              </Button>
            </Space>
          )} />
        <Table rowKey="id" size="middle" dataSource={rows} loading={loading} columns={columns}
          scroll={{ x: 1100 }}
          pagination={{
            current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
            showTotal: count => t('common.total', { count }),
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== size ? 1 : nextPage)
              setSize(nextSize)
              void load(nextSize !== size ? 1 : nextPage)
            },
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.systemPlansEmpty')} /> }} />
      </div>
    </div>
  )
}
