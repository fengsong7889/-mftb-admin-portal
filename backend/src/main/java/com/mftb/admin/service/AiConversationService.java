package com.mftb.admin.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiConversation;

import java.util.List;

/**
 * AI 助手会话服务
 */
public interface AiConversationService {

    /** 列出当前用户所有会话（按更新时间倒序） */
    List<AiConversation> listMyConversations();

    /** 新建会话 */
    AiConversation createConversation();

    /** 更新会话（标题 / 消息 / 模型 / tokens） */
    void updateConversation(Long id, String title, String messages, String modelKey, Integer totalTokens);

    /** 删除指定会话（移至回收站） */
    void deleteConversation(Long id);

    /** 获取最大会话数配置 */
    int getMaxConversations();

    /* ── 回收站接口 ── */

    /** 列出当前用户已删除的会话（回收站） */
    List<AiConversation> listDeletedConversations();

    /** 恢复已删除的会话 */
    void restoreConversation(Long id);

    /** 永久删除已删除的会话 */
    void permanentDeleteConversation(Long id);

    /* ── 管理员审计接口 ── */

    /**
     * 管理员分页查询所有会话（支持按 keyword(工号或姓名) / modelKey / status / 创建时间 / 更新时间筛选）
     */
    Page<AiConversation> listAllConversations(int page, int size, String keyword, String modelKey,
                                              Integer status,
                                              String createStartDate, String createEndDate,
                                              String updateStartDate, String updateEndDate);

    /** 获取所有已使用过的模型标识列表（用于筛选下拉） */
    List<String> listDistinctModelKeys();

    /** 审计专用：按 ID 查询单条会话详情（含所有状态，含员工姓名） */
    AiConversation getConversationForAudit(Long id);
}
