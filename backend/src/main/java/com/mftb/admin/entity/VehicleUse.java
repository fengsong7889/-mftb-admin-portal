package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用车单实体（申请 + 车辆安排 + 审批引用 + 业务状态）
 *
 * <p>三条路径共用一张单，靠 {@code source} 与 {@code approvalOutcome} 两个维度区分，
 * 而不是靠一个 status 硬扛：
 * <ul>
 *   <li>审批用车：source=oa_approval，approvalOutcome 走 approving→approved；</li>
 *   <li>授权直接登记：source=direct_register，approvalOutcome=direct 且必须带 directReason，
 *       绝不写成 approved，否则台账无法区分管控强度；</li>
 *   <li>事后补录：source=backfill，approvalOutcome=not_applicable，
 *       实际发生时间与 {@code backfillEntryAt}（系统登记时间）分开保存。</li>
 * </ul>
 *
 * <p>人员、部门、车牌都存快照：员工改名、车辆换牌不得改写历史事实。
 */
@Data
@TableName("biz_vehicle_use")
public class VehicleUse {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 用车单号：YC=审批 ZC=直接登记 BL=补录，前缀即路径标识 */
    private String useNo;

    /** 数据来源：oa_approval/direct_register/backfill */
    private String source;

    /** 审批结论：not_submitted/approving/approved/rejected/cancelled/direct/not_applicable */
    private String approvalOutcome;

    /** 业务状态：draft/approving/to_assign/to_depart/in_use/to_confirm/completed/rejected/cancelled */
    private String status;

    /** 关联 OA 流程编号（审批用车才有） */
    private String flowNo;

    /** 申请人 sys_user.id：一律服务端从 JWT 取，不信前端传值 */
    private Long applicantId;

    private String applicantEmpNo;

    private String applicantName;

    /** 实际用车人：代登记场景与申请人不同，必须单独记 */
    private String actualUserName;

    private Long departmentId;

    private String departmentName;

    /** 意向车辆：安排前不代表预约成功 */
    private Long intentVehicleId;

    private String intentPlateNo;

    /** 最终车辆：安排成功才形成有效占用 */
    private Long finalVehicleId;

    private String finalPlateNo;

    /** 实际驾驶人 sys_user.id：与申请人、用车人分列 */
    private Long driverId;

    private String driverEmpNo;

    private String driverName;

    /** 驾驶方式：self/company_driver */
    private String drivingMode;

    /** 人数（含驾驶人） */
    private Integer passengerCount;

    private String purpose;

    private String origin;

    private String destination;

    private LocalDateTime plannedStart;

    /** 计划结束时间：超时归还只打标识，不倒改本字段 */
    private LocalDateTime plannedEnd;

    private Long assignById;

    private String assignByName;

    private LocalDateTime assignAt;

    /** 授权直接登记原因 */
    private String directReason;

    /** 冲突/改派说明，如受前车晚归影响 */
    private String conflictNote;

    /** 重提来源单：驳回/取消后复制重提保留关联，不改写原审批历史 */
    private Long prevUseId;

    /** 补录的"系统登记时间" */
    private LocalDateTime backfillEntryAt;

    /** 幂等键：同一操作人+同键只生效一次 */
    private String requestKey;

    /** 请求摘要：同键不同内容要被拒绝 */
    private String requestHash;

    /** 乐观锁版本；无 OptimisticLockerInnerInterceptor，靠显式 WHERE version=? 更新 */
    private Integer version;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
