package com.mftb.admin.service.agent.tool.rdm;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.agent.AgentPendingAction;
import com.mftb.admin.dto.agent.AgentView;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmProjectFactService;
import com.mftb.admin.service.agent.AgentActionService;
import com.mftb.admin.service.agent.tool.AgentTool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 生成“推送项目进度”的预览并落待确认动作；不直接发送。
 *
 * <p>模型只能走到这一步；真正发送由前端确认卡调用
 * {@code POST /api/agent/actions/{id}/confirm}，服务端再次校验推送权与项目可见性。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmPrepareProgressPushTool implements AgentTool {

    private final RdmToolSupport support;
    private final RdmProjectFactService factService;
    private final AgentActionService actionService;

    @Override
    public String toolKey() {
        return "rdm_prepare_progress_push";
    }

    @Override
    public String description() {
        return "生成項目進度推送預覽（釘釘群或指定員工），返回待確認卡；真正發送必須由用戶在確認卡上確認";
    }

    @Override
    public Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("project", Map.of("type", "string", "description", "項目編號或名稱（必填）"));
        props.put("targetType", Map.of("type", "string", "description", "推送目標",
                "enum", List.of("group", "person")));
        props.put("person", Map.of("type", "string", "description", "targetType=person 時必填：員工姓名或工號"));
        props.put("note", Map.of("type", "string", "description", "附加說明（可選，最多 200 字）"));
        return Map.of("type", "object", "properties", props, "required", List.of("project", "targetType"));
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        return executeRich(args, ctx).content();
    }

    @Override
    public RichOutput executeRich(Map<String, Object> args, ToolCallContext ctx) {
        return run(args, ctx);
    }

    private RichOutput run(Map<String, Object> args, ToolCallContext ctx) {
        SysUser user = support.currentUser();
        if (user == null) {
            return RichOutput.of(support.error("未取得登錄身份", "請重新登錄後再試"));
        }
        if (!support.canPush(user)) {
            return RichOutput.of(support.error("您沒有推送權限",
                    "請聯繫管理員在授權中心給「項目總覽」開通「推送」動作"));
        }
        RdmToolSupport.ProjectLookup lookup = support.resolveProject(support.argStr(args, "project"), user);
        if (!lookup.ok()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("error", lookup.error());
            m.put("hint", lookup.hint());
            if (!lookup.candidates().isEmpty()) m.put("candidates", lookup.candidates());
            return RichOutput.of(support.json(m));
        }
        RdmProject project = lookup.project();
        String targetType = support.argStr(args, "targetType");
        if (!"group".equals(targetType) && !"person".equals(targetType)) {
            return RichOutput.of(support.error("請指定推送目標：group=釘釘群，person=指定員工",
                    "例如：發到群裡，或發給張三"));
        }

        SysUser recipient = null;
        String recipientLabel;
        if ("person".equals(targetType)) {
            RdmToolSupport.PersonLookup person = support.resolvePerson(support.argStr(args, "person"));
            if (!person.ok()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("error", person.error());
                m.put("hint", person.hint());
                if (!person.candidates().isEmpty()) m.put("candidates", person.candidates());
                return RichOutput.of(support.json(m));
            }
            recipient = person.user();
            if (!StringUtils.hasText(recipient.getDingtalkUserId())) {
                return RichOutput.of(support.error("收件人「" + recipient.getName() + "」未綁定釘釘 userId",
                        "請管理員在員工檔案中補齊釘釘 userId 後再試"));
            }
            recipientLabel = recipient.getName();
        } else {
            recipientLabel = "釘釘群";
        }

        RdmFactVO.ProjectFact fact;
        try {
            fact = factService.projectFact(project.getId(), user.getId());
        } catch (Exception e) {
            log.warn("[RdmPreparePush] 项目事实失败 projectId={}: {}", project.getId(), e.getMessage());
            return RichOutput.of(support.error("無法讀取該項目進度", "請確認您是否為該項目成員"));
        }
        if (fact == null) {
            return RichOutput.of(support.error("該項目暫無進度數據", "請確認項目是否已有需求/交付項"));
        }

        String note = support.truncate(support.argStr(args, "note"), 200);
        String title = "項目進度 · " + project.getName() + "（" + project.getProjectNo() + "）";
        String content = compose(project, fact, recipientLabel, note);
        String summary = "person".equals(targetType)
                ? "發送給 " + recipientLabel + "（釘釘工作通知）"
                : "發送到釘釘群（AI 助手通知渠道）";

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("projectId", project.getId());
        payload.put("targetType", targetType);
        payload.put("recipientUserId", recipient == null ? null : recipient.getId());
        payload.put("title", title);
        payload.put("summary", summary);
        payload.put("content", content);

        AgentPendingAction pending;
        try {
            pending = actionService.createPending(
                    "person".equals(targetType) ? "rdm_progress_person" : "rdm_progress_group",
                    ctx.conversationPk(), ctx.caller(), payload, content);
        } catch (Exception e) {
            log.warn("[RdmPreparePush] 创建待确认失败 projectId={}: {}", project.getId(), e.getMessage());
            return RichOutput.of(support.error("生成推送預覽失敗",
                    e instanceof com.mftb.admin.common.BusinessException ? e.getMessage() : "請稍後再試"));
        }

        AgentView view = support.view("rdm_prepare_progress_push:" + pending.getId(),
                "待確認 · 推送項目進度", "確認卡有效期 15 分鐘；確認前不會發送");
        view.getMetrics().add(support.metric("交付進度",
                support.progressText(fact.getDeliveryItemCompleted(), fact.getDeliveryItemTotal()), null, "default"));
        view.getMetrics().add(support.metric("任務完成",
                support.progressText(fact.getTaskCompleted(), fact.getTaskTotal()), null, "default"));
        view.getMetrics().add(support.metric("逾期交付項", fact.getDeliveryItemOverdue(), "個",
                fact.getDeliveryItemOverdue() > 0 ? "danger" : "default"));
        view.getMetrics().add(support.metric("阻塞交付項", fact.getDeliveryItemBlocked(), "個",
                fact.getDeliveryItemBlocked() > 0 ? "danger" : "default"));
        view.getNotes().add(support.note("info", "收件人：" + summary));
        view.getNotes().add(support.note("warning", "請在確認卡上核對收件人與內容；確認後才會真正發送，發送後不可撤回。"));
        view.setLink(null);

        Map<String, Object> contentJson = new LinkedHashMap<>();
        contentJson.put("ok", true);
        contentJson.put("actionId", pending.getId());
        contentJson.put("target", summary);
        contentJson.put("expiresAt", pending.getExpiresAt());
        contentJson.put("preview", content);
        contentJson.put("note", "已生成推送預覽，等待用戶在確認卡上確認；正文請勿說“已發送”");
        return new RichOutput(support.json(contentJson), view, pending);
    }

    private String compose(RdmProject project, RdmFactVO.ProjectFact fact, String recipientLabel, String note) {
        StringBuilder sb = new StringBuilder();
        if (!"釘釘群".equals(recipientLabel)) {
            sb.append("您好 ").append(recipientLabel).append("，以下是項目進度：\n\n");
        }
        sb.append("## ").append(project.getName()).append("（").append(project.getProjectNo()).append("）\n");
        sb.append("- 項目經理：").append(nullToDash(fact.getPmUserName())).append("\n");
        sb.append("- 產品負責人：").append(nullToDash(fact.getProductOwnerUserName())).append("\n");
        sb.append("- 計劃週期：").append(nullToDash(fact.getPlanStartDate()))
                .append(" ~ ").append(nullToDash(fact.getPlanEndDate())).append("\n");
        sb.append("- 交付項：").append(support.progressText(fact.getDeliveryItemCompleted(), fact.getDeliveryItemTotal()))
                .append("（進行中 ").append(fact.getDeliveryItemInProgress())
                .append("，測試中 ").append(fact.getDeliveryItemTesting())
                .append("，待驗收 ").append(fact.getDeliveryItemPendingAcceptance())
                .append("，阻塞 ").append(fact.getDeliveryItemBlocked())
                .append("，逾期 ").append(fact.getDeliveryItemOverdue()).append("）\n");
        sb.append("- 任務：").append(support.progressText(fact.getTaskCompleted(), fact.getTaskTotal()))
                .append("（阻塞 ").append(fact.getBlockedTaskCount()).append("）\n");
        sb.append("- 需求：共 ").append(fact.getRequirementTotal()).append(" 個\n");
        sb.append("- 缺陷：開放 ").append(fact.getIssueOpen())
                .append("（嚴重 ").append(fact.getIssueCritical())
                .append("，主要 ").append(fact.getIssueMajor()).append("）\n");
        if (fact.getPendingDecisionCount() > 0) {
            sb.append("- 待決策：").append(fact.getPendingDecisionCount()).append(" 項\n");
        }
        if (note != null) {
            sb.append("\n> ").append(note).append("\n");
        }
        sb.append("\n> 數據更新於 ").append(nullToDash(fact.getComputedAt())).append("，由 AI 助手生成，請以系統頁面為準。");
        return sb.toString();
    }

    private static String nullToDash(String s) {
        return s == null || s.isBlank() ? "--" : s;
    }
}
