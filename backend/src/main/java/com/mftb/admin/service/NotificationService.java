package com.mftb.admin.service;

import com.mftb.admin.dto.NotificationItemVO;

import java.util.List;

/**
 * 系统通知服务
 * 聚合多种通知类型（赠送到期提醒、审批待办等），供顶部铃铛统一消费
 */
public interface NotificationService {

    /**
     * 获取当前用户的所有未读通知
     * 当前仅包含赠送到期提醒，后续可扩展审批待办、充值提醒等
     */
    List<NotificationItemVO> listNotifications();
}
