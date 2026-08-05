package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.entity.SysLoginLog;
import com.mftb.admin.mapper.SysLoginLogMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

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
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;
    private final OperatorResolver operatorResolver;

    /** 内置管理员登录账号(工号), 禁止停用/删除 */
    private static final String BUILTIN_ADMIN = "MF00001";

    /** 工号前缀: 工号由系统自动生成, 规则 MF + 5位自增序号 */
    private static final String EMP_ID_PREFIX = "MF";

    @Override
    public PageResult<EmployeeVO> list(long page, long size, String keyword, Integer status) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysUser::getUsername, keyword)
                    .or().like(SysUser::getName, keyword)
                    .or().like(SysUser::getEmpId, keyword));
        }
        if (status != null) {
            wrapper.eq(SysUser::getStatus, status);
        }
        wrapper.orderByDesc(SysUser::getCreatedAt);
        Page<SysUser> result = sysUserMapper.selectPage(new Page<>(page, size), wrapper);
        List<EmployeeVO> records = result.getRecords().stream()
                .map(u -> EmployeeVO.from(u, JsonUtils.parseLongList(u.getFunctionRoles())))
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public EmployeeVO create(EmployeeRequest request) {
        if (!StringUtils.hasText(request.getPassword()) || request.getPassword().length() < 6) {
            throw new BusinessException("登录密码不能为空且长度不少于 6 位");
        }
        // 工号由系统自动生成 (MT + 4位自增), 同时作为登录账号, 不接受前端传入
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
    }

    /**
     * 生成下一个工号: 取当前最大 MF 序号 + 1 (原生 SQL 包含逻辑删除记录, 避免复用已删除员工的工号)
     */
    private String generateEmpId() {
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(username, 3) AS UNSIGNED)), 0) FROM sys_user "
                        + "WHERE username REGEXP '^MF[0-9]+$'",
                Integer.class);
        return String.format("%s%05d", EMP_ID_PREFIX, (maxSeq == null ? 0 : maxSeq) + 1);
    }

    /** 设置员工所在部门: 校验部门存在并写入部门名称快照 */
    private void applyDepartment(SysUser user, Long departmentId) {
        if (departmentId == null) {
            user.setDepartmentId(null);
            user.setDepartment(null);
            return;
        }
        SysDepartment dept = sysDepartmentMapper.selectById(departmentId);
        if (dept == null) {
            throw new BusinessException("所选部门不存在");
        }
        user.setDepartmentId(dept.getId());
        user.setDepartment(dept.getName());
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

    private SysUser requireUser(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("员工不存在");
        }
        return user;
    }
}
