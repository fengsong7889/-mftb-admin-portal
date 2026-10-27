package com.mftb.admin.service.agent.tool.rdm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RdmProjectFactService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 消歧结果本身就是业务数据，不能等选择一个项目后再鉴权。 */
class RdmDisambiguationSecurityTest {
    @Test void emptyScopeNeverLoadsGlobalProjectCandidates() {
        var facts = mock(RdmProjectFactService.class);
        var jdbc = mock(JdbcTemplate.class);
        var support = new RdmToolSupport(null, null, null, null, facts, mock(SysUserMapper.class), jdbc, new ObjectMapper());
        var user = new SysUser(); user.setId(5L);
        var scope = new RdmFactVO.Scope(); scope.setAuthenticated(true); scope.setRestricted(true);
        scope.setProjectIds(List.of());
        lenient().when(facts.resolveLookupScope(5L)).thenReturn(scope);
        lenient().when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(
                Map.of("id", 90L, "project_no", "SECRET-1", "name", "秘密项目一", "status", "preparing"),
                Map.of("id", 91L, "project_no", "SECRET-2", "name", "秘密项目二", "status", "preparing")));
        var result = support.resolveProject("秘密", user);
        assertFalse(result.ok()); assertTrue(result.candidates().isEmpty());
        verifyNoInteractions(jdbc);
    }

    @Test void anonymousNeverQueriesCandidates() {
        var jdbc = mock(JdbcTemplate.class);
        var support = new RdmToolSupport(null, null, null, null, mock(RdmProjectFactService.class), null, jdbc, new ObjectMapper());
        assertFalse(support.resolveProject("任意项目", null).ok());
        verifyNoInteractions(jdbc);
    }
}
