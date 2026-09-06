package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.McpToolMapper;
import com.mftb.admin.service.McpToolService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

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
        // 內置與外部工具的 manifest 均下發給 AI 助手（多輪編排的基礎）：
        // 內置工具前端直調後端 API；外部工具執行鏈路 = 前端人工確認 → /api/mcp/exec 服務端網關
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
            return; // 冪等
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
            return; // 冪等
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
