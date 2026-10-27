package com.mftb.admin.dto;

import lombok.Data;

/**
 * 申请人可选的「参考角色」目录项（企業門戶系統權限申請页用）。
 * <p>
 * 与审批人候选 {@link SystemAccessGrantOptionVO} 刻意分成两个 VO：本 VO 面向<b>对目标系统零权限</b>的员工，
 * 字段越少越好——只给角色名与业务说明，<b>不给 code、不给菜单数、不给任何权限明细</b>，
 * 否则自助入口又会变成一张系统结构地图（本次重构要消除的正是这个问题）。
 * <p>
 * 目录口径（服务端过滤，前端不做二次判断）：启用中 + 非内置 admin + 已持该系统准入
 * + {@code sys_role.self_service_requestable = 1}（管理员在「角色管理」逐个开放）。
 * 目录为空是正常态：申请页此时只走「陈述诉求」，由审批人决定授哪个角色。
 * <p>
 * 该值仅为<b>建议</b>：提交后落 {@code preferred_role_id}，审批人可改选，兑现前还会再校验一次角色可用性。
 */
@Data
public class SystemAccessRoleOptionVO {

    /** 角色 ID（提交时作为 preferredRoleId 回传） */
    private Long roleId;

    /** 角色名称 */
    private String roleName;

    /** 角色业务说明（sys_role.description）：申请人据此判断该角色是否匹配自己的诉求 */
    private String description;
}
