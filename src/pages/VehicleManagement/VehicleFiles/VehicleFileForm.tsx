/**
 * 车辆档案 — 新增/编辑表单页（独立页面，禁止 Modal）
 *
 * 字段分组：基础信息 / 归属与可用范围 / 运行与合规核验
 * 校验口径：前端只做 UX 校验（必填、区间、格式），后端 B1 必须重验车牌唯一、
 * 法人主体存在、EAM 资产可关联、有效期合法。
 */
import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Switch, TreeSelect } from 'antd'
import {
  CarOutlined, DatabaseOutlined, SaveOutlined, SafetyCertificateOutlined, TeamOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { VEHICLE_STATUS_LABEL, VEHICLE_STATUS_OPTIONS, VEHICLE_TYPE_OPTIONS } from '../vehicleMeta'
import { VEHICLE_STATUS, type VehicleFile, type VehicleFileFormValues } from '../vehicleTypes'
import { usePurchaseCompanies, useVehicleDeptTree } from '../vehicleOptions'
import {
  VehicleFormPageHeader, VehicleSection,
} from '../VehicleModuleLayout'

/**
 * 表单内部状态：DatePicker 交回 Dayjs 对象，而领域模型存 'YYYY-MM-DD' 字符串。
 * 单独开一个类型而不是把 form 直接声明为 VehicleFileFormValues，
 * 是为了避免用 as 掩盖真实运行时形状（会导致提交时静默存错类型）。
 */
type FormState = Omit<VehicleFileFormValues, 'insuranceValidUntil' | 'inspectionValidUntil'>
  & { insuranceValidUntil?: Dayjs; inspectionValidUntil?: Dayjs }

interface Props {
  record?: VehicleFile
  /** 详情加载中标记：编辑页直接刷 URL 时先转圈，避免表单以“新增”空态闪一下 */
  loading?: boolean
  saving: boolean
  onSubmit: (values: VehicleFileFormValues, editing?: VehicleFile) => void
  onBack: () => void
}

export default function VehicleFileForm({ record, loading = false, saving, onSubmit, onBack }: Props) {
  const isEdit = !!record
  const [form] = Form.useForm<FormState>()
  const dept = useVehicleDeptTree()
  const companies = usePurchaseCompanies()
  const [allowDirect, setAllowDirect] = useState(!!record?.allowDirectRegister)

  useEffect(() => {
    if (!record) return
    form.setFieldsValue({
      plateNo: record.plateNo,
      registerRegion: record.registerRegion,
      vehicleType: record.vehicleType,
      vin: record.vin,
      eamAssetNo: record.eamAssetNo,
      seatCount: record.seatCount,
      currentOdometer: record.currentOdometer,
      ownerCompanyId: record.ownerCompanyId || undefined,
      companyBrand: record.companyBrand,
      manageDeptId: record.manageDeptId || undefined,
      allowedDeptIds: record.allowedDepts.map(d => d.deptId),
      status: record.status,
      allowDirectRegister: record.allowDirectRegister,
      insuranceValidUntil: record.insuranceValidUntil ? dayjs(record.insuranceValidUntil) : undefined,
      inspectionValidUntil: record.inspectionValidUntil ? dayjs(record.inspectionValidUntil) : undefined,
      remark: record.remark,
    })
    setAllowDirect(record.allowDirectRegister)
  }, [record, form])

  /** 关闭「授权直接登记」需要确认：这会收窄该车可用路径，不影响已有在途单据 */
  const handleDirectChange = (checked: boolean) => {
    if (!checked) {
      Modal.confirm({
        title: '確定要停用「授權直接登記」？',
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        okText: '確認',
        cancelText: '取消',
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>車輛：</span><b>{record?.plateNo ?? '尚未選擇'}</b></div>
            <div className="confirm-info-row"><span>影響：</span><b>此後該車僅能走審批用車流程</b></div>
            <div className="confirm-info-row"><span>在途單據：</span><b>已完成安排與行車不受影響</b></div>
          </div>
        ),
        onOk: () => { setAllowDirect(false); form.setFieldValue('allowDirectRegister', false) },
      })
      return
    }
    setAllowDirect(true)
    form.setFieldValue('allowDirectRegister', true)
  }

  const handleSubmit = async () => {
    let raw: FormState
    try {
      raw = await form.validateFields()
    } catch {
      return // antd 已在字段下方提示，不双弹
    }
    const values: VehicleFileFormValues = {
      ...raw,
      insuranceValidUntil: raw.insuranceValidUntil?.format('YYYY-MM-DD'),
      inspectionValidUntil: raw.inspectionValidUntil?.format('YYYY-MM-DD'),
    }
    onSubmit(values, record)
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title={isEdit ? '編輯車輛檔案' : '新增車輛檔案'}
        onBack={onBack}
        meta={isEdit ? `${record?.plateNo} · ${record?.vehicleCode}` : '新車可先建運行檔案，EAM 資產關聯為可選項'}
      />

      {(record || !loading) && (
      <Form form={form} layout="vertical" initialValues={{ status: VEHICLE_STATUS.NORMAL, registerRegion: '澳門', allowDirectRegister: false }}>
        {/* ====== 基础信息 ====== */}
        <VehicleSection icon={<CarOutlined />} title="基礎信息">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="車牌號碼" name="plateNo" rules={[{ required: true, message: '請輸入車牌號碼' }]}
              extra="同一登記地區內唯一；換牌需保留歷史車牌快照"
            >
              <Input placeholder="如 MT-88-01" maxLength={20} />
            </Form.Item>
            <Form.Item label="登記地區" name="registerRegion" rules={[{ required: true, message: '請選擇登記地區' }]}>
              <Select options={[{ value: '澳門', label: '澳門' }, { value: '中國內地', label: '中國內地' }, { value: '香港', label: '香港' }]} />
            </Form.Item>
            <Form.Item label="車型" name="vehicleType" rules={[{ required: true, message: '請選擇車型' }]}>
              <Select options={VEHICLE_TYPE_OPTIONS} placeholder="請選擇車型" />
            </Form.Item>
            <Form.Item label="VIN / 底盤號" name="vin" extra="可選，不作為業務身份">
              <Input placeholder="選填" maxLength={30} />
            </Form.Item>
            <Form.Item
              label="核定載客（含駕駛人）" name="seatCount"
              rules={[{ required: true, message: '請輸入核定載客人數' }]}
              extra="用車人數超過此值將被拒絕"
            >
              <InputNumber min={1} max={60} style={{ width: '100%' }} placeholder="如 7" />
            </Form.Item>
            <Form.Item
              label="當前里程（km）" name="currentOdometer"
              rules={[{ required: true, message: '請輸入當前里程' }]}
              extra="取上次確認的結束里程，作為出車起始里程默認值"
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="如 42180" />
            </Form.Item>
          </div>
        </VehicleSection>

        {/* ====== 归属与可用范围 ====== */}
        <VehicleSection icon={<TeamOutlined />} tone="config" title="歸屬與可用範圍">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="所屬法人" name="ownerCompanyId"
              rules={[{ required: true, message: '請選擇所屬法人' }]}
              extra="與公司品牌是兩個獨立維度"
            >
              <Select options={companies.options} placeholder="請選擇法人主體" showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item label="公司品牌" name="companyBrand" rules={[{ required: true, message: '請選擇公司品牌' }]}>
              <Select options={[{ value: 1, label: '閃蜂' }, { value: 2, label: 'mFood' }]} placeholder="請選擇品牌" />
            </Form.Item>
            <Form.Item
              label="管理部門" name="manageDeptId"
              rules={[{ required: true, message: '請選擇管理部門' }]}
            >
              <TreeSelect
                treeData={dept.treeData} treeDefaultExpandAll showSearch treeNodeFilterProp="title"
                placeholder="請選擇管理部門"
              />
            </Form.Item>
            <Form.Item
              label="可使用部門" name="allowedDeptIds"
              extra="顯式授權部門；一期不隱式繼承子部門"
              style={{ gridColumn: 'span 2' }}
            >
              <TreeSelect
                multiple treeData={dept.treeData} treeDefaultExpandAll showSearch treeNodeFilterProp="title"
                placeholder="可選擇多個部門" allowClear
              />
            </Form.Item>
            <Form.Item label="EAM 資產編號" name="eamAssetNo" extra="可選；採購入庫後可回填">
              <Input placeholder="如 TB-ZC-000128" maxLength={40} />
            </Form.Item>
          </div>
        </VehicleSection>

        {/* ====== 运行与合规核验 ====== */}
        <VehicleSection icon={<SafetyCertificateOutlined />} tone="success" title="運行與合規核驗">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="運行狀態" name="status" rules={[{ required: true, message: '請選擇運行狀態' }]}>
              <Select options={VEHICLE_STATUS_OPTIONS} placeholder="請選擇狀態" />
            </Form.Item>
            <Form.Item
              label="保險有效期" name="insuranceValidUntil"
              extra="未錄入或已過期的車輛禁止新出車"
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇日期" />
            </Form.Item>
            <Form.Item
              label="檢驗（年檢）有效期" name="inspectionValidUntil"
              extra="未錄入或已過期的車輛禁止新出車"
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇日期" />
            </Form.Item>
            <Form.Item
              label="授權直接登記" name="allowDirectRegister" valuePropName="checked"
              extra="僅授權車管可不經審批登記出車，需填寫原因"
            >
              <Switch checked={allowDirect} checkedChildren="啟用" unCheckedChildren="停用" onChange={handleDirectChange} />
            </Form.Item>
            <Form.Item label="備註" name="remark" style={{ gridColumn: 'span 2' }}>
              <Input.TextArea rows={1} maxLength={200} placeholder="選填" />
            </Form.Item>
          </div>
          {record && (
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              當前狀態：{VEHICLE_STATUS_LABEL[record.status]} · 最後更新 {record.updatedBy} / {record.updatedAt}
            </div>
          )}
        </VehicleSection>

        {/* ====== 关联资产提示（一期不做深耦合） ====== */}
        <VehicleSection icon={<DatabaseOutlined />} tone="special" title="與資產台賬的邊界">
          <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.9 }}>
            同屬物資管理系統，但職責分開：車輛的購置價值、採購入庫、長期領用保管、報廢
            由資產台賬（EAM）負責；此處只維護運行檔案。
            一次用車出還不會改動資產持有人，EAM 對已關聯且存在有效預約或行車中記錄的
            車輛做報廢/調撥時，需先處置用車單據。
          </div>
        </VehicleSection>

        <div className="form-footer">
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>保存</Button>
        </div>
      </Form>
      )}
    </div>
  )
}
