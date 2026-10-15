package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
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
 * <p>第二批阶段 V3 的实际发布能力尚未开放，{@link #ensureReleaseDisabledForV3} 统一拦截并给出明确指引，
 * 只允许查看与准备，防止半成品发布路径被误触发。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmFlowVersionGuard {

    private final RdmRequirementMapper requirementMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;

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
     * 第二批期间阻止 V3 需求真正发布 —— 发布功能第三批开放。
     * <p>在任何实际发布动作前调用；当前无条件拦截并给出明确指引，避免半成品发布路径被触发。
     *
     * @param releaseBatchId 发布批次ID（用于日志定位）
     */
    public void ensureReleaseDisabledForV3(Long releaseBatchId) {
        log.info("V3 發布能力尚未開放，已攔截發布批次操作: batchId={}", releaseBatchId);
        throw new BusinessException("V3 分批交付流程的發布功能將在第三批開放，當前僅支持查看和準備");
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
