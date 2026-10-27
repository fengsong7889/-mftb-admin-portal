package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmReleaseAttempt;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.mapper.RdmReleaseAttemptMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * RDM「開放事實」（open fact）只讀判定服務（任務27）。
 *
 * <p>路徑B（先上線後業務驗收）的 {@code post_release} 業務驗收必須 gate 在<b>真實開放事實</b>之後，
 * 否則「上線後驗收」會退化成紙面流程。任務20 在
 * {@code RdmAcceptanceRecordService#isOpenFactEstablished} 留了保守恒 false 的協調點，
 * 本服務提供真實判定並由其<b>委託</b>（不改其 protected 簽名與門禁編排）。
 *
 * <p><b>開放事實成立的四個必要條件（缺一即 false，fail-closed）</b>：
 * <ol>
 *   <li>存在 {@code status=released} 的發布批次，且其範圍快照 {@code scopeSnapshotJson} 精確包含該交付項；</li>
 *   <li>該批次下存在 {@code open_status=opened} 的部署記錄；</li>
 *   <li>該部署記錄存在<b>追加式</b>嘗試事實 {@code action=open, result=opened}
 *       （開放是獨立動作，絕不由「驗證通過」推導）；</li>
 *   <li>該部署記錄上<b>沒有更晚的</b> {@code action=rollback} 嘗試事實
 *       —— 回滾撤銷開放事實，使路徑B 的上線後業務驗收被重新門禁。</li>
 * </ol>
 *
 * <p>條件1 與條件4 構成<b>雙層保證</b>：回滾會把批次置為 {@code rolled_back}，
 * 批次層已不再命中；即便未來出現「部分回滾但批次仍 released」的演進，
 * 部署層的「更晚 rollback 嘗試」仍會把開放事實撤銷。
 *
 * <p>本服務<b>只讀</b>，不寫任何表，因此可被驗收鏈路安全依賴而無循環事務風險。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmOpenFactService {

    /** 範圍快照中交付項 ID 的 JSON 片段前綴，用於把候選批次收斂到極小集合（精確性由後續 JSON 解析保證）。 */
    private static final String SCOPE_ITEM_JSON_HINT = "\"deliveryItemId\":";

    private final RdmReleaseBatchMapper batchMapper;
    private final RdmReleaseDeploymentMapper deploymentMapper;
    private final RdmReleaseAttemptMapper attemptMapper;

    /**
     * 交付項是否已建立真實「開放事實」。
     *
     * @param deliveryItemId 交付項 ID；null 一律 false（fail-closed）
     * @return true 表示已上線且已開放且未被回滾撤銷
     */
    public boolean isOpenFactEstablished(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return false;
        }
        for (RdmReleaseBatch batch : candidateReleasedBatches(deliveryItemId)) {
            if (!scopeContainsItem(batch.getScopeSnapshotJson(), deliveryItemId)) {
                continue;
            }
            if (isBatchOpened(batch.getId())) {
                log.debug("開放事實成立: deliveryItemId={}, batchId={}, batchNo={}",
                        deliveryItemId, batch.getId(), batch.getBatchNo());
                return true;
            }
        }
        return false;
    }

    /**
     * 批次是否已建立開放事實（供發布詳情/開放門禁復用同一口徑）。
     * <p>不校驗批次狀態與範圍歸屬，僅看「任一部署已開放 + 存在 open 追加事實 + 無更晚 rollback」。
     */
    public boolean isBatchOpened(Long releaseBatchId) {
        if (releaseBatchId == null) {
            return false;
        }
        List<RdmReleaseDeployment> deployments = deploymentMapper.selectList(
                new LambdaQueryWrapper<RdmReleaseDeployment>()
                        .eq(RdmReleaseDeployment::getReleaseBatchId, releaseBatchId));
        if (deployments == null || deployments.isEmpty()) {
            return false;
        }
        List<RdmReleaseAttempt> attempts = attemptMapper.selectList(
                new LambdaQueryWrapper<RdmReleaseAttempt>()
                        .eq(RdmReleaseAttempt::getReleaseBatchId, releaseBatchId));
        for (RdmReleaseDeployment dep : deployments) {
            if (dep == null || dep.getId() == null) {
                continue;
            }
            if (isDeploymentOpened(dep, attempts)) {
                return true;
            }
        }
        log.debug("批次尚無已開放的部署: batchId={}", releaseBatchId);
        return false;
    }

    /** 單個部署記錄是否構成開放事實：投影已開放 + 存在 open/opened 追加事實 + 無更晚的 rollback 事實。 */
    private boolean isDeploymentOpened(RdmReleaseDeployment dep, List<RdmReleaseAttempt> batchAttempts) {
        if (!RdmConstants.OPEN_STATUS_OPENED.equals(dep.getOpenStatus())) {
            return false;
        }
        RdmReleaseAttempt openFact = batchAttempts.stream()
                .filter(a -> a != null && dep.getId().equals(a.getDeploymentId()))
                .filter(a -> RdmConstants.ATTEMPT_ACTION_OPEN.equals(a.getAction()))
                .filter(a -> RdmConstants.ATTEMPT_RESULT_OPENED.equals(a.getResult()))
                .max(FACT_ORDER)
                .orElse(null);
        if (openFact == null) {
            // 投影說開放了卻沒有追加事實：以追加事實為準（不可變事實優先於可覆寫投影）
            log.warn("部署投影為已開放但缺少 open 追加事實，按未開放處理: deploymentId={}", dep.getId());
            return false;
        }
        boolean rolledBackAfter = batchAttempts.stream()
                .filter(a -> a != null && dep.getId().equals(a.getDeploymentId()))
                .filter(a -> RdmConstants.ATTEMPT_ACTION_ROLLBACK.equals(a.getAction()))
                .anyMatch(a -> FACT_ORDER.compare(a, openFact) > 0);
        if (rolledBackAfter) {
            log.info("開放事實已被更晚的回滾撤銷: deploymentId={}, openAttemptId={}", dep.getId(), openFact.getId());
            return false;
        }
        return true;
    }

    /** 候選批次：僅 {@code released} 且範圍快照可能包含該交付項（回滾後的批次天然不命中）。 */
    private List<RdmReleaseBatch> candidateReleasedBatches(Long deliveryItemId) {
        List<RdmReleaseBatch> rows = batchMapper.selectList(new LambdaQueryWrapper<RdmReleaseBatch>()
                .eq(RdmReleaseBatch::getStatus, RdmConstants.RB_RELEASED)
                .like(RdmReleaseBatch::getScopeSnapshotJson, SCOPE_ITEM_JSON_HINT + deliveryItemId)
                .orderByDesc(RdmReleaseBatch::getId));
        return rows == null ? List.of() : rows;
    }

    /** 精確校驗範圍快照是否包含該交付項（LIKE 只是預篩，500 不得命中 5001）。 */
    private boolean scopeContainsItem(String scopeSnapshotJson, Long deliveryItemId) {
        return JsonUtils.parseMapList(scopeSnapshotJson).stream()
                .map(row -> toLong(row.get("deliveryItemId")))
                .filter(Objects::nonNull)
                .anyMatch(deliveryItemId::equals);
    }

    /**
     * 追加式事實的先後全序：先比 {@code occurredAt}，同刻（或同時為空）退化比自增 {@code id}。
     * <p>不用字串鍵比較：{@code LocalDateTime#toString()} 會省略零秒，字典序在邊界上不等价於時間序。
     */
    private static final Comparator<RdmReleaseAttempt> FACT_ORDER = Comparator
            .comparing(RdmReleaseAttempt::getOccurredAt,
                    Comparator.nullsFirst(Comparator.<LocalDateTime>naturalOrder()))
            .thenComparing(RdmReleaseAttempt::getId,
                    Comparator.nullsFirst(Comparator.<Long>naturalOrder()));

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

    /** 供詳情投影使用：批次範圍快照中的交付項 ID 列表（只讀）。 */
    public List<Long> scopeItemIds(String scopeSnapshotJson) {
        return JsonUtils.parseMapList(scopeSnapshotJson).stream()
                .map(row -> toLong(row.get("deliveryItemId")))
                .filter(Objects::nonNull)
                .toList();
    }

    /** 供詳情投影使用：範圍快照行（只讀，保持原順序）。 */
    public List<Map<String, Object>> scopeRows(String scopeSnapshotJson) {
        return JsonUtils.parseMapList(scopeSnapshotJson);
    }
}
