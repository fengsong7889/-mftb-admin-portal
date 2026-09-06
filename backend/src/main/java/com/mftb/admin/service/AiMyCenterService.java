package com.mftb.admin.service;

import com.mftb.admin.dto.AiMyCenterDTO;

import java.util.List;

/**
 * 智能中心「我的」视图服务：首页 AI 助手「我的用量」与「智能路由」数据源
 */
public interface AiMyCenterService {

    /**
     * 当前账号的额度维度与实际用量。
     * 维度覆盖四类配置：员工额度/部门额度（ai_quota_config）、职位额度（ai_emp_quota_policy）、
     * 角色额度（ai_role_quota_policy）；已用量按 biz_llm_usage 明细实时聚合。
     *
     * @return 未登录时返回 null
     */
    AiMyCenterDTO.MyQuotaUsageVO myQuotaUsage();

    /**
     * 当前账号被授权的启用模型列表（部门策略组/职位/角色/员工四个维度取并集）
     */
    List<AiMyCenterDTO.MyModelVO> myModels();

    /**
     * 配额校验闭环：判定当前账号调用指定模型是否放行。
     * 汇总所有作用于该模型的额度维度，按团队成员聚合本期已用，命中限额时消费
     * over_limit_action（reject/approve/downgrade）与 downgrade_model_id 给出处置。
     *
     * @param modelId  目标模型 ID（与 modelKey 二选一，modelId 优先）
     * @param modelKey 目标模型标识
     */
    AiMyCenterDTO.QuotaCheckVO checkQuota(Long modelId, String modelKey);
}
