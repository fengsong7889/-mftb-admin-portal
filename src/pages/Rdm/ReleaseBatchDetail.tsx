/**
 * 發布批次詳情 —— 部署進度、驗證、回滾
 *
 * 变更影响：前端（新增完整详情页）
 * 安全边界：仅前端展示层，操作通过后端 API 执行
 * 测试计划：详情加载、部署/验证/回滚弹窗提交
 * 回滚方案：恢复占位组件
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Col, Descriptions, Form, Input, Modal,
  Progress, Radio, Row, Space, Spin, Table, Tag, Timeline, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  CloudUploadOutlined, ExclamationCircleOutlined, LoadingOutlined,
  ReloadOutlined, RocketOutlined, RollbackOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import HelpPopover from '../../components/HelpPopover'
import {
  fetchReleaseBatchDetail,
  checkReleaseBatch,
  applyReleaseBatch,
  decideReleaseBatch,
  submitReleaseDeployment,
  submitReleaseVerification,
  rollbackReleaseBatch,
  type RdmReleaseBatchDetail as RdmReleaseBatchDetailType,
  type RdmReleaseCheckResult,
  type RdmReleaseDeploymentRecord,
} from '../../api/rdm'
import {
  RDM_RELEASE_BATCH_STATUS,
  RDM_RELEASE_BATCH_STATUS_COLOR,
  RDM_RELEASE_BATCH_STATUS_LABEL,
  RDM_DEPLOY_STATUS_COLOR,
  RDM_DEPLOY_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

/** 验证状态标签色 */
const VERIFY_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待驗證', color: 'default' },
  passed: { label: '已通過', color: 'success' },
  failed: { label: '未通過', color: 'error' },
}

/** 开放状态标签色 */
const OPEN_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待開放', color: 'default' },
  opened: { label: '已開放', color: 'success' },
  not_opened: { label: '未開放', color: 'warning' },
}

/** 检查类型标签 */
const CHECK_TYPE_LABEL: Record<string, string> = {
  test_passed: '測試通過',
  product_acceptance: '產品驗收',
  business_acceptance: '業務驗收(路徑A)',
  critical_defect: '嚴重缺陷',
  dependency_check: '依賴檢查',
  scope_consistency: '範圍一致性',
}

