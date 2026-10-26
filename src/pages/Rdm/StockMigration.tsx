/**
 * 存量安全遷移 —— V3 分批交付存量數據遷移全流程控制台
 *
 * 全流程：預覽 → 主責確認 → 小批執行 → 暫停/恢復 → 對賬 → 回退。
 *
 * 三條鐵律（UI 必須如實呈现，不得美化）：
 * 1. **主責確認前不可執行**：status=previewed 時執行入口一律禁用，只有 confirmed/running 才可執行分塊；
 * 2. **不偽造證據**：遷移產出的交付項是 DI_PREPARING 容器（source=stock_migration、無驗收結論），
 *    UI 明確標注「遷移生成·未測試/未驗收/未發布」，絕不顯示為已完成；
 * 3. **拒絕盲目回滾**：發現新 V3 事實時後端整體拒絕並自動暫停，前端优雅呈现「請走前滾」而非報錯。
 *
 * 權限：rdm-delivery:view 可讀；rdm-delivery:edit 才可執行寫動作（與後端 @RequirePermission 一致）。
 * 危險動作（執行/暫停/回退）一律走 Modal.confirm + custom-confirm-modal。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Spin, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, EyeOutlined, PauseCircleOutlined, PlayCircleOutlined,
  ReloadOutlined, RollbackOutlined, SafetyCertificateOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { rdmTableLocale } from './components/tableLocale'
import { deriveRdmColumnMeta } from './rdmColumnMeta'
import { formatRdmDateTime } from './datetime'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  confirmMigrationBatch, executeMigrationChunk, fetchMigrationBatchDetail, fetchMigrationBatches,
  pauseMigrationBatch, previewStockMigration, reconcileMigrationBatch, resumeMigrationBatch, rollbackMigrationBatch,
  type RdmMigrationBatchDetail, type RdmMigrationChunkResult, type RdmMigrationItemDetail,
  type RdmMigrationItemPreview, type RdmMigrationPreviewResult, type RdmMigrationReconcileResult,
  type RdmMigrationRollbackResult,
} from '@/api/rdm'
import {
  RDM_STOCK_MIGRATION_BATCH_STATUS, RDM_STOCK_MIGRATION_BATCH_STATUS_COLOR, RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL,
  RDM_STOCK_MIGRATION_ITEM_STATUS_COLOR, RDM_STOCK_MIGRATION_ITEM_STATUS_LABEL,
} from '@/constants/rdm'
import './index.css'

const { TextArea } = Input

/** 批次狀態過濾選項（從常量生成） */
const STATUS_OPTIONS = Object.entries(RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL).map(([value, label]) => ({ value, label }))

/** 可執行分塊的狀態（主責確認後才可執行） */
const EXECUTABLE_STATUS: string[] = [RDM_STOCK_MIGRATION_BATCH_STATUS.CONFIRMED, RDM_STOCK_MIGRATION_BATCH_STATUS.RUNNING]

