/**
 * 车辆档案 — 列表页
 *
 * 搜索条件（4 项 + 操作）：关键词、车型、运行状态、管理部门
 * 行内操作：詳情 | 編輯；「授權直接登記」与「運行狀態」是列表内开关/变更，均需二次确认 + 填原因。
 *
 * 为什么开关必须填原因：后端把这两个动作当配置变更写审计事件（biz_vehicle_use_event），
 * 没有原因的事后无法解释"这台车什么时候被谁开了免审批口子"。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, TreeSelect, message } from 'antd'
import { ExportOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import BrandTag from '../../../components/BrandTag'
import { exportToCSV } from '../../../utils/exportCSV'
import type { VehicleQuery } from '../../../api/vehicle'
import {
  VEHICLE_STATUS_COLOR, VEHICLE_STATUS_LABEL, VEHICLE_STATUS_OPTIONS, VEHICLE_TYPE_OPTIONS,
} from '../vehicleMeta'
import { useVehicleDeptTree } from '../vehicleOptions'
import type { VehicleFile } from '../vehicleTypes'

interface Props {
  data: { records: VehicleFile[]; total: number }
  loading: boolean
  error?: string
  onQuery: (query: VehicleQuery) => void
  canEdit: boolean
  onToggleDirect: (record: VehicleFile, enabled: boolean, reason: string) => Promise<void>
  onChangeStatus: (record: VehicleFile, status: string, reason: string) => Promise<void>
}

interface Filters { keyword?: string; vehicleType?: string; status?: string; manageDeptId?: number }

/** 需要写原因的确认弹窗：把输入框的值回传，避免"确认了但没留下依据" */
function confirmWithReason(options: {
  title: string
  rows: Array<[string, string]>
  okText: string
  placeholder: string
  onOk: (reason: string) => void
}) {
  const box = { current: '' }
  // 用 ref 式容器接住受控输入的值：Modal.confirm 是命令式 API，无法用组件 state
  Modal.confirm({
    title: options.title,
    className: 'custom-confirm-modal',
    icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
    okText: options.okText,
    cancelText: '取消',
    content: (
      <div className="confirm-info-card">
        {options.rows.map(([label, value]) => (
          <div className="confirm-info-row" key={label}><span>{label}：</span><b>{value}</b></div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Input.TextArea
            rows={2}
            maxLength={200}
            placeholder={options.placeholder}
            onChange={e => { box.current = e.target.value }}
          />
        </div>
      </div>
    ),
    onOk: () => {
      if (!box.current.trim()) {
        message.warning('請填寫原因後再提交')
        // 抛错让 Modal 保持打开，避免用户填了原因却被静默丢弃。
        // 只 reject 空 Error：带文案的 Error 会被控制台当未捕获异常打出来，形成噪音
        return Promise.reject()
      }
      options.onOk(box.current.trim())
      return Promise.resolve()
    },
  })
  return box
}

export default function VehicleFileList({
  data, loading, error, onQuery, canEdit, onToggleDirect, onChangeStatus,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dept = useVehicleDeptTree()
  const [form] = Form.useForm<Filters>()
  const [filters, setFilters] = useState<Filters>({})
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  const dataSource = data.records
  const total = data.total

  useEffect(() => {
    onQuery({ page, size, ...filters })
  }, [filters, page, size, onQuery])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword?.trim() || undefined,
      vehicleType: v.vehicleType || undefined,
      status: v.status || undefined,
      manageDeptId: v.manageDeptId || undefined,
    })
    setPage(1)
  }

  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  const handleToggle = (record: VehicleFile, enabled: boolean) => confirmWithReason({
    title: `確定要${enabled ? '啟用' : '停用'}「授權直接登記」？`,
    okText: '確認',
    placeholder: '必填：為什麼要開啟/停用該車的直接登記',
    rows: [
      ['車輛', `${record.plateNo}（${record.vehicleCode}）`],
      ['當前狀態', VEHICLE_STATUS_LABEL[record.status] ?? record.status],
      ['影響範圍', enabled ? '授權車管可不經 OA 審批直接登記出車' : '該車此後僅能走審批用車流程'],
      ['在途單據', '已安排與行車中的單據不受影響'],
    ],
    onOk: reason => { void onToggleDirect(record, enabled, reason) },
  })

  const handleChangeStatus = (record: VehicleFile, status: string) => confirmWithReason({
    title: `確定將運行狀態變更為「${VEHICLE_STATUS_LABEL[status] ?? status}」？`,
    okText: '確認',
    placeholder: '必填：狀態變更需要原因（如送修、報廢評估中）',
    rows: [
      ['車輛', record.plateNo],
      ['原狀態', VEHICLE_STATUS_LABEL[record.status] ?? record.status],
      ['新狀態', VEHICLE_STATUS_LABEL[status] ?? status],
      ['後果', status === 'normal' ? '該車可被安排與派出' : '新用車將被阻斷，已在途行程不受影響'],
    ],
    onOk: reason => { void onChangeStatus(record, status, reason) },
  })

  const handleExport = () => {
    exportToCSV(`vehicle_files_${new Date().toISOString().slice(0, 10)}`, [
      { title: '車輛編號', dataIndex: 'vehicleCode' },
      { title: '車牌', dataIndex: 'plateNo' },
      { title: '登記地區', dataIndex: 'registerRegion' },
      { title: '車型', dataIndex: 'vehicleType' },
      { title: '所屬法人', dataIndex: 'ownerCompanyName' },
      { title: '公司品牌', dataIndex: 'companyBrand', render: (v: number) => v === 2 ? 'mFood' : '閃蜂' },
      { title: '管理部門', dataIndex: 'manageDeptName' },
      { title: '核定載客', dataIndex: 'seatCount' },
      { title: '當前里程', dataIndex: 'currentOdometer' },
      { title: '運行狀態', dataIndex: 'status', render: (v: string) => VEHICLE_STATUS_LABEL[v] ?? v },
      { title: '授權直接登記', dataIndex: 'allowDirectRegister', render: (v: boolean) => v ? '啟用' : '停用' },
      { title: '保險有效期', dataIndex: 'insuranceValidUntil' },
      { title: '檢驗有效期', dataIndex: 'inspectionValidUntil' },
      { title: 'EAM 資產編號', dataIndex: 'eamAssetNo' },
      { title: '最後更新人', dataIndex: 'updatedBy' },
      { title: '最後更新時間', dataIndex: 'updatedAt' },
    ], dataSource)
    message.success(t('common.exportSuccess'))
  }

  /** 有效期展示：缺失标黄、过期标红，与后端"未核验不可派"的口径一致 */
  const renderExpiry = (v?: string) => {
    if (!v) return <Tag color="warning">未錄入</Tag>
    const expired = new Date(v).getTime() < Date.now()
    return <span style={expired ? { color: '#FF4D4F' } : undefined}>{v}{expired ? ' 已過期' : ''}</span>
  }

  const allColumns = [
    { key: 'vehicleCode', title: '車輛編號', dataIndex: 'vehicleCode', width: 120, fixed: 'left' as const },
    {
      key: 'plate', title: '車牌 / 登記地區', width: 150,
      render: (_: unknown, v: VehicleFile) => (
        <>{v.plateNo}<div style={{ fontSize: 12, color: '#8C8C8C' }}>{v.registerRegion}</div></>
      ),
    },
    { key: 'vehicleType', title: '車型', dataIndex: 'vehicleType', width: 100 },
    { key: 'ownerCompanyName', title: '所屬法人', dataIndex: 'ownerCompanyName', width: 170, ellipsis: true },
    { key: 'companyBrand', title: '公司品牌', dataIndex: 'companyBrand', width: 100, render: (v: number) => <BrandTag value={v} /> },
    { key: 'manageDeptName', title: '管理部門', dataIndex: 'manageDeptName', width: 130 },
    { key: 'seatCount', title: '核定載客', dataIndex: 'seatCount', width: 90, align: 'center' as const, render: (v: number) => `${v} 人` },
    {
      key: 'currentOdometer', title: '當前里程', dataIndex: 'currentOdometer', width: 110, align: 'right' as const,
      render: (v: number) => `${Number(v ?? 0).toLocaleString()} km`,
    },
    {
      key: 'status', title: '運行狀態', dataIndex: 'status', width: 110,
      render: (v: string) => <Tag color={VEHICLE_STATUS_COLOR[v]}>{VEHICLE_STATUS_LABEL[v] ?? v}</Tag>,
    },
    {
      key: 'allowDirectRegister', title: '授權直接登記', dataIndex: 'allowDirectRegister', width: 130,
      render: (v: boolean, record: VehicleFile) => (
        <Switch
          checked={v}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          disabled={!canEdit}
          onChange={checked => handleToggle(record, checked)}
        />
      ),
    },
    { key: 'insuranceValidUntil', title: '保險有效期', dataIndex: 'insuranceValidUntil', width: 130, render: renderExpiry },
    { key: 'inspectionValidUntil', title: '檢驗有效期', dataIndex: 'inspectionValidUntil', width: 130, render: renderExpiry },
    { key: 'eamAssetNo', title: 'EAM 資產編號', dataIndex: 'eamAssetNo', width: 150, render: (v: string) => v ?? '未關聯' },
    {
      key: 'updated', title: '最後更新', width: 190,
      render: (_: unknown, v: VehicleFile) => (
        <>{v.updatedBy}<div style={{ fontSize: 12, color: '#8C8C8C' }}>{v.updatedAt}</div></>
      ),
    },
    {
      key: 'action', title: t('common.colAction'), width: 170, fixed: 'right' as const,
      render: (_: unknown, v: VehicleFile) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/vehicle-files/detail?id=${v.id}`)}>詳情</Button>
          {canEdit && <Button type="link" size="small" onClick={() => navigate(`/vehicle-files/edit?id=${v.id}`)}>編輯</Button>}
          {canEdit && v.status === 'normal' && (
            <Button type="link" size="small" onClick={() => handleChangeStatus(v, 'repairing')}>送修</Button>
          )}
          {canEdit && v.status === 'repairing' && (
            <Button type="link" size="small" onClick={() => handleChangeStatus(v, 'normal')}>修復完成</Button>
          )}
        </Space>
      ),
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'vehicleCode', title: '車輛編號' },
    { key: 'plate', title: '車牌 / 登記地區' },
    { key: 'vehicleType', title: '車型' },
    { key: 'ownerCompanyName', title: '所屬法人' },
    { key: 'companyBrand', title: '公司品牌' },
    { key: 'manageDeptName', title: '管理部門' },
    { key: 'seatCount', title: '核定載客' },
    { key: 'currentOdometer', title: '當前里程' },
    { key: 'status', title: '運行狀態' },
    { key: 'allowDirectRegister', title: '授權直接登記' },
    { key: 'insuranceValidUntil', title: '保險有效期' },
    { key: 'inspectionValidUntil', title: '檢驗有效期' },
    { key: 'eamAssetNo', title: 'EAM 資產編號' },
    { key: 'updated', title: '最後更新' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('vehicle-files', columnMeta, [
    { key: 'vehicleCode', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {error && (
        <AlertBanner
          text={error}
          onRetry={() => onQuery({ page, size, ...filters })}
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item label="關鍵詞" name="keyword">
            <Input placeholder="車牌 / 車輛編號 / VIN" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="車型" name="vehicleType">
            <Select allowClear placeholder={t('common.all')} options={VEHICLE_TYPE_OPTIONS} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="運行狀態" name="status">
            <Select allowClear placeholder={t('common.all')} options={VEHICLE_STATUS_OPTIONS} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="管理部門" name="manageDeptId">
            <TreeSelect
              allowClear showSearch treeNodeFilterProp="title" treeDefaultExpandAll
              treeData={dept.treeData} placeholder={t('common.all')} style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={!dataSource.length} onClick={handleExport}>
            {t('common.export')}
          </Button>
        </div>
        <div className="action-section-right">
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/vehicle-files/add')}>新增車輛</Button>}
          {configComponent}
        </div>
      </div>

      <Table<VehicleFile>
        rowKey="id"
        columns={applyConfig(allColumns) as typeof allColumns}
        dataSource={dataSource}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        loading={loading}
        size="middle"
        scroll={{ x: 2050 }}
        onChange={p => {
          const nextSize = p.pageSize || 10
          setPage(nextSize === size ? p.current || 1 : 1)
          setSize(nextSize)
        }}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
        }}
      />
    </div>
  )
}

/** 错误条：后端不可用要明确可重试，不能显示空表格让人以为"没有车" */
function AlertBanner({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div style={{
      marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: '#FFF1F0',
      border: '1px solid #FFCCC7', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 13, color: '#C62828' }}>加載失敗：{text}</span>
      <Button size="small" onClick={onRetry}>重試</Button>
    </div>
  )
}
