package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.entity.RdmReleaseExemption;
import com.mftb.admin.entity.RdmReleaseExemptionDecision;
import com.mftb.admin.entity.RdmSupplementaryVerification;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionDecisionMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionMapper;
import com.mftb.admin.mapper.RdmSupplementaryVerificationMapper;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * RDM 緊急豁免 + 僅產品補驗閉環服務（任務27）。
 *
 * <p>緊急發布允許在<b>產品驗收尚未完成</b>時先行放行，但代價必須被結構化地釘住，
 * 否則「緊急」會變成常態化繞過門禁的後門。本服務落實四條不可讓的口徑：
 * <ol>
 *   <li><b>只可豁免缺失的產品驗收</b>：缺失項由<b>服務端</b>按當前範圍版本計算，客戶端不得自行聲明；
 *       <b>業務驗收永不可豁免</b>（路徑A 缺業務驗收直接拒絕，無任何例外）；</li>
 *   <li><b>豁免也要四眼</b>：裁決人不得是豁免申請人本人，<b>系統管理員亦無自批豁免</b>；
 *       且 {@code product_risk} 與 {@code release} 兩類裁決<b>必須齊備且均為 approved</b> 豁免才生效；</li>
 *   <li><b>補驗期限按真實工作日</b>：復用 {@link RdmWorkingDayCalculator}（含請假 / 周末支援 / 按人例外日曆），
 *       以<b>補驗人本人</b>的日曆 {@code addWorkingDays} 凍結 deadline，並在 {@code calendar_version}
 *       記 {@code workday:v1:<補驗人ID>} 以標明口徑來源；逾期用 {@code overdueWorkingDays} 判定，
 *       <b>不依賴 cron</b>（讀路徑與開放門禁時刷新）；</li>
 *   <li><b>豁免只豁免發布時序，不豁免開放</b>：{@link #isProductAcceptanceEstablished} 要求
 *       「真實產品驗收 pass」<b>或</b>「補驗單 completed 且 result=pass」，
 *       pending / overdue / failed 一律阻斷開放；補驗失敗即升級整改。</li>
 * </ol>
 *
 * <p>所有寫操作走 {@code public 幂等入口 + @Transactional doXxx}（不嵌外層活動事務）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmReleaseExemptionService {

    /** executeOnce 業務類型：緊急豁免申請 / 豁免裁決 / 補驗完成登記 */
    private static final String BIZ_RELEASE_EXEMPTION = "rdm_release_exemption";
    private static final String BIZ_EXEMPTION_DECISION = "rdm_release_exemption_decision";
    private static final String BIZ_SUPPLEMENTARY_COMPLETE = "rdm_supplementary_complete";

    /** {@code rdm_idempotent_log.client_request_id} 列寬：VARCHAR(64) ascii，派生值絕不可溢出。 */
    private static final int CLIENT_REQUEST_ID_MAX = 64;

    private final RdmReleaseExemptionMapper exemptionMapper;
    private final RdmReleaseExemptionDecisionMapper exemptionDecisionMapper;
    private final RdmSupplementaryVerificationMapper supplementaryMapper;
    private final RdmReleaseBatchMapper batchMapper;
    private final RdmReleaseDeploymentMapper deploymentMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmAcceptanceRecordMapper acceptanceRecordMapper;
    /** 真實產品/業務驗收門禁（任務20 口徑：當前 scopeVersion 下最新有效結論=pass） */
    private final RdmAcceptanceRecordService acceptanceRecordService;
    /** 補驗期限必須按真實工作日計算，禁止用「周一至周五」的簡化 cron 口徑 */
    private final RdmWorkingDayCalculator workingDayCalculator;
    /** 產品補驗時限（天）讀 GLOBAL 灰度配置，缺行/非法回退常量默認 */
    private final RdmFlowVersionGuard flowVersionGuard;
    private final RdmAccessGuard accessGuard;
    private final RdmIdempotentService idempotentService;
    private final OperatorResolver operatorResolver;

    /* ==================== 緊急豁免申請 ==================== */

    /**
     * 申請緊急豁免（幂等入口）。
     * <p>申請人須為本批次發布負責人；申請即<b>凍結</b>缺失清單、補驗計劃與真實工作日期限，
     * 並為每個缺失項創建 {@code pending} 補驗單。
     */
    public RdmReleaseExemption applyExemption(Long batchId, RdmReleaseBatchDTO.Exemption dto,
                                              Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(batchId),
                text(dto == null ? null : dto.getReason()),
                text(dto == null ? null : dto.getRisk()),
                text(dto == null ? null : dto.getRollbackPlan()),
                String.valueOf(dto == null || dto.getSupplementaryPlan() == null
                        ? 0 : dto.getSupplementaryPlan().size())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_RELEASE_EXEMPTION)
                .resourceKey("release-batch:" + batchId)
                .clientRequestId(deriveClientRequestId("exemption", dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        return idempotentService.executeOnce(key,
                () -> doApplyExemption(batchId, dto, actorId, currentUserName, requestId),
                RdmReleaseExemption.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public RdmReleaseExemption doApplyExemption(Long batchId, RdmReleaseBatchDTO.Exemption dto,
                                                Long actorId, String actorName, String requestId) {
        RdmReleaseBatch batch = requireBatch(batchId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");
        accessGuard.requireReleaseOwner(batchId, actorId);
        if (RdmConstants.RB_RELEASED.equals(batch.getStatus())
                || RdmConstants.RB_ROLLED_BACK.equals(batch.getStatus())
                || RdmConstants.RB_CANCELLED.equals(batch.getStatus())) {
            throw new BusinessException("批次已結束（" + batch.getStatus() + "），不可再申請緊急豁免");
        }
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("緊急豁免必須填寫豁免事由");
        }
        if (!StringUtils.hasText(dto.getRisk())) {
            throw new BusinessException("緊急豁免必須填寫產品風險評估");
        }
        if (!StringUtils.hasText(dto.getRollbackPlan())) {
            throw new BusinessException("緊急豁免必須填寫可執行的回滾預案");
        }
        RdmReleaseExemption inFlight = latestExemption(batchId);
        if (inFlight != null && !isFullyRejected(inFlight)) {
            throw new BusinessException("該批次已有在途或已生效的緊急豁免申請，不可重複發起");
        }

        List<RdmReleaseDeployment> deployments = listDeployments(batchId);
        String primaryBuildId = primaryBuildId(deployments);
        List<Map<String, Object>> missing = computeMissingProductAcceptance(batch, deployments);
        if (missing.isEmpty()) {
            throw new BusinessException("當前無缺失的產品驗收，無需緊急豁免（請走正常放行流程）");
        }

        int days = flowVersionGuard.productVerificationDays();
        LocalDate today = LocalDate.now();
        Map<Long, RdmReleaseBatchDTO.SupplementaryPlanItem> overrides = planOverrides(dto);
        List<Map<String, Object>> plan = new ArrayList<>();
        List<RdmSupplementaryVerification> supplementaries = new ArrayList<>();

        for (Map<String, Object> row : missing) {
            Long itemId = toLong(row.get("deliveryItemId"));
            Integer scopeVersion = toInt(row.get("scopeVersion"));
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            RdmReleaseBatchDTO.SupplementaryPlanItem override = itemId == null ? null : overrides.get(itemId);
            Long verifierId = override != null && override.getVerifierUserId() != null
                    ? override.getVerifierUserId()
                    : (item == null ? null : item.getProductAcceptorUserId());
            if (verifierId == null) {
                throw new BusinessException("交付項未配置產品驗收人，無法凍結補驗責任人: itemId=" + itemId);
            }
            String verifierName = override != null && StringUtils.hasText(override.getVerifierUserName())
                    ? override.getVerifierUserName().trim()
                    : (item == null ? null : item.getProductAcceptorUserName());
            // 期限按「補驗人本人」的真實工作日曆凍結（含請假/周末支援/按人例外），非簡單周一至周五
            LocalDate dueDate = workingDayCalculator.addWorkingDays(today, days, verifierId);
            LocalDateTime deadline = (dueDate == null ? today.plusDays(days) : dueDate).atTime(23, 59, 59);
            String calendarVersion = RdmConstants.CALENDAR_VERSION_WORKDAY_PREFIX + verifierId;

            Map<String, Object> planRow = new LinkedHashMap<>();
            planRow.put("deliveryItemId", itemId);
            planRow.put("itemNo", row.get("itemNo"));
            planRow.put("title", row.get("title"));
            planRow.put("scopeVersion", scopeVersion);
            planRow.put("buildId", primaryBuildId);
            planRow.put("verifierUserId", verifierId);
            planRow.put("verifierUserName", verifierName);
            planRow.put("verificationDays", days);
            planRow.put("deadline", deadline.toString());
            planRow.put("calendarVersion", calendarVersion);
            plan.add(planRow);

            RdmSupplementaryVerification sv = new RdmSupplementaryVerification();
            sv.setReleaseBatchId(batchId);
            sv.setDeliveryItemId(itemId);
            sv.setScopeVersion(scopeVersion == null ? 0 : scopeVersion);
            sv.setBuildId(primaryBuildId);
            sv.setVerificationType(RdmConstants.SUPPLEMENTARY_TYPE_PRODUCT);
            sv.setVerifierUserId(verifierId);
            sv.setVerifierUserName(verifierName);
            sv.setDeadline(deadline);
            sv.setCalendarVersion(calendarVersion);
            sv.setStatus(RdmConstants.SUPPLEMENTARY_STATUS_PENDING);
            sv.setEscalated(0);
            sv.setEscalationLevel(0);
            sv.setVersion(0);
            sv.setCreatedBy(actorId);
            supplementaries.add(sv);
        }

        int applicationVersion = RdmReleaseFactService.nextApplicationVersion(batch);
        String buildMappingJson = JsonUtils.toJson(buildMappingRows(deployments));
        String supplementaryPlanJson = JsonUtils.toJson(plan);
        String missingJson = JsonUtils.toJson(missing);

        RdmReleaseExemption exemption = new RdmReleaseExemption();
        exemption.setReleaseBatchId(batchId);
        exemption.setApplicationVersion(applicationVersion);
        exemption.setApplicantUserId(actorId);
        exemption.setReason(dto.getReason().trim());
        exemption.setRisk(dto.getRisk().trim());
        exemption.setMissingAcceptanceJson(missingJson);
        exemption.setScopeSnapshotJson(text(batch.getScopeSnapshotJson()));
        exemption.setBuildMappingJson(buildMappingJson);
        exemption.setRollbackPlan(dto.getRollbackPlan().trim());
        exemption.setSupplementaryPlanJson(supplementaryPlanJson);
        exemption.setEvidenceHash(evidenceHash(batchId, applicationVersion, missingJson,
                buildMappingJson, supplementaryPlanJson, dto));
        exemption.setRequestId(text(requestId));
        exemptionMapper.insert(exemption);

        // exemptionId 由 DB 生成，補驗單須綁定它，故在 insert 之後回填並寫入
        for (RdmSupplementaryVerification sv : supplementaries) {
            sv.setExemptionId(exemption.getId());
            supplementaryMapper.insert(sv);
        }
        log.warn("緊急豁免已申請（僅豁免缺失的產品驗收，業務驗收不可豁免）: batchId={}, exemptionId={}, "
                        + "missing={}, supplementaryDays={}, applicant={}",
                batchId, exemption.getId(), missing.size(), days, actorName);
        return exemption;
    }

    /* ==================== 緊急豁免裁決（四眼） ==================== */

    /**
     * 豁免裁決（幂等入口）。
     * <p><b>四眼</b>：裁決人不得是豁免申請人本人，系統管理員亦無自批豁免；
     * {@code product_risk} 僅缺失項的產品驗收人可簽，{@code release} 須為項目成員。
     */
    public RdmReleaseExemptionDecision decideExemption(Long batchId, Long exemptionId,
                                                       RdmReleaseBatchDTO.ExemptionDecision dto,
                                                       Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(exemptionId),
                text(dto == null ? null : dto.getDecisionType()),
                text(dto == null ? null : dto.getDecision()),
                text(dto == null ? null : dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_EXEMPTION_DECISION)
                .resourceKey("exemption:" + exemptionId)
                .clientRequestId(deriveClientRequestId("exemptionDecision",
                        dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        return idempotentService.executeOnce(key,
                () -> doDecideExemption(batchId, exemptionId, dto, actorId, requestId),
                RdmReleaseExemptionDecision.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public RdmReleaseExemptionDecision doDecideExemption(Long batchId, Long exemptionId,
                                                         RdmReleaseBatchDTO.ExemptionDecision dto,
                                                         Long actorId, String requestId) {
        RdmReleaseExemption exemption = requireExemption(exemptionId);
        if (batchId != null && !batchId.equals(exemption.getReleaseBatchId())) {
            throw new BusinessException("豁免單不屬於該發布批次，拒絕裁決");
        }
        RdmReleaseBatch batch = requireBatch(exemption.getReleaseBatchId());
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), batch.getVersion(), "發布批次");

        String decisionType = dto == null ? null : trimToNull(dto.getDecisionType());
        if (!RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK.equals(decisionType)
                && !RdmConstants.EXEMPTION_DECISION_RELEASE.equals(decisionType)) {
            throw new BusinessException("非法的豁免裁決類型（僅 product_risk/release）: " + dto.getDecisionType());
        }
        String decision = trimToNull(dto.getDecision());
        if (!RdmConstants.DECISION_APPROVED.equals(decision) && !RdmConstants.DECISION_REJECTED.equals(decision)) {
            throw new BusinessException("非法的豁免裁決結果（僅 approved/rejected）: " + dto.getDecision());
        }
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("豁免屬例外授權，裁決必須填寫理由（可審計）");
        }
        // 四眼：與 release decide 同口徑 —— 無條件比對，管理員亦不得自批
        if (actorId.equals(exemption.getApplicantUserId())) {
            throw new BusinessException("四眼原則：緊急豁免裁決人不能是申請人本人（系統管理員亦不得自批）");
        }
        requireExemptionSigner(batch, exemption, decisionType, actorId);
        if (findDecision(exemptionId, decisionType) != null) {
            throw new BusinessException("該豁免單的「" + decisionType + "」裁決已存在，不可重複裁決");
        }

        RdmReleaseExemptionDecision row = new RdmReleaseExemptionDecision();
        row.setExemptionId(exemptionId);
        row.setDecisionType(decisionType);
        row.setDecision(decision);
        row.setReason(dto.getReason().trim());
        row.setSignerUserId(actorId);
        row.setEvidenceHash(text(exemption.getEvidenceHash()));
        row.setRequestId(text(requestId));
        exemptionDecisionMapper.insert(row);
        log.warn("緊急豁免裁決已留痕: exemptionId={}, type={}, decision={}, signer={}, batchNo={}",
                exemptionId, decisionType, decision, actorId, batch.getBatchNo());
        return row;
    }

    /** 豁免裁決資格：product_risk 僅缺失項的產品驗收人可簽（無 admin 直通）；release 須為項目成員。 */
    private void requireExemptionSigner(RdmReleaseBatch batch, RdmReleaseExemption exemption,
                                        String decisionType, Long actorId) {
        if (RdmConstants.EXEMPTION_DECISION_RELEASE.equals(decisionType)) {
            accessGuard.requireProjectMember(batch.getProjectId(), actorId);
            return;
        }
        Set<Long> acceptors = missingProductAcceptorIds(exemption);
        if (!acceptors.contains(actorId)) {
            throw new BusinessException("僅缺失產品驗收項的產品驗收人可以簽署產品風險裁決（管理員無代簽豁免）");
        }
    }

    /** 缺失項對應的產品驗收人集合（簽署資格來源，取自交付項權威字段而非客戶端傳參）。 */
    private Set<Long> missingProductAcceptorIds(RdmReleaseExemption exemption) {
        Set<Long> ids = new LinkedHashSet<>();
        for (Map<String, Object> row : JsonUtils.parseMapList(exemption.getMissingAcceptanceJson())) {
            Long itemId = toLong(row.get("deliveryItemId"));
            if (itemId == null) {
                continue;
            }
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item != null && item.getProductAcceptorUserId() != null) {
                ids.add(item.getProductAcceptorUserId());
            }
        }
        return ids;
    }

    /* ==================== 補驗完成登記 ==================== */

    /**
     * 補驗完成登記（幂等入口）。
     * <p>僅<b>指定補驗人本人</b>可登記（簽署類動作，無 admin 直通）；必須引用真實驗收記錄，
     * 且結論與 result 一致：pass→completed，fail→failed + 升級整改。
     */
    public RdmSupplementaryVerification completeSupplementary(Long supplementaryId,
                                                              RdmReleaseBatchDTO.SupplementaryComplete dto,
                                                              Long currentUserId, String currentUserName) {
        Long actorId = requireActor(currentUserId);
        String hash = idempotentService.stableRequestHash(List.of(
                String.valueOf(supplementaryId),
                String.valueOf(dto == null ? null : dto.getAcceptanceRecordId()),
                text(dto == null ? null : dto.getResult()),
                text(dto == null ? null : dto.getEvidenceJson())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(BIZ_SUPPLEMENTARY_COMPLETE)
                .resourceKey("supplementary:" + supplementaryId)
                .clientRequestId(deriveClientRequestId("supplementaryComplete",
                        dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        String requestId = RdmIdempotentService.bindingRequestId(key);
        return idempotentService.executeOnce(key,
                () -> doCompleteSupplementary(supplementaryId, dto, actorId, requestId),
                RdmSupplementaryVerification.class);
    }

    @Transactional(rollbackFor = Exception.class)
    public RdmSupplementaryVerification doCompleteSupplementary(Long supplementaryId,
                                                                RdmReleaseBatchDTO.SupplementaryComplete dto,
                                                                Long actorId, String requestId) {
        RdmSupplementaryVerification sv = requireSupplementary(supplementaryId);
        checkExpectedVersion(dto == null ? null : dto.getExpectedVersion(), sv.getVersion(), "補驗單");
        if (actorId == null || !actorId.equals(sv.getVerifierUserId())) {
            throw new BusinessException("僅本補驗單指定的補驗人可以登記補驗結果（管理員無代簽豁免）");
        }
        if (RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED.equals(sv.getStatus())
                || RdmConstants.SUPPLEMENTARY_STATUS_FAILED.equals(sv.getStatus())) {
            throw new BusinessException("補驗單已結束（" + sv.getStatus() + "），不可重複登記");
        }
        if (dto == null || dto.getAcceptanceRecordId() == null) {
            throw new BusinessException("補驗完成必須引用真實的驗收記錄ID");
        }
        String result = trimToNull(dto.getResult());
        if (!RdmConstants.SUPPLEMENTARY_RESULT_PASS.equals(result)
                && !RdmConstants.SUPPLEMENTARY_RESULT_FAIL.equals(result)) {
            throw new BusinessException("非法的補驗結果（僅 pass/fail）: " + dto.getResult());
        }
        RdmAcceptanceRecord record = acceptanceRecordMapper.selectById(dto.getAcceptanceRecordId());
        if (record == null) {
            throw new BusinessException("引用的驗收記錄不存在: id=" + dto.getAcceptanceRecordId());
        }
        if (!Objects.equals(record.getDeliveryItemId(), sv.getDeliveryItemId())) {
            throw new BusinessException("驗收記錄與補驗單不屬於同一交付項，拒絕登記");
        }
        if (!RdmConstants.ACCEPTANCE_TYPE_PRODUCT.equals(record.getAcceptanceType())) {
            throw new BusinessException("緊急補驗只針對產品驗收，引用的驗收記錄類型非法: "
                    + record.getAcceptanceType());
        }
        if (sv.getScopeVersion() != null && record.getScopeVersion() != null
                && !sv.getScopeVersion().equals(record.getScopeVersion())) {
            throw new BusinessException("驗收記錄的範圍版本（" + record.getScopeVersion()
                    + "）與補驗單凍結版本（" + sv.getScopeVersion() + "）不一致，拒絕登記");
        }
        boolean recordPassed = RdmConstants.ACCEPT_PASS.equals(record.getConclusion());
        if (RdmConstants.SUPPLEMENTARY_RESULT_PASS.equals(result) && !recordPassed) {
            throw new BusinessException("補驗結果 pass 必須對應驗收記錄結論 pass，當前結論: " + record.getConclusion());
        }
        if (RdmConstants.SUPPLEMENTARY_RESULT_FAIL.equals(result) && recordPassed) {
            throw new BusinessException("驗收記錄結論已為 pass，補驗結果不得登記為 fail");
        }

        sv.setResult(result);
        sv.setAcceptanceRecordId(record.getId());
        sv.setEvidenceJson(StringUtils.hasText(dto.getEvidenceJson())
                ? dto.getEvidenceJson()
                : JsonUtils.toJson(Map.of(
                        "acceptanceRecordId", record.getId(),
                        "recordNo", record.getRecordNo() == null ? "" : record.getRecordNo(),
                        "conclusion", record.getConclusion() == null ? "" : record.getConclusion(),
                        "signerUserId", record.getSignerUserId() == null ? 0L : record.getSignerUserId(),
                        "requestId", requestId == null ? "" : requestId)));
        sv.setCompletedAt(LocalDateTime.now());
        sv.setCompletedBy(actorId);
        boolean passed = RdmConstants.SUPPLEMENTARY_RESULT_PASS.equals(result);
        sv.setStatus(passed ? RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED
                : RdmConstants.SUPPLEMENTARY_STATUS_FAILED);
        if (!passed) {
            // 補驗失敗 → 立即升級整改：未驗收不得開放，且不得靜默留在 pending 讓批次悄悄放過
            sv.setEscalated(1);
            sv.setEscalatedAt(LocalDateTime.now());
            int overdue = overdueWorkingDays(sv);
            sv.setEscalationLevel(Math.max(1, escalationLevel(overdue)));
        }
        supplementaryMapper.updateById(sv);
        log.warn("補驗結果已登記: supplementaryId={}, itemId={}, result={}, status={}, verifier={}",
                sv.getId(), sv.getDeliveryItemId(), result, sv.getStatus(), actorId);
        return sv;
    }

    /* ==================== 逾期刷新（不用 cron） ==================== */

    /**
     * 刷新批次下 pending 補驗單的逾期狀態（讀路徑 / 開放門禁前調用，<b>不依賴 cron</b>）。
     * <p>逾期判定用 {@link RdmWorkingDayCalculator#overdueWorkingDays}：按<b>補驗人真實工作日曆</b>計算，
     * 請假 / 周末支援 / 按人例外都被正確計入，避免「周五到期、周一才看」被誤判或漏判。
     *
     * @return 本次新標記為逾期的補驗單數
     */
    @Transactional(rollbackFor = Exception.class)
    public int refreshOverdue(Long batchId) {
        if (batchId == null) {
            return 0;
        }
        LocalDate today = LocalDate.now();
        int marked = 0;
        for (RdmSupplementaryVerification sv : listSupplementaries(batchId)) {
            if (!RdmConstants.SUPPLEMENTARY_STATUS_PENDING.equals(sv.getStatus())) {
                continue;
            }
            int overdue = overdueWorkingDays(sv, today);
            if (overdue <= 0) {
                continue;
            }
            sv.setStatus(RdmConstants.SUPPLEMENTARY_STATUS_OVERDUE);
            sv.setEscalated(1);
            if (sv.getEscalatedAt() == null) {
                sv.setEscalatedAt(LocalDateTime.now());
            }
            sv.setEscalationLevel(Math.max(sv.getEscalationLevel() == null ? 0 : sv.getEscalationLevel(),
                    escalationLevel(overdue)));
            supplementaryMapper.updateById(sv);
            marked++;
            log.warn("產品補驗已逾期（按真實工作日曆）: supplementaryId={}, itemId={}, deadline={}, "
                            + "overdueWorkingDays={}, escalationLevel={}",
                    sv.getId(), sv.getDeliveryItemId(), sv.getDeadline(), overdue, sv.getEscalationLevel());
        }
        return marked;
    }

    /** 按真實工作日曆計算已逾期工作日數（未逾期為 0）。 */
    public int overdueWorkingDays(RdmSupplementaryVerification sv) {
        return overdueWorkingDays(sv, LocalDate.now());
    }

    private int overdueWorkingDays(RdmSupplementaryVerification sv, LocalDate today) {
        if (sv == null || sv.getDeadline() == null) {
            return 0;
        }
        try {
            return workingDayCalculator.overdueWorkingDays(sv.getDeadline().toLocalDate(), today,
                    sv.getVerifierUserId());
        } catch (Exception e) {
            // 日曆讀取異常時退化為自然日比較，仍保守判逾期（不因異常而放過逾期）
            log.warn("讀取補驗人工作日曆異常，退化為自然日判定逾期: supplementaryId={}", sv.getId(), e);
            return today.isAfter(sv.getDeadline().toLocalDate()) ? 1 : 0;
        }
    }

    /** 逾期升級級別：L1=1 個工作日、L2=3 個、L3=5 個（封頂 {@code ESCALATION_LEVEL_MAX}）。 */
    public static int escalationLevel(int overdueWorkingDays) {
        if (overdueWorkingDays >= RdmConstants.ESCALATION_L3_OVERDUE_DAYS) {
            return RdmConstants.ESCALATION_LEVEL_MAX;
        }
        if (overdueWorkingDays >= RdmConstants.ESCALATION_L2_OVERDUE_DAYS) {
            return 2;
        }
        if (overdueWorkingDays >= RdmConstants.ESCALATION_L1_OVERDUE_DAYS) {
            return 1;
        }
        return 0;
    }

    /* ==================== 門禁查詢（供 Gate / 開放動作復用） ==================== */

    /**
     * 產品驗收是否已<b>真實建立</b>（開放門禁用）。
     * <p>= 當前 scopeVersion 下最新有效產品驗收結論=pass，<b>或</b>補驗單已 completed 且 result=pass。
     * pending / overdue / failed 一律不算 —— 緊急豁免<b>不豁免開放</b>。
     */
    public boolean isProductAcceptanceEstablished(Long deliveryItemId, Integer scopeVersion) {
        if (deliveryItemId == null) {
            return false;
        }
        if (acceptanceRecordService.hasProductAcceptancePassed(deliveryItemId, scopeVersion)) {
            return true;
        }
        Long count = supplementaryMapper.selectCount(new LambdaQueryWrapper<RdmSupplementaryVerification>()
                .eq(RdmSupplementaryVerification::getDeliveryItemId, deliveryItemId)
                .eq(scopeVersion != null, RdmSupplementaryVerification::getScopeVersion, scopeVersion)
                .eq(RdmSupplementaryVerification::getVerificationType, RdmConstants.SUPPLEMENTARY_TYPE_PRODUCT)
                .eq(RdmSupplementaryVerification::getStatus, RdmConstants.SUPPLEMENTARY_STATUS_COMPLETED)
                .eq(RdmSupplementaryVerification::getResult, RdmConstants.SUPPLEMENTARY_RESULT_PASS));
        return count != null && count > 0;
    }

    /**
     * 最新豁免單是否<b>當前生效</b>。
     * <p>生效 = product_risk 與 release 兩類裁決均 approved，<b>且</b>豁免凍結的範圍版本與構建映射
     * 與當前事實<b>完全一致</b>。不按 applicationVersion 匹配：範圍或構建一旦變化，
     * 豁免即自動失效（必須重新申請），避免「按舊風險評估放行新代碼」。
     */
    public boolean isExemptionEffective(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments) {
        RdmReleaseExemption exemption = batch == null ? null : latestExemption(batch.getId());
        if (exemption == null || isFullyRejected(exemption)) {
            return false;
        }
        List<RdmReleaseExemptionDecision> decisions = listDecisions(exemption.getId());
        boolean productRiskApproved = decisions.stream()
                .anyMatch(d -> RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK.equals(d.getDecisionType())
                        && RdmConstants.DECISION_APPROVED.equals(d.getDecision()));
        boolean releaseApproved = decisions.stream()
                .anyMatch(d -> RdmConstants.EXEMPTION_DECISION_RELEASE.equals(d.getDecisionType())
                        && RdmConstants.DECISION_APPROVED.equals(d.getDecision()));
        if (!productRiskApproved || !releaseApproved) {
            return false;
        }
        return isScopeAndBuildUnchanged(exemption, deployments);
    }

    /**
     * 指定交付項缺失的產品驗收是否被生效豁免所覆蓋。
     * <p>三個條件同時成立才算：豁免生效 + 該項在缺失清單內 + 清單凍結的 scopeVersion 與當前一致。
     */
    public boolean isProductAcceptanceWaived(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments,
                                             Long deliveryItemId, Integer scopeVersion) {
        if (deliveryItemId == null || !isExemptionEffective(batch, deployments)) {
            return false;
        }
        RdmReleaseExemption exemption = latestExemption(batch.getId());
        for (Map<String, Object> row : JsonUtils.parseMapList(exemption.getMissingAcceptanceJson())) {
            Long itemId = toLong(row.get("deliveryItemId"));
            Integer frozen = toInt(row.get("scopeVersion"));
            if (deliveryItemId.equals(itemId) && Objects.equals(frozen, scopeVersion)) {
                return true;
            }
        }
        return false;
    }

    /** 豁免凍結的範圍版本與構建映射是否與當前事實完全一致。 */
    private boolean isScopeAndBuildUnchanged(RdmReleaseExemption exemption,
                                             List<RdmReleaseDeployment> deployments) {
        Map<Long, Integer> frozenVersions = RdmReleaseFactService.snapshotScopeVersions(exemption.getScopeSnapshotJson());
        if (frozenVersions.isEmpty()) {
            return false;
        }
        for (Map.Entry<Long, Integer> e : frozenVersions.entrySet()) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(e.getKey());
            if (item == null || !Objects.equals(e.getValue(), item.getScopeVersion())) {
                log.info("豁免已失效：範圍版本變化 itemId={}, frozen={}, current={}",
                        e.getKey(), e.getValue(), item == null ? null : item.getScopeVersion());
                return false;
            }
        }
        Map<String, String> frozenBuilds = new LinkedHashMap<>();
        for (Map<String, Object> row : JsonUtils.parseMapList(exemption.getBuildMappingJson())) {
            Object code = row.get("systemCode");
            Object build = row.get("buildId");
            if (code != null) {
                frozenBuilds.put(String.valueOf(code), build == null ? null : String.valueOf(build));
            }
        }
        Map<String, String> currentBuilds = new LinkedHashMap<>();
        for (RdmReleaseDeployment dep : deployments == null ? List.<RdmReleaseDeployment>of() : deployments) {
            if (dep != null && dep.getSystemCode() != null) {
                currentBuilds.put(dep.getSystemCode(), dep.getBuildId());
            }
        }
        if (!Objects.equals(frozenBuilds, currentBuilds)) {
            log.info("豁免已失效：構建映射變化 frozen={}, current={}", frozenBuilds, currentBuilds);
            return false;
        }
        return true;
    }

    /**
     * 服務端計算「缺失的產品驗收」清單，並<b>硬性拒絕</b>任何缺失的業務驗收。
     * <p>業務驗收永不可豁免：路徑A 缺業務驗收 → 直接拋錯；路徑B 的業務驗收本就在上線後，不屬缺失。
     */
    public List<Map<String, Object>> computeMissingProductAcceptance(RdmReleaseBatch batch,
                                                                    List<RdmReleaseDeployment> deployments) {
        List<Map<String, Object>> missing = new ArrayList<>();
        Map<String, String> builds = new LinkedHashMap<>();
        for (RdmReleaseDeployment dep : deployments == null ? List.<RdmReleaseDeployment>of() : deployments) {
            if (dep != null && dep.getSystemCode() != null) {
                builds.put(dep.getSystemCode(), dep.getBuildId());
            }
        }
        for (Map<String, Object> row : JsonUtils.parseMapList(batch.getScopeSnapshotJson())) {
            Long itemId = toLong(row.get("deliveryItemId"));
            if (itemId == null) {
                continue;
            }
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item == null) {
                throw new BusinessException("交付項不存在或已刪除，無法判定驗收缺失: id=" + itemId);
            }
            Integer scopeVersion = item.getScopeVersion();
            String path = StringUtils.hasText(item.getAcceptancePath())
                    ? item.getAcceptancePath() : (String) row.get("acceptancePath");
            if (RdmConstants.PATH_A.equals(path)
                    && !acceptanceRecordService.hasBizAcceptancePassed(itemId, scopeVersion)) {
                throw new BusinessException("業務驗收永不可豁免：交付項「" + item.getTitle()
                        + "」為路徑A 且業務驗收未通過，禁止走緊急豁免，請先完成業務驗收");
            }
            if (!acceptanceRecordService.hasProductAcceptancePassed(itemId, scopeVersion)) {
                Map<String, Object> miss = new LinkedHashMap<>();
                miss.put("deliveryItemId", itemId);
                miss.put("itemNo", item.getItemNo());
                miss.put("title", item.getTitle());
                miss.put("scopeVersion", scopeVersion);
                miss.put("acceptancePath", path);
                miss.put("missingType", RdmConstants.ACCEPTANCE_TYPE_PRODUCT);
                miss.put("buildMapping", builds);
                missing.add(miss);
            }
        }
        return missing;
    }

    /* ==================== 查詢投影 ==================== */

    /** 最新一份豁免單（按 id 降序；無則 null）。 */
    public RdmReleaseExemption latestExemption(Long batchId) {
        if (batchId == null) {
            return null;
        }
        return exemptionMapper.selectOne(new LambdaQueryWrapper<RdmReleaseExemption>()
                .eq(RdmReleaseExemption::getReleaseBatchId, batchId)
                .orderByDesc(RdmReleaseExemption::getId)
                .last("LIMIT 1"));
    }

    /** 批次全部豁免單（按 id 升序，供詳情審計展示）。 */
    public List<RdmReleaseExemption> listExemptions(Long batchId) {
        if (batchId == null) {
            return List.of();
        }
        List<RdmReleaseExemption> rows = exemptionMapper.selectList(new LambdaQueryWrapper<RdmReleaseExemption>()
                .eq(RdmReleaseExemption::getReleaseBatchId, batchId)
                .orderByAsc(RdmReleaseExemption::getId));
        return rows == null ? List.of() : rows;
    }

    /** 豁免單的全部裁決留痕（按 id 升序）。 */
    public List<RdmReleaseExemptionDecision> listDecisions(Long exemptionId) {
        if (exemptionId == null) {
            return List.of();
        }
        List<RdmReleaseExemptionDecision> rows = exemptionDecisionMapper.selectList(
                new LambdaQueryWrapper<RdmReleaseExemptionDecision>()
                        .eq(RdmReleaseExemptionDecision::getExemptionId, exemptionId)
                        .orderByAsc(RdmReleaseExemptionDecision::getId));
        return rows == null ? List.of() : rows;
    }

    /** 批次全部補驗單（按 id 升序）。 */
    public List<RdmSupplementaryVerification> listSupplementaries(Long batchId) {
        if (batchId == null) {
            return List.of();
        }
        List<RdmSupplementaryVerification> rows = supplementaryMapper.selectList(
                new LambdaQueryWrapper<RdmSupplementaryVerification>()
                        .eq(RdmSupplementaryVerification::getReleaseBatchId, batchId)
                        .orderByAsc(RdmSupplementaryVerification::getId));
        return rows == null ? List.of() : rows;
    }

    /** 豁免單的裁決是否齊備且均 approved（供詳情投影）。 */
    public boolean isBothDecisionsApproved(Long exemptionId) {
        List<RdmReleaseExemptionDecision> decisions = listDecisions(exemptionId);
        return decisions.stream().anyMatch(d ->
                        RdmConstants.EXEMPTION_DECISION_PRODUCT_RISK.equals(d.getDecisionType())
                                && RdmConstants.DECISION_APPROVED.equals(d.getDecision()))
                && decisions.stream().anyMatch(d ->
                        RdmConstants.EXEMPTION_DECISION_RELEASE.equals(d.getDecisionType())
                                && RdmConstants.DECISION_APPROVED.equals(d.getDecision()));
    }

    /* ==================== 私有輔助 ==================== */

    private boolean isFullyRejected(RdmReleaseExemption exemption) {
        List<RdmReleaseExemptionDecision> decisions = listDecisions(exemption.getId());
        if (decisions.isEmpty()) {
            return false;
        }
        return decisions.stream().allMatch(d -> RdmConstants.DECISION_REJECTED.equals(d.getDecision()));
    }

    private RdmReleaseExemptionDecision findDecision(Long exemptionId, String decisionType) {
        return exemptionDecisionMapper.selectOne(new LambdaQueryWrapper<RdmReleaseExemptionDecision>()
                .eq(RdmReleaseExemptionDecision::getExemptionId, exemptionId)
                .eq(RdmReleaseExemptionDecision::getDecisionType, decisionType)
                .orderByDesc(RdmReleaseExemptionDecision::getId)
                .last("LIMIT 1"));
    }

    private List<RdmReleaseDeployment> listDeployments(Long batchId) {
        List<RdmReleaseDeployment> rows = deploymentMapper.selectList(
                new LambdaQueryWrapper<RdmReleaseDeployment>()
                        .eq(RdmReleaseDeployment::getReleaseBatchId, batchId)
                        .orderByAsc(RdmReleaseDeployment::getDeployOrder)
                        .orderByAsc(RdmReleaseDeployment::getId));
        return rows == null ? List.of() : rows;
    }

    /**
     * 補驗綁定的構建標識：取部署順序最前的系統構建（{@code build_id} NOT NULL）。
     * <p>一個交付項可能跨多系統，補驗事實只記錄「在哪個構建上補驗」，以首批部署構建為準並寫入計劃 JSON 供審計。
     */
    private String primaryBuildId(List<RdmReleaseDeployment> deployments) {
        return deployments.stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(RdmReleaseDeployment::getDeployOrder,
                        Comparator.nullsLast(Comparator.<Integer>naturalOrder())))
                .map(RdmReleaseDeployment::getBuildId)
                .filter(StringUtils::hasText)
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        "部署清單缺少構建標識（buildId），無法凍結補驗事實，請先補全構建標識"));
    }

    private static List<Map<String, Object>> buildMappingRows(List<RdmReleaseDeployment> deployments) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (RdmReleaseDeployment dep : deployments == null ? List.<RdmReleaseDeployment>of() : deployments) {
            if (dep == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("systemCode", dep.getSystemCode());
            row.put("buildId", dep.getBuildId());
            rows.add(row);
        }
        rows.sort(Comparator.comparing(r -> String.valueOf(r.get("systemCode"))));
        return rows;
    }

    private Map<Long, RdmReleaseBatchDTO.SupplementaryPlanItem> planOverrides(RdmReleaseBatchDTO.Exemption dto) {
        Map<Long, RdmReleaseBatchDTO.SupplementaryPlanItem> map = new LinkedHashMap<>();
        if (dto == null || dto.getSupplementaryPlan() == null) {
            return map;
        }
        for (RdmReleaseBatchDTO.SupplementaryPlanItem p : dto.getSupplementaryPlan()) {
            if (p != null && p.getDeliveryItemId() != null) {
                map.put(p.getDeliveryItemId(), p);
            }
        }
        return map;
    }

    private static String evidenceHash(Long batchId, Integer applicationVersion, String missingJson,
                                       String buildMappingJson, String supplementaryPlanJson,
                                       RdmReleaseBatchDTO.Exemption dto) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", 1);
        payload.put("kind", "release-exemption");
        payload.put("batchId", batchId);
        payload.put("applicationVersion", applicationVersion);
        payload.put("reason", dto.getReason().trim());
        payload.put("risk", dto.getRisk().trim());
        payload.put("rollbackPlan", dto.getRollbackPlan().trim());
        payload.put("missingAcceptance", JsonUtils.parseMapList(missingJson));
        payload.put("buildMapping", JsonUtils.parseMapList(buildMappingJson));
        payload.put("supplementaryPlan", JsonUtils.parseMapList(supplementaryPlanJson));
        return RdmIdempotentService.sha256Hex(JsonUtils.toJson(payload));
    }

    private RdmReleaseBatch requireBatch(Long batchId) {
        RdmReleaseBatch batch = batchId == null ? null : batchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException("發布批次不存在或已刪除");
        }
        return batch;
    }

    private RdmReleaseExemption requireExemption(Long exemptionId) {
        RdmReleaseExemption exemption = exemptionId == null ? null : exemptionMapper.selectById(exemptionId);
        if (exemption == null) {
            throw new BusinessException("緊急豁免單不存在或已刪除");
        }
        return exemption;
    }

    private RdmSupplementaryVerification requireSupplementary(Long supplementaryId) {
        RdmSupplementaryVerification sv = supplementaryId == null
                ? null : supplementaryMapper.selectById(supplementaryId);
        if (sv == null) {
            throw new BusinessException("補驗單不存在或已刪除");
        }
        return sv;
    }

    /** 身份必須來自認證主體（SysUser.id）：為空即登錄態失效，fail-closed。 */
    private Long requireActor(Long currentUserId) {
        if (currentUserId != null) {
            return currentUserId;
        }
        Long resolved = operatorResolver.currentUser() == null ? null : operatorResolver.currentUser().getId();
        if (resolved == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return resolved;
    }

    private static void checkExpectedVersion(Integer expected, Integer actual, String what) {
        if (expected == null) {
            return;
        }
        if (actual == null || !expected.equals(actual)) {
            throw new BusinessException(what + "已被他人修改（版本不一致），請刷新後重試");
        }
    }

    /**
     * 幂等 clientRequestId：優先客戶端 requestId，否則用服務端派生判別子。
     * <p><b>必須適配 {@code rdm_idempotent_log.client_request_id VARCHAR(64) ascii}</b>：
     * 派生判別子本身就是 64 位 hex，與 op 前綴（如 {@code supplementaryComplete}）拼接後會超出列寬；
     * 因此超長或含非 ASCII 字符時統一再取一次 SHA-256，得到定長 64 位 ASCII 值，
     * 且保持「同 op 同內容 → 同 id」的幂等語義不變。
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

    private static String text(String value) {
        return value == null ? "" : value;
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
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
}
