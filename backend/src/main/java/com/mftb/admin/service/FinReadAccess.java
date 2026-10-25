package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.springframework.util.StringUtils;

import java.util.Set;

/** 财务查询的系统／菜单／集团交集；只供读取，不改变资金写入或审批状态机。 */
public final class FinReadAccess {
    private FinReadAccess() { }

    public static Set<String> require(String menu, OperatorResolver operators,
                                      PermissionService permissions, DataScopeService dataScope) {
        try {
            SysUser user = operators.currentUser();
            if (user == null || user.getId() == null || !Integer.valueOf(1).equals(user.getStatus())) {
                throw new BusinessException(401, "登入身分不可用");
            }
            String system = permissions.resolveSystemCodeOfMenu(menu);
            if (!StringUtils.hasText(system) || !permissions.hasSystemAccess(user, system)
                    || !permissions.hasPermission(user, menu, "view")) {
                throw new PermissionDeniedException(menu, "view");
            }
            return dataScope.resolveAuthorizedGroupCodes();
        } catch (BusinessException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new BusinessException(503, "無法確認財務資料權限，請稍後重試");
        }
    }

    /** 两侧集团必须都可见；JSON 解析失败不会降级为仅校验主集团。字段名来自固定调用点。 */
    public static <T> void constrain(LambdaQueryWrapper<T> query, Set<String> groups,
                                      SFunction<T, String> groupField, SFunction<T, String> typeField) {
        if (groups != null) query.in(groupField, groups);
        query.and(w -> w.notIn(typeField, "transfer", "merge")
                .or(t -> t.eq(typeField, "transfer").apply(validPair("$.fromGroupId", "$.toGroupId")))
                .or(m -> m.eq(typeField, "merge").apply(validPair("$.sourceGroupId", "$.targetGroupId"))));
        if (groups == null) return;
        String allowed = JsonUtils.toJson(groups);
        query.and(w -> w.notIn(typeField, "transfer", "merge")
                .or(t -> t.eq(typeField, "transfer")
                        .apply(allowedPair("$.fromGroupId", "$.toGroupId"), allowed))
                .or(m -> m.eq(typeField, "merge")
                        .apply(allowedPair("$.sourceGroupId", "$.targetGroupId"), allowed)));
    }

    // JSON 路径仅由上面的固定字面量调用，绝不接受请求参数或动态字段名。
    private static String value(String path) {
        return "JSON_EXTRACT(CASE WHEN JSON_VALID(extra) THEN extra ELSE '{}' END, '" + path + "')";
    }

    private static String validPair(String from, String to) {
        return "JSON_TYPE(" + value(from) + ") = 'STRING' AND JSON_TYPE(" + value(to) + ") = 'STRING'"
                + " AND JSON_UNQUOTE(" + value(from) + ") <> '' AND JSON_UNQUOTE(" + value(to) + ") <> ''"
                + " AND group_code IN (JSON_UNQUOTE(" + value(from) + "), JSON_UNQUOTE(" + value(to) + "))";
    }

    private static String allowedPair(String from, String to) {
        return "JSON_CONTAINS({0}, " + value(from) + ") = 1 AND JSON_CONTAINS({0}, " + value(to) + ") = 1";
    }
}
