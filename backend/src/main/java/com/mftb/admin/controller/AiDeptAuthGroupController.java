package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiDeptAuthGroupDTO;
import com.mftb.admin.entity.AiDeptAuthGroup;
import com.mftb.admin.entity.AiDeptAuthGroupDept;
import com.mftb.admin.entity.AiDeptAuthGroupModel;
import com.mftb.admin.mapper.AiDeptAuthGroupDeptMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupMapper;
import com.mftb.admin.mapper.AiDeptAuthGroupModelMapper;
import com.mftb.admin.util.BizSeqService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 部门模型授权策略管理控制器
 */
@RestController
@RequestMapping("/api/ai/auth/dept-groups")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 部门模型权控", description = "部门模型授权策略管理接口")
public class AiDeptAuthGroupController {

    /** 本菜单标识（sys_menu.menu_key），部门模型权控页 */
    private static final String MENU = "ai-dept-model-auth";

    private final AiDeptAuthGroupMapper groupMapper;
    private final AiDeptAuthGroupDeptMapper groupDeptMapper;
    private final AiDeptAuthGroupModelMapper groupModelMapper;
    private final JdbcTemplate jdbcTemplate;
    private final BizSeqService bizSeqService;

    /**
     * 获取策略列表
     */
    @GetMapping
    @Operation(summary = "查询部门模型授权策略列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiDeptAuthGroupDTO.GroupVO>> list(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Integer dataResidency) {

        // 查询所有未删除的策略
        LambdaQueryWrapper<AiDeptAuthGroup> wrapper = new LambdaQueryWrapper<>();
        if (name != null && !name.trim().isEmpty()) {
            wrapper.like(AiDeptAuthGroup::getName, name.trim());
        }
        if (dataResidency != null) {
            wrapper.eq(AiDeptAuthGroup::getDataResidency, dataResidency);
        }
        wrapper.orderByDesc(AiDeptAuthGroup::getUpdatedAt);

        List<AiDeptAuthGroup> groups = groupMapper.selectList(wrapper);
        List<AiDeptAuthGroupDTO.GroupVO> result = new ArrayList<>();

        for (AiDeptAuthGroup g : groups) {
            AiDeptAuthGroupDTO.GroupVO vo = new AiDeptAuthGroupDTO.GroupVO();
            vo.setId(g.getId());
            vo.setConfigCode(g.getConfigCode());
            vo.setName(g.getName());
            vo.setDataResidency(g.getDataResidency());
            vo.setStatus(g.getStatus());
            vo.setTotalEmployeeCount(g.getTotalEmployeeCount());
            vo.setUpdatedBy(g.getUpdatedBy());
            vo.setCreatedAt(g.getCreatedAt() != null ? g.getCreatedAt().toString().replace("T", " ") : null);
            vo.setUpdatedAt(g.getUpdatedAt() != null ? g.getUpdatedAt().toString().replace("T", " ") : null);

            // 查询关联部门
            List<AiDeptAuthGroupDept> depts = groupDeptMapper.selectList(
                    new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                            .eq(AiDeptAuthGroupDept::getGroupId, g.getId()));
            List<Long> deptIds = depts.stream().map(AiDeptAuthGroupDept::getDepartmentId).collect(Collectors.toList());
            vo.setDeptIds(deptIds);

            // 查询部门名称
            if (!deptIds.isEmpty()) {
                List<String> deptNames = jdbcTemplate.queryForList(
                        "SELECT name FROM sys_department WHERE id IN (" +
                                deptIds.stream().map(String::valueOf).collect(Collectors.joining(",")) +
                                ") AND deleted = 0", String.class);
                vo.setDeptNames(deptNames);
            } else {
                vo.setDeptNames(new ArrayList<>());
            }

            // 查询授权模型
            List<AiDeptAuthGroupModel> models = groupModelMapper.selectList(
                    new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                            .eq(AiDeptAuthGroupModel::getGroupId, g.getId())
                            .orderByDesc(AiDeptAuthGroupModel::getPriority));
            List<Long> modelIds = models.stream().map(AiDeptAuthGroupModel::getModelId).collect(Collectors.toList());
            vo.setModelIds(modelIds);

            // 查询模型名称
            if (!modelIds.isEmpty()) {
                List<String> modelNames = jdbcTemplate.queryForList(
                        "SELECT name FROM ai_model WHERE id IN (" +
                                modelIds.stream().map(String::valueOf).collect(Collectors.joining(",")) +
                                ") AND deleted = 0", String.class);
                vo.setModelNames(modelNames);
            } else {
                vo.setModelNames(new ArrayList<>());
            }

            result.add(vo);
        }

        return Result.success(result);
    }

