package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.HrAssignment;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.OrgLegalEntity;
import com.mftb.admin.entity.OrgPosition;
import com.mftb.admin.entity.OrgUnit;
import com.mftb.admin.entity.Person;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrAssignmentMapper;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.OrgLegalEntityMapper;
import com.mftb.admin.mapper.OrgPositionMapper;
import com.mftb.admin.mapper.OrgUnitMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * C2 人员主数据的拒绝性用例。
 * <p>
 * 覆盖方案 C2 完成判据里的边界：无账号建档、账号唯一绑定、同法人雇佣重叠、
 * 跨法人任职、岗位与组织不匹配、FTE 越界、主任职唯一。
 * 这些都是"错了会让编制统计和薪资格式同时错"的口径，必须在服务层钉死。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HcmPersonGuardTest {

    @Mock private PersonMapper personMapper;
    @Mock private HrEmploymentMapper employmentMapper;
    @Mock private HrAssignmentMapper assignmentMapper;
    @Mock private OrgLegalEntityMapper legalEntityMapper;
    @Mock private OrgUnitMapper unitMapper;
    @Mock private OrgPositionMapper positionMapper;
    @Mock private SysUserMapper sysUserMapper;
    @Mock private OperatorResolver operatorResolver;

    private HcmPersonServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new HcmPersonServiceImpl(personMapper, employmentMapper, assignmentMapper, legalEntityMapper,
                unitMapper, positionMapper, sysUserMapper, operatorResolver);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
    }

    @Test
    @DisplayName("无账号人员可以建档：sysUserId 为空时不校验账号")
    void allowsPersonWithoutAccount() {
        Person person = new Person();
        person.setName("张三");

        service.savePerson(person);

        verify(personMapper).insert(person);
        verify(sysUserMapper, never()).selectById(any());
    }

    @Test
    @DisplayName("账号已绑定其他人员时拒绝")
    void rejectsAccountBoundToAnotherPerson() {
        Person person = new Person();
        person.setName("李四");
        person.setSysUserId(100L);
        when(sysUserMapper.selectById(100L)).thenReturn(new SysUser());
        when(personMapper.selectCount(any())).thenReturn(1L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePerson(person));
        assertEquals("该账号已绑定其他人员", ex.getMessage());
        verify(personMapper, never()).insert(any(Person.class));
    }

    @Test
    @DisplayName("同一法人雇佣期间重叠时拒绝（不同法人可并行）")
    void rejectsOverlappingEmploymentInSameLegalEntity() {
        Person person = new Person();
        person.setId(1L);
        when(personMapper.selectById(1L)).thenReturn(person);
        OrgLegalEntity legal = new OrgLegalEntity();
        legal.setId(10L);
        legal.setStatus(1);
        legal.setJurisdiction("CN");
        when(legalEntityMapper.selectById(10L)).thenReturn(legal);

        HrEmployment other = new HrEmployment();
        other.setId(99L);
        other.setEmploymentNo("E-OLD");
        other.setStartDate(LocalDate.of(2026, 1, 1));
        other.setEndDate(LocalDate.of(2026, 12, 31));
        when(employmentMapper.selectList(any())).thenReturn(List.of(other));

        HrEmployment entity = new HrEmployment();
        entity.setPersonId(1L);
        entity.setLegalEntityId(10L);
        entity.setStartDate(LocalDate.of(2026, 6, 1));
        entity.setEndDate(LocalDate.of(2027, 5, 31));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveEmployment(entity));
        assertEquals("同一法人的雇佣期间重叠，请检查已有记录：E-OLD", ex.getMessage());
        verify(employmentMapper, never()).insert(any(HrEmployment.class));
    }

    @Test
    @DisplayName("终止日期早于雇佣开始日期时拒绝")
    void rejectsTerminateBeforeStart() {
        HrEmployment employment = new HrEmployment();
        employment.setId(5L);
        employment.setStartDate(LocalDate.of(2026, 3, 1));
        when(employmentMapper.selectById(5L)).thenReturn(employment);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.terminateEmployment(5L, LocalDate.of(2026, 2, 1)));
        assertEquals("终止日期不能早于雇佣开始日期", ex.getMessage());
    }

    @Test
    @DisplayName("任职组织不属于该雇佣的雇主法人时拒绝")
    void rejectsCrossLegalEntityAssignment() {
        HrEmployment employment = new HrEmployment();
        employment.setId(7L);
        employment.setLegalEntityId(1L);
        when(employmentMapper.selectById(7L)).thenReturn(employment);

        OrgUnit unit = new OrgUnit();
        unit.setId(20L);
        unit.setLegalEntityId(2L);
        when(unitMapper.selectById(20L)).thenReturn(unit);

        HrAssignment assignment = new HrAssignment();
        assignment.setEmploymentId(7L);
        assignment.setUnitId(20L);
        assignment.setEffectiveFrom(LocalDate.of(2026, 10, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveAssignment(assignment));
        assertEquals("任职组织不属于该雇佣的雇主法人，禁止跨法人任职", ex.getMessage());
        verify(assignmentMapper, never()).insert(any(HrAssignment.class));
    }

    @Test
    @DisplayName("岗位不属于所选组织时拒绝")
    void rejectsPositionFromAnotherUnit() {
        HrEmployment employment = new HrEmployment();
        employment.setId(7L);
        employment.setLegalEntityId(1L);
        when(employmentMapper.selectById(7L)).thenReturn(employment);
        OrgUnit unit = new OrgUnit();
        unit.setId(20L);
        unit.setLegalEntityId(1L);
        when(unitMapper.selectById(20L)).thenReturn(unit);
        OrgPosition position = new OrgPosition();
        position.setId(30L);
        position.setUnitId(21L);
        when(positionMapper.selectById(30L)).thenReturn(position);

        HrAssignment assignment = new HrAssignment();
        assignment.setEmploymentId(7L);
        assignment.setUnitId(20L);
        assignment.setPositionId(30L);
        assignment.setEffectiveFrom(LocalDate.of(2026, 10, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveAssignment(assignment));
        assertEquals("所选岗位不属于该组织", ex.getMessage());
    }

    @Test
    @DisplayName("FTE 超出 0.01~1.00 时拒绝")
    void rejectsFteOutOfRange() {
        HrEmployment employment = new HrEmployment();
        employment.setId(7L);
        employment.setLegalEntityId(1L);
        when(employmentMapper.selectById(7L)).thenReturn(employment);
        OrgUnit unit = new OrgUnit();
        unit.setId(20L);
        unit.setLegalEntityId(1L);
        when(unitMapper.selectById(20L)).thenReturn(unit);

        HrAssignment assignment = new HrAssignment();
        assignment.setEmploymentId(7L);
        assignment.setUnitId(20L);
        assignment.setEffectiveFrom(LocalDate.of(2026, 10, 1));
        assignment.setFte(new BigDecimal("1.50"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveAssignment(assignment));
        assertEquals("FTE 必须在 0.01 ~ 1.00 之间", ex.getMessage());
    }

    @Test
    @DisplayName("已有生效中的主任职时拒绝再建一个")
    void rejectsSecondPrimaryAssignment() {
        HrEmployment employment = new HrEmployment();
        employment.setId(7L);
        employment.setLegalEntityId(1L);
        when(employmentMapper.selectById(7L)).thenReturn(employment);
        OrgUnit unit = new OrgUnit();
        unit.setId(20L);
        unit.setLegalEntityId(1L);
        when(unitMapper.selectById(20L)).thenReturn(unit);
        when(assignmentMapper.selectCount(any())).thenReturn(1L);

        HrAssignment assignment = new HrAssignment();
        assignment.setEmploymentId(7L);
        assignment.setUnitId(20L);
        assignment.setEffectiveFrom(LocalDate.of(2026, 10, 1));
        assignment.setPrimaryFlag(1);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveAssignment(assignment));
        assertEquals("该雇佣已有生效中的主任职，请先结束原主任职", ex.getMessage());
        verify(assignmentMapper, never()).insert(any(HrAssignment.class));
    }

    @Test
    @DisplayName("有雇佣记录的人员不允许直接删除")
    void rejectsDeletingPersonWithEmployment() {
        Person person = new Person();
        person.setId(1L);
        when(personMapper.selectById(1L)).thenReturn(person);
        when(employmentMapper.selectCount(any())).thenReturn(2L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deletePerson(1L));
        assertEquals("该人员仍有雇佣记录，请先终止雇佣，不能直接删除", ex.getMessage());
        verify(personMapper, never()).deleteById(any(Long.class));
    }
}
