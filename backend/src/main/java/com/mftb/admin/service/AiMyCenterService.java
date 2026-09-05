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
}
