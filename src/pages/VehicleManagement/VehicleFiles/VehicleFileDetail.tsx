/**
 * 车辆档案 — 详情页（只读，无底部操作栏）
 *
 * Tab 划分：基礎信息 / 歸屬與授權 / 駕駛資格。
 * 驾驶资格放在车辆档案下的独立 Tab（不新增「司机管理」菜单），
 * 因为它与车辆可派性强相关，且一期只存最小核验记录。
 */
import { useEffect, useState } from 'react'
import { Button, Descriptions, Space, Table, Tabs, Tag, Tooltip } from 'antd'
import {
  CarOutlined, CheckCircleOutlined, FileProtectOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import {
  QUALIFICATION_COLOR, QUALIFICATION_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL,
  USE_STATUS_COLOR, USE_STATUS_LABEL, VEHICLE_STATUS_COLOR, VEHICLE_STATUS_LABEL,
} from '../vehicleMeta'
import { type DriverQualification, type VehicleFile, type VehicleUseOrder } from '../vehicleTypes'
import { formatWindow } from '../vehicleRules'
import { fetchQualifications, fetchUses } from '../../../api/vehicle'
import { toOrders, toQualifications } from '../vehicleAdapter'
import { useVehicleDeptTree } from '../vehicleOptions'
import { VehicleSection, VehicleUpdateFooter } from '../VehicleModuleLayout'

interface Props {
  record: VehicleFile
  /** 当前操作人（阶段 B 用于按管理范围判定按钮可见性） */
  operator?: string
  loading?: boolean
  onBack: () => void
  onEdit: () => void
  onToggleDirect?: (record: VehicleFile, enabled: boolean, reason: string) => Promise<void>
  onChangeStatus?: (record: VehicleFile, status: string, reason: string) => Promise<void>
  onAddQualification?: () => void
}

/** 有效期展示：缺失标黄、过期标红，口径与 rules 的阻断一致 */
function ExpiryTag({ value }: { value?: string }) {
  if (!value) return <Tooltip title="未錄入，需先完成核驗後才可派出"><Tag color="warning">未錄入</Tag></Tooltip>
  const expired = new Date(value).getTime() < Date.now()
  return <Tag color={expired ? 'error' : 'success'}>{value}{expired ? ' 已過期' : ''}</Tag>
}

/** 占用列表由本组件拉取真实用车单（不再从演示仓库读） */

export default function VehicleFileDetail({ record, onBack, onEdit }: Props) {
  const navigate = useNavigate()
  const dept = useVehicleDeptTree()
  const [tab, setTab] = useState('basic')
  const [quals, setQuals] = useState<DriverQualification[]>([])
  const [occupied, setOccupied] = useState<VehicleUseOrder[]>([])

  // 详情页自己取真实关联数据：驾驶资格与占用情况都是“看着一个东西、旁边要能看到它的约束”
  useEffect(() => {
    let alive = true
    void fetchQualifications().then(list => { if (alive) setQuals(toQualifications(list ?? [])) }).catch(() => {})
    void fetchUses({ page: 1, size: 50, vehicleId: record.id, scope: 'dispatch' })
      .then(res => { if (alive) setOccupied(toOrders(res.records ?? [])) })
      .catch(() => {})
    return () => { alive = false }
  }, [record.id])

  return (
    <div className="content-area">
      <DetailPageHeader
        title="車輛詳情"
        meta={<>{record.vehicleCode} · {record.registerRegion} · {record.vehicleType}</>}
        tags={(
          <Space size={4}>
            <Tag color={VEHICLE_STATUS_COLOR[record.status]}>{VEHICLE_STATUS_LABEL[record.status]}</Tag>
            <Tag color={record.allowDirectRegister ? 'purple' : 'default'}>
              授權直接登記：{record.allowDirectRegister ? '啟用' : '停用'}
            </Tag>
          </Space>
        )}
        onBack={onBack}
        onEdit={onEdit}
        menuKey="vehicle-files"
      />

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'basic',
            label: '基礎信息',
            children: (
              <>
                <VehicleSection icon={<CarOutlined />} title="車輛檔案">
                  <Descriptions column={4} size="middle">
                    <Descriptions.Item label="車牌號碼">{record.plateNo}</Descriptions.Item>
                    <Descriptions.Item label="登記地區">{record.registerRegion}</Descriptions.Item>
                    <Descriptions.Item label="車型">{record.vehicleType}</Descriptions.Item>
                    <Descriptions.Item label="VIN / 底盤號">{record.vin ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="核定載客（含駕駛人）">{record.seatCount} 人</Descriptions.Item>
                    <Descriptions.Item label="當前里程">{record.currentOdometer.toLocaleString()} km</Descriptions.Item>
                    <Descriptions.Item label="EAM 資產編號">{record.eamAssetNo ?? '未關聯'}</Descriptions.Item>
                    <Descriptions.Item label="備註">{record.remark ?? '—'}</Descriptions.Item>
                  </Descriptions>
                </VehicleSection>

                <VehicleSection icon={<FileProtectOutlined />} tone="success" title="合規核驗">
                  <Descriptions column={4} size="middle">
                    <Descriptions.Item label="保險有效期"><ExpiryTag value={record.insuranceValidUntil} /></Descriptions.Item>
                    <Descriptions.Item label="檢驗（年檢）有效期"><ExpiryTag value={record.inspectionValidUntil} /></Descriptions.Item>
                    <Descriptions.Item label="核驗人">{record.verifyBy ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="核驗時間">{record.verifyAt ?? '—'}</Descriptions.Item>
                  </Descriptions>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
                    口徑：保險或檢驗未錄入／已過期時禁止新出車，但已發生的歸還登記不受阻斷。
                  </div>
                </VehicleSection>

                <VehicleSection icon={<CheckCircleOutlined />} tone="config" title="占用與預約">
                  {occupied.length === 0 ? (
                    <span style={{ fontSize: 13, color: '#8C8C8C' }}>暫無在途或待派單據</span>
                  ) : (
                    <Table<VehicleUseOrder>
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={occupied}
                      columns={[
                        { title: '用車單號', dataIndex: 'useNo', width: 160 },
                        {
                          title: '占用時段', width: 250,
                          render: (_: unknown, o) => formatWindow(
                            o.trip?.depart.departAt ?? o.apply.plannedStart,
                            o.trip?.tripReturn.returnAt ?? o.apply.plannedEnd,
                          ),
                        },
                        { title: '駕駛人', width: 130, render: (_: unknown, o) => o.assign.driverName ?? '—' },
                        {
                          title: '單據狀態', dataIndex: 'status', width: 120,
                          render: (v: string) => <Tag color={USE_STATUS_COLOR[v]}>{USE_STATUS_LABEL[v] ?? v}</Tag>,
                        },
                        {
                          title: '行程狀態', width: 130,
                          render: (_: unknown, o) => o.trip
                            ? <Tag color={TRIP_STATUS_COLOR[o.trip.status]}>{TRIP_STATUS_LABEL[o.trip.status]}</Tag>
                            : <Tag>未出車</Tag>,
                        },
                        {
                          title: '操作', width: 80,
                          render: (_: unknown, o) => (
                            <Button type="link" size="small" onClick={() => navigate(`/vehicle-dispatch/detail?id=${o.id}`)}>詳情</Button>
                          ),
                        },
                      ]}
                    />
                  )}
                </VehicleSection>
              </>
            ),
          },
          {
            key: 'scope',
            label: '歸屬與授權',
            children: (
              <>
                <VehicleSection icon={<TeamOutlined />} title="歸屬與可用範圍">
                  <Descriptions column={2} size="middle">
                    <Descriptions.Item label="所屬法人">{record.ownerCompanyName}</Descriptions.Item>
                    <Descriptions.Item label="公司品牌"><BrandTag value={record.companyBrand} /></Descriptions.Item>
                    <Descriptions.Item label="管理部門">{record.manageDeptName}</Descriptions.Item>
                    <Descriptions.Item label="可使用部門">
                      {record.allowedDepts.length
                        ? record.allowedDepts.map(d => <Tag key={d.deptId}>{dept.nameById.get(d.deptId) ?? d.deptName}</Tag>)
                        : '—'}
                    </Descriptions.Item>
                  </Descriptions>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
                    可用範圍按顯式授權部門 ID 判定，一期不隱式繼承子部門；
                    員工使用用車功能不需要物資管理的全量台賬權限。
                  </div>
                </VehicleSection>

                <VehicleSection icon={<TeamOutlined />} tone="special" title="授權管理人員">
                  <Table
                    rowKey="empId"
                    size="small"
                    pagination={false}
                    dataSource={record.managers}
                    columns={[
                      { title: '姓名', dataIndex: 'empName' },
                      { title: '工號', dataIndex: 'empNo', width: 140 },
                      {
                        title: '權限級別', dataIndex: 'level', width: 160,
                        render: (v: string) => (
                          <Tag color={v === 'manage' ? 'processing' : 'default'}>
                            {v === 'manage' ? '可辦理用車' : '僅可查閱'}
                          </Tag>
                        ),
                      },
                    ]}
                  />
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
                    管理範圍按「車輛 × 管理人員」關聯判定，不沿用商家集團數據權限；
                    直接登記、補錄、更正、導出分别独立授权。
                  </div>
                </VehicleSection>
              </>
            ),
          },
          {
            key: 'qualification',
            label: `駕駛資格（${quals.length}）`,
            children: (
              <VehicleSection
                icon={<FileProtectOutlined />}
                tone="success"
                title="內部員工駕駛資格"
                hint="一期只存最小核驗記錄"
                tag={(
                  <Button
                    type="primary" size="small"
                    onClick={() => navigate(`/vehicle-files/qualification?vehicleId=${record.id}`)}
                  >
                    新增核驗記錄
                  </Button>
                )}
              >
                <Table<DriverQualification>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={quals}
                  columns={[
                    { title: '員工', width: 160, render: (_: unknown, q) => `${q.empName}（${q.empNo}）` },
                    { title: '適用地區', dataIndex: 'region', width: 120 },
                    { title: '準駕範圍', dataIndex: 'licenseClass', width: 110 },
                    { title: '有效期至', dataIndex: 'validUntil', width: 140 },
                    {
                      title: '核驗結果', dataIndex: 'result', width: 120,
                      render: (v: string) => <Tag color={QUALIFICATION_COLOR[v]}>{QUALIFICATION_LABEL[v] ?? v}</Tag>,
                    },
                    { title: '核驗人', dataIndex: 'verifiedBy', width: 120, render: (v: string) => v ?? '—' },
                    { title: '核驗時間', dataIndex: 'verifiedAt', width: 180, render: (v: string) => v ?? '—' },
                  ]}
                />
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
                  待核驗、已失效、已過有效期的駕駛人不可安排新出車；
                  下拉框中直接置灰並顯示原因，不做静默隱藏。
                </div>
              </VehicleSection>
            ),
          },
        ]}
      />

      <VehicleUpdateFooter updatedBy={record.updatedBy} updatedAt={record.updatedAt} />
    </div>
  )
}
