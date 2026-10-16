package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmReleaseApproval;
import com.mftb.admin.entity.RdmReleaseAttempt;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.entity.RdmReleaseExemption;
import com.mftb.admin.entity.RdmReleaseExemptionDecision;
import com.mftb.admin.entity.RdmSupplementaryVerification;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.service.RdmReleaseFactService.AttemptDraft;
import com.mftb.admin.service.RdmReleaseGateService.Evidence;
import com.mftb.admin.service.RdmReleaseGateService.Stage;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * RDM 发布批次服务（流程版本 3 · 项目交付与质量管理链路）。
 *
 * <p>发布批次是「多系统一次上线」的编排单位。本类<b>只做编排</b>，
 * 门禁、事实、开放、豁免分别下沉到四个单一职责服务：
 * <ul>
 *   <li>{@link RdmReleaseGateService}：硬门禁 / 证据哈希 / 四眼审批资格 / 灰度 / 构建不可变；</li>
 *   <li>{@link RdmReleaseFactService}：追加式尝试事实与裁决留痕（只增不改）；</li>
 *   <li>{@link RdmOpenFactService}：开放事实只读判定（任务20 协调点已接真实事实）；</li>
 *   <li>{@link RdmReleaseExemptionService}：紧急豁免 + 仅产品补验闭环。</li>
 * </ul>
 *
 * <p>任务27 封死的六条口径（均 fail-closed）：
 * <ol>
 *   <li><b>无旁路</b>：{@code decide} 与<b>每一个</b>发布推进动作都重新校验硬门禁，
 *       并比对申请/裁决时冻结的证据哈希；{@code applyRelease} 不可被跳过
 *       （无申请快照即拒）；{@code check} 未通过绝不把状态置 checking 掩盖失败；</li>
 *   <li><b>审批快照 + 版本锁</b>：申请冻结 applicationSnapshotJson / applicationVersion /
 *       submittedAt / evidenceHash；裁决冻结 approvalSnapshotJson / approvalEvidenceHash /
 *       approvalExpiresAt（{@link RdmConstants#RELEASE_VALID_DAYS} 天，过期必须重新过闸）；
 *       全程 expectedVersion 乐观锁；</li>
 *   <li><b>部署 / 验证 / 开放 独立且追加</b>：每次动作都向 {@code rdm_release_attempt} <b>追加</b>一行，
 *       不覆盖历史；部署<b>不得修改已批准的 buildId</b>；验证通过<b>绝不</b>直接置 released，
 *       必须由独立的开放动作（{@link #openRelease}）建立开放事实后才置 released；</li>
 *   <li><b>四眼无 admin 豁免</b>：裁决人 ≠ 申请人，且不以 {@code canSeeAll} 充当审批资格；</li>
 *   <li><b>灰度默认关闭</b>：仅当两级 {@code v3_release_enabled=1} 且未全局熔断时才放行 V3 发布；</li>
 *   <li><b>幂等</b>：所有写操作走 {@code public 幂等入口 + @Transactional doXxx}，不嵌外层活动事务。</li>
 * </ol>
 *
 * <p><b>安全取舍（已报备）</b>：回滚与「失败类上报」（deploy=failed/rolled_back、verify=failed、
 * open=not_opened）是<b>止损动作</b>，只校验身份/权限/状态，<b>不因硬门禁失败或证据过期而被拒</b>
 * ——否则事故现场将无法回滚。推进型动作（deploying/success、passed、opened）一律过完整硬门禁。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmReleaseBatchService {

    /** 发布批次号规则 key（前缀 FB + YYYYMMDD + 4 位） */
    private static final String SEQ_RELEASE_BATCH = "rdm_release_batch";

    /** executeOnce 业务类型（Batch 3 原子幂等）：每个发布写动作一个独立命名空间 */
    private static final String BIZ_RELEASE_CREATE = "rdm_release_batch_create";
    private static final String BIZ_RELEASE_CHECK = "rdm_release_check";
    private static final String BIZ_RELEASE_APPLY = "rdm_release_apply";
    private static final String BIZ_RELEASE_DECIDE = "rdm_release_decide";
    private static final String BIZ_RELEASE_DEPLOY = "rdm_release_deploy";
    private static final String BIZ_RELEASE_VERIFY = "rdm_release_verify";
    private static final String BIZ_RELEASE_OPEN = "rdm_release_open";
    private static final String BIZ_RELEASE_ROLLBACK = "rdm_release_rollback";

    /** 部署状态（上报允许的取值） */
    private static final List<String> DEPLOY_REPORT_STATUS = List.of(
            RdmConstants.DEPLOY_DEPLOYING, RdmConstants.DEPLOY_SUCCESS,
            RdmConstants.DEPLOY_FAILED, RdmConstants.DEPLOY_ROLLED_BACK);

    /** 「推进型」部署结果：只有这些结果会把批次往前推，因此必须过完整硬门禁。 */
    private static final List<String> DEPLOY_ADVANCING_STATUS = List.of(
            RdmConstants.DEPLOY_DEPLOYING, RdmConstants.DEPLOY_SUCCESS);

    /** 止损路径无法解析构建标识时的占位值（{@code rdm_release_attempt.build_id} 为 NOT NULL）。 */
    private static final String UNKNOWN_BUILD_ID = "unresolved";

    /** {@code rdm_idempotent_log.client_request_id} 列宽：VARCHAR(64) ascii，派生值绝不可溢出。 */
    private static final int CLIENT_REQUEST_ID_MAX = 64;

    private final RdmReleaseBatchMapper batchMapper;
    private final RdmReleaseDeploymentMapper deploymentMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmProjectMapper projectMapper;
    private final RdmAccessGuard accessGuard;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    /** 流程版本守卫 + V3 发布灰度（默认关闭） */
    private final RdmFlowVersionGuard flowVersionGuard;
    /** 任务27：硬门禁唯一裁决点 */
    private final RdmReleaseGateService gateService;
    /** 任务27：追加式不可变事实 */
    private final RdmReleaseFactService factService;
    /** 任务27：紧急豁免 + 仅产品补验 */
    private final RdmReleaseExemptionService exemptionService;
    /** 任务27：所有写操作接入原子幂等 */
    private final RdmIdempotentService idempotentService;

    /* ==================== 创建 ==================== */

    /**
     * 创建发布批次（幂等入口）：冻结范围快照，按部署清单建立部署记录，状态 planning。
     * <p>创建属「准备」动作，不推进发布，因此<b>不受 V3 发布灰度阻断</b>（灰度未开时仍仅支持查看和准备）。
     */
    public RdmReleaseBatch createBatch(RdmReleaseBatchDTO.Create dto, Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                text(dto == null ? null : dto.getVersionTag()),
                String.valueOf(dto == null ? null : dto.getProjectId()),
                String.valueOf(dto == null ? null : dto.getReqId()),
                String.valueOf(dto == null ? null : dto.getReleaseOwnerUserId()),
                text(dto == null ? null : dto.getPlanTime()),
                String.valueOf(dto == null || dto.getDeliveryItemIds() == null
                        ? "" : dto.getDeliveryItemIds()),
                String.valueOf(dto == null || dto.getDeployments() == null ? 0 : dto.getDeployments().size())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_CREATE)
                .resourceKey("release-batch:create")
                .clientRequestId(deriveClientRequestId("create", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doCreateBatch(dto, actorId, currentUserName), RdmReleaseBatch.class);
    }
    
    @Transactional(rollbackFor = Exception.class)
    public RdmReleaseBatch doCreateBatch(RdmReleaseBatchDTO.Create dto, Long actorId, String actorName) {
        if (dto == null || !StringUtils.hasText(dto.getVersionTag())) {
            throw new BusinessException("請填寫版本標識");
        }
        if (dto.getReleaseOwnerUserId() == null) {
            throw new BusinessException("請指定發布負責人");
        }
        List<Long> itemIds = dto.getDeliveryItemIds() == null ? List.of()
                : dto.getDeliveryItemIds().stream().filter(Objects::nonNull).distinct().toList();
        if (itemIds.isEmpty()) {
            throw new BusinessException("請至少選擇一個交付項");
        }
        List<RdmDeliveryItem> items = new ArrayList<>();
        for (Long itemId : itemIds) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item == null) {
                throw new BusinessException("交付項不存在或已刪除: id=" + itemId);
            }
            items.add(item);
        }
    
        RdmReleaseBatch batch = new RdmReleaseBatch();
        batch.setBatchNo(generateBatchNo());
        batch.setVersionTag(dto.getVersionTag().trim());
        batch.setReqId(dto.getReqId() != null ? dto.getReqId() : items.get(0).getReqId());
        batch.setProjectId(dto.getProjectId() != null ? dto.getProjectId() : items.get(0).getProjectId());
        batch.setScopeSnapshotJson(JsonUtils.toJson(buildScopeSnapshot(items)));
        batch.setReleaseOwnerUserId(dto.getReleaseOwnerUserId());
        batch.setReleaseOwnerUserName(dto.getReleaseOwnerUserName());
        batch.setPlanTime(parseDateTime(dto.getPlanTime()));
        batch.setStatus(RdmConstants.RB_PLANNING);
        batch.setApplicantUserId(actorId);
        batch.setApplicantUserName(actorName);
        batch.setVersion(0);
        batchMapper.insert(batch);
    
        createDeployments(batch.getId(), dto.getDeployments());
        log.info("發布批次已創建: batchNo={}, versionTag={}, items={}, operator={}",
                batch.getBatchNo(), batch.getVersionTag(), itemIds.size(), actorName);
        return batch;
    }
    
    private void createDeployments(Long batchId, List<RdmReleaseBatchDTO.DeploymentItem> deployments) {
        if (deployments == null || deployments.isEmpty()) {
            return;
        }
        int order = 1;
        for (RdmReleaseBatchDTO.DeploymentItem d : deployments) {
            if (d == null || !StringUtils.hasText(d.getSystemCode())) {
                throw new BusinessException("部署清單項必須填寫系統編碼");
            }
            RdmReleaseDeployment dep = new RdmReleaseDeployment();
            dep.setReleaseBatchId(batchId);
            dep.setSystemCode(d.getSystemCode().trim());
            dep.setSystemName(d.getSystemName());
            dep.setBuildId(d.getBuildId());
            dep.setDeployOrder(d.getDeployOrder() != null ? d.getDeployOrder() : order);
            dep.setDeployStatus(RdmConstants.DEPLOY_PENDING);
            dep.setVerifyStatus(RdmConstants.VERIFY_PENDING);
            dep.setOpenStatus(RdmConstants.OPEN_STATUS_PENDING);
            dep.setAttemptNo(0);
            deploymentMapper.insert(dep);
            order++;
        }
    }
    
    /* ==================== 放行检查 ==================== */
    
    /**
     * 执行放行检查（幂等入口）：测试/验收/缺陷/依赖/范围五类闸门，全部由服务端实时计算。
     * <p><b>绝不掩盖失败</b>：仅当五类闸门全部通过（或唯一未通过项已被生效紧急豁免覆盖）
     * 才把批次由 planning 推进到 checking；未通过时<b>不置 checking</b>，
     * 若已是 checking（证据退化）则回退到 planning，强制重新过闸。
     */
    public List<RdmReleaseBatchVO.CheckResult> runCheck(Long batchId, Long currentUserId) {
        Long actorId = requireActor(currentUserId);
        RdmReleaseBatch probe = requireBatch(batchId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                String.valueOf(probe.getVersion()),
                String.valueOf(probe.getStatus())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_CHECK)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("check", null, hash))
                .requestHash(hash)
                .build();
        List<RdmReleaseBatchVO.CheckResult> result = idempotentService.executeOnce(key,
                () -> doRunCheck(batchId, actorId), List.class);
        return result == null ? List.of() : result;
    }
    
    @Transactional(rollbackFor = Exception.class)
    @SuppressWarnings("unchecked")
    public List<RdmReleaseBatchVO.CheckResult> doRunCheck(Long batchId, Long actorId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, actorId, "執行放行檢查");
        if (!RdmConstants.RB_PLANNING.equals(batch.getStatus())
                && !RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            throw new BusinessException("僅「規劃中」或「檢查中」的批次可執行放行檢查，當前狀態：" + batch.getStatus());
        }
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        // 读路径顺带刷新补验逾期（不依赖 cron）
        exemptionService.refreshOverdue(batchId);
        List<RdmReleaseBatchVO.CheckResult> checks = gateService.computeChecks(batch, deployments);
        boolean canAdvance = gateService.applyExemptionWaiver(batch, deployments, checks);
        if (canAdvance) {
            if (!RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
                batch.setStatus(RdmConstants.RB_CHECKING);
                batchMapper.updateById(batch);
            }
        } else if (RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            // 证据退化：不得留在 checking 让 decide 有机可乘，回退到 planning 强制重新过闸
            batch.setStatus(RdmConstants.RB_PLANNING);
            batchMapper.updateById(batch);
            log.warn("放行檢查未全部通過，批次由 checking 回退到 planning: batchNo={}", batch.getBatchNo());
        }
        log.info("發布批次放行檢查完成: batchNo={}, passed={}/{}, canAdvance={}", batch.getBatchNo(),
                checks.stream().filter(c -> Boolean.TRUE.equals(c.getPassed())).count(), checks.size(), canAdvance);
        return checks;
    }
    
    /**
     * 申请发布（幂等入口）：硬门禁必须全过，冻结申请快照与证据哈希，状态保持 checking 等待裁决。
     * <p><b>本步骤是真实门禁步骤，不得被跳过</b>：decide / deploy / verify / open 均会校验
     * 申请快照与证据哈希是否存在且未变化，无申请即无法推进。
     */
    public void applyRelease(Long batchId, Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(String.valueOf(batchId), "apply"));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_APPLY)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("apply", null, hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        idempotentService.executeOnce(key,
                () -> { doApplyRelease(batchId, actorId, currentUserName, requestId); return null; }, Void.class);
    }
    
    @Transactional(rollbackFor = Exception.class)
    public void doApplyRelease(Long batchId, Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, actorId, "申請發布");
        // 灰度默认关闭：未开启即维持无条件阻断（发布批次以交付项为单位，因此无条件生效）
        gateService.enforceV3ReleaseGrayscale(batch);
        if (!RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            throw new BusinessException("請先執行放行檢查並全部通過再申請發布，當前狀態：" + batch.getStatus());
        }
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        // 硬门禁：任一阻断项即拒（含构建标识缺失、业务验收不可豁免）
        gateService.enforceHardGate(batch, deployments, Stage.APPLY);
    
        int before = batch.getVersion() == null ? 0 : batch.getVersion();
        int applicationVersion = RdmReleaseFactService.nextApplicationVersion(batch);
        batch.setApplicantUserId(actorId);
        batch.setApplicantUserName(actorName);
        batch.setApplicationVersion(applicationVersion);
        batch.setSubmittedAt(LocalDateTime.now());
        // 先置 applicationVersion 再采证：证据哈希绑定申请版本，版本不同则哈希不同
        Evidence evidence = gateService.collectEvidence(batch, deployments);
        String snapshotJson = evidence.snapshotJson(batch);
        batch.setApplicationSnapshotJson(snapshotJson);
        batch.setEvidenceHash(evidence.hash());
        // 上一轮的裁决证据作废：本轮申请必须重新裁决，不得沿用旧批准
        batch.setApprovalSnapshotJson(null);
        batch.setApprovalEvidenceHash(null);
        batch.setApprovalExpiresAt(null);
        batchMapper.updateById(batch);
        int expectedAfter = batch.getVersion() != null && batch.getVersion() > before
                ? batch.getVersion() : before + 1;
        if (!Objects.equals(batch.getVersion(), expectedAfter)) {
            // 兼容真实 MyBatis-Plus 乐观锁回填与单测 mock 不回填两种行为
            batch.setVersion(expectedAfter);
        }
        factService.appendApproval(batchId, applicationVersion, RdmConstants.APPROVAL_ACTION_APPLY,
                null, snapshotJson, evidence.hash(), "申請發布", actorId, requestId);
        log.info("發布批次已申請發布（快照與證據已凍結）: batchNo={}, applicationVersion={}, evidenceHash={}, applicant={}",
                batch.getBatchNo(), applicationVersion, evidence.hash(), actorName);
    }
    
    /**
     * 审批发布（幂等入口）。
     * <p><b>封旁路</b>：不只判状态 + 申请人，而是<b>重新校验全部硬门禁</b> + 证据哈希未变，
     * 并要求已存在申请快照（{@code applyRelease} 不可跳过）。
     * <p><b>四眼</b>：裁决人 ≠ 申请人，<b>系统管理员亦无自批豁免</b>；审批资格取项目成员，
     * 不以 {@code canSeeAll} 充当。
     * <p>同意 → deploying 并冻结裁决快照/证据哈希/有效期；拒绝 → cancelled。
     */
    public void decideRelease(Long batchId, RdmReleaseBatchDTO.Decide dto,
                              Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                text(dto == null ? null : dto.getDecision()),
                text(dto == null ? null : dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_DECIDE)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("decide", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        idempotentService.executeOnce(key,
                () -> { doDecideRelease(batchId, dto, actorId, currentUserName, requestId); return null; }, Void.class);
    }
    
    @Transactional(rollbackFor = Exception.class)
    public void doDecideRelease(Long batchId, RdmReleaseBatchDTO.Decide dto,
                                Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");
        if (!RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            throw new BusinessException("僅「檢查中（已申請發布）」的批次可裁決，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getDecision())) {
            throw new BusinessException("請選擇裁決結果（approved/rejected）");
        }
        String decision = dto.getDecision().trim();
        if (!RdmConstants.DECISION_APPROVED.equals(decision) && !RdmConstants.DECISION_REJECTED.equals(decision)) {
            throw new BusinessException("非法的裁決結果: " + decision);
        }
        // 四眼 + 审批资格（无 admin 自批豁免，不以 canSeeAll 充当资格）
        gateService.requireReleaseApprover(batch, actorId);
        // 灰度默认关闭
        gateService.enforceV3ReleaseGrayscale(batch);
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        // 封旁路：申请快照必须存在且证据未变
        gateService.enforceEvidenceUnchanged(batch, deployments);
    
        int applicationVersion = batch.getApplicationVersion() == null
                ? RdmReleaseFactService.nextApplicationVersion(batch) - 1 : batch.getApplicationVersion();
        boolean approved = RdmConstants.DECISION_APPROVED.equals(decision);
        if (approved) {
            // 批准前重新校验全部硬门禁：批准是门禁步骤，不是状态搬运
            gateService.enforceHardGate(batch, deployments, Stage.DECIDE);
        }
        Evidence evidence = gateService.collectEvidence(batch, deployments);
        String approvalSnapshotJson = evidence.snapshotJson(batch);
    
        batch.setApprovalUserId(actorId);
        batch.setApprovalUserName(actorName);
        batch.setApprovalTime(LocalDateTime.now());
        if (approved) {
            batch.setStatus(RdmConstants.RB_DEPLOYING);
            batch.setApprovalSnapshotJson(approvalSnapshotJson);
            batch.setApprovalEvidenceHash(evidence.hash());
            batch.setApprovalExpiresAt(LocalDateTime.now().plusDays(RdmConstants.RELEASE_VALID_DAYS));
            batchMapper.updateById(batch);
            log.info("發布批次已批准，進入部署: batchNo={}, applicationVersion={}, approver={}, expiresAt={}",
                    batch.getBatchNo(), applicationVersion, actorName, batch.getApprovalExpiresAt());
        } else {
            batch.setStatus(RdmConstants.RB_CANCELLED);
            batch.setRollbackReason(dto.getReason());
            batchMapper.updateById(batch);
            log.info("發布批次被驳回: batchNo={}, approver={}, reason={}",
                    batch.getBatchNo(), actorName, dto.getReason());
        }
        // 裁决留痕（uk(batch, applicationVersion, action) 保证同一申请版本只能裁决一次）
        factService.appendApproval(batchId, applicationVersion, RdmConstants.APPROVAL_ACTION_DECIDE,
                decision, approvalSnapshotJson, evidence.hash(),
                StringUtils.hasText(dto.getReason()) ? dto.getReason().trim()
                        : (approved ? "批准發布" : "驳回發布"),
                actorId, requestId);
    }
    
    /* ==================== 部署 / 验证 / 开放 / 回滚 ==================== */

    /**
     * 上报系统部署结果（幂等入口）。
     * <p><b>封旁路</b>：「推进型」结果（deploying/success）必须重新校验 V3 灰度 + 批准裁决有效性
     * （证据未变 + 裁决哈希一致 + 未过期）+ 全部硬门禁；失败类结果（failed/rolled_back）属止损动作，
     * 只校验身份/权限/状态，不因门禁失败或证据过期而被拒（否则事故现场无法收敛）。
     * <p><b>构建不可变</b>：部署只能使用申请快照冻结的 buildId，上报不一致即拒。
     * <p><b>追加式事实</b>：每次上报都向 {@code rdm_release_attempt} 追加一行，不覆盖历史。
     * <p><b>端点契约（任务23 消费）</b>：{@code POST /api/rdm/release-batch/{id}/deploy}，
     * body {@link RdmReleaseBatchDTO.Deploy}。
     */
    public void submitDeployment(Long batchId, RdmReleaseBatchDTO.Deploy dto,
                                 Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                text(dto == null ? null : dto.getSystemCode()),
                text(dto == null ? null : dto.getDeployStatus()),
                text(dto == null ? null : dto.getBuildId())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_DEPLOY)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("deploy", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        idempotentService.executeOnce(key,
                () -> { doSubmitDeployment(batchId, dto, actorId, currentUserName, requestId); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doSubmitDeployment(Long batchId, RdmReleaseBatchDTO.Deploy dto,
                                   Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");
        requireReleaseOwner(batch, actorId, "上報部署結果");
        if (!RdmConstants.RB_DEPLOYING.equals(batch.getStatus())) {
            throw new BusinessException("僅「部署中」的批次可上報部署結果，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getSystemCode())) {
            throw new BusinessException("請指定系統編碼");
        }
        String deployStatus = dto.getDeployStatus() == null ? "" : dto.getDeployStatus().trim();
        if (!DEPLOY_REPORT_STATUS.contains(deployStatus)) {
            throw new BusinessException("非法的部署狀態: " + dto.getDeployStatus());
        }
        RdmReleaseDeployment dep = requireDeployment(batchId, dto.getSystemCode());
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        boolean advancing = DEPLOY_ADVANCING_STATUS.contains(deployStatus);
        if (advancing) {
            // 灰度默认关闭 + 批准仍有效 + 硬门禁重验：部署不是状态搬运，是门禁步骤
            gateService.enforceV3ReleaseGrayscale(batch);
            gateService.enforceApprovalValid(batch, deployments);
            gateService.enforceHardGate(batch, deployments, Stage.DEPLOY);
        }
        // attempt.approval_id 为 NOT NULL 外键：无批准裁决即无部署事实（结构上封死「未批准先部署」）
        Long approvalId = advancing
                ? factService.requireApprovedDecision(batchId).getId()
                : resolveLossMitigationApprovalId(batchId);
        // 构建不可变：一律取申请快照冻结的批准值；止损路径容忍历史脏数据
        String buildId = advancing
                ? gateService.resolveApprovedBuildId(batch, dep, dto.getBuildId())
                : resolveBuildIdForFact(batch, dep);
        Evidence evidence = gateService.collectEvidence(batch, deployments);
        factService.appendAttempt(attemptDraft(batch, dep, RdmConstants.ATTEMPT_ACTION_DEPLOY,
                deployAttemptResult(deployStatus), buildId, approvalId, evidence,
                deployAttemptReason(deployStatus), actorId, requestId));

        dep.setDeployStatus(deployStatus);
        dep.setBuildId(buildId);
        dep.setDeployTime(LocalDateTime.now());
        dep.setOperatorUserId(actorId);
        dep.setOperatorUserName(actorName);
        dep.setAttemptNo((dep.getAttemptNo() == null ? 0 : dep.getAttemptNo()) + 1);
        if (RdmConstants.DEPLOY_FAILED.equals(deployStatus)
                || RdmConstants.DEPLOY_ROLLED_BACK.equals(deployStatus)) {
            // 部署失败/已回滚：同步撤销开放投影，避免「已回滚却仍显示已开放」
            dep.setOpenStatus(RdmConstants.OPEN_STATUS_NOT_OPENED);
            dep.setVerifyStatus(RdmConstants.VERIFY_FAILED);
        }
        deploymentMapper.updateById(dep);

        List<RdmReleaseDeployment> all = listDeployments(batchId);
        if (advancing && gateService.isAllDeployed(all)) {
            batch.setStatus(RdmConstants.RB_VERIFYING);
            batchMapper.updateById(batch);
            log.info("發布批次全部系統部署成功，進入驗證: batchNo={}", batch.getBatchNo());
        }
        log.info("部署結果已上報並追加不可變事實: batchNo={}, system={}, deploy={}, attemptNo={}, advancing={}",
                batch.getBatchNo(), dep.getSystemCode(), deployStatus, dep.getAttemptNo(), advancing);
    }

    /**
     * 上报生产验证结果（幂等入口）。
     * <p><b>验证通过绝不等于已发布</b>：全部验证通过后批次<b>保持 verifying</b>，
     * 必须由独立的开放动作（{@link #openRelease}）建立真实开放事实后才置 released。
     * 这条口径直接决定任务20 路径B（先上线后验收）的 post_release 业务验收门禁是否打开，
     * 因此绝不能由验证通过推导。
     * <p>passed 属推进型结果，须重验灰度 + 批准有效性 + 硬门禁；failed 属止损，不被门禁拒绝。
     * <p><b>端点契约（任务23 消费）</b>：{@code POST /api/rdm/release-batch/{id}/verify}，
     * body {@link RdmReleaseBatchDTO.Verify}（verifyStatus 取 passed/failed）。
     */
    public void submitVerification(Long batchId, RdmReleaseBatchDTO.Verify dto,
                                   Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                text(dto == null ? null : dto.getSystemCode()),
                text(dto == null ? null : dto.getVerifyStatus()),
                text(dto == null ? null : dto.getRemark())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_VERIFY)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("verify", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        idempotentService.executeOnce(key,
                () -> { doSubmitVerification(batchId, dto, actorId, currentUserName, requestId); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doSubmitVerification(Long batchId, RdmReleaseBatchDTO.Verify dto,
                                     Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");
        requireReleaseOwner(batch, actorId, "上報驗證結果");
        if (!RdmConstants.RB_VERIFYING.equals(batch.getStatus())) {
            throw new BusinessException("僅「驗證中」的批次可上報驗證結果，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getSystemCode())) {
            throw new BusinessException("請指定系統編碼");
        }
        String verifyStatus = dto.getVerifyStatus() == null ? "" : dto.getVerifyStatus().trim();
        if (!RdmConstants.VERIFY_PASSED.equals(verifyStatus) && !RdmConstants.VERIFY_FAILED.equals(verifyStatus)) {
            throw new BusinessException("非法的驗證狀態: " + dto.getVerifyStatus() + "（僅支持 passed / failed）");
        }
        RdmReleaseDeployment dep = requireDeployment(batchId, dto.getSystemCode());
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        boolean passed = RdmConstants.VERIFY_PASSED.equals(verifyStatus);
        if (passed) {
            gateService.enforceV3ReleaseGrayscale(batch);
            gateService.enforceApprovalValid(batch, deployments);
            gateService.enforceHardGate(batch, deployments, Stage.VERIFY);
        }
        Long approvalId = passed
                ? factService.requireApprovedDecision(batchId).getId()
                : resolveLossMitigationApprovalId(batchId);
        String buildId = passed
                ? gateService.approvedBuildId(batch, dep.getSystemCode())
                : resolveBuildIdForFact(batch, dep);
        Evidence evidence = gateService.collectEvidence(batch, deployments);
        factService.appendAttempt(attemptDraft(batch, dep, RdmConstants.ATTEMPT_ACTION_VERIFY,
                passed ? RdmConstants.ATTEMPT_RESULT_PASSED : RdmConstants.ATTEMPT_RESULT_FAILED,
                buildId, approvalId, evidence,
                trimToNull(dto.getRemark()) != null ? trimToNull(dto.getRemark())
                        : (passed ? "生產驗證通過" : "生產驗證失敗"),
                actorId, requestId));

        dep.setVerifyStatus(verifyStatus);
        dep.setVerifyTime(LocalDateTime.now());
        dep.setOperatorUserId(actorId);
        dep.setOperatorUserName(actorName);
        if (!passed) {
            // 验证失败：开放事实必须被撤销，路径B 的业务验收门禁重新关闭
            dep.setOpenStatus(RdmConstants.OPEN_STATUS_NOT_OPENED);
        }
        deploymentMapper.updateById(dep);
        // 注意：此处绝不 setStatus(RB_RELEASED)，也绝不推进交付项状态；released 只能由 openRelease 建立
        log.info("驗證結果已上報（僅追加事實，不置 released）: batchNo={}, system={}, verify={}, allVerified={}",
                batch.getBatchNo(), dep.getSystemCode(), verifyStatus, gateService.isAllVerified(listDeployments(batchId)));
    }

    /**
     * 登记业务开放（幂等入口）——<b>任务27 新增的独立事实动作</b>。
     * <p>开放是「验证通过」与「已发布」之间必须真实发生的一步：
     * 只有建立 opened 事实后，批次才置 released 并推进交付项状态；
     * 也只有此时 {@link RdmOpenFactService#isOpenFactEstablished} 才为 true，
     * 任务20 路径B（先上线后验收）的 post_release 业务验收门禁才被打开。
     * <p><b>豁免只豁免发布时序、不豁免开放</b>：{@link Stage#OPEN} 下产品验收必须真实建立
     * （验收结论 pass，或补验单 completed 且 result=pass）；pending/overdue/failed 一律阻断开放。
     * <b>业务验收永不可豁免</b>。
     * <p><b>端点契约（任务23 消费）</b>：{@code POST /api/rdm/release-batch/{id}/open}，
     * body {@link RdmReleaseBatchDTO.Open}：
     * {@code requestId}（幂等）、{@code expectedVersion}（乐观锁，取详情返回的 version）、
     * {@code systemCodes}（为空=全部系统）、{@code openStatus}（opened / not_opened，为空默认 opened）、
     * {@code remark}。响应为统一 {@code Result<Void>}。
     */
    public void openRelease(Long batchId, RdmReleaseBatchDTO.Open dto,
                            Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                String.valueOf(dto == null || dto.getSystemCodes() == null ? "" : dto.getSystemCodes()),
                text(dto == null ? null : dto.getOpenStatus()),
                text(dto == null ? null : dto.getRemark())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_OPEN)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("open", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        idempotentService.executeOnce(key,
                () -> { doOpenRelease(batchId, dto, actorId, currentUserName, requestId); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doOpenRelease(Long batchId, RdmReleaseBatchDTO.Open dto,
                              Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");
        requireReleaseOwner(batch, actorId, "登記業務開放");
        if (!RdmConstants.RB_VERIFYING.equals(batch.getStatus())
                && !RdmConstants.RB_RELEASED.equals(batch.getStatus())) {
            throw new BusinessException("僅「驗證中/已發布」的批次可登記業務開放，當前狀態：" + batch.getStatus());
        }
        if (dto == null) {
            throw new BusinessException("請填寫開放登記信息");
        }
        String openStatus = StringUtils.hasText(dto.getOpenStatus())
                ? dto.getOpenStatus().trim() : RdmConstants.OPEN_STATUS_OPENED;
        if (!RdmConstants.OPEN_STATUS_OPENED.equals(openStatus)
                && !RdmConstants.OPEN_STATUS_NOT_OPENED.equals(openStatus)) {
            throw new BusinessException("非法的開放狀態: " + dto.getOpenStatus() + "（僅支持 opened / not_opened）");
        }
        boolean opened = RdmConstants.OPEN_STATUS_OPENED.equals(openStatus);
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        // 开放必须晚于全量验证通过：开放是独立事实，但不得提前于验证
        if (!gateService.isAllVerified(deployments)) {
            throw new BusinessException("業務開放必須在全部系統驗證通過之後進行（開放是獨立事實，不可由驗證通過推導）");
        }
        if (opened) {
            gateService.enforceV3ReleaseGrayscale(batch);
            gateService.enforceApprovalValid(batch, deployments);
            // OPEN 阶段：紧急豁免一律失效，产品验收必须真实建立
            gateService.enforceHardGate(batch, deployments, Stage.OPEN);
        }
        Long approvalId = opened
                ? factService.requireApprovedDecision(batchId).getId()
                : resolveLossMitigationApprovalId(batchId);
        Evidence evidence = gateService.collectEvidence(batch, deployments);
        List<String> targets = dto.getSystemCodes();
        String remark = trimToNull(dto.getRemark());
        int affected = 0;
        for (RdmReleaseDeployment dep : deployments) {
            boolean targeted = targets == null || targets.isEmpty() || targets.contains(dep.getSystemCode());
            if (!targeted) {
                continue;
            }
            String buildId = opened
                    ? gateService.approvedBuildId(batch, dep.getSystemCode())
                    : resolveBuildIdForFact(batch, dep);
            factService.appendAttempt(attemptDraft(batch, dep, RdmConstants.ATTEMPT_ACTION_OPEN,
                    opened ? RdmConstants.ATTEMPT_RESULT_OPENED : RdmConstants.ATTEMPT_RESULT_NOT_OPENED,
                    buildId, approvalId, evidence,
                    remark != null ? remark : (opened ? "業務開放" : "業務未開放"),
                    actorId, requestId));
            dep.setOpenStatus(openStatus);
            dep.setOpenTime(LocalDateTime.now());
            dep.setOperatorUserId(actorId);
            dep.setOperatorUserName(actorName);
            deploymentMapper.updateById(dep);
            affected++;
        }
        if (affected == 0) {
            throw new BusinessException("未匹配到任何待開放的系統: " + targets);
        }
        List<RdmReleaseDeployment> all = listDeployments(batchId);
        if (opened && gateService.isAllOpened(all) && !RdmConstants.RB_RELEASED.equals(batch.getStatus())) {
            batch.setStatus(RdmConstants.RB_RELEASED);
            batchMapper.updateById(batch);
            // 只有真实开放事实建立后才推进交付项状态（路径B → 待验收评分，其余 → 完成）
            updateDeliveryItemStatusAfterRelease(batch);
            log.info("發布批次已建立開放事實，正式發布: batchNo={}, opened={}/{}",
                    batch.getBatchNo(), gateService.openedCount(all), all.size());
        } else {
            log.info("業務開放登記已追加事實（未達全量開放，不置 released）: batchNo={}, opened={}/{}, openStatus={}",
                    batch.getBatchNo(), gateService.openedCount(all), all.size(), openStatus);
        }
    }

    /**
     * 回滚（幂等入口）：批次须为 deploying/verifying/released；<b>追加</b> rollback 事实，不覆盖历史。
     * <p><b>安全取舍（已报备）</b>：回滚是止损动作，<b>不重验硬门禁、不因证据过期而被拒</b>，
     * 否则事故现场将无法回滚；仍校验身份 / 发布负责人权限 / 批次状态 / 乐观锁。
     * <p><b>关键口径</b>：回滚必须把 {@code openStatus} 置 {@code not_opened} 并追加更晚的
     * rollback 事实，<b>保证 {@link RdmOpenFactService#isOpenFactEstablished} 回到 false</b>，
     * 使路径B 的 post_release 业务验收被重新门禁（不得凭已回滚的上线继续验收）。
     */
    public void rollback(Long batchId, RdmReleaseBatchDTO.Rollback dto,
                         Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                text(dto == null ? null : dto.getReason()),
                String.valueOf(dto == null || dto.getSystemCodes() == null ? "" : dto.getSystemCodes())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_ROLLBACK)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("rollback", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        idempotentService.executeOnce(key,
                () -> { doRollback(batchId, dto, actorId, currentUserName, requestId); return null; }, Void.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public void doRollback(Long batchId, RdmReleaseBatchDTO.Rollback dto,
                           Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");
        requireReleaseOwner(batch, actorId, "回滾發布批次");
        if (!RdmConstants.RB_DEPLOYING.equals(batch.getStatus())
                && !RdmConstants.RB_VERIFYING.equals(batch.getStatus())
                && !RdmConstants.RB_RELEASED.equals(batch.getStatus())) {
            throw new BusinessException("僅「部署中/驗證中/已發布」的批次可回滾，當前狀態：" + batch.getStatus());
        }
        String reason = dto == null ? null : trimToNull(dto.getReason());
        if (reason == null) {
            throw new BusinessException("回滾必須填寫原因");
        }
        List<String> targetSystems = dto.getSystemCodes();
        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        Long approvalId = resolveLossMitigationApprovalId(batchId);
        Evidence evidence = gateService.collectEvidence(batch, deployments);
        boolean rolledBackAny = false;
        for (RdmReleaseDeployment dep : deployments) {
            boolean targeted = targetSystems == null || targetSystems.isEmpty()
                    || targetSystems.contains(dep.getSystemCode());
            boolean deployed = RdmConstants.DEPLOY_SUCCESS.equals(dep.getDeployStatus())
                    || RdmConstants.DEPLOY_DEPLOYING.equals(dep.getDeployStatus());
            if (!(targeted && deployed)) {
                continue;
            }
            factService.appendAttempt(attemptDraft(batch, dep, RdmConstants.ATTEMPT_ACTION_ROLLBACK,
                    RdmConstants.ATTEMPT_RESULT_ROLLED_BACK, resolveBuildIdForFact(batch, dep),
                    approvalId, evidence, reason, actorId, requestId));
            dep.setDeployStatus(RdmConstants.DEPLOY_ROLLED_BACK);
            // 撤销开放事实：回滚后 isOpenFactEstablished 必须回到 false（双重保证：
            // ① 批次状态不再是 released；② 存在比 open 事实更晚的 rollback 事实）
            dep.setOpenStatus(RdmConstants.OPEN_STATUS_NOT_OPENED);
            dep.setVerifyStatus(RdmConstants.VERIFY_FAILED);
            dep.setRollbackReason(reason);
            dep.setOperatorUserId(actorId);
            dep.setOperatorUserName(actorName);
            deploymentMapper.updateById(dep);
            rolledBackAny = true;
        }
        if (!rolledBackAny) {
            throw new BusinessException("未匹配到任何已部署（含部署中）的系統，無需回滾");
        }
        batch.setStatus(RdmConstants.RB_ROLLED_BACK);
        batch.setRollbackReason(reason);
        batchMapper.updateById(batch);
        // 交付项状态回退到待发布：回滚后需重新走发布
        for (Long itemId : scopeItemIds(batch)) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item != null && (RdmConstants.DI_DONE.equals(item.getStatus())
                    || RdmConstants.DI_RELEASED_PENDING.equals(item.getStatus()))) {
                item.setStatus(RdmConstants.DI_PENDING_RELEASE);
                deliveryItemMapper.updateById(item);
            }
        }
        log.info("發布批次已回滾（追加事實，開放事實已撤销）: batchNo={}, reason={}, operator={}",
                batch.getBatchNo(), reason, actorName);
    }

    /* ==================== 紧急豁免 / 补验（委派给 RdmReleaseExemptionService） ==================== */

    /**
     * 申请紧急豁免（委派）。
     * <p><b>端点契约（任务23 消费）</b>：{@code POST /api/rdm/release-batch/{id}/exemption}，
     * body {@link RdmReleaseBatchDTO.Exemption}：{@code requestId}、{@code expectedVersion}、
     * {@code reason}（豁免事由，必填）、{@code risk}（产品风险评估，必填）、
     * {@code rollbackPlan}（可执行回滚预案，必填）、{@code supplementaryPlan}
     * （可选，逐项指定补验人；缺省取交付项的产品验收人）。
     * <p>缺失项由<b>服务端</b>计算，客户端不得自行声明；业务验收缺失直接拒绝。
     */
    public RdmReleaseExemption applyExemption(Long batchId, RdmReleaseBatchDTO.Exemption dto,
                                              Long currentUserId, String currentUserName) {
        return exemptionService.applyExemption(batchId, dto, requireActor(currentUserId), currentUserName);
    }

    /**
     * 裁决紧急豁免（委派）。
     * <p><b>豁免也要四眼</b>：裁决人不得是豁免申请人本人，<b>系统管理员亦无自批豁免</b>；
     * {@code product_risk} 与 {@code release} 两类裁决必须齐备且均为 approved 豁免才生效。
     * <p><b>端点契约（任务23 消费）</b>：
     * {@code POST /api/rdm/release-batch/{id}/exemption/{exemptionId}/decision}，
     * body {@link RdmReleaseBatchDTO.ExemptionDecision}：{@code requestId}、{@code expectedVersion}、
     * {@code decisionType}（product_risk / release）、{@code decision}（approved / rejected）、{@code reason}（必填）。
     */
    public RdmReleaseExemptionDecision decideExemption(Long batchId, Long exemptionId,
                                                       RdmReleaseBatchDTO.ExemptionDecision dto,
                                                       Long currentUserId, String currentUserName) {
        return exemptionService.decideExemption(batchId, exemptionId, dto,
                requireActor(currentUserId), currentUserName);
    }

    /**
     * 登记产品补验完成（委派）。
     * <p><b>端点契约（任务23 消费）</b>：{@code POST /api/rdm/release-batch/supplementary/{id}/complete}，
     * body {@link RdmReleaseBatchDTO.SupplementaryComplete}：{@code requestId}、{@code expectedVersion}、
     * {@code acceptanceRecordId}（必填，必须是已存在的真实产品验收记录）、
     * {@code result}（pass / fail）、{@code evidenceJson}。
     * <p>只有登记人 == 冻结的补验人本人可登记（<b>无 admin 直通</b>）；
     * fail 即置 failed + 升级整改，且开放仍被阻断直到产品验收真实建立。
     */
    public RdmSupplementaryVerification completeSupplementary(Long supplementaryId,
                                                             RdmReleaseBatchDTO.SupplementaryComplete dto,
                                                             Long currentUserId, String currentUserName) {
        return exemptionService.completeSupplementary(supplementaryId, dto,
                requireActor(currentUserId), currentUserName);
    }

    /* ==================== 查询 ==================== */

    /** 分页查询发布批次；非全量授权者只看自己负责或申请的批次。 */
    public Page<RdmReleaseBatchVO.ListItem> listBatches(RdmReleaseBatchDTO.Query query, Long currentUserId) {
        RdmReleaseBatchDTO.Query q = query == null ? new RdmReleaseBatchDTO.Query() : query;
        Page<RdmReleaseBatch> page = new Page<>(normalizePage(q.getPageNo()), normalizeSize(q.getPageSize()));
        LambdaQueryWrapper<RdmReleaseBatch> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(q.getProjectId() != null, RdmReleaseBatch::getProjectId, q.getProjectId());
        wrapper.eq(StringUtils.hasText(q.getStatus()), RdmReleaseBatch::getStatus, q.getStatus());
        wrapper.eq(q.getReleaseOwnerUserId() != null, RdmReleaseBatch::getReleaseOwnerUserId, q.getReleaseOwnerUserId());
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            wrapper.and(w -> w.like(RdmReleaseBatch::getBatchNo, kw)
                    .or().like(RdmReleaseBatch::getVersionTag, kw));
        }
        if (!canSeeAll() && currentUserId != null) {
            wrapper.and(w -> w.eq(RdmReleaseBatch::getReleaseOwnerUserId, currentUserId)
                    .or().eq(RdmReleaseBatch::getApplicantUserId, currentUserId));
        }
        wrapper.orderByDesc(RdmReleaseBatch::getId);
        Page<RdmReleaseBatch> result = batchMapper.selectPage(page, wrapper);
        List<RdmReleaseBatch> rows = result.getRecords();

        Map<Long, String> projectNameMap = loadProjectNames(
                rows.stream().map(RdmReleaseBatch::getProjectId).toList());
        Map<Long, List<RdmReleaseDeployment>> depMap = rows.isEmpty() ? Map.of()
                : deploymentMapper.selectList(new LambdaQueryWrapper<RdmReleaseDeployment>()
                        .in(RdmReleaseDeployment::getReleaseBatchId,
                                rows.stream().map(RdmReleaseBatch::getId).toList()))
                .stream().collect(Collectors.groupingBy(RdmReleaseDeployment::getReleaseBatchId));

        Page<RdmReleaseBatchVO.ListItem> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(rows.stream()
                .map(b -> toListItem(b, projectNameMap, depMap.getOrDefault(b.getId(), List.of())))
                .toList());
        return voPage;
    }

    /**
     * 批次详情（含部署记录、追加式事实、实时放行检查、裁决/豁免/补验留痕）。
     * <p><b>只读投影</b>：五类闸门由服务端实时计算，客户端只能看结果不能改写结论；
     * 豁免的效果由 {@link RdmReleaseGateService#applyExemptionWaiver} 显式叠加并在 message 中标明。
     */
    public RdmReleaseBatchVO.Detail getBatchDetail(Long batchId, Long currentUserId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        List<RdmReleaseDeployment> deps = listDeployments(batchId);
        RdmProject project = batch.getProjectId() == null ? null : projectMapper.selectById(batch.getProjectId());

        RdmReleaseBatchVO.Detail detail = new RdmReleaseBatchVO.Detail();
        detail.setId(batch.getId());
        detail.setBatchNo(batch.getBatchNo());
        detail.setVersionTag(batch.getVersionTag());
        detail.setProjectName(project == null ? null : project.getName());
        detail.setReleaseOwnerUserName(batch.getReleaseOwnerUserName());
        detail.setPlanTime(DateTimeUtils.format(batch.getPlanTime()));
        detail.setStatus(batch.getStatus());
        detail.setSystemCount(deps.size());
        detail.setDeployedCount((int) deps.stream()
                .filter(d -> RdmConstants.DEPLOY_SUCCESS.equals(d.getDeployStatus())).count());
        detail.setCreatedAt(DateTimeUtils.format(batch.getCreatedAt()));
        detail.setUpdatedAt(DateTimeUtils.format(batch.getUpdatedAt()));
        detail.setScopeSnapshotJson(batch.getScopeSnapshotJson());
        detail.setApprovalUserName(batch.getApprovalUserName());
        detail.setApprovalTime(DateTimeUtils.format(batch.getApprovalTime()));
        detail.setApplicantUserName(batch.getApplicantUserName());
        detail.setRollbackReason(batch.getRollbackReason());
        // Batch 3 事实字段（前端提交写操作时必须回传 version 作为 expectedVersion）
        detail.setVersion(batch.getVersion());
        detail.setApplicationVersion(batch.getApplicationVersion());
        detail.setApplicationSnapshotJson(batch.getApplicationSnapshotJson());
        detail.setApprovalSnapshotJson(batch.getApprovalSnapshotJson());
        detail.setSubmittedAt(DateTimeUtils.format(batch.getSubmittedAt()));
        detail.setApprovalExpiresAt(DateTimeUtils.format(batch.getApprovalExpiresAt()));
        // 任务27 新增：追加式事实回显（只增不改，历史永久留痕）
        Map<Long, List<RdmReleaseAttempt>> attemptMap = factService.listAttempts(batchId).stream()
                .filter(a -> a != null && a.getDeploymentId() != null)
                .collect(Collectors.groupingBy(RdmReleaseAttempt::getDeploymentId));
        detail.setDeployments(deps.stream()
                .map(d -> toDeploymentRecord(d, attemptMap.getOrDefault(d.getId(), List.of())))
                .toList());
        // 任务27 新增只读投影：验证通过不等于已发布；开放数不由验证推导
        detail.setVerificationPassed(gateService.isAllVerified(deps));
        detail.setOpenedCount(gateService.openedCount(deps));
        detail.setV3ReleaseEnabled(gateService.isV3ReleaseEnabled(batch));
        detail.setApprovals(factService.listApprovals(batchId).stream()
                .map(RdmReleaseBatchService::toApprovalRecord).toList());
        detail.setExemptions(toExemptionRecords(batch, deps));
        // 补验逾期按真实工作日历按需刷新（读路径刷新，不依赖 cron）
        if (RdmConstants.RB_ACTIVE_STATUSES.contains(batch.getStatus())) {
            exemptionService.refreshOverdue(batchId);
        }
        detail.setSupplementaries(toSupplementaryRecords(batchId));
        // 已结束批次不再实时算检查（结论已固化在状态里），仅规划/检查中回显检查项
        if (RdmConstants.RB_PLANNING.equals(batch.getStatus())
                || RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            List<RdmReleaseBatchVO.CheckResult> checks = gateService.computeChecks(batch, deps);
            gateService.applyExemptionWaiver(batch, deps, checks);
            detail.setCheckResults(checks);
        }
        return detail;
    }

    /* ==================== 私有辅助：发布事实草稿 ==================== */

    /** 组装一条追加式尝试事实草稿（列多为 NOT NULL，统一在此处填齐）。 */
    private AttemptDraft attemptDraft(RdmReleaseBatch batch, RdmReleaseDeployment dep, String action,
                                      String result, String buildId, Long approvalId, Evidence evidence,
                                      String reason, Long actorId, String requestId) {
        AttemptDraft draft = new AttemptDraft();
        draft.setReleaseBatchId(batch.getId());
        draft.setDeploymentId(dep.getId());
        draft.setAction(action);
        draft.setResult(result);
        draft.setBuildId(buildId);
        draft.setApprovalId(approvalId);
        draft.setScopeSnapshotJson(batch.getApplicationSnapshotJson());
        draft.setEvidenceJson(JsonUtils.toJson(evidence == null ? List.of() : evidence.items()));
        draft.setEvidenceHash(evidence == null ? null : evidence.hash());
        draft.setReason(reason);
        draft.setOperatorUserId(actorId);
        draft.setRequestId(requestId);
        return draft;
    }

    /** 部署上报状态 → 追加事实 result 取值（与 {@code ck_rdm_attempt_result} 契约一致）。 */
    private static String deployAttemptResult(String deployStatus) {
        if (RdmConstants.DEPLOY_DEPLOYING.equals(deployStatus)) {
            return RdmConstants.ATTEMPT_RESULT_DEPLOYING;
        }
        if (RdmConstants.DEPLOY_SUCCESS.equals(deployStatus)) {
            return RdmConstants.ATTEMPT_RESULT_SUCCESS;
        }
        if (RdmConstants.DEPLOY_ROLLED_BACK.equals(deployStatus)) {
            return RdmConstants.ATTEMPT_RESULT_ROLLED_BACK;
        }
        return RdmConstants.ATTEMPT_RESULT_FAILED;
    }

    private static String deployAttemptReason(String deployStatus) {
        if (RdmConstants.DEPLOY_DEPLOYING.equals(deployStatus)) {
            return "部署進行中";
        }
        if (RdmConstants.DEPLOY_SUCCESS.equals(deployStatus)) {
            return "部署成功";
        }
        if (RdmConstants.DEPLOY_ROLLED_BACK.equals(deployStatus)) {
            return "部署已回滾";
        }
        return "部署失敗";
    }

    /**
     * 止损动作（deploy=failed/rolled_back、verify=failed、open=not_opened、rollback）的裁决行 ID。
     * <p>{@code attempt.approval_id} 为 NOT NULL 外键，因此止损路径也必须绑定一行留痕；
     * 优先取最新 decide 行，其次 apply 行（兼容任务27 之前已处于 deploying/released 的存量批次），
     * 两者都没有则 fail-closed（无任何放行留痕的批次不得产生发布事实）。
     */
    private Long resolveLossMitigationApprovalId(Long batchId) {
        RdmReleaseApproval decide = factService.latestApproval(batchId, RdmConstants.APPROVAL_ACTION_DECIDE);
        if (decide != null && decide.getId() != null) {
            return decide.getId();
        }
        RdmReleaseApproval apply = factService.latestApproval(batchId, RdmConstants.APPROVAL_ACTION_APPLY);
        if (apply != null && apply.getId() != null) {
            return apply.getId();
        }
        throw new BusinessException("該批次無任何放行留痕，無法追加發布事實（attempt.approval_id 為 NOT NULL 外鍵）；"
                + "請先完成檢查 → 申請 → 裁決");
    }

    /**
     * 止损路径的构建标识：优先用部署记录上的真实值，其次申请快照批准值，
     * 两者都缺失时落到固定占位值（列 NOT NULL，不能为空）。
     */
    private String resolveBuildIdForFact(RdmReleaseBatch batch, RdmReleaseDeployment dep) {
        if (StringUtils.hasText(dep.getBuildId())) {
            return dep.getBuildId().trim();
        }
        try {
            return gateService.approvedBuildId(batch, dep.getSystemCode());
        } catch (RuntimeException e) {
            log.warn("止損事實無法解析批准構建標識，落占位值: batchId={}, system={}",
                    batch.getId(), dep.getSystemCode());
            return UNKNOWN_BUILD_ID;
        }
    }

    /** 发布成功后推进交付项状态：路径 B（先上线后验收）→ 待验收评分，其余 → 完成。 */
    private void updateDeliveryItemStatusAfterRelease(RdmReleaseBatch batch) {
        List<Map<String, Object>> scope = JsonUtils.parseMapList(batch.getScopeSnapshotJson());
        for (Map<String, Object> row : scope) {
            Long itemId = toLong(row.get("deliveryItemId"));
            if (itemId == null) {
                continue;
            }
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item == null) {
                continue;
            }
            String path = StringUtils.hasText(item.getAcceptancePath())
                    ? item.getAcceptancePath() : (String) row.get("acceptancePath");
            item.setStatus(RdmConstants.PATH_B.equals(path)
                    ? RdmConstants.DI_RELEASED_PENDING : RdmConstants.DI_DONE);
            deliveryItemMapper.updateById(item);
        }
    }

    /* ==================== 私有辅助：通用 ==================== */

    private List<Map<String, Object>> buildScopeSnapshot(List<RdmDeliveryItem> items) {
        List<Map<String, Object>> snapshot = new ArrayList<>();
        for (RdmDeliveryItem item : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deliveryItemId", item.getId());
            row.put("itemNo", item.getItemNo());
            row.put("title", item.getTitle());
            row.put("scopeVersion", item.getScopeVersion());
            row.put("acceptancePath", item.getAcceptancePath());
            snapshot.add(row);
        }
        return snapshot;
    }

    private List<Long> scopeItemIds(RdmReleaseBatch batch) {
        return JsonUtils.parseMapList(batch.getScopeSnapshotJson()).stream()
                .map(m -> toLong(m.get("deliveryItemId")))
                .filter(Objects::nonNull)
                .toList();
    }

    private List<RdmReleaseDeployment> listDeployments(Long batchId) {
        return deploymentMapper.selectList(new LambdaQueryWrapper<RdmReleaseDeployment>()
                .eq(RdmReleaseDeployment::getReleaseBatchId, batchId)
                .orderByAsc(RdmReleaseDeployment::getDeployOrder)
                .orderByAsc(RdmReleaseDeployment::getId));
    }

    private RdmReleaseDeployment requireDeployment(Long batchId, String systemCode) {
        RdmReleaseDeployment dep = deploymentMapper.selectOne(new LambdaQueryWrapper<RdmReleaseDeployment>()
                .eq(RdmReleaseDeployment::getReleaseBatchId, batchId)
                .eq(RdmReleaseDeployment::getSystemCode, systemCode.trim())
                .orderByAsc(RdmReleaseDeployment::getId)
                .last("LIMIT 1"));
        if (dep == null) {
            throw new BusinessException("批次內不存在該系統的部署記錄: " + systemCode);
        }
        return dep;
    }

    private Map<Long, String> loadProjectNames(List<Long> projectIds) {
        List<Long> ids = projectIds == null ? List.of()
                : projectIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return projectMapper.selectList(new LambdaQueryWrapper<RdmProject>()
                        .in(RdmProject::getId, ids)).stream()
                .collect(Collectors.toMap(RdmProject::getId,
                        p -> p.getName() == null ? "" : p.getName(), (a, b) -> a));
    }

    private RdmReleaseBatch requireBatch(Long batchId) {
        RdmReleaseBatch batch = batchId == null ? null : batchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException("發布批次不存在或已刪除");
        }
        return batch;
    }

    /** 发布负责人校验（管理员放行）：编排动作只有本批次发布负责人可执行。 */
    private void requireReleaseOwner(RdmReleaseBatch batch, Long currentUserId, String action) {
        if (canSeeAll()) {
            return;
        }
        if (currentUserId == null || !currentUserId.equals(batch.getReleaseOwnerUserId())) {
            throw new BusinessException("僅本批次的發布負責人可以" + action);
        }
    }

    private boolean canSeeAll() {
        SysUser current = operatorResolver.currentUser();
        return accessGuard.canSeeAll(current);
    }

    private String generateBatchNo() {
        return bizSeqService.next(SEQ_RELEASE_BATCH);
    }

    private RdmReleaseBatchVO.ListItem toListItem(RdmReleaseBatch b, Map<Long, String> projectNameMap,
                                                  List<RdmReleaseDeployment> deps) {
        RdmReleaseBatchVO.ListItem vo = new RdmReleaseBatchVO.ListItem();
        vo.setId(b.getId());
        vo.setBatchNo(b.getBatchNo());
        vo.setVersionTag(b.getVersionTag());
        vo.setProjectName(b.getProjectId() == null ? null : projectNameMap.get(b.getProjectId()));
        vo.setReleaseOwnerUserName(b.getReleaseOwnerUserName());
        vo.setPlanTime(DateTimeUtils.format(b.getPlanTime()));
        vo.setStatus(b.getStatus());
        vo.setSystemCount(deps.size());
        vo.setDeployedCount((int) deps.stream()
                .filter(d -> RdmConstants.DEPLOY_SUCCESS.equals(d.getDeployStatus())).count());
        vo.setCreatedAt(DateTimeUtils.format(b.getCreatedAt()));
        return vo;
    }

    private RdmReleaseBatchVO.DeploymentRecord toDeploymentRecord(RdmReleaseDeployment d) {
        RdmReleaseBatchVO.DeploymentRecord vo = new RdmReleaseBatchVO.DeploymentRecord();
        vo.setId(d.getId());
        vo.setSystemCode(d.getSystemCode());
        vo.setSystemName(d.getSystemName());
        vo.setBuildId(d.getBuildId());
        vo.setDeployOrder(d.getDeployOrder());
        vo.setDeployStatus(d.getDeployStatus());
        vo.setDeployTime(DateTimeUtils.format(d.getDeployTime()));
        vo.setVerifyStatus(d.getVerifyStatus());
        vo.setVerifyTime(DateTimeUtils.format(d.getVerifyTime()));
        vo.setOpenStatus(d.getOpenStatus());
        vo.setOpenTime(DateTimeUtils.format(d.getOpenTime()));
        vo.setRollbackReason(d.getRollbackReason());
        vo.setAttemptNo(d.getAttemptNo());
        vo.setOperatorUserName(d.getOperatorUserName());
        return vo;
    }

    /* ==================== 私有辅助：任务27 只读投影 ==================== */

    /** 部署记录 + 本系统的追加式尝试事实（只增不改的历史留痕）。 */
    private RdmReleaseBatchVO.DeploymentRecord toDeploymentRecord(RdmReleaseDeployment d,
                                                                  List<RdmReleaseAttempt> attempts) {
        RdmReleaseBatchVO.DeploymentRecord vo = toDeploymentRecord(d);
        vo.setAttempts(attempts == null ? List.of()
                : attempts.stream().filter(Objects::nonNull)
                        .map(RdmReleaseBatchService::toAttemptRecord).toList());
        return vo;
    }

    private static RdmReleaseBatchVO.AttemptRecord toAttemptRecord(RdmReleaseAttempt a) {
        RdmReleaseBatchVO.AttemptRecord vo = new RdmReleaseBatchVO.AttemptRecord();
        vo.setId(a.getId());
        vo.setDeploymentId(a.getDeploymentId());
        vo.setAttemptNo(a.getAttemptNo());
        vo.setAction(a.getAction());
        vo.setResult(a.getResult());
        vo.setBuildId(a.getBuildId());
        vo.setTestEnv(a.getTestEnv());
        vo.setApprovalId(a.getApprovalId());
        vo.setReason(a.getReason());
        vo.setOperatorUserId(a.getOperatorUserId());
        vo.setOccurredAt(DateTimeUtils.format(a.getOccurredAt()));
        return vo;
    }

    private static RdmReleaseBatchVO.ApprovalRecord toApprovalRecord(RdmReleaseApproval a) {
        RdmReleaseBatchVO.ApprovalRecord vo = new RdmReleaseBatchVO.ApprovalRecord();
        vo.setId(a.getId());
        vo.setApplicationVersion(a.getApplicationVersion());
        vo.setAction(a.getAction());
        vo.setDecision(a.getDecision());
        vo.setReason(a.getReason());
        vo.setOperatorUserId(a.getOperatorUserId());
        vo.setEvidenceHash(a.getEvidenceHash());
        vo.setCreatedAt(DateTimeUtils.format(a.getCreatedAt()));
        return vo;
    }

    private static RdmReleaseBatchVO.ExemptionDecisionRecord toExemptionDecisionRecord(
            RdmReleaseExemptionDecision d) {
        RdmReleaseBatchVO.ExemptionDecisionRecord vo = new RdmReleaseBatchVO.ExemptionDecisionRecord();
        vo.setId(d.getId());
        vo.setDecisionType(d.getDecisionType());
        vo.setDecision(d.getDecision());
        vo.setReason(d.getReason());
        vo.setSignerUserId(d.getSignerUserId());
        vo.setCreatedAt(DateTimeUtils.format(d.getCreatedAt()));
        return vo;
    }

    /**
     * 紧急豁免单投影（含两类裁决与生效判定）。
     * <p>{@code effective} 只对<b>最新</b>豁免单有意义：范围版本或构建映射一变，
     * 豁免即自动失效，必须重新申请，避免「按旧风险评估放行新代码」。
     */
    private List<RdmReleaseBatchVO.ExemptionRecord> toExemptionRecords(RdmReleaseBatch batch,
                                                                      List<RdmReleaseDeployment> deps) {
        List<RdmReleaseBatchVO.ExemptionRecord> result = new ArrayList<>();
        RdmReleaseExemption latest = exemptionService.latestExemption(batch.getId());
        boolean latestEffective = latest != null && exemptionService.isExemptionEffective(batch, deps);
        for (RdmReleaseExemption e : exemptionService.listExemptions(batch.getId())) {
            if (e == null) {
                continue;
            }
            RdmReleaseBatchVO.ExemptionRecord vo = new RdmReleaseBatchVO.ExemptionRecord();
            vo.setId(e.getId());
            vo.setApplicationVersion(e.getApplicationVersion());
            vo.setApplicantUserId(e.getApplicantUserId());
            vo.setReason(e.getReason());
            vo.setRisk(e.getRisk());
            vo.setRollbackPlan(e.getRollbackPlan());
            vo.setMissingAcceptanceJson(e.getMissingAcceptanceJson());
            vo.setSupplementaryPlanJson(e.getSupplementaryPlanJson());
            List<RdmReleaseExemptionDecision> decisions = exemptionService.listDecisions(e.getId());
            vo.setDecisions(decisions.stream().filter(Objects::nonNull)
                    .map(RdmReleaseBatchService::toExemptionDecisionRecord).toList());
            vo.setProductRiskApproved(hasApprovedDecision(decisions, RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK));
            vo.setReleaseApproved(hasApprovedDecision(decisions, RdmConstants.EXEMPTION_DECISION_RELEASE));
            vo.setEffective(latestEffective && latest.getId() != null && latest.getId().equals(e.getId()));
            vo.setCreatedAt(DateTimeUtils.format(e.getCreatedAt()));
            result.add(vo);
        }
        return result;
    }

    private static boolean hasApprovedDecision(List<RdmReleaseExemptionDecision> decisions, String decisionType) {
        return decisions != null && decisions.stream()
                .anyMatch(d -> d != null && decisionType.equals(d.getDecisionType())
                        && RdmConstants.DECISION_APPROVED.equals(d.getDecision()));
    }

    /** 产品补验单投影：逾期天数按真实工作日历现算（不存列、不依赖 cron）。 */
    private List<RdmReleaseBatchVO.SupplementaryRecord> toSupplementaryRecords(Long batchId) {
        List<RdmReleaseBatchVO.SupplementaryRecord> result = new ArrayList<>();
        for (RdmSupplementaryVerification sv : exemptionService.listSupplementaries(batchId)) {
            if (sv == null) {
                continue;
            }
            RdmReleaseBatchVO.SupplementaryRecord vo = new RdmReleaseBatchVO.SupplementaryRecord();
            vo.setId(sv.getId());
            vo.setDeliveryItemId(sv.getDeliveryItemId());
            RdmDeliveryItem item = sv.getDeliveryItemId() == null
                    ? null : deliveryItemMapper.selectById(sv.getDeliveryItemId());
            vo.setDeliveryItemTitle(item == null ? null : item.getTitle());
            vo.setScopeVersion(sv.getScopeVersion());
            vo.setBuildId(sv.getBuildId());
            vo.setVerificationType(sv.getVerificationType());
            vo.setExemptionId(sv.getExemptionId());
            vo.setVerifierUserId(sv.getVerifierUserId());
            vo.setVerifierUserName(sv.getVerifierUserName());
            vo.setDeadline(DateTimeUtils.format(sv.getDeadline()));
            vo.setCalendarVersion(sv.getCalendarVersion());
            vo.setStatus(sv.getStatus());
            vo.setResult(sv.getResult());
            vo.setAcceptanceRecordId(sv.getAcceptanceRecordId());
            vo.setEscalated(sv.getEscalated() != null && sv.getEscalated() == 1);
            vo.setEscalationLevel(sv.getEscalationLevel());
            vo.setOverdueWorkingDays(exemptionService.overdueWorkingDays(sv));
            vo.setCompletedAt(DateTimeUtils.format(sv.getCompletedAt()));
            vo.setVersion(sv.getVersion());
            result.add(vo);
        }
        return result;
    }

    /* ==================== 私有辅助：幂等与乐观锁 ==================== */

    /** 身份必须来自认证主体（{@code SysUser.id}）：为空即登录态失效，fail-closed。 */
    private Long requireActor(Long currentUserId) {
        if (currentUserId != null) {
            return currentUserId;
        }
        SysUser current = operatorResolver.currentUser();
        Long resolved = current == null ? null : current.getId();
        if (resolved == null) {
            throw new BusinessException("登錄狀態失效，無法執行發布操作，請重新登錄");
        }
        return resolved;
    }

    /**
     * 幂等 clientRequestId：优先客户端 requestId，否则用服务端派生判别子。
     * <p><b>必须适配 {@code rdm_idempotent_log.client_request_id VARCHAR(64) ascii}</b>：
     * 派生判别子本身就是 64 位 hex，与 op 前缀拼接后会超出列宽；
     * 因此超长或含非 ASCII 字符时统一再取一次 SHA-256，得到定长 64 位 ASCII 值，
     * 且保持「同 op 同内容 → 同 id」的幂等语义不变。
     */
    private static String deriveClientRequestId(String op, String requestId, String discriminator) {
        String tail = StringUtils.hasText(requestId) ? requestId.trim()
                : (StringUtils.hasText(discriminator) ? discriminator : "na");
        String raw = op + ":" + tail;
        return fitsClientRequestIdColumn(raw) ? raw : RdmIdempotentService.sha256Hex(raw);
    }

    private static boolean fitsClientRequestIdColumn(String raw) {
        if (raw.length() > CLIENT_REQUEST_ID_MAX) {
            return false;
        }
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c < 0x20 || c > 0x7E) {
                return false;
            }
        }
        return true;
    }

    /** 乐观锁预检：客户端回传版本与当前实体版本不一致即拒（真实并发由 {@code @Version} 兜底）。 */
    private static void checkExpectedVersion(Integer expected, Integer actual, String what) {
        if (expected == null) {
            return;
        }
        if (actual == null || !expected.equals(actual)) {
            throw new BusinessException(what + "已被他人修改（版本不一致），請刷新後重試");
        }
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }

    private static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer toInt(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.valueOf(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime parseDateTime(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            String cleaned = value.trim().replace(' ', 'T');
            if (cleaned.length() == 16) {
                cleaned = cleaned + ":00";
            }
            if (cleaned.length() > 19) {
                cleaned = cleaned.substring(0, 19);
            }
            return LocalDateTime.parse(cleaned);
        } catch (Exception e) {
            throw new BusinessException("計劃發布時間格式不正確：" + value + "（應為 YYYY-MM-DD HH:mm:ss）");
        }
    }

    private static long normalizePage(Integer pageNo) {
        return pageNo == null || pageNo < 1 ? 1L : pageNo;
    }

    private static long normalizeSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) {
            return 20L;
        }
        return Math.min(pageSize, 200L);
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
