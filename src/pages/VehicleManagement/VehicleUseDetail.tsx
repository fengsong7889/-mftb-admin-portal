/**
 * 用车详情（我的用车 / 用车办理 / 用车台账 共用同一份实现）
 *
 * 模块拆分（自上而下）：
 *   1. 用车申请  2. 审批与车辆安排  3. 出车登记
 *   4. 归还与确认  5. 异常与补录说明
 * 为什么三处共用：同一张用车单在「我发起的」「车管待办」「历史台账」里必须是同一份
 * 事实与同一套口径，分开写会导致补录标识、时长算法在某个入口丢失。
 *
 * 样式基准：采购订单详情 —— DetailPageHeader + 无边框模块卡片 + Descriptions column=4。
 */
import { Button, Descriptions, Space, Tag, Timeline } from 'antd'
import {
  AuditOutlined, CarOutlined, FileTextOutlined, LoginOutlined,
  LogoutOutlined, SafetyCertificateOutlined, SwapOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  VehicleFlagTags, VehicleSection, VehicleUpdateFooter,
} from './VehicleModuleLayout'
import {
  APPROVAL_COLOR, APPROVAL_LABEL, DRIVING_MODE_LABEL, TRIP_FLAG_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL,
  USE_SOURCE_COLOR, USE_SOURCE_LABEL, USE_STATUS_COLOR, USE_STATUS_LABEL, VEHICLE_STATUS_COLOR,
  VEHICLE_STATUS_LABEL,
} from './vehicleMeta'
import {
  TRIP_FLAG, USE_SOURCE,
  type VehicleFile, type VehicleUseOrder,
} from './vehicleTypes'
import { computeDurationHours, formatWindow, buildVisibleNodes } from './vehicleRules'

/* ==================== 审批节点（懒加载口径 §D.5）====================
 * 节点推导位于 vehicleRules.buildVisibleNodes，详情页只导出组件。
 */

const NODE_DOT: Record<'done' | 'current' | 'pending', string> = { done: 'green', current: 'blue', pending: 'gray' }

/* ==================== 详情页 ==================== */

export interface VehicleUseDetailProps {
  order: VehicleUseOrder
  vehicle?: VehicleFile
  onBack: () => void
  /** 详情页头部右侧的唯一主操作（列表操作列仍是主要入口） */
  primaryAction?: { label: string; onClick: () => void }
  /** 是否展示审计区（我的用车不展示他人操作细节） */
  showAudit?: boolean
}

const YES = <Tag color="success">是</Tag>
const NO = <Tag color="default">否</Tag>

