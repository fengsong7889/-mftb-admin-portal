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

    /** 库内品牌字段取值（biz_fin_account.brand）：与前端品牌字典保持一致 */
    static final String BRAND_FLASH_BEE = "flashBee";
    static final String BRAND_MFOOD = "mFood";

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
        // enum 必须与库内实际取值一致：biz_fin_account.brand 存 flashBee / mFood，
        // 而旧 schema 告知模型用 "1"/"2"，导致按品牌筛选永远命中空结果（模型然后回答“未找到”）
        props.put("brand", Map.of("type", "string",
                "description", "品牌：flashBee=閃蜂，mFood=mFood（也接受 1 / 2 / 中文名，服务端会归一化）",
                "enum", List.of("flashBee", "mFood")));
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
                Object br = args.get("brand");
                if (br != null && !String.valueOf(br).isBlank()) {
                    String normalized = normalizeBrand(String.valueOf(br));
                    if (normalized == null) {
                        // 不能默默丢掉筛选条件：那会把全量结果当成“该品牌结果”交给模型，比查不到更危险
                        return toJson(Map.of("error", "無法識別的品牌取值",
                                "allowedValues", List.of("flashBee", "mFood"),
                                "hint", "請用 flashBee（閃蜂）或 mFood"));
                    }
                    query.setBrand(normalized);
                }
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
            log.warn("[AgentTool] query_account_balance 失敗 type={}", e.getClass().getSimpleName());
            return errorJson("無法查詢賬戶，請確認權限或稍後重試");
        }
    }

    /**
     * 品牌取值归一化：模型经常传 "1"/"2"、中文名或带空格的小写变体，而库内存的是
     * {@code flashBee} / {@code mFood}。不归一化就过滤不出任何数据（实测：mFood 实有 4 条余额，
     * 模型带品牌条件却答“未找到”）。无法识别时返回 null，由调用方给出可选值而不是默默丢条件。
     */
    static String normalizeBrand(String raw) {
        if (raw == null) return null;
        String v = raw.trim().toLowerCase().replace(" ", "").replace("_", "");
        return switch (v) {
            case "1", "flashbee", "flashb", "閃蜂", "闪蜂" -> BRAND_FLASH_BEE;
            case "2", "mfood", "m-food" -> BRAND_MFOOD;
            default -> null;
        };
    }

    private static String brandLabel(String b) {
        if (BRAND_FLASH_BEE.equalsIgnoreCase(b) || "1".equals(b)) return "閃蜂";
        if (BRAND_MFOOD.equalsIgnoreCase(b) || "2".equals(b)) return "mFood";
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
        catch (Exception e) { return errorJson("查詢結果無法處理"); }
    }

    private static String errorJson(String msg) {
        return "{\"error\":\"" + (msg == null ? "unknown" : msg.replace("\"", "'")) + "\"}";
    }
}
