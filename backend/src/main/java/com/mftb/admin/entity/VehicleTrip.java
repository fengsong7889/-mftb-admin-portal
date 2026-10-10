package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 用车行程实体（实际发生的出车与归还，一期与用车单 1:1）
 *
 * <p>出车与归还写同一行，不拆两张表：拆了必然漂移（还车表已记、出车表还 in_use）。
 *
 * <p>{@code flags} 是逗号分隔的附加标识（overdue/backfill/corrected/mileage_anomaly/
 * key_pending/condition_abnormal），与 {@code status} 分开：超时、异常是标记，
 * 不能把主状态改成一个混合枚举，否则"超时但已确认"这类组合无法表达。
 */
@Data
@TableName("biz_vehicle_trip")
public class VehicleTrip {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 用车单 ID（一单一行程，由表上生成列唯一键约束） */
    private Long useId;

    private Long vehicleId;

    /** 行程发生时的车牌快照：换牌不改历史 */
    private String vehiclePlateNo;

    private Long driverId;

    private String driverEmpNo;

    private String driverName;

    /** 行程状态：departed/returned/confirmed/pending_check/disputed */
    private String status;

    /* ==================== 出车登记 ==================== */

    private LocalDateTime departAt;

    private BigDecimal startOdometer;

    /** 钥匙已领取：1=是 0=否 */
    private Integer keyReceived;

    /** 出发前车况已确认 */
    private Integer conditionOk;

    private Long departById;

    private String departByName;

    /** 出车的系统登记时间（与 departAt 实际出车时间不同） */
    private LocalDateTime departRegisteredAt;

    /* ==================== 归还登记 ==================== */

    private LocalDateTime returnAt;

    private BigDecimal endOdometer;

    private String returnPlace;

    /** 钥匙已交还：0 时车辆不可再派出，但不阻断本单据实结案 */
    private Integer keyReturned;

    /** 归还车况：normal/abnormal */
    private String vehicleCondition;

    private String exceptionNote;

    /* ==================== 归还确认 ==================== */

    private Long confirmById;

    private String confirmByName;

    /** 确认后才计入正式用车台账 */
    private LocalDateTime confirmAt;

    /* ==================== 计算值（服务端算，前端传值不作为依据） ==================== */

    /** 行驶里程 = 结束里程 - 起始里程 */
    private BigDecimal mileage;

    /** 用车时长 = 实际归还 - 实际出车（小时），不用申请时段代替 */
    private BigDecimal durationHours;

    /** 附加标识，逗号分隔 */
    private String flags;

    /** 补录场景的实际系统登记时间，与出还车时间分离留痕 */
    private LocalDateTime backfillEntryAt;

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
