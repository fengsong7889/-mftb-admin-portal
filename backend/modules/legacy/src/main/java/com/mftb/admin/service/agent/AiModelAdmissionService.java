package com.mftb.admin.service.agent;

import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 所有模型入口共用的身份、急停、模型授权与额度准入。
 * 审批和降级是待处理决策，不能因为不是 reject 就继续消耗原模型。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiModelAdmissionService {

    private final AiMyCenterService myCenterService;
    private final AiKillSwitchService killSwitchService;
    private final OperatorResolver operatorResolver;
    private final com.mftb.admin.service.PermissionService permissionService;
    private final AiOutboundPolicyService outboundPolicy;

    public record Decision(String errorKind, String message, int httpStatus) {
        public boolean allowed() {
            return errorKind == null;
        }
    }

    public Decision checkAvailability(String expectedAccount) {
        try {
            String account = operatorResolver.currentOperatorAccount();
            if (!StringUtils.hasText(account) || !account.equals(expectedAccount)) {
                return new Decision("unauthorized", "登錄狀態無效或已過期，請重新登錄後使用 AI 助手", 401);
            }
            if (killSwitchService.isEngaged()) {
                return new Decision("kill_switch", "AI 服務已臨時停用，請稍後重試或聯繫管理員", 503);
            }
            return new Decision(null, null, 200);
        } catch (RuntimeException e) {
            log.warn("[AiAdmission] 身份或急停狀態不可用，拒絕調用，異常類型={}", e.getClass().getSimpleName());
            return unavailable();
        }
    }

    public Decision check(String expectedAccount, String modelKey) {
        Decision availability = checkAvailability(expectedAccount);
        if (!availability.allowed()) return availability;
        if (!StringUtils.hasText(modelKey)) return unavailable();
        try {
            if (!myCenterService.hasModelAccess(modelKey)) {
                return new Decision("no_model_auth", "當前賬號未被授權使用所選模型，請在 AI 使用申請中申請開通", 403);
            }
            AiMyCenterDTO.QuotaCheckVO quota = myCenterService.checkQuota(null, modelKey);
            if (quota == null) return unavailable();
            if ("reject".equals(quota.getAction())) {
                return new Decision("quota_reject", message(quota, "已超出額度限制，請申請額度後重試"), 429);
            }
            if (quota.isRequiresApproval() || "approve".equals(quota.getAction())) {
                return new Decision("quota_approval_required", message(quota, "本次調用需先完成額度審批，尚未調用模型"), 429);
            }
            if ("downgrade".equals(quota.getAction())) {
                // 降级端点通过授权与数据驻留重验之前，绝不沿用已经超额的原模型。
                return new Decision("quota_downgrade_required", "額度策略要求切換降級模型；本次已停止，請選擇已授權模型後重試", 429);
            }
            if (!"allow".equals(quota.getAction())) return unavailable();
            if (!quota.isAllowed() || quota.isOverLimit()) {
                return new Decision("quota_reject", message(quota, "當前額度不允許調用，請申請額度後重試"), 429);
            }
            return new Decision(null, null, 200);
        } catch (RuntimeException e) {
            log.warn("[AiAdmission] 模型授權或額度裁決不可用，拒絕調用，異常類型={}", e.getClass().getSimpleName());
            return unavailable();
        }
    }

    public Decision checkContext(String account, String systemCode) {
        Decision available = checkAvailability(account);
        if (!available.allowed()) return available;
        if (systemCode == null || systemCode.isBlank() || "common".equals(systemCode)) return available;
        try {
            if (!permissionService.hasSystemAccess(operatorResolver.currentUser(), systemCode)) {
                return new Decision("system_access_denied", "無權使用該業務系統的 AI 能力", 403);
            }
            return available;
        } catch (RuntimeException e) {
            return unavailable();
        }
    }

    /** 所有真实模型入口在计量预占前调用；只能发送返回的已检查载荷。 */
    public AiOutboundPolicyService.Prepared prepare(String account, LlmChannelRouter.Channel channel,
                                                     java.util.Map<String, Object> payload, String systemCode) {
        Decision decision = checkContext(account, systemCode);
        if (decision.allowed()) decision = channel == null ? unavailable() : check(account, channel.getDefaultModelKey());
        if (!decision.allowed()) return new AiOutboundPolicyService.Prepared(decision, java.util.Map.of());
        try {
            AiOutboundPolicyService.Prepared prepared = outboundPolicy.prepare(channel, payload, systemCode);
            return prepared == null || prepared.decision() == null || prepared.payload() == null
                    ? new AiOutboundPolicyService.Prepared(unavailable(), java.util.Map.of()) : prepared;
        } catch (RuntimeException e) {
            return new AiOutboundPolicyService.Prepared(unavailable(), java.util.Map.of());
        }
    }

    private static String message(AiMyCenterDTO.QuotaCheckVO quota, String fallback) {
        return StringUtils.hasText(quota.getMessage()) ? quota.getMessage() : fallback;
    }

    private static Decision unavailable() {
        return new Decision("admission_unavailable", "無法確認模型授權或可用額度，本次未調用模型，請稍後重試", 503);
    }
}