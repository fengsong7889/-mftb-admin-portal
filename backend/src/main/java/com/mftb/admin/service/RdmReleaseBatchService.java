package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
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
 * <p>发布批次是「多系统一次上线」的编排单位，四条口径不可让：
 * <ol>
 *   <li><b>放行检查由服务端算</b>：测试/验收/缺陷/依赖/范围五类闸门实时计算，
 *       客户端只能看结果与裁决，不能改写检查结论（{@link #runCheck}）；</li>
 *   <li><b>四眼原则</b>：放行裁决人不能是申请人本人（系统管理员除外），
 *       否则闸门退化成自己给自己盖章；</li>
 *   <li><b>逐系统部署 + 逐系统验证</b>：全部部署成功才进验证，全部验证通过才置 released，
 *       任一环节失败可回滚，交付项状态随之回退；</li>
 *   <li><b>范围一致性</b>：以创建批次时冻结的范围快照为准，交付项范围版本变更后检查失败，
 *       防止「按旧范围放行、上新范围代码」。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmReleaseBatchService {

    /** 发布批次号规则 key（前缀 FB + YYYYMMDD + 4 位） */
    private static final String SEQ_RELEASE_BATCH = "rdm_release_batch";

    /** 检查类型（与 RdmReleaseBatchVO.CheckResult 契约一致） */
    private static final String CHECK_TEST = "test";
    private static final String CHECK_ACCEPTANCE = "acceptance";
    private static final String CHECK_DEFECT = "defect";
    private static final String CHECK_DEPENDENCY = "dependency";
    private static final String CHECK_SCOPE = "scope";

    /** 裁决动作 */
    private static final String DECISION_APPROVED = "approved";
    private static final String DECISION_REJECTED = "rejected";

    /** 部署状态（上报允许的取值） */
    private static final List<String> DEPLOY_REPORT_STATUS = List.of(
            RdmConstants.DEPLOY_DEPLOYING, RdmConstants.DEPLOY_SUCCESS,
            RdmConstants.DEPLOY_FAILED, RdmConstants.DEPLOY_ROLLED_BACK);

    /** 可发布的交付项状态（依赖就绪判定） */
    private static final List<String> RELEASABLE_ITEM_STATUS = List.of(
            RdmConstants.DI_PENDING_RELEASE, RdmConstants.DI_RELEASED_PENDING, RdmConstants.DI_DONE);

    private final RdmReleaseBatchMapper batchMapper;
    private final RdmReleaseDeploymentMapper deploymentMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmAcceptanceRecordMapper acceptanceMapper;
    private final RdmProjectMapper projectMapper;
    private final RdmTestBatchService testBatchService;
    private final RdmIssueService issueService;
    private final RdmAccessGuard accessGuard;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    /** 流程版本守卫：第二批期间 V3 分批交付的实际发布能力尚未开放 */
    private final RdmFlowVersionGuard flowVersionGuard;

    /* ==================== 创建 ==================== */

    /**
     * 创建发布批次：冻结范围快照，按部署清单建立部署记录，状态 planning。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmReleaseBatch createBatch(RdmReleaseBatchDTO.Create dto, Long currentUserId, String currentUserName) {
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
        batch.setApplicantUserId(currentUserId);
        batch.setApplicantUserName(currentUserName);
        batchMapper.insert(batch);

        createDeployments(batch.getId(), dto.getDeployments());
        log.info("發布批次已創建: batchNo={}, versionTag={}, items={}, operator={}",
                batch.getBatchNo(), batch.getVersionTag(), itemIds.size(), currentUserName);
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
            dep.setVerifyStatus("pending");
            dep.setOpenStatus("pending");
            dep.setAttemptNo(0);
            deploymentMapper.insert(dep);
            order++;
        }
    }

    /* ==================== 放行检查 ==================== */

    /**
     * 执行放行检查：测试/验收/缺陷/依赖/范围五类闸门，全部由服务端实时计算。
     * 检查后批次进入 checking 状态（等待发起与裁决）。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<RdmReleaseBatchVO.CheckResult> runCheck(Long batchId, Long currentUserId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, currentUserId, "執行放行檢查");
        if (!RdmConstants.RB_PLANNING.equals(batch.getStatus())
                && !RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            throw new BusinessException("僅「規劃中」或「檢查中」的批次可執行放行檢查，當前狀態：" + batch.getStatus());
        }
        List<RdmReleaseBatchVO.CheckResult> checks = computeChecks(batch);
        if (!RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            batch.setStatus(RdmConstants.RB_CHECKING);
            batchMapper.updateById(batch);
        }
        log.info("發布批次放行檢查完成: batchNo={}, passed={}/{}", batch.getBatchNo(),
                checks.stream().filter(c -> Boolean.TRUE.equals(c.getPassed())).count(), checks.size());
        return checks;
    }

    /**
     * 申请发布：所有检查项必须通过，记录申请人（供四眼原则校验），状态保持 checking 等待裁决。
     */
    @Transactional(rollbackFor = Exception.class)
    public void applyRelease(Long batchId, Long currentUserId, String currentUserName) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, currentUserId, "申請發布");
        // 第二批：若批次内含 V3 分批交付需求的交付项，发布能力尚未开放，统一拦截
        for (Long itemId : scopeItemIds(batch)) {
            if (flowVersionGuard.isDeliveryItemFlowV3(itemId)) {
                flowVersionGuard.ensureReleaseDisabledForV3(batchId);
            }
        }
        if (!RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            throw new BusinessException("請先執行放行檢查再申請發布，當前狀態：" + batch.getStatus());
        }
        List<RdmReleaseBatchVO.CheckResult> checks = computeChecks(batch);
        List<String> failed = checks.stream()
                .filter(c -> !Boolean.TRUE.equals(c.getPassed()))
                .map(RdmReleaseBatchVO.CheckResult::getCheckType)
                .toList();
        if (!failed.isEmpty()) {
            throw new BusinessException("放行檢查未全部通過，阻斷項：" + String.join("、", failed));
        }
        batch.setApplicantUserId(currentUserId);
        batch.setApplicantUserName(currentUserName);
        batchMapper.updateById(batch);
        log.info("發布批次已申請發布: batchNo={}, applicant={}", batch.getBatchNo(), currentUserName);
    }

    /**
     * 审批发布（四眼原则：裁决人不能是申请人本人，系统管理员除外）。
     * 同意 → deploying；拒绝 → cancelled。
     */
    @Transactional(rollbackFor = Exception.class)
    public void decideRelease(Long batchId, RdmReleaseBatchDTO.Decide dto,
                              Long currentUserId, String currentUserName) {
        RdmReleaseBatch batch = requireBatch(batchId);
        if (!RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            throw new BusinessException("僅「檢查中（已申請發布）」的批次可裁決，當前狀態：" + batch.getStatus());
        }
        if (batch.getApplicantUserId() == null) {
            throw new BusinessException("該批次尚未申請發布，無法裁決");
        }
        boolean admin = canSeeAll();
        if (!admin && currentUserId != null && currentUserId.equals(batch.getApplicantUserId())) {
            throw new BusinessException("四眼原則：發布裁決人不能是申請人本人");
        }
        if (dto == null || !StringUtils.hasText(dto.getDecision())) {
            throw new BusinessException("請選擇裁決結果（approved/rejected）");
        }
        String decision = dto.getDecision().trim();
        batch.setApprovalUserId(currentUserId);
        batch.setApprovalUserName(currentUserName);
        batch.setApprovalTime(LocalDateTime.now());
        if (DECISION_APPROVED.equals(decision)) {
            batch.setStatus(RdmConstants.RB_DEPLOYING);
            batchMapper.updateById(batch);
            log.info("發布批次已批准，進入部署: batchNo={}, approver={}", batch.getBatchNo(), currentUserName);
        } else if (DECISION_REJECTED.equals(decision)) {
            batch.setStatus(RdmConstants.RB_CANCELLED);
            batch.setRollbackReason(dto.getReason());
            batchMapper.updateById(batch);
            log.info("發布批次被駁回: batchNo={}, approver={}, reason={}",
                    batch.getBatchNo(), currentUserName, dto.getReason());
        } else {
            throw new BusinessException("非法的裁決結果: " + decision);
        }
    }

    /* ==================== 部署与验证 ==================== */

    /**
     * 记录系统部署结果：批次须为 deploying；全部系统部署成功后进入 verifying。
     */
    @Transactional(rollbackFor = Exception.class)
    public void submitDeployment(Long batchId, RdmReleaseBatchDTO.Deploy dto,
                                 Long currentUserId, String currentUserName) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, currentUserId, "上報部署結果");
        if (!RdmConstants.RB_DEPLOYING.equals(batch.getStatus())) {
            throw new BusinessException("僅「部署中」的批次可上報部署結果，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getSystemCode())) {
            throw new BusinessException("請指定系統編碼");
        }
        if (!StringUtils.hasText(dto.getDeployStatus()) || !DEPLOY_REPORT_STATUS.contains(dto.getDeployStatus())) {
            throw new BusinessException("非法的部署狀態: " + dto.getDeployStatus());
        }
        RdmReleaseDeployment dep = requireDeployment(batchId, dto.getSystemCode());
        dep.setDeployStatus(dto.getDeployStatus().trim());
        if (StringUtils.hasText(dto.getBuildId())) {
            dep.setBuildId(dto.getBuildId().trim());
        }
        dep.setDeployTime(LocalDateTime.now());
        dep.setOperatorUserId(currentUserId);
        dep.setOperatorUserName(currentUserName);
        dep.setAttemptNo((dep.getAttemptNo() == null ? 0 : dep.getAttemptNo()) + 1);
        deploymentMapper.updateById(dep);

        List<RdmReleaseDeployment> all = listDeployments(batchId);
        boolean allSuccess = !all.isEmpty() && all.stream()
                .allMatch(d -> RdmConstants.DEPLOY_SUCCESS.equals(d.getDeployStatus()));
        if (allSuccess) {
            batch.setStatus(RdmConstants.RB_VERIFYING);
            batchMapper.updateById(batch);
            log.info("發布批次全部系統部署成功，進入驗證: batchNo={}", batch.getBatchNo());
        }
    }

    /**
     * 生产验证：批次须为 verifying；全部系统验证通过后置 released 并推进交付项状态。
     */
    @Transactional(rollbackFor = Exception.class)
    public void submitVerification(Long batchId, RdmReleaseBatchDTO.Verify dto,
                                   Long currentUserId, String currentUserName) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, currentUserId, "上報驗證結果");
        if (!RdmConstants.RB_VERIFYING.equals(batch.getStatus())) {
            throw new BusinessException("僅「驗證中」的批次可上報驗證結果，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getSystemCode())) {
            throw new BusinessException("請指定系統編碼");
        }
        String verifyStatus = dto.getVerifyStatus() == null ? "" : dto.getVerifyStatus().trim();
        if (!"passed".equals(verifyStatus) && !"failed".equals(verifyStatus)) {
            throw new BusinessException("非法的驗證狀態: " + dto.getVerifyStatus());
        }
        RdmReleaseDeployment dep = requireDeployment(batchId, dto.getSystemCode());
        dep.setVerifyStatus(verifyStatus);
        dep.setVerifyTime(LocalDateTime.now());
        dep.setOperatorUserId(currentUserId);
        dep.setOperatorUserName(currentUserName);
        deploymentMapper.updateById(dep);

        List<RdmReleaseDeployment> all = listDeployments(batchId);
        boolean allPassed = !all.isEmpty() && all.stream().allMatch(d -> "passed".equals(d.getVerifyStatus()));
        if (allPassed) {
            batch.setStatus(RdmConstants.RB_RELEASED);
            batchMapper.updateById(batch);
            updateDeliveryItemStatusAfterRelease(batch);
            log.info("發布批次已全部驗證通過，正式發布: batchNo={}", batch.getBatchNo());
        }
    }

    /**
     * 回滚：批次须为 deploying/verifying/released；记录原因，部署记录标 rolled_back，交付项状态回退。
     */
    @Transactional(rollbackFor = Exception.class)
    public void rollback(Long batchId, RdmReleaseBatchDTO.Rollback dto,
                         Long currentUserId, String currentUserName) {
        RdmReleaseBatch batch = requireBatch(batchId);
        requireReleaseOwner(batch, currentUserId, "回滾發布批次");
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
        for (RdmReleaseDeployment dep : listDeployments(batchId)) {
            boolean targeted = targetSystems == null || targetSystems.isEmpty()
                    || targetSystems.contains(dep.getSystemCode());
            boolean deployed = RdmConstants.DEPLOY_SUCCESS.equals(dep.getDeployStatus())
                    || RdmConstants.DEPLOY_DEPLOYING.equals(dep.getDeployStatus());
            if (targeted && deployed) {
                dep.setDeployStatus(RdmConstants.DEPLOY_ROLLED_BACK);
                dep.setRollbackReason(reason);
                dep.setOperatorUserId(currentUserId);
                dep.setOperatorUserName(currentUserName);
                deploymentMapper.updateById(dep);
            }
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
        log.info("發布批次已回滾: batchNo={}, reason={}, operator={}", batch.getBatchNo(), reason, currentUserName);
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

    /** 批次详情（含部署记录与实时放行检查结果）。 */
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
        detail.setDeployments(deps.stream().map(this::toDeploymentRecord).toList());
        // 已结束批次不再实时算检查（结论已固化在状态里），仅规划/检查中回显检查项
        if (RdmConstants.RB_PLANNING.equals(batch.getStatus())
                || RdmConstants.RB_CHECKING.equals(batch.getStatus())) {
            detail.setCheckResults(computeChecks(batch));
        }
        return detail;
    }

    /* ==================== 私有辅助：放行检查计算 ==================== */

    /**
     * 计算五类放行闸门。每类对所有范围交付项聚合：任一项不达标即该类不通过。
     */
    private List<RdmReleaseBatchVO.CheckResult> computeChecks(RdmReleaseBatch batch) {
        List<Map<String, Object>> scope = JsonUtils.parseMapList(batch.getScopeSnapshotJson());
        List<RdmReleaseBatchVO.CheckResult> results = new ArrayList<>();
        List<String> testFail = new ArrayList<>();
        List<String> acceptFail = new ArrayList<>();
        List<String> defectFail = new ArrayList<>();
        List<String> depFail = new ArrayList<>();
        List<String> scopeFail = new ArrayList<>();
        Long testRef = null, acceptRef = null, defectRef = null, depRef = null, scopeRef = null;
        String testRefNo = null, acceptRefNo = null, defectRefNo = null, depRefNo = null, scopeRefNo = null;

        for (Map<String, Object> row : scope) {
            Long itemId = toLong(row.get("deliveryItemId"));
            if (itemId == null) {
                continue;
            }
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            String label = item == null ? ("#" + itemId) : item.getTitle();
            String itemNo = item == null ? null : item.getItemNo();
            Integer snapshotVersion = toInt(row.get("scopeVersion"));
            String path = item != null && StringUtils.hasText(item.getAcceptancePath())
                    ? item.getAcceptancePath() : (String) row.get("acceptancePath");

            // 1. 测试通过
            if (!testBatchService.isTestPassed(itemId)) {
                testFail.add(label);
                if (testRef == null) { testRef = itemId; testRefNo = itemNo; }
            }
            // 2. 验收通过（产品验收必备；路径 A 还需业务验收）
            if (!hasAcceptance(itemId, RdmConstants.ACCEPTANCE_TYPE_PRODUCT)
                    || (RdmConstants.PATH_A.equals(path) && !hasAcceptance(itemId, RdmConstants.ACCEPTANCE_TYPE_BUSINESS))) {
                acceptFail.add(label);
                if (acceptRef == null) { acceptRef = itemId; acceptRefNo = itemNo; }
            }
            // 3. 无阻断缺陷
            if (issueService.hasBlockingIssues(itemId)) {
                defectFail.add(label);
                if (defectRef == null) { defectRef = itemId; defectRefNo = itemNo; }
            }
            // 4. 依赖就绪（交付项已进入可发布状态）
            if (item == null || !RELEASABLE_ITEM_STATUS.contains(item.getStatus())) {
                depFail.add(label);
                if (depRef == null) { depRef = itemId; depRefNo = itemNo; }
            }
            // 5. 范围一致（当前范围版本与快照一致）
            if (item != null && snapshotVersion != null
                    && !snapshotVersion.equals(item.getScopeVersion())) {
                scopeFail.add(label);
                if (scopeRef == null) { scopeRef = itemId; scopeRefNo = itemNo; }
            }
        }

        results.add(checkResult(CHECK_TEST, testFail, "測試未通過", testRef, testRefNo));
        results.add(checkResult(CHECK_ACCEPTANCE, acceptFail, "驗收未通過", acceptRef, acceptRefNo));
        results.add(checkResult(CHECK_DEFECT, defectFail, "存在阻斷缺陷", defectRef, defectRefNo));
        results.add(checkResult(CHECK_DEPENDENCY, depFail, "依賴未就緒", depRef, depRefNo));
        results.add(checkResult(CHECK_SCOPE, scopeFail, "範圍已變更", scopeRef, scopeRefNo));
        return results;
    }

    private RdmReleaseBatchVO.CheckResult checkResult(String type, List<String> fails,
                                                      String failLabel, Long refId, String refNo) {
        RdmReleaseBatchVO.CheckResult r = new RdmReleaseBatchVO.CheckResult();
        r.setCheckType(type);
        boolean passed = fails.isEmpty();
        r.setPassed(passed);
        r.setMessage(passed ? "通過" : failLabel + "：" + String.join("、", fails));
        r.setRefId(passed ? null : refId);
        r.setRefNo(passed ? null : refNo);
        return r;
    }

    private boolean hasAcceptance(Long deliveryItemId, String type) {
        Long count = acceptanceMapper.selectCount(new LambdaQueryWrapper<RdmAcceptanceRecord>()
                .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId)
                .eq(RdmAcceptanceRecord::getAcceptanceType, type)
                .eq(RdmAcceptanceRecord::getConclusion, RdmConstants.ACCEPT_PASS));
        return count != null && count > 0;
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
