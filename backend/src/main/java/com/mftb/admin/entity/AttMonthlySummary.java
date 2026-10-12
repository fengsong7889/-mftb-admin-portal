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
 * 月度考勤汇总——薪酬核算系统的取数出口。
 * <p>
 * 状态机严格单向：{@code draft 待確認 → frozen 已凍結 → synced 已同步薪酬}。
 * 冻结即代表"薪酬按这份数据算工资"，因此冻结后禁止回溯修改，唯一键
 * {@code (stat_month, user_id)} 保证一人一月一条（重复行等于重复发薪）。
 * 工时与天数一律 DECIMAL，禁止浮点。
 */
@Data
@TableName("att_monthly_summary")
public class AttMonthlySummary {

    /** 状态：待确认 */
    public static final String STATUS_DRAFT = "draft";
    /** 状态：已冻结 */
    public static final String STATUS_FROZEN = "frozen";
    /** 状态：已同步薪酬 */
    public static final String STATUS_SYNCED = "synced";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属月份 YYYY-MM */
    private String statMonth;

    /** 批次号（AT+YYYYMM+4 位），冻结时生成，供薪酬侧对账 */
    private String batchNo;

    private Long userId;

    private String empNo;

    private String empName;

    private Long deptId;

    private String deptName;

    private Long groupId;

    private String groupName;

    private BigDecimal shouldDays;

    private BigDecimal actualDays;

    private Integer lateTimes;

    private Integer lateMinutes;

    private Integer earlyTimes;

    private Integer missingTimes;

    private BigDecimal absentDays;

    private BigDecimal annualDays;

    private BigDecimal sickDays;

    private BigDecimal personalDays;

    private BigDecimal workdayOtHours;

    private BigDecimal restdayOtHours;

    private BigDecimal holidayOtHours;

    private BigDecimal attendRate;

    /** draft / frozen / synced */
    private String status;

    private String frozenBy;

    private LocalDateTime frozenAt;

    private LocalDateTime syncedAt;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
