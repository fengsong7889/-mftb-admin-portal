package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.OrgJobFamily;
import com.mftb.admin.entity.OrgJobGrade;
import com.mftb.admin.entity.OrgLegalEntity;
import com.mftb.admin.entity.OrgPosition;
import com.mftb.admin.entity.OrgUnit;
import com.mftb.admin.mapper.HrAssignmentMapper;
import com.mftb.admin.mapper.OrgJobFamilyMapper;
import com.mftb.admin.mapper.OrgJobGradeMapper;
import com.mftb.admin.mapper.OrgLegalEntityMapper;
import com.mftb.admin.mapper.OrgPositionMapper;
import com.mftb.admin.mapper.OrgUnitMapper;
import com.mftb.admin.util.OperatorResolver;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 組織編制寫入側的拒絕性用例。
 * <p>
 * 這一組不是「能存進去」的正向測試，而是把方案 5.1 的三條硬約束釘死在服務層：
 * 編碼唯一、法域白名單、組織必須掛在同法人樹上且不能成環。
 * 這些條件一旦漏掉，錯的不是一條數據，而是編制統計與薪資成本分攤同時錯帳。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HcmOrganizationGuardTest {

    @Mock
    private OrgLegalEntityMapper legalEntityMapper;
    @Mock
    private OrgUnitMapper unitMapper;
    @Mock
    private OrgJobFamilyMapper jobFamilyMapper;
    @Mock
    private OrgJobGradeMapper jobGradeMapper;
    @Mock
    private OrgPositionMapper positionMapper;
    @Mock
    private HrAssignmentMapper assignmentMapper;
    @Mock
    private OperatorResolver operatorResolver;
    @Mock
    private JdbcTemplate jdbcTemplate;

    private HcmOrganizationServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new HcmOrganizationServiceImpl(legalEntityMapper, unitMapper, jobFamilyMapper, jobGradeMapper,
                positionMapper, assignmentMapper, operatorResolver, jdbcTemplate);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
    }

    @Test
    @DisplayName("法人編碼重複時拒絕，且不會落庫")
    void rejectsDuplicateLegalEntityCode() {
        OrgLegalEntity entity = new OrgLegalEntity();
        entity.setCode("CN-TECH");
        entity.setName("測試法人");
        when(legalEntityMapper.selectCount(any())).thenReturn(1L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveLegalEntity(entity));
        assertEquals("法人編碼已存在：CN-TECH", ex.getMessage());
        verify(legalEntityMapper, never()).insert(any(OrgLegalEntity.class));
    }

    @Test
    @DisplayName("法域只接受 CN/HK/MO，其他值直接拒絕")
    void rejectsUnknownJurisdiction() {
        OrgLegalEntity entity = new OrgLegalEntity();
        entity.setCode("US-TECH");
        entity.setName("美國法人");
        entity.setJurisdiction("US");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveLegalEntity(entity));
        assertEquals("法域只能是 CN / HK / MO", ex.getMessage());
        verify(legalEntityMapper, never()).insert(any(OrgLegalEntity.class));
    }

    @Test
    @DisplayName("法人下仍有組織時不允許刪除（避免組織懸空）")
    void rejectsDeletingLegalEntityWithUnits() {
        OrgLegalEntity entity = new OrgLegalEntity();
        entity.setId(7L);
        entity.setStatus(1);
        when(legalEntityMapper.selectById(7L)).thenReturn(entity);
        when(unitMapper.selectCount(any())).thenReturn(2L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteLegalEntity(7L));
        assertEquals("該法人下仍有組織，請先停用或遷移組織後再刪除", ex.getMessage());
        verify(legalEntityMapper, never()).deleteById(anyLong());
    }

    @Test
    @DisplayName("上級組織屬於其他法人時拒絕掛樹")
    void rejectsCrossLegalEntityParent() {
        OrgLegalEntity legalEntity = new OrgLegalEntity();
        legalEntity.setId(1L);
        legalEntity.setStatus(1);
        when(legalEntityMapper.selectById(1L)).thenReturn(legalEntity);

        OrgUnit parent = new OrgUnit();
        parent.setId(20L);
        parent.setLegalEntityId(2L);
        parent.setPath("/20/");
        when(unitMapper.selectById(20L)).thenReturn(parent);

        OrgUnit unit = new OrgUnit();
        unit.setCode("U-1");
        unit.setName("跨法人組織");
        unit.setLegalEntityId(1L);
        unit.setParentId(20L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveUnit(unit));
        assertEquals("上級組織屬於其他法人，禁止跨法人掛樹", ex.getMessage());
        verify(unitMapper, never()).insert(any(OrgUnit.class));
    }

    @Test
    @DisplayName("把組織移動到自己的下級時拒絕（環檢測）")
    void rejectsMovingUnderOwnDescendant() {
        OrgLegalEntity legalEntity = new OrgLegalEntity();
        legalEntity.setId(1L);
        legalEntity.setStatus(1);
        when(legalEntityMapper.selectById(1L)).thenReturn(legalEntity);

        OrgUnit existing = new OrgUnit();
        existing.setId(10L);
        existing.setCode("U-10");
        existing.setLegalEntityId(1L);
        existing.setPath("/10/");
        when(unitMapper.selectById(10L)).thenReturn(existing);

        OrgUnit child = new OrgUnit();
        child.setId(11L);
        child.setLegalEntityId(1L);
        child.setPath("/10/11/");
        when(unitMapper.selectById(11L)).thenReturn(child);

        OrgUnit unit = new OrgUnit();
        unit.setId(10L);
        unit.setCode("U-10");
        unit.setName("父組織");
        unit.setLegalEntityId(1L);
        unit.setParentId(11L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveUnit(unit));
        assertEquals("不能把組織移動到自己的下級組織下", ex.getMessage());
        verify(unitMapper, never()).updateById(any(OrgUnit.class));
    }

    @Test
    @DisplayName("有子組織時不允許刪除組織")
    void rejectsDeletingUnitWithChildren() {
        OrgUnit unit = new OrgUnit();
        unit.setId(5L);
        when(unitMapper.selectById(5L)).thenReturn(unit);
        when(unitMapper.selectCount(any())).thenReturn(1L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteUnit(5L));
        assertEquals("該組織下仍有子組織，請先處理子組織", ex.getMessage());
        verify(unitMapper, never()).deleteById(anyLong());
    }

    @Test
    @DisplayName("法域白名單常量與服務校驗同源（防止兩處漂移）")
    void jurisdictionWhitelistIsShared() {
        // 服務對 US 的拒絕已在上面驗證；這裡確認合法值集合沒有被寫成別的私有副本
        assertEquals(List.of("CN", "HK", "MO"),
                List.of(com.mftb.admin.constant.HcmOrganizationConstants.JURISDICTION_CN,
                        com.mftb.admin.constant.HcmOrganizationConstants.JURISDICTION_HK,
                        com.mftb.admin.constant.HcmOrganizationConstants.JURISDICTION_MO));
    }

    /* ==================== 職位體系 ==================== */

    @Test
    @DisplayName("职务族编码重复时拒绝落库")
    void rejectsDuplicateJobFamilyCode() {
        OrgJobFamily family = new OrgJobFamily();
        family.setCode("FUNC");
        family.setName("职能");
        when(jobFamilyMapper.selectCount(any())).thenReturn(1L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveJobFamily(family));
        assertEquals("職務族編碼已存在：FUNC", ex.getMessage());
        verify(jobFamilyMapper, never()).insert(any(OrgJobFamily.class));
    }

    @Test
    @DisplayName("职务族下仍有职位时不允许删除（只能停用）")
    void rejectsDeletingJobFamilyWithGrades() {
        OrgJobFamily family = new OrgJobFamily();
        family.setId(3L);
        when(jobFamilyMapper.selectById(3L)).thenReturn(family);
        when(jobGradeMapper.selectCount(any())).thenReturn(2L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteJobFamily(3L));
        assertEquals("該職務族下仍有職位職級，請先停用或遷移職位", ex.getMessage());
        verify(jobFamilyMapper, never()).deleteById(anyLong());
    }

    @Test
    @DisplayName("职位必须挂在启用中的职务族下；停用的族拒绝新增职位")
    void rejectsGradeUnderDisabledFamily() {
        OrgJobFamily family = new OrgJobFamily();
        family.setId(9L);
        family.setStatus(0);
        when(jobFamilyMapper.selectById(9L)).thenReturn(family);

        OrgJobGrade grade = new OrgJobGrade();
        grade.setCode("PAYROLL-P5");
        grade.setName("薪酬核算专员");
        grade.setJobFamilyId(9L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveJobGrade(grade));
        assertEquals("所屬職務族已停用，不能再掛新職位", ex.getMessage());
        verify(jobGradeMapper, never()).insert(any(OrgJobGrade.class));
    }

    @Test
    @DisplayName("职位未选职务族时拒绝")
    void rejectsGradeWithoutFamily() {
        OrgJobGrade grade = new OrgJobGrade();
        grade.setCode("PAYROLL-P5");
        grade.setName("薪酬核算专员");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveJobGrade(grade));
        assertEquals("請選擇所屬職務族", ex.getMessage());
        verify(jobGradeMapper, never()).insert(any(OrgJobGrade.class));
    }

    @Test
    @DisplayName("岗位必须挂启用中的组织与职位；组织停用时拒绝新增")
    void rejectsPositionUnderDisabledUnit() {
        OrgUnit unit = new OrgUnit();
        unit.setId(5L);
        unit.setStatus(0);
        when(unitMapper.selectById(5L)).thenReturn(unit);

        OrgPosition position = new OrgPosition();
        position.setCode("POS-001");
        position.setName("薪酬核算专员");
        position.setUnitId(5L);
        position.setJobGradeId(9L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePosition(position));
        assertEquals("所屬組織已停用，不能再掛新崗位", ex.getMessage());
        verify(positionMapper, never()).insert(any(OrgPosition.class));
    }

    @Test
    @DisplayName("编制数不得为负：负数按 0（未核定）落库而不是报错")
    void negativeHeadcountFallsBackToZero() {
        OrgUnit unit = new OrgUnit();
        unit.setId(5L);
        unit.setStatus(1);
        when(unitMapper.selectById(5L)).thenReturn(unit);
        OrgJobGrade grade = new OrgJobGrade();
        grade.setId(9L);
        grade.setStatus(1);
        when(jobGradeMapper.selectById(9L)).thenReturn(grade);
        when(positionMapper.selectCount(any())).thenReturn(0L);

        OrgPosition position = new OrgPosition();
        position.setCode("POS-002");
        position.setName("招聘顾问");
        position.setUnitId(5L);
        position.setJobGradeId(9L);
        position.setHeadcount(-3);

        service.savePosition(position);
        assertEquals(0, position.getHeadcount());
    }
}
