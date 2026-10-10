package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmAcceptanceDTO;
import com.mftb.admin.dto.RdmAcceptanceVO;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmOptionVO;
import com.mftb.admin.dto.RdmIntakeVO;
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
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAcceptanceCaseMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmIntakePolicyService;
import com.mftb.admin.service.RdmIntakeRoundService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmReleaseService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
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

    /** 编号规则键（对应 sys_biz_seq_rule.rule_key） */
    private static final String SEQ_REQUIREMENT = "rdm_requirement";
    private static final String SEQ_ACCEPTANCE = "rdm_acceptance";

    /** 需求池责任人（技术负责人）菜单，用于判定谁能分发 */
    private static final String MENU_DISPATCHER = RdmConstants.MENU_INTAKE;

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
    /** 准入策略裁决：要不要审批、走哪条链、由谁分派 */
    private final RdmIntakePolicyService intakePolicyService;
    /** 准入审批轮次：每轮独立留痕，旧轮回调不能推动新轮 */
    private final RdmIntakeRoundService intakeRoundService;
    /** 阶段 4：上线前的发布放行闸门（只在 release/uat_fail/reopen 三个动作上介入） */
    private final RdmReleaseService releaseService;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<RdmRequirementVO> page(RdmRequirementQuery query) {
        SysUser current = operatorResolver.currentUser();
        boolean unrestricted = canSeeAll(current);
        Page<RdmRequirement> page = new Page<>(
                (int) PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage()),
                (int) PageResult.normalizeSize(query.getSize() == null ? 10 : query.getSize()));
        // 「待我審批」的关联关系在 OA 审批任务表里，不在需求表的四个人员字段上；
        // 这一视角不按 relatedOnly 收敛，改由下面的审批待办 id 集合决定范围，
        // 否则审批人只会看到自己提的单，出现「待办计数 3 条、点进去空列表」。
        boolean relatedOnly = !RdmConstants.SCOPE_APPROVING.equals(query.getScope());
        var wrapper = query.toWrapper(unrestricted ? null : (current == null ? null : current.getId()), relatedOnly);
        // 待我審批需要 join OA 审批任务表才能定出审批人，LambdaQueryWrapper 表达不了：先取 id 再收敛
        if (RdmConstants.SCOPE_APPROVING.equals(query.getScope())) {
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
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public Map<String, Long> scopeCounts() {
        SysUser current = operatorResolver.currentUser();
        Long userId = canSeeAll(current) ? null : (current == null ? null : current.getId());
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put(RdmConstants.SCOPE_MINE, countByScope(RdmConstants.SCOPE_MINE, userId));
        counts.put(RdmConstants.SCOPE_TODO, countByScope(RdmConstants.SCOPE_TODO, userId));
        // 审批待办不在需求表的任何人字段上，只能走 OA 口径（与工作台待办组共用同一个方法）
        counts.put(RdmConstants.SCOPE_APPROVING, (long) approvingRequirementIds(current).size());
        counts.put(RdmConstants.SCOPE_POOL, countByScope(RdmConstants.SCOPE_POOL, userId));
        counts.put(RdmConstants.SCOPE_PRODUCT, countByScope(RdmConstants.SCOPE_PRODUCT, userId));
        counts.put(RdmConstants.SCOPE_DELIVERY, countByScope(RdmConstants.SCOPE_DELIVERY, userId));
        counts.put(RdmConstants.SCOPE_ACCEPTANCE, countByScope(RdmConstants.SCOPE_ACCEPTANCE, userId));
        counts.put(RdmConstants.SCOPE_ALL, countByScope(RdmConstants.SCOPE_ALL, userId));
        return counts;
    }

    private Long countByScope(String scope, Long userId) {
        RdmRequirementQuery q = new RdmRequirementQuery();
        q.setScope(scope);
        return requirementMapper.selectCount(q.toWrapper(userId));
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
        Long userId = unrestricted ? null : (current == null ? null : current.getId());
        boolean approvingScope = RdmConstants.SCOPE_APPROVING.equals(query.getScope());
        // 待我審批的 id 集合只算一次、四个指标共用：每算一个指标重查一轮 OA 太浪费
        List<Long> approvingIds = approvingScope ? approvingRequirementIds(current) : null;
        Map<String, Long> counts = new LinkedHashMap<>();
        if (approvingScope && approvingIds.isEmpty()) {
            counts.put("total", 0L);
            counts.put("overdue", 0L);
            counts.put("toAccept", 0L);
            counts.put("pool", 0L);
            return counts;
        }
        counts.put("total", countStatsSubset(query, userId, approvingIds, q -> { }));
        counts.put("overdue", countStatsSubset(query, userId, approvingIds, q -> q.setOverdueOnly(true)));
        counts.put("toAccept", countStatsSubset(query, userId, approvingIds,
                q -> q.setStatus(RdmConstants.STATUS_UAT_PENDING)));
        counts.put("pool", countStatsSubset(query, userId, approvingIds,
                q -> q.setStatus(RdmConstants.STATUS_POOL)));
        return counts;
    }

    /** 复制一份查询条件再叠加单个指标的条件，避免四个指标互相污染 */
    private long countStatsSubset(RdmRequirementQuery base, Long userId, List<Long> approvingIds,
                                  java.util.function.Consumer<RdmRequirementQuery> tweak) {
        RdmRequirementQuery q = copyFiltersForStats(base);
        tweak.accept(q);
        // 与 page() 保持同一收敛规则：待我審批的关联关系在 OA 任务表上，不按 relatedOnly 收敛
        boolean relatedOnly = !RdmConstants.SCOPE_APPROVING.equals(q.getScope());
        var wrapper = q.toWrapper(userId, relatedOnly);
        if (approvingIds != null) {
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
        return q;
    }

    @Override
    public RdmRequirementVO detail(Long id) {
        RdmRequirement req = requireRequirement(id);
        SysUser current = operatorResolver.currentUser();
        requireVisible(req, current, "查看詳情");
        Map<String, String> stageOf = configService.stageMap();
        RdmRequirementVO vo = RdmRequirementVO.from(req, stageOf);
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
        req.setReqNo(bizSeqService.next(SEQ_REQUIREMENT));
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
        // 否则发布闸门会把历史记录一律算成「未做验收准备」
        req.setFlowVersion(2);
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
        SysUser acceptor = dto.getAcceptorUserId() == null ? current : userMapper.selectById(dto.getAcceptorUserId());
        req.setAcceptorUserId(acceptor == null ? current.getId() : acceptor.getId());
        req.setAcceptorName(acceptor == null ? current.getName() : acceptor.getName());

        if (draft) {
            req.setStatus(RdmConstants.STATUS_DRAFT);
        } else if (req.getNeedApproval() == 1) {
            req.setStatus(RdmConstants.STATUS_INTAKE_PENDING);
            req.setSubmitTime(LocalDateTime.now());
        } else if (pm != null) {
            req.setStatus(RdmConstants.STATUS_ASSIGNED);
            req.setSubmitTime(LocalDateTime.now());
            applyPm(req, pm, current);
        } else {
            req.setStatus(RdmConstants.STATUS_POOL);
            req.setSubmitTime(LocalDateTime.now());
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
        notifyOnCreate(req, pm);
        log.info("需求已創建: reqNo={}, status={}, submitter={}", req.getReqNo(), req.getStatus(), req.getSubmitterName());
        return RdmRequirementVO.from(req, configService.stageMap());
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
        req.setUpdatedBy(operatorResolver.operatorSignature(current));
        requirementMapper.updateById(req);

        targetMapper.delete(new LambdaQueryWrapper<RdmRequirementTarget>().eq(RdmRequirementTarget::getReqId, id));
        saveTargets(id, dto.getTargets());
        return RdmRequirementVO.from(req, configService.stageMap());
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
        transitionInternal(req, actionCode, dto, current, accessGuard.activeRoles(id, current));
        /*
         * 提交/重提都重新裁决一次：人员调岗、策略改版后不能沿用上一轮的结论；
         * 同时开启新一轮并发起本轮准入单，否则会出现「界面待审批、OA 没有待办」。
         */
        RdmIntakeVO.Decision decision = intakePolicyService.decide(current, req.getReqType(), reqSystemCode(req));
        req.setNeedApproval(decision.isNeedApproval() ? 1 : 0);
        applyIntakeDecision(req, decision);
        req.setSubmitTime(LocalDateTime.now());
        req.setCurrentHandlerName(computeHandler(req, null));
        requirementMapper.updateById(req);
        openIntakeRound(req, decision, current);
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
     * 产品经理资格校验：在职启用 + 具备需求侧处理权（rdm-requirement:edit）。
     * <p>不能只校「用户存在」：把需求分给无受理权的人，他会收到待办却点不动任何动作。
     */
    private void requirePmEligible(SysUser pm) {
        if (pm.getStatus() != null && pm.getStatus() == 0) {
            throw new BusinessException("指定的產品經理已離職或停用，請改選其他人或提交技術部分配");
        }
        if (!permissionService.hasPermission(pm, RdmConstants.MENU_REQUIREMENT, "edit")) {
            throw new BusinessException("指定的員工「" + pm.getName()
                    + "」當前無產品經理受理權限，請先在授權中心配置或改提交技術部分配");
        }
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
        transitionInternal(req, dto.getActionCode(), dto, current, accessGuard.activeRoles(id, current));
        return RdmRequirementVO.from(requirementMapper.selectById(id), configService.stageMap());
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
            transitionInternal(req, dto.getActionCode(), dto, current,
                    accessGuard.activeRoles(req.getId(), current));
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
        RdmConfigVO.Transition rule = configService.findTransition(req.getStatus(), actionCode);
        if (rule == null) {
            throw new BusinessException("當前狀態「" + labelOf(req.getStatus()) + "」不允許執行該操作，請刷新後重試");
        }
        if (!canPerform(rule, current, myRoles)) {
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
            if (actionCode.contains("reject") || actionCode.contains("fail")) {
                req.setRejectReason(dto.getRemark());
                req.setRejectCount(value(req.getRejectCount()) + 1);
            }
        }
        switch (actionCode) {
            case RdmConstants.ACTION_ACCEPT -> {
                req.setAcceptTime(now);
                req.setPromisedPrdDate(parseDate(dto == null ? null : dto.getPromisedDate()));
            }
            case RdmConstants.ACTION_HOLD -> req.setOnHoldUntil(parseDate(dto == null ? null : dto.getHoldUntil()));
            case RdmConstants.ACTION_UNHOLD -> req.setOnHoldUntil(null);
            case RdmConstants.ACTION_SCHEDULE -> {
                req.setPlanReleaseDate(parseDate(dto == null ? null : dto.getPlanDate()));
                req.setPlanDevDate(parseDate(dto == null ? null : dto.getPlanDevDate()));
                if (dto != null && StringUtils.hasText(dto.getIterationCode())) {
                    req.setIterationCode(dto.getIterationCode());
                }
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
        req.setStatusEnterTime(now);
        req.setOverdueFlag(0);
        req.setCurrentHandlerName(computeHandler(req, null));
        req.setUpdatedBy(operatorResolver.operatorSignature(actor));
        requirementMapper.updateById(req);

        closeOpenStatusLog(req.getId(), now, isOverdue(req));
        markMilestoneActual(req.getId(), actionCode, now, operatorResolver.operatorSignature(actor));
        appendStatusLog(req, fromStatus, actor, actionCode, dto == null ? null : dto.getRemark());

        notifyOnTransition(req, rule, actor);
        log.info("需求流轉: reqNo={}, {} -> {}, action={}, operator={}",
                req.getReqNo(), fromStatus, req.getStatus(), actionCode, req.getUpdatedBy());
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
         * 原子抢单：条件里带 status=pool 与「尚无受理人」，两个 PM 同时点只有一个人拿到 1 行。
         * 分发人列不动：自认领没有技术负责人参与，写自己进去会误导责任归属。
         */
        int taken = jdbcTemplate.update(
                "UPDATE rdm_requirement SET status = ?, assignee_pm_user_id = ?, assignee_pm_emp_no = ?, "
                        + "assignee_pm_name = ?, current_handler_name = ?, distribute_time = now(), "
                        + "status_enter_time = now(), overdue_flag = 0, updated_by = ? "
                        + "WHERE id = ? AND deleted = 0 AND status = ? "
                        + "AND (assignee_pm_user_id IS NULL OR assignee_pm_user_id = 0)",
                RdmConstants.STATUS_ASSIGNED, current.getId(), current.getEmpId(), current.getName(),
                current.getName(), signature, id, RdmConstants.STATUS_POOL);
        if (taken == 0) {
            throw new BusinessException("該需求已被他人認領或狀態已變更，請刷新後重試");
        }
        RdmRequirement claimed = requireRequirement(id);
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
        followUp.setReqNo(bizSeqService.next(SEQ_REQUIREMENT));
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
                        "分配產品經理後進入受理", countByScope(RdmConstants.SCOPE_POOL, scopeUserId), pool));
            }
        }
        if (userId != null) {
            List<RdmRequirementVO> mine = listByColumn(RdmRequirement::getAssigneePmUserId, userId, stageOf);
            if (!mine.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("product", "我負責的產品需求（我是產品經理）",
                        "需盡快給出受理結論與排期", countByScope(RdmConstants.SCOPE_PRODUCT, scopeUserId), mine));
            }
            List<RdmRequirementVO> toAccept = listAcceptanceTodo(userId, stageOf);
            if (!toAccept.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("acceptance", "待我驗收（我是業務驗收人）",
                        "驗收通過後才可確認上線", countByScope(RdmConstants.SCOPE_ACCEPTANCE, scopeUserId), toAccept));
            }
        }
        vo.setTodos(groups);

        RdmWorkbenchVO.Stats stats = new RdmWorkbenchVO.Stats();
        stats.setMineTotal(countByScope(RdmConstants.SCOPE_MINE, scopeUserId));
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
        stats.setToAcceptTotal(countByScope(RdmConstants.SCOPE_ACCEPTANCE, scopeUserId));
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

    @Override
    public List<RdmOptionVO.FunctionPoint> functionPoints(String menuKey) {
        if (!StringUtils.hasText(menuKey)) {
            return List.of();
        }
        // 功能点来自历史需求：同一菜单被提过的定位对象即候选，避免维护一份静态清单
        List<String> names = jdbcTemplate.queryForList(
                "SELECT DISTINCT anchor_name FROM rdm_requirement_target "
                        + "WHERE deleted = 0 AND menu_key = ? AND anchor_name IS NOT NULL AND anchor_name <> '' "
                        + "ORDER BY anchor_name LIMIT 50",
                String.class, menuKey);
        return names.stream().map(n -> new RdmOptionVO.FunctionPoint(n, n)).toList();
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
            case RdmConstants.STATUS_DRAFT -> req.getSubmitterName();
            case RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_INTAKE_REJECTED -> "審批人";
            case RdmConstants.STATUS_POOL -> "技術負責人";
            case RdmConstants.STATUS_UAT_PENDING, RdmConstants.STATUS_VERIFIED -> req.getAcceptorName();
            case RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_CLOSED -> req.getAssigneePmName();
            default -> StringUtils.hasText(req.getAssigneePmName()) ? req.getAssigneePmName() : "待分配";
        };
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
            notifyService.notifyUsers(RdmConstants.EVENT_INTAKE_TODO, req, List.of(),
                    "需求待審批", "### 📝 需求待審批\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: "
                            + req.getTitle() + "\n- **提出人**: " + req.getSubmitterName()
                            + "\n\n請在流程事項或審批中心處理。");
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
        String text = "### 🔁 需求狀態更新\n\n- **編號**: " + req.getReqNo() + "\n- **標題**: " + req.getTitle()
                + "\n- **動作**: " + rule.getActionName() + "\n- **當前狀態**: " + labelOf(req.getStatus())
                + "\n- **操作人**: " + (actor == null ? "system" : actor.getName())
                + (req.getPlanReleaseDate() != null ? "\n- **計劃上線**: " + req.getPlanReleaseDate() : "");
        notifyService.notifyUserIds(event, req, receivers, "需求狀態更新：" + req.getReqNo(), text);
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
