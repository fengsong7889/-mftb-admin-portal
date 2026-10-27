package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
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
import com.mftb.admin.service.HcmPersonService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 人员主数据服务实现。
 * <p>
 * 三条硬约束（方案 5.1）：
 * <ol>
 *   <li>人员与账号解耦：person 可以没有 sys_user_id；有账号时一个账号只能绑定一个人；</li>
 *   <li>雇佣是"人与法人"的关系，同一法人同期的两段雇佣视为重复（多法人并行是允许的）；</li>
 *   <li>任职日期生效：同一雇佣同一时间只能有一个主任职，且任职的组织必须属于该雇佣的法人。</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class HcmPersonServiceImpl implements HcmPersonService {

    private static final List<String> EMPLOYMENT_TYPES =
            List.of("FULL_TIME", "PART_TIME", "INTERN", "DISPATCH", "OUTSOURCE");
    private static final List<String> JURISDICTIONS = List.of("CN", "HK", "MO");

    private final PersonMapper personMapper;
    private final HrEmploymentMapper employmentMapper;
    private final HrAssignmentMapper assignmentMapper;
    private final OrgLegalEntityMapper legalEntityMapper;
    private final OrgUnitMapper unitMapper;
    private final OrgPositionMapper positionMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 人员 ==================== */

    @Override
    public PageResult<Person> listPersons(long page, long size, String keyword, Integer status) {
        LambdaQueryWrapper<Person> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(Person::getName, kw).or().like(Person::getPersonNo, kw)
                    .or().like(Person::getMobile, kw));
        }
        if (status != null) {
            wrapper.eq(Person::getStatus, status);
        }
        wrapper.orderByDesc(Person::getId);
        Page<Person> result = personMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public Person getPerson(Long id) {
        Person person = id == null ? null : personMapper.selectById(id);
        if (person == null) {
            throw new BusinessException("人员不存在或已删除");
        }
        return person;
    }

    @Override
    @Transactional
    public Person savePerson(Person entity) {
        if (entity == null || !StringUtils.hasText(entity.getName())) {
            throw new BusinessException("人员姓名不能为空");
        }
        entity.setName(entity.getName().trim());
        if (StringUtils.hasText(entity.getPersonNo())) {
            entity.setPersonNo(entity.getPersonNo().trim());
            Long dup = personMapper.selectCount(new LambdaQueryWrapper<Person>()
                    .eq(Person::getPersonNo, entity.getPersonNo())
                    .ne(entity.getId() != null, Person::getId, entity.getId()));
            if (dup != null && dup > 0) {
                throw new BusinessException("工号已存在：" + entity.getPersonNo());
            }
        }
        if (entity.getSysUserId() != null) {
            // 账号映射必须指向真实账号：否则详情页会显示一个不存在的入口
            SysUser account = sysUserMapper.selectById(entity.getSysUserId());
            if (account == null) {
                throw new BusinessException("关联账号不存在");
            }
            Long bound = personMapper.selectCount(new LambdaQueryWrapper<Person>()
                    .eq(Person::getSysUserId, entity.getSysUserId())
                    .ne(entity.getId() != null, Person::getId, entity.getId()));
            if (bound != null && bound > 0) {
                throw new BusinessException("该账号已绑定其他人员");
            }
        }
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            personMapper.insert(entity);
        } else {
            getPerson(entity.getId());
            personMapper.updateById(entity);
        }
        return personMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deletePerson(Long id) {
        getPerson(id);
        Long employments = employmentMapper.selectCount(new LambdaQueryWrapper<HrEmployment>()
                .eq(HrEmployment::getPersonId, id));
        if (employments != null && employments > 0) {
            throw new BusinessException("该人员仍有雇佣记录，请先终止雇佣，不能直接删除");
        }
        personMapper.deleteById(id);
    }

    /* ==================== 雇佣关系 ==================== */

    @Override
    public PageResult<HrEmployment> listEmployments(Long personId, long page, long size, Integer status) {
        LambdaQueryWrapper<HrEmployment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(personId != null, HrEmployment::getPersonId, personId);
        wrapper.eq(status != null, HrEmployment::getStatus, status);
        wrapper.orderByDesc(HrEmployment::getStartDate).orderByDesc(HrEmployment::getId);
        Page<HrEmployment> result = employmentMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public HrEmployment getEmployment(Long id) {
        HrEmployment entity = id == null ? null : employmentMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("雇佣记录不存在或已删除");
        }
        return entity;
    }

    @Override
    @Transactional
    public HrEmployment saveEmployment(HrEmployment entity) {
        if (entity == null || entity.getPersonId() == null) {
            throw new BusinessException("请选择人员");
        }
        if (entity.getLegalEntityId() == null) {
            throw new BusinessException("请选择雇主法人");
        }
        if (entity.getStartDate() == null) {
            throw new BusinessException("雇佣开始日期不能为空");
        }
        if (entity.getEndDate() != null && entity.getEndDate().isBefore(entity.getStartDate())) {
            throw new BusinessException("雇佣结束日期不能早于开始日期");
        }
        getPerson(entity.getPersonId());
        OrgLegalEntity legalEntity = legalEntityMapper.selectById(entity.getLegalEntityId());
        if (legalEntity == null) {
            throw new BusinessException("雇主法人不存在");
        }
        if (!Integer.valueOf(1).equals(legalEntity.getStatus())) {
            throw new BusinessException("雇主法人已停用，不能新建雇佣关系");
        }
        String type = StringUtils.hasText(entity.getEmploymentType())
                ? entity.getEmploymentType() : "FULL_TIME";
        if (!EMPLOYMENT_TYPES.contains(type)) {
            throw new BusinessException("雇佣类型不合法：" + type);
        }
        entity.setEmploymentType(type);
        String jurisdiction = StringUtils.hasText(entity.getJurisdiction())
                ? entity.getJurisdiction().toUpperCase() : legalEntity.getJurisdiction();
        if (!JURISDICTIONS.contains(jurisdiction)) {
            throw new BusinessException("法域只能是 CN / HK / MO");
        }
        entity.setJurisdiction(jurisdiction);
        if (StringUtils.hasText(entity.getEmploymentNo())) {
            entity.setEmploymentNo(entity.getEmploymentNo().trim());
            Long dup = employmentMapper.selectCount(new LambdaQueryWrapper<HrEmployment>()
                    .eq(HrEmployment::getEmploymentNo, entity.getEmploymentNo())
                    .ne(entity.getId() != null, HrEmployment::getId, entity.getId()));
            if (dup != null && dup > 0) {
                throw new BusinessException("雇佣编号已存在：" + entity.getEmploymentNo());
            }
        }
        // 同一法人同期重叠视为重复雇佣；不同法人并行是允许的（跨国兼岗）
        List<HrEmployment> sameEntity = employmentMapper.selectList(new LambdaQueryWrapper<HrEmployment>()
                .eq(HrEmployment::getPersonId, entity.getPersonId())
                .eq(HrEmployment::getLegalEntityId, entity.getLegalEntityId())
                .ne(entity.getId() != null, HrEmployment::getId, entity.getId()));
        for (HrEmployment other : sameEntity) {
            boolean overlapped = (other.getEndDate() == null || !other.getEndDate().isBefore(entity.getStartDate()))
                    && (entity.getEndDate() == null || !entity.getEndDate().isBefore(other.getStartDate()));
            if (overlapped) {
                throw new BusinessException("同一法人的雇佣期间重叠，请检查已有记录："
                        + (other.getEmploymentNo() == null ? other.getId() : other.getEmploymentNo()));
            }
        }
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            employmentMapper.insert(entity);
        } else {
            getEmployment(entity.getId());
            employmentMapper.updateById(entity);
        }
        return employmentMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public HrEmployment terminateEmployment(Long id, LocalDate endDate) {
        HrEmployment entity = getEmployment(id);
        if (endDate == null) {
            throw new BusinessException("请填写终止日期");
        }
        if (endDate.isBefore(entity.getStartDate())) {
            throw new BusinessException("终止日期不能早于雇佣开始日期");
        }
        entity.setEndDate(endDate);
        entity.setStatus(0);
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        employmentMapper.updateById(entity);
        return employmentMapper.selectById(id);
    }

    /* ==================== 任职 ==================== */

    @Override
    public PageResult<HrAssignment> listAssignments(Long employmentId, LocalDate asOf, long page, long size) {
        LambdaQueryWrapper<HrAssignment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(employmentId != null, HrAssignment::getEmploymentId, employmentId);
        if (asOf != null) {
            // 日期生效口径：起日 <= asOf 且（止日为空或止日 >= asOf）
            wrapper.le(HrAssignment::getEffectiveFrom, asOf)
                    .and(w -> w.isNull(HrAssignment::getEffectiveTo).or().ge(HrAssignment::getEffectiveTo, asOf));
        }
        wrapper.orderByDesc(HrAssignment::getEffectiveFrom).orderByAsc(HrAssignment::getSeqNo);
        Page<HrAssignment> result = assignmentMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public HrAssignment getAssignment(Long id) {
        HrAssignment entity = id == null ? null : assignmentMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("任职记录不存在或已删除");
        }
        return entity;
    }

    @Override
    @Transactional
    public HrAssignment saveAssignment(HrAssignment entity) {
        if (entity == null || entity.getEmploymentId() == null) {
            throw new BusinessException("请选择雇佣记录");
        }
        if (entity.getUnitId() == null) {
            throw new BusinessException("请选择任职组织");
        }
        if (entity.getEffectiveFrom() == null) {
            throw new BusinessException("生效日期不能为空");
        }
        if (entity.getEffectiveTo() != null && entity.getEffectiveTo().isBefore(entity.getEffectiveFrom())) {
            throw new BusinessException("生效截止不能早于生效日期");
        }
        HrEmployment employment = getEmployment(entity.getEmploymentId());
        OrgUnit unit = unitMapper.selectById(entity.getUnitId());
        if (unit == null) {
            throw new BusinessException("任职组织不存在");
        }
        if (!unit.getLegalEntityId().equals(employment.getLegalEntityId())) {
            throw new BusinessException("任职组织不属于该雇佣的雇主法人，禁止跨法人任职");
        }
        if (entity.getPositionId() != null) {
            OrgPosition position = positionMapper.selectById(entity.getPositionId());
            if (position == null) {
                throw new BusinessException("岗位不存在");
            }
            if (!position.getUnitId().equals(entity.getUnitId())) {
                throw new BusinessException("所选岗位不属于该组织");
            }
        }
        BigDecimal fte = entity.getFte() == null ? BigDecimal.ONE : entity.getFte();
        if (fte.compareTo(new BigDecimal("0.01")) < 0 || fte.compareTo(BigDecimal.ONE) > 0) {
            throw new BusinessException("FTE 必须在 0.01 ~ 1.00 之间");
        }
        entity.setFte(fte);
        int primary = Integer.valueOf(1).equals(entity.getPrimaryFlag()) ? 1 : 0;
        entity.setPrimaryFlag(primary);
        if (entity.getSeqNo() == null || entity.getSeqNo() < 1) {
            entity.setSeqNo(1);
        }
        if (primary == 1) {
            // 同一雇佣只允许一个"未结束"的主任职；已结束的历史主任职不占用名额
            Long existingPrimary = assignmentMapper.selectCount(new LambdaQueryWrapper<HrAssignment>()
                    .eq(HrAssignment::getEmploymentId, entity.getEmploymentId())
                    .eq(HrAssignment::getPrimaryFlag, 1)
                    .isNull(HrAssignment::getEffectiveTo)
                    .ne(entity.getId() != null, HrAssignment::getId, entity.getId()));
            if (existingPrimary != null && existingPrimary > 0) {
                throw new BusinessException("该雇佣已有生效中的主任职，请先结束原主任职");
            }
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            assignmentMapper.insert(entity);
        } else {
            HrAssignment existing = assignmentMapper.selectById(entity.getId());
            if (existing == null) {
                throw new BusinessException("任职记录不存在或已删除");
            }
            assignmentMapper.updateById(entity);
        }
        return assignmentMapper.selectById(entity.getId());
    }
}
