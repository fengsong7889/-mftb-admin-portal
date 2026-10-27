package com.mftb.admin.dto;

import lombok.Data;

/**
 * 审批人可选的授权角色候选项（系統權限申請审批面板用）。
 * <p>
 * 只返回「已持有该系统准入」的启用角色：审批人从这里选出来的角色，绑定后申请人必然能进系统。
 * 没配系统准入的角色不进候选（否则审批通过也打不开系统），审批人需要先去权限管理系统配置——
 * 这正是用户口径「角色和部门有什么权限就需要去权限管理系统配置」的落地方式。
 * <p>
 * 2026-10 起<b>不再返回勾选菜单覆盖率</b>（coveredMenuCount / missingMenuNames）：
 * 申请人已不勾选菜单，覆盖率没有比较对象；继续返回「未覆盖的菜单名清单」还会把系统功能明细
 * 倒给前端。审批人改看 {@link #grantedMenuCount}（只有数量，没有明细）+ {@link #description}
 * + 申请人的使用场景/诉求来判断是否够用，不够就驳回并注明原因。
 */
@Data
public class SystemAccessGrantOptionVO {

    /** 授权对象类型：role */
    private String targetType;

    /** 角色 ID */
    private Long targetId;

    /** 角色名称 */
    private String targetName;

    /** 角色编码（内置 admin 永不进候选，此处仅供审批人/审计辨认，不面向申请人） */
    private String targetCode;

    /** 角色业务说明（sys_role.description）：申请人不勾菜单后，这是审批人判断范围的主要依据 */
    private String description;

    /** 该角色在本系统内已授权的菜单数（只给数量，不给明细，避免把功能清单倒给前端） */
    private int grantedMenuCount;

    /** 是否为申请人建议的参考角色（来自开放自助申请的目录；审批面板默认选中它，可改选） */
    private boolean preferred;

    /** 申请人是否已绑定该角色（已绑定时授权为空操作，界面给出提示） */
    private boolean alreadyBound;
}
