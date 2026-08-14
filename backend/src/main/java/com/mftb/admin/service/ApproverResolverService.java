package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.ApproverInstance;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 审批人解析服务
 *
 * 支持 4 种解析策略：
 * - person: approverIds 即 userId，直接查 sys_user
 * - role: approverIds 是角色编码，查 function_roles 包含该编码的用户
 * - department_leader: approverIds 是部门 ID，查部门 leader → 匹配用户
 * - initiator_leader: 取发起人 departmentId → 查部门 leader → 匹配用户
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApproverResolverService {

    private final SysUserMapper userMapper;
    private final SysDepartmentMapper departmentMapper;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 解析审批人列表
     *
     * @param approverType 审批人类型: person / role / department_leader / initiator_leader
     * @param approverIds  配置中的 ID 列表
     * @param initiatorDeptId 发起人部门ID（仅 initiator_leader 类型需要）
     * @return 解析出的审批人实例列表
     */
    public List<ApproverInstance> resolve(String approverType, List<String> approverIds, Long initiatorDeptId) {
        List<SysUser> users = new ArrayList<>();

        switch (approverType) {
            case "person":
                users = resolvePerson(approverIds);
                break;
            case "role":
                users = resolveRole(approverIds);
                break;
            case "department_leader":
                users = resolveDepartmentLeader(approverIds);
                break;
            case "initiator_leader":
                users = resolveInitiatorLeader(initiatorDeptId);
                break;
            default:
                log.warn("未知的审批人类型: {}", approverType);
        }

        return users.stream().map(u -> {
            ApproverInstance inst = new ApproverInstance();
            inst.setUserId(u.getId());
            inst.setName(formatName(u));
            inst.setStatus("pending");
            inst.setTime(null);
            return inst;
        }).collect(Collectors.toList());
    }

    /** person: 按 userId 查找 */
    private List<SysUser> resolvePerson(List<String> approverIds) {
        if (approverIds == null || approverIds.isEmpty()) return List.of();
        List<Long> ids = approverIds.stream()
                .map(Long::parseLong)
                .collect(Collectors.toList());
        return userMapper.selectBatchIds(ids);
    }

    /** role: 查 function_roles JSON 包含该角色编码的用户 */
    private List<SysUser> resolveRole(List<String> approverIds) {
        if (approverIds == null || approverIds.isEmpty()) return List.of();
        // 查所有有效用户，在内存中过滤 function_roles 包含目标角色的
        List<SysUser> allUsers = userMapper.selectList(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getStatus, 1));
        return allUsers.stream()
                .filter(u -> {
                    String roles = u.getFunctionRoles();
                    if (roles == null || roles.isBlank()) return false;
                    try {
                        List<String> roleList = MAPPER.readValue(roles, new TypeReference<List<String>>() {});
                        return roleList.stream().anyMatch(approverIds::contains);
                    } catch (Exception e) {
                        return false;
                    }
                })
                .collect(Collectors.toList());
    }

    /** department_leader: 按部门ID查部门 leader 姓名 → 匹配用户 */
    private List<SysUser> resolveDepartmentLeader(List<String> approverIds) {
        if (approverIds == null || approverIds.isEmpty()) return List.of();
        List<SysUser> result = new ArrayList<>();
        for (String deptIdStr : approverIds) {
            try {
                Long deptId = Long.parseLong(deptIdStr);
                SysDepartment dept = departmentMapper.selectById(deptId);
                if (dept != null && dept.getLeader() != null && !dept.getLeader().isBlank()) {
                    // leader 字段存的是姓名，按姓名匹配用户
                    SysUser leader = userMapper.selectOne(
                            new LambdaQueryWrapper<SysUser>()
                                    .eq(SysUser::getName, dept.getLeader())
                                    .eq(SysUser::getStatus, 1)
                                    .last("LIMIT 1"));
                    if (leader != null) {
                        result.add(leader);
                    } else {
                        log.warn("部门「{}」的主管「{}」未找到对应用户", dept.getName(), dept.getLeader());
                    }
                }
            } catch (NumberFormatException e) {
                log.warn("无效的部门ID: {}", deptIdStr);
            }
        }
        return result;
    }

    /** initiator_leader: 取发起人部门 → 查部门 leader */
    private List<SysUser> resolveInitiatorLeader(Long initiatorDeptId) {
        if (initiatorDeptId == null) {
            log.warn("发起人无部门信息，无法解析发起人主管");
            return List.of();
        }
        return resolveDepartmentLeader(List.of(String.valueOf(initiatorDeptId)));
    }

    /** 格式化用户名(工号) */
    private String formatName(SysUser user) {
        String name = user.getName() != null ? user.getName() : user.getUsername();
        String empId = user.getEmpId() != null ? user.getEmpId() : "";
        return empId.isEmpty() ? name : name + "(" + empId + ")";
    }
}
