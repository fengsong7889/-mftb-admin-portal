package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 雇佣数据差异清单项：一个员工一行，列出两份事实源各自的值与差异类别码。
 * <p>
 * 只回对照所需的字段，不回证件号/手机号等敏感值 —— 这份清单是给 HR 做数据确认用的，
 * 不是敏感数据导出通道（方案 §7.3「列表返回最小字段」）。
 */
@Data
public class ProfileDiffItemVO {

    private Long userId;
    private String empId;
    private String name;

    /** 账号状态：1 启用 / 0 停用（sys_user.status，认证维） */
    private Integer accountStatus;

    /** 人事在职状态：active / resigned（由任职事实派生，与账号状态正交） */
    private String employmentStatus;

    /** 账号快照部门（sys_user.department） */
    private String snapshotDept;

    /** 账号快照职位（sys_user.position） */
    private String snapshotPosition;

    /** 该时点生效任职的部门（emp_position_record.service_dept） */
    private String asOfDept;

    /** 该时点生效任职的职位 */
    private String asOfPosition;

    /** 该时点生效任职的雇主法人 */
    private String asOfCompany;

    /** 本次雇佣起点（来自任职锚点；未核实时为 null，绝不回填账号创建日） */
    private LocalDate employmentStart;

    /** 雇佣起点来源：POSITION_RECORD / MANUAL / UNVERIFIED */
    private String startDateSource;

    /** 已登记的雇佣期间段数 */
    private int registeredPeriods;

    /** 按任职事实可派生的雇佣期间段数 */
    private int derivedPeriods;

    /** 未来才生效的异动条数 */
    private int futureAssignments;

    /** 差异类别码（真值见 {@link com.mftb.admin.constant.HrProfileDiff}） */
    private List<String> codes = new ArrayList<>();

    /** 本行最高严重度：INFO / WARN / ERROR */
    private String severity;
}
