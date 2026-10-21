package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 合规护栏规则：作用于用户输入或模型输出，支持 block/warn/replace。 */
@Data
@TableName("ai_guard_rule")
public class AiGuardRule {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** keyword / regex */
    private String ruleType;

    private String pattern;

    /** block / warn / replace */
    private String action;

    /** input / output / both */
    private String scope;

    private String replacement;

    private Integer enabled;

    private String remark;

    private String updatedBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
