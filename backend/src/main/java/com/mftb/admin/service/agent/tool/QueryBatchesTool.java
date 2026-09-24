package com.mftb.admin.service.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.FinBatchQuery;
import com.mftb.admin.dto.FinBatchVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinBatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** query_batches 工具（V0 §B.1 后端化）：查交易批次（充值/转账/扣款/合并） */
@Slf4j
@Component
@RequiredArgsConstructor
public class QueryBatchesTool implements AgentTool {

    private final FinBatchService finBatchService;
    private final ObjectMapper objectMapper;

    @Override
    public String toolKey() { return "query_batches"; }

    @Override
    public String description() { return "查詢交易批次記錄，包括充值、轉賬、扣款、合併等批次"; }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("groupName", Map.of("type", "string", "description", "集團名稱"));
        props.put("batchType", Map.of("type", "string", "description", "批次類型",
                "enum", List.of("recharge", "transfer", "deduct", "merge")));
        props.put("tradeFrom", Map.of("type", "string", "description", "交易時間起（YYYY-MM-DD）"));
        props.put("tradeTo", Map.of("type", "string", "description", "交易時間止（YYYY-MM-DD）"));
        props.put("amountMin", Map.of("type", "number", "description", "充值金額下限（虛擬推廣金，元）"));
        props.put("amountMax", Map.of("type", "number", "description", "充值金額上限（虛擬推廣金，元）"));
        return Map.of("type", "object", "properties", props);
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        try {
            FinBatchQuery query = new FinBatchQuery();
            query.setPage(1);
            query.setSize(10);
            if (args != null) {
                putStr(args.get("groupName"), query::setGroupName);
                putStr(args.get("batchType"), query::setBatchType);
                String from = strOf(args.get("tradeFrom"));
                if (StringUtils.hasText(from)) {
                    try { query.setTradeFrom(LocalDate.parse(from)); } catch (Exception ignored) {}
                }
                String to = strOf(args.get("tradeTo"));
                if (StringUtils.hasText(to)) {
                    try { query.setTradeTo(LocalDate.parse(to)); } catch (Exception ignored) {}
                }
                BigDecimal min = decimalOf(args.get("amountMin"));
                if (min != null) query.setAmountMin(min);
                BigDecimal max = decimalOf(args.get("amountMax"));
                if (max != null) query.setAmountMax(max);
            }
            PageResult<FinBatchVO> result = finBatchService.page(query);
            List<FinBatchVO> rows = result.getRecords();
            if (rows == null || rows.isEmpty()) {
                return toJson(Map.of("message", "未找到符合條件的批次記錄", "total", 0));
            }
            List<Map<String, Object>> summary = rows.stream().map(r -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("集團", r.getGroupName());
                row.put("類型", typeLabel(r.getBatchType()));
                row.put("批次號", r.getBatchNo());
                row.put("交易時間", r.getTradeTime());
                row.put("虛擬金額", r.getVirtualAmount());
                row.put("實際金額", r.getActualAmount());
                row.put("申請人", r.getApplicant());
                row.put("備註", r.getRemark());
                return row;
            }).toList();
            return toJson(Map.of("total", result.getTotal(), "records", summary));
        } catch (Exception e) {
            log.warn("[AgentTool] query_batches 失敗 caller={}: {}", ctx.caller(), e.getMessage());
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

    private interface StrSetter { void set(String v); }
    private static void putStr(Object raw, StrSetter setter) {
        String v = strOf(raw);
        if (StringUtils.hasText(v)) setter.set(v);
    }
    private static String strOf(Object v) { return v == null ? null : String.valueOf(v).trim(); }
    private static BigDecimal decimalOf(Object v) {
        if (v == null) return null;
        try { return new BigDecimal(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }
    private String toJson(Object v) {
        try { return objectMapper.writeValueAsString(v); }
        catch (Exception e) { return errorJson(e.getMessage()); }
    }
    private static String errorJson(String msg) {
        return "{\"error\":\"" + (msg == null ? "unknown" : msg.replace("\"", "'")) + "\"}";
    }
}
