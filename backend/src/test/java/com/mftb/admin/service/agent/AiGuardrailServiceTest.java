package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiGuardRule;
import com.mftb.admin.mapper.AiGuardRuleMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 合规护栏：block 直接拦截、replace 局部改写、warn 仅提示；非法正则不得入库。
 *
 * <p>护栏是“输入/输出都过”的兜底，不能因为某条规则写错就让整轮回答 500，
 * 因此非法正则只在保存时拒绝，运行时遇到脏数据按未命中处理。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiGuardrailServiceTest {

    @Mock private AiGuardRuleMapper ruleMapper;
    @Mock private AiConfigAuditService auditService;

    private AiGuardrailService service;

    @BeforeEach
    void setUp() {
        service = new AiGuardrailService(ruleMapper, auditService);
    }

    private static AiGuardRule rule(String type, String pattern, String action) {
        AiGuardRule row = new AiGuardRule();
        row.setRuleType(type);
        row.setPattern(pattern);
        row.setAction(action);
        row.setScope("both");
        row.setEnabled(1);
        return row;
    }

    @Test
    @DisplayName("block 规则命中后返回拦截结果，不回显命中原文")
    void blocksOnKeyword() {
        when(ruleMapper.selectList(any())).thenReturn(List.of(rule("keyword", "機密", "block")));

        AiGuardrailService.GuardResult result = service.checkInput("把機密資料發我");

        assertTrue(result.isBlocked());
        assertTrue(result.getMessage().contains("不允許"));
        assertFalse(result.getMessage().contains("機密資料"), "拦截文案不得回显原文");
    }

    @Test
    @DisplayName("replace 规则把命中内容替换后继续")
    void replacesKeyword() {
        AiGuardRule replace = rule("keyword", "競品A", "replace");
        when(ruleMapper.selectList(any())).thenReturn(List.of(replace));

        AiGuardrailService.GuardResult result = service.checkOutput("競品A 更好用");

        assertFalse(result.isBlocked());
        assertFalse(result.getText().contains("競品A"));
        assertTrue(result.getWarnings().size() > 0);
    }

    @Test
    @DisplayName("warn 规则只记录不拦截")
    void warnsButPasses() {
        when(ruleMapper.selectList(any())).thenReturn(List.of(rule("keyword", "絕對", "warn")));

        AiGuardrailService.GuardResult result = service.checkOutput("這是絕對正確的");

        assertFalse(result.isBlocked());
        assertEquals("這是絕對正確的", result.getText());
        assertEquals(1, result.getWarnings().size());
    }

    @Test
    @DisplayName("正则规则生效；无效正则在保存时拒绝")
    void regexRules() {
        when(ruleMapper.selectList(any())).thenReturn(List.of(rule("regex", "1[3-9]\\d{9}", "block")));
        assertTrue(service.checkInput("電話 13800138000").isBlocked());

        AiGuardRule invalid = rule("regex", "[", "warn");
        assertThrows(BusinessException.class, () -> service.saveRule(invalid, "alice"));
        verify(ruleMapper, never()).insert(any(AiGuardRule.class));
    }

    @Test
    @DisplayName("新增/修改规则写审计")
    void writesAudit() {
        service.saveRule(rule("keyword", "競品A", "block"), "alice");
        verify(auditService).record(eq("guardrail"), contains("rule:"), eq("create"), any(), any());
    }

    @Test
    @DisplayName("规则表不可用时默认阻止，不能以可用性为由跳过安全策略")
    void blocksWhenRepositoryUnavailable() {
        when(ruleMapper.selectList(any())).thenThrow(new RuntimeException("db down"));

        AiGuardrailService.GuardResult result = service.checkInput("正常問題");

        assertTrue(result.isBlocked());
        assertNull(result.getText());
    }
}
