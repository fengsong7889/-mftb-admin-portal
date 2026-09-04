import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Input, Select, Table, Tag, Form, Modal, Radio, InputNumber, message, Tooltip, DatePicker, Popover, Switch } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  SaveOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  fetchFinRiskPage,
  fetchFinAccounts,
  saveFinRiskConfig,
  saveFinRiskStatus,
} from '../../api/finance'
import type { FinRiskRow, FinAccount } from '../../api/finance'

const { RangePicker } = DatePicker

/** 格式化金額（千分位 + 兩位小數） */
const fmtAmt = (val: number) =>
  val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 比例小數 → 百分比展示（如 0.1 → 10%） */
const fmtRatio = (ratio?: number | null) => {
  if (ratio == null) return '--'
  const pct = Math.round(Number(ratio) * 10000) / 100
  return `${pct}%`
}

/** 賬戶狀態展示映射（與賬戶餘額菜單同步，label 為 i18n key） */
const accountStatusMeta: Record<string, { labelKey: string; color: string }> = {
  normal: { labelKey: 'accountBalance.statusNormal', color: 'green' },
  frozen: { labelKey: 'accountBalance.statusFrozen', color: 'red' },
  mergeFrozen: { labelKey: 'accountBalance.statusMergeFrozen', color: 'orange' },
  cancelled: { labelKey: 'accountBalance.statusCancelled', color: 'default' },
}

/** 風控模式展示映射 */
const modeMeta: Record<string, { labelKey: string; color: string }> = {
  repay: { labelKey: 'consumeRisk.releaseRepayName', color: 'processing' },
  monthly: { labelKey: 'consumeRisk.releaseMonthlyName', color: 'purple' },
}

/** 搜索篩選條件 */
interface RiskFilters {
  groupId?: string
  groupName?: string
  brand?: string
  releaseMode?: string
  accountStatus?: string
  updatedBy?: string
  updatedRange?: [Dayjs, Dayjs]
}

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 風控配置彈窗表單值（新增/編輯共用） */
interface RiskConfigFormValues {
  groupKey?: string
  releaseMode?: string
  /** 每月釋放比例（百分比，如 10 = 10%/月） */
  monthlyReleaseRatioPercent?: number
  remark?: string
}

/** 彈窗狀態：新增 / 編輯 */
type ModalState = { mode: 'add' } | { mode: 'edit'; row: FinRiskRow } | null

