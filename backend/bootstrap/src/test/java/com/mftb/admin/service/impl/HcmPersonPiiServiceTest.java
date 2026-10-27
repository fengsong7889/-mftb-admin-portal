package com.mftb.admin.service.impl;

import com.mftb.admin.entity.HcmPiiAccessLog;
import com.mftb.admin.entity.Person;
import com.mftb.admin.mapper.HcmPiiAccessLogMapper;
import com.mftb.admin.service.PermissionService;
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

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * C5 字段级口径的正反用例：
 * 无权限 → 掩码且不留痕；有权限 → 明文且必须留痕；本来没有敏感值 → 两者都不做；
 * 留痕失败不得把读取打成 500。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HcmPersonPiiServiceTest {

    @Mock private PermissionService permissionService;
    @Mock private OperatorResolver operatorResolver;
    @Mock private HcmPiiAccessLogMapper accessLogMapper;

    private HcmPersonPiiServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new HcmPersonPiiServiceImpl(permissionService, operatorResolver, accessLogMapper);
        when(operatorResolver.currentUser()).thenReturn(null);
        when(operatorResolver.currentOperatorAccount()).thenReturn("TEST01");
    }

    @Test
    @DisplayName("无 viewSensitive：返回掩码且不写留痕")
    void masksWithoutPermissionAndSkipsAudit() {
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(false);
        Person person = person();

        service.applyMasking(person, "detail");

        assertEquals("138****8000", person.getMobile());
        assertEquals("z***@example.com", person.getEmail());
        assertNull(person.getBirthDate());
        verify(accessLogMapper, never()).insert(any(HcmPiiAccessLog.class));
    }

    @Test
    @DisplayName("有 viewSensitive：保留明文并写留痕（含字段组与场景）")
    void keepsPlaintextAndWritesAuditWithPermission() {
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(true);
        Person person = person();

        service.applyMasking(person, "detail");

        assertEquals("13800138000", person.getMobile());
        assertEquals("zhangsan@example.com", person.getEmail());
        assertEquals(LocalDate.of(1990, 1, 1), person.getBirthDate());

        ArgumentCaptor<HcmPiiAccessLog> captor = ArgumentCaptor.forClass(HcmPiiAccessLog.class);
        verify(accessLogMapper).insert(captor.capture());
        HcmPiiAccessLog log = captor.getValue();
        assertEquals("TEST01", log.getActor());
        assertEquals(7L, log.getPersonId());
        assertEquals("mobile,email,birthDate", log.getFields());
        assertEquals("detail", log.getScene());
    }

    @Test
    @DisplayName("本来没有敏感值：既不掩码也不留痕")
    void skipsWhenNoSensitiveValue() {
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(true);
        Person person = new Person();
        person.setId(8L);
        person.setName("无联系方式");

        service.applyMasking(person, "list");

        assertNull(person.getMobile());
        verify(accessLogMapper, never()).insert(any(HcmPiiAccessLog.class));
    }

    @Test
    @DisplayName("留痕失败不阻断读取")
    void auditFailureDoesNotBreakRead() {
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(true);
        when(accessLogMapper.insert(any(HcmPiiAccessLog.class))).thenThrow(new RuntimeException("db down"));
        Person person = person();

        assertDoesNotThrow(() -> service.applyMasking(person, "detail"));
        assertEquals("13800138000", person.getMobile());
    }

    private Person person() {
        Person person = new Person();
        person.setId(7L);
        person.setName("张三");
        person.setMobile("13800138000");
        person.setEmail("zhangsan@example.com");
        person.setBirthDate(LocalDate.of(1990, 1, 1));
        return person;
    }
}
