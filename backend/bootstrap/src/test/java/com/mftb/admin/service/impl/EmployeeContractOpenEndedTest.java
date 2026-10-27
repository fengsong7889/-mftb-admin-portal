package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 合同台账的无固定期限口径（方案 6.2）。
 * <p>
 * 「结束日期必填」曾把无固定期限合同挡在门外：这类合同本来就没有终止日，
 * 强制填写的结果是有人随便填一个远期日期冒充事实。现在 endDate 为空即无固定期限，
 * 有值时仍校验不得早于开始日期。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EmployeeContractOpenEndedTest {

    @Mock private EmpContractMapper contractMapper;
    @Mock private SysUserMapper sysUserMapper;
    @Mock private OperatorResolver operatorResolver;
    @Mock private HrAuditService hrAuditService;

    private EmployeeContractServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new EmployeeContractServiceImpl(contractMapper, sysUserMapper, operatorResolver, hrAuditService);
        when(sysUserMapper.selectById(any())).thenReturn(new SysUser());
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
    }

    @Test
    @DisplayName("无固定期限合同：结束日期为空也能保存")
    void allowsOpenEndedContract() {
        EmpContract contract = new EmpContract();
        contract.setContractNo("HT-2026-001");
        contract.setContractType("劳动合同");
        contract.setStartDate(LocalDate.of(2026, 1, 1));
        contract.setEndDate(null);

        assertDoesNotThrow(() -> service.create(1L, contract));
        verify(contractMapper).insert(contract);
    }

    @Test
    @DisplayName("有结束日期时仍校验不得早于开始日期")
    void rejectsEndBeforeStart() {
        EmpContract contract = new EmpContract();
        contract.setContractNo("HT-2026-002");
        contract.setContractType("劳动合同");
        contract.setStartDate(LocalDate.of(2026, 6, 1));
        contract.setEndDate(LocalDate.of(2026, 5, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(1L, contract));
        assertEquals("合同結束日期不能早於開始日期", ex.getMessage());
        verify(contractMapper, never()).insert(any(EmpContract.class));
    }

    @Test
    @DisplayName("合同编号仍必填")
    void rejectsMissingContractNo() {
        EmpContract contract = new EmpContract();
        contract.setContractType("劳动合同");
        contract.setStartDate(LocalDate.of(2026, 1, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(1L, contract));
        assertEquals("合同編號不能為空", ex.getMessage());
    }

    @Test
    @DisplayName("续签必须关联同一员工的上一份合同")
    void rejectsRenewWithoutPrevious() {
        EmpContract contract = new EmpContract();
        contract.setContractNo("HT-2026-003");
        contract.setContractType("劳动合同");
        contract.setStartDate(LocalDate.of(2026, 1, 1));
        contract.setChangeType("RENEW");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(1L, contract));
        assertEquals("續簽/變更必須關聯上一份合同", ex.getMessage());
    }

    @Test
    @DisplayName("关联的上一份合同不属于该员工时拒绝（防止链路串到别人身上）")
    void rejectsPreviousContractOfAnotherEmployee() {
        EmpContract previous = new EmpContract();
        previous.setId(88L);
        previous.setUserId(999L);
        when(contractMapper.selectById(88L)).thenReturn(previous);

        EmpContract contract = new EmpContract();
        contract.setContractNo("HT-2026-004");
        contract.setContractType("劳动合同");
        contract.setStartDate(LocalDate.of(2026, 1, 1));
        contract.setChangeType("RENEW");
        contract.setPreviousContractId(88L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(1L, contract));
        assertEquals("關聯的上一份合同不屬於該員工", ex.getMessage());
        verify(contractMapper, never()).insert(any(EmpContract.class));
    }

    @Test
    @DisplayName("解除日期早于合同开始日期时拒绝")
    void rejectsTerminateBeforeStart() {
        EmpContract contract = new EmpContract();
        contract.setContractNo("HT-2026-005");
        contract.setContractType("劳动合同");
        contract.setStartDate(LocalDate.of(2026, 6, 1));
        contract.setTerminatedDate(LocalDate.of(2026, 5, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(1L, contract));
        assertEquals("解除日期不能早於合同開始日期", ex.getMessage());
    }
}
