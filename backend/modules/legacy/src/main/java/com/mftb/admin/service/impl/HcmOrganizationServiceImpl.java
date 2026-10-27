package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HcmOrganizationConstants;
import com.mftb.admin.dto.OrgPositionVO;
import com.mftb.admin.dto.OrgUnitVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.OrgJobFamily;
import com.mftb.admin.entity.OrgJobGrade;
import com.mftb.admin.entity.HrAssignment;
import com.mftb.admin.entity.OrgLegalEntity;
import com.mftb.admin.entity.OrgPosition;
import com.mftb.admin.entity.OrgUnit;
import com.mftb.admin.mapper.OrgJobFamilyMapper;
import com.mftb.admin.mapper.OrgJobGradeMapper;
import com.mftb.admin.mapper.HrAssignmentMapper;
import com.mftb.admin.mapper.OrgLegalEntityMapper;
import com.mftb.admin.mapper.OrgPositionMapper;
import com.mftb.admin.mapper.OrgUnitMapper;
import com.mftb.admin.service.HcmOrganizationService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 組織編制主數據服務實現。
 * <p>
 * 三條硬約束（方案 5.1 / 13.3）：
 * <ol>
 *   <li>法人、組織分開建模，組織必須掛在一個啟用中的法人下，禁止跨法人共享同一棵樹；</li>
 *   <li>編碼是全庫唯一業務鍵，改名可以、改編碼等於換了一個實體，因此只允許在無引用時改；</li>
 *   <li>有下級或有在用的組織只能停用不能刪除——歷史任職、合同要能回溯到當時的組織。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HcmOrganizationServiceImpl implements HcmOrganizationService {

    private static final Set<String> JURISDICTIONS = Set.of(
            HcmOrganizationConstants.JURISDICTION_CN,
            HcmOrganizationConstants.JURISDICTION_HK,
            HcmOrganizationConstants.JURISDICTION_MO);

    private final OrgLegalEntityMapper legalEntityMapper;
    private final OrgUnitMapper unitMapper;
    private final OrgJobFamilyMapper jobFamilyMapper;
    private final OrgJobGradeMapper jobGradeMapper;
    private final OrgPositionMapper positionMapper;
    private final HrAssignmentMapper assignmentMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    /* ==================== 法人主體 ==================== */

    @Override
    public PageResult<OrgLegalEntity> listLegalEntities(long page, long size, String keyword,
                                                        Integer status, String jurisdiction) {
        Page<OrgLegalEntity> result = legalEntityMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                legalEntityWrapper(keyword, status, jurisdiction));
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public Map<String, Object> legalEntityStats(String keyword, Integer status, String jurisdiction) {
        // 統計與列表同源：同一套 wrapper，避免「列表已筛、卡片还是全量」的误读
        List<OrgLegalEntity> rows = legalEntityMapper.selectList(legalEntityWrapper(keyword, status, jurisdiction));
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", rows.size());
        stats.put("enabled", rows.stream().filter(r -> Integer.valueOf(1).equals(r.getStatus())).count());
        stats.put("pendingVerify", rows.stream().filter(r -> !Integer.valueOf(1).equals(r.getVerifyStatus())).count());
        stats.put("jurisdictions", rows.stream().map(OrgLegalEntity::getJurisdiction).distinct().count());
        return stats;
    }

    @Override
    public OrgLegalEntity getLegalEntity(Long id) {
        OrgLegalEntity entity = id == null ? null : legalEntityMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("法人不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public OrgLegalEntity saveLegalEntity(OrgLegalEntity entity) {
        if (entity == null) {
            throw new BusinessException("法人資料不能為空");
        }
        if (!StringUtils.hasText(entity.getCode())) {
            throw new BusinessException("法人編碼不能為空");
        }
        if (!StringUtils.hasText(entity.getName())) {
            throw new BusinessException("法人名稱不能為空");
        }
        String jurisdiction = StringUtils.hasText(entity.getJurisdiction())
                ? entity.getJurisdiction().trim().toUpperCase() : HcmOrganizationConstants.JURISDICTION_CN;
        if (!JURISDICTIONS.contains(jurisdiction)) {
            throw new BusinessException("法域只能是 CN / HK / MO");
        }
        entity.setJurisdiction(jurisdiction);
        entity.setCode(entity.getCode().trim());
        entity.setName(entity.getName().trim());

        // 編碼唯一：排除自身，避免「編輯時把自己判成重複」
        Long duplicated = legalEntityMapper.selectCount(new LambdaQueryWrapper<OrgLegalEntity>()
                .eq(OrgLegalEntity::getCode, entity.getCode())
                .ne(entity.getId() != null, OrgLegalEntity::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("法人編碼已存在：" + entity.getCode());
        }

        entity.setVerifyStatus(Integer.valueOf(1).equals(entity.getVerifyStatus()) ? 1 : 0);
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        if (entity.getSortOrder() == null) {
            entity.setSortOrder(0);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());

        if (entity.getId() == null) {
            // 同編碼的邏輯刪除行會占住唯一鍵（編碼採用「刪除後不可默默重用」策略），
            // 新增前先物理清理軟刪殘片，否則手續上「刪了再加」會直接撞唯一鍵 500
            jdbcTemplate.update("DELETE FROM org_legal_entity WHERE code = ? AND deleted = 1", entity.getCode());
            legalEntityMapper.insert(entity);
        } else {
            getLegalEntity(entity.getId());
            legalEntityMapper.updateById(entity);
        }
        return legalEntityMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deleteLegalEntity(Long id) {
        getLegalEntity(id);
        Long units = unitMapper.selectCount(new LambdaQueryWrapper<OrgUnit>()
                .eq(OrgUnit::getLegalEntityId, id));
        if (units != null && units > 0) {
            throw new BusinessException("該法人下仍有組織，請先停用或遷移組織後再刪除");
        }
        legalEntityMapper.deleteById(id);
    }

    private LambdaQueryWrapper<OrgLegalEntity> legalEntityWrapper(String keyword, Integer status, String jurisdiction) {
        LambdaQueryWrapper<OrgLegalEntity> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(OrgLegalEntity::getCode, kw)
                    .or().like(OrgLegalEntity::getName, kw)
                    .or().like(OrgLegalEntity::getNameEn, kw));
        }
        if (status != null) {
            wrapper.eq(OrgLegalEntity::getStatus, status);
        }
        if (StringUtils.hasText(jurisdiction)) {
            wrapper.eq(OrgLegalEntity::getJurisdiction, jurisdiction);
        }
        wrapper.orderByAsc(OrgLegalEntity::getSortOrder).orderByAsc(OrgLegalEntity::getId);
        return wrapper;
    }

    /* ==================== 管理組織 ==================== */

    @Override
    public List<OrgUnitVO> unitTree(Long legalEntityId, String keyword, Integer status) {
        LambdaQueryWrapper<OrgUnit> wrapper = new LambdaQueryWrapper<>();
        if (legalEntityId != null) {
            wrapper.eq(OrgUnit::getLegalEntityId, legalEntityId);
        }
        if (status != null) {
            wrapper.eq(OrgUnit::getStatus, status);
        }
        wrapper.orderByAsc(OrgUnit::getSortOrder).orderByAsc(OrgUnit::getId);
        List<OrgUnit> units = unitMapper.selectList(wrapper);
        if (units.isEmpty()) {
            return List.of();
        }

        Map<Long, String> legalNames = new HashMap<>();
        legalEntityMapper.selectBatchIds(units.stream().map(OrgUnit::getLegalEntityId).distinct().toList())
                .forEach(le -> legalNames.put(le.getId(), le.getName()));

        List<OrgUnit> visible = filterByKeyword(units, keyword);
        Map<Long, OrgUnitVO> nodes = new LinkedHashMap<>();
        for (OrgUnit unit : visible) {
            OrgUnitVO vo = OrgUnitVO.from(unit);
            vo.setLegalEntityName(legalNames.get(unit.getLegalEntityId()));
            nodes.put(vo.getId(), vo);
        }
        List<OrgUnitVO> roots = new ArrayList<>();
        for (OrgUnitVO vo : nodes.values()) {
            OrgUnitVO parent = vo.getParentId() == null ? null : nodes.get(vo.getParentId());
            if (parent == null) {
                roots.add(vo);
            } else {
                parent.getChildren().add(vo);
            }
        }
        sortRecursively(roots);
        return roots;
    }

    /**
     * 關鍵字裁剪時必須保留命中節點的祖先：只留葉子會讓樹斷層，看起來像組織被刪了。
     * 做法：先標記命中節點，再沿 parentId 上溯把整條鏈標為保留。
     */
    private List<OrgUnit> filterByKeyword(List<OrgUnit> units, String keyword) {
        if (!StringUtils.hasText(keyword)) {
            return units;
        }
        String kw = keyword.trim().toLowerCase();
        Map<Long, OrgUnit> byId = new HashMap<>();
        units.forEach(unit -> byId.put(unit.getId(), unit));
        Set<Long> keep = new HashSet<>();
        for (OrgUnit unit : units) {
            boolean hit = containsIgnoreCase(unit.getCode(), kw)
                    || containsIgnoreCase(unit.getName(), kw)
                    || containsIgnoreCase(unit.getNameEn(), kw);
            if (!hit) {
                continue;
            }
            OrgUnit cursor = unit;
            while (cursor != null && keep.add(cursor.getId())) {
                cursor = cursor.getParentId() == null ? null : byId.get(cursor.getParentId());
            }
        }
        return units.stream().filter(unit -> keep.contains(unit.getId())).toList();
    }

    private boolean containsIgnoreCase(String value, String lowerKeyword) {
        return value != null && value.toLowerCase().contains(lowerKeyword);
    }

    private void sortRecursively(List<OrgUnitVO> nodes) {
        nodes.sort(Comparator.comparing((OrgUnitVO vo) -> vo.getSortOrder() == null ? 0 : vo.getSortOrder())
                .thenComparing(OrgUnitVO::getId));
        nodes.forEach(vo -> {
            if (!vo.getChildren().isEmpty()) {
                sortRecursively(vo.getChildren());
            }
        });
    }

    @Override
    public OrgUnitVO getUnit(Long id) {
        OrgUnit unit = requireUnit(id);
        OrgUnitVO vo = OrgUnitVO.from(unit);
        legalEntityMapper.selectList(new LambdaQueryWrapper<OrgLegalEntity>()
                        .eq(OrgLegalEntity::getId, unit.getLegalEntityId()))
                .stream().findFirst().ifPresent(le -> vo.setLegalEntityName(le.getName()));
        return vo;
    }

    @Override
    @Transactional
    public OrgUnitVO saveUnit(OrgUnit unit) {
        if (unit == null) {
            throw new BusinessException("組織資料不能為空");
        }
        if (!StringUtils.hasText(unit.getCode())) {
            throw new BusinessException("組織編碼不能為空");
        }
        if (!StringUtils.hasText(unit.getName())) {
            throw new BusinessException("組織名稱不能為空");
        }
        if (unit.getLegalEntityId() == null) {
            throw new BusinessException("請選擇所屬法人");
        }
        OrgLegalEntity legalEntity = getLegalEntity(unit.getLegalEntityId());
        if (!Integer.valueOf(1).equals(legalEntity.getStatus())) {
            throw new BusinessException("所屬法人已停用，不能在其中新建或調整組織");
        }
        unit.setCode(unit.getCode().trim());
        unit.setName(unit.getName().trim());
        unit.setUnitType(StringUtils.hasText(unit.getUnitType())
                ? unit.getUnitType().trim() : HcmOrganizationConstants.UNIT_TYPE_DEPARTMENT);

        Long duplicated = unitMapper.selectCount(new LambdaQueryWrapper<OrgUnit>()
                .eq(OrgUnit::getCode, unit.getCode())
                .ne(unit.getId() != null, OrgUnit::getId, unit.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("組織編碼已存在：" + unit.getCode());
        }

        OrgUnit parent = null;
        if (unit.getParentId() != null) {
            parent = unitMapper.selectById(unit.getParentId());
            if (parent == null) {
                throw new BusinessException("上級組織不存在");
            }
            if (!parent.getLegalEntityId().equals(unit.getLegalEntityId())) {
                throw new BusinessException("上級組織屬於其他法人，禁止跨法人掛樹");
            }
            if (unit.getId() != null && unit.getId().equals(parent.getId())) {
                throw new BusinessException("上級組織不能是自己");
            }
            // 環檢測：新父級若在自己的子樹裡（父路徑以自身路徑開頭），會形成閉環
            if (unit.getId() != null && parent.getPath() != null && parent.getPath().startsWith(unitPathPrefix(unit.getId()))) {
                throw new BusinessException("不能把組織移動到自己的下級組織下");
            }
        }

        unit.setStatus(Integer.valueOf(0).equals(unit.getStatus()) ? 0 : 1);
        if (unit.getSortOrder() == null) {
            unit.setSortOrder(0);
        }
        unit.setUpdatedBy(operatorResolver.currentOperatorAccount());

        String oldPath = null;
        if (unit.getId() == null) {
            jdbcTemplate.update("DELETE FROM org_unit WHERE code = ? AND deleted = 1", unit.getCode());
            unitMapper.insert(unit);
            String path = (parent == null ? "/" : parent.getPath()) + unit.getId() + "/";
            unit.setPath(path);
            unitMapper.updateById(unit);
        } else {
            OrgUnit existing = requireUnit(unit.getId());
            oldPath = existing.getPath();
            String path = (parent == null ? "/" : parent.getPath()) + unit.getId() + "/";
            unit.setPath(path);
            unitMapper.updateById(unit);
            if (oldPath != null && !oldPath.equals(path)) {
                // 移動後子樹的物化路徑必須整體改寫，否則子孫查詢會落到舊樹
                jdbcTemplate.update(
                        "UPDATE org_unit SET path = CONCAT(?, SUBSTRING(path, LENGTH(?) + 1)) "
                                + "WHERE deleted = 0 AND path LIKE CONCAT(?, '%')",
                        path, oldPath, oldPath);
            }
        }
        return getUnit(unit.getId());
    }

    private String unitPathPrefix(Long id) {
        return "/" + id + "/";
    }

    @Override
    @Transactional
    public void deleteUnit(Long id) {
        requireUnit(id);
        Long children = unitMapper.selectCount(new LambdaQueryWrapper<OrgUnit>()
                .eq(OrgUnit::getParentId, id));
        if (children != null && children > 0) {
            throw new BusinessException("該組織下仍有子組織，請先處理子組織");
        }
        Long positions = positionMapper.selectCount(new LambdaQueryWrapper<OrgPosition>()
                .eq(OrgPosition::getUnitId, id));
        if (positions != null && positions > 0) {
            throw new BusinessException("該組織下仍有崗位，請先停用或遷移崗位");
        }
        unitMapper.deleteById(id);
    }

    private OrgUnit requireUnit(Long id) {
        OrgUnit unit = id == null ? null : unitMapper.selectById(id);
        if (unit == null) {
            throw new BusinessException("組織不存在或已刪除");
        }
        return unit;
    }

    /* ==================== 職位體系：職務族 ==================== */

    @Override
    public PageResult<OrgJobFamily> listJobFamilies(long page, long size, String keyword, Integer status) {
        Page<OrgJobFamily> result = jobFamilyMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                jobFamilyWrapper(keyword, status));
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public OrgJobFamily getJobFamily(Long id) {
        OrgJobFamily entity = id == null ? null : jobFamilyMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("職務族不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public OrgJobFamily saveJobFamily(OrgJobFamily entity) {
        if (entity == null) {
            throw new BusinessException("職務族資料不能為空");
        }
        if (!StringUtils.hasText(entity.getCode())) {
            throw new BusinessException("職務族編碼不能為空");
        }
        if (!StringUtils.hasText(entity.getName())) {
            throw new BusinessException("職務族名稱不能為空");
        }
        entity.setCode(entity.getCode().trim());
        entity.setName(entity.getName().trim());
        Long duplicated = jobFamilyMapper.selectCount(new LambdaQueryWrapper<OrgJobFamily>()
                .eq(OrgJobFamily::getCode, entity.getCode())
                .ne(entity.getId() != null, OrgJobFamily::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("職務族編碼已存在：" + entity.getCode());
        }
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        if (entity.getSortOrder() == null) {
            entity.setSortOrder(0);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            jdbcTemplate.update("DELETE FROM org_job_family WHERE code = ? AND deleted = 1", entity.getCode());
            jobFamilyMapper.insert(entity);
        } else {
            getJobFamily(entity.getId());
            jobFamilyMapper.updateById(entity);
        }
        return jobFamilyMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deleteJobFamily(Long id) {
        getJobFamily(id);
        Long grades = jobGradeMapper.selectCount(new LambdaQueryWrapper<OrgJobGrade>()
                .eq(OrgJobGrade::getJobFamilyId, id));
        if (grades != null && grades > 0) {
            throw new BusinessException("該職務族下仍有職位職級，請先停用或遷移職位");
        }
        jobFamilyMapper.deleteById(id);
    }

    private LambdaQueryWrapper<OrgJobFamily> jobFamilyWrapper(String keyword, Integer status) {
        LambdaQueryWrapper<OrgJobFamily> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(OrgJobFamily::getCode, kw)
                    .or().like(OrgJobFamily::getName, kw)
                    .or().like(OrgJobFamily::getNameEn, kw));
        }
        if (status != null) {
            wrapper.eq(OrgJobFamily::getStatus, status);
        }
        wrapper.orderByAsc(OrgJobFamily::getSortOrder).orderByAsc(OrgJobFamily::getId);
        return wrapper;
    }

    /* ==================== 職位體系：職位職級 ==================== */

    @Override
    public PageResult<OrgJobGrade> listJobGrades(long page, long size, String keyword, Integer status, Long jobFamilyId) {
        Page<OrgJobGrade> result = jobGradeMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                jobGradeWrapper(keyword, status, jobFamilyId));
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public List<OrgJobGrade> jobGradeOptions(Long jobFamilyId) {
        return jobGradeMapper.selectList(new LambdaQueryWrapper<OrgJobGrade>()
                .eq(OrgJobGrade::getStatus, 1)
                .eq(jobFamilyId != null, OrgJobGrade::getJobFamilyId, jobFamilyId)
                .orderByAsc(OrgJobGrade::getJobFamilyId)
                .orderByAsc(OrgJobGrade::getGradeLevel)
                .orderByAsc(OrgJobGrade::getId));
    }

    @Override
    public OrgJobGrade getJobGrade(Long id) {
        OrgJobGrade entity = id == null ? null : jobGradeMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("職位不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public OrgJobGrade saveJobGrade(OrgJobGrade entity) {
        if (entity == null) {
            throw new BusinessException("職位資料不能為空");
        }
        if (!StringUtils.hasText(entity.getCode())) {
            throw new BusinessException("職位編碼不能為空");
        }
        if (!StringUtils.hasText(entity.getName())) {
            throw new BusinessException("職位名稱不能為空");
        }
        if (entity.getJobFamilyId() == null) {
            throw new BusinessException("請選擇所屬職務族");
        }
        OrgJobFamily family = getJobFamily(entity.getJobFamilyId());
        if (!Integer.valueOf(1).equals(family.getStatus())) {
            throw new BusinessException("所屬職務族已停用，不能再掛新職位");
        }
        entity.setCode(entity.getCode().trim());
        entity.setName(entity.getName().trim());
        Long duplicated = jobGradeMapper.selectCount(new LambdaQueryWrapper<OrgJobGrade>()
                .eq(OrgJobGrade::getCode, entity.getCode())
                .ne(entity.getId() != null, OrgJobGrade::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("職位編碼已存在：" + entity.getCode());
        }
        // 職級序號從 1 起：0 或負數會讓「同族內層級比較」出現無法解釋的排序
        if (entity.getGradeLevel() == null || entity.getGradeLevel() < 1) {
            entity.setGradeLevel(1);
        }
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        if (entity.getSortOrder() == null) {
            entity.setSortOrder(0);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            jdbcTemplate.update("DELETE FROM org_job_grade WHERE code = ? AND deleted = 1", entity.getCode());
            jobGradeMapper.insert(entity);
        } else {
            getJobGrade(entity.getId());
            jobGradeMapper.updateById(entity);
        }
        return jobGradeMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deleteJobGrade(Long id) {
        getJobGrade(id);
        // 崗位實例（下一批）落地後，這裡要改為「有崗位占用時拒絕」；
        // 目前還沒有下游客戶，先允許刪除，避免留下無法清理的髒資料
        jobGradeMapper.deleteById(id);
    }

    private LambdaQueryWrapper<OrgJobGrade> jobGradeWrapper(String keyword, Integer status, Long jobFamilyId) {
        LambdaQueryWrapper<OrgJobGrade> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(OrgJobGrade::getCode, kw).or().like(OrgJobGrade::getName, kw));
        }
        if (status != null) {
            wrapper.eq(OrgJobGrade::getStatus, status);
        }
        if (jobFamilyId != null) {
            wrapper.eq(OrgJobGrade::getJobFamilyId, jobFamilyId);
        }
        wrapper.orderByAsc(OrgJobGrade::getJobFamilyId)
                .orderByAsc(OrgJobGrade::getGradeLevel)
                .orderByAsc(OrgJobGrade::getId);
        return wrapper;
    }

    /* ==================== 崗位與編制 ==================== */

    @Override
    public PageResult<OrgPositionVO> listPositions(long page, long size, String keyword, Integer status,
                                                   Long unitId, Long jobGradeId) {
        Page<OrgPosition> result = positionMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                positionWrapper(keyword, status, unitId, jobGradeId));
        List<OrgPosition> rows = result.getRecords();
        if (rows.isEmpty()) {
            return new PageResult<>(List.of(), result.getTotal());
        }
        // 一页一次聚合，避免逐行回查任职表（N+1）
        LocalDate today = LocalDate.now();
        Map<Long, Integer> occupied = new HashMap<>();
        assignmentMapper.selectList(new LambdaQueryWrapper<HrAssignment>()
                        .in(HrAssignment::getPositionId, rows.stream().map(OrgPosition::getId).toList())
                        .le(HrAssignment::getEffectiveFrom, today)
                        .isNull(HrAssignment::getEffectiveTo))
                .forEach(item -> occupied.merge(item.getPositionId(), 1, Integer::sum));
        List<OrgPositionVO> vos = rows.stream()
                .map(item -> OrgPositionVO.from(item, occupied.getOrDefault(item.getId(), 0)))
                .toList();
        return new PageResult<>(vos, result.getTotal());
    }

    @Override
    public OrgPosition getPosition(Long id) {
        OrgPosition entity = id == null ? null : positionMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("崗位不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public OrgPosition savePosition(OrgPosition entity) {
        if (entity == null) {
            throw new BusinessException("崗位資料不能為空");
        }
        if (!StringUtils.hasText(entity.getCode())) {
            throw new BusinessException("崗位編碼不能為空");
        }
        if (!StringUtils.hasText(entity.getName())) {
            throw new BusinessException("崗位名稱不能為空");
        }
        if (entity.getUnitId() == null) {
            throw new BusinessException("請選擇所屬組織");
        }
        if (entity.getJobGradeId() == null) {
            throw new BusinessException("請選擇職位職級");
        }
        OrgUnit unit = requireUnit(entity.getUnitId());
        if (!Integer.valueOf(1).equals(unit.getStatus())) {
            throw new BusinessException("所屬組織已停用，不能再掛新崗位");
        }
        OrgJobGrade grade = getJobGrade(entity.getJobGradeId());
        if (!Integer.valueOf(1).equals(grade.getStatus())) {
            throw new BusinessException("所選職位已停用，不能再掛新崗位");
        }
        entity.setCode(entity.getCode().trim());
        entity.setName(entity.getName().trim());
        Long duplicated = positionMapper.selectCount(new LambdaQueryWrapper<OrgPosition>()
                .eq(OrgPosition::getCode, entity.getCode())
                .ne(entity.getId() != null, OrgPosition::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("崗位編碼已存在：" + entity.getCode());
        }
        // 編制數不能為負；0 表示尚未核定，不是「沒有編制」的否決態
        if (entity.getHeadcount() == null || entity.getHeadcount() < 0) {
            entity.setHeadcount(0);
        }
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        if (entity.getSortOrder() == null) {
            entity.setSortOrder(0);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            jdbcTemplate.update("DELETE FROM org_position WHERE code = ? AND deleted = 1", entity.getCode());
            positionMapper.insert(entity);
        } else {
            getPosition(entity.getId());
            positionMapper.updateById(entity);
        }
        return positionMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deletePosition(Long id) {
        getPosition(id);
        // 本期尚未接入任职事实（Assignment 属 C2），没有占用方可以拦截；
        // 等 C2 落地后这里必须改成"有在职占用时拒绝删除"
        positionMapper.deleteById(id);
    }

    private LambdaQueryWrapper<OrgPosition> positionWrapper(String keyword, Integer status, Long unitId, Long jobGradeId) {
        LambdaQueryWrapper<OrgPosition> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(OrgPosition::getCode, kw).or().like(OrgPosition::getName, kw));
        }
        if (status != null) {
            wrapper.eq(OrgPosition::getStatus, status);
        }
        if (unitId != null) {
            wrapper.eq(OrgPosition::getUnitId, unitId);
        }
        if (jobGradeId != null) {
            wrapper.eq(OrgPosition::getJobGradeId, jobGradeId);
        }
        wrapper.orderByAsc(OrgPosition::getSortOrder).orderByAsc(OrgPosition::getId);
        return wrapper;
    }
}
