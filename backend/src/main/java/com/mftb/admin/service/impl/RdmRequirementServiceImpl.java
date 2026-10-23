package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmAcceptanceDTO;
import com.mftb.admin.dto.RdmAcceptanceVO;
import com.mftb.admin.dto.RdmBatchBackfillAcceptDTO;
import com.mftb.admin.dto.RdmBatchBackfillVO;
import com.mftb.admin.dto.RdmBatchSubmitterDTO;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmOptionVO;
import com.mftb.admin.dto.RdmIntakeVO;
import com.mftb.admin.dto.RdmRequirementAttrDTO;
import com.mftb.admin.dto.RdmRequirementCreateDTO;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.dto.RdmWorkbenchVO;
import com.mftb.admin.entity.RdmAcceptance;
import com.mftb.admin.entity.RdmAcceptanceCase;
import com.mftb.admin.entity.RdmAttachment;
import com.mftb.admin.entity.RdmComment;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmRequirementTarget;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAcceptanceCaseMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryItemService;
import com.mftb.admin.service.RdmFlowVersionGuard;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmIntakePolicyService;
import com.mftb.admin.service.RdmIntakeRoundService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmPrdTaskService;
import com.mftb.admin.service.RdmReleaseService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.RdmRequirementStructureService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * RDM 需求服务实现。
 * <p>三条硬约束：
 * <ol>
 *   <li>状态流转必须由 {@code rdm_transition} 配置驱动，代码不写死「谁能推到哪一步」；</li>
 *   <li>每次流转关闭上一条状态流水（回填停留时长），周期/逾期/瓶颈分析全部来自 {@code rdm_status_log}；</li>
 *   <li>数据范围按登录人收敛：普通员工只看自己提出/负责/被抄送的需求，超管与 PMO 看全量。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmRequirementServiceImpl implements RdmRequirementService {

    /** 验收单编号规则（对应 sys_biz_seq_rule.rule_key）。正式需求编号用 {@code BizSeqService.RULE_RDM_REQUIREMENT}，延迟到首次准入时发号 */
    private static final String SEQ_ACCEPTANCE = "rdm_acceptance";

    /** 需求池责任人（技术负责人）菜单，用于判定谁能分发 */
    private static final String MENU_DISPATCHER = RdmConstants.MENU_INTAKE;

    /**
     * 未认证时的数据范围哨兵 id（任务19 / 缺口5）。
     * <p>拿不到登录人身份又非管理视角时，用它替代 {@code null} 传入查询条件：
     * 自增主键从 1 起，-1 不可能命中任何人员字段，从而把「我的」fail-closed 收敛为空集，
     * 而不是像 {@code null} 那样被 {@code toWrapper} 当成「不受限 = 全量」。
     */
    private static final Long UNAUTHENTICATED_SCOPE_ID = -1L;

    /**
     * PRD 階段的細分狀態（受理後、排期前）。
     * <p>只有進入這些狀態才允許編寫 PRD / 發起評審：
     * 評估中的需求連「做不做」都還沒定，此時寫 PRD、出評審結論屬於越級操作，
     * 會造成「評審已通過但頁面還讓你接受需求」的自相矛盾狀態。
     */
    private static final Set<String> PRD_PHASE_STATUSES = Set.of(
            RdmConstants.STATUS_ACCEPTED,
            RdmConstants.STATUS_PRD_DESIGNING,
            RdmConstants.STATUS_REVIEWING,
            RdmConstants.STATUS_REVIEW_PASSED);

    /** V3 交付進度投影的階段碼（与前端 RDM_STAGE 同詞彙，只用于展示） */
    private static final String STAGE_DESIGN = "design";
    private static final String STAGE_REVIEW = "review";
    private static final String STAGE_DEV = "dev";
    private static final String STAGE_TEST = "test";
    private static final String STAGE_UAT = "uat";
    private static final String STAGE_RELEASE = "release";

    private final RdmRequirementMapper requirementMapper;
    private final RdmRequirementTargetMapper targetMapper;
    private final RdmRequirementRoleMapper roleMapper;
    private final RdmStatusLogMapper statusLogMapper;
    private final RdmCommentMapper commentMapper;
    private final RdmAttachmentMapper attachmentMapper;
    private final RdmAcceptanceMapper acceptanceMapper;
    private final RdmAcceptanceCaseMapper acceptanceCaseMapper;
    private final SysUserMapper userMapper;
    private final SysDepartmentMapper departmentMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final RdmConfigService configService;
    private final RdmNotifyService notifyService;
    private final OaRequestService oaRequestService;
    private final RdmIntakeCallbackService intakeCallbackService;
    private final PermissionService permissionService;
    private final JdbcTemplate jdbcTemplate;
    /** 需求级访问守卫：数据范围与动作资格的唯一口径（交付子资源也回这里反查校验） */
    private final RdmAccessGuard accessGuard;
    private final RdmWorkTaskMapper taskMapper;
    /** 准入策略裁决：要不要审批、走哪条链、由谁分派 */
    private final RdmIntakePolicyService intakePolicyService;
    /** 准入审批轮次：每轮独立留痕，旧轮回调不能推动新轮 */
    private final RdmIntakeRoundService intakeRoundService;
    /** 阶段 4：上线前的发布放行闸门（只在 release/uat_fail/reopen 三个动作上介入） */
    private final RdmReleaseService releaseService;
    /** 流程版本守卫：V3 分批交付需求不走旧整需求状态机推进 */
    private final RdmFlowVersionGuard flowVersionGuard;
    /** V3 分层：结构主子关系维护（聚合需求下挂执行需求） */
    private final RdmRequirementStructureService structureService;
    /** V3 分层：需求创建后自动生成默认交付项 */
    private final RdmDeliveryItemService deliveryItemService;
    /** V3 分层：需求管理类可执行动作计算（与流转动作互补） */
    private final RdmAllowedActionsService allowedActionsService;
    /** 产品经理 PRD 任务：受理时生成、改派时同步负责人（任务口径不散落到两个服务） */
    private final RdmPrdTaskService prdTaskService;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<RdmRequirementVO> page(RdmRequirementQuery query) {
        SysUser current = operatorResolver.currentUser();
        boolean unrestricted = canSeeAll(current);
        Page<RdmRequirement> page = new Page<>(
                (int) PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage()),
                (int) PageResult.normalizeSize(query.getSize() == null ? 10 : query.getSize()));
        // 「待我審批」与「提交侧合并视图」的关联关系在 OA 审批任务表里，不在需求表的四个人员字段上；
        // 这两个视角不按 relatedOnly 收敛，改由下面的审批待办 id 集合决定范围，
        // 否则审批人只会看到自己提的单，出现「待办计数 3 条、点进去空列表」。
        boolean approvingScope = RdmConstants.SCOPE_APPROVING.equals(query.getScope());
        boolean intakeScope = RdmConstants.SCOPE_INTAKE.equals(query.getScope());
        boolean relatedOnly = !(approvingScope || intakeScope);
        var wrapper = query.toWrapper(scopeUserId(current, unrestricted), relatedOnly);
        if (intakeScope) {
            // 合并视图：本人提交的 ∪ 该我审的。待办为空时等价于「我提的」，不用提前返回空集
            applySubmitterUnion(wrapper, selfUserId(current), approvingRequirementIds(current));
        } else if (approvingScope) {
            // 待我審批需要 join OA 审批任务表才能定出审批人，LambdaQueryWrapper 表达不了：先取 id 再收敛
            List<Long> approvingIds = approvingRequirementIds(current);
            if (approvingIds.isEmpty()) {
                return new PageResult<>(List.<RdmRequirementVO>of(), 0L);
            }
            wrapper.in(RdmRequirement::getId, approvingIds);
        }
        Page<RdmRequirement> result = requirementMapper.selectPage(page, wrapper);
        Map<String, String> stageOf = configService.stageMap();
        List<RdmRequirementVO> records = result.getRecords().stream()
                .map(r -> RdmRequirementVO.from(r, stageOf))
                .toList();
        // V3 交付階段投影必須批量化：逐行查會把列表打成 N+1（一頁 20 行 = 40 次往返）
        fillDeliveryStageBatch(records);
        attachHandlers(records);
        fillOwnershipNames(records);
        return new PageResult<>(records, result.getTotal());
    }

    /**
     * 批量聚合「當前處理人」：一次 IN 查本頁需求的未完成任務負責人，不逐需求回查。
     * <p>只算 todo/doing/blocked（與寫側可調整排期、列表篩選同源）；同一人負责多個任務只保留一項。
     * <p>無未完成任務時回填空列表，前端自行回退到 {@code currentHandler} 的流程推演值。
     */
    private void attachHandlers(List<RdmRequirementVO> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        List<Long> reqIds = records.stream().map(RdmRequirementVO::getId)
                .filter(java.util.Objects::nonNull).toList();
        if (reqIds.isEmpty()) {
            return;
        }
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .in(RdmWorkTask::getReqId, reqIds)
                .in(RdmWorkTask::getStatus, RdmConstants.TASK_OPEN_STATUSES)
                .select(RdmWorkTask::getReqId, RdmWorkTask::getOwnerUserId,
                        RdmWorkTask::getOwnerName, RdmWorkTask::getOwnerEmpNo));
        Map<Long, Map<Long, RdmRequirementVO.HandlerPerson>> byReq = new LinkedHashMap<>();
        for (RdmWorkTask t : tasks) {
            if (t.getOwnerUserId() == null) {
                continue;
            }
            byReq.computeIfAbsent(t.getReqId(), k -> new LinkedHashMap<>())
                    .computeIfAbsent(t.getOwnerUserId(), k -> {
                        RdmRequirementVO.HandlerPerson p = new RdmRequirementVO.HandlerPerson();
                        p.setUserId(t.getOwnerUserId());
                        p.setName(t.getOwnerName());
                        p.setEmpNo(t.getOwnerEmpNo());
                        return p;
                    });
        }
        for (RdmRequirementVO vo : records) {
            Map<Long, RdmRequirementVO.HandlerPerson> m = byReq.get(vo.getId());
            vo.setHandlers(m == null ? java.util.List.of() : new java.util.ArrayList<>(m.values()));
        }
    }

    /**
     * 批量回填归属名称：所属项目 / 所属迭代各一次 IN 查询，不逐行回查。
     * <p>行上只存 projectId / iterationCode，名称必须由服务端联表给出：
     * 前端下拉字典受 200 条上限约束，历史迭代会退化成裸编码，看起来像「没挂迭代」。
     * <p>包级可见便于直测：走 page() 全链路要桩 operatorResolver / 权限 / 分页，得不偿失。
     */
    void fillOwnershipNames(List<RdmRequirementVO> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        List<Long> projectIds = records.stream().map(RdmRequirementVO::getProjectId)
                .filter(Objects::nonNull).distinct().toList();
        Map<Long, String> projectNames = new LinkedHashMap<>();
        if (!projectIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(projectIds.size(), "?"));
            // rdm_project 建表即无 deleted 列（Batch 1），写 deleted = 0 会 Unknown column
            jdbcTemplate.queryForList(
                            "SELECT id, name FROM rdm_project WHERE id IN (" + placeholders + ")",
                            projectIds.toArray())
                    .forEach(row -> projectNames.put(((Number) row.get("id")).longValue(), String.valueOf(row.get("name"))));
        }
        List<String> iterationCodes = records.stream().map(RdmRequirementVO::getIterationCode)
                .filter(StringUtils::hasText).distinct().toList();
        Map<String, String> iterationNames = new LinkedHashMap<>();
        if (!iterationCodes.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(iterationCodes.size(), "?"));
            jdbcTemplate.queryForList(
                            "SELECT code, name FROM rdm_iteration WHERE deleted = 0 AND code IN (" + placeholders + ")",
                            iterationCodes.toArray())
                    .forEach(row -> iterationNames.put(String.valueOf(row.get("code")), String.valueOf(row.get("name"))));
        }
        for (RdmRequirementVO vo : records) {
            vo.setProjectName(vo.getProjectId() == null ? null : projectNames.get(vo.getProjectId()));
            vo.setIterationName(vo.getIterationCode() == null ? null : iterationNames.get(vo.getIterationCode()));
        }
        fillDispatcherEmpNos(records);
    }

    /**
     * 批量回填技术负责人工号：需求表只存了姓名快照，工号按 dispatcherUserId 一次 IN 查询补齐。
     * <p>「当前处理人」在需求池阶段只能靠这个字段展示具体的人，缺工号就退回“只有名字”的口径。
     */
    void fillDispatcherEmpNos(List<RdmRequirementVO> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        List<Long> userIds = records.stream().map(RdmRequirementVO::getDispatcherUserId)
                .filter(Objects::nonNull).distinct().toList();
        if (userIds.isEmpty()) {
            return;
        }
        Map<Long, String> empNos = userMapper.selectBatchIds(userIds).stream()
                .filter(u -> u.getId() != null)
                .collect(java.util.stream.Collectors.toMap(SysUser::getId, u -> u.getEmpId() == null ? "" : u.getEmpId(),
                        (a, b) -> a));
        for (RdmRequirementVO vo : records) {
            if (vo.getDispatcherUserId() != null) {
                String empNo = empNos.get(vo.getDispatcherUserId());
                vo.setDispatcherEmpNo(StringUtils.hasText(empNo) ? empNo : null);
            }
        }
    }

    @Override
    public Map<String, Long> scopeCounts(boolean executionOnly) {
        SysUser current = operatorResolver.currentUser();
        Long userId = scopeUserId(current, canSeeAll(current));
        Map<String, Long> counts = new LinkedHashMap<>();
        // 审批待办只算一次，intake 与 approving 两个计数共用（与列表同一口径）
        List<Long> approvingIds = approvingRequirementIds(current);
        counts.put(RdmConstants.SCOPE_MINE, countByScope(RdmConstants.SCOPE_MINE, userId, executionOnly));
        // 提交侧合并视图：本人提交的 ∪ 该我审的，与列表同一口径（并集去重，不是两个数字相加）。
        // 故意不吃 executionOnly：并集是「提需求」菜单的计数，那边要看到草稿/待审批，不能被执行侧地板收窄。
        counts.put(RdmConstants.SCOPE_INTAKE, intakeUnionCount(selfUserId(current), approvingIds));
        counts.put(RdmConstants.SCOPE_TODO, countByScope(RdmConstants.SCOPE_TODO, userId, executionOnly));
        // 审批待办不在需求表的任何人字段上，只能走 OA 口径（与工作台待办组共用同一个方法）
        counts.put(RdmConstants.SCOPE_APPROVING, (long) approvingIds.size());
        counts.put(RdmConstants.SCOPE_POOL, countByScope(RdmConstants.SCOPE_POOL, userId, executionOnly));
        counts.put(RdmConstants.SCOPE_PRODUCT, countByScope(RdmConstants.SCOPE_PRODUCT, userId, executionOnly));
        counts.put(RdmConstants.SCOPE_DELIVERY, countByScope(RdmConstants.SCOPE_DELIVERY, userId, executionOnly));
        counts.put(RdmConstants.SCOPE_ACCEPTANCE, countByScope(RdmConstants.SCOPE_ACCEPTANCE, userId, executionOnly));
        // 上线后待評分与我的验收记录：与列表同一口径（同一 applyScope 分支），避免计数与点进去不一致
        counts.put(RdmConstants.SCOPE_ACCEPTANCE_POST, countByScope(RdmConstants.SCOPE_ACCEPTANCE_POST, userId, executionOnly));
        counts.put(RdmConstants.SCOPE_ACCEPTANCE_HISTORY, countByScope(RdmConstants.SCOPE_ACCEPTANCE_HISTORY, userId, executionOnly));
        counts.put(RdmConstants.SCOPE_ALL, countByScope(RdmConstants.SCOPE_ALL, userId, executionOnly));
        return counts;
    }

    /**
     * 默认不带执行侧地板的计数（工作台待办分组等消费方）。
     * <p>需要与需求跟进清单同口径（排除准入前/需求池）的调用方走三参重载传 {@code true}。
     */
    private Long countByScope(String scope, Long userId) {
        return countByScope(scope, userId, false);
    }

    private Long countByScope(String scope, Long userId, boolean executionOnly) {
        RdmRequirementQuery q = new RdmRequirementQuery();
        q.setScope(scope);
        q.setExecutionOnly(executionOnly);
        return requirementMapper.selectCount(q.toWrapper(userId));
    }

    /**
     * 该视角是否需要叠 OA 审批待办的 id 集合（并因此不能按 relatedOnly 收敛）。
     * <p>page / stats / countStatsSubset 三处共用同一个判定：一旦各写各的，
     * 就会出现「看板信号卡与列表行数对不上」这种最难排查的口径分叉。
     */
    private static boolean requiresOaPendingIds(String scope) {
        return RdmConstants.SCOPE_APPROVING.equals(scope) || RdmConstants.SCOPE_INTAKE.equals(scope);
    }

    /**
     * 提交侧合并视图的数据范围：本人提交的 ∪ 该我审的。
     * <p>relatedOnly 的四字段并集表达不了这个并集（审批待办不在需求表人员字段上），
     * 所以这两个视角关掉 relatedOnly，由这里显式拼那一条 OR 条件。
     * <p><b>本视角故意不跟随 canSeeAll 放宽成全量</b>（与其他视角不同）：
     * 「提交需求」菜单的职责就是一条“我的提交 + 我的审批待办”，合并前给分配侧持权者
     * 展示的也只有其 OA 待办；改成全量会把一个专用窄菜单变成另一个需求池，
     * 既不符合本菜单职责，也是对现状的可见范围放大。要看全量请走需求管理（all）。
     * <p>{@code userId} 必须是 {@link #selfUserId} 解析后的非空 id（未登录为 -1 哨兵，
     * 收敛为空集）；无审批待办时退化为「本人提交的」。
     * <p>static + 包内可见：不依赖实例状态，单测可直接验证各分支的 SQL 形状，
     * 不必拼起 26 个构造参数。
     */
    static void applySubmitterUnion(LambdaQueryWrapper<RdmRequirement> wrapper, Long userId, List<Long> approvingIds) {
        if (approvingIds == null || approvingIds.isEmpty()) {
            wrapper.eq(RdmRequirement::getSubmitterUserId, userId);
            return;
        }
        wrapper.and(w -> w.eq(RdmRequirement::getSubmitterUserId, userId)
                .or().in(RdmRequirement::getId, approvingIds));
    }

    /**
     * 提交侧合并视图的计数（与 {@link #applySubmitterUnion} 同一口径）。
     * <p>故意不用 SQL UNION：这个并集按主键去重，本人提交的单也可能正是该我审的
     * （自审兼提交人），两个 count 相加会把同一条算两次。
     * <p>只拉 id 列一次取回本人提交集，同时充当计数与去重集合，不必再跑一次 COUNT。
     */
    private long intakeUnionCount(Long userId, List<Long> approvingIds) {
        RdmRequirementQuery mine = new RdmRequirementQuery();
        mine.setScope(RdmConstants.SCOPE_MINE);
        List<Long> mineIds = requirementMapper.selectList(mine.toWrapper(userId).select(RdmRequirement::getId))
                .stream().map(RdmRequirement::getId).toList();
        return mergeUnionCount(mineIds.size(), new LinkedHashSet<>(mineIds), approvingIds);
    }

    /**
     * 并集去重的纯函数部分：总数 = 本人提交的 + 待办里不属于本人的那几条。
     * <p>单独抽出来是因为“相加再减交集”这类算术最容易写错（尤其自审兼提交人的场景），
     * 直接对函数做断言比对数据库轻得多。
     */
    static long mergeUnionCount(long mineCount, Set<Long> mineIds, List<Long> approvingIds) {
        if (approvingIds == null || approvingIds.isEmpty()) {
            return mineCount;
        }
        long outsideMine = approvingIds.stream().filter(id -> !mineIds.contains(id)).count();
        return mineCount + outsideMine;
    }

    /**
     * 解析数据范围收敛用的 userId（任务19 / 缺口5：身份 vs 可见范围分离）。
     * <p>{@link RdmRequirementQuery#toWrapper} 把 {@code null} 当作「管理视角 = 不受限 = 全量」，
     * 因此绝不能把「未认证 / 拿不到登录人」也传成 {@code null} —— 那会让「我的」退化成「全部」，
     * 任何绕过登录态的调用都能读到全公司需求。
     * <p>口径：管理视角（canSeeAll）才返回 {@code null} 放开全量；否则必须取认证主体的
     * {@code SysUser.id}，拿不到身份时 fail-closed，返回一个不可能命中的哨兵 id 把结果收敛为空集。
     */
    private Long scopeUserId(SysUser current, boolean unrestricted) {
        if (unrestricted) {
            return null;
        }
        if (current == null || current.getId() == null) {
            return UNAUTHENTICATED_SCOPE_ID;
        }
        return current.getId();
    }

    /**
     * 只取“登录人自己”的 id，不受 canSeeAll 影响（永远不返回 null）。
     * <p>提交侧合并视图用它：那一半“本人提交的”必须绑在真实身份上，
     * 拿不到身份时同样返回 {@code UNAUTHENTICATED_SCOPE_ID} 哨兵收敛为空集。
     */
    private Long selfUserId(SysUser current) {
        return current == null || current.getId() == null ? UNAUTHENTICATED_SCOPE_ID : current.getId();
    }

    /**
     * 看板信号卡统计：与列表共用同一套条件构造，口径不可能分叉。
     *
     * <p>以前看板卡是对已加载的行做 filter().length 算的，而看板一次只拉固定上限条数，
     * 需求一多卡片数字就永远停在上限值——用户看到「逾期 60」而实际 200，会错判风险。
     */
    @Override
    public Map<String, Long> stats(RdmRequirementQuery query) {
        SysUser current = operatorResolver.currentUser();
        boolean unrestricted = canSeeAll(current);
        Long userId = scopeUserId(current, unrestricted);
        boolean oaPendingScope = requiresOaPendingIds(query.getScope());
        boolean intakeScope = RdmConstants.SCOPE_INTAKE.equals(query.getScope());
        // 审批待办的 id 集合只算一次、四个指标共用：每算一个指标重查一轮 OA 太浪费
        List<Long> approvingIds = oaPendingScope ? approvingRequirementIds(current) : null;
        Map<String, Long> counts = new LinkedHashMap<>();
        // approving 待办为空 ⇒ 整个范围为空；intake 为空只是「没有该我审的」，自己提的照算
        if (oaPendingScope && !intakeScope && approvingIds.isEmpty()) {
            counts.put("total", 0L);
            counts.put("overdue", 0L);
            counts.put("toAccept", 0L);
            counts.put("pool", 0L);
            return counts;
        }
        counts.put("total", countStatsSubset(query, userId, current, approvingIds, q -> { }));
        counts.put("overdue", countStatsSubset(query, userId, current, approvingIds, q -> q.setOverdueOnly(true)));
        counts.put("toAccept", countStatsSubset(query, userId, current, approvingIds,
                q -> { q.setStatuses(null); q.setStatus(RdmConstants.STATUS_UAT_PENDING); }));
        counts.put("pool", countStatsSubset(query, userId, current, approvingIds,
                q -> { q.setStatuses(null); q.setStatus(RdmConstants.STATUS_POOL); }));
        return counts;
    }

    /** 复制一份查询条件再叠加单个指标的条件，避免四个指标互相污染 */
    private long countStatsSubset(RdmRequirementQuery base, Long userId, SysUser current, List<Long> approvingIds,
                                  java.util.function.Consumer<RdmRequirementQuery> tweak) {
        RdmRequirementQuery q = copyFiltersForStats(base);
        tweak.accept(q);
        // 与 page() 保持同一收敛规则：待我審批（含提交侧合并视图）的关联关系在 OA 任务表上，不按 relatedOnly 收敛
        boolean relatedOnly = !requiresOaPendingIds(q.getScope());
        var wrapper = q.toWrapper(userId, relatedOnly);
        if (RdmConstants.SCOPE_INTAKE.equals(q.getScope())) {
            // 与 page() 同一身份口径：用本人 id，不吃 canSeeAll 的全量放宽
            applySubmitterUnion(wrapper, selfUserId(current), approvingIds);
        } else if (approvingIds != null) {
            wrapper.in(RdmRequirement::getId, approvingIds);
        }
        Long n = requirementMapper.selectCount(wrapper);
        return n == null ? 0L : n;
    }

    private static RdmRequirementQuery copyFiltersForStats(RdmRequirementQuery src) {
        RdmRequirementQuery q = new RdmRequirementQuery();
        q.setScope(src.getScope());
        q.setKeyword(src.getKeyword());
        q.setReqType(src.getReqType());
        q.setPriority(src.getPriority());
        q.setStatus(src.getStatus());
        q.setDeptId(src.getDeptId());
        q.setPmUserId(src.getPmUserId());
        q.setOverdueOnly(src.getOverdueOnly());
        // 执行侧地板必须跟着复制：否则需求跟进清单的看板信号卡会比列表多算准入前/需求池的单
        q.setExecutionOnly(src.getExecutionOnly());
        // 当前处理人筛选必须与列表同源：否则筛人后看板信号卡/视图栏计数与表格行数分叉
        q.setHandlerUserId(src.getHandlerUserId());
        return q;
    }

    @Override
    public RdmRequirementVO detail(Long id) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        requireVisible(req, current, "查看詳情");
        Map<String, String> stageOf = configService.stageMap();
        RdmRequirementVO vo = RdmRequirementVO.from(req, stageOf);
        // 归属体系改造：项目名/迭代名统一联表下发（此前 VO 只有 id/code，前端只能拼「項目 #id」兜底）
        fillOwnershipNames(java.util.List.of(vo));
        vo.setDescription(req.getDescription());
        vo.setExpectResult(req.getExpectResult());
        vo.setBusinessValue(req.getBusinessValue());
        vo.setSourceChannel(req.getSourceChannel());

        vo.setTargets(targetMapper.selectList(new LambdaQueryWrapper<RdmRequirementTarget>()
                        .eq(RdmRequirementTarget::getReqId, id).orderByAsc(RdmRequirementTarget::getSortOrder))
                .stream().map(RdmRequirementVO.TargetRef::from).toList());

        List<RdmRequirementRole> roles = listRoles(id);
        vo.setRoles(roles.stream().map(RdmRequirementVO.RoleMember::from).toList());
        vo.setMyRole(resolveMyRole(req, current));

        // 时间轴按正序展示（最早在上），当前状态节点尚未关闭，停留时长按实时计算
        List<RdmStatusLog> logs = statusLogMapper.selectList(new LambdaQueryWrapper<RdmStatusLog>()
                .eq(RdmStatusLog::getReqId, id).orderByAsc(RdmStatusLog::getEnterTime).orderByAsc(RdmStatusLog::getId));
        Map<String, String> labels = configService.statusLabelMap();
        List<RdmRequirementVO.TimelineNode> timeline = new ArrayList<>(logs.stream()
                .map(l -> {
                    RdmRequirementVO.TimelineNode node = RdmRequirementVO.TimelineNode.from(l);
                    node.setStatusLabel(labels.get(l.getToStatus()));
                    return node;
                }).toList());
        java.util.Collections.reverse(timeline);
        vo.setTimeline(timeline);

        boolean hideInternal = !isSubmitter(req, current) && !isDevSide(roles, current);
        vo.setComments(commentMapper.selectList(new LambdaQueryWrapper<RdmComment>()
                        .eq(RdmComment::getReqId, id).orderByAsc(RdmComment::getCreatedAt))
                .stream()
                .filter(c -> !hideInternal || c.getInternalFlag() == null || c.getInternalFlag() == 0)
                .map(c -> RdmRequirementVO.CommentItem.from(c, c.getCreatedBy()))
                .toList());

        vo.setAttachments(attachmentMapper.selectList(new LambdaQueryWrapper<RdmAttachment>()
                        .eq(RdmAttachment::getReqId, id).orderByAsc(RdmAttachment::getId))
                .stream().map(RdmRequirementVO.AttachmentItem::from).toList());

        RdmAcceptance latest = acceptanceMapper.selectOne(new LambdaQueryWrapper<RdmAcceptance>()
                .eq(RdmAcceptance::getReqId, id).orderByDesc(RdmAcceptance::getId).last("LIMIT 1"));
        vo.setAcceptance(RdmRequirementVO.AcceptanceInfo.from(latest));

        if (StringUtils.hasText(req.getIntakeFlowNo())) {
            vo.setApprovalNodes(approvalNodes(req.getIntakeFlowNo()));
        }

        vo.setSla(buildSla(req));
        vo.setAllowedActions(allowedActions(req, current));

        // 需求管理类可执行动作（与流转动作 allowedActions 互补）：粗粒度按钮口径，按角色/生命周期下发
        Long currentUserId = current == null ? null : current.getId();
        vo.setRequirementActions(allowedActionsService.computeRequirementActions(req.getId(), currentUserId));

        // V3 分层：填充结构子需求（聚合需求）与结构父信息（有结构父时）。
        // 仅 V3 需求触发，V1/V2 不做额外查询、行为保持不变（也避免测试中 mock 服务返回 null 造成 NPE）。
        boolean flowV3 = req.getFlowVersion() != null && req.getFlowVersion() == RdmConstants.FLOW_VERSION_3;
        if (flowV3) {
            // V3 交付進度投影（只讀）：需求狀態受理後停住，進度看交付項
            fillDeliveryStage(vo, req.getId());
            if (RdmConstants.KIND_AGGREGATE.equals(req.getRequirementKind())) {
                List<RdmRequirementStructureService.RequirementTreeNode> children =
                        structureService.getRequirementTree(req.getId());
                vo.setStructureChildren(children == null ? new ArrayList<>() : children);
            }
            if (req.getStructureParentReqId() != null) {
                // 祖先链为 根→…→父→当前，直接父节点即倒数第二位
                List<RdmRequirementStructureService.RequirementTreeNode> chain =
                        structureService.getAncestorChain(req.getId());
                if (chain != null && chain.size() >= 2) {
                    vo.setStructureParent(chain.get(chain.size() - 2));
                }
            }
        }
        return vo;
    }

    /* ==================== 提交与修改 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO create(RdmRequirementCreateDTO dto) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        validateCreate(dto);
        boolean draft = RdmConstants.STATUS_DRAFT.equals(dto.getMode());

        RdmRequirement req = new RdmRequirement();
        // 正式需求编号延迟生成：草稿 / 待审批 / 审批驳回阶段不预占号码、不消费流水。
        // 拆分前这里无条件 next("rdm_requirement")，于是「审批被驳回的需求也占了一个正式号」；
        // 发号只在准入完成点（本方法的免审直送分支 / OA 终审回调 / 无单回退状态机 / 验收遗留后续需求）发生。
        req.setTitle(dto.getTitle().trim());
        req.setReqType(dto.getReqType());
        req.setPriority(StringUtils.hasText(dto.getPriority()) ? dto.getPriority() : "P2");
        req.setComplexity(dto.getComplexity());
        req.setDescription(dto.getDescription());
        req.setExpectResult(dto.getExpectResult());
        req.setBusinessValue(dto.getBusinessValue());
        req.setExpectDate(parseDate(dto.getExpectDate()));
        req.setSubmitterUserId(current.getId());
        req.setSubmitterEmpNo(current.getEmpId());
        req.setSubmitterName(current.getName());
        req.setSubmitDeptId(current.getDepartmentId());
        req.setSubmitDeptName(resolveDeptName(current.getDepartmentId()));
        req.setSourceChannel("WEB");
        req.setProgress(0);
        req.setBlockedFlag(0);
        req.setOverdueFlag(0);
        // 新建需求走新链路（五节点/定稿快照/工时明细）；存量记录保持 flow_version=1，
        // 否则发布闸门会把历史记录一律算成「未做验收准备」。
        // 交付流程不在提交侧确定（业务方不懂 V2/V3）：创建时保持 V2 占位，
        // 到准入后的分配/认领窗口再由产研确定（默认 V3，见 applyFlowVersionOnAssignment）。
        boolean flowV3 = dto.getFlowVersion() != null
                && dto.getFlowVersion() == RdmConstants.FLOW_VERSION_3;
        req.setFlowVersion(flowV3 ? RdmConstants.FLOW_VERSION_3 : 2);
        if (flowV3) {
            // V3：项目可后关联（准入阶段再挂，允许为空）；需求种类缺省 execution，聚合需求须显式声明 aggregate
            req.setProjectId(dto.getProjectId());
            req.setRequirementKind(StringUtils.hasText(dto.getRequirementKind())
                    ? dto.getRequirementKind().trim() : RdmConstants.KIND_EXECUTION);
        }
        req.setRejectCount(0);
        req.setReopenCount(0);
        req.setReworkCount(0);
        req.setChangeCount(0);
        // 受理意向：指定 PM 只回答「谁来做」，不回答「要不要审」；要不要审由服务端准入策略裁决
        SysUser pm = dto.getPmUserId() == null ? null : userMapper.selectById(dto.getPmUserId());
        if (pm != null) {
            requirePmEligible(pm);
        }
        RdmIntakeVO.Decision decision = draft ? null : intakePolicyService.decide(current, dto.getReqType(), firstSystemCode(dto));
        req.setNeedApproval(draft ? 1 : (decision != null && decision.isNeedApproval() ? 1 : 0));
        req.setCreatedBy(operatorResolver.operatorSignature(current));
        req.setUpdatedBy(req.getCreatedBy());

        // 意向 PM 先落库：需审批时不能直接写受理人，审批通过后再生效（否则「提单人指定人就跳过准入」）
        if (pm != null) {
            req.setIntentPmUserId(pm.getId());
            req.setIntentPmName(pm.getName());
        }
        SysUser acceptor = resolveAcceptor(dto.getAcceptorUserId(), current);
        req.setAcceptorUserId(acceptor.getId());
        req.setAcceptorName(acceptor.getName());
        /*
         * 技术负责人只在「提交技术部统一分配」时生效：直接指定产品经理的需求不需要中间分发人。
         * 先选负责人再进需求池，是为了让「當前處理人」在分配前就是一个真实的人（姓名+工号），
         * 而不是一个无法落到人的角色名。
         */
        SysUser dispatcher = resolveDispatcher(dto.getDispatcherUserId(), pm);
        if (dispatcher != null) {
            req.setDispatcherUserId(dispatcher.getId());
            req.setDispatcherName(dispatcher.getName());
        }

        if (draft) {
            req.setStatus(RdmConstants.STATUS_DRAFT);
        } else if (req.getNeedApproval() == 1) {
            req.setStatus(RdmConstants.STATUS_INTAKE_PENDING);
            req.setSubmitTime(LocalDateTime.now());
        } else {
            // 服务端确认免审批：提交成功即已准入，落点与首次发号在同一条 insert 里完成。
            // 新建直接提交等价于「存草稿再提交」，所以跟 selfSubmit 读同一份配置落点，保证两条路径结果一字不差。
            req.setSubmitTime(LocalDateTime.now());
            applyExemptLanding(req, current, pm, requireExemptPoolRule(RdmConstants.STATUS_DRAFT));
        }
        applyIntakeDecision(req, decision);
        req.setStatusEnterTime(LocalDateTime.now());
        req.setCurrentHandlerName(computeHandler(req, pm));
        requirementMapper.insert(req);

        saveTargets(req.getId(), dto.getTargets());
        saveAttachments(req.getId(), dto.getAttachments(), current);
        saveInitialRoles(req, current, pm, acceptor, dto.getCcUserIds());
        appendStatusLog(req, null, current, RdmConstants.ACTION_SUBMIT, draft ? "保存草稿" : "需求已提交");

        if (!draft) {
            openIntakeRound(req, decision, current);
        }

        // V3 分层链路（任务19 / 缺口1）：
        // ① 默认交付项只对「执行类(execution) 且 已准入」的 V3 需求生成 —— 聚合需求(aggregate)只是看板归并口径，
        //    其交付由下挂的执行子需求承担，绝不在此直接建执行交付项；草稿/待准入阶段同样不建，
        //    待准入(INTAKE_PENDING)的 V3 执行需求由准入完成点（actIntakeApproval / OA 回调）再补建。
        // ② 结构父挂载与准入无关（表达聚合归属），但必须走 do* 内部方法，避免把 structureService 的
        //    executeOnce 幂等入口嵌进 create 的活动事务（决策2）。父需为 aggregate、单父、无环、两端鉴权、
        //    同项目、均 V3 等校验一律在 doAddChildRequirement 内强制，此处不放宽。
        if (flowV3 && !draft) {
            maybeCreateV3DefaultItem(req, current.getId());
            if (dto.getStructureParentReqId() != null) {
                structureService.doAddChildRequirement(dto.getStructureParentReqId(), req.getId(), current.getId());
            }
        }

        notifyOnCreate(req, pm);
        log.info("需求已創建: reqNo={}, status={}, submitter={}", req.getReqNo(), req.getStatus(), req.getSubmitterName());
        return RdmRequirementVO.from(req, configService.stageMap());
    }

    /**
     * 複製需求為新草稿（保留來源鏈）。
     *
     * <p><b>為何需要複製</b>：交付流程在分配/認領時確定後即鎖定，已產生任務/提測/驗收的需求
     * 不允許原地降級（會讓交付項外鍵成為孤兒數據）。需要換交付方式的，就複製一條新需求重走流程，
     * 原需求及其交付項/評審/測試/驗收記錄完整保留可追溯。
     *
     * <p><b>複製邊界</b>：只複製業務內容（標題/類型/優先級/規模/現狀/期望/價值/期望日期/需求對象/
     * 驗收人/意向 PM）；<b>不複製</b>項目、迭代、交付流程（默認 V2 占位，分配時再定）、附件
     * （data URL 體積大且需重新確認）、結構父需求、評審/PRD/任務/交付項/驗收記錄。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO copy(Long id) {
        RdmRequirement source = requireRequirement(id);
        RdmRequirementCreateDTO dto = new RdmRequirementCreateDTO();
        dto.setMode(RdmConstants.STATUS_DRAFT);
        dto.setTitle(copyTitle(source.getTitle()));
        dto.setReqType(source.getReqType());
        dto.setPriority(source.getPriority());
        dto.setComplexity(source.getComplexity());
        dto.setDescription(source.getDescription());
        dto.setExpectResult(source.getExpectResult());
        dto.setBusinessValue(source.getBusinessValue());
        dto.setExpectDate(source.getExpectDate() == null ? null : source.getExpectDate().toString());
        dto.setAssignMode(source.getAssigneePmUserId() != null ? "PM" : "POOL");
        dto.setPmUserId(source.getAssigneePmUserId());
        dto.setAcceptorUserId(source.getAcceptorUserId());
        dto.setTargets(copyTargets(id));
        RdmRequirementVO created = create(dto);
        if (created != null && created.getId() != null) {
            // 來源鏈：複用 parent_req_id/parent_req_no（與驗收遺留同屬「從哪條需求來」的追溯字段）
            jdbcTemplate.update(
                    "UPDATE rdm_requirement SET parent_req_id = ?, parent_req_no = ? WHERE id = ?",
                    source.getId(), source.getReqNo(), created.getId());
            SysUser current = operatorResolver.currentUser();
            log.info("複製需求: sourceId={}, newId={}, operator={}",
                    id, created.getId(), current == null ? null : current.getName());
        }
        return created;
    }

    /** 複製標題：加「（複製）」後綴並保證不超標題上限 */
    private String copyTitle(String title) {
        String suffix = "（複製）";
        String base = title == null ? "" : title.trim();
        int max = RdmConstants.TITLE_MAX_LENGTH;
        if (base.length() + suffix.length() <= max) {
            return base + suffix;
        }
        return base.substring(0, Math.max(0, max - suffix.length())) + suffix;
    }

    /** 複製需求對象（定位信息），截圖路徑一並保留（與附件不同，它屬於定位證據） */
    private List<RdmRequirementCreateDTO.Target> copyTargets(Long reqId) {
        List<RdmRequirementTarget> rows = targetMapper.selectList(
                new LambdaQueryWrapper<RdmRequirementTarget>().eq(RdmRequirementTarget::getReqId, reqId));
        List<RdmRequirementCreateDTO.Target> targets = new ArrayList<>();
        if (rows == null) {
            return targets;
        }
        for (RdmRequirementTarget row : rows) {
            RdmRequirementCreateDTO.Target target = new RdmRequirementCreateDTO.Target();
            target.setAnchorType(row.getAnchorType());
            target.setSystemCode(row.getSystemCode());
            target.setMenuKey(row.getMenuKey());
            target.setPagePath(row.getPagePath());
            target.setAnchorName(row.getAnchorName());
            target.setAnchorDesc(row.getAnchorDesc());
            target.setScreenshotUrl(row.getScreenshotPath());
            targets.add(target);
        }
        return targets;
    }

    /**
     * V3 执行类需求「已准入」后生成默认交付项（任务19 / 缺口1：正确时机 + 聚合 不建 + 幂等）。
     * <p>准入 = 已通过准入审批或无需审批直接进池/受理。以下情形一律不建：
     * <ul>
     *   <li>非 V3 流程（V1/V2 整需求链路不以交付项为单位，语义完全不变）；</li>
     *   <li>聚合需求(aggregate)——它只是看板归并口径，交付由下挂的执行子需求承担；</li>
     *   <li>草稿 / 待准入(INTAKE_PENDING) / 准入驳回(INTAKE_REJECTED)——尚未准入，过早建会污染范围口径。</li>
     * </ul>
     * <p>{@code getOrCreateDefaultItem} 本身是 get-or-create 语义，重复触发天然幂等，
     * 因此可在 create / selfSubmit / 准入回调等多个「准入完成点」安全调用。
     */
    private void maybeCreateV3DefaultItem(RdmRequirement req, Long operatorId) {
        if (req == null || !isFlowV3(req.getFlowVersion())) {
            return;
        }
        if (!RdmConstants.KIND_EXECUTION.equals(req.getRequirementKind())) {
            return;
        }
        String status = req.getStatus();
        if (RdmConstants.STATUS_DRAFT.equals(status)
                || RdmConstants.STATUS_INTAKE_PENDING.equals(status)
                || RdmConstants.STATUS_INTAKE_REJECTED.equals(status)) {
            return;
        }
        // 传快照：准入回调/提交链路可能刚改写需求字段，重读库会拿到旧行
        deliveryItemService.getOrCreateDefaultItem(req, operatorId);
    }

    /** 是否 V3 分批交付流程版本（仅认 3，与 RdmFlowVersionGuard 同口径） */
    private boolean isFlowV3(Integer flowVersion) {
        return flowVersion != null && flowVersion == RdmConstants.FLOW_VERSION_3;
    }

    /**
     * 首次准入成功时生成正式需求编号：仅当 {@code req_no} 为空时取号，已有号原样返回。
     * <p>幂等是硬要求：OA 终审回调可能重复投递（补偿推进、重试），直取号会每天白吹流水；
     * 已准入的需求号一旦生成就永不变更、不重发。
     * <p>调用方必须在取号后同一条 insert/update 里落库，不得先改状态后补号——
     * {@code rdm_requirement} 的 CHECK 不允许「已准入却无号」的中间态存在。
     * <p>本方法不抛异常也不判空字符串：取号失败直接向上抛使整个准入事务回滚，
     * 不能留下「已放行但无编号」的半成品。
     */
    private void ensureRequirementNumber(RdmRequirement req) {
        if (req == null || StringUtils.hasText(req.getReqNo())) {
            return;
        }
        req.setReqNo(bizSeqService.next(BizSeqService.RULE_RDM_REQUIREMENT));
    }

    /**
     * 延迟发号 v2 的补号闸门：目标状态不在「允许无号」白名单时，必须在同一条 UPDATE 里补号。
     * <p>为什么放在流转收口点而不是每个入口各发一次号：进入 assigned 有「认领」与「分配/改派」
     * 多条路径，认领发号、分配不发号（RdmSelfServiceTest 已钉住「免审批直送受理不立即生成编号」），
     * 于是分配路径上的需求推进到 evaluating 会被数据库 CHECK {@code ck_rdm_req_no_admitted} 打回，
     * 用户只看到「數據庫操作異常, 請稍後重試」。本方法是唯一必经收口点，顺带自愈存量无号数据。
     * <p>白名单与 CHECK 同源（{@link RdmConstants#REQ_NO_NULLABLE_STATUSES}），避免代码与库口径漂移。
     * <p>包内可见仅为让单测能直接钉住「何时发号 / 何时不消费流水」，不对外暴露。
     */
    void ensureReqNoForTargetStatus(RdmRequirement req, String toStatus) {
        if (req == null || !RdmConstants.REQ_NO_NULLABLE_STATUSES.contains(toStatus)) {
            ensureRequirementNumber(req);
        }
    }

    /**
     * 免审批需求的执行起点：基落点从 {@code rdm_transition} 读（状态机真值），
     * 再按「提交时已指定且仍有效的意向产品」细化为直送受理；两种落点都在同一次调用里首次发号。
     * <p>为什么不再在代码里硬写 pool：仓库口径是「状态机真值：rdm_status_def + rdm_transition，
     * 不在代码里硬编码流转」。硬写会让管理员在「狀態與流轉」里停用/改落点时，免审批路径仍照旧放行。
     * <p>assigned 细化仍留在代码：它是「意向→正式受理人」的业务判定，不是状态机分支；
     * OA 终审回调的 {@code approve_intake→pool + applyIntentPm→assigned} 是同一形状。
     * <p>{@code create()} 的直接提交与 {@code selfSubmit()} 的草稿提交/驳回重提共用本方法，
     * 否则会出现「新建时直送产品、存草稿后再提交却停在待审批」两套结果。
     * <p>意向产品失效（离职/停用/已无受理权）时不报错而是回配置基落点：宁可让人重新分配，
     * 也不能把需求交给一个点不动任何动作的人。{@code create()} 路径上 pm 已经过
     * {@link #requirePmEligible} 硬校验，这里的软判定不会改变它的结果。
     */
    private void applyExemptLanding(RdmRequirement req, SysUser operator, SysUser intentPm,
                                    RdmConfigVO.Transition poolRule) {
        // 延迟发号 v2：免审批提交不再立即生成需求编号，编号推迟到产品经理认领（claim）时生成。
        SysUser pm = isPmEligible(intentPm) ? intentPm : null;
        if (pm != null) {
            req.setStatus(RdmConstants.STATUS_ASSIGNED);
            applyPm(req, pm, operator);
        } else {
            req.setStatus(poolRule.getToStatus());
        }
        req.setOverdueFlag(0);
    }

    /**
     * 取免审批直送的配置流转规则（基落点真值）；缺行、停用或落点不是需求池一律拒提交。
     * <p>fail-closed 是方案明文要求：「缺配置时明确报错，不以缺配置当审批完成或免审」。
     * 静默回退到代码里的 pool 会把「配置被改坏」伪装成「正常免审放行」，难排查且绕过了管理。
     */
    private RdmConfigVO.Transition requireExemptPoolRule(String fromStatus) {
        String actionCode = RdmConstants.STATUS_INTAKE_REJECTED.equals(fromStatus)
                ? RdmConstants.ACTION_RESUBMIT_POOL : RdmConstants.ACTION_SUBMIT_POOL;
        RdmConfigVO.Transition rule = configService.findTransition(fromStatus, actionCode);
        if (rule == null || !RdmConstants.STATUS_POOL.equals(rule.getToStatus())) {
            throw new BusinessException("免審批直送配置缺失或落點異常（" + fromStatus + " --" + actionCode
                    + "--> pool），本次提交已拒絕；請在「需求配置 › 狀態與流轉」補好該流轉規則，或改回需審批策略");
        }
        return rule;
    }

    /**
     * 草稿提交 / 驳回重提命中免审批时的准入落点（不走 intake_pending）。
     * <p>为什么不能先走 {@code transitionInternal(submit)}：那条配置的落点是 intake_pending，
     * 而免审批本轮不会发起 OA 准入单（{@code openIntakeRound} 只在需审时提交），
     * 需求会永久停在「待审批」且无单可推。
     * <p>基落点取配置的 {@code submit_pool / resubmit_pool}（缺配置则拒提交），再由
     * {@link #applyExemptLanding} 按有效意向产品细化为直送受理；两者合起来就是回调的
     * {@code approve_intake→pool + applyIntentPm→assigned} 同形状。
     * <p>不走 {@code transitionInternal} 的原因：它只能给出配置的单一落点，无法表达
     * 「提交时已指定有效产品→assigned」；且它会先拿 intake_pending 的规则做角色/必填校验。
     * 本路径的提交人身份已由 {@code requireOwner}（本人）与 {@code requireVisible}（相关人）守住，
     * 配置动作的 allowed_roles 本就是 SUBMITTER，不构成新的权限面。
     */
    private void landExemptSubmission(RdmRequirement req, SysUser current, String fromStatus) {
        LocalDateTime now = LocalDateTime.now();
        // 先取配置落点：缺规则时立刻拒绝，不能先改状态/先拿号再报错
        RdmConfigVO.Transition poolRule = requireExemptPoolRule(fromStatus);
        SysUser intentPm = req.getIntentPmUserId() == null ? null : userMapper.selectById(req.getIntentPmUserId());
        req.setSubmitTime(now);
        applyExemptLanding(req, current, intentPm, poolRule);
        req.setStatusEnterTime(now);
        req.setCurrentHandlerName(computeHandler(req, null));
        req.setUpdatedBy(operatorResolver.operatorSignature(current));
        requirementMapper.updateById(req);

        closeOpenStatusLog(req.getId(), now, isOverdue(req));
        // 留痕用配置动作码（submit_pool / resubmit_pool），时间轴与「需求配置」里的规则一字不差
        appendStatusLog(req, fromStatus, current, poolRule.getActionCode(),
                "服務端免審批直送：" + labelOf(req.getStatus()));
        notifyOnCreate(req, isPmEligible(intentPm) ? intentPm : null);
        log.info("免審批提交已直送落点: reqId={}, reqNo={}, {} -> {}, action={}",
                req.getId(), req.getReqNo(), fromStatus, req.getStatus(), poolRule.getActionCode());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO update(Long id, RdmRequirementCreateDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        if (!RdmConstants.STATUS_DRAFT.equals(req.getStatus())) {
            throw new BusinessException("僅草稿狀態可修改，如需變更請走需求變更流程");
        }
        requireOwner(req, current, "修改");
        validateCreate(dto);
        Long previousAcceptorUserId = req.getAcceptorUserId();
        Long previousPmUserId = req.getIntentPmUserId();
        Long previousDispatcherUserId = req.getDispatcherUserId();
        Long previousStructureParentReqId = req.getStructureParentReqId();
        req.setTitle(dto.getTitle().trim());
        req.setReqType(dto.getReqType());
        if (StringUtils.hasText(dto.getPriority())) {
            req.setPriority(dto.getPriority());
        }
        req.setComplexity(dto.getComplexity());
        req.setDescription(dto.getDescription());
        req.setExpectResult(dto.getExpectResult());
        req.setBusinessValue(dto.getBusinessValue());
        req.setExpectDate(parseDate(dto.getExpectDate()));

        /*
         * 草稿续编必须把「意向产品经理 / 业务验收人 / 附件」一起落库。
         * 原先 update 只改标量字段，用户在草稿里选的验收人和指定的 PM 会被静默丢弃，
         * 提交后单据回到「提交人自己验收」——这是能被界面确认、却对不上库的假成功。
         */
        SysUser pm = null;
        if (dto.getPmUserId() != null) {
            pm = userMapper.selectById(dto.getPmUserId());
            if (pm == null) {
                throw new BusinessException("指定的產品經理不存在，請重新選擇");
            }
            requirePmEligible(pm);
            req.setIntentPmUserId(pm.getId());
            req.setIntentPmName(pm.getName());
        } else {
            // 明确清空：草稿里选了「提交技術部統一分配」就要真的不再带意向人
            req.setIntentPmUserId(null);
            req.setIntentPmName(null);
        }
        SysUser acceptor = resolveAcceptor(dto.getAcceptorUserId(), current);
        req.setAcceptorUserId(acceptor.getId());
        req.setAcceptorName(acceptor.getName());
        // 草稿续编同样要能改技术负责人；清空走下面的显式 UpdateWrapper，否则 null 不会进 SET
        SysUser dispatcher = resolveDispatcher(dto.getDispatcherUserId(), pm);
        if (dispatcher != null) {
            req.setDispatcherUserId(dispatcher.getId());
            req.setDispatcherName(dispatcher.getName());
        }
        // 任务19 / 缺口1：草稿续编时补齐 V3 字段，避免 projectId/requirementKind 被静默丢弃
        //（与旧版静默丢弃意向 PM/验收人同类问题）。仅草稿可改，此处直接落标量字段；
        // 结构父变更走 structureService 完整校验，不在这里直写 structureParentReqId 绕过校验。
        boolean flowV3 = req.getFlowVersion() != null && req.getFlowVersion() == RdmConstants.FLOW_VERSION_3;
        if (flowV3) {
            req.setProjectId(dto.getProjectId());
            if (StringUtils.hasText(dto.getRequirementKind())) {
                req.setRequirementKind(dto.getRequirementKind().trim());
            }
        }
        req.setUpdatedBy(operatorResolver.operatorSignature(current));
        requirementMapper.updateById(req);

        /*
         * MyBatis-Plus 的 updateById 默认 NOT_NULL 策略，null 字段根本不会进 SET 子句，
         * 所以「清掉意向 PM」必须走显式 UpdateWrapper，否则改回「统一分配」的草稿
         * 下次审批通过时仍会把旧意向人派成受理人（界面看起来已经清空了，库里还留着）。
         */
        if (pm == null && previousPmUserId != null) {
            requirementMapper.update(null, new LambdaUpdateWrapper<RdmRequirement>()
                    .eq(RdmRequirement::getId, id)
                    .set(RdmRequirement::getIntentPmUserId, null)
                    .set(RdmRequirement::getIntentPmName, null));
        }
        // 清空技术负责人同样必须显式置空：否则界面已改回「系统指派」，库里还挂着旧负责人
        if (dispatcher == null && previousDispatcherUserId != null) {
            requirementMapper.update(null, new LambdaUpdateWrapper<RdmRequirement>()
                    .eq(RdmRequirement::getId, id)
                    .set(RdmRequirement::getDispatcherUserId, null)
                    .set(RdmRequirement::getDispatcherName, null));
        }

        // 任务19 / 缺口1：结构父变更走 structureService 完整校验（父需 aggregate、两端鉴权、同项目、均 V3、无环），
        // 而不是直写 structureParentReqId 绕过校验。仅当显式传入且与现值不同时处理；换父时先解绑再绑。
        // 走 do* 内部方法：update 已处于活动事务，不能把 executeOnce 幂等入口嵌进来（决策2）。
        if (flowV3 && dto.getStructureParentReqId() != null
                && !dto.getStructureParentReqId().equals(previousStructureParentReqId)) {
            if (previousStructureParentReqId != null) {
                structureService.removeChildRequirement(previousStructureParentReqId, id, current.getId());
            }
            structureService.doAddChildRequirement(dto.getStructureParentReqId(), id, current.getId());
        }

        targetMapper.delete(new LambdaQueryWrapper<RdmRequirementTarget>().eq(RdmRequirementTarget::getReqId, id));
        saveTargets(id, dto.getTargets());
        // 附件与定位对象同一口径：整份替换。fileUrl 就是 storagePath 原值，data URL 可原样回传
        attachmentMapper.delete(new LambdaQueryWrapper<RdmAttachment>().eq(RdmAttachment::getReqId, id));
        saveAttachments(id, dto.getAttachments(), current);

        /*
         * 换人要收旧角色的权：草稿阶段虽然还没开始流转，但参与角色行一旦留下，
         * 旧验收人就会在「参与角色」里挂名，后续按角色判定的地方也会误认他还在场。
         */
        if (previousAcceptorUserId != null && !previousAcceptorUserId.equals(acceptor.getId())) {
            deactivateRole(id, previousAcceptorUserId, RdmConstants.ROLE_ACCEPTOR);
        }
        if (previousPmUserId != null && !previousPmUserId.equals(pm == null ? null : pm.getId())) {
            deactivateRole(id, previousPmUserId, RdmConstants.ROLE_PM);
        }
        saveInitialRoles(req, current, pm, acceptor, dto.getCcUserIds());
        return RdmRequirementVO.from(requirementMapper.selectById(id), configService.stageMap());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO withdraw(Long id) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        requireOwner(req, current, "撤回");
        if (!RdmConstants.STATUS_INTAKE_PENDING.equals(req.getStatus())) {
            throw new BusinessException("僅「待審批」的需求可撤回");
        }
        String flowNo = req.getIntakeFlowNo();
        transitionInternal(req, RdmConstants.ACTION_WITHDRAW, null, current,
                accessGuard.activeRoles(req.getId(), current));
        /*
         * 撤回必须同时收口 OA 侧：只改 RDM 状态会留下「需求已回草稿、审批单还挂在待办」的双轨不一致。
         * 不吞异常：撤销失败就整个撤回失败（事务回滚），不能让用户看到「已撤回」而审批人手上还有单。
         */
        if (StringUtils.hasText(flowNo)) {
            try {
                oaRequestService.cancel(flowNo);
            } catch (RuntimeException e) {
                throw new BusinessException("准入單撤銷失敗，需求未撤回：" + e.getMessage());
            }
            intakeRoundService.withdrawRound(req.getId(), flowNo, req.getUpdatedBy());
            req.setIntakeFlowNo(null);
            requirementMapper.updateById(req);
        }
        return RdmRequirementVO.from(req, configService.stageMap());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO selfSubmit(Long id, RdmTransitionDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        // 只能动自己的单：菜单 create 是全部门都有的宽权限，不叠资源归属就等于能替别人提交
        requireOwner(req, current, "提交");
        requireVisible(req, current, "提交");
        String actionCode = resolveSelfSubmitAction(req.getStatus());
        // 落状态前先把原状态记住：免审批分支要把「从哪一态直送」写进时间轴，不能被后续变更污染
        String fromStatus = req.getStatus();
        /*
         * 提交/重提都先重新裁决再落状态：人员调岗、策略改版后不能沿用上一轮的结论。
         * <p>需审批：走配置状态机进「待审批」，并发起本轮准入单（否则“界面待审批、OA 没有待办”）。
         * <p>免审批：走与直接创建同一落点口径（{@link #landExemptSubmission}）并首次发号。
         */
        RdmIntakeVO.Decision decision = intakePolicyService.decide(current, req.getReqType(), reqSystemCode(req));
        req.setNeedApproval(decision.isNeedApproval() ? 1 : 0);
        applyIntakeDecision(req, decision);
        if (decision.isNeedApproval()) {
            transitionInternal(req, actionCode, dto, current, accessGuard.activeRoles(id, current));
            req.setSubmitTime(LocalDateTime.now());
            req.setCurrentHandlerName(computeHandler(req, null));
            requirementMapper.updateById(req);
        } else {
            landExemptSubmission(req, current, fromStatus);
        }
        openIntakeRound(req, decision, current);
        // 任务19 / 缺口1：草稿提交后，若这条 V3 执行需求已准入（无需审批直接进池/受理）则补建默认交付项；
        // 仍处草稿/待准入或为聚合需求时不建（helper 内部按 kind + status 判定）。
        maybeCreateV3DefaultItem(req, current.getId());
        return RdmRequirementVO.from(req, configService.stageMap());
    }

    /** 提出人可自助提交的状态：草稿走 submit，准入驳回走 resubmit，其余一律拒 */
    private String resolveSelfSubmitAction(String status) {
        if (RdmConstants.STATUS_DRAFT.equals(status)) {
            return RdmConstants.ACTION_SUBMIT;
        }
        if (RdmConstants.STATUS_INTAKE_REJECTED.equals(status)) {
            return RdmConstants.ACTION_RESUBMIT;
        }
        throw new BusinessException("只有草稿或准入駁回的需求可由提出人提交，當前狀態：" + labelOf(status));
    }

    /** 把裁决结果写成需求上的快照列（免审也要写，否则事后无法解释「这单为什么没走审批」） */
    private void applyIntakeDecision(RdmRequirement req, RdmIntakeVO.Decision decision) {
        if (decision == null) {
            return;
        }
        req.setIntakePolicyId(decision.getPolicyId());
        req.setIntakePolicyName(decision.getPolicyName());
        req.setIntakePolicyVersion(decision.getPolicyVersion());
        req.setIntakeMode(decision.getMode());
        req.setIntakeExplain(decision.getExplain() == null || decision.getExplain().isEmpty()
                ? null : String.join("\n", decision.getExplain()));
    }

    /**
     * 开启一轮准入：先清旧单号，再按裁决发起本轮准入单，最后登记轮次。
     * <p>旧单号必须清：驳回后重提若沿用已终态的旧单，本轮在 OA 里没有待办，需求会永久停在待审批。
     */
    private void openIntakeRound(RdmRequirement req, RdmIntakeVO.Decision decision, SysUser operator) {
        req.setIntakeFlowNo(null);
        req.setIntakeRoundNo(null);
        requirementMapper.updateById(req);
        if (decision != null && decision.isNeedApproval()) {
            submitIntakeFlow(req, operator);
        }
        int roundNo = intakeRoundService.startRound(req.getId(), decision, req.getSubmitDeptId(), req.getSubmitDeptName(),
                req.getSubmitterUserId(), req.getSubmitterName(), req.getIntakeFlowNo(), contentSnapshot(req),
                req.getUpdatedBy());
        req.setIntakeRoundNo(roundNo);
        requirementMapper.updateById(req);
    }

    /** 本轮内容快照：只存能证明「审批的是哪一版」的最小集合，不复制正文 */
    private String contentSnapshot(RdmRequirement req) {
        return req.getTitle() + " | 類型 " + req.getReqType() + " | 優先級 " + req.getPriority();
    }

    /** 需求主定位系统（准入策略的系统维度用） */
    private String reqSystemCode(RdmRequirement req) {
        return targetMapper.selectList(new LambdaQueryWrapper<RdmRequirementTarget>()
                        .eq(RdmRequirementTarget::getReqId, req.getId())
                        .orderByAsc(RdmRequirementTarget::getSortOrder).last("LIMIT 1"))
                .stream().findFirst().map(RdmRequirementTarget::getSystemCode).orElse(null);
    }

    private static String firstSystemCode(RdmRequirementCreateDTO dto) {
        if (dto.getTargets() == null) {
            return null;
        }
        return dto.getTargets().stream().map(RdmRequirementCreateDTO.Target::getSystemCode)
                .filter(StringUtils::hasText).findFirst().orElse(null);
    }

    /**
     * 产品经理资格：在职启用 + 具备需求侧处理权（rdm-requirement:edit）。
     * <p>免审批直送落点时只能做软判定（拿不到合格产品就回需求池），硬拒会误伤“提交时还能接、
     * 存完草稿隔一周调岗后已不能接”的正常场景；资格检查本身仍是同一口径，避免两处飘移。
     */
    private boolean isPmEligible(SysUser pm) {
        if (pm == null || (pm.getStatus() != null && pm.getStatus() == 0)) {
            return false;
        }
        return permissionService.hasPermission(pm, RdmConstants.MENU_REQUIREMENT, "edit");
    }

    /**
     * 产品经理资格校验：在职启用 + 具备需求侧处理权（rdm-requirement:edit）。
     * <p>不能只校「用户存在」：把需求分给无受理权的人，他会收到待办却点不动任何动作。
     */
    private void requirePmEligible(SysUser pm) {
        if (isPmEligible(pm)) {
            return;
        }
        if (pm != null && pm.getStatus() != null && pm.getStatus() == 0) {
            throw new BusinessException("指定的產品經理已離職或停用，請改選其他人或提交技術部分配");
        }
        throw new BusinessException("指定的員工「" + (pm == null ? "" : pm.getName())
                + "」當前無產品經理受理權限，請先在授權中心配置或改提交技術部分配");
    }

    /**
     * 解析并提出人指定的技术负责人（仅 POOL 模式生效）。
     * <p>必须校验分配权：选了没有分配权的人，需求会永久卡在需求池 —— 提出人以为已经找到人，
     * 实际没人能推进。宁可提交时拒绝并让他改选，也不能静默存下一个无效负责人。
     */
    private SysUser resolveDispatcher(Long dispatcherUserId, SysUser pm) {
        if (pm != null || dispatcherUserId == null) {
            return null;
        }
        SysUser dispatcher = userMapper.selectById(dispatcherUserId);
        if (dispatcher == null) {
            throw new BusinessException("所選技術負責人不存在或已停用，請重新選擇");
        }
        if (dispatcher.getStatus() != null && dispatcher.getStatus() == 0) {
            throw new BusinessException("所選技術負責人已離職或停用，請重新選擇");
        }
        if (!accessGuard.canDispatch(dispatcher)) {
            throw new BusinessException("所選技術負責人不具備需求分配權限，請改選他人或留空由系統指派");
        }
        return dispatcher;
    }

    /**
     * 解析并校验业务验收人：不传即提交人本人。
     * <p>以前是「查不到人就静默回落到提交人」——用户明明指派了别人，单据上却变成自己签字，
     * 属于把前端传的 userId 当可信数据。现在查不到/已停用一律直接拒绝，
     * 让提出人在提交时就改选人，而不是等到验收当天才发现签错人。
     * <p>验收人不要求任何菜单权限：它是业务角色（提出人的同事），
     * 授权中心不会给普通业务同事发 rdm-acceptance 权限。
     */
    private SysUser resolveAcceptor(Long acceptorUserId, SysUser current) {
        if (acceptorUserId == null || acceptorUserId.equals(current == null ? null : current.getId())) {
            return current;
        }
        SysUser acceptor = userMapper.selectById(acceptorUserId);
        if (acceptor == null) {
            throw new BusinessException("指定的業務驗收人不存在，請重新選擇");
        }
        if (acceptor.getStatus() != null && acceptor.getStatus() == 0) {
            throw new BusinessException("指定的業務驗收人已離職或停用，請改選其他人");
        }
        return acceptor;
    }

    /* ==================== 流转 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO transition(Long id, RdmTransitionDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        requireVisible(req, current, "推進");
        if (!StringUtils.hasText(dto.getActionCode())) {
            throw new BusinessException("請指定流轉動作");
        }
        // 准入审批只有一个事实源：这两个动作不直接改状态，而是以当前登录人身份代理执行 OA 待审节点，
        // 审批结果由 RdmIntakeCallbackService 回调落状态。否则会出现
        // 「RDM 已放行、OA 單永远挂在 pending」的双轨不一致（实测需求归档了准入单还在待审批）。
        if (RdmConstants.ACTION_APPROVE_INTAKE.equals(dto.getActionCode())
                || RdmConstants.ACTION_REJECT_INTAKE.equals(dto.getActionCode())) {
            return actIntakeApproval(req, dto,
                    RdmConstants.ACTION_APPROVE_INTAKE.equals(dto.getActionCode()));
        }
        // V3 分批交付需求（任务19 / 缺口1）：放行准入/分配/受理等前段动作，但交付/测试/验收/发布类动作
        // 必须走交付项接口，不得经此绕过发布批次门禁（准入审批已在此之前分流）。V1/V2 语义完全不变。
        flowVersionGuard.requireV3TransitionAllowed(id, dto.getActionCode());
        transitionInternal(req, dto.getActionCode(), dto, current, accessGuard.activeRoles(id, current));
        return RdmRequirementVO.from(requirementMapper.selectById(id), configService.stageMap());
    }

    /**
     * 靜默聯動推進：獨立保存點（NESTED），失敗只回 false。
     * <p>不能沿用「在調用方 try/catch {@link #transition}」的寫法：內層事務拋錯後會把外層事務
     * 標記為 rollback-only，即便這裡接住了異常，外層提交時依舊報
     * {@code UnexpectedRollbackException}（前端看到的就是「系統繁忙」）。
     * <p>做法：業務校驗拋出的異常不在此處接住，讓它穿出 NESTED 邊界——Spring 只回滾到保存點，
     * 不會標記外層事務；再由調用方接住並記日誌。
     */
    @Override
    @Transactional(propagation = Propagation.NESTED, rollbackFor = Exception.class)
    public boolean tryAdvanceQuietly(Long reqId, String actionCode, RdmTransitionDTO payload) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null || !StringUtils.hasText(actionCode)) {
            return false;
        }
        // V3 分批交付：需求層只到受理，PRD/評審不再推動需求狀態（由交付項推進）
        if (!flowVersionGuard.isTransitionActionAllowed(req.getFlowVersion(), actionCode)) {
            log.info("聯動流轉跳過（V3 鏈路不允許該動作）: reqNo={}, action={}", req.getReqNo(), actionCode);
            return false;
        }
        if (configService.findTransition(req.getStatus(), actionCode) == null) {
            return false;
        }
        RdmTransitionDTO dto = payload == null ? new RdmTransitionDTO() : payload;
        dto.setActionCode(actionCode);
        // 同一事務內自調用（不經過代理）：業務校驗失敗的異常穿出 NESTED 邊界，由調用方接住
        transition(req.getId(), dto);
        return true;
    }

    /**
     * 依照已存在的 PRD / 評審事實向前對齊狀態（只對 V1/V2 整需求鏈路）。
     * <p>對齊規則（每一步仍受 {@code rdm_transition} 配置約束）：
     * <ol>
     *   <li>已受理 + 已有 PRD → prd_start（PRD 設計中）；</li>
     *   <li>PRD 設計中 + 存在待評審的評審 / 最新評審已通過 → review_start（評審中）；</li>
     *   <li>評審中 + 無待評審 → 最新通過則 review_pass；最新退回則 review_reject（回到 PRD 設計中）。</li>
     * </ol>
     * <p>不做的事：不自行受理（受理必須由產品給出承諾日期）、不對齊到排期之後的狀態、
     * 不對最新一版已被退回的需求反覆重推（避免死循環）。
     */
    @Override
    @Transactional(propagation = Propagation.NESTED, rollbackFor = Exception.class)
    public void alignPrdPhaseStatus(Long reqId) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null || req.getFlowVersion() != null && req.getFlowVersion() == RdmConstants.FLOW_VERSION_3) {
            return;
        }
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            return;
        }
        // 最多走 3 步（受理→PRD 設計→評審中→評審通過）；上限只是防意外遞歸，不是業務規則
        for (int step = 0; step < 3; step++) {
            String action = nextAlignAction(req.getId(), req.getStatus());
            if (action == null) {
                return;
            }
            RdmTransitionDTO dto = new RdmTransitionDTO();
            dto.setActionCode(action);
            dto.setRemark(alignRemark(action));
            try {
                transitionInternal(req, action, dto, current, accessGuard.activeRoles(req.getId(), current), true);
            } catch (BusinessException e) {
                log.info("PRD 階段狀態對齊未完成: reqNo={}, action={}, reason={}", req.getReqNo(), action, e.getMessage());
                return;
            }
            req = requirementMapper.selectById(reqId);
            if (req == null) {
                return;
            }
        }
    }

    /** 對齊時要執行的下一個動作；返回 null 表示現有狀態已與事實一致 */
    private String nextAlignAction(Long reqId, String status) {
        switch (status == null ? "" : status) {
            case RdmConstants.STATUS_ACCEPTED:
                return countRows("SELECT COUNT(*) FROM rdm_prd WHERE req_id = ? AND deleted = 0", reqId) > 0
                        ? RdmConstants.ACTION_PRD_START : null;
            case RdmConstants.STATUS_PRD_DESIGNING: {
                if (countRows("SELECT COUNT(*) FROM rdm_review WHERE req_id = ? AND deleted = 0 AND conclusion = 'pending'", reqId) > 0) {
                    return RdmConstants.ACTION_REVIEW_START;
                }
                // 已評審且最新一版通過：把狀態補到評審中，下一步再補評審通過
                return "passed".equals(latestReviewConclusion(reqId)) ? RdmConstants.ACTION_REVIEW_START : null;
            }
            case RdmConstants.STATUS_REVIEWING: {
                if (countRows("SELECT COUNT(*) FROM rdm_review WHERE req_id = ? AND deleted = 0 AND conclusion = 'pending'", reqId) > 0) {
                    return null;
                }
                String latest = latestReviewConclusion(reqId);
                if (latest == null) {
                    return null;
                }
                return "passed".equals(latest) ? RdmConstants.ACTION_REVIEW_PASS : RdmConstants.ACTION_REVIEW_REJECT;
            }
            default:
                return null;
        }
    }

    /** 最新一條評審結論（按 id 倒序）；沒有評審時返回 null */
    private String latestReviewConclusion(Long reqId) {
        List<String> rows = jdbcTemplate.queryForList(
                "SELECT conclusion FROM rdm_review WHERE req_id = ? AND deleted = 0 ORDER BY id DESC LIMIT 1",
                String.class, reqId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private long countRows(String sql, Long reqId) {
        Long count = jdbcTemplate.queryForObject(sql, Long.class, reqId);
        return count == null ? 0L : count;
    }

    /** 對齊留痕：寫進狀態流水的說明，讓人看得出這一步不是人點的 */
    private String alignRemark(String action) {
        return RdmConstants.ACTION_REVIEW_REJECT.equals(action)
                ? "自動對齊：最新評審結論為退回，狀態回到 PRD 產出中"
                : "自動對齊：依已存在的 PRD / 評審記錄推進狀態";
    }

    /**
     * V3 交付進度投影：由交付項事實推導九段階段條的當前段（<b>只讀</b>，不改需求狀態）。
     *
     * <p>為什麼不直接用需求狀態：V3 受理後，設計/開發/測試/驗收全部以交付項為推進單位，
     * 需求狀態按設計停在 accepted；若界面直接畫 status，會永遠停在「PRD 設計」而誤導用户。
     *
     * <p>聚合口徑（短板）：多個交付項並行時取「最落後的未完成項」所在階段——
     * 能不能上線由最慢那條決定，取最前沿會掩蓋風險。
     * <ol>
     *   <li>無交付項、或最落後項停在 preparing：按 PRD / 評審事實 → design 或 review；</li>
     *   <li>全部 done → release（上線歸檔）；</li>
     *   <li>其餘：developing → dev，testing → test，
     *       pending_acceptance → uat，pending_release / released_pending → release。</li>
     * </ol>
     */
    private void fillDeliveryStage(RdmRequirementVO vo, Long reqId) {
        /*
         * 只对「已受理及以后」的 V3 需求做投影：评估中/已分配阶段的交付项还是空的，
         * 若也推到 design，阶段条会从「分配受理」直接跳到「PRD 設計」，
         * 反而把「还没接受需求」掩盖掉。
         */
        if (!PRD_PHASE_STATUSES.contains(vo.getStatus())) {
            return;
        }
        // rdm_delivery_item 无 deleted 列（Batch 1 建表即无），不能写 deleted = 0
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT status, COUNT(*) AS cnt FROM rdm_delivery_item WHERE req_id = ? GROUP BY status", reqId);
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String status = row.get("status") == null
                    ? RdmConstants.DI_PREPARING : String.valueOf(row.get("status"));
            counts.merge(status, ((Number) row.get("cnt")).intValue(), Integer::sum);
        }
        long reviews = countRows("SELECT COUNT(*) FROM rdm_review WHERE req_id = ? AND deleted = 0", reqId);
        applyDeliveryStage(vo, counts, reviews);
    }

    /**
     * 列表批量投影：当前页所有 V3 需求共用两条 GROUP BY 查询，避免逐行 N+1。
     * <p>口径与详情完全同源（同一 {@link #applyDeliveryStage}），列表/看板不会与详情分叉。
     */
    private void fillDeliveryStageBatch(List<RdmRequirementVO> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        List<RdmRequirementVO> targets = new ArrayList<>();
        for (RdmRequirementVO vo : rows) {
            if (vo.getId() != null && vo.getFlowVersion() != null
                    && vo.getFlowVersion() == RdmConstants.FLOW_VERSION_3
                    && PRD_PHASE_STATUSES.contains(vo.getStatus())) {
                targets.add(vo);
            }
        }
        if (targets.isEmpty()) {
            return;
        }
        List<Long> ids = targets.stream().map(RdmRequirementVO::getId).toList();
        // 只拼接占位符个数，值全部走参数绑定（不拼用户数据）
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        Object[] args = ids.toArray();
        List<Map<String, Object>> itemRows = jdbcTemplate.queryForList(
                "SELECT req_id, status, COUNT(*) AS cnt FROM rdm_delivery_item WHERE req_id IN ("
                        + placeholders + ") GROUP BY req_id, status", args);
        List<Map<String, Object>> reviewRows = jdbcTemplate.queryForList(
                "SELECT req_id, COUNT(*) AS cnt FROM rdm_review WHERE req_id IN ("
                        + placeholders + ") AND deleted = 0 GROUP BY req_id", args);
        Map<Long, Map<String, Integer>> countsByReq = new LinkedHashMap<>();
        for (Map<String, Object> row : itemRows) {
            Long reqId = ((Number) row.get("req_id")).longValue();
            String status = row.get("status") == null
                    ? RdmConstants.DI_PREPARING : String.valueOf(row.get("status"));
            countsByReq.computeIfAbsent(reqId, k -> new LinkedHashMap<>())
                    .merge(status, ((Number) row.get("cnt")).intValue(), Integer::sum);
        }
        Map<Long, Long> reviewsByReq = new LinkedHashMap<>();
        for (Map<String, Object> row : reviewRows) {
            reviewsByReq.put(((Number) row.get("req_id")).longValue(), ((Number) row.get("cnt")).longValue());
        }
        for (RdmRequirementVO vo : targets) {
            applyDeliveryStage(vo, countsByReq.getOrDefault(vo.getId(), Map.of()),
                    reviewsByReq.getOrDefault(vo.getId(), 0L));
        }
    }

    /** 单条/批量的共用投影：由交付项计数 + 评审计数推出阶段与 N/M */
    private void applyDeliveryStage(RdmRequirementVO vo, Map<String, Integer> counts, long reviewCount) {
        int total = 0;
        int done = 0;
        int minOrder = Integer.MAX_VALUE;
        String minStatus = null;
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            String status = entry.getKey();
            int cnt = entry.getValue() == null ? 0 : entry.getValue();
            total += cnt;
            if (RdmConstants.DI_DONE.equals(status)) {
                done += cnt;
                continue;
            }
            int order = deliveryStatusOrder(status);
            if (order < minOrder) {
                minOrder = order;
                minStatus = status;
            }
        }
        vo.setDeliveryItemCount(total);
        vo.setDeliveryDoneCount(done);
        vo.setDeliveryItemStatusCounts(counts);
        if (total == 0 || RdmConstants.DI_PREPARING.equals(minStatus)) {
            // 最落后的交付项还停在「待準備」时，交付项回答不了「PRD 写完没、评审了没」，改按 PRD / 评审事实定段
            vo.setDeliveryStage(reviewCount > 0 ? STAGE_REVIEW : STAGE_DESIGN);
            return;
        }
        if (done == total) {
            vo.setDeliveryStage(STAGE_RELEASE);
            return;
        }
        vo.setDeliveryStage(switch (minStatus == null ? "" : minStatus) {
            case RdmConstants.DI_TESTING -> STAGE_TEST;
            case RdmConstants.DI_PENDING_ACCEPTANCE -> STAGE_UAT;
            case RdmConstants.DI_PENDING_RELEASE, RdmConstants.DI_RELEASED_PENDING -> STAGE_RELEASE;
            default -> STAGE_DEV;
        });
    }

    /** 交付項狀態先後序（取短板用）：數值越小越落後 */
    private static int deliveryStatusOrder(String status) {
        return switch (status) {
            case RdmConstants.DI_PREPARING -> 1;
            case RdmConstants.DI_DEVELOPING -> 2;
            case RdmConstants.DI_TESTING -> 3;
            case RdmConstants.DI_PENDING_ACCEPTANCE -> 4;
            case RdmConstants.DI_PENDING_RELEASE -> 5;
            case RdmConstants.DI_RELEASED_PENDING -> 6;
            default -> 0;
        };
    }

    /**
     * 调整迭代（归属体系改造）：属性变更而非状态流转，故不走 rdm_transition 状态机。
     * <p>场景：研发 bug / 需求不足要放另外版本，直接把需求换到其它迭代（对齐 Jira Move to sprint）。
     * <p>关键联动：同步该需求下未完成任务的 iteration_code——需求迭代与任务迭代必须同源，
     * 否则按迭代统计需求与任务会分裂（本次改造要修的根因之一）。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO changeIteration(Long id, RdmTransitionDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        requireVisible(req, current, "調整迭代");
        // 状态白名单：复用「已进入产研受理链路」常量（pool→uat_rejected）；已上线/验收/关闭需先 reopen
        if (!Arrays.asList(RdmConstants.IN_PROGRESS_STATUS).contains(req.getStatus())) {
            throw new BusinessException("當前狀態「" + labelOf(req.getStatus()) + "」不允許調整迭代，已上線需求請先重新打開");
        }
        // 角色白名单：产品/研发负责人/PMO 参与者，或分配权/全量权限者（技术负责人、管理员）
        Set<String> roles = accessGuard.activeRoles(id, current);
        boolean allowed = accessGuard.canSeeAll(current) || accessGuard.canDispatch(current)
                || roles.contains(RdmConstants.ROLE_PM)
                || roles.contains(RdmConstants.ROLE_DEV_LEAD)
                || roles.contains(RdmConstants.ROLE_PMO);
        if (!allowed) {
            throw new BusinessException("您沒有權限調整本需求的迭代");
        }
        if (dto == null || !StringUtils.hasText(dto.getIterationCode())) {
            throw new BusinessException("請選擇目標迭代");
        }
        String oldIteration = req.getIterationCode();
        String newIteration = dto.getIterationCode().trim();
        if (newIteration.equals(oldIteration) && dto.getProjectId() == null) {
            throw new BusinessException("目標迭代與當前一致，無需調整");
        }
        // 复用排期闸门的同一套校验：迭代存在且未关闭、迭代项目与所选项目一致、项目存在（单一真值源）
        applyProjectAndIteration(req, dto, false);
        req.setUpdatedBy(operatorResolver.operatorSignature(current));
        requirementMapper.updateById(req);

        // 同步未完成任务的迭代归属（done/cancelled 是历史事实，不改）
        int syncedTasks = jdbcTemplate.update(
                "UPDATE rdm_work_task SET iteration_code = ?, updated_by = ? "
                        + "WHERE req_id = ? AND deleted = 0 AND status NOT IN ('done', 'cancelled')",
                newIteration, operatorResolver.operatorSignature(current), id);

        appendStatusLog(req, req.getStatus(), current, "change_iteration",
                "調整迭代：" + (StringUtils.hasText(oldIteration) ? oldIteration : "未掛") + " → " + newIteration
                        + (StringUtils.hasText(dto.getRemark()) ? "；" + dto.getRemark() : ""));
        log.info("需求調整迭代: reqNo={}, {} -> {}, 同步未完成任務 {} 條, operator={}",
                req.getReqNo(), oldIteration, newIteration, syncedTasks, req.getUpdatedBy());

        // 通知产品与研发负责人：迭代变了会影响他们的排期与产能对账
        List<Long> notifyIds = new ArrayList<>();
        if (req.getAssigneePmUserId() != null) {
            notifyIds.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null && !notifyIds.contains(req.getDevOwnerUserId())) {
            notifyIds.add(req.getDevOwnerUserId());
        }
        notifyIds.remove(current.getId());
        if (!notifyIds.isEmpty()) {
            notifyService.notifyUserIds(RdmConstants.EVENT_STATUS_CHANGED, req, notifyIds,
                    "需求迭代已調整",
                    "### 🔁 需求迭代調整\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                            + "\n- **迭代**: " + (StringUtils.hasText(oldIteration) ? oldIteration : "未掛") + " → " + newIteration
                            + "\n- **操作人**: " + current.getName()
                            + (syncedTasks > 0 ? "\n- **同步未完成任務**: " + syncedTasks + " 條" : ""));
        }
        return RdmRequirementVO.from(requirementMapper.selectById(id), configService.stageMap());
    }

    /** 屬性面板不可改的終態：已上線/已驗收/已關閉需先 reopen，避免上線後改歸屬造成統計口徑漂移 */
    private static final List<String> ATTR_LOCKED_STATUS = Arrays.asList(
            RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED, RdmConstants.STATUS_CLOSED);

    private static final Set<String> PRIORITY_CODES = Set.of("P0", "P1", "P2", "P3");
    private static final Set<String> COMPLEXITY_CODES = Set.of("SIMPLE", "MEDIUM", "COMPLEX", "HUGE");

    /**
     * 詳情頁屬性欄逐字段修改。
     * <p>權限分層：提出人只給分配權/全量權（權屬變更）；產品/研發/驗收/項目經理/優先級/日期
     * 給分配權或本單 PM/研發負責人/PMO；業務期望額外放開提出人本人（他只改自己的期望時間）。
     * <p>所有變更合併成一條狀態流水，時間軸能看到「誰在什麼時候把什麼從 A 改成 B」。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO changeAttributes(Long id, RdmRequirementAttrDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        requireVisible(req, current, "修改屬性");
        if (dto == null) {
            throw new BusinessException("沒有需要修改的屬性");
        }
        if (ATTR_LOCKED_STATUS.contains(req.getStatus())) {
            throw new BusinessException("當前狀態「" + labelOf(req.getStatus()) + "」不允許修改屬性，請先重新打開需求");
        }
        if (Arrays.asList(RdmConstants.EDITABLE_STATUS).contains(req.getStatus())
                || RdmConstants.STATUS_INTAKE_PENDING.equals(req.getStatus())) {
            throw new BusinessException("草稿/待審批/準入駁回的需求請在「編輯需求」中修改");
        }

        boolean manager = operatorResolver.isAdmin(current) || accessGuard.canSeeAll(current)
                || accessGuard.canDispatch(current);
        Set<String> roles = accessGuard.activeRoles(id, current);
        boolean deliverySide = roles.contains(RdmConstants.ROLE_PM) || roles.contains(RdmConstants.ROLE_DEV_LEAD)
                || roles.contains(RdmConstants.ROLE_PMO);
        boolean canEditDeliveryAttrs = manager || deliverySide;
        boolean submitterSelf = current.getId().equals(req.getSubmitterUserId());

        List<String> changes = new ArrayList<>();
        Set<Long> notifyIds = new LinkedHashSet<>();
        boolean clearExpectDate = false;
        boolean clearPromisedDate = false;
        boolean clearPlanReleaseDate = false;

        /* ── 提出人：權屬變更，只給分配權/全量權 ── */
        if (dto.getSubmitterUserId() != null && !dto.getSubmitterUserId().equals(req.getSubmitterUserId())) {
            if (!manager) {
                throw new BusinessException("只有需求分配人/管理員可以變更提出人");
            }
            SysUser next = requireActiveEmployee(dto.getSubmitterUserId(), "提出人");
            Long previous = req.getSubmitterUserId();
            changes.add("提出人：" + personLabel(req.getSubmitterName(), req.getSubmitterEmpNo())
                    + " → " + personLabel(next.getName(), next.getEmpId()));
            if (previous != null) {
                deactivateRole(id, previous, RdmConstants.ROLE_SUBMITTER);
                notifyIds.add(previous);
            }
            upsertActiveRole(id, next, RdmConstants.ROLE_SUBMITTER);
            notifyIds.add(next.getId());
            req.setSubmitterUserId(next.getId());
            req.setSubmitterEmpNo(next.getEmpId());
            req.setSubmitterName(next.getName());
            req.setSubmitDeptId(next.getDepartmentId());
            req.setSubmitDeptName(next.getDepartment());
        }

        /* ── 研發負責人 ── */
        if (dto.getDevOwnerUserId() != null && !dto.getDevOwnerUserId().equals(req.getDevOwnerUserId())) {
            if (!canEditDeliveryAttrs) {
                throw new BusinessException("您沒有權限變更研發負責人");
            }
            SysUser next = requireActiveEmployee(dto.getDevOwnerUserId(), "研發負責人");
            Long previous = req.getDevOwnerUserId();
            changes.add("研發負責人：" + (StringUtils.hasText(req.getDevOwnerName()) ? req.getDevOwnerName() : "未指定")
                    + " → " + next.getName());
            if (previous != null) {
                deactivateRole(id, previous, RdmConstants.ROLE_DEV_LEAD);
                notifyIds.add(previous);
            }
            upsertActiveRole(id, next, RdmConstants.ROLE_DEV_LEAD);
            notifyIds.add(next.getId());
            req.setDevOwnerUserId(next.getId());
            req.setDevOwnerName(next.getName());
        }

        /* ── 業務驗收人 ── */
        if (dto.getAcceptorUserId() != null && !dto.getAcceptorUserId().equals(req.getAcceptorUserId())) {
            if (!canEditDeliveryAttrs) {
                throw new BusinessException("您沒有權限變更業務驗收人");
            }
            SysUser next = requireActiveEmployee(dto.getAcceptorUserId(), "業務驗收人");
            Long previous = req.getAcceptorUserId();
            changes.add("業務驗收人：" + (StringUtils.hasText(req.getAcceptorName()) ? req.getAcceptorName() : "未指定")
                    + " → " + next.getName());
            if (previous != null) {
                deactivateRole(id, previous, RdmConstants.ROLE_ACCEPTOR);
                notifyIds.add(previous);
            }
            upsertActiveRole(id, next, RdmConstants.ROLE_ACCEPTOR);
            notifyIds.add(next.getId());
            req.setAcceptorUserId(next.getId());
            req.setAcceptorName(next.getName());
        }

        /* ── 需求級項目經理 ── */
        if (dto.getProjectManagerUserId() != null
                && !dto.getProjectManagerUserId().equals(req.getProjectManagerUserId())) {
            if (!canEditDeliveryAttrs) {
                throw new BusinessException("您沒有權限變更項目經理");
            }
            SysUser next = requireActiveEmployee(dto.getProjectManagerUserId(), "項目經理");
            changes.add("項目經理："
                    + (StringUtils.hasText(req.getProjectManagerUserName()) ? req.getProjectManagerUserName() : "未指定")
                    + " → " + next.getName());
            req.setProjectManagerUserId(next.getId());
            req.setProjectManagerUserName(next.getName());
            notifyIds.add(next.getId());
        }

        /* ── 優先級 ── */
        if (StringUtils.hasText(dto.getPriority())) {
            String priority = dto.getPriority().trim().toUpperCase();
            if (!PRIORITY_CODES.contains(priority)) {
                throw new BusinessException("優先級只能是 P0/P1/P2/P3");
            }
            if (!priority.equals(req.getPriority())) {
                if (!canEditDeliveryAttrs) {
                    throw new BusinessException("您沒有權限調整優先級");
                }
                changes.add("優先級：" + req.getPriority() + " → " + priority);
                req.setPriority(priority);
            }
        }

        /* ── 預期規模：產品評估職責，只給 PM/管理側 ── */
        if (StringUtils.hasText(dto.getComplexity())) {
            String complexity = dto.getComplexity().trim().toUpperCase();
            if (!COMPLEXITY_CODES.contains(complexity)) {
                throw new BusinessException("預期規模只能是 SIMPLE/MEDIUM/COMPLEX/HUGE");
            }
            if (!complexity.equals(req.getComplexity())) {
                if (!(manager || roles.contains(RdmConstants.ROLE_PM))) {
                    throw new BusinessException("只有產品經理/管理員可以評估預期規模");
                }
                changes.add("預期規模：" + (req.getComplexity() == null ? "待評估" : req.getComplexity())
                        + " → " + complexity);
                req.setComplexity(complexity);
            }
        }

        /* ── 業務期望日期：提出人本人可改自己的期望 ── */
        if (dto.getExpectDate() != null) {
            LocalDate next = parseDate(dto.getExpectDate());
            if (!Objects.equals(next, req.getExpectDate())) {
                if (!(canEditDeliveryAttrs || submitterSelf)) {
                    throw new BusinessException("您沒有權限調整業務期望日期");
                }
                changes.add("業務期望：" + (req.getExpectDate() == null ? "未填寫" : req.getExpectDate())
                        + " → " + (next == null ? "清空" : next));
                req.setExpectDate(next);
                clearExpectDate = next == null;
            }
        }

        /* ── 承諾出 PRD 日期 ── */
        if (dto.getPromisedPrdDate() != null) {
            LocalDate next = parseDate(dto.getPromisedPrdDate());
            if (!Objects.equals(next, req.getPromisedPrdDate())) {
                if (!canEditDeliveryAttrs) {
                    throw new BusinessException("您沒有權限調整承諾出 PRD 日期");
                }
                changes.add("承諾出 PRD：" + (req.getPromisedPrdDate() == null ? "未承諾" : req.getPromisedPrdDate())
                        + " → " + (next == null ? "清空" : next));
                req.setPromisedPrdDate(next);
                clearPromisedDate = next == null;
            }
        }

        /* ── 計劃上線日期 ── */
        if (dto.getPlanReleaseDate() != null) {
            LocalDate next = parseDate(dto.getPlanReleaseDate());
            if (!Objects.equals(next, req.getPlanReleaseDate())) {
                if (!canEditDeliveryAttrs) {
                    throw new BusinessException("您沒有權限調整計劃上線日期");
                }
                changes.add("計劃上線：" + (req.getPlanReleaseDate() == null ? "待排期" : req.getPlanReleaseDate())
                        + " → " + (next == null ? "清空" : next));
                req.setPlanReleaseDate(next);
                clearPlanReleaseDate = next == null;
            }
        }

        /* ── 抄送：整份替換（空數組即清空） ── */
        if (dto.getCcUserIds() != null) {
            if (!(canEditDeliveryAttrs || submitterSelf)) {
                throw new BusinessException("您沒有權限維護抄送人");
            }
            LinkedHashSet<Long> nextIds = new LinkedHashSet<>();
            for (Long userId : dto.getCcUserIds()) {
                if (userId != null) {
                    nextIds.add(userId);
                }
            }
            List<RdmRequirementRole> currentCc = roleMapper.selectList(new LambdaQueryWrapper<RdmRequirementRole>()
                    .eq(RdmRequirementRole::getReqId, id)
                    .eq(RdmRequirementRole::getRoleCode, RdmConstants.ROLE_CC)
                    .eq(RdmRequirementRole::getIsActive, 1));
            Set<Long> currentIds = new LinkedHashSet<>();
            for (RdmRequirementRole role : currentCc) {
                currentIds.add(role.getUserId());
                if (!nextIds.contains(role.getUserId())) {
                    deactivateRole(id, role.getUserId(), RdmConstants.ROLE_CC);
                }
            }
            List<String> names = new ArrayList<>();
            for (Long userId : nextIds) {
                SysUser user = requireActiveEmployee(userId, "抄送人");
                names.add(user.getName());
                if (!currentIds.contains(userId)) {
                    upsertActiveRole(id, user, RdmConstants.ROLE_CC);
                }
            }
            changes.add("抄送：" + (names.isEmpty() ? "清空" : String.join("、", names)));
        }

        if (changes.isEmpty()) {
            throw new BusinessException("沒有檢測到需要修改的屬性");
        }
        req.setUpdatedBy(operatorResolver.operatorSignature(current));
        requirementMapper.updateById(req);
        // updateById 默認 NOT_NULL，清空日期必須顯式 SET NULL，否則界面顯示已清空、庫裡還留舊值
        if (clearExpectDate || clearPromisedDate || clearPlanReleaseDate) {
            LambdaUpdateWrapper<RdmRequirement> clear = new LambdaUpdateWrapper<RdmRequirement>()
                    .eq(RdmRequirement::getId, id);
            if (clearExpectDate) {
                clear.set(RdmRequirement::getExpectDate, null);
            }
            if (clearPromisedDate) {
                clear.set(RdmRequirement::getPromisedPrdDate, null);
            }
            if (clearPlanReleaseDate) {
                clear.set(RdmRequirement::getPlanReleaseDate, null);
            }
            requirementMapper.update(null, clear);
        }

        String remark = StringUtils.hasText(dto.getRemark()) ? "；說明：" + dto.getRemark().trim() : "";
        appendStatusLog(req, req.getStatus(), current, "change_attr", String.join("；", changes) + remark);
        notifyIds.remove(current.getId());
        if (!notifyIds.isEmpty()) {
            notifyService.notifyUserIds(RdmConstants.EVENT_STATUS_CHANGED, req, new ArrayList<>(notifyIds),
                    "需求屬性已更新",
                    "### ✏️ 需求屬性更新\n\n- **需求**：" + (req.getReqNo() == null ? "-" : req.getReqNo())
                            + " " + req.getTitle()
                            + "\n- **變更**：" + String.join("；", changes)
                            + "\n- **操作人**：" + current.getName());
        }
        log.info("需求屬性變更: reqNo={}, changes={}, operator={}",
                req.getReqNo(), String.join("；", changes), req.getUpdatedBy());
        return RdmRequirementVO.from(requirementMapper.selectById(id), configService.stageMap());
    }

    /**
     * 批量變更提出人。
     * <p>不校驗需求狀態：提出人是權屬字段，不影響流程；已上線的需求也可能需要更正歸屬。
     * <p>逐條寫主表 + 角色行 + 狀態流水，任何一條失敗整批回滾（避免一半人一半人）。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public int batchChangeSubmitter(RdmBatchSubmitterDTO dto) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (!(operatorResolver.isAdmin(current) || accessGuard.canSeeAll(current) || accessGuard.canDispatch(current))) {
            throw new BusinessException("只有需求分配人/管理員可以變更提出人");
        }
        if (dto == null || dto.getIds() == null || dto.getIds().isEmpty()) {
            throw new BusinessException("請選擇需要變更提出人的需求");
        }
        List<Long> ids = dto.getIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.size() > 500) {
            throw new BusinessException("單次最多變更 500 條需求，請分批操作");
        }
        SysUser next = requireActiveEmployee(dto.getSubmitterUserId(), "提出人");
        String remark = StringUtils.hasText(dto.getRemark()) ? "；說明：" + dto.getRemark().trim() : "";
        String signature = operatorResolver.operatorSignature(current);
        int changed = 0;
        for (Long reqId : ids) {
            RdmRequirement req = requirementMapper.selectById(reqId);
            if (req == null) {
                continue;
            }
            Long previous = req.getSubmitterUserId();
            if (next.getId().equals(previous)) {
                continue;
            }
            jdbcTemplate.update(
                    "UPDATE rdm_requirement SET submitter_user_id = ?, submitter_emp_no = ?, submitter_name = ?, "
                            + "submit_dept_id = ?, submit_dept_name = ?, updated_by = ?, updated_at = now() "
                            + "WHERE id = ? AND deleted = 0",
                    next.getId(), next.getEmpId(), next.getName(), next.getDepartmentId(),
                    next.getDepartment(), signature, reqId);
            if (previous != null) {
                deactivateRole(reqId, previous, RdmConstants.ROLE_SUBMITTER);
            }
            upsertActiveRole(reqId, next, RdmConstants.ROLE_SUBMITTER);
            appendStatusLog(req, req.getStatus(), current, "change_submitter",
                    "變更提出人：" + personLabel(req.getSubmitterName(), req.getSubmitterEmpNo())
                            + " → " + personLabel(next.getName(), next.getEmpId()) + remark);
            changed++;
        }
        log.info("批量變更提出人完成: target={}, changed={}, operator={}", ids.size(), changed, signature);
        return changed;
    }

    /**
     * 批量補錄受理信息（存量導入需求）。
     *
     * <p><b>為什麼不回退狀態</b>：導入時已隨需求生成一份 approved PRD，
     * 若把狀態退回受理前，會出現「狀態說還沒寫 PRD、庫裡卻躺著定稿 PRD」的矛盾；
     * 而回退後重新受理又會因評審記錄缺失停在 PRD 產出中，108 條等於重走一遍評審。
     * 因此本方法只補「受理事實」（承諾日期 + 產品任務），狀態保持不動。
     *
     * <p><b>產品任務口徑</b>：按已完成補建（PRD 已隨導入產出），
     * 只補歷史可見性，不給產品經理製造形式化待辦；已有未完成任務的只同步日期與負責人，
     * 已完成任務不改寫歷史歸屬（與 {@link RdmPrdTaskService#ensureTask} 同口徑）。
     *
     * <p><b>審計</b>：補錄不是一次狀態變更，流水 {@code from_status = to_status} 且立即閉合，
     * 避免成為一條永不關閉的 open 行、把後續狀態停留時長算錯。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmBatchBackfillVO batchBackfillAccept(RdmBatchBackfillAcceptDTO dto) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (!(operatorResolver.isAdmin(current) || accessGuard.canSeeAll(current) || accessGuard.canDispatch(current))) {
            throw new BusinessException("只有需求分配人/管理員可以補錄受理信息");
        }
        List<Long> ids = dto == null || dto.getIds() == null ? List.of()
                : dto.getIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            throw new BusinessException("請選擇需要補錄受理信息的需求");
        }
        if (ids.size() > 500) {
            throw new BusinessException("單次最多補錄 500 條需求，請分批操作");
        }
        LocalDate promised = parseDate(dto.getPromisedPrdDate());
        if (promised == null) {
            throw new BusinessException("請填寫承諾出 PRD 日期");
        }
        SysUser pm = null;
        if (dto.getPmUserId() != null) {
            pm = requireActiveEmployee(dto.getPmUserId(), "產品經理");
            requirePmEligible(pm);
        }

        String signature = operatorResolver.operatorSignature(current);
        String remark = StringUtils.hasText(dto.getRemark()) ? "；說明：" + dto.getRemark().trim() : "";
        RdmBatchBackfillVO result = new RdmBatchBackfillVO();
        for (Long reqId : ids) {
            RdmRequirement req = requirementMapper.selectById(reqId);
            if (!isBackfillable(req)) {
                result.setSkippedStatus(result.getSkippedStatus() + 1);
                continue;
            }
            SysUser owner = pm != null ? pm
                    : (req.getAssigneePmUserId() == null ? null : userMapper.selectById(req.getAssigneePmUserId()));
            /*
             * 離職/停用的歷史受理人不能再承接任務：任務掛到停用賬號後，
             * 工作台與團隊負載都按 owner 過濾，等於補了一條誰也看不到的任務。
             * 這種行走 skippedNoPm，讓用戶先批量分配或指定新的產品經理再重試。
             */
            if (owner == null || (owner.getStatus() != null && owner.getStatus() == 0)) {
                result.setSkippedNoPm(result.getSkippedNoPm() + 1);
                continue;
            }
            /*
             * 明確指定產品經理時同步主表與角色行：只寫任務負責人會讓權限口徑與任務歸屬分裂，
             * 被指定的人拿不到受理權，任務卻掛在他名下。
             */
            if (pm != null && !pm.getId().equals(req.getAssigneePmUserId())) {
                applyPm(req, pm, current);
                req.setCurrentHandlerName(computeHandler(req, null));
                requirementMapper.updateById(req);
                upsertActiveRole(req.getId(), pm, RdmConstants.ROLE_PM);
            }
            jdbcTemplate.update(
                    "UPDATE rdm_requirement SET promised_prd_date = ?, updated_by = ?, updated_at = now() "
                            + "WHERE id = ? AND deleted = 0",
                    promised, signature, reqId);
            syncBackfillPrdTask(req, owner, promised, signature);
            insertBackfillLog(req, current, "存量補錄受理：承諾出 PRD 日期 " + promised
                    + "；產品任務按已完成補建" + remark);
            result.setUpdated(result.getUpdated() + 1);
        }
        log.info("批量補錄受理信息完成: target={}, updated={}, skippedNoPm={}, skippedStatus={}, operator={}",
                ids.size(), result.getUpdated(), result.getSkippedNoPm(), result.getSkippedStatus(), signature);
        return result;
    }

    /**
     * 可補錄範圍：整需求鏈路（V1/V2）且停在 PRD 階段。
     * <p>排期後的需求承諾日期已不影響任何門禁，補錄只會污染歷史；V3 分批交付由交付項推進，
     * 不生成整需求 PRD 任務，補錄會造出無人認領的孤兒任務。
     */
    private boolean isBackfillable(RdmRequirement req) {
        if (req == null) {
            return false;
        }
        if (req.getFlowVersion() != null && req.getFlowVersion() == RdmConstants.FLOW_VERSION_3) {
            return false;
        }
        return PRD_PHASE_STATUSES.contains(req.getStatus());
    }

    /** 補建/同步產品任務：無任務則按已完成補建，已有未完成任務只同步計劃與負責人 */
    private void syncBackfillPrdTask(RdmRequirement req, SysUser owner, LocalDate promised, String signature) {
        RdmWorkTask existing = taskMapper.selectOne(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId())
                .eq(RdmWorkTask::getTaskType, RdmPrdTaskService.TASK_TYPE_PRD)
                .ne(RdmWorkTask::getStatus, "cancelled")
                .orderByDesc(RdmWorkTask::getId)
                .last("LIMIT 1"));
        if (existing != null) {
            if ("done".equals(existing.getStatus())) {
                return;
            }
            taskMapper.update(null, new LambdaUpdateWrapper<RdmWorkTask>()
                    .eq(RdmWorkTask::getId, existing.getId())
                    .set(RdmWorkTask::getPlanFinishDate, promised)
                    .set(RdmWorkTask::getOwnerUserId, owner.getId())
                    .set(RdmWorkTask::getOwnerName, owner.getName())
                    .set(RdmWorkTask::getOwnerEmpNo, owner.getEmpId())
                    .set(RdmWorkTask::getIterationCode, req.getIterationCode())
                    .set(RdmWorkTask::getUpdatedBy, signature));
            return;
        }
        RdmWorkTask task = new RdmWorkTask();
        task.setTaskNo(bizSeqService.next(BizSeqService.RULE_RDM_WORK_TASK));
        task.setReqId(req.getId());
        task.setTaskType(RdmPrdTaskService.TASK_TYPE_PRD);
        task.setTitle(RdmPrdTaskService.PRD_TASK_TITLE);
        task.setContent("存量導入補建：承諾 " + promised + " 前產出 PRD；導入時已生成定稿 PRD，任務按已完成補錄。");
        task.setOwnerUserId(owner.getId());
        task.setOwnerName(owner.getName());
        task.setOwnerEmpNo(owner.getEmpId());
        task.setRoleCode(RdmConstants.ROLE_PM);
        task.setStatus("done");
        task.setProgress(100);
        // 計劃開始取受理日（導入時間），缺失時退回承諾日，保證甘特圖有可畫區間
        task.setPlanStartDate(req.getAcceptTime() == null ? promised : req.getAcceptTime().toLocalDate());
        task.setPlanFinishDate(promised);
        task.setActualStartTime(req.getAcceptTime());
        LocalDateTime prdTime = latestPrdReviewTime(req.getId());
        task.setActualFinishTime(prdTime == null ? req.getAcceptTime() : prdTime);
        task.setIterationCode(req.getIterationCode());
        task.setPlanVersion(1);
        task.setCreatedBy(signature);
        task.setUpdatedBy(signature);
        taskMapper.insert(task);
    }

    /** 最新一份 PRD 的定稿時間（導入時即為生成時間），作為產品任務的實際完成時間 */
    private LocalDateTime latestPrdReviewTime(Long reqId) {
        List<java.sql.Timestamp> rows = jdbcTemplate.queryForList(
                "SELECT review_time FROM rdm_prd WHERE req_id = ? AND deleted = 0 ORDER BY id DESC LIMIT 1",
                java.sql.Timestamp.class, reqId);
        return rows.isEmpty() || rows.get(0) == null ? null : rows.get(0).toLocalDateTime();
    }

    /**
     * 補錄流水：狀態未變更，進入即閉合。
     * <p>不能複用 {@link #appendStatusLog}：那條會寫 open 行，而 {@code closeOpenStatusLog}
     * 只關閉最新一條，會讓更早的狀態行永遠 open，直接把停留時長統計算歪。
     */
    private void insertBackfillLog(RdmRequirement req, SysUser actor, String remark) {
        LocalDateTime now = LocalDateTime.now();
        RdmStatusLog statusLog = new RdmStatusLog();
        statusLog.setReqId(req.getId());
        statusLog.setFromStatus(req.getStatus());
        statusLog.setToStatus(req.getStatus());
        statusLog.setActionCode(RdmConstants.ACTION_BACKFILL_ACCEPT);
        statusLog.setOperatorUserId(actor.getId());
        statusLog.setOperatorName(actor.getName());
        statusLog.setOperatorRole(resolveMyRole(req, actor));
        statusLog.setRemark(remark);
        statusLog.setEnterTime(now);
        statusLog.setLeaveTime(now);
        statusLog.setDurationSeconds(0L);
        statusLog.setIsOverdue(0);
        statusLogMapper.insert(statusLog);
    }

    /** 人員選擇校驗：必須存在且在職（停用/離職不能成為新的歸屬人） */
    private SysUser requireActiveEmployee(Long userId, String label) {
        SysUser user = userId == null ? null : userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(label + "不存在，請重新選擇");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(label + "已離職或停用，請改選其他人");
        }
        return user;
    }

    /**
     * 恢復或新增參與角色行。
     * <p>唯一鍵 (req_id, user_id, role_code) 不含 deleted，軟刪行不能直接再插，
     * 且 {@code @TableLogic} 會讓 selectOne 看不到軟刪行；故用 jdbcTemplate 繞過邏輯刪除查回原行並恢復。
     */
    private void upsertActiveRole(Long reqId, SysUser user, String roleCode) {
        if (reqId == null || user == null || !StringUtils.hasText(roleCode)) {
            return;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id FROM rdm_requirement_role WHERE req_id = ? AND user_id = ? AND role_code = ? LIMIT 1",
                reqId, user.getId(), roleCode);
        if (!rows.isEmpty()) {
            jdbcTemplate.update(
                    "UPDATE rdm_requirement_role SET is_active = 1, deleted = 0, emp_no = ?, emp_name = ?, "
                            + "join_time = now() WHERE id = ?",
                    user.getEmpId(), user.getName(), ((Number) rows.get(0).get("id")).longValue());
            return;
        }
        RdmRequirementRole role = new RdmRequirementRole();
        role.setReqId(reqId);
        role.setUserId(user.getId());
        role.setEmpNo(user.getEmpId());
        role.setEmpName(user.getName());
        role.setRoleCode(roleCode);
        role.setIsActive(1);
        role.setJoinTime(LocalDateTime.now());
        roleMapper.insert(role);
    }

    /**
     * 准入审批代理：把需求详情页的「審批通過 / 審批駁回」转交给 OA 引擎。
     * <p>走 OA 而非直接改状态，才能同时拿到三样东西：审批人身份校验（fail-closed）、
     * 不可篡改的审批留痕、以及通过/驳回后的通知与状态回调。
     * <p>例外两档：
     * <ul>
     *   <li>需求没有准入單（历史数据或发起失败）→ 退回状态机直改，否则需求永久卡死；</li>
     *   <li>OA 已审完但需求状态未落地（当时回调异常）→ 只做补偿推进，不重复审批。</li>
     * </ul>
     */
    private RdmRequirementVO actIntakeApproval(RdmRequirement req, RdmTransitionDTO dto, boolean approve) {
        SysUser current = operatorResolver.currentUser();
        String flowNo = req.getIntakeFlowNo();
        if (!StringUtils.hasText(flowNo)) {
            log.warn("需求無准入單，審批动作退回状态机直改: reqNo={}, operator={}", req.getReqNo(),
                    current == null ? null : current.getUsername());
            /*
             * 延迟发号 v2：无单回退也不再立即生成需求编号，编号推迟到产品经理认领（claim）时生成。
             * 需求直接进入需求池（pool）状态，req_no 保持 NULL。
             */
            transitionInternal(req, dto.getActionCode(), dto, current,
                    accessGuard.activeRoles(req.getId(), current));
            // 任务19 / 缺口1：无准入单时退回状态机直改，若因此让 V3 执行需求进入已准入状态，补建默认交付项。
            maybeCreateV3DefaultItem(requirementMapper.selectById(req.getId()), current == null ? null : current.getId());
            return latestVO(req.getId());
        }

        String flowStatus = readFlowStatus(flowNo);
        if (approve && RdmConstants.FLOW_APPROVED.equals(flowStatus)) {
            intakeCallbackService.onFlowApproved(flowNo);
            log.info("准入單已終審通過，補償推進需求狀態: reqNo={}, flowNo={}", req.getReqNo(), flowNo);
            return latestVO(req.getId());
        }
        if (!approve && RdmConstants.FLOW_REJECTED.equals(flowStatus)) {
            intakeCallbackService.onFlowRejected(flowNo, dto.getRemark());
            log.info("准入單已駁回，補償推進需求狀態: reqNo={}, flowNo={}", req.getReqNo(), flowNo);
            return latestVO(req.getId());
        }

        String comment = StringUtils.hasText(dto.getRemark()) ? dto.getRemark()
                : (approve ? "准入通過" : "准入駁回");
        if (approve) {
            oaRequestService.approve(flowNo, comment, null);
        } else {
            oaRequestService.reject(flowNo, comment);
        }
        log.info("准入審批已代理给 OA: reqNo={}, flowNo={}, action={}, operator={}", req.getReqNo(), flowNo,
                approve ? "approve" : "reject", current == null ? null : current.getUsername());
        // 终审完成时 OA 会同步回调落状态；仍有后续节点则需求停在待审批，不能谎称已通过
        return latestVO(req.getId());
    }

    /** 读准入单当前流程状态（读不到返回 null，由调用方按“无准入单”处理） */
    private String readFlowStatus(String flowNo) {
        OaRequestVO flow = oaRequestService.detail(flowNo);
        return flow == null ? null : flow.getFlowStatus();
    }

    private RdmRequirementVO latestVO(Long reqId) {
        return RdmRequirementVO.from(requirementMapper.selectById(reqId), configService.stageMap());
    }

    /**
     * 执行一次流转：配置校验 → 角色校验 → 必填校验 → 业务字段回填 → 流水落库 → 通知。
     *
     * @param myRoles 当前人在该需求上的全部有效角色（空集时按管理岗兜底）
     */
    private void transitionInternal(RdmRequirement req, String actionCode, RdmTransitionDTO dto,
                                    SysUser current, Set<String> myRoles) {
        transitionInternal(req, actionCode, dto, current, myRoles, false);
    }

    /**
     * 一次流轉的實際執行。
     *
     * @param systemAlign 為真時表示這是「依事實對齊狀態」的系統動作：跳過角色校驗與通知
     *                    （評審結論本身已在錄入時鑑權，這裡只是把狀態補到既成事實上）。
     */
    private void transitionInternal(RdmRequirement req, String actionCode, RdmTransitionDTO dto,
                                    SysUser current, Set<String> myRoles, boolean systemAlign) {
        RdmConfigVO.Transition rule = configService.findTransition(req.getStatus(), actionCode);
        if (rule == null) {
            throw new BusinessException("當前狀態「" + labelOf(req.getStatus()) + "」不允許執行該操作，請刷新後重試");
        }
        if (!systemAlign && !canPerform(rule, current, myRoles)) {
            throw new BusinessException("您沒有權限執行「" + rule.getActionName() + "」");
        }
        applyRequiredGuard(rule, dto);

        String fromStatus = req.getStatus();
        LocalDateTime now = LocalDateTime.now();
        SysUser actor = current;

        // 分配/改派：回填产品经理
        if (rule.getRequiredFields().contains("pm") || RdmConstants.ACTION_DISPATCH.equals(actionCode)) {
            SysUser pm = dto != null && dto.getPmUserId() != null ? userMapper.selectById(dto.getPmUserId()) : null;
            if (pm == null) {
                throw new BusinessException("請選擇產品經理");
            }
            // 分配同样要过资格门：否则可以把需求塞给离职或无受理权的人
            requirePmEligible(pm);
            applyPm(req, pm, actor);
            upsertRole(req.getId(), pm, RdmConstants.ROLE_PM);
        }
        if (StringUtils.hasText(dto != null ? dto.getRemark() : null)) {
            // 對齊不是一次新的駁回：不能再把 rejectCount 加一輪（那會把駁回率算成事實的兩倍）
            if (!systemAlign && (actionCode.contains("reject") || actionCode.contains("fail"))) {
                req.setRejectReason(dto.getRemark());
                req.setRejectCount(value(req.getRejectCount()) + 1);
            }
        }
        switch (actionCode) {
            case RdmConstants.ACTION_DISPATCH -> {
                /*
                 * 先落项目/迭代，再确定交付流程：默认交付项要继承项目归属与刚分配的 PM。
                 * 顺序反了（先建交付项后挂项目）会让交付项永久无项目、无产品验收人，
                 * 项目看板/发布批次/验收签字逐环节都拿不到真实责任人与归属。
                 */
                applyProjectAndIteration(req, dto, false);
                // 分配是产研第一次确定交付方式的时点：默认 V3，也可在弹窗里选 V2
                applyFlowVersionOnAssignment(req, dto, current == null ? null : current.getId());
                // 提出人未指定技术负责人时，以真正执行分派的人为准，避免需求池的处理人永远空白
                if (req.getDispatcherUserId() == null && current != null) {
                    req.setDispatcherUserId(current.getId());
                    req.setDispatcherName(current.getName());
                }
            }
            case RdmConstants.ACTION_ACCEPT -> {
                req.setAcceptTime(now);
                req.setPromisedPrdDate(parseDate(dto == null ? null : dto.getPromisedDate()));
                // 产品规划版本时可顺手挂项目+迭代（选填；排期闸门会再强制一次）
                applyProjectAndIteration(req, dto, false);
            }
            case RdmConstants.ACTION_HOLD -> req.setOnHoldUntil(parseDate(dto == null ? null : dto.getHoldUntil()));
            case RdmConstants.ACTION_UNHOLD -> req.setOnHoldUntil(null);
            case RdmConstants.ACTION_SCHEDULE -> {
                req.setPlanReleaseDate(parseDate(dto == null ? null : dto.getPlanDate()));
                req.setPlanDevDate(parseDate(dto == null ? null : dto.getPlanDevDate()));
                // 归属体系改造硬闸门：进入研发执行前必须挂项目+迭代（用户已裁决闸门放排期）
                applyProjectAndIteration(req, dto, true);
                if (dto != null && dto.getDevOwnerUserId() != null) {
                    SysUser devLead = userMapper.selectById(dto.getDevOwnerUserId());
                    req.setDevOwnerUserId(dto.getDevOwnerUserId());
                    req.setDevOwnerName(devLead == null ? null : devLead.getName());
                    upsertRole(req.getId(), devLead, RdmConstants.ROLE_DEV_LEAD);
                }
            }
            case RdmConstants.ACTION_UAT_FAIL -> {
                req.setReworkCount(value(req.getReworkCount()) + 1);
                /*
                 * 这里不再重复 +rejectCount：上面的通用分支已经对包含 reject/fail 的动作计过一次驳回，
                 * 再加一次就是一次验收不通过抬高两倍的驳回率（目标：驳回率只反映“被拒次数”）。
                 */
                // 返工后旧的放行单作废：拿着返工前的结论上线等于没进过闸门
                releaseService.revokeOpenGates(req.getId(), "验收不通过退回返工");
            }
            case RdmConstants.ACTION_RELEASE -> {
                // 上线前置闸门：没有已放行、未过期且版本匹配的放行单就不允许上線
                // （检查项全由服务端算，不拿“菜单有 edit 权”当成质量合格）
                releaseService.requireValidPass(req.getId(), dto == null ? null : dto.getVersionNo());
                req.setVersionNo(dto == null ? null : dto.getVersionNo());
                req.setActualReleaseDate(LocalDate.now());
            }
            case RdmConstants.ACTION_VERIFY -> {
                if (dto != null && dto.getScore() != null) {
                    if (dto.getScore() < RdmConstants.SCORE_MIN || dto.getScore() > RdmConstants.SCORE_MAX) {
                        throw new BusinessException("满意度評分必須在 1-5 分之間");
                    }
                    req.setAcceptanceScore(dto.getScore());
                }
                req.setAcceptanceTime(now);
            }
            case RdmConstants.ACTION_REOPEN -> {
                req.setReopenCount(value(req.getReopenCount()) + 1);
                releaseService.revokeOpenGates(req.getId(), "需求已重开，旧放行结论不再沿用");
            }
            case RdmConstants.ACTION_BACK_TO_EVALUATE -> {
                // 退回評估意味著要重新走受理與 PRD 產出：已收口的產品任務必須重新打開，
                // 否則產品經理在工作台看不到它，回退只是把狀態改回去了
                prdTaskService.reopenTask(req.getId(), actor);
            }
            default -> {
                if (dto != null && dto.getProgress() != null) {
                    req.setProgress(dto.getProgress());
                }
            }
        }
        if (dto != null && dto.getProgress() != null) {
            req.setProgress(dto.getProgress());
        }
        req.setStatus(rule.getToStatus());
        ensureReqNoForTargetStatus(req, rule.getToStatus());
        req.setStatusEnterTime(now);
        req.setOverdueFlag(0);
        req.setCurrentHandlerName(computeHandler(req, null));
        req.setUpdatedBy(operatorResolver.operatorSignature(actor));
        requirementMapper.updateById(req);

        closeOpenStatusLog(req.getId(), now, isOverdue(req));
        markMilestoneActual(req.getId(), actionCode, now, operatorResolver.operatorSignature(actor));
        appendStatusLog(req, fromStatus, actor, actionCode, dto == null ? null : dto.getRemark());

        if (!systemAlign) {
            notifyOnTransition(req, rule, actor);
        }
        log.info("需求流轉: reqNo={}, {} -> {}, action={}, operator={}{}",
                req.getReqNo(), fromStatus, req.getStatus(), actionCode, req.getUpdatedBy(),
                systemAlign ? "（自動對齊）" : "");

        /*
         * 受理后立刻把「承诺出 PRD 日期」落成产品经理的任务：任务页签与甘特图只读任务表，
         * 不建任务则产品侧进度完全不可见（此前只能看到一个静态日期字段）。
         * 同时用既有事实校对一次状态：旧数据可能在「评估中」就先写了 PRD，避免页面又要求再写一次。
         */
        if (!systemAlign && RdmConstants.ACTION_ACCEPT.equals(actionCode)) {
            prdTaskService.ensureTask(req, actor);
            if (PRD_PHASE_STATUSES.contains(req.getStatus())) {
                alignPrdPhaseStatus(req.getId());
            }
        }
    }

    /**
     * 归属体系改造：项目/迭代挂接的统一校验与写入（dispatch/accept 选填，schedule 必填）。
     * <p>三条口径（与前端 RequirementDetail 动作弹窗联动同源）：
     * <ol>
     *   <li>迭代必须存在且未关闭（closed 迭代不再承接新排期，与需求排期下拉过滤同口径）；</li>
     *   <li>迭代有项目时以迭代的项目为准回写需求（单一真值源）；hotfix 迭代可无项目，
     *       此时以调用方所选项目为准；两者都有且不一致 → 拒绝（防止需求项目与迭代项目分裂）；</li>
     *   <li>required=true（排期闸门）时，动作完成后需求必须同时有项目与迭代。</li>
     * </ol>
     * <p>不信任前端：项目/迭代存在性都走服务端查库校验。
     * <p>包可见：与 {@link #canPerform}/{@link #applyRequiredGuard} 同构，供单测直接钉住闸门口径。
     */
    /**
     * 分配/认领时确定交付流程（默认 V3 分批交付）。
     *
     * <p><b>为什么不在提交时选</b>：业务方不知道 V2/V3 是什么，也不该由他们决定；
     * 提交时写入 V2 占位，到准入后的分配/认领才由产研确定。
     *
     * <p><b>窗口与安全边界</b>：
     * <ul>
     *   <li>仅 pool / assigned / evaluating 可确定；已受理或存量需求保持原版本；</li>
     *   <li>已有未取消任务的一律不得升到 V3：那些任务没有交付项归属，
     *       强行升级会出现「V2 任务 + V3 交付项」混合态；</li>
     *   <li>升 V3 时补建默认交付项，需求种类缺省 execution。</li>
     * </ul>
     */
    private void applyFlowVersionOnAssignment(RdmRequirement req, RdmTransitionDTO dto, Long operatorId) {
        if (req == null || req.getId() == null) {
            return;
        }
        Integer existing = req.getFlowVersion();
        if (existing != null && existing == RdmConstants.FLOW_VERSION_3) {
            return;
        }
        if (!FLOW_SELECTABLE_STATUSES.contains(req.getStatus())) {
            return;
        }
        Integer explicit = dto == null ? null : dto.getFlowVersion();
        Integer requested = explicit == null ? RdmConstants.FLOW_VERSION_3 : explicit;
        if (requested != RdmConstants.FLOW_VERSION_3 && requested != 2) {
            throw new BusinessException("交付流程只能是 V2 或 V3");
        }
        Long openTasks = taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId())
                .ne(RdmWorkTask::getStatus, "cancelled"));
        if (openTasks != null && openTasks > 0) {
            // 已有任务：只有用户「明确」要求切 V3 才拒绝；默认升级（改派/存量重分配）
            // 必须静默保持 V2，否则每次改派都会被流程选择拦住
            if (explicit != null && explicit == RdmConstants.FLOW_VERSION_3) {
                throw new BusinessException("需求已創建任務，不能再切換為分批交付（V3）");
            }
            return;
        }
        req.setFlowVersion(requested);
        if (requested == RdmConstants.FLOW_VERSION_3) {
            if (!StringUtils.hasText(req.getRequirementKind())) {
                req.setRequirementKind(RdmConstants.KIND_EXECUTION);
            }
            // 传快照而非 id：PM/项目刚写入内存、尚未落库，重读库会丢失默认验收人与项目归属
            deliveryItemService.getOrCreateDefaultItem(req, operatorId);
        }
    }

    /** 交付流程可确定的窗口：准入后、研发执行前（分配/认领/评估） */
    private static final Set<String> FLOW_SELECTABLE_STATUSES = Set.of(
            RdmConstants.STATUS_POOL, RdmConstants.STATUS_ASSIGNED, RdmConstants.STATUS_EVALUATING);

    void applyProjectAndIteration(RdmRequirement req, RdmTransitionDTO dto, boolean required) {
        Long projectId = dto == null ? null : dto.getProjectId();
        String iterationCode = dto == null ? null : dto.getIterationCode();
        boolean hasIteration = StringUtils.hasText(iterationCode);
        if (!hasIteration && projectId == null) {
            if (!required) {
                return;
            }
            /*
             * 排期未改歸屬時按需求已有歸屬複核，而不是直接要求重選：
             * 前端動作彈窗是否渲染項目/迭代取決於 rdm_transition.required_fields，
             * 歷史庫只配了 planDate，用戶明明已在屬性欄掛好項目+迭代，
             * 仍會被「必須選擇所屬項目與迭代」擋住（生產已發生）。
             * 已有值照樣走下面的存在性/關閉/歸屬一致性校驗，不跳過任何門禁。
             */
            projectId = req.getProjectId();
            iterationCode = req.getIterationCode();
            hasIteration = StringUtils.hasText(iterationCode);
            if (!hasIteration && projectId == null) {
                throw new BusinessException("提交排期必須選擇所屬項目與迭代");
            }
        }
        Long resolvedProjectId = projectId;
        if (hasIteration) {
            String code = iterationCode.trim();
            Map<String, Object> it = jdbcTemplate.queryForList(
                            "SELECT project_id, status FROM rdm_iteration WHERE deleted = 0 AND code = ?", code)
                    .stream().findFirst().orElse(null);
            if (it == null) {
                throw new BusinessException("迭代不存在：" + code);
            }
            if ("closed".equals(String.valueOf(it.get("status")))) {
                throw new BusinessException("迭代已關閉，不能排入：" + code);
            }
            Object itProject = it.get("project_id");
            if (itProject != null) {
                Long itProjectId = ((Number) itProject).longValue();
                if (resolvedProjectId != null && !resolvedProjectId.equals(itProjectId)) {
                    throw new BusinessException("該迭代不屬於所選項目，請重新選擇");
                }
                resolvedProjectId = itProjectId;
            }
            req.setIterationCode(code);
        }
        if (resolvedProjectId != null) {
            // rdm_project 无 deleted 列（Batch 1 建表即无），存在性判断只按主键
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM rdm_project WHERE id = ?", Integer.class, resolvedProjectId);
            if (cnt == null || cnt == 0) {
                throw new BusinessException("所屬項目不存在");
            }
            req.setProjectId(resolvedProjectId);
        }
        if (required) {
            if (!StringUtils.hasText(req.getIterationCode())) {
                throw new BusinessException("提交排期必須選擇迭代");
            }
            if (req.getProjectId() == null) {
                throw new BusinessException("提交排期必須選擇所屬項目（緊急修復迭代也須指定項目歸屬）");
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int batchAssign(List<Long> ids, Long pmUserId) {
        if (ids == null || ids.isEmpty() || pmUserId == null) {
            throw new BusinessException("請選擇需求與產品經理");
        }
        SysUser pm = userMapper.selectById(pmUserId);
        if (pm == null) {
            throw new BusinessException("產品經理不存在");
        }
        SysUser current = operatorResolver.currentUser();
        int count = 0;
        for (Long id : ids) {
            RdmRequirement req = requirementMapper.selectById(id);
            if (req == null || !RdmConstants.STATUS_POOL.equals(req.getStatus())) {
                continue;
            }
            RdmTransitionDTO dto = new RdmTransitionDTO();
            dto.setPmUserId(pmUserId);
            transitionInternal(req, RdmConstants.ACTION_DISPATCH, dto, current, Set.of());
            count++;
        }
        if (count == 0) {
            throw new BusinessException("所選需求已不在需求池，請刷新後重試");
        }
        return count;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO claim(Long id) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        // 认领人必须自己就有受理资格：否则抢到了单也推不动任何动作
        requirePmEligible(current);
        String signature = operatorResolver.operatorSignature(current);
        /*
         * 延迟发号 v2：产品经理认领时首次生成正式需求编号。
         * 幂等保证：ensureRequirementNumber 内部检查 reqNo 是否已有值，已有则跳过。
         * 取号失败直接向上抛，整个认领事务回滚，不会留下「已认领但无编号」的半成品。
         */
        String newReqNo = null;
        if (!StringUtils.hasText(req.getReqNo())) {
            newReqNo = bizSeqService.next(BizSeqService.RULE_RDM_REQUIREMENT);
        }
        final String reqNoToSet = newReqNo;
        /*
         * 原子抢单：条件里带 status=pool 与「尚无受理人」，两个 PM 同时点只有一个人拿到 1 行。
         * 分发人列不动：自认领没有技术负责人参与，写自己进去会误导责任归属。
         * 同时写入首次生成的需求编号（若已有号则原值覆盖写入，幂等安全）。
         */
        int taken = jdbcTemplate.update(
                "UPDATE rdm_requirement SET status = ?, assignee_pm_user_id = ?, assignee_pm_emp_no = ?, "
                        + "assignee_pm_name = ?, current_handler_name = ?, distribute_time = now(), "
                        + "status_enter_time = now(), overdue_flag = 0, updated_by = ?, "
                        + "req_no = COALESCE(req_no, ?) "
                        + "WHERE id = ? AND deleted = 0 AND status = ? "
                        + "AND (assignee_pm_user_id IS NULL OR assignee_pm_user_id = 0)",
                RdmConstants.STATUS_ASSIGNED, current.getId(), current.getEmpId(), current.getName(),
                current.getName(), signature, reqNoToSet, id, RdmConstants.STATUS_POOL);
        if (taken == 0) {
            throw new BusinessException("該需求已被他人認領或狀態已變更，請刷新後重試");
        }
        RdmRequirement claimed = requireRequirement(id);
        // 认领是产研接手的第一刻：默认确定交付流程（V3），已建过任务的需求保持原版本
        Integer flowBefore = claimed.getFlowVersion();
        applyFlowVersionOnAssignment(claimed, null, current.getId());
        if (!java.util.Objects.equals(flowBefore, claimed.getFlowVersion())) {
            jdbcTemplate.update("UPDATE rdm_requirement SET flow_version = ?, requirement_kind = ? WHERE id = ?",
                    claimed.getFlowVersion(), claimed.getRequirementKind(), id);
        }
        upsertRole(id, current, RdmConstants.ROLE_PM);
        appendStatusLog(claimed, RdmConstants.STATUS_POOL, current, RdmConstants.ACTION_CLAIM,
                "產品經理自需求池認領：" + current.getName());
        notifyService.notifyUserIds(RdmConstants.EVENT_ASSIGNED, claimed,
                List.of(claimed.getSubmitterUserId()), "需求已由產品經理認領",
                "### 🙋 需求已被認領\n\n- **編號**: " + claimed.getReqNo() + "\n- **標題**: " + claimed.getTitle()
                        + "\n- **受理人**: " + current.getName() + "\n\n後續由他與你確認範圍與排期。");
        log.info("需求已被認領: reqNo={}, pm={}", claimed.getReqNo(), current.getName());
        return RdmRequirementVO.from(claimed, configService.stageMap());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementVO reassignPm(Long id, RdmTransitionDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        if (!operatorResolver.isAdmin(current) && !accessGuard.canDispatch(current)) {
            throw new BusinessException("只有技術負責人/項目經理可改派產品經理");
        }
        if (dto == null || dto.getPmUserId() == null) {
            throw new BusinessException("請選擇改派後的產品經理");
        }
        if (RdmConstants.STATUS_POOL.equals(req.getStatus())) {
            throw new BusinessException("需求池內的單請用「分配」，改派只用於已受理的單");
        }
        SysUser target = userMapper.selectById(dto.getPmUserId());
        if (target == null) {
            throw new BusinessException("產品經理不存在或已停用");
        }
        requirePmEligible(target);
        Long previousPm = req.getAssigneePmUserId();
        if (Objects.equals(previousPm, target.getId())) {
            throw new BusinessException("該需求已由該產品經理受理，無需改派");
        }
        String reason = StringUtils.hasText(dto.getRemark()) ? dto.getRemark().trim() : "未說明原因";
        String signature = operatorResolver.operatorSignature(current);
        // CAS：以旧受理人为条件，两人同时改派时只有一个成功
        int moved = jdbcTemplate.update(
                "UPDATE rdm_requirement SET assignee_pm_user_id = ?, assignee_pm_emp_no = ?, assignee_pm_name = ?, "
                        + "current_handler_name = ?, distribute_time = now(), dispatcher_user_id = ?, dispatcher_name = ?, "
                        + "updated_by = ? WHERE id = ? AND deleted = 0 AND IFNULL(assignee_pm_user_id, 0) = ?",
                target.getId(), target.getEmpId(), target.getName(), target.getName(),
                current.getId(), current.getName(), signature, id, previousPm == null ? 0L : previousPm);
        if (moved == 0) {
            throw new BusinessException("需求受理人已變更，請刷新後重試");
        }
        /*
         * 旧受理人的参与角色只置为失效、不删除：他做过的评估、写过的评论、该得的贡献
         * 不能因为一次改派被抹掉，否则绩效口径会变成「谁最后接手算谁」。
         */
        deactivateRole(id, previousPm, RdmConstants.ROLE_PM);
        upsertRole(id, target, RdmConstants.ROLE_PM);
        // 未完成的 PRD 任务跟着新受理人走：换人后仍由旧人背 PRD 截止日，甘特图会指向已离任的人
        prdTaskService.syncOwner(req, target, current);
        RdmRequirement reassigned = requireRequirement(id);
        appendStatusLog(reassigned, req.getStatus(), current, RdmConstants.ACTION_REASSIGN_PM,
                "改派產品經理：" + (StringUtils.hasText(req.getAssigneePmName()) ? req.getAssigneePmName() : "未指定")
                        + " → " + target.getName() + "；原因：" + reason);
        List<Long> notice = new ArrayList<>();
        if (previousPm != null) {
            notice.add(previousPm);
        }
        notice.add(target.getId());
        if (reassigned.getSubmitterUserId() != null) {
            notice.add(reassigned.getSubmitterUserId());
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_ASSIGNED, reassigned, notice, "需求已改派",
                "### 🔁 需求已改派\n\n- **編號**: " + reassigned.getReqNo() + "\n- **標題**: " + reassigned.getTitle()
                        + "\n- **新受理人**: " + target.getName() + "\n- **操作人**: "
                        + (current == null ? "-" : current.getName()) + "\n- **原因**: " + reason
                        + "\n\n舊受理人已失去本單操作資格，歷史貢獻仍保留。");
        log.info("需求已改派: reqNo={}, {} -> {}, operator={}", reassigned.getReqNo(), previousPm,
                target.getId(), signature);
        return RdmRequirementVO.from(reassigned, configService.stageMap());
    }

    /** 把某人当前的参与角色置为失效（不物理删，保留历史贡献与可追溯时间轴） */
    private void deactivateRole(Long reqId, Long userId, String roleCode) {
        if (reqId == null || userId == null || !StringUtils.hasText(roleCode)) {
            return;
        }
        jdbcTemplate.update(
                "UPDATE rdm_requirement_role SET is_active = 0 WHERE req_id = ? AND user_id = ? AND role_code = ? "
                        + "AND is_active = 1 AND deleted = 0", reqId, userId, roleCode);
    }

    /* ==================== 沟通 / 催办 / 验收 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmComment addComment(Long id, String content, Boolean internal) {
        RdmRequirement req = requireRequirement(id);
        requireVisible(req, operatorResolver.currentUser(), "溝通");
        if (!StringUtils.hasText(content)) {
            throw new BusinessException("請填寫溝通內容");
        }
        SysUser current = operatorResolver.currentUser();
        RdmComment comment = new RdmComment();
        comment.setReqId(id);
        comment.setContent(content.trim());
        comment.setInternalFlag(Boolean.TRUE.equals(internal) ? 1 : 0);
        comment.setCreatedBy(operatorResolver.operatorSignature(current));
        comment.setUpdatedBy(comment.getCreatedBy());
        commentMapper.insert(comment);
        return comment;
    }

    @Override
    public void urge(Long id) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        requireVisible(req, current, "催辦");
        List<Long> receivers = new ArrayList<>();
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null) {
            receivers.add(req.getDevOwnerUserId());
        }
        if (receivers.isEmpty()) {
            receivers.add(req.getSubmitterUserId());
        }
        String text = "### ⏰ 需求催辦\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: " + req.getTitle()
                + "\n- **當前狀態**: " + labelOf(req.getStatus()) + "\n- **提出人**: " + req.getSubmitterName()
                + "\n\n提出人已催辦，請盡快推進或更新排期。";
        notifyService.notifyUserIds(RdmConstants.EVENT_URGE, req, receivers, "需求催辦", text);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitAcceptance(Long id, RdmAcceptanceDTO dto) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        requireVisible(req, current, "提交驗收結論");
        // 阶段 4：上线前预验收（uat_pending）与上线后业务验收（released/verified）是两件事实，
        // 阶段由当前状态推导，不接受客户端传值——否则可以把预验结果冒充正式满意度
        String stage = resolveAcceptanceStage(req.getStatus());
        boolean postRelease = RdmConstants.ACCEPT_STAGE_POST.equals(stage);
        // 持有 rdm-acceptance:create 只代表能用验收功能，不代表可替别人的业务方签字
        requireAcceptor(req, current);
        if (!StringUtils.hasText(dto.getResult())) {
            throw new BusinessException("請選擇驗收結論");
        }
        /*
         * 目标⑦：上线后业务验收必须打分。不打分就不能进后续统计，
         * 也不能靠“忘了填”交空值；预验收阶段可不打，但给了就必须是 1-5。
         */
        if (postRelease && dto.getScore() == null) {
            throw new BusinessException("上線後業務驗收必須給 1-5 分满意度評分");
        }
        if (dto.getScore() != null
                && (dto.getScore() < RdmConstants.SCORE_MIN || dto.getScore() > RdmConstants.SCORE_MAX)) {
            throw new BusinessException("满意度評分必須在 " + RdmConstants.SCORE_MIN + "-" + RdmConstants.SCORE_MAX + " 分之間");
        }
        boolean failed = RdmConstants.ACCEPT_FAIL.equals(dto.getResult());
        boolean conditional = RdmConstants.ACCEPT_CONDITIONAL.equals(dto.getResult());
        if ((failed || conditional) && !StringUtils.hasText(dto.getIssues())) {
            throw new BusinessException(failed ? "驗收不通過必須填寫問題描述" : "有條件通過需寫明遺留問題");
        }

        /*
         * 用例级约束（M3）：前端已按同一套规则禁用选项，但服务端必须重算——
         * 否则“有条件通过”会变成绕过缺陷带病上线的后门，一次通过率也会失真。
         */
        List<RdmAcceptanceDTO.AcceptanceCaseDTO> cases = dto.getCases() == null ? List.of() : dto.getCases();
        if (cases.stream().anyMatch(c -> !StringUtils.hasText(c.getTitle()))) {
            throw new BusinessException("驗收用例標題不能為空");
        }
        if (cases.stream().anyMatch(c -> !StringUtils.hasText(c.getResult()))) {
            throw new BusinessException("驗收用例必須逐條給出結論");
        }
        if (cases.stream().anyMatch(c -> !RdmConstants.CASE_PASS.equals(c.getResult())
                && !StringUtils.hasText(c.getSeverity()))) {
            throw new BusinessException("未通過的用例必須選擇缺陷嚴重程度（致命/嚴重會阻断上线）");
        }
        long defectCount = cases.stream().filter(c -> !RdmConstants.CASE_PASS.equals(c.getResult())).count();
        long blockingCount = cases.stream()
                .filter(c -> !RdmConstants.CASE_PASS.equals(c.getResult()))
                .filter(c -> RdmConstants.BLOCKING_SEVERITIES.contains(c.getSeverity()))
                .count();
        if (!cases.isEmpty() && !failed) {
            if (conditional && defectCount == 0) {
                throw new BusinessException("全部用例都已通過，請直接判定驗收通過（有條件通過必须确有遗留事项）");
            }
            if (conditional && blockingCount > 0) {
                throw new BusinessException("存在致命/嚴重缺陷，不允許有條件通過，請退回研發修復");
            }
            if (!conditional && defectCount > 0) {
                throw new BusinessException("有 " + defectCount + " 條用例未通過，不能判定驗收通過");
            }
        }

        // attempt 按阶段各自计数；取最大号+1 而不是数条数，事后补录不会改变已有记录的「第几次验收」
        int attempt = nextAcceptanceAttempt(id, stage);

        RdmAcceptance acceptance = new RdmAcceptance();
        acceptance.setAcceptNo(bizSeqService.next(SEQ_ACCEPTANCE));
        acceptance.setReqId(id);
        acceptance.setAcceptorUserId(current == null ? null : current.getId());
        acceptance.setAcceptorEmpNo(current == null ? null : current.getEmpId());
        acceptance.setAcceptorName(current == null ? req.getAcceptorName() : current.getName());
        acceptance.setResult(dto.getResult());
        acceptance.setStage(stage);
        acceptance.setAttempt(attempt);
        acceptance.setTestEnv(dto.getTestEnv());
        acceptance.setScore(dto.getScore());
        acceptance.setCaseTotal(cases.isEmpty() ? dto.getCaseTotal() : cases.size());
        acceptance.setCasePass(cases.isEmpty() ? dto.getCasePass() : (int) (cases.size() - defectCount));
        acceptance.setDefectCount(cases.isEmpty() ? 0 : (int) defectCount);
        acceptance.setIssues(dto.getIssues());
        acceptance.setOpinion(dto.getOpinion());
        acceptance.setAcceptTime(LocalDateTime.now());
        acceptance.setCreatedBy(operatorResolver.operatorSignature(current));
        acceptance.setUpdatedBy(acceptance.getCreatedBy());
        acceptanceMapper.insert(acceptance);

        saveAcceptanceCases(acceptance, req, cases, current);

        // 只有上线后的业务验收才写需求上的正式口径字段；预验收结论留在验收单里，
        // 否则一次预验与一次正式验会互相覆盖，满意度与按时率口径就分不清
        if (postRelease) {
            req.setAcceptanceResult(dto.getResult());
            req.setAcceptanceScore(dto.getScore());
            req.setAcceptanceTime(acceptance.getAcceptTime());
        }

        // 上线前不通过：退回研发并计返工（同时作废在途放行单）
        if (failed && !postRelease) {
            RdmTransitionDTO trans = new RdmTransitionDTO();
            trans.setRemark(dto.getIssues());
            requirementMapper.updateById(req);
            // 这里必须传当前人的真实角色：以前写死 ROLE_ACCEPTOR 等于自己给自己发通行证，
            // 角色守卫在这里形同失效（验收人身份已由方法入口的 requireAcceptor 裁决）
            transitionInternal(req, RdmConstants.ACTION_UAT_FAIL, trans, current,
                    accessGuard.activeRoles(req.getId(), current));
            return;
        }

        // 上线后业务验收不通过：上线是既成事实，不能靠“退回研发”抹掉，
        // 只能强制转后续需求，让遗留问题进入承接队列而不是口头约定
        if (failed) {
            if (!Boolean.TRUE.equals(dto.getCreateFollowUp())) {
                throw new BusinessException("已上線需求驗收不通過，必須勾選「轉為後續需求」，讓遺留問題有人承接");
            }
            RdmRequirement followUp = createFollowUpRequirement(req, acceptance, dto, current);
            if (followUp != null) {
                acceptance.setFollowUpReqId(followUp.getId());
                acceptance.setFollowUpReqNo(followUp.getReqNo());
                acceptanceMapper.updateById(acceptance);
            }
            requirementMapper.updateById(req);
            notifyPostReleaseFailure(req, acceptance, current);
            return;
        }

        // 有条件通过：遗留事项自动转出一条后续需求（业主决策），避免“口头答应下次改”
        if (conditional && Boolean.TRUE.equals(dto.getCreateFollowUp())) {
            RdmRequirement followUp = createFollowUpRequirement(req, acceptance, dto, current);
            if (followUp != null) {
                acceptance.setFollowUpReqId(followUp.getId());
                acceptance.setFollowUpReqNo(followUp.getReqNo());
                acceptanceMapper.updateById(acceptance);
            }
        }
        requirementMapper.updateById(req);
        notifyAcceptanceResult(req, acceptance, current);
    }

    /** 上线后业务验收不通过的通知：不能发“请执行上线交付”这种与事实相反的话术 */
    private void notifyPostReleaseFailure(RdmRequirement req, RdmAcceptance acceptance, SysUser current) {
        Set<Long> receivers = new LinkedHashSet<>();
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null) {
            receivers.add(req.getDevOwnerUserId());
        }
        if (receivers.isEmpty()) {
            return;
        }
        String text = "### ⚠️ 上線後業務驗收不通過\n\n- **編號**: " + req.getReqNo()
                + "\n- **標題**: " + req.getTitle()
                + "\n- **第幾次業務驗收**: " + value(acceptance.getAttempt())
                + "\n- **評分**: " + (acceptance.getScore() == null ? "-" : acceptance.getScore() + " / 5")
                + "\n- **問題**: " + (StringUtils.hasText(acceptance.getIssues()) ? acceptance.getIssues() : "-")
                + (StringUtils.hasText(acceptance.getFollowUpReqNo())
                        ? "\n- **已轉後續需求**: " + acceptance.getFollowUpReqNo() : "")
                + "\n\n需求已上線，不退回開發狀態；請在新需求里承接遗留问题。";
        notifyService.notifyUserIds(RdmConstants.EVENT_ACCEPT_TODO, req, new ArrayList<>(receivers),
                "上線後驗收不通過：" + req.getReqNo(), text);
    }

    /**
     * 根据当前状态推导验收阶段。
     * <p>不接受客户端传 stage：否则可以把上线前的预验结果写成正式业务验收。
     */
    private static String resolveAcceptanceStage(String status) {
        if (RdmConstants.STATUS_UAT_PENDING.equals(status) || RdmConstants.STATUS_TEST_PASSED.equals(status)) {
            return RdmConstants.ACCEPT_STAGE_PRE;
        }
        if (RdmConstants.STATUS_RELEASED.equals(status) || RdmConstants.STATUS_VERIFIED.equals(status)) {
            return RdmConstants.ACCEPT_STAGE_POST;
        }
        throw new BusinessException("当前階段還不能提交驗收結論（上線前預驗收在「待業務驗收」，上線後業務驗收在「已上線/已驗證」）");
    }

    /** 同一阶段的下一个轮次号（取最大+1，逻辑删除的旧行照样占号，不会重现重号） */
    private int nextAcceptanceAttempt(Long reqId, String stage) {
        List<RdmAcceptance> history = acceptanceMapper.selectList(new LambdaQueryWrapper<RdmAcceptance>()
                .eq(RdmAcceptance::getReqId, reqId)
                .eq(RdmAcceptance::getStage, stage)
                .orderByDesc(RdmAcceptance::getAttempt)
                .last("LIMIT 1"));
        return history.isEmpty() || history.get(0).getAttempt() == null
                ? 1 : history.get(0).getAttempt() + 1;
    }

    /** 单条用例最多几张证据：不限制会让一条用例被塞几十张图，把验收明细表写成 GB 级 */
    private static final int MAX_CASE_EVIDENCES = 6;
    /** 单张 dataUrl 字符上限：与上传接口 5MB 原图同口径（Base64 约 1.37 倍）加余量 */
    private static final int MAX_EVIDENCE_DATA_URL_CHARS = 7 * 1024 * 1024;

    /**
     * 证据附件入库前的服务端约束。
     * <p>不信任前端传的条数与体积（前端校验只是 UX，不是安全边界）：超限直接拒绝并说明原因，
     * 不做静默截断——默默丢掉证据会让验收人以为已经存上，比报错危险得多。
     */
    private static String toEvidenceJson(List<RdmAcceptanceDTO.Evidence> evidences) {
        if (evidences == null || evidences.isEmpty()) {
            return null;
        }
        if (evidences.size() > MAX_CASE_EVIDENCES) {
            throw new BusinessException("單條驗收用例最多附 " + MAX_CASE_EVIDENCES + " 張證據，請精簡後再提交");
        }
        List<RdmAcceptanceDTO.Evidence> cleaned = new ArrayList<>();
        for (RdmAcceptanceDTO.Evidence e : evidences) {
            if (e == null || !StringUtils.hasText(e.getDataUrl())) {
                // 没正文的条目存进去也取不出图，丢弃不报错：它不构成任何丢失的事实证据
                continue;
            }
            if (e.getDataUrl().length() > MAX_EVIDENCE_DATA_URL_CHARS) {
                throw new BusinessException("單張證據圖片過大（上限 5MB），請壓縮後重新上傳");
            }
            RdmAcceptanceDTO.Evidence safe = new RdmAcceptanceDTO.Evidence();
            safe.setName(trimToMaxLength(e.getName(), 200));
            safe.setType(trimToMaxLength(e.getType(), 100));
            safe.setSize(e.getSize() != null && e.getSize() >= 0 ? e.getSize() : null);
            safe.setDataUrl(e.getDataUrl());
            cleaned.add(safe);
        }
        return cleaned.isEmpty() ? null : JsonUtils.toJson(cleaned);
    }

    /** 元信息字段限长截断（不是正文）：超长文件名只影响展示，不值得为此拒收一次验收 */
    private static String trimToMaxLength(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    /** 落验收用例明细（数量与结论已在提交前校验） */
    private void saveAcceptanceCases(RdmAcceptance acceptance, RdmRequirement req,
                                     List<RdmAcceptanceDTO.AcceptanceCaseDTO> cases, SysUser current) {
        int seq = 1;
        for (RdmAcceptanceDTO.AcceptanceCaseDTO c : cases) {
            RdmAcceptanceCase entity = new RdmAcceptanceCase();
            entity.setAcceptanceId(acceptance.getId());
            entity.setReqId(req.getId());
            entity.setSeq(seq++);
            entity.setTitle(c.getTitle().trim());
            entity.setExpectResult(c.getExpect());
            entity.setActualResult(c.getActual());
            entity.setResult(c.getResult());
            entity.setSeverity(c.getSeverity());
            entity.setRemark(c.getRemark());
            entity.setEvidenceJson(toEvidenceJson(c.getEvidences()));
            entity.setCreatedBy(operatorResolver.operatorSignature(current));
            entity.setUpdatedBy(entity.getCreatedBy());
            acceptanceCaseMapper.insert(entity);
        }
    }

    /**
     * 验收遗留事项自动转后续需求。
     * <p>口径：遗留问题不再走业务准入审批（它从已审批通过的需求衍生，且需求池本身就是产品承接位），
     * 直接指派给原产品经理进「已分配·待受理」，并用 parentReqId 留下溯源链。
     * 原需求没有产品经理时进需求池，等技术负责人分配。
     */
    private RdmRequirement createFollowUpRequirement(RdmRequirement parent, RdmAcceptance acceptance,
                                                     RdmAcceptanceDTO dto, SysUser current) {
        if (parent.getAssigneePmUserId() == null && parent.getSubmitterUserId() == null) {
            log.warn("後續需求建立失敗：原需求 {} 既無產品經理也無提出人，遺留事項僅留在验收单 {}", parent.getReqNo(), acceptance.getAcceptNo());
            return null;
        }
        String title = StringUtils.hasText(dto.getFollowUpTitle())
                ? dto.getFollowUpTitle().trim()
                : "【驗收遺留】" + parent.getTitle();

        RdmRequirement followUp = new RdmRequirement();
        // 延迟发号 v2：验收遗留后续需求不再立即生成编号，编号推迟到产品经理认领（claim）时生成。
        followUp.setTitle(title.length() > RdmConstants.TITLE_MAX_LENGTH ? title.substring(0, RdmConstants.TITLE_MAX_LENGTH) : title);
        followUp.setReqType(parent.getReqType());
        // 遗留事项默认 P2：不得因为“原需求很急”就把补丁排到原需求前面
        followUp.setPriority("P2");
        followUp.setComplexity("simple");
        followUp.setDescription("由需求 " + parent.getReqNo() + "（" + parent.getTitle() + "）有條件通過時的遺留事項轉出。\n"
                + "验收单：" + acceptance.getAcceptNo() + "\n遗留问题：" + acceptance.getIssues());
        followUp.setExpectResult(acceptance.getIssues());
        followUp.setSubmitterUserId(current == null ? parent.getSubmitterUserId() : current.getId());
        followUp.setSubmitterEmpNo(current == null ? parent.getSubmitterEmpNo() : current.getEmpId());
        followUp.setSubmitterName(current == null ? parent.getSubmitterName() : current.getName());
        followUp.setSubmitDeptId(current == null || current.getDepartmentId() == null
                ? parent.getSubmitDeptId() : current.getDepartmentId());
        followUp.setSubmitDeptName(current == null || current.getDepartmentId() == null
                ? parent.getSubmitDeptName() : resolveDeptName(current.getDepartmentId()));
        followUp.setSourceChannel(parent.getSourceChannel());
        followUp.setParentReqId(parent.getId());
        followUp.setParentReqNo(parent.getReqNo());
        // 归属体系改造：衍生需求继承父需求的项目（统计不断链）；迭代不继承——
        // 遗留事项放哪个版本由排期时决定（父需求多已上线，其迭代已关闭）
        followUp.setProjectId(parent.getProjectId());
        followUp.setProgress(0);
        followUp.setBlockedFlag(0);
        followUp.setOverdueFlag(0);
        followUp.setRejectCount(0);
        followUp.setReopenCount(0);
        followUp.setReworkCount(0);
        followUp.setChangeCount(0);
        followUp.setNeedApproval(0);
        followUp.setCreatedBy(operatorResolver.operatorSignature(current));
        followUp.setUpdatedBy(followUp.getCreatedBy());

        SysUser pm = parent.getAssigneePmUserId() == null ? null : userMapper.selectById(parent.getAssigneePmUserId());
        // 验收人作为后续需求的验收人，保证遗留问题还是同一个人闭环
        followUp.setAcceptorUserId(acceptance.getAcceptorUserId() == null
                ? (current == null ? parent.getSubmitterUserId() : current.getId())
                : acceptance.getAcceptorUserId());
        followUp.setAcceptorName(acceptance.getAcceptorName());
        if (pm != null) {
            followUp.setStatus(RdmConstants.STATUS_ASSIGNED);
            followUp.setSubmitTime(LocalDateTime.now());
            applyPm(followUp, pm, parent.getDispatcherUserId() == null ? null
                    : userMapper.selectById(parent.getDispatcherUserId()));
        } else {
            followUp.setStatus(RdmConstants.STATUS_POOL);
            followUp.setSubmitTime(LocalDateTime.now());
        }
        followUp.setStatusEnterTime(LocalDateTime.now());
        followUp.setCurrentHandlerName(computeHandler(followUp, pm));
        requirementMapper.insert(followUp);
        upsertRole(followUp.getId(), current == null ? null : current, RdmConstants.ROLE_ACCEPTOR);
        if (pm != null) {
            upsertRole(followUp.getId(), pm, RdmConstants.ROLE_PM);
        }
        appendStatusLog(followUp, null, current, RdmConstants.ACTION_SUBMIT,
                "由 " + parent.getReqNo() + " 驗收遺留事項轉入");
        log.info("驗收遺留事項已轉後續需求: parent={}, followUp={}, pm={}",
                parent.getReqNo(), followUp.getReqNo(), followUp.getAssigneePmName());
        if (pm != null) {
            notifyService.notifyUsers(RdmConstants.EVENT_ASSIGNED, followUp, List.of(pm),
                    "驗收遺留事項已轉給你", "### 📌 驗收遺留事項\n\n- **編號**: " + followUp.getReqNo()
                            + "\n- **來源需求**: " + parent.getReqNo() + ", " + parent.getTitle()
                            + "\n- **標題**: " + followUp.getTitle()
                            + "\n- **遺留問題**: " + acceptance.getIssues()
                            + "\n\n原需求已「有條件通過」上线，请排期跟进遗留问题，避免长期挂账。");
        }
        return followUp;
    }

    /**
     * 验收通过/有条件通过后的通知。
     * <p>这两种结论不会推进状态（等 PM 确认上线），不通知就没人知道“可以上线了”。
     */
    private void notifyAcceptanceResult(RdmRequirement req, RdmAcceptance acceptance, SysUser current) {
        Set<Long> receivers = new LinkedHashSet<>();
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getSubmitterUserId() != null) {
            receivers.add(req.getSubmitterUserId());
        }
        if (receivers.isEmpty()) {
            return;
        }
        boolean conditional = RdmConstants.ACCEPT_CONDITIONAL.equals(acceptance.getResult());
        String text = "### ✅ 業務驗收已結論\n\n- **編號**: " + req.getReqNo()
                + "\n- **標題**: " + req.getTitle()
                + "\n- **驗收結論**: " + (conditional ? "有條件通過" : "驗收通過")
                + "\n- **第幾次驗收**: " + acceptance.getAttempt()
                + "\n- **用例**: " + value(acceptance.getCasePass()) + "/" + value(acceptance.getCaseTotal())
                + " 通過，缺陷 " + value(acceptance.getDefectCount()) + " 個"
                + (StringUtils.hasText(acceptance.getIssues()) ? "\n- **遺留事項**: " + acceptance.getIssues() : "")
                + (StringUtils.hasText(acceptance.getFollowUpReqNo())
                        ? "\n- **已轉後續需求**: " + acceptance.getFollowUpReqNo() : "")
                + "\n\n請產品經理確認後執行「上線交付」。";
        notifyService.notifyUserIds(conditional
                        ? RdmConstants.EVENT_ACCEPT_TODO : RdmConstants.EVENT_ACCEPT_DONE,
                req, receivers, "業務驗收結論：" + req.getReqNo(), text);
    }

    @Override
    public List<RdmAcceptanceVO> acceptanceHistory(Long id) {
        // 验收历史含缺陷与意见，必须与详情同口径收敛：只按菜单权放行会让人凭 id 读到别部门的结论
        requireVisible(requireRequirement(id), operatorResolver.currentUser(), "查看驗收歷史");
        List<RdmAcceptance> records = acceptanceMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptance>()
                        .eq(RdmAcceptance::getReqId, id)
                        .orderByAsc(RdmAcceptance::getAcceptTime)
                        .orderByAsc(RdmAcceptance::getId));
        if (records.isEmpty()) {
            return List.of();
        }
        List<RdmAcceptanceCase> allCases = acceptanceCaseMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceCase>()
                        .eq(RdmAcceptanceCase::getReqId, id)
                        .orderByAsc(RdmAcceptanceCase::getSeq));
        Map<Long, List<RdmAcceptanceCase>> grouped = new LinkedHashMap<>();
        for (RdmAcceptanceCase c : allCases) {
            grouped.computeIfAbsent(c.getAcceptanceId(), k -> new ArrayList<>()).add(c);
        }
        List<RdmAcceptanceVO> list = new ArrayList<>();
        for (RdmAcceptance a : records) {
            RdmAcceptanceVO vo = RdmAcceptanceVO.from(a);
            for (RdmAcceptanceCase c : grouped.getOrDefault(a.getId(), List.of())) {
                vo.getCases().add(RdmAcceptanceVO.caseFrom(c));
            }
            list.add(vo);
        }
        return list;
    }

    @Override
    public RdmAcceptanceVO.EvidenceContent caseEvidence(Long reqId, Long caseId, int index) {
        // 取证据与看验收历史同口径：必须能看见这个需求，且用例确实挂在它下面，
        // 不能让人凭一个自增 caseId 就越权取到别部门的验收截图。
        requireVisible(requireRequirement(reqId), operatorResolver.currentUser(), "查看驗收證據");
        RdmAcceptanceCase c = acceptanceCaseMapper.selectById(caseId);
        if (c == null || !Objects.equals(c.getReqId(), reqId)) {
            throw new BusinessException("驗收證據不存在");
        }
        List<RdmAcceptanceDTO.Evidence> evidences = RdmAcceptanceVO.parseEvidences(c.getEvidenceJson());
        if (index < 0 || index >= evidences.size()) {
            throw new BusinessException("該序號的驗收證據不存在");
        }
        RdmAcceptanceDTO.Evidence e = evidences.get(index);
        RdmAcceptanceVO.EvidenceContent content = new RdmAcceptanceVO.EvidenceContent();
        content.setName(e.getName());
        content.setType(e.getType());
        content.setDataUrl(e.getDataUrl());
        return content;
    }

    /* ==================== 工作台与选项 ==================== */

    @Override
    public RdmWorkbenchVO workbench() {
        SysUser current = operatorResolver.currentUser();
        boolean unrestricted = canSeeAll(current);
        Long userId = current == null ? null : current.getId();
        Map<String, String> stageOf = configService.stageMap();

        RdmWorkbenchVO vo = new RdmWorkbenchVO();
        RdmWorkbenchVO.Identity identity = new RdmWorkbenchVO.Identity();
        identity.setName(current == null ? "-" : current.getName());
        identity.setEmpNo(current == null ? null : current.getEmpId());
        identity.setDeptName(resolveDeptName(current == null ? null : current.getDepartmentId()));
        identity.setRoleNames(describeRoles(current, unrestricted));
        vo.setIdentity(identity);

        List<RdmWorkbenchVO.TodoGroup> groups = new ArrayList<>();
        // 待办计数一律取与清单 Tab 相同的口径（countByScope / approvingRequirementIds），
        // 展示用的 list 只取前 20 条；两套算法各算各的就会让工作台与列表的数字对不上。
        Long scopeUserId = unrestricted ? null : userId;
        List<Long> approvingIds = approvingRequirementIds(current);
        if (!approvingIds.isEmpty()) {
            groups.add(new RdmWorkbenchVO.TodoGroup("intake", "需求審批（我是審批人）",
                    "審批通過後進入需求池", (long) approvingIds.size(), toVOs(approvingIds, stageOf)));
        }
        if (unrestricted || canDispatch(current)) {
            List<RdmRequirementVO> pool = listByStatus(RdmConstants.STATUS_POOL, stageOf);
            if (!pool.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("pool", "需求池待分配（我是技術負責人）",
                        "分配產品經理後進入受理", countByScope(RdmConstants.SCOPE_POOL, scopeUserId, false), pool));
            }
        }
        if (userId != null) {
            List<RdmRequirementVO> mine = listByColumn(RdmRequirement::getAssigneePmUserId, userId, stageOf);
            if (!mine.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("product", "我負責的產品需求（我是產品經理）",
                        "需盡快給出受理結論與排期", countByScope(RdmConstants.SCOPE_PRODUCT, scopeUserId, false), mine));
            }
            List<RdmRequirementVO> toAccept = listAcceptanceTodo(userId, stageOf);
            if (!toAccept.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("acceptance", "待我驗收（我是業務驗收人）",
                        "驗收通過後才可確認上線", countByScope(RdmConstants.SCOPE_ACCEPTANCE, scopeUserId, false), toAccept));
            }
        }
        vo.setTodos(groups);

        RdmWorkbenchVO.Stats stats = new RdmWorkbenchVO.Stats();
        // 工作台不是执行侧视图：不吃 executionOnly 地板，保持与列表默认口径一致
        stats.setMineTotal(countByScope(RdmConstants.SCOPE_MINE, scopeUserId, false));
        stats.setMineProgress(userId == null ? 0L : requirementMapper.selectCount(
                new LambdaQueryWrapper<RdmRequirement>().eq(RdmRequirement::getSubmitterUserId, userId)
                        .notIn(RdmRequirement::getStatus, List.of(RdmConstants.STATUS_CLOSED,
                                RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED))));
        stats.setTodoTotal((long) groups.stream().mapToInt(g -> g.getTotal().intValue()).sum());
        /*
         * 逾期预警必须与列表共用同一数据范围。
         * <p>原先这里无条件 count(overdue_flag=1)，任何员工打开工作台看到的是全公司逾期总数：
         * 既泄露了跨部门规模，又和自己点进去看到的条数对不上。
         * 走 RdmRequirementQuery.toWrapper 可保证与非管理视角的 relatedOnly 收敛一字不差。
         */
        RdmRequirementQuery overdueQuery = new RdmRequirementQuery();
        overdueQuery.setOverdueOnly(true);
        stats.setOverdueTotal(requirementMapper.selectCount(overdueQuery.toWrapper(scopeUserId)));
        stats.setToAcceptTotal(countByScope(RdmConstants.SCOPE_ACCEPTANCE, scopeUserId, false));
        stats.setDeliveredTotal(userId == null ? 0L : requirementMapper.selectCount(
                new LambdaQueryWrapper<RdmRequirement>().eq(RdmRequirement::getSubmitterUserId, userId)
                        .in(RdmRequirement::getStatus, List.of(RdmConstants.STATUS_RELEASED,
                                RdmConstants.STATUS_VERIFIED, RdmConstants.STATUS_CLOSED))));
        vo.setStats(stats);
        return vo;
    }

    @Override
    public List<RdmOptionVO.ProductManager> productManagers() {
        List<RdmConfigVO.Routing> routings = configService.routingRules();
        Map<Long, RdmOptionVO.ProductManager> byUser = new LinkedHashMap<>();
        for (RdmConfigVO.Routing r : routings) {
            RdmOptionVO.ProductManager pm = byUser.computeIfAbsent(r.getPmUserId(), id -> loadPm(id, r.getPmName()));
            if (pm != null) {
                pm.getDomains().add(r.getScopeName());
                pm.setCapacity(Math.max(value(pm.getCapacity()), value(r.getLoadCapacity())));
                pm.setActiveCount(configService.countActiveByPm(pm.getUserId()));
            }
        }
        // 分发矩阵之外，「需求清单」持 edit（受理/PRD/评审）的员工也是可选受理人（避免矩阵未配时无候选人）。
        // 故意不用 view：菜单收敛后 view 是全员都有的宽权限，拿它筛候选人会把所有人扫进 PM 下拉。
        userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getDeleted, 0).last("LIMIT 200"))
                .stream()
                .filter(u -> u.getId() != null && !byUser.containsKey(u.getId()))
                .filter(u -> permissionService.hasPermission(u, RdmConstants.MENU_REQUIREMENT, "edit"))
                .limit(30)
                .forEach(u -> byUser.put(u.getId(), toPm(u)));
        return new ArrayList<>(byUser.values());
    }

    /**
     * 技术负责人候选：在职、启用且具备需求分配权的员工。
     * <p>只返回能真正推进需求的人：选了无分配权的人，需求会永久卡在需求池。
     * 用户量有限（几百人）,逐人鉴权与本类其他候选接口口径一致；超过上限时按 id 截断，
     * 前端仍可搜索，不把全公司扫进下拉。
     */
    @Override
    public List<RdmOptionVO.Employee> techLeads() {
        List<RdmOptionVO.Employee> list = new ArrayList<>();
        userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getDeleted, 0)
                        .orderByAsc(SysUser::getId)
                        .last("LIMIT 300"))
                .stream()
                .filter(u -> u.getId() != null)
                .filter(u -> u.getStatus() == null || u.getStatus() != 0)
                .filter(accessGuard::canDispatch)
                .forEach(u -> {
                    RdmOptionVO.Employee e = new RdmOptionVO.Employee();
                    e.setUserId(u.getId());
                    e.setEmpNo(u.getEmpId());
                    e.setName(u.getName());
                    e.setDeptName(resolveDeptName(u.getDepartmentId()));
                    list.add(e);
                });
        return list;
    }

    /**
     * 需求可针对的菜单候选：系统 → 可导航页面（两级，前端 Cascader 也只渲染两级）。
     * <p>选取标准是「能不能真的导航到这个页面」（path 非空且启用），而不是按菜单层级硬编码。
     * <p>原实现遇到 {@code parent_id IS NULL} 就 continue，而 RDM 菜单拍平后
     * 需求工作台/需求清單/需求池·分配/需求驗收 这些主入口全都是一级菜单且自带 path，
     * 导致用户提需求时根本选不到它们（而拍平后的分组节点无 path，它们的二级子菜单反而会被当成顶级展示）。
     * <p>按 path 筛还能自然避免把“不可点的分组容器”当成需求目标。
     */
    @Override
    public List<RdmOptionVO.MenuNode> menuTree() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT m.menu_key, m.name, m.system_code, s.name AS system_name "
                        + "FROM sys_menu m LEFT JOIN sys_system s ON s.code = m.system_code AND s.deleted = 0 "
                        + "WHERE m.deleted = 0 AND m.status = 1 AND m.path IS NOT NULL AND m.path != '' "
                        + "ORDER BY m.system_code, m.sort_order, m.id");
        Map<String, RdmOptionVO.MenuNode> systems = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String systemCode = (String) row.get("system_code");
            String menuKey = (String) row.get("menu_key");
            if (!StringUtils.hasText(systemCode) || !StringUtils.hasText(menuKey)) {
                continue;
            }
            // 系统名缺失时用 code 兜底：否则前端会渲染出一个空白可选系统（实测曾出现 code=portal 空节点）
            String systemName = (String) row.get("system_name");
            RdmOptionVO.MenuNode sys = systems.computeIfAbsent(systemCode,
                    code -> new RdmOptionVO.MenuNode(code, StringUtils.hasText(systemName) ? systemName : code, new ArrayList<>()));
            String menuName = (String) row.get("name");
            sys.getChildren().add(new RdmOptionVO.MenuNode(menuKey,
                    StringUtils.hasText(menuName) ? menuName : menuKey, new ArrayList<>()));
        }
        return new ArrayList<>(systems.values());
    }

    /**
     * 菜单下的功能点候选。
     * <p>真值源是 sys_menu.actions（该菜单声明的功能操作：查看/新增/編輯/刪除/導入/導出…），
     * 选完系统菜单即可直接选对应功能；再并入历史需求提过的定位对象名称（去重），
     * 让常用锚点沉淀为候选。action key 原样返回，展示标签由前端 ACTION_LABEL_MAP 映射。
     */
    @Override
    public List<RdmOptionVO.FunctionPoint> functionPoints(String menuKey) {
        if (!StringUtils.hasText(menuKey)) {
            return List.of();
        }
        List<RdmOptionVO.FunctionPoint> points = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        String menuActionsJson = jdbcTemplate.queryForList(
                        "SELECT actions FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                        String.class, menuKey).stream().findFirst().orElse(null);
        for (String action : JsonUtils.parseStringList(menuActionsJson)) {
            if (StringUtils.hasText(action) && seen.add(action)) {
                points.add(new RdmOptionVO.FunctionPoint(action, action));
            }
        }
        // 历史需求：同一菜单被提过的定位对象即候选，避免维护一份静态清单
        List<String> names = jdbcTemplate.queryForList(
                "SELECT DISTINCT anchor_name FROM rdm_requirement_target "
                        + "WHERE deleted = 0 AND menu_key = ? AND anchor_name IS NOT NULL AND anchor_name <> '' "
                        + "ORDER BY anchor_name LIMIT 50",
                String.class, menuKey);
        for (String name : names) {
            if (seen.add(name)) {
                points.add(new RdmOptionVO.FunctionPoint(name, name));
            }
        }
        return points;
    }

    /* ==================== 内部辅助 ==================== */

    private void validateCreate(RdmRequirementCreateDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("請填寫需求標題");
        }
        if (dto.getTitle().length() > RdmConstants.TITLE_MAX_LENGTH) {
            throw new BusinessException("需求標題最長 " + RdmConstants.TITLE_MAX_LENGTH + " 字");
        }
        if (!StringUtils.hasText(dto.getReqType())) {
            throw new BusinessException("請選擇需求類型");
        }
        if (!StringUtils.hasText(dto.getDescription())) {
            throw new BusinessException("請描述現狀與痛點");
        }
    }

    private RdmRequirement requireRequirement(Long id) {
        RdmRequirement req = id == null ? null : requirementMapper.selectById(id);
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        return req;
    }

    /** 仅提出人（或超管）可修改/撤回自己的需求 */
    private void requireOwner(RdmRequirement req, SysUser current, String action) {
        if (operatorResolver.isAdmin(current)) {
            return;
        }
        if (current == null || !current.getId().equals(req.getSubmitterUserId())) {
            throw new BusinessException("只有需求提出人可以" + action);
        }
    }

    /**
     * 是否能看到全部需求（不被「与自己相关」收敛）。
     * <p>口径就一条：有没有分配侧的授权（需求池的 view，含持有 edit 的人）。
     * 全量可见与分配权同属一个窄权限菜单，因为看不到单子就分不出去。
     * <p>不再把 rdm-requirement 的 export / delete 当全量凭证：那等于“能导出 Excel 就能浏览
     * 全公司需求”，而这个菜单是人人可看的宽权限。实查开发库除 admin 外无人持有它们的
     * export/delete，所以移除这两条不会让任何人丢掉既有可见范围。
     */
    private boolean canSeeAll(SysUser current) {
        return accessGuard.canSeeAll(current);
    }

    /**
     * 单条需求的可见性守卫（防水平越权）。
     * <p>口径已在 {@link RdmAccessGuard} 集中，本方法只是保留需求服务侧的既有入口（含单测）。
     * <p>包内可见以便单测直接验证判定口径。
     */
    void requireVisible(RdmRequirement req, SysUser current, String action) {
        accessGuard.requireVisible(req, current, action);
    }

    /** 业务验收人守卫：只有指定的验收人（缺省即提出人）能出验收结论 */
    private void requireAcceptor(RdmRequirement req, SysUser current) {
        accessGuard.requireAcceptor(req, current, "提交驗收結論");
    }

    /** 登录人与该需求是否直接相关（提出/负责/研发/验收/分配/参与） */
    private boolean isRelated(RdmRequirement req, SysUser current) {
        return accessGuard.isRelated(req, current);
    }

    /** 是否可分发需求（技术负责人） */
    private boolean canDispatch(SysUser current) {
        return accessGuard.canDispatch(current);
    }

    private List<String> describeRoles(SysUser current, boolean unrestricted) {
        List<String> roles = new ArrayList<>();
        roles.add("需求提出人");
        if (unrestricted) {
            roles.add("項目經理/超管");
        }
        if (current != null && permissionService.hasPermission(current, MENU_DISPATCHER, "edit")) {
            roles.add("技術負責人");
        }
        if (current != null && permissionService.hasPermission(current, RdmConstants.MENU_REQUIREMENT, "edit")) {
            roles.add("產品經理");
        }
        if (current != null && permissionService.hasPermission(current, RdmConstants.MENU_ACCEPTANCE, "create")) {
            roles.add("業務驗收人");
        }
        return roles;
    }

    private void applyPm(RdmRequirement req, SysUser pm, SysUser dispatcher) {
        req.setAssigneePmUserId(pm.getId());
        req.setAssigneePmEmpNo(pm.getEmpId());
        req.setAssigneePmName(pm.getName());
        req.setDistributeTime(LocalDateTime.now());
        if (dispatcher != null) {
            req.setDispatcherUserId(dispatcher.getId());
            req.setDispatcherName(dispatcher.getName());
        }
    }

    private String computeHandler(RdmRequirement req, SysUser pmHint) {
        return switch (req.getStatus() == null ? "" : req.getStatus()) {
            case RdmConstants.STATUS_DRAFT -> personLabel(req.getSubmitterName(), req.getSubmitterEmpNo());
            case RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_INTAKE_REJECTED -> "審批人";
            /*
             * 需求池阶段还没有受理人，處理人只可能是「提出人指定/系统分派的技术负责人」。
             * 此前写死「技術負責人」只是角色名，用户无法知道该找谁；现在展示具体人（姓名+工号），
             * 未指定时明确写成「待指派」，而不是用一个看似有人的角色名。
             */
            case RdmConstants.STATUS_POOL -> StringUtils.hasText(req.getDispatcherName())
                    ? personLabel(req.getDispatcherName(), empNoOf(req.getDispatcherUserId()))
                    : "技術部（待指派）";
            case RdmConstants.STATUS_UAT_PENDING, RdmConstants.STATUS_VERIFIED ->
                    personLabel(req.getAcceptorName(), empNoOf(req.getAcceptorUserId()));
            case RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_CLOSED ->
                    personLabel(req.getAssigneePmName(), req.getAssigneePmEmpNo());
            default -> {
                if (StringUtils.hasText(req.getAssigneePmName())) {
                    yield personLabel(req.getAssigneePmName(), req.getAssigneePmEmpNo());
                }
                yield pmHint == null ? "待分配" : personLabel(pmHint.getName(), pmHint.getEmpId());
            }
        };
    }

    /** 「姓名（工号）」是列表/详情/催办共用的处理人展示口径；无工号时只给姓名，不留空括号 */
    private String personLabel(String name, String empNo) {
        if (!StringUtils.hasText(name)) {
            return null;
        }
        return StringUtils.hasText(empNo) ? name + "（" + empNo + "）" : name;
    }

    /** 处理人快照没存工号时按用户 id 反查一次（只在写侧调用，不在列表循环里逐行查） */
    private String empNoOf(Long userId) {
        if (userId == null) {
            return null;
        }
        SysUser user = userMapper.selectById(userId);
        return user == null ? null : user.getEmpId();
    }

    private String labelOf(String status) {
        return configService.statusLabelMap().getOrDefault(status, status);
    }

    private boolean isSubmitter(RdmRequirement req, SysUser current) {
        return current != null && current.getId().equals(req.getSubmitterUserId());
    }

    private boolean isDevSide(List<RdmRequirementRole> roles, SysUser current) {
        if (current == null) {
            return false;
        }
        return roles.stream().anyMatch(r -> current.getId().equals(r.getUserId())
                && List.of(RdmConstants.ROLE_PM, RdmConstants.ROLE_DEV, RdmConstants.ROLE_DEV_LEAD,
                RdmConstants.ROLE_QA, RdmConstants.ROLE_DESIGNER, RdmConstants.ROLE_PMO).contains(r.getRoleCode()));
    }

    /**
     * 详情页展示的「我的角色」：取有效角色集合的首项。
     * <p>权限判定一律用集合（activeRoles），不看这个单值：以前用 findFirst 的单角色做守卫，
     * 提出人兼验收人（或兼产品经理）时会按写入顺序被当成 SUBMITTER，
     * 导致只允许 ACCEPTOR 的交付确认动作误拒真验收人。
     */
    private String resolveMyRole(RdmRequirement req, SysUser current) {
        return accessGuard.activeRoles(req == null ? null : req.getId(), current)
                .stream().findFirst().orElse(null);
    }

    /**
     * 角色守卫：超管放行；否则要求登录人在该需求上的任一有效角色出现在允许列表里。
     * <p>fail-closed：未拿到当前用户或规则未配角色时一律拒，避免“谁拿到入口都能推”。
     * <p>包内可见以便 {@code RdmTransitionGuardTest} 直接验证判定口径。
     */
    boolean canPerform(RdmConfigVO.Transition rule, SysUser current, Set<String> myRoles) {
        if (operatorResolver.isAdmin(current)) {
            return true;
        }
        if (current == null) {
            return false;
        }
        List<String> allowed = rule.getAllowedRoles();
        if (allowed == null || allowed.isEmpty()) {
            return false;
        }
        if (myRoles != null && myRoles.stream().anyMatch(allowed::contains)) {
            return true;
        }
        // 分配类动作按菜单授权兜底：持有需求池编辑权即视为技术负责人
        return allowed.contains(RdmConstants.ROLE_DISPATCHER) && canDispatch(current);
    }

    /** 必填字段校验（与 rdm_transition.required_fields 同源）；包内可见供单测验证口径 */
    void applyRequiredGuard(RdmConfigVO.Transition rule, RdmTransitionDTO dto) {
        for (String field : rule.getRequiredFields()) {
            String value = switch (field) {
                case "remark" -> dto == null ? null : dto.getRemark();
                case "planDate" -> dto == null ? null : dto.getPlanDate();
                case "promisedDate" -> dto == null ? null : dto.getPromisedDate();
                case "holdUntil" -> dto == null ? null : dto.getHoldUntil();
                case "versionNo" -> dto == null ? null : dto.getVersionNo();
                case "score" -> dto == null || dto.getScore() == null ? null : String.valueOf(dto.getScore());
                case "pm" -> dto == null || dto.getPmUserId() == null ? null : String.valueOf(dto.getPmUserId());
                case "blockReason" -> dto == null ? null : dto.getBlockReason();
                default -> null;
            };
            if (!StringUtils.hasText(value)) {
                throw new BusinessException("執行「" + rule.getActionName() + "」需要填寫「" + fieldLabel(field) + "」");
            }
        }
    }

    private static String fieldLabel(String field) {
        return switch (field) {
            case "remark" -> "說明/理由";
            case "planDate" -> "計劃上線日期";
            case "promisedDate" -> "承諾出 PRD 日期";
            case "holdUntil" -> "復審日期";
            case "versionNo" -> "上線版本";
            case "score" -> "交付滿意度";
            case "pm" -> "產品經理";
            case "blockReason" -> "阻塞原因";
            default -> field;
        };
    }

    /* ── 落库辅助 ── */

    private void saveTargets(Long reqId, List<RdmRequirementCreateDTO.Target> targets) {
        if (targets == null || targets.isEmpty()) {
            return;
        }
        int sort = 0;
        for (RdmRequirementCreateDTO.Target t : targets) {
            if (t == null) {
                continue;
            }
            RdmRequirementTarget entity = new RdmRequirementTarget();
            entity.setReqId(reqId);
            entity.setAnchorType(StringUtils.hasText(t.getAnchorType()) ? t.getAnchorType() : "NONE");
            entity.setSystemCode(t.getSystemCode());
            entity.setSystemName(systemName(t.getSystemCode()));
            entity.setMenuKey(t.getMenuKey());
            entity.setMenuName(menuName(t.getMenuKey()));
            entity.setPagePath(t.getPagePath());
            entity.setAnchorName(t.getAnchorName());
            entity.setAnchorDesc(t.getAnchorDesc());
            entity.setScreenshotPath(t.getScreenshotUrl());
            entity.setSortOrder(sort++);
            targetMapper.insert(entity);
        }
    }

    private void saveAttachments(Long reqId, List<RdmRequirementCreateDTO.Attachment> files, SysUser current) {
        if (files == null || files.isEmpty()) {
            return;
        }
        for (RdmRequirementCreateDTO.Attachment f : files) {
            if (f == null || !StringUtils.hasText(f.getFileName())) {
                continue;
            }
            RdmAttachment a = new RdmAttachment();
            a.setReqId(reqId);
            a.setBizType("REQ");
            a.setFileName(f.getFileName());
            a.setStoragePath(f.getStoragePath());
            a.setFileType(f.getFileType());
            a.setFileSize(f.getFileSize());
            a.setUploaderUserId(current == null ? null : current.getId());
            a.setUploaderName(current == null ? null : current.getName());
            a.setCreatedBy(operatorResolver.operatorSignature(current));
            a.setUpdatedBy(a.getCreatedBy());
            attachmentMapper.insert(a);
        }
    }

    private void saveInitialRoles(RdmRequirement req, SysUser submitter, SysUser pm, SysUser acceptor, List<Long> ccUserIds) {
        upsertRole(req.getId(), submitter, RdmConstants.ROLE_SUBMITTER);
        upsertRole(req.getId(), acceptor, RdmConstants.ROLE_ACCEPTOR);
        if (pm != null) {
            upsertRole(req.getId(), pm, RdmConstants.ROLE_PM);
        }
        if (ccUserIds != null) {
            for (Long userId : ccUserIds) {
                upsertRole(req.getId(), userId == null ? null : userMapper.selectById(userId), RdmConstants.ROLE_CC);
            }
        }
    }

    private void upsertRole(Long reqId, SysUser user, String roleCode) {
        upsertRole(reqId, user == null ? null : user.getId(), user == null ? null : user.getEmpId(),
                user == null ? null : user.getName(), roleCode);
    }

    private void upsertRole(Long reqId, Long userId, String empNo, String name, String roleCode) {
        if (reqId == null || userId == null || !StringUtils.hasText(roleCode)) {
            return;
        }
        RdmRequirementRole existing = roleMapper.selectOne(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, reqId)
                .eq(RdmRequirementRole::getUserId, userId)
                .eq(RdmRequirementRole::getRoleCode, roleCode)
                .last("LIMIT 1"));
        if (existing != null) {
            return;
        }
        RdmRequirementRole role = new RdmRequirementRole();
        role.setReqId(reqId);
        role.setUserId(userId);
        role.setEmpNo(empNo);
        role.setEmpName(name);
        role.setRoleCode(roleCode);
        role.setIsActive(1);
        role.setJoinTime(LocalDateTime.now());
        roleMapper.insert(role);
    }

    private List<RdmRequirementRole> listRoles(Long reqId) {
        return roleMapper.selectList(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, reqId)
                .eq(RdmRequirementRole::getIsActive, 1)
                .orderByAsc(RdmRequirementRole::getId));
    }

    /**
     * 动作 → 已完成的关键节点：流转发生时要回写这些节点的实成日。
     * <p>不写就只剩人工计划与基线，偏差与按时率永远算不出来
     * （深度测试实测：需求已上线但五个节点全部仍为 pending）。
     * <p>UI 完成轉開發 同时算“研發啟動”已完成：进入开发中就意味着研发已经开工，
     * 否则状态机里没有独立的 dev_start 动作时这个节点会永远空洞（端到端实测 D4）。
     */
    private static final Map<String, List<String>> ACTION_MILESTONE = Map.of(
            RdmConstants.ACTION_REVIEW_PASS, List.of(com.mftb.admin.entity.RdmMilestone.CODE_PRD_REVIEW),
            RdmConstants.ACTION_DESIGN_DONE, List.of(com.mftb.admin.entity.RdmMilestone.CODE_DESIGN_DONE,
                    com.mftb.admin.entity.RdmMilestone.CODE_DEV_START),
            RdmConstants.ACTION_DEV_START, List.of(com.mftb.admin.entity.RdmMilestone.CODE_DEV_START),
            RdmConstants.ACTION_DEV_DONE, List.of(com.mftb.admin.entity.RdmMilestone.CODE_DEV_DONE),
            RdmConstants.ACTION_RELEASE, List.of(com.mftb.admin.entity.RdmMilestone.CODE_RELEASE));

    /** 节点完成事实回填：已有实成日时不覆盖，重复流转不会改掉历史 */
    private void markMilestoneActual(Long reqId, String actionCode, LocalDateTime at, String signature) {
        List<String> codes = ACTION_MILESTONE.get(actionCode);
        if (codes == null) {
            return;
        }
        for (String code : codes) {
            jdbcTemplate.update(
                    "UPDATE rdm_milestone SET actual_date = ?, status = 'done', "
                            + "forecast_date = COALESCE(forecast_date, ?), updated_by = ? "
                            + "WHERE req_id = ? AND code = ? AND deleted = 0 AND actual_date IS NULL",
                    at.toLocalDate(), at.toLocalDate(), signature, reqId, code);
        }
    }

    /** 记录一条状态流水（与 closeOpenStatusLog 成对调用，前者回填停留时长） */
    private void appendStatusLog(RdmRequirement req, String fromStatus, SysUser actor, String actionCode, String remark) {
        RdmStatusLog log = new RdmStatusLog();
        log.setReqId(req.getId());
        log.setFromStatus(fromStatus);
        log.setToStatus(req.getStatus());
        log.setActionCode(actionCode);
        log.setOperatorUserId(actor == null ? null : actor.getId());
        log.setOperatorName(actor == null ? "system" : actor.getName());
        log.setOperatorRole(resolveMyRole(req, actor));
        log.setRemark(remark);
        log.setEnterTime(req.getStatusEnterTime() == null ? LocalDateTime.now() : req.getStatusEnterTime());
        log.setIsOverdue(0);
        statusLogMapper.insert(log);
    }

    private void closeOpenStatusLog(Long reqId, LocalDateTime now, boolean overdue) {
        List<RdmStatusLog> open = statusLogMapper.selectList(new LambdaQueryWrapper<RdmStatusLog>()
                .eq(RdmStatusLog::getReqId, reqId).isNull(RdmStatusLog::getLeaveTime)
                .orderByDesc(RdmStatusLog::getId).last("LIMIT 1"));
        for (RdmStatusLog log : open) {
            log.setLeaveTime(now);
            log.setDurationSeconds(log.getEnterTime() == null ? 0L : Duration.between(log.getEnterTime(), now).getSeconds());
            log.setIsOverdue(overdue ? 1 : 0);
            statusLogMapper.updateById(log);
        }
    }

    private boolean isOverdue(RdmRequirement req) {
        return req.getOverdueFlag() != null && req.getOverdueFlag() == 1;
    }

    /* ── 准入审批（OA 引擎） ── */

    private void submitIntakeFlow(RdmRequirement req, SysUser current) {
        OaRequestCreateDTO flow = new OaRequestCreateDTO();
        flow.setProcessCode(RdmConstants.INTAKE_PROCESS_CODE);
        flow.setTitle("需求准入：" + req.getTitle());
        Map<String, Object> form = new LinkedHashMap<>();
        // 延迟发号：本轮发起准入单时还没有正式需求编号，快照里保持 null 而不伪造占位串；
        // 编号生成后由关联需求（reqId）读取，不改写历史审批快照。
        form.put("reqNo", req.getReqNo());
        form.put("reqId", req.getId());
        form.put("reqType", req.getReqType());
        form.put("priority", req.getPriority());
        form.put("submitDept", req.getSubmitDeptName());
        form.put("expectDate", req.getExpectDate() == null ? null : req.getExpectDate().toString());
        form.put("description", req.getDescription());
        flow.setFormData(JsonUtils.toJson(form));
        String flowNo = oaRequestService.submit(flow);
        req.setIntakeFlowNo(flowNo);
        requirementMapper.updateById(req);
    }

    private List<RdmRequirementVO.ApprovalNode> approvalNodes(String flowNo) {
        List<RdmRequirementVO.ApprovalNode> nodes = new ArrayList<>();
        try {
            OaRequestVO flow = oaRequestService.detail(flowNo);
            if (flow != null && flow.getApprovalTasks() != null) {
                for (OaRequestVO.OaApprovalTaskVO task : flow.getApprovalTasks()) {
                    RdmRequirementVO.ApprovalNode node = new RdmRequirementVO.ApprovalNode();
                    node.setNodeName(task.getNodeName());
                    node.setApproverName(task.getApprover());
                    node.setStatus(task.getTaskStatus());
                    node.setTime(task.getApproveTime());
                    node.setComment(task.getComment());
                    nodes.add(node);
                }
            }
        } catch (Exception e) {
            // 审批节点是详情的附属信息，读取失败不应让详情页整体不可用
            log.warn("读取准入審批節點失敗: flowNo={}, error={}", flowNo, e.getMessage());
        }
        return nodes;
    }

    /* ── 通知 ── */

    private void notifyOnCreate(RdmRequirement req, SysUser pm) {
        if (RdmConstants.STATUS_DRAFT.equals(req.getStatus())) {
            return;
        }
        if (RdmConstants.STATUS_INTAKE_PENDING.equals(req.getStatus())) {
            // 审批人由 OA 引擎通知，这里补一条需求侧留痕，避免两边口径不一致
            // 延迟发号：待审批行本就没有正式编号，不能把 null 拼进通知，也不能拿 XQSP 单号充数
            notifyService.notifyUsers(RdmConstants.EVENT_INTAKE_TODO, req, List.of(),
                    "需求待審批", "### 📝 需求待審批\n\n- **編號**: " + RdmConstants.displayReqNo(req.getReqNo())
                            + "\n- **標題**: "
                            + req.getTitle() + "\n- **提出人**: " + req.getSubmitterName()
                            + "\n\n准入通過後将自动生成正式需求编号。請在流程事項或審批中心處理。");
            return;
        }
        if (pm != null) {
            notifyService.notifyUsers(RdmConstants.EVENT_ASSIGNED, req, List.of(pm), "新需求已分配給你",
                    "### 📌 新需求待受理\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: " + req.getTitle()
                            + "\n- **提出人**: " + req.getSubmitterName() + "（" + req.getSubmitDeptName() + "）"
                            + "\n- **優先級**: " + req.getPriority() + "\n\n請盡快給出受理結論與排期。");
            return;
        }
        notifyService.notifyUsers(RdmConstants.EVENT_STATUS_CHANGED, req, List.of(),
                "新需求进入需求池", "### 📥 新需求待分配\n\n- **編號**: " + req.getReqNo()
                        + "\n- **標題**: " + req.getTitle() + "\n- **提出人**: " + req.getSubmitterName()
                        + "\n- **優先級**: " + req.getPriority());
    }

    private void notifyOnTransition(RdmRequirement req, RdmConfigVO.Transition rule, SysUser actor) {
        Set<Long> receivers = new LinkedHashSet<>();
        if (req.getSubmitterUserId() != null) {
            receivers.add(req.getSubmitterUserId());
        }
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null) {
            receivers.add(req.getDevOwnerUserId());
        }
        if (RdmConstants.STATUS_UAT_PENDING.equals(req.getStatus()) && req.getAcceptorUserId() != null) {
            receivers.add(req.getAcceptorUserId());
        }
        String event = switch (req.getStatus()) {
            case RdmConstants.STATUS_INTAKE_PENDING -> RdmConstants.EVENT_INTAKE_TODO;
            case RdmConstants.STATUS_POOL -> RdmConstants.EVENT_INTAKE_PASS;
            case RdmConstants.STATUS_INTAKE_REJECTED, RdmConstants.STATUS_REJECTED -> RdmConstants.EVENT_INTAKE_REJECT;
            case RdmConstants.STATUS_ASSIGNED -> RdmConstants.EVENT_ASSIGNED;
            case RdmConstants.STATUS_UAT_PENDING -> RdmConstants.EVENT_ACCEPT_TODO;
            case RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED -> RdmConstants.EVENT_ACCEPT_DONE;
            default -> RdmConstants.EVENT_STATUS_CHANGED;
        };
        String text = "### 🔁 需求狀態更新\n\n- **編號**: " + RdmConstants.displayReqNo(req.getReqNo()) + "\n- **標題**: " + req.getTitle()
                + "\n- **動作**: " + rule.getActionName() + "\n- **當前狀態**: " + labelOf(req.getStatus())
                + "\n- **操作人**: " + (actor == null ? "system" : actor.getName())
                + (req.getPlanReleaseDate() != null ? "\n- **計劃上線**: " + req.getPlanReleaseDate() : "");
        notifyService.notifyUserIds(event, req, receivers,
                "需求狀態更新：" + RdmConstants.displayReqNo(req.getReqNo()), text);
    }

    /* ── 查询辅助 ── */

    private List<RdmRequirementVO> listByStatus(String status, Map<String, String> stageOf) {
        return requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .eq(RdmRequirement::getStatus, status).orderByDesc(RdmRequirement::getUpdatedAt).last("LIMIT 20"))
                .stream().map(r -> RdmRequirementVO.from(r, stageOf)).toList();
    }

    private List<RdmRequirementVO> listByColumn(
            com.baomidou.mybatisplus.core.toolkit.support.SFunction<RdmRequirement, ?> column,
            Long value, Map<String, String> stageOf) {
        return requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .eq(column, value).orderByDesc(RdmRequirement::getUpdatedAt).last("LIMIT 20"))
                .stream().map(r -> RdmRequirementVO.from(r, stageOf)).toList();
    }

    private List<RdmRequirementVO> listAcceptanceTodo(Long userId, Map<String, String> stageOf) {
        return requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .eq(RdmRequirement::getAcceptorUserId, userId)
                        .eq(RdmRequirement::getStatus, RdmConstants.STATUS_UAT_PENDING)
                        .orderByDesc(RdmRequirement::getUpdatedAt).last("LIMIT 20"))
                .stream().map(r -> RdmRequirementVO.from(r, stageOf)).toList();
    }

    /**
     * 待我審批的需求 id（准入审批走 OA，审批人在 biz_oa_approval_task 里；
     * 审批人字段存「姓名(工号)」，所以同时兼容仅存工号/姓名的历史数据）。
     * <p>这是「待我審批」的唯一口径：工作台待办组与需求清单的 approving 视角都走它。
     * 之前工作台用这个 OA 口径、清单 scope=todo 用需求表的 PM/验收人/研发负责人字段，
     * 审批人在工作台看到 3 条、点「查看全部」进到列表是空的 —— 动线断在这儿。
     * <p>故意不加 LIMIT：count 要真实总数，展示截断由调用方做。
     * <p>包内可见以便单测直接验证判定口径。
     */
    List<Long> approvingRequirementIds(SysUser current) {
        if (current == null) {
            return List.of();
        }
        return jdbcTemplate.queryForList(
                "SELECT r.id FROM rdm_requirement r "
                        + "JOIN biz_oa_request o ON o.flow_no = r.intake_flow_no AND o.deleted = 0 AND o.flow_status = 'pending' "
                        + "JOIN biz_oa_approval_task t ON t.request_id = o.id AND t.task_status = 'pending' "
                        + "WHERE r.deleted = 0 AND r.status = 'intake_pending' "
                        + "AND (t.approver LIKE ? OR t.approver LIKE ? OR t.approver LIKE ?) "
                        + "ORDER BY r.updated_at DESC",
                Long.class, "%" + current.getName() + "%", "%" + current.getEmpId() + "%",
                "%" + current.getUsername() + "%");
    }

    /** 按 id 列表映射成 VO（工作台只展示前 20 条） */
    private List<RdmRequirementVO> toVOs(List<Long> ids, Map<String, String> stageOf) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return requirementMapper.selectBatchIds(ids.stream().limit(20).toList()).stream()
                .map(r -> RdmRequirementVO.from(r, stageOf)).toList();
    }

    private RdmRequirementVO.SlaInfo buildSla(RdmRequirement req) {
        RdmRequirementVO.SlaInfo sla = new RdmRequirementVO.SlaInfo();
        sla.setStatusCode(req.getStatus());
        Integer slaHours = configService.slaHours(req.getStatus(), req.getPriority());
        sla.setSlaHours(slaHours == null ? RdmConstants.DEFAULT_SLA_HOURS : slaHours);
        Integer warn = configService.warnHours(req.getStatus(), req.getPriority());
        sla.setWarnHours(warn);
        sla.setEscalateRole(configService.escalateRole(req.getStatus(), req.getPriority()));
        if (req.getStatusEnterTime() != null) {
            long stayed = Duration.between(req.getStatusEnterTime(), LocalDateTime.now()).toHours();
            sla.setRemainHours(sla.getSlaHours().longValue() - stayed);
            sla.setOverdue(stayed > sla.getSlaHours());
        } else {
            sla.setRemainHours(sla.getSlaHours().longValue());
            sla.setOverdue(false);
        }
        return sla;
    }

    private List<RdmRequirementVO.AllowedAction> allowedActions(RdmRequirement req, SysUser current) {
        Set<String> myRoles = accessGuard.activeRoles(req.getId(), current);
        List<RdmRequirementVO.AllowedAction> list = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (RdmConfigVO.Transition rule : configService.transitionsFrom(req.getStatus())) {
            if (!canPerform(rule, current, myRoles) || !seen.add(rule.getActionCode())) {
                continue;
            }
            /*
             * 读侧必须跟写侧同一白名单：V3 需求的交付/测试/验收/发布类动作由交付项推进，
             * transition 会拒；以前不过滤导致详情页列出「開始寫 PRD」等一按就必失败的按钮。
             */
            if (!flowVersionGuard.isTransitionActionAllowed(req.getFlowVersion(), rule.getActionCode())) {
                continue;
            }
            RdmRequirementVO.AllowedAction action = new RdmRequirementVO.AllowedAction();
            action.setActionCode(rule.getActionCode());
            action.setActionName(rule.getActionName());
            action.setToStatus(rule.getToStatus());
            action.setRequiredFields(rule.getRequiredFields());
            list.add(action);
        }
        return list;
    }

    private RdmOptionVO.ProductManager loadPm(Long userId, String fallbackName) {
        SysUser user = userId == null ? null : userMapper.selectById(userId);
        if (user == null) {
            return null;
        }
        RdmOptionVO.ProductManager pm = toPm(user);
        if (!StringUtils.hasText(pm.getName()) && StringUtils.hasText(fallbackName)) {
            pm.setName(fallbackName);
        }
        return pm;
    }

    private RdmOptionVO.ProductManager toPm(SysUser user) {
        RdmOptionVO.ProductManager pm = new RdmOptionVO.ProductManager();
        pm.setUserId(user.getId());
        pm.setEmpNo(user.getEmpId());
        pm.setName(user.getName());
        pm.setDeptName(resolveDeptName(user.getDepartmentId()));
        pm.setDomains(new ArrayList<>());
        pm.setActiveCount(configService.countActiveByPm(user.getId()));
        pm.setCapacity(8);
        return pm;
    }

    private String resolveDeptName(Long deptId) {
        if (deptId == null) {
            return null;
        }
        SysDepartment dept = departmentMapper.selectById(deptId);
        return dept == null ? null : dept.getName();
    }

    private String menuName(String menuKey) {
        if (!StringUtils.hasText(menuKey)) {
            return null;
        }
        List<String> names = jdbcTemplate.queryForList(
                "SELECT name FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", String.class, menuKey);
        return names.isEmpty() ? null : names.get(0);
    }

    private String systemName(String systemCode) {
        if (!StringUtils.hasText(systemCode)) {
            return null;
        }
        List<String> names = jdbcTemplate.queryForList(
                "SELECT name FROM sys_system WHERE code = ? AND deleted = 0 LIMIT 1", String.class, systemCode);
        return names.isEmpty() ? null : names.get(0);
    }

    private static LocalDate parseDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim().substring(0, 10));
        } catch (Exception e) {
            throw new BusinessException("日期格式不正確：" + value);
        }
    }

    private static int value(Integer number) {
        return number == null ? 0 : number;
    }

    private static int valueOrZero(Integer number, int fallback) {
        return number == null || number <= 0 ? fallback : number;
    }

    private static String formatTime(LocalDateTime time) {
        return DateTimeUtils.format(time);
    }
}