export default function ReleaseBatchDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const batchId = Number(searchParams.get('id')) || 0

  // ===== 页面状态 =====
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RdmReleaseBatchDetailType | null>(null)
  const [checkResults, setCheckResults] = useState<RdmReleaseCheckResult[]>([])
  const [checking, setChecking] = useState(false)

  // ===== 弹窗状态 =====
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [verifyModalOpen, setVerifyModalOpen] = useState(false)
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false)
  const [decideModalOpen, setDecideModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [deployForm] = Form.useForm()
  const [verifyForm] = Form.useForm()
  const [rollbackForm] = Form.useForm()
  const [decideForm] = Form.useForm()

  // ===== 数据加载 =====
  const loadDetail = useCallback(async () => {
    if (!batchId) { setError('缺少批次 ID'); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchReleaseBatchDetail(batchId)
      setDetail(data)
      setCheckResults(data.checkResults ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '發布批次詳情載入失敗')
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => { loadDetail() }, [loadDetail])

  // ===== 操作 =====
  const handleCheck = async () => {
    setChecking(true)
    try {
      const results = await checkReleaseBatch(batchId)
      setCheckResults(results)
      message.success('檢查完成')
      loadDetail()
    } catch {
      message.error('執行檢查失敗')
    } finally {
      setChecking(false)
    }
  }

  const handleApply = async () => {
    try {
      await applyReleaseBatch(batchId)
      message.success('已提交發布申請')
      loadDetail()
    } catch {
      message.error('申請發布失敗')
    }
  }

  const handleDecideSubmit = async () => {
    try {
      const values = await decideForm.validateFields()
      setSubmitting(true)
      await decideReleaseBatch(batchId, { decision: values.decision, reason: values.reason })
      message.success(values.decision === 'approve' ? '已批准發布' : '已拒絕發布')
      setDecideModalOpen(false)
      decideForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('審批操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeploySubmit = async () => {
    try {
      const values = await deployForm.validateFields()
      setSubmitting(true)
      await submitReleaseDeployment(batchId, {
        systemCode: values.systemCode,
        deployStatus: values.deployStatus,
        buildId: values.buildId,
      })
      message.success('部署結果已記錄')
      setDeployModalOpen(false)
      deployForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('記錄部署結果失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifySubmit = async () => {
    try {
      const values = await verifyForm.validateFields()
      setSubmitting(true)
      await submitReleaseVerification(batchId, {
        systemCode: values.systemCode,
        verifyStatus: values.verifyStatus,
        remark: values.remark,
      })
      message.success('驗證結果已記錄')
      setVerifyModalOpen(false)
      verifyForm.resetFields()
      loadDetail()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('記錄驗證結果失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRollbackSubmit = async () => {
    try {
      const values = await rollbackForm.validateFields()
      Modal.confirm({
        title: '二次確認',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: '回滾是不可逆操作，確認要執行回滾嗎？',
        okText: '確認回滾',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          setSubmitting(true)
          try {
            await rollbackReleaseBatch(batchId, {
              reason: values.reason,
              systemCodes: values.systemCodes?.length ? values.systemCodes : undefined,
            })
            message.success('回滾已執行')
            setRollbackModalOpen(false)
            rollbackForm.resetFields()
            loadDetail()
          } catch {
            // request.ts 已统一弹后端返回的失败原因（回滚常被四眼/门禁拦下），再弹一次就是双弹
          } finally {
            setSubmitting(false)
          }
        },
      })
    } catch { /* validation error */ }
  }

  // ===== 部署表格列 =====
  const deployColumns: TableColumnsType<RdmReleaseDeploymentRecord> = useMemo(() => {
    const cols: TableColumnsType<RdmReleaseDeploymentRecord> = [
      { title: '順序', dataIndex: 'deployOrder', key: 'order', width: 60, render: (v: number) => v ?? '-' },
      { title: '系統編碼', dataIndex: 'systemCode', key: 'code', width: 130 },
      { title: '系統名稱', dataIndex: 'systemName', key: 'name', width: 140, render: (v?: string) => v || '-' },
      { title: '構建標識', dataIndex: 'buildId', key: 'buildId', width: 130, render: (v?: string) => v || '-' },
      {
        title: '部署狀態', dataIndex: 'deployStatus', key: 'deployStatus', width: 100,
        render: (v: string) => <Tag color={RDM_DEPLOY_STATUS_COLOR[v] ?? 'default'}>{RDM_DEPLOY_STATUS_LABEL[v] ?? v}</Tag>,
      },
      {
        title: '部署時間', dataIndex: 'deployTime', key: 'deployTime', width: 150,
        render: (v?: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
      },
      {
        title: '驗證狀態', dataIndex: 'verifyStatus', key: 'verifyStatus', width: 90,
        render: (v: string) => {
          const m = VERIFY_STATUS_MAP[v]
          return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>待驗證</Tag>
        },
      },
      {
        title: '驗證時間', dataIndex: 'verifyTime', key: 'verifyTime', width: 150,
        render: (v?: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
      },
      {
        title: '開放狀態', dataIndex: 'openStatus', key: 'openStatus', width: 90,
        render: (v: string) => {
          const m = OPEN_STATUS_MAP[v]
          return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>待開放</Tag>
        },
      },
      { title: '操作人', dataIndex: 'operatorUserName', key: 'operator', width: 100, render: (v?: string) => v || '-' },
    ]
    // 根据批次状态添加操作列
    const s = detail?.status
    if (s === RDM_RELEASE_BATCH_STATUS.DEPLOYING) {
      cols.push({
        title: '操作', key: 'action', width: 120, fixed: 'right',
        render: (_, r) => (
          <Button type="link" size="small" onClick={() => {
            deployForm.setFieldsValue({ systemCode: r.systemCode })
            setDeployModalOpen(true)
          }}>記錄部署</Button>
        ),
      })
    } else if (s === RDM_RELEASE_BATCH_STATUS.VERIFYING) {
      cols.push({
        title: '操作', key: 'action', width: 120, fixed: 'right',
        render: (_, r) => (
          <Button type="link" size="small" onClick={() => {
            verifyForm.setFieldsValue({ systemCode: r.systemCode })
            setVerifyModalOpen(true)
          }}>記錄驗證</Button>
        ),
      })
    }
    return cols
  }, [detail?.status, deployForm, verifyForm])

  // ===== 时间线事件 =====
  const timelineItems = useMemo(() => {
    if (!detail) return []
    const items: { color: string; children: React.ReactNode }[] = []

    items.push({
      color: 'blue',
      children: (
        <div>
          <strong>創建批次</strong>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.applicantUserName || '-'} · {detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</div>
        </div>
      ),
    })

    if (checkResults.length > 0) {
      const passed = checkResults.filter(c => c.passed).length
      const totalChecks = checkResults.length
      items.push({
        color: passed === totalChecks ? 'green' : 'red',
        children: (
          <div>
            <strong>放行檢查</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              {passed === totalChecks ? '全部通過' : `${totalChecks - passed} 項未通過`}
            </div>
          </div>
        ),
      })
    }

    if (detail.applicantUserName && detail.status !== RDM_RELEASE_BATCH_STATUS.PLANNING) {
      items.push({
        color: 'blue',
        children: (
          <div>
            <strong>申請發布</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.applicantUserName}</div>
          </div>
        ),
      })
    }

    if (detail.approvalUserName && detail.approvalTime) {
      const isApproved = detail.status !== RDM_RELEASE_BATCH_STATUS.ROLLED_BACK
      items.push({
        color: isApproved ? 'green' : 'red',
        children: (
          <div>
            <strong>{isApproved ? '審批通過' : '審批拒絕'}</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.approvalUserName} · {dayjs(detail.approvalTime).format('YYYY-MM-DD HH:mm')}</div>
          </div>
        ),
      })
    }

    // 部署事件
    if (detail.deployments?.length) {
      detail.deployments.forEach(dep => {
        if (dep.deployTime) {
          items.push({
            color: dep.deployStatus === 'success' ? 'green' : dep.deployStatus === 'failed' ? 'red' : 'blue',
            children: (
              <div>
                <strong>部署 {dep.systemName || dep.systemCode}</strong>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                  {RDM_DEPLOY_STATUS_LABEL[dep.deployStatus] ?? dep.deployStatus} · {dayjs(dep.deployTime).format('MM-DD HH:mm')}
                  {dep.operatorUserName ? ` · ${dep.operatorUserName}` : ''}
                </div>
              </div>
            ),
          })
        }
        if (dep.verifyTime) {
          items.push({
            color: dep.verifyStatus === 'passed' ? 'green' : dep.verifyStatus === 'failed' ? 'red' : 'blue',
            children: (
              <div>
                <strong>驗證 {dep.systemName || dep.systemCode}</strong>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                  {VERIFY_STATUS_MAP[dep.verifyStatus]?.label ?? dep.verifyStatus} · {dayjs(dep.verifyTime).format('MM-DD HH:mm')}
                </div>
              </div>
            ),
          })
        }
      })
    }

    if (detail.status === RDM_RELEASE_BATCH_STATUS.RELEASED) {
      items.push({
        color: 'green',
        children: <div><strong>發布完成</strong><div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : ''}</div></div>,
      })
    }

    if (detail.status === RDM_RELEASE_BATCH_STATUS.ROLLED_BACK) {
      items.push({
        color: 'red',
        children: (
          <div>
            <strong>已回滾</strong>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.rollbackReason || ''} · {detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : ''}</div>
          </div>
        ),
      })
    }

    return items
  }, [detail, checkResults])

  // ===== 渲染 =====
  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" tip="載入中..." /></div>
  }

  if (error || !detail) {
    return (
      <div className="content-area">
        <Alert type="error" showIcon message="載入失敗" description={error || '未找到發布批次'} style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={loadDetail}>重試</Button>} />
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>
    )
  }

  const s = detail.status
  const deployedSystems = detail.deployments?.filter(d => d.deployStatus === 'success') ?? []

  return (
    <div className="content-area">
      <RdmFormHeader
        title={`發布批次 ${detail.batchNo}`}
        onBack={() => navigate(-1)}
        badge={<Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[s] ?? 'default'}>{RDM_RELEASE_BATCH_STATUS_LABEL[s] ?? s}</Tag>}
        right={
          <Space>
            {(s === RDM_RELEASE_BATCH_STATUS.PLANNING || s === RDM_RELEASE_BATCH_STATUS.CHECKING) && (
              <>
                <Button icon={<SafetyCertificateOutlined />} loading={checking} onClick={handleCheck}>執行檢查</Button>
                <Button type="primary" icon={<RocketOutlined />} onClick={handleApply}>申請發布</Button>
              </>
            )}
            {s === RDM_RELEASE_BATCH_STATUS.APPROVED && (
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setDeployModalOpen(true)}>開始部署</Button>
            )}
            {s === RDM_RELEASE_BATCH_STATUS.DEPLOYING && (
              <>
                <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setDeployModalOpen(true)}>記錄部署</Button>
                <Button danger icon={<RollbackOutlined />} onClick={() => setRollbackModalOpen(true)}>回滾</Button>
              </>
            )}
            {s === RDM_RELEASE_BATCH_STATUS.VERIFYING && (
              <>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setVerifyModalOpen(true)}>生產驗證</Button>
                <Button danger icon={<RollbackOutlined />} onClick={() => setRollbackModalOpen(true)}>回滾</Button>
              </>
            )}
            {s === RDM_RELEASE_BATCH_STATUS.RELEASED && (
              <Button danger icon={<RollbackOutlined />} onClick={() => setRollbackModalOpen(true)}>回滾</Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={loadDetail}>刷新</Button>
          </Space>
        }
      />

      {/* ===== Section 1: 批次摘要 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title"><ClockCircleOutlined style={{ marginRight: 6 }} />批次摘要</h3>
        <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small" bordered>
          <Descriptions.Item label="批次號">{detail.batchNo}</Descriptions.Item>
          <Descriptions.Item label="版本標識"><strong>{detail.versionTag}</strong></Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={RDM_RELEASE_BATCH_STATUS_COLOR[s] ?? 'default'}>{RDM_RELEASE_BATCH_STATUS_LABEL[s] ?? s}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="計劃時間">{detail.planTime ? dayjs(detail.planTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="發布負責人">{detail.releaseOwnerUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="申請人">{detail.applicantUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="審批人">{detail.approvalUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="審批時間">{detail.approvalTime ? dayjs(detail.approvalTime).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="關聯項目" span={2}>
            {detail.projectName ? (
              <a onClick={() => navigate(`/rdm-project-detail?id=${(detail as unknown as { projectId?: number }).projectId ?? ''}`)}>
                {detail.projectName}
              </a>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="創建時間">{detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新時間">{detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
        </Descriptions>
        {s === RDM_RELEASE_BATCH_STATUS.ROLLED_BACK && detail.rollbackReason && (
          <Alert type="error" showIcon style={{ marginTop: 12 }} message={`回滾原因：${detail.rollbackReason}`} />
        )}
      </div>

      {/* ===== Section 2: 放行檢查 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title">
          <SafetyCertificateOutlined style={{ marginRight: 6 }} />放行檢查
          <HelpPopover
            title="放行檢查項說明"
            ariaLabel="放行檢查項說明"
            content={[
              { tone: 'info', label: '測試通過', body: '關聯交付項的提測批次是否全部通過' },
              { tone: 'info', label: '產品驗收', body: '產品經理是否已確認交付項驗收通過' },
              { tone: 'warn', label: '業務驗收(路徑A)', body: '路徑A交付項需在上線前完成業務驗收' },
              { tone: 'danger', label: '嚴重缺陷', body: '是否存在致命/嚴重級別未解決缺陷' },
              { tone: 'neutral', label: '依賴檢查', body: '部署系統間的依賴順序是否滿足' },
              { tone: 'neutral', label: '範圍一致性', body: '發布範圍是否與立項時的計劃一致' },
            ]}
          />
        </h3>
        {checkResults.length > 0 ? (
          <>
            {checkResults.every(c => c.passed) ? (
              <Alert type="success" showIcon message="全部通過" description="所有檢查項均已通過，可以申請發布" style={{ marginBottom: 12 }} />
            ) : (
              <Alert type="error" showIcon
                message={`${checkResults.filter(c => !c.passed).length} 項未通過`}
                description="存在未通過的檢查項，請處理後重新檢查"
                style={{ marginBottom: 12 }}
              />
            )}
            <div className="rdm-release-checklist">
              {checkResults.map((item, idx) => (
                <div key={idx} className={`rdm-release-check-item ${item.passed ? 'passed' : 'failed'}`}>
                  <span className="rdm-release-check-icon">
                    {item.passed
                      ? <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 16 }} />
                      : <CloseCircleOutlined style={{ color: '#FF4D4F', fontSize: 16 }} />}
                  </span>
                  <span className="rdm-release-check-type">{CHECK_TYPE_LABEL[item.checkType] ?? item.checkType}</span>
                  <span className="rdm-release-check-msg">{item.message || '-'}</span>
                </div>
              ))}
            </div>
            {(s === RDM_RELEASE_BATCH_STATUS.PLANNING || s === RDM_RELEASE_BATCH_STATUS.CHECKING) && (
              <Button icon={<ReloadOutlined />} loading={checking} onClick={handleCheck} style={{ marginTop: 12 }}>重新檢查</Button>
            )}
          </>
        ) : (
          <Alert type="info" showIcon message="尚未執行檢查" description="請點擊「執行檢查」按鈕啟動放行檢查" style={{ marginBottom: 12 }} />
        )}
      </div>

      {/* ===== Section 3: 系統部署 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title"><CloudUploadOutlined style={{ marginRight: 6 }} />系統部署</h3>
        {detail.deployments?.length > 0 ? (
          <Table<RdmReleaseDeploymentRecord>
            className="nowrap-table"
            rowKey="id"
            columns={deployColumns}
            dataSource={detail.deployments}
            pagination={false}
            size="small"
            scroll={{ x: deployColumns.reduce((sum, c) => sum + Number((c as { width?: number }).width ?? 100), 0) }}
          />
        ) : (
          <Alert type="info" showIcon message="尚無部署系統記錄" />
        )}
      </div>

      {/* ===== Section 4: 操作時間線 ===== */}
      <div className="rdm-release-section">
        <h3 className="rdm-release-section-title"><ClockCircleOutlined style={{ marginRight: 6 }} />操作時間線</h3>
        {timelineItems.length > 0 ? (
          <Timeline items={timelineItems} />
        ) : (
          <Alert type="info" showIcon message="暫無操作記錄" />
        )}
      </div>

      {/* ===== 部署結果 Modal ===== */}
      <Modal
        title="記錄部署結果"
        open={deployModalOpen}
        onCancel={() => { setDeployModalOpen(false); deployForm.resetFields() }}
        onOk={handleDeploySubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={deployForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="systemCode" label="系統" rules={[{ required: true, message: '請選擇系統' }]}>
            <Input placeholder="系統編碼" />
          </Form.Item>
          <Form.Item name="deployStatus" label="部署狀態" rules={[{ required: true, message: '請選擇部署狀態' }]}>
            <Radio.Group>
              <Radio value="success">成功</Radio>
              <Radio value="failed">失敗</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="buildId" label="構建標識">
            <Input placeholder="可選，如 build-20241015-001" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 驗證結果 Modal ===== */}
      <Modal
        title="記錄驗證結果"
        open={verifyModalOpen}
        onCancel={() => { setVerifyModalOpen(false); verifyForm.resetFields() }}
        onOk={handleVerifySubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={verifyForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="systemCode" label="系統" rules={[{ required: true, message: '請選擇系統' }]}>
            <Input placeholder="系統編碼" />
          </Form.Item>
          <Form.Item name="verifyStatus" label="驗證結果" rules={[{ required: true, message: '請選擇驗證結果' }]}>
            <Radio.Group>
              <Radio value="passed">通過</Radio>
              <Radio value="failed">未通過</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="remark" label="備註">
            <Input.TextArea rows={3} placeholder="可選，記錄驗證過程中的關鍵信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 回滾 Modal ===== */}
      <Modal
        title={<span style={{ color: '#FF4D4F' }}><RollbackOutlined style={{ marginRight: 8 }} />回滾發布批次</span>}
        open={rollbackModalOpen}
        onCancel={() => { setRollbackModalOpen(false); rollbackForm.resetFields() }}
        onOk={handleRollbackSubmit}
        confirmLoading={submitting}
        okText="確認回滾"
        okType="danger"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />}
          message="回滾是不可逆操作，將影響已部署的系統"
          description="請確認所有相關人員已知曉回滾計劃"
          style={{ marginBottom: 16 }}
        />
        <Form form={rollbackForm} layout="vertical">
          <Form.Item name="reason" label="回滾原因" rules={[{ required: true, message: '請填寫回滾原因' }]}>
            <Input.TextArea rows={3} placeholder="請詳細說明回滾原因" />
          </Form.Item>
          <Form.Item name="systemCodes" label="回滾系統（不選則回滾全部已部署系統）">
            <Checkbox.Group>
              <Row>
                {deployedSystems.map(sys => (
                  <Col span={12} key={sys.systemCode}>
                    <Checkbox value={sys.systemCode}>{sys.systemName || sys.systemCode}</Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 審批決定 Modal ===== */}
      <Modal
        title="審批發布申請"
        open={decideModalOpen}
        onCancel={() => { setDecideModalOpen(false); decideForm.resetFields() }}
        onOk={handleDecideSubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Alert type="info" showIcon message="四眼原則：審批人不能是申請人" style={{ marginBottom: 16 }} />
        <Form form={decideForm} layout="vertical">
          <Form.Item name="decision" label="決定" rules={[{ required: true, message: '請選擇決定' }]}>
            <Radio.Group>
              <Radio value="approve">批准</Radio>
              <Radio value="reject">拒絕</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} placeholder="拒絕時必填原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
