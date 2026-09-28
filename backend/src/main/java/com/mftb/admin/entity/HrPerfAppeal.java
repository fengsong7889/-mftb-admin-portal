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
 * 績效申诉登记（轻量登记，不走 OA 流程）。
 * <p>
 * 只允许对「已确认」的结果提申诉：结果未确认前本就对本人不可见，没有可申诉的对象。
 * HR 受理后可直接走改判修订结果（带留痕、refAppealId 回指本单），不重走审批。
 * 参考 SQL: backend/sql/202_hr_perf_report.sql
 */
@Data
@TableName("hr_perf_appeal")
public class HrPerfAppeal {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 申诉单号（PA + YYYYMMDD + 序号） */
    private String reqNo;

    /** 被申诉的考核单 */
    private Long assessmentId;

    /** 所属计划 */
    private Long planId;

    /** 申诉人（即被考核人） */
    private Long userId;

    /** 工号快照 */
    private String empNo;

    /** 姓名快照 */
    private String empName;

    /** 部门快照 */
    private String deptName;

    /** 计划名称快照（台账跨计划列表要能认出是哪一次考核） */
    private String planName;

    /** 申诉理由（必填） */
    private String reason;

    /** 期望处理（可空） */
    private String expectation;

    /** 状态：pending/processing/resolved/rejected */
    private String status;

    /** 受理人 ID */
    private Long handlerUserId;

    /** 受理人姓名快照 */
    private String handlerName;

    /** 办结时间 */
    private LocalDateTime handledAt;

    /** 处理结论（办结/驳回时必填） */
    private String conclusion;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
