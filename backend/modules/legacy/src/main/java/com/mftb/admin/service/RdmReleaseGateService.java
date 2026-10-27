package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.service.RdmReleaseFactService.BuildEvidence;
import com.mftb.admin.service.RdmReleaseFactService.ItemEvidence;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * RDM 發布<b>硬門禁</b>服務（任務27）：把「測試 / 驗收 / 缺陷 / 依賴 / 範圍」五類閘門與
 * 「證據哈希 / 裁決有效期 / 構建不可變 / 四眼審批資格 / V3 灰度」收斂到<b>唯一裁決點</b>。
 *
 * <p><b>為什麼必須收斂</b>：原實現只在 {@code applyRelease} 算一次檢查，
 * {@code decideRelease} 僅判狀態 + 申請人 + 四眼，{@code deploy/verify} 完全不複驗，
 * 於是 {@code create → check → decide} 可繞過 {@code apply}，且批准後範圍/缺陷/驗收證據變化也照樣上線。
 * 本服務讓<b>每一個發布動作都重新計算硬門禁並比對證據哈希</b>，旁路在結構上被封死。
 *
 * <p>口徑要點（全部 fail-closed）：
 * <ul>
 *   <li>驗收門禁取任務20 的權威口徑 {@code hasProductAcceptancePassed / hasBizAcceptancePassed}
 *       （當前 scopeVersion 下<b>最新有效</b>結論=pass，conditional 不算通過，已失效證據不參與），
 *       而非「歷史上曾有 pass」；</li>
 *   <li>缺陷門禁用 {@code hasBlockingOpenIssue}（含延期未獲批仍阻斷的語義），而非寬口徑的 {@code hasBlockingIssues}；</li>
 *   <li><b>業務驗收永不可豁免</b>：路徑A 缺業務驗收一律拒絕，無任何例外；</li>
 *   <li><b>緊急豁免只豁免發布時序、不豁免開放</b>：{@link Stage#OPEN} 階段要求
 *       {@code isProductAcceptanceEstablished}（真實驗收 pass 或補驗 completed+pass）；</li>
 *   <li><b>四眼無 admin 豁免</b>：裁決人不得是申請人本人；審批資格取「項目成員」，
 *       <b>絕不以 {@code canSeeAll} 充當審批資格</b>（可見範圍 ≠ 簽署權）；</li>
 *   <li><b>構建不可變</b>：部署只能使用申請快照凍結的 buildId，上報不一致即拒。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmReleaseGateService {

    /** 檢查類型（與 {@link RdmReleaseBatchVO.CheckResult} 契約一致，前端據此渲染五類閘門） */
    public static final String CHECK_TEST = "test";
    public static final String CHECK_ACCEPTANCE = "acceptance";
    public static final String CHECK_DEFECT = "defect";
    public static final String CHECK_DEPENDENCY = "dependency";
    public static final String CHECK_SCOPE = "scope";

    /** 可發布的交付項狀態（依賴就緒判定） */
    private static final List<String> RELEASABLE_ITEM_STATUS = List.of(
            RdmConstants.DI_PENDING_RELEASE, RdmConstants.DI_RELEASED_PENDING, RdmConstants.DI_DONE);

    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmTestBatchService testBatchService;
    private final RdmIssueService issueService;
    /** 驗收權威門禁（任務20 口徑：scopeVersion + 證據失效感知） */
    private final RdmAcceptanceRecordService acceptanceRecordService;
    /** 緊急豁免：只豁免缺失的產品驗收，且只豁免發布時序 */
    private final RdmReleaseExemptionService exemptionService;
    private final RdmAccessGuard accessGuard;
    /** V3 發布灰度（默認關閉，GLOBAL 熔斷優先） */
    private final RdmFlowVersionGuard flowVersionGuard;

    /**
     * 發布動作階段：不同階段對「豁免是否可用」的口徑不同。
     * <p>{@link #OPEN} 是業務真正對外可見的時刻，<b>豁免在此一律失效</b>。
     */
    public enum Stage {
        /** 申請發布：凍結快照與證據哈希 */
        APPLY("申請發布"),
        /** 放行裁決：四眼 + 重驗硬門禁 */
        DECIDE("放行裁決"),
        /** 部署上報（僅 deploying/success 這類推進型結果需要過門禁） */
        DEPLOY("上報部署結果"),
        /** 驗證上報（僅 passed 這類推進型結果需要過門禁） */
        VERIFY("上報驗證結果"),
        /** 業務開放：獨立事實，產品驗收必須真實建立，豁免不生效 */
        OPEN("業務開放");

        private final String label;

        Stage(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    /** 一次證據採集的結果（範圍項事實 + 構建映射 + 所綁定的申請版本）。 */
    public record Evidence(List<ItemEvidence> items, List<BuildEvidence> builds, Integer applicationVersion) {

        /** 證據哈希（穩定、可重算） */
        public String hash() {
            return RdmReleaseFactService.evidenceHash(applicationVersion, items, builds);
        }

        /** 快照 JSON（寫入 application_snapshot_json / approval_snapshot_json / approval.snapshot_json） */
        public String snapshotJson(RdmReleaseBatch batch) {
            return RdmReleaseFactService.buildSnapshotJson(batch.getId(), batch.getBatchNo(),
                    batch.getVersionTag(), applicationVersion, items, builds);
        }
    }

    /* ==================== 證據採集 ==================== */

    /**
     * 按<b>當前真實事實</b>採集證據（範圍項 + 構建映射）。
     * <p>採集結果既用於計算證據哈希（與申請時凍結值比對），也用於五類閘門判定，
     * 兩者同源，避免「檢查通過但證據哈希未變」或反之的口徑分裂。
     */
    public Evidence collectEvidence(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments) {
        List<ItemEvidence> items = new ArrayList<>();
        for (Map<String, Object> row : JsonUtils.parseMapList(batch.getScopeSnapshotJson())) {
            Long itemId = toLong(row.get("deliveryItemId"));
            if (itemId == null) {
                continue;
            }
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            ItemEvidence e = new ItemEvidence();
            e.setDeliveryItemId(itemId);
            // 範圍版本以交付項當前值為權威（快照值只用於比對是否變更）
            Integer scopeVersion = item != null && item.getScopeVersion() != null
                    ? item.getScopeVersion() : toInt(row.get("scopeVersion"));
            e.setScopeVersion(scopeVersion);
            e.setItemNo(item == null ? null : item.getItemNo());
            e.setTitle(item == null ? ("#" + itemId) : item.getTitle());
            String path = item != null && StringUtils.hasText(item.getAcceptancePath())
                    ? item.getAcceptancePath() : (String) row.get("acceptancePath");
            e.setAcceptancePath(path);
            e.setItemStatus(item == null ? null : item.getStatus());
            e.setTestPassed(testBatchService.isTestPassed(itemId));
            e.setProductAccepted(acceptanceRecordService.hasProductAcceptancePassed(itemId, scopeVersion));
            e.setBusinessAccepted(acceptanceRecordService.hasBizAcceptancePassed(itemId, scopeVersion));
            e.setBlockingIssue(issueService.hasBlockingOpenIssue(itemId));
            items.add(e);
        }
        List<BuildEvidence> builds = new ArrayList<>();
        for (RdmReleaseDeployment dep : deployments == null ? List.<RdmReleaseDeployment>of() : deployments) {
            if (dep != null) {
                builds.add(new BuildEvidence(dep.getSystemCode(), dep.getBuildId()));
            }
        }
        return new Evidence(items, builds, batch.getApplicationVersion());
    }

    /* ==================== 五類閘門（供檢查與詳情投影） ==================== */

    /**
     * 計算五類放行閘門（實時、服務端算，客戶端只能看結果不能改寫結論）。
     * <p>返回的是<b>真實</b>結論，不含任何豁免粉飾；豁免的效果由
     * {@link #applyExemptionWaiver} 單獨、顯式地疊加，並在訊息中標明，便於審計。
     */
    public List<RdmReleaseBatchVO.CheckResult> computeChecks(RdmReleaseBatch batch,
                                                             List<RdmReleaseDeployment> deployments) {
        Evidence evidence = collectEvidence(batch, deployments);
        Map<Long, Integer> frozen = RdmReleaseFactService.snapshotScopeVersions(batch.getScopeSnapshotJson());
        List<String> testFail = new ArrayList<>();
        List<String> acceptFail = new ArrayList<>();
        List<String> defectFail = new ArrayList<>();
        List<String> depFail = new ArrayList<>();
        List<String> scopeFail = new ArrayList<>();
        Long testRef = null, acceptRef = null, defectRef = null, depRef = null, scopeRef = null;
        String testRefNo = null, acceptRefNo = null, defectRefNo = null, depRefNo = null, scopeRefNo = null;

        for (ItemEvidence e : evidence.items()) {
            String label = e.getTitle();
            String itemNo = e.getItemNo();
            Long itemId = e.getDeliveryItemId();
            if (!e.isTestPassed()) {
                testFail.add(label);
                if (testRef == null) {
                    testRef = itemId;
                    testRefNo = itemNo;
                }
            }
            boolean bizRequired = RdmConstants.PATH_A.equals(e.getAcceptancePath());
            if (!e.isProductAccepted() || (bizRequired && !e.isBusinessAccepted())) {
                acceptFail.add(label + (bizRequired && !e.isBusinessAccepted() && e.isProductAccepted()
                        ? "（業務驗收）" : "（產品驗收）"));
                if (acceptRef == null) {
                    acceptRef = itemId;
                    acceptRefNo = itemNo;
                }
            }
            if (e.isBlockingIssue()) {
                defectFail.add(label);
                if (defectRef == null) {
                    defectRef = itemId;
                    defectRefNo = itemNo;
                }
            }
            if (!RELEASABLE_ITEM_STATUS.contains(e.getItemStatus())) {
                depFail.add(label);
                if (depRef == null) {
                    depRef = itemId;
                    depRefNo = itemNo;
                }
            }
            Integer frozenVersion = frozen.get(itemId);
            if (frozenVersion != null && !frozenVersion.equals(e.getScopeVersion())) {
                scopeFail.add(label + "（快照 v" + frozenVersion + " → 當前 v" + e.getScopeVersion() + "）");
                if (scopeRef == null) {
                    scopeRef = itemId;
                    scopeRefNo = itemNo;
                }
            }
        }
        // 構建標識缺失屬「依賴未就緒」：沒有 buildId 就連部署事實都無法追加（attempt.build_id NOT NULL）
        for (RdmReleaseDeployment dep : deployments == null ? List.<RdmReleaseDeployment>of() : deployments) {
            if (dep != null && !StringUtils.hasText(dep.getBuildId())) {
                String label = dep.getSystemName() == null ? dep.getSystemCode() : dep.getSystemName();
                depFail.add(label + "（缺構建標識）");
                if (depRef == null) {
                    depRef = dep.getId();
                    depRefNo = dep.getSystemCode();
                }
            }
        }

        List<RdmReleaseBatchVO.CheckResult> results = new ArrayList<>();
        results.add(checkResult(CHECK_TEST, testFail, "測試未通過", testRef, testRefNo));
        results.add(checkResult(CHECK_ACCEPTANCE, acceptFail, "驗收未通過", acceptRef, acceptRefNo));
        results.add(checkResult(CHECK_DEFECT, defectFail, "存在阻斷缺陷", defectRef, defectRefNo));
        results.add(checkResult(CHECK_DEPENDENCY, depFail, "依賴未就緒", depRef, depRefNo));
        results.add(checkResult(CHECK_SCOPE, scopeFail, "範圍已變更", scopeRef, scopeRefNo));
        return results;
    }

    /**
     * 疊加「生效緊急豁免」的效果（僅在检查/申请阶段，且僅覆蓋缺失的產品驗收）。
     * <p>判定依據是<b>硬門禁在 APPLY 口徑下已無任何阻斷項</b>，而不是逐項猜測；
     * 只有當唯一未通過的閘門是 acceptance 且硬門禁放行時，才把該項標記為
     * 「已獲生效緊急豁免，須在期限內補驗」。<b>業務驗收缺失永遠不會被本方法放行</b>。
     *
     * @return true 表示疊加豁免後五類閘門全部通過
     */
    public boolean applyExemptionWaiver(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments,
                                        List<RdmReleaseBatchVO.CheckResult> checks) {
        boolean allPassed = checks.stream().allMatch(c -> Boolean.TRUE.equals(c.getPassed()));
        if (allPassed) {
            return true;
        }
        boolean onlyAcceptanceFailed = checks.stream()
                .filter(c -> !Boolean.TRUE.equals(c.getPassed()))
                .allMatch(c -> CHECK_ACCEPTANCE.equals(c.getCheckType()));
        if (!onlyAcceptanceFailed) {
            return false;
        }
        if (!hardGateFailures(batch, deployments, Stage.APPLY).isEmpty()) {
            return false;
        }
        for (RdmReleaseBatchVO.CheckResult c : checks) {
            if (CHECK_ACCEPTANCE.equals(c.getCheckType())) {
                c.setPassed(true);
                c.setMessage("產品驗收缺失已獲生效緊急豁免（業務驗收不可豁免），須在凍結期限內完成補驗後才可開放");
                c.setRefId(null);
                c.setRefNo(null);
            }
        }
        return true;
    }

    /* ==================== 硬門禁 ==================== */

    /**
     * 硬門禁阻斷項清單（空 = 全過）。
     * <p>與 {@link #computeChecks} 同源但更嚴：逐項给出可讀的拒絕原因，供每個發布動作在執行前複驗。
     *
     * @param stage OPEN 階段豁免一律失效（產品驗收必須真實建立）
     */
    public List<String> hardGateFailures(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments,
                                         Stage stage) {
        List<String> failures = new ArrayList<>();
        Evidence evidence = collectEvidence(batch, deployments);
        Map<Long, Integer> frozen = RdmReleaseFactService.snapshotScopeVersions(batch.getScopeSnapshotJson());
        boolean exemptionEffective = stage != Stage.OPEN
                && exemptionService.isExemptionEffective(batch, deployments);

        for (ItemEvidence e : evidence.items()) {
            Long itemId = e.getDeliveryItemId();
            Integer scopeVersion = e.getScopeVersion();
            String label = e.getTitle();

            Integer frozenVersion = frozen.get(itemId);
            if (frozenVersion != null && !frozenVersion.equals(scopeVersion)) {
                failures.add("範圍已變更（快照 v" + frozenVersion + " → 當前 v" + scopeVersion + "）：" + label);
            }
            if (e.getItemStatus() == null) {
                failures.add("交付項不存在或已刪除：" + label);
            } else if (!RELEASABLE_ITEM_STATUS.contains(e.getItemStatus())) {
                failures.add("依賴未就緒（當前狀態 " + e.getItemStatus() + "）：" + label);
            }
            if (!e.isTestPassed()) {
                failures.add("測試未通過：" + label);
            }
            boolean productOk = stage == Stage.OPEN
                    ? exemptionService.isProductAcceptanceEstablished(itemId, scopeVersion)
                    : e.isProductAccepted() || (exemptionEffective
                            && exemptionService.isProductAcceptanceWaived(batch, deployments, itemId, scopeVersion));
            if (!productOk) {
                failures.add(stage == Stage.OPEN
                        ? "產品驗收未真實建立（緊急豁免不豁免開放，須驗收通過或補驗完成且通過）：" + label
                        : "產品驗收未通過：" + label);
            }
            if (RdmConstants.PATH_A.equals(e.getAcceptancePath()) && !e.isBusinessAccepted()) {
                failures.add("業務驗收未通過（業務驗收永不可豁免）：" + label);
            }
            if (e.isBlockingIssue()) {
                failures.add("存在阻斷缺陷（含延期未獲批）：" + label);
            }
        }
        for (RdmReleaseDeployment dep : deployments == null ? List.<RdmReleaseDeployment>of() : deployments) {
            if (dep != null && !StringUtils.hasText(dep.getBuildId())) {
                failures.add("構建標識缺失，無法追加不可變部署事實：" + dep.getSystemCode());
            }
        }
        return failures;
    }

    /**
     * 重新校驗硬門禁，任一阻斷項即拋錯。
     * <p><b>每個發布動作都必須調用</b>（decide / deploy 推進型 / verify passed / open），
     * 不得只判狀態 + 申請人，否則 {@code create → check → decide} 旁路與「批准後證據變化照樣上線」都會復活。
     */
    public void enforceHardGate(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments, Stage stage) {
        List<String> failures = hardGateFailures(batch, deployments, stage);
        if (!failures.isEmpty()) {
            log.warn("發布硬門禁未通過: batchId={}, stage={}, failures={}", batch.getId(), stage, failures);
            throw new BusinessException(stage.label() + "被硬門禁阻斷：" + String.join("；", failures));
        }
    }

    /* ==================== 證據哈希與裁決有效期 ==================== */

    /**
     * 校驗「申請快照 + 證據哈希」仍與當前事實一致。
     * <p>封死兩條旁路：① 未申請就裁決/部署（無快照即拒）；② 申請後範圍/測試/驗收/缺陷/構建映射任一變化
     * 仍按舊證據放行（哈希不一致即拒，必須重新申請）。
     */
    public void enforceEvidenceUnchanged(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments) {
        if (!StringUtils.hasText(batch.getApplicationSnapshotJson())) {
            throw new BusinessException("該批次尚未申請發布（無申請快照），禁止執行發布動作；applyRelease 不可跳過");
        }
        if (!StringUtils.hasText(batch.getEvidenceHash())) {
            throw new BusinessException("該批次缺少證據哈希，申請快照不完整，請重新申請發布");
        }
        String current = collectEvidence(batch, deployments).hash();
        if (!current.equals(batch.getEvidenceHash())) {
            log.warn("證據已變化，放行申請失效: batchId={}, frozen={}, current={}",
                    batch.getId(), batch.getEvidenceHash(), current);
            throw new BusinessException("證據已變化（範圍/測試/驗收/缺陷/構建映射任一變動），"
                    + "本次放行申請已失效，請重新執行檢查並重新申請發布");
        }
    }

    /**
     * 校驗「批准裁決」仍有效：證據未變 + 裁決證據哈希一致 + 未過期。
     * <p>放行裁決有效期為 {@link RdmConstants#RELEASE_VALID_DAYS} 天，過期必須重新過閘，
     * 避免「一次批准、無限期上線」。
     */
    public void enforceApprovalValid(RdmReleaseBatch batch, List<RdmReleaseDeployment> deployments) {
        enforceEvidenceUnchanged(batch, deployments);
        if (!StringUtils.hasText(batch.getApprovalEvidenceHash())) {
            throw new BusinessException("該批次尚未取得放行批准裁決（無裁決證據），禁止執行發布動作");
        }
        String current = collectEvidence(batch, deployments).hash();
        if (!current.equals(batch.getApprovalEvidenceHash())) {
            log.warn("裁決後證據已變化，批准失效: batchId={}, approvalHash={}, current={}",
                    batch.getId(), batch.getApprovalEvidenceHash(), current);
            throw new BusinessException("裁決後證據已變化，原放行批准已失效，請重新申請並重新裁決");
        }
        if (batch.getApprovalExpiresAt() == null) {
            throw new BusinessException("放行裁決缺少有效期，視為無效，請重新裁決");
        }
        if (!batch.getApprovalExpiresAt().isAfter(LocalDateTime.now())) {
            throw new BusinessException("放行裁決已於 " + DateTimeUtils.format(batch.getApprovalExpiresAt())
                    + " 過期，必須重新過閘（重新檢查 → 申請 → 裁決）後才可繼續發布");
        }
    }

    /* ==================== 四眼與審批資格 ==================== */

    /**
     * 放行裁決資格（四眼 + 審批資格）。
     * <p><b>四眼無條件比對，系統管理員亦不得自批</b>：管理員的「全量可見 / 可協調」不等於「可給自己蓋章」，
     * 一旦放行自批，五類閘門就退化成自己審自己。
     * <p><b>審批資格取「項目成員」，絕不以 {@code canSeeAll} 充當</b>：可見範圍與簽署權是兩個正交口徑。
     * <p>身份必須來自認證主體（{@code SysUser.id}）；為空即登錄態失效，fail-closed。
     */
    public void requireReleaseApprover(RdmReleaseBatch batch, Long actorId) {
        if (actorId == null) {
            throw new BusinessException("登錄狀態失效，無法裁決發布，請重新登錄");
        }
        if (batch.getApplicantUserId() == null) {
            throw new BusinessException("該批次尚未申請發布，無法裁決");
        }
        if (actorId.equals(batch.getApplicantUserId())) {
            throw new BusinessException("四眼原則：發布裁決人不能是申請人本人（系統管理員亦不得自批）");
        }
        accessGuard.requireProjectMember(batch.getProjectId(), actorId);
    }

    /* ==================== V3 發布灰度 ==================== */

    /**
     * V3 發布灰度門禁（<b>默認關閉</b>）。
     * <p>發布批次以交付項為範圍單位，而交付項是 V3 分批交付專屬實體，因此本門禁對<b>所有</b>
     * 發布批次的推進型動作無條件生效（比原實現「僅當範圍項屬 V3 需求才攔」更嚴，不留繞行口子）。
     * <p>僅當 {@code rdm_flow_config} 的 GLOBAL 與 {@code PROJECT:<id>} 兩級都顯式開啟
     * {@code v3_release_enabled=1} 且未全局熔斷時才放行；缺行 / null / 0 一律阻斷，且絕不自動開啟。
     */
    public void enforceV3ReleaseGrayscale(RdmReleaseBatch batch) {
        flowVersionGuard.ensureReleaseDisabledForV3(batch.getId(), batch.getProjectId());
    }

    /** 本項目的 V3 發布灰度是否已開啟（只讀，供詳情投影）。 */
    public boolean isV3ReleaseEnabled(RdmReleaseBatch batch) {
        return batch != null && flowVersionGuard.isV3ReleaseEnabled(batch.getProjectId());
    }

    /* ==================== 構建不可變 ==================== */

    /**
     * 解析本次上報應使用的構建標識：<b>一律取申請快照凍結的批准值</b>。
     * <p>客戶端上報的 buildId 只用於「一致性核對」：非空且與批准值不一致即拒
     * （部署階段偷換構建 = 上的不是被批准的代碼）；為空則直接用批准值。
     */
    public String resolveApprovedBuildId(RdmReleaseBatch batch, RdmReleaseDeployment deployment,
                                         String reportedBuildId) {
        String approved = approvedBuildId(batch, deployment.getSystemCode());
        if (StringUtils.hasText(reportedBuildId) && !approved.equals(reportedBuildId.trim())) {
            throw new BusinessException("部署不得修改已批准的構建標識：批准=" + approved
                    + "，上報=" + reportedBuildId.trim() + "；如需更換構建請重新申請發布並重新裁決");
        }
        return approved;
    }

    /** 申請快照中凍結的批准構建標識（缺失即拒：無批准構建不得部署）。 */
    public String approvedBuildId(RdmReleaseBatch batch, String systemCode) {
        Map<String, String> mapping = RdmReleaseFactService.approvedBuildMapping(batch.getApplicationSnapshotJson());
        String approved = systemCode == null ? null : mapping.get(systemCode);
        if (!StringUtils.hasText(approved)) {
            throw new BusinessException("申請快照未凍結該系統的構建標識，禁止部署: " + systemCode);
        }
        return approved;
    }

    /* ==================== 狀態聚合判定 ==================== */

    /** 是否全部系統部署成功。 */
    public boolean isAllDeployed(List<RdmReleaseDeployment> deployments) {
        return !isEmpty(deployments) && deployments.stream()
                .allMatch(d -> d != null && RdmConstants.DEPLOY_SUCCESS.equals(d.getDeployStatus()));
    }

    /** 是否全部系統驗證通過（<b>不等於已發布</b>：還需獨立開放動作）。 */
    public boolean isAllVerified(List<RdmReleaseDeployment> deployments) {
        return !isEmpty(deployments) && deployments.stream()
                .allMatch(d -> d != null && RdmConstants.VERIFY_PASSED.equals(d.getVerifyStatus()));
    }

    /** 是否全部系統已開放。 */
    public boolean isAllOpened(List<RdmReleaseDeployment> deployments) {
        return !isEmpty(deployments) && deployments.stream()
                .allMatch(d -> d != null && RdmConstants.OPEN_STATUS_OPENED.equals(d.getOpenStatus()));
    }

    /** 已開放系統數（供詳情投影）。 */
    public int openedCount(List<RdmReleaseDeployment> deployments) {
        return deployments == null ? 0 : (int) deployments.stream()
                .filter(d -> d != null && RdmConstants.OPEN_STATUS_OPENED.equals(d.getOpenStatus()))
                .count();
    }

    /** 範圍快照中的交付項 ID 列表。 */
    public List<Long> scopeItemIds(RdmReleaseBatch batch) {
        return JsonUtils.parseMapList(batch == null ? null : batch.getScopeSnapshotJson()).stream()
                .map(row -> toLong(row.get("deliveryItemId")))
                .filter(Objects::nonNull)
                .toList();
    }

    /* ==================== 私有輔助 ==================== */

    private static boolean isEmpty(List<RdmReleaseDeployment> deployments) {
        return deployments == null || deployments.stream().allMatch(Objects::isNull);
    }

    private static RdmReleaseBatchVO.CheckResult checkResult(String type, List<String> fails,
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
