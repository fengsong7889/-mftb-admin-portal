package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 用车域（用车单 / 行程 / 台账 / 更正）出入参契约
 *
 * <p>关键设计约束（与实现必须一致）：
 * <ul>
 *   <li>入参里没有 applicantId / operatorId / role 字段 —— 申请人、办理人一律服务端从 JWT 取，
 *       防止伪造身份代他人登记；</li>
 *   <li>mileage / durationHours 只出现在出参：由服务端算，前端传值不作为依据；</li>
 *   <li>每个写操作都带 requestKey（幂等）与 expectVersion（乐观锁）。</li>
 *   <li>时间字段约定：入参用 {@code LocalDateTime}（前端传 ISO，带 T 分隔），
 *       出参用已格式化的 {@code String}（yyyy-MM-dd HH:mm:ss）——与 {@code EamBorrowVO} 同法，
 *       守住全局日期展示规范，也不让前端各自猜 Jackson 默认格式。</li>
 * </ul>
 */
public final class VehicleUseDto {

    private VehicleUseDto() {
    }

    /** 用车单列表查询：scope 决定视角，服务层据此强制数据范围 */
    @Data
    public static class Query {
        private Integer page = 1;
        private Integer size = 10;
        /**
         * 视角：my_applied（我发起）/ my_driving（我驾驶）/ dispatch（车管待办）/ ledger（台账）。
         * 不接受前端传入的 userId 作为范围依据。
         */
        private String scope;
        private String keyword;
        private String status;
        private String source;
        private String tripStatus;
        private Long vehicleId;
        private String plateNo;
        private String driverName;
        private Long departmentId;
        /** 按实际出车日期归属期间（跨日不拆分） */
        private LocalDateTime fromDate;
        private LocalDateTime toDate;
        /** 办理页分组：to_assign / to_depart / in_use / to_confirm / backfill / all */
        private String group;
    }

    /** 用车单视图（列表行与详情共用；详情额外字段非空时才有值） */
    @Data
    public static class VO {
        private Long id;
        private String useNo;
        private String source;
        private String approvalOutcome;
        private String status;
        private String flowNo;
        private Long applicantId;
        private String applicantEmpNo;
        private String applicantName;
        private String actualUserName;
        private Long departmentId;
        private String departmentName;
        private Long intentVehicleId;
        private String intentPlateNo;
        private Long finalVehicleId;
        private String finalPlateNo;
        private Long driverId;
        private String driverEmpNo;
        private String driverName;
        private String drivingMode;
        private Integer passengerCount;
        private String purpose;
        private String origin;
        private String destination;
        private String plannedStart;
        private String plannedEnd;
        private String assignByName;
        private String assignAt;
        private String directReason;
        private String conflictNote;
        private Long prevUseId;
        private Integer version;
        private String updatedBy;
        private String updatedAt;

        /** 1:1 行程（未出车为 null） */
        private Trip trip;
        /** 当前可执行动作：由服务端按状态与权限算，前端不自己推断按钮可见性 */
        private List<String> allowedActions;
        /** 车辆当前是否仍可派（含保险/检验/维修），供详情解释"为什么派不了" */
        private List<String> vehicleBlockers;
        /** 建单时间（已格式化为 yyyy-MM-dd HH:mm:ss） */
        private String createdAt;
    }

    /** 行程视图 */
    @Data
    public static class Trip {
        private Long id;
        private String vehiclePlateNo;
        private String status;
        private String departAt;
        private BigDecimal startOdometer;
        private Boolean keyReceived;
        private Boolean conditionOk;
        private String departByName;
        private String departRegisteredAt;
        private String returnAt;
        private BigDecimal endOdometer;
        private String returnPlace;
        private Boolean keyReturned;
        private String vehicleCondition;
        private String exceptionNote;
        private String confirmByName;
        private String confirmAt;
        private BigDecimal mileage;
        private BigDecimal durationHours;
        private List<String> flags;
        private String backfillEntryAt;
        private Integer version;
    }

    /**
     * 授权直接登记入参（建立"待出车"单，四重前置条件在服务层校验）。
     *
     * <p>directReason 必填：没有原因的代登记无法事后追责，也不满足"审批结论与来源对应"的
     * 数据库检查约束。
     */
    @Data
    public static class DirectRegister {
        private Long vehicleId;
        private String actualUserName;
        private Long departmentId;
        private Long driverId;
        private String purpose;
        private String origin;
        private String destination;
        private LocalDateTime plannedStart;
        private LocalDateTime plannedEnd;
        private Integer passengerCount;
        private String directReason;
        /** 出车时可一并带出的起始里程；为空则取档案当前里程 */
        private BigDecimal startOdometer;
        private String requestKey;
    }

