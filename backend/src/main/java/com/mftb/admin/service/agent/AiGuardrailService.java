package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiGuardRule;
import com.mftb.admin.mapper.AiGuardRuleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 输入/输出合规护栏：关键词或正则，动作 block / warn / replace。
 *
 * <p>放在编排层而不是各业务工具里：所有问题与回答都会经过这里，
 * 避免“某个工具忘了加校验”留下绕过面。规则命中的原文不写日志、不回显，
 * 只记录规则 id 与动作，防止护栏本身变成敏感信息泄漏点。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiGuardrailService {

    private static final int MAX_RULES = 200;

    private final AiGuardRuleMapper ruleMapper;

    public List<AiGuardRule> listRules() {
        return ruleMapper.selectList(new LambdaQueryWrapper<AiGuardRule>()
                .orderByDesc(AiGuardRule::getEnabled)
                .orderByDesc(AiGuardRule::getUpdatedAt));
    }

    @Transactional(rollbackFor = Exception.class)
    public AiGuardRule saveRule(AiGuardRule input, String operator) {
        if (input == null) throw new BusinessException("缺少規則內容");
        String pattern = input.getPattern() == null ? "" : input.getPattern().trim();
        if (!StringUtils.hasText(pattern)) throw new BusinessException("請填寫關鍵詞或正則");
        if (pattern.length() > 500) throw new BusinessException("規則最多 500 字");
        String ruleType = StringUtils.hasText(input.getRuleType()) ? input.getRuleType() : "keyword";
        if (!List.of("keyword", "regex").contains(ruleType)) throw new BusinessException("不支持的規則類型");
        String action = StringUtils.hasText(input.getAction()) ? input.getAction() : "warn";
        if (!List.of("block", "warn", "replace").contains(action)) throw new BusinessException("不支持的處理動作");
        String scope = StringUtils.hasText(input.getScope()) ? input.getScope() : "both";
        if (!List.of("input", "output", "both").contains(scope)) throw new BusinessException("不支持的生效範圍");
        if ("regex".equals(ruleType)) {
            try {
                Pattern.compile(pattern);
            } catch (PatternSyntaxException e) {
                throw new BusinessException("正則表達式無效：" + e.getDescription());
            }
        }
        if (input.getId() == null && countRules() >= MAX_RULES) {
            throw new BusinessException("規則條數已達上限（" + MAX_RULES + " 條）");
        }
        AiGuardRule row = input.getId() == null ? new AiGuardRule() : ruleMapper.selectById(input.getId());
        if (row == null) throw new BusinessException("規則不存在");
        row.setRuleType(ruleType);
        row.setPattern(pattern);
        row.setAction(action);
        row.setScope(scope);
        row.setReplacement(trimTo(input.getReplacement(), 200));
        row.setEnabled(input.getEnabled() == null ? 1 : input.getEnabled());
        row.setRemark(trimTo(input.getRemark(), 200));
        row.setUpdatedBy(operator);
        if (row.getId() == null) ruleMapper.insert(row);
        else ruleMapper.updateById(row);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteRule(Long id) {
        if (id == null || ruleMapper.selectById(id) == null) throw new BusinessException("規則不存在");
        ruleMapper.deleteById(id);
    }

    /** 输入护栏：block 直接拦截，replace 改写后继续，warn 仅记录。 */
    public GuardResult checkInput(String text) {
        return evaluate(text, "input");
    }

    /** 输出护栏：block 用安全话术替换整段回答，replace 局部改写。 */
    public GuardResult checkOutput(String text) {
        return evaluate(text, "output");
    }

    GuardResult evaluate(String text, String stage) {
        if (!StringUtils.hasText(text)) return GuardResult.pass(text);
        List<AiGuardRule> rules;
        try {
            rules = ruleMapper.selectList(new LambdaQueryWrapper<AiGuardRule>()
                    .eq(AiGuardRule::getEnabled, 1)
                    .in(AiGuardRule::getScope, List.of(stage, "both")));
        } catch (Exception e) {
            // 规则表不可用时放行，但不能让回答整条挂掉；失败会体现在日志里
            log.warn("[AiGuardrail] 读取规则失败，跳过护栏: {}", e.getMessage());
            return GuardResult.pass(text);
        }
        String current = text;
        List<String> warnings = new ArrayList<>();
        for (AiGuardRule rule : rules) {
            boolean hit = matches(rule, current);
            if (!hit) continue;
            String action = rule.getAction() == null ? "warn" : rule.getAction();
            if ("block".equals(action)) {
                String label = StringUtils.hasText(rule.getRemark()) ? rule.getRemark() : "敏感內容";
                log.info("[AiGuardrail] 命中拦截规则 id={} stage={}", rule.getId(), stage);
                return GuardResult.block(stage, label);
            }
            if ("replace".equals(action)) {
                current = replace(rule, current);
                warnings.add("已按規則「" + rule.getPattern() + "」替換敏感內容");
                continue;
            }
            warnings.add("命中提醒規則「" + rule.getPattern() + "」");
        }
        return GuardResult.ok(current, warnings);
    }

    private boolean matches(AiGuardRule rule, String text) {
        if (!StringUtils.hasText(rule.getPattern())) return false;
        if ("regex".equals(rule.getRuleType())) {
            try {
                return Pattern.compile(rule.getPattern(), Pattern.CASE_INSENSITIVE).matcher(text).find();
            } catch (PatternSyntaxException e) {
                log.warn("[AiGuardrail] 规则正则无效 id={}: {}", rule.getId(), e.getDescription());
                return false;
            }
        }
        return text.toLowerCase(Locale.ROOT).contains(rule.getPattern().toLowerCase(Locale.ROOT));
    }

    private String replace(AiGuardRule rule, String text) {
        String replacement = StringUtils.hasText(rule.getReplacement()) ? rule.getReplacement() : "***";
        if ("regex".equals(rule.getRuleType())) {
            try {
                return Pattern.compile(rule.getPattern(), Pattern.CASE_INSENSITIVE).matcher(text)
                        .replaceAll(replacement);
            } catch (PatternSyntaxException e) {
                return text;
            }
        }
        return text.replaceAll("(?i)" + Pattern.quote(rule.getPattern()),
                java.util.regex.Matcher.quoteReplacement(replacement));
    }

    private long countRules() {
        Long count = ruleMapper.selectCount(new LambdaQueryWrapper<AiGuardRule>());
        return count == null ? 0 : count;
    }

    private static String trimTo(String value, int max) {
        if (value == null) return null;
        String one = value.replaceAll("\\s+", " ").trim();
        if (one.isEmpty()) return null;
        return one.length() <= max ? one : one.substring(0, max);
    }

    /** 护栏结果：blocked 时应直接返回 message，不再调用模型。 */
    public static class GuardResult {
        private final boolean blocked;
        private final String text;
        private final String message;
        private final List<String> warnings;

        private GuardResult(boolean blocked, String text, String message, List<String> warnings) {
            this.blocked = blocked;
            this.text = text;
            this.message = message;
            this.warnings = warnings;
        }

        static GuardResult pass(String text) {
            return new GuardResult(false, text, null, List.of());
        }

        static GuardResult ok(String text, List<String> warnings) {
            return new GuardResult(false, text, null, warnings == null ? List.of() : warnings);
        }

        static GuardResult block(String stage, String label) {
            return new GuardResult(true, null,
                    "input".equals(stage)
                            ? "問題包含不允許的內容（" + label + "），請修改後再試"
                            : "回答包含不允許的內容（" + label + "），已攔截",
                    List.of());
        }

        public boolean isBlocked() {
            return blocked;
        }

        public String getText() {
            return text;
        }

        public String getMessage() {
            return message;
        }

        public List<String> getWarnings() {
            return warnings;
        }
    }
}
