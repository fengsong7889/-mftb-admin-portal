package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.FinApprovalQuery;
import com.mftb.admin.dto.FinBatchQuery;
import com.mftb.admin.entity.FinApproval;
import com.mftb.admin.entity.FinBatch;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.*;
import com.mftb.admin.service.impl.FinApprovalServiceImpl;
import com.mftb.admin.service.impl.FinBatchServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** WP01：直接调用真实查询服务，不能由 Controller 的权限注解替代资源过滤。 */
@ExtendWith(MockitoExtension.class)
class AgentResourceBaselineTest {
    @Mock FinBatchMapper batchMapper;
    @Mock FinApprovalMapper approvalMapper;
    @Mock DataScopeService dataScopeService;
    @Mock PermissionService permissionService;
    @Mock OperatorResolver operatorResolver;
    @InjectMocks FinBatchServiceImpl batches;
    @InjectMocks FinApprovalServiceImpl approvals;
    private SysUser user;

    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), FinBatch.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), FinApproval.class);
        user = new SysUser(); user.setId(7L); user.setUsername("reader"); user.setStatus(1);
        lenient().when(operatorResolver.currentUser()).thenReturn(user);
        lenient().when(permissionService.hasPermission(eq(user), anyString(), eq("view"))).thenReturn(true);
        lenient().when(permissionService.resolveSystemCodeOfMenu(anyString())).thenReturn("finance");
        lenient().when(permissionService.hasSystemAccess(user, "finance")).thenReturn(true);
        lenient().when(batchMapper.selectPage(any(), any())).thenReturn(new Page<FinBatch>(1, 10));
        lenient().when(approvalMapper.selectPage(any(), any())).thenReturn(new Page<FinApproval>(1, 10));
    }

    @Test void emptyScopeNeverReadsBatchesOrTheirCount() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(Set.of());
        assertEquals(0L, batches.page(new FinBatchQuery()).getTotal());
        verifyNoInteractions(batchMapper);
    }

    @Test void emptyScopeNeverReadsApprovalsOrTheirCount() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(Set.of());
        assertEquals(0L, approvals.page(new FinApprovalQuery()).getTotal());
        verifyNoInteractions(approvalMapper);
    }

    @Test void anonymousCannotDirectlyReadFinance() {
        when(operatorResolver.currentUser()).thenReturn(null);
        assertThrows(BusinessException.class, () -> batches.page(new FinBatchQuery()));
        assertThrows(BusinessException.class, () -> approvals.page(new FinApprovalQuery()));
        verifyNoInteractions(batchMapper, approvalMapper);
    }

    @Test void menuPermissionDoesNotReplaceSystemAccess() {
        when(permissionService.hasSystemAccess(user, "finance")).thenReturn(false);
        assertThrows(BusinessException.class, () -> batches.page(new FinBatchQuery()));
        verifyNoInteractions(batchMapper, dataScopeService);
    }

    @Test void scopeFailureDoesNotFallBackToAllRows() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenThrow(new IllegalStateException("private database detail"));
        var error = assertThrows(BusinessException.class, () -> approvals.page(new FinApprovalQuery()));
        assertFalse(error.getMessage().contains("private database detail"));
        verifyNoInteractions(approvalMapper);
    }

    @Test void listAndCountShareTheSameGroupRestriction() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(Set.of("G-AUTHORIZED"));
        batches.page(new FinBatchQuery());
        approvals.page(new FinApprovalQuery());

        @SuppressWarnings("unchecked")
        var batchWrapper = (com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FinBatch>)
                org.mockito.Mockito.mockingDetails(batchMapper).getInvocations().stream()
                        .filter(i -> i.getMethod().getName().equals("selectPage"))
                        .findFirst().orElseThrow().getArgument(1);
        String batchSql = batchWrapper.getSqlSegment();
        assertTrue(batchSql.contains("group_code IN"), batchSql);
        assertTrue(batchSql.contains("JSON_CONTAINS"), "转账/合并需双方集团均可见: " + batchSql);

        @SuppressWarnings("unchecked")
        var approvalWrapper = (com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FinApproval>)
                org.mockito.Mockito.mockingDetails(approvalMapper).getInvocations().stream()
                        .filter(i -> i.getMethod().getName().equals("selectPage"))
                        .findFirst().orElseThrow().getArgument(1);
        assertTrue(approvalWrapper.getSqlSegment().contains("group_code IN"));
    }

    @Test void knowledgeSearchWithoutPrincipalNeverReachesEitherEngine() {
        var jdbc = mock(JdbcTemplate.class);
        var docs = mock(AiKnowledgeDocMapper.class);
        var chunks = mock(AiKnowledgeChunkMapper.class);
        var acl = new com.mftb.admin.service.agent.platform.AiKnowledgeAclService(jdbc);
        var service = new AiKnowledgeService(docs, chunks, jdbc, mock(AiConfigAuditService.class), acl);
        // 无身份：直接空结果，不能落到“全库可读”
        assertTrue(service.search("人事薪資", "hr", 10, null).isEmpty());
        // 有身份但无匹配 ACL：结果是空，不是全部文档
        var user = new SysUser();
        user.setId(7L);
        user.setStatus(1);
        org.mockito.Mockito.lenient().when(jdbc.query(anyString(),
                any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class))).thenReturn(List.of());
        assertTrue(service.search("人事薪資", "hr", 10, user).isEmpty());
        verify(docs, never()).selectList(any());
        verify(chunks, never()).selectList(any());
    }
}