export default function StockMigration() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-delivery:edit')

  // ── 預覽 ──
  const [previewForm] = Form.useForm()
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<RdmMigrationPreviewResult | null>(null)

  // ── 批次列表 ──
  const [batches, setBatches] = useState<RdmMigrationBatchDetail[]>([])
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [listLoading, setListLoading] = useState(false)

  // ── 選中批次詳情 ──
  const [detail, setDetail] = useState<RdmMigrationBatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [acting, setActing] = useState(false)

  // ── 動作結果 ──
  const [chunkResult, setChunkResult] = useState<RdmMigrationChunkResult | null>(null)
  const [reconcileResult, setReconcileResult] = useState<RdmMigrationReconcileResult | null>(null)
  const [rollbackResult, setRollbackResult] = useState<RdmMigrationRollbackResult | null>(null)

  // ── 需填原因的動作（暫停/回退） ──
  const [reasonModal, setReasonModal] = useState<{ open: boolean; action: 'pause' | 'rollback' }>({ open: false, action: 'pause' })
  const [reasonForm] = Form.useForm()

  const loadBatches = useCallback(async (status?: string) => {
    setListLoading(true)
    try {
      const res = await fetchMigrationBatches(status)
      setBatches(res ?? [])
    } catch {
      message.error('遷移批次列表載入失敗')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { loadBatches(statusFilter) }, [loadBatches, statusFilter])

  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    setChunkResult(null); setReconcileResult(null); setRollbackResult(null)
    try {
      const res = await fetchMigrationBatchDetail(id)
      setDetail(res)
    } catch {
      message.error('批次詳情載入失敗')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const refreshDetail = useCallback(async () => {
    if (detail) await openDetail(detail.batchId)
    loadBatches(statusFilter)
  }, [detail, openDetail, loadBatches, statusFilter])

  // ── 生成預覽（只讀業務事實，不落任何變更） ──
  const handlePreview = async () => {
    try {
      const values = await previewForm.validateFields()
      setPreviewing(true)
      const payload = {
        projectId: values.projectId || undefined,
        targetProjectId: values.targetProjectId || undefined,
        chunkSize: values.chunkSize || undefined,
        reason: values.reason || undefined,
        reqIds: values.reqIds ? String(values.reqIds).split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n) && n > 0) : undefined,
      }
      if (!payload.projectId && (!payload.reqIds || payload.reqIds.length === 0)) {
        message.warning('請填寫來源項目 ID，或至少一個需求 ID')
        return
      }
      const res = await previewStockMigration(payload)
      setPreview(res)
      message.success('預覽已生成（未執行任何業務變更）')
      loadBatches(statusFilter)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    } finally {
      setPreviewing(false)
    }
  }

  // ── 主責確認（previewed → confirmed） ──
  const handleConfirm = (batch: RdmMigrationBatchDetail) => {
    Modal.confirm({
      title: '主責確認遷移批次',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>確認前請核對預覽影響面。確認後方可小批執行；<b>未確認不可執行</b>。</div>
          <div style={{ color: '#8C8C8C' }}>批次 #{batch.batchId} · 分塊大小 {batch.chunkSize ?? '-'} · 預覽哈希 {batch.previewHash ?? '-'}</div>
        </div>
      ),
      okText: '我已核對，主責確認',
      cancelText: '取消',
      onOk: async () => {
        setActing(true)
        try {
          const res = await confirmMigrationBatch(batch.batchId, { expectedVersion: batch.version ?? undefined })
          setDetail(res)
          message.success('已主責確認，可開始小批執行')
          loadBatches(statusFilter)
        } catch { /* request.ts 已統一彈 */ } finally { setActing(false) }
      },
    })
  }

  // ── 小批執行一個分塊 ──
  const handleExecute = (batch: RdmMigrationBatchDetail) => {
    Modal.confirm({
      title: '執行一個遷移分塊',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: `本次至多執行 ${batch.chunkSize ?? '-'} 條。產出為 DI_PREPARING 容器（未測試/未驗收/未發布），失敗項將隔離標記。確定執行嗎？`,
      okText: '確認執行',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setActing(true)
        try {
          const res = await executeMigrationChunk(batch.batchId, { expectedVersion: batch.version ?? undefined })
          setChunkResult(res)
          message.success(`分塊執行完成：成功 ${res.successInChunk ?? 0}、失敗 ${res.failedInChunk ?? 0}、剩餘 ${res.remaining ?? 0}`)
          await openDetail(batch.batchId); loadBatches(statusFilter)
        } catch { /* request.ts 已統一彈 */ } finally { setActing(false) }
      },
    })
  }

  // ── 恢復（paused → confirmed/running） ──
  const handleResume = async (batch: RdmMigrationBatchDetail) => {
    setActing(true)
    try {
      const res = await resumeMigrationBatch(batch.batchId, { expectedVersion: batch.version ?? undefined })
      setDetail(res)
      message.success('已恢復遷移')
      loadBatches(statusFilter)
    } catch { /* request.ts 已統一彈 */ } finally { setActing(false) }
  }

  // ── 對賬 ──
  const handleReconcile = async (batch: RdmMigrationBatchDetail) => {
    setActing(true)
    try {
      const res = await reconcileMigrationBatch(batch.batchId)
      setReconcileResult(res)
      if (res.countConsistent && res.traceable) message.success('對賬通過：數量一致且逐項可追溯')
      else message.warning('對賬發現不一致，請查看詳情')
    } catch { /* request.ts 已統一彈 */ } finally { setActing(false) }
  }

  // ── 暫停/回退：先在表單 Modal 收集原因，再 Modal.confirm 二次確認 ──
  const openReasonModal = (action: 'pause' | 'rollback') => {
    reasonForm.resetFields()
    setReasonModal({ open: true, action })
  }

  const submitReason = async () => {
    if (!detail) return
    try {
      const values = await reasonForm.validateFields()
      const reason = String(values.reason).trim()
      const action = reasonModal.action
      const isPause = action === 'pause'
      Modal.confirm({
        title: isPause ? '確認暫停遷移批次' : '確認回退遷移批次',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: isPause
          ? '暫停後已執行項保留、未執行項待續，確定暫停嗎？'
          : '回退僅做結構性逆向（不刪歷史/證據/關聯）。若發現新 V3 事實，後端將整體拒絕並自動暫停，只能走前滾。確定回退嗎？',
        okText: isPause ? '確認暫停' : '確認回退',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          setActing(true)
          try {
            if (isPause) {
              const res = await pauseMigrationBatch(detail.batchId, { reason, expectedVersion: detail.version ?? undefined })
              setDetail(res)
              message.success('已暫停遷移批次')
            } else {
              const res = await rollbackMigrationBatch(detail.batchId, { reason, expectedVersion: detail.version ?? undefined })
              setRollbackResult(res)
              if (res.rejected) message.warning('回退被拒絕：發現新 V3 事實，已自動暫停，請走前滾')
              else message.success('回退完成')
              await openDetail(detail.batchId)
            }
            setReasonModal({ open: false, action })
            reasonForm.resetFields()
            loadBatches(statusFilter)
          } catch { /* request.ts 已統一彈 */ } finally { setActing(false) }
        },
      })
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
    }
  }

  // ── 預覽項列 ──
  const previewColumns: TableColumnsType<RdmMigrationItemPreview> = useMemo(() => [
    { title: '交付項ID', dataIndex: 'itemId', key: 'itemId', width: 90 },
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 130, render: (v?: string | null) => v || '-' },
    { title: '標題', dataIndex: 'title', key: 'title', ellipsis: true, render: (v?: string | null) => v || '-' },
    {
      title: '可遷移', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={RDM_STOCK_MIGRATION_ITEM_STATUS_COLOR[v] ?? 'default'}>{RDM_STOCK_MIGRATION_ITEM_STATUS_LABEL[v] ?? v}</Tag>,
    },
    { title: '阻塞原因', dataIndex: 'blockingReason', key: 'blockingReason', width: 160, render: (v?: string | null) => v || '-' },
    {
      title: '影響面（結構性 V3 事實，不含證據）', dataIndex: 'impacts', key: 'impacts',
      render: (impacts: string[]) => (impacts?.length ? impacts.join('；') : '-'),
    },
    // 列定义包进 useMemo：下面要用它做「字段設置」候选的依赖，不包会每渲染都变
  ], [])

  // ── 明細項列 ──
  const itemColumns: TableColumnsType<RdmMigrationItemDetail> = useMemo(() => [
    { title: '交付項ID', dataIndex: 'itemId', key: 'itemId', width: 90 },
    { title: '需求ID', dataIndex: 'reqId', key: 'reqId', width: 90, render: (v?: number | null) => v ?? '-' },
    { title: '目標項目ID', dataIndex: 'targetProjectId', key: 'targetProjectId', width: 110, render: (v?: number | null) => v ?? '-' },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={RDM_STOCK_MIGRATION_ITEM_STATUS_COLOR[v] ?? 'default'}>{RDM_STOCK_MIGRATION_ITEM_STATUS_LABEL[v] ?? v}</Tag>,
    },
    {
      title: '證據口徑', key: 'evidence', width: 220,
      render: () => <Tag color="gold" style={{ margin: 0 }}>遷移生成·未測試/未驗收/未發布</Tag>,
    },
    { title: '阻塞原因', dataIndex: 'blockingReason', key: 'blockingReason', render: (v?: string | null) => v || '-' },
  ], [])

  // ── 批次列表列 ──
  const batchColumns: TableColumnsType<RdmMigrationBatchDetail> = useMemo(() => [
    { title: '批次', dataIndex: 'batchId', key: 'batchId', width: 80, render: (v: number) => `#${v}` },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={RDM_STOCK_MIGRATION_BATCH_STATUS_COLOR[v] ?? 'default'}>{RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL[v] ?? v}</Tag>,
    },
    { title: '分塊大小', dataIndex: 'chunkSize', key: 'chunkSize', width: 90, render: (v?: number | null) => v ?? '-' },
    { title: '預覽哈希', dataIndex: 'previewHash', key: 'previewHash', width: 160, ellipsis: true, render: (v?: string | null) => v || '-' },
    { title: '確認人', dataIndex: 'confirmedBy', key: 'confirmedBy', width: 90, render: (v?: number | null) => v ?? '未確認' },
    { title: '創建時間', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (v?: string | number | null) => formatRdmDateTime(v) },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_, record) => <Button type="link" size="small" onClick={() => openDetail(record.batchId)}>查看詳情</Button>,
    },
  ], [openDetail])

  /*
   * 三张表各自一份列配置（§E.3）：预览表讲“能不能迁”（阻塞原因/影响面）、
   * 明细表讲“迁成了什么”、批次表是操作入口；列集不同，共用 pageKey 会互相干扰。
   */
  const previewMeta = useMemo(() => deriveRdmColumnMeta(previewColumns), [previewColumns])
  const itemMeta = useMemo(() => deriveRdmColumnMeta(itemColumns), [itemColumns])
  const batchMeta = useMemo(() => deriveRdmColumnMeta(batchColumns), [batchColumns])
  const { configComponent: previewConfig, applyConfig: applyPreview } = useColumnConfig(
    'rdm-stock-preview-items', previewMeta,
    [{ key: 'itemId', visible: true, locked: 'head' as const }],
  )
  const { configComponent: itemConfig, applyConfig: applyItem } = useColumnConfig(
    'rdm-stock-detail-items', itemMeta,
    [{ key: 'itemId', visible: true, locked: 'head' as const }],
  )
  const { configComponent: batchConfig, applyConfig: applyBatch } = useColumnConfig(
    'rdm-stock-batches', batchMeta,
    [{ key: 'batchId', visible: true, locked: 'head' as const }, { key: 'action', visible: true, locked: 'tail' as const }],
  )
  const visiblePreviewColumns = applyPreview(previewColumns) as typeof previewColumns
  const visibleItemColumns = applyItem(itemColumns) as typeof itemColumns
  const visibleBatchColumns = applyBatch(batchColumns) as typeof batchColumns

  const status = detail?.status
  const canExecute = !!detail && EXECUTABLE_STATUS.includes(status ?? '')
  const isPreviewed = status === RDM_STOCK_MIGRATION_BATCH_STATUS.PREVIEWED
  const isPaused = status === RDM_STOCK_MIGRATION_BATCH_STATUS.PAUSED

  return (
    <div className="content-area">
      <RdmFormHeader
        title="存量安全遷移"
        onBack={() => navigate('/rdm-project')}
        backText="返回項目總覽"
        badge={<Tag color="orange" style={{ margin: 0 }}>僅結構性遷移·不偽造證據</Tag>}
      />

      {/* ── 全局口徑說明 ── */}
      <Alert
        type="warning"
        showIcon
        icon={<SafetyCertificateOutlined />}
        style={{ marginBottom: 16 }}
        message="遷移產出為 DI_PREPARING 容器（source=stock_migration），不含任何測試/驗收/發布證據"
        description="遷移只搬結構性 V3 事實，絕不生成「已完成」結論；遷移生成的交付項一律標注「未測試/未驗收/未發布」，須走正常門禁後才算交付。主責確認前不可執行；發現新 V3 事實時回退將被拒絕並自動暫停，只能前滾。"
      />

      {/* ── 生成預覽 ── */}
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><EyeOutlined /></span>
          生成遷移預覽
          <span className="rdm-todo-hint">只讀推導影響面，不落任何業務變更</span>
        </div>
        <Form form={previewForm} layout="inline" style={{ rowGap: 12, flexWrap: 'wrap' }}>
          <Form.Item name="projectId" label="來源項目ID">
            <InputNumber min={1} placeholder="與需求ID二選一" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="reqIds" label="需求ID(逗號分隔)">
            <Input placeholder="如 101,102" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="targetProjectId" label="目標項目ID">
            <InputNumber min={1} placeholder="留空則自動創建" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="chunkSize" label="分塊大小">
            <InputNumber min={1} max={100} placeholder="默認20" style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input placeholder="可選" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<EyeOutlined />} loading={previewing} onClick={handlePreview} disabled={!canEdit}>
              生成預覽
            </Button>
          </Form.Item>
        </Form>

        {preview && (
          <div style={{ marginTop: 16 }}>
            <Descriptions size="small" column={4} bordered style={{ marginBottom: 12 }}
              styles={{ label: { color: '#8C8C8C', fontSize: 12 }, content: { fontSize: 13 } }}>
              <Descriptions.Item label="批次">#{preview.batchId}</Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Tag color={RDM_STOCK_MIGRATION_BATCH_STATUS_COLOR[preview.status] ?? 'default'}>{RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL[preview.status] ?? preview.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="目標項目">{preview.targetProjectName ?? (preview.targetProjectAutoCreate ? '自動創建' : '-')}</Descriptions.Item>
              <Descriptions.Item label="分塊大小">{preview.chunkSize ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="總條數">{preview.totalItems ?? 0}</Descriptions.Item>
              <Descriptions.Item label="可遷移">{preview.eligibleItems ?? 0}</Descriptions.Item>
              <Descriptions.Item label="阻塞">{preview.blockedItems ?? 0}</Descriptions.Item>
              <Descriptions.Item label="預覽哈希">{preview.previewHash ?? '-'}</Descriptions.Item>
            </Descriptions>
            <Table<RdmMigrationItemPreview>
              rowKey="itemId" size="small" columns={visiblePreviewColumns} dataSource={preview.items ?? []}
              pagination={{
                defaultPageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: t => `共 ${t} 條`,
              }} scroll={{ x: 900 }}
            />
            <Space style={{ marginTop: 12 }}>
              {previewConfig}
              <Button icon={<ThunderboltOutlined />} disabled={!canEdit} onClick={() => openDetail(preview.batchId)}>
                進入批次詳情主責確認
              </Button>
            </Space>
          </div>
        )}
      </div>

      {/* ── 批次列表 ── */}
      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><ReloadOutlined /></span>
          遷移批次
          <span className="rdm-card-title-split" />
          <Space>
            <Select
              placeholder="全部狀態" allowClear style={{ width: 140 }} options={STATUS_OPTIONS}
              value={statusFilter} onChange={v => setStatusFilter(v)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => loadBatches(statusFilter)}>刷新</Button>
            {batchConfig}
          </Space>
        </div>
        <Table<RdmMigrationBatchDetail>
          rowKey="batchId" size="small" loading={listLoading} columns={visibleBatchColumns} dataSource={batches}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 個批次`,
          }} scroll={{ x: 800 }}
          locale={rdmTableLocale(listLoading, '暫無遷移批次')}
        />
      </div>

      {/* ── 批次詳情 + 全流程動作 ── */}
      {detailLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : detail && (
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><ThunderboltOutlined /></span>
            批次 #{detail.batchId} 詳情
            <Tag color={RDM_STOCK_MIGRATION_BATCH_STATUS_COLOR[detail.status] ?? 'default'} style={{ margin: 0 }}>
              {RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL[detail.status] ?? detail.status}
            </Tag>
          </div>

          {/* 未確認不可執行 / 已暫停提示 */}
          {isPreviewed && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="待主責確認：確認前執行入口一律禁用（未確認不可執行）。" />
          )}
          {isPaused && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message={`已暫停${detail.pauseReason ? `：${detail.pauseReason}` : ''}（被拒回退的批次不可恢復，只能前滾）。`} />
          )}

          {/* 全流程動作按鈕 */}
          <Space wrap style={{ marginBottom: 16 }}>
            <Button icon={<CheckCircleOutlined />} disabled={!canEdit || !isPreviewed} loading={acting} onClick={() => handleConfirm(detail)}>
              主責確認
            </Button>
            <Button type="primary" danger icon={<ThunderboltOutlined />} disabled={!canEdit || !canExecute} loading={acting} onClick={() => handleExecute(detail)}>
              執行一個分塊
            </Button>
            <Button icon={<PauseCircleOutlined />} disabled={!canEdit || !canExecute} loading={acting} onClick={() => openReasonModal('pause')}>
              暫停
            </Button>
            <Button icon={<PlayCircleOutlined />} disabled={!canEdit || !isPaused} loading={acting} onClick={() => handleResume(detail)}>
              恢復
            </Button>
            <Button icon={<SafetyCertificateOutlined />} disabled={!canEdit} loading={acting} onClick={() => handleReconcile(detail)}>
              對賬
            </Button>
            <Button danger icon={<RollbackOutlined />} disabled={!canEdit} loading={acting} onClick={() => openReasonModal('rollback')}>
              回退
            </Button>
            <Button icon={<ReloadOutlined />} onClick={refreshDetail}>刷新詳情</Button>
          </Space>

          <Descriptions size="small" column={4} bordered style={{ marginBottom: 16 }}
            styles={{ label: { color: '#8C8C8C', fontSize: 12 }, content: { fontSize: 13 } }}>
            <Descriptions.Item label="分塊大小">{detail.chunkSize ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="版本">v{detail.version ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="預覽哈希">{detail.previewHash ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="請求ID">{detail.requestId ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="確認人">{detail.confirmedBy ?? '未確認'}</Descriptions.Item>
            <Descriptions.Item label="確認時間">{formatRdmDateTime(detail.confirmedAt)}</Descriptions.Item>
            <Descriptions.Item label="暫停時間">{formatRdmDateTime(detail.pausedAt)}</Descriptions.Item>
            <Descriptions.Item label="暫停原因">{detail.pauseReason || '-'}</Descriptions.Item>
          </Descriptions>

          {/* 執行分塊結果 */}
          {chunkResult && (
            <Alert type="success" showIcon style={{ marginBottom: 12 }}
              message={`分塊執行：處理 ${chunkResult.processedInChunk ?? 0}、成功 ${chunkResult.successInChunk ?? 0}、失敗 ${chunkResult.failedInChunk ?? 0}`}
              description={`累計完成 ${chunkResult.totalCompleted ?? 0}、失敗 ${chunkResult.totalFailed ?? 0}、阻塞 ${chunkResult.totalBlocked ?? 0}、剩餘 ${chunkResult.remaining ?? 0}；批次狀態 ${RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL[chunkResult.batchStatus] ?? chunkResult.batchStatus}`} />
          )}

          {/* 對賬結果：前後計數一致 */}
          {reconcileResult && (
            <Alert
              type={reconcileResult.countConsistent && reconcileResult.traceable ? 'success' : 'error'} showIcon style={{ marginBottom: 12 }}
              message={reconcileResult.countConsistent && reconcileResult.traceable ? '對賬通過：源數量 = 成功 + 失敗 + 阻塞/跳過，且目標 V3 結構逐項可追溯' : '對賬不一致'}
              description={
                <div>
                  <div>總數 {reconcileResult.totalItems ?? 0} = 完成 {reconcileResult.completed ?? 0} + 失敗 {reconcileResult.failed ?? 0} + 阻塞 {reconcileResult.blocked ?? 0} + 待處理 {reconcileResult.pending ?? 0}</div>
                  <div>數量一致：{reconcileResult.countConsistent ? '是' : '否'}；可追溯：{reconcileResult.traceable ? '是' : '否'}</div>
                  {reconcileResult.inconsistencies && Object.keys(reconcileResult.inconsistencies).length > 0 && (
                    <div style={{ color: '#CF1322' }}>不一致：{Object.entries(reconcileResult.inconsistencies).map(([k, v]) => `${k}=${v}`).join('；')}</div>
                  )}
                </div>
              }
            />
          )}

          {/* 回退結果：拒絕盲目回滾的优雅呈现 */}
          {rollbackResult && (
            rollbackResult.rejected ? (
              <Alert type="warning" showIcon icon={<RollbackOutlined />} style={{ marginBottom: 12 }}
                message="回退被拒絕：發現新 V3 事實，已自動暫停，請走前滾（不可盲目回滾）"
                description={
                  <div>
                    <div>{rollbackResult.rejectReason || '存在遷移後新生成的 V3 事實，回退會丟失這些事實，故整體拒絕。'}</div>
                    {rollbackResult.newFactsByItem && Object.keys(rollbackResult.newFactsByItem).length > 0 && (
                      <div style={{ marginTop: 6, color: '#8C8C8C' }}>
                        涉及新事實的交付項：{Object.keys(rollbackResult.newFactsByItem).join('、')}
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>當前批次狀態：{RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL[rollbackResult.batchStatus ?? ''] ?? rollbackResult.batchStatus}</div>
                  </div>
                } />
            ) : (
              <Alert type="success" showIcon style={{ marginBottom: 12 }}
                message={`回退完成：已回退 ${rollbackResult.rolledBackItemIds?.length ?? 0} 項`}
                description={`批次狀態：${RDM_STOCK_MIGRATION_BATCH_STATUS_LABEL[rollbackResult.batchStatus ?? ''] ?? rollbackResult.batchStatus}`} />
            )
          )}

          {/* 明細項（標注未測試/未驗收/未發布） */}
          <div style={{ fontSize: 13, fontWeight: 600, margin: '8px 0' }}>
            <span style={{ marginRight: 8 }}>遷移明細（{detail.items?.length ?? 0}）</span>
            {itemConfig}
          </div>
          <Table<RdmMigrationItemDetail>
            rowKey="itemId" size="small" columns={visibleItemColumns} dataSource={detail.items ?? []}
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: t => `共 ${t} 條`,
            }} scroll={{ x: 900 }}
          />

          {/* 審計（追加式、不可覆蓋） */}
          <div style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 8px' }}>審計軌跡（{detail.audits?.length ?? 0}）</div>
          <Table
            rowKey="id" size="small" dataSource={detail.audits ?? []}
            pagination={{
              defaultPageSize: 5,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['5', '10', '20', '50'],
              showTotal: t => `共 ${t} 條`,
            }}
            columns={[
              { title: '動作', dataIndex: 'action', key: 'action', width: 120 },
              { title: '結果', dataIndex: 'result', key: 'result', width: 120 },
              { title: '操作人', dataIndex: 'operatorUserId', key: 'op', width: 90, render: (v?: number | null) => v ?? '-' },
              { title: '版本', key: 'ver', width: 110, render: (_, r) => `${r.beforeVersion ?? '-'} → ${r.afterVersion ?? '-'}` },
              { title: '原因', dataIndex: 'reason', key: 'reason', render: (v?: string | null) => v || '-' },
              { title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (v?: string | number | null) => formatRdmDateTime(v) },
            ]}
          />
        </div>
      )}

      {/* ── 原因輸入 Modal（暫停/回退）── */}
      <Modal
        title={reasonModal.action === 'pause' ? '暫停遷移批次' : '回退遷移批次'}
        open={reasonModal.open}
        onCancel={() => setReasonModal({ open: false, action: reasonModal.action })}
        onOk={submitReason}
        confirmLoading={acting}
        okText="下一步"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={reasonForm} layout="vertical">
          <Form.Item name="reason" label="原因" rules={[{ required: true, message: '請填寫原因（審計留痕）' }]}>
            <TextArea rows={3} placeholder={reasonModal.action === 'pause' ? '為什麼暫停？' : '為什麼回退？（發現新 V3 事實將被拒絕）'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
