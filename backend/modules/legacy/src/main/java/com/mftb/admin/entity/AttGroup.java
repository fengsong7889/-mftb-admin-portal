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
 * 考勤组：考勤结论的最小计算单位。
 * <p>
 * 判定「某人某天按什么规则出勤」只认 {@code att_group_member}（带生效区间），
 * {@code scopeText} 是给管理页看的范围快照，不参与判定——多门店场景若不显式定义考勤地
 * 与成员归属，月度汇总口径必然返工。
 * <p>
 * {@code punchSources} 是逗号分隔的来源码（1=钉钉同步 2=手工导入），同期启用时
 * 同一次打卡以先入库来源为准，靠 {@code uk_punch_active_idem} 保证不重复。
 */
@Data
@TableName("att_group")
public class AttGroup {

    /** 制度：固定班制 */
    public static final int TYPE_FIXED = 1;
    /** 制度：排班制 */
    public static final int TYPE_ROTATION = 2;
    /** 制度：自由工时 */
    public static final int TYPE_FLEX = 3;

    /** 来源：钉钉同步 */
    public static final int SOURCE_DINGTALK = 1;
    /** 来源：手工导入 */
    public static final int SOURCE_IMPORT = 2;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 考勤组编号（AG+YYYYMM+4 位，系统生成） */
    private String groupNo;

    private String groupName;

    /** 1=固定班制 2=排班制 3=自由工時 */
    private Integer groupType;

    /** 1=按部門 2=按門店 3=按名單（只决定录入方式，判定以成员表为准） */
    private Integer scopeType;

    /** 成员范围描述快照 */
    private String scopeText;

    /** 考勤地 */
    private String workPlace;

    /** 默认班次；固定班制必填 */
    private Long shiftId;

    private Integer lateGraceMin;

    private Integer earlyGraceMin;

    /** 已开通来源，逗号分隔，如 "1" 或 "1,2" */
    private String punchSources;

    /** 状态：enabled / disabled */
    private String status;

    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