    /**
     * 获取策略详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "获取策略详情")
    @RequirePermission(menu = MENU)
    public Result<AiDeptAuthGroupDTO.GroupDetailVO> detail(@PathVariable Long id) {
        AiDeptAuthGroup group = groupMapper.selectById(id);
        if (group == null) {
            return Result.error("策略不存在");
        }

        AiDeptAuthGroupDTO.GroupDetailVO vo = new AiDeptAuthGroupDTO.GroupDetailVO();
        vo.setId(group.getId());
        vo.setConfigCode(group.getConfigCode());
        vo.setName(group.getName());
        vo.setDataResidency(group.getDataResidency());
        vo.setStatus(group.getStatus());
        vo.setTotalEmployeeCount(group.getTotalEmployeeCount());
        vo.setUpdatedBy(group.getUpdatedBy());
        vo.setCreatedAt(group.getCreatedAt() != null ? group.getCreatedAt().toString().replace("T", " ") : null);
        vo.setUpdatedAt(group.getUpdatedAt() != null ? group.getUpdatedAt().toString().replace("T", " ") : null);

        // 查询关联部门（含部门名称和人数）
        List<AiDeptAuthGroupDept> depts = groupDeptMapper.selectList(
                new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                        .eq(AiDeptAuthGroupDept::getGroupId, id));
        List<Long> deptIds = depts.stream().map(AiDeptAuthGroupDept::getDepartmentId).collect(Collectors.toList());

        if (!deptIds.isEmpty()) {
            String inSql = deptIds.stream().map(String::valueOf).collect(Collectors.joining(","));
            List<AiDeptAuthGroupDTO.DeptItem> deptItems = jdbcTemplate.query(
                    "SELECT id, name, (SELECT COUNT(*) FROM sys_user u WHERE u.department_id = sys_department.id AND u.deleted = 0) AS user_count FROM sys_department WHERE id IN (" + inSql + ") AND deleted = 0",
                    (rs, rowNum) -> {
                        AiDeptAuthGroupDTO.DeptItem item = new AiDeptAuthGroupDTO.DeptItem();
                        item.setDeptId(rs.getLong("id"));
                        item.setDeptName(rs.getString("name"));
                        item.setEmployeeCount(rs.getInt("user_count"));
                        return item;
                    });
            vo.setDepartments(deptItems);
        } else {
            vo.setDepartments(new ArrayList<>());
        }

        // 查询授权模型配置
        List<AiDeptAuthGroupModel> models = groupModelMapper.selectList(
                new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                        .eq(AiDeptAuthGroupModel::getGroupId, id)
                        .orderByDesc(AiDeptAuthGroupModel::getPriority));

        List<AiDeptAuthGroupDTO.ModelConfigItem> modelConfigs = models.stream().map(m -> {
            AiDeptAuthGroupDTO.ModelConfigItem item = new AiDeptAuthGroupDTO.ModelConfigItem();
            item.setModelId(m.getModelId());
            item.setVisionSupport(m.getVisionSupport());
            item.setFunctionCalling(m.getFunctionCalling());
            item.setJsonMode(m.getJsonMode());
            item.setStreaming(m.getStreaming());
            item.setThinkingMode(m.getThinkingMode());
            item.setPriority(m.getPriority());
            return item;
        }).collect(Collectors.toList());
        vo.setModelConfigs(modelConfigs);

        return Result.success(vo);
    }

    /**
     * 新增策略
     */
    @PostMapping
    @Operation(summary = "新增部门模型授权策略")
    @RequirePermission(menu = MENU, action = "create")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> create(@Valid @RequestBody AiDeptAuthGroupDTO.GroupSaveRequest request) {
        // 计算总人数
        int totalEmployeeCount = calculateEmployeeCount(request.getDeptIds());

        // 插入主表
        AiDeptAuthGroup group = new AiDeptAuthGroup();
        group.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_DEPT_MODEL_AUTH));
        group.setName(request.getName());
        group.setDataResidency(request.getDataResidency() != null ? request.getDataResidency() : 0);
        group.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        group.setTotalEmployeeCount(totalEmployeeCount);
        group.setUpdatedBy(request.getUpdatedBy());
        groupMapper.insert(group);

        // 插入部门关联
        for (Long deptId : request.getDeptIds()) {
            AiDeptAuthGroupDept gd = new AiDeptAuthGroupDept();
            gd.setGroupId(group.getId());
            gd.setDepartmentId(deptId);
            groupDeptMapper.insert(gd);
        }

        // 插入模型授权配置
        if (request.getModelConfigs() != null) {
            for (AiDeptAuthGroupDTO.ModelConfigItem mc : request.getModelConfigs()) {
                AiDeptAuthGroupModel gm = new AiDeptAuthGroupModel();
                gm.setGroupId(group.getId());
                gm.setModelId(mc.getModelId());
                gm.setVisionSupport(mc.getVisionSupport() != null ? mc.getVisionSupport() : 1);
                gm.setFunctionCalling(mc.getFunctionCalling() != null ? mc.getFunctionCalling() : 1);
                gm.setJsonMode(mc.getJsonMode() != null ? mc.getJsonMode() : 1);
                gm.setStreaming(mc.getStreaming() != null ? mc.getStreaming() : 1);
                gm.setThinkingMode(mc.getThinkingMode() != null ? mc.getThinkingMode() : 1);
                gm.setPriority(mc.getPriority() != null ? mc.getPriority() : 0);
                groupModelMapper.insert(gm);
            }
        }

        return Result.success(true);
    }

    /**
     * 编辑策略
     */
    @PutMapping("/{id}")
    @Operation(summary = "编辑部门模型授权策略")
    @RequirePermission(menu = MENU, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> update(@PathVariable Long id,
                                  @Valid @RequestBody AiDeptAuthGroupDTO.GroupSaveRequest request) {
        AiDeptAuthGroup group = groupMapper.selectById(id);
        if (group == null) {
            return Result.error("策略不存在");
        }

        // 计算总人数
        int totalEmployeeCount = calculateEmployeeCount(request.getDeptIds());

        // 更新主表
        group.setName(request.getName());
        group.setDataResidency(request.getDataResidency() != null ? request.getDataResidency() : 0);
        group.setTotalEmployeeCount(totalEmployeeCount);
        group.setUpdatedBy(request.getUpdatedBy());
        groupMapper.updateById(group);

        // 删除旧部门关联，插入新关联
        groupDeptMapper.delete(new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                .eq(AiDeptAuthGroupDept::getGroupId, id));
        for (Long deptId : request.getDeptIds()) {
            AiDeptAuthGroupDept gd = new AiDeptAuthGroupDept();
            gd.setGroupId(id);
            gd.setDepartmentId(deptId);
            groupDeptMapper.insert(gd);
        }

        // 删除旧模型配置，插入新配置
        groupModelMapper.delete(new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                .eq(AiDeptAuthGroupModel::getGroupId, id));
        if (request.getModelConfigs() != null) {
            for (AiDeptAuthGroupDTO.ModelConfigItem mc : request.getModelConfigs()) {
                AiDeptAuthGroupModel gm = new AiDeptAuthGroupModel();
                gm.setGroupId(id);
                gm.setModelId(mc.getModelId());
                gm.setVisionSupport(mc.getVisionSupport() != null ? mc.getVisionSupport() : 1);
                gm.setFunctionCalling(mc.getFunctionCalling() != null ? mc.getFunctionCalling() : 1);
                gm.setJsonMode(mc.getJsonMode() != null ? mc.getJsonMode() : 1);
                gm.setStreaming(mc.getStreaming() != null ? mc.getStreaming() : 1);
                gm.setThinkingMode(mc.getThinkingMode() != null ? mc.getThinkingMode() : 1);
                gm.setPriority(mc.getPriority() != null ? mc.getPriority() : 0);
                groupModelMapper.insert(gm);
            }
        }

        return Result.success(true);
    }

    /**
     * 启停策略
     */
    @PutMapping("/{id}/status")
    @Operation(summary = "启停策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> toggleStatus(@PathVariable Long id, @RequestParam Integer status) {
        AiDeptAuthGroup group = groupMapper.selectById(id);
        if (group == null) {
            return Result.error("策略不存在");
        }
        group.setStatus(status);
        groupMapper.updateById(group);
        return Result.success(true);
    }

    /**
     * 删除策略
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除策略")
    @RequirePermission(menu = MENU, action = "delete")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> delete(@PathVariable Long id) {
        AiDeptAuthGroup group = groupMapper.selectById(id);
        if (group == null) {
            return Result.error("策略不存在");
        }
        // 逻辑删除主表
        groupMapper.deleteById(id);
        // 物理删除关联表
        groupDeptMapper.delete(new LambdaQueryWrapper<AiDeptAuthGroupDept>()
                .eq(AiDeptAuthGroupDept::getGroupId, id));
        groupModelMapper.delete(new LambdaQueryWrapper<AiDeptAuthGroupModel>()
                .eq(AiDeptAuthGroupModel::getGroupId, id));
        return Result.success(true);
    }

    /**
     * 获取所有部门选项（供 Transfer 组件使用）
     */
    @GetMapping("/dept-options")
    @Operation(summary = "获取部门选项列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiDeptAuthGroupDTO.DeptOptionVO>> deptOptions() {
        List<AiDeptAuthGroupDTO.DeptOptionVO> options = jdbcTemplate.query(
                "SELECT id, code, name, parent_id, (SELECT COUNT(*) FROM sys_user u WHERE u.department_id = sys_department.id AND u.deleted = 0) AS user_count FROM sys_department WHERE deleted = 0 ORDER BY sort ASC, id ASC",
                (rs, rowNum) -> {
                    AiDeptAuthGroupDTO.DeptOptionVO vo = new AiDeptAuthGroupDTO.DeptOptionVO();
                    vo.setDeptId(rs.getLong("id"));
                    vo.setDeptName(rs.getString("name"));
                    vo.setDeptCode(rs.getString("code"));
                    vo.setParentId(rs.getObject("parent_id") != null ? rs.getLong("parent_id") : null);
                    vo.setEmployeeCount(rs.getInt("user_count"));
                    return vo;
                });
        return Result.success(options);
    }

    /**
     * 计算关联部门总人数
     */
    private int calculateEmployeeCount(List<Long> deptIds) {
        if (deptIds == null || deptIds.isEmpty()) return 0;
        String inSql = deptIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE department_id IN (" + inSql + ") AND deleted = 0",
                Integer.class);
        return count != null ? count : 0;
    }
}
