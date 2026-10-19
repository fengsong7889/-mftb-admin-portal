package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmResourceDTO;
import com.mftb.admin.dto.RdmResourceMemberDTO;
import com.mftb.admin.dto.RdmResourceVO;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmResourceMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmResourceMemberMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.IdempotentKey;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmIdempotentService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.RdmResourceService;
import com.mftb.admin.service.RdmTestBatchService;
import com.mftb.admin.service.RdmWorkingDayCalculator;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 團隊負載聚合实现（阶段 B-1：只读，不建表、不改任何写路径）。
 *
 * <p>数据源（全部为现有表，只读）：
 * <ul>
 *   <li>研发/设计/测试任务：{@code rdm_work_task}（按 ownerUserId，未完成，taskType 分类，planHours 摊到逐日）</li>
 *   <li>产品需求：{@code rdm_requirement}（按 assigneePmUserId，在途，计件数——无个人工时字段，标数据待完善）</li>
 *   <li>测试批次：{@code rdm_test_batch}（按 testLeadUserId + executorUserIds，在途，计件数——同上）</li>
 *   <li>人员全集：{@code rdm_project_member}（在途成员）∪ 上述各单据负责人，保证「没任务的人」也出现</li>
 *   <li>可用容量：{@link RdmWorkingDayCalculator}（默认周一至五 8h + 个人例外日历）</li>
 *   <li>实际工时：{@code rdm_work_log}（按人按日聚合）</li>
 * </ul>
 *
 * <p>B-1 口径限定：totalPlanned 用未完成任务的 planHours 近似「已安排工时」（摊到查询区间），
 * 产品需求与测试批次只有件数、无个人工时，故有件数却无工时任务的人标为 data_incomplete，
 * 不显示 0% 冒充空闲。剩余工时/估时维护在 B-2 计划层补齐，分派写回在 B-3。
 *
 * <p>安全：无 {@code canSeeAll} 者只返回本人（服务端收敛，前端隐藏不是边界）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmResourceServiceImpl implements RdmResourceService {

    /** 默认负载窗口天数（今天起两周） */
    private static final int DEFAULT_WORKLOAD_DAYS = 14;
    /** 负载查询最大跨度（含首尾），与排程侧一致 */
    private static final int MAX_WORKLOAD_DAYS = 92;

    /** 任务未完成状态（done/cancelled 之外都算在途，占用未来容量） */
    private static final Set<String> TASK_OPEN_STATUSES = Set.of("todo", "doing", "blocked");
    /** 测试批次在途状态（待接收/已接收/执行中） */
    private static final Set<String> BATCH_ACTIVE_STATUSES = Set.of(
            RdmConstants.TB_PENDING, RdmConstants.TB_ACCEPTED, RdmConstants.TB_EXECUTING);

    private final RdmWorkTaskMapper taskMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmProjectMemberMapper projectMemberMapper;
    private final RdmResourceMemberMapper resourceMemberMapper;
    private final SysUserMapper userMapper;
    private final RdmAccessGuard accessGuard;
    private final OperatorResolver operatorResolver;
    private final RdmWorkingDayCalculator workingDayCalculator;
    private final JdbcTemplate jdbcTemplate;
    private final RdmDeliveryService deliveryService;
    private final RdmIdempotentService idempotentService;
    private final RdmRequirementService requirementService;
    private final RdmTestBatchService testBatchService;

    @Override
    public RdmResourceVO.Workload workload(String from, String to) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        boolean unrestricted = accessGuard.canSeeAll(current);

        LocalDate start = parseOrNull(from);
        LocalDate end = parseOrNull(to);
        if (start == null || end == null) {
            start = LocalDate.now();
            end = start.plusDays(DEFAULT_WORKLOAD_DAYS - 1);
        }
        if (start.isAfter(end)) {
            throw new BusinessException("開始日期不能晚於結束日期");
        }
        if (start.plusDays(MAX_WORKLOAD_DAYS).isBefore(end)) {
            throw new BusinessException("負載查詢最多覆蓋 " + MAX_WORKLOAD_DAYS + " 天");
        }

        RdmResourceVO.Workload vo = new RdmResourceVO.Workload();
        vo.setFrom(start.toString());
        vo.setTo(end.toString());
        vo.setSelfOnly(!unrestricted);

        // 1) 人员全集：在途项目成员 ∪ 各单据负责人（无全量权时收敛为本人）
        Set<Long> userIds = collectPeople(unrestricted, current.getId());
        if (userIds.isEmpty()) {
            return vo;
        }

        // 2) 批量加载用户、日历、实际工时
        Map<Long, SysUser> users = loadUsers(userIds);
        Map<Long, RdmWorkingDayCalculator.DayCalendar> calendars = workingDayCalculator.loadCalendars(userIds, start, end);
        Map<String, BigDecimal> actualByDay = actualHoursByDay(userIds, start, end);

        // 3) 各数据源按人聚合
        Map<Long, List<RdmWorkTask>> tasksByOwner = loadOpenTasksByOwner(userIds);
        Map<Long, Integer> productReqCount = countProductReqsByPm(userIds);
        Map<Long, Integer> testBatchCount = countTestBatchesByUser(userIds);
        Map<Long, Set<String>> memberRoles = loadProjectMemberRoles(userIds);

        // 4) 逐人组装
        for (Long userId : userIds) {
            SysUser user = users.get(userId);
            RdmWorkingDayCalculator.DayCalendar calendar = calendars.getOrDefault(userId, RdmWorkingDayCalculator.emptyCalendar());
            List<RdmWorkTask> tasks = tasksByOwner.getOrDefault(userId, List.of());
            int productReqs = productReqCount.getOrDefault(userId, 0);
            int testBatches = testBatchCount.getOrDefault(userId, 0);
            Set<String> roles = memberRoles.getOrDefault(userId, new LinkedHashSet<>());

            vo.getPeople().add(buildPerson(userId, user, calendar, tasks, productReqs, testBatches,
                    roles, actualByDay, start, end));
        }

        // 5) 排序（超载/数据待完善优先，便于负责人先找瓶颈）+ 统计卡
        vo.getPeople().sort((a, b) -> Integer.compare(loadRank(a.getLoadStatus()), loadRank(b.getLoadStatus())));
        fillSummary(vo);
        return vo;
    }

    /* ==================== 资源名册 CRUD（阶段 B-2） ==================== */

    @Override
    public List<RdmResourceMember> listMembers() {
        // 名册管理动作（Controller 以 manage 门控）：返回全部（含已移出），status 区分，在册优先
        return resourceMemberMapper.selectList(new LambdaQueryWrapper<RdmResourceMember>()
                .orderByDesc(RdmResourceMember::getStatus)
                .orderByAsc(RdmResourceMember::getId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmResourceMember saveMember(RdmResourceMemberDTO dto) {
        if (dto == null || dto.getUserId() == null) {
            throw new BusinessException("請選擇要納入名冊的員工");
        }
        SysUser user = userMapper.selectById(dto.getUserId());
        if (user == null) {
            throw new BusinessException("員工不存在或已停用");
        }
        // upsert：一人一条（uk_rrm_user），已存在则更新，避免撞唯一键
        RdmResourceMember existing = resourceMemberMapper.selectOne(new LambdaQueryWrapper<RdmResourceMember>()
                .eq(RdmResourceMember::getUserId, dto.getUserId()));
        SysUser current = operatorResolver.currentUser();
        String signature = operatorResolver.operatorSignature(current);
        boolean isNew = existing == null;
        RdmResourceMember row = isNew ? new RdmResourceMember() : existing;
        if (isNew) {
            row.setUserId(user.getId());
            row.setCreatedBy(signature);
        }
        // 快照从 sys_user 回填，不信任前端传值
        row.setEmpNo(user.getEmpId());
        row.setUserName(user.getName());
        row.setDept(user.getDepartment());
        row.setRoleCodes(dto.getRoleCodes() == null || dto.getRoleCodes().isEmpty()
                ? null : JsonUtils.toJson(dto.getRoleCodes()));
        row.setWeeklyCapacityHours(dto.getWeeklyCapacityHours());
        row.setRemark(dto.getRemark());
        row.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        row.setUpdatedBy(signature);
        if (isNew) {
            resourceMemberMapper.insert(row);
        } else {
            resourceMemberMapper.updateById(row);
        }
        return row;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void removeMember(Long id) {
        RdmResourceMember row = id == null ? null : resourceMemberMapper.selectById(id);
        if (row == null) {
            throw new BusinessException("名冊記錄不存在");
        }
        // 移出=status 置 0，不物理删（保留纳入历史）
        row.setStatus(0);
        row.setUpdatedBy(operatorResolver.operatorSignature(operatorResolver.currentUser()));
        resourceMemberMapper.updateById(row);
    }

    /* ==================== 待分配工作聚合（阶段 B-3.1，只读） ==================== */

    /** 执行任务来源分桶：design 归设计任务，其余（frontend/backend/data/app/qa）归研发任务 */
    private static final String SOURCE_REQUIREMENT = "requirement";
    private static final String SOURCE_DEV_TASK = "dev_task";
    private static final String SOURCE_DESIGN_TASK = "design_task";
    private static final String SOURCE_TEST_BATCH = "test_batch";

    @Override
    public RdmResourceVO.Unassigned unassigned() {
        RdmResourceVO.Unassigned vo = new RdmResourceVO.Unassigned();
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        // 双门：Controller 已按 dispatch 门控，服务再确认一次（前端隐藏不是边界）。
        // 待分配池按定义无负责人，普通员工对它无主张权，无权者返回空。
        boolean can = accessGuard.canDispatch(current) || accessGuard.canSeeAll(current);
        vo.setCanDispatch(can);
        if (!can) {
            return vo;
        }

        // 1) 需求池：已准入待受理、尚无产品经理
        List<RdmRequirement> poolReqs = requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                .eq(RdmRequirement::getStatus, RdmConstants.STATUS_POOL)
                .isNull(RdmRequirement::getAssigneePmUserId));
        for (RdmRequirement r : poolReqs) {
            RdmResourceVO.UnassignedItem it = new RdmResourceVO.UnassignedItem();
            it.setSource(SOURCE_REQUIREMENT);
            it.setItemId(r.getId());
            it.setCode(r.getReqNo());
            it.setTitle(r.getTitle());
            vo.getRequirements().add(it);
        }

        // 2) 未指派执行任务：无负责人且未完成（done/cancelled 之外）
        List<RdmWorkTask> openTasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .isNull(RdmWorkTask::getOwnerUserId)
                .in(RdmWorkTask::getStatus, TASK_OPEN_STATUSES));
        // 3) 待接收测试批次：pending
        List<RdmTestBatch> pendingBatches = testBatchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                .eq(RdmTestBatch::getStatus, RdmConstants.TB_PENDING));

        // 批量回填所属需求标题（任务 + 批次共用一次查询）
        Set<Long> reqIds = new HashSet<>();
        for (RdmWorkTask t : openTasks) {
            if (t.getReqId() != null) {
                reqIds.add(t.getReqId());
            }
        }
        for (RdmTestBatch b : pendingBatches) {
            if (b.getReqId() != null) {
                reqIds.add(b.getReqId());
            }
        }
        Map<Long, String> reqTitles = loadReqTitles(reqIds);

        for (RdmWorkTask t : openTasks) {
            RdmResourceVO.UnassignedItem it = new RdmResourceVO.UnassignedItem();
            boolean design = "design".equals(t.getTaskType());
            it.setSource(design ? SOURCE_DESIGN_TASK : SOURCE_DEV_TASK);
            it.setItemId(t.getId());
            it.setCode(t.getTaskNo());
            it.setTitle(t.getTitle());
            it.setReqTitle(reqTitles.get(t.getReqId()));
            it.setPlanHours(t.getPlanHours());
            it.setPlanVersion(t.getPlanVersion() == null ? 1 : t.getPlanVersion());
            if (design) {
                vo.getDesignTasks().add(it);
            } else {
                vo.getDevTasks().add(it);
            }
        }

        for (RdmTestBatch b : pendingBatches) {
            RdmResourceVO.UnassignedItem it = new RdmResourceVO.UnassignedItem();
            it.setSource(SOURCE_TEST_BATCH);
            it.setItemId(b.getId());
            it.setCode(b.getBatchNo());
            String reqTitle = reqTitles.get(b.getReqId());
            it.setTitle(reqTitle != null ? reqTitle : ("提測批次 " + b.getBatchNo()));
            it.setReqTitle(reqTitle);
            it.setCurrentOwner(b.getTestLeadUserName());
            it.setPlanVersion(b.getVersion() == null ? 0 : b.getVersion());
            vo.getTestBatches().add(it);
        }
        return vo;
    }

    /** 按需求 id 批量取标题（供任务/批次回填「所属需求」） */
    private Map<Long, String> loadReqTitles(Set<Long> reqIds) {
        Map<Long, String> map = new HashMap<>();
        if (reqIds.isEmpty()) {
            return map;
        }
        requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .select(RdmRequirement::getId, RdmRequirement::getTitle)
                        .in(RdmRequirement::getId, reqIds))
                .forEach(r -> map.put(r.getId(), r.getTitle()));
        return map;
    }

    /* ==================== 分派写回（阶段 B-3.2：仅研发/设计任务指派） ==================== */

    /** executeOnce 业务类型：负载页任务指派 */
    private static final String BIZ_RESOURCE_ASSIGN = "rdm_resource_assign";

    @Override
    public RdmResourceVO.AssignResult assign(RdmResourceDTO.Assign req) {
        if (req == null || req.getItemId() == null || req.getAssigneeUserId() == null) {
            throw new BusinessException("請選擇要分派的單據與被分派人");
        }
        String source = req.getSource();
        boolean isTask = SOURCE_DEV_TASK.equals(source) || SOURCE_DESIGN_TASK.equals(source);
        boolean isReq = SOURCE_REQUIREMENT.equals(source);
        boolean isBatch = SOURCE_TEST_BATCH.equals(source);
        if (!isTask && !isReq && !isBatch) {
            throw new BusinessException("未知的分派來源");
        }
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        IdempotentKey key = IdempotentKey.builder()
                .userId(current.getId())
                .bizType(BIZ_RESOURCE_ASSIGN)
                .resourceKey(source + ":" + req.getItemId())
                .clientRequestId(StringUtils.hasText(req.getClientRequestId())
                        ? req.getClientRequestId()
                        : "auto:" + source + ":" + req.getItemId() + ":" + req.getAssigneeUserId())
                .requestHash(idempotentService.stableRequestHash(req))
                .build();
        Long itemId = req.getItemId();
        Long assigneeUserId = req.getAssigneeUserId();
        Integer expectedVersion = req.getExpectedPlanVersion();
        // executeOnce 自身即事务边界（不得再包外层事务）；领域写的 @Transactional 以 PROPAGATION_REQUIRED 加入
        return idempotentService.executeOnce(key, () -> {
            RdmResourceVO.AssignResult r = new RdmResourceVO.AssignResult();
            r.setSource(source);
            r.setItemId(itemId);
            if (isTask) {
                deliveryService.assignTaskOwner(itemId, assigneeUserId, expectedVersion);
                r.setMessage("任務已指派");
            } else if (isReq) {
                // 需求分配：委托需求域 batchAssign（池→assigned 走 rdm_transition 权威守卫与状态 CAS）
                requirementService.batchAssign(List.of(itemId), assigneeUserId);
                r.setMessage("需求已分配產品經理");
            } else {
                // 测试批次：委托测试域将选定人追加为 pending 批次执行人（内部 requireTestLead + @Version + 冻结保护）
                testBatchService.assignExecutors(itemId, List.of(assigneeUserId), expectedVersion, current.getId());
                r.setMessage("已指派為測試執行人");
            }
            return r;
        }, RdmResourceVO.AssignResult.class);
    }

    /* ==================== 人员全集 ==================== */

    /**
     * 收集研发协作全员：在途项目成员 ∪ 未完成任务负责人 ∪ 在途需求产品经理/研发负责人 ∪ 在途批次测试人员。
     * <p>无全量数据范围时收敛为本人（负载页不能变成打探绩效的入口）。
     */
    private Set<Long> collectPeople(boolean unrestricted, Long selfId) {
        Set<Long> ids = new LinkedHashSet<>();
        // 名册人员（status=1 纳入）：让「已进名册但当前无在途单据」的人也出现在负载视图
        resourceMemberMapper.selectList(new LambdaQueryWrapper<RdmResourceMember>()
                        .eq(RdmResourceMember::getStatus, 1))
                .forEach(m -> { if (m.getUserId() != null) ids.add(m.getUserId()); });
        // 在途项目成员（leaveTime IS NULL）
        projectMemberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .isNull(RdmProjectMember::getLeaveTime))
                .forEach(m -> { if (m.getUserId() != null) ids.add(m.getUserId()); });
        // 未完成任务负责人
        taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                        .select(RdmWorkTask::getOwnerUserId)
                        .in(RdmWorkTask::getStatus, TASK_OPEN_STATUSES)
                        .isNotNull(RdmWorkTask::getOwnerUserId))
                .forEach(t -> ids.add(t.getOwnerUserId()));
        // 在途需求的产品经理与研发负责人
        requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .select(RdmRequirement::getAssigneePmUserId, RdmRequirement::getDevOwnerUserId)
                        .in(RdmRequirement::getStatus, Arrays.asList(RdmConstants.IN_PROGRESS_STATUS)))
                .forEach(r -> {
                    if (r.getAssigneePmUserId() != null) ids.add(r.getAssigneePmUserId());
                    if (r.getDevOwnerUserId() != null) ids.add(r.getDevOwnerUserId());
                });
        // 在途批次的测试负责人与执行人
        for (RdmTestBatch batch : testBatchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                .in(RdmTestBatch::getStatus, BATCH_ACTIVE_STATUSES))) {
            if (batch.getTestLeadUserId() != null) ids.add(batch.getTestLeadUserId());
            ids.addAll(JsonUtils.parseLongList(batch.getExecutorUserIdsJson()));
        }
        // 收敛：无全量权只看本人
        if (!unrestricted) {
            ids.retainAll(Set.of(selfId));
        }
        return ids;
    }

    /* ==================== 各数据源聚合 ==================== */

    /** 未完成任务按负责人分组 */
    private Map<Long, List<RdmWorkTask>> loadOpenTasksByOwner(Set<Long> userIds) {
        Map<Long, List<RdmWorkTask>> map = new HashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .in(RdmWorkTask::getOwnerUserId, userIds)
                .in(RdmWorkTask::getStatus, TASK_OPEN_STATUSES));
        for (RdmWorkTask t : tasks) {
            map.computeIfAbsent(t.getOwnerUserId(), k -> new ArrayList<>()).add(t);
        }
        return map;
    }

    /** 在途需求按产品经理计件数 */
    private Map<Long, Integer> countProductReqsByPm(Set<Long> userIds) {
        Map<Long, Integer> map = new HashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .select(RdmRequirement::getAssigneePmUserId)
                        .in(RdmRequirement::getAssigneePmUserId, userIds)
                        .in(RdmRequirement::getStatus, Arrays.asList(RdmConstants.IN_PROGRESS_STATUS)))
                .forEach(r -> map.merge(r.getAssigneePmUserId(), 1, Integer::sum));
        return map;
    }

    /** 在途测试批次按测试负责人/执行人计件数（一人多批次累加） */
    private Map<Long, Integer> countTestBatchesByUser(Set<Long> userIds) {
        Map<Long, Integer> map = new HashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        for (RdmTestBatch batch : testBatchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                .in(RdmTestBatch::getStatus, BATCH_ACTIVE_STATUSES))) {
            Set<Long> related = new HashSet<>();
            if (batch.getTestLeadUserId() != null) related.add(batch.getTestLeadUserId());
            related.addAll(JsonUtils.parseLongList(batch.getExecutorUserIdsJson()));
            for (Long uid : related) {
                if (userIds.contains(uid)) {
                    map.merge(uid, 1, Integer::sum);
                }
            }
        }
        return map;
    }

    /** 在途项目成员的角色（用于岗位推断） */
    private Map<Long, Set<String>> loadProjectMemberRoles(Set<Long> userIds) {
        Map<Long, Set<String>> map = new HashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        projectMemberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .in(RdmProjectMember::getUserId, userIds)
                        .isNull(RdmProjectMember::getLeaveTime))
                .forEach(m -> {
                    if (m.getUserId() == null || !StringUtils.hasText(m.getRoleCode())) {
                        return;
                    }
                    map.computeIfAbsent(m.getUserId(), k -> new LinkedHashSet<>()).add(mapRoleCode(m.getRoleCode()));
                });
        return map;
    }

    /** 项目成员 roleCode → 负载岗位（pm/product/dev_lead/dev/qa/designer/pmo/ops） */
    private static String mapRoleCode(String roleCode) {
        return switch (roleCode == null ? "" : roleCode.toLowerCase()) {
            case "pm" -> RdmResourceVO.ROLE_PM;
            case "product" -> RdmResourceVO.ROLE_PRODUCT;
            case "dev_lead", "dev" -> RdmResourceVO.ROLE_DEV;
            case "qa" -> RdmResourceVO.ROLE_QA;
            case "designer" -> RdmResourceVO.ROLE_DESIGNER;
            case "pmo" -> RdmResourceVO.ROLE_PMO;
            case "ops" -> RdmResourceVO.ROLE_OPS;
            default -> RdmResourceVO.ROLE_DEV;
        };
    }

    /* ==================== 逐人组装 ==================== */

    private RdmResourceVO.Person buildPerson(Long userId, SysUser user, RdmWorkingDayCalculator.DayCalendar calendar,
                                             List<RdmWorkTask> tasks, int productReqs, int testBatches,
                                             Set<String> memberRoles, Map<String, BigDecimal> actualByDay,
                                             LocalDate start, LocalDate end) {
        RdmResourceVO.Person person = new RdmResourceVO.Person();
        person.setUserId(userId);
        person.setUserName(user == null ? ("#" + userId) : user.getName());
        person.setEmpNo(user == null ? null : user.getEmpId());
        person.setDept(user == null ? null : user.getDepartment());

        // 任务分类计数 + 计划工时摊日
        Map<LocalDate, BigDecimal> planned = new LinkedHashMap<>();
        int devTasks = 0, designTasks = 0, testTasks = 0;
        boolean hasOverdue = false, hasBlocked = false;
        boolean anyTaskMissingEstimate = false;
        Set<String> roles = new LinkedHashSet<>(memberRoles);
        for (RdmWorkTask t : tasks) {
            String type = t.getTaskType() == null ? "" : t.getTaskType();
            switch (type) {
                case "design" -> { designTasks++; roles.add(RdmResourceVO.ROLE_DESIGNER); }
                case "qa" -> { testTasks++; roles.add(RdmResourceVO.ROLE_QA); }
                default -> { devTasks++; roles.add(RdmResourceVO.ROLE_DEV); }
            }
            if ("blocked".equals(t.getStatus())) {
                hasBlocked = true;
            }
            if (isOverdue(t)) {
                hasOverdue = true;
            }
            if (t.getPlanHours() == null || t.getPlanHours().signum() <= 0) {
                anyTaskMissingEstimate = true;
            }
            spread(t, start, end, calendar, planned);
        }
        if (productReqs > 0) {
            roles.add(RdmResourceVO.ROLE_PRODUCT);
        }
        if (testBatches > 0) {
            roles.add(RdmResourceVO.ROLE_QA);
        }

        person.setProductReqs(productReqs);
        person.setDevTasks(devTasks);
        person.setDesignTasks(designTasks);
        person.setTestTasks(testTasks);
        person.setTestBatches(testBatches);
        person.setCoordItems(0);
        person.setRoles(new ArrayList<>(roles));
        person.setHasOverdue(hasOverdue);
        person.setHasBlocked(hasBlocked);

        // 逐日负载 + 区间汇总
        BigDecimal capacityTotal = BigDecimal.ZERO, plannedTotal = BigDecimal.ZERO, actualTotal = BigDecimal.ZERO;
        int overloadedDays = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            BigDecimal capacity = calendar.capacity(d);
            BigDecimal load = planned.getOrDefault(d, BigDecimal.ZERO);
            BigDecimal actual = actualByDay.getOrDefault(userId + "|" + d, BigDecimal.ZERO);
            RdmResourceVO.DayLoad day = new RdmResourceVO.DayLoad();
            day.setDay(d.toString());
            day.setCapacity(capacity);
            day.setPlanned(load);
            day.setActual(actual);
            day.setWeekend(calendar.isWeekend(d));
            day.setLeave(calendar.isLeave(d));
            day.setOverloaded(capacity.signum() > 0 && load.compareTo(capacity) > 0);
            if (Boolean.TRUE.equals(day.getOverloaded())) {
                overloadedDays++;
            }
            capacityTotal = capacityTotal.add(capacity);
            plannedTotal = plannedTotal.add(load);
            actualTotal = actualTotal.add(actual);
            person.getDays().add(day);
        }
        person.setTotalCapacity(capacityTotal.setScale(1, RoundingMode.HALF_UP));
        person.setTotalPlanned(plannedTotal.setScale(1, RoundingMode.HALF_UP));
        person.setTotalActual(actualTotal.setScale(1, RoundingMode.HALF_UP));
        person.setOverloadedDays(overloadedDays);
        int loadRate = capacityTotal.signum() == 0 ? 0
                : plannedTotal.multiply(BigDecimal.valueOf(100)).divide(capacityTotal, 0, RoundingMode.HALF_UP).intValue();
        person.setLoadRate(loadRate);

        // 负载状态 + 数据完整性
        applyLoadStatus(person, loadRate, productReqs, testBatches, tasks.size(), anyTaskMissingEstimate);
        return person;
    }

    /**
     * 负载状态判定。
     * <p>数据待完善优先：有产品需求/测试批次件数却无工时任务，或有任务未估时，
     * 都不能归入「有余量」（否则会显示 0% 冒充空闲，误导分派）。
     */
    private void applyLoadStatus(RdmResourceVO.Person person, int loadRate, int productReqs, int testBatches,
                                 int taskCount, boolean anyTaskMissingEstimate) {
        boolean hasCountOnlyWork = (productReqs > 0 || testBatches > 0) && person.getTotalPlanned().signum() == 0;
        if (hasCountOnlyWork || anyTaskMissingEstimate) {
            person.setLoadStatus(RdmResourceVO.LOAD_DATA_INCOMPLETE);
            List<String> reasons = new ArrayList<>();
            if (productReqs > 0) {
                reasons.add(productReqs + " 個在途產品需求未計個人工時");
            }
            if (testBatches > 0) {
                reasons.add(testBatches + " 個在途測試批次未計個人工時");
            }
            if (anyTaskMissingEstimate) {
                reasons.add("部分任務未填計劃工時");
            }
            person.setDataIncompleteReason(String.join("；", reasons));
            return;
        }
        if (taskCount == 0 && productReqs == 0 && testBatches == 0) {
            // 名册内但当前无任何在途工作：容量为 0 时不可用，否则视为有余量
            person.setLoadStatus(person.getTotalCapacity().signum() == 0
                    ? RdmResourceVO.LOAD_DATA_INCOMPLETE : RdmResourceVO.LOAD_AVAILABLE);
            if (person.getTotalCapacity().signum() == 0) {
                person.setDataIncompleteReason("所選區間無可用容量（請假/週末）");
            }
            return;
        }
        if (loadRate > 100) {
            person.setLoadStatus(RdmResourceVO.LOAD_OVERLOADED);
        } else if (loadRate > 85) {
            person.setLoadStatus(RdmResourceVO.LOAD_NEAR_FULL);
        } else if (loadRate >= 60) {
            person.setLoadStatus(RdmResourceVO.LOAD_NORMAL);
        } else {
            person.setLoadStatus(RdmResourceVO.LOAD_AVAILABLE);
        }
    }

    /** 排序权重：超载 > 数据待完善 > 接近满载 > 正常 > 有余量（瓶颈优先） */
    private static int loadRank(String status) {
        return switch (status == null ? "" : status) {
            case RdmResourceVO.LOAD_OVERLOADED -> 0;
            case RdmResourceVO.LOAD_DATA_INCOMPLETE -> 1;
            case RdmResourceVO.LOAD_NEAR_FULL -> 2;
            case RdmResourceVO.LOAD_NORMAL -> 3;
            default -> 4;
        };
    }

    private void fillSummary(RdmResourceVO.Workload vo) {
        RdmResourceVO.Summary s = vo.getSummary();
        s.setTotal(vo.getPeople().size());
        s.setAvailable((int) vo.getPeople().stream().filter(p -> RdmResourceVO.LOAD_AVAILABLE.equals(p.getLoadStatus())).count());
        s.setOverloaded((int) vo.getPeople().stream().filter(p -> RdmResourceVO.LOAD_OVERLOADED.equals(p.getLoadStatus())).count());
        s.setDataIncomplete((int) vo.getPeople().stream().filter(p -> RdmResourceVO.LOAD_DATA_INCOMPLETE.equals(p.getLoadStatus())).count());
    }

    /* ==================== 工时摊派与实际工时（与排程侧同口径） ==================== */

    /** 任务是否逾期（计划完成日早于今天且未完成） */
    private static boolean isOverdue(RdmWorkTask t) {
        return t.getPlanFinishDate() != null && t.getPlanFinishDate().isBefore(LocalDate.now());
    }

    /** 把任务计划工时摊到区间内的工作日上（均摊，尾差落最后一个工作日；与 RdmScheduleServiceImpl 同口径） */
    private static void spread(RdmWorkTask task, LocalDate start, LocalDate end,
                               RdmWorkingDayCalculator.DayCalendar calendar, Map<LocalDate, BigDecimal> planned) {
        BigDecimal hours = task.getPlanHours() == null ? BigDecimal.ZERO : task.getPlanHours();
        if (hours.signum() <= 0) {
            return;
        }
        List<LocalDate> days = new ArrayList<>();
        LocalDate taskStart = max(task.getPlanStartDate(), start);
        LocalDate taskEnd = min(task.getPlanFinishDate(), end);
        if (taskStart == null || taskEnd == null || taskStart.isAfter(taskEnd)) {
            // 没填计划起止时按今天起摊 7 天，让「还有多少活没排进去」可见
            taskStart = max(LocalDate.now(), start);
            taskEnd = taskStart.plusDays(6);
        }
        for (LocalDate d = taskStart; !d.isAfter(taskEnd); d = d.plusDays(1)) {
            if (calendar.isWorking(d)) {
                days.add(d);
            }
        }
        if (days.isEmpty()) {
            return;
        }
        BigDecimal per = hours.divide(BigDecimal.valueOf(days.size()), 2, RoundingMode.DOWN);
        BigDecimal assigned = BigDecimal.ZERO;
        for (int i = 0; i < days.size(); i++) {
            BigDecimal share = i == days.size() - 1 ? hours.subtract(assigned) : per;
            assigned = assigned.add(share);
            planned.merge(days.get(i), share, BigDecimal::add);
        }
    }

    /** 已填报的实际工时（按人按日聚合） */
    private Map<String, BigDecimal> actualHoursByDay(Set<Long> userIds, LocalDate start, LocalDate end) {
        Map<String, BigDecimal> map = new HashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(userIds.size(), "?"));
        List<Object> args = new ArrayList<>(userIds);
        args.add(start);
        args.add(end);
        jdbcTemplate.query(
                "SELECT user_id, work_date, SUM(hours) AS total FROM rdm_work_log "
                        + "WHERE deleted = 0 AND user_id IN (" + placeholders + ") AND work_date BETWEEN ? AND ? "
                        + "GROUP BY user_id, work_date",
                rs -> {
                    map.put(rs.getLong("user_id") + "|" + rs.getDate("work_date").toLocalDate(), rs.getBigDecimal("total"));
                },
                args.toArray());
        return map;
    }

    private Map<Long, SysUser> loadUsers(Set<Long> ids) {
        Map<Long, SysUser> map = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return map;
        }
        userMapper.selectBatchIds(ids).forEach(u -> map.put(u.getId(), u));
        return map;
    }

    private static LocalDate max(LocalDate a, LocalDate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate min(LocalDate a, LocalDate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isBefore(b) ? a : b;
    }

    private static LocalDate parseOrNull(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return LocalDate.parse(s.trim());
        } catch (Exception e) {
            return null;
        }
    }
}
