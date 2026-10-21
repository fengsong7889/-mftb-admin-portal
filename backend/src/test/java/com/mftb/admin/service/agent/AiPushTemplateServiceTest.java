package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiPushTemplate;
import com.mftb.admin.mapper.AiPushTemplateMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 推送模板：配置只改“长什么样”，不能因为模板缺失/停用让推送不可用。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiPushTemplateServiceTest {

    @Mock private AiPushTemplateMapper templateMapper;
    @Mock private AiConfigAuditService auditService;
    @Mock private OperatorResolver operatorResolver;

    private AiPushTemplateService service;

    @BeforeEach
    void setUp() {
        service = new AiPushTemplateService(templateMapper, auditService, operatorResolver);
        when(operatorResolver.currentOperatorName()).thenReturn("alice");
    }

    @Test
    @DisplayName("未配置模板时回落内置模板，推送仍可用")
    void fallsBackToBuiltinWhenMissing() {
        when(templateMapper.selectOne(any())).thenReturn(null);

        String group = service.renderContent(AiPushTemplateService.KEY_GROUP, Map.of());
        String person = service.renderContent(AiPushTemplateService.KEY_PERSON, Map.of("recipient", "張三"));

        assertTrue(group.contains("## --（--）"));
        assertTrue(person.startsWith("您好 張三"));
    }

    @Test
    @DisplayName("DB 模板优先，占位符替换；未知占位符渲染为 --")
    void rendersDbTemplate() {
        AiPushTemplate row = new AiPushTemplate();
        row.setTemplateKey(AiPushTemplateService.KEY_GROUP);
        row.setTitleTpl("{{projectName}} 進度");
        row.setContentTpl("## {{projectName}}\n- 負責人：{{pm}}\n- 未知：{{unknownKey}}");
        row.setStatus("active");
        when(templateMapper.selectOne(any())).thenReturn(row);

        String title = service.renderTitle(AiPushTemplateService.KEY_GROUP,
                Map.of("projectName", "會員增長"));
        String content = service.renderContent(AiPushTemplateService.KEY_GROUP,
                Map.of("projectName", "會員增長", "pm", "李四"));

        assertEquals("會員增長 進度", title);
        assertTrue(content.contains("負責人：李四"));
        assertTrue(content.contains("未知：--"));
    }

    @Test
    @DisplayName("列表补齐未配置的内置模板，运营能看到系统默认")
    void listIncludesBuiltin() {
        when(templateMapper.selectList(any())).thenReturn(List.of());

        List<AiPushTemplate> rows = service.list();

        assertEquals(2, rows.size());
    }

    @Test
    @DisplayName("拒绝未知模板标识与空正文，避免写入永不生效的模板")
    void rejectsUnknownKeyAndEmptyContent() {
        AiPushTemplate unknown = new AiPushTemplate();
        unknown.setTemplateKey("whatever");
        unknown.setContentTpl("x");
        assertThrows(BusinessException.class, () -> service.save(unknown));

        AiPushTemplate empty = new AiPushTemplate();
        empty.setTemplateKey(AiPushTemplateService.KEY_GROUP);
        empty.setContentTpl("  ");
        assertThrows(BusinessException.class, () -> service.save(empty));

        verify(templateMapper, never()).insert(any(AiPushTemplate.class));
    }
}
