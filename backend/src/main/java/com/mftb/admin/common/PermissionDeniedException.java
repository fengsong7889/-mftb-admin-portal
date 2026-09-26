package com.mftb.admin.common;

import java.util.Map;

/**
 * 权限不足异常: 由权限切面抛出, GlobalExceptionHandler 统一转为 403 响应
 */
public class PermissionDeniedException extends RuntimeException {

    /** action 中文映射, 用于生成可读提示 */
    private static final Map<String, String> ACTION_LABELS = Map.of(
            "view", "查看",
            "create", "新增",
            "edit", "编辑",
            "delete", "删除",
            "import", "导入",
            "export", "导出",
            "enable", "启用",
            "disable", "停用"
    );

    public PermissionDeniedException(String menuKey, String action) {
        super("没有 [" + menuKey + "] 的["
                + ACTION_LABELS.getOrDefault(action, action) + "]权限");
    }

    private PermissionDeniedException(String message, boolean rawMessage) {
        super(message);
    }

    /**
     * 数据范围拒绝：用户持有菜单但目标数据不属于本人。
     * <p>提示必须与「缺菜单权限」区分，否则自助员工看到「没有 xx 权限」会误以为没被授权。
     *
     * @param target 被访问的对象描述，如「他人的請假單」
     */
    public static PermissionDeniedException outOfDataScope(String target) {
        return new PermissionDeniedException("僅能查看與操作本人的資料，無法訪問" + target, true);
    }
}
