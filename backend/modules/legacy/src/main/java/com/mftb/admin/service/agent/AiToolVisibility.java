package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.SysUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * 工具的角色/部门可见性：复用 {@code ai_tool_policy.data_scope_json}，不新增配置表。
 *
 * <p>格式：{@code {"roles":["rdm_pm"],"depts":[12,15]}}；两数组都为空表示全员可见。
 * 超管（role=admin 或 functionRoles 含 admin）始终可见，避免把管理员自己关在门外。
 * <p>这里只决定“下发/调用哪些工具”，数据范围仍由各业务 Service 判定：
 * 可见性不是数据权限的替代品。
 */
@Slf4j
public final class AiToolVisibility {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AiToolVisibility() {
    }

    public static boolean visible(AiToolPolicy policy, SysUser user) {
        if (policy == null || user == null) return false;
        if (!StringUtils.hasText(policy.getDataScopeJson())) return true;
        JsonNode scope;
        try {
            scope = MAPPER.readTree(policy.getDataScopeJson());
        } catch (Exception e) {
            log.warn("[AiToolVisibility] 工具范围配置无效，拒绝使用 tool={}", policy.getToolKey());
            return false;
        }
        if (!validScope(scope)) return false;
        if (isAdmin(user)) return true;
        List<String> roles = textArray(scope.path("roles"));
        List<Long> depts = longArray(scope.path("depts"));
        if (roles.isEmpty() && depts.isEmpty()) return true;
        if (!roles.isEmpty()) {
            for (String role : splitRoles(user)) {
                if (roles.contains(role)) return true;
            }
        }
        if (!depts.isEmpty() && user.getDepartmentId() != null) {
            return depts.contains(user.getDepartmentId());
        }
        return false;
    }

    /** 配置结构损坏不能等价于空范围，否则误配置会扩大授权。 */
    private static boolean validScope(JsonNode scope) {
        if (scope == null || !scope.isObject()) return false;
        java.util.Iterator<String> fields = scope.fieldNames();
        while (fields.hasNext()) {
            String key = fields.next();
            if (!"roles".equals(key) && !"depts".equals(key)) return false;
        }
        JsonNode roles = scope.get("roles");
        if (roles != null) {
            if (!roles.isArray()) return false;
            for (JsonNode role : roles) {
                if (!role.isTextual() || !StringUtils.hasText(role.asText())) return false;
            }
        }
        JsonNode depts = scope.get("depts");
        if (depts != null) {
            if (!depts.isArray()) return false;
            for (JsonNode dept : depts) {
                if (dept.isIntegralNumber() && dept.canConvertToLong() && dept.asLong() > 0) continue;
                if (!dept.isTextual()) return false;
                try {
                    if (Long.parseLong(dept.asText()) <= 0) return false;
                } catch (NumberFormatException e) {
                    return false;
                }
            }
        }
        return true;
    }

    private static boolean isAdmin(SysUser user) {
        if ("admin".equalsIgnoreCase(user.getRole())) return true;
        for (String role : splitRoles(user)) {
            if ("admin".equalsIgnoreCase(role) || "super_admin".equalsIgnoreCase(role)) return true;
        }
        return false;
    }

    private static List<String> splitRoles(SysUser user) {
        List<String> out = new ArrayList<>();
        if (StringUtils.hasText(user.getRole())) out.add(user.getRole().trim());
        if (StringUtils.hasText(user.getFunctionRoles())) {
            for (String part : user.getFunctionRoles().split("[,;\\s]+")) {
                if (StringUtils.hasText(part)) out.add(part.trim());
            }
        }
        return out;
    }

    private static List<String> textArray(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                String value = item.asText("");
                if (StringUtils.hasText(value)) out.add(value);
            }
        }
        return out;
    }

    private static List<Long> longArray(JsonNode node) {
        List<Long> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                if (item.isNumber()) out.add(item.asLong());
                else if (item.isTextual()) {
                    try {
                        out.add(Long.parseLong(item.asText()));
                    } catch (NumberFormatException ignored) {
                        // 忽略脏值，不因一条配置错误让工具全员不可见
                    }
                }
            }
        }
        return out;
    }
}
