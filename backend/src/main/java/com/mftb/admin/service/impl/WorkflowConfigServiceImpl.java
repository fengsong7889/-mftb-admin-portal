package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.WorkflowConfigVO;
import com.mftb.admin.entity.WorkflowConfig;
import com.mftb.admin.mapper.WorkflowConfigMapper;
import com.mftb.admin.service.WorkflowConfigService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 流程配置服务实现
 * 带内存缓存（5分钟TTL）避免高频查库
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowConfigServiceImpl implements WorkflowConfigService {

    private final WorkflowConfigMapper workflowConfigMapper;
    private final OperatorResolver operatorResolver;

    /** 缓存有效期：5 分钟 */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    /** 缓存的流程配置：flowType -> approvalEnabled */
    private volatile Map<String, Boolean> approvalCache = new HashMap<>();

    /** 缓存上次加载时间戳 */
    private volatile long lastLoadTime = 0;

    @Override
    public List<WorkflowConfigVO> listAll() {
        List<WorkflowConfig> configs = workflowConfigMapper.selectList(
                new LambdaQueryWrapper<WorkflowConfig>().orderByAsc(WorkflowConfig::getId));
        return configs.stream().map(WorkflowConfigVO::from).toList();
    }

    @Override
    public void updateApprovalEnabled(String flowType, boolean approvalEnabled) {
        WorkflowConfig config = workflowConfigMapper.selectOne(
                new LambdaQueryWrapper<WorkflowConfig>()
                        .eq(WorkflowConfig::getFlowType, flowType));
        if (config == null) {
            throw new BusinessException("流程类型不存在: " + flowType);
        }

        int value = approvalEnabled ? 1 : 0;
        workflowConfigMapper.update(null,
                new LambdaUpdateWrapper<WorkflowConfig>()
                        .eq(WorkflowConfig::getFlowType, flowType)
                        .set(WorkflowConfig::getApprovalEnabled, value)
                        .set(WorkflowConfig::getUpdatedBy, operatorResolver.currentOperatorName()));

        // 立即刷新缓存
        approvalCache.put(flowType, approvalEnabled);
        log.info("流程配置已更新: {} 审批开关 = {}", flowType, approvalEnabled ? "启用" : "停用");
    }

    @Override
    public boolean isApprovalEnabled(String flowType) {
        long now = System.currentTimeMillis();
        if (now - lastLoadTime > CACHE_TTL_MS) {
            loadFromDb();
        }
        return approvalCache.getOrDefault(flowType, true); // 默认启用审批
    }

    /** 从数据库加载所有流程配置并刷新缓存 */
    private synchronized void loadFromDb() {
        // 双重检查，避免并发重复加载
        if (System.currentTimeMillis() - lastLoadTime <= CACHE_TTL_MS) {
            return;
        }
        try {
            List<WorkflowConfig> configs = workflowConfigMapper.selectList(null);
            Map<String, Boolean> newCache = new HashMap<>();
            for (WorkflowConfig config : configs) {
                newCache.put(config.getFlowType(),
                        config.getApprovalEnabled() != null && config.getApprovalEnabled() == 1);
            }
            approvalCache = newCache;
            lastLoadTime = System.currentTimeMillis();
        } catch (Exception e) {
            log.warn("加载流程配置缓存失败: {}", e.getMessage());
        }
    }

    @Override
    public void updateNodesConfig(String flowType, String nodesConfig, String routingRules) {
        WorkflowConfig config = workflowConfigMapper.selectOne(
                new LambdaQueryWrapper<WorkflowConfig>()
                        .eq(WorkflowConfig::getFlowType, flowType));
        if (config == null) {
            throw new BusinessException("流程类型不存在: " + flowType);
        }
        workflowConfigMapper.update(null,
                new LambdaUpdateWrapper<WorkflowConfig>()
                        .eq(WorkflowConfig::getFlowType, flowType)
                        .set(WorkflowConfig::getNodesConfig, nodesConfig)
                        .set(WorkflowConfig::getRoutingRules, routingRules)
                        .set(WorkflowConfig::getUpdatedBy, operatorResolver.currentOperatorName()));
        log.info("流程配置已更新: {} 节点配置和路由规则", flowType);
    }
}
