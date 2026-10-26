/**
 * 交付項表單 —— 新增 / 編輯 / 查看交付項
 *
 * URL 參數：
 *   ?mode=create&reqId=xxx  — 新增（從需求進入）
 *   ?mode=create&projectId=xxx — 新增（從項目進入）
 *   ?mode=edit&id=xxx       — 編輯
 *   ?mode=view&id=xxx       — 查看（只讀）
 *
 * 佈局遵循 AGENTS.md §C：RdmFormHeader + 白色 div 模塊卡 + form-footer
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Spin,
  Tag,
  Timeline,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import EmployeeSelect from '@/components/EmployeeSelect'
import HelpPopover from '@/components/HelpPopover'
import {
  createDeliveryItem,
  createNewScopeVersion,
  fetchDeliveryItemDetail,
  fetchDeliveryItemSummary,
  fetchScopeHistory,
  freezeDeliveryItemScope,
  updateDeliveryItem,
  type RdmDeliveryItemDetail,
  type RdmDeliveryItemSummary,
  type RdmScopeVersionEntry,
} from '@/api/rdm'
import {
  RDM_ACCEPT_RESULT_LABEL,
  RDM_DELIVERY_ITEM_STATUS_COLOR,
  RDM_DELIVERY_ITEM_STATUS_LABEL,
  RDM_TEST_BATCH_STATUS_LABEL,
} from '@/constants/rdm'
import './index.css'

const { TextArea } = Input

type FormMode = 'create' | 'edit' | 'view'

/** 驗收路徑說明（HelpPopover 內容） */
const PATH_HELP_SECTIONS = [
  {
    tone: 'info' as const,
    label: '路徑 A — 先驗收後上線',
    body: '交付項完成測試後，先由產品驗收人與業務驗收人確認功能符合預期，\n驗收通過後才可提交發布批次上線。\n適用場景：業務邏輯複雜、需人工確認結果的需求。',
  },
  {
    tone: 'warn' as const,
    label: '路徑 B — 先上線後驗收',
    body: '交付項完成測試後直接隨發布批次上線，\n上線後再由驗收人在生產環境確認（上線後待評分）。\n適用場景：低風險改動、數據修復、技術債清理等。',
  },
]

