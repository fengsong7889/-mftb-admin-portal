package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiUserMemory;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiUserMemoryMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 长期记忆服务：敏感信息拦截、同用户去重、条数上限、注入 Prompt 的截断与条数。
 *
 * <p>这些都是「错误记忆会长期污染回答」级别的风险，不能只靠前端校验：
 * 绕过 UI 直接调 /api/ai/memories 也必须被拒绝。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiUserMemoryServiceTest {

    @Mock private AiUserMemoryMapper memoryMapper;
    @Mock private OperatorResolver operatorResolver;
    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private AiRuntimeSettingService settingService;

    private AiUserMemoryService service;

    @BeforeEach
    void setUp() {
        service = new AiUserMemoryService(memoryMapper, operatorResolver, jdbcTemplate, settingService);
        // 未配置时按代码默认值（50 条/180 天/注入 10 条），避免 mock 返回 0 把 LIMIT 变成 0
        when(settingService.getInt(anyString(), anyInt()))
                .thenAnswer(inv -> inv.getArgument(1));
        when(settingService.getBool(anyString(), anyBoolean()))
                .thenAnswer(inv -> inv.getArgument(1));
        SysUser user = new SysUser();
        user.setId(9L);
        when(operatorResolver.currentUser()).thenReturn(user);
    }

    private static AiUserMemory input(String content) {
        AiUserMemory row = new AiUserMemory();
        row.setContent(content);
        return row;
    }

    @Test
    @DisplayName("手机号/邮箱等敏感内容必须拒绝写入")
    void rejectsSensitiveContent() {
        assertThrows(BusinessException.class, () -> service.create(input("我的手機 13800138000")));
        assertThrows(BusinessException.class, () -> service.create(input("郵箱 a@b.com")));
        assertThrows(BusinessException.class, () -> service.create(input("我的密碼是 abc")));
        verify(memoryMapper, never()).insert(any(AiUserMemory.class));
    }

    @Test
    @DisplayName("同用户同内容重复保存时提示已存在，不产生第二条")
    void rejectsActiveDuplicate() {
        AiUserMemory existing = input("以後回答用表格");
        existing.setId(1L);
        existing.setStatus("active");
        when(memoryMapper.selectOne(any())).thenReturn(existing);

        BusinessException e = assertThrows(BusinessException.class, () -> service.create(input("以後回答用表格")));
        assertTrue(e.getMessage().contains("已存在"), e.getMessage());
        verify(memoryMapper, never()).insert(any(AiUserMemory.class));
    }

    @Test
    @DisplayName("已停用的同内容记忆再次保存时直接重新启用")
    void reactivatesDisabledDuplicate() {
        AiUserMemory existing = input("以後回答用表格");
        existing.setId(2L);
        existing.setStatus("disabled");
        existing.setExpiresAt(LocalDateTime.now().minusDays(1));
        when(memoryMapper.selectOne(any())).thenReturn(existing);

        AiUserMemory saved = service.create(input("以後回答用表格"));

        assertSame(existing, saved);
        assertEquals("active", saved.getStatus());
        assertTrue(saved.getExpiresAt().isAfter(LocalDateTime.now()), "重新启用要顺延有效期");
        verify(memoryMapper).updateById(existing);
        verify(memoryMapper, never()).insert(any(AiUserMemory.class));
    }

    @Test
    @DisplayName("达到 50 条上限后拒绝继续新增")
    void rejectsWhenCapReached() {
        when(memoryMapper.selectOne(any())).thenReturn(null);
        when(memoryMapper.selectCount(any())).thenReturn(50L);

        BusinessException e = assertThrows(BusinessException.class, () -> service.create(input("新偏好")));
        assertTrue(e.getMessage().contains("上限"), e.getMessage());
        verify(memoryMapper, never()).insert(any(AiUserMemory.class));
    }

    @Test
    @DisplayName("新增时落到当前用户名下并计算内容指纹")
    void createBindsCurrentUserAndHash() {
        when(memoryMapper.selectOne(any())).thenReturn(null);
        when(memoryMapper.selectCount(any())).thenReturn(0L);

        service.create(input("  回答盡量  用表格  "));

        ArgumentCaptor<AiUserMemory> cap = ArgumentCaptor.forClass(AiUserMemory.class);
        verify(memoryMapper).insert(cap.capture());
        AiUserMemory row = cap.getValue();
        assertEquals(9L, row.getUserId());
        assertEquals("回答盡量 用表格", row.getContent(), "空白要归一化，否则去重会失效");
        assertEquals(64, row.getContentHash().length());
        assertEquals("active", row.getStatus());
    }

    @Test
    @DisplayName("Prompt 只注入最近 10 条，单条超 120 字截断加省略号")
    void promptSectionTruncatesLongContent() {
        AiUserMemory longRow = input("啊".repeat(200));
        when(memoryMapper.selectList(any())).thenReturn(List.of(longRow));

        String section = service.promptSection();

        assertTrue(section.startsWith("- "), section);
        assertTrue(section.endsWith("…"), "超长记忆要截断：" + section);
        assertEquals(2 + 120 + 1, section.length());
    }

    @Test
    @DisplayName("按问题检索无命中时回退最近记忆")
    void relevantSearchFallsBackToLatest() {
        AiUserMemory row = input("回答先給結論");
        when(memoryMapper.selectList(any())).thenReturn(List.of(row));

        String section = service.promptSection("完全不相關的問題");

        assertEquals("- 回答先給結論", section);
    }

    @Test
    @DisplayName("未登录时不注入任何偏好")
    void promptSectionSkipsAnonymous() {
        when(operatorResolver.currentUser()).thenReturn(null);

        assertNull(service.promptSection());
        verify(memoryMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("不能操作他人记忆")
    void updateRejectsOtherUsersMemory() {
        AiUserMemory other = input("別人的記憶");
        other.setId(5L);
        other.setUserId(8L);
        when(memoryMapper.selectById(5L)).thenReturn(other);

        AiUserMemory change = input("改掉");
        assertThrows(BusinessException.class, () -> service.update(5L, change));
        assertThrows(BusinessException.class, () -> service.delete(5L));
        verify(memoryMapper, never()).updateById(any(AiUserMemory.class));
        verify(memoryMapper, never()).deleteById(any(Long.class));
    }

    @Test
    @DisplayName("非法状态值必须拒绝")
    void updateRejectsUnknownStatus() {
        AiUserMemory mine = input("我的偏好");
        mine.setId(6L);
        mine.setUserId(9L);
        when(memoryMapper.selectById(6L)).thenReturn(mine);

        AiUserMemory change = new AiUserMemory();
        change.setStatus("deleted");

        assertThrows(BusinessException.class, () -> service.update(6L, change));
        verify(memoryMapper, never()).updateById(any(AiUserMemory.class));
    }
}
