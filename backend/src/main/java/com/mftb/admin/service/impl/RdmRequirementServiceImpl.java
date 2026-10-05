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
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmNotifyService;
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

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<RdmRequirementVO> page(RdmRequirementQuery query) {
        SysUser current = operatorResolver.currentUser();
        boolean unrestricted = canSeeAll(current);
        Page<RdmRequirement> page = new Page<>(
                (int) PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage()),
                (int) PageResult.normalizeSize(query.getSize() == null ? 10 : query.getSize()));
        var wrapper = query.toWrapper(unrestricted ? null : (current == null ? null : current.getId()));
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
        vo.setMyRole(resolveMyRole(roles, current, req));

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
        vo.setAllowedActions(allowedActions(req, current, roles));
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
        req.setRejectCount(0);
        req.setReopenCount(0);
        req.setReworkCount(0);
        req.setChangeCount(0);
        req.setNeedApproval(draft ? 1 : (Boolean.FALSE.equals(dto.getNeedApproval()) ? 0 : 1));
        req.setCreatedBy(operatorResolver.operatorSignature(current));
        req.setUpdatedBy(req.getCreatedBy());

        // 受理路径：指定 PM 时进「已分配·待受理」，否则进需求池等技术负责人分配
        SysUser pm = dto.getPmUserId() == null ? null : userMapper.selectById(dto.getPmUserId());
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
        req.setStatusEnterTime(LocalDateTime.now());
        req.setCurrentHandlerName(computeHandler(req, pm));
        requirementMapper.insert(req);

        saveTargets(req.getId(), dto.getTargets());
        saveAttachments(req.getId(), dto.getAttachments(), current);
        saveInitialRoles(req, current, pm, acceptor, dto.getCcUserIds());
        appendStatusLog(req, null, current, RdmConstants.ACTION_SUBMIT, draft ? "保存草稿" : "需求已提交");

        if (!draft && req.getNeedApproval() == 1) {
            submitIntakeFlow(req, current);
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
        transitionInternal(req, RdmConstants.ACTION_WITHDRAW, null, current, null);
        return RdmRequirementVO.from(req, configService.stageMap());
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
        transitionInternal(req, dto.getActionCode(), dto, current, resolveMyRole(listRoles(id), current, req));
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
                    resolveMyRole(listRoles(req.getId()), current, req));
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
     * @param myRole 当前人在该需求上的角色（null 时按管理岗兜底）
     */
    private void transitionInternal(RdmRequirement req, String actionCode, RdmTransitionDTO dto,
                                    SysUser current, String myRole) {
        RdmConfigVO.Transition rule = configService.findTransition(req.getStatus(), actionCode);
        if (rule == null) {
            throw new BusinessException("當前狀態「" + labelOf(req.getStatus()) + "」不允許執行該操作，請刷新後重試");
        }
        if (!canPerform(rule, current, myRole)) {
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
                req.setRejectCount(value(req.getRejectCount()) + 1);
            }
            case RdmConstants.ACTION_RELEASE -> {
                req.setVersionNo(dto == null ? null : dto.getVersionNo());
                req.setActualReleaseDate(LocalDate.now());
            }
            case RdmConstants.ACTION_VERIFY -> {
                if (dto != null && dto.getScore() != null) {
                    req.setAcceptanceScore(dto.getScore());
                }
                req.setAcceptanceTime(now);
            }
            case RdmConstants.ACTION_REOPEN -> req.setReopenCount(value(req.getReopenCount()) + 1);
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
            transitionInternal(req, RdmConstants.ACTION_DISPATCH, dto, current, null);
            count++;
        }
        if (count == 0) {
            throw new BusinessException("所選需求已不在需求池，請刷新後重試");
        }
        return count;
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
        if (!RdmConstants.STATUS_UAT_PENDING.equals(req.getStatus())) {
            throw new BusinessException("僅「待業務驗收」的需求可提交驗收結論");
        }
        if (!StringUtils.hasText(dto.getResult())) {
            throw new BusinessException("請選擇驗收結論");
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

        // attempt 存当时序号：事后补录或修订不得改变已有记录的「第几次验收」
        Long prior = acceptanceMapper.selectCount(
                new LambdaQueryWrapper<RdmAcceptance>().eq(RdmAcceptance::getReqId, id));
        int attempt = (prior == null ? 0 : prior.intValue()) + 1;

        RdmAcceptance acceptance = new RdmAcceptance();
        acceptance.setAcceptNo(bizSeqService.next(SEQ_ACCEPTANCE));
        acceptance.setReqId(id);
        acceptance.setAcceptorUserId(current == null ? null : current.getId());
        acceptance.setAcceptorEmpNo(current == null ? null : current.getEmpId());
        acceptance.setAcceptorName(current == null ? req.getAcceptorName() : current.getName());
        acceptance.setResult(dto.getResult());
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

        req.setAcceptanceResult(dto.getResult());
        req.setAcceptanceScore(dto.getScore());
        req.setAcceptanceTime(acceptance.getAcceptTime());

        // 不通过：退回研发并计返工；通过/有条件通过：保持待验收，由 PM 确认上线
        if (failed) {
            RdmTransitionDTO trans = new RdmTransitionDTO();
            trans.setRemark(dto.getIssues());
            requirementMapper.updateById(req);
            transitionInternal(req, RdmConstants.ACTION_UAT_FAIL, trans, current, RdmConstants.ROLE_ACCEPTOR);
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
        requireRequirement(id);
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
        List<RdmRequirementVO> intakeTodo = intakeTodoFor(current, stageOf);
        if (!intakeTodo.isEmpty()) {
            groups.add(new RdmWorkbenchVO.TodoGroup("intake", "需求審批（我是審批人）",
                    "審批通過後進入需求池", (long) intakeTodo.size(), intakeTodo));
        }
        if (unrestricted || canDispatch(current)) {
            List<RdmRequirementVO> pool = listByStatus(RdmConstants.STATUS_POOL, stageOf);
            if (!pool.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("pool", "需求池待分配（我是技術負責人）",
                        "分配產品經理後進入受理", (long) pool.size(), pool));
            }
        }
        if (userId != null) {
            List<RdmRequirementVO> mine = listByColumn(RdmRequirement::getAssigneePmUserId, userId, stageOf);
            if (!mine.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("product", "我負責的產品需求（我是產品經理）",
                        "需盡快給出受理結論與排期", (long) mine.size(), mine));
            }
            List<RdmRequirementVO> toAccept = listAcceptanceTodo(userId, stageOf);
            if (!toAccept.isEmpty()) {
                groups.add(new RdmWorkbenchVO.TodoGroup("acceptance", "待我驗收（我是業務驗收人）",
                        "驗收通過後才可確認上線", (long) toAccept.size(), toAccept));
            }
        }
        vo.setTodos(groups);

        RdmWorkbenchVO.Stats stats = new RdmWorkbenchVO.Stats();
        stats.setMineTotal(userId == null ? 0L : requirementMapper.selectCount(
                new LambdaQueryWrapper<RdmRequirement>().eq(RdmRequirement::getSubmitterUserId, userId)));
        stats.setMineProgress(userId == null ? 0L : requirementMapper.selectCount(
                new LambdaQueryWrapper<RdmRequirement>().eq(RdmRequirement::getSubmitterUserId, userId)
                        .notIn(RdmRequirement::getStatus, List.of(RdmConstants.STATUS_CLOSED,
                                RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED))));
        stats.setTodoTotal((long) groups.stream().mapToInt(g -> g.getTotal().intValue()).sum());
        stats.setOverdueTotal(requirementMapper.selectCount(new LambdaQueryWrapper<RdmRequirement>()
                .eq(RdmRequirement::getOverdueFlag, 1)));
        stats.setToAcceptTotal((long) (userId == null ? 0 : listAcceptanceTodo(userId, stageOf).size()));
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
        // 分发矩阵之外，持有「产品需求处理」菜单的员工也是可选受理人（避免矩阵未配时无候选人）
        userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getDeleted, 0).last("LIMIT 200"))
                .stream()
                .filter(u -> u.getId() != null && !byUser.containsKey(u.getId()))
                .filter(u -> permissionService.hasPermission(u, RdmConstants.MENU_PRODUCT, "view"))
                .limit(30)
                .forEach(u -> byUser.put(u.getId(), toPm(u)));
        return new ArrayList<>(byUser.values());
    }

    @Override
    public List<RdmOptionVO.MenuNode> menuTree() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT m.menu_key, m.name, m.system_code, s.name AS system_name, m.parent_id, m.id "
                        + "FROM sys_menu m LEFT JOIN sys_system s ON s.code = m.system_code AND s.deleted = 0 "
                        + "WHERE m.deleted = 0 AND m.status = 1 AND m.type IN (1, 2) "
                        + "ORDER BY m.system_code, m.sort_order, m.id");
        Map<String, RdmOptionVO.MenuNode> systems = new LinkedHashMap<>();
        Map<Long, String> menuKeyByParent = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String systemCode = (String) row.get("system_code");
            if (!StringUtils.hasText(systemCode)) {
                continue;
            }
            RdmOptionVO.MenuNode sys = systems.computeIfAbsent(systemCode,
                    code -> new RdmOptionVO.MenuNode(code, (String) row.get("system_name"), new ArrayList<>()));
            Long parentId = row.get("parent_id") == null ? null : ((Number) row.get("parent_id")).longValue();
            if (parentId == null) {
                continue;
            }
            menuKeyByParent.put(((Number) row.get("id")).longValue(), (String) row.get("menu_key"));
            if (menuKeyByParent.containsKey(parentId)) {
                // 二级菜单作为系统下的叶子（三级及更深归到其二级父菜单同名，原型阶段够用）
                String parentKey = menuKeyByParent.get(parentId);
                if (!sys.getChildren().stream().anyMatch(n -> n.getKey().equals(parentKey))) {
                    sys.getChildren().add(new RdmOptionVO.MenuNode(parentKey, nameOfMenu(rows, parentId), new ArrayList<>()));
                }
            } else {
                RdmOptionVO.MenuNode top = new RdmOptionVO.MenuNode((String) row.get("menu_key"),
                        (String) row.get("name"), new ArrayList<>());
                // 顶级目录的子菜单挂到该目录下
                sys.getChildren().add(top);
            }
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

    /** 是否能看到全部需求（超管、PMO/导出权持有者、技术负责人） */
    private boolean canSeeAll(SysUser current) {
        if (operatorResolver.isAdmin(current)) {
            return true;
        }
        if (current == null) {
            return false;
        }
        return permissionService.hasPermission(current, "rdm-requirement", "export")
                || permissionService.hasPermission(current, "rdm-requirement", "delete")
                || canDispatch(current);
    }

    /**
     * 单条需求的可见性守卫（防水平越权）。
     * <p>列表已按相关人收敛，详情/评论/催办必须走同一口径，
     * 否则只要猜到一个 id 就能读到别部门的需求内容。
     * <p>包内可见以便单测直接验证判定口径。
     */
    void requireVisible(RdmRequirement req, SysUser current, String action) {
        if (canSeeAll(current) || isRelated(req, current)) {
            return;
        }
        throw new BusinessException("您與該需求無關，無法" + action);
    }

    /** 登录人与该需求是否直接相关（提出/负责/研发/验收/抄送/参与） */
    private boolean isRelated(RdmRequirement req, SysUser current) {
        if (current == null) {
            return false;
        }
        Long userId = current.getId();
        if (userId.equals(req.getSubmitterUserId()) || userId.equals(req.getAssigneePmUserId())
                || userId.equals(req.getDevOwnerUserId()) || userId.equals(req.getAcceptorUserId())) {
            return true;
        }
        return roleMapper.selectCount(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, req.getId())
                .eq(RdmRequirementRole::getUserId, userId)
                .eq(RdmRequirementRole::getIsActive, 1)) > 0;
    }

    /** 是否可分发需求（技术负责人） */
    private boolean canDispatch(SysUser current) {
        if (operatorResolver.isAdmin(current)) {
            return true;
        }
        return current != null && permissionService.hasPermission(current, MENU_DISPATCHER, "edit");
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
        if (current != null && permissionService.hasPermission(current, RdmConstants.MENU_PRODUCT, "edit")) {
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

    /** 当前人在该需求上的角色：优先取参与角色表，其次按主数据字段推断 */
    private String resolveMyRole(List<RdmRequirementRole> roles, SysUser current, RdmRequirement req) {
        if (current == null) {
            return null;
        }
        return roles.stream()
                .filter(r -> current.getId().equals(r.getUserId()))
                .map(RdmRequirementRole::getRoleCode)
                .findFirst()
                .orElseGet(() -> {
                    if (current.getId().equals(req.getSubmitterUserId())) {
                        return RdmConstants.ROLE_SUBMITTER;
                    }
                    if (current.getId().equals(req.getAssigneePmUserId())) {
                        return RdmConstants.ROLE_PM;
                    }
                    if (current.getId().equals(req.getAcceptorUserId())) {
                        return RdmConstants.ROLE_ACCEPTOR;
                    }
                    return null;
                });
    }

    /**
     * 角色守卫：超管放行；否则要求登录人在该需求上的角色出现在允许列表里。
     * <p>fail-closed：未拿到当前用户或规则未配角色时一律拒绝，避免“谁拿到入口都能推”。
     * <p>包内可见以便 {@code RdmTransitionGuardTest} 直接验证判定口径。
     */
    boolean canPerform(RdmConfigVO.Transition rule, SysUser current, String myRole) {
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
        if (StringUtils.hasText(myRole) && allowed.contains(myRole)) {
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

    /** 关闭尚未离开当前状态的流水（回填停留时长），再插入新流水 */
    private void appendStatusLog(RdmRequirement req, String fromStatus, SysUser actor, String actionCode, String remark) {
        RdmStatusLog log = new RdmStatusLog();
        log.setReqId(req.getId());
        log.setFromStatus(fromStatus);
        log.setToStatus(req.getStatus());
        log.setActionCode(actionCode);
        log.setOperatorUserId(actor == null ? null : actor.getId());
        log.setOperatorName(actor == null ? "system" : actor.getName());
        log.setOperatorRole(resolveMyRole(listRoles(req.getId()), actor, req));
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

    /** 待我审批：从 OA 待审任务反查（审批人字段存「姓名(工号)」，兼容仅存工号/姓名） */
    private List<RdmRequirementVO> intakeTodoFor(SysUser current, Map<String, String> stageOf) {
        if (current == null) {
            return List.of();
        }
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT r.id FROM rdm_requirement r "
                        + "JOIN biz_oa_request o ON o.flow_no = r.intake_flow_no AND o.deleted = 0 AND o.flow_status = 'pending' "
                        + "JOIN biz_oa_approval_task t ON t.request_id = o.id AND t.task_status = 'pending' "
                        + "WHERE r.deleted = 0 AND r.status = 'intake_pending' "
                        + "AND (t.approver LIKE ? OR t.approver LIKE ? OR t.approver LIKE ?) "
                        + "ORDER BY r.updated_at DESC LIMIT 20",
                Long.class, "%" + current.getName() + "%", "%" + current.getEmpId() + "%",
                "%" + current.getUsername() + "%");
        if (ids.isEmpty()) {
            return List.of();
        }
        return requirementMapper.selectBatchIds(ids).stream().map(r -> RdmRequirementVO.from(r, stageOf)).toList();
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

    private List<RdmRequirementVO.AllowedAction> allowedActions(RdmRequirement req, SysUser current,
                                                                List<RdmRequirementRole> roles) {
        String myRole = resolveMyRole(roles, current, req);
        List<RdmRequirementVO.AllowedAction> list = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (RdmConfigVO.Transition rule : configService.transitionsFrom(req.getStatus())) {
            if (!canPerform(rule, current, myRole) || !seen.add(rule.getActionCode())) {
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

    private String nameOfMenu(List<Map<String, Object>> rows, Long menuId) {
        return rows.stream().filter(r -> r.get("id") != null && ((Number) r.get("id")).longValue() == menuId)
                .map(r -> (String) r.get("name")).findFirst().orElse(null);
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
