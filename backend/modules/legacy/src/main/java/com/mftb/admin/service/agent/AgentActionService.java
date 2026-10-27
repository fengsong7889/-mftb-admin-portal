package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.agent.AgentActionResult;
import com.mftb.admin.dto.agent.AgentPendingAction;
import com.mftb.admin.entity.AiActionRequest;
import com.mftb.admin.entity.AiDeliveryLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiActionRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmProjectFactService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * AI 助手待确认动作：创建预览、确认发送、取消、查询状态。
 *
 * <p>安全边界：
 * <ul>
 *   <li>模型只能创建预览，不能直接发送；</li>
 *   <li>确认必须由发起人本人操作，且重新校验推送权与项目可见性；</li>
 *   <li>pending → processing 用条件更新原子抢占，重复点击/并发确认只会发一次；</li>
 *   <li>15 分钟过期；每人每小时最多 20 次；全程写投递日志。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentActionService {

    private static final String ACTION_RDM_GROUP = "rdm_progress_group";
    private static final String ACTION_RDM_PERSON = "rdm_progress_person";
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int TTL_MINUTES = 15;
    private static final int HOURLY_LIMIT = 20;

    private final AiActionRequestMapper actionMapper;
    private final SysUserMapper userMapper;
    private final ObjectMapper objectMapper;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final RdmProjectFactService projectFactService;
    private final DingTalkService dingTalkService;
    private final DingTalkAppService dingTalkAppService;
    private final NotificationAppService notificationAppService;
    private final AiDeliveryLogService deliveryLogService;

    /**
     * 创建一条待确认动作。调用方（工具）负责把项目/收件人/内容解析好并冻结进 payload。
     *
     * @param actionType     rdm_progress_group / rdm_progress_person
     * @param conversationPk 会话主键（可空）
     * @param operator       发起人账号
     * @param payload        冻结参数（projectId/targetType/recipientUserId/title/summary/content）
     * @param previewText    确认卡预览文本
     */
    public AgentPendingAction createPending(String actionType, Long conversationPk, String operator,
                                            Map<String, Object> payload, String previewText) {
        if (!StringUtils.hasText(operator)) {
            throw new BusinessException("未取得登錄身份，無法創建推送");
        }
        checkRateLimit(operator);
        AiActionRequest row = new AiActionRequest();
        row.setActionType(actionType);
        row.setConversationPk(conversationPk);
        row.setOperator(operator);
        row.setPayloadJson(toJson(payload));
        row.setPreviewText(previewText);
        row.setStatus("pending");
        row.setExpiresAt(LocalDateTime.now().plusMinutes(TTL_MINUTES));
        actionMapper.insert(row);
        return toPendingAction(row, payload);
    }

    /** 确认并发送。失败返回 failed 结果，不抛异常（前端直接展示原因）。 */
    public AgentActionResult confirm(Long id) {
        AgentActionResult result = new AgentActionResult();
        SysUser user = operatorResolver.currentUser();
        String account = operatorResolver.currentOperatorAccount();
        if (user == null || !StringUtils.hasText(account)) {
            return failed(result, "登錄狀態已失效", "請重新登錄後再試");
        }
        AiActionRequest row = actionMapper.selectById(id);
        if (row == null) return failed(result, "動作不存在", "可能已被清理，請重新生成預覽");
        if (!account.equals(row.getOperator())) {
            return failed(result, "無權操作他人的推送", "請讓發起人本人確認");
        }
        if (!"pending".equals(row.getStatus())) {
            return resultOfCurrent(row);
        }
        if (row.getExpiresAt() == null || row.getExpiresAt().isBefore(LocalDateTime.now())) {
            row.setStatus("expired");
            row.setResultMessage("已過期");
            actionMapper.updateById(row);
            return failed(result, "確認已過期", "請重新生成推送預覽");
        }
        if (!canNotify(user)) {
            return failed(result, "您沒有推送權限", "請聯繫管理員在授權中心開通「項目總覽 > 推送」");
        }

        Map<String, Object> payload = parse(row.getPayloadJson());
        Long projectId = asLong(payload.get("projectId"));
        String targetType = asString(payload.get("targetType"));
        String title = asString(payload.get("title"));
        String content = asString(payload.get("content"));
        if (projectId == null || title == null || content == null || targetType == null) {
            markFailed(row, "參數不完整");
            return failed(result, "推送參數不完整", "請重新生成預覽");
        }
        try {
            // 重新校验项目可见性：预览生成后权限可能被收回
            projectFactService.requireProjectVisible(projectId, user.getId());
        } catch (Exception e) {
            markFailed(row, "項目權限已變化");
            return failed(result, "您已無權查看該項目", "請聯繫項目管理員確認成員權限");
        }

        // 原子抢占：重复点击/并发确认只有一次能进入 processing
        int claimed = actionMapper.update(null, new LambdaUpdateWrapper<AiActionRequest>()
                .eq(AiActionRequest::getId, id)
                .eq(AiActionRequest::getStatus, "pending")
                .set(AiActionRequest::getStatus, "processing")
                .set(AiActionRequest::getExecutedAt, LocalDateTime.now()));
        if (claimed == 0) {
            AiActionRequest latest = actionMapper.selectById(id);
            return resultOfCurrent(latest);
        }

        String text;
        String recipientSummary;
        try {
            if (ACTION_RDM_PERSON.equals(row.getActionType())) {
                Long recipientUserId = asLong(payload.get("recipientUserId"));
                text = sendPerson(recipientUserId, title, content);
                SysUser recipient = recipientUserId == null ? null : userMapper.selectById(recipientUserId);
                recipientSummary = recipient == null ? "員工#" + recipientUserId : recipient.getName();
            } else {
                text = sendGroup(title, content);
                recipientSummary = "釘釘群";
            }
            row.setStatus("sent");
            row.setResultMessage(text);
            row.setExecutedAt(LocalDateTime.now());
            actionMapper.updateById(row);
            recordDelivery(row, targetType, recipientSummary, title, content, true, null);
            result.setStatus("sent");
            result.setText(text);
            return result;
        } catch (Exception e) {
            String msg = e instanceof BusinessException ? e.getMessage() : "推送失敗，請稍後再試";
            log.warn("[AgentAction] 推送失败 id={} type={}: {}", id, row.getActionType(), e.getMessage());
            row.setStatus("failed");
            row.setResultMessage(msg);
            row.setExecutedAt(LocalDateTime.now());
            actionMapper.updateById(row);
            recordDelivery(row, targetType, ACTION_RDM_PERSON.equals(row.getActionType()) ? "指定員工" : "釘釘群",
                    title, content, false, msg);
            return failed(result, msg, "可重新讓助手生成預覽後再試");
        }
    }

    public AgentPendingAction cancel(Long id) {
        SysUser user = operatorResolver.currentUser();
        String account = operatorResolver.currentOperatorAccount();
        AiActionRequest row = actionMapper.selectById(id);
        if (row == null) throw new BusinessException("動作不存在");
        if (user == null || !StringUtils.hasText(account) || !account.equals(row.getOperator())) {
            throw new BusinessException("無權操作他人的推送");
        }
        if ("pending".equals(row.getStatus())) {
            row.setStatus("cancelled");
            row.setResultMessage("已取消");
            row.setExecutedAt(LocalDateTime.now());
            actionMapper.updateById(row);
        }
        return toPendingAction(row, parse(row.getPayloadJson()));
    }

    public AgentPendingAction get(Long id) {
        SysUser user = operatorResolver.currentUser();
        String account = operatorResolver.currentOperatorAccount();
        AiActionRequest row = actionMapper.selectById(id);
        if (row == null) throw new BusinessException("動作不存在");
        if (user == null || !StringUtils.hasText(account) || !account.equals(row.getOperator())) {
            throw new BusinessException("無權查看他人的推送");
        }
        return toPendingAction(row, parse(row.getPayloadJson()));
    }

    /* ────────────────── 内部 ────────────────── */

    private boolean canNotify(SysUser user) {
        if (operatorResolver.isAdmin(user)) return true;
        return permissionService.hasPermission(user, RdmConstants.MENU_DASHBOARD_PROJECT, RdmConstants.ACTION_NOTIFY);
    }

    private void checkRateLimit(String operator) {
        Long count = actionMapper.selectCount(new LambdaQueryWrapper<AiActionRequest>()
                .eq(AiActionRequest::getOperator, operator)
                .ge(AiActionRequest::getCreatedAt, LocalDateTime.now().minusHours(1))
                .in(AiActionRequest::getStatus, List.of("pending", "processing", "sent")));
        if (count != null && count >= HOURLY_LIMIT) {
            throw new BusinessException("推送過於頻繁（每小時最多 " + HOURLY_LIMIT + " 次），請稍後再試");
        }
    }

    private String sendGroup(String title, String content) {
        DingTalkService.SendOutcome outcome = dingTalkService.sendMarkdownSync(
                "ai_assistant", title, content, List.of(), false);
        if (outcome == null || !outcome.channelAccepted()) {
            String detail = outcome == null ? "渠道未返回結果"
                    : "errcode=" + outcome.errcode() + " errmsg=" + outcome.errmsg();
            throw new BusinessException("釘釘群渠道拒絕：" + detail);
        }
        String channel = StringUtils.hasText(outcome.channelName()) ? "「" + outcome.channelName() + "」" : "";
        return "已發送到釘釘群" + channel + "（渠道已受理，不保證已讀）";
    }

    private String sendPerson(Long recipientUserId, String title, String content) {
        if (recipientUserId == null) throw new BusinessException("缺少收件人");
        SysUser recipient = userMapper.selectById(recipientUserId);
        if (recipient == null) throw new BusinessException("收件人不存在或已離職");
        if (!StringUtils.hasText(recipient.getDingtalkUserId())) {
            throw new BusinessException("收件人「" + recipient.getName() + "」未綁定釘釘 userId，無法發送工作通知");
        }
        NotificationAppService.Credentials app = notificationAppService.resolve(NotificationAppService.AI_ASSISTANT_WORK);
        if (app == null) {
            throw new BusinessException("個人推送未配置：請管理員在「通知配置」綁定 AI 助手個人推送場景");
        }
        try {
            Boolean ok = dingTalkAppService.sendWorkNotification(
                            NotificationAppService.AI_ASSISTANT_WORK, app.getId(),
                            List.of(recipient.getDingtalkUserId()), title, content)
                    .get(10, TimeUnit.SECONDS);
            if (!Boolean.TRUE.equals(ok)) {
                throw new BusinessException("釘釘工作通知未受理");
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("釘釘工作通知發送失敗：" + e.getMessage());
        }
        return "已發送給 " + recipient.getName() + "（釘釘工作通知，渠道已受理）";
    }

    private void recordDelivery(AiActionRequest row, String targetType, String recipient,
                                String title, String content, boolean success, String error) {
        try {
            AiDeliveryLog log = new AiDeliveryLog();
            log.setToolKey("rdm_prepare_progress_push");
            log.setChannel("group".equals(targetType) ? "dingtalk_group" : "dingtalk_work");
            log.setCaller(row.getOperator());
            log.setConversationPk(row.getConversationPk());
            log.setRecipientSummary(recipient);
            log.setSubjectPreview(AiDeliveryLogService.preview(title + "｜" + content, 100));
            log.setStatus(success ? "SENT" : "FAILED");
            log.setErrorMessage(error);
            log.setAttempts(1);
            deliveryLogService.record(log);
        } catch (Exception e) {
            log.warn("[AgentAction] 投递日志写入失败 id={}: {}", row.getId(), e.getMessage());
        }
    }

    private AgentPendingAction toPendingAction(AiActionRequest row, Map<String, Object> payload) {
        AgentPendingAction a = new AgentPendingAction();
        a.setId(row.getId());
        a.setType(row.getActionType());
        a.setTitle(asString(payload.get("title")));
        a.setSummary(asString(payload.get("summary")));
        a.setPreview(row.getPreviewText());
        a.setExpiresAt(row.getExpiresAt() == null ? null : row.getExpiresAt().format(TIME_FMT));
        a.setStatus(row.getStatus());
        return a;
    }

    private AgentActionResult resultOfCurrent(AiActionRequest row) {
        AgentActionResult r = new AgentActionResult();
        r.setStatus(row == null ? "failed" : row.getStatus());
        r.setText(row == null ? "動作不存在" : row.getResultMessage());
        if (row != null && "sent".equals(row.getStatus())) {
            r.setText(StringUtils.hasText(row.getResultMessage()) ? row.getResultMessage() : "已發送");
        }
        return r;
    }

    private AgentActionResult failed(AgentActionResult r, String message, String hint) {
        r.setStatus("failed");
        r.setMessage(message);
        r.setText(message + (StringUtils.hasText(hint) ? "；" + hint : ""));
        return r;
    }

    private void markFailed(AiActionRequest row, String reason) {
        row.setStatus("failed");
        row.setResultMessage(reason);
        row.setExecutedAt(LocalDateTime.now());
        actionMapper.updateById(row);
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Map.of() : value);
        } catch (Exception e) {
            throw new BusinessException("推送參數序列化失敗");
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String json) {
        if (!StringUtils.hasText(json)) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long asLong(Object v) {
        if (v instanceof Number n) return n.longValue();
        if (v == null) return null;
        try {
            return Long.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
