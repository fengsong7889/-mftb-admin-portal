package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.dto.AiSceneDto;
import com.mftb.admin.entity.AiSceneConfig;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiSceneConfigMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.AuthorizationTraceService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.agent.platform.AiDataPolicyService;
import com.mftb.admin.dto.EmpPermissionTraceVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 业务 AI 场景的统一准入与治理入口（试点：会议 AI 整理纪要）。
 *
 * <p>把「场景开关（DB）+ 环境上限（yml）+ 全局急停 + 员工功能权限 + 模型授权 + 额度 + 数据准入」
 * 收敛成一份 {@link Readiness}，供三处共用：管理员诊断、员工本人预检、真实提取执行——预检与执行同源，
 * 避免「界面上可点、后端却拒绝」或反过来的漂移。
 *
 * <p>安全基线：缺行/非法状态/读取异常一律按未就绪（默认拒绝）；本服务只读判定，不预占预算、不调模型。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiSceneService {

    /** 试点场景 → 归属系统 + 需要「edit + ai_minutes」成对授予的候选菜单。 */
    private record SceneDef(String systemCode, List<String> menus) { }

    private static final Map<String, SceneDef> REGISTRY = Map.of(
            MeetingConstants.SCENE_MEETING_MINUTES,
            new SceneDef("meeting", List.of(
                    MeetingConstants.MENU_MY, MeetingConstants.MENU_BOOKING, MeetingConstants.MENU_RECORD)));

    private final AiSceneConfigMapper sceneMapper;
    private final AiConfigAuditService auditService;
    private final PermissionService permissionService;
    private final AuthorizationTraceService traceService;
    private final AiKillSwitchService killSwitchService;
    private final LlmChannelRouter channelRouter;
    private final AiMyCenterService myCenterService;
    private final AiDataPolicyService dataPolicy;
    private final SysUserMapper userMapper;

    /** 会议纪要总开关（环境级，关闭时任何场景都不可用）。 */
    @Value("${meeting.minutes.enabled:true}")
    private boolean minutesEnabled;
    /** 会议 AI 环境级上限：默认放开，显式 false 才禁止；不代表场景已启用或员工已授权。 */
    @Value("${meeting.minutes.ai-enabled:true}")
    private boolean meetingAiEnvironmentAllowed;

    /** 场景是否被登记（未登记一律拒绝，防止用任意 sceneKey 探测）。 */
    public boolean isKnown(String sceneKey) {
        return REGISTRY.containsKey(sceneKey);
    }

    /** DB 场景开关（默认拒绝）：缺行、非 1、读取异常都视为停用。 */
    public boolean isSceneEnabled(String sceneKey) {
        if (!isKnown(sceneKey)) {
            return false;
        }
        try {
            AiSceneConfig row = sceneMapper.selectById(sceneKey);
            return row != null && Integer.valueOf(1).equals(row.getEnabled());
        } catch (RuntimeException e) {
            log.warn("[AiScene] 读取场景开关失败 scene={}，按停用处理: {}", sceneKey, e.getMessage());
            return false;
        }
    }

    /** 环境上限：会议纪要总开关 + 该场景的环境级 yml 上限。 */
    private boolean environmentAllowed(String sceneKey) {
        if (!minutesEnabled) {
            return false;
        }
        if (MeetingConstants.SCENE_MEETING_MINUTES.equals(sceneKey)) {
            return meetingAiEnvironmentAllowed;
        }
        return true;
    }

    public AiSceneDto.ConfigVO read(String sceneKey) {
        requireKnown(sceneKey);
        AiSceneConfig row = sceneMapper.selectById(sceneKey);
        AiSceneDto.ConfigVO vo = new AiSceneDto.ConfigVO();
        vo.setSceneKey(sceneKey);
        vo.setSystemCode(REGISTRY.get(sceneKey).systemCode());
        vo.setEnabled(row != null && Integer.valueOf(1).equals(row.getEnabled()));
        vo.setVersion(row == null || row.getVersion() == null ? 0L : row.getVersion());
        vo.setReason(row == null ? null : row.getReason());
        boolean envAllowed = environmentAllowed(sceneKey);
        vo.setEnvironmentAllowed(envAllowed);
        vo.setEnvironmentReasonCode(envAllowed ? null : "feature_off");
        vo.setUpdatedBy(row == null ? null : operatorName(row.getUpdatedBy()));
        vo.setUpdatedAt(row == null || row.getUpdatedAt() == null ? null : row.getUpdatedAt().toString());
        return vo;
    }

    /**
     * 保存场景开关：乐观锁条件更新 + 严格审计同事务。
     * <p>版本不符 → 409，绝不覆盖他人改动；审计失败抛出 → 整个事务回滚（安全开关不能失联）。
     */
    @Transactional(rollbackFor = Exception.class)
    public AiSceneDto.ConfigVO save(String sceneKey, AiSceneDto.ConfigForm form, SysUser operator) {
        requireKnown(sceneKey);
        if (operator == null || operator.getId() == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        String reason = form.getReason() == null ? "" : form.getReason().trim();
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("必須填寫變更原因");
        }
        int target = Boolean.TRUE.equals(form.getEnabled()) ? 1 : 0;
        AiSceneConfig current = sceneMapper.selectById(sceneKey);
        AiSceneDto.ConfigVO before = snapshot(current);
        if (current == null) {
            AiSceneConfig fresh = new AiSceneConfig();
            fresh.setSceneKey(sceneKey);
            fresh.setEnabled(target);
            fresh.setVersion(1L);
            fresh.setReason(reason);
            fresh.setCreatedBy(operator.getId());
            fresh.setUpdatedBy(operator.getId());
            try {
                sceneMapper.insert(fresh);
            } catch (RuntimeException dup) {
                // 并发首建：唯一键冲突说明他人已插入，本次按版本冲突回退，让前端刷新重试
                throw new BusinessException(409, "場景配置已被他人修改，請刷新後重試");
            }
            auditService.recordStrict("ai_scene_config", sceneKey, "create", before, snapshot(fresh));
            return read(sceneKey);
        }
        if (current.getVersion() == null || current.getVersion() != form.getExpectedVersion()) {
            throw new BusinessException(409, "場景配置已被他人修改，請刷新後重試");
        }
        int updated = sceneMapper.updateWithVersion(sceneKey, target, reason, operator.getId(), form.getExpectedVersion());
        if (updated == 0) {
            throw new BusinessException(409, "場景配置已被他人修改，請刷新後重試");
        }
        auditService.recordStrict("ai_scene_config", sceneKey,
                target == 1 ? "enable" : "disable", before, read(sceneKey));
        return read(sceneKey);
    }

    /**
     * 员工就绪判定（预检与执行共用）。只读，不预占预算、不调模型。
     * <p>checks 覆盖：账号、场景、环境、急停、功能权限、模型、额度、数据准入；
     * 会议归属/笔记内容安全/实际预算属「执行时校验」，此处标 not_checked，不宣称必然成功。
     */
    public AiSceneDto.DiagnosisVO evaluate(String sceneKey, SysUser user) {
        requireKnown(sceneKey);
        SceneDef def = REGISTRY.get(sceneKey);
        List<AiSceneDto.Check> checks = new ArrayList<>();
        String firstBlock = null;

        boolean accountOk = user != null && user.getId() != null && Integer.valueOf(1).equals(user.getStatus());
        checks.add(check("account", accountOk, accountOk ? null : "account_disabled",
                accountOk ? "帳號有效" : "帳號無效或已停用", "employee-management"));
        firstBlock = firstBlock(firstBlock, accountOk, "account_disabled");

        boolean sceneOn = isSceneEnabled(sceneKey);
        checks.add(check("scene", sceneOn, sceneOn ? null : "scene_disabled",
                sceneOn ? "場景已啟用" : "場景未啟用，請聯繫管理員開啟", "ai-operation-auth"));
        firstBlock = firstBlock(firstBlock, sceneOn, "scene_disabled");

        boolean envOk = environmentAllowed(sceneKey);
        checks.add(check("environment", envOk, envOk ? null : "feature_off",
                envOk ? "環境允許" : "後端環境開關已關閉此場景", null));
        firstBlock = firstBlock(firstBlock, envOk, "feature_off");

        boolean killEngaged = safeKillSwitchEngaged();
        checks.add(check("kill-switch", !killEngaged, killEngaged ? "kill_switch" : null,
                killEngaged ? "AI 服務已緊急熔斷" : "未處於熔斷狀態", "ai-operation-auth"));
        firstBlock = firstBlock(firstBlock, !killEngaged, "kill_switch");

        boolean authorized = accountOk && hasMeetingAiPermission(user, def);
        checks.add(check("permission", authorized, authorized ? null : "no_permission",
                authorized ? "具備會議編輯與 AI 整理權限" : "缺少會議系統准入或 AI 整理動作", "authorization-center"));
        firstBlock = firstBlock(firstBlock, authorized, "no_permission");

        String modelKey = null;
        boolean modelOk = false;
        String modelReason = null;
        if (accountOk) {
            LlmChannelRouter.Channel channel = resolveChannel(user.getUsername());
            modelKey = channel == null ? null : channel.getDefaultModelKey();
            if (channel == null) {
                modelReason = "no_channel";
            } else if (!StringUtils.hasText(modelKey) || !myCenterService.hasModelAccess(user, modelKey)) {
                modelReason = "no_model_auth";
            } else {
                modelOk = true;
            }
        } else {
            modelReason = "account_disabled";
        }
        checks.add(check("model", modelOk, modelOk ? null : modelReason,
                modelOk ? "模型可用且已授權" : "無可用模型或未獲授權", "ai-emp-model-auth"));
        firstBlock = firstBlock(firstBlock, modelOk, modelReason);

        boolean quotaOk = false;
        String quotaReason = null;
        if (modelOk) {
            try {
                AiMyCenterDTO.QuotaCheckVO quota = myCenterService.checkQuotaFor(user, null, modelKey);
                quotaOk = quota != null && quota.isAllowed() && "allow".equals(quota.getAction()) && !quota.isOverLimit();
                if (!quotaOk) {
                    quotaReason = quota == null ? "admission_unavailable"
                            : ("approve".equals(quota.getAction()) ? "quota_approval_required"
                            : "downgrade".equals(quota.getAction()) ? "quota_downgrade_required" : "quota_reject");
                }
            } catch (RuntimeException e) {
                quotaReason = "admission_unavailable";
            }
        } else {
            quotaReason = modelReason;
        }
        checks.add(check("quota", quotaOk, quotaOk ? null : quotaReason,
                quotaOk ? "額度充足" : "額度不足或需審批，請在 AI 使用申請處理", "ai-apply"));
        firstBlock = firstBlock(firstBlock, quotaOk, quotaReason);

        boolean dataOk = false;
        String dataReason = null;
        if (modelOk) {
            try {
                AiDataPolicyService.Decision policy = dataPolicy.evaluate(def.systemCode(), modelKey);
                dataOk = policy != null && policy.allowed();
                dataReason = dataOk ? null : (policy == null ? "data_policy_unavailable" : policy.errorKind());
            } catch (RuntimeException e) {
                dataReason = "data_policy_unavailable";
            }
        } else {
            dataReason = modelReason;
        }
        checks.add(check("data-policy", dataOk, dataOk ? null : dataReason,
                dataOk ? "資料分級與端點准入通過" : "資料分級未登記或端點未批准", "ai-data-policy"));
        firstBlock = firstBlock(firstBlock, dataOk, dataReason);

        // 执行时再校验：不宣称完整调用必然成功
        checks.add(new AiSceneDto.Check("booking-scope", "not_checked", null,
                "具體會議歸屬與筆記內容在執行時校驗", null));
        checks.add(new AiSceneDto.Check("budget", "not_checked", null,
                "實際費用在執行時嚴格預占", null));

        AiSceneDto.DiagnosisVO vo = new AiSceneDto.DiagnosisVO();
        vo.setSceneKey(sceneKey);
        vo.setUserId(user == null ? null : user.getId());
        vo.setName(user == null ? null : user.getName());
        vo.setEmpId(user == null ? null : user.getEmpId());
        vo.setCheckedAt(LocalDateTime.now().toString());
        vo.setReady(firstBlock == null);
        vo.setAuthorized(authorized);
        vo.setModelKey(modelKey);
        vo.setReasonCode(firstBlock);
        vo.setMessage(firstBlock == null ? "基礎條件就緒" : blockMessage(firstBlock));
        vo.setChecks(checks);
        vo.setPermissionSources(permissionSources(user, def));
        return vo;
    }

    /** 执行/预检的硬门禁：不就绪直接抛业务异常（提取入口调用）。 */
    public void assertExecutable(String sceneKey, SysUser user) {
        AiSceneDto.DiagnosisVO vo = evaluate(sceneKey, user);
        if (!vo.isReady()) {
            throw new BusinessException(vo.getMessage());
        }
    }

    /* ==================== 内部 ==================== */

    private boolean hasMeetingAiPermission(SysUser user, SceneDef def) {
        if (user == null || user.getId() == null) {
            return false;
        }
        if (!permissionService.hasSystemAccess(user, def.systemCode())) {
            return false;
        }
        for (String menu : def.menus()) {
            if (permissionService.hasPermission(user, menu, MeetingConstants.ACTION_EDIT)
                    && permissionService.hasPermission(user, menu, MeetingConstants.ACTION_AI_MINUTES)) {
                return true;
            }
        }
        return false;
    }

    private List<AiSceneDto.PermissionSource> permissionSources(SysUser user, SceneDef def) {
        if (user == null || user.getId() == null) {
            return List.of();
        }
        try {
            EmpPermissionTraceVO trace = traceService.trace(user.getId());
            if (trace == null || Boolean.TRUE.equals(trace.getSuperAdmin())) {
                return List.of();
            }
            Set<String> wanted = Set.copyOf(def.menus());
            List<AiSceneDto.PermissionSource> out = new ArrayList<>();
            for (EmpPermissionTraceVO.TraceMenu menu : trace.getMenus()) {
                if (!wanted.contains(menu.getMenuKey())) {
                    continue;
                }
                List<String> actions = menu.getActions() == null ? List.of() : menu.getActions().stream()
                        .filter(a -> MeetingConstants.ACTION_EDIT.equals(a) || MeetingConstants.ACTION_AI_MINUTES.equals(a))
                        .toList();
                if (!actions.isEmpty()) {
                    out.add(new AiSceneDto.PermissionSource(menu.getMenuKey(), actions,
                            menu.getSources() == null ? List.of() : menu.getSources()));
                }
            }
            return out;
        } catch (RuntimeException e) {
            log.warn("[AiScene] 權限來源解析失敗 user={}: {}", user.getId(), e.getMessage());
            return List.of();
        }
    }

    private LlmChannelRouter.Channel resolveChannel(String account) {
        LlmChannelRouter.Channel primary = channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, account);
        return primary != null ? primary : channelRouter.resolveChannel(LlmChannelRouter.CHANNEL_OFF_PEAK, account);
    }

    private boolean safeKillSwitchEngaged() {
        try {
            return killSwitchService.isEngaged();
        } catch (RuntimeException e) {
            // 无法确认急停状态时按「已熔断」拒绝（默认拒绝），不得因为看不清而放行
            log.warn("[AiScene] 急停狀態不可用，按熔斷處理: {}", e.getMessage());
            return true;
        }
    }

    private static AiSceneDto.Check check(String key, boolean passed, String reasonCode, String message, String action) {
        return new AiSceneDto.Check(key, passed ? "passed" : "blocked", reasonCode, message, action);
    }

    private static String firstBlock(String current, boolean passed, String reasonCode) {
        return current == null && !passed ? reasonCode : current;
    }

    private static String blockMessage(String reasonCode) {
        if (reasonCode == null) {
            return "基礎條件就緒";
        }
        return switch (reasonCode) {
            case "account_disabled" -> "員工帳號無效或已停用";
            case "scene_disabled" -> "會議 AI 場景尚未啟用";
            case "feature_off" -> "後端環境已關閉此場景";
            case "kill_switch" -> "AI 服務已緊急熔斷";
            case "no_permission" -> "缺少會議 AI 整理所需的功能權限";
            case "no_channel" -> "當前賬號沒有可用的 AI 模型通道";
            case "no_model_auth" -> "當前賬號未被授權使用所選模型";
            case "quota_reject" -> "AI 使用額度不足";
            case "quota_approval_required" -> "本次調用需先完成額度審批";
            case "quota_downgrade_required" -> "額度策略要求切換降級模型";
            case "data_class_unclassified", "endpoint_not_approved", "data_class_exceeded",
                    "endpoint_disabled", "endpoint_expired", "data_policy_unavailable" -> "資料准入未通過，禁止外發";
            default -> "AI 輔助暫不可用，請聯繫管理員檢查";
        };
    }

    private static AiSceneDto.ConfigVO snapshot(AiSceneConfig row) {
        AiSceneDto.ConfigVO vo = new AiSceneDto.ConfigVO();
        if (row == null) {
            return vo;
        }
        vo.setSceneKey(row.getSceneKey());
        vo.setEnabled(Integer.valueOf(1).equals(row.getEnabled()));
        vo.setVersion(row.getVersion() == null ? 0L : row.getVersion());
        vo.setReason(row.getReason());
        return vo;
    }

    private void requireKnown(String sceneKey) {
        if (!isKnown(sceneKey)) {
            throw new BusinessException("未登記的 AI 場景");
        }
    }

    private String operatorName(Long userId) {
        if (userId == null) {
            return null;
        }
        try {
            SysUser user = userMapper.selectById(userId);
            // 只取姓名快照，不暴露部门/职位等组织归属
            return user == null ? null : (StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        } catch (RuntimeException e) {
            // 审计展示名解析失败不应影响配置读取
            return null;
        }
    }
}
