package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 项目主表实体
 *
 * <p><b>六组负责人列为什么都标 {@code updateStrategy = ALWAYS}</b>：MyBatis-Plus 默认
 * NOT_NULL 策略会把 null 字段从 SET 子句里剔除，所以「把负责人置空」在
 * {@code updateById} 下永远写不进去（哨兵只判「本次有没有提供该角色」，提供为空时反而丢写）。
 * 因此这 12 列无条件入 SET。
 * <p><b>前置约束（改此实体前必读）</b>：唯一的写入口 RdmProjectService#updateProject 是先
 * {@code selectById} 加载全行、再改、再 {@code updateById}。若新增任何「只塞 id + 部分字段」
 * 的拼装式 updateById，六组负责人会被整体洗空。
 */
@Data
@TableName("rdm_project")
public class RdmProject {

    @TableId
    private Long id;

    /** 项目编号 */
    private String projectNo;

    /** 项目名称 */
    private String name;

    /** 项目目标 */
    private String objective;

    /** 项目经理用户ID */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long pmUserId;

    /** 项目经理姓名 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String pmUserName;

    /** 产品负责人用户ID */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long productOwnerUserId;

    /** 产品负责人姓名 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String productOwnerUserName;

    /** 技术负责人用户ID */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long techLeadUserId;

    /** 技术负责人姓名 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String techLeadUserName;

    /** UI 设计负责人用户ID */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long uiDesignerUserId;

    /** UI 设计负责人姓名 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String uiDesignerUserName;

    /** 测试/QA 负责人用户ID */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long qaLeadUserId;

    /** 测试/QA 负责人姓名 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String qaLeadUserName;

    /** 运维/DevOps 负责人用户ID */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long opsLeadUserId;

    /** 运维/DevOps 负责人姓名 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String opsLeadUserName;

    /** 计划开始日期 */
    private LocalDate planStartDate;

    /** 计划结束日期 */
    private LocalDate planEndDate;

    /** 默认验收路径(A=先验收后上线,B=先上线后验收) */
    private String defaultAcceptancePath;

    /** 状态:preparing/in_progress/partial_delivered/all_delivered/closed */
    private String status;

    /** 暂停标记 */
    private Integer pausedFlag;

    /** 风险标记 */
    private Integer riskFlag;

    /** 逾期标记 */
    private Integer overdueFlag;

    /** 范围摘要JSON */
    private String scopeSummaryJson;

    /**
     * 最后更新人姓名快照（rdm:schema:v3.14）。
     * <p>刻意不加 {@code @TableField(fill = INSERT_UPDATE)}：项目的 MetaObjectHandler 只按名字
     * 填 createdAt / updatedAt，挂上 fill 只会让人误以为有人写过它。由 RdmProjectService 显式赋值。
     */
    private String updatedBy;

    /** 乐观锁版本 */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
