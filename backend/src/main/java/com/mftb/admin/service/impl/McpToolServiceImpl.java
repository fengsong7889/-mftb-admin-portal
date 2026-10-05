package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.McpToolMapper;
import com.mftb.admin.service.McpToolService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * MCP 工具广场与已安装清单的实现，契约见 {@link McpToolService}。仅依赖单个 Mapper，无事务方法（安装/卸载为单表写入）。
 * <p>
 * 协作依赖：McpToolMapper。
 */

@Service
@RequiredArgsConstructor
public class McpToolServiceImpl implements McpToolService {

    private final McpToolMapper mcpToolMapper;

    @Override
    public List<McpTool> listTools() {
        return mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                .eq(McpTool::getEnabled, 1)
                .orderByAsc(McpTool::getSort)
                .orderByAsc(McpTool::getId));
    }

    @Override
    public List<McpTool> listInstalled() {
        // 内置与外部工具的 manifest 均下发给 AI 助手（多轮编排的基础）：
        // 内置工具前端直调后端 API；外部工具执行链路 = 前端人工确认 → /api/mcp/exec 服务端网关
        return mcpToolMapper.selectList(new LambdaQueryWrapper<McpTool>()
                .eq(McpTool::getEnabled, 1)
                .eq(McpTool::getInstalled, 1)
                .orderByAsc(McpTool::getSort)
                .orderByAsc(McpTool::getId));
    }

    @Override
    public void install(String toolKey, String operator) {
        McpTool tool = requireTool(toolKey);
        if (tool.getInstalled() != null && tool.getInstalled() == 1) {
            return; // 幂等
        }
        tool.setInstalled(1);
        tool.setInstalledBy(operator);
        tool.setInstalledAt(LocalDateTime.now());
        mcpToolMapper.updateById(tool);
    }

    @Override
    public void uninstall(String toolKey) {
        McpTool tool = requireTool(toolKey);
        if (tool.getInstalled() == null || tool.getInstalled() == 0) {
            return; // 幂等
        }
        tool.setInstalled(0);
        tool.setInstalledBy(null);
        tool.setInstalledAt(null);
        mcpToolMapper.updateById(tool);
    }

    private McpTool requireTool(String toolKey) {
        McpTool tool = mcpToolMapper.selectOne(new LambdaQueryWrapper<McpTool>()
                .eq(McpTool::getToolKey, toolKey)
                .last("LIMIT 1"));
        if (tool == null) {
            throw new IllegalArgumentException("工具不存在: " + toolKey);
        }
        return tool;
    }
}
