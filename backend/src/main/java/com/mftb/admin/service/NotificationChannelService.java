package com.mftb.admin.service;

import com.mftb.admin.dto.SysNotificationChannelSaveDTO;
import com.mftb.admin.entity.SysNotificationChannel;

import java.util.List;
import java.util.Map;

/**
 * 通知渠道配置服务
 * 支持多平台、多场景、多渠道的 CRUD 与场景路由
 */
public interface NotificationChannelService {

    /** 按平台列出所有渠道 */
    List<Map<String, Object>> listByChannel(String platform);

    /** 列出所有渠道（不分平台） */
    List<Map<String, Object>> listAll();

    /** 按条件筛选渠道列表 */
    List<Map<String, Object>> listFiltered(String channel, String name, Integer enabled,
                                           String updatedBy, String updatedAfter, String updatedBefore);

    /** 单条详情 */
    Map<String, Object> getDetail(Long id);

    /** 新增渠道 */
    Long create(SysNotificationChannelSaveDTO dto);

    /** 更新渠道 */
    void update(Long id, SysNotificationChannelSaveDTO dto);

    /** 删除渠道（默认渠道不可删除） */
    void delete(Long id);

    /** 启停切换 */
    void toggleEnabled(Long id, boolean enabled);

    /** 按场景查找已启用的渠道（找不到返回 null） */
    SysNotificationChannel findByScenario(String scenario);

    /** 查找平台默认渠道（找不到返回 null） */
    SysNotificationChannel findDefault(String platform);

    /** 发送测试消息（目前仅 dingtalk 实现） */
    String sendTest(Long id);
}
