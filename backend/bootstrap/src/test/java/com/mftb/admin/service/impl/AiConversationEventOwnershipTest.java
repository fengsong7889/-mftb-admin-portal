package com.mftb.admin.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiConversationEventMapper;
import com.mftb.admin.mapper.AiConversationMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 事件服务是第二道边界；调用者不能把事件挂到其他人的会话。 */
@ExtendWith(MockitoExtension.class)
class AiConversationEventOwnershipTest {
    @Mock AiConversationEventMapper eventMapper;
    @Mock AiConversationMapper conversationMapper;
    @Mock OperatorResolver operatorResolver;
    @Mock PermissionService permissionService;
    @Spy ObjectMapper objectMapper = new ObjectMapper();
    @InjectMocks AiConversationEventServiceImpl service;
    private SysUser user;

    @BeforeEach void setup() {
        user = new SysUser(); user.setId(7L); user.setUsername("alice"); user.setStatus(1);
        lenient().when(operatorResolver.currentUser()).thenReturn(user);
        lenient().when(operatorResolver.currentOperatorAccount()).thenReturn("alice");
    }

    @Test void cannotAppendToAnotherUsersConversation() {
        var conv = new AiConversation(); conv.setId(9L); conv.setUsername("bob");
        lenient().when(conversationMapper.selectById(9L)).thenReturn(conv);
        assertThrows(BusinessException.class, () -> service.append(9L, null, "USER_TURN", "alice", Map.of()));
        verifyNoInteractions(eventMapper);
    }

    @Test void suppliedActorDoesNotOverrideIdentity() {
        assertThrows(BusinessException.class, () -> service.append(9L, null, "USER_TURN", "bob", Map.of()));
        verifyNoInteractions(eventMapper);
    }

    @Test void missingIdentityIsNotAnInternalBypass() {
        when(operatorResolver.currentOperatorAccount()).thenReturn(null);
        assertThrows(BusinessException.class, () -> service.append(9L, null, "USER_TURN", "alice", Map.of()));
        verifyNoInteractions(eventMapper);
    }

    @Test void directAuditReadRequiresAuditPermission() {
        assertThrows(BusinessException.class, () -> service.listByConversation(9L, 200));
        verifyNoInteractions(eventMapper);
    }

    @Test void noConversationStillValidatesIdentity() {
        assertNull(service.requireOwned(null, "alice"));
        assertThrows(BusinessException.class, () -> service.requireOwned(null, "bob"));
    }

    @Test void suppliedConversationNumberMustMatchDatabase() {
        var conv = new AiConversation(); conv.setId(9L); conv.setUsername("alice"); conv.setConversationId("DH-REAL");
        when(conversationMapper.selectById(9L)).thenReturn(conv);
        assertThrows(BusinessException.class,
                () -> service.append(9L, "DH-FORGED", "USER_TURN", "alice", Map.of()));
        verifyNoInteractions(eventMapper);
    }

    @Test void auditReadRequiresAuditMenuAndSystem() {
        lenient().when(permissionService.hasPermission(user, "ai-conversation-audit", "view")).thenReturn(true);
        when(permissionService.hasSystemAccess(user, "ai")).thenReturn(false);
        assertThrows(BusinessException.class, () -> service.listByConversation(9L, 200));
        verifyNoInteractions(eventMapper);
    }
}
