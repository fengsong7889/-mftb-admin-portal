package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.HrAuditEntry;
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
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final HrAssignmentQuery hrAssignmentQuery;
    private final HrMasterDataResolver masterDataResolver;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final HrAuditService hrAuditService;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final BizSeqService bizSeqService;

    /**
     * 员工账号在 {@code sys_user.role} 上的唯一取值。
     * <p>{@code role='admin'} 是内置系统超管直通标记，只能由系统账号 {@link BuiltinAccounts#ADMIN_USERNAME}
     * 持有；员工权限一律走 function_roles（角色）与部门授权。
     */
    private static final String NORMAL_USER_ROLE = "guest";

    @Override
    public PageResult<EmployeeVO> list(long page, long size, String keyword, String employmentStatus,
                                       Long departmentId, String sequence, String jobLevel, String rank,
                                       Long roleId, String updatedBy, String updatedAtFrom, String updatedAtTo,
                                       Set<Long> visibleUserIds) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
        // 范围收敛先于一切：空集就是「谁也看不见」，不能落到后面的内存过滤上拿成全量
        if (visibleUserIds != null && visibleUserIds.isEmpty()) {
            return new PageResult<>(List.of(), 0L);
        }

        // 先按 DB 侧可下推条件过滤全部匹配用户（不分页），再对派生状态过滤 + 内存分页
        LambdaQueryWrapper<SysUser> baseWrapper = new LambdaQueryWrapper<>();
        // 内置系统管理员不是员工：不进员工名册（工号/部门/职位均为空，且不应被 HR 建档或统计）
        baseWrapper.ne(SysUser::getUsername, BuiltinAccounts.ADMIN_USERNAME);
        // 花名册入口传可见集合（null=不收敛）；下推到 SQL 而不是拿全量到内存里筛，
        // 否则列表、总数、导出三处口径会因截断上限而不一致
        if (visibleUserIds != null) {
            baseWrapper.in(SysUser::getId, visibleUserIds);
        }
        if (StringUtils.hasText(keyword)) {
            baseWrapper.and(w -> w.like(SysUser::getUsername, keyword)
                    .or().like(SysUser::getName, keyword)
                    .or().like(SysUser::getEmpId, keyword));
        }
        if (departmentId != null) {
            baseWrapper.in(SysUser::getDepartmentId, collectDeptAndDescendants(departmentId));
        }
        if (StringUtils.hasText(sequence)) baseWrapper.eq(SysUser::getSequence, sequence);
        if (StringUtils.hasText(jobLevel)) baseWrapper.eq(SysUser::getJobLevel, jobLevel);
        if (StringUtils.hasText(rank)) baseWrapper.eq(SysUser::getRank, rank);
        if (roleId != null) {
            baseWrapper.isNotNull(SysUser::getFunctionRoles)
                    .apply("JSON_CONTAINS(function_roles, {0})", String.valueOf(roleId));
        }
        if (StringUtils.hasText(updatedBy)) baseWrapper.like(SysUser::getUpdatedBy, updatedBy);
        if (StringUtils.hasText(updatedAtFrom)) baseWrapper.apply("DATE(updated_at) >= {0}", updatedAtFrom);
        if (StringUtils.hasText(updatedAtTo)) baseWrapper.apply("DATE(updated_at) <= {0}", updatedAtTo);
        baseWrapper.orderByDesc(SysUser::getCreatedAt);
        List<SysUser> allUsers = sysUserMapper.selectList(baseWrapper);

        if (allUsers.isEmpty()) {
            return new PageResult<>(List.of(), 0L);
        }

        // 批量派生 employmentStatus：口径统一走 HrAssignmentQuery（未来生效不提前参与判定）。
        // 以前此处自写一份「取最新一条再看中文名」，与详情/回调各有一套，同一个人在不同页面答案不同。
        List<Long> userIds = allUsers.stream().map(SysUser::getId).toList();
        Map<Long, String> statusById = hrAssignmentQuery.employmentStatusOf(userIds, LocalDate.now());

        // 按 employmentStatus 过滤（派生字段，内存过滤）
        if (StringUtils.hasText(employmentStatus)) {
            allUsers = allUsers.stream()
                    .filter(u -> employmentStatus.equals(
                            statusById.getOrDefault(u.getId(), HrAssignmentQuery.STATUS_ACTIVE)))
                    .toList();
        }

        // 手动分页（total 为筛选+派生过滤后的完整数量）
        long total = allUsers.size();
        int from = (int) ((page - 1) * size);
        int to = (int) Math.min(from + size, total);
        List<EmployeeVO> records = (from < total)
                ? allUsers.subList(from, to).stream()
                    .map(u -> {
                        EmployeeVO vo = EmployeeVO.from(u, JsonUtils.parseLongList(u.getFunctionRoles()));
                        vo.setEmploymentStatus(statusById.getOrDefault(u.getId(),
                                HrAssignmentQuery.STATUS_ACTIVE));
                        return vo;
                    })
                    .toList()
                : List.of();
        return new PageResult<>(records, total);
    }

    /** 收集指定部门及其全部子孙部门 ID（查询父部门时同时匹配下级部门员工） */
    private List<Long> collectDeptAndDescendants(Long rootId) {
        List<SysDepartment> all = sysDepartmentMapper.selectList(new LambdaQueryWrapper<>());
        Map<Long, List<Long>> childMap = new HashMap<>();
        for (SysDepartment d : all) {
            if (d.getParentId() != null) {
                childMap.computeIfAbsent(d.getParentId(), k -> new java.util.ArrayList<>()).add(d.getId());
            }
        }
        List<Long> ids = new java.util.ArrayList<>();
        java.util.Set<Long> visited = new java.util.HashSet<>();
        java.util.Deque<Long> stack = new java.util.ArrayDeque<>();
        stack.push(rootId);
        while (!stack.isEmpty()) {
            Long cur = stack.pop();
            if (!visited.add(cur)) continue;
            ids.add(cur);
            for (Long child : childMap.getOrDefault(cur, List.of())) stack.push(child);
        }
        return ids;
    }

    /**
     * 在职状态统一由 {@link HrAssignmentQuery} 派生（花名册列表、详情、异动自动停号共用一份口径）。
     * 本类不再自写「取最新一条 + 匹配中文名」的算法：那正是方案 §3.2 列的「当前任职存在多个事实来源」。
     */
    private String employmentStatusOf(Long userId) {
        return hrAssignmentQuery.employmentStatusOf(userId, LocalDate.now());
    }

    @Override
    public EmployeeVO getDetail(Long id) {
        SysUser user = requireUser(id);
        EmployeeVO vo = EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
        vo.setEmploymentStatus(employmentStatusOf(user.getId()));
        return vo;
    }

    @Override
    @Transactional
    public EmployeeVO create(EmployeeRequest request) {
        if (!StringUtils.hasText(request.getPassword()) || request.getPassword().length() < 6) {
            throw new BusinessException("登錄密碼不能為空且長度不少於 6 位");
        }
        // 工号由系统按编号生成规则 employee_no 自动生成, 同时作为登录账号, 不接受前端传入
        String empId = generateEmpId();
        SysUser user = new SysUser();
        user.setUsername(empId);
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        // 初始密码由他人设定 → 首次登录必须先改密（HR 入职建档走同一入口）
        user.setMustChangePassword(true);
        user.setName(request.getName());
        user.setEmpId(empId);
        user.setAvatar("pikachu-default");
        // role 不接受前端传入：允许写入等于「有 employee-management:create 就能直接造一个超管」。
        // 员工固定为普通账号，超管只有内置系统账号一个（见 core:builtin-admin-account-v1 后置校验）。
        user.setRole(NORMAL_USER_ROLE);
        // Round 6：新员工未显式绑定角色时，默认绑“员工自助”基底角色，
        // 保证统一门户上线后普通员工能默认进入 OA；已绑其他角色的不覆盖。
        java.util.List<Long> roleIds = request.getFunctionRoleIds() == null
                ? new java.util.ArrayList<>()
                : new java.util.ArrayList<>(request.getFunctionRoleIds());
        // 建档时指定角色本质上是授权动作：必须单独持有 authorize（方案 §7.3：
        // 人事编辑不能隐式获得角色授予能力）。服务端自己补的默认“员工自助”不在本拦截范围。
        if (!roleIds.isEmpty()) {
            assertCanAuthorize();
        }
        if (roleIds.isEmpty()) {
            Long selfServiceRoleId = lookupRoleIdByCode("employee_self_service");
            if (selfServiceRoleId != null) {
                roleIds.add(selfServiceRoleId);
                log.info("新员工 {} 默认绑定员工自助角色 roleId={}", empId, selfServiceRoleId);
            } else {
                log.warn("员工自助角色尚未初始化，新员工 {} 将不绑默认角色（需 HR 手工分配）", empId);
            }
        }
        assertNoSuperAdminBinding(roleIds);
        user.setFunctionRoles(JsonUtils.toJson(roleIds));
        applyDepartment(user, request.getDepartmentId());
        applyPosition(user, request.getPositionId());
        // 职等由 applyPosition 从职位配置自动带出，不再接受前端传入
        user.setStatus(1);
        user.setDeleted(0);
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.insert(user);
        // 自动写入初始职务记录: operation 固定「入职」, 任职信息映射自新增表单基础信息
        insertInitialPositionRecord(user, request.getCompany());
        // 默认角色绑定同样需要 bump revision，确保本实例/其他实例下次读能看到新权限
        permissionService.evictAll();
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.EMPLOYEE_CREATE, user.getId())
                .detail("工号 " + empId + "，默认绑定功能角色 " + roleIds)
                .effectiveDate(LocalDate.now()));
        return EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
    }

    /** 按 code 查 roleId（包含已软删的则过滤）；不存在返回 null，不抛异常。 */
    private Long lookupRoleIdByCode(String code) {
        java.util.List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = ? AND deleted = 0 AND status = 1 LIMIT 1",
                Long.class, code);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * 禁止员工账号绑定内置超级管理员角色（code=admin）。
     * 后端权限判定中绑定该角色即超管直通（PermissionServiceImpl.SUPER_ADMIN_ROLE_CODE），
     * 全系统只允许内置系统管理员账号（sys_user.role=admin）持有，防止权限旁路扩散。
     */
    private void assertNoSuperAdminBinding(java.util.List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return;
        }
        Long adminRoleId = lookupRoleIdByCode("admin");
        if (adminRoleId != null && roleIds.contains(adminRoleId)) {
            throw new BusinessException("不允許綁定「超級管理員」角色：超管權限僅由內置系統管理員賬號持有，請選擇其他功能角色");
        }
    }

    /**
     * 内置系统账号不属于员工档案，禁止经员工管理入口做任何变更。
     * <p>尤其是重置密码：该接口由 {@code employee-management:edit} 授权，若放行系统账号，
     * 等于「有员工编辑权就能重置超管密码并接管全系统」——典型的权限提升。
     * 超管密码只能通过本人登录后的自助改密接口变更。
     */
    private void assertNotSystemAccount(SysUser user, String action) {
        if (user != null && BuiltinAccounts.isSystemAccount(user.getUsername())) {
            throw new BusinessException("內置系統管理員賬號不是員工檔案，不允許" + action);
        }
    }

    @Override
    @Transactional
    public EmployeeVO update(Long id, EmployeeRequest request) {
        SysUser user = requireUser(id);
        assertNotSystemAccount(user, "編輯");
        String oldName = user.getName();
        String oldDept = user.getDepartment();
        Map<String, Object> beforeAssignment = assignmentSnapshot(user);
        user.setName(request.getName());
        // 工号即登录账号, 由系统生成后不允许修改
        applyDepartment(user, request.getDepartmentId());
        applyPosition(user, request.getPositionId());
        // 职等由 applyPosition 从职位配置自动带出，不再接受前端传入
        // role 同样不接受前端传入且不回写：否则有 employee-management:edit 就能把自己提成超管。
        // 权限变更一律走 functionRoleIds（下方已禁止绑超管角色）与部门授权。
        if (request.getFunctionRoleIds() != null) {
            // 改功能角色 = 授权动作，需单独持有 authorize；走 PUT /{id}/roles 是同一道门。
            // 这里不静默丢弃也不默默应用：前者会让前端以为改了，后者等于越权提权。
            assertCanAuthorize();
            assertNoSuperAdminBinding(request.getFunctionRoleIds());
            user.setFunctionRoles(JsonUtils.toJson(request.getFunctionRoleIds()));
        }
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);

        // 角色/部门变更影响操作权限, 清空权限缓存
        permissionService.evictAll();

        // 姓名或部门变更时，同步更新登录日志中该员工的快照字段
        syncLoginLogSnapshot(user, oldName, oldDept);

        Map<String, Object> afterAssignment = assignmentSnapshot(user);
        HrAuditEntry assignmentChange = HrAuditEntry.of(HrAuditAction.EMPLOYEE_UPDATE, id);
        for (String field : beforeAssignment.keySet()) {
            assignmentChange.change(field, beforeAssignment.get(field), afterAssignment.get(field));
        }
        hrAuditService.record(assignmentChange);

        return EmployeeVO.from(user, JsonUtils.parseLongList(user.getFunctionRoles()));
    }

    @Override
    @Transactional
    public EmployeeVO bindRoles(Long id, List<Long> functionRoleIds) {
        SysUser user = requireUser(id);
        assertNotSystemAccount(user, "調整功能角色");
        // authorize 由 controller 的 @RequirePermission 单点裁决（PUT /{id}/roles），
        // 服务层再校验一次会拒绝 OA 回调等无登录上下文的内部调用，所以不在这里重复。
        List<Long> targets = new java.util.ArrayList<>(
                functionRoleIds == null ? List.of() : functionRoleIds);
        assertNoSuperAdminBinding(targets);
        List<Long> before = JsonUtils.parseLongList(user.getFunctionRoles());
        user.setFunctionRoles(JsonUtils.toJson(targets));
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);
        permissionService.evictAll();
        // 提权动作必须进审计表而不是只写应用日志：日志会被轮转、不可按人检索，
        // 而「谁把这个人加成管理员」是事后唯一需要回答的问题
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.ROLE_BIND, id)
                .change("functionRoles", before, targets));
        return EmployeeVO.from(user, targets);
    }

    /**
     * 改功能角色 = 授权动作，必须单独持有 {@code authorize}（方案 §7.3）。
     * <p>超管在 {@code PermissionServiceImpl.hasPermission} 内直通，所以不需要额外分支；
     * 拿不到当前登录人时一律拒绝（fail-closed），不得因为“看不清是谁”而放行。
     */
    private void assertCanAuthorize() {
        SysUser operator = operatorResolver.currentUser();
        if (operator == null
                || !permissionService.hasPermission(operator, EmployeeConstants.MENU_EMPLOYEE,
                        EmployeeConstants.ACTION_AUTHORIZE)) {
            throw new BusinessException("調整功能角色需要單獨的「角色與菜單授權」權限，請改用員工授權入口或聯繫管理員");
        }
    }

    @Override
    public void resetPassword(Long id, String password) {
        SysUser user = requireUser(id);
        assertNotSystemAccount(user, "重置密碼");
        // 定向更新，避免整实体回写覆盖并发变更；同时：
        //  1) 置强制改密标记——管理员设定的密码不属于「本人已知密码」，首次登录必须改
        //  2) 清空 active_token——被重置者当前会话立即失效，下次请求即被踢回登录页
        sysUserMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<SysUser>()
                .eq(SysUser::getId, id)
                .set(SysUser::getPassword, passwordEncoder.encode(password))
                .set(SysUser::getMustChangePassword, true)
                .set(SysUser::getActiveToken, null)
                .set(SysUser::getActiveLoginIp, null)
                .set(SysUser::getUpdatedBy, operatorResolver.currentOperatorName()));
        // 不记密码本身也不记其长度/摘要：审计需要回答的是「谁在什么时候重置了谁的登录凭据」
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.PASSWORD_RESET, id)
                .detail("重置登录密码并强制首次登录改密；会话已失效"));
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysUser user = requireUser(id);
        assertNotSystemAccount(user, "變更狀態");
        // 先拿旧值：user.setStatus 已在同一对象上就地修改，事后再取就前后一样了
        Integer previousStatus = user.getStatus();
        user.setStatus(status);
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);
    
        // 停用账号时，如果该账号当前在线，同步强制下线（与员工动态「操作下线」一致）
        if (status != null && status == 0 && user.getActiveToken() != null) {
            forceLogoutOnDisable(user);
        }
        hrAuditService.record(HrAuditEntry.of(
                status != null && status == 0 ? HrAuditAction.ACCOUNT_DISABLE : HrAuditAction.ACCOUNT_ENABLE, id)
                .change("status", previousStatus, status));
    }
    
    @Override
    @Transactional
    public void reactivate(Long id) {
        SysUser user = requireUser(id);
        assertNotSystemAccount(user, "復職啟用");
        Integer previousStatus = user.getStatus();
        // 定向更新而不是整实体回写：与 resetPassword 同理，且 null 字段在 NOT_NULL 策略下会被跳过，
        // 拿 user 回写清不了 activeToken（旧会话会继续有效）
        sysUserMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<SysUser>()
                .eq(SysUser::getId, id)
                .set(SysUser::getStatus, 1)
                .set(SysUser::getMustChangePassword, true)
                .set(SysUser::getActiveToken, null)
                .set(SysUser::getActiveLoginIp, null)
                .set(SysUser::getUpdatedBy, operatorResolver.currentOperatorName()));
        hrAuditService.record(com.mftb.admin.dto.HrAuditEntry.of(HrAuditAction.ACCOUNT_ENABLE, id)
                .change("status", previousStatus, 1)
                .detail("復職啟用，首次登錄必須改密；舊會話已失效"));
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
        assertNotSystemAccount(user, "刪除");
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

    /** 新增员工时自动写入初始职务记录: 动作固定「入职」（ONBOARD）, 任职信息映射自新增表单填写的基础信息 */
    private void insertInitialPositionRecord(SysUser user, String company) {
        EmpPositionRecord record = new EmpPositionRecord();
        record.setUserId(user.getId());
        record.setEffectiveDate(LocalDate.now());
        record.setEffectiveSeq(0);
        record.setOperation(HrOperationCode.CODE_TO_NAME.get(HrOperationCode.ONBOARD));
        // code 与名称同时写：缺 code 会让在职派生退回名称判定（方案 §5.3）
        record.setOperationCode(HrOperationCode.ONBOARD);
        record.setServiceDept(user.getDepartment());
        record.setSequenceType(user.getSequence());
        record.setPositionLevel(user.getJobLevel());
        record.setRankCode(user.getRank());
        record.setCompany(company);
        record.setPositionName(user.getPosition());
        // 与 DataInitializer 员工职务记录补录逻辑保持一致, 默认工作国家为中国
        record.setWorkCountry("中国");
        record.setCreatedBy(operatorResolver.currentOperatorName());
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        record.setDeleted(0);
        // 建档就是本次雇佣的起点：先归一稳定 ID，落库后马上开出一段雇佣期间。
        // 与主写入同事务（不吞异常）是方案 §7.4 的要求：不允许出现「人已建档但投影跟不上」的静默错账。
        masterDataResolver.applyStableIds(record);
        empPositionRecordMapper.insert(record);
        employmentPeriodService.syncFromRecords(user.getId(), operatorResolver.currentOperatorName());
        log.info("新增员工自动写入初始职务记录: userId={}, operation=入职, serviceDept={}, company={}",
                user.getId(), record.getServiceDept(), company);
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
            throw new BusinessException("所選部門不存在");
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
            throw new BusinessException("所選職位不存在");
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
    public Map<String, Object> getBasicInfo(Long id, boolean reveal) {
        SysUser user = requireUser(id);
        if (reveal) {
            // 受控明文查看留痕→人事审计表（不是应用日志）：§5.5 要求「必要明文查看单独留痕」，
            // 而调用方已经过 employee-management:sensitiveView 权限校验，审计记的是「看了哪些字段」而不是看到的内容。
            hrAuditService.record(HrAuditEntry.of(HrAuditAction.SENSITIVE_VIEW, id)
                    .detail("查看明文：证件号/证件地址/详细住址"));
        }
        Map<String, Object> result = new HashMap<>();
        // 个人信息
        Map<String, Object> personal = new HashMap<>();
        personal.put("gender", user.getGender());
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
        idInfo.put("idNumber", reveal ? user.getIdNumber() : maskIdNumber(user.getIdNumber()));
        idInfo.put("idAddress", reveal ? user.getIdAddress() : maskAddress(user.getIdAddress()));
        idInfo.put("householdType", user.getHouseholdType());
        idInfo.put("householdLocation", user.getHouseholdLocation());
        idInfo.put("nativePlace", user.getNativePlace());
        result.put("idInfo", idInfo);
        // 通讯信息
        Map<String, Object> contact = new HashMap<>();
        contact.put("mobile", user.getMobile());
        contact.put("email", user.getEmail());
        contact.put("addressCountry", user.getAddressCountry());
        contact.put("addressCity", user.getAddressCity());
        contact.put("addressDetail", reveal ? user.getAddressDetail() : maskAddress(user.getAddressDetail()));
        result.put("contactInfo", contact);
        // 账号信息（三方通讯/邮箱等账号绑定，后续可扩展企微ID、QQ邮箱、公司邮箱等）
        Map<String, Object> account = new HashMap<>();
        account.put("dingtalkUserId", user.getDingtalkUserId());
        result.put("accountInfo", account);
        return result;
    }

    /** 证件号脱敏：统一走 {@link com.mftb.admin.util.SensitiveMask}，不在本类再养一份规则 */
    private static String maskIdNumber(String v) {
        return com.mftb.admin.util.SensitiveMask.maskIdNumber(v);
    }

    /** 地址脱敏：同上 */
    private static String maskAddress(String v) {
        return com.mftb.admin.util.SensitiveMask.maskAddress(v);
    }

    @Override
    public void saveBasicInfo(Long id, BasicInfoRequest request) {
        SysUser user = requireUser(id);
        // 审计要记「哪个字段从什么改成什么」，所以先把旧值抓下来；
        // 下面是一串 if-not-null 覆盖，事后读实体只能看到新值。
        Map<String, Object> beforeProfile = profileSnapshot(user);
        // 个人信息
        if (request.getName() != null) user.setName(request.getName());
        if (request.getGender() != null) user.setGender(request.getGender());
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
        if (request.getMobile() != null) user.setMobile(request.getMobile());
        if (request.getEmail() != null) user.setEmail(request.getEmail());
        if (request.getAddressCountry() != null) user.setAddressCountry(request.getAddressCountry());
        if (request.getAddressCity() != null) user.setAddressCity(request.getAddressCity());
        if (request.getAddressDetail() != null) user.setAddressDetail(request.getAddressDetail());
        // 账号信息（三方通讯/邮箱等账号绑定）
        if (request.getDingtalkUserId() != null) user.setDingtalkUserId(request.getDingtalkUserId());

        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);

        Map<String, Object> afterProfile = profileSnapshot(user);
        HrAuditEntry profileChange = HrAuditEntry.of(HrAuditAction.PROFILE_UPDATE, id);
        for (String field : beforeProfile.keySet()) {
            profileChange.change(field, beforeProfile.get(field), afterProfile.get(field));
        }
        hrAuditService.record(profileChange);
    }

    /**
     * 主表单（部门/职位/功能角色）的可审计快照。
     * <p>字段名与前端一致（不是数据库列名）：审计要直接给人读，名字对不上只会多一层误解。
     */
    private Map<String, Object> assignmentSnapshot(SysUser user) {
        Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("name", user.getName());
        snapshot.put("department", user.getDepartment());
        snapshot.put("position", user.getPosition());
        snapshot.put("sequence", user.getSequence());
        snapshot.put("jobLevel", user.getJobLevel());
        snapshot.put("rank", user.getRank());
        snapshot.put("functionRoles", JsonUtils.parseLongList(user.getFunctionRoles()));
        return snapshot;
    }

    /** 基本资料/证件/通讯/账号绑定的可审计快照（敏感字段在写入审计时统一脱敏） */
    private Map<String, Object> profileSnapshot(SysUser user) {
        Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("name", user.getName());
        snapshot.put("gender", user.getGender());
        snapshot.put("nationality", user.getNationality());
        snapshot.put("ethnicity", user.getEthnicity());
        snapshot.put("birthDate", user.getBirthDate());
        snapshot.put("maritalStatus", user.getMaritalStatus());
        snapshot.put("politicalStatus", user.getPoliticalStatus());
        snapshot.put("religion", user.getReligion());
        snapshot.put("idType", user.getIdType());
        snapshot.put("idNumber", user.getIdNumber());
        snapshot.put("idAddress", user.getIdAddress());
        snapshot.put("householdType", user.getHouseholdType());
        snapshot.put("householdLocation", user.getHouseholdLocation());
        snapshot.put("nativePlace", user.getNativePlace());
        snapshot.put("mobile", user.getMobile());
        snapshot.put("email", user.getEmail());
        snapshot.put("addressCountry", user.getAddressCountry());
        snapshot.put("addressCity", user.getAddressCity());
        snapshot.put("addressDetail", user.getAddressDetail());
        snapshot.put("dingtalkUserId", user.getDingtalkUserId());
        return snapshot;
    }

    private SysUser requireUser(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("員工不存在");
        }
        return user;
    }
}
