package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmProjectDTO;
import com.mftb.admin.dto.RdmProjectVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * RDM 项目管理服务（Batch 1）。
 * <p>项目是「多需求协同交付」的组织单位：一个项目聚合多条需求，需求下再挂交付项。
 * 本服务只负责项目主档、成员与项目视角的汇总口径；需求自身的状态机仍由
 * {@link RdmRequirementService} 掌管，交付项由 {@link RdmDeliveryItemService} 掌管，
 * 三处不互写对方的状态，避免同一事实出现两个真相源。
 * <p>数据范围：非全量授权者只能看到自己参与（成员）的项目，读口径与写口径统一走
 * {@link RdmAccessGuard}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmProjectService {

    /** 项目编号规则 key（与 sys_biz_seq_rule.rule_key 一致） */
    private static final String SEQ_PROJECT = "rdm_project";

    /** 项目成员角色：项目经理（rdm_project_member.role_code 口径，小写） */
    private static final String PROJECT_ROLE_PM = "pm";

    private final RdmProjectMapper projectMapper;
    private final RdmProjectMemberMapper memberMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmIssueMapper issueMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final RdmAccessGuard accessGuard;

    /* ==================== 查询 ==================== */

    /** 项目分页列表（含交付汇总）；非全量授权者收敛为「我参与的项目」 */
    public Page<RdmProjectVO.ListItem> listProjects(RdmProjectDTO.Query query, Long currentUserId) {
        RdmProjectDTO.Query q = query == null ? new RdmProjectDTO.Query() : query;
        LambdaQueryWrapper<RdmProject> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            wrapper.and(w -> w.like(RdmProject::getName, kw).or().like(RdmProject::getProjectNo, kw));
        }
        if (q.getPmUserId() != null) {
            wrapper.eq(RdmProject::getPmUserId, q.getPmUserId());
        }
        if (StringUtils.hasText(q.getStatus())) {
            wrapper.eq(RdmProject::getStatus, q.getStatus());
        }
        // 数据范围收敛：只能看自己参与的项目（全量授权者不受限）
        if (!canSeeAll(currentUserId)) {
            List<Long> joinedIds = joinedProjectIds(currentUserId);
            if (joinedIds.isEmpty()) {
                return emptyPage(q.getPageNo(), q.getPageSize());
            }
            wrapper.in(RdmProject::getId, joinedIds);
        }
        wrapper.orderByDesc(RdmProject::getUpdatedAt);

        Page<RdmProject> page = new Page<>(normalizePage(q.getPageNo()), normalizeSize(q.getPageSize()));
        Page<RdmProject> result = projectMapper.selectPage(page, wrapper);

        Page<RdmProjectVO.ListItem> voPage =
                new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        List<RdmProject> records = result.getRecords();
        Map<Long, List<RdmDeliveryItem>> itemsByProject = loadDeliveryItems(
                records.stream().map(RdmProject::getId).filter(Objects::nonNull).toList());
        voPage.setRecords(records.stream().map(p -> toListItem(p, itemsByProject.get(p.getId()))).toList());
        return voPage;
    }

    /** 项目详情（含在途成员与交付汇总） */
    public RdmProjectVO.Detail getProjectDetail(Long id, Long currentUserId) {
        RdmProject project = requireProject(id);
        if (!canSeeAll(currentUserId) && !accessGuard.isProjectMember(id, currentUserId)) {
            throw new BusinessException("您不是該項目成員，無法查看項目詳情");
        }
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getProjectId, id));
        RdmProjectVO.Detail vo = new RdmProjectVO.Detail();
        vo.setId(project.getId());
        vo.setProjectNo(project.getProjectNo());
        vo.setName(project.getName());
        vo.setObjective(project.getObjective());
        vo.setPmUserName(project.getPmUserName());
        vo.setProductOwnerUserName(project.getProductOwnerUserName());
        vo.setPlanStartDate(DateTimeUtils.format(project.getPlanStartDate()));
        vo.setPlanEndDate(DateTimeUtils.format(project.getPlanEndDate()));
        vo.setStatus(project.getStatus());
        vo.setPausedFlag(project.getPausedFlag());
        vo.setRiskFlag(project.getRiskFlag());
        vo.setOverdueFlag(project.getOverdueFlag());
        vo.setScopeSummaryJson(project.getScopeSummaryJson());
        vo.setVersion(project.getVersion());
        vo.setCreatedAt(DateTimeUtils.format(project.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(project.getUpdatedAt()));
        applyDeliveryStats(vo, items);
        vo.setMembers(loadMembers(id));
        return vo;
    }

    /** 项目交付概览（看板卡片） */
    public RdmProjectVO.Summary getProjectSummary(Long id) {
        RdmProject project = requireProject(id);
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getProjectId, id));
        RdmProjectVO.Summary vo = new RdmProjectVO.Summary();
        vo.setProjectId(project.getId());
        vo.setProjectName(project.getName());
        vo.setStatus(project.getStatus());
        vo.setTotalItems(items.size());
        LocalDate today = LocalDate.now();
        int delivered = 0, testing = 0, blocked = 0, pending = 0, overdue = 0;
        LocalDate nextMilestone = null;
        for (RdmDeliveryItem item : items) {
            String st = item.getStatus();
            if (RdmConstants.DI_DONE.equals(st)) {
                delivered++;
            } else {
                if (RdmConstants.DI_TESTING.equals(st)) {
                    testing++;
                }
                if (Integer.valueOf(1).equals(item.getBlockedFlag())) {
                    blocked++;
                }
                if (RdmConstants.DI_PENDING_ACCEPTANCE.equals(st) || RdmConstants.DI_PENDING_RELEASE.equals(st)
                        || RdmConstants.DI_RELEASED_PENDING.equals(st)) {
                    pending++;
                }
                LocalDate end = item.getPlanEndDate();
                if (end != null && end.isBefore(today)) {
                    overdue++;
                }
                if (end != null && (nextMilestone == null || end.isBefore(nextMilestone))) {
                    nextMilestone = end;
                }
            }
        }
        vo.setDeliveredItems(delivered);
        vo.setTestingItems(testing);
        vo.setBlockedItems(blocked);
        vo.setPendingItems(pending);
        vo.setOverdueItems(overdue);
        vo.setNextMilestone(DateTimeUtils.format(nextMilestone));
        vo.setLastUpdated(DateTimeUtils.format(project.getUpdatedAt()));
        return vo;
    }

    /** 项目总览统计卡片（口径跟随查询条件） */
    public RdmProjectVO.StatsCard getStatsCards(RdmProjectDTO.Query query, Long currentUserId) {
        RdmProjectDTO.Query q = query == null ? new RdmProjectDTO.Query() : query;
        List<RdmProject> scope = scopedProjects(q, currentUserId);
        RdmProjectVO.StatsCard card = new RdmProjectVO.StatsCard();
        int inProgress = 0, attention = 0, pendingDecision = 0;
        for (RdmProject p : scope) {
            if (RdmConstants.PROJECT_PREPARING.equals(p.getStatus())
                    || RdmConstants.PROJECT_IN_PROGRESS.equals(p.getStatus())) {
                inProgress++;
            }
            if (Integer.valueOf(1).equals(p.getRiskFlag()) || Integer.valueOf(1).equals(p.getOverdueFlag())
                    || Integer.valueOf(1).equals(p.getPausedFlag())) {
                attention++;
            }
        }
        // 待决策：项目下交付项关联的未决问题数（open/processing/pending_verify）
        List<Long> projectIds = scope.stream().map(RdmProject::getId).filter(Objects::nonNull).toList();
        if (!projectIds.isEmpty()) {
            List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                    new LambdaQueryWrapper<RdmDeliveryItem>().in(RdmDeliveryItem::getProjectId, projectIds));
            List<Long> itemIds = items.stream().map(RdmDeliveryItem::getId).filter(Objects::nonNull).toList();
            if (!itemIds.isEmpty()) {
                pendingDecision = Math.toIntExact(issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                        .in(RdmIssue::getDeliveryItemId, itemIds)
                        .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES)));
            }
        }
        card.setInProgressCount(inProgress);
        card.setAttentionCount(attention);
        card.setPendingDecisionCount(pendingDecision);
        return card;
    }

    /** 项目待办事项（未分配/阻塞/待决策/待确认/逾期） */
    public List<RdmProjectVO.PendingItem> getPendingItems(Long projectId) {
        requireProject(projectId);
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().eq(RdmDeliveryItem::getProjectId, projectId));
        List<RdmProjectVO.PendingItem> result = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (RdmDeliveryItem item : items) {
            if (RdmConstants.DI_DONE.equals(item.getStatus())) {
                continue;
            }
            if (item.getCoordinatorUserId() == null) {
                result.add(pendingItem("unassigned", item.getId(), item.getItemNo(), item.getTitle(),
                        null, DateTimeUtils.format(item.getPlanEndDate())));
            }
            if (Integer.valueOf(1).equals(item.getBlockedFlag())) {
                result.add(pendingItem("blocked", item.getId(), item.getItemNo(), item.getTitle(),
                        item.getCoordinatorUserName(), DateTimeUtils.format(item.getPlanEndDate())));
            }
            if (item.getPlanEndDate() != null && item.getPlanEndDate().isBefore(today)) {
                result.add(pendingItem("overdue", item.getId(), item.getItemNo(), item.getTitle(),
                        item.getCoordinatorUserName(), DateTimeUtils.format(item.getPlanEndDate())));
            }
        }
        // 待决策：项目交付项上的未决问题
        List<Long> itemIds = items.stream().map(RdmDeliveryItem::getId).filter(Objects::nonNull).toList();
        if (!itemIds.isEmpty()) {
            List<RdmIssue> issues = issueMapper.selectList(new LambdaQueryWrapper<RdmIssue>()
                    .in(RdmIssue::getDeliveryItemId, itemIds)
                    .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES));
            for (RdmIssue issue : issues) {
                result.add(pendingItem("decision", issue.getId(), issue.getIssueNo(), issue.getTitle(),
                        issue.getOwnerUserName(), null));
            }
        }
        return result;
    }

    /** 交付清单（按需求分组的交付项） */
    public List<RdmProjectVO.DeliveryChecklist> getDeliveryChecklist(Long projectId) {
        requireProject(projectId);
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>()
                        .eq(RdmDeliveryItem::getProjectId, projectId)
                        .orderByAsc(RdmDeliveryItem::getReqId));
        Map<Long, List<RdmDeliveryItem>> byReq = items.stream()
                .filter(i -> i.getReqId() != null)
                .collect(Collectors.groupingBy(RdmDeliveryItem::getReqId, LinkedHashMap::new, Collectors.toList()));
        List<RdmProjectVO.DeliveryChecklist> result = new ArrayList<>();
        for (Map.Entry<Long, List<RdmDeliveryItem>> e : byReq.entrySet()) {
            RdmRequirement req = requirementMapper.selectById(e.getKey());
            RdmProjectVO.DeliveryChecklist group = new RdmProjectVO.DeliveryChecklist();
            group.setReqId(e.getKey());
            if (req != null) {
                group.setReqTitle(req.getTitle());
                group.setReqNo(req.getReqNo());
            }
            group.setItems(e.getValue().stream().map(this::toChecklistItem).toList());
            result.add(group);
        }
        return result;
    }

    /* ==================== 写入 ==================== */

    /** 创建项目，并自动把项目经理加入成员 */
    @Transactional(rollbackFor = Exception.class)
    public RdmProject createProject(RdmProjectDTO.Create dto, Long currentUserId) {
        if (dto == null || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException("項目名稱不能為空");
        }
        RdmProject project = new RdmProject();
        project.setProjectNo(bizSeqService.next(SEQ_PROJECT));
        project.setName(dto.getName().trim());
        project.setObjective(dto.getObjective());
        project.setPmUserId(dto.getPmUserId());
        project.setPmUserName(resolveUserName(dto.getPmUserId(), dto.getPmUserName()));
        project.setProductOwnerUserId(dto.getProductOwnerUserId());
        project.setProductOwnerUserName(resolveUserName(dto.getProductOwnerUserId(), dto.getProductOwnerUserName()));
        project.setPlanStartDate(parseDate(dto.getPlanStartDate(), "計劃開始日期"));
        project.setPlanEndDate(parseDate(dto.getPlanEndDate(), "計劃結束日期"));
        project.setDefaultAcceptancePath(normalizePath(dto.getDefaultAcceptancePath()));
        project.setStatus(RdmConstants.PROJECT_PREPARING);
        project.setPausedFlag(0);
        project.setRiskFlag(0);
        project.setOverdueFlag(0);
        projectMapper.insert(project);
        log.info("創建 RDM 項目成功: id={}, no={}, operator={}", project.getId(), project.getProjectNo(), currentUserId);

        // PM 自动入组：项目经理不入成员表，数据范围收敛会把他自己挡在项目外
        if (project.getPmUserId() != null) {
            RdmProjectMember pm = new RdmProjectMember();
            pm.setProjectId(project.getId());
            pm.setUserId(project.getPmUserId());
            pm.setUserName(project.getPmUserName());
            pm.setRoleCode(PROJECT_ROLE_PM);
            pm.setJoinTime(LocalDateTime.now());
            memberMapper.insert(pm);
        }
        return project;
    }

    /** 编辑项目（乐观锁：expectedVersion 不匹配即拒绝） */
    @Transactional(rollbackFor = Exception.class)
    public void updateProject(Long id, RdmProjectDTO.Update dto, Long currentUserId) {
        RdmProject project = requireProject(id);
        accessGuard.requireProjectMember(id, currentUserId);
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        if (dto.getExpectedVersion() == null || !dto.getExpectedVersion().equals(project.getVersion())) {
            throw new BusinessException("項目已被他人修改，請刷新後重試");
        }
        if (StringUtils.hasText(dto.getName())) {
            project.setName(dto.getName().trim());
        }
        if (dto.getObjective() != null) {
            project.setObjective(dto.getObjective());
        }
        if (dto.getPmUserId() != null) {
            project.setPmUserId(dto.getPmUserId());
            project.setPmUserName(resolveUserName(dto.getPmUserId(), dto.getPmUserName()));
        }
        if (dto.getProductOwnerUserId() != null) {
            project.setProductOwnerUserId(dto.getProductOwnerUserId());
            project.setProductOwnerUserName(resolveUserName(dto.getProductOwnerUserId(), dto.getProductOwnerUserName()));
        }
        if (dto.getPlanStartDate() != null) {
            project.setPlanStartDate(parseDate(dto.getPlanStartDate(), "計劃開始日期"));
        }
        if (dto.getPlanEndDate() != null) {
            project.setPlanEndDate(parseDate(dto.getPlanEndDate(), "計劃結束日期"));
        }
        if (StringUtils.hasText(dto.getDefaultAcceptancePath())) {
            project.setDefaultAcceptancePath(normalizePath(dto.getDefaultAcceptancePath()));
        }
        if (StringUtils.hasText(dto.getStatus())) {
            project.setStatus(dto.getStatus());
        }
        if (dto.getPausedFlag() != null) {
            project.setPausedFlag(dto.getPausedFlag());
        }
        if (dto.getRiskFlag() != null) {
            project.setRiskFlag(dto.getRiskFlag());
        }
        // @Version 由 MyBatis-Plus 自动 +1 并作为 WHERE 条件；受影响行数为 0 说明并发覆盖
        if (projectMapper.updateById(project) == 0) {
            throw new BusinessException("項目已被他人修改，請刷新後重試");
        }
        log.info("更新 RDM 項目: id={}, operator={}", id, currentUserId);
    }

    /** 添加项目成员 */
    @Transactional(rollbackFor = Exception.class)
    public void addMember(Long projectId, RdmProjectDTO.MemberAdd dto, Long currentUserId) {
        requireProject(projectId);
        accessGuard.requireProjectMember(projectId, currentUserId);
        if (dto == null || dto.getUserId() == null) {
            throw new BusinessException("成員用戶不能為空");
        }
        if (!StringUtils.hasText(dto.getRoleCode())) {
            throw new BusinessException("成員角色不能為空");
        }
        // 同项目同人同角色唯一（uk_project_user_role）；已在组则拒绝，避免重复计数
        Long dup = memberMapper.selectCount(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, dto.getUserId())
                .eq(RdmProjectMember::getRoleCode, dto.getRoleCode())
                .isNull(RdmProjectMember::getLeaveTime));
        if (dup != null && dup > 0) {
            throw new BusinessException("該成員已在項目中");
        }
        RdmProjectMember member = new RdmProjectMember();
        member.setProjectId(projectId);
        member.setUserId(dto.getUserId());
        member.setEmpNo(dto.getEmpNo());
        member.setUserName(resolveUserName(dto.getUserId(), dto.getUserName()));
        member.setRoleCode(dto.getRoleCode());
        member.setJoinTime(LocalDateTime.now());
        memberMapper.insert(member);
        log.info("添加 RDM 項目成員: projectId={}, userId={}, role={}, operator={}",
                projectId, dto.getUserId(), dto.getRoleCode(), currentUserId);
    }

    /** 移除项目成员（软移除：置 leave_time，保留历史参与） */
    @Transactional(rollbackFor = Exception.class)
    public void removeMember(Long projectId, Long userId, Long currentUserId) {
        requireProject(projectId);
        accessGuard.requireProjectMember(projectId, currentUserId);
        if (userId == null) {
            throw new BusinessException("成員用戶不能為空");
        }
        List<RdmProjectMember> actives = memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, userId)
                .isNull(RdmProjectMember::getLeaveTime));
        if (actives.isEmpty()) {
            throw new BusinessException("該成員不在項目中");
        }
        LocalDateTime now = LocalDateTime.now();
        for (RdmProjectMember m : actives) {
            m.setLeaveTime(now);
            memberMapper.updateById(m);
        }
        log.info("移除 RDM 項目成員: projectId={}, userId={}, operator={}", projectId, userId, currentUserId);
    }

    /* ==================== 内部工具 ==================== */

    private RdmProject requireProject(Long id) {
        RdmProject project = id == null ? null : projectMapper.selectById(id);
        if (project == null) {
            throw new BusinessException("項目不存在或已刪除");
        }
        return project;
    }

    private boolean canSeeAll(Long currentUserId) {
        SysUser current = currentUserId == null ? null : userMapper.selectById(currentUserId);
        return accessGuard.canSeeAll(current);
    }

    /** 我参与（在途）的项目ID集合 */
    private List<Long> joinedProjectIds(Long currentUserId) {
        if (currentUserId == null) {
            return List.of();
        }
        return memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .eq(RdmProjectMember::getUserId, currentUserId)
                        .isNull(RdmProjectMember::getLeaveTime))
                .stream().map(RdmProjectMember::getProjectId).filter(Objects::nonNull).distinct().toList();
    }

    /** 统计卡片口径的项目集合（跟随查询条件与数据范围） */
    private List<RdmProject> scopedProjects(RdmProjectDTO.Query q, Long currentUserId) {
        LambdaQueryWrapper<RdmProject> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            wrapper.and(w -> w.like(RdmProject::getName, kw).or().like(RdmProject::getProjectNo, kw));
        }
        if (q.getPmUserId() != null) {
            wrapper.eq(RdmProject::getPmUserId, q.getPmUserId());
        }
        if (StringUtils.hasText(q.getStatus())) {
            wrapper.eq(RdmProject::getStatus, q.getStatus());
        }
        if (!canSeeAll(currentUserId)) {
            List<Long> joinedIds = joinedProjectIds(currentUserId);
            if (joinedIds.isEmpty()) {
                return List.of();
            }
            wrapper.in(RdmProject::getId, joinedIds);
        }
        return projectMapper.selectList(wrapper);
    }

    private Map<Long, List<RdmDeliveryItem>> loadDeliveryItems(List<Long> projectIds) {
        if (projectIds == null || projectIds.isEmpty()) {
            return Map.of();
        }
        return deliveryItemMapper.selectList(new LambdaQueryWrapper<RdmDeliveryItem>()
                        .in(RdmDeliveryItem::getProjectId, projectIds))
                .stream()
                .filter(i -> i.getProjectId() != null)
                .collect(Collectors.groupingBy(RdmDeliveryItem::getProjectId));
    }

    private List<RdmProjectVO.MemberItem> loadMembers(Long projectId) {
        return memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .eq(RdmProjectMember::getProjectId, projectId)
                        .isNull(RdmProjectMember::getLeaveTime)
                        .orderByAsc(RdmProjectMember::getJoinTime))
                .stream().map(m -> {
                    RdmProjectVO.MemberItem vo = new RdmProjectVO.MemberItem();
                    vo.setId(m.getId());
                    vo.setUserId(m.getUserId());
                    vo.setEmpNo(m.getEmpNo());
                    vo.setUserName(m.getUserName());
                    vo.setRoleCode(m.getRoleCode());
                    vo.setJoinTime(DateTimeUtils.format(m.getJoinTime()));
                    return vo;
                }).toList();
    }

    private RdmProjectVO.ListItem toListItem(RdmProject p, List<RdmDeliveryItem> items) {
        RdmProjectVO.ListItem vo = new RdmProjectVO.ListItem();
        vo.setId(p.getId());
        vo.setProjectNo(p.getProjectNo());
        vo.setName(p.getName());
        vo.setObjective(p.getObjective());
        vo.setPmUserName(p.getPmUserName());
        vo.setProductOwnerUserName(p.getProductOwnerUserName());
        vo.setPlanStartDate(DateTimeUtils.format(p.getPlanStartDate()));
        vo.setPlanEndDate(DateTimeUtils.format(p.getPlanEndDate()));
        vo.setStatus(p.getStatus());
        vo.setPausedFlag(p.getPausedFlag());
        vo.setRiskFlag(p.getRiskFlag());
        vo.setOverdueFlag(p.getOverdueFlag());
        vo.setUpdatedAt(DateTimeUtils.format(p.getUpdatedAt()));
        applyDeliveryStats(vo, items);
        return vo;
    }

    /** 交付汇总：已交付/总数/下一交付日/阻塞数（ListItem 与 Detail 共用） */
    private void applyDeliveryStats(RdmProjectVO.ListItem vo, List<RdmDeliveryItem> items) {
        List<RdmDeliveryItem> list = items == null ? List.of() : items;
        LocalDate today = LocalDate.now();
        int delivered = 0, blocked = 0;
        LocalDate next = null;
        for (RdmDeliveryItem item : list) {
            if (RdmConstants.DI_DONE.equals(item.getStatus())) {
                delivered++;
            } else {
                if (Integer.valueOf(1).equals(item.getBlockedFlag())) {
                    blocked++;
                }
                LocalDate end = item.getPlanEndDate();
                if (end != null && (next == null || end.isBefore(next))) {
                    next = end;
                }
            }
        }
        vo.setDeliveredCount(delivered);
        vo.setTotalDeliveryCount(list.size());
        vo.setBlockedCount(blocked);
        vo.setNextDeliveryDate(DateTimeUtils.format(next));
        // 逾期标记随汇总刷新（有未完成项已过计划结束日即视为逾期）
        if (next != null && next.isBefore(today)) {
            vo.setOverdueFlag(1);
        }
        vo.setPendingDecisionCount(0);
    }

    /** Detail 复用 ListItem 的汇总逻辑（Detail 不继承 ListItem，这里桥接一次） */
    private void applyDeliveryStats(RdmProjectVO.Detail vo, List<RdmDeliveryItem> items) {
        RdmProjectVO.ListItem tmp = new RdmProjectVO.ListItem();
        applyDeliveryStats(tmp, items);
        vo.setDeliveredCount(tmp.getDeliveredCount());
        vo.setTotalDeliveryCount(tmp.getTotalDeliveryCount());
        vo.setBlockedCount(tmp.getBlockedCount());
        vo.setNextDeliveryDate(tmp.getNextDeliveryDate());
        vo.setPendingDecisionCount(tmp.getPendingDecisionCount());
    }

    private RdmProjectVO.ChecklistItem toChecklistItem(RdmDeliveryItem item) {
        RdmProjectVO.ChecklistItem vo = new RdmProjectVO.ChecklistItem();
        vo.setItemId(item.getId());
        vo.setItemNo(item.getItemNo());
        vo.setTitle(item.getTitle());
        vo.setCoordinatorName(item.getCoordinatorUserName());
        vo.setStatus(item.getStatus());
        vo.setPlanEndDate(DateTimeUtils.format(item.getPlanEndDate()));
        vo.setTestStatus(deriveTestStatus(item.getId()));
        vo.setAcceptanceStatus(deriveAcceptanceStatus(item.getId()));
        if (Integer.valueOf(1).equals(item.getBlockedFlag())) {
            vo.setBlockedReason(resolveBlockedReason(item.getId()));
        }
        return vo;
    }

    /** 测试状态：由该交付项关联任务是否处于测试中推导（简化口径，事实以提测批次为准） */
    private String deriveTestStatus(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return null;
        }
        long testing = taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId)
                .eq(RdmWorkTask::getStatus, "doing"));
        return testing > 0 ? RdmConstants.DI_TESTING : null;
    }

    /** 验收状态占位：验收事实由 {@link RdmAcceptanceRecordService} 汇总，这里只反映交付项状态 */
    private String deriveAcceptanceStatus(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return null;
        }
        RdmDeliveryItem item = deliveryItemMapper.selectById(deliveryItemId);
        if (item == null) {
            return null;
        }
        return switch (item.getStatus()) {
            case RdmConstants.DI_PENDING_ACCEPTANCE, RdmConstants.DI_RELEASED_PENDING -> "pending";
            case RdmConstants.DI_DONE -> "passed";
            default -> null;
        };
    }

    /** 阻塞原因：取该交付项下最近一条 blocked 任务的说明 */
    private String resolveBlockedReason(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return null;
        }
        List<RdmWorkTask> blocked = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId)
                .eq(RdmWorkTask::getStatus, "blocked")
                .orderByDesc(RdmWorkTask::getUpdatedAt)
                .last("LIMIT 1"));
        return blocked.isEmpty() ? null : blocked.get(0).getBlockedReason();
    }

    private RdmProjectVO.PendingItem pendingItem(String type, Long refId, String refNo, String title,
                                                 String responsibleName, String dueDate) {
        RdmProjectVO.PendingItem item = new RdmProjectVO.PendingItem();
        item.setType(type);
        item.setRefId(refId);
        item.setRefNo(refNo);
        item.setTitle(title);
        item.setResponsibleName(responsibleName);
        item.setDueDate(dueDate);
        item.setActionUrl("/rdm/project/delivery/" + refId);
        return item;
    }

    private String resolveUserName(Long userId, String fallback) {
        if (StringUtils.hasText(fallback)) {
            return fallback;
        }
        if (userId == null) {
            return null;
        }
        SysUser user = userMapper.selectById(userId);
        return user == null ? null : user.getName();
    }

    private String normalizePath(String path) {
        return RdmConstants.PATH_B.equalsIgnoreCase(path) ? RdmConstants.PATH_B : RdmConstants.PATH_A;
    }

    private LocalDate parseDate(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(fieldName + "格式不正確，應為 yyyy-MM-dd");
        }
    }

    private Page<RdmProjectVO.ListItem> emptyPage(Integer pageNo, Integer pageSize) {
        return new Page<>(normalizePage(pageNo), normalizeSize(pageSize), 0);
    }

    private long normalizePage(Integer pageNo) {
        return pageNo == null || pageNo < 1 ? 1 : pageNo;
    }

    private long normalizeSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) {
            return 20;
        }
        return Math.min(pageSize, 200);
    }
}
