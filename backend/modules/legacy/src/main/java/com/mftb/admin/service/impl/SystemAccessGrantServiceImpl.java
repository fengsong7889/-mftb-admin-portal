package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.SystemAccessConstants;
import com.mftb.admin.dto.SystemAccessGrantConfig;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.SystemAccessRequest;
import com.mftb.admin.mapper.OaRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.SystemAccessRequestMapper;
import com.mftb.admin.service.PermissionAuditService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SystemAccessGrantService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 系統權限申請：审批兑现实现（契约见 {@link SystemAccessGrantService}）。
 * <p>
 * 兑现动作只有一个：把审批人指定的角色追加进申请人 {@code sys_user.function_roles}。
 * 角色本身持有哪些菜单/系统准入不在这里配置——那是权限管理系统的职责
 * （用户口径：「角色和部门有什么权限就需要去权限管理系统配置」）。
 * <p>
 * 三道 fail-closed 闸门，任一不满足都拒绝兑现并把错误抛回审批人：
 * <ol>
 *   <li>审批人必须真的配置了授权角色（form_data.approvedGrant 存在且合法）；</li>
 *   <li>角色必须存在、启用、且<b>不是</b>内置 admin（绑定 admin 等于交出整个平台）；</li>
 *   <li>角色必须已持有该系统的准入（{@code sys_role_system}），否则绑定后申请人仍进不去系统，
 *       这种「审批通过但打不开」的结果比当场拒绝更难查。</li>
 * </ol>
 * 兑现成功后调用 {@link PermissionService#evictAll()}：它在本事务内清空本实例缓存并递增全局
 * revision，其它实例下一次权限读取自动重载，申请人刷新门户即可进入系统。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SystemAccessGrantServiceImpl implements SystemAccessGrantService {

    private final SystemAccessRequestMapper requestMapper;
    private final OaRequestMapper oaRequestMapper;
    private final SysUserMapper sysUserMapper;
    private final JdbcTemplate jdbcTemplate;
    private final PermissionService permissionService;
    private final PermissionAuditService permissionAuditService;

    /** 角色引用（id + code + name），name 一律取 DB 值 */
    private record RoleRef(Long id, String code, String name) {
    }

    @Override
    public boolean isSystemAccessProcess(String processCode) {
        return SystemAccessConstants.isSystemAccessProcess(processCode);
    }

    /* ==================== 审批节点：校验并合并授权配置 ==================== */

    @Override
    public String mergeGrantConfig(OaRequest request, String incomingFormData) {
        if (request == null || !StringUtils.hasText(incomingFormData)) {
            return null;
        }
        SystemAccessGrantConfig config = SystemAccessGrantConfig.read(incomingFormData);
        if (config == null) {
            // 本次审批没有携带授权配置（如中间节点只写意见）：不动 form_data
            return null;
        }
        SystemAccessRequest entity = requireByFlowNo(request.getFlowNo());
        // 提前校验：审批人点「通过」的当下就告诉他角色不可用，而不是等终审兑现时才失败
        RoleRef role = requireGrantableRole(config.targetId(), entity.getSystemCode());
        SystemAccessGrantConfig normalized =
                new SystemAccessGrantConfig(SystemAccessConstants.TARGET_TYPE_ROLE, role.id(), role.name());
        log.info("系統權限申請审批配置授权角色: flowNo={}, roleId={}, role={}, system={}",
                request.getFlowNo(), role.id(), role.name(), entity.getSystemCode());
        return normalized.mergeInto(request.getFormData());
    }

    /* ==================== 终审通过：兑现授权 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void onFlowApproved(String flowNo, String approverSignature) {
        SystemAccessRequest entity = requireByFlowNo(flowNo);
        if (SystemAccessConstants.GRANT_GRANTED.equals(entity.getGrantStatus())) {
            log.info("系統權限申請授权已兑现，幂等跳过: flowNo={}", flowNo);
            return;
        }

        OaRequest oaRequest = oaRequestMapper.selectOne(
                new LambdaQueryWrapper<OaRequest>().eq(OaRequest::getFlowNo, flowNo));
        if (oaRequest == null) {
            throw new BusinessException("OA 流程不存在，無法兑现系統權限: " + flowNo);
        }
        SystemAccessGrantConfig config = SystemAccessGrantConfig.read(oaRequest.getFormData());
        if (config == null) {
            throw new BusinessException("審批未配置授權角色，無法开通系統權限；請在審批頁選擇授權角色後重新通過");
        }

        RoleRef role = requireGrantableRole(config.targetId(), entity.getSystemCode());
        SysUser applicant = sysUserMapper.selectById(entity.getUserId());
        if (applicant == null) {
            throw new BusinessException("申請人帳號不存在或已刪除，無法开通系統權限");
        }

        LocalDateTime now = LocalDateTime.now();
        boolean bound = bindRole(applicant, role, entity.getSystemCode(), flowNo, approverSignature);

        requestMapper.update(null, new LambdaUpdateWrapper<SystemAccessRequest>()
                .eq(SystemAccessRequest::getId, entity.getId())
                // 状态与兑现结果写在同一条更新里：不允许出现「已兑现但单据还停在审批中」
                .set(SystemAccessRequest::getStatus, SystemAccessConstants.STATUS_APPROVED)
                .set(SystemAccessRequest::getGrantTargetType, SystemAccessConstants.TARGET_TYPE_ROLE)
                .set(SystemAccessRequest::getGrantTargetId, role.id())
                .set(SystemAccessRequest::getGrantTargetName, role.name())
                .set(SystemAccessRequest::getGrantStatus, SystemAccessConstants.GRANT_GRANTED)
                // 回收资格只认这个标记：申请人本来就持有同角色时 bound=false，本单没新绑任何东西，
                // 到期时必须不能回收——那等于用一张权限申请单收掉管理员从别处给的权限
                .set(SystemAccessRequest::getGrantNewlyBound, bound ? 1 : 0)
                .set(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_NONE)
                .set(SystemAccessRequest::getGrantedAt, now)
                .set(SystemAccessRequest::getGrantedBy, approverSignature)
                .set(SystemAccessRequest::getCompleteTime, now)
                .set(SystemAccessRequest::getUpdatedBy, approverSignature));

        log.info("系統權限申請审批通过并已兑现授权: flowNo={}, user={}({}), role={}({}), system={}, 新绑定={}",
                flowNo, applicant.getName(), applicant.getEmpId(), role.name(), role.id(),
                entity.getSystemCode(), bound);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void onFlowRejected(String flowNo, String reason) {
        syncTerminalStatus(flowNo, SystemAccessConstants.STATUS_REJECTED, reason);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void onFlowCancelled(String flowNo) {
        syncTerminalStatus(flowNo, SystemAccessConstants.STATUS_CANCELLED, null);
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 驳回/撤销只同步单据状态，不触碰任何授权。
     * <p>单据缺失只告警不抛错：这两条回调在 OA 侧被 try/catch 包着（不影响驳回/撤销本身），
     * 抛出去也只是被吞掉，反而丢掉「OA 已驳回」的日志线索。
     */
    private void syncTerminalStatus(String flowNo, String status, String reason) {
        SystemAccessRequest entity = requestMapper.selectOne(
                new LambdaQueryWrapper<SystemAccessRequest>().eq(SystemAccessRequest::getFlowNo, flowNo));
        if (entity == null) {
            log.warn("系統權限申請单据不存在，跳过状态同步: flowNo={}, status={}", flowNo, status);
            return;
        }
        if (SystemAccessConstants.GRANT_GRANTED.equals(entity.getGrantStatus())) {
            // 已兑现过的单子不该再被驳回/撤销（OA 侧已拦「已有审批人通过不可撤销」），出现即数据异常
            log.error("系統權限申請已兑现授权却收到 {} 回调，保留授权不动: flowNo={}", status, flowNo);
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<SystemAccessRequest> update = new LambdaUpdateWrapper<SystemAccessRequest>()
                .eq(SystemAccessRequest::getId, entity.getId())
                .set(SystemAccessRequest::getStatus, status)
                .set(SystemAccessRequest::getCompleteTime, now)
                .set(SystemAccessRequest::getUpdatedAt, now);
        if (StringUtils.hasText(reason)) {
            update.set(SystemAccessRequest::getRejectReason, truncate(reason, 500));
        }
        requestMapper.update(null, update);
        log.info("系統權限申請单据状态已同步: flowNo={}, status={}", flowNo, status);
    }

    /**
     * 把角色追加进申请人的 function_roles（已持有则空操作，不写重复 ID），并落授权审计 + 刷新权限缓存。
     *
     * @return 是否发生了实际绑定（false = 申请人此前已持有该角色）
     */
    private boolean bindRole(SysUser applicant, RoleRef role, String systemCode, String flowNo, String operator) {
        List<Long> before = new ArrayList<>(JsonUtils.parseLongList(applicant.getFunctionRoles()));
        // 先判重再追加：List.add 永远返回 true（不是 Set.add），拿它的返回值当「是否新绑定」
        // 会把已有角色再追加一遍，让 function_roles 里出现重复 ID
        boolean bound = !before.contains(role.id());
        List<Long> after = new ArrayList<>(before);
        if (bound) {
            after.add(role.id());
            // 只更新 function_roles 一列：整实体 updateById 会把 JWT 过滤器缓存里的
            // lastActiveAt/activeToken 等运行时字段写回旧值，覆盖掉别的请求刚更新的事实
            sysUserMapper.update(null, new LambdaUpdateWrapper<SysUser>()
                    .eq(SysUser::getId, applicant.getId())
                    .set(SysUser::getFunctionRoles, JsonUtils.toJson(after))
                    .set(SysUser::getUpdatedBy, operator));
        }

        Map<String, Object> beforeSnapshot = new LinkedHashMap<>();
        beforeSnapshot.put("userId", applicant.getId());
        beforeSnapshot.put("username", applicant.getUsername());
        beforeSnapshot.put("functionRoles", before);
        Map<String, Object> afterSnapshot = new LinkedHashMap<>();
        afterSnapshot.put("userId", applicant.getId());
        afterSnapshot.put("username", applicant.getUsername());
        afterSnapshot.put("functionRoles", after);
        afterSnapshot.put("flowNo", flowNo);
        afterSnapshot.put("systemCode", systemCode);

        // 审计与业务写同事务：审计失败 → 授权一起回滚，可追溯性优先于可用性
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, role.id(), role.name(),
                systemCode, PermissionAuditService.CHANGE_BIND, beforeSnapshot, afterSnapshot);

        // 清本实例缓存 + 递增全局 revision，其它实例下次读取自动重载 → 权限立即生效
        permissionService.evictAll();
        return bound;
    }

    /**
     * 校验角色可被本流程授予：存在 + 启用 + 非内置 admin + 已持该系统准入。
     * <p>任一不满足都抛业务异常，错误文案直接告诉审批人下一步该做什么（去权限管理系统配置），
     * 而不是只说「授权失败」。
     */
    private RoleRef requireGrantableRole(Long roleId, String systemCode) {
        if (roleId == null) {
            throw new BusinessException("請選擇要授權的角色");
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, code, name FROM sys_role WHERE id = ? AND deleted = 0 AND status = 1", roleId);
        if (rows.isEmpty()) {
            throw new BusinessException("授權角色不存在或已停用，請重新選擇");
        }
        Map<String, Object> row = rows.get(0);
        String code = row.get("code") == null ? null : String.valueOf(row.get("code"));
        String name = row.get("name") == null ? null : String.valueOf(row.get("name"));
        if (SystemAccessConstants.SUPER_ADMIN_ROLE_CODE.equalsIgnoreCase(code)) {
            throw new BusinessException("內置 admin 角色不得通過系統權限申請綁定");
        }
        Integer accessCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_system WHERE role_id = ? AND system_code = ?",
                Integer.class, roleId, systemCode);
        if (accessCount == null || accessCount == 0) {
            throw new BusinessException("角色「" + name + "」尚未獲得該系統的准入，綁定後申請人仍無法進入系統；"
                    + "請先在權限管理系統為該角色配置系統准入與菜單權限");
        }
        return new RoleRef(roleId, code, name);
    }

    /* ==================== 到期自动回收 ==================== */

    @Override
    public List<SystemAccessRequest> findExpiredGrants(int limit) {
        LocalDate today = LocalDate.now();
        return requestMapper.selectList(new LambdaQueryWrapper<SystemAccessRequest>()
                .eq(SystemAccessRequest::getStatus, SystemAccessConstants.STATUS_APPROVED)
                .eq(SystemAccessRequest::getGrantStatus, SystemAccessConstants.GRANT_GRANTED)
                .eq(SystemAccessRequest::getGrantNewlyBound, 1)
                .eq(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_NONE)
                .eq(SystemAccessRequest::getDurationType, SystemAccessConstants.DURATION_UNTIL)
                .isNotNull(SystemAccessRequest::getDurationUntil)
                .lt(SystemAccessRequest::getDurationUntil, today)
                .orderByAsc(SystemAccessRequest::getDurationUntil)
                .orderByAsc(SystemAccessRequest::getId)
                .last("LIMIT " + Math.max(1, limit)));
    }

    /**
     * {@inheritDoc}
     * <p>执行顺序是故意这么排的：先判「有没有其他有效授权覆盖」（要则整条不碰），
     * 再用条件更新做认领（失败即别人已在处理），最后才真解绑——三步都在同一事务里，
     * 中途失败回滚后 {@code revoke_status} 仍是 none，下一轮重试，不会出现
     * 「标了已回收但权限还在身上」的假回收。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean expireGrant(Long requestId) {
        if (requestId == null) {
            return false;
        }
        SystemAccessRequest entity = requestMapper.selectById(requestId);
        if (entity == null || !isReclaimable(entity)) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now();

        // 1) 其他仍有效的授权单也给了同一个角色 → 不能抽走，标成 kept 后不再重复扫
        if (hasOtherCoveringGrant(entity)) {
            int waived = requestMapper.update(null, new LambdaUpdateWrapper<SystemAccessRequest>()
                    .eq(SystemAccessRequest::getId, requestId)
                    .eq(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_NONE)
                    .set(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_KEPT)
                    .set(SystemAccessRequest::getRevokedAt, now)
                    .set(SystemAccessRequest::getRevokedBy, SystemAccessConstants.EXPIRY_OPERATOR)
                    .set(SystemAccessRequest::getUpdatedAt, now));
            log.info("系統權限申請到期但角色仍被其他有效授权覆盖，不回收: flowNo={}, role={}, 标记={}",
                    entity.getFlowNo(), entity.getGrantTargetName(), waived == 1 ? "kept" : "已由其他实例处理");
            return false;
        }

        // 2) 条件更新做认领：抢不到就是已经有人在处理
        int claimed = requestMapper.update(null, new LambdaUpdateWrapper<SystemAccessRequest>()
                .eq(SystemAccessRequest::getId, requestId)
                .eq(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_NONE)
                .set(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_REVOKED)
                .set(SystemAccessRequest::getRevokedAt, now)
                .set(SystemAccessRequest::getRevokedBy, SystemAccessConstants.EXPIRY_OPERATOR)
                .set(SystemAccessRequest::getUpdatedAt, now));
        if (claimed == 0) {
            log.info("系統權限申請回收已被其他实例认领，跳过: flowNo={}", entity.getFlowNo());
            return false;
        }

        // 3) 解绑。账号已删除/停用时无需解绑，单据保持 revoked（权限随账号一起没了，不是漏收）
        SysUser applicant = sysUserMapper.selectById(entity.getUserId());
        if (applicant == null) {
            log.info("系統權限申請已到期，申请人账号不存在，仅标记回收: flowNo={}, userId={}",
                    entity.getFlowNo(), entity.getUserId());
            return false;
        }
        boolean removed = unbindRole(applicant, entity.getGrantTargetId(), entity.getGrantTargetName(),
                entity.getSystemCode(), entity.getFlowNo(), SystemAccessConstants.EXPIRY_OPERATOR);
        log.info("系統權限申請到期已自动回收授权: flowNo={}, user={}({}), role={}, 实际解绑={}",
                entity.getFlowNo(), applicant.getName(), applicant.getEmpId(),
                entity.getGrantTargetName(), removed);
        return true;
    }

    /** 本单是否可以被回收（六个条件全在内，不靠调用方保证） */
    private boolean isReclaimable(SystemAccessRequest entity) {
        return SystemAccessConstants.STATUS_APPROVED.equals(entity.getStatus())
                && SystemAccessConstants.GRANT_GRANTED.equals(entity.getGrantStatus())
                && Integer.valueOf(1).equals(entity.getGrantNewlyBound())
                && SystemAccessConstants.REVOKE_NONE.equals(entity.getRevokeStatus())
                && SystemAccessConstants.DURATION_UNTIL.equals(entity.getDurationType())
                && entity.getDurationUntil() != null
                && entity.getDurationUntil().isBefore(LocalDate.now())
                && entity.getGrantTargetId() != null;
    }

    /**
     * 同一申请人是否还有<b>其他</b>未回收、未过期的单据也在授予同一个角色。
     * <p>有则不回收：两张单各自有期限，但权限在库里只有一个「有/无」位，
     * 先把其中一张到期就抽走角色，会把另一张还在有效期内的申请也打没。
     */
    private boolean hasOtherCoveringGrant(SystemAccessRequest entity) {
        Long others = requestMapper.selectCount(new LambdaQueryWrapper<SystemAccessRequest>()
                .ne(SystemAccessRequest::getId, entity.getId())
                .eq(SystemAccessRequest::getUserId, entity.getUserId())
                .eq(SystemAccessRequest::getGrantTargetId, entity.getGrantTargetId())
                .eq(SystemAccessRequest::getStatus, SystemAccessConstants.STATUS_APPROVED)
                .eq(SystemAccessRequest::getGrantStatus, SystemAccessConstants.GRANT_GRANTED)
                .eq(SystemAccessRequest::getRevokeStatus, SystemAccessConstants.REVOKE_NONE)
                .and(w -> w.isNull(SystemAccessRequest::getDurationType)
                        .or().ne(SystemAccessRequest::getDurationType, SystemAccessConstants.DURATION_UNTIL)
                        .or().ge(SystemAccessRequest::getDurationUntil, LocalDate.now())));
        return others != null && others > 0;
    }

    /**
     * 把角色从申请人的 function_roles 里移除（只更新这一列），并落 REVOKE 审计 + 刷新权限缓存。
     * <p>与 {@code bindRole} 同构：不能整实体 updateById（会把 JWT 过滤器缓存里的运行时字段写回旧值）。
     *
     * @return 是否真的删掉了（false = 角色已不在身上，幂等重跑不会报错）
     */
    private boolean unbindRole(SysUser applicant, Long roleId, String roleName, String systemCode,
                               String flowNo, String operator) {
        List<Long> before = new ArrayList<>(JsonUtils.parseLongList(applicant.getFunctionRoles()));
        List<Long> after = new ArrayList<>(before);
        // List.remove(Object) 的返回值是有意义的（在不在里），不像 add 恒 true
        boolean removed = after.remove(roleId);
        if (removed) {
            sysUserMapper.update(null, new LambdaUpdateWrapper<SysUser>()
                    .eq(SysUser::getId, applicant.getId())
                    .set(SysUser::getFunctionRoles, JsonUtils.toJson(after))
                    .set(SysUser::getUpdatedBy, operator));
        }

        Map<String, Object> beforeSnapshot = new LinkedHashMap<>();
        beforeSnapshot.put("userId", applicant.getId());
        beforeSnapshot.put("username", applicant.getUsername());
        beforeSnapshot.put("functionRoles", before);
        Map<String, Object> afterSnapshot = new LinkedHashMap<>();
        afterSnapshot.put("userId", applicant.getId());
        afterSnapshot.put("username", applicant.getUsername());
        afterSnapshot.put("functionRoles", after);
        afterSnapshot.put("flowNo", flowNo);
        afterSnapshot.put("systemCode", systemCode);
        afterSnapshot.put("reason", "权限到期自动回收");

        // 审计与解绑同事务：审计失败 → 回收一起回滚，可追溯性优先于可用性。
        // 必须显式传 operator：回收跑在定时线程里没有登录态，不传审计的 operator 会是 NULL，
        // 「谁收的权限」就查不出来了（业务表 revoked_by 与审计 operator 必须同一个值）。
        permissionAuditService.record(PermissionAuditService.TARGET_ROLE, roleId, roleName,
                systemCode, PermissionAuditService.CHANGE_REVOKE, beforeSnapshot, afterSnapshot, operator);
        permissionService.evictAll();
        return removed;
    }

    private SystemAccessRequest requireByFlowNo(String flowNo) {
        SystemAccessRequest entity = requestMapper.selectOne(
                new LambdaQueryWrapper<SystemAccessRequest>().eq(SystemAccessRequest::getFlowNo, flowNo));
        if (entity == null) {
            throw new BusinessException("系統權限申請單不存在: " + flowNo);
        }
        return entity;
    }

    private static String truncate(String text, int max) {
        if (text == null) {
            return null;
        }
        return text.length() <= max ? text : text.substring(0, max);
    }
}
