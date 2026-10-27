package com.mftb.admin.service.impl;

import com.mftb.admin.contracts.hr.HrLifecycleCallbackService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.dto.PositionRecordVO;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.PositionRecordService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

/**
 * 职务记录服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PositionRecordServiceImpl implements PositionRecordService {

    private final EmpPositionRecordMapper positionRecordMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysPositionMapper sysPositionMapper;
    private final OperatorResolver operatorResolver;
    private final EmployeeService employeeService;
    private final HrMasterDataResolver masterDataResolver;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final HrAuditService hrAuditService;
    /**
     * 当前任职口径：职务变动保存后要把「当前生效的那一条」同步到账号投影，
     * 否则花名册/部门授权等读 sys_user 的地方永远停在调动前。
     */
    private final HrAssignmentQuery hrAssignmentQuery;
    /** 部门变动会改变数据范围授权，投影写完后必须失效权限缓存 */
    private final PermissionService permissionService;

    @Override
    public List<PositionRecordVO> listByUserId(Long userId) {
        requireUser(userId);
        LambdaQueryWrapper<EmpPositionRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpPositionRecord::getUserId, userId)
                .orderByDesc(EmpPositionRecord::getEffectiveDate)
                .orderByDesc(EmpPositionRecord::getEffectiveSeq);
        return positionRecordMapper.selectList(wrapper).stream()
                .map(PositionRecordVO::from)
                .toList();
    }

    @Override
    @Transactional
    public PositionRecordVO create(Long userId, PositionRecordRequest request) {
        requireUser(userId);
        int nextSeq = getNextEffectiveSeq(userId, request.getEffectiveDate());

        EmpPositionRecord entity = new EmpPositionRecord();
        entity.setUserId(userId);
        entity.setEffectiveDate(request.getEffectiveDate());
        entity.setEffectiveSeq(nextSeq);
        applyOperation(entity, request);
        entity.setReason(request.getReason());
        entity.setServiceDept(request.getServiceDept());
        entity.setSequenceType(request.getSequenceType());
        entity.setPositionLevel(request.getPositionLevel());
        entity.setRankCode(request.getRankCode());
        entity.setCompany(request.getCompany());
        entity.setEmployeeCategory(request.getEmployeeCategory());
        entity.setWorkSystem(request.getWorkSystem());
        entity.setPositionName(request.getPositionName());
        entity.setDirectSuperior(request.getDirectSuperior());
        entity.setMentor(request.getMentor());
        entity.setWorkCountry(request.getWorkCountry());
        entity.setWorkCity(request.getWorkCity());
        entity.setOfficeAddress(request.getOfficeAddress());
        entity.setContractLocation(request.getContractLocation());
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        // 名称→稳定 ID 归一（只认唯一命中），失败留 NULL：写错关联比留空更难发现
        masterDataResolver.applyStableIds(entity);
        positionRecordMapper.insert(entity);
        syncPeriods(userId);
        // 职务变动一落库，账号投影（部门/职位快照）必须跟上，否则 RDM/花名册等读到的是旧部门
        syncAccountProjection(userId);
        // P1-F: 离职记录且生效日 <= 今天时，自动停用账号并强制下线（复用员工服务，同一事务）
        // 判定看 code 而不是中文名称（方案 §5.3）：名称存简体、界面显示繁体，历史上已踩过。
        if (HrOperationCode.DIMISSION.equals(entity.getOperationCode())
                && request.getEffectiveDate() != null
                && !request.getEffectiveDate().isAfter(LocalDate.now())) {
            employeeService.updateStatus(userId, 0);
        }
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, userId)
                .detail("新增异动 #" + entity.getId() + " " + entity.getOperationCode()
                        + " @ " + entity.getEffectiveDate())
                .reason(request.getReason())
                .effectiveDate(request.getEffectiveDate()));
        return PositionRecordVO.from(entity);
    }

    @Override
    @Transactional
    public PositionRecordVO update(Long userId, Long recordId, PositionRecordRequest request) {
        requireUser(userId);
        EmpPositionRecord entity = positionRecordMapper.selectById(recordId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("職務記錄不存在");
        }
        // 编辑时按新日期重新计算 effectiveSeq（同日期第 N 条 = N-1）
        int nextSeq = getNextEffectiveSeq(userId, request.getEffectiveDate());

        entity.setEffectiveDate(request.getEffectiveDate());
        entity.setEffectiveSeq(nextSeq);
        applyOperation(entity, request);
        entity.setReason(request.getReason());
        entity.setServiceDept(request.getServiceDept());
        entity.setSequenceType(request.getSequenceType());
        entity.setPositionLevel(request.getPositionLevel());
        entity.setRankCode(request.getRankCode());
        entity.setCompany(request.getCompany());
        entity.setEmployeeCategory(request.getEmployeeCategory());
        entity.setWorkSystem(request.getWorkSystem());
        entity.setPositionName(request.getPositionName());
        entity.setDirectSuperior(request.getDirectSuperior());
        entity.setMentor(request.getMentor());
        entity.setWorkCountry(request.getWorkCountry());
        entity.setWorkCity(request.getWorkCity());
        entity.setOfficeAddress(request.getOfficeAddress());
        entity.setContractLocation(request.getContractLocation());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        masterDataResolver.applyStableIds(entity);
        positionRecordMapper.updateById(entity);
        syncPeriods(userId);
        syncAccountProjection(userId);
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, userId)
                .detail("编辑异动 #" + recordId + " " + entity.getOperationCode()
                        + " @ " + entity.getEffectiveDate())
                .reason(request.getReason())
                .effectiveDate(request.getEffectiveDate()));
        return PositionRecordVO.from(entity);
    }

    @Override
    @Transactional
    public void delete(Long userId, Long recordId) {
        requireUser(userId);
        EmpPositionRecord entity = positionRecordMapper.selectById(recordId);
        if (entity == null || !userId.equals(entity.getUserId())) {
            throw new BusinessException("職務記錄不存在");
        }
        positionRecordMapper.deleteById(recordId);
        // 删一条异动同样会改变雇佣期间（比如删掉误登记的离职），必须重算
        syncPeriods(userId);
        // 删掉的如果正是当前生效记录，账号投影要回退到上一条生效任职
        syncAccountProjection(userId);
        // 删除异动是最难事后重建的操作（行已软删，只能靠审计知道它当时是什么）
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, userId)
                .detail("删除异动 #" + recordId + " " + entity.getOperationCode()
                        + " @ " + entity.getEffectiveDate())
                .effectiveDate(entity.getEffectiveDate()));
    }

    /**
     * 任职事实变动后同步雇佣期间。
     * <p>双轨期间雇佣期间表是「旁路投影」，投影不跟着事实走就永远是旧账；
     * 这里的自动同步只针对「本次被动过的这个人」，不构成历史批量迁移。
     */
    private void syncPeriods(Long userId) {
        employmentPeriodService.syncFromRecords(userId, operatorResolver.currentOperatorName());
    }

    /**
     * 把「当前生效的任职事实」同步到账号投影（sys_user 的部门/职位快照）。
     *
     * <p><b>为何必须写这一层</b>：人事系统的职务变动只写 {@code emp_position_record}，
     * 而花名册列表、部门数据权限、RDM/资产等模块都读 {@code sys_user.department_id}。
     * 不写投影就会出现“员工详情已是新部门、花名册与任务表单还是旧部门”的两份答案。
     * 异动审批（{@link com.mftb.admin.service.impl.HrLifecycleCallbackServiceImpl}）
     * 本来就会回写账号，这里把“档案里直接登记职务变动”这条路径补齐到同一口径。
     *
     * <p><b>只同步当前生效的那条</b>：未来生效的异动不得提前改账号，回退/删除也要能退回上一条，
     * 所以统一走 {@link HrAssignmentQuery#asOf}，不自己比较 “最新一条”。
     *
     * <p><b>名称与 ID 的处理</b>：有稳定 ID（deptId/positionId）时两者一起写；
     * 历史记录只有名称快照时不按名称猜 ID（同名部门可能属于不同父级，猜错会把数据权限挂错），
     * 只同步名称并留日志。
     */
    private void syncAccountProjection(Long userId) {
        EmpPositionRecord current = hrAssignmentQuery.asOf(userId, LocalDate.now()).orElse(null);
        if (current == null) {
            return;
        }
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            return;
        }
        boolean deptChanged = applyDepartmentProjection(user, current);
        boolean positionChanged = applyPositionProjection(user, current);
        if (!deptChanged && !positionChanged) {
            return;
        }
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);
        // 部门变了等于数据范围变了：不失效缓存，新部门授权要等重启才生效
        permissionService.evictAll();
        log.info("職務變動已同步賬號投影: userId={}, dept={}({}), position={}({})",
                userId, user.getDepartment(), user.getDepartmentId(), user.getPosition(), user.getPositionId());
    }

    /** 部门投影：有 deptId 时 ID 与名称一起写，只有名称时仅同步展示名 */
    private boolean applyDepartmentProjection(SysUser user, EmpPositionRecord current) {
        if (current.getDeptId() != null) {
            if (Objects.equals(user.getDepartmentId(), current.getDeptId())) {
                return false;
            }
            SysDepartment dept = sysDepartmentMapper.selectById(current.getDeptId());
            if (dept == null) {
                log.warn("職務變動同步部門時主數據缺失，跳過: userId={}, deptId={}", user.getId(), current.getDeptId());
                return false;
            }
            user.setDepartmentId(dept.getId());
            user.setDepartment(dept.getName());
            user.setDepartmentEn(dept.getNameEn());
            return true;
        }
        if (!StringUtils.hasText(current.getServiceDept())
                || Objects.equals(user.getDepartment(), current.getServiceDept())) {
            return false;
        }
        // 历史记录没有稳定 ID：只同步名称，不动 department_id，避免同名部门误挂授权
        log.warn("職務變動只有部門名稱快照，僅同步名稱不改 ID: userId={}, dept={}", user.getId(), current.getServiceDept());
        user.setDepartment(current.getServiceDept());
        return true;
    }

    /** 职位投影：positionId 存在时连同序列/职级/职等一起写，与异动审批口径一致 */
    private boolean applyPositionProjection(SysUser user, EmpPositionRecord current) {
        if (current.getPositionId() != null) {
            if (Objects.equals(user.getPositionId(), current.getPositionId())) {
                return false;
            }
            SysPosition position = sysPositionMapper.selectById(current.getPositionId());
            if (position == null) {
                log.warn("職務變動同步職位時主數據缺失，跳過: userId={}, positionId={}", user.getId(), current.getPositionId());
                return false;
            }
            user.setPositionId(position.getId());
            user.setPosition(position.getName());
            user.setPositionEn(position.getNameEn());
            user.setSequence(position.getSequence());
            user.setJobLevel(position.getJobLevel());
            user.setRank(position.getRank());
            return true;
        }
        if (!StringUtils.hasText(current.getPositionName())
                || Objects.equals(user.getPosition(), current.getPositionName())) {
            return false;
        }
        user.setPosition(current.getPositionName());
        return true;
    }

    /**
     * 写入异动动作：以 code 为准，名称作为展示快照同步规范化。
     * <p>两个都没给就拒写：在职/离职完全由这个动作派生，缺它就不能猜。
     */
    private void applyOperation(EmpPositionRecord entity, PositionRecordRequest request) {
        String raw = StringUtils.hasText(request.getOperationCode())
                ? request.getOperationCode()
                : request.getOperation();
        if (!StringUtils.hasText(raw)) {
            throw new BusinessException("操作類型或動作 code 至少填一個");
        }
        String code = HrOperationCode.codeForWrite(raw);
        entity.setOperationCode(code);
        // 能识别的写规范简体名（与历史写法一致）；识别不了时保留原输入，不编造一个错的名称
        entity.setOperation(HrOperationCode.OTHER.equals(code)
                ? raw.trim() : HrOperationCode.nameForWrite(code));
    }

    /** 获取指定员工在指定日期的下一个 effectiveSeq（同日期当前最大值 + 1，无记录则返回 0） */
    private int getNextEffectiveSeq(Long userId, LocalDate effectiveDate) {
        LambdaQueryWrapper<EmpPositionRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EmpPositionRecord::getUserId, userId)
                .eq(EmpPositionRecord::getEffectiveDate, effectiveDate)
                .orderByDesc(EmpPositionRecord::getEffectiveSeq)
                .last("LIMIT 1");
        EmpPositionRecord latest = positionRecordMapper.selectOne(wrapper);
        return latest == null ? 0 : latest.getEffectiveSeq() + 1;
    }

    private void requireUser(Long userId) {
        if (sysUserMapper.selectById(userId) == null) {
            throw new BusinessException("員工不存在");
        }
    }
}
