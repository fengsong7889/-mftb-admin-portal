package com.mftb.admin.service.agent;

/**
 * V0 §八 V0-7 紧急停止入口：全局熔断 AI 网关与工具执行。
 * <p>状态源：{@code sys_config.ai_kill_switch}（"true"/"false"）；5 秒本地缓存避免
 * 每次 chat/exec 都读库；管理员切换后立即清除缓存生效。
 */
public interface AiKillSwitchService {

    /** true 表示当前处于熔断状态，调用方应拒绝放行并返回 503/业务异常。 */
    boolean isEngaged();

    /** 切换开关（管理员专用），会同时刷新缓存。 */
    void toggle(boolean engaged, String operator, String reason);

    /** 当前开关的说明信息（供管理页展示：谁在什么时候因什么关停） */
    Status current();

    /** 熔断状态快照 */
    record Status(boolean engaged, String operator, String reason, String updatedAt) {}
}
