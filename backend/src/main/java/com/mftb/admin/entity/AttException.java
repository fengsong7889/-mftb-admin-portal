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
 * 考勤异常与处理状态。
 * <p>
 * 本页只负责「发现异常 + 指派处理方式 + 回显结果」；补卡/请假/加班等申请一律在
 * 流程审批系统发起，{@code flowNo}/{@code oaRequestId} 只存引用，审批回调按 oaRequestId
 * 定位本行并回写状态。重算时按 {@code (user_id, work_date, exception_type)} 更新而不是追加。
 */
@Data
@TableName("att_exception")
public class AttException {

    /** 类型：迟到 */
    public static final int TYPE_LATE = 1;
    /** 类型：早退 */
    public static final int TYPE_EARLY = 2;
    /** 类型：缺卡 */
    public static final int TYPE_MISSING_CARD = 3;
    /** 类型：旷工 */
    public static final int TYPE_ABSENT = 4;
    /** 类型：未排班 */
    public static final int TYPE_UNSCHEDULED = 5;

    /** 状态：待处理 */
    public static final int STATUS_PENDING = 1;
    /** 状态：已补卡 */
    public static final int STATUS_HANDLED = 2;
    /** 状态：已请假抵扣 */
    public static final int STATUS_LEAVE = 3;
    /** 状态：已加班抵扣 */
    public static final int STATUS_OVERTIME = 4;
    /** 状态：已确认（不抵扣） */
    public static final int STATUS_CONFIRMED = 5;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String empNo;

    private String empName;

    private Long deptId;

    private String deptName;

    private Long groupId;

    private String groupName;

    private LocalDate workDate;

    /** 1=遲到 2=早退 3=缺卡 4=曠工 5=未排班 */
    private Integer exceptionType;

    /** 量化描述，如「遲到 23 分鐘」；由判定引擎写入，人工不得修改 */
    private String detail;

    /** 迟到/早退分钟数，供薪酬扣减口径引用 */
    private Integer lateMinutes;

    /** 1=待處理 2=已補卡 3=已請假抵扣 4=已加班抵扣 5=已確認 */
    private Integer status;

    private String flowNo;

    private Long oaRequestId;

    private String handler;

    private LocalDateTime handledAt;

    /**
     * 处理说明（确认原因 / 补卡原因）。
     * <p>与 {@code detail} 分列：detail 是引擎写入的判定明细，把人工备注追加进去
     * 会与重算互相覆盖，且 VARCHAR(200) 在长备注下会直接报数据过长。
     */
    private String handleRemark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
