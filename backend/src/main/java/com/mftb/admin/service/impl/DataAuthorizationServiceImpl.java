package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DataAuthorizationRequest;
import com.mftb.admin.dto.DataAuthorizationVO;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.SysDataAuthorization;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.SysDataAuthorizationMapper;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.service.DataAuthorizationService;
import com.mftb.admin.service.DataScopeService;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.dto.DepartmentVO;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 数据授权管理服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataAuthorizationServiceImpl implements DataAuthorizationService {

    private final SysDataAuthorizationMapper dataAuthMapper;
    private final BizMerchantGroupMapper merchantGroupMapper;
    private final SysRoleMapper roleMapper;
    private final DepartmentService departmentService;
    private final DataScopeService dataScopeService;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public List<DataAuthorizationVO> list(String targetType, Long targetId) {
        LambdaQueryWrapper<SysDataAuthorization> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(targetType)) {
            wrapper.eq(SysDataAuthorization::getTargetType, targetType);
        }
        if (targetId != null) {
            wrapper.eq(SysDataAuthorization::getTargetId, targetId);
        }
        wrapper.orderByDesc(SysDataAuthorization::getUpdatedAt);
        List<SysDataAuthorization> records = dataAuthMapper.selectList(wrapper);
        if (records.isEmpty()) {
            return List.of();
        }
        // 批量查询关联名称
        Map<String, String> groupNameMap = loadGroupNameMap(records);
        Map<Long, String> roleNameMap = loadRoleNameMap(records);
        Map<Long, String> deptNameMap = loadDeptNameMap(records);

        return records.stream().map(entity -> {
            DataAuthorizationVO vo = DataAuthorizationVO.from(entity);
            vo.setGroupName(groupNameMap.getOrDefault(entity.getGroupCode(), entity.getGroupCode()));
            if ("role".equals(entity.getTargetType())) {
                vo.setTargetName(roleNameMap.getOrDefault(entity.getTargetId(), "角色#" + entity.getTargetId()));
            } else if ("department".equals(entity.getTargetType())) {
                vo.setTargetName(deptNameMap.getOrDefault(entity.getTargetId(), "部门#" + entity.getTargetId()));
            }
            return vo;
        }).toList();
    }

    @Override
    public DataAuthorizationVO create(DataAuthorizationRequest request) {
        // 唯一性校验
        Long existCount = dataAuthMapper.selectCount(
                new LambdaQueryWrapper<SysDataAuthorization>()
                        .eq(SysDataAuthorization::getTargetType, request.getTargetType())
                        .eq(SysDataAuthorization::getTargetId, request.getTargetId())
                        .eq(SysDataAuthorization::getGroupCode, request.getGroupCode()));
        if (existCount > 0) {
            throw new BusinessException("該授權對象已存在相同的商家數據授權");
        }
        SysDataAuthorization entity = new SysDataAuthorization();
        entity.setTargetType(request.getTargetType());
        entity.setTargetId(request.getTargetId());
        entity.setGroupCode(request.getGroupCode());
        entity.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        String operator = operatorResolver.currentOperatorName();
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);
        dataAuthMapper.insert(entity);
        dataScopeService.evictAll();
        log.info("新增数据授权: {}#{} → {}", request.getTargetType(), request.getTargetId(), request.getGroupCode());
        return enrichSingle(entity);
    }

    @Override
    public DataAuthorizationVO update(Long id, DataAuthorizationRequest request) {
        SysDataAuthorization entity = dataAuthMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("數據授權記錄不存在");
        }
        // 唯一性校验(排除自身)
        Long existCount = dataAuthMapper.selectCount(
                new LambdaQueryWrapper<SysDataAuthorization>()
                        .eq(SysDataAuthorization::getTargetType, request.getTargetType())
                        .eq(SysDataAuthorization::getTargetId, request.getTargetId())
                        .eq(SysDataAuthorization::getGroupCode, request.getGroupCode())
                        .ne(SysDataAuthorization::getId, id));
        if (existCount > 0) {
            throw new BusinessException("該授權對象已存在相同的商家數據授權");
        }
        entity.setTargetType(request.getTargetType());
        entity.setTargetId(request.getTargetId());
        entity.setGroupCode(request.getGroupCode());
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        dataAuthMapper.updateById(entity);
        dataScopeService.evictAll();
        log.info("更新数据授权#{}: {}#{} → {}", id, request.getTargetType(), request.getTargetId(), request.getGroupCode());
        return enrichSingle(entity);
    }

    @Override
    public void delete(Long id) {
        SysDataAuthorization entity = dataAuthMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("數據授權記錄不存在");
        }
        dataAuthMapper.deleteById(id);
        dataScopeService.evictAll();
        log.info("删除数据授权#{}: {}#{} → {}", id, entity.getTargetType(), entity.getTargetId(), entity.getGroupCode());
    }

    /* ==================== 内部方法 ==================== */

    private DataAuthorizationVO enrichSingle(SysDataAuthorization entity) {
        DataAuthorizationVO vo = DataAuthorizationVO.from(entity);
        // 查商家名称
        BizMerchantGroup group = merchantGroupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, entity.getGroupCode())
                        .last("LIMIT 1"));
        if (group != null) {
            vo.setGroupName(group.getGroupName());
        }
        // 查角色/部门名称
        if ("role".equals(entity.getTargetType())) {
            SysRole role = roleMapper.selectById(entity.getTargetId());
            if (role != null) vo.setTargetName(role.getName());
        } else if ("department".equals(entity.getTargetType())) {
            List<DepartmentVO> depts = departmentService.list();
            depts.stream().filter(d -> d.getId().equals(entity.getTargetId()))
                    .findFirst().ifPresent(d -> vo.setTargetName(d.getName()));
        }
        return vo;
    }

    private Map<String, String> loadGroupNameMap(List<SysDataAuthorization> records) {
        List<String> codes = records.stream()
                .map(SysDataAuthorization::getGroupCode).distinct().toList();
        if (codes.isEmpty()) return Map.of();
        List<BizMerchantGroup> groups = merchantGroupMapper.selectList(
                new LambdaQueryWrapper<BizMerchantGroup>().in(BizMerchantGroup::getGroupCode, codes));
        return groups.stream().collect(Collectors.toMap(
                BizMerchantGroup::getGroupCode, BizMerchantGroup::getGroupName, (a, b) -> a));
    }

    private Map<Long, String> loadRoleNameMap(List<SysDataAuthorization> records) {
        List<Long> roleIds = records.stream()
                .filter(r -> "role".equals(r.getTargetType()))
                .map(SysDataAuthorization::getTargetId).distinct().toList();
        if (roleIds.isEmpty()) return Map.of();
        List<SysRole> roles = roleMapper.selectBatchIds(roleIds);
        return roles.stream().collect(Collectors.toMap(SysRole::getId, SysRole::getName, (a, b) -> a));
    }

    private Map<Long, String> loadDeptNameMap(List<SysDataAuthorization> records) {
        List<Long> deptIds = records.stream()
                .filter(r -> "department".equals(r.getTargetType()))
                .map(SysDataAuthorization::getTargetId).distinct().toList();
        if (deptIds.isEmpty()) return Map.of();
        List<DepartmentVO> depts = departmentService.list();
        return depts.stream().filter(d -> deptIds.contains(d.getId()))
                .collect(Collectors.toMap(DepartmentVO::getId, DepartmentVO::getName, (a, b) -> a));
    }

    /* ==================== 下拉选项查询 ==================== */

    @Override
    public List<Map<String, Object>> roleOptions() {
        List<Map<String, Object>> result = new ArrayList<>();
        jdbcTemplate.query(
                "SELECT r.id, r.name, "
                        + "(SELECT COUNT(*) FROM sys_user u WHERE u.deleted = 0 "
                        + "AND FIND_IN_SET(r.id, u.function_roles)) AS user_count "
                        + "FROM sys_role r WHERE r.deleted = 0 AND r.status = 1 "
                        + "ORDER BY r.id",
                rs -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", rs.getLong("id"));
                    map.put("name", rs.getString("name"));
                    map.put("userCount", rs.getLong("user_count"));
                    result.add(map);
                });
        return result;
    }

    @Override
    public List<Map<String, Object>> departmentOptions() {
        List<Map<String, Object>> result = new ArrayList<>();
        jdbcTemplate.query(
                "SELECT d.id, d.name, d.name_en, d.parent_id, d.status, "
                        + "(SELECT COUNT(*) FROM sys_user u WHERE u.department_id = d.id AND u.deleted = 0) AS user_count "
                        + "FROM sys_department d WHERE d.deleted = 0 ORDER BY d.sort, d.id",
                rs -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", rs.getLong("id"));
                    map.put("name", rs.getString("name"));
                    map.put("nameEn", rs.getString("name_en"));
                    map.put("parentId", rs.getObject("parent_id") != null ? rs.getLong("parent_id") : null);
                    map.put("status", rs.getInt("status"));
                    map.put("userCount", rs.getLong("user_count"));
                    result.add(map);
                });
        return result;
    }

    @Override
    public List<Map<String, Object>> merchantGroupOptions() {
        List<Map<String, Object>> result = new ArrayList<>();
        jdbcTemplate.query(
                "SELECT group_code, group_name FROM biz_merchant_group WHERE deleted = 0 ORDER BY group_code",
                rs -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("groupCode", rs.getString("group_code"));
                    map.put("groupName", rs.getString("group_name"));
                    result.add(map);
                });
        return result;
    }

    /* ==================== 诊断 ==================== */

    @Override
    public List<Map<String, Object>> diagnose() {
        List<Map<String, Object>> result = new ArrayList<>();

        // 1. 检查关键表是否存在
        checkTable(result, "sys_department");
        checkTable(result, "sys_data_authorization");
        checkTable(result, "biz_merchant_group");
        checkTable(result, "sys_role");
        checkTable(result, "sys_user");

        // 2. 检查关键字段
        checkColumn(result, "sys_department", "name_en");
        checkColumn(result, "sys_department", "deleted");
        checkColumn(result, "sys_user", "function_roles");
        checkColumn(result, "sys_user", "department_id");
        checkColumn(result, "sys_data_authorization", "group_code");

        // 3. 逐个测试实际查询
        testQuery(result, "roleOptions", "SELECT r.id, r.name, (SELECT COUNT(*) FROM sys_user u WHERE u.deleted = 0 AND FIND_IN_SET(r.id, u.function_roles)) AS user_count FROM sys_role r WHERE r.deleted = 0 AND r.status = 1 ORDER BY r.id");
        testQuery(result, "departmentOptions", "SELECT d.id, d.name, d.name_en, d.parent_id, d.status, (SELECT COUNT(*) FROM sys_user u WHERE u.department_id = d.id AND u.deleted = 0) AS user_count FROM sys_department d WHERE d.deleted = 0 ORDER BY d.sort, d.id");
        testQuery(result, "merchantGroupOptions", "SELECT group_code, group_name FROM biz_merchant_group WHERE deleted = 0 ORDER BY group_code");
        testQuery(result, "list", "SELECT id, target_type, target_id, group_code, status FROM sys_data_authorization WHERE deleted = 0 LIMIT 1");

        return result;
    }

    private void checkTable(List<Map<String, Object>> result, String tableName) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, tableName);
            Map<String, Object> item = new HashMap<>();
            item.put("check", "table:" + tableName);
            item.put("exists", count != null && count > 0);
            result.add(item);
        } catch (Exception e) {
            Map<String, Object> item = new HashMap<>();
            item.put("check", "table:" + tableName);
            item.put("error", e.getMessage());
            result.add(item);
        }
    }

    private void checkColumn(List<Map<String, Object>> result, String tableName, String columnName) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, tableName, columnName);
            Map<String, Object> item = new HashMap<>();
            item.put("check", "column:" + tableName + "." + columnName);
            item.put("exists", count != null && count > 0);
            result.add(item);
        } catch (Exception e) {
            Map<String, Object> item = new HashMap<>();
            item.put("check", "column:" + tableName + "." + columnName);
            item.put("error", e.getMessage());
            result.add(item);
        }
    }

    private void testQuery(List<Map<String, Object>> result, String name, String sql) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql);
            Map<String, Object> item = new HashMap<>();
            item.put("check", "query:" + name);
            item.put("ok", true);
            item.put("rowCount", rows.size());
            result.add(item);
        } catch (Exception e) {
            Map<String, Object> item = new HashMap<>();
            item.put("check", "query:" + name);
            item.put("ok", false);
            item.put("error", e.getMessage());
            result.add(item);
        }
    }
}
