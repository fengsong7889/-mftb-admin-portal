package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 单个「授权目标 × 系统」原子保存请求。
 * <p>语义：
 * <ul>
 *   <li>{@code systemAccess=false} → 撤销目标对系统的准入 + 清除目标在该系统内的所有菜单授权（不级联到其他系统）。</li>
 *   <li>{@code systemAccess=true} → 保留/新增目标对系统的准入 + 覆盖目标在该系统内的菜单授权。</li>
 * </ul>
 * <p>{@code expectedRevision} 非空时启用乐观锁：与库内当前 revision 不一致返回 409，
 * 防止两个管理员基于旧版本互相覆盖。为空则跳过版本校验（兼容前端尚未接入版本号的过渡期）。
 */
@Data
public class SystemAuthorizationRequest {

    /** 是否授予/保留系统准入 */
    private boolean systemAccess;

    /** 该系统内的菜单授权（menuKey + actions；actions 空 = 未授权，与读侧默认 view 语义显式区分） */
    private List<MenuPermissionDTO> permissions;

    /** 客户端读到的期望版本号；null 表示不做版本冲突检查 */
    private Long expectedRevision;
}