export default function ConsumeRisk() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()

  const [form] = Form.useForm<RiskFilters>()
  const [configForm] = Form.useForm<RiskConfigFormValues>()

  const [filters, setFilters] = useState<RiskFilters>({})
  const [data, setData] = useState<FinRiskRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 配置彈窗 */
  const [modalState, setModalState] = useState<ModalState>(null)
  const [configSaving, setConfigSaving] = useState(false)
  /** 新增彈窗的集團×品牌候選（推廣金賬戶列表） */
  const [accountOptions, setAccountOptions] = useState<FinAccount[]>([])
  const releaseMode = Form.useWatch('releaseMode', configForm)

  /** 風控模式選項（與新增/編輯彈窗一致） */
  const releaseModeOptions = [
    { label: t('consumeRisk.releaseRepayName'), value: 'repay' },
    { label: t('consumeRisk.releaseMonthlyName'), value: 'monthly' },
  ]

  /** 賬戶狀態選項（與賬戶餘額菜單一致） */
  const accountStatusOptions = [
    { label: t('accountBalance.statusNormal'), value: 'normal' },
    { label: t('accountBalance.statusFrozen'), value: 'frozen' },
    { label: t('accountBalance.statusMergeFrozen'), value: 'mergeFrozen' },
    { label: t('accountBalance.statusCancelled'), value: 'cancelled' },
  ]

  /** 風控規則說明問號（僅 1-4 條核心規則，氣泡美化展示） */
  const modeHelpIcon = (
    <Popover
      trigger="hover"
      placement="right"
      content={
        <div style={{ width: 380 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: '8px 8px 0 0',
            background: 'linear-gradient(135deg, #E8720C, #F59432)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            boxShadow: '0 2px 6px rgba(232,114,12,0.3)',
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 15 }} />
            {t('consumeRisk.helpTitle')}
          </div>
          <div style={{
            padding: '12px 14px', background: '#FFF7E6',
            borderRadius: '0 0 8px 8px', border: '1px solid #FFD591', borderTop: 'none',
          }}>
            {[
              t('consumeRisk.fullPayReminder'),
              t('consumeRisk.poolRuleDesc'),
              t('consumeRisk.releaseRepay'),
              t('consumeRisk.releaseMonthly') + t('consumeRisk.ratioTip'),
            ].map((text, i, arr) => (
              <div key={i} style={{
                display: 'flex', gap: 8, marginBottom: i < arr.length - 1 ? 10 : 0,
                fontSize: 12, lineHeight: 1.8, color: '#595959',
              }}>
                <span style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #E8720C, #FFB347)', color: '#fff',
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 2,
                }}>{i + 1}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
    </Popover>
  )

  /** 加載列表 */
  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchFinRiskPage({
        page: pagination.page,
        size: pagination.size,
        groupId: filters.groupId?.trim() || undefined,
        groupName: filters.groupName?.trim() || undefined,
        brand: pickValue(filters.brand),
        releaseMode: pickValue(filters.releaseMode),
        accountStatus: pickValue(filters.accountStatus),
        updatedBy: filters.updatedBy?.trim() || undefined,
        updatedFrom: filters.updatedRange?.[0]?.format('YYYY-MM-DD'),
        updatedTo: filters.updatedRange?.[1]?.format('YYYY-MM-DD'),
      })
      setData(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : t('consumeRisk.loadFailed'))
      setData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, pagination, t])

  useEffect(() => {
    void loadList()
  }, [loadList])

  /** 查詢 */
  const handleSearch = () => {
    setFilters(form.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
  }

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    setFilters({})
    setPagination({ page: 1, size: 10 })
  }

  /** 打開新增彈窗（加載集團×品牌候選） */
  const handleOpenAdd = async () => {
    setModalState({ mode: 'add' })
    configForm.setFieldsValue({ releaseMode: 'repay', monthlyReleaseRatioPercent: 10 })
    try {
      const res = await fetchFinAccounts({ page: 1, size: 500 })
      setAccountOptions(res.records ?? [])
    } catch {
      setAccountOptions([])
    }
  }

  /** 打開編輯彈窗（與新增彈窗字段一致） */
  const handleOpenEdit = (record: FinRiskRow) => {
    setModalState({ mode: 'edit', row: record })
    configForm.setFieldsValue({
      releaseMode: record.releaseMode || 'repay',
      monthlyReleaseRatioPercent: record.monthlyReleaseRatio != null
        ? Math.round(Number(record.monthlyReleaseRatio) * 10000) / 100
        : 10,
      remark: record.remark ?? '',
    })
  }

  /** 保存風控配置（新增/編輯） */
  const handleSaveConfig = async () => {
    if (!modalState) return
    try {
      const values = await configForm.validateFields()
      let groupId = ''
      let groupName = ''
      let brand = ''
      if (modalState.mode === 'add') {
        if (!values.groupKey) return
        const [gid, b] = values.groupKey.split('|')
        groupId = gid
        brand = b
        groupName = accountOptions.find(a => a.groupId === gid && a.brand === b)?.groupName || gid
      } else {
        groupId = modalState.row.groupId
        groupName = modalState.row.groupName
        brand = modalState.row.brand
      }
      setConfigSaving(true)
      await saveFinRiskConfig({
        groupId,
        groupName,
        brand,
        releaseMode: values.releaseMode || 'repay',
        monthlyReleaseRatio: values.releaseMode === 'monthly'
          ? Math.round((values.monthlyReleaseRatioPercent || 0) * 100) / 10000
          : null,
        remark: values.remark?.trim() || undefined,
      })
      message.success(modalState.mode === 'add' ? t('consumeRisk.addSuccess') : t('consumeRisk.saveSuccess'))
      setModalState(null)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(err instanceof Error && err.message ? err.message : t('consumeRisk.saveFailed'))
    } finally {
      setConfigSaving(false)
    }
  }

  /** 啟用/停用風控登記 */
  const handleToggleStatus = (record: FinRiskRow) => {
    const toDisable = record.status === 'enabled'
    const doUpdate = async () => {
      try {
        await saveFinRiskStatus(record.groupId, record.brand, toDisable ? 'disabled' : 'enabled')
        message.success(toDisable ? t('consumeRisk.disableSuccess') : t('consumeRisk.enableSuccess'))
        void loadList()
      } catch (err) {
        message.error(err instanceof Error && err.message ? err.message : t('consumeRisk.saveFailed'))
      }
    }
    if (toDisable) {
      Modal.confirm({
        title: t('consumeRisk.disableConfirmTitle'),
        content: t('consumeRisk.disableConfirmDesc'),
        centered: true,
        okButtonProps: { danger: true },
        onOk: doUpdate,
      })
    } else {
      void doUpdate()
    }
  }

  /** 列配置元數據 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: t('common.colIndex') },
    { key: 'groupId', title: t('common.colGroupId') },
    { key: 'groupName', title: t('common.colGroupName') },
    { key: 'brand', title: t('common.colBrand') },
    { key: 'accountStatus', title: t('consumeRisk.colAccountStatus') },
    { key: 'releaseMode', title: t('consumeRisk.modeLabel') },
    { key: 'monthlyReleaseRatio', title: t('consumeRisk.colRatio') },
    { key: 'unsettledDebt', title: t('consumeRisk.colUnsettledDebt') },
    { key: 'paidPool', title: t('consumeRisk.colPaidPool') },
    { key: 'totalConsumed', title: t('consumeRisk.colTotalConsumed') },
    { key: 'monthlyRelease', title: t('consumeRisk.colMonthlyRelease') },
    { key: 'availableAmount', title: t('consumeRisk.colAvailable') },
    { key: 'status', title: t('consumeRisk.colStatus') },
    { key: 'updatedBy', title: t('consumeRisk.colUpdatedBy') },
    { key: 'updatedAt', title: t('consumeRisk.colUpdatedAt') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('consume-risk', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<FinRiskRow> = [
    {
      title: t('common.colIndex'), key: 'index', width: 60, align: 'center', fixed: 'left',
      render: (_, __, i) => (pagination.page - 1) * pagination.size + i + 1,
    },
    { title: t('common.colGroupId'), dataIndex: 'groupId', key: 'groupId', width: 100, fixed: 'left' },
    { title: t('common.colGroupName'), dataIndex: 'groupName', key: 'groupName', width: 140, fixed: 'left' },
    {
      title: t('common.colBrand'), dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: string) => <BrandTag value={v} />,
    },
    {
      title: t('consumeRisk.colAccountStatus'), dataIndex: 'accountStatus', key: 'accountStatus', width: 100,
      render: (v: string) => {
        const meta = accountStatusMeta[v] || accountStatusMeta.normal
        return <Tag color={meta.color}>{t(meta.labelKey)}</Tag>
      },
    },
    {
      title: t('consumeRisk.modeLabel'), dataIndex: 'releaseMode', key: 'releaseMode', width: 120,
      render: (v: string) => {
        const meta = modeMeta[v] || modeMeta.repay
        return <Tag color={meta.color}>{t(meta.labelKey)}</Tag>
      },
    },
    {
      title: t('consumeRisk.colRatio'), dataIndex: 'monthlyReleaseRatio', key: 'monthlyReleaseRatio',
      width: 100, align: 'right',
      render: (v: number | null, record) => (record.releaseMode === 'monthly'
        ? <span style={{ color: '#722ED1', fontWeight: 600 }}>{fmtRatio(v)}</span>
        : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    {
      title: t('consumeRisk.colUnsettledDebt'), dataIndex: 'unsettledDebt', key: 'unsettledDebt',
      width: 130, align: 'right',
      render: (v: number) => (
        <span style={{ color: (v || 0) > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: 600 }}>{fmtAmt(v || 0)}</span>
      ),
    },
    {
      title: t('consumeRisk.colPaidPool'), dataIndex: 'paidPool', key: 'paidPool',
      width: 130, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 500 }}>{fmtAmt(v || 0)}</span>,
    },
    {
      title: t('consumeRisk.colTotalConsumed'), dataIndex: 'totalConsumed', key: 'totalConsumed',
      width: 130, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 500 }}>{fmtAmt(v || 0)}</span>,
    },
    {
      title: t('consumeRisk.colMonthlyRelease'), dataIndex: 'monthlyRelease', key: 'monthlyRelease',
      width: 120, align: 'right',
      render: (v: number) => ((v || 0) > 0 ? <span style={{ color: '#722ED1', fontWeight: 500 }}>{fmtAmt(v)}</span> : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    {
      title: t('consumeRisk.colAvailable'), dataIndex: 'availableAmount', key: 'availableAmount',
      width: 130, align: 'right',
      render: (v: number | null | undefined, record) => {
        // 後端 Jackson non_null 配置下 null 字段會被省略，前端收到 undefined，統一用 == null 判空
        if (v == null) {
          return (
            <Tooltip title={t('consumeRisk.unlimitedTip')}>
              <span style={{ color: '#52C41A', fontWeight: 600 }}>{t('consumeRisk.unlimited')}</span>
            </Tooltip>
          )
        }
        const danger = record.limited && v <= 0
        return <span style={{ color: danger ? '#FF4D4F' : '#1890FF', fontWeight: 600 }}>{fmtAmt(v)}</span>
      },
    },
    {
      title: t('consumeRisk.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (_: unknown, record: FinRiskRow) => (
        <Switch
          checked={record.status === 'enabled'}
          checkedChildren={t('consumeRisk.statusEnabled')}
          unCheckedChildren={t('consumeRisk.statusDisabled')}
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: t('consumeRisk.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 110,
      render: (v?: string | null) => v || <span style={{ color: '#BFBFBF' }}>--</span>,
    },
    {
      title: t('consumeRisk.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 150,
      render: (v?: string | null) => v || <span style={{ color: '#BFBFBF' }}>--</span>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 90, fixed: 'right',
      render: (_, record) => {
        if (!hasPermission('consume-risk:edit')) return null
        return (
          <Button type="link" size="small" onClick={() => handleOpenEdit(record)}>
            {t('consumeRisk.configAction')}
          </Button>
        )
      },
    },
  ]

  return (
    <div className="content-area">
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline" form={form}>
          <Form.Item label={t('common.colGroupId')} name="groupId">
            <Input placeholder={t('common.groupIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colGroupName')} name="groupName">
            <Input placeholder={t('common.groupNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="brand">
            <Select placeholder={t('common.all')} options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('consumeRisk.modeLabel')} name="releaseMode">
            <Select placeholder={t('common.all')} options={releaseModeOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('consumeRisk.colAccountStatus')} name="accountStatus">
            <Select placeholder={t('common.all')} options={accountStatusOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('consumeRisk.colUpdatedBy')} name="updatedBy">
            <Input placeholder={t('consumeRisk.updatedByPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('consumeRisk.colUpdatedRange')} name="updatedRange">
            <RangePicker format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按鈕區：右側僅新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          {hasPermission('consume-risk:edit') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleOpenAdd()}>
              {t('consumeRisk.addAction')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      {/* 列表區域 */}
      <div className="table-section">
        <Table<FinRiskRow>
          rowKey={r => `${r.groupId}|${r.brand}`}
          columns={applyConfig(columns)}
          dataSource={data}
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.size,
            total,
            showTotal: (t1) => t('common.total', { count: t1 }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size: size || 10 }),
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 2000 }}
        />
      </div>

      {/* ====== 風控配置彈窗（新增/編輯字段一致） ====== */}
      <Modal
        title={modalState?.mode === 'edit'
          ? `${t('consumeRisk.configTitle')} · ${modalState.row.groupName}（${modalState.row.groupId}）`
          : t('consumeRisk.addTitle')}
        open={modalState !== null}
        onCancel={() => setModalState(null)}
        width={640}
        maskClosable={false}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '12px 24px', borderTop: '1px solid #f0f0f0' }}>
            <Button onClick={() => setModalState(null)}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={configSaving} onClick={() => void handleSaveConfig()}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <Form form={configForm} layout="vertical" initialValues={{ releaseMode: 'repay', monthlyReleaseRatioPercent: 10 }}>
          {modalState?.mode === 'add' && (
            <Form.Item label={t('consumeRisk.addSelectGroup')} name="groupKey"
              rules={[{ required: true, message: t('consumeRisk.addGroupRequired') }]}
            >
              <Select
                placeholder={t('consumeRisk.addSelectGroupPlaceholder')}
                showSearch
                allowClear
                options={accountOptions.map(a => ({
                  label: `${a.groupId} - ${a.groupName}（${a.brand}）`,
                  value: `${a.groupId}|${a.brand}`,
                }))}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
          )}

          <Form.Item label={<span>{t('consumeRisk.modeLabel')}{modeHelpIcon}</span>} name="releaseMode" rules={[{ required: true }]}>
            <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Radio value="repay">
                <span style={{ fontWeight: 600, color: '#262626' }}>{t('consumeRisk.releaseRepayName')}</span>
                <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 6, fontWeight: 400 }}>{t('consumeRisk.releaseRepayDesc')}</span>
              </Radio>
              <Radio value="monthly">
                <span style={{ fontWeight: 600, color: '#262626' }}>{t('consumeRisk.releaseMonthlyName')}</span>
                <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 6, fontWeight: 400 }}>{t('consumeRisk.releaseMonthlyDesc')}</span>
              </Radio>
            </Radio.Group>
          </Form.Item>

          {releaseMode === 'monthly' && (
            <Form.Item label={t('consumeRisk.ratioLabel')} name="monthlyReleaseRatioPercent"
              rules={[{ required: true, message: t('consumeRisk.ratioRequired') }]}
            >
              <InputNumber<number>
                min={0.01}
                max={100}
                precision={2}
                style={{ width: 200 }}
                addonAfter="%/月"
              />
            </Form.Item>
          )}

          {/* 公式/說明展示區：跟隨選項切換聯動展示對應限額公式 */}
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 8,
            background: 'linear-gradient(135deg, #F8FAFF, #EBF3FF)',
            border: '1px solid #ADC6FF',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1565C0', marginBottom: 6 }}>
              {t('consumeRisk.formulaTitle')}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.9, color: '#595959' }}>
              {releaseMode === 'monthly' ? t('consumeRisk.formulaMonthly') : t('consumeRisk.formulaRepay')}
            </div>
          </div>

          <Form.Item label={t('consumeRisk.remarkLabel')} name="remark">
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder={t('consumeRisk.remarkPlaceholder')}
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
