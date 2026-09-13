package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

/**
 * 广告定价服务抽象基类
 * <p>
 * 抽取 5 个 AdPricing*ServiceImpl 的公共逻辑（详情/状态/创建/更新/删除模板），
 * 子类仅需实现差异化 hook：applyRequest / saveChildren / toVO 等。
 *
 * @param <Entity>      主表实体类型
 * @param <VO>          视图对象类型
 * @param <SaveRequest> 创建/更新请求类型
 * @param <Mapper>      主表 Mapper（extends BaseMapper）
 */
@RequiredArgsConstructor
public abstract class AbstractAdPricingService<
        Entity,
        VO,
        SaveRequest,
        Mapper extends BaseMapper<Entity>> {

    protected final Mapper pricingMapper;
    protected final OperatorResolver operatorResolver;

    /* ==================== 抽象方法 — 子类必须实现 ==================== */

    /** 实体 → VO 转换（含子表查询） */
    protected abstract VO toVO(Entity entity);

    /** 生成下一个定价编号 */
    protected abstract String nextPricingNo();

    /** 将请求字段映射到实体（各业务域字段差异大） */
    protected abstract void applyRequest(Entity entity, SaveRequest request);

    /** 保存子表数据（创建时调用） */
    protected abstract void saveChildren(Long pricingId, SaveRequest request);

    /** 删除子表数据（删除主表时级联调用） */
    protected abstract void deleteChildren(Long pricingId);

    /* ==================== Hook 方法 — 子类按需覆盖 ==================== */

    /** 设置实体 status 字段（Entity 无公共基类，由子类一行实现） */
    protected abstract void setStatus(Entity entity, Integer status);

    /** 设置实体 updatedBy 字段 */
    protected abstract void setUpdatedBy(Entity entity, String updatedBy);

    /**
     * 替换子表数据（更新时调用）。
     * 默认实现：先删后存，大多数子类无需覆盖。
     */
    protected void replaceChildren(Long pricingId, SaveRequest request) {
        deleteChildren(pricingId);
        saveChildren(pricingId, request);
    }

    /**
     * 创建前校验钩子（默认空实现）。
     * Star/Revive 用于校验关联算法，Traffic 用于校验频道唯一性。
     */
    protected void preCreate(SaveRequest request) {
        // default no-op
    }

    /**
     * 更新前校验钩子（默认空实现）。
     * Star/Revive 用于校验关联算法，Traffic 用于校验不可变字段。
     */
    protected void preUpdate(Long id, SaveRequest request) {
        // default no-op
    }

    /* ==================== 模板方法 ==================== */

    /** 按 ID 查询实体，不存在抛 BusinessException */
    protected Entity require(Long id) {
        Entity entity = pricingMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("计价配置不存在");
        }
        return entity;
    }

    /** 查询详情 */
    public VO detail(Long id) {
        return toVO(require(id));
    }

    /** 更新状态（启用/停用） */
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException("非法的服务状态: " + status);
        }
        Entity entity = require(id);
        setStatus(entity, status);
        setUpdatedBy(entity, operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
    }

    /** 创建模板：校验 → 新建实体 → 编号 → applyRequest → 默认字段 → 插入 → 子表 → 返回详情 */
    @Transactional(rollbackFor = Exception.class)
    public VO create(SaveRequest request) {
        preCreate(request);
        Entity entity = newEntity();
        setPricingNo(entity, nextPricingNo());
        applyRequest(entity, request);
        if (getStatus(entity) == null) {
            setStatus(entity, 1);
        }
        setUpdatedBy(entity, operatorResolver.currentOperatorName());
        setDeleted(entity, 0);
        pricingMapper.insert(entity);
        saveChildren(getId(entity), request);
        return detail(getId(entity));
    }

    /** 更新模板：校验 → 加载实体 → applyRequest → 更新 → 替换子表 → 返回详情 */
    @Transactional(rollbackFor = Exception.class)
    public VO update(Long id, SaveRequest request) {
        preUpdate(id, request);
        Entity entity = require(id);
        applyRequest(entity, request);
        setUpdatedBy(entity, operatorResolver.currentOperatorName());
        pricingMapper.updateById(entity);
        replaceChildren(id, request);
        return detail(id);
    }

    /** 删除模板：校验 → 删主表 → 删子表 */
    public void delete(Long id) {
        require(id);
        pricingMapper.deleteById(id);
        deleteChildren(id);
    }

    /* ==================== 实体操作 Hook（因无公共基类，需子类一行实现） ==================== */

    /** 创建新实体实例 */
    protected abstract Entity newEntity();

    /** 设置定价编号 */
    protected abstract void setPricingNo(Entity entity, String pricingNo);

    /** 获取状态值 */
    protected abstract Integer getStatus(Entity entity);

    /** 设置逻辑删除标记 */
    protected abstract void setDeleted(Entity entity, int deleted);

    /** 获取实体 ID */
    protected abstract Long getId(Entity entity);
}
