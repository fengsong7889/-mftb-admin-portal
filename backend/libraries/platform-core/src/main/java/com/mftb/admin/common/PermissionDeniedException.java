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
     * 未声明权限的受保护端点：HCM 路径级兜底拒绝时使用。
     * <p>消息刻意与「缺菜单权限」不同——这是配置缺陷（端点没标注 @RequirePermission），
     * 不是使用者没被授权，提示要能让运维一眼看出该改代码。
     */
    public static PermissionDeniedException unscopedEndpoint(String path) {
        return new PermissionDeniedException("接口未声明权限，已按默认拒绝处理: " + path, true);
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

    /**
     * 领域内已定稿的授权拒绝文案（带下一步指引，如「請在「會議室檔案」由行政操作」）。
     *
     * <p>为什么需要这个入口而不是 {@code new BusinessException(...)}：业务码 500 会把
     * 「用户没被授权」与「服务端出错」压成同一个信号，监控告警、客户端分支、
     * 审计统计都会失真（2026-11-06 会议域 E2E 实测：6 条越权拒绝全返回 HTTP 200 + code 500）。
     * <p>只用于**本来就已经明确说出「无权」**的文案：那些话术已经把拒绝理由透露给用户了，
     * 换成 403 不增加任何信息暂面。反之，故意用「不存在」来防 id 枚举的判定不得改到这里来，
     * 那是补偿控制而不是缺陷。
     */
    public static PermissionDeniedException denied(String message) {
        return new PermissionDeniedException(message, true);
    }
}
