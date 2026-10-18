package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.entity.HrOperationAudit;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrOperationAuditMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 人事操作审计写入测试（方案 §5.5 + §7.4）。
 * <p>重点钉三件容易写错的事：敏感值必须在<b>写入时</b>就脱敏、字段级变更一次落多行、
 * 以及「什么都没改」不许落噪声行。
 */
class HrAuditServiceTest {

    private static final long USER_ID = 55L;

    private HrOperationAuditMapper auditMapper;
    private SysUserMapper sysUserMapper;
    private OperatorResolver operatorResolver;
    private HrAuditServiceImpl service;

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, HrOperationAudit.class);
        auditMapper = mock(HrOperationAuditMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new HrAuditServiceImpl(auditMapper, sysUserMapper, operatorResolver);

        SysUser user = new SysUser();
        user.setId(USER_ID);
        user.setEmpId("MF00055");
        user.setUsername("MF00055");
        when(sysUserMapper.selectById(USER_ID)).thenReturn(user);
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");
    }

    @Test
    @DisplayName("两个字段变更落两行，并带上工号快照与操作人")
    void writesOneRowPerChangedField() {
        service.record(HrAuditEntry.of(HrAuditAction.EMPLOYEE_UPDATE, USER_ID)
                .change("department", "市場部", "營運中心")
                .change("position", "專員", "高級專員"));

        List<HrOperationAudit> rows = insertedRows();
        assertEquals(2, rows.size());
        assertEquals("department", rows.get(0).getFieldName());
        assertEquals("營運中心", rows.get(0).getAfterValue());
        assertEquals("MF00055", rows.get(0).getEmpNo());
        assertEquals("HR專員", rows.get(0).getOperator());
        assertEquals(0, rows.get(0).getSensitive());
    }

    @Test
    @DisplayName("值没变就不落行（含 null 与空串这种伪变更）")
    void unchangedValuesAreNotRecorded() {
        service.record(HrAuditEntry.of(HrAuditAction.EMPLOYEE_UPDATE, USER_ID)
                .change("department", "市場部", "市場部")
                .change("nativePlace", null, "  "));

        verify(auditMapper, never()).insert(any(HrOperationAudit.class));
    }

    @Test
    @DisplayName("敏感字段在写入时就脱敏，审计表不留明文")
    void sensitiveFieldsMaskedOnWrite() {
        service.record(HrAuditEntry.of(HrAuditAction.PROFILE_UPDATE, USER_ID)
                .change("idNumber", "Z1234567890X", "A9876543210B")
                .change("mobile", "13800001111", "13900002222")
                .change("email", "hr@example.com", "new@example.com"));

        List<HrOperationAudit> rows = insertedRows();
        assertEquals(3, rows.size());
        for (HrOperationAudit row : rows) {
            assertTrue(row.getSensitive() == 1, "敏感字段变更必须标 sensitive: " + row.getFieldName());
            assertTrue(!String.valueOf(row.getBeforeValue()).contains("1234567890"),
                    "证件号明文进了审计: " + row.getBeforeValue());
            assertTrue(!String.valueOf(row.getAfterValue()).contains("9876543210"),
                    "证件号明文进了审计: " + row.getAfterValue());
            assertTrue(!String.valueOf(row.getBeforeValue()).contains("000011"),
                    "手机号明文进了审计: " + row.getBeforeValue());
            assertTrue(!String.valueOf(row.getAfterValue()).contains("hr@example"),
                    "邮箱明文进了审计: " + row.getAfterValue());
        }
    }

    @Test
    @DisplayName("明文查看这类动作没有前后值，也要留一行")
    void actionLevelTraceIsStillRecorded() {
        service.record(HrAuditEntry.of(HrAuditAction.SENSITIVE_VIEW, USER_ID)
                .detail("查看明文：证件号/证件地址/详细住址"));

        List<HrOperationAudit> rows = insertedRows();
        assertEquals(1, rows.size());
        assertNull(rows.get(0).getFieldName());
        assertEquals(1, rows.get(0).getSensitive(), "SENSITIVE_VIEW 本身即敏感动作");
    }

    @Test
    @DisplayName("未知动作码直接拒绝，不落一条翻译不出来的审计")
    void unknownActionIsRejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.record(HrAuditEntry.of("WHO_KNOWS", USER_ID).detail("x")));
        assertTrue(ex.getMessage().contains("WHO_KNOWS"));
        verify(auditMapper, never()).insert(any(HrOperationAudit.class));
    }

    @Test
    @DisplayName("缺目标员工直接拒绝：审计行如果没有「被操作的是谁」就毫无检索价值")
    void missingTargetIsRejected() {
        assertThrows(BusinessException.class,
                () -> service.record(HrAuditEntry.of(HrAuditAction.ROLE_BIND, null).detail("x")));
    }

    @Test
    @DisplayName("超长值截断而不是让整笔业务写入失败")
    void longValuesAreTruncated() {
        String longText = "長".repeat(600);
        service.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, USER_ID).detail(longText));

        HrOperationAudit row = insertedRows().get(0);
        assertEquals(500, row.getDetail().length());
    }

    private List<HrOperationAudit> insertedRows() {
        ArgumentCaptor<HrOperationAudit> captor = ArgumentCaptor.forClass(HrOperationAudit.class);
        verify(auditMapper, org.mockito.Mockito.atLeastOnce()).insert(captor.capture());
        return new ArrayList<>(captor.getAllValues());
    }
}
