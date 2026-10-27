package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmReleaseApproval;
import com.mftb.admin.entity.RdmReleaseAttempt;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.mapper.RdmReleaseApprovalMapper;
import com.mftb.admin.mapper.RdmReleaseAttemptMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * RDM 發布<b>不可變事實</b>服務（任務27）：追加式嘗試事實 + 放行裁決留痕 + 證據快照/哈希的穩定構建。
 *
 * <p>三條不可讓的口徑：
 * <ol>
 *   <li><b>只追加不覆蓋</b>：{@code rdm_release_attempt} 每次部署/驗證/開放/回滾都新增一行，
 *       {@code attempt_no} 按 (deploymentId, action) 遞增（滿足 {@code ck_rdm_attempt_no} 與
 *       {@code uk(deployment_id, action, attempt_no)}），歷史永久留痕，投影表
 *       {@code rdm_release_deployment} 只是當前態的<b>可覆寫視圖</b>；</li>
 *   <li><b>無批准不得有事實</b>：{@code rdm_release_attempt.approval_id} 是 NOT NULL 外鍵，
 *       結構上強制「先有 approved 裁決行，才可能有部署/驗證/開放事實」，
 *       因此 {@link #requireApprovedDecision} 是每個發布動作的必經步驟；</li>
 *   <li><b>證據可重算</b>：{@link #evidenceHash} 由範圍項事實 + 構建映射 + 申請版本穩定推導，
 *       申請時凍結、後續每個動作重算比對；範圍/測試/驗收/缺陷/構建任一變化都會令哈希不同，
 *       從而使既有放行申請自動失效（必須重新申請），杜絕「按舊證據放行、上新範圍代碼」。</li>
 * </ol>
 *
 * <p>本類<b>不依賴</b> Gate / Exemption 服務（僅依賴 Mapper），供其上層復用，避免循環依賴。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmReleaseFactService {

    /** 證據結構版本：一旦證據字段口徑變化必須升版，令舊哈希自然失效而不是誤判為「證據未變」。 */
    private static final int EVIDENCE_SCHEMA_VERSION = 1;

    private final RdmReleaseAttemptMapper attemptMapper;
    private final RdmReleaseApprovalMapper approvalMapper;

    /* ==================== 證據模型 ==================== */

    /**
     * 範圍交付項的門禁事實（申請時凍結、後續動作重算比對）。
     * <p>字段全部參與證據哈希：任一事實翻轉（例如新增阻斷缺陷、範圍升版、驗收被失效）都會令放行申請失效。
     */
    @Data
    public static class ItemEvidence {
        private Long deliveryItemId;
        private String itemNo;
        private String title;
        /** 交付項<b>當前</b>範圍版本（與申請快照凍結值比對即範圍一致性判定） */
        private Integer scopeVersion;
        private String acceptancePath;
        private String itemStatus;
        private boolean testPassed;
        private boolean productAccepted;
        private boolean businessAccepted;
        private boolean blockingIssue;
    }

    /** 系統 → 構建映射事實（構建一旦批准即不可變）。 */
    @Data
    public static class BuildEvidence {
        private String systemCode;
        private String buildId;

        public BuildEvidence() {
        }

        public BuildEvidence(String systemCode, String buildId) {
            this.systemCode = systemCode;
            this.buildId = buildId;
        }
    }

    /** 追加式嘗試事實的寫入草稿（列多為 NOT NULL，缺任一項直接在服務層 fail-fast，不留到 DB 報錯）。 */
    @Data
    public static class AttemptDraft {
        private Long releaseBatchId;
        private Long deploymentId;
        /** deploy/verify/open/rollback */
        private String action;
        /** 結果取值見 {@code RdmConstants.ATTEMPT_RESULT_*} */
        private String result;
        /** 已批准的構建標識（不可由客戶端覆寫） */
        private String buildId;
        /** 已批准裁決行 ID（NOT NULL 外鍵：無批准不得有事實） */
        private Long approvalId;
        private String scopeSnapshotJson;
        private String evidenceJson;
        private String evidenceHash;
        private String reason;
        private Long operatorUserId;
        /** 幂等綁定 requestId（64 位 hex） */
        private String requestId;
    }

    /* ==================== 證據快照與哈希 ==================== */

    /**
     * 下一個「申請版本」（applicationVersion）：{@code max(version, applicationVersion) + 1}。
     * <p>applicationVersion 是<b>並發版本快照</b>（非業務範圍版本 scopeVersion），用於
     * {@code uk(release_batch_id, application_version, action)} 將一輪申請/裁決留痕綁定到同一版本。
     * <p>取 max 而非單取 version：豁免可能在 apply 之前或之後發起，兩種順序下都不得撞唯一鍵，
     * 且不得回退到已用過的版本號。
     */
    public static int nextApplicationVersion(RdmReleaseBatch batch) {
        int concurrencyVersion = batch == null || batch.getVersion() == null ? 0 : batch.getVersion();
        int applicationVersion = batch == null || batch.getApplicationVersion() == null
                ? 0 : batch.getApplicationVersion();
        return Math.max(concurrencyVersion, applicationVersion) + 1;
    }

    /**
     * 構建申請/裁決快照 JSON（稳定字段序：交付項按 id 升序、構建映射按 systemCode 升序）。
     * <p>該 JSON 同時寫入 {@code rdm_release_batch.application_snapshot_json}、
     * {@code approval_snapshot_json} 與 {@code rdm_release_approval.snapshot_json}，是審計的凍結證據。
     */
    public static String buildSnapshotJson(Long batchId, String batchNo, String versionTag,
                                           Integer applicationVersion,
                                           List<ItemEvidence> items, List<BuildEvidence> builds) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("schemaVersion", EVIDENCE_SCHEMA_VERSION);
        snapshot.put("batchId", batchId);
        snapshot.put("batchNo", batchNo);
        snapshot.put("versionTag", versionTag);
        snapshot.put("applicationVersion", applicationVersion);
        snapshot.put("items", itemRows(items));
        snapshot.put("buildMapping", buildRows(builds));
        return JsonUtils.toJson(snapshot);
    }

    /**
     * 證據哈希：對「申請版本 + 範圍項事實 + 構建映射」做穩定序列化後取 SHA-256。
     * <p>用 JSON 而非分隔符拼接：交付項標題可能含任意字符，拼接式規範串存在注入歧義風險。
     */
    public static String evidenceHash(Integer applicationVersion,
                                      List<ItemEvidence> items, List<BuildEvidence> builds) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", EVIDENCE_SCHEMA_VERSION);
        payload.put("applicationVersion", applicationVersion);
        payload.put("items", itemRows(items));
        payload.put("buildMapping", buildRows(builds));
        return RdmIdempotentService.sha256Hex(JsonUtils.toJson(payload));
    }

    /** 從已凍結的快照 JSON 反解構建映射（systemCode → buildId），供「構建不可變」校驗使用。 */
    public static Map<String, String> approvedBuildMapping(String snapshotJson) {
        Map<String, Object> snapshot = JsonUtils.parseMap(snapshotJson);
        Object raw = snapshot.get("buildMapping");
        Map<String, String> mapping = new LinkedHashMap<>();
        if (!(raw instanceof List<?> list)) {
            return mapping;
        }
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> row)) {
                continue;
            }
            Object code = row.get("systemCode");
            Object build = row.get("buildId");
            if (code != null) {
                mapping.put(String.valueOf(code), build == null ? null : String.valueOf(build));
            }
        }
        return mapping;
    }

    /**
     * 從已凍結的快照 JSON 反解範圍項（deliveryItemId → scopeVersion），供範圍一致性判定與豁免有效性比對使用。
     *
     * <p><b>必須兼容兩種快照格式</b>（見 {@link #snapshotRows}）：硬門禁以「批次範圍快照」（行數組）
     * 為凍結基準（APPLY 階段尚未生成申請快照），而裁決後的比對以「申請/裁決證據快照」（對象）為基準。
     */
    public static Map<Long, Integer> snapshotScopeVersions(String snapshotJson) {
        Map<Long, Integer> versions = new LinkedHashMap<>();
        for (Map<String, Object> row : snapshotRows(snapshotJson)) {
            Long itemId = toLong(row.get("deliveryItemId"));
            if (itemId == null) {
                continue;
            }
            versions.put(itemId, toInt(row.get("scopeVersion")));
        }
        return versions;
    }

    /**
     * 取出快照中的範圍項行，<b>同時兼容兩種格式</b>：
     * <ol>
     *   <li><b>行數組</b>：{@code RdmReleaseBatchService#buildScopeSnapshot} 產出，寫入
     *       {@code rdm_release_batch.scope_snapshot_json}（建批時凍結的範圍基準）；</li>
     *   <li><b>對象</b>：{@link #buildSnapshotJson} 產出，範圍項位於 {@code items} 下，寫入
     *       {@code application_snapshot_json} / {@code approval_snapshot_json} /
     *       {@code rdm_release_approval.snapshot_json}（申請/裁決時凍結的證據基準）。</li>
     * </ol>
     *
     * <p><b>為何必須兼容（安全要點）</b>：若只認對象格式，{@code JsonUtils.parseMap} 對行數組會
     * 解析失敗並<b>靜默返回空 Map</b>，於是「範圍已變更」這一硬門禁永遠不會觸發——
     * 門禁看起來在跑、實際上已退化為無條件放行。此處先按首字符區分格式，避免誤判。
     */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> snapshotRows(String snapshotJson) {
        if (!StringUtils.hasText(snapshotJson)) {
            return List.of();
        }
        String trimmed = snapshotJson.trim();
        if (trimmed.startsWith("[")) {
            return JsonUtils.parseMapList(trimmed);
        }
        Object raw = JsonUtils.parseMap(trimmed).get("items");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> row) {
                rows.add((Map<String, Object>) row);
            }
        }
        return rows;
    }

    private static List<Map<String, Object>> itemRows(List<ItemEvidence> items) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ItemEvidence e : sortItems(items)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deliveryItemId", e.getDeliveryItemId());
            row.put("itemNo", e.getItemNo());
            row.put("title", e.getTitle());
            row.put("scopeVersion", e.getScopeVersion());
            row.put("acceptancePath", e.getAcceptancePath());
            row.put("itemStatus", e.getItemStatus());
            row.put("testPassed", e.isTestPassed());
            row.put("productAccepted", e.isProductAccepted());
            row.put("businessAccepted", e.isBusinessAccepted());
            row.put("blockingIssue", e.isBlockingIssue());
            rows.add(row);
        }
        return rows;
    }

    private static List<Map<String, Object>> buildRows(List<BuildEvidence> builds) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (BuildEvidence b : sortBuilds(builds)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("systemCode", b.getSystemCode());
            row.put("buildId", b.getBuildId());
            rows.add(row);
        }
        return rows;
    }

    private static List<ItemEvidence> sortItems(List<ItemEvidence> items) {
        List<ItemEvidence> copy = new ArrayList<>(items == null ? List.of() : items);
        copy.sort(Comparator.comparing(ItemEvidence::getDeliveryItemId,
                Comparator.nullsFirst(Comparator.<Long>naturalOrder())));
        return copy;
    }

    private static List<BuildEvidence> sortBuilds(List<BuildEvidence> builds) {
        List<BuildEvidence> copy = new ArrayList<>(builds == null ? List.of() : builds);
        copy.sort(Comparator.comparing(BuildEvidence::getSystemCode,
                Comparator.nullsFirst(Comparator.<String>naturalOrder())));
        return copy;
    }

    /* ==================== 放行裁決留痕 ==================== */

    /**
     * 寫入一條放行裁決留痕（apply 或 decide）。
     * <p>{@code uk(release_batch_id, application_version, action)} 保證同一申請版本的同一動作只能留痕一次，
     * 這裡先做業務層預檢，把唯一鍵衝突轉成可讀的中文拒絕而不是 500。
     */
    public RdmReleaseApproval appendApproval(Long batchId, Integer applicationVersion, String action,
                                             String decision, String snapshotJson, String evidenceHash,
                                             String reason, Long operatorUserId, String requestId) {
        if (batchId == null || applicationVersion == null || !StringUtils.hasText(action)) {
            throw new BusinessException("寫入放行裁決留痕缺少必要參數");
        }
        if (findApproval(batchId, applicationVersion, action) != null) {
            throw new BusinessException("該申請版本（applicationVersion=" + applicationVersion
                    + "）已存在「" + action + "」留痕，不可重複；請重新申請發布後再操作");
        }
        RdmReleaseApproval row = new RdmReleaseApproval();
        row.setReleaseBatchId(batchId);
        row.setApplicationVersion(applicationVersion);
        row.setAction(action);
        // ck_rdm_approval_decision：apply 必須 decision 為空；decide 必須 approved/rejected
        row.setDecision(RdmConstants.APPROVAL_ACTION_DECIDE.equals(action) ? decision : null);
        row.setSnapshotJson(emptyToPlaceholder(snapshotJson));
        row.setEvidenceHash(emptyToPlaceholder(evidenceHash));
        row.setReason(StringUtils.hasText(reason) ? reason.trim() : defaultReason(action));
        row.setOperatorUserId(requireOperator(operatorUserId));
        row.setRequestId(emptyToPlaceholder(requestId));
        approvalMapper.insert(row);
        log.info("放行裁決留痕已追加: batchId={}, applicationVersion={}, action={}, decision={}, operator={}",
                batchId, applicationVersion, action, row.getDecision(), operatorUserId);
        return row;
    }

    /** 查特定申請版本 + 動作的裁決留痕（唯一）。 */
    public RdmReleaseApproval findApproval(Long batchId, Integer applicationVersion, String action) {
        if (batchId == null || applicationVersion == null || !StringUtils.hasText(action)) {
            return null;
        }
        return approvalMapper.selectOne(new LambdaQueryWrapper<RdmReleaseApproval>()
                .eq(RdmReleaseApproval::getReleaseBatchId, batchId)
                .eq(RdmReleaseApproval::getApplicationVersion, applicationVersion)
                .eq(RdmReleaseApproval::getAction, action)
                .orderByDesc(RdmReleaseApproval::getId)
                .last("LIMIT 1"));
    }

    /** 最新一條指定動作的裁決留痕（無則 null）。 */
    public RdmReleaseApproval latestApproval(Long batchId, String action) {
        if (batchId == null || !StringUtils.hasText(action)) {
            return null;
        }
        return approvalMapper.selectOne(new LambdaQueryWrapper<RdmReleaseApproval>()
                .eq(RdmReleaseApproval::getReleaseBatchId, batchId)
                .eq(RdmReleaseApproval::getAction, action)
                .orderByDesc(RdmReleaseApproval::getId)
                .last("LIMIT 1"));
    }

    /**
     * 要求存在「已批准」的放行裁決，並返回該裁決行（其 id 供 {@code attempt.approval_id} 外鍵使用）。
     * <p>fail-closed：沒有批准裁決就沒有任何部署/驗證/開放事實可言；
     * 這也正是 {@code create → check → decide} 繞過 {@code apply} 旁路被封死的結構性保證。
     */
    public RdmReleaseApproval requireApprovedDecision(Long batchId) {
        RdmReleaseApproval decision = latestApproval(batchId, RdmConstants.APPROVAL_ACTION_DECIDE);
        if (decision == null || !RdmConstants.DECISION_APPROVED.equals(decision.getDecision())) {
            throw new BusinessException("尚未取得放行批准裁決，禁止執行部署/驗證/開放（apply 與 decide 均不可跳過）");
        }
        if (decision.getId() == null) {
            throw new BusinessException("放行批准裁決留痕異常（缺少主鍵），禁止繼續發布");
        }
        return decision;
    }

    /** 批次全部裁決留痕（按時間升序，供詳情審計展示）。 */
    public List<RdmReleaseApproval> listApprovals(Long batchId) {
        if (batchId == null) {
            return List.of();
        }
        List<RdmReleaseApproval> rows = approvalMapper.selectList(new LambdaQueryWrapper<RdmReleaseApproval>()
                .eq(RdmReleaseApproval::getReleaseBatchId, batchId)
                .orderByAsc(RdmReleaseApproval::getId));
        return rows == null ? List.of() : rows;
    }

    /* ==================== 追加式嘗試事實 ==================== */

    /**
     * 追加一條嘗試事實（部署/驗證/開放/回滾）。<b>只增不改</b>。
     * <p>{@code attempt_no} 由服務端按 (deploymentId, action) 計數 +1 分配，
     * 客戶端無從干預；{@code test_env} 一律為生產（發布批次的事實只發生在生產環境）。
     */
    public RdmReleaseAttempt appendAttempt(AttemptDraft draft) {
        if (draft == null) {
            throw new BusinessException("追加發布嘗試事實的參數不能為空");
        }
        if (draft.getReleaseBatchId() == null || draft.getDeploymentId() == null) {
            throw new BusinessException("追加發布嘗試事實必須綁定批次與部署記錄");
        }
        if (!StringUtils.hasText(draft.getAction()) || !StringUtils.hasText(draft.getResult())) {
            throw new BusinessException("追加發布嘗試事實必須指定動作與結果");
        }
        if (draft.getApprovalId() == null) {
            // approval_id 是 NOT NULL 外鍵：結構上「無批准不得有事實」，這裡提前 fail-fast 給出可讀原因
            throw new BusinessException("追加發布嘗試事實必須綁定已批准的放行裁決");
        }
        if (!StringUtils.hasText(draft.getBuildId())) {
            throw new BusinessException("追加發布嘗試事實必須記錄已批准的構建標識（build_id 不可為空）");
        }
        RdmReleaseAttempt row = new RdmReleaseAttempt();
        row.setReleaseBatchId(draft.getReleaseBatchId());
        row.setDeploymentId(draft.getDeploymentId());
        row.setAttemptNo(nextAttemptNo(draft.getDeploymentId(), draft.getAction()));
        row.setAction(draft.getAction());
        row.setResult(draft.getResult());
        row.setBuildId(draft.getBuildId());
        row.setTestEnv(RdmConstants.RELEASE_ENV_PRODUCTION);
        row.setApprovalId(draft.getApprovalId());
        row.setScopeSnapshotJson(emptyToPlaceholder(draft.getScopeSnapshotJson()));
        row.setEvidenceJson(emptyToPlaceholder(draft.getEvidenceJson()));
        row.setEvidenceHash(emptyToPlaceholder(draft.getEvidenceHash()));
        row.setReason(trimToNull(draft.getReason()));
        row.setOperatorUserId(requireOperator(draft.getOperatorUserId()));
        row.setRequestId(emptyToPlaceholder(draft.getRequestId()));
        row.setOccurredAt(LocalDateTime.now());
        attemptMapper.insert(row);
        log.info("發布嘗試事實已追加: batchId={}, deploymentId={}, action={}, result={}, attemptNo={}, buildId={}",
                row.getReleaseBatchId(), row.getDeploymentId(), row.getAction(), row.getResult(),
                row.getAttemptNo(), row.getBuildId());
        return row;
    }

    /** 下一個嘗試序號：(deploymentId, action) 已追加條數 + 1（保證 &gt; 0 且唯一）。 */
    public int nextAttemptNo(Long deploymentId, String action) {
        if (deploymentId == null || !StringUtils.hasText(action)) {
            return 1;
        }
        Long count = attemptMapper.selectCount(new LambdaQueryWrapper<RdmReleaseAttempt>()
                .eq(RdmReleaseAttempt::getDeploymentId, deploymentId)
                .eq(RdmReleaseAttempt::getAction, action));
        long existing = count == null ? 0L : count;
        return (int) Math.min(existing, Integer.MAX_VALUE - 1L) + 1;
    }

    /** 批次全部嘗試事實（按發生序升序，供詳情審計展示）。 */
    public List<RdmReleaseAttempt> listAttempts(Long batchId) {
        if (batchId == null) {
            return List.of();
        }
        List<RdmReleaseAttempt> rows = attemptMapper.selectList(new LambdaQueryWrapper<RdmReleaseAttempt>()
                .eq(RdmReleaseAttempt::getReleaseBatchId, batchId)
                .orderByAsc(RdmReleaseAttempt::getId));
        return rows == null ? List.of() : rows;
    }

    /** 指定部署 + 動作的嘗試事實（按發生序升序）。 */
    public List<RdmReleaseAttempt> listAttempts(Long deploymentId, String action) {
        if (deploymentId == null || !StringUtils.hasText(action)) {
            return List.of();
        }
        List<RdmReleaseAttempt> rows = attemptMapper.selectList(new LambdaQueryWrapper<RdmReleaseAttempt>()
                .eq(RdmReleaseAttempt::getDeploymentId, deploymentId)
                .eq(RdmReleaseAttempt::getAction, action)
                .orderByAsc(RdmReleaseAttempt::getId));
        return rows == null ? List.of() : rows;
    }

    /* ==================== 私有輔助 ==================== */

    private static Long requireOperator(Long operatorUserId) {
        if (operatorUserId == null) {
            throw new BusinessException("登錄狀態失效，無法記錄發布事實的操作人，請重新登錄");
        }
        return operatorUserId;
    }

    /** 快照/證據類列多為 NOT NULL：空值統一落為佔位串，絕不寫 null 觸發 DB 約束、也不用空串掩蓋。 */
    private static String emptyToPlaceholder(String value) {
        return StringUtils.hasText(value) ? value : "{}";
    }

    private static String defaultReason(String action) {
        return RdmConstants.APPROVAL_ACTION_APPLY.equals(action) ? "申請發布" : "放行裁決";
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

    /** 供上層組裝證據時过滤 null 元素。 */
    public static <T> List<T> nonNull(List<T> source) {
        return source == null ? List.of() : source.stream().filter(Objects::nonNull).toList();
    }
}
