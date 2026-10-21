package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiKnowledgeChunk;
import com.mftb.admin.entity.AiKnowledgeDoc;
import com.mftb.admin.mapper.AiKnowledgeChunkMapper;
import com.mftb.admin.mapper.AiKnowledgeDocMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 知识库：切分口径、保存校验、分块重建。
 *
 * <p>切分重叠是为了避免答案被窗口边界切断；这里钉住“长文一定被切成多块且带重叠”，
 * 避免以后有人把窗口改成整篇塞入导致检索命中率下降。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiKnowledgeServiceTest {

    @Mock private AiKnowledgeDocMapper docMapper;
    @Mock private AiKnowledgeChunkMapper chunkMapper;
    @Mock private JdbcTemplate jdbcTemplate;

    private AiKnowledgeService service;

    @BeforeEach
    void setUp() {
        service = new AiKnowledgeService(docMapper, chunkMapper, jdbcTemplate);
    }

    @Test
    @DisplayName("长文按窗口切分且相邻块有重叠，空内容不产生分块")
    void splitsIntoOverlappingChunks() {
        String content = "需求".repeat(600);
        List<String> chunks = AiKnowledgeService.split(content);

        assertTrue(chunks.size() > 1, "600 字应切成多块");
        assertTrue(chunks.get(0).length() <= 420);
        assertTrue(chunks.get(0).endsWith(chunks.get(1).substring(0, 30)),
                "相邻块应保留重叠，避免答案被切断");
        assertTrue(AiKnowledgeService.split("   ").isEmpty());
    }

    @Test
    @DisplayName("标题或正文为空、正文超限时拒绝保存")
    void rejectsInvalidDoc() {
        AiKnowledgeDoc noTitle = new AiKnowledgeDoc();
        noTitle.setContent("內容");
        assertThrows(BusinessException.class, () -> service.save(noTitle, "alice"));

        AiKnowledgeDoc noContent = new AiKnowledgeDoc();
        noContent.setTitle("標題");
        assertThrows(BusinessException.class, () -> service.save(noContent, "alice"));

        AiKnowledgeDoc tooLong = new AiKnowledgeDoc();
        tooLong.setTitle("標題");
        tooLong.setContent("字".repeat(60_001));
        assertThrows(BusinessException.class, () -> service.save(tooLong, "alice"));
    }

    @Test
    @DisplayName("保存已有文档时重建分块并回写块数")
    void savesExistingDocAndRebuildsChunks() {
        AiKnowledgeDoc existing = new AiKnowledgeDoc();
        existing.setId(5L);
        existing.setTitle("舊標題");
        existing.setContent("舊內容");
        existing.setStatus("active");
        when(docMapper.selectById(5L)).thenReturn(existing);

        AiKnowledgeDoc input = new AiKnowledgeDoc();
        input.setId(5L);
        input.setTitle("日報規範");
        input.setSystemCode("rdm");
        input.setContent("日報每天推送一次。".repeat(120));

        AiKnowledgeDoc saved = service.save(input, "alice");

        assertEquals("rdm", saved.getSystemCode());
        assertTrue(saved.getChunkCount() > 1, "长文应被切为多块");
        verify(chunkMapper).delete(any());
        verify(chunkMapper, times(saved.getChunkCount())).insert(any(AiKnowledgeChunk.class));
        verify(docMapper, times(2)).updateById(any(AiKnowledgeDoc.class));
    }

    @Test
    @DisplayName("关键词切分忽略语气词与单字")
    void tokenizesQuery() {
        List<String> tokens = AiKnowledgeService.tokens("RDM 日報推送 什麼 怎麼配置");

        assertTrue(tokens.contains("日報推送"));
        assertTrue(tokens.contains("RDM"));
        assertTrue(!tokens.contains("什麼"));
    }
}
