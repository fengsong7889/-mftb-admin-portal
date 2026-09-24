package com.mftb.admin.service.impl;

import com.mftb.admin.entity.AiToolExecLog;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.mapper.AiToolExecLogMapper;
import com.mftb.admin.mapper.AiToolPolicyMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §B.2：ai_tool_policy 默认拒绝/启停/审批凭证 + 审计落库 单元测试 */
@ExtendWith(MockitoExtension.class)
class AiToolPolicyServiceTest {

    @Mock private AiToolPolicyMapper policyMapper;
    @Mock private AiToolExecLogMapper execLogMapper;
    @Mock private OperatorResolver operatorResolver;

    @InjectMocks private AiToolPolicyServiceImpl service;

    @Test
    void unregisteredToolRejectedAndAudited() {
        when(policyMapper.selectOne(any())).thenReturn(null);

        assertThrows(IllegalArgumentException.class,
                () -> service.enforce("brand_new_tool", null, "alice", "abc"));

        ArgumentCaptor<AiToolExecLog> cap = ArgumentCaptor.forClass(AiToolExecLog.class);
        verify(execLogMapper, times(1)).insert(cap.capture());
        assertEquals("reject", cap.getValue().getDecision());
        assertEquals("policy_not_registered", cap.getValue().getRejectReason());
        assertEquals("brand_new_tool", cap.getValue().getToolKey());
    }

    @Test
    void disabledPolicyRejected() {
        AiToolPolicy disabled = new AiToolPolicy();
        disabled.setToolKey("query_account_balance");
        disabled.setEnabled(0);
        when(policyMapper.selectOne(any())).thenReturn(disabled);

        assertThrows(IllegalArgumentException.class,
                () -> service.enforce("query_account_balance", null, "alice", "digest"));

        ArgumentCaptor<AiToolExecLog> cap = ArgumentCaptor.forClass(AiToolExecLog.class);
        verify(execLogMapper).insert(cap.capture());
        assertEquals("policy_disabled", cap.getValue().getRejectReason());
    }

    @Test
    void approvalTokenMissingRejectedWithDedicatedDecision() {
        AiToolPolicy needsApproval = new AiToolPolicy();
        needsApproval.setToolKey("send_email");
        needsApproval.setEnabled(1);
        needsApproval.setRequireApproval(1);
        when(policyMapper.selectOne(any())).thenReturn(needsApproval);

        assertThrows(IllegalArgumentException.class,
                () -> service.enforce("send_email", null, "alice", "digest"));

        ArgumentCaptor<AiToolExecLog> cap = ArgumentCaptor.forClass(AiToolExecLog.class);
        verify(execLogMapper).insert(cap.capture());
        assertEquals("approval_required", cap.getValue().getDecision());
    }

    @Test
    void allowedPolicyReturnsInstanceWithoutAuditWrite() {
        AiToolPolicy ok = new AiToolPolicy();
        ok.setToolKey("query_approvals");
        ok.setEnabled(1);
        ok.setRequireApproval(0);
        when(policyMapper.selectOne(any())).thenReturn(ok);

        AiToolPolicy returned = service.enforce("query_approvals", null, "alice", "digest");
        assertSame(ok, returned);
        verify(execLogMapper, times(0)).insert(any(AiToolExecLog.class));
    }

    @Test
    void saveInsertsWhenAbsentAndUpdatesWhenPresent() {
        when(policyMapper.selectOne(any())).thenReturn(null);
        AiToolPolicy fresh = new AiToolPolicy();
        fresh.setToolKey("new_tool");
        service.save(fresh, "admin");
        verify(policyMapper).insert(fresh);
        assertEquals(0, fresh.getEnabled());
        assertEquals("admin", fresh.getUpdatedBy());
    }
}
