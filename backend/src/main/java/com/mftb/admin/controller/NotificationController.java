package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.NotificationItemVO;
import com.mftb.admin.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统通知接口
 * 为顶部铃铛图标提供通知数据，支持多种通知类型（赠送到期提醒等）
 */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /**
     * 获取当前用户的所有通知（未读）
     * 返回结构: { items: [...], unreadCount: N }
     */
    @GetMapping
    public Result<Map<String, Object>> listNotifications() {
        List<NotificationItemVO> items = notificationService.listNotifications();
        Map<String, Object> result = new HashMap<>();
        result.put("items", items);
        result.put("unreadCount", items.size());
        return Result.success(result);
    }

    /**
     * 标记所有通知为已读
     * 当前为无操作（通知为实时生成，无需持久化已读状态），
     * 后续可扩展为持久化已读状态到数据库
     */
    @PostMapping("/read-all")
    public Result<Void> markAllRead() {
        // 当前通知为实时计算生成，无持久化已读状态
        // 后续可在此处写入 notification_read 表记录已读时间戳
        return Result.success();
    }
}
