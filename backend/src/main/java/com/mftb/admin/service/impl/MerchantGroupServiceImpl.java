package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MerchantGroupQuery;
import com.mftb.admin.dto.MerchantGroupRequest;
import com.mftb.admin.dto.MerchantGroupVO;
import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.MerchantGroupService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 商户集团服务实现
 */
@Service
@RequiredArgsConstructor
public class MerchantGroupServiceImpl implements MerchantGroupService {

    /** 集团ID前缀（系统自增，如 JT000001） */
    private static final String GROUP_CODE_PREFIX = "JT";

    /** 搜索下拉框返回的最大选项数 */
    private static final int OPTION_LIMIT = 50;

    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public PageResult<MerchantGroupVO> list(MerchantGroupQuery query) {
        LambdaQueryWrapper<BizMerchantGroup> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(BizMerchantGroup::getGroupCode, kw)
                    .or().like(BizMerchantGroup::getGroupName, kw));
        }
        if (StringUtils.hasText(query.getUpdatedBy())) {
            wrapper.like(BizMerchantGroup::getUpdatedBy, query.getUpdatedBy().trim());
        }
        wrapper.ge(query.getUpdatedFrom() != null, BizMerchantGroup::getUpdatedAt, query.updatedFromTime())
                .lt(query.getUpdatedTo() != null, BizMerchantGroup::getUpdatedAt, query.updatedToTime())
                .ge(query.getCreatedFrom() != null, BizMerchantGroup::getCreatedAt, query.createdFromTime())
                .lt(query.getCreatedTo() != null, BizMerchantGroup::getCreatedAt, query.createdToTime());
        wrapper.orderByAsc(BizMerchantGroup::getId);

        long p = PageResult.normalizePage(query.getPage());
        long sz = PageResult.normalizeSize(query.getSize());
        Page<BizMerchantGroup> pageResult =
                groupMapper.selectPage(new Page<>(p, sz), wrapper);

        // 统计各集团门店数量
        Map<Long, Long> storeCountMap = getStoreCountMap();

        List<MerchantGroupVO> records = pageResult.getRecords().stream()
                .map(g -> MerchantGroupVO.from(g, storeCountMap.getOrDefault(g.getId(), 0L)))
                .toList();

        return new PageResult<>(records, pageResult.getTotal());
    }

    @Override
    public List<MerchantGroupVO> listAll() {
        List<BizMerchantGroup> groups = groupMapper.selectList(
                new LambdaQueryWrapper<BizMerchantGroup>().orderByAsc(BizMerchantGroup::getId));
        Map<Long, Long> storeCountMap = getStoreCountMap();
        return groups.stream()
                .map(g -> MerchantGroupVO.from(g, storeCountMap.getOrDefault(g.getId(), 0L)))
                .toList();
    }

    @Override
    public List<OptionVO> searchOptions(String keyword) {
        LambdaQueryWrapper<BizMerchantGroup> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(BizMerchantGroup::getGroupCode, kw)
                    .or().like(BizMerchantGroup::getGroupName, kw));
        }
        wrapper.orderByAsc(BizMerchantGroup::getGroupCode).last("LIMIT " + OPTION_LIMIT);
        return groupMapper.selectList(wrapper).stream()
                .map(g -> new OptionVO(g.getGroupCode(), g.getGroupCode() + " - " + g.getGroupName()))
                .toList();
    }

    @Override
    public List<OptionVO> searchUpdatedByOptions(String keyword) {
        return queryUpdatedByOptions("biz_merchant_group", keyword);
    }

    /** 按表查询去重的最后更新人选项 */
    private List<OptionVO> queryUpdatedByOptions(String table, String keyword) {
        StringBuilder sql = new StringBuilder("SELECT DISTINCT updated_by FROM ").append(table)
                .append(" WHERE deleted = 0 AND updated_by IS NOT NULL AND updated_by <> ''");
        List<Object> params = new ArrayList<>();
        if (StringUtils.hasText(keyword)) {
            sql.append(" AND updated_by LIKE ?");
            params.add("%" + keyword.trim() + "%");
        }
        sql.append(" ORDER BY updated_by LIMIT ").append(OPTION_LIMIT);
        return jdbcTemplate.queryForList(sql.toString(), String.class, params.toArray())
                .stream()
                .map(OptionVO::of)
                .toList();
    }

    @Override
    public MerchantGroupVO create(MerchantGroupRequest request) {
        BizMerchantGroup group = new BizMerchantGroup();
        group.setGroupCode(generateGroupCode());
        group.setGroupName(request.getGroupName().trim());
        group.setLoginAccount(request.getLoginAccount());
        group.setUpdatedBy(operatorResolver.currentOperatorName());
        group.setDeleted(0);
        groupMapper.insert(group);
        return MerchantGroupVO.from(group, 0L);
    }

    @Override
    public MerchantGroupVO update(Long id, MerchantGroupRequest request) {
        BizMerchantGroup group = requireGroup(id);
        // 集团ID 为系统自增编号, 编辑时不允许变更
        group.setGroupName(request.getGroupName().trim());
        group.setLoginAccount(request.getLoginAccount());
        group.setUpdatedBy(operatorResolver.currentOperatorName());
        groupMapper.updateById(group);
        Long storeCount = storeMapper.selectCount(
                new LambdaQueryWrapper<BizStore>().eq(BizStore::getGroupId, id));
        return MerchantGroupVO.from(group, storeCount);
    }

    @Override
    public void delete(Long id) {
        BizMerchantGroup group = requireGroup(id);
        Long storeCount = storeMapper.selectCount(
                new LambdaQueryWrapper<BizStore>().eq(BizStore::getGroupId, id));
        if (storeCount > 0) {
            throw new BusinessException("该集团下还有 " + storeCount + " 家门店，请先删除门店后再删除集团");
        }
        // @TableLogic 字段会被 updateById 自动忽略, 必须用 deleteById 触发逻辑删除 (UPDATE SET deleted=1)
        group.setUpdatedBy(operatorResolver.currentOperatorName());
        groupMapper.updateById(group);
        groupMapper.deleteById(id);
    }

    /**
     * 生成下一个集团ID: 取当前最大 JT 序号 + 1 (原生 SQL 包含逻辑删除记录, 避免复用已删除集团的编号)
     */
    private String generateGroupCode() {
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(group_code, 3) AS UNSIGNED)), 0) FROM biz_merchant_group "
                        + "WHERE group_code REGEXP '^JT[0-9]+$'",
                Integer.class);
        return String.format("%s%06d", GROUP_CODE_PREFIX, (maxSeq == null ? 0 : maxSeq) + 1);
    }

    private BizMerchantGroup requireGroup(Long id) {
        BizMerchantGroup group = groupMapper.selectById(id);
        if (group == null) {
            throw new BusinessException("集团不存在");
        }
        return group;
    }

    /** 获取所有集团对应的门店数量 */
    private Map<Long, Long> getStoreCountMap() {
        List<BizStore> stores = storeMapper.selectList(null);
        Map<Long, Long> map = new HashMap<>();
        for (BizStore store : stores) {
            map.merge(store.getGroupId(), 1L, Long::sum);
        }
        return map;
    }
}
