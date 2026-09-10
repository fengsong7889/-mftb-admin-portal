package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.SysBizSeqRule;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.entity.SysLoginLog;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 集团员工服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeServiceImpl implements EmployeeService {

    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysPositionMapper sysPositionMapper;
    private final SysLoginLogMapper sysLoginLogMapper;
    private final EmpPositionRecordMapper empPositionRecordMapper;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final BizSeqService bizSeqService;

    /** 内置管理员登录账号(工号), 禁止停用/删除 */
    private static final String BUILTIN_ADMIN = "MF00001";

    @Override
    public PageResult<EmployeeVO> list(long page, long size, String keyword, String employmentStatus) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);

        // 先查询符合关键字条件的全部用户（不分页），用于后续 employmentStatus 过滤
        LambdaQueryWrapper<SysUser> baseWrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            baseWrapper.and(w -> w.like(SysUser::getUsername, keyword)
                    .or().like(SysUser::getName, keyword)
                    .or().like(SysUser::getEmpId, keyword));
        }
        baseWrapper.orderByDesc(SysUser::getCreatedAt);
        List<SysUser> allUsers = sysUserMapper.selectList(baseWrapper);

        // 批量获取最新职务记录，派生 employmentStatus
        if (!allUsers.isEmpty()) {
            List<Long> userIds = allUsers.stream().map(SysUser::getId).toList();
            Map<Long, String> latestOps = getLatestOperations(userIds);

            // 按 employmentStatus 过滤
            if (StringUtils.hasText(employmentStatus)) {
                allUsers = allUsers.stream().filter(u -> {
                    String op = latestOps.get(u.getId());
                    boolean isResigned = "离职".equals(op);
                    return "resigned".equals(employmentStatus) ? isResigned : !isResigned;
                }).toList();
            }

            // 手动分页
            long total = allUsers.size();
            int from = (int) ((page - 1) * size);
            int to = (int) Math.min(from + size, total);
            List<EmployeeVO> records = (from < total)
                    ? allUsers.subList(from, to).stream()
                        .map(u -> {
                            EmployeeVO vo = EmployeeVO.from(u, JsonUtils.parseLongList(u.getFunctionRoles()));
                            String op = latestOps.get(u.getId());
                            vo.setEmploymentStatus("离职".equals(op) ? "resigned" : "active");
                            return vo;
                        })
                        .toList()
                    : List.of();
            return new PageResult<>(records, total);
        }

        return new PageResult<>(List.of(), 0L);
    }

    /** 批量查询多个用户的最新职务记录操作类型 */
    private Map<Long, String> getLatestOperations(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) return Map.of();
        LambdaQueryWrapper<EmpPositionRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(EmpPositionRecord::getUserId, userIds)
                .orderByDesc(EmpPositionRecord::getEffectiveDate)
                .orderByDesc(EmpPositionRecord::getEffectiveSeq);
        List<EmpPositionRecord> records = empPositionRecordMapper.selectList(wrapper);
        // 按 userId 分组，取每组日期最新、序号最大的记录的 operation
        return records.stream()
                .collect(Collectors.groupingBy(EmpPositionRecord::getUserId))
                .entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> e.getValue().get(0).getOperation()
                ));
    }

    @Override
    public EmployeeVO create(EmployeeRequest request) {
        if (!StringUtils.hasText(request.getPassword()) || request.getPassword().length() < 6) {
            throw new BusinessException("登录密码不能为空且长度不少于 6 位");
        }
        // 工号由系统按编号生成规则 employee_no 自动生成, 同时作为登录账号, 不接受前端传入
        String empId = generateEmpId();
        SysUser user = new SysUser();
        user.setUsername(empId);
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setName(request.getName());
        user.setEmpId(empId);
        user.setAvatar("pikachu-default");
        user.setRole(StringUtils.hasText(request.getRole()) ? request.getRole() : "guest");
        user.setFunctionRoles(JsonUtils.toJson(request.getFunctionRoleIds() == null ? List.of() : request.getFunctionRoleIds()));
        applyDepartment(user, request.getDepartmentId());
        applyPosition(user, request.getPositionId());
        // 职等由 applyPosition 从职位配置自动带出，不再接受前端传入
        user.setStatus(1);
        user.setDeleted(0);
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.insert(user);
        return EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
    }

    @Override
    public EmployeeVO update(Long id, EmployeeRequest request) {
        SysUser user = requireUser(id);
        String oldName = user.getName();
        String oldDept = user.getDepartment();
        user.setName(request.getName());
        // 工号即登录账号, 由系统生成后不允许修改
        applyDepartment(user, request.getDepartmentId());
        applyPosition(user, request.getPositionId());
        // 职等由 applyPosition 从职位配置自动带出，不再接受前端传入
        if (StringUtils.hasText(request.getRole()) && !BUILTIN_ADMIN.equals(user.getUsername())) {
            user.setRole(request.getRole());
        }
        if (request.getFunctionRoleIds() != null) {
            user.setFunctionRoles(JsonUtils.toJson(request.getFunctionRoleIds()));
        }
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);

        // 角色/部门变更影响操作权限, 清空权限缓存
        permissionService.evictAll();

        // 姓名或部门变更时，同步更新登录日志中该员工的快照字段
        syncLoginLogSnapshot(user, oldName, oldDept);

        return EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
    }

    @Override
    public void resetPassword(Long id, String password) {
        SysUser user = requireUser(id);
        user.setPassword(passwordEncoder.encode(password));
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysUser user = requireUser(id);
        if (BUILTIN_ADMIN.equals(user.getUsername()) && status != null && status == 0) {
            throw new BusinessException("內置管理员账号不允许停用");
        }
        user.setStatus(status);
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);
    
        // 停用账号时，如果该账号当前在线，同步强制下线（与员工动态「操作下线」一致）
        if (status != null && status == 0 && user.getActiveToken() != null) {
            forceLogoutOnDisable(user);
        }
    }
    
    /**
     * 停用账号时强制下线: 清除 activeToken, 设置强制下线标记（原因为账号被停用）,
     * 同时将该用户当前的在线登录日志标记为强制下线。
     */
    private void forceLogoutOnDisable(SysUser user) {
        // 1. 更新 sys_user: 清除 activeToken, 设置强制下线标记
        sysUserMapper.update(null,
                new LambdaUpdateWrapper<SysUser>()
                        .eq(SysUser::getId, user.getId())
                        .set(SysUser::getActiveToken, null)
                        .set(SysUser::getForceLogoutOperator, "系統")
                        .set(SysUser::getForceLogoutEmpId, user.getEmpId())
                        .set(SysUser::getForceLogoutReason, "account_disabled"));
    
        // 2. 更新登录日志: 将该用户当前在线记录标记为强制下线
        LocalDateTime now = LocalDateTime.now();
        sysLoginLogMapper.update(null,
                new LambdaUpdateWrapper<SysLoginLog>()
                        .eq(SysLoginLog::getUserId, user.getId())
                        .isNull(SysLoginLog::getLogoutTime)
                        .set(SysLoginLog::getLogoutTime, now)
                        .set(SysLoginLog::getLogoutReason, "forced"));
    
        log.info("账号停用强制下线: userId={}, username={}", user.getId(), user.getUsername());
    }

    @Override
    public void delete(Long id) {
        SysUser user = requireUser(id);
        if (BUILTIN_ADMIN.equals(user.getUsername())) {
            throw new BusinessException("内置管理员账号不允许删除");
        }
        sysUserMapper.deleteById(id);
        permissionService.evictAll();
    }

    /**
     * 生成下一个工号: 按编号生成规则 employee_no（前缀 + n位自增序号，取表内最大序号+1）
     * 原生 SQL 包含逻辑删除记录, 避免复用已删除员工的工号（每个工号终身唯一）
     */
    private String generateEmpId() {
        SysBizSeqRule rule = bizSeqService.getRule(BizSeqService.RULE_EMPLOYEE_NO);
        String prefix = rule.getPrefix();
        int seqLength = rule.getSeqLength() == null ? 5 : rule.getSeqLength();
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(username, " + (prefix.length() + 1) + ") AS UNSIGNED)), 0) "
                        + "FROM sys_user WHERE username REGEXP ?",
                Integer.class, "^" + prefix + "[0-9]+$");
        return String.format("%s%0" + seqLength + "d", prefix, (maxSeq == null ? 0 : maxSeq) + 1);
    }

    /** 设置员工所在部门: 校验部门存在并写入部门名称快照 */
    private void applyDepartment(SysUser user, Long departmentId) {
        if (departmentId == null) {
            user.setDepartmentId(null);
            user.setDepartment(null);
            user.setDepartmentEn(null);
            return;
        }
        SysDepartment dept = sysDepartmentMapper.selectById(departmentId);
        if (dept == null) {
            throw new BusinessException("所选部门不存在");
        }
        user.setDepartmentId(dept.getId());
        user.setDepartment(dept.getName());
        user.setDepartmentEn(dept.getNameEn());
    }

    /** 设置员工职位: 校验职位存在并写入职位中英文名称/职级序列/职级快照/职等快照 */
    private void applyPosition(SysUser user, Long positionId) {
        if (positionId == null) {
            user.setPositionId(null);
            user.setPosition(null);
            user.setPositionEn(null);
            user.setSequence(null);
            user.setJobLevel(null);
            user.setRank(null);
            return;
        }
        SysPosition position = sysPositionMapper.selectById(positionId);
        if (position == null) {
            throw new BusinessException("所选职位不存在");
        }
        user.setPositionId(position.getId());
        user.setPosition(position.getName());
        user.setPositionEn(position.getNameEn());
        user.setSequence(position.getSequence());
        user.setJobLevel(position.getJobLevel());
        // 职等强制跟随职位配置的职等，不允许员工单独设置不同的职等
        user.setRank(position.getRank());
    }

    /**
     * 当员工姓名或部门发生变更时，同步更新该员工在登录日志中的快照字段，
     * 确保员工动态页面展示的姓名/部门与最新信息一致。
     */
    private void syncLoginLogSnapshot(SysUser user, String oldName, String oldDept) {
        boolean nameChanged = !java.util.Objects.equals(oldName, user.getName());
        boolean deptChanged = !java.util.Objects.equals(oldDept, user.getDepartment());
        if (!nameChanged && !deptChanged) {
            return;
        }
        LambdaUpdateWrapper<SysLoginLog> wrapper = new LambdaUpdateWrapper<SysLoginLog>()
                .eq(SysLoginLog::getUserId, user.getId());
        if (nameChanged) {
            wrapper.set(SysLoginLog::getEmployeeName, user.getName());
        }
        if (deptChanged) {
            wrapper.set(SysLoginLog::getDepartmentName, user.getDepartment());
        }
        sysLoginLogMapper.update(null, wrapper);
        log.info("同步登录日志快照: userId={}, nameChanged={}, deptChanged={}",
                user.getId(), nameChanged, deptChanged);
    }

    @Override
    public Map<String, Object> getBasicInfo(Long id) {
        SysUser user = requireUser(id);
        Map<String, Object> result = new HashMap<>();
        // 个人信息
        Map<String, Object> personal = new HashMap<>();
        personal.put("nationality", user.getNationality());
        personal.put("ethnicity", user.getEthnicity());
        personal.put("birthDate", user.getBirthDate());
        personal.put("maritalStatus", user.getMaritalStatus());
        personal.put("politicalStatus", user.getPoliticalStatus());
        personal.put("religion", user.getReligion());
        result.put("personalInfo", personal);
        // 证件信息
        Map<String, Object> idInfo = new HashMap<>();
        idInfo.put("idType", user.getIdType());
        idInfo.put("idNumber", user.getIdNumber());
        idInfo.put("idAddress", user.getIdAddress());
        idInfo.put("householdType", user.getHouseholdType());
        idInfo.put("householdLocation", user.getHouseholdLocation());
        idInfo.put("nativePlace", user.getNativePlace());
        result.put("idInfo", idInfo);
        // 通讯信息
        Map<String, Object> contact = new HashMap<>();
        contact.put("addressCountry", user.getAddressCountry());
        contact.put("addressCity", user.getAddressCity());
        contact.put("addressDetail", user.getAddressDetail());
        result.put("contactInfo", contact);
        return result;
    }

    @Override
    public void saveBasicInfo(Long id, BasicInfoRequest request) {
        SysUser user = requireUser(id);
        // 个人信息
        if (request.getNationality() != null) user.setNationality(request.getNationality());
        if (request.getEthnicity() != null) user.setEthnicity(request.getEthnicity());
        if (request.getBirthDate() != null) user.setBirthDate(request.getBirthDate());
        if (request.getMaritalStatus() != null) user.setMaritalStatus(request.getMaritalStatus());
        if (request.getPoliticalStatus() != null) user.setPoliticalStatus(request.getPoliticalStatus());
        if (request.getReligion() != null) user.setReligion(request.getReligion());
        // 证件信息
        if (request.getIdType() != null) user.setIdType(request.getIdType());
        if (request.getIdNumber() != null) user.setIdNumber(request.getIdNumber());
        if (request.getIdAddress() != null) user.setIdAddress(request.getIdAddress());
        if (request.getHouseholdType() != null) user.setHouseholdType(request.getHouseholdType());
        if (request.getHouseholdLocation() != null) user.setHouseholdLocation(request.getHouseholdLocation());
        if (request.getNativePlace() != null) user.setNativePlace(request.getNativePlace());
        // 通讯信息
        if (request.getAddressCountry() != null) user.setAddressCountry(request.getAddressCountry());
        if (request.getAddressCity() != null) user.setAddressCity(request.getAddressCity());
        if (request.getAddressDetail() != null) user.setAddressDetail(request.getAddressDetail());

        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);
    }

    private SysUser requireUser(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("员工不存在");
        }
        return user;
    }
}
