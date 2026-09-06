package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.McpToolMapper;
import com.mftb.admin.service.McpExecService;
import com.mftb.admin.service.McpExternalHandler;
import com.mftb.admin.util.OperatorResolver;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * MCP 外部工具統一執行網關（MCP tools/call 語義的服務端落地）
 * 執行鏈路：AI 發起 → 前端人工確認（AI 操作授權 L3 治理）→ 本網關 → 對應 McpExternalHandler
 * 服務端兜底校驗：工具存在且已安裝、source=external、執行器已接入；調用結果日誌留痕
 */
@Slf4j
@Service
public class McpExecServiceImpl implements McpExecService {

    private final McpToolMapper mcpToolMapper;
    private final OperatorResolver operatorResolver;
    private final Map<String, McpExternalHandler> handlers;

    public McpExecServiceImpl(McpToolMapper mcpToolMapper, OperatorResolver operatorResolver,
                              List<McpExternalHandler> handlerList) {
        this.mcpToolMapper = mcpToolMapper;
        this.operatorResolver = operatorResolver;
        this.handlers = handlerList.stream()
                .collect(Collectors.toMap(McpExternalHandler::toolKey, Function.identity()));
    }

    @Override
    public String execute(String toolKey, Map<String, Object> args) {
        McpTool tool = mcpToolMapper.selectOne(new LambdaQueryWrapper<McpTool>()
                .eq(McpTool::getToolKey, toolKey)
                .last("LIMIT 1"));
        if (tool == null || tool.getInstalled() == null || tool.getInstalled() != 1) {
            throw new IllegalArgumentException("外部服務未安裝或不存在: " + toolKey);
        }
        if (!"external".equals(tool.getSource())) {
            throw new IllegalArgumentException("僅外部服務經執行網關調用: " + toolKey);
        }
        McpExternalHandler handler = handlers.get(toolKey);
        if (handler == null) {
            throw new IllegalStateException("該外部服務執行器尚未接入: " + tool.getName()
                    + "（執行鏈路建設中，可先卸載避免 AI 誤調用）");
        }
        String result = handler.execute(args == null ? Map.of() : args);
        log.info("[MCP Exec] {}({}) by {} → {}", toolKey, tool.getName(),
                operatorResolver.currentOperatorName(), result);
        return result;
    }
}
