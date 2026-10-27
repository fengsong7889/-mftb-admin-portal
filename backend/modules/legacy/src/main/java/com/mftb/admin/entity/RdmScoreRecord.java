package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * RDM 产出积分流水实体（一条需求 × 一个人 × 一个角色 × 一个周期 = 一行）。
 * <p>两件事必须由结构保证而不是靠代码自觉：
 * <ol>
 *   <li>{@code uk(req_id,user_id,role_code,period_code)} —— 重算走幂等 upsert，
 *       不能"先全删再插"，否则并发重算会产生双份分数，绩效总分直接失真；</li>
 *   <li>因子与规则版本随分数一起快照 —— 事后调规则、改需求都不影响已出分的可解释性。</li>
 * </ol>
 */
@Data
@TableName("rdm_score_record")
public class RdmScoreRecord {

    @TableId
    private Long id;

    /** 业务需求ID */
    private Long reqId;

    /** 得分人 sys_user.id */
    private Long userId;

    /** 工号快照 */
    private String empNo;

    /** 姓名快照 */
    private String userName;

    /** 部门ID快照 */
    private Long deptId;

    /** 部门名称快照 */
    private String deptName;

    /** 计分角色 */
    private String roleCode;

    /** 绩效周期编码 */
    private String periodCode;

    /** 最终得分 */
    private BigDecimal score;

    /** 基准分（复杂度权重 × 单位分） */
    private BigDecimal baseScore;

    /** 类型系数 */
    private BigDecimal typeFactor;

    /** 优先级系数 */
    private BigDecimal priorityFactor;

    /** 按时因子 */
    private BigDecimal onTimeFactor;

    /** 质量因子 */
    private BigDecimal qualityFactor;

    /** 角色系数 */
    private BigDecimal roleFactor;

    /** 成因明细 JSON（申诉复算依据） */
    private String breakdownJson;

    /** 命中的规则版本（历史不可变） */
    private Integer ruleVersion;

    /** 需求复杂度快照 */
    private String complexity;

    /** 需求类型快照 */
    private String reqType;

    /** 需求优先级快照 */
    private String priority;

    /** 是否按时上线 */
    private Integer onTime;

    /** 逾期天数 */
    private Integer lateDays;

    /** 验收返工次数快照 */
    private Integer reworkCount;

    /** 验收满意度快照 */
    private Integer acceptanceScore;

    /** 验收是否一次通过 */
    private Integer firstPass;

    /** 绩效推送状态: none/suggested/confirmed/rejected */
    private String pushStatus;

    /** 推送时间 */
    private LocalDateTime pushedAt;

    /** 计算时间 */
    private LocalDateTime calculatedAt;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