    /** 发起用车申请（一期只落草稿；OA 审批对接在 B2 提供） */
    @Data
    public static class Draft {
        private Long intentVehicleId;
        private String actualUserName;
        private String purpose;
        private String origin;
        private String destination;
        private LocalDateTime plannedStart;
        private LocalDateTime plannedEnd;
        private String drivingMode;
        private Integer passengerCount;
        private String requestKey;
    }

    /** 车辆安排入参：申请时段与用车人在本页不可改 */
    @Data
    public static class Assign {
        private Long useId;
        private Long vehicleId;
        private Long driverId;
        /** 受前车晚归影响等说明，可选 */
        private String conflictNote;
        private String reason;
        private String requestKey;
    }

    /** 出车登记入参 */
    @Data
    public static class Depart {
        private Long useId;
        private LocalDateTime departAt;
        private BigDecimal startOdometer;
        private Boolean keyReceived;
        private Boolean conditionOk;
        private String requestKey;
    }

    /** 归还登记入参：晚归据实登记，服务端只加标识，不倒改批准时段 */
    @Data
    public static class Return {
        private Long useId;
        private LocalDateTime returnAt;
        private BigDecimal endOdometer;
        private String returnPlace;
        private Boolean keyReturned;
        private String vehicleCondition;
        private String exceptionNote;
        private String requestKey;
    }

    /** 归还确认入参（确认后才计入正式台账） */
    @Data
    public static class Confirm {
        private Long useId;
        private String reason;
        private String requestKey;
    }

    /**
     * 授权更正入参。
     *
     * <p>更正不是编辑：reason 必填，服务端保留 beforeJson/afterJson，
     * 涉及人/时间/里程时会重校验相邻记录，冲突则转入争议核对而不覆盖旧单。
     */
    @Data
    public static class Correct {
        private Long useId;
        private Long driverId;
        private LocalDateTime departAt;
        private LocalDateTime returnAt;
        private BigDecimal startOdometer;
        private BigDecimal endOdometer;
        private String reason;
        private String requestKey;
    }

    /** 事后补录入参：实际发生时间与系统登记时间分离，先入待核对 */
    @Data
    public static class Backfill {
        private Long vehicleId;
        private String actualUserName;
        private Long departmentId;
        private Long driverId;
        private String purpose;
        private String origin;
        private String destination;
        private LocalDateTime departAt;
        private BigDecimal startOdometer;
        private LocalDateTime returnAt;
        private BigDecimal endOdometer;
        private String returnPlace;
        private Integer passengerCount;
        /** 补录原因（无事前系统审批，必须说明依据） */
        private String reason;
        private String requestKey;
    }

    /** 待办分组统计（办理页顶部 4 张卡） */
    @Data
    public static class TodoStats {
        private long toAssign;
        private long toDepart;
        private long inUse;
        private long toConfirm;
        private long overdue;
        /**
         * 各办理分组的徽标数，key 与 {@code Query.group} 取值一致。
         *
         * <p>为什么不让前端自己数：列表是分页的，前端数出来的是「本页有几条」而不是
         * 「待办有几条」，数据一多就会漏办。这里与列表走同一个条件构造器，口径天然一致。
         */
        private Map<String, Long> groupCounts;
    }

    /** 台账汇总（口径唯一出口，页面与导出共用） */
    @Data
    public static class LedgerStats {
        private long tripCount;
        private long vehicleCount;
        private long driverCount;
        private BigDecimal totalMileage;
        private BigDecimal totalHours;
        private long overdueCount;
        private long pendingCount;
    }

    /** 部门/车辆维度汇总行 */
    @Data
    public static class SummaryRow {
        private Long keyId;
        private String name;
        private long tripCount;
        private BigDecimal totalMileage;
    }

    /** 审计事件视图（受限独立记录页） */
    @Data
    public static class EventVO {
        private Long id;
        private String action;
        private String operatorName;
        private String operatorEmpNo;
        private String occurredAt;
        private String reason;
        private String beforeJson;
        private String afterJson;
    }
}
