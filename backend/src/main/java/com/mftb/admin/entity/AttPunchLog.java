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
 * 打卡流水（只读账本）。
 * <p>
 * 三条硬约束：
 * ① 不提供人工修改入口，任何修正都通过异常处理发起补卡/请假/加班流程后由系统重算，
 *    否则审计链断裂；
 * ② {@code workDate} 在写入时按班次跨天规则定死，不由 {@code punchAt} 的日期推导；
 * ③ 幂等键 {@code (user_id, punch_at, source)}——钉钉同步重跑与重复导入都不能长出重复打卡。
 */
@Data
@TableName("att_punch_log")
public class AttPunchLog {

    /** 卡别：上班卡 */
    public static final int TYPE_ON = 1;
    /** 卡别：下班卡 */
    public static final int TYPE_OFF = 2;

    /** 判定：正常 */
    public static final int RESULT_NORMAL = 1;
    /** 判定：迟到 */
    public static final int RESULT_LATE = 2;
    /** 判定：早退 */
    public static final int RESULT_EARLY = 3;
    /** 判定：外勤 */
    public static final int RESULT_OUTSIDE = 4;
    /** 判定：无效卡 */
    public static final int RESULT_INVALID = 5;

    /** 来源：钉钉同步 */
    public static final int SOURCE_DINGTALK = 1;
    /** 来源：手工导入 */
    public static final int SOURCE_IMPORT = 2;
    /**
     * 来源：管理员补录/补卡回写。
     * <p>单独一个来源码是为了让「这张卡不是真打的」在数据里永远可辨；
     * 如果复用手工导入，事后无法区分批量导入与人工补录，审计链就断了。
     */
    public static final int SOURCE_REISSUE = 3;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String empNo;

    private String empName;

    /** 当时归属考勤组；可空（无组人员只存事实不出结论） */
    private Long groupId;

    /** 考勤日期（写入时定死） */
    private LocalDate workDate;

    private LocalDateTime punchAt;

    /** 1=上班卡 2=下班卡 */
    private Integer punchType;

    /** 1=釘釘同步 2=手工導入 */
    private Integer source;

    private String location;

    /** 外部原始记录 ID（钉钉 record id），用于同步去重与追溯 */
    private String rawRef;

    /** 1=正常 2=遲到 3=早退 4=外勤 5=無效卡 */
    private Integer result;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
