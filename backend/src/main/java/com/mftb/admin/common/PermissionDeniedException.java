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
}
