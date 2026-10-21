package com.mftb.admin.dto;

import lombok.Data;

/** 会话摘要结果：前端据此把旧消息替换为真实摘要。 */
@Data
public class AiConversationSummaryVO {

    /** 是否真的生成了摘要（消息太少时为 false） */
    private boolean compressed;

    /** 摘要正文 */
    private String summary;

    /** 被摘要的旧消息条数 */
    private int coveredCount;

    /** 保留的最近消息条数 */
    private int keptCount;

    /** 本次摘要消耗 tokens */
    private long tokens;

    /** 实际使用的模型 */
    private String model;
}
