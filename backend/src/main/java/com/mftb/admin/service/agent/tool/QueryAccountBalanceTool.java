package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * query_account_balance 工具（V0 §B.1 从前端搬到后端）。
 * <p>直调 {@link FinAccountService#page(FinAccountQuery)}，权限 & 集团数据范围由 service 内部处理。
 * 保留前端旧行为：page=1、size=10；金额千分位由 LLM 端格式化。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QueryAccountBalanceTool implements AgentTool {

    private final FinAccountService finAccountService;
    private final ObjectMapper objectMapper;

    @Override
    public String toolKey() { return "query_account_balance"; }

    @Override
    public String description() {
        return "查詢集團賬戶的推廣金餘額（虛擬餘額和實際餘額），可按集團名稱、品牌篩選";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("groupName", Map.of("type", "string", "description", "集團名稱（支持模糊匹配）"));
        props.put("brand", Map.of("type", "string", "description", "品牌：1=閃蜂, 2=mFood", "enum", List.of("1", "2")));
        return Map.of(
                "type", "object",
                "properties", props
        );
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        try {
            FinAccountQuery query = new FinAccountQuery();
            query.setPage(1);
            query.setSize(10);
            if (args != null) {
                Object gn = args.get("groupName"); if (gn != null) query.setGroupName(String.valueOf(gn));
                Object br = args.get("brand"); if (br != null) query.setBrand(String.valueOf(br));
            }
            PageResult<FinAccountVO> result = finAccountService.page(query);
            List<FinAccountVO> rows = result.getRecords();
            if (rows == null || rows.isEmpty()) {
                return toJson(Map.of("message", "未找到符合條件的賬戶", "total", 0));
            }
            List<Map<String, Object>> summary = rows.stream().map(r -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("集團", r.getGroupName());
                row.put("集團ID", r.getGroupId());
                row.put("品牌", brandLabel(r.getBrand()));
                row.put("虛擬餘額", r.getVirtualBalance());
                row.put("實際餘額", r.getActualBalance());
                row.put("狀態", statusLabel(r.getStatus()));
                return row;
            }).toList();
            return toJson(Map.of("total", result.getTotal(), "records", summary));
        } catch (Exception e) {
            log.warn("[AgentTool] query_account_balance 失敗 caller={}: {}", ctx.caller(), e.getMessage());
            return errorJson("查询失败: " + e.getMessage());
        }
    }

    private static String brandLabel(String b) {
        if ("1".equals(b) || "flashBee".equals(b)) return "閃蜂";
        if ("2".equals(b) || "mFood".equals(b)) return "mFood";
        return b;
    }

    private static String statusLabel(String s) {
        if (s == null) return null;
        return switch (s) {
            case "normal" -> "正常";
            case "frozen" -> "凍結";
            case "mergeFrozen" -> "合併凍結";
            default -> s;
        };
    }

    private String toJson(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception e) { return errorJson(e.getMessage()); }
    }

    private static String errorJson(String msg) {
        return "{\"error\":\"" + (msg == null ? "unknown" : msg.replace("\"", "'")) + "\"}";
    }
}
