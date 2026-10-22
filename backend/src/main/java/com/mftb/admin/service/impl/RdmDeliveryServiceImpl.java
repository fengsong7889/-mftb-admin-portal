package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.RdmChangeRequest;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.entity.RdmMilestone;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmPrdSnapshot;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmReview;
import com.mftb.admin.entity.RdmTaskProgressLog;
import com.mftb.admin.entity.RdmTaskTypeConfig;
import com.mftb.admin.entity.RdmWorkLog;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmChangeRequestMapper;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmReviewMapper;
import com.mftb.admin.mapper.RdmTaskProgressLogMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmDeliveryItemService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmPrdTaskService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.RdmTaskTypeService;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * RDM 交付过程服务实现（M2）。
 * <p>两条口径必须钉住：
 * <ol>
 *   <li>需求主状态推进只走 {@link RdmRequirementService#transition}，由 {@code rdm_transition}
 *       决定能不能推、谁能推；交付过程不另写状态机；</li>
 *   <li>任务上报是"事实录入"，状态联动失败不回滚任务变更，只记日志并保留需求原状态
 *       （否则会出现"研发已完工但被流程守卫挡住，连工时都填不进去"的死锁）。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmDeliveryServiceImpl implements RdmDeliveryService {

    /** 编号规则键 */
    private static final String SEQ_PRD = "rdm_prd";
    private static final String SEQ_REVIEW = "rdm_review";
    private static final String SEQ_TASK = "rdm_work_task";
    private static final String SEQ_CHANGE = "rdm_change";

    /** 审批（准入）通过前不允许建任务：这三个状态都还没有交付范围 */
    private static final Set<String> TASK_BLOCKED_STATUSES = Set.of(
            RdmConstants.STATUS_DRAFT,
            RdmConstants.STATUS_INTAKE_PENDING,
            RdmConstants.STATUS_INTAKE_REJECTED);

    /** 任务状态 */
    private static final String TASK_TODO = "todo";
    private static final String TASK_DOING = "doing";
    private static final String TASK_DONE = "done";
    private static final String TASK_BLOCKED = "blocked";
    /** 已取消：不参与阶段门槛判定（取消本身已表达「这活不做了」） */
    private static final String TASK_CANCELLED = "cancelled";

    /** 评审结论 */
    private static final String REVIEW_PENDING = "pending";
    private static final String REVIEW_PASSED = "passed";
    private static final String REVIEW_REJECTED = "rejected";

    /** PRD 状态 */
    private static final String PRD_DRAFT = "draft";
    private static final String PRD_REVIEWING = "reviewing";
    private static final String PRD_APPROVED = "approved";
    private static final String PRD_REJECTED = "rejected";

    /** 迭代状态白名单：与前端 constants/rdm.ts 的 RDM_ITERATION_STATUS 同源 */
    private static final Set<String> ITERATION_STATUSES = Set.of("planning", "active", "closed");

    /**
     * PRD / 評審可寫的需求狀態：受理之後（含受理當下）、排期之前。
     * <p>「評估中」就寫 PRD、出評審結論是越級操作：需求還沒被產品接受，範圍隨時可能被駁回，
     * 寫出來的 PRD 與評審結論無效，事後還會出現「評審已通過但頁面還讓人接受需求」的矛盾。
     * <p>前端據此隱藏按鈕只是體驗；真正邊界在本校驗。
     */
    private static final Set<String> PRD_PHASE_STATUSES = Set.of(
            RdmConstants.STATUS_ACCEPTED,
            RdmConstants.STATUS_PRD_DESIGNING,
            RdmConstants.STATUS_REVIEWING,
            RdmConstants.STATUS_REVIEW_PASSED);

    private final RdmPrdMapper prdMapper;
    private final RdmReviewMapper reviewMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmIterationMapper iterationMapper;
    private final RdmChangeRequestMapper changeMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmRequirementRoleMapper roleMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final RdmConfigService configService;
    private final RdmNotifyService notifyService;
    private final RdmRequirementService requirementService;
    private final OaRequestService oaRequestService;
    private final JdbcTemplate jdbcTemplate;
    /** 需求级访问守卫：交付子资源必须反查所属需求后校验数据范围与角色 */
    private final RdmAccessGuard accessGuard;
    /** 阶段 3：里程碑（五节点计划/基线） */
    private final com.mftb.admin.mapper.RdmMilestoneMapper milestoneMapper;
    /** 阶段 3：工时明细（实际工时的唯一事实） */
    private final com.mftb.admin.mapper.RdmWorkLogMapper workLogMapper;
    /** 阶段 3：PRD 定稿快照 */
    private final com.mftb.admin.mapper.RdmPrdSnapshotMapper prdSnapshotMapper;
    /** 任务负责人资格校验用：派给无交付权限的人，他会收到待办却上报不了进度 */
    private final com.mftb.admin.service.PermissionService permissionService;
    /** 任务19 / 缺口2：任务归属交付项校验（deliveryItemId 必须属于该需求且需求为 V3） */
    private final com.mftb.admin.mapper.RdmDeliveryItemMapper deliveryItemMapper;
    /** 任务19 / 缺口2：交付项归属的 V3 流程版本校验 */
    private final com.mftb.admin.service.RdmFlowVersionGuard flowVersionGuard;
    /** 任务类型字典：写校验白名单/标签解析/角色推断与聚合桶同源本表（业务可配置） */
    private final RdmTaskTypeService taskTypeService;
    /** 产品经理 PRD 任务：受理时生成、提交评审时完成、评审退回时重开（口径集中在服务侧） */
    private final RdmPrdTaskService prdTaskService;
    /**
     * 交付项状态回推：任务事实（新建/完成/删除）一旦变化，交付项必须同步重算，
     * 否则会停在「待准备」而被提测接口拒掉（历史缺陷：派了任务仍然不能提测）。
     * 只依赖 mapper 的服务，不与本类形成循环。
     */
    private final RdmDeliveryItemService deliveryItemService;
    /** 进度变更审计（只追加）：记录谁把哪条任务从多少改到多少，供绩效与验收追溯 */
    private final RdmTaskProgressLogMapper progressLogMapper;

    /* ==================== PRD ==================== */

    @Override
    public List<RdmDeliveryVO.Prd> listPrds(Long reqId) {
        accessGuard.requireVisible(reqId, "查看 PRD");
        return prdMapper.selectList(prdQuery(reqId)).stream().map(this::toPrdVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Prd savePrd(RdmDeliveryDTO.Prd dto) {
        if (dto == null || !StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("請填寫 PRD 標題");
        }
        SysUser current = operatorResolver.currentUser();
        RdmPrd prd;
        if (dto.getId() != null) {
            prd = requirePrd(dto.getId());
            // 改已有 PRD 必须反查所属需求再裁决：只按 id 放行等于任何持菜单编辑权的人都能改别人的交付物
            accessGuard.requireDeliveryWriter(prd.getReqId(), "編輯 PRD");
            /*
             * 评审中/已通过的 PRD 不得原地改正文：那份内容已经是评审结论与验收标准的事实，
             * 改了就变成「开发按新版做、验收按旧版查」。要改只能开新版本，并留下变更原因。
             */
            if (isFrozen(prd.getStatus())) {
                if (!Boolean.TRUE.equals(dto.getNewVersion())) {
                    throw new BusinessException("PRD「" + prd.getVersionNo() + "」已"
                            + (PRD_APPROVED.equals(prd.getStatus()) ? "評審通過" : "正在評審")
                            + "，內容不可原地修改；請以新版本修改並填寫原因");
                }
                if (!StringUtils.hasText(dto.getChangeReason())) {
                    throw new BusinessException("以新版本修改必須填寫變更原因，它會進版本鏈");
                }
                prd = forkVersion(prd, dto, current);
            }
        } else {
            if (dto.getReqId() == null) {
                throw new BusinessException("PRD 必須掛在一条業務需求下");
            }
            accessGuard.requireDeliveryWriter(dto.getReqId(), "編寫 PRD");
            RdmRequirement req = requireRequirement(dto.getReqId());
            requirePrdPhase(req, "編寫 PRD");
            prd = new RdmPrd();
            prd.setPrdNo(bizSeqService.next(SEQ_PRD));
            prd.setReqId(req.getId());
            prd.setStatus(PRD_DRAFT);
            prd.setVersionNo("v1.0");
            prd.setAuthorUserId(current == null ? null : current.getId());
            prd.setAuthorName(current == null ? req.getAssigneePmName() : current.getName());
            prd.setCreatedBy(operatorResolver.operatorSignature(current));
        }
        prd.setParentPrdId(dto.getParentPrdId());
        prd.setTitle(dto.getTitle().trim());
        prd.setTargetUsers(dto.getTargetUsers());
        prd.setFeatureList(dto.getFeatureList());
        /*
         * 验收标准以富文本为唯一事实源：正文写了独立「驗收標準」节就自动抽取回写结构化列，
         * 业务验收导入 / 定稿快照等下游消费方零改动；正文没有该节时保留传入值
         * （旧 PRD 的结构化存量数据原样回合），避免把历史数据抽没。
         */
        String derivedCriteria = extractAcceptanceCriteria(dto.getContentRich());
        prd.setAcceptanceCriteria(derivedCriteria != null ? derivedCriteria : dto.getAcceptanceCriteria());
        prd.setContentRich(dto.getContentRich());
        prd.setPrototypeUrl(dto.getPrototypeUrl());
        prd.setUpdatedBy(operatorResolver.operatorSignature(current));
        if (prd.getId() == null) {
            prdMapper.insert(prd);
        } else {
            prdMapper.updateById(prd);
        }

        // 拆 PRD 即代表需求進入「PRD設計中」；状态不可流转时静默跳过（由详情页按钮显式推进）
        if (prd.getId() != null && !Boolean.FALSE.equals(dto.getAdvanceRequirement())) {
            tryTransition(prd.getReqId(), RdmConstants.ACTION_PRD_START, null);
        }
        /*
         * PRD 一旦写入就是既成事实：把需求状态对齐到事实位置（受理→PRD 设计→评审/评审通过）。
         * 不论保存草稿还是「保存并推进」都对齐：否则「已受理 + PRD 已存在」会同时出现
         * 「開始寫 PRD」与「PRD 已写好」两个相互矛盾的指令。V3 需求自动跳过。
         */
        if (prd.getId() != null) {
            alignQuietly(prd.getReqId());
            // 存量需求可能已受理但还没有 PRD 任务：写 PRD 时顺手补建，避免任务视图长期缺一条
            prdTaskService.ensureTask(requireRequirement(prd.getReqId()), current);
        }
        return toPrdVO(prdMapper.selectById(prd.getId()));
    }

    /**
     * PRD / 評審的前置狀態閘門：需求必須已被產品接受（含受理後的 PRD/評審/通過階段）。
     * <p>“先接受再寫 PRD”是業務口徑：接受給出的是承諾出 PRD 的日期與範圍，
     * 反過來先寫 PRD 再說要不要接受，會讓評估階段的駁回直接作廢一份已完成評審的方案。
     */
    private void requirePrdPhase(RdmRequirement req, String action) {
        String status = req.getStatus();
        if (PRD_PHASE_STATUSES.contains(status)) {
            return;
        }
        String label = configService.statusLabelMap().getOrDefault(status, status);
        throw new BusinessException("需求當前狀態「" + label + "」，請先接受需求（受理）後再" + action);
    }

    /** 标题行哨兵：htmlToLines 用它保留「这行是标题」的信息，供验收标准节判定边界 */
    private static final String HEADING_MARK = "\u0001";

    /** PRD 正文其它节标题（判定验收标准节结束；带不带【】都算，AI 草稿与人工书写都覆盖） */
    private static final Set<String> PRD_SECTION_TITLES = Set.of(
            "目標用戶與使用場景", "功能清單", "範圍邊界", "風險與依賴");

    /**
     * 从 PRD 富文本正文抽取「驗收標準」节为逐行验收标准。
     * <p>表单精简后验收标准不再是独立录入项：产品经理在需求说明里以「驗收標準」
     * （或 Acceptance Criteria）为独立标题写成一节（清单尤佳），保存时在此抽回结构化列。
     * <p>节的结束边界：下一个标题行、下一个【…】标记行、或其它已知节标题。
     *
     * @return 抽到的逐行文本（节存在但为空时返回空串）；正文没有该节时返回 null（调用方保留旧值）
     */
    static String extractAcceptanceCriteria(String contentRich) {
        if (!StringUtils.hasText(contentRich)) {
            return null;
        }
        List<String> criteria = new ArrayList<>();
        boolean inSection = false;
        for (String raw : htmlToLines(contentRich)) {
            String line = raw.trim();
            if (line.isEmpty()) {
                continue;
            }
            String bare = stripBrackets(line.startsWith(HEADING_MARK) ? line.substring(1) : line).trim();
            if (bare.equals("驗收標準") || bare.equalsIgnoreCase("acceptance criteria")) {
                inSection = true;
                continue;
            }
            if (!inSection) {
                continue;
            }
            // 已进入验收节：标题行 / 【…】标记行 / 其它已知节标题都代表本节结束
            if (line.startsWith(HEADING_MARK) || isBracketMarker(line) || PRD_SECTION_TITLES.contains(bare)) {
                break;
            }
            criteria.add(line);
        }
        return inSection ? String.join("\n", criteria) : null;
    }

    /** 块级标签换行 + 去标签 + 实体还原，把富文本变成状态机可读的行序列；标题行带哨兵前缀 */
    private static List<String> htmlToLines(String html) {
        String s = html.replaceAll("(?i)<h[1-6][^>]*>", HEADING_MARK)
                .replaceAll("(?i)</(li|p|h[1-6]|blockquote|div|tr)>", "\n")
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("<[^>]+>", "");
        s = s.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
                .replace("&amp;", "&");
        return Arrays.asList(s.split("\n", -1));
    }

    /** 【…】全角括号标记行（AI 草稿的节标记形态） */
    private static boolean isBracketMarker(String line) {
        return line.startsWith("【") && line.endsWith("】") && line.length() > 2;
    }

    /** 去掉【】括号取节标题裸文 */
    private static String stripBrackets(String line) {
        return isBracketMarker(line) ? line.substring(1, line.length() - 1) : line;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePrd(Long id) {
        RdmPrd prd = requirePrd(id);
        accessGuard.requireDeliveryWriter(prd.getReqId(), "刪除 PRD");
        if (!PRD_DRAFT.equals(prd.getStatus())) {
            throw new BusinessException("僅草稿狀態的 PRD 可刪除，已評審的請走需求變更");
        }
        prdMapper.deleteById(id);
    }

    /* ==================== 评审 ==================== */

    @Override
    public List<RdmDeliveryVO.Review> listReviews(Long reqId) {
        accessGuard.requireVisible(reqId, "查看評審記錄");
        return reviewMapper.selectList(new LambdaQueryWrapper<RdmReview>()
                        .eq(RdmReview::getReqId, reqId).orderByDesc(RdmReview::getId))
                .stream().map(this::toReviewVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Review createReview(RdmDeliveryDTO.Review dto) {
        if (dto == null || dto.getReqId() == null) {
            throw new BusinessException("請選擇要評審的需求");
        }
        RdmRequirement req = requireRequirement(dto.getReqId());
        accessGuard.requireDeliveryWriter(req.getId(), "發起評審");
        requirePrdPhase(req, "發起評審");
        String reviewType = normalizeReviewType(dto.getReviewType());
        SysUser current = operatorResolver.currentUser();
        List<Long> participants = dto.getParticipantIds() == null ? List.of() : dto.getParticipantIds();
        RdmReview review = new RdmReview();
        review.setReviewNo(bizSeqService.next(SEQ_REVIEW));
        review.setReqId(req.getId());
        review.setPrdId(dto.getPrdId());
        review.setReviewType(reviewType);
        review.setReviewTime(parseDateTime(dto.getReviewTime()));
        review.setParticipants(joinNames(participants));
        review.setParticipantIds(joinIds(participants));
        review.setConclusion(REVIEW_PENDING);
        review.setConclusionDesc(dto.getConclusionDesc());
        review.setAffectsScheduleFlag(0);
        review.setCreatedBy(operatorResolver.operatorSignature(current));
        review.setUpdatedBy(review.getCreatedBy());
        reviewMapper.insert(review);

        if (dto.getPrdId() != null) {
            RdmPrd prd = requirePrd(dto.getPrdId());
            prd.setStatus(PRD_REVIEWING);
            prdMapper.updateById(prd);
            /*
             * PRD 已输出并提交评审 = 产品经理对「承诺出 PRD 日期」的兑现时点，
             * 任务在此时收口；评审通过与否是质量问题，不改变「PRD 已交」这个事实。
             * 只有挂了 PRD 的评审才收口，避免“无 PRD 的形式评审”误关产品任务。
             */
            prdTaskService.completeTask(req.getId(), current);
        }
        // V3 分批交付：需求層不因評審而推進狀態（自動跳過，不再把錯誤帶回主流程）
        tryTransition(req.getId(), RdmConstants.ACTION_REVIEW_START, null);
        // 評審已發起＝評審中的事實：狀態落在受理/PRD 設計時一併對齊（V3 自動跳過）
        alignQuietly(req.getId());
        notifyService.notifyUserIds(RdmConstants.EVENT_REVIEW_TODO, req, participants,
                "需求評審邀約", "### 📝 需求評審邀約\n\n- **編號**: " + req.getReqNo()
                        + "\n- **標題**: " + req.getTitle()
                        + "\n- **評審類型**: " + reviewTypeLabel(reviewType)
                        + "\n- **發起人**: " + (current == null ? "-" : current.getName())
                        + "\n\n請按時參加並預先閱覽 PRD。");
        return toReviewVO(reviewMapper.selectById(review.getId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Review decideReview(Long id, RdmDeliveryDTO.ReviewDecision dto) {
        RdmReview review = reviewMapper.selectById(id);
        if (review == null) {
            throw new BusinessException("評審記錄不存在");
        }
        if (!REVIEW_PENDING.equals(review.getConclusion())) {
            throw new BusinessException("該評審已出結論，不能重復錄入");
        }
        // 参与人字段原先只用来发通知，录结论时不看，等于任何人都能给别人的评审签字
        accessGuard.requireReviewParticipant(review, "録入評審結論");
        boolean passed = Boolean.TRUE.equals(dto.getPassed());
        if (!passed && !StringUtils.hasText(dto.getRemark())) {
            throw new BusinessException("評審退回必須填寫退回原因");
        }
        SysUser current = operatorResolver.currentUser();
        review.setConclusion(passed ? REVIEW_PASSED : REVIEW_REJECTED);
        review.setConclusionDesc(StringUtils.hasText(dto.getConclusionDesc()) ? dto.getConclusionDesc() : dto.getRemark());
        review.setReviewTime(review.getReviewTime() == null ? LocalDateTime.now() : review.getReviewTime());
        review.setUpdatedBy(operatorResolver.operatorSignature(current));
        reviewMapper.updateById(review);

        if (review.getPrdId() != null) {
            RdmPrd prd = prdMapper.selectById(review.getPrdId());
            if (prd != null) {
                prd.setStatus(passed ? PRD_APPROVED : PRD_REJECTED);
                prd.setReviewTime(LocalDateTime.now());
                prd.setReviewConclusion(review.getConclusionDesc());
                prdMapper.updateById(prd);
                // 结论落定的同时冻结一版：事后能回答「这次评审通过的到底是哪一版内容」
                snapshotPrd(prd, review, passed, current);
            }
        }
        tryTransition(review.getReqId(),
                passed ? RdmConstants.ACTION_REVIEW_PASS : RdmConstants.ACTION_REVIEW_REJECT,
                passed ? null : remarkOnly(review.getConclusionDesc()));
        // 评审退回意味着 PRD 需要返工：把已收口的 PRD 任务重新打开，否则甘特图上永远显示「已完成」
        if (!passed && review.getPrdId() != null) {
            prdTaskService.reopenTask(review.getReqId(), current);
        }
        // 結論已定＝評審結束的事實：狀態若還停在受理/PRD 設計，一併補到事實位置（V3 自動跳過）
        alignQuietly(review.getReqId());
        return toReviewVO(reviewMapper.selectById(id));
    }

    /* ==================== 执行任务与工时 ==================== */

    @Override
    public List<RdmDeliveryVO.Task> listTasks(Long reqId) {
        accessGuard.requireVisible(reqId, "查看任務清單");
        return taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                        .eq(RdmWorkTask::getReqId, reqId).orderByAsc(RdmWorkTask::getId))
                .stream().map(t -> toTaskVO(t, null)).toList();
    }

    @Override
    public List<RdmDeliveryVO.Task> myTasks(String status) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            return List.of();
        }
        LambdaQueryWrapper<RdmWorkTask> wrapper = new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, current.getId())
                .orderByAsc(RdmWorkTask::getPlanFinishDate)
                .orderByDesc(RdmWorkTask::getId);
        if (StringUtils.hasText(status)) {
            wrapper.eq(RdmWorkTask::getStatus, status);
        }
        /*
         * 不传 status 就是真的全部：之前默认退化成“未完成”，导致工作台「全部」页签
         * 永远看不到已完成任务（端到端测试实测）。该页默认视图就是未完成，
         * 是由前端 filter 保证的，服务端不应替调用方做这个决定。
         */
        List<RdmWorkTask> tasks = taskMapper.selectList(wrapper.last("LIMIT 100"));
        List<RdmDeliveryVO.Task> list = new ArrayList<>();
        for (RdmWorkTask t : tasks) {
            RdmRequirement req = requirementMapper.selectById(t.getReqId());
            list.add(toTaskVO(t, req));
        }
        return list;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Task saveTask(RdmDeliveryDTO.Task dto) {
        if (dto == null || dto.getReqId() == null || !StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("請選擇需求並填寫任務標題");
        }
        if (!StringUtils.hasText(dto.getTaskType())) {
            throw new BusinessException("請選擇任務類型");
        }
        RdmRequirement req = requireRequirement(dto.getReqId());
        // 审批（准入）通过前不允许建任务：草稿/待准入/准入驳回的需求还没有交付范围，
        // 此时建任务会以「未承诺的工作」进入负载与统计，也会在交付流程未定时制造混合数据。
        if (TASK_BLOCKED_STATUSES.contains(req.getStatus())) {
            throw new BusinessException("需求尚未通過審批（准入），不能創建或修改任務");
        }
        accessGuard.requireDeliveryWriter(req.getId(), "指派/維護任務");
        validateTaskForm(dto);
        SysUser current = operatorResolver.currentUser();
        SysUser owner = dto.getOwnerUserId() == null ? null : userMapper.selectById(dto.getOwnerUserId());
        if (dto.getOwnerUserId() != null && owner == null) {
            throw new BusinessException("任務負責人不存在或已停用");
        }
        if (owner != null) {
            requireTaskOwnerActive(owner);
        }

        RdmWorkTask task = dto.getId() == null ? new RdmWorkTask() : requireTask(dto.getId());
        if (task.getId() != null) {
            // 改已有任务时以任务上的需求为准，不信前端传的 reqId（否则可以把任务挂到别人需求下）
            accessGuard.requireDeliveryWriter(task.getReqId(), "編輯任務");
        }
        // 排期乐观锁快照：记录改前日期/负责人，用于判断是否需要自增 plan_version
        java.time.LocalDate oldPlanStart = task.getPlanStartDate();
        java.time.LocalDate oldPlanFinish = task.getPlanFinishDate();
        Long oldOwner = task.getOwnerUserId();
        if (task.getId() == null) {
            task.setTaskNo(bizSeqService.next(SEQ_TASK));
            task.setReqId(req.getId());
            task.setStatus(TASK_TODO);
            task.setProgress(0);
            task.setCreatedBy(operatorResolver.operatorSignature(current));
        }
        // 任务19 / 缺口2：任务可归属到具体交付项（V3 分批交付）。deliveryItemId 必须真实存在、
        // 属于该任务所在需求、且需求为 V3；否则会把任务挂到别人的交付项或非分批交付需求上，破坏交付项进度推导。
        task.setDeliveryItemId(resolveTaskDeliveryItemId(dto.getDeliveryItemId(), task));
        task.setPrdId(dto.getPrdId());
        task.setTaskType(dto.getTaskType());
        task.setTitle(dto.getTitle().trim());
        task.setContent(dto.getContent());
        task.setOwnerUserId(owner == null ? null : owner.getId());
        task.setOwnerEmpNo(owner == null ? null : owner.getEmpId());
        task.setOwnerName(owner == null ? null : owner.getName());
        task.setRoleCode(roleOfTaskType(dto.getTaskType()));
        task.setPlanHours(dto.getPlanHours());
        task.setPlanStartDate(parseDate(dto.getPlanStartDate()));
        task.setPlanFinishDate(parseDate(dto.getPlanFinishDate()));
        /*
         * 归属体系改造：任务迭代继承需求（单一真值源），忽略前端独立传值。
         * 改造前任务表单可选自己的迭代，与需求迭代是两份独立字段——研发侧填的迭代
         * 与需求排期的迭代可能不同，按迭代统计需求与任务就分裂了（本次改造要修的根因）。
         */
        task.setIterationCode(req.getIterationCode());
        task.setUpdatedBy(operatorResolver.operatorSignature(current));
        // 排期乐观锁：新建初始版本 1；改期/改负责人自增，与甘特拖拽共用同一版本防互盖
        if (task.getId() == null) {
            task.setPlanVersion(1);
        } else if (!java.util.Objects.equals(oldPlanStart, task.getPlanStartDate())
                || !java.util.Objects.equals(oldPlanFinish, task.getPlanFinishDate())
                || !java.util.Objects.equals(oldOwner, task.getOwnerUserId())) {
            task.setPlanVersion((task.getPlanVersion() == null ? 1 : task.getPlanVersion()) + 1);
        }
        if (task.getId() == null) {
            taskMapper.insert(task);
        } else {
            taskMapper.updateById(task);
        }
        // 任务挂到交付项后立即回推状态：有进行中/已完成任务 → 研发中，才能继续提测
        if (task.getDeliveryItemId() != null) {
            deliveryItemService.recalculateStatus(task.getDeliveryItemId());
        }
        // 任务负责人自动成为需求参与人，否则他在详情页看不到任何可执行动作
        bindParticipant(req.getId(), owner, task.getRoleCode());
        if (owner != null && task.getId() != null) {
            notifyService.notifyUserIds(RdmConstants.EVENT_TASK_ASSIGNED, req, List.of(owner.getId()),
                    "新任務已指派給你", "### 🧩 新任務待處理\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                            + "\n- **任務**: " + task.getTitle()
                            + "\n- **類型**: " + taskTypeLabel(task.getTaskType())
                            + (task.getPlanFinishDate() == null ? "" : "\n- **計劃完成**: " + task.getPlanFinishDate()));
        }
        return toTaskVO(taskMapper.selectById(task.getId()), req);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Task assignTaskOwner(Long taskId, Long ownerUserId, Integer expectedPlanVersion) {
        if (taskId == null || ownerUserId == null) {
            throw new BusinessException("請選擇要指派的任務與被指派人");
        }
        RdmWorkTask task = requireTask(taskId);
        if ("done".equals(task.getStatus()) || "cancelled".equals(task.getStatus())) {
            throw new BusinessException("任務已完成或已取消，不能再指派負責人");
        }
        // 以任务上的需求为准反查裁决，权限与 saveTask「指派/維護任務」同源（不信前端传需求）
        RdmRequirement req = requireRequirement(task.getReqId());
        accessGuard.requireDeliveryWriter(req.getId(), "指派任務");

        SysUser owner = userMapper.selectById(ownerUserId);
        if (owner == null) {
            throw new BusinessException("被指派人不存在或已停用");
        }
        requireTaskOwnerActive(owner);
        String roleCode = roleOfTaskType(task.getTaskType());

        SysUser current = operatorResolver.currentUser();
        int expected = expectedPlanVersion != null ? expectedPlanVersion
                : (task.getPlanVersion() == null ? 1 : task.getPlanVersion());
        // 乐观锁：以 expected 版本为条件写 owner 快照并自增版本；affected==0 说明已被他人改，拒。
        int affected = taskMapper.update(null, new LambdaUpdateWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getId, task.getId())
                .eq(RdmWorkTask::getPlanVersion, expected)
                .set(RdmWorkTask::getOwnerUserId, owner.getId())
                .set(RdmWorkTask::getOwnerEmpNo, owner.getEmpId())
                .set(RdmWorkTask::getOwnerName, owner.getName())
                .set(RdmWorkTask::getRoleCode, roleCode)
                .set(RdmWorkTask::getPlanVersion, expected + 1)
                .set(RdmWorkTask::getUpdatedBy, operatorResolver.operatorSignature(current)));
        if (affected == 0) {
            throw new BusinessException(ResultCode.CONFLICT.getCode(), "任務已被他人修改，請刷新後重試");
        }
        // 被指派人自动成为需求参与人（与 saveTask 同源），否则他在详情页看不到可执行动作
        bindParticipant(req.getId(), owner, roleCode);
        RdmWorkTask saved = taskMapper.selectById(task.getId());
        notifyService.notifyUserIds(RdmConstants.EVENT_TASK_ASSIGNED, req, List.of(owner.getId()),
                "新任務已指派給你", "### 🧩 新任務待處理\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                        + "\n- **任務**: " + saved.getTitle()
                        + "\n- **類型**: " + taskTypeLabel(saved.getTaskType())
                        + (saved.getPlanFinishDate() == null ? "" : "\n- **計劃完成**: " + saved.getPlanFinishDate()));
        log.info("RDM 负载页任务指派: task={}, owner={}, operator={}", saved.getTaskNo(), owner.getName(),
                operatorResolver.operatorSignature(current));
        return toTaskVO(saved, req);
    }

    /**
     * 校验并解析任务的交付项归属（任务19 / 缺口2）。
     * <p>requestedId 为空时：编辑保留任务原有归属，新建则为空（V1/V2 或尚未拆交付项）。
     * 非空时：交付项必须存在、属于该任务所在需求、且需求为 V3。
     */
    private Long resolveTaskDeliveryItemId(Long requestedId, RdmWorkTask task) {
        if (requestedId == null) {
            return task.getDeliveryItemId();
        }
        com.mftb.admin.entity.RdmDeliveryItem item = deliveryItemMapper.selectById(requestedId);
        if (item == null) {
            throw new BusinessException("交付項不存在");
        }
        if (task.getReqId() == null || !task.getReqId().equals(item.getReqId())) {
            throw new BusinessException("交付項不屬於該需求，不能把任務掛到其他需求的交付項下");
        }
        if (!flowVersionGuard.isDeliveryItemFlowV3(requestedId)) {
            throw new BusinessException("僅分批交付流程（V3）的需求可把任務歸屬到交付項");
        }
        return requestedId;
    }

    @Override
    public RdmDeliveryVO.OwnerCheck checkTaskOwner(Long userId) {
        RdmDeliveryVO.OwnerCheck check = new RdmDeliveryVO.OwnerCheck();
        check.setAble(true);
        if (userId == null) {
            return check;
        }
        SysUser owner = userMapper.selectById(userId);
        if (owner == null) {
            check.setAble(false);
            check.setHardBlocked(true);
            check.setWarning("該員工不存在或已刪除，請重新選擇負責人");
            return check;
        }
        check.setOwnerName(owner.getName());
        // 部门快照一并回传：表单的「所屬部門」是派生字段，编辑态也得能带出来
        check.setDepartment(owner.getDepartment());
        if (isInactive(owner)) {
            check.setAble(false);
            check.setHardBlocked(true);
            check.setWarning(ownerInactiveWarning(owner));
            return check;
        }
        if (!canOwnerReportProgress(owner)) {
            check.setAble(false);
            check.setWarning(ownerNoPermissionWarning(owner));
        }
        return check;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Task updateTaskProgress(Long id, RdmDeliveryDTO.TaskProgress dto) {
        RdmWorkTask task = requireTask(id);
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        accessGuard.requireVisible(task.getReqId(), "查看任務");
        // 上报进度的合法人群：任务负责人本人，或 PM/研发负责人/PMO 与全量授权者。
        // 原先只认负责人：owner 为空时反而任何人都能改，且负责人离职后没人能更正
        accessGuard.requireTaskOperator(task.getReqId(), task.getOwnerUserId(), "上報任務進度");
        if (dto.getProgress() != null && (dto.getProgress() < 0 || dto.getProgress() > 100)) {
            throw new BusinessException("進度只能在 0-100 之間");
        }
        String action = dto.getAction() == null ? "" : dto.getAction();
        LocalDateTime now = LocalDateTime.now();
        int oldProgress = task.getProgress() == null ? 0 : task.getProgress();
        String oldStatus = task.getStatus();
        boolean prdTask = RdmPrdTaskService.TASK_TYPE_PRD.equals(task.getTaskType());
        /*
         * 幂等重试：甘特图松手即保存可能因超时重发。若期望值已过期、但目标值恰好就是库中值，
         * 说明上一次其实已经成功，直接返回成功；否则会把「请求已生效」误报成并发冲突。
         */
        if ("progress".equals(action) && dto.getExpectedProgress() != null && dto.getProgress() != null
                && dto.getProgress().equals(oldProgress)) {
            return toTaskVO(task, requirementMapper.selectById(task.getReqId()));
        }
        // 乐观锁：期望进度与库中不一致说明别人已经改过，必须刷新后再改（不用 version 列，进度本身就是版本）
        if (dto.getExpectedProgress() != null && !dto.getExpectedProgress().equals(oldProgress)) {
            throw new BusinessException(ResultCode.CONFLICT.getCode(), "任務進度已被他人修改，請刷新後重試");
        }
        switch (action) {
            case "start" -> {
                task.setStatus(TASK_DOING);
                task.setActualStartTime(task.getActualStartTime() == null ? now : task.getActualStartTime());
                if (dto.getProgress() != null) {
                    task.setProgress(dto.getProgress());
                }
            }
            case "progress" -> {
                if (dto.getProgress() == null) {
                    throw new BusinessException("請提供進度百分比");
                }
                if (TASK_DONE.equals(task.getStatus()) || TASK_CANCELLED.equals(task.getStatus())) {
                    throw new BusinessException("任務已完成或已取消，不能調整進度");
                }
                if (TASK_BLOCKED.equals(task.getStatus())) {
                    throw new BusinessException("任務處於阻塞狀態，請先解除阻塞再調整進度");
                }
                /*
                 * PRD 任务的 100% 不是普通进度，而是「PRD 已提交评审」的业务事实：
                 * 允许手动置满会出现「任务显示完成、需求却仍在 PRD 产出中」，必须走提交评审。
                 */
                if (prdTask && dto.getProgress() >= 100) {
                    throw new BusinessException("PRD 任務的 100% 以「提交評審」為準，請在需求詳情提交評審");
                }
                if (!prdTask && dto.getProgress() >= 100) {
                    throw new BusinessException("進度 100% 會把任務標記為完成，請改用「完成任務」並填寫交付說明");
                }
                if (TASK_TODO.equals(task.getStatus()) && dto.getProgress() > 0) {
                    task.setStatus(TASK_DOING);
                    task.setActualStartTime(task.getActualStartTime() == null ? now : task.getActualStartTime());
                }
                task.setProgress(dto.getProgress());
            }
            case "done" -> {
                // PRD 任务的完成时点是「提交评审」，不能从进度上报入口手动置完成
                if (prdTask) {
                    throw new BusinessException("PRD 任務的完成以「提交評審」為準，不能手動標記完成");
                }
                /*
                 * 完成必须留下一句交付说明或交付物链接：「100%」本身不是证据，
                 * 没有它一旦出问题根本无法复盘当时交的是什么。
                 */
                if (!StringUtils.hasText(dto.getRemark())) {
                    throw new BusinessException("完成任務必須填寫交付說明或交付物連結");
                }
                task.setStatus(TASK_DONE);
                task.setProgress(100);
                task.setActualFinishTime(now);
                task.setBlockedReason(null);
            }
            case "block" -> {
                if (!StringUtils.hasText(dto.getRemark())) {
                    throw new BusinessException("標記阻塞必須填寫阻塞原因");
                }
                task.setStatus(TASK_BLOCKED);
                task.setBlockedReason(dto.getRemark());
            }
            case "unblock" -> {
                task.setStatus(TASK_DOING);
                task.setBlockedReason(null);
            }
            default -> throw new BusinessException("不支持的進度動作: " + action);
        }
        if (dto.getActualHours() != null) {
            // 实际工时不再直写任务列，而是落成当日明细后回算汇总：
            // 任务上那个孤立数字既不能区分谁投入，也不能支撑负载与估时偏差
            recordWorkLog(task, dto.getActualHours(), StringUtils.hasText(dto.getRemark()) ? dto.getRemark() : "進度上報時帶入", current, LocalDate.now());
        }
        task.setActualHours(sumWorkHours(task.getId()));
        task.setUpdatedBy(operatorResolver.operatorSignature(current));
        /*
         * 用条件更新做乐观锁：expectedProgress 作为 WHERE 条件，避免「先查后写」之间被另一入口插队。
         * 不用 updateById 是因为它无法携带期望值，并发下会静默 last-write-wins。
         */
        LambdaUpdateWrapper<RdmWorkTask> update = new LambdaUpdateWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getId, id)
                .set(RdmWorkTask::getStatus, task.getStatus())
                .set(RdmWorkTask::getProgress, task.getProgress())
                .set(RdmWorkTask::getActualStartTime, task.getActualStartTime())
                .set(RdmWorkTask::getActualFinishTime, task.getActualFinishTime())
                .set(RdmWorkTask::getBlockedReason, task.getBlockedReason())
                .set(RdmWorkTask::getActualHours, task.getActualHours())
                .set(RdmWorkTask::getUpdatedBy, task.getUpdatedBy())
                .set(RdmWorkTask::getUpdatedAt, now);
        if (dto.getExpectedProgress() != null) {
            if (dto.getExpectedProgress() == 0) {
                // 存量任务的 progress 可能是 NULL：与 0 视为同一版本，否则首次拖动会被误判成并发冲突
                update.and(w -> w.isNull(RdmWorkTask::getProgress).or().eq(RdmWorkTask::getProgress, 0));
            } else {
                update.eq(RdmWorkTask::getProgress, dto.getExpectedProgress());
            }
        }
        int affected = taskMapper.update(null, update);
        if (affected == 0) {
            throw new BusinessException(ResultCode.CONFLICT.getCode(), "任務進度已被他人修改，請刷新後重試");
        }
        // 审计：只有进度或状态真的变了才落行，避免重复上报同一数值制造噪音
        int newProgress = task.getProgress() == null ? 0 : task.getProgress();
        if (oldProgress != newProgress || !java.util.Objects.equals(oldStatus, task.getStatus())) {
            RdmTaskProgressLog audit = new RdmTaskProgressLog();
            audit.setTaskId(task.getId());
            audit.setTaskNo(task.getTaskNo());
            audit.setReqId(task.getReqId());
            audit.setUserId(current.getId());
            audit.setUserName(current.getName());
            audit.setOldProgress(oldProgress);
            audit.setNewProgress(newProgress);
            audit.setOldStatus(oldStatus);
            audit.setNewStatus(task.getStatus());
            audit.setRemark(dto.getRemark());
            audit.setClientRequestId(dto.getClientRequestId());
            progressLogMapper.insert(audit);
        }

        // 任务完成/阻塞会改变交付项阶段（研发中 → 可提测），进度上报后同步重算
        if (task.getDeliveryItemId() != null) {
            deliveryItemService.recalculateStatus(task.getDeliveryItemId());
        }

        RdmRequirement req = requirementMapper.selectById(task.getReqId());
        if (req != null) {
            syncRequirementByTasks(req, task);
            syncBlockedFlag(req);
        }
        return toTaskVO(taskMapper.selectById(id), req);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteTask(Long id) {
        RdmWorkTask task = requireTask(id);
        accessGuard.requireDeliveryWriter(task.getReqId(), "刪除任務");
        /*
         * 已完成且有工时事实的任务不能删（否则产出与负载会被静默抹掉）；
         * 但已完成却从未填报过任何工时的任务可以删：不删它会永久卡在
         * 「實際工時已填報」这道上线闸门里，而它本来就没有任何可保留的事实。
         */
        BigDecimal reported = sumWorkHours(task.getId());
        boolean hasEffortFact = (reported != null && reported.signum() > 0)
                || (task.getActualHours() != null && task.getActualHours().signum() > 0)
                || (task.getActualFinishTime() != null && reported != null);
        if (TASK_DONE.equals(task.getStatus()) && hasEffortFact) {
            throw new BusinessException("已完成且已填報工時的任務不允許刪除（如計錯請先修正工時）");
        }
        taskMapper.deleteById(id);
    }

    @Override
    public RdmDeliveryVO.DeliverySummary summary(Long reqId) {
        // 汇总页只裁决一次：下面的明细方法自己也会校，但汇总已经拿到位需求，重复查角色没意义
        RdmRequirement req = accessGuard.requireVisible(reqId, "查看交付過程");
        RdmDeliveryVO.DeliverySummary summary = new RdmDeliveryVO.DeliverySummary();
        summary.setReqId(reqId);
        summary.setStatus(req.getStatus());
        summary.setPrds(prdMapper.selectList(prdQuery(reqId)).stream().map(this::toPrdVO).toList());
        summary.setReviews(reviewMapper.selectList(new LambdaQueryWrapper<RdmReview>()
                        .eq(RdmReview::getReqId, reqId).orderByDesc(RdmReview::getId))
                .stream().map(this::toReviewVO).toList());
        summary.setChanges(changeMapper.selectList(new LambdaQueryWrapper<RdmChangeRequest>()
                        .eq(RdmChangeRequest::getReqId, reqId).orderByDesc(RdmChangeRequest::getId))
                .stream().map(this::toChangeVO).toList());
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId).orderByAsc(RdmWorkTask::getId));
        summary.setTasks(tasks.stream().map(t -> toTaskVO(t, req)).toList());
        summary.setTaskTotal(tasks.size());
        summary.setTaskDone((int) tasks.stream().filter(t -> TASK_DONE.equals(t.getStatus())).count());
        summary.setTaskBlocked((int) tasks.stream().filter(t -> TASK_BLOCKED.equals(t.getStatus())).count());
        summary.setOverallProgress(tasks.isEmpty() ? 0
                : (int) Math.round(tasks.stream().mapToInt(t -> t.getProgress() == null ? 0 : t.getProgress()).average().orElse(0)));
        summary.setPlanHoursTotal(sum(tasks, RdmWorkTask::getPlanHours));
        summary.setActualHoursTotal(sum(tasks, RdmWorkTask::getActualHours));
        summary.setMilestones(milestones(reqId));
        summary.setUnreportedHoursTasks((int) tasks.stream()
                .filter(t -> TASK_DONE.equals(t.getStatus()))
                .filter(t -> t.getActualHours() == null || t.getActualHours().signum() == 0)
                .count());
        Map<String, BigDecimal> hours = new LinkedHashMap<>();
        for (RdmWorkTask t : tasks) {
            BigDecimal actual = t.getActualHours() == null ? BigDecimal.ZERO : t.getActualHours();
            hours.merge(taskTypeLabel(t.getTaskType()), actual, BigDecimal::add);
        }
        hours.forEach((name, value) -> summary.getHoursByType().add(new RdmDeliveryVO.NameValue(name, value.doubleValue())));
        return summary;
    }

    /* ==================== 迭代 ==================== */

    @Override
    public List<RdmDeliveryVO.Iteration> listIterations() {
        return listIterations(null, null, null);
    }

    /**
     * 迭代候选（支持远程搜索）：关键词匹配迭代编码/名称或所属项目编号/名称。
     * <p>带关键词默认只回 20 条：下拉候选不需要全量，回得少才能快；无关键词保持 100 条供迭代排期等
     * 需要完整列表的页面。limit 上限 200，防止调用方把快照拉回无界。
     * <p>指定 projectId 时同时保留未挂项目的迭代：紧急修复迭代不属于任何项目，但规则要能选到它。
     */
    @Override
    public List<RdmDeliveryVO.Iteration> listIterations(String keyword, Long projectId, Integer limit) {
        boolean searching = StringUtils.hasText(keyword);
        int cap = limit == null ? (searching ? 20 : 100) : Math.min(Math.max(limit, 1), 200);
        LambdaQueryWrapper<RdmIteration> wrapper = new LambdaQueryWrapper<RdmIteration>()
                .orderByDesc(RdmIteration::getStartDate)
                .last("LIMIT " + cap);
        if (projectId != null) {
            wrapper.and(w -> w.eq(RdmIteration::getProjectId, projectId)
                    .or().isNull(RdmIteration::getProjectId));
        }
        if (searching) {
            String kw = keyword.trim();
            String like = "%" + kw + "%";
            // 未选项目时用户可能只记得项目名/编号：一并按所属项目匹配
            List<Long> matchedProjectIds = jdbcTemplate.queryForList(
                    "SELECT id FROM rdm_project WHERE project_no LIKE ? OR name LIKE ? LIMIT 50",
                    Long.class, like, like);
            wrapper.and(w -> {
                w.like(RdmIteration::getCode, kw).or().like(RdmIteration::getName, kw);
                if (!matchedProjectIds.isEmpty()) {
                    w.or().in(RdmIteration::getProjectId, matchedProjectIds);
                }
            });
        }
        List<RdmIteration> iterations = iterationMapper.selectList(wrapper);
        // 项目名批量联表（一次 IN 查询）：逐行查 rdm_project 会把迭代列表变成 N+1
        Map<Long, String> projectNames = new LinkedHashMap<>();
        List<Long> projectIds = iterations.stream().map(RdmIteration::getProjectId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (!projectIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(projectIds.size(), "?"));
            // rdm_project 建表即无 deleted 列（Batch 1），这里不能写 deleted = 0，否则真库报 Unknown column
            jdbcTemplate.queryForList(
                            "SELECT id, name FROM rdm_project WHERE id IN (" + placeholders + ")",
                            projectIds.toArray())
                    .forEach(row -> projectNames.put(((Number) row.get("id")).longValue(), String.valueOf(row.get("name"))));
        }
        // 需求数/任务数/工时按 code 批量聚合：逐条迭代查会随上限翻倍成 200 次往返，
        // 迭代下拉会慢到不可用（原 50 条已是 N+1，只是量小未暴露）
        List<String> codes = iterations.stream().map(RdmIteration::getCode)
                .filter(StringUtils::hasText).distinct().toList();
        Map<String, Integer> reqCounts = new LinkedHashMap<>();
        Map<String, Integer> taskCounts = new LinkedHashMap<>();
        Map<String, BigDecimal> taskHours = new LinkedHashMap<>();
        if (!codes.isEmpty()) {
            String in = String.join(",", java.util.Collections.nCopies(codes.size(), "?"));
            jdbcTemplate.queryForList(
                            "SELECT iteration_code, COUNT(*) AS cnt FROM rdm_requirement "
                                    + "WHERE deleted = 0 AND iteration_code IN (" + in + ") GROUP BY iteration_code",
                            codes.toArray())
                    .forEach(row -> reqCounts.put(String.valueOf(row.get("iteration_code")),
                            zeroIfNull(toInt(row.get("cnt")))));
            jdbcTemplate.queryForList(
                            "SELECT iteration_code, COUNT(*) AS task_cnt, "
                                    + "COALESCE(SUM(COALESCE(actual_hours, plan_hours)), 0) AS hours "
                                    + "FROM rdm_work_task WHERE deleted = 0 AND iteration_code IN (" + in + ") "
                                    + "GROUP BY iteration_code",
                            codes.toArray())
                    .forEach(row -> {
                        String code = String.valueOf(row.get("iteration_code"));
                        taskCounts.put(code, zeroIfNull(toInt(row.get("task_cnt"))));
                        Object hours = row.get("hours");
                        taskHours.put(code, hours == null ? BigDecimal.ZERO : new BigDecimal(hours.toString()));
                    });
        }
        List<RdmDeliveryVO.Iteration> list = new ArrayList<>();
        // 负责人工号批量回填：列表统一「姓名（工号）」，逐行查 sys_user 会把迭代下拉打成 N+1
        List<Long> ownerIds = iterations.stream().map(RdmIteration::getOwnerUserId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, String> ownerEmpNos = new LinkedHashMap<>();
        if (!ownerIds.isEmpty()) {
            userMapper.selectBatchIds(ownerIds).forEach(u -> {
                if (u.getId() != null && StringUtils.hasText(u.getEmpId())) {
                    ownerEmpNos.put(u.getId(), u.getEmpId());
                }
            });
        }
        for (RdmIteration it : iterations) {
            RdmDeliveryVO.Iteration vo = new RdmDeliveryVO.Iteration();
            vo.setId(it.getId());
            vo.setCode(it.getCode());
            vo.setName(it.getName());
            vo.setProjectId(it.getProjectId());
            vo.setProjectName(it.getProjectId() == null ? null : projectNames.get(it.getProjectId()));
            vo.setIterationType(it.getIterationType());
            vo.setStartDate(DateTimeUtils.format(it.getStartDate()));
            vo.setEndDate(DateTimeUtils.format(it.getEndDate()));
            vo.setCapacityHours(it.getCapacityHours());
            vo.setOwnerUserId(it.getOwnerUserId());
            vo.setOwnerName(it.getOwnerName());
            vo.setOwnerEmpNo(it.getOwnerUserId() == null ? null : ownerEmpNos.get(it.getOwnerUserId()));
            vo.setStatus(it.getStatus());
            vo.setRemark(it.getRemark());
            vo.setReqCount(reqCounts.getOrDefault(it.getCode(), 0));
            vo.setTaskCount(taskCounts.getOrDefault(it.getCode(), 0));
            vo.setTaskHours(taskHours.getOrDefault(it.getCode(), BigDecimal.ZERO));
            list.add(vo);
        }
        return list;
    }

    private static int zeroIfNull(Integer value) {
        return value == null ? 0 : value;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Iteration saveIteration(RdmDeliveryDTO.Iteration dto) {
        if (dto == null || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException("迭代名稱必填");
        }
        LocalDate start = parseDate(dto.getStartDate());
        LocalDate end = parseDate(dto.getEndDate());
        if (start == null || end == null || end.isBefore(start)) {
            throw new BusinessException("迭代起止日期不正確");
        }
        SysUser current = operatorResolver.currentUser();
        SysUser owner = dto.getOwnerUserId() == null ? null : userMapper.selectById(dto.getOwnerUserId());
        String type = StringUtils.hasText(dto.getIterationType()) ? dto.getIterationType() : "sprint";
        /*
         * 归属体系改造（v3.15）：sprint/version 必须挂项目，hotfix 可空（跨项目平台级热修，管理员已裁决）。
         * 类型字面量与前端 src/constants/rdm.ts RDM_ITERATION_TYPE 同源；项目存在性服务端校验，不信任前端。
         * 编辑存量未挂项目的迭代时同样会被拦下——这正是「警示+手工补挂」的落点。
         */
        Long projectId = dto.getProjectId();
        if (projectId == null && !"hotfix".equals(type)) {
            throw new BusinessException("常規迭代與版本專項必須選擇所屬項目（緊急修復可留空）");
        }
        if (projectId != null) {
            // rdm_project 无 deleted 列（Batch 1 建表即无），存在性判断只按主键
            Integer projectCnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM rdm_project WHERE id = ?", Integer.class, projectId);
            if (projectCnt == null || projectCnt == 0) {
                throw new BusinessException("所屬項目不存在");
            }
        }
        RdmIteration entity;
        if (dto.getId() == null) {
            entity = new RdmIteration();
            entity.setCreatedBy(operatorResolver.operatorSignature(current));
            // 編碼系統發號：前端傳入的 code 一律忽略，避免手工填號撞號與格式漂移
            entity.setCode(nextIterationCode(type));
        } else {
            entity = iterationMapper.selectById(dto.getId());
            if (entity == null) {
                throw new BusinessException("迭代不存在");
            }
            // 編輯不改編碼：需求/任務以 iteration_code 掛接迭代，改碼會斷鏈
        }
        entity.setName(dto.getName().trim());
        entity.setProjectId(projectId);
        entity.setIterationType(type);
        entity.setStartDate(start);
        entity.setEndDate(end);
        entity.setCapacityHours(dto.getCapacityHours() == null ? 0 : dto.getCapacityHours());
        entity.setOwnerUserId(owner == null ? null : owner.getId());
        entity.setOwnerName(owner == null ? null : owner.getName());
        entity.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "planning");
        entity.setRemark(dto.getRemark());
        entity.setUpdatedBy(operatorResolver.operatorSignature(current));
        if (entity.getId() == null) {
            iterationMapper.insert(entity);
        } else {
            iterationMapper.updateById(entity);
        }
        return listIterations().stream().filter(i -> i.getId().equals(entity.getId())).findFirst()
                .orElseThrow(() -> new BusinessException("迭代保存後讀取失敗"));
    }

    /**
     * 列表直改迭代状态。
     * <p>故意不走 {@link #saveIteration}：那条路径会把前端列表快照里的旧产能/旧起止一起回写，
     * 并发下等于拿过期数据覆盖别人的编辑；这里只回写 status 与操作人，
     * MyBatis-Plus updateById 默认跳过 null 字段，其余列原封不动。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateIterationStatus(Long id, String status) {
        if (id == null) {
            throw new BusinessException("請選擇迭代");
        }
        // 状态直接决定需求排期下拉能否选中本迭代，非法值必须在落库前挡掉
        if (!StringUtils.hasText(status) || !ITERATION_STATUSES.contains(status)) {
            throw new BusinessException("迭代狀態取值不正確");
        }
        RdmIteration current = iterationMapper.selectById(id);
        if (current == null) {
            throw new BusinessException("迭代不存在");
        }
        RdmIteration patch = new RdmIteration();
        patch.setId(id);
        patch.setStatus(status);
        patch.setUpdatedBy(operatorResolver.operatorSignature(operatorResolver.currentUser()));
        iterationMapper.updateById(patch);
        log.info("迭代狀態直改: code={}, {} -> {}", current.getCode(), current.getStatus(), status);
    }

    /**
     * 删除迭代（仅限未挂任何需求的空迭代）。
     *
     * <p>需求与任务都以 {@code iteration_code}（编码而非主键）挂接迭代，因此不能靠外键级联，
     * 必须在删除前逐表计数：有需求就拒绝（提示先移除/转移需求），有任务也拒绝
     * （任务虽必挂需求，但存量脏数据可能出现需求已删、任务未删的悬挂行）。
     * <p>删除走 {@code deleteById}，实体上有 {@code @TableLogic}，实际是 {@code deleted=1}，
     * 历史需求/报表里已固化的迭代编码快照不受影响。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteIteration(Long id) {
        if (id == null) {
            throw new BusinessException("請選擇要刪除的迭代");
        }
        RdmIteration current = iterationMapper.selectById(id);
        if (current == null) {
            throw new BusinessException("迭代不存在或已刪除");
        }
        Integer reqCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND iteration_code = ?",
                Integer.class, current.getCode());
        if (reqCount != null && reqCount > 0) {
            throw new BusinessException("該迭代下仍有 " + reqCount + " 條需求，請先移除或轉移需求後再刪除");
        }
        Integer taskCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_work_task WHERE deleted = 0 AND iteration_code = ?",
                Integer.class, current.getCode());
        if (taskCount != null && taskCount > 0) {
            throw new BusinessException("該迭代下仍有 " + taskCount + " 個任務，請先處理任務後再刪除");
        }
        iterationMapper.deleteById(id);
        log.info("刪除 RDM 迭代: id={}, code={}, operator={}",
                id, current.getCode(), operatorResolver.currentOperatorName());
    }

    /**
     * 按類型發迭代編碼（系統生成，前端不再收手工輸入）。
     * <p>取號後再查唯一鍵兜底：存量手工編碼理論上可能佔用同形狀號（如早年手工錄過
     * SP202610001），撞號則順延取下一個，重試 5 次仍撞則 fail-closed。
     */
    private String nextIterationCode(String iterationType) {
        String ruleKey = BizSeqService.ruleKeyForIterationType(iterationType);
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = bizSeqService.next(ruleKey);
            Long dup = iterationMapper.selectCount(new LambdaQueryWrapper<RdmIteration>()
                    .eq(RdmIteration::getCode, code));
            if (dup == null || dup == 0) {
                return code;
            }
        }
        throw new BusinessException("迭代編碼連續撞號，請重試或聯繫管理員");
    }

    /* ==================== 需求变更 ==================== */

    @Override
    public List<RdmDeliveryVO.Change> listChanges(Long reqId) {
        accessGuard.requireVisible(reqId, "查看需求變更");
        return changeMapper.selectList(new LambdaQueryWrapper<RdmChangeRequest>()
                        .eq(RdmChangeRequest::getReqId, reqId).orderByDesc(RdmChangeRequest::getId))
                .stream().map(this::toChangeVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryVO.Change applyChange(RdmDeliveryDTO.Change dto) {
        if (dto == null || dto.getReqId() == null) {
            throw new BusinessException("請選擇要變更的需求");
        }
        if (!StringUtils.hasText(dto.getAfterContent()) || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("變更內容與變更原因必填");
        }
        RdmRequirement req = requireRequirement(dto.getReqId());
        accessGuard.requireDeliveryWriter(req.getId(), "提交需求變更");
        boolean affectsSchedule = Boolean.TRUE.equals(dto.getAffectsSchedule());
        if (affectsSchedule && parseDate(dto.getNewPlanReleaseDate()) == null) {
            throw new BusinessException("影響排期的變更需填寫變更後的計劃上線日期");
        }
        SysUser current = operatorResolver.currentUser();

        RdmChangeRequest change = new RdmChangeRequest();
        change.setChangeNo(bizSeqService.next(SEQ_CHANGE));
        change.setReqId(req.getId());
        change.setPrdId(dto.getPrdId());
        change.setChangeType(StringUtils.hasText(dto.getChangeType()) ? dto.getChangeType() : "scope");
        change.setBeforeSnapshot(changeSnapshot(req));
        change.setAfterContent(dto.getAfterContent());
        change.setReason(dto.getReason());
        change.setImpactDesc(dto.getImpactDesc());
        change.setAffectsScheduleFlag(affectsSchedule ? 1 : 0);
        change.setAddedHours(dto.getAddedHours());
        change.setApprovalStatus(REVIEW_PENDING);
        change.setApplicantUserId(current == null ? null : current.getId());
        change.setApplicantName(current == null ? null : current.getName());
        change.setApplyTime(LocalDateTime.now());
        change.setCreatedBy(operatorResolver.operatorSignature(current));
        change.setUpdatedBy(change.getCreatedBy());

        OaRequestCreateDTO flow = new OaRequestCreateDTO();
        flow.setProcessCode(RdmConstants.CHANGE_PROCESS_CODE);
        flow.setTitle("需求變更：" + req.getTitle());
        Map<String, Object> form = new LinkedHashMap<>();
        form.put("changeNo", change.getChangeNo());
        form.put("reqNo", req.getReqNo());
        form.put("reqId", req.getId());
        form.put("changeType", change.getChangeType());
        form.put("afterContent", change.getAfterContent());
        form.put("reason", change.getReason());
        form.put("impactDesc", change.getImpactDesc());
        form.put("affectsSchedule", affectsSchedule);
        form.put("newPlanReleaseDate", dto.getNewPlanReleaseDate());
        flow.setFormData(JsonUtils.toJson(form));
        change.setFlowNo(oaRequestService.submit(flow));
        changeMapper.insert(change);

        List<Long> receivers = new ArrayList<>();
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null) {
            receivers.add(req.getDevOwnerUserId());
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_CHANGE_TODO, req, receivers,
                "需求變更待審批", "### 🔃 需求變更申請\n\n- **編號**: " + change.getChangeNo()
                        + "\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                        + "\n- **申請人**: " + change.getApplicantName()
                        + "\n- **變更內容**: " + change.getAfterContent()
                        + "\n- **原因**: " + change.getReason()
                        + (affectsSchedule ? "\n\n**注意：本次變更影響排期，審批後請同步更新計劃時間。**" : ""));
        return toChangeVO(changeMapper.selectById(change.getId()));
    }

    /* ==================== 内部辅助 ==================== */

    /**
     * 尝试推进需求状态：当前状态下没有该流转配置就跳过。
     * <p>走 {@link RdmRequirementService#tryAdvanceQuietly}（独立保存点）：失败只记日志，
     * 不会把调用方事务标成 rollback-only。旧写法直接 try/catch 调用 transition，
     * 内层抛错后外层事务已被标记“必须回滚”，于是 PRD 明明已写入，接口却整体 500。
     */
    private void tryTransition(Long reqId, String actionCode, RdmTransitionDTO payload) {
        try {
            requirementService.tryAdvanceQuietly(reqId, actionCode, payload);
        } catch (Exception e) {
            // 聯動失敗只損失一次狀態推進，不能影響主數據寫入（PRD/評審已經存好）
            log.info("交付過程聯動需求狀態未執行（不影響主數據）: reqId={}, action={}, reason={}",
                    reqId, actionCode, e.getMessage());
        }
    }

    /** 依既有 PRD / 評審事實對齊狀態（靜默）：對齊失敗不影響 PRD/評審主數據寫入 */
    private void alignQuietly(Long reqId) {
        try {
            requirementService.alignPrdPhaseStatus(reqId);
        } catch (Exception e) {
            log.info("需求 PRD 階段狀態對齊未完成（不影響主數據）: reqId={}, reason={}", reqId, e.getMessage());
        }
    }

    /** 任务完成后联动需求：设计完成→转开发、开发全完成→转测试、测试完成→转验收 */
    private void syncRequirementByTasks(RdmRequirement req, RdmWorkTask task) {
        if (!TASK_DONE.equals(task.getStatus())) {
            return;
        }
        List<RdmWorkTask> siblings = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId()));
        /*
         * 阶段联动按「这条需求实际存在的任务类型」判定，而不是写死前端+后端都要有：
         * 纯后端、纯 APP、只含数据任务的需求以前永远推不到「开发完成」，只能靠人手点流转。
         */
        String type = task.getTaskType() == null ? "" : task.getTaskType();
        if ("design".equals(type) && allDone(siblings, "design")) {
            tryTransition(req.getId(), RdmConstants.ACTION_DESIGN_DONE, null);
        }
        if (DEV_TYPES.contains(type) && allExistingDone(siblings, DEV_TYPES)) {
            tryTransition(req.getId(), RdmConstants.ACTION_DEV_DONE, null);
        }
        if ("qa".equals(type) && allExistingDone(siblings, Set.of("qa"))) {
            tryTransition(req.getId(), RdmConstants.ACTION_TEST_DONE, null);
            // 转验收需一切非取消状态的任务都已完成，否则测试完了但开发未交也能进验收
            if (allExistingDone(siblings, null)) {
                tryTransition(req.getId(), RdmConstants.ACTION_SUBMIT_UAT, null);
            }
        }
    }

    /** 开发阶段的任务类型（含 APP 与数据；实际存在哪几种就要求哪几种完成） */
    private static final Set<String> DEV_TYPES = Set.of("frontend", "app", "backend", "data");

    /** 任一任务阻塞则需求标记阻塞（风险雷达与逾期判定的输入） */
    private void syncBlockedFlag(RdmRequirement req) {
        Long blocking = taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, req.getId()).eq(RdmWorkTask::getStatus, TASK_BLOCKED));
        boolean blocked = blocking != null && blocking > 0;
        if ((req.getBlockedFlag() == null ? 0 : req.getBlockedFlag()) != (blocked ? 1 : 0)) {
            RdmRequirement patch = new RdmRequirement();
            patch.setId(req.getId());
            patch.setBlockedFlag(blocked ? 1 : 0);
            patch.setBlockedReason(blocked ? firstBlockedReason(req.getId()) : null);
            requirementMapper.updateById(patch);
        }
    }

    private String firstBlockedReason(Long reqId) {
        return taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                        .eq(RdmWorkTask::getReqId, reqId).eq(RdmWorkTask::getStatus, TASK_BLOCKED)
                        .orderByAsc(RdmWorkTask::getId).last("LIMIT 1"))
                .stream().findFirst().map(RdmWorkTask::getBlockedReason).orElse(null);
    }

    private static boolean allDone(List<RdmWorkTask> tasks, String taskType) {
        List<RdmWorkTask> scoped = taskType == null ? tasks
                : tasks.stream().filter(t -> taskType.equals(t.getTaskType())).toList();
        return !scoped.isEmpty() && scoped.stream().allMatch(t -> TASK_DONE.equals(t.getStatus()));
    }

    /**
     * 只看「本需求实际存在的类型」：已取消的任务不参与门槛判定。
     * <p>旧逻辑用 allDone(siblings, null) 要求一切任务都已完成，一张被取消的任务
     * 就能把需求永久卡在测试阶段，而取消本身已经表达了「这活不做了」。
     */
    private static boolean allExistingDone(List<RdmWorkTask> tasks, Set<String> types) {
        List<RdmWorkTask> scoped = tasks.stream()
                .filter(t -> !TASK_CANCELLED.equals(t.getStatus()))
                .filter(t -> types == null || types.contains(t.getTaskType()))
                .toList();
        return !scoped.isEmpty() && scoped.stream().allMatch(t -> TASK_DONE.equals(t.getStatus()));
    }

    private void bindParticipant(Long reqId, SysUser user, String roleCode) {
        if (reqId == null || user == null || !StringUtils.hasText(roleCode)) {
            return;
        }
        Long exists = roleMapper.selectCount(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, reqId)
                .eq(RdmRequirementRole::getUserId, user.getId())
                .eq(RdmRequirementRole::getRoleCode, roleCode));
        if (exists != null && exists > 0) {
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

    /** 任务类型 → 参与角色：按字典聚合桶映射（design→设计师、qa→测试、dev/未知→研发），字典缺行时沿用内置兜底 */
    private String roleOfTaskType(String taskType) {
        // PRD 產出是产品经理的职责：类型字典的 category=design 只用于工时聚合，
        // 角色分组必须落到 PM，否则甘特图会把产品经理的 PRD 任务显示在「設計師」组
        if (RdmPrdTaskService.TASK_TYPE_PRD.equals(taskType)) {
            return RdmConstants.ROLE_PM;
        }
        return switch (taskTypeService.categoryOf(taskType)) {
            case RdmTaskTypeConfig.CATEGORY_DESIGN -> RdmConstants.ROLE_DESIGNER;
            case RdmTaskTypeConfig.CATEGORY_QA -> RdmConstants.ROLE_QA;
            default -> RdmConstants.ROLE_DEV;
        };
    }

    /** 任务类型标签：优先字典 label（含停用），字典缺行时回显 code 原文（与前端 ?? v 口径一致） */
    private String taskTypeLabel(String taskType) {
        RdmTaskTypeConfig cfg = taskTypeService.resolveByCode(taskType);
        return cfg != null ? cfg.getLabel() : (taskType == null ? "" : taskType);
    }

    /**
     * 归一化评审类型：前端支持多选，逗号拼接后送入 review_type 列（VARCHAR(24)）。
     * 这里逐 token 去空格、去重并按白名单校验，未知 token 直接拒绝，
     * 避免任意字符串落库后展示端反查标签失败（安全边界在服务端，不信任前端传值）。
     */
    private static String normalizeReviewType(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new BusinessException("請選擇評審類型");
        }
        LinkedHashSet<String> types = new LinkedHashSet<>();
        for (String token : raw.split(",")) {
            String t = token.trim();
            if (t.isEmpty()) {
                continue;
            }
            if (!RdmConstants.REVIEW_TYPES.contains(t)) {
                throw new BusinessException("評審類型不正確: " + t);
            }
            types.add(t);
        }
        if (types.isEmpty()) {
            throw new BusinessException("請選擇評審類型");
        }
        return String.join(",", types);
    }

    /** 评审类型标签：支持逗号拼接多值（多选发起），单值标签以「 / 」连接；空值返回占位符 */
    static String reviewTypeLabel(String reviewType) {
        if (reviewType == null || reviewType.isBlank()) {
            return "-";
        }
        List<String> labels = new ArrayList<>();
        for (String token : reviewType.split(",")) {
            String t = token.trim();
            if (!t.isEmpty()) {
                labels.add(singleReviewTypeLabel(t));
            }
        }
        return String.join(" / ", labels);
    }

    private static String singleReviewTypeLabel(String reviewType) {
        return switch (reviewType) {
            case RdmConstants.REVIEW_TYPE_REQUIREMENT -> "需求評審";
            case RdmConstants.REVIEW_TYPE_DEV -> "研發評審";
            case RdmConstants.REVIEW_TYPE_UI -> "UI 評審";
            case RdmConstants.REVIEW_TYPE_TEST -> "測試評審";
            default -> reviewType;
        };
    }

    private String joinNames(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return null;
        }
        return userMapper.selectBatchIds(userIds).stream().map(SysUser::getName).reduce((a, b) -> a + "、" + b).orElse(null);
    }

    private static String joinIds(List<Long> userIds) {
        return userIds == null || userIds.isEmpty() ? null : StringUtils.collectionToCommaDelimitedString(userIds);
    }

    private static List<Long> splitIds(String csv) {
        if (!StringUtils.hasText(csv)) {
            return List.of();
        }
        return Arrays.stream(csv.split(",")).map(String::trim).filter(StringUtils::hasText)
                .map(Long::valueOf).toList();
    }

    private String changeSnapshot(RdmRequirement req) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("status", req.getStatus());
        snapshot.put("priority", req.getPriority());
        snapshot.put("complexity", req.getComplexity());
        snapshot.put("expectResult", req.getExpectResult());
        snapshot.put("planReleaseDate", req.getPlanReleaseDate() == null ? null : req.getPlanReleaseDate().toString());
        return JsonUtils.toJson(snapshot);
    }

    private RdmDeliveryVO.Prd toPrdVO(RdmPrd prd) {
        RdmDeliveryVO.Prd vo = new RdmDeliveryVO.Prd();
        vo.setId(prd.getId());
        vo.setPrdNo(prd.getPrdNo());
        vo.setReqId(prd.getReqId());
        vo.setParentPrdId(prd.getParentPrdId());
        vo.setTitle(prd.getTitle());
        vo.setTargetUsers(prd.getTargetUsers());
        vo.setFeatureList(prd.getFeatureList());
        vo.setAcceptanceCriteria(prd.getAcceptanceCriteria());
        vo.setContentRich(prd.getContentRich());
        vo.setPrototypeUrl(prd.getPrototypeUrl());
        vo.setStatus(prd.getStatus());
        vo.setVersionNo(prd.getVersionNo());
        vo.setAuthorName(prd.getAuthorName());
        vo.setReviewTime(DateTimeUtils.format(prd.getReviewTime()));
        vo.setReviewConclusion(prd.getReviewConclusion());
        vo.setCreatedAt(DateTimeUtils.format(prd.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(prd.getUpdatedAt()));
        return vo;
    }

    private RdmDeliveryVO.Review toReviewVO(RdmReview review) {
        RdmDeliveryVO.Review vo = new RdmDeliveryVO.Review();
        vo.setId(review.getId());
        vo.setReviewNo(review.getReviewNo());
        vo.setReqId(review.getReqId());
        vo.setPrdId(review.getPrdId());
        vo.setReviewType(review.getReviewType());
        vo.setReviewTime(DateTimeUtils.format(review.getReviewTime()));
        vo.setParticipants(review.getParticipants());
        vo.setParticipantIdList(splitIds(review.getParticipantIds()));
        vo.setConclusion(review.getConclusion());
        vo.setConclusionDesc(review.getConclusionDesc());
        vo.setAffectsSchedule(review.getAffectsScheduleFlag() != null && review.getAffectsScheduleFlag() == 1);
        vo.setCreatedBy(review.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(review.getCreatedAt()));
        if (review.getPrdId() != null) {
            RdmPrd prd = prdMapper.selectById(review.getPrdId());
            vo.setPrdTitle(prd == null ? null : prd.getTitle());
        }
        return vo;
    }

    private RdmDeliveryVO.Task toTaskVO(RdmWorkTask task, RdmRequirement req) {
        RdmDeliveryVO.Task vo = new RdmDeliveryVO.Task();
        vo.setId(task.getId());
        vo.setTaskNo(task.getTaskNo());
        vo.setReqId(task.getReqId());
        vo.setDeliveryItemId(task.getDeliveryItemId());
        vo.setPrdId(task.getPrdId());
        vo.setTaskType(task.getTaskType());
        vo.setTitle(task.getTitle());
        vo.setContent(task.getContent());
        vo.setOwnerUserId(task.getOwnerUserId());
        vo.setOwnerName(task.getOwnerName());
        vo.setOwnerEmpNo(task.getOwnerEmpNo());
        vo.setRoleCode(task.getRoleCode());
        vo.setStatus(task.getStatus());
        vo.setProgress(task.getProgress());
        vo.setPlanHours(task.getPlanHours());
        vo.setActualHours(task.getActualHours());
        // 缺报不等于 0：把未填报当成没发生，负载与估时偏差会一起被做得好看
        vo.setActualHoursReported(task.getActualHours() != null && task.getActualHours().signum() > 0);
        vo.setPlanStartDate(DateTimeUtils.format(task.getPlanStartDate()));
        vo.setPlanFinishDate(DateTimeUtils.format(task.getPlanFinishDate()));
        vo.setActualStartTime(DateTimeUtils.format(task.getActualStartTime()));
        vo.setActualFinishTime(DateTimeUtils.format(task.getActualFinishTime()));
        vo.setBlockedReason(task.getBlockedReason());
        vo.setIterationCode(task.getIterationCode());
        vo.setCreatedAt(DateTimeUtils.format(task.getCreatedAt()));
        boolean unfinished = !TASK_DONE.equals(task.getStatus());
        vo.setOverdue(unfinished && task.getPlanFinishDate() != null
                && task.getPlanFinishDate().isBefore(LocalDate.now()));
        if (req != null) {
            vo.setReqNo(req.getReqNo());
            vo.setReqTitle(req.getTitle());
            vo.setReqStatus(req.getStatus());
        }
        return vo;
    }

    private RdmDeliveryVO.Change toChangeVO(RdmChangeRequest change) {
        RdmDeliveryVO.Change vo = new RdmDeliveryVO.Change();
        vo.setId(change.getId());
        vo.setChangeNo(change.getChangeNo());
        vo.setReqId(change.getReqId());
        vo.setPrdId(change.getPrdId());
        vo.setChangeType(change.getChangeType());
        vo.setAfterContent(change.getAfterContent());
        vo.setReason(change.getReason());
        vo.setImpactDesc(change.getImpactDesc());
        vo.setAffectsSchedule(change.getAffectsScheduleFlag() != null && change.getAffectsScheduleFlag() == 1);
        vo.setAddedHours(change.getAddedHours());
        vo.setFlowNo(change.getFlowNo());
        vo.setApprovalStatus(change.getApprovalStatus());
        vo.setApplicantName(change.getApplicantName());
        vo.setApplyTime(DateTimeUtils.format(change.getApplyTime()));
        vo.setDecideTime(DateTimeUtils.format(change.getDecideTime()));
        vo.setDecideRemark(change.getDecideRemark());
        return vo;
    }

    private LambdaQueryWrapper<RdmPrd> prdQuery(Long reqId) {
        return new LambdaQueryWrapper<RdmPrd>().eq(RdmPrd::getReqId, reqId).orderByAsc(RdmPrd::getId);
    }

    private RdmPrd requirePrd(Long id) {
        RdmPrd prd = id == null ? null : prdMapper.selectById(id);
        if (prd == null) {
            throw new BusinessException("PRD 不存在");
        }
        return prd;
    }

    private RdmWorkTask requireTask(Long id) {
        RdmWorkTask task = id == null ? null : taskMapper.selectById(id);
        if (task == null) {
            throw new BusinessException("任務不存在");
        }
        return task;
    }

    private RdmRequirement requireRequirement(Long id) {
        RdmRequirement req = id == null ? null : requirementMapper.selectById(id);
        if (req == null) {
            throw new BusinessException("需求不存在");
        }
        return req;
    }

    private static RdmTransitionDTO remarkOnly(String remark) {
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setRemark(remark);
        return dto;
    }

    private static BigDecimal sum(List<RdmWorkTask> tasks, java.util.function.Function<RdmWorkTask, BigDecimal> getter) {
        BigDecimal total = BigDecimal.ZERO;
        for (RdmWorkTask t : tasks) {
            BigDecimal value = getter.apply(t);
            if (value != null) {
                total = total.add(value);
            }
        }
        return total;
    }

    private static LocalDate parseDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim().substring(0, 10));
        } catch (Exception e) {
            throw new BusinessException("日期格式不正確: " + value);
        }
    }

    private static LocalDateTime parseDateTime(String value) {
        if (!StringUtils.hasText(value)) {
            return LocalDateTime.now();
        }
        // 解析失败不能再默默返回 now：页面选的评审时间会被当成没传，
        // 而界面看上去完全正常（以前就因此把约好的评审时间全记成了“刚刚”）
        try {
            return parseDateTimeStrict(value);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("時間格式不正確：" + value + "（應為 YYYY-MM-DD HH:mm）");
        }
    }

    /**
     * 兼容 ISO（带 T）与前端常见的空格格式，升分钟精度补秒。
     * <p>LocalDateTime.parse 只认 ISO 的 'T' 分隔，直接把空格换成 T 才能进解析器。
     * <p>包内可见：时间格式是高频回归点，需要能直接拿用例钉住。
     */
    static LocalDateTime parseDateTimeStrict(String value) {
        String cleaned = value.trim().replace(' ', 'T');
        if (cleaned.length() == 16) {
            cleaned = cleaned + ":00";
        }
        if (cleaned.length() > 19) {
            cleaned = cleaned.substring(0, 19);
        }
        return LocalDateTime.parse(cleaned);
    }

    /* ==================== 阶段 3：里程碑与工时明细 ==================== */

    /** 五个关键节点（名称快照与顺序） */
    private static final Map<String, String> MILESTONE_NAMES = Map.of(
            RdmMilestone.CODE_PRD_REVIEW, "需求評審",
            RdmMilestone.CODE_DESIGN_DONE, "設計完成",
            RdmMilestone.CODE_DEV_START, "研發啟動",
            RdmMilestone.CODE_DEV_DONE, "開發完成",
            RdmMilestone.CODE_RELEASE, "上線交付");

    /** 节点顺序 */
    private static final List<String> MILESTONE_ORDER = List.of(
            RdmMilestone.CODE_PRD_REVIEW, RdmMilestone.CODE_DESIGN_DONE,
            RdmMilestone.CODE_DEV_START, RdmMilestone.CODE_DEV_DONE, RdmMilestone.CODE_RELEASE);

    /** 单任务单日工地上限（人时）：超过一个自然日小数的录入几乎一定是录错 */
    private static final BigDecimal MAX_DAILY_HOURS = new BigDecimal("24");

    /** 允许改计划的状态：进入验收/上线后再改计划已无意义，走需求变更 */
    private static final Set<String> PLAN_EDITABLE_STATUS = Set.of(
            RdmConstants.STATUS_ACCEPTED, RdmConstants.STATUS_PRD_DESIGNING, RdmConstants.STATUS_REVIEWING,
            RdmConstants.STATUS_REVIEW_PASSED, RdmConstants.STATUS_SCHEDULED, RdmConstants.STATUS_DESIGNING,
            RdmConstants.STATUS_DEVELOPING, RdmConstants.STATUS_INTEGRATION);

    /** 允许冻结基线的状态：评审通过后、交付中之前 */
    private static final Set<String> BASELINE_FREEZE_STATUS = Set.of(
            RdmConstants.STATUS_REVIEW_PASSED, RdmConstants.STATUS_SCHEDULED,
            RdmConstants.STATUS_DESIGNING, RdmConstants.STATUS_DEVELOPING);

    @Override
    public List<RdmDeliveryVO.Milestone> milestones(Long reqId) {
        accessGuard.requireVisible(reqId, "查看里程碑");
        return milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                        .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder))
                .stream().map(RdmDeliveryServiceImpl::toMilestoneVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryVO.Milestone> saveMilestones(Long reqId, List<RdmDeliveryDTO.Milestone> list) {
        RdmRequirement req = accessGuard.requireDeliveryWriter(reqId, "規劃里程碑");
        if (!PLAN_EDITABLE_STATUS.contains(req.getStatus())) {
            throw new BusinessException("当前階段不允許修改節點計劃（已進入驗證或交付），請走需求變更");
        }
        if (list == null || list.isEmpty()) {
            throw new BusinessException("請填寫節點計劃");
        }
        SysUser current = operatorResolver.currentUser();
        String signature = operatorResolver.operatorSignature(current);
        List<Long> newlyAssignedOwners = new ArrayList<>();
        for (RdmDeliveryDTO.Milestone item : list) {
            if (item == null || !StringUtils.hasText(item.getCode())) {
                continue;
            }
            String code = item.getCode().trim().toUpperCase();
            if (!MILESTONE_NAMES.containsKey(code)) {
                throw new BusinessException("不認識的節點編碼: " + item.getCode());
            }
            RdmMilestone existing = milestoneMapper.selectOne(new LambdaQueryWrapper<RdmMilestone>()
                    .eq(RdmMilestone::getReqId, reqId).eq(RdmMilestone::getCode, code).last("LIMIT 1"));
            String status = StringUtils.hasText(item.getStatus()) ? item.getStatus().trim() : RdmMilestone.STATUS_PENDING;
            if (!List.of(RdmMilestone.STATUS_PENDING, RdmMilestone.STATUS_DONE, RdmMilestone.STATUS_NOT_APPLICABLE).contains(status)) {
                throw new BusinessException("不支援的節點狀態: " + status);
            }
            if (RdmMilestone.STATUS_NOT_APPLICABLE.equals(status) && !StringUtils.hasText(item.getNaReason())) {
                throw new BusinessException("「" + MILESTONE_NAMES.get(code) + "」標為不適用時必須寫明原因");
            }
            if (existing != null && existing.getBaselineDate() != null
                    && item.getPreliminaryDate() != null
                    && !existing.getPreliminaryDate().equals(parseDate(item.getPreliminaryDate()))) {
                // 基线已冻结：初步计划是历史事实，要改只能改「预测」
                throw new BusinessException("「" + MILESTONE_NAMES.get(code)
                        + "」基線已凍結，初步計劃不可改；如需延期請調整預測日期");
            }
            RdmMilestone row = existing == null ? new RdmMilestone() : existing;
            row.setReqId(reqId);
            row.setCode(code);
            row.setName(StringUtils.hasText(item.getName()) ? item.getName().trim() : MILESTONE_NAMES.get(code));
            row.setSortOrder(MILESTONE_ORDER.indexOf(code) + 1);
            row.setStatus(status);
            row.setNaReason(RdmMilestone.STATUS_NOT_APPLICABLE.equals(status) ? item.getNaReason().trim() : null);
            boolean firstAssignment = row.getOwnerUserId() == null && item.getOwnerUserId() != null;
            applyMilestoneOwner(row, item, code, reqId);
            LocalDate preliminary = parseDate(item.getPreliminaryDate());
            LocalDate forecast = parseDate(item.getForecastDate());
            if (preliminary != null && row.getBaselineDate() != null && preliminary.isAfter(row.getBaselineDate())) {
                throw new BusinessException("初步計劃不得晚於已凍結基線：" + row.getName());
            }
            // 未冻结基线时，初步计划同时作为默认预测；已冻结后只能单独改 forecast
            row.setPreliminaryDate(preliminary != null ? preliminary : row.getPreliminaryDate());
            if (row.getBaselineDate() == null && preliminary != null) {
                row.setForecastDate(preliminary);
            }
            if (forecast != null) {
                row.setForecastDate(forecast);
            }
            if (row.getId() == null) {
                row.setCreatedBy(signature);
                milestoneMapper.insert(row);
            } else {
                row.setUpdatedBy(signature);
                milestoneMapper.updateById(row);
            }
            if (firstAssignment && item.getOwnerUserId() != null) {
                newlyAssignedOwners.add(item.getOwnerUserId());
            }
        }
        // 计划确定后联动相关研发：不通知的话节点只是纸面上的日期
        notifyMilestoneOwners(req, newlyAssignedOwners, current);
        return milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                        .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder))
                .stream().map(RdmDeliveryServiceImpl::toMilestoneVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryVO.Milestone> freezeMilestoneBaseline(Long reqId) {
        RdmRequirement req = accessGuard.requireDeliveryWriter(reqId, "凍結基線");
        if (!BASELINE_FREEZE_STATUS.contains(req.getStatus())) {
            throw new BusinessException("只有「評審通過」到「開發中」之間可凍結基線，當前狀態："
                    + (req.getStatus() == null ? "-" : req.getStatus()));
        }
        List<RdmMilestone> rows = milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder));
        if (rows.isEmpty()) {
            throw new BusinessException("尚未規劃節點計劃，無從凍結基線");
        }
        List<RdmMilestone> missing = rows.stream()
                .filter(r -> !RdmMilestone.STATUS_NOT_APPLICABLE.equals(r.getStatus()))
                .filter(r -> r.getBaselineDate() == null)
                .filter(r -> r.getForecastDate() == null && r.getPreliminaryDate() == null)
                .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException("節點「" + missing.get(0).getName() + "」還未給出計劃日期，請先補全");
        }
        boolean frozenAny = false;
        for (RdmMilestone row : rows) {
            if (row.getBaselineDate() != null) {
                continue;
            }
            LocalDate base = row.getForecastDate() != null ? row.getForecastDate() : row.getPreliminaryDate();
            if (RdmMilestone.STATUS_NOT_APPLICABLE.equals(row.getStatus())) {
                // 不适用的节点不占基线，否则上线后会出现一个虚假的「延期 0 天」分母
                continue;
            }
            row.setBaselineDate(base);
            row.setUpdatedBy(operatorResolver.operatorSignature(operatorResolver.currentUser()));
            milestoneMapper.updateById(row);
            frozenAny = true;
        }
        if (!frozenAny) {
            throw new BusinessException("基線已凍結，無需重複操作");
        }
        log.info("里程碑基線已凍結: reqNo={}, nodes={}", req.getReqNo(), rows.size());
        return milestones(reqId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryVO.WorkLog> saveWorkLogs(Long taskId, List<RdmDeliveryDTO.WorkLog> logs) {
        RdmWorkTask task = requireTask(taskId);
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        // 实际工时只能由本人填：它同时是负载与估时偏差的事实底稿，代填会两项一起做假
        if (!operatorResolver.isAdmin(current) && !current.getId().equals(task.getOwnerUserId())) {
            throw new BusinessException("僅任務負責人本人可填報工時");
        }
        if (logs == null || logs.isEmpty()) {
            throw new BusinessException("請填寫工時明細");
        }
        String signature = operatorResolver.operatorSignature(current);
        for (RdmDeliveryDTO.WorkLog item : logs) {
            if (item == null || item.getHours() == null) {
                continue;
            }
            if (item.getHours().signum() <= 0 || item.getHours().compareTo(MAX_DAILY_HOURS) > 0) {
                throw new BusinessException("單日工時必須大於 0 且不超過 24 人時");
            }
            LocalDate workDate = parseDate(item.getWorkDate());
            if (workDate == null) {
                throw new BusinessException("請選擇工作日期");
            }
            if (workDate.isAfter(LocalDate.now())) {
                throw new BusinessException("工作日期不能是未來");
            }
            if (task.getPlanStartDate() != null && workDate.isBefore(task.getPlanStartDate())) {
                throw new BusinessException("工作日期不能早於任務計劃開始日 " + task.getPlanStartDate());
            }
            recordWorkLog(task, item.getHours(), item.getRemark(), current, workDate);
        }
        BigDecimal total = sumWorkHours(taskId);
        RdmWorkTask patch = new RdmWorkTask();
        patch.setId(taskId);
        patch.setActualHours(total);
        patch.setUpdatedBy(signature);
        taskMapper.updateById(patch);
        return workLogs(taskId);
    }

    @Override
    public List<RdmDeliveryVO.PrdSnapshot> prdSnapshots(Long prdId) {
        RdmPrd prd = requirePrd(prdId);
        accessGuard.requireVisible(prd.getReqId(), "查看 PRD 版本");
        return prdSnapshotMapper.selectList(new LambdaQueryWrapper<RdmPrdSnapshot>()
                        .eq(RdmPrdSnapshot::getPrdId, prdId).orderByDesc(RdmPrdSnapshot::getSnapshotTime))
                .stream().map(row -> {
                    RdmDeliveryVO.PrdSnapshot vo = new RdmDeliveryVO.PrdSnapshot();
                    vo.setId(row.getId());
                    vo.setPrdId(row.getPrdId());
                    vo.setVersionNo(row.getVersionNo());
                    vo.setTitle(row.getTitle());
                    vo.setConclusion(row.getConclusion());
                    vo.setConclusionDesc(row.getConclusionDesc());
                    vo.setReviewerNames(namesOfIds(row.getReviewerIds()));
                    vo.setSnapshotTime(DateTimeUtils.format(row.getSnapshotTime()));
                    return vo;
                }).toList();
    }

    /** 某任务的工时明细（供任务表单与工时展示复用） */
    private List<RdmDeliveryVO.WorkLog> workLogs(Long taskId) {
        return workLogMapper.selectList(new LambdaQueryWrapper<RdmWorkLog>()
                        .eq(RdmWorkLog::getTaskId, taskId).orderByDesc(RdmWorkLog::getWorkDate))
                .stream().map(row -> {
                    RdmDeliveryVO.WorkLog vo = new RdmDeliveryVO.WorkLog();
                    vo.setId(row.getId());
                    vo.setTaskId(row.getTaskId());
                    vo.setUserId(row.getUserId());
                    vo.setUserName(row.getUserName());
                    vo.setWorkDate(DateTimeUtils.format(row.getWorkDate()));
                    vo.setHours(row.getHours());
                    vo.setRemark(row.getRemark());
                    vo.setUpdatedBy(row.getUpdatedBy());
                    return vo;
                }).toList();
    }

    /** 登记或修订当日工时明细（同人同任务同日为一条，修订保留最后修改人与时间） */
    private void recordWorkLog(RdmWorkTask task, BigDecimal hours, String remark, SysUser user, LocalDate day) {
        RdmWorkLog existing = workLogMapper.selectOne(new LambdaQueryWrapper<RdmWorkLog>()
                .eq(RdmWorkLog::getTaskId, task.getId())
                .eq(RdmWorkLog::getUserId, user.getId())
                .eq(RdmWorkLog::getWorkDate, day).last("LIMIT 1"));
        String signature = operatorResolver.operatorSignature(user);
        if (existing == null) {
            RdmWorkLog log = new RdmWorkLog();
            log.setTaskId(task.getId());
            log.setReqId(task.getReqId());
            log.setUserId(user.getId());
            log.setUserName(user.getName());
            log.setWorkDate(day);
            log.setHours(hours);
            log.setRemark(remark);
            log.setCreatedBy(signature);
            log.setUpdatedBy(signature);
            workLogMapper.insert(log);
            return;
        }
        // 进度上报会多次带入工时：同日累加而不是覆盖，否则一天多次上报只剩最后一条
        existing.setHours(existing.getHours() == null ? hours : existing.getHours().add(hours));
        existing.setRemark(remark);
        existing.setUpdatedBy(signature);
        workLogMapper.updateById(existing);
    }

    /** 任务实际工时 = 明细汇总（没有明细就是 null，不拿 0 冒充“报过”） */
    private BigDecimal sumWorkHours(Long taskId) {
        List<RdmWorkLog> rows = workLogMapper.selectList(new LambdaQueryWrapper<RdmWorkLog>()
                .eq(RdmWorkLog::getTaskId, taskId));
        if (rows.isEmpty()) {
            return null;
        }
        return rows.stream().map(RdmWorkLog::getHours).filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 计划确定/变更后提醒节点负责人：不然节点只是 PM 自己选的日期 */
    private void notifyMilestoneOwners(RdmRequirement req, List<Long> ownerIds, SysUser operator) {
        if (ownerIds == null || ownerIds.isEmpty()) {
            return;
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_TASK_ASSIGNED, req, ownerIds, "你被排入需求關鍵節點",
                "### 📅 節點計劃已確定\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                        + "\n- **排期人**: " + (operator == null ? "-" : operator.getName())
                        + "\n\n请在「交付工作台」确认自己的工时与起止日期，不一致请尽早提出。");
    }

    private void applyMilestoneOwner(RdmMilestone row, RdmDeliveryDTO.Milestone item, String code, Long reqId) {
        if (item.getOwnerUserId() == null) {
            return;
        }
        SysUser owner = userMapper.selectById(item.getOwnerUserId());
        if (owner == null) {
            throw new BusinessException("節點負責人不存在或已停用");
        }
        requireTaskOwnerActive(owner);
        row.setOwnerUserId(owner.getId());
        row.setOwnerName(owner.getName());
        // 节点负责人同时成为需求参与人，否则他在详情页看不到自己的节点
        bindParticipant(reqId, owner, roleOfTaskType(taskTypeOfMilestone(code)));
    }

    /** 节点→任务类型（只用于推断参与角色，不参与阶段门槛判定） */
    private static String taskTypeOfMilestone(String code) {
        return switch (code) {
            case RdmMilestone.CODE_DESIGN_DONE -> "design";
            case RdmMilestone.CODE_DEV_START, RdmMilestone.CODE_DEV_DONE -> "backend";
            default -> "qa";
        };
    }

    private static RdmDeliveryVO.Milestone toMilestoneVO(RdmMilestone row) {
        RdmDeliveryVO.Milestone vo = new RdmDeliveryVO.Milestone();
        vo.setId(row.getId());
        vo.setCode(row.getCode());
        vo.setName(StringUtils.hasText(row.getName()) ? row.getName() : RdmMilestone.CODE_RELEASE.equals(row.getCode()) ? "上線交付" : row.getCode());
        vo.setOwnerUserId(row.getOwnerUserId());
        vo.setOwnerName(row.getOwnerName());
        vo.setPreliminaryDate(DateTimeUtils.format(row.getPreliminaryDate()));
        vo.setBaselineDate(DateTimeUtils.format(row.getBaselineDate()));
        vo.setForecastDate(DateTimeUtils.format(row.getForecastDate()));
        vo.setActualDate(DateTimeUtils.format(row.getActualDate()));
        vo.setStatus(row.getStatus());
        vo.setNaReason(row.getNaReason());
        vo.setSortOrder(row.getSortOrder());
        vo.setBaselineLocked(row.getBaselineDate() != null);
        LocalDate against = row.getBaselineDate() != null ? row.getBaselineDate()
                : (row.getForecastDate() != null ? row.getForecastDate() : row.getPreliminaryDate());
        LocalDate real = row.getActualDate() != null ? row.getActualDate()
                : (RdmMilestone.STATUS_DONE.equals(row.getStatus()) ? LocalDate.now() : null);
        if (against != null && real != null) {
            vo.setSlipDays((int) java.time.temporal.ChronoUnit.DAYS.between(against, real));
        }
        return vo;
    }

    /* ==================== 阶段 3 校验与版本辅助 ==================== */

    /** 评审中与已通过的 PRD 都是「已定稿内容」，不可原地修改 */
    private static boolean isFrozen(String prdStatus) {
        return PRD_APPROVED.equals(prdStatus) || PRD_REVIEWING.equals(prdStatus);
    }

    /**
     * 以新版本方式修改定稿 PRD：复制一行新草稿，版本号递增，父指向原版本。
     * <p>原版本及其定稿快照一行不改地留着，这样事后能看出「哪一版被谁批过」。
     */
    private RdmPrd forkVersion(RdmPrd origin, RdmDeliveryDTO.Prd dto, SysUser current) {
        RdmPrd copy = new RdmPrd();
        /*
         * 新版本必须拿自己的单号：rdm_prd 上有 uk_rdm_prd_no，沿用原编号会直接撞唯一索引，
         * 让「以新版本修改」100% 失败（深度测试实测：报成“数据已存在，请刷新重试”会误导用户反复重试）。
         */
        copy.setPrdNo(bizSeqService.next(SEQ_PRD));
        copy.setReqId(origin.getReqId());
        copy.setParentPrdId(origin.getId());
        copy.setTitle(origin.getTitle());
        copy.setTargetUsers(origin.getTargetUsers());
        copy.setFeatureList(origin.getFeatureList());
        copy.setAcceptanceCriteria(origin.getAcceptanceCriteria());
        copy.setContentRich(origin.getContentRich());
        copy.setPrototypeUrl(origin.getPrototypeUrl());
        copy.setStatus(PRD_DRAFT);
        copy.setVersionNo(nextVersion(prdMapper.selectList(new LambdaQueryWrapper<RdmPrd>()
                .eq(RdmPrd::getReqId, origin.getReqId()))));
        copy.setAuthorUserId(current == null ? origin.getAuthorUserId() : current.getId());
        copy.setAuthorName(current == null ? origin.getAuthorName() : current.getName());
        copy.setCreatedBy(operatorResolver.operatorSignature(current));
        prdMapper.insert(copy);
        log.info("PRD 已開新版本: prdNo={}, {} -> {}, reason={}",
                copy.getPrdNo(), origin.getVersionNo(), copy.getVersionNo(), dto.getChangeReason());
        return copy;
    }

    /**
     * 版本号递增（v1.2 → v1.3）。
     * <p>必须看同一需求下已有的最高版本，而不是只加父版本的号：
     * 同一父版本改两次会得到两个 v1.1，列表上根分不清先后（深度测试实测）。
     */
    private static String nextVersion(java.util.Collection<RdmPrd> siblings) {
        int maxMinor = 0;
        String maxMajor = "0";
        boolean found = false;
        for (RdmPrd sibling : siblings) {
            String body = sibling.getVersionNo() == null ? "" : (sibling.getVersionNo().startsWith("v")
                    ? sibling.getVersionNo().substring(1) : sibling.getVersionNo());
            String[] parts = body.split("\\.");
            if (parts.length != 2) {
                continue;
            }
            try {
                String major = parts[0];
                int minor = Integer.parseInt(parts[1]);
                if (!found || minor > maxMinor) {
                    maxMinor = minor;
                    maxMajor = major;
                    found = true;
                }
            } catch (NumberFormatException ignored) {
                log.debug("PRD 版本号脏数据，不参与递增计算: {}", sibling.getVersionNo());
            }
        }
        return found ? "v" + maxMajor + "." + (maxMinor + 1) : "v1.1";
    }

    /** 评审结论落定时冻结一版内容快照（通过与否都记，退回也要能查到当时被退回的是哪一版） */
    private void snapshotPrd(RdmPrd prd, RdmReview review, boolean passed, SysUser current) {
        RdmPrdSnapshot snapshot = new RdmPrdSnapshot();
        snapshot.setPrdId(prd.getId());
        snapshot.setReqId(prd.getReqId());
        snapshot.setVersionNo(prd.getVersionNo());
        snapshot.setTitle(prd.getTitle());
        snapshot.setFeatureList(prd.getFeatureList());
        snapshot.setAcceptanceCriteria(prd.getAcceptanceCriteria());
        snapshot.setContentRich(prd.getContentRich());
        snapshot.setPrototypeUrl(prd.getPrototypeUrl());
        snapshot.setReviewId(review.getId());
        snapshot.setConclusion(passed ? REVIEW_PASSED : REVIEW_REJECTED);
        snapshot.setConclusionDesc(review.getConclusionDesc());
        snapshot.setReviewerIds(review.getParticipantIds());
        snapshot.setSnapshotTime(LocalDateTime.now());
        snapshot.setCreatedBy(operatorResolver.operatorSignature(current));
        snapshot.setUpdatedBy(snapshot.getCreatedBy());
        prdSnapshotMapper.insert(snapshot);
    }

    /** 任务表单硬校验：这些都不拦的话，负载与产能对账会拿到永远对不上的数 */
    private void validateTaskForm(RdmDeliveryDTO.Task dto) {
        if (dto.getTitle() != null && dto.getTitle().length() > 200) {
            throw new BusinessException("任務標題最長 200 字");
        }
        // 任务类型白名单改查字典（存在即放行，含停用）；字典查询异常不吞、写入直接失败（fail-closed），
        // 存量 code 永续由「禁物理删除」保证，历史任务不会因配置变更而失去可解析性
        if (taskTypeService.resolveByCode(dto.getTaskType()) == null) {
            throw new BusinessException("不支援的任務類型: " + dto.getTaskType());
        }
        if (dto.getPlanHours() != null
                && (dto.getPlanHours().signum() < 0 || dto.getPlanHours().compareTo(new BigDecimal("999")) > 0)) {
            throw new BusinessException("計劃工時必須在 0-999 人時之間");
        }
        LocalDate start = parseDate(dto.getPlanStartDate());
        LocalDate finish = parseDate(dto.getPlanFinishDate());
        if (start != null && finish != null && start.isAfter(finish)) {
            throw new BusinessException("計劃開始日不能晚於計劃完成日");
        }
    }

    /**
     * 任务负责人硬性资格：必须在职启用。
     * <p>派给离职/停用的人，任务永远做不完且没人能更正，这条继续阻断。
     * 「无研发交付权限」不再阻断，见 {@link #canOwnerReportProgress}。
     */
    private void requireTaskOwnerActive(SysUser owner) {
        if (isInactive(owner)) {
            throw new BusinessException(ownerInactiveWarning(owner));
        }
        if (!canOwnerReportProgress(owner)) {
            /*
             * 派活与授权是两条线：PM 常需要先占位排期，再让项目负责人去授权中心补权限，
             * 原先在这里硬拦会把「先排期」这个正常动作也挡掉。放行但留日志，
             * 便于事后回答「这条任务为什么派给了一个进不了交付工作台的人」。
             */
            log.warn("任務負責人無研發交付權限，已放行保存但無法上報進度，請補授權: empId={}, name={}",
                    owner.getEmpId(), owner.getName());
        }
    }

    /** 负责人是否已离职或停用 */
    private static boolean isInactive(SysUser owner) {
        return owner.getStatus() != null && owner.getStatus() == 0;
    }

    /** 负责人能否进交付工作台上报进度（或持有需求处理权） */
    private boolean canOwnerReportProgress(SysUser owner) {
        return permissionService.hasPermission(owner, RdmConstants.MENU_DELIVERY_BOARD, "edit")
                || permissionService.hasPermission(owner, RdmConstants.MENU_REQUIREMENT, "edit");
    }

    private static String ownerInactiveWarning(SysUser owner) {
        return "任務負責人「" + owner.getName() + "」已離職或停用，請改派他人";
    }

    private static String ownerNoPermissionWarning(SysUser owner) {
        return "「" + owner.getName() + "」當前無研發交付權限：任務可正常保存，但他在交付工作台看不到上報入口，"
                + "請隨後到「授權中心」為其補權";
    }

    /** 参与人ID串 → 姓名串（快照展示用，不泄露多余字段） */
    private String namesOfIds(String ids) {
        if (!StringUtils.hasText(ids)) {
            return null;
        }
        List<String> names = new ArrayList<>();
        for (String part : ids.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                SysUser user = userMapper.selectById(Long.valueOf(trimmed));
                if (user != null) {
                    names.add(user.getName());
                }
            } catch (NumberFormatException ignored) {
                log.debug("快照參與人字段存在非数字脏数据: {}", trimmed);
            }
        }
        return names.isEmpty() ? null : String.join("、", names);
    }

    private static int toInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }
}
