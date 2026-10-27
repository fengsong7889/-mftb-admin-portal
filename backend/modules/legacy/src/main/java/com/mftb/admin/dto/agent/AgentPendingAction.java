package com.mftb.admin.dto.agent;

import lombok.Data;

/**
 * AI 助手待确认动作（当前仅用于“推送项目进度”）。
 *
 * <p>模型只能生成预览，真正的发送必须由前端确认卡调用
 * {@code POST /api/agent/actions/{id}/confirm} 完成；因此该对象不包含
 * 任何可直接触发发送的凭证。
 */
@Data
public class AgentPendingAction {

    private Long id;

    /** rdm_progress_group / rdm_progress_person / user_memory_save（二期） */
    private String type;

    private String title;

    /** 一句话说明：发到哪里、给谁 */
    private String summary;

    /** 预览文本（前端截断展示，可展开） */
    private String preview;

    /** yyyy-MM-dd HH:mm:ss */
    private String expiresAt;

    /** pending / processing / sent / failed / cancelled / expired */
    private String status;
}
