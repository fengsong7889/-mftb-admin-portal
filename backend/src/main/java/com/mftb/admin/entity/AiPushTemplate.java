package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 推送模板：项目进度群报/个人两版，内容用 {{placeholder}} 渲染。 */
@Data
@TableName("ai_push_template")
public class AiPushTemplate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** rdm_progress_group / rdm_progress_person */
    private String templateKey;

    private String name;

    /** group / person */
    private String targetType;

    /** 作用域：common=共用，其余为业务系统编码 */
    private String systemCode;

    private String titleTpl;

    private String contentTpl;

    /** active / disabled */
    private String status;

    private String updatedBy;

    private LocalDateTime updatedAt;
}
