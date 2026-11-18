/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * CPM AI 提取台账（复刻会议纪要 AI 安全模式，字段语义逐一对齐）。
 *
 * <p>request_key 幂等：同键同哈希返回原结果、同键换内容拒绝；processing 超 2 分钟
 * 由清扫作业置 expired；payload_json 只是本次调用的临时载荷，成功/过期后 7 天内清除——
 * 原始工作笔记是个人敏感正文，AI 台账不能变成第二份永久留档。
 */
@Data
@TableName("biz_cpm_ai_extraction")
public class CpmAiExtraction {

    public static final String STATUS_PROCESSING = "processing";
    public static final String STATUS_SUCCEEDED = "succeeded";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_EXPIRED = "expired";

    @TableId(type = IdType.AUTO)
    private Long id;

    private String requestKey;

    private Long userId;

    /** processing/succeeded/failed/expired */
    private String status;

    /** 原文 SHA-256 hex：幂等比对的唯一依据（正文本身不进哈希比对以外的场合） */
    private String inputHash;

    private String payloadJson;

    /** 结构化候选（预览用；用户确认前不落正式表） */
    private String resultJson;

    private String promptVersion;

    private Integer schemaVersion;

    /** 失败码：不存异常堆栈（错误详情只进日志，不出接口） */
    private String errorCode;

    /** token 用量 JSON（计量与预算扣减） */
    private String usageJson;

    private String modelKey;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
