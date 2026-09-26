package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PermissionAuditVO;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 授权变更审计服务（权限中心重构）。
 * <p>所有角色/部门的系统准入、菜单动作、账号绑定、状态与删除变更均须落一条审计记录，
 * 内容与业务写操作<b>同事务</b>：审计失败 → 业务保存回滚，保证可追溯性优先于可用性。
 */
public interface PermissionAuditService {

    /** 授权对象类型：角色 */
    String TARGET_ROLE = "role";
    /** 授权对象类型：部门 */
    String TARGET_DEPARTMENT = "department";

    /** 变更类型常量 */
    String CHANGE_GRANT = "GRANT";
    String CHANGE_REVOKE = "REVOKE";
    String CHANGE_UPDATE = "UPDATE";
    String CHANGE_DELETE = "DELETE";
    String CHANGE_COPY = "COPY";
    String CHANGE_BIND = "BIND";
    String CHANGE_STATUS = "STATUS";

    /**
     * 记录一次授权变更。
     *
     * @param targetType role / department
     * @param targetId   角色或部门 ID
     * @param targetName 目标名称快照（可空，空时尽力回查）
     * @param systemCode 业务系统编码；跨系统/非系统级操作传 null
     * @param changeType {@code CHANGE_*} 常量
     * @param before     变更前快照对象（序列化为 JSON），可空
     * @param after      变更后快照对象（序列化为 JSON），可空
     */
    void record(String targetType, Long targetId, String targetName,
                String systemCode, String changeType, Object before, Object after);

    /**
     * 分页查询审计日志（按时间倒序）。
     *
     * @param targetType 可选，role / department
     * @param targetId   可选，目标 ID
     * @param changeType 可选，变更类型
     * @param operator   可选，操作人（模糊）
     * @param startTime  可选，起始时间
     * @param endTime    可选，截止时间
     * @param page       页码（1 起）
     * @param pageSize   每页条数（上限由 PageResult 规范化）
     */
    PageResult<PermissionAuditVO> query(String targetType, Long targetId, String changeType,
                                        String operator, LocalDateTime startTime, LocalDateTime endTime,
                                        long page, long pageSize);

    /** 查询指定目标的最近审计记录（供授权总览展示"最近变更"）。 */
    List<PermissionAuditVO> recentOf(String targetType, Long targetId, int limit);
}