export default function DeliveryItemForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()

  const mode: FormMode = (searchParams.get('mode') as FormMode) || 'create'
  const itemId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const reqId = searchParams.get('reqId') ? Number(searchParams.get('reqId')) : null
  const projectId = searchParams.get('projectId') ? Number(searchParams.get('projectId')) : null
  /** 从需求详情带入的项目名：只读展示用，避免把裸 ID 直接给用户看 */
  const projectNameFromUrl = searchParams.get('projectName') ?? ''

  const isView = mode === 'view'
  const isEdit = mode === 'edit'

  const [form] = Form.useForm()
  const [changeForm] = Form.useForm()
  const [detail, setDetail] = useState<RdmDeliveryItemDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * 人员姓名快照：表单值只存 sys_user.id（权限判定只认 ID），
   * 提交时把下拉带回的姓名一并落库，列表/详情就不用再查一次员工表。
   */
  const pickedNames = useRef<Record<string, string>>({})

  // ── Batch2：範圍版本管理 ──
  const [scopeHistory, setScopeHistory] = useState<RdmScopeVersionEntry[]>([])
  const [scopeHistoryLoading, setScopeHistoryLoading] = useState(false)
  const [itemSummary, setItemSummary] = useState<RdmDeliveryItemSummary | null>(null)
  const [freezeSubmitting, setFreezeSubmitting] = useState(false)
  const [changeModalOpen, setChangeModalOpen] = useState(false)
  const [changeSubmitting, setChangeSubmitting] = useState(false)

  // ── 載入編輯/查看數據 ──
  const loadDetail = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDeliveryItemDetail(itemId)
      setDetail(res)
      form.setFieldsValue({
        title: res.title,
        scopeDesc: res.scopeDesc,
        acceptanceCriteria: res.acceptanceCriteria,
        coordinatorUserId: res.coordinatorUserId ?? undefined,
        productAcceptorUserId: res.productAcceptorUserId ?? undefined,
        bizAcceptorUserId: res.bizAcceptorUserId ?? undefined,
        acceptancePath: res.acceptancePath,
        planStartDate: res.planStartDate ? dayjs(res.planStartDate) : null,
        planEndDate: res.planEndDate ? dayjs(res.planEndDate) : null,
      })
      pickedNames.current = {
        coordinatorUserId: res.coordinatorUserName ?? '',
        productAcceptorUserId: res.productAcceptorUserName ?? '',
        bizAcceptorUserId: res.bizAcceptorUserName ?? '',
      }
    } catch {
      setError('交付項詳情載入失敗')
    } finally {
      setLoading(false)
    }
  }, [itemId, form])

  useEffect(() => {
    if (itemId && (isEdit || isView)) {
      loadDetail()
    } else if (mode === 'create') {
      // 新增模式：預填關聯 ID
      if (reqId) form.setFieldsValue({ reqId })
      if (projectId) form.setFieldsValue({ projectId })
    }
  }, [itemId, isEdit, isView, mode, reqId, projectId, form, loadDetail])

  // ── Batch2：載入範圍版本歷史與交付項摘要（後端不可用時降級為空） ──
  const loadScopeInfo = useCallback(async () => {
    if (!itemId) return
    setScopeHistoryLoading(true)
    try {
      const [history, summ] = await Promise.all([
        fetchScopeHistory(itemId).catch(() => [] as RdmScopeVersionEntry[]),
        fetchDeliveryItemSummary(itemId).catch(() => null),
      ])
      setScopeHistory(history ?? [])
      setItemSummary(summ)
    } finally {
      setScopeHistoryLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    if (itemId && (isEdit || isView)) void loadScopeInfo()
  }, [itemId, isEdit, isView, loadScopeInfo])

  /** 範圍是否已凍結：優先用詳情凍結時間，其次用摘要口徑 */
  const scopeFrozen = detail?.scopeFrozenAt != null || itemSummary?.scopeFrozen === true

  // ── Batch2：凍結範圍 ──
  const handleFreezeScope = async () => {
    if (!itemId) return
    setFreezeSubmitting(true)
    try {
      await freezeDeliveryItemScope(itemId)
      message.success('範圍已凍結')
      await Promise.all([loadDetail(), loadScopeInfo()])
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '凍結失敗，請重試')
    } finally {
      setFreezeSubmitting(false)
    }
  }

  // ── Batch2：發起範圍變更 ──
  const openChangeModal = () => {
    changeForm.resetFields()
    setChangeModalOpen(true)
  }

  const submitScopeChange = async () => {
    if (!itemId) return
    try {
      const values = await changeForm.validateFields()
      setChangeSubmitting(true)
      await createNewScopeVersion(itemId, {
        changeReason: values.changeReason,
        newScopeDesc: values.newScopeDesc || undefined,
        newAcceptanceCriteria: values.newAcceptanceCriteria || undefined,
      })
      message.success('範圍變更已發起')
      setChangeModalOpen(false)
      await Promise.all([loadDetail(), loadScopeInfo()])
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(err instanceof Error && err.message ? err.message : '發起變更失敗，請重試')
    } finally {
      setChangeSubmitting(false)
    }
  }

  // ── 提交表單 ──
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        title: values.title,
        reqId: values.reqId ?? reqId ?? detail?.reqId,
        projectId: values.projectId ?? projectId ?? detail?.projectId ?? undefined,
        scopeDesc: values.scopeDesc || undefined,
        acceptanceCriteria: values.acceptanceCriteria || undefined,
        // 员工下拉的 value 是 sys_user.id；姓名为快照，两者成对提交
        coordinatorUserId: values.coordinatorUserId ?? undefined,
        coordinatorUserName: values.coordinatorUserId ? pickedNames.current.coordinatorUserId || undefined : undefined,
        productAcceptorUserId: values.productAcceptorUserId ?? undefined,
        productAcceptorUserName: values.productAcceptorUserId ? pickedNames.current.productAcceptorUserId || undefined : undefined,
        bizAcceptorUserId: values.bizAcceptorUserId ?? undefined,
        bizAcceptorUserName: values.bizAcceptorUserId ? pickedNames.current.bizAcceptorUserId || undefined : undefined,
        acceptancePath: values.acceptancePath || undefined,
        planStartDate: values.planStartDate ? values.planStartDate.format('YYYY-MM-DD') : undefined,
        planEndDate: values.planEndDate ? values.planEndDate.format('YYYY-MM-DD') : undefined,
      }

      if (isEdit && itemId && detail) {
        await updateDeliveryItem(itemId, { ...payload, expectedVersion: detail.version })
        message.success('交付項更新成功')
        navigate(-1)
      } else {
        const created = await createDeliveryItem(payload as Parameters<typeof createDeliveryItem>[0])
        message.success('交付項創建成功')
        // 建完直接进新交付项的详情：回退到上一页会让用户以为没建成功，也看不到编号
        navigate(`/rdm-delivery-item?id=${created.id}&mode=view`, { replace: true })
      }
      return
    } catch (err) {
      // antd validateFields 拋出的錯誤不需要額外提示
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(isEdit ? '更新失敗，請重試' : '創建失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 標題 ──
  const pageTitle = isView ? '交付項詳情' : isEdit ? '編輯交付項' : '新增交付項'

  // ── 載入中 ──
  if (loading) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="載入交付項..." />
      </div>
    )
  }

  // ── 錯誤 ──
  if (error) {
    return (
      <div className="content-area">
        <RdmFormHeader title={pageTitle} onBack={() => navigate(-1)} />
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={loadDetail}>重試</Button>}
        />
      </div>
    )
  }

  // ── 查看模式（只讀） ──
  if (isView && detail) {
    const statusLabel = RDM_DELIVERY_ITEM_STATUS_LABEL[detail.status] ?? detail.status
    const statusColor = RDM_DELIVERY_ITEM_STATUS_COLOR[detail.status] ?? 'default'
    const testStatusLabel = detail.testStatus ? (RDM_TEST_BATCH_STATUS_LABEL[detail.testStatus] ?? detail.testStatus) : t('rdm.deliveryItem.noTest')
    const acceptanceStatusLabel = detail.acceptanceStatus
      ? (RDM_ACCEPT_RESULT_LABEL[detail.acceptanceStatus as keyof typeof RDM_ACCEPT_RESULT_LABEL] ?? detail.acceptanceStatus)
      : t('rdm.deliveryItem.noAcceptance')
    return (
      <div className="content-area">
        <RdmFormHeader
          title={detail.title}
          onBack={() => navigate(-1)}
          backText="返回"
          badge={<Tag color={statusColor}>{statusLabel}</Tag>}
          meta={
            <span>
              交付項編號 {detail.itemNo}
              {detail.reqNo && ` · 需求 ${detail.reqNo}`}
              {detail.coordinatorUserName && ` · 協調人 ${detail.coordinatorUserName}`}
            </span>
          }
          right={
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/rdm-delivery-item?id=${detail.id}&mode=edit`)}
            >
              編輯
            </Button>
          }
        />

        {/* 基本信息 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
              <CheckCircleOutlined />
            </span>
            基本信息
          </div>
          <Descriptions column={2} size="small" labelStyle={{ color: '#8C8C8C', fontSize: 12 }} contentStyle={{ color: '#262626', fontSize: 13 }}>
            <Descriptions.Item label="交付項標題" span={2}>{detail.title}</Descriptions.Item>
            <Descriptions.Item label="關聯需求">{detail.reqNo ? `${detail.reqNo} ${detail.reqTitle}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="所屬項目">{detail.projectName || '-'}</Descriptions.Item>
            <Descriptions.Item label="範圍描述" span={2}>
              {detail.scopeDesc
                ? <div className="rdm-desc-block">{detail.scopeDesc}</div>
                : <span style={{ color: '#BFBFBF' }}>未填寫</span>}
            </Descriptions.Item>
            <Descriptions.Item label="驗收標準" span={2}>
              {detail.acceptanceCriteria
                ? <div className="rdm-desc-block">{detail.acceptanceCriteria}</div>
                : <span style={{ color: '#BFBFBF' }}>未填寫</span>}
            </Descriptions.Item>
          </Descriptions>
        </div>

        {/* Batch2：範圍版本 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}>
              <HistoryOutlined />
            </span>
            範圍版本
            {scopeFrozen
              ? <Tag color="green" icon={<LockOutlined />} style={{ margin: 0 }}>範圍已凍結</Tag>
              : <Tag style={{ margin: 0 }}>未凍結</Tag>}
            {scopeFrozen && detail.scopeFrozenAt && (
              <span className="rdm-todo-hint">凍結於 {detail.scopeFrozenAt.slice(0, 16).replace('T', ' ')}</span>
            )}
            <span className="rdm-card-title-split" />
            <Space style={{ marginLeft: 'auto' }}>
              {!scopeFrozen && (
                <Popconfirm
                  title="確定凍結當前範圍？"
                  description="凍結後修改需走變更流程"
                  onConfirm={handleFreezeScope}
                  okText="凍結"
                  cancelText="取消"
                >
                  <Button size="small" icon={<LockOutlined />} loading={freezeSubmitting}>凍結範圍</Button>
                </Popconfirm>
              )}
              {scopeFrozen && (
                <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={openChangeModal}>發起範圍變更</Button>
              )}
            </Space>
          </div>
          {scopeHistoryLoading ? (
            <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
          ) : scopeHistory.length === 0 ? (
            <div className="rdm-empty-hint">尚無範圍版本記錄</div>
          ) : (
            <Timeline
              items={scopeHistory.map(h => ({
                color: h.version === (itemSummary?.scopeVersion ?? scopeHistory[0]?.version) ? 'green' : 'gray',
                children: (
                  <div>
                    <div style={{ fontSize: 13, color: '#262626' }}>
                      <b>版本 v{h.version}</b>
                      {h.userName && <span style={{ color: '#8C8C8C', marginLeft: 8 }}>{h.userName}</span>}
                      {h.time && <span style={{ color: '#BFBFBF', marginLeft: 8, fontSize: 12 }}>{h.time.slice(0, 16).replace('T', ' ')}</span>}
                    </div>
                    {h.reason && <div style={{ fontSize: 12, color: '#595959', marginTop: 2 }}>{h.reason}</div>}
                  </div>
                ),
              }))}
            />
          )}
        </div>

        {/* 責任人與路徑 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}>
              <CheckCircleOutlined />
            </span>
            責任人與路徑
          </div>
          <Descriptions column={2} size="small" labelStyle={{ color: '#8C8C8C', fontSize: 12 }} contentStyle={{ color: '#262626', fontSize: 13 }}>
            <Descriptions.Item label="協調人">{detail.coordinatorUserName || '-'}</Descriptions.Item>
            <Descriptions.Item label="驗收路徑">
              {detail.acceptancePath === 'A' ? '路徑 A（先驗收後上線）' :
               detail.acceptancePath === 'B' ? '路徑 B（先上線後驗收）' : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="產品驗收人">{detail.productAcceptorUserName || '-'}</Descriptions.Item>
            <Descriptions.Item label="業務驗收人">{detail.bizAcceptorUserName || '-'}</Descriptions.Item>
          </Descriptions>
        </div>

        {/* 計劃 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}>
              <CheckCircleOutlined />
            </span>
            計劃時間
          </div>
          <Descriptions column={2} size="small" labelStyle={{ color: '#8C8C8C', fontSize: 12 }} contentStyle={{ color: '#262626', fontSize: 13 }}>
            <Descriptions.Item label="計劃開始">{detail.planStartDate || '-'}</Descriptions.Item>
            <Descriptions.Item label="計劃結束">{detail.planEndDate || '-'}</Descriptions.Item>
          </Descriptions>
        </div>

        {/* 交付推進：V3 的后续动作全部挂在交付项上，避免用户回到需求页找不到入口 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6FFFB', color: '#13C2C2' }}>
              <CheckCircleOutlined />
            </span>
            {t('rdm.deliveryItem.advanceTitle')}
            {!scopeFrozen && <Tag color="warning" style={{ margin: 0 }}>{t('rdm.deliveryItem.freezeFirst')}</Tag>}
            <span className="rdm-card-title-split" />
          </div>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('rdm.deliveryItem.advanceHint')}
            description={t('rdm.deliveryItem.advanceMeta', {
              progress: detail.taskProgress || 0,
              test: testStatusLabel,
              acceptance: acceptanceStatusLabel,
            })}
          />
          <Space wrap>
            <Button onClick={() => navigate(`/rdm-task?reqId=${detail.reqId}&deliveryItemId=${detail.id}`)}>
              {t('rdm.deliveryItem.assignTask')}
            </Button>
            <Button onClick={() => navigate(`/rdm-test-submit?reqId=${detail.reqId}&deliveryItemId=${detail.id}`)}>
              {t('rdm.deliveryItem.submitTest')}
            </Button>
            <Button
              onClick={() => navigate(`/rdm-acceptance-form?id=${detail.reqId}&deliveryItemId=${detail.id}&tab=gate`)}
            >
              {t('rdm.deliveryItem.accept')}
            </Button>
            <Button type="primary" ghost onClick={() => navigate(`/rdm-detail?id=${detail.reqId}&tab=gate`)}>
              {t('rdm.deliveryItem.reqDetail')}
            </Button>
          </Space>
        </div>

        {/* 元數據 */}
        <div className="rdm-detail-footer">
          <span>創建於 <b>{detail.createdAt?.slice(0, 16).replace('T', ' ') || '-'}</b></span>
          <span>最後更新 <b>{detail.updatedAt?.slice(0, 16).replace('T', ' ') || '-'}</b></span>
          <span>版本 <b>v{detail.version}</b></span>
        </div>

        {/* Batch2：發起範圍變更彈窗 */}
        <Modal
          title="發起範圍變更"
          open={changeModalOpen}
          onCancel={() => setChangeModalOpen(false)}
          onOk={submitScopeChange}
          okText="提交變更"
          cancelText="取消"
          confirmLoading={changeSubmitting}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="範圍變更會生成新版本，原版本內容保留可追溯。"
          />
          <Form form={changeForm} layout="vertical">
            <Form.Item
              name="changeReason"
              label="變更原因"
              rules={[{ required: true, message: '請填寫變更原因' }]}
            >
              <TextArea rows={3} placeholder="說明為什麼需要變更範圍" maxLength={500} showCount />
            </Form.Item>
            <Form.Item name="newScopeDesc" label="新範圍描述">
              <TextArea rows={3} placeholder="留空則沿用當前範圍描述" maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="newAcceptanceCriteria" label="新驗收標準">
              <TextArea rows={3} placeholder="留空則沿用當前驗收標準" maxLength={2000} showCount />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  // ── 新增 / 編輯 模式（表單） ──
  return (
    <div className="content-area">
      <RdmFormHeader
        title={pageTitle}
        onBack={() => navigate(-1)}
        backText="返回"
        meta={detail ? `交付項 ${detail.itemNo}` : undefined}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ acceptancePath: 'A' }}
      >
        {/* Section 1：基本信息 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
              <EditOutlined />
            </span>
            基本信息
          </div>

          <Form.Item
            name="title"
            label="交付項標題"
            rules={[{ required: true, message: '請輸入交付項標題' }]}
          >
            <Input placeholder="請輸入交付項標題" maxLength={200} showCount />
          </Form.Item>

          {/* 關聯需求（編輯模式只讀顯示） */}
          {isEdit && detail ? (
            <Form.Item label="關聯需求">
              <Input
                value={detail.reqNo ? `${detail.reqNo} — ${detail.reqTitle}` : '-'}
                readOnly
                style={{ background: '#FAFBFC', color: '#595959' }}
              />
            </Form.Item>
          ) : (
            <Form.Item name="reqId" label="關聯需求 ID" hidden={!!reqId}>
              <Input placeholder="需求 ID（從需求詳情進入時自動填入）" />
            </Form.Item>
          )}

          {reqId && mode === 'create' && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`已自動關聯需求 ID：${reqId}`}
            />
          )}

          {/* projectId 只提交、不展示；对用户显示项目名（没有名字时至少标成「項目 #7」） */}
          <Form.Item name="projectId" hidden>
            <Input />
          </Form.Item>
          {(projectId || detail?.projectId) && (
            <Form.Item label={t('rdm.deliveryItem.projectLabel')}>
              <Input
                disabled
                value={projectNameFromUrl
                  || detail?.projectName
                  || t('rdm.deliveryItem.projectFallback', { id: projectId ?? detail?.projectId })}
              />
            </Form.Item>
          )}

          <Form.Item name="scopeDesc" label="範圍描述">
            <TextArea
              rows={4}
              placeholder="描述本次交付項的具體範圍，包括功能邊界、影響模塊等"
              maxLength={2000}
              showCount
              readOnly={scopeFrozen}
              style={scopeFrozen ? { background: '#FAFBFC', color: '#595959' } : undefined}
            />
          </Form.Item>

          <Form.Item name="acceptanceCriteria" label="驗收標準">
            <TextArea
              rows={4}
              placeholder="列出驗收通過的具體條件，每條一行"
              maxLength={2000}
              showCount
              readOnly={scopeFrozen}
              style={scopeFrozen ? { background: '#FAFBFC', color: '#595959' } : undefined}
            />
          </Form.Item>

          {scopeFrozen && (
            <Alert
              type="warning"
              showIcon
              icon={<LockOutlined />}
              message="範圍已凍結"
              description="範圍描述與驗收標準已鎖定，如需修改請到「交付項詳情」發起範圍變更（生成新版本）。"
            />
          )}
        </div>

        {/* Section 2：責任人與路徑 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}>
              <CheckCircleOutlined />
            </span>
            責任人與路徑
          </div>

          {/* 选人字段统一用 EmployeeSelect（远程搜索下拉）。它的 value 契约是 number[]，
              表单/接口存标量 ID，用 getValueProps / normalize 做双向适配。 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="coordinatorUserId"
              label="協調人"
              tooltip={t('rdm.deliveryItem.coordinatorTooltip')}
              extra={t('rdm.deliveryItem.coordinatorExtra')}
              getValueProps={(v?: number) => ({ value: v == null ? [] : [v] })}
              normalize={(picked?: number[]) => picked?.[0]}
            >
              <EmployeeSelect
                single
                placeholder={t('rdm.deliveryItem.coordinatorPlaceholder')}
                seed={detail?.coordinatorUserId && detail?.coordinatorUserName
                  ? [{ id: detail.coordinatorUserId, name: detail.coordinatorUserName }]
                  : undefined}
                onPick={items => {
                  const picked = items[0]
                  if (picked) pickedNames.current.coordinatorUserId = picked.name
                }}
              />
            </Form.Item>
            <Form.Item
              name="productAcceptorUserId"
              label="產品驗收人"
              tooltip="默認為主責 PM"
              getValueProps={(v?: number) => ({ value: v == null ? [] : [v] })}
              normalize={(picked?: number[]) => picked?.[0]}
            >
              <EmployeeSelect
                single
                placeholder={t('rdm.deliveryItem.productAcceptorPlaceholder')}
                seed={detail?.productAcceptorUserId && detail?.productAcceptorUserName
                  ? [{ id: detail.productAcceptorUserId, name: detail.productAcceptorUserName }]
                  : undefined}
                onPick={items => {
                  const picked = items[0]
                  if (picked) pickedNames.current.productAcceptorUserId = picked.name
                }}
              />
            </Form.Item>
            <Form.Item
              name="bizAcceptorUserId"
              label="業務驗收人"
              tooltip="默認為需求提出人"
              getValueProps={(v?: number) => ({ value: v == null ? [] : [v] })}
              normalize={(picked?: number[]) => picked?.[0]}
            >
              <EmployeeSelect
                single
                placeholder={t('rdm.deliveryItem.bizAcceptorPlaceholder')}
                seed={detail?.bizAcceptorUserId && detail?.bizAcceptorUserName
                  ? [{ id: detail.bizAcceptorUserId, name: detail.bizAcceptorUserName }]
                  : undefined}
                onPick={items => {
                  const picked = items[0]
                  if (picked) pickedNames.current.bizAcceptorUserId = picked.name
                }}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="acceptancePath"
            label={
              <Space size={4}>
                驗收路徑
                <HelpPopover
                  title="驗收路徑說明"
                  ariaLabel="驗收路徑說明"
                  content={PATH_HELP_SECTIONS}
                  placement="bottomLeft"
                  width={420}
                />
              </Space>
            }
            rules={[{ required: true, message: '請選擇驗收路徑' }]}
          >
            <Radio.Group>
              <Radio value="A">路徑 A（先驗收後上線）</Radio>
              <Radio value="B">路徑 B（先上線後驗收）</Radio>
            </Radio.Group>
          </Form.Item>
        </div>

        {/* Section 3：計劃 */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}>
              <CheckCircleOutlined />
            </span>
            計劃時間
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="planStartDate"
              label="計劃開始日期"
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const end = getFieldValue('planEndDate')
                    if (!value || !end || value.isBefore(end) || value.isSame(end)) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('開始日期不能晚於結束日期'))
                  },
                }),
              ]}
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇開始日期" />
            </Form.Item>
            <Form.Item
              name="planEndDate"
              label="計劃結束日期"
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('planStartDate')
                    if (!value || !start || value.isAfter(start) || value.isSame(start)) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('結束日期不能早於開始日期'))
                  },
                }),
              ]}
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇結束日期" />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* ── 底部操作按鈕 ── */}
      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={submitting}
          onClick={handleSubmit}
        >
          保存
        </Button>
      </div>
    </div>
  )
}
