package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmReview;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * RDM 需求级访问守卫 —— 资源归属与动作资格的唯一口径。
 * <p>为什么单独成组件：菜单动作权限（{@code @RequirePermission}）只回答「这个功能你能不能用」，
 * 它不回答「这条需求的 PRD／任务／验收记录你能不能读写」。交付子资源的服务原先只按 id 取数，
 * 等于任何持有 {@code rdm-requirement:edit} 的人都能翻别人的需求内容；把口径收在一处，
 * 也避免需求服务与交付服务各拼一套条件、日后两边漂移。
 * <p>四层判定顺序固定：<b>已登录 → 菜单动作 → 数据范围（本组件）→ 单据角色/状态守卫</b>，
 * 前端隐藏按钮不作为任何一层的安全边界。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmAccessGuard {

    /**
     * 产研侧角色：可编辑 PRD／任务／评审等交付物。
     * <p>提出人不在其中：提需求的人能看进展、能验收，但不能改产品与研发的交付物。
     */
    private static final Set<String> DELIVERY_ROLES = Set.of(
            RdmConstants.ROLE_PM,
            RdmConstants.ROLE_DEV_LEAD,
            RdmConstants.ROLE_DEV,
            RdmConstants.ROLE_DESIGNER,
            RdmConstants.ROLE_QA,
            RdmConstants.ROLE_PMO);

    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final RdmRequirementMapper requirementMapper;
    private final RdmRequirementRoleMapper roleMapper;
    /** Batch 1：项目成员资格判定 */
    private final RdmProjectMemberMapper projectMemberMapper;
    /** Batch 1：交付项协调人/验收人资格判定 */
    private final RdmDeliveryItemMapper deliveryItemMapper;
    /** Batch 1：提测批次测试负责人资格判定 */
    private final RdmTestBatchMapper testBatchMapper;
    /** Batch 1：发布批次发布负责人资格判定 */
    private final RdmReleaseBatchMapper releaseBatchMapper;

    /**
     * 是否可看全量需求（不被「与自己相关」收敛）。
     * <p>口径只认分配侧授权：需求池 view（含持有 edit 的人）。不把台账的 export/delete
     * 当全量凭证 —— 台账是人人可看的宽权限，那样等于「能导 Excel 就能读全公司需求」。
     */
    public boolean canSeeAll(SysUser current) {
        if (operatorResolver.isAdmin(current)) {
            return true;
        }
        if (current == null) {
            return false;
        }
        return permissionService.hasPermission(current, RdmConstants.MENU_INTAKE, "view")
                || canDispatch(current);
    }

    /** 是否可分发需求（技术负责人） */
    public boolean canDispatch(SysUser current) {
        if (operatorResolver.isAdmin(current)) {
            return true;
        }
        return current != null && permissionService.hasPermission(current, RdmConstants.MENU_INTAKE, "edit");
    }

    /**
     * 登录人在这条需求上的有效角色集合。
     * <p>返回集合而不是单个角色：一人兼多角色是常态（提出人兼验收人、提出人兼产品经理）。
     * 用 {@code findFirst()} 取单个会按写入顺序误拒合法动作 —— 参与角色按 id 升序读取时，
     * 提出人先写入，兼任验收人的人就拿不到只允许 ACCEPTOR 的交付确认动作。
     */
    public Set<String> activeRoles(Long reqId, SysUser current) {
        if (reqId == null || current == null) {
            return Set.of();
        }
        Set<String> roles = roleMapper.selectList(new LambdaQueryWrapper<RdmRequirementRole>()
                        .eq(RdmRequirementRole::getReqId, reqId)
                        .eq(RdmRequirementRole::getUserId, current.getId())
                        .eq(RdmRequirementRole::getIsActive, 1))
                .stream()
                .map(RdmRequirementRole::getRoleCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!roles.isEmpty()) {
            return roles;
        }
        // 角色表是后加的，存量单据只有主表人员字段；按字段兜底才不会让老需求变成「谁都推不动」
        return inferredRoles(reqId, current);
    }

    /** 主表字段推断角色（存量数据无参与人记录时的回落口径） */
    private Set<String> inferredRoles(Long reqId, SysUser current) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        return inferredRoles(req, current);
    }

    private Set<String> inferredRoles(RdmRequirement req, SysUser current) {
        if (req == null || current == null) {
            return Set.of();
        }
        Set<String> roles = new LinkedHashSet<>();
        Long userId = current.getId();
        if (userId.equals(req.getSubmitterUserId())) {
            roles.add(RdmConstants.ROLE_SUBMITTER);
        }
        if (userId.equals(req.getAssigneePmUserId())) {
            roles.add(RdmConstants.ROLE_PM);
        }
        if (userId.equals(req.getAcceptorUserId())) {
            roles.add(RdmConstants.ROLE_ACCEPTOR);
        }
        if (userId.equals(req.getDevOwnerUserId())) {
            roles.add(RdmConstants.ROLE_DEV_LEAD);
        }
        if (userId.equals(req.getDispatcherUserId())) {
            roles.add(RdmConstants.ROLE_DISPATCHER);
        }
        return roles;
    }

    /** 登录人与该需求是否直接相关（提出／负责／研发／验收／参与） */
    public boolean isRelated(RdmRequirement req, SysUser current) {
        if (current == null) {
            return false;
        }
        Long userId = current.getId();
        if (userId.equals(req.getSubmitterUserId()) || userId.equals(req.getAssigneePmUserId())
                || userId.equals(req.getDevOwnerUserId()) || userId.equals(req.getAcceptorUserId())
                || userId.equals(req.getDispatcherUserId())) {
            return true;
        }
        return roleMapper.selectCount(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, req.getId())
                .eq(RdmRequirementRole::getUserId, userId)
                .eq(RdmRequirementRole::getIsActive, 1)) > 0;
    }

    /** 按 id 取需求，不存在直接拒（避免调用方各自处理 null 时把「不存在」写成「无权限」） */
    public RdmRequirement requireById(Long reqId) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        return req;
    }

    /** 读守卫（自行解析登录人） */
    public RdmRequirement requireVisible(Long reqId, String action) {
        RdmRequirement req = requireById(reqId);
        requireVisible(req, operatorResolver.currentUser(), action);
        return req;
    }

    /** 读守卫：全量授权或与需求相关才放行 */
    public void requireVisible(RdmRequirement req, SysUser current, String action) {
        if (canSeeAll(current) || isRelated(req, current)) {
            return;
        }
        throw new BusinessException("您與該需求無關，無法" + action);
    }

    /**
     * 交付子资源写守卫：反查所属需求 → 数据范围 → 产研侧角色。
     * <p>为什么不只校验数据范围：提出人「相关且可见」，但不该编辑 PRD 或拆任务；
     * 反过来，与需求无关的人即便拿到菜单编辑权也不能凭 id 改别人的交付物。
     */
    public RdmRequirement requireDeliveryWriter(Long reqId, String action) {
        RdmRequirement req = requireById(reqId);
        SysUser current = operatorResolver.currentUser();
        return requireDeliveryWriter(req, current, action);
    }

    public RdmRequirement requireDeliveryWriter(RdmRequirement req, SysUser current, String action) {
        if (operatorResolver.isAdmin(current) || canSeeAll(current)) {
            return req;
        }
        requireVisible(req, current, action);
        Set<String> roles = activeRoles(req.getId(), current);
        if (!roles.stream().anyMatch(DELIVERY_ROLES::contains)) {
            throw new BusinessException("您不是該需求的產品/研發/測試參與人，無法" + action);
        }
        return req;
    }

    /**
     * 业务验收人守卫：只有需求指定的验收人（缺省即提出人）能出验收结论。
     * <p>持有 {@code rdm-acceptance:create} 只代表能用验收这个功能，
     * 不代表可以替别人的业务方签字；代签需要阶段 4 的授权留痕，不在这里放开。
     */
    public RdmRequirement requireAcceptor(Long reqId, String action) {
        RdmRequirement req = requireById(reqId);
        SysUser current = operatorResolver.currentUser();
        return requireAcceptor(req, current, action);
    }

    public RdmRequirement requireAcceptor(RdmRequirement req, SysUser current, String action) {
        if (operatorResolver.isAdmin(current)) {
            return req;
        }
        Long designated = req.getAcceptorUserId() != null ? req.getAcceptorUserId() : req.getSubmitterUserId();
        if (current != null && current.getId().equals(designated)) {
            return req;
        }
        throw new BusinessException("只有該需求的業務驗收人可以" + action);
    }

    /**
     * 评审结论守卫：发起人指定的参与人，或产研侧角色/全量授权者。
     * <p>评审参与人原先只用来发通知，录结论时不看，任何人都能给别人的评审签字。
     */
    public void requireReviewParticipant(RdmReview review, String action) {
        SysUser current = operatorResolver.currentUser();
        if (operatorResolver.isAdmin(current) || canSeeAll(current)) {
            return;
        }
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (StringUtils.hasText(review.getParticipantIds())) {
            boolean isParticipant = Arrays.stream(review.getParticipantIds().split(","))
                    .map(String::trim)
                    .filter(StringUtils::hasText)
                    .map(this::toLong)
                    .filter(Objects::nonNull)
                    .anyMatch(id -> id.equals(current.getId()));
            if (isParticipant) {
                return;
            }
        }
        Set<String> roles = activeRoles(review.getReqId(), current);
        if (roles.stream().anyMatch(DELIVERY_ROLES::contains)) {
            return;
        }
        throw new BusinessException("您不是該評審的參與人，無法" + action);
    }

    /** 任务操作守卫：任务负责人本人，或产研侧角色/全量授权者 */
    public void requireTaskOperator(Long reqId, Long ownerUserId, String action) {
        SysUser current = operatorResolver.currentUser();
        if (operatorResolver.isAdmin(current) || canSeeAll(current)) {
            return;
        }
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (ownerUserId != null && ownerUserId.equals(current.getId())) {
            return;
        }
        Set<String> roles = activeRoles(reqId, current);
        if (roles.contains(RdmConstants.ROLE_PM) || roles.contains(RdmConstants.ROLE_DEV_LEAD)
                || roles.contains(RdmConstants.ROLE_PMO)) {
            return;
        }
        throw new BusinessException("僅任務負責人或產品/研發負責人可" + action);
    }

    /* ==================== Batch 1：项目/交付项/测试/发布角色守卫 ==================== */

    /**
     * 项目成员守卫：只有项目成员（在途）或管理员可操作。
     * <p>项目级动作（编辑、成员管理、交付清单）的前置校验；
     * 前端隐藏按钮不作为安全边界。
     */
    public void requireProjectMember(Long projectId, Long userId) {
        if (isAdmin(userId)) {
            return;
        }
        if (!isProjectMember(projectId, userId)) {
            throw new BusinessException("您不是該項目成員，無法執行此操作");
        }
    }

    /** 是否为项目成员（在途，leave_time IS NULL） */
    public boolean isProjectMember(Long projectId, Long userId) {
        if (projectId == null || userId == null) {
            return false;
        }
        return projectMemberMapper.selectCount(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, userId)
                .isNull(RdmProjectMember::getLeaveTime)) > 0;
    }

    /**
     * 交付项协调人守卫：只有协调人或管理员可操作。
     * <p>协调人是「对这个交付项的研发进度负责」的人，换人须走项目编辑流程。
     */
    public void requireDeliveryCoordinator(Long deliveryItemId, Long userId) {
        if (isAdmin(userId)) {
            return;
        }
        RdmDeliveryItem item = deliveryItemId == null ? null : deliveryItemMapper.selectById(deliveryItemId);
        if (item == null) {
            throw new BusinessException("交付項不存在");
        }
        if (!userId.equals(item.getCoordinatorUserId())) {
            throw new BusinessException("僅交付項協調人可以執行此操作");
        }
    }

    /**
     * 提测批次测试负责人守卫：只有测试负责人或管理员可操作。
     * <p>受理/退回/录入结果均由测试负责人把关，研发不能代测试签字。
     */
    public void requireTestLead(Long batchId, Long userId) {
        if (isAdmin(userId)) {
            return;
        }
        RdmTestBatch batch = batchId == null ? null : testBatchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException("提測批次不存在");
        }
        if (!userId.equals(batch.getTestLeadUserId())) {
            throw new BusinessException("僅提測批次的測試負責人可以執行此操作");
        }
    }

    /**
     * 发布批次发布负责人守卫：只有发布负责人或管理员可操作。
     * <p>部署、验证、回滚等高风险动作由发布负责人一人把关。
     */
    public void requireReleaseOwner(Long batchId, Long userId) {
        if (isAdmin(userId)) {
            return;
        }
        RdmReleaseBatch batch = batchId == null ? null : releaseBatchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException("發布批次不存在");
        }
        if (!userId.equals(batch.getReleaseOwnerUserId())) {
            throw new BusinessException("僅發布批次的發布負責人可以執行此操作");
        }
    }

    /**
     * 产品验收人守卫：只有交付项指定的产品验收人可以出产品验收结论。
     * <p>产品验收验的是「交付物与 PRD 一致」，只有产品验收人能签字。
     * <p><b>任务19 / 决策3：签署类守卫不设 admin 直通。</b>管理员「全量可见 / 可协调分配」
     * 不等于「可代签验收」—— 可见范围（canSeeAll）与签署资格是两个正交口径，绝不能拿前者放行后者。
     * 因此这里移除了原有的 {@code isAdmin} 豁免，闭合「超管替产品验收人签字 / 自批」的后门；
     * 管理岗守卫（{@link #requireDeliveryCoordinator}、{@link #requireTestLead}、
     * {@link #requireReleaseOwner}、{@link #requireProjectMember}）仍保留 admin 直通，
     * 因为查看 / 分配 / 协调 ≠ 签署权。
     * <p>身份必须来自认证主体（{@code SysUser.id}）：userId 为空即视为登录态失效，fail-closed，
     * 绝不可把 null 当成「全量 / 任意人」放行。
     */
    public void requireProductAcceptor(Long deliveryItemId, Long userId) {
        if (userId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        RdmDeliveryItem item = deliveryItemId == null ? null : deliveryItemMapper.selectById(deliveryItemId);
        if (item == null) {
            throw new BusinessException("交付項不存在");
        }
        if (!userId.equals(item.getProductAcceptorUserId())) {
            throw new BusinessException("僅交付項的產品驗收人可以執行此操作");
        }
    }

    /**
     * 业务验收人守卫：只有交付项指定的业务验收人可以出业务验收结论。
     * <p>业务验收验的是「上线后是否真的解决了业务问题」，只有业务验收人能签字。
     * <p><b>任务19 / 决策3：同 {@link #requireProductAcceptor}，签署类守卫不设 admin 直通。</b>
     * 管理员无代签 / 自批豁免；userId 为空 fail-closed。
     */
    public void requireBizAcceptor(Long deliveryItemId, Long userId) {
        if (userId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        RdmDeliveryItem item = deliveryItemId == null ? null : deliveryItemMapper.selectById(deliveryItemId);
        if (item == null) {
            throw new BusinessException("交付項不存在");
        }
        if (!userId.equals(item.getBizAcceptorUserId())) {
            throw new BusinessException("僅交付項的業務驗收人可以執行此操作");
        }
    }

    /** 按 userId 判断是否管理员（通过 OperatorResolver） */
    private boolean isAdmin(Long userId) {
        if (userId == null) {
            return false;
        }
        SysUser current = operatorResolver.currentUser();
        return current != null && current.getId().equals(userId) && operatorResolver.isAdmin(current);
    }

    private Long toLong(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            log.debug("评审参与人字段存在非数字脏数据: {}", value);
            return null;
        }
    }
}
