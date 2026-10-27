package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmStockMigrationDTO;
import com.mftb.admin.dto.RdmStockMigrationVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmIssueFollowup;
import com.mftb.admin.entity.RdmIssueResolution;
import com.mftb.admin.entity.RdmMigrationAudit;
import com.mftb.admin.entity.RdmMigrationBatch;
import com.mftb.admin.entity.RdmMigrationItem;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmReleaseApproval;
import com.mftb.admin.entity.RdmReleaseAttempt;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.entity.RdmReleaseExemption;
import com.mftb.admin.entity.RdmReleaseExemptionDecision;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmSupplementaryVerification;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmTestRound;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueDeferMapper;
import com.mftb.admin.mapper.RdmIssueFollowupMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmIssueResolutionMapper;
import com.mftb.admin.mapper.RdmMigrationAuditMapper;
import com.mftb.admin.mapper.RdmMigrationBatchMapper;
import com.mftb.admin.mapper.RdmMigrationItemMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmReleaseApprovalMapper;
import com.mftb.admin.mapper.RdmReleaseAttemptMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionDecisionMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmSupplementaryVerificationMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 存量安全迁移执行服务（任务29 C 段）。
 *
 * <p>把 V1/V2 存量需求以「<b>预览 → 主责确认 → 小批执行 → 可暂停/可续 → 对账 →（仅在无新事实时）保守回退</b>」
 * 迁入 V3 项目制结构。<b>绝不自动全量执行</b>：未经主责确认的批次，任何执行入口一律拒绝。
 *
 * <h2>安全不变量（全部 fail-closed）</h2>
 * <ol>
 *   <li><b>预览只读</b>：preview 只创建迁移计划行（rdm_migration_batch/item，状态 previewed/blocked），
 *       对业务事实零写入；</li>
 *   <li><b>只产出结构性 V3 事实，绝不伪造证据</b>：执行仅做三件事 ——
 *       ① 条件更新需求结构字段（flow_version→3、project_id、requirement_kind 为空时补 execution，
 *          既有值一律不动）；② 需要时创建/关联目标项目；③ 创建一条 {@code DI_PREPARING}
 *          容器交付项（范围未冻结、无验收结论、来源标记 {@link RdmConstants#MIGRATION_SOURCE_STOCK}）。
 *       <b>绝不</b>补造测试批次/测试轮次/测试执行/验收记录/签字/评分/发布批次/部署/上线证据；
 *       迁移产出的交付项不得被任何消费方推导为已测试/已验收/已发布（消费方仍走任务20/27 权威门禁）；</li>
 *   <li><b>拒绝盲目回滚</b>：执行前冻结事实基线（fact_baseline_json），回退时重读全量事实做差异比对，
 *       任一已完成明细出现新 V3 事实（含给迁移产出交付项新挂的测试/验收/发布/问题/延期等）
 *       即整体拒绝回滚、自动暂停批次并写 blocked 审计，提示走前滚兼容；
 *       逆向仅限「无新事实」时的结构性还原，<b>不物理删除</b>任何历史/证据/关联
 *       （迁移产出交付项以 blockedFlag=1 封存）；</li>
 *   <li><b>幂等 + 事务</b>：全部写入口接 {@link RdmIdempotentService#executeOnce}（入口自身
 *       {@code @Transactional}，executeOnce 以 PROPAGATION_REQUIRED 加入同一物理事务，
 *       业务写入 + 审计 + 幂等结果原子提交）；分块内失败项标 FAILED 隔离，不污染成功项；</li>
 *   <li><b>并发防护</b>：需求结构更新用「WHERE flow_version=预览快照值」条件更新，受影响行数为 0 即拒；
 *       一个需求同时只有一条生效迁移项由 {@code uk_rdm_migration_active_req}（STORED 生成列）兜底，
 *       服务层预检 + 捕获 DuplicateKeyException 转友好失败。真实并发/唯一索引证明留任务24 集成验证。</li>
 * </ol>
 *
 * <p>迁移<b>不顺带打开灰度</b>：产出 V3 结构 ≠ 开启 v3_write/v3_release，灰度开启是独立的授权动作
 * （见 {@link RdmFlowConfigService}）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmStockMigrationService {

    /** 单次预览的需求数量上限（防止一次圈进全库） */
    private static final int PREVIEW_MAX_ITEMS = 500;
    /** 序列规则键（与 RdmProjectService / RdmDeliveryItemService 同源，219 已种子化） */
    private static final String SEQ_PROJECT = "rdm_project";
    private static final String SEQ_DELIVERY_ITEM = "rdm_delivery_item";
    /** 自动创建的承接项目名称前缀 */
    private static final String AUTO_PROJECT_NAME_PREFIX = "存量遷移承接-";
    /** 范围类型 */
    private static final String SCOPE_PROJECT = "PROJECT";
    private static final String SCOPE_REQUIREMENTS = "REQUIREMENTS";

    private final RdmMigrationBatchMapper batchMapper;
    private final RdmMigrationItemMapper itemMapper;
    private final RdmMigrationAuditMapper auditMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmProjectMapper projectMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmTestRoundMapper testRoundMapper;
    private final RdmTestExecutionMapper testExecutionMapper;
    private final RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmIssueDeferMapper issueDeferMapper;
    private final RdmIssueFollowupMapper issueFollowupMapper;
    private final RdmIssueResolutionMapper issueResolutionMapper;
    private final RdmReleaseBatchMapper releaseBatchMapper;
    private final RdmReleaseDeploymentMapper releaseDeploymentMapper;
    private final RdmReleaseApprovalMapper releaseApprovalMapper;
    private final RdmReleaseAttemptMapper releaseAttemptMapper;
    private final RdmReleaseExemptionMapper releaseExemptionMapper;
    private final RdmReleaseExemptionDecisionMapper releaseExemptionDecisionMapper;
    private final RdmSupplementaryVerificationMapper supplementaryVerificationMapper;
    private final RdmWorkTaskMapper workTaskMapper;
    private final RdmIdempotentService idempotentService;
    private final RdmAccessGuard accessGuard;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;
    private final ObjectMapper objectMapper;

    /* ==================== C1. 预览（只读业务事实，仅创建迁移计划行） ==================== */

    /**
     * 生成迁移预览批次（幂等入口）。
     * <p>范围二选一：projectId（该项目下全部 V1/V2 需求）或 reqIds（指定需求，可带 targetProjectId）。
     * 预览对业务事实<b>零写入</b>；不可迁移的需求以 blocked 明细留痕（附原因），确认与执行阶段自动跳过。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.PreviewResult preview(RdmStockMigrationDTO.Preview dto) {
        SysUser actor = requireActor();
        Long actorId = actor.getId();
        String hash = idempotentService.stableRequestHash(List.of(
                "preview",
                String.valueOf(dto == null ? null : dto.getProjectId()),
                dto == null || dto.getReqIds() == null ? "" : dto.getReqIds().stream()
                        .map(String::valueOf).sorted().collect(Collectors.joining(",")),
                String.valueOf(dto == null ? null : dto.getTargetProjectId()),
                String.valueOf(dto == null ? null : dto.getChunkSize()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(RdmConstants.BIZ_MIGRATION_PREVIEW)
                .resourceKey("migration_batch:preview")
                .clientRequestId(deriveClientRequestId("preview", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doPreview(dto, actor), RdmStockMigrationVO.PreviewResult.class);
    }

    /** 预览业务体：解析范围 → 逐项资格判定 → 冻结 before 快照与事实基线 → 落迁移计划行。 */
    RdmStockMigrationVO.PreviewResult doPreview(RdmStockMigrationDTO.Preview dto, SysUser actor) {
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        int chunkSize = normalizeChunkSize(dto.getChunkSize());
        boolean projectScope = dto.getProjectId() != null;
        if (!projectScope && (dto.getReqIds() == null || dto.getReqIds().isEmpty())) {
            throw new BusinessException("遷移範圍不能為空：請指定 projectId 或 reqIds");
        }
        if (projectScope && dto.getReqIds() != null && !dto.getReqIds().isEmpty()) {
            throw new BusinessException("projectId 與 reqIds 二選一，不得同時指定");
        }

        // 范围解析（只读）
        Long scopeProjectId = null;
        Long targetProjectId = null;
        String targetProjectName = null;
        List<Long> reqIds;
        if (projectScope) {
            RdmProject project = projectMapper.selectById(dto.getProjectId());
            if (project == null) {
                throw new BusinessException("範圍項目不存在：" + dto.getProjectId());
            }
            scopeProjectId = project.getId();
            targetProjectId = project.getId();
            targetProjectName = project.getName();
            reqIds = requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                            .eq(RdmRequirement::getProjectId, project.getId())
                            .orderByAsc(RdmRequirement::getId))
                    .stream().map(RdmRequirement::getId).collect(Collectors.toList());
            // 主责授权：项目范围 = 管理员 或 项目 PM/产品负责人
            requireProjectOwnerOrAdmin(scopeProjectId, actor, "發起該項目的存量遷移預覽");
        } else {
            reqIds = dto.getReqIds().stream().filter(Objects::nonNull)
                    .distinct().collect(Collectors.toList());
            if (reqIds.isEmpty()) {
                throw new BusinessException("reqIds 不能全為空");
            }
            if (dto.getTargetProjectId() != null) {
                RdmProject target = projectMapper.selectById(dto.getTargetProjectId());
                if (target == null) {
                    throw new BusinessException("目標項目不存在：" + dto.getTargetProjectId());
                }
                if (!RdmConstants.PROJECT_ACTIVE_STATUSES.contains(target.getStatus())) {
                    throw new BusinessException("目標項目已終態（" + target.getStatus() + "），不可承接遷移");
                }
                targetProjectId = target.getId();
                targetProjectName = target.getName();
            }
        }
        if (reqIds.size() > PREVIEW_MAX_ITEMS) {
            throw new BusinessException("單次遷移範圍過大（" + reqIds.size() + " > " + PREVIEW_MAX_ITEMS
                    + "），請拆分範圍後分批發起");
        }
        if (reqIds.isEmpty()) {
            throw new BusinessException("範圍內沒有需求，無需遷移");
        }

        // 逐项资格判定 + 快照/基线冻结（全部只读）
        List<RdmMigrationItem> items = new ArrayList<>();
        List<RdmStockMigrationVO.ItemPreview> previews = new ArrayList<>();
        List<Map<String, Object>> hashInputs = new ArrayList<>();
        int eligible = 0;
        int blocked = 0;
        for (Long reqId : reqIds) {
            RdmRequirement req = requirementMapper.selectById(reqId);
            String blockReason = null;
            if (req == null) {
                blockReason = "需求不存在或已刪除";
            } else if (effectiveFlowVersion(req) == RdmConstants.FLOW_VERSION_3) {
                blockReason = "需求已是 V3 流程，無需遷移";
            } else if (projectScope && !Objects.equals(req.getProjectId(), scopeProjectId)) {
                blockReason = "需求已不屬於範圍項目（並發變更），跳過";
            } else if (hasActiveMigrationItem(reqId, null)) {
                blockReason = "該需求已有生效中的遷移明細（唯一約束 uk_rdm_migration_active_req），跳過";
            } else if (isAggregateWithChildren(req)) {
                blockReason = "聚合需求帶子需求，須按整棵結構樹單獨規劃遷移，跳過";
            } else if (req.getProjectId() != null && !projectScope && targetProjectId != null
                    && !Objects.equals(req.getProjectId(), targetProjectId)) {
                blockReason = "需求已掛其他項目（" + req.getProjectId() + "），與指定目標項目衝突，跳過";
            }

            RdmMigrationItem item = new RdmMigrationItem();
            item.setReqId(reqId);
            item.setTargetProjectId(req != null && req.getProjectId() != null ? req.getProjectId() : targetProjectId);
            item.setSourceFlowVersion(req == null ? 1 : effectiveFlowVersion(req));
            item.setSourceVersion(req == null ? 1 : effectiveFlowVersion(req));
            Map<String, Object> before = req == null ? Map.of("reqId", reqId, "missing", true)
                    : beforeSnapshotOf(req);
            // 事实基线预览版（执行时会重算冻结为权威基线）；预览阶段同样只读
            Map<String, List<Long>> baseline = req == null ? emptyBaseline() : scanFacts(reqId, List.of());
            item.setBeforeSnapshotJson(JsonUtils.toJson(before));
            item.setFactBaselineJson(JsonUtils.toJson(baseline));
            String itemHash = idempotentService.stableRequestHash(List.of(before, baseline));
            item.setPreviewHash(itemHash);
            if (blockReason == null) {
                item.setStatus(RdmConstants.MIGRATION_ITEM_PREVIEWED);
                eligible++;
            } else {
                item.setStatus(RdmConstants.MIGRATION_ITEM_BLOCKED);
                item.setBlockingReason(blockReason);
                blocked++;
            }
            items.add(item);

            RdmStockMigrationVO.ItemPreview pv = new RdmStockMigrationVO.ItemPreview();
            pv.setReqId(reqId);
            pv.setReqNo(req == null ? null : req.getReqNo());
            pv.setTitle(req == null ? null : req.getTitle());
            pv.setSourceFlowVersion(item.getSourceFlowVersion());
            pv.setSourceVersion(item.getSourceVersion());
            pv.setTargetProjectId(item.getTargetProjectId());
            pv.setTargetProjectName(item.getTargetProjectId() == null ? null
                    : (Objects.equals(item.getTargetProjectId(), targetProjectId) ? targetProjectName : null));
            pv.setStatus(item.getStatus());
            pv.setBlockingReason(blockReason);
            pv.setPreviewHash(itemHash);
            pv.setImpacts(blockReason == null ? migrationImpacts() : List.of());
            previews.add(pv);

            Map<String, Object> hi = new LinkedHashMap<>();
            hi.put("reqId", reqId);
            hi.put("status", item.getStatus());
            hi.put("itemHash", itemHash);
            hashInputs.add(hi);
        }

        // 批次头（预览哈希 = 全部明细哈希与状态的稳定摘要）
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("scopeType", projectScope ? SCOPE_PROJECT : SCOPE_REQUIREMENTS);
        summary.put("scopeProjectId", scopeProjectId);
        summary.put("reqIds", reqIds);
        summary.put("targetProjectId", targetProjectId);
        summary.put("targetProjectName", targetProjectName);
        summary.put("targetProjectAutoCreate", targetProjectId == null);
        summary.put("chunkSize", chunkSize);
        summary.put("totalItems", items.size());
        summary.put("eligibleItems", eligible);
        summary.put("blockedItems", blocked);
        summary.put("reason", nullToEmpty(dto.getReason()));
        String batchHash = idempotentService.stableRequestHash(List.of(
                projectScope ? SCOPE_PROJECT : SCOPE_REQUIREMENTS,
                String.valueOf(scopeProjectId), String.valueOf(targetProjectId), hashInputs));

        RdmMigrationBatch batch = new RdmMigrationBatch();
        // request_id：uk_rdm_migration_request(requested_by, request_id) 由「批次+幂等判别子」派生，≤64 ASCII
        batch.setRequestId(deriveBatchRequestId("pv", dto.getRequestId(), batchHash));
        batch.setRequestedBy(actor.getId());
        batch.setStatus(RdmConstants.MIGRATION_BATCH_PREVIEWED);
        batch.setPreviewHash(batchHash);
        batch.setPreviewSummaryJson(JsonUtils.toJson(summary));
        batch.setChunkSize(chunkSize);
        batchMapper.insert(batch);
        for (RdmMigrationItem item : items) {
            item.setBatchId(batch.getId());
            itemMapper.insert(item);
        }
        insertAudit(batch.getId(), null, RdmConstants.MIGRATION_ACTION_PREVIEW,
                RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(),
                batch.getRequestId(), 0, 0, null, batchHash,
                Map.of("totalItems", items.size(), "eligible", eligible, "blocked", blocked),
                dto.getReason());

        // 回填 VO（明细ID已生成）
        for (int i = 0; i < previews.size(); i++) {
            previews.get(i).setItemId(items.get(i).getId());
        }
        RdmStockMigrationVO.PreviewResult vo = new RdmStockMigrationVO.PreviewResult();
        vo.setBatchId(batch.getId());
        vo.setStatus(batch.getStatus());
        vo.setScopeType(projectScope ? SCOPE_PROJECT : SCOPE_REQUIREMENTS);
        vo.setScopeProjectId(scopeProjectId);
        vo.setTargetProjectId(targetProjectId);
        vo.setTargetProjectName(targetProjectName);
        vo.setTargetProjectAutoCreate(targetProjectId == null);
        vo.setChunkSize(chunkSize);
        vo.setPreviewHash(batchHash);
        vo.setTotalItems(items.size());
        vo.setEligibleItems(eligible);
        vo.setBlockedItems(blocked);
        vo.setItems(previews);
        vo.setCreatedAt(DateTimeUtils.format(batch.getCreatedAt() == null ? LocalDateTime.now() : batch.getCreatedAt()));
        log.info("存量遷移預覽已生成（等待主責確認，未執行任何業務變更）: batchId={}, total={}, eligible={}, blocked={}",
                batch.getId(), items.size(), eligible, blocked);
        return vo;
    }

    /* ==================== C2. 主责确认（未确认绝不执行） ==================== */

    /**
     * 主责确认（幂等入口）：previewed → confirmed，可迁移明细逐项同步确认。
     * <p>确认人身份取认证主体；授权：管理员 或 范围主责（项目范围=项目 PM/产品负责人；
     * 需求范围=逐条需求的交付写权限人）。确认前执行入口一律拒绝（<b>不得自动全量执行</b>）。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.BatchDetail confirm(Long batchId, RdmStockMigrationDTO.Confirm dto) {
        SysUser actor = requireActor();
        String hash = idempotentService.stableRequestHash(List.of(
                "confirm", String.valueOf(batchId),
                String.valueOf(dto == null ? null : dto.getExpectedVersion()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actor.getId())
                .bizType(RdmConstants.BIZ_MIGRATION_CONFIRM)
                .resourceKey("migration_batch:" + batchId)
                .clientRequestId(deriveClientRequestId("confirm",
                        dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doConfirm(batchId, dto, actor), RdmStockMigrationVO.BatchDetail.class);
    }

    RdmStockMigrationVO.BatchDetail doConfirm(Long batchId, RdmStockMigrationDTO.Confirm dto, SysUser actor) {
        RdmMigrationBatch batch = requireBatch(batchId);
        if (!RdmConstants.MIGRATION_BATCH_PREVIEWED.equals(batch.getStatus())) {
            throw new BusinessException("僅「已預覽」批次可確認，當前狀態：" + batch.getStatus());
        }
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "遷移批次");
        requireMigrationOwner(batch, actor, "確認該遷移批次");
        List<RdmMigrationItem> items = itemsOfBatch(batchId);
        List<RdmMigrationItem> eligible = items.stream()
                .filter(i -> RdmConstants.MIGRATION_ITEM_PREVIEWED.equals(i.getStatus()))
                .collect(Collectors.toList());
        if (eligible.isEmpty()) {
            throw new BusinessException("批次內沒有可遷移明細（全部被阻塞），無需確認執行");
        }
        // 生效唯一性预检：任一需求已被其他生效迁移项占用即拒绝确认（真实唯一索引兜底留任务24）
        List<Long> reqIds = eligible.stream().map(RdmMigrationItem::getReqId).collect(Collectors.toList());
        List<RdmMigrationItem> occupied = itemMapper.selectList(new LambdaQueryWrapper<RdmMigrationItem>()
                .in(RdmMigrationItem::getReqId, reqIds)
                .in(RdmMigrationItem::getStatus, List.of(
                        RdmConstants.MIGRATION_ITEM_CONFIRMED, RdmConstants.MIGRATION_ITEM_RUNNING,
                        RdmConstants.MIGRATION_ITEM_COMPLETED, RdmConstants.MIGRATION_ITEM_BLOCKED))
                .ne(RdmMigrationItem::getBatchId, batchId));
        if (occupied != null && !occupied.isEmpty()) {
            String occupiedReqs = occupied.stream().map(i -> String.valueOf(i.getReqId()))
                    .distinct().collect(Collectors.joining(","));
            throw new BusinessException("需求 " + occupiedReqs + " 已被其他生效遷移批次佔用，請先處理衝突");
        }
        LocalDateTime now = LocalDateTime.now();
        int beforeVersion = nz(batch.getVersion());
        batch.setStatus(RdmConstants.MIGRATION_BATCH_CONFIRMED);
        batch.setConfirmedBy(actor.getId());
        batch.setConfirmedAt(now);
        updateBatchOrConflict(batch);
        for (RdmMigrationItem item : eligible) {
            int itemBefore = nz(item.getVersion());
            item.setStatus(RdmConstants.MIGRATION_ITEM_CONFIRMED);
            item.setConfirmedBy(actor.getId());
            item.setConfirmedAt(now);
            try {
                updateItemOrOccupied(item);
            } catch (BusinessException e) {
                // uk_rdm_migration_active_req 冲突：他人已抢先确认同一需求，本批该项转为阻塞而非整体失败
                item.setStatus(RdmConstants.MIGRATION_ITEM_BLOCKED);
                item.setBlockingReason(e.getMessage());
                itemMapper.updateById(item);
                log.warn("遷移明細確認時唯一約束衝突，轉為阻塞: itemId={}, reqId={}", item.getId(), item.getReqId());
                insertAudit(batchId, item.getId(), RdmConstants.MIGRATION_ACTION_CONFIRM,
                        RdmConstants.MIGRATION_RESULT_BLOCKED, actor.getId(), batchRequestId(batch),
                        itemBefore, nz(item.getVersion()) + 1, null, null,
                        Map.of("reason", nullToEmpty(e.getMessage())), dto == null ? null : dto.getReason());
                continue;
            }
            insertAudit(batchId, item.getId(), RdmConstants.MIGRATION_ACTION_CONFIRM,
                    RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), batchRequestId(batch),
                    itemBefore, itemBefore + 1, item.getPreviewHash(), item.getPreviewHash(),
                    Map.of("status", RdmConstants.MIGRATION_ITEM_CONFIRMED), null);
        }
        insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_CONFIRM,
                RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), batchRequestId(batch),
                beforeVersion, beforeVersion + 1, batch.getPreviewHash(), batch.getPreviewHash(),
                Map.of("confirmedItems", eligible.size()), dto == null ? null : dto.getReason());
        log.info("遷移批次已主責確認: batchId={}, confirmedBy={}, items={}", batchId, actor.getId(), eligible.size());
        return detail(batchId);
    }

    /* ==================== C3. 小批执行（每调用执行一个分块） ==================== */

    /**
     * 执行一个分块（幂等入口）：批次须已主责确认（confirmed/running），每次至多执行 chunk_size 条明细。
     * <p>客户端未携带 requestId 时，判别子取「首个待执行明细ID」：同一分块崩溃重试安全回放，
     * 下一分块自然派生新键；携带 requestId 时须每个分块递增（如 exec-1/exec-2）。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.ChunkResult executeChunk(Long batchId, RdmStockMigrationDTO.Execute dto) {
        SysUser actor = requireActor();
        RdmMigrationBatch batch = requireBatch(batchId);
        // 未确认绝不执行（C2 硬闸门，先于幂等占位判定，避免未授权请求留下幂等行）
        if (batch.getConfirmedAt() == null || batch.getConfirmedBy() == null
                || (!RdmConstants.MIGRATION_BATCH_CONFIRMED.equals(batch.getStatus())
                && !RdmConstants.MIGRATION_BATCH_RUNNING.equals(batch.getStatus()))) {
            throw new BusinessException("遷移批次未經主責確認（當前狀態：" + batch.getStatus() + "），拒絕執行");
        }
        requireOperator(batch, actor, "執行該遷移批次");
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "遷移批次");
        List<RdmMigrationItem> queue = confirmedQueue(batchId, chunkSizeOf(batch));
        if (queue.isEmpty()) {
            throw new BusinessException("沒有待執行的遷移明細（可能已全部完成或被暫停/阻塞）");
        }
        Long firstItemId = queue.get(0).getId();
        String hash = idempotentService.stableRequestHash(List.of(
                "execute", String.valueOf(batchId), String.valueOf(firstItemId), String.valueOf(queue.size())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actor.getId())
                .bizType(RdmConstants.BIZ_MIGRATION_EXECUTE)
                .resourceKey("migration_batch:" + batchId)
                .clientRequestId(deriveClientRequestId("exec",
                        dto == null ? null : dto.getRequestId(), "i" + firstItemId))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doExecuteChunk(batchId, queue, actor, hash), RdmStockMigrationVO.ChunkResult.class);
    }

    /** 分块业务体：逐项迁移（成功/失败隔离），批内全部到达终态后置 completed 并写结果汇总。 */
    RdmStockMigrationVO.ChunkResult doExecuteChunk(Long batchId, List<RdmMigrationItem> queue,
                                                   SysUser actor, String chunkDiscriminator) {
        RdmMigrationBatch batch = requireBatch(batchId);
        int beforeVersion = nz(batch.getVersion());
        if (RdmConstants.MIGRATION_BATCH_CONFIRMED.equals(batch.getStatus())) {
            batch.setStatus(RdmConstants.MIGRATION_BATCH_RUNNING);
            updateBatchOrConflict(batch);
        }
        Map<String, Object> summary = parseSummary(batch);
        String clientRequestId = deriveBatchRequestId("ex", chunkDiscriminator, String.valueOf(batchId));

        List<Long> succeeded = new ArrayList<>();
        List<Long> failedIds = new ArrayList<>();
        for (RdmMigrationItem item : queue) {
            int itemBefore = nz(item.getVersion());
            try {
                // 目标项目逐项从 summary 现读：同分块内首次自动创建后，后续项直接复用同一承接项目
                executeSingleItem(batch, item, summary, actor);
                succeeded.add(item.getId());
                insertAudit(batchId, item.getId(), RdmConstants.MIGRATION_ACTION_EXECUTE,
                        RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), clientRequestId,
                        itemBefore, itemBefore + 1, item.getPreviewHash(), item.getExecutedFactHash(),
                        Map.of("status", RdmConstants.MIGRATION_ITEM_COMPLETED,
                                "source", RdmConstants.MIGRATION_SOURCE_STOCK), null);
            } catch (Exception e) {
                // 失败项隔离：标 FAILED 留痕，不抛出、不污染同批成功项（分块事务不因单项失败回滚）
                log.warn("遷移明細執行失敗（已隔離）: itemId={}, reqId={}, err={}",
                        item.getId(), item.getReqId(), e.getMessage());
                item.setStatus(RdmConstants.MIGRATION_ITEM_FAILED);
                item.setResultJson(JsonUtils.toJson(Map.of(
                        "source", RdmConstants.MIGRATION_SOURCE_STOCK,
                        "error", nullToEmpty(e.getMessage()))));
                item.setBlockingReason(truncate(e.getMessage(), 500));
                item.setExecutedBy(actor.getId());
                item.setExecutedAt(LocalDateTime.now());
                safeUpdateItem(item);
                failedIds.add(item.getId());
                insertAudit(batchId, item.getId(), RdmConstants.MIGRATION_ACTION_EXECUTE,
                        RdmConstants.MIGRATION_RESULT_FAILED, actor.getId(), clientRequestId,
                        itemBefore, nz(item.getVersion()) + 1, item.getPreviewHash(), null,
                        Map.of("error", nullToEmpty(e.getMessage())), null);
            }
        }
        // 自动创建承接项目时回写 summary（executeSingleItem 已就地更新，此处统一序列化落库）
        batch.setPreviewSummaryJson(JsonUtils.toJson(summary));

        // 批内进度汇总；全部到达终态 → completed
        Map<String, Long> counts = statusCounts(batchId);
        long remaining = counts.getOrDefault(RdmConstants.MIGRATION_ITEM_CONFIRMED, 0L)
                + counts.getOrDefault(RdmConstants.MIGRATION_ITEM_RUNNING, 0L);
        Map<String, Object> chunkSummary = new LinkedHashMap<>();
        chunkSummary.put("source", RdmConstants.MIGRATION_SOURCE_STOCK);
        chunkSummary.put("totalItems", itemsOfBatch(batchId).size());
        chunkSummary.put("completed", counts.getOrDefault(RdmConstants.MIGRATION_ITEM_COMPLETED, 0L));
        chunkSummary.put("failed", counts.getOrDefault(RdmConstants.MIGRATION_ITEM_FAILED, 0L));
        chunkSummary.put("blocked", counts.getOrDefault(RdmConstants.MIGRATION_ITEM_BLOCKED, 0L));
        chunkSummary.put("rolledBack", counts.getOrDefault(RdmConstants.MIGRATION_ITEM_ROLLED_BACK, 0L));
        if (remaining == 0) {
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            // 批次结果汇总写入 previewSummaryJson（冻结 DDL 的批次表无 result_json 列，明细级结果在 item.result_json）
            summary.put("finalResult", chunkSummary);
        }
        updateBatchOrConflict(batch);
        insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_EXECUTE,
                failedIds.isEmpty() ? RdmConstants.MIGRATION_RESULT_SUCCESS
                        : RdmConstants.MIGRATION_RESULT_FAILED,
                actor.getId(), clientRequestId, beforeVersion, nz(batch.getVersion()),
                null, null, chunkSummary, null);

        RdmStockMigrationVO.ChunkResult vo = new RdmStockMigrationVO.ChunkResult();
        vo.setBatchId(batchId);
        vo.setBatchStatus(batch.getStatus());
        vo.setChunkSize(chunkSizeOf(batch));
        vo.setProcessedInChunk(queue.size());
        vo.setSuccessInChunk(succeeded.size());
        vo.setFailedInChunk(failedIds.size());
        vo.setTotalCompleted((int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_COMPLETED, 0L));
        vo.setTotalFailed((int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_FAILED, 0L));
        vo.setTotalBlocked((int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_BLOCKED, 0L));
        vo.setRemaining((int) remaining);
        vo.setSucceededItemIds(succeeded);
        vo.setFailedItemIds(failedIds);
        vo.setBatchResultJson(remaining == 0 ? JsonUtils.toJson(chunkSummary) : null);
        log.info("遷移分塊執行完成: batchId={}, chunk={}/{}, batchStatus={}",
                batchId, succeeded.size(), queue.size(), batch.getStatus());
        return vo;
    }

    /**
     * 单项迁移（C 段核心，只产出结构性 V3 事实）：
     * ① 重读需求并校验与预览快照无漂移；② 解析/创建目标项目（创建后回写 summary 供后续项复用）；
     * ③ 创建 DI_PREPARING 容器交付项（来源=迁移）；④ 冻结权威事实基线；
     * ⑤ 条件更新需求结构字段（WHERE flow_version=快照值，防并发覆盖）。
     * <b>全程不写任何测试/验收/发布/问题事实</b>。
     */
    private void executeSingleItem(RdmMigrationBatch batch, RdmMigrationItem item,
                                   Map<String, Object> summary, SysUser actor) {
        RdmRequirement req = requirementMapper.selectById(item.getReqId());
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        int eff = effectiveFlowVersion(req);
        if (eff == RdmConstants.FLOW_VERSION_3) {
            throw new BusinessException("需求已是 V3 流程（並發遷移或人工切換），拒絕重複遷移");
        }
        if (eff != nz(item.getSourceFlowVersion())) {
            throw new BusinessException("需求流程版本已漂移（預覽=" + item.getSourceFlowVersion()
                    + "，當前=" + eff + "），請重新預覽");
        }
        if (isAggregateWithChildren(req)) {
            throw new BusinessException("聚合需求帶子需求，須按整棵結構樹單獨規劃遷移");
        }
        // 目标项目：明细快照 > 批次范围（summary 现读，含同分块内已自动创建的项目） > 自动创建承接项目
        Long targetProjectId = item.getTargetProjectId() != null
                ? item.getTargetProjectId() : asLong(summary.get("targetProjectId"));
        if (targetProjectId == null) {
            targetProjectId = createMigrationProject(batch, actor);
            summary.put("targetProjectId", targetProjectId);
            summary.put("targetProjectAutoCreate", true);
        }
        RdmProject project = projectMapper.selectById(targetProjectId);
        if (project == null) {
            throw new BusinessException("目標項目不存在：" + targetProjectId);
        }
        item.setTargetProjectId(targetProjectId);

        // 权威事实基线：执行前冻结（回滚须重读差异，不伪造证据）
        Map<String, List<Long>> baseline = scanFacts(req.getId(), List.of());
        item.setFactBaselineJson(JsonUtils.toJson(baseline));

        // ③ 创建容器交付项：DI_PREPARING、范围未冻结、无验收结论 —— 绝不是任何"已通过"证据
        RdmDeliveryItem di = new RdmDeliveryItem();
        di.setItemNo(bizSeqService.next(SEQ_DELIVERY_ITEM));
        di.setReqId(req.getId());
        di.setProjectId(targetProjectId);
        di.setTitle("[遷移] " + nullToEmpty(req.getTitle()));
        di.setScopeDesc("存量遷移自動產出的容器交付項（來源=" + RdmConstants.MIGRATION_SOURCE_STOCK
                + "）：範圍未凍結、無驗收結論，須按 V3 正常流程推進；本項不代表任何測試/驗收/發布事實。");
        di.setScopeVersion(1);
        di.setAcceptancePath(StringUtils.hasText(project.getDefaultAcceptancePath())
                ? project.getDefaultAcceptancePath() : RdmConstants.PATH_A);
        di.setStatus(RdmConstants.DI_PREPARING);
        di.setBlockedFlag(0);
        deliveryItemMapper.insert(di);

        // ⑤ 条件更新需求结构字段：WHERE flow_version=预览快照值（NULL 快照 → IS NULL），0 行即并发冲突
        Integer snapshotFlow = req.getFlowVersion();
        LambdaUpdateWrapper<RdmRequirement> uw = new LambdaUpdateWrapper<RdmRequirement>()
                .eq(RdmRequirement::getId, req.getId())
                .set(RdmRequirement::getFlowVersion, RdmConstants.FLOW_VERSION_3)
                .set(RdmRequirement::getProjectId, targetProjectId);
        if (snapshotFlow == null) {
            uw.isNull(RdmRequirement::getFlowVersion);
        } else {
            uw.eq(RdmRequirement::getFlowVersion, snapshotFlow);
        }
        if (!StringUtils.hasText(req.getRequirementKind())) {
            // 仅补默认 execution；既有值（含 aggregate）一律不动
            uw.set(RdmRequirement::getRequirementKind, RdmConstants.REQ_KIND_EXECUTION);
        }
        int affected = requirementMapper.update(null, uw);
        if (affected == 0) {
            // 需求被并发修改：本项失败。刚创建的容器交付项随分块内该项失败留痕（不删除、标阻塞由回退统一处置）
            di.setBlockedFlag(1);
            safeUpdateItem(di);
            throw new BusinessException("需求已被並發修改（flow_version 條件更新未命中），本項遷移失敗");
        }

        // 明细置 completed + after 快照 + 结果 JSON（来源=迁移，审计可辨；绝不含证据类事实）
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("reqId", req.getId());
        after.put("flowVersion", RdmConstants.FLOW_VERSION_3);
        after.put("projectId", targetProjectId);
        after.put("requirementKind", StringUtils.hasText(req.getRequirementKind())
                ? req.getRequirementKind() : RdmConstants.REQ_KIND_EXECUTION);
        after.put("createdDeliveryItemId", di.getId());
        after.put("createdDeliveryItemNo", di.getItemNo());
        after.put("deliveryItemStatus", RdmConstants.DI_PREPARING);
        after.put("source", RdmConstants.MIGRATION_SOURCE_STOCK);
        item.setAfterSnapshotJson(JsonUtils.toJson(after));
        Map<String, Object> result = new LinkedHashMap<>(after);
        result.put("evidenceProduced", List.of());
        result.put("note", "遷移僅產出結構性 V3 事實；測試/驗收/發布仍須走任務20/27 權威門禁，絕不偽造證據");
        item.setResultJson(JsonUtils.toJson(result));
        item.setExecutedFactHash(idempotentService.stableRequestHash(List.of(after, baseline)));
        item.setStatus(RdmConstants.MIGRATION_ITEM_COMPLETED);
        item.setExecutedBy(actor.getId());
        item.setExecutedAt(LocalDateTime.now());
        updateItemOrOccupied(item);
        // 项目侧结构同步：范围项目自动承接时刷新项目摘要（只加迁移溯源信息，不改业务口径）
        log.info("存量遷移單項完成: itemId={}, reqId={} (V{}→V3), projectId={}, deliveryItemId={} (preparing, source={})",
                item.getId(), req.getId(), eff, targetProjectId, di.getId(), RdmConstants.MIGRATION_SOURCE_STOCK);
    }

    /** 自动创建「存量遷移」承接项目（结构性事实：项目容器，非证据；PM 留空由治理侧后续指派）。 */
    private Long createMigrationProject(RdmMigrationBatch batch, SysUser actor) {
        RdmProject project = new RdmProject();
        project.setProjectNo(bizSeqService.next(SEQ_PROJECT));
        project.setName(AUTO_PROJECT_NAME_PREFIX + batch.getId());
        project.setObjective("存量 V1/V2 需求遷移至 V3 項目制結構的承接項目（來源="
                + RdmConstants.MIGRATION_SOURCE_STOCK + "，批次 " + batch.getId() + "）");
        project.setStatus(RdmConstants.PROJECT_PREPARING);
        project.setPausedFlag(0);
        project.setRiskFlag(0);
        project.setOverdueFlag(0);
        projectMapper.insert(project);
        log.info("已自動創建存量遷移承接項目: projectId={}, no={}, operator={}",
                project.getId(), project.getProjectNo(), actor.getId());
        return project.getId();
    }

    /* ==================== C4. 暂停 / 恢复 ==================== */

    /** 暂停（幂等入口）：confirmed/running → paused；已执行项保留、未执行项待续。 */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.BatchDetail pause(Long batchId, RdmStockMigrationDTO.Pause dto) {
        SysUser actor = requireActor();
        String hash = idempotentService.stableRequestHash(List.of(
                "pause", String.valueOf(batchId),
                String.valueOf(dto == null ? null : dto.getExpectedVersion()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actor.getId())
                .bizType(RdmConstants.BIZ_MIGRATION_PAUSE)
                .resourceKey("migration_batch:" + batchId)
                .clientRequestId(deriveClientRequestId("pause", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doPause(batchId, dto, actor), RdmStockMigrationVO.BatchDetail.class);
    }

    RdmStockMigrationVO.BatchDetail doPause(Long batchId, RdmStockMigrationDTO.Pause dto, SysUser actor) {
        RdmMigrationBatch batch = requireBatch(batchId);
        if (!RdmConstants.MIGRATION_BATCH_CONFIRMED.equals(batch.getStatus())
                && !RdmConstants.MIGRATION_BATCH_RUNNING.equals(batch.getStatus())) {
            throw new BusinessException("僅「已確認/執行中」批次可暫停，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("暫停必須填寫原因（審計留痕）");
        }
        checkExpectedVersion(dto.getExpectedVersion(), batch.getVersion(), "遷移批次");
        requireOperator(batch, actor, "暫停該遷移批次");
        int before = nz(batch.getVersion());
        batch.setStatus(RdmConstants.MIGRATION_BATCH_PAUSED);
        batch.setPausedAt(LocalDateTime.now());
        batch.setPauseReason(dto.getReason().trim());
        updateBatchOrConflict(batch);
        insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_PAUSE,
                RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), batchRequestId(batch),
                before, before + 1, null, null,
                Map.of("status", RdmConstants.MIGRATION_BATCH_PAUSED), dto.getReason().trim());
        log.info("遷移批次已暫停（已執行項保留、未執行項待續）: batchId={}, operator={}", batchId, actor.getId());
        return detail(batchId);
    }

    /**
     * 恢复（幂等入口）：paused → confirmed/running（视执行进度），须重新过主责授权。
     * <p><b>安全闸门</b>：因「回退被拒（存在新 V3 事實）」而自动暂停的批次<b>不可恢复执行</b>，
     * 只能走前滚兼容 —— 继续执行会把已被 V3 事实引用的结构再次改写，制造不可逆状态。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.BatchDetail resume(Long batchId, RdmStockMigrationDTO.Resume dto) {
        SysUser actor = requireActor();
        String hash = idempotentService.stableRequestHash(List.of(
                "resume", String.valueOf(batchId),
                String.valueOf(dto == null ? null : dto.getExpectedVersion()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actor.getId())
                .bizType(RdmConstants.BIZ_MIGRATION_RESUME)
                .resourceKey("migration_batch:" + batchId)
                .clientRequestId(deriveClientRequestId("resume", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doResume(batchId, dto, actor), RdmStockMigrationVO.BatchDetail.class);
    }

    RdmStockMigrationVO.BatchDetail doResume(Long batchId, RdmStockMigrationDTO.Resume dto, SysUser actor) {
        RdmMigrationBatch batch = requireBatch(batchId);
        if (!RdmConstants.MIGRATION_BATCH_PAUSED.equals(batch.getStatus())) {
            throw new BusinessException("僅「已暫停」批次可恢復，當前狀態：" + batch.getStatus());
        }
        if (batch.getConfirmedAt() == null) {
            throw new BusinessException("批次未經主責確認，不得恢復執行");
        }
        if (hasRollbackBlockedAudit(batchId)) {
            throw new BusinessException("本批次因「已產生新 V3 事實、回退被拒」而暫停，不得恢復執行；"
                    + "請走前滾兼容（保留結構與證據，按 V3 正常流程繼續推進）");
        }
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "遷移批次");
        requireMigrationOwner(batch, actor, "恢復該遷移批次");
        int before = nz(batch.getVersion());
        Map<String, Long> counts = statusCounts(batchId);
        boolean started = counts.getOrDefault(RdmConstants.MIGRATION_ITEM_COMPLETED, 0L) > 0
                || counts.getOrDefault(RdmConstants.MIGRATION_ITEM_FAILED, 0L) > 0;
        String resumed = started ? RdmConstants.MIGRATION_BATCH_RUNNING : RdmConstants.MIGRATION_BATCH_CONFIRMED;
        // 显式条件更新：@Version 自增 + 清空 paused_at/pause_reason（updateById 的 NOT_NULL 策略无法置 NULL）
        int affected = batchMapper.update(null, new LambdaUpdateWrapper<RdmMigrationBatch>()
                .eq(RdmMigrationBatch::getId, batchId)
                .eq(RdmMigrationBatch::getVersion, before)
                .eq(RdmMigrationBatch::getStatus, RdmConstants.MIGRATION_BATCH_PAUSED)
                .set(RdmMigrationBatch::getStatus, resumed)
                .set(RdmMigrationBatch::getPausedAt, null)
                .set(RdmMigrationBatch::getPauseReason, null)
                .set(RdmMigrationBatch::getVersion, before + 1));
        if (affected == 0) {
            throw new BusinessException("遷移批次已被他人修改，請刷新後重試");
        }
        batch.setStatus(resumed);
        batch.setPausedAt(null);
        batch.setPauseReason(null);
        insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_RESUME,
                RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), batchRequestId(batch),
                before, before + 1, null, null,
                Map.of("status", batch.getStatus()), dto == null ? null : dto.getReason());
        log.info("遷移批次已恢復: batchId={}, status={}, operator={}", batchId, batch.getStatus(), actor.getId());
        return detail(batchId);
    }

    /* ==================== C5. 对账 ==================== */

    /**
     * 对账（幂等入口，写 reconcile 审计）：
     * 源数量 = 成功 + 失败 + 阻塞 + 待执行；每个已完成明细的目标 V3 结构与源关联逐项可追溯。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.ReconcileResult reconcile(Long batchId, RdmStockMigrationDTO.Reconcile dto) {
        SysUser actor = requireActor();
        String hash = idempotentService.stableRequestHash(List.of("reconcile", String.valueOf(batchId)));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actor.getId())
                .bizType(RdmConstants.BIZ_MIGRATION_RECONCILE)
                .resourceKey("migration_batch:" + batchId)
                .clientRequestId(deriveClientRequestId("recon", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doReconcile(batchId, actor), RdmStockMigrationVO.ReconcileResult.class);
    }

    RdmStockMigrationVO.ReconcileResult doReconcile(Long batchId, SysUser actor) {
        RdmMigrationBatch batch = requireBatch(batchId);
        List<RdmMigrationItem> items = itemsOfBatch(batchId);
        Map<String, Long> counts = statusCounts(batchId);
        int total = items.size();
        int completed = (int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_COMPLETED, 0L);
        int failed = (int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_FAILED, 0L);
        int blocked = (int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_BLOCKED, 0L);
        int rolledBack = (int) (long) counts.getOrDefault(RdmConstants.MIGRATION_ITEM_ROLLED_BACK, 0L);
        int pending = total - completed - failed - blocked - rolledBack;

        // 目标 V3 结构可追溯性核验（只读）
        Map<String, String> inconsistencies = new LinkedHashMap<>();
        for (RdmMigrationItem item : items) {
            if (!RdmConstants.MIGRATION_ITEM_COMPLETED.equals(item.getStatus())) {
                continue;
            }
            RdmRequirement req = requirementMapper.selectById(item.getReqId());
            if (req == null) {
                inconsistencies.put(String.valueOf(item.getId()), "需求不存在（遷移後被刪除？須人工核查）");
                continue;
            }
            if (effectiveFlowVersion(req) != RdmConstants.FLOW_VERSION_3) {
                inconsistencies.put(String.valueOf(item.getId()),
                        "需求 flow_version 非 3（當前=" + effectiveFlowVersion(req) + "）");
                continue;
            }
            if (item.getTargetProjectId() != null && !Objects.equals(req.getProjectId(), item.getTargetProjectId())) {
                inconsistencies.put(String.valueOf(item.getId()),
                        "需求 project_id（" + req.getProjectId() + "）與遷移目標（" + item.getTargetProjectId() + "）不一致");
                continue;
            }
            Map<String, Object> after = parseJsonMap(item.getAfterSnapshotJson());
            Long diId = asLong(after.get("createdDeliveryItemId"));
            if (diId != null) {
                RdmDeliveryItem di = deliveryItemMapper.selectById(diId);
                if (di == null) {
                    inconsistencies.put(String.valueOf(item.getId()), "遷移產出交付項缺失: id=" + diId);
                } else if (!Objects.equals(di.getReqId(), item.getReqId())
                        || !Objects.equals(di.getProjectId(), item.getTargetProjectId())) {
                    inconsistencies.put(String.valueOf(item.getId()), "遷移產出交付項關聯不一致: id=" + diId);
                }
            }
        }

        RdmStockMigrationVO.ReconcileResult vo = new RdmStockMigrationVO.ReconcileResult();
        vo.setBatchId(batchId);
        vo.setTotalItems(total);
        vo.setCompleted(completed);
        vo.setFailed(failed);
        vo.setBlocked(blocked + rolledBack);
        vo.setPending(pending);
        vo.setCountConsistent(total == completed + failed + blocked + rolledBack + pending && pending >= 0);
        vo.setTraceable(inconsistencies.isEmpty());
        vo.setInconsistencies(inconsistencies);
        vo.setReconciledAt(DateTimeUtils.format(LocalDateTime.now()));
        insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_RECONCILE,
                inconsistencies.isEmpty() && Boolean.TRUE.equals(vo.getCountConsistent())
                        ? RdmConstants.MIGRATION_RESULT_SUCCESS : RdmConstants.MIGRATION_RESULT_FAILED,
                actor.getId(), batchRequestId(batch), nz(batch.getVersion()), nz(batch.getVersion()),
                null, null,
                Map.of("total", total, "completed", completed, "failed", failed,
                        "blocked", blocked, "rolledBack", rolledBack, "pending", pending,
                        "inconsistencies", inconsistencies),
                null);
        log.info("遷移對賬完成: batchId={}, total={}, completed={}, failed={}, blocked={}, pending={}, traceable={}",
                batchId, total, completed, failed, blocked, pending, vo.getTraceable());
        return vo;
    }

    /* ==================== C6. 保守回退（拒绝盲目回滚） ==================== */

    /**
     * 回退（幂等入口）。<b>拒绝盲目回滚</b>：
     * 逐项重读事实并与执行前冻结的基线做差异比对，任一已完成明细出现新 V3 事实 →
     * 整体拒绝、自动暂停批次、写 blocked 审计，提示走前滚兼容（不删除任何历史/证据/关联）。
     * 仅在全部已完成明细「无新事实」时执行结构性逆向（还原需求结构字段 + 封存迁移产出交付项）。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmStockMigrationVO.RollbackResult rollback(Long batchId, RdmStockMigrationDTO.Rollback dto) {
        SysUser actor = requireActor();
        String hash = idempotentService.stableRequestHash(List.of(
                "rollback", String.valueOf(batchId),
                String.valueOf(dto == null ? null : dto.getExpectedVersion()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actor.getId())
                .bizType(RdmConstants.BIZ_MIGRATION_ROLLBACK)
                .resourceKey("migration_batch:" + batchId)
                .clientRequestId(deriveClientRequestId("rollback", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doRollback(batchId, dto, actor), RdmStockMigrationVO.RollbackResult.class);
    }

    RdmStockMigrationVO.RollbackResult doRollback(Long batchId, RdmStockMigrationDTO.Rollback dto, SysUser actor) {
        RdmMigrationBatch batch = requireBatch(batchId);
        Set<String> rollbackable = Set.of(RdmConstants.MIGRATION_BATCH_RUNNING, RdmConstants.MIGRATION_BATCH_PAUSED,
                RdmConstants.MIGRATION_BATCH_COMPLETED, RdmConstants.MIGRATION_BATCH_FAILED);
        if (!rollbackable.contains(batch.getStatus())) {
            throw new BusinessException("當前狀態不可回退：" + batch.getStatus()
                    + "（僅執行中/已暫停/已完成/失敗批次可申請回退）");
        }
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("回退必須填寫原因（審計留痕）");
        }
        checkExpectedVersion(dto.getExpectedVersion(), batch.getVersion(), "遷移批次");
        requireMigrationOwner(batch, actor, "回退該遷移批次");
        List<RdmMigrationItem> completedItems = itemsOfBatch(batchId).stream()
                .filter(i -> RdmConstants.MIGRATION_ITEM_COMPLETED.equals(i.getStatus()))
                .collect(Collectors.toList());
        if (completedItems.isEmpty()) {
            throw new BusinessException("批次沒有已完成的遷移明細，無需回退");
        }

        // 第一步：全量新事实核查（任一命中 → 整体拒绝，绝不部分回滚）
        Map<String, Map<String, List<Long>>> newFactsByItem = new LinkedHashMap<>();
        for (RdmMigrationItem item : completedItems) {
            Map<String, List<Long>> newFacts = diffNewFacts(item);
            if (!newFacts.isEmpty()) {
                newFactsByItem.put(String.valueOf(item.getId()), newFacts);
            }
        }
        if (!newFactsByItem.isEmpty()) {
            // 拒绝盲目回滚：自动暂停批次（阻断后续执行），写 blocked 审计，保留一切证据走前滚
            String rejectReason = "遷移後已產生新的 V3 事實（" + newFactsByItem.keySet()
                    + " 號明細），拒絕盲目回滾；批次已自動暫停，請走前滾兼容（不刪除歷史/證據/關聯）";
            int before = nz(batch.getVersion());
            if (!RdmConstants.MIGRATION_BATCH_PAUSED.equals(batch.getStatus())) {
                batch.setStatus(RdmConstants.MIGRATION_BATCH_PAUSED);
                batch.setPausedAt(LocalDateTime.now());
            }
            batch.setPauseReason(truncate(rejectReason, 500));
            // 拒绝原因同步同写入 summary（冻结 DDL 的批次表无 blocking_reason 列，不得新增结构化列）
            Map<String, Object> summary = parseSummary(batch);
            summary.put("rollbackRejectedReason", rejectReason);
            summary.put("rollbackRejectedNewFacts", newFactsByItem);
            batch.setPreviewSummaryJson(JsonUtils.toJson(summary));
            updateBatchOrConflict(batch);
            insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_ROLLBACK,
                    RdmConstants.MIGRATION_RESULT_BLOCKED, actor.getId(), batchRequestId(batch),
                    before, nz(batch.getVersion()), null, null,
                    Map.of("rejected", true, "newFactsByItem", newFactsByItem), dto.getReason().trim());
            log.warn("拒絕盲目回滾（發現新 V3 事實，批次已自動暫停）: batchId={}, items={}",
                    batchId, newFactsByItem.keySet());
            RdmStockMigrationVO.RollbackResult vo = new RdmStockMigrationVO.RollbackResult();
            vo.setBatchId(batchId);
            vo.setRejected(true);
            vo.setRejectReason(rejectReason);
            vo.setNewFactsByItem(newFactsByItem);
            vo.setRolledBackItemIds(List.of());
            vo.setBatchStatus(batch.getStatus());
            return vo;
        }

        // 第二步：无新事实 → 结构性逆向（不物理删除任何行；迁移产出交付项以 blockedFlag=1 封存）
        List<Long> rolledBackIds = new ArrayList<>();
        for (RdmMigrationItem item : completedItems) {
            revertSingleItem(item, actor);
            rolledBackIds.add(item.getId());
            insertAudit(batchId, item.getId(), RdmConstants.MIGRATION_ACTION_ROLLBACK,
                    RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), batchRequestId(batch),
                    nz(item.getVersion()), nz(item.getVersion()) + 1,
                    item.getExecutedFactHash(), null,
                    Map.of("status", RdmConstants.MIGRATION_ITEM_ROLLED_BACK,
                            "mode", "structural-revert", "deleted", false),
                    dto.getReason().trim());
        }
        int batchBefore = nz(batch.getVersion());
        batch.setStatus(RdmConstants.MIGRATION_BATCH_ROLLED_BACK);
        updateBatchOrConflict(batch);
        insertAudit(batchId, null, RdmConstants.MIGRATION_ACTION_ROLLBACK,
                RdmConstants.MIGRATION_RESULT_SUCCESS, actor.getId(), batchRequestId(batch),
                batchBefore, batchBefore + 1, null, null,
                Map.of("rolledBackItems", rolledBackIds, "mode", "structural-revert"),
                dto.getReason().trim());
        log.info("遷移批次已保守回退（僅結構性逆向，未刪除任何歷史/證據/關聯）: batchId={}, items={}",
                batchId, rolledBackIds);
        RdmStockMigrationVO.RollbackResult vo = new RdmStockMigrationVO.RollbackResult();
        vo.setBatchId(batchId);
        vo.setRejected(false);
        vo.setRolledBackItemIds(rolledBackIds);
        vo.setBatchStatus(batch.getStatus());
        return vo;
    }

    /**
     * 单项结构性逆向：还原需求结构字段（条件更新，仅当仍为迁移所置状态）、封存迁移产出交付项。
     * <b>不删除任何行</b>：迁移明细/审计/交付项全部保留，交付项以 blockedFlag=1 + 状态留痕封存。
     */
    private void revertSingleItem(RdmMigrationItem item, SysUser actor) {
        Map<String, Object> before = parseJsonMap(item.getBeforeSnapshotJson());
        Integer rawFlow = asInteger(before.get("flowVersionRaw"));
        Long oldProjectId = asLong(before.get("projectId"));
        String oldKind = before.get("requirementKind") == null ? null : String.valueOf(before.get("requirementKind"));

        LambdaUpdateWrapper<RdmRequirement> uw = new LambdaUpdateWrapper<RdmRequirement>()
                .eq(RdmRequirement::getId, item.getReqId())
                .eq(RdmRequirement::getFlowVersion, RdmConstants.FLOW_VERSION_3)
                .set(RdmRequirement::getFlowVersion, rawFlow)
                .set(RdmRequirement::getProjectId, oldProjectId);
        if (oldKind == null) {
            // 迁移时补过默认 execution → 还原为 NULL；若已被人工改为其他值则不动（保守）
            uw.eq(RdmRequirement::getRequirementKind, RdmConstants.REQ_KIND_EXECUTION);
            uw.set(RdmRequirement::getRequirementKind, null);
        }
        int affected = requirementMapper.update(null, uw);
        if (affected == 0) {
            // 需求已被前滚侧改写（例如人工调整过结构）：拒绝逆向本项，整体回退失败回滚（事务内）
            throw new BusinessException("需求 " + item.getReqId()
                    + " 的 V3 結構已被後續操作改寫，無法安全逆向；請走前滾兼容");
        }

        // 封存迁移产出交付项（不删除；消费方看到 blocked 即不可推进）
        Map<String, Object> after = parseJsonMap(item.getAfterSnapshotJson());
        Long diId = asLong(after.get("createdDeliveryItemId"));
        if (diId != null) {
            RdmDeliveryItem di = deliveryItemMapper.selectById(diId);
            if (di != null && RdmConstants.DI_PREPARING.equals(di.getStatus())) {
                di.setBlockedFlag(1);
                di.setScopeChangeLog("批次 " + item.getBatchId() + " 遷移回退：本項已封存（來源="
                        + RdmConstants.MIGRATION_SOURCE_STOCK + "），不可推進；歷史保留不刪除");
                if (deliveryItemMapper.updateById(di) == 0) {
                    throw new BusinessException("遷移產出交付項 " + diId + " 已被並發修改，回退中止");
                }
            } else if (di != null) {
                // 状态已离开 preparing：属新事实范畴，理论上已被 diffNewFacts 拦截；纵深防御再拦一次
                throw new BusinessException("遷移產出交付項 " + diId + " 狀態已推進（" + di.getStatus()
                        + "），拒絕回退，請走前滾兼容");
            }
        }
        item.setStatus(RdmConstants.MIGRATION_ITEM_ROLLED_BACK);
        item.setRolledBackBy(actor.getId());
        item.setRolledBackAt(LocalDateTime.now());
        itemMapper.updateById(item);
    }

    /**
     * 重读事实并与执行前基线做差异：返回「新增的 V3 事实」（类型 → 新ID列表，空 Map = 无新事实）。
     * <p>扫描范围 = 需求本身 + 迁移产出交付项 + 基线中既有交付项（覆盖"给迁移交付项新挂事实"与
     * "给旧交付项新挂事实"两类前滚痕迹）。
     */
    private Map<String, List<Long>> diffNewFacts(RdmMigrationItem item) {
        Map<String, List<Long>> baseline = parseBaseline(item.getFactBaselineJson());
        List<Long> scanDeliveryItemIds = new ArrayList<>(baseline.getOrDefault(FT_DELIVERY_ITEMS, List.of()));
        Map<String, Object> after = parseJsonMap(item.getAfterSnapshotJson());
        Long createdDi = asLong(after.get("createdDeliveryItemId"));
        if (createdDi != null) {
            scanDeliveryItemIds.add(createdDi);
        }
        Map<String, List<Long>> current = scanFacts(item.getReqId(), scanDeliveryItemIds);
        Map<String, List<Long>> added = new LinkedHashMap<>();
        for (Map.Entry<String, List<Long>> e : current.entrySet()) {
            Set<Long> base = new TreeSet<>(baseline.getOrDefault(e.getKey(), List.of()));
            List<Long> news = e.getValue().stream().filter(id -> !base.contains(id))
                    .collect(Collectors.toList());
            if (!news.isEmpty()) {
                added.put(e.getKey(), news);
            }
        }
        return added;
    }

    /* ==================== 查询（只读，供任务23 前端管理页消费） ==================== */

    /** 批次详情：批次头 + 全部明细 + 不可覆盖审计。 */
    public RdmStockMigrationVO.BatchDetail detail(Long batchId) {
        RdmMigrationBatch batch = requireBatch(batchId);
        RdmStockMigrationVO.BatchDetail vo = new RdmStockMigrationVO.BatchDetail();
        vo.setBatchId(batch.getId());
        vo.setStatus(batch.getStatus());
        vo.setRequestId(batch.getRequestId());
        vo.setRequestedBy(batch.getRequestedBy());
        vo.setPreviewHash(batch.getPreviewHash());
        vo.setChunkSize(batch.getChunkSize());
        vo.setConfirmedBy(batch.getConfirmedBy());
        vo.setConfirmedAt(DateTimeUtils.format(batch.getConfirmedAt()));
        vo.setPausedAt(DateTimeUtils.format(batch.getPausedAt()));
        vo.setPauseReason(batch.getPauseReason());
        vo.setRolledBackAt(null);
        vo.setResultJson(batch.getPreviewSummaryJson());
        vo.setBlockingReason(batch.getPauseReason());
        vo.setVersion(batch.getVersion());
        vo.setCreatedAt(DateTimeUtils.format(batch.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(batch.getUpdatedAt()));
        vo.setItems(itemsOfBatch(batchId).stream().map(i -> {
            RdmStockMigrationVO.ItemDetail d = new RdmStockMigrationVO.ItemDetail();
            d.setItemId(i.getId());
            d.setReqId(i.getReqId());
            d.setTargetProjectId(i.getTargetProjectId());
            d.setSourceFlowVersion(i.getSourceFlowVersion());
            d.setSourceVersion(i.getSourceVersion());
            d.setStatus(i.getStatus());
            d.setBlockingReason(i.getBlockingReason());
            d.setResultJson(i.getResultJson());
            d.setConfirmedBy(i.getConfirmedBy());
            d.setConfirmedAt(DateTimeUtils.format(i.getConfirmedAt()));
            d.setExecutedBy(i.getExecutedBy());
            d.setExecutedAt(DateTimeUtils.format(i.getExecutedAt()));
            d.setRolledBackBy(i.getRolledBackBy());
            d.setRolledBackAt(DateTimeUtils.format(i.getRolledBackAt()));
            d.setVersion(i.getVersion());
            return d;
        }).collect(Collectors.toList()));
        List<RdmMigrationAudit> audits = auditMapper.selectList(new LambdaQueryWrapper<RdmMigrationAudit>()
                .eq(RdmMigrationAudit::getBatchId, batchId)
                .orderByAsc(RdmMigrationAudit::getId));
        vo.setAudits(audits == null ? List.of() : audits.stream().map(a -> {
            RdmStockMigrationVO.AuditEntry e = new RdmStockMigrationVO.AuditEntry();
            e.setId(a.getId());
            e.setBatchId(a.getBatchId());
            e.setItemId(a.getItemId());
            e.setAction(a.getAction());
            e.setResult(a.getResult());
            e.setOperatorUserId(a.getOperatorUserId());
            e.setRequestId(a.getRequestId());
            e.setBeforeVersion(a.getBeforeVersion());
            e.setAfterVersion(a.getAfterVersion());
            e.setBeforeHash(a.getBeforeHash());
            e.setAfterHash(a.getAfterHash());
            e.setResultJson(a.getResultJson());
            e.setReason(a.getReason());
            e.setCreatedAt(DateTimeUtils.format(a.getCreatedAt()));
            return e;
        }).collect(Collectors.toList()));
        return vo;
    }

    /** 批次简表（最近 200 条，可按状态过滤）。 */
    public List<RdmStockMigrationVO.BatchDetail> listBatches(String status) {
        LambdaQueryWrapper<RdmMigrationBatch> qw = new LambdaQueryWrapper<RdmMigrationBatch>()
                .orderByDesc(RdmMigrationBatch::getId)
                .last("LIMIT 200");
        if (StringUtils.hasText(status)) {
            qw.eq(RdmMigrationBatch::getStatus, status.trim());
        }
        List<RdmMigrationBatch> batches = batchMapper.selectList(qw);
        return batches == null ? List.of() : batches.stream().map(b -> {
            RdmStockMigrationVO.BatchDetail d = new RdmStockMigrationVO.BatchDetail();
            d.setBatchId(b.getId());
            d.setStatus(b.getStatus());
            d.setRequestId(b.getRequestId());
            d.setRequestedBy(b.getRequestedBy());
            d.setPreviewHash(b.getPreviewHash());
            d.setChunkSize(b.getChunkSize());
            d.setConfirmedBy(b.getConfirmedBy());
            d.setConfirmedAt(DateTimeUtils.format(b.getConfirmedAt()));
            d.setVersion(b.getVersion());
            d.setCreatedAt(DateTimeUtils.format(b.getCreatedAt()));
            d.setUpdatedAt(DateTimeUtils.format(b.getUpdatedAt()));
            return d;
        }).collect(Collectors.toList());
    }

    /* ==================== 事实扫描（只读；基线冻结与回滚差异比对的唯一事实来源） ==================== */

    private static final String FT_DELIVERY_ITEMS = "deliveryItems";
    private static final String FT_TEST_BATCHES = "testBatches";
    private static final String FT_TEST_ROUNDS = "testRounds";
    private static final String FT_TEST_EXECUTIONS = "testExecutions";
    private static final String FT_ACCEPTANCE_RECORDS = "acceptanceRecords";
    private static final String FT_ISSUES = "issues";
    private static final String FT_ISSUE_DEFERS = "issueDeferrals";
    private static final String FT_ISSUE_FOLLOWUPS = "issueFollowups";
    private static final String FT_ISSUE_RESOLUTIONS = "issueResolutions";
    private static final String FT_RELEASE_BATCHES = "releaseBatches";
    private static final String FT_RELEASE_DEPLOYMENTS = "releaseDeployments";
    private static final String FT_RELEASE_APPROVALS = "releaseApprovals";
    private static final String FT_RELEASE_ATTEMPTS = "releaseAttempts";
    private static final String FT_RELEASE_EXEMPTIONS = "releaseExemptions";
    private static final String FT_EXEMPTION_DECISIONS = "releaseExemptionDecisions";
    private static final String FT_SUPPLEMENTARY = "supplementaryVerifications";
    private static final String FT_WORK_TASKS = "workTasks";

    /**
     * 扫描某需求关联的全部 V3 事实ID（只读，绝不写入）。
     * <p>覆盖：交付项/提测批次/测试轮次/测试执行/验收记录/问题/延期/承接/修复决议/发布批次/部署/审批/尝试/
     * 豁免/豁免裁决/补验/工作任务。{@code extraDeliveryItemIds} 用于回滚时把迁移产出交付项纳入扫描范围。
     */
    Map<String, List<Long>> scanFacts(Long reqId, List<Long> extraDeliveryItemIds) {
        Map<String, List<Long>> facts = new TreeMap<>();
        List<Long> diIds = ids(deliveryItemMapper.selectList(new LambdaQueryWrapper<RdmDeliveryItem>()
                .eq(RdmDeliveryItem::getReqId, reqId)), RdmDeliveryItem::getId);
        Set<Long> diScope = new LinkedHashSet<>(diIds);
        if (extraDeliveryItemIds != null) {
            extraDeliveryItemIds.stream().filter(Objects::nonNull).forEach(diScope::add);
        }
        facts.put(FT_DELIVERY_ITEMS, diIds);

        List<Long> tbIds = ids(testBatchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                .eq(RdmTestBatch::getReqId, reqId)), RdmTestBatch::getId);
        facts.put(FT_TEST_BATCHES, tbIds);
        facts.put(FT_TEST_ROUNDS, tbIds.isEmpty() ? List.of()
                : ids(testRoundMapper.selectList(new LambdaQueryWrapper<RdmTestRound>()
                .in(RdmTestRound::getBatchId, tbIds)), RdmTestRound::getId));
        facts.put(FT_TEST_EXECUTIONS, unionTestExecutions(tbIds, diScope));

        facts.put(FT_ACCEPTANCE_RECORDS, ids(acceptanceRecordMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceRecord>()
                        .eq(RdmAcceptanceRecord::getReqId, reqId)), RdmAcceptanceRecord::getId));

        List<RdmIssue> issues = nullSafe(issueMapper.selectList(new LambdaQueryWrapper<RdmIssue>()
                .eq(RdmIssue::getReqId, reqId)
                .or().in(!diScope.isEmpty(), RdmIssue::getDeliveryItemId, diScope)));
        List<Long> issueIds = ids(issues, RdmIssue::getId);
        facts.put(FT_ISSUES, issueIds);
        facts.put(FT_ISSUE_DEFERS, issueIds.isEmpty() ? List.of()
                : ids(issueDeferMapper.selectList(new LambdaQueryWrapper<RdmIssueDefer>()
                .in(RdmIssueDefer::getIssueId, issueIds)), RdmIssueDefer::getId));
        facts.put(FT_ISSUE_FOLLOWUPS, issueIds.isEmpty() ? List.of()
                : ids(issueFollowupMapper.selectList(new LambdaQueryWrapper<RdmIssueFollowup>()
                .in(RdmIssueFollowup::getIssueId, issueIds)), RdmIssueFollowup::getId));
        facts.put(FT_ISSUE_RESOLUTIONS, issueIds.isEmpty() ? List.of()
                : ids(issueResolutionMapper.selectList(new LambdaQueryWrapper<RdmIssueResolution>()
                .in(RdmIssueResolution::getIssueId, issueIds)), RdmIssueResolution::getId));

        List<Long> rbIds = ids(releaseBatchMapper.selectList(new LambdaQueryWrapper<RdmReleaseBatch>()
                .eq(RdmReleaseBatch::getReqId, reqId)), RdmReleaseBatch::getId);
        facts.put(FT_RELEASE_BATCHES, rbIds);
        facts.put(FT_RELEASE_DEPLOYMENTS, rbIds.isEmpty() ? List.of()
                : ids(releaseDeploymentMapper.selectList(new LambdaQueryWrapper<RdmReleaseDeployment>()
                .in(RdmReleaseDeployment::getReleaseBatchId, rbIds)), RdmReleaseDeployment::getId));
        facts.put(FT_RELEASE_APPROVALS, rbIds.isEmpty() ? List.of()
                : ids(releaseApprovalMapper.selectList(new LambdaQueryWrapper<RdmReleaseApproval>()
                .in(RdmReleaseApproval::getReleaseBatchId, rbIds)), RdmReleaseApproval::getId));
        facts.put(FT_RELEASE_ATTEMPTS, rbIds.isEmpty() ? List.of()
                : ids(releaseAttemptMapper.selectList(new LambdaQueryWrapper<RdmReleaseAttempt>()
                .in(RdmReleaseAttempt::getReleaseBatchId, rbIds)), RdmReleaseAttempt::getId));
        List<Long> exemptionIds = rbIds.isEmpty() ? List.of()
                : ids(releaseExemptionMapper.selectList(new LambdaQueryWrapper<RdmReleaseExemption>()
                .in(RdmReleaseExemption::getReleaseBatchId, rbIds)), RdmReleaseExemption::getId);
        facts.put(FT_RELEASE_EXEMPTIONS, exemptionIds);
        facts.put(FT_EXEMPTION_DECISIONS, exemptionIds.isEmpty() ? List.of()
                : ids(releaseExemptionDecisionMapper.selectList(
                        new LambdaQueryWrapper<RdmReleaseExemptionDecision>()
                                .in(RdmReleaseExemptionDecision::getExemptionId, exemptionIds)),
                        RdmReleaseExemptionDecision::getId));
        facts.put(FT_SUPPLEMENTARY, diScope.isEmpty() ? List.of()
                : ids(supplementaryVerificationMapper.selectList(
                        new LambdaQueryWrapper<RdmSupplementaryVerification>()
                                .in(RdmSupplementaryVerification::getDeliveryItemId, diScope)),
                        RdmSupplementaryVerification::getId));
        facts.put(FT_WORK_TASKS, ids(workTaskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId)), RdmWorkTask::getId));
        return facts;
    }

    /** 测试执行两段扫描合并（按提测批次 / 按交付项；含迁移产出交付项），只读。 */
    private List<Long> unionTestExecutions(List<Long> tbIds, Set<Long> diScope) {
        Set<Long> union = new TreeSet<>();
        if (!tbIds.isEmpty()) {
            union.addAll(ids(testExecutionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                    .in(RdmTestExecution::getBatchId, tbIds)), RdmTestExecution::getId));
        }
        if (!diScope.isEmpty()) {
            union.addAll(ids(testExecutionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                    .in(RdmTestExecution::getDeliveryItemId, diScope)), RdmTestExecution::getId));
        }
        return new ArrayList<>(union);
    }

    private Map<String, List<Long>> emptyBaseline() {
        Map<String, List<Long>> empty = new TreeMap<>();
        for (String type : List.of(FT_DELIVERY_ITEMS, FT_TEST_BATCHES, FT_TEST_ROUNDS, FT_TEST_EXECUTIONS,
                FT_ACCEPTANCE_RECORDS, FT_ISSUES, FT_ISSUE_DEFERS, FT_ISSUE_FOLLOWUPS, FT_ISSUE_RESOLUTIONS,
                FT_RELEASE_BATCHES, FT_RELEASE_DEPLOYMENTS, FT_RELEASE_APPROVALS, FT_RELEASE_ATTEMPTS,
                FT_RELEASE_EXEMPTIONS, FT_EXEMPTION_DECISIONS, FT_SUPPLEMENTARY, FT_WORK_TASKS)) {
            empty.put(type, List.of());
        }
        return empty;
    }

    /* ==================== 授权（fail-closed，身份一律取认证主体） ==================== */

    private SysUser requireActor() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return current;
    }

    /**
     * 主责确认/恢复/回退授权：管理员，或范围主责。
     * <p>项目范围 = 目标项目 PM/产品负责人；需求范围 = 逐条需求的交付写权限人
     * （委托 {@link RdmAccessGuard#requireDeliveryWriter}，含参与角色与可见性校验）。
     */
    private void requireMigrationOwner(RdmMigrationBatch batch, SysUser actor, String action) {
        if (operatorResolver.isAdmin(actor)) {
            return;
        }
        Map<String, Object> summary = parseSummary(batch);
        if (SCOPE_PROJECT.equals(summary.get("scopeType"))) {
            Long projectId = asLong(summary.get("scopeProjectId"));
            requireProjectOwnerOrAdmin(projectId, actor, action);
            return;
        }
        List<RdmMigrationItem> items = itemsOfBatch(batch.getId()).stream()
                .filter(i -> !RdmConstants.MIGRATION_ITEM_BLOCKED.equals(i.getStatus()))
                .collect(Collectors.toList());
        if (items.isEmpty()) {
            throw new BusinessException("批次無有效明細，無法" + action);
        }
        // 项目主责捷径：全部明细的目标项目一致且 actor 是该项目 PM/PO
        Set<Long> projectIds = items.stream().map(RdmMigrationItem::getTargetProjectId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (projectIds.size() == 1 && isProjectOwner(projectIds.iterator().next(), actor)) {
            return;
        }
        for (RdmMigrationItem item : items) {
            try {
                accessGuard.requireDeliveryWriter(item.getReqId(), action);
            } catch (BusinessException e) {
                throw new BusinessException("您不是需求 " + item.getReqId() + " 的主責/交付參與人或管理員，無法" + action);
            }
        }
    }

    /** 执行/暂停授权：管理员、批次发起人或主责确认人（执行是运维动作，不要求逐条需求主责）。 */
    private void requireOperator(RdmMigrationBatch batch, SysUser actor, String action) {
        if (operatorResolver.isAdmin(actor)
                || Objects.equals(batch.getRequestedBy(), actor.getId())
                || Objects.equals(batch.getConfirmedBy(), actor.getId())) {
            return;
        }
        throw new BusinessException("僅管理員、批次發起人或主責確認人可" + action);
    }

    private void requireProjectOwnerOrAdmin(Long projectId, SysUser actor, String action) {
        if (operatorResolver.isAdmin(actor)) {
            return;
        }
        if (!isProjectOwner(projectId, actor)) {
            throw new BusinessException("僅管理員或目標項目的項目經理/產品負責人可" + action);
        }
    }

    private boolean isProjectOwner(Long projectId, SysUser actor) {
        if (projectId == null || actor == null) {
            return false;
        }
        RdmProject project = projectMapper.selectById(projectId);
        return project != null && (Objects.equals(project.getPmUserId(), actor.getId())
                || Objects.equals(project.getProductOwnerUserId(), actor.getId()));
    }

    /* ==================== 内部工具 ==================== */

    private RdmMigrationBatch requireBatch(Long batchId) {
        if (batchId == null) {
            throw new BusinessException("批次ID不能為空");
        }
        RdmMigrationBatch batch = batchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException("遷移批次不存在：" + batchId);
        }
        return batch;
    }

    private List<RdmMigrationItem> itemsOfBatch(Long batchId) {
        List<RdmMigrationItem> items = itemMapper.selectList(new LambdaQueryWrapper<RdmMigrationItem>()
                .eq(RdmMigrationItem::getBatchId, batchId)
                .orderByAsc(RdmMigrationItem::getId));
        return items == null ? List.of() : items;
    }

    private List<RdmMigrationItem> confirmedQueue(Long batchId, int limit) {
        List<RdmMigrationItem> items = itemMapper.selectList(new LambdaQueryWrapper<RdmMigrationItem>()
                .eq(RdmMigrationItem::getBatchId, batchId)
                .eq(RdmMigrationItem::getStatus, RdmConstants.MIGRATION_ITEM_CONFIRMED)
                .orderByAsc(RdmMigrationItem::getId));
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        return items.subList(0, Math.min(limit, items.size()));
    }

    private Map<String, Long> statusCounts(Long batchId) {
        return itemsOfBatch(batchId).stream()
                .collect(Collectors.groupingBy(RdmMigrationItem::getStatus, Collectors.counting()));
    }

    private boolean hasActiveMigrationItem(Long reqId, Long excludeBatchId) {
        LambdaQueryWrapper<RdmMigrationItem> qw = new LambdaQueryWrapper<RdmMigrationItem>()
                .eq(RdmMigrationItem::getReqId, reqId)
                .in(RdmMigrationItem::getStatus, List.of(
                        RdmConstants.MIGRATION_ITEM_CONFIRMED, RdmConstants.MIGRATION_ITEM_RUNNING,
                        RdmConstants.MIGRATION_ITEM_COMPLETED, RdmConstants.MIGRATION_ITEM_BLOCKED));
        if (excludeBatchId != null) {
            qw.ne(RdmMigrationItem::getBatchId, excludeBatchId);
        }
        Long count = itemMapper.selectCount(qw);
        return count != null && count > 0;
    }

    private boolean hasRollbackBlockedAudit(Long batchId) {
        Long count = auditMapper.selectCount(new LambdaQueryWrapper<RdmMigrationAudit>()
                .eq(RdmMigrationAudit::getBatchId, batchId)
                .eq(RdmMigrationAudit::getAction, RdmConstants.MIGRATION_ACTION_ROLLBACK)
                .eq(RdmMigrationAudit::getResult, RdmConstants.MIGRATION_RESULT_BLOCKED));
        return count != null && count > 0;
    }

    private boolean isAggregateWithChildren(RdmRequirement req) {
        if (!RdmConstants.REQ_KIND_AGGREGATE.equals(req.getRequirementKind())) {
            return false;
        }
        Long children = requirementMapper.selectCount(new LambdaQueryWrapper<RdmRequirement>()
                .eq(RdmRequirement::getStructureParentReqId, req.getId()));
        return children != null && children > 0;
    }

    /** 需求有效流程版本：历史空值按 V1 兜底（与 RdmFlowVersionGuard.getEffectiveFlowVersion 同口径）。 */
    private int effectiveFlowVersion(RdmRequirement req) {
        return req.getFlowVersion() == null ? 1 : req.getFlowVersion();
    }

    private Map<String, Object> beforeSnapshotOf(RdmRequirement req) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reqId", req.getId());
        m.put("reqNo", req.getReqNo());
        m.put("title", req.getTitle());
        m.put("status", req.getStatus());
        m.put("flowVersionRaw", req.getFlowVersion());
        m.put("flowVersionEffective", effectiveFlowVersion(req));
        m.put("projectId", req.getProjectId());
        m.put("structureParentReqId", req.getStructureParentReqId());
        m.put("requirementKind", req.getRequirementKind());
        m.put("source", RdmConstants.MIGRATION_SOURCE_STOCK);
        return m;
    }

    /** 迁移影响面（结构性事实清单，明示不产出任何证据）。 */
    private List<String> migrationImpacts() {
        return List.of(
                "需求 flow_version → 3（條件更新，並發修改即失敗隔離）",
                "需求關聯目標項目（project_id）",
                "requirement_kind 為空時補默認 execution（既有值不動）",
                "創建容器交付項（DI_PREPARING，範圍未凍結，來源標記 " + RdmConstants.MIGRATION_SOURCE_STOCK + "）",
                "絕不產出測試/驗收/簽字/評分/發布/上線證據；發布與驗收仍走任務20/27 權威門禁");
    }

    private int chunkSizeOf(RdmMigrationBatch batch) {
        return normalizeChunkSize(batch.getChunkSize());
    }

    private int normalizeChunkSize(Integer chunkSize) {
        if (chunkSize == null) {
            return RdmConstants.MIGRATION_CHUNK_DEFAULT;
        }
        if (chunkSize < RdmConstants.MIGRATION_CHUNK_MIN || chunkSize > RdmConstants.MIGRATION_CHUNK_MAX) {
            throw new BusinessException("分塊大小必須在 " + RdmConstants.MIGRATION_CHUNK_MIN
                    + ".." + RdmConstants.MIGRATION_CHUNK_MAX + " 之間：" + chunkSize);
        }
        return chunkSize;
    }

    private void updateBatchOrConflict(RdmMigrationBatch batch) {
        if (batchMapper.updateById(batch) == 0) {
            throw new BusinessException("遷移批次已被他人修改（並發衝突），請刷新後重試");
        }
    }

    /** 明细状态推进；uk_rdm_migration_active_req 冲突（需求被其他生效迁移占用）转业务异常。 */
    private void updateItemOrOccupied(RdmMigrationItem item) {
        try {
            if (itemMapper.updateById(item) == 0) {
                throw new BusinessException("遷移明細已被他人修改（並發衝突），請刷新後重試");
            }
        } catch (DuplicateKeyException dup) {
            throw new BusinessException("需求 " + item.getReqId() + " 已被其他生效遷移佔用（唯一約束衝突）");
        }
    }

    /** 失败隔离路径的明细更新：吞并二次异常，避免掩盖首因。 */
    private void safeUpdateItem(Object entity) {
        try {
            if (entity instanceof RdmMigrationItem item) {
                itemMapper.updateById(item);
            } else if (entity instanceof RdmDeliveryItem di) {
                deliveryItemMapper.updateById(di);
            }
        } catch (Exception e) {
            log.warn("失敗隔離路徑的實體更新未生效（將隨審計留痕）: {}", e.getMessage());
        }
    }

    private void insertAudit(Long batchId, Long itemId, String action, String result, Long operatorUserId,
                             String requestId, int beforeVersion, int afterVersion,
                             String beforeHash, String afterHash, Object resultPayload, String reason) {
        RdmMigrationAudit audit = new RdmMigrationAudit();
        audit.setBatchId(batchId);
        audit.setItemId(itemId);
        audit.setAction(action);
        audit.setResult(result);
        audit.setOperatorUserId(operatorUserId);
        audit.setRequestId(requestId);
        audit.setBeforeVersion(beforeVersion);
        audit.setAfterVersion(afterVersion);
        audit.setBeforeHash(beforeHash);
        audit.setAfterHash(afterHash);
        audit.setResultJson(JsonUtils.toJson(resultPayload == null ? Map.of() : resultPayload));
        audit.setReason(truncate(reason, 500));
        auditMapper.insert(audit);
    }

    private String batchRequestId(RdmMigrationBatch batch) {
        return truncate("mb" + batch.getId() + ":" + nullToEmpty(batch.getRequestId()), 64);
    }

    /** 幂等 clientRequestId：优先客户端 requestId，否则用服务端派生判别子（中心归一化到 ≤64 ASCII）。 */
    private String deriveClientRequestId(String op, String requestId, String discriminator) {
        String tail = StringUtils.hasText(requestId) ? requestId.trim()
                : (StringUtils.hasText(discriminator) ? discriminator : "na");
        return RdmIdempotentService.normalizeClientRequestId(op + ":" + tail);
    }

    /** rdm_migration_batch.request_id（VARCHAR(64) ascii）：前缀 + 判别子摘要，稳定且 ≤64。 */
    private String deriveBatchRequestId(String prefix, String clientRequestId, String discriminator) {
        String base = StringUtils.hasText(clientRequestId) ? clientRequestId.trim()
                : nullToEmpty(discriminator);
        return RdmIdempotentService.normalizeClientRequestId(prefix + ":" + base);
    }

    private void checkExpectedVersion(Integer expected, Integer actual, String what) {
        if (expected != null && !expected.equals(actual)) {
            throw new BusinessException(what + "已被他人修改（版本不一致），請刷新後重試");
        }
    }

    private Map<String, Object> parseSummary(RdmMigrationBatch batch) {
        Map<String, Object> summary = parseJsonMap(batch.getPreviewSummaryJson());
        return summary.isEmpty() ? new LinkedHashMap<>() : summary;
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (!StringUtils.hasText(json)) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> map = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
            return map == null ? new LinkedHashMap<>() : map;
        } catch (Exception e) {
            throw new BusinessException("遷移 JSON 欄位解析失敗，拒絕繼續（防止基於壞數據操作）");
        }
    }

    private Map<String, List<Long>> parseBaseline(String json) {
        Map<String, Object> raw = parseJsonMap(json);
        Map<String, List<Long>> baseline = new TreeMap<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            if (e.getValue() instanceof List<?> list) {
                baseline.put(e.getKey(), list.stream().map(RdmStockMigrationService::asLong)
                        .filter(Objects::nonNull).collect(Collectors.toList()));
            }
        }
        return baseline;
    }

    private static <T> List<Long> ids(List<T> rows, java.util.function.Function<T, Long> getter) {
        if (rows == null) {
            return List.of();
        }
        return rows.stream().map(getter).filter(Objects::nonNull).distinct().sorted()
                .collect(Collectors.toList());
    }

    private static <T> List<T> nullSafe(List<T> rows) {
        return rows == null ? List.of() : rows;
    }

    private static Long asLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer asInteger(Object v) {
        Long l = asLong(v);
        return l == null ? null : l.intValue();
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** 并发版本空值兜底（冻结 DDL 列 NOT NULL DEFAULT 0，历史/未回填实体按 0 处理）。 */
    private static int nz(Integer v) {
        return v == null ? 0 : v;
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}
