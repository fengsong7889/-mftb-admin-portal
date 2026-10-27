package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.controller.AiEmpAuthController.*;
import com.mftb.admin.entity.AiEmpPosAuthStrategy;
import com.mftb.admin.entity.AiEmpRoleAuth;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiEmpPosAuthStrategyMapper;
import com.mftb.admin.mapper.AiEmpRoleAuthMapper;
import com.mftb.admin.service.AiEmpAuthService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 员工模型权控服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiEmpAuthServiceImpl implements AiEmpAuthService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AiEmpPosAuthStrategyMapper posStrategyMapper;
    private final AiEmpRoleAuthMapper roleAuthMapper;
    private final BizSeqService bizSeqService;

    /* ═══════════════ 职位授权策略 ═══════════════ */

    @Override
    public List<PosStrategyVO> listPosStrategies(String name) {
        LambdaQueryWrapper<AiEmpPosAuthStrategy> wrapper = new LambdaQueryWrapper<>();
        if (name != null && !name.trim().isEmpty()) {
            wrapper.like(AiEmpPosAuthStrategy::getStrategyName, name.trim());
        }
        wrapper.orderByDesc(AiEmpPosAuthStrategy::getUpdatedAt);
        return posStrategyMapper.selectList(wrapper).stream().map(this::toPosVO).toList();
    }

    @Override
    public PosStrategyVO getPosStrategy(Long id) {
        AiEmpPosAuthStrategy entity = posStrategyMapper.selectById(id);
        return entity != null ? toPosVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createPosStrategy(PosStrategySaveRequest request) {
        AiEmpPosAuthStrategy entity = new AiEmpPosAuthStrategy();
        entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_EMP_POS_MODEL_AUTH));
        applyPosRequest(entity, request);
        entity.setCreatedBy(currentUsername());
        posStrategyMapper.insert(entity);
        return entity.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updatePosStrategy(Long id, PosStrategySaveRequest request) {
        AiEmpPosAuthStrategy entity = posStrategyMapper.selectById(id);
        if (entity == null) {
            return false;
        }
        applyPosRequest(entity, request);
        posStrategyMapper.updateById(entity);
        return true;
    }

    @Override
    public boolean togglePosStrategyStatus(Long id, Integer status) {
        AiEmpPosAuthStrategy entity = posStrategyMapper.selectById(id);
        if (entity == null) {
            return false;
        }
        entity.setStatus(status);
        entity.setUpdatedBy(currentUsername());
        posStrategyMapper.updateById(entity);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deletePosStrategy(Long id) {
        if (posStrategyMapper.selectById(id) == null) {
            return false;
        }
        posStrategyMapper.deleteById(id);
        return true;
    }

    /* ═══════════════ 自定义角色授权 ═══════════════ */

    @Override
    public List<RoleAuthVO> listRoleAuths(String name) {
        LambdaQueryWrapper<AiEmpRoleAuth> wrapper = new LambdaQueryWrapper<>();
        if (name != null && !name.trim().isEmpty()) {
            wrapper.like(AiEmpRoleAuth::getRoleName, name.trim());
        }
        wrapper.orderByDesc(AiEmpRoleAuth::getUpdatedAt);
        return roleAuthMapper.selectList(wrapper).stream().map(this::toRoleVO).toList();
    }

    @Override
    public RoleAuthVO getRoleAuth(String roleCode) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        return entity != null ? toRoleVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String createRoleAuth(RoleAuthSaveRequest request) {
        String roleCode = (request.getRoleCode() != null && !request.getRoleCode().isBlank())
                ? request.getRoleCode().trim()
                : generateRoleCode();
        if (findByRoleCode(roleCode) != null) {
            return null; // 角色编码已存在
        }
        AiEmpRoleAuth entity = new AiEmpRoleAuth();
        entity.setRoleCode(roleCode);
        entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_EMP_ROLE_MODEL_AUTH));
        applyRoleRequest(entity, request);
        entity.setCreatedBy(currentUsername());
        roleAuthMapper.insert(entity);
        return roleCode;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateRoleAuth(String roleCode, RoleAuthSaveRequest request) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return false;
        }
        applyRoleRequest(entity, request);
        roleAuthMapper.updateById(entity);
        return true;
    }

    @Override
    public boolean toggleRoleAuthStatus(String roleCode, Integer status) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return false;
        }
        entity.setStatus(status);
        entity.setUpdatedBy(currentUsername());
        roleAuthMapper.updateById(entity);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteRoleAuth(String roleCode) {
        AiEmpRoleAuth entity = findByRoleCode(roleCode);
        if (entity == null) {
            return false;
        }
        roleAuthMapper.deleteById(entity.getId());
        return true;
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
}
