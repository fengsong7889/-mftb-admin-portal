package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmTaskTypeConfig;
import com.mftb.admin.mapper.RdmTaskTypeConfigMapper;
import com.mftb.admin.service.RdmTaskTypeService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * RDM 任务类型字典服务实现（业务可配置）。
 * <p>
 * 每次按需查库不做缓存：字典极小（个位数行），且管理端写入后无需处理缓存失效；
 * 与 {@code RdmFlowVersionGuard.findConfig} 的既有查库模式保持一致。
 * <p>
 * 校验语义「存在即放行、停用只影响选项」：写校验只认 code 存在（含停用），
 * 停用类型不再出现在下拉/图例，但存量任务的解析与编辑不受影响；
 * 不提供物理删除，code 永续保护 {@code rdm_work_task.task_type} 历史引用。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmTaskTypeServiceImpl implements RdmTaskTypeService {

    /** 编码格式：小写字母/数字/下划线，1-32 位（与历史六码风格一致，便于配置新细分如 android/ios） */
    private static final Pattern CODE_PATTERN = Pattern.compile("^[a-z0-9_]{1,32}$");
    /** 颜色格式：#RRGGBB */
    private static final Pattern COLOR_PATTERN = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    /** label 最大长度（与列 VARCHAR(64) 对齐） */
    private static final int LABEL_MAX = 64;

    private final RdmTaskTypeConfigMapper dictMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<RdmTaskTypeConfig> listEnabled() {
        return dictMapper.selectList(new LambdaQueryWrapper<RdmTaskTypeConfig>()
                .eq(RdmTaskTypeConfig::getEnabled, 1)
                .orderByAsc(RdmTaskTypeConfig::getSortOrder)
                .orderByAsc(RdmTaskTypeConfig::getId));
    }

    @Override
    public List<RdmTaskTypeConfig> listAll() {
        return dictMapper.selectList(new LambdaQueryWrapper<RdmTaskTypeConfig>()
                .orderByAsc(RdmTaskTypeConfig::getSortOrder)
                .orderByAsc(RdmTaskTypeConfig::getId));
    }

    @Override
    public RdmTaskTypeConfig resolveByCode(String code) {
        if (!StringUtils.hasText(code)) {
            return null;
        }
        return dictMapper.selectOne(new LambdaQueryWrapper<RdmTaskTypeConfig>()
                .eq(RdmTaskTypeConfig::getCode, code.trim())
                .last("LIMIT 1"));
    }

    @Override
    public String categoryOf(String code) {
        RdmTaskTypeConfig cfg = resolveByCode(code);
        String category = cfg == null ? null : cfg.getCategory();
        if (category == null) {
            return legacyCategoryOf(code);
        }
        if (Arrays.asList(RdmTaskTypeConfig.CATEGORIES).contains(category)) {
            return category;
        }
        // 配置了未知桶一律落 dev：三桶口径不允许出现统计黑洞
        log.warn("任务类型 {} 的聚合桶 {} 不在白名单，按 dev 兜底", code, category);
        return RdmTaskTypeConfig.CATEGORY_DEV;
    }

    /** 内置兜底（与字典化前的 switch 语义完全一致）：design→design、qa→qa、其余→dev */
    private static String legacyCategoryOf(String code) {
        return switch (code == null ? "" : code) {
            case RdmTaskTypeConfig.CATEGORY_DESIGN -> RdmTaskTypeConfig.CATEGORY_DESIGN;
            case RdmTaskTypeConfig.CATEGORY_QA -> RdmTaskTypeConfig.CATEGORY_QA;
            default -> RdmTaskTypeConfig.CATEGORY_DEV;
        };
    }

    @Override
    public Long create(RdmTaskTypeConfig cfg) {
        validatePayload(cfg);
        String code = cfg.getCode().trim();
        Long dup = dictMapper.selectCount(new LambdaQueryWrapper<RdmTaskTypeConfig>()
                .eq(RdmTaskTypeConfig::getCode, code));
        if (dup != null && dup > 0) {
            throw new BusinessException("任務類型編碼已存在：" + code);
        }
        cfg.setId(null);
        cfg.setCode(code);
        if (cfg.getEnabled() == null) cfg.setEnabled(1);
        if (cfg.getSortOrder() == null) cfg.setSortOrder(0);
        String operator = operatorResolver.currentOperatorName();
        cfg.setCreatedBy(operator);
        cfg.setUpdatedBy(operator);
        dictMapper.insert(cfg);
        return cfg.getId();
    }

    @Override
    public void update(Long id, RdmTaskTypeConfig cfg) {
        RdmTaskTypeConfig existing = dictMapper.selectById(id);
        if (existing == null) {
            throw new BusinessException("任務類型不存在");
        }
        // code 是身份键，永续不改；其余字段走「非 null 才覆盖」，与字典既有更新语义一致
        if (StringUtils.hasText(cfg.getLabel())) existing.setLabel(cfg.getLabel().trim());
        if (StringUtils.hasText(cfg.getColor())) existing.setColor(cfg.getColor().trim());
        if (StringUtils.hasText(cfg.getCategory())) existing.setCategory(cfg.getCategory().trim());
        if (cfg.getSortOrder() != null) existing.setSortOrder(cfg.getSortOrder());
        if (cfg.getEnabled() != null) existing.setEnabled(cfg.getEnabled());
        if (cfg.getRemark() != null) existing.setRemark(cfg.getRemark());
        validatePayload(existing);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        dictMapper.updateById(existing);
    }

    @Override
    public void updateStatus(Long id, Integer enabled) {
        RdmTaskTypeConfig existing = dictMapper.selectById(id);
        if (existing == null) {
            throw new BusinessException("任務類型不存在");
        }
        if (enabled == null || (enabled != 0 && enabled != 1)) {
            throw new BusinessException("狀態值非法（僅接受 0/1）");
        }
        existing.setEnabled(enabled);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        dictMapper.updateById(existing);
    }

    /** 写路径强校验：不信任前端字段，服务层兜底 */
    private void validatePayload(RdmTaskTypeConfig cfg) {
        if (!StringUtils.hasText(cfg.getCode()) || !CODE_PATTERN.matcher(cfg.getCode().trim()).matches()) {
            throw new BusinessException("編碼只能是小寫字母/數字/下劃線，1-32 位");
        }
        if (!StringUtils.hasText(cfg.getLabel()) || cfg.getLabel().trim().length() > LABEL_MAX) {
            throw new BusinessException("顯示名不能為空且不超過 " + LABEL_MAX + " 字");
        }
        if (!StringUtils.hasText(cfg.getColor()) || !COLOR_PATTERN.matcher(cfg.getColor().trim()).matches()) {
            throw new BusinessException("顏色必須是 #RRGGBB 格式");
        }
        if (cfg.getCategory() != null && !Arrays.asList(RdmTaskTypeConfig.CATEGORIES).contains(cfg.getCategory())) {
            throw new BusinessException("聚合桶只能取 design/qa/dev");
        }
    }
}
