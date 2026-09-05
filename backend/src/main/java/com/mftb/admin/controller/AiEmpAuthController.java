package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiEmpPosAuthStrategy;
import com.mftb.admin.entity.AiEmpRoleAuth;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiEmpPosAuthStrategyMapper;
import com.mftb.admin.mapper.AiEmpRoleAuthMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

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

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 按职位授权菜单标识 */
    private static final String MENU_POS = "ai-pos-auth";
    /** 角色授权菜单标识 */
    private static final String MENU_ROLE = "ai-role-auth";

    private final AiEmpPosAuthStrategyMapper posStrategyMapper;
    private final AiEmpRoleAuthMapper roleAuthMapper;
    private final BizSeqService bizSeqService;

    /* ═══════════════ 职位授权策略 ═══════════════ */

    @GetMapping("/pos-strategies")
    @Operation(summary = "查询职位授权策略列表")
    @RequirePermission(menu = MENU_POS)
    public Result<List<PosStrategyVO>> listPosStrategies(@RequestParam(required = false) String name) {
        LambdaQueryWrapper<AiEmpPosAuthStrategy> wrapper = new LambdaQueryWrapper<>();
        if (name != null && !name.trim().isEmpty()) {
            wrapper.like(AiEmpPosAuthStrategy::getStrategyName, name.trim());
        }
        wrapper.orderByDesc(AiEmpPosAuthStrategy::getUpdatedAt);
        return Result.success(posStrategyMapper.selectList(wrapper).stream().map(this::toPosVO).toList());
    }

    @GetMapping("/pos-strategies/{id}")
    @Operation(summary = "获取职位授权策略详情")
    @RequirePermission(menu = MENU_POS)
    public Result<PosStrategyVO> getPosStrategy(@PathVariable Long id) {
        AiEmpPosAuthStrategy entity = posStrategyMapper.selectById(id);
        if (entity == null) {
            return Result.error("策略不存在");
        }
        return Result.success(toPosVO(entity));
    }

    @PostMapping("/pos-strategies")
    @Operation(summary = "新增职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "create")
    @Transactional(rollbackFor = Exception.class)
    public Result<Long> createPosStrategy(@RequestBody PosStrategySaveRequest request) {
        AiEmpPosAuthStrategy entity = new AiEmpPosAuthStrategy();
        entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_EMP_POS_MODEL_AUTH));
        applyPosRequest(entity, request);
        entity.setCreatedBy(currentUsername());
        posStrategyMapper.insert(entity);
        return Result.success(entity.getId());
    }

    @PutMapping("/pos-strategies/{id}")
    @Operation(summary = "编辑职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> updatePosStrategy(@PathVariable Long id, @RequestBody PosStrategySaveRequest request) {
        AiEmpPosAuthStrategy entity = posStrategyMapper.selectById(id);
        if (entity == null) {
            return Result.error("策略不存在");
        }
        applyPosRequest(entity, request);
        posStrategyMapper.updateById(entity);
        return Result.success(true);
    }

    @PutMapping("/pos-strategies/{id}/status")
    @Operation(summary = "启停职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "edit")
    public Result<Boolean> togglePosStrategyStatus(@PathVariable Long id, @RequestParam Integer status) {
        AiEmpPosAuthStrategy entity = posStrategyMapper.selectById(id);
        if (entity == null) {
            return Result.error("策略不存在");
        }
        entity.setStatus(status);
        entity.setUpdatedBy(currentUsername());
        posStrategyMapper.updateById(entity);
        return Result.success(true);
    }

    @DeleteMapping("/pos-strategies/{id}")
    @Operation(summary = "删除职位授权策略")
    @RequirePermission(menu = MENU_POS, action = "delete")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> deletePosStrategy(@PathVariable Long id) {
        if (posStrategyMapper.selectById(id) == null) {
            return Result.error("策略不存在");
        }
        posStrategyMapper.deleteById(id);
        return Result.success(true);
    }

    /* ═══════════════ 自定义角色授权 ═══════════════ */

    @GetMapping("/role-auths")
    @Operation(summary = "查询角色授权列表")
    @RequirePermission(menu = MENU_ROLE)
    public Result<List<RoleAuthVO>> listRoleAuths(@RequestParam(required = false) String name) {
        LambdaQueryWrapper<AiEmpRoleAuth> wrapper = new LambdaQueryWrapper<>();
        if (name != null && !name.trim().isEmpty()) {
            wrapper.like(AiEmpRoleAuth::getRoleName, name.trim());
        }
        wrapper.orderByDesc(AiEmpRoleAuth::getUpdatedAt);
        return Result.success(roleAuthMapper.selectList(wrapper).stream().map(this::toRoleVO).toList());
    }

    @GetMapping("/role-auths/by-code/{roleCode}")
    @Operation(summary = "按角色编码获取角色授权详情")
    @RequirePermission(menu = MENU_ROLE)
    public Result<RoleAuthVO> getRoleAuth(@PathVariable String roleCode) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return Result.error("角色授权不存在");
        }
        return Result.success(toRoleVO(entity));
    }

    @PostMapping("/role-auths")
    @Operation(summary = "新增角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "create")
    @Transactional(rollbackFor = Exception.class)
    public Result<String> createRoleAuth(@RequestBody RoleAuthSaveRequest request) {
        String roleCode = (request.getRoleCode() != null && !request.getRoleCode().isBlank())
                ? request.getRoleCode().trim()
                : generateRoleCode();
        if (findByRoleCode(roleCode) != null) {
            return Result.error("角色编码已存在，请重试");
        }
        AiEmpRoleAuth entity = new AiEmpRoleAuth();
        entity.setRoleCode(roleCode);
        entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_EMP_ROLE_MODEL_AUTH));
        applyRoleRequest(entity, request);
        entity.setCreatedBy(currentUsername());
        roleAuthMapper.insert(entity);
        return Result.success(roleCode);
    }

    @PutMapping("/role-auths/by-code/{roleCode}")
    @Operation(summary = "编辑角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> updateRoleAuth(@PathVariable String roleCode, @RequestBody RoleAuthSaveRequest request) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return Result.error("角色授权不存在");
        }
        applyRoleRequest(entity, request);
        roleAuthMapper.updateById(entity);
        return Result.success(true);
    }

    @PutMapping("/role-auths/by-code/{roleCode}/status")
    @Operation(summary = "启停角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "edit")
    public Result<Boolean> toggleRoleAuthStatus(@PathVariable String roleCode, @RequestParam Integer status) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return Result.error("角色授权不存在");
        }
        entity.setStatus(status);
        entity.setUpdatedBy(currentUsername());
        roleAuthMapper.updateById(entity);
        return Result.success(true);
    }

    @DeleteMapping("/role-auths/by-code/{roleCode}")
    @Operation(summary = "删除角色授权")
    @RequirePermission(menu = MENU_ROLE, action = "delete")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> deleteRoleAuth(@PathVariable String roleCode) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return Result.error("角色授权不存在");
        }
        roleAuthMapper.deleteById(entity.getId());
        return Result.success(true);
    }

    /* ═══════════════ 内部转换 ═══════════════ */

    private AiEmpRoleAuth findByRoleCode(String roleCode) {
        return roleAuthMapper.selectOne(new LambdaQueryWrapper<AiEmpRoleAuth>()
                .eq(AiEmpRoleAuth::getRoleCode, roleCode));
    }

    /** 角色编码：CR + 时间戳后 10 位 + 3 位随机数（新增时前端可不传） */
    private String generateRoleCode() {
        long ts = System.currentTimeMillis() % 10_000_000_000L;
        return String.format("CR%010d%03d", ts, ThreadLocalRandom.current().nextInt(1000));
    }

    private void applyPosRequest(AiEmpPosAuthStrategy entity, PosStrategySaveRequest request) {
        entity.setStrategyName(request.getStrategyName());
        entity.setSequences(JsonUtils.toJson(request.getSequences() != null ? request.getSequences() : List.of()));
        entity.setJobLevels(JsonUtils.toJson(request.getJobLevels() != null ? request.getJobLevels() : List.of()));
        entity.setModelConfigs(JsonUtils.toJson(request.getModelConfigs() != null ? request.getModelConfigs() : List.of()));
        entity.setDataResidency(request.getDataResidency() != null ? request.getDataResidency() : 0);
        entity.setDescription(request.getDescription());
        entity.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        entity.setUpdatedBy(currentUsername());
    }

    private void applyRoleRequest(AiEmpRoleAuth entity, RoleAuthSaveRequest request) {
        entity.setRoleName(request.getRoleName());
        entity.setDescription(request.getDescription());
        entity.setUserIds(JsonUtils.toJson(request.getUserIds() != null ? request.getUserIds() : List.of()));
        entity.setModelConfigs(JsonUtils.toJson(request.getModelConfigs() != null ? request.getModelConfigs() : List.of()));
        entity.setDataResidency(request.getDataResidency() != null ? request.getDataResidency() : 0);
        entity.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        entity.setUpdatedBy(currentUsername());
    }

    private PosStrategyVO toPosVO(AiEmpPosAuthStrategy entity) {
        PosStrategyVO vo = new PosStrategyVO();
        vo.setId(String.valueOf(entity.getId()));
        vo.setConfigCode(entity.getConfigCode());
        vo.setRuleName(entity.getStrategyName());
        vo.setSequence(JsonUtils.parseStringList(entity.getSequences()));
        vo.setJobLevels(JsonUtils.parseStringList(entity.getJobLevels()));
        vo.setModelConfigs(JsonUtils.parseList(entity.getModelConfigs(), ModelConfigDTO.class));
        vo.setDataResidency(entity.getDataResidency());
        vo.setDescription(entity.getDescription());
        vo.setStatus(entity.getStatus());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(format(entity.getCreatedAt()));
        vo.setUpdatedAt(format(entity.getUpdatedAt()));
        return vo;
    }

    private RoleAuthVO toRoleVO(AiEmpRoleAuth entity) {
        RoleAuthVO vo = new RoleAuthVO();
        vo.setRoleId(entity.getRoleCode());
        vo.setConfigCode(entity.getConfigCode());
        vo.setRoleName(entity.getRoleName());
        vo.setDescription(entity.getDescription());
        vo.setUserIds(JsonUtils.parseLongList(entity.getUserIds()));
        vo.setModelConfigs(JsonUtils.parseList(entity.getModelConfigs(), ModelConfigDTO.class));
        vo.setDataResidency(entity.getDataResidency());
        vo.setStatus(entity.getStatus());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(format(entity.getCreatedAt()));
        vo.setUpdatedAt(format(entity.getUpdatedAt()));
        return vo;
    }

    private String format(LocalDateTime time) {
        return time != null ? time.format(DT_FMT) : null;
    }

    /** 当前登录用户名（JWT 认证后由过滤器写入 SecurityContext），未登录回退 system */
    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof SysUser user) {
            return user.getUsername();
        }
        return "system";
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
