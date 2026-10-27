package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.AiEmpAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 员工模型权控管理控制器
 * 职位授权策略（职级序列+职级范围匹配）与自定义角色授权（绑定员工）的 CRUD，
 * 供「员工模型权控」页使用；授权结果由 AiMyCenterServiceImpl.myModels() 聚合后下发到首页。
 */
@RestController
@RequestMapping("/api/ai/emp-auth")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 员工模型权控", description = "职位授权策略 / 自定义角色授权管理接口")
public class AiEmpAuthController {

    /** 员工模型权控页菜单标识（sys_menu.menu_key）；按职位授权/角色授权均为该页内 Tab，
     *  其独立菜单 ai-pos-auth/ai-role-auth 已由 sql/93 软删除，故统一绑定到宿主页面 */
    private static final String MENU_POS = "ai-emp-model-auth";
    /** 角色授权菜单标识（同属员工模型权控页内 Tab） */
    private static final String MENU_ROLE = "ai-emp-model-auth";

    private final AiEmpAuthService empAuthService;

    /* ═══════════════ 职位授权策略 ═══════════════ */

    @GetMapping("/pos-strategies")
    @Operation(summary = "查询职位授权策略列表")
    @RequirePermission(menu = MENU_POS)
    public Result<List<PosStrategyVO>> listPosStrategies(@RequestParam(required = false) String name) {
        return Result.success(empAuthService.listPosStrategies(name));
    }

    @GetMapping("/pos-strategies/{id}")
    @Operation(summary = "获取职位授权策略详情")
    @RequirePermission(menu = MENU_POS)
    public Result<PosStrategyVO> getPosStrategy(@PathVariable Long id) {
        PosStrategyVO vo = empAuthService.getPosStrategy(id);
        return vo != null ? Result.success(vo) : Result.error("策略不存在");
    }

    @PostMapping("/pos-strategies")
    @Operation(summary = "新增职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "create")
    public Result<Long> createPosStrategy(@RequestBody PosStrategySaveRequest request) {
        return Result.success(empAuthService.createPosStrategy(request));
    }

    @PutMapping("/pos-strategies/{id}")
    @Operation(summary = "编辑职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "edit")
    public Result<Boolean> updatePosStrategy(@PathVariable Long id, @RequestBody PosStrategySaveRequest request) {
        boolean ok = empAuthService.updatePosStrategy(id, request);
        return ok ? Result.success(true) : Result.error("策略不存在");
    }

    @PutMapping("/pos-strategies/{id}/status")
    @Operation(summary = "启停职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "edit")
    public Result<Boolean> togglePosStrategyStatus(@PathVariable Long id, @RequestParam Integer status) {
        boolean ok = empAuthService.togglePosStrategyStatus(id, status);
        return ok ? Result.success(true) : Result.error("策略不存在");
    }

    @DeleteMapping("/pos-strategies/{id}")
    @Operation(summary = "删除职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "delete")
    public Result<Boolean> deletePosStrategy(@PathVariable Long id) {
        boolean ok = empAuthService.deletePosStrategy(id);
        return ok ? Result.success(true) : Result.error("策略不存在");
    }

    /* ═══════════════ 自定义角色授权 ═══════════════ */

    @GetMapping("/role-auths")
    @Operation(summary = "查询角色授权列表")
    @RequirePermission(menu = MENU_ROLE)
    public Result<List<RoleAuthVO>> listRoleAuths(@RequestParam(required = false) String name) {
        return Result.success(empAuthService.listRoleAuths(name));
    }

    @GetMapping("/role-auths/by-code/{roleCode}")
    @Operation(summary = "按角色编码获取角色授权详情")
    @RequirePermission(menu = MENU_ROLE)
    public Result<RoleAuthVO> getRoleAuth(@PathVariable String roleCode) {
        RoleAuthVO vo = empAuthService.getRoleAuth(roleCode);
        return vo != null ? Result.success(vo) : Result.error("角色授權不存在");
    }

    @PostMapping("/role-auths")
    @Operation(summary = "新增角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "create")
    public Result<String> createRoleAuth(@RequestBody RoleAuthSaveRequest request) {
        String roleCode = empAuthService.createRoleAuth(request);
        return roleCode != null ? Result.success(roleCode) : Result.error("角色編碼已存在，請重試");
    }

    @PutMapping("/role-auths/by-code/{roleCode}")
    @Operation(summary = "编辑角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "edit")
    public Result<Boolean> updateRoleAuth(@PathVariable String roleCode, @RequestBody RoleAuthSaveRequest request) {
        boolean ok = empAuthService.updateRoleAuth(roleCode, request);
        return ok ? Result.success(true) : Result.error("角色授權不存在");
    }

    @PutMapping("/role-auths/by-code/{roleCode}/status")
    @Operation(summary = "启停角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "edit")
    public Result<Boolean> toggleRoleAuthStatus(@PathVariable String roleCode, @RequestParam Integer status) {
        boolean ok = empAuthService.toggleRoleAuthStatus(roleCode, status);
        return ok ? Result.success(true) : Result.error("角色授權不存在");
    }

    @DeleteMapping("/role-auths/by-code/{roleCode}")
    @Operation(summary = "删除角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "delete")
    public Result<Boolean> deleteRoleAuth(@PathVariable String roleCode) {
        boolean ok = empAuthService.deleteRoleAuth(roleCode);
        return ok ? Result.success(true) : Result.error("角色授權不存在");
    }

    /* ═══════════════ DTO ═══════════════ */

    /** 模型能力配置项（与前端 ModelAuthConfig 同构） */
    @Data
    public static class ModelConfigDTO {
        private Long modelId;
        private Integer visionSupport;
        private Integer functionCalling;
        private Integer jsonMode;
        private Integer streaming;
        private Integer thinkingMode;
    }

    /** 职位授权策略视图（与前端 PosAuthRule 同构，id 以字符串下发） */
    @Data
    public static class PosStrategyVO {
        private String id;
        /** 配置ID（编号生成规则 ai_emp_pos_model_auth） */
        private String configCode;
        private String ruleName;
        private List<String> sequence;
        private List<String> jobLevels;
        private List<ModelConfigDTO> modelConfigs;
        private Integer dataResidency;
        private String description;
        private Integer status;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;
    }

    /** 角色授权视图（与前端 RoleAuthConfig 同构，roleId 即角色编码） */
    @Data
    public static class RoleAuthVO {
        private String roleId;
        /** 配置ID（编号生成规则 ai_emp_role_model_auth） */
        private String configCode;
        private String roleName;
        private String description;
        private List<Long> userIds;
        private List<ModelConfigDTO> modelConfigs;
        private Integer dataResidency;
        private Integer status;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;
    }

    /** 职位策略保存请求 */
    @Data
    public static class PosStrategySaveRequest {
        private String strategyName;
        private List<String> sequences;
        private List<String> jobLevels;
        private List<ModelConfigDTO> modelConfigs;
        private Integer dataResidency;
        private String description;
        private Integer status;
    }

    /** 角色授权保存请求（roleCode 选填，为空时后端生成） */
    @Data
    public static class RoleAuthSaveRequest {
        private String roleCode;
        private String roleName;
        private String description;
        private List<Long> userIds;
        private List<ModelConfigDTO> modelConfigs;
        private Integer dataResidency;
        private Integer status;
    }
}
