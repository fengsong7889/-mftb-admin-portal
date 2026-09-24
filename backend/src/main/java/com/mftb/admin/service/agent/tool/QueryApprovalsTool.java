package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.FinApprovalQuery;
import com.mftb.admin.dto.FinApprovalVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinApprovalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** query_approvals 工具（V0 §B.1 后端化）：查审批中心流程状态 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QueryApprovalsTool implements AgentTool {

    private final FinApprovalService finApprovalService;
    private final ObjectMapper objectMapper;

    @Override
    public String toolKey() { return "query_approvals"; }

    @Override
    public String description() { return "查詢審批中心的流程狀態，可按審批類型和狀態篩選"; }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("approvalType", Map.of("type", "string", "description", "審批類型",
                "enum", List.of("recharge", "transfer", "deduct", "merge")));
        props.put("flowStatus", Map.of("type", "string", "description", "流程狀態",
                "enum", List.of("pending", "approved", "rejected", "cancelled")));
        props.put("groupName", Map.of("type", "string", "description", "集團名稱"));
        return Map.of("type", "object", "properties", props);
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        try {
            FinApprovalQuery query = new FinApprovalQuery();
            query.setPage(1);
            query.setSize(10);
            if (args != null) {
                putStr(args.get("approvalType"), query::setApprovalType);
                putStr(args.get("flowStatus"), query::setFlowStatus);
                putStr(args.get("groupName"), query::setGroupName);
            }
            PageResult<FinApprovalVO> result = finApprovalService.page(query);
            List<FinApprovalVO> rows = result.getRecords();
            if (rows == null || rows.isEmpty()) {
                return toJson(Map.of("message", "未找到符合條件的審批記錄", "total", 0));
            }
            List<Map<String, Object>> summary = rows.stream().map(r -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("集團", r.getGroupName());
                row.put("類型", typeLabel(r.getApprovalType()));
                row.put("流程號", r.getFlowNo());
                row.put("申請人", r.getApplicant());
                row.put("申請時間", r.getApplyTime());
                row.put("狀態", statusLabel(r.getFlowStatus()));
                row.put("駁回原因", StringUtils.hasText(r.getRejectReason()) ? r.getRejectReason() : "--");
                return row;
            }).toList();
            return toJson(Map.of("total", result.getTotal(), "records", summary));
        } catch (Exception e) {
            log.warn("[AgentTool] query_approvals 失敗 caller={}: {}", ctx.caller(), e.getMessage());
            return errorJson("查询失败: " + e.getMessage());
        }
    }

    private static String typeLabel(String t) {
        if (t == null) return null;
        return switch (t) {
            case "recharge" -> "充值";
            case "transfer" -> "轉賬";
            case "deduct" -> "扣款";
            case "merge" -> "合併";
            default -> t;
        };
    }

    private static String statusLabel(String s) {
        if (s == null) return null;
        return switch (s) {
            case "pending" -> "審批中";
            case "approved" -> "已通過";
            case "rejected" -> "已駁回";
            case "cancelled" -> "已撤銷";
            default -> s;
        };
    }

    private interface StrSetter { void set(String v); }
    private static void putStr(Object raw, StrSetter setter) {
        String v = raw == null ? null : String.valueOf(raw).trim();
        if (StringUtils.hasText(v)) setter.set(v);
    }
    private String toJson(Object v) {
        try { return objectMapper.writeValueAsString(v); }
        catch (Exception e) { return errorJson(e.getMessage()); }
    }
    private static String errorJson(String msg) {
        return "{\"error\":\"" + (msg == null ? "unknown" : msg.replace("\"", "'")) + "\"}";
    }
}
