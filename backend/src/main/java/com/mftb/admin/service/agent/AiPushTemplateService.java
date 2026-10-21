package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiPushTemplate;
import com.mftb.admin.mapper.AiPushTemplateMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 推送模板：业务方可改“推送长什么样”，但推送动作仍由确认卡与服务端校验控制。
 *
 * <p>模板为空或停用时回落内置默认模板（与历史代码文案一致），保证功能不因未配置而不可用。
 * <p>占位符只做纯文本替换，不解析表达式/脚本；未知占位符渲染为 “--”，避免把 {{xxx}} 直接发给客户。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiPushTemplateService {

    public static final String KEY_GROUP = "rdm_progress_group";
    public static final String KEY_PERSON = "rdm_progress_person";

    private static final Set<String> KNOWN_KEYS = Set.of(KEY_GROUP, KEY_PERSON);
    private static final int MAX_CONTENT = 8000;
    private static final int MAX_TITLE = 200;
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([A-Za-z0-9_]+)\\s*}}");

    private static final String BODY = """
            ## {{projectName}}（{{projectNo}}）
            - 項目經理：{{pm}}
            - 產品負責人：{{productOwner}}
            - 計劃週期：{{planStart}} ~ {{planEnd}}
            - 交付項：{{deliveryProgress}}（進行中 {{deliveryInProgress}}，測試中 {{deliveryTesting}}，待驗收 {{deliveryPendingAcceptance}}，阻塞 {{deliveryBlocked}}，逾期 {{deliveryOverdue}}）
            - 任務：{{taskProgress}}（阻塞 {{blockedTasks}}）
            - 需求：共 {{requirementTotal}} 個
            - 缺陷：開放 {{issueOpen}}（嚴重 {{issueCritical}}，主要 {{issueMajor}}）
            {{pendingDecisionLine}}{{noteLine}}
            > 數據更新於 {{computedAt}}，由 AI 助手生成，請以系統頁面為準。""";

    private final AiPushTemplateMapper templateMapper;
    private final AiConfigAuditService auditService;
    private final OperatorResolver operatorResolver;

    public List<AiPushTemplate> list() {
        return list(null);
    }

    /** 配置页列表：传 systemCode 时只返回该作用域；未配置的内置模板只在 rdm/全部视图下补展示 */
    public List<AiPushTemplate> list(String systemCode) {
        LambdaQueryWrapper<AiPushTemplate> wrapper = new LambdaQueryWrapper<AiPushTemplate>()
                .orderByAsc(AiPushTemplate::getId);
        if (StringUtils.hasText(systemCode)) wrapper.eq(AiPushTemplate::getSystemCode, systemCode);
        List<AiPushTemplate> rows = new ArrayList<>(templateMapper.selectList(wrapper));
        // 未配置的内置模板也展示出来，运营才知道“系统默认长什么样”，避免看不到入口
        if (!StringUtils.hasText(systemCode) || "rdm".equals(systemCode)) {
            for (String key : KNOWN_KEYS) {
                boolean exists = rows.stream().anyMatch(r -> key.equals(r.getTemplateKey()));
                if (!exists) {
                    AiPushTemplate builtin = defaultTemplate(key);
                    builtin.setId(null);
                    rows.add(builtin);
                }
            }
        }
        return rows;
    }

    @Transactional
    public AiPushTemplate save(AiPushTemplate input) {
        String key = input.getTemplateKey();
        if (!StringUtils.hasText(key) || !KNOWN_KEYS.contains(key)) {
            throw new BusinessException("不支持的模板標識：" + key);
        }
        String content = input.getContentTpl() == null ? "" : input.getContentTpl();
        if (!StringUtils.hasText(content)) throw new BusinessException("模板內容不能為空");
        if (content.length() > MAX_CONTENT) throw new BusinessException("模板內容過長（上限 " + MAX_CONTENT + " 字）");
        String title = StringUtils.hasText(input.getTitleTpl()) ? input.getTitleTpl().trim() : defaultTitle();
        if (title.length() > MAX_TITLE) throw new BusinessException("標題過長（上限 " + MAX_TITLE + " 字）");

        AiPushTemplate row = input.getId() == null ? null : templateMapper.selectById(input.getId());
        if (row == null) {
            row = templateMapper.selectOne(new LambdaQueryWrapper<AiPushTemplate>()
                    .eq(AiPushTemplate::getTemplateKey, key).last("LIMIT 1"));
        }
        AiPushTemplate before = row == null ? null : copyOf(row);
        if (row == null) row = new AiPushTemplate();
        row.setTemplateKey(key);
        row.setName(StringUtils.hasText(input.getName()) ? input.getName().trim() : defaultName(key));
        row.setTargetType(KEY_PERSON.equals(key) ? "person" : "group");
        row.setSystemCode(StringUtils.hasText(input.getSystemCode()) ? input.getSystemCode().trim()
                : (key.startsWith("rdm_") ? "rdm" : "common"));
        row.setTitleTpl(title);
        row.setContentTpl(content);
        row.setStatus(StringUtils.hasText(input.getStatus()) ? input.getStatus() : "active");
        row.setUpdatedBy(operatorResolver.currentOperatorName());
        if (row.getId() == null) templateMapper.insert(row);
        else templateMapper.updateById(row);
        auditService.record("push_template", "template:" + key,
                before == null ? "create" : "update", before, row);
        return row;
    }

    /** 删除前取行：控制器需要按该行作用域做共用写权限校验。 */
    public AiPushTemplate get(Long id) {
        return id == null ? null : templateMapper.selectById(id);
    }

    @Transactional
    public void delete(Long id) {
        AiPushTemplate row = templateMapper.selectById(id);
        if (row == null) return;
        templateMapper.deleteById(id);
        auditService.record("push_template", "template:" + row.getTemplateKey(), "delete", row, null);
    }

    /** 渲染正文：DB 模板优先，缺失/停用时回落内置模板。 */
    public String renderContent(String templateKey, Map<String, String> vars) {
        return renderContent(templateKey, vars, null);
    }

    /** 渲染正文：优先系统级模板，其次共用模板，最后内置模板。 */
    public String renderContent(String templateKey, Map<String, String> vars, String systemCode) {
        String tpl = activeContent(templateKey, systemCode);
        return interpolate(tpl == null ? defaultContent(templateKey) : tpl, vars);
    }

    public String renderTitle(String templateKey, Map<String, String> vars) {
        return renderTitle(templateKey, vars, null);
    }

    public String renderTitle(String templateKey, Map<String, String> vars, String systemCode) {
        AiPushTemplate row = activeTemplate(templateKey, systemCode);
        String tpl = row == null || !StringUtils.hasText(row.getTitleTpl()) ? defaultTitle() : row.getTitleTpl();
        return interpolate(tpl, vars);
    }

    /** 内置默认模板：配置页“還原內置模板”与运行时兜底共用同一份文案。 */
    public AiPushTemplate defaultTemplate(String templateKey) {
        AiPushTemplate row = new AiPushTemplate();
        row.setTemplateKey(templateKey);
        row.setName(defaultName(templateKey));
        row.setTargetType(KEY_PERSON.equals(templateKey) ? "person" : "group");
        row.setTitleTpl(defaultTitle());
        row.setContentTpl(defaultContent(templateKey));
        row.setSystemCode("rdm");
        row.setStatus("active");
        row.setUpdatedBy("system");
        return row;
    }

    /** 占位符说明：配置页直接展示可用变量与示例值。 */
    public Map<String, String> placeholders() {
        return new LinkedHashMap<>(sampleVars());
    }

    public static String defaultContent(String templateKey) {
        return KEY_PERSON.equals(templateKey) ? "您好 {{recipient}}，以下是項目進度：\n\n" + BODY : BODY;
    }

    public static String defaultTitle() {
        return "項目進度 · {{projectName}}（{{projectNo}}）";
    }

    public static String defaultName(String templateKey) {
        return KEY_PERSON.equals(templateKey) ? "項目進度 · 個人" : "項目進度 · 釘釘群";
    }

    private AiPushTemplate activeTemplate(String templateKey, String systemCode) {
        AiPushTemplate row = selectActive(templateKey, systemCode);
        if (row == null && StringUtils.hasText(systemCode) && !"common".equals(systemCode)) {
            row = selectActive(templateKey, "common");
        }
        return row;
    }

    private AiPushTemplate selectActive(String templateKey, String systemCode) {
        try {
            LambdaQueryWrapper<AiPushTemplate> wrapper = new LambdaQueryWrapper<AiPushTemplate>()
                    .eq(AiPushTemplate::getTemplateKey, templateKey)
                    .eq(AiPushTemplate::getStatus, "active")
                    .orderByDesc(AiPushTemplate::getId)
                    .last("LIMIT 1");
            if (StringUtils.hasText(systemCode)) wrapper.eq(AiPushTemplate::getSystemCode, systemCode);
            return templateMapper.selectOne(wrapper);
        } catch (Exception e) {
            log.warn("[AiPushTemplate] 读取模板失败 key={} scope={}，使用内置模板: {}",
                    templateKey, systemCode, e.getMessage());
            return null;
        }
    }

    private String activeContent(String templateKey, String systemCode) {
        AiPushTemplate row = activeTemplate(templateKey, systemCode);
        return row == null || !StringUtils.hasText(row.getContentTpl()) ? null : row.getContentTpl();
    }

    private static String interpolate(String template, Map<String, String> vars) {
        if (!StringUtils.hasText(template)) return "";
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String value = vars == null ? null : vars.get(matcher.group(1));
            matcher.appendReplacement(sb, Matcher.quoteReplacement(
                    StringUtils.hasText(value) ? value : "--"));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private static Map<String, String> sampleVars() {
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("recipient", "張三");
        vars.put("projectName", "會員增長項目");
        vars.put("projectNo", "SP202610001");
        vars.put("pm", "李四");
        vars.put("productOwner", "王五");
        vars.put("planStart", "2026-10-01");
        vars.put("planEnd", "2026-12-31");
        vars.put("deliveryProgress", "3/10（30%）");
        vars.put("deliveryInProgress", "2");
        vars.put("deliveryTesting", "1");
        vars.put("deliveryPendingAcceptance", "1");
        vars.put("deliveryBlocked", "0");
        vars.put("deliveryOverdue", "1");
        vars.put("taskProgress", "8/20（40%）");
        vars.put("blockedTasks", "1");
        vars.put("requirementTotal", "12");
        vars.put("issueOpen", "3");
        vars.put("issueCritical", "1");
        vars.put("issueMajor", "2");
        vars.put("pendingDecisionLine", "- 待決策：1 項\n");
        vars.put("noteLine", "\n> 本週重點：完成埋點驗收\n");
        vars.put("computedAt", "2026-10-21 09:00");
        return vars;
    }

    private static AiPushTemplate copyOf(AiPushTemplate src) {
        AiPushTemplate copy = new AiPushTemplate();
        copy.setId(src.getId());
        copy.setTemplateKey(src.getTemplateKey());
        copy.setName(src.getName());
        copy.setTargetType(src.getTargetType());
        copy.setTitleTpl(src.getTitleTpl());
        copy.setContentTpl(src.getContentTpl());
        copy.setStatus(src.getStatus());
        copy.setUpdatedBy(src.getUpdatedBy());
        return copy;
    }
}
