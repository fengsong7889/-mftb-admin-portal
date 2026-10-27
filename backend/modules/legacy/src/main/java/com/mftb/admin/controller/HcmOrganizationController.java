package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HcmOrganizationConstants;
import com.mftb.admin.dto.OrgUnitVO;
import com.mftb.admin.dto.OrgPositionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.OrgJobFamily;
import com.mftb.admin.entity.OrgJobGrade;
import com.mftb.admin.entity.OrgLegalEntity;
import com.mftb.admin.entity.OrgPosition;
import com.mftb.admin.entity.OrgUnit;
import com.mftb.admin.service.HcmOrganizationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 組織編制接口（{@code /api/hcm/v1/organization/**}）。
 * <p>
 * 為什麼用 {@code /api/hcm/v1/} 新命名空間：方案 13.4 要求破壞性接口走版本化路徑，
 * 舊 {@code /api/employees}、{@code /api/hr/*} 由兼容層承接，不在這裡擴寫；
 * 新路徑的權限一律按本系統菜單校驗，不復用 {@code hr} 菜單 key（避免舊准入自動擴權）。
 * <p>
 * 新增與編輯拆成兩個端點，讓 {@code create} / {@code edit} 兩種授權可分別授予。
 */
@RestController
@RequestMapping("/api/hcm/v1/organization")
@RequiredArgsConstructor
public class HcmOrganizationController {

    private final HcmOrganizationService organizationService;

    /* ==================== 法人主體 ==================== */

    @GetMapping("/legal-entities")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_LEGAL_ENTITY)
    public Result<PageResult<OrgLegalEntity>> listLegalEntities(@RequestParam(defaultValue = "1") long page,
                                                               @RequestParam(defaultValue = "20") long size,
                                                               @RequestParam(required = false) String keyword,
                                                               @RequestParam(required = false) Integer status,
                                                               @RequestParam(required = false) String jurisdiction) {
        return Result.success(organizationService.listLegalEntities(page, size, keyword, status, jurisdiction));
    }

    @GetMapping("/legal-entities/stats")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_LEGAL_ENTITY)
    public Result<Map<String, Object>> legalEntityStats(@RequestParam(required = false) String keyword,
                                                        @RequestParam(required = false) Integer status,
                                                        @RequestParam(required = false) String jurisdiction) {
        return Result.success(organizationService.legalEntityStats(keyword, status, jurisdiction));
    }

    @GetMapping("/legal-entities/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_LEGAL_ENTITY)
    public Result<OrgLegalEntity> legalEntityDetail(@PathVariable Long id) {
        return Result.success(organizationService.getLegalEntity(id));
    }

    @PostMapping("/legal-entities")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_LEGAL_ENTITY, action = "create")
    public Result<OrgLegalEntity> createLegalEntity(@RequestBody OrgLegalEntity entity) {
        entity.setId(null);
        return Result.success("法人已建立", organizationService.saveLegalEntity(entity));
    }

    @PutMapping("/legal-entities/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_LEGAL_ENTITY, action = "edit")
    public Result<OrgLegalEntity> updateLegalEntity(@PathVariable Long id, @RequestBody OrgLegalEntity entity) {
        entity.setId(id);
        return Result.success("法人已保存", organizationService.saveLegalEntity(entity));
    }

    @DeleteMapping("/legal-entities/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_LEGAL_ENTITY, action = "delete")
    public Result<Void> deleteLegalEntity(@PathVariable Long id) {
        organizationService.deleteLegalEntity(id);
        return Result.success("法人已刪除", null);
    }

    /* ==================== 管理組織 ==================== */

    @GetMapping("/units/tree")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_UNIT)
    public Result<List<OrgUnitVO>> unitTree(@RequestParam(required = false) Long legalEntityId,
                                            @RequestParam(required = false) String keyword,
                                            @RequestParam(required = false) Integer status) {
        return Result.success(organizationService.unitTree(legalEntityId, keyword, status));
    }

    @GetMapping("/units/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_UNIT)
    public Result<OrgUnitVO> unitDetail(@PathVariable Long id) {
        return Result.success(organizationService.getUnit(id));
    }

    @PostMapping("/units")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_UNIT, action = "create")
    public Result<OrgUnitVO> createUnit(@RequestBody OrgUnit unit) {
        unit.setId(null);
        return Result.success("組織已建立", organizationService.saveUnit(unit));
    }

    @PutMapping("/units/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_UNIT, action = "edit")
    public Result<OrgUnitVO> updateUnit(@PathVariable Long id, @RequestBody OrgUnit unit) {
        unit.setId(id);
        return Result.success("組織已保存", organizationService.saveUnit(unit));
    }

    @DeleteMapping("/units/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_UNIT, action = "delete")
    public Result<Void> deleteUnit(@PathVariable Long id) {
        organizationService.deleteUnit(id);
        return Result.success("組織已刪除", null);
    }

    /* ==================== 職位體系 ==================== */

    @GetMapping("/job-families")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_FAMILY)
    public Result<PageResult<OrgJobFamily>> listJobFamilies(@RequestParam(defaultValue = "1") long page,
                                                            @RequestParam(defaultValue = "20") long size,
                                                            @RequestParam(required = false) String keyword,
                                                            @RequestParam(required = false) Integer status) {
        return Result.success(organizationService.listJobFamilies(page, size, keyword, status));
    }

    @GetMapping("/job-families/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_FAMILY)
    public Result<OrgJobFamily> jobFamilyDetail(@PathVariable Long id) {
        return Result.success(organizationService.getJobFamily(id));
    }

    @PostMapping("/job-families")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_FAMILY, action = "create")
    public Result<OrgJobFamily> createJobFamily(@RequestBody OrgJobFamily entity) {
        entity.setId(null);
        return Result.success("職務族已建立", organizationService.saveJobFamily(entity));
    }

    @PutMapping("/job-families/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_FAMILY, action = "edit")
    public Result<OrgJobFamily> updateJobFamily(@PathVariable Long id, @RequestBody OrgJobFamily entity) {
        entity.setId(id);
        return Result.success("職務族已保存", organizationService.saveJobFamily(entity));
    }

    @DeleteMapping("/job-families/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_FAMILY, action = "delete")
    public Result<Void> deleteJobFamily(@PathVariable Long id) {
        organizationService.deleteJobFamily(id);
        return Result.success("職務族已刪除", null);
    }

    @GetMapping("/job-grades")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_GRADE)
    public Result<PageResult<OrgJobGrade>> listJobGrades(@RequestParam(defaultValue = "1") long page,
                                                         @RequestParam(defaultValue = "20") long size,
                                                         @RequestParam(required = false) String keyword,
                                                         @RequestParam(required = false) Integer status,
                                                         @RequestParam(required = false) Long jobFamilyId) {
        return Result.success(organizationService.listJobGrades(page, size, keyword, status, jobFamilyId));
    }

    @GetMapping("/job-grades/options")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_GRADE)
    public Result<List<OrgJobGrade>> jobGradeOptions(@RequestParam(required = false) Long jobFamilyId) {
        return Result.success(organizationService.jobGradeOptions(jobFamilyId));
    }

    @GetMapping("/job-grades/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_GRADE)
    public Result<OrgJobGrade> jobGradeDetail(@PathVariable Long id) {
        return Result.success(organizationService.getJobGrade(id));
    }

    @PostMapping("/job-grades")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_GRADE, action = "create")
    public Result<OrgJobGrade> createJobGrade(@RequestBody OrgJobGrade entity) {
        entity.setId(null);
        return Result.success("職位已建立", organizationService.saveJobGrade(entity));
    }

    @PutMapping("/job-grades/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_GRADE, action = "edit")
    public Result<OrgJobGrade> updateJobGrade(@PathVariable Long id, @RequestBody OrgJobGrade entity) {
        entity.setId(id);
        return Result.success("職位已保存", organizationService.saveJobGrade(entity));
    }

    @DeleteMapping("/job-grades/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_JOB_GRADE, action = "delete")
    public Result<Void> deleteJobGrade(@PathVariable Long id) {
        organizationService.deleteJobGrade(id);
        return Result.success("職位已刪除", null);
    }

    /* ==================== 崗位與編制 ==================== */

    @GetMapping("/positions")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_POSITION)
    public Result<PageResult<OrgPositionVO>> listPositions(@RequestParam(defaultValue = "1") long page,
                                                         @RequestParam(defaultValue = "20") long size,
                                                         @RequestParam(required = false) String keyword,
                                                         @RequestParam(required = false) Integer status,
                                                         @RequestParam(required = false) Long unitId,
                                                         @RequestParam(required = false) Long jobGradeId) {
        return Result.success(organizationService.listPositions(page, size, keyword, status, unitId, jobGradeId));
    }

    @GetMapping("/positions/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_POSITION)
    public Result<OrgPosition> positionDetail(@PathVariable Long id) {
        return Result.success(organizationService.getPosition(id));
    }

    @PostMapping("/positions")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_POSITION, action = "create")
    public Result<OrgPosition> createPosition(@RequestBody OrgPosition entity) {
        entity.setId(null);
        return Result.success("崗位已建立", organizationService.savePosition(entity));
    }

    @PutMapping("/positions/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_POSITION, action = "edit")
    public Result<OrgPosition> updatePosition(@PathVariable Long id, @RequestBody OrgPosition entity) {
        entity.setId(id);
        return Result.success("崗位已保存", organizationService.savePosition(entity));
    }

    @DeleteMapping("/positions/{id}")
    @RequirePermission(menu = HcmOrganizationConstants.MENU_POSITION, action = "delete")
    public Result<Void> deletePosition(@PathVariable Long id) {
        organizationService.deletePosition(id);
        return Result.success("崗位已刪除", null);
    }
}
