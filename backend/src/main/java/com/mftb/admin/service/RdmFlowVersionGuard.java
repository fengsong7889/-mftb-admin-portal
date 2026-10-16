package com.mftb.admin.service;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmFlowConfig;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmFlowConfigMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.Set;
/**
 * RDM 流程版本守卫（Batch 2 / Phase 1B）。
 *
 * <p>需求存在两条并行链路：
 * <ul>
 *   <li><b>旧链路（V1/V2）</b>：整需求为单位推进状态机、走 {@code RdmReleaseService} 单需求放行；</li>
 *   <li><b>新链路（V3）</b>：项目 → 需求 → 交付项分层交付，放行以发布批次为单位（第三批开放）。</li>
 * </ul>
 *
 * <p>两条链路的写接口不能互相误用：让 V3 需求走旧整需求放行，会绕过发布批次的五类闸门；
 * 让 V1/V2 需求走新交付项接口，则会把没有拆分的整需求当成"范围未确定"卡死。
 * 本守卫是唯一的版本裁决点，所有跨链路入口都必须先过这里，避免各处散落 {@code flowVersion==3} 判断。
 *
 * <p>第三批（任务27）将 {@link #ensureReleaseDisabledForV3} 由「无条件阻断」演进为
 * 「<b>灰度未开启即维持无条件阻断</b>」：仅当 {@code rdm_flow_config} 的 GLOBAL 与 PROJECT 两级
 * 都显式开启 V3 发布且未全局熔断时才放行，否则报错口径与以前一致。
 * <p><b>安全默认：关闭</b>。缺行、null、非 1 一律当作关闭；本类不提供任何开启入口（灰度管理写接口属任务22），
 * 也不会自动为任何项目开启发布。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmFlowVersionGuard {
    private final RdmRequirementMapper requirementMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    /** 任务27 新增（增量构造变更）：两级灰度配置只读，用于 V3 发布门禁判定。 */
    private final RdmFlowConfigMapper flowConfigMapper;
    /**
     * V3 需求经旧整需求流转入口（transition）仍允许执行的「前段」动作白名单（任务19 / 缺口1）。
     * <p>V3 以「项目 → 需求 → 交付项」分层推进：需求层只保留准入（admission）、分配（assignment）、
     * 受理（acceptance）与协调类动作；一旦受理完成，实际的 PRD/设计/开发/测试/验收/发布
     * 均以交付项为推进单位，不得再走整需求状态机，否则会绕过发布批次的五类闸门。
     * <p>采用白名单（fail-closed）而非黑名单：未显列入的动作一律拒绝，
     * 新增交付/发布类动作时不会被意外放行。
     */
    private static final Set<String> V3_TRANSITION_ALLOWED_ACTIONS = Set.of(
            // 提交 / 准入前段
            RdmConstants.ACTION_SUBMIT,
            RdmConstants.ACTION_RESUBMIT,
            RdmConstants.ACTION_WITHDRAW,
            RdmConstants.ACTION_SUBMIT_POOL,
            RdmConstants.ACTION_APPROVE_INTAKE,
            RdmConstants.ACTION_REJECT_INTAKE,
            // 分配 / 改派
            RdmConstants.ACTION_DISPATCH,
            RdmConstants.ACTION_CLAIM,
            RdmConstants.ACTION_REASSIGN,
            RdmConstants.ACTION_REASSIGN_PM,
            // 受理 / 评估
            RdmConstants.ACTION_START_EVALUATE,
            RdmConstants.ACTION_ACCEPT,
            RdmConstants.ACTION_REJECT,
            // 协调类（不触及交付/测试/发布闸门）
            RdmConstants.ACTION_HOLD,
            RdmConstants.ACTION_UNHOLD,
            RdmConstants.ACTION_SCHEDULE,
            RdmConstants.ACTION_URGE);
    /**
     * 要求需求必须是 V3 分批交付流程，否则拒绝操作。
     * <p>用于新链路专属接口（交付项、发布批次等）入口，挡住旧流程需求误入。
     */
    public void requireFlowV3(Long reqId) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        if (!isV3(req.getFlowVersion())) {
            throw new BusinessException("此操作僅適用於分批交付流程（V3），當前需求為 V" + versionLabel(req.getFlowVersion()));
        }
    }
    /**
     * 要求需求不是 V3（保护旧接口不被新流程误用）。
     * <p>用于旧整需求链路入口（如单需求发布放行、整需求状态推进），挡住 V3 需求走回头路。
     */
    public void rejectFlowV3(Long reqId) {
        if (reqId == null) {
            return;
        }
        RdmRequirement req = requirementMapper.selectById(reqId);
        if (req != null && isV3(req.getFlowVersion())) {
            throw new BusinessException("V3 分批交付流程需求請使用新接口，不可使用舊整需求操作");
        }
    }
    /**
     * V3 需求走旧整需求流转入口（transition）时的动作白名单裁决（任务19 / 缺口1）。
     * <p>取代原本对 V3 一律 {@link #rejectFlowV3} 的做法：V3 需求的准入/分配/受理等前段动作
     * 仍可通过 transition 推进（否则新建的 V3 需求无法完成受理），但交付/测试/验收/发布
     * 类动作必须走交付项接口，不得经此绕过发布批次门禁。
     * <p><b>V1/V2 语义完全不变</b>：非 V3 需求直接放行，不受本白名单影响。
     *
     * @param reqId      需求 id
     * @param actionCode 流转动作码
     */
    public void requireV3TransitionAllowed(Long reqId, String actionCode) {
        if (reqId == null) {
            return;
        }
        RdmRequirement req = requirementMapper.selectById(reqId);
        if (req == null || !isV3(req.getFlowVersion())) {
            // 不存在或非 V3：维持旧链路语义，不在这里拦（由调用方各自的守卫处理）
            return;
        }
        if (actionCode != null && V3_TRANSITION_ALLOWED_ACTIONS.contains(actionCode)) {
            return;
        }
        throw new BusinessException("V3 分批交付需求的交付/測試/驗收/發布以交付項為推進單位，"
                + "不能通過整需求流轉執行動作「" + actionCode + "」，請使用交付項接口");
    }
    /**
     * 获取需求的实际流程版本。
     * <p>历史数据 flowVersion 可能为空，统一按 V1 兜底（最宽松口径，不误卡存量需求）。
     */
    public int getEffectiveFlowVersion(Long reqId) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null || req.getFlowVersion() == null) {
            return 1;
        }
        return req.getFlowVersion();
    }
    /**
     * 发布门禁：V3 发布灰度未开启时维持无条件阻断（任务27 演进）。
     * <p>无 projectId 可用时的安全入口（等价于「灰度未开启」），保留原签名以免弱化既有调用点与测试。
     *
     * @param releaseBatchId 发布批次ID（用于日志定位）
     */
    public void ensureReleaseDisabledForV3(Long releaseBatchId) {
        ensureReleaseDisabledForV3(releaseBatchId, null);
    }
    /**
     * 发布门禁：仅当项目两级灰度均已开启 V3 发布时放行，否则维持无条件阻断。
     * <p><b>本方法不校验业务硬门禁</b>（测试/验收/缺陷/范围/证据由
     * {@code RdmReleaseGateService} 负责）；它只回答「这个项目的 V3 发布能力开了没」。
     * <p><b>绝不自动开启</b>：读不到配置、配置为 0、全局熔断任一命中即抛错，
     * 且不提供任何写入入口（灰度管理写接口属任务22）。
     *
     * @param releaseBatchId 发布批次ID（用于日志定位）
     * @param projectId      批次所属项目ID；null 时一律当作未开启
     */
    public void ensureReleaseDisabledForV3(Long releaseBatchId, Long projectId) {
        if (isV3ReleaseEnabled(projectId)) {
            return;
        }
        log.info("V3 發布灰度未開啟（或已全局熔断），已拦截發布批次操作: batchId={}, projectId={}",
                releaseBatchId, projectId);
        throw new BusinessException("V3 分批交付流程的發布能力尚未對本項目開放（灰度未開啟或已全局熔断），"
                + "當前僅支持查看和準備");
    }
    /**
     * 项目级 V3 发布灰度是否已开启（<b>只读</b>，任务27）。
     *
     * <p>两级口径，<b>GLOBAL 熔断优先</b>：
     * <ol>
     *   <li>GLOBAL 行缺失 → <b>关闭</b>（安全默认；238 种子行为 {@code (v3_release_enabled=0,
     *       global_release_paused=0)}，即默认关闭）；</li>
     *   <li>{@code global_release_paused=1} → <b>关闭</b>（全局熔断优先于任何项目级开启）；</li>
     *   <li>GLOBAL {@code v3_release_enabled != 1} → <b>关闭</b>；</li>
     *   <li>{@code projectId} 为 null → <b>关闭</b>（无法定位项目级开关时不得放行）；</li>
     *   <li>{@code PROJECT:<id>} 行缺失或 {@code v3_release_enabled != 1} → <b>关闭</b>；</li>
     *   <li>两级都为 1 → <b>开启</b>。</li>
     * </ol>
     * <p>任何读取异常都归为关闭（fail-closed）：宁可误拦，不可误放。
     */
    public boolean isV3ReleaseEnabled(Long projectId) {
        try {
            RdmFlowConfig global = findConfig(RdmConstants.FLOW_SCOPE_GLOBAL);
            if (global == null) {
                return false;
            }
            if (isOn(global.getGlobalReleasePaused())) {
                log.info("全局發布熔断已開啟，所有項目 V3 發布一律關閉");
                return false;
            }
            if (!isOn(global.getV3ReleaseEnabled())) {
                return false;
            }
            if (projectId == null) {
                return false;
            }
            RdmFlowConfig project = findConfig(RdmConstants.projectScopeKey(projectId));
            return project != null && isOn(project.getV3ReleaseEnabled());
        } catch (Exception e) {
            log.warn("讀取 V3 發布灰度配置異常，按「關閉」處理: projectId={}", projectId, e);
            return false;
        }
    }
    /**
     * 产品补验时限（天，任务27）。
     * <p>取 GLOBAL 行 {@code product_verification_days}；缺行、null 或非法（&lt;=0）时
     * 回退到 {@link RdmConstants#DEFAULT_PRODUCT_VERIFICATION_DAYS}（与 238 冻结 DDL 的 DEFAULT 1 一致）。
     * <p><b>不取项目级</b>：补验时限是全局安全口径，不得由项目级配置放宽。
     */
    public int productVerificationDays() {
        RdmFlowConfig global = findConfig(RdmConstants.FLOW_SCOPE_GLOBAL);
        Integer days = global == null ? null : global.getProductVerificationDays();
        if (days == null || days <= 0) {
            return RdmConstants.DEFAULT_PRODUCT_VERIFICATION_DAYS;
        }
        return days;
    }
    /** 按 scope_key 读一行灰度配置（{@code uk_rdm_flow_scope} 保证唯一）。 */
    private RdmFlowConfig findConfig(String scopeKey) {
        if (scopeKey == null) {
            return null;
        }
        return flowConfigMapper.selectOne(new LambdaQueryWrapper<RdmFlowConfig>()
                .eq(RdmFlowConfig::getScopeKey, scopeKey)
                .last("LIMIT 1"));
    }
    /** 开关位判定：仅显式 1 算开，null/0/其他一律算关（安全默认）。 */
    private static boolean isOn(Integer flag) {
        return flag != null && flag == RdmConstants.FLOW_FLAG_ON;
    }
    /**
     * 检查交付项所属需求是否为 V3 分批交付流程。
     * <p>交付项本身不带 flowVersion，须回溯到所属需求判定；查不到时按非 V3 处理（不误拦旧数据）。
     */
    public boolean isDeliveryItemFlowV3(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return false;
        }
        RdmDeliveryItem item = deliveryItemMapper.selectById(deliveryItemId);
        if (item == null || item.getReqId() == null) {
            return false;
        }
        RdmRequirement req = requirementMapper.selectById(item.getReqId());
        return req != null && isV3(req.getFlowVersion());
    }
    /** 是否 V3 流程版本 */
    private boolean isV3(Integer flowVersion) {
        return flowVersion != null && flowVersion == RdmConstants.FLOW_VERSION_3;
    }
    /** 版本文案：空值代表最早的历史需求（V1/V2 之前），统一显示为 1/2 */
    private String versionLabel(Integer flowVersion) {
        return flowVersion == null ? "1/2" : String.valueOf(flowVersion);
    }
}
