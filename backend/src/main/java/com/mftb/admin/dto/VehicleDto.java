package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 车辆档案与授权域的出入参契约
 *
 * <p>本模块的 DTO 收在两个聚合文件里（车辆域 / 用车域各一个），而不是拆成十几个近空文件：
 * 契约要能一眼看全，且对外只有一个 REST 资源前缀 {@code /api/vehicle}。
 * 字段命名与前端 {@code src/api/vehicle.ts} 的 interface 一一对应，改一边必须改另一边。
 *
 * <p>约定：所有 id 类字段是服务端稳定 ID（sys_user.id / sys_department.id / biz_vehicle.id），
 * 名称类字段只是展示快照，权限与归属判定一律不认名称。
 */
public final class VehicleDto {

    private VehicleDto() {
    }

    /** 列表查询条件（分页与排序字段由服务端白名单校验，不接收前端拼装的 order by） */
    @Data
    public static class Query {
        private Integer page = 1;
        private Integer size = 10;
        /** 车牌 / 车辆编号 / VIN */
        private String keyword;
        private String vehicleType;
        private String status;
        private Long manageDeptId;
        /** 所属法人主体 */
        private Long ownerCompanyId;
        /** 公司品牌：1=闪蜂 2=mFood */
        private Integer companyBrand;
        /** 只看某部门可用（数据范围过滤，不是前端可选的"排序"） */
        private Long usableByDeptId;
    }

    /** 列表行 / 详情通用视图 */
    @Data
    public static class VO {
        private Long id;
        private String vehicleCode;
        private String plateNo;
        private String registerRegion;
        private String vehicleType;
        private String vin;
        private Integer seatCount;
        private BigDecimal currentOdometer;
        private String status;
        private Boolean allowDirectRegister;
        private LocalDate insuranceValidUntil;
        private LocalDate inspectionValidUntil;
        /** 合规阻断原因（空=可派）：让界面能说明"为什么这台车不能选"，而不是静默隐藏 */
        private List<String> dispatchBlockers;
        private String verifyBy;
        /** 核验时间（已格式化为 yyyy-MM-dd HH:mm:ss） */
        private String verifyAt;
        private Long ownerCompanyId;
        private String ownerCompanyName;
        private Integer companyBrand;
        private Long manageDeptId;
        private String manageDeptName;
        private Long eamAssetId;
        private String eamAssetNo;
        private String remark;
        private List<DeptGrant> allowedDepts;
        private List<ManagerGrant> managers;
        /** 当前占用该车的有效预约/在途行程数 */
        private Long occupiedCount;
        /**
         * 出车时的建议起始里程：取 max(档案里程, 最近一次已确认行程结束里程)。
         * 与“起始里程不得低于已确认值”的服务端校验同口径，避免界面提示一个值、后端拒绝另一个值。
         */
        private java.math.BigDecimal suggestStartOdometer;
        private String updatedBy;
        /** 最后更新时间（已格式化为 yyyy-MM-dd HH:mm:ss） */
        private String updatedAt;
        /** 乐观锁版本：回传给前端，更新时带回以检测并发覆盖 */
        private Long version;
    }

    /** 新增/编辑入参 */
    @Data
    public static class Save {
        private Long id;
        /** 车牌与登记地区共同构成唯一键；换牌要留痕，走更正而非直接改档案 */
        private String plateNo;
        private String registerRegion;
        private String vehicleType;
        private String vin;
        private Integer seatCount;
        private BigDecimal currentOdometer;
        private String status;
        private Boolean allowDirectRegister;
        private LocalDate insuranceValidUntil;
        private LocalDate inspectionValidUntil;
        private Long ownerCompanyId;
        private Integer companyBrand;
        private Long manageDeptId;
        private String eamAssetNo;
        private String remark;
        private List<Long> allowedDeptIds;
        private List<ManagerGrant> managers;
        /** 幂等键：同一次提交重复点击只生效一次 */
        private String requestKey;
        /** 乐观锁：编辑时回传读取到的版本，不匹配则拒绝覆盖 */
        private Long expectVersion;
    }

    /** 运行状态变更（列表 Switch 用，独立动作，避免整份档案被覆盖） */
    @Data
    public static class StatusChange {
        private String status;
        private Long expectVersion;
        private String reason;
        private String requestKey;
    }

    /** 直接登记开关变更（配置动作，与办理权限分离） */
    @Data
    public static class DirectRegisterToggle {
        private Boolean enabled;
        private String reason;
        private Long expectVersion;
        private String requestKey;
    }

    /** 可用车辆查询入参：安排/直接登记/补录时决定下拉里能看到什么 */
    @Data
    public static class AvailableQuery {
        private Long departmentId;
        private LocalDateTime start;
        private LocalDateTime end;
        /** 排除自身单据（改派重排时不被自己的旧占用挡住） */
        private Long excludeUseId;
        /** 是否要求"允许授权直接登记" */
        private Boolean directOnly;
    }

    /** 可用车选项：blockers 非空表示不可派但可见 */
    @Data
    public static class Option {
        private Long vehicleId;
        private String vehicleCode;
        private String plateNo;
        private String vehicleType;
        private Integer seatCount;
        private BigDecimal currentOdometer;
        private String status;
        private String registerRegion;
        private Boolean allowDirectRegister;
        private List<String> blockers;
    }

    /** 部门授权项 */
    @Data
    public static class DeptGrant {
        private Long deptId;
        private String deptName;
    }

    /** 管理人员授权项：manage=可办理，view=仅可查阅 */
    @Data
    public static class ManagerGrant {
        private Long userId;
        private String empNo;
        private String empName;
        private String level;
    }

    /** 驾驶资格视图 */
    @Data
    public static class QualificationVO {
        private Long id;
        private Long userId;
        private String empNo;
        private String empName;
        private String region;
        private String licenseClass;
        private LocalDate validUntil;
        private String result;
        private String verifiedBy;
        /** 核验时间（已格式化） */
        private String verifiedAt;
        private String remark;
    }

    /**
     * 驾驶资格核验入参。
     *
     * <p>隐私边界：只收地区/准驾范围/有效期/核验人，明确不收驾驶证号与证件照片；
     * 传入多余字段会被忽略而不是顺手落库。
     */
    @Data
    public static class QualificationSave {
        private Long userId;
        private String region;
        private String licenseClass;
        private LocalDate validUntil;
        private String remark;
        private String requestKey;
    }
}
