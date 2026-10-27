package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 任务依赖实体（阶段 5：关键路径的边集）。
 * <p>首期只支持 FS（前驱完成后后继才能开始）+ 工作日延迟：这是研发协作里唯一
 * 几乎不产生歧义的依赖语义；SS/FF 会在没有真实排程经验时制造算不对的关键路径。
 */
@Data
@TableName("rdm_task_dependency")
public class RdmTaskDependency {

    /** 依赖类型：完成-开始 */
    public static final String TYPE_FS = "FS";

    /** 阻断点：开工阻断（Batch 2） */
    public static final String BLOCK_START = "start";
    /** 阻断点：提测阻断（Batch 2） */
    public static final String BLOCK_TEST = "test";
    /** 阻断点：上线阻断（Batch 2） */
    public static final String BLOCK_RELEASE = "release";

    @TableId
    private Long id;

    /** 所属需求（两端任务必须同属该需求） */
    private Long reqId;

    /** 前驱任务 */
    private Long predTaskId;

    /** 后继任务 */
    private Long succTaskId;

    /** 依赖类型，首期固定 FS */
    private String depType = TYPE_FS;

    /** 延迟工作日数（可为负，表示允许提前重叠） */
    private Integer lagDays;

    /** 阻断点:start/test/release（Batch 2，跨交付项依赖在哪个节点阻断后续） */
    private String blockPoint = BLOCK_START;

    /** 是否跨交付项（Batch 2）：1=跨交付项依赖，0=同需求内任务依赖 */
    private Integer crossDeliveryFlag = 0;

    /** 前置交付项ID（Batch 2，跨交付项依赖时非空） */
    private Long predDeliveryItemId;

    /** 后续交付项ID（Batch 2，跨交付项依赖时非空） */
    private Long succDeliveryItemId;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