export default function VehicleUseDetail({ order, vehicle, onBack, primaryAction, showAudit = true }: VehicleUseDetailProps) {
  const { apply, assign, trip } = order
  const nodes = buildVisibleNodes(order)
  const isDirect = order.source === USE_SOURCE.DIRECT_REGISTER
  const isBackfill = order.source === USE_SOURCE.BACKFILL
  /** 时长以实际出还车计算；缺失时按已登记数据留空，不用申请时段顶替 */
  const durationHours = trip?.durationHours ?? computeDurationHours(trip?.depart.departAt, trip?.tripReturn.returnAt)

  return (
    <div className="content-area">
      <DetailPageHeader
        title="用車詳情"
        meta={<>{order.useNo} · 申請人 {apply.applicantName}（{apply.applicantEmpNo}） · {apply.departmentName}</>}
        tags={(
          <Space size={4}>
            <Tag color={USE_STATUS_COLOR[order.status]}>{USE_STATUS_LABEL[order.status] ?? order.status}</Tag>
            <Tag color={USE_SOURCE_COLOR[order.source]}>{USE_SOURCE_LABEL[order.source]}</Tag>
            <Tag color={APPROVAL_COLOR[order.approval]}>{APPROVAL_LABEL[order.approval]}</Tag>
          </Space>
        )}
        onBack={onBack}
        extra={primaryAction && (
          <Button
            type="primary"
            onClick={primaryAction.onClick}
            style={{
              backgroundColor: '#722ED1', borderColor: '#722ED1', borderRadius: 8, height: 36,
              padding: '0 16px', boxShadow: '0 2px 6px rgba(114,46,209,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {primaryAction.label}
          </Button>
        )}
      />

      {/* ====== 模块 1：用车申请 ====== */}
      <VehicleSection icon={<FileTextOutlined />} title="用車申請">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="申請人">{apply.applicantName}（{apply.applicantEmpNo}）</Descriptions.Item>
          <Descriptions.Item label="實際用車人">{apply.actualUserName}</Descriptions.Item>
          <Descriptions.Item label="申請部門">{apply.departmentName}</Descriptions.Item>
          <Descriptions.Item label="用車事由">{apply.purpose}</Descriptions.Item>
          <Descriptions.Item label="出發地">{apply.origin}</Descriptions.Item>
          <Descriptions.Item label="目的地">{apply.destination}</Descriptions.Item>
          <Descriptions.Item label="計劃時段">{formatWindow(apply.plannedStart, apply.plannedEnd)}</Descriptions.Item>
          <Descriptions.Item label="人數（含駕駛人）">{apply.passengerCount}</Descriptions.Item>
          <Descriptions.Item label="駕駛方式">{DRIVING_MODE_LABEL[apply.drivingMode]}</Descriptions.Item>
          <Descriptions.Item label="意向車輛">{apply.intentPlateNo ?? '未指定'}</Descriptions.Item>
          <Descriptions.Item label="OA 流程編號">{order.flowNo ?? (isDirect || isBackfill ? '不適用' : '—')}</Descriptions.Item>
          <Descriptions.Item label="提交時間">{order.createdAt}</Descriptions.Item>
        </Descriptions>
      </VehicleSection>

      {/* ====== 模块 2：审批与车辆安排 ====== */}
      <VehicleSection
        icon={isDirect ? <SafetyCertificateOutlined /> : <SwapOutlined />}
        tone={isDirect ? 'special' : 'info'}
        title="審批與車輛安排"
        hint={isDirect ? '授權直接登記不生成審批節點' : undefined}
      >
        <div style={{ marginBottom: 16 }}>
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="來源">
              <Tag color={USE_SOURCE_COLOR[order.source]}>{USE_SOURCE_LABEL[order.source]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="審批結論">
              <Tag color={APPROVAL_COLOR[order.approval]}>{APPROVAL_LABEL[order.approval]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="安排人">{assign.assignBy ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="安排時間">{assign.assignAt ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="最終車輛">{assign.finalPlateNo ?? '尚未安排'}</Descriptions.Item>
            <Descriptions.Item label="實際駕駛人">
              {assign.driverName ? `${assign.driverName}（${assign.driverEmpNo ?? '—'}）` : '尚未安排'}
            </Descriptions.Item>
            <Descriptions.Item label="車輛運行狀態">
              {vehicle ? <Tag color={VEHICLE_STATUS_COLOR[vehicle.status]}>{VEHICLE_STATUS_LABEL[vehicle.status]}</Tag> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="核定載客">{vehicle ? `${vehicle.seatCount} 人` : '—'}</Descriptions.Item>
            {isDirect && (
              <Descriptions.Item label="直接登記原因" span={4}>{assign.directRegisterReason ?? '—'}</Descriptions.Item>
            )}
            {assign.conflictNote && (
              <Descriptions.Item label="衝突說明" span={4}>
                <span style={{ color: '#FA8C16' }}>{assign.conflictNote}</span>
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>

        <Timeline
          items={nodes.map(n => ({
            color: NODE_DOT[n.state],
            children: (
              <div>
                <span style={{ fontWeight: 600, color: '#262626' }}>{n.label}</span>
                {n.state === 'current' && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#1890ff', animation: 'nodeBreath 1.6s ease-in-out infinite' }}>進行中</span>
                )}
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
                  {n.actor}{n.at ? ` · ${n.at}` : ''}{n.note ? ` · ${n.note}` : ''}
                </div>
              </div>
            ),
          }))}
        />
      </VehicleSection>

      {/* ====== 模块 3：出车登记 ====== */}
      <VehicleSection icon={<LoginOutlined />} tone="success" title="出車登記">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="實際出車時間">{trip?.depart.departAt ?? '尚未出車'}</Descriptions.Item>
          <Descriptions.Item label="起始里程">{trip?.depart.startOdometer != null ? `${trip.depart.startOdometer} km` : '—'}</Descriptions.Item>
          <Descriptions.Item label="鑰匙領取">{trip?.depart.keyReceived ? YES : NO}</Descriptions.Item>
          <Descriptions.Item label="車況確認">{trip?.depart.conditionOk ? YES : NO}</Descriptions.Item>
          <Descriptions.Item label="登記人">{trip?.depart.registerBy ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="系統登記時間">{trip?.depart.registerAt ?? '—'}</Descriptions.Item>
          {isBackfill && (
            <Descriptions.Item label="補錄標識" span={2}>
              <Tag color="orange">{TRIP_FLAG_LABEL[TRIP_FLAG.BACKFILL]}</Tag>
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>實際發生時間與系統登記時間不同，核對前不計入正式統計</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </VehicleSection>

      {/* ====== 模块 4：归还与确认 ====== */}
      <VehicleSection icon={<LogoutOutlined />} tone="success" title="歸還與確認">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="行程狀態">
            {trip ? <Tag color={TRIP_STATUS_COLOR[trip.status]}>{TRIP_STATUS_LABEL[trip.status]}</Tag> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="實際還車時間">{trip?.tripReturn.returnAt ?? '尚未歸還'}</Descriptions.Item>
          <Descriptions.Item label="結束里程">{trip?.tripReturn.endOdometer != null ? `${trip.tripReturn.endOdometer} km` : '—'}</Descriptions.Item>
          <Descriptions.Item label="行駛里程">{trip?.mileage != null ? `${trip.mileage} km` : '—'}</Descriptions.Item>
          <Descriptions.Item label="用車時長">{durationHours != null ? `${durationHours} 小時` : '—'}</Descriptions.Item>
          <Descriptions.Item label="歸還地點">{trip?.tripReturn.returnPlace ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="鑰匙交還">{trip?.tripReturn.keyReturned ? YES : NO}</Descriptions.Item>
          <Descriptions.Item label="歸還車況">
            {trip?.tripReturn.condition === 'abnormal'
              ? <Tag color="error">異常</Tag>
              : trip?.tripReturn.condition === 'normal' ? <Tag color="success">正常</Tag> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="異常說明" span={2}>{trip?.tripReturn.exceptionNote ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="歸還確認人">{trip?.tripReturn.confirmBy ?? '待確認'}</Descriptions.Item>
          <Descriptions.Item label="確認時間">{trip?.tripReturn.confirmAt ?? '—'}</Descriptions.Item>
        </Descriptions>
      </VehicleSection>

      {/* ====== 模块 5：异常标识 ====== */}
      <VehicleSection icon={<AuditOutlined />} tone="config" title="異常與標識">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#595959' }}>附加標識：</span>
          <VehicleFlagTags flags={trip?.flags} />
        </div>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12 }}>
          說明：超時、補錄、更正、里程異常等標識與主狀態分開管理；已完成單據不提供普通編輯，
          需由具備更正權限的人員填寫理由後更正，並保留修改前後值。
        </div>
      </VehicleSection>

      {showAudit && (
        <VehicleSection icon={<CarOutlined />} tone="special" title="資源占用提示">
          <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.8 }}>
            本單在「待出車 / 使用中 / 待歸還確認」期間占用車輛 {assign.finalPlateNo ?? '—'} 與駕駛人
            {' '}{assign.driverName ?? '—'}。前車晚歸時後車預約會標記受影響並由車管改派，
            不會倒改真實還車時間消除衝突。
          </div>
        </VehicleSection>
      )}

      <VehicleUpdateFooter updatedBy={order.updatedBy} updatedAt={order.updatedAt} />
    </div>
  )
}
