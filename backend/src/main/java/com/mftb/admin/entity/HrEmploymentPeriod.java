package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 雇佣期间（一人多段）。
 * <p>
 * 存在的理由（方案 §7.1）：{@code sys_user} 承载的是「登录身份 + 当前任职投影」，
 * {@code emp_position_record} 承载的是「逐条异动事件」，两者都无法回答「这是他第几次被雇佣」
 * 「本次雇佣从哪天算起」「上一段什么时候结束」。缺这一层时，离职后再入职的人会被连成一段
 * 连续任职，本次任职时长与试用/合同口径全部失真。
 * <p>
 * <b>双轨期间它不是事实源</b>：列表与详情仍以 {@code sys_user} 投影 + as-of 任职解析为准，
 * 本表由 {@code HrEmploymentPeriodService} 从任职事实派生、经 HR 确认后登记，
 * 积累到可与投影对账后再讨论切读。派生入口的唯一约束是
 * 「不从 {@code sys_user.created_at} 猜真实入职日」（宁可留 UNVERIFIED 由差异报告暴露）。
 */
@Data
@TableName("hr_employment_period")
public class HrEmploymentPeriod {

    /** 在职段（尚未离职，或离职尚未到期生效） */
    public static final String STATUS_ACTIVE = "ACTIVE";
    /** 已结束段 */
    public static final String STATUS_ENDED = "ENDED";

    /** 入职日来自任职事实（入职/重新入职记录） */
    public static final String SOURCE_POSITION_RECORD = "POSITION_RECORD";
    /** 入职日由 HR 人工确认登记 */
    public static final String SOURCE_MANUAL = "MANUAL";
    /** 入职日未核实：不允许被当成真实入职日展示 */
    public static final String SOURCE_UNVERIFIED = "UNVERIFIED";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 员工身份锚点（sys_user.id） */
    private Long userId;

    /** 第几次雇佣，从 1 递增；重新入职开新段 */
    private Integer periodSeq;

    /** 雇主法人名称快照 */
    private String employerCompany;

    /** 雇主法人字典 id（sys_hr_dict EMPLOYER_COMPANY） */
    private Long employerCompanyId;

    /** 工作地点名称快照 */
    private String workLocation;

    /** 工作地点字典 id（sys_hr_dict WORK_LOCATION） */
    private Long workLocationId;

    /** 人员类别 */
    private String employeeCategory;

    /** 真实入职日；来源必须看 {@link #startDateSource} */
    private LocalDate startDate;

    /** 入职日来源：POSITION_RECORD / MANUAL / UNVERIFIED */
    private String startDateSource;

    /** 试用期结束日 */
    private LocalDate probationEndDate;

    /** 转正日期 */
    private LocalDate regularDate;

    /** 雇佣结束日（离职生效日） */
    private LocalDate endDate;

    /** 结束原因快照 */
    private String endReason;

    /** ACTIVE / ENDED */
    private String status;

    /** 产生本段的单据号（可追溯到人事流程） */
    private String sourceReqNo;

    private String createdBy;

    private String updatedBy;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
