/**
 * 人員主檔新增 / 編輯 / 詳情（/hcm-person-form 与 /hcm-person-detail）
 *
 * 三個關鍵點：
 * 1. 賬號映射是可選項——無賬號人員照樣能建檔（方案 5.1），不要強迫先開戶；
 * 2. 出生日期屬敏感字段，只在有編輯權時可填，詳情頁按字段權限留空處理；
 * 3. 詳情頁只讀展示雇傭關係（C2 已落庫），雇傭/任職的維護入口隨下一批交付。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SaveOutlined, IdcardOutlined, SafetyCertificateOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  createPerson,
  getPerson,
  listAssignments,
  listEmployments,
  terminateEmployment,
  updatePerson,
  type HrAssignment,
  type HrEmployment,
  type Person,
} from '../../../api/hcmPerson'
import { CardTitle, FormHeader, UpdatedFooter, cardStyle, formatTimestamp, grid3 } from '../Organization/shared'

export default function HcmPersonForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isDetail = window.location.hash.includes('/hcm-person-detail')
  const isEdit = !!id && !isDetail

  const [form] = Form.useForm<Person>()
  const [saving, setSaving] = useState(false)
  const [updatedBy, setUpdatedBy] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [employments, setEmployments] = useState<HrEmployment[]>([])
  // 任职按雇佣懒加载：展开某段雇佣才取它的任职，避免一进详情就把所有任职拉回来
  const [assignments, setAssignments] = useState<Record<number, HrAssignment[]>>({})

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getPerson(id)
    // 后端 LocalDate 可能序列化成 [y,m,d] / 毫秒 / 'yyyy-MM-dd' 三种形态，统一转成 dayjs 再喂给日期控件
    const rawBirth = detail.birthDate as unknown
    let birthValue: dayjs.Dayjs | undefined
    if (Array.isArray(rawBirth)) {
      birthValue = dayjs(new Date(rawBirth[0], rawBirth[1] - 1, rawBirth[2]))
    } else if (typeof rawBirth === 'number') {
      birthValue = dayjs(rawBirth)
    } else if (typeof rawBirth === 'string' && rawBirth) {
      birthValue = dayjs(rawBirth)
    }
    form.setFieldsValue({ ...detail, birthDate: birthValue as unknown as string })
    setUpdatedBy(detail.updatedBy ?? '')
    setUpdatedAt(formatTimestamp(detail.updatedAt))
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!id) return
    listEmployments(id, { page: 1, size: 50 })
      .then((res) => setEmployments(res.records ?? []))
      .catch(() => setEmployments([]))
  }, [id])

  const loadAssignments = useCallback(async (employmentId: number) => {
    try {
      const res = await listAssignments(employmentId, { page: 1, size: 50 })
      setAssignments((prev) => ({ ...prev, [employmentId]: res.records ?? [] }))
    } catch {
      setAssignments((prev) => ({ ...prev, [employmentId]: [] }))
    }
  }, [])

  const handleTerminate = (record: HrEmployment) => {
    const today = dayjs().format('YYYY-MM-DD')
    Modal.confirm({
      title: t('hcmPerson.terminateConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmPerson.employmentNo')}：</span><b>{record.employmentNo || '-'}</b></div>
          <div className="confirm-info-row"><span>{t('hcmPerson.endDate')}：</span><b>{today}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await terminateEmployment(record.id as number, today)
        message.success(t('hcmPerson.terminateSuccess'))
        if (id) {
          const res = await listEmployments(id, { page: 1, size: 50 })
          setEmployments(res.records ?? [])
        }
      },
    })
  }

  // 出生日期用日期控件，但后端实体是 LocalDate（yyyy-MM-dd 字符串），提交前转格式
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: Person = {
      ...values,
      birthDate: values.birthDate ? dayjs(values.birthDate as unknown as string).format('YYYY-MM-DD') : null,
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await updatePerson(id, payload)
      } else {
        await createPerson(payload)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-person')
    } finally {
      setSaving(false)
    }
  }

  const title = isDetail
    ? t('hcmPerson.detailTitle')
    : isEdit ? t('hcmPerson.editTitle') : t('hcmPerson.addTitle')

  const employmentColumns: ColumnsType<HrEmployment> = [
    { key: 'employmentNo', title: t('hcmPerson.employmentNo'), dataIndex: 'employmentNo', width: 150,
      render: (v: string) => v || '-' },
    { key: 'employmentType', title: t('hcmPerson.employmentType'), dataIndex: 'employmentType', width: 120 },
    { key: 'jurisdiction', title: t('hcmOrg.legal.jurisdiction'), dataIndex: 'jurisdiction', width: 100 },
    { key: 'startDate', title: t('hcmPerson.startDate'), dataIndex: 'startDate', width: 130 },
    { key: 'endDate', title: t('hcmPerson.endDate'), dataIndex: 'endDate', width: 130,
      render: (v: string) => v || t('hcmPerson.openEnded') },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmPerson.active')}</Tag>
        : <Tag color="default">{t('hcmPerson.terminated')}</Tag>),
    },
    {
      key: 'action', title: t('common.action'), width: 190,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-person-employment-form?id=${record.id}&personId=${id}`)}>
            {t('common.edit')}
          </Button>
          <Button
            type="link" size="small"
            disabled={record.status !== 1 || !!record.endDate}
            onClick={() => handleTerminate(record)}
          >
            {t('hcmPerson.terminate')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <FormHeader
        title={title}
        onBack={() => navigate('/hcm-person')}
        extra={isDetail && id ? <Tag color="blue">ID {id}</Tag> : undefined}
      />

      <Form form={form} layout="vertical" disabled={isDetail} initialValues={{ status: 1 }}>
        <div style={cardStyle}>
          <CardTitle icon={<IdcardOutlined />} title={t('hcmPerson.basicInfo')} />
          <div style={grid3}>
            <Form.Item name="personNo" label={t('hcmPerson.personNo')}>
              <Input maxLength={32} placeholder={t('hcmPerson.personNoPlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('hcmPerson.name')} rules={[{ required: true, message: t('hcmPerson.nameRequired') }]}>
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hcmPerson.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="gender" label={t('hcmPerson.gender')}>
              <Select allowClear options={[
                { value: 'M', label: t('hcmPerson.male') },
                { value: 'F', label: t('hcmPerson.female') },
                { value: 'UNKNOWN', label: t('hcmPerson.unknown') },
              ]} />
            </Form.Item>
            <Form.Item name="birthDate" label={t('hcmPerson.birthDate')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="nationality" label={t('hcmPerson.nationality')}>
              <Input maxLength={8} placeholder={t('hcmPerson.nationalityPlaceholder')} />
            </Form.Item>
            <Form.Item name="mobile" label={t('hcmPerson.mobile')}>
              <Input maxLength={32} />
            </Form.Item>
            <Form.Item name="email" label={t('hcmPerson.email')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<SafetyCertificateOutlined />} title={t('hcmPerson.accountSection')} tone="orange" />
          <div style={grid3}>
            <Form.Item name="sysUserId" label={t('hcmPerson.sysUserId')}>
              <Input type="number" placeholder={t('hcmPerson.sysUserIdPlaceholder')} />
            </Form.Item>
            <Form.Item
              name="status"
              label={t('hcmOrg.status')}
              valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}
            >
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
            {t('hcmPerson.accountHint')}
          </div>
        </div>
      </Form>

      {isDetail && (
        <div style={cardStyle}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('hcmPerson.lifecycleNotice')}
          />
          <CardTitle
            icon={<IdcardOutlined />}
            title={t('hcmPerson.employmentSection')}
            extra={(
              <Space size={8}>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('hcmPerson.employmentPhaseHint')}</span>
                <Button
                  type="primary" size="small" icon={<PlusOutlined />}
                  onClick={() => navigate(`/hcm-person-employment-form?personId=${id}`)}
                >
                  {t('hcmPerson.addEmployment')}
                </Button>
              </Space>
            )}
          />
          <Table<HrEmployment>
            rowKey="id"
            size="small"
            columns={employmentColumns}
            dataSource={employments}
            pagination={false}
            locale={{ emptyText: t('hcmPerson.employmentEmpty') }}
            expandable={{
              onExpand: (expanded, record) => {
                if (expanded) void loadAssignments(record.id as number)
              },
              expandedRowRender: (record) => (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <Button
                      size="small" icon={<PlusOutlined />}
                      onClick={() => navigate(`/hcm-person-assignment-form?employmentId=${record.id}&personId=${id}&legalEntityId=${record.legalEntityId}`)}
                    >
                      {t('hcmPerson.addAssignment')}
                    </Button>
                  </div>
                  <Table<HrAssignment>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={assignments[record.id as number] ?? []}
                    locale={{ emptyText: t('hcmPerson.assignmentEmpty') }}
                    columns={[
                      { key: 'effectiveFrom', title: t('hcmPerson.effectiveFrom'), dataIndex: 'effectiveFrom', width: 130 },
                      { key: 'effectiveTo', title: t('hcmPerson.effectiveTo'), dataIndex: 'effectiveTo', width: 130,
                        render: (v: string) => v || t('hcmPerson.openEnded') },
                      { key: 'unitId', title: t('hcmOrg.position.unit'), dataIndex: 'unitId', width: 100 },
                      { key: 'positionId', title: t('hcmOrg.position.jobGrade'), dataIndex: 'positionId', width: 120,
                        render: (v: number) => v || '-' },
                      { key: 'fte', title: t('hcmPerson.fte'), dataIndex: 'fte', width: 90 },
                      { key: 'seqNo', title: t('hcmPerson.seqNo'), dataIndex: 'seqNo', width: 90 },
                      { key: 'primaryFlag', title: t('hcmPerson.primaryFlag'), dataIndex: 'primaryFlag', width: 110,
                        render: (v: number) => (v === 1
                          ? <Tag color="blue">{t('hcmPerson.primary')}</Tag>
                          : <Tag>{t('hcmPerson.secondary')}</Tag>) },
                      {
                        key: 'action', title: t('common.action'), width: 90,
                        render: (_, row) => (
                          <Button
                            type="link" size="small"
                            onClick={() => navigate(`/hcm-person-assignment-form?id=${row.id}&personId=${id}&legalEntityId=${record.legalEntityId}`)}
                          >
                            {t('common.edit')}
                          </Button>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            }}
          />
        </div>
      )}

      {isDetail && <UpdatedFooter by={updatedBy} at={updatedAt} />}

      {!isDetail && (
        <div className="form-footer">
          <Button onClick={() => navigate('/hcm-person')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
