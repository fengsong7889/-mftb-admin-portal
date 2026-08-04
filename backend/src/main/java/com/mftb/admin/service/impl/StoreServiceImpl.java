package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.StoreBdVO;
import com.mftb.admin.dto.StoreQuery;
import com.mftb.admin.dto.StoreRequest;
import com.mftb.admin.dto.StoreVO;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.BizStoreBd;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreBdMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.StoreService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 门店服务实现
 */
@Service
@RequiredArgsConstructor
public class StoreServiceImpl implements StoreService {

    /** 门店ID前缀（系统自增，如 MD00001） */
    private static final String STORE_CODE_PREFIX = "MD";

    /** 搜索下拉框返回的最大选项数 */
    private static final int OPTION_LIMIT = 50;

    private final BizStoreMapper storeMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreBdMapper bdMapper;
    private final SysUserMapper userMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public PageResult<StoreVO> list(StoreQuery query) {
        Map<Long, BizMerchantGroup> groupMap = getGroupMap();

        LambdaQueryWrapper<BizStore> wrapper = new LambdaQueryWrapper<>();
        if (query.getGroupId() != null) {
            wrapper.eq(BizStore::getGroupId, query.getGroupId());
        }
        // 集团ID/名称为集团表字段，先筛出命中的集团再按集团ID过滤门店
        if (StringUtils.hasText(query.getGroupKeyword())) {
            Set<Long> groupIds = matchGroupIds(groupMap, query.getGroupKeyword().trim());
            if (groupIds.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(BizStore::getGroupId, groupIds);
        }
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(BizStore::getStoreCode, kw)
                    .or().like(BizStore::getStoreName, kw));
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.like(BizStore::getBrand, query.getBrand());
        }
        if (StringUtils.hasText(query.getBizChannel())) {
            wrapper.like(BizStore::getBizChannel, query.getBizChannel());
        }
        if (StringUtils.hasText(query.getUpdatedBy())) {
            wrapper.like(BizStore::getUpdatedBy, query.getUpdatedBy().trim());
        }
        wrapper.ge(query.getUpdatedFrom() != null, BizStore::getUpdatedAt, query.updatedFromTime())
                .lt(query.getUpdatedTo() != null, BizStore::getUpdatedAt, query.updatedToTime())
                .ge(query.getCreatedFrom() != null, BizStore::getCreatedAt, query.createdFromTime())
                .lt(query.getCreatedTo() != null, BizStore::getCreatedAt, query.createdToTime());
        wrapper.orderByAsc(BizStore::getId);

        Page<BizStore> pageResult = storeMapper.selectPage(new Page<>(query.getPage(), query.getSize()), wrapper);

        List<StoreVO> records = pageResult.getRecords().stream()
                .map(s -> {
                    BizMerchantGroup group = groupMap.get(s.getGroupId());
                    return StoreVO.from(s,
                            group != null ? group.getGroupCode() : "",
                            group != null ? group.getGroupName() : "");
                })
                .toList();

        attachBdList(records);
        return new PageResult<>(records, pageResult.getTotal());
    }

    /** 按集团ID/名称模糊匹配集团主键 */
    private Set<Long> matchGroupIds(Map<Long, BizMerchantGroup> groupMap, String keyword) {
        String kw = keyword.toLowerCase();
        return groupMap.values().stream()
                .filter(g -> (g.getGroupCode() != null && g.getGroupCode().toLowerCase().contains(kw))
                        || (g.getGroupName() != null && g.getGroupName().toLowerCase().contains(kw)))
                .map(BizMerchantGroup::getId)
                .collect(Collectors.toSet());
    }

    @Override
    public List<StoreVO> listByGroupId(Long groupId) {
        LambdaQueryWrapper<BizStore> wrapper = new LambdaQueryWrapper<>();
        if (groupId != null) {
            wrapper.eq(BizStore::getGroupId, groupId);
        }
        wrapper.orderByAsc(BizStore::getId);
        List<BizStore> stores = storeMapper.selectList(wrapper);
        Map<Long, BizMerchantGroup> groupMap = getGroupMap();
        return stores.stream()
                .map(s -> {
                    BizMerchantGroup group = groupMap.get(s.getGroupId());
                    return StoreVO.from(s,
                            group != null ? group.getGroupCode() : "",
                            group != null ? group.getGroupName() : "");
                })
                .toList();
    }

    @Override
    public List<OptionVO> searchOptions(String keyword) {
        LambdaQueryWrapper<BizStore> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(BizStore::getStoreCode, kw)
                    .or().like(BizStore::getStoreName, kw));
        }
        wrapper.orderByAsc(BizStore::getStoreCode).last("LIMIT " + OPTION_LIMIT);
        return storeMapper.selectList(wrapper).stream()
                .map(s -> new OptionVO(s.getStoreCode(), s.getStoreCode() + " - " + s.getStoreName()))
                .toList();
    }

    @Override
    public List<OptionVO> searchUpdatedByOptions(String keyword) {
        StringBuilder sql = new StringBuilder("SELECT DISTINCT updated_by FROM biz_store "
                + "WHERE deleted = 0 AND updated_by IS NOT NULL AND updated_by <> ''");
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
    public StoreVO create(StoreRequest request) {
        requireGroupExists(request.getGroupId());
        BizStore store = new BizStore();
        store.setGroupId(request.getGroupId());
        store.setStoreCode(generateStoreCode());
        store.setStoreName(request.getStoreName().trim());
        store.setBrand(request.getBrand());
        store.setBizChannel(request.getBizChannel());
        store.setLoginAccount(request.getLoginAccount());
        store.setRegion(request.getRegion());
        store.setUpdatedBy(operatorResolver.currentOperatorName());
        store.setDeleted(0);
        storeMapper.insert(store);
        BizMerchantGroup group = groupMapper.selectById(request.getGroupId());
        return StoreVO.from(store, group.getGroupCode(), group.getGroupName());
    }

    @Override
    public StoreVO update(Long id, StoreRequest request) {
        BizStore store = requireStore(id);
        requireGroupExists(request.getGroupId());
        // 门店ID 为系统自增编号, 编辑时不允许变更
        store.setGroupId(request.getGroupId());
        store.setStoreName(request.getStoreName().trim());
        store.setBrand(request.getBrand());
        store.setBizChannel(request.getBizChannel());
        store.setLoginAccount(request.getLoginAccount());
        store.setRegion(request.getRegion());
        store.setUpdatedBy(operatorResolver.currentOperatorName());
        storeMapper.updateById(store);
        BizMerchantGroup group = groupMapper.selectById(request.getGroupId());
        return StoreVO.from(store, group.getGroupCode(), group.getGroupName());
    }

    @Override
    public List<StoreBdVO> listBds(Long storeId) {
        requireStore(storeId);
        List<BizStoreBd> binds = bdMapper.selectList(new LambdaQueryWrapper<BizStoreBd>()
                .eq(BizStoreBd::getStoreId, storeId)
                .orderByAsc(BizStoreBd::getId));
        return toBdVos(binds, loadBdUserMap(binds));
    }

    @Override
    public StoreBdVO addBd(Long storeId, String bdEmpId) {
        requireStore(storeId);
        if (!StringUtils.hasText(bdEmpId)) {
            throw new BusinessException("请选择BD员工");
        }
        SysUser bd = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getEmpId, bdEmpId.trim()).last("LIMIT 1"));
        if (bd == null) {
            throw new BusinessException("BD员工不存在");
        }
        Long exists = bdMapper.selectCount(new LambdaQueryWrapper<BizStoreBd>()
                .eq(BizStoreBd::getStoreId, storeId)
                .eq(BizStoreBd::getBdEmpId, bd.getEmpId()));
        if (exists != null && exists > 0) {
            throw new BusinessException("该员工已绑定为门店BD");
        }
        BizStoreBd bind = new BizStoreBd();
        bind.setStoreId(storeId);
        bind.setBdEmpId(bd.getEmpId());
        bind.setBdName(bd.getName());
        bind.setCreatedBy(operatorResolver.currentOperatorName());
        bdMapper.insert(bind);
        touchStore(storeId);
        StoreBdVO vo = new StoreBdVO();
        vo.setId(bind.getId());
        vo.setBdEmpId(bd.getEmpId());
        vo.setBdName(bd.getName());
        vo.setDepartment(bd.getDepartment());
        vo.setPosition(bd.getPosition());
        vo.setJobLevel(bd.getJobLevel());
        return vo;
    }

    @Override
    public void removeBd(Long storeId, Long bindId) {
        BizStoreBd bind = bdMapper.selectById(bindId);
        if (bind == null || !bind.getStoreId().equals(storeId)) {
            throw new BusinessException("绑定记录不存在");
        }
        bdMapper.deleteById(bindId);
        touchStore(storeId);
    }

    @Override
    public List<OptionVO> listByGroupCode(String groupCode, String brand) {
        if (!StringUtils.hasText(groupCode)) {
            return List.of();
        }
        BizMerchantGroup group = groupMapper.selectOne(new LambdaQueryWrapper<BizMerchantGroup>()
                .eq(BizMerchantGroup::getGroupCode, groupCode.trim()).last("LIMIT 1"));
        if (group == null) {
            return List.of();
        }
        LambdaQueryWrapper<BizStore> wrapper = new LambdaQueryWrapper<BizStore>()
                .eq(BizStore::getGroupId, group.getId());
        if (StringUtils.hasText(brand)) {
            wrapper.eq(BizStore::getBrand, brand.trim());
        }
        wrapper.orderByAsc(BizStore::getId);
        List<BizStore> stores = storeMapper.selectList(wrapper);
        return stores.stream()
                .map(s -> new OptionVO(String.valueOf(s.getId()), s.getStoreName() + "(" + s.getStoreCode() + ")"))
                .toList();
    }

    @Override
    public List<OptionVO> listBdOptionsByGroupCode(String groupCode) {
        if (!StringUtils.hasText(groupCode)) {
            return List.of();
        }
        BizMerchantGroup group = groupMapper.selectOne(new LambdaQueryWrapper<BizMerchantGroup>()
                .eq(BizMerchantGroup::getGroupCode, groupCode.trim()).last("LIMIT 1"));
        if (group == null) {
            return List.of();
        }
        List<BizStore> stores = storeMapper.selectList(new LambdaQueryWrapper<BizStore>()
                .eq(BizStore::getGroupId, group.getId())
                .orderByAsc(BizStore::getId));
        if (stores.isEmpty()) {
            return List.of();
        }
        List<BizStoreBd> binds = bdMapper.selectList(new LambdaQueryWrapper<BizStoreBd>()
                .in(BizStoreBd::getStoreId, stores.stream().map(BizStore::getId).toList())
                .orderByAsc(BizStoreBd::getId));
        // 同一BD绑定多家门店时去重, 保持绑定顺序
        Map<String, String> bdMap = new LinkedHashMap<>();
        for (BizStoreBd b : binds) {
            bdMap.putIfAbsent(b.getBdEmpId(), b.getBdName());
        }
        return bdMap.entrySet().stream()
                .map(e -> new OptionVO(e.getKey(), e.getValue() + "(" + e.getKey() + ")"))
                .toList();
    }

    /** 为分页记录批量填充已绑定的BD列表 */
    private void attachBdList(List<StoreVO> records) {
        if (records.isEmpty()) {
            return;
        }
        List<BizStoreBd> binds = bdMapper.selectList(new LambdaQueryWrapper<BizStoreBd>()
                .in(BizStoreBd::getStoreId, records.stream().map(StoreVO::getId).toList())
                .orderByAsc(BizStoreBd::getId));
        Map<String, SysUser> userMap = loadBdUserMap(binds);
        Map<Long, List<BizStoreBd>> byStore = binds.stream()
                .collect(Collectors.groupingBy(BizStoreBd::getStoreId));
        for (StoreVO vo : records) {
            vo.setBdList(toBdVos(byStore.getOrDefault(vo.getId(), List.of()), userMap));
        }
    }

    /** 批量加载BD对应的员工信息（部门/职位/职级） */
    private Map<String, SysUser> loadBdUserMap(List<BizStoreBd> binds) {
        if (binds.isEmpty()) {
            return Map.of();
        }
        Set<String> empIds = binds.stream().map(BizStoreBd::getBdEmpId).collect(Collectors.toSet());
        return userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getEmpId, empIds)).stream()
                .collect(Collectors.toMap(SysUser::getEmpId, Function.identity(), (a, b) -> a));
    }

    /** 绑定记录 -> 视图对象，员工信息取实时快照, 员工已删除时回退绑定时姓名 */
    private List<StoreBdVO> toBdVos(List<BizStoreBd> binds, Map<String, SysUser> userMap) {
        return binds.stream().map(b -> {
            StoreBdVO vo = new StoreBdVO();
            vo.setId(b.getId());
            vo.setBdEmpId(b.getBdEmpId());
            SysUser user = userMap.get(b.getBdEmpId());
            vo.setBdName(user != null ? user.getName() : b.getBdName());
            if (user != null) {
                vo.setDepartment(user.getDepartment());
                vo.setPosition(user.getPosition());
                vo.setJobLevel(user.getJobLevel());
            }
            return vo;
        }).toList();
    }

    /** BD绑定变更后刷新门店最后更新人/时间 */
    private void touchStore(Long storeId) {
        BizStore store = storeMapper.selectById(storeId);
        if (store != null) {
            store.setUpdatedBy(operatorResolver.currentOperatorName());
            storeMapper.updateById(store);
        }
    }

    @Override
    public void delete(Long id) {
        BizStore store = requireStore(id);
        // @TableLogic 字段会被 updateById 自动忽略, 必须用 deleteById 触发逻辑删除 (UPDATE SET deleted=1)
        store.setUpdatedBy(operatorResolver.currentOperatorName());
        storeMapper.updateById(store);
        storeMapper.deleteById(id);
    }

    /**
     * 生成下一个门店ID: 取当前最大 MD 序号 + 1 (原生 SQL 包含逻辑删除记录, 避免复用已删除门店的编号)
     */
    private String generateStoreCode() {
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(store_code, 3) AS UNSIGNED)), 0) FROM biz_store "
                        + "WHERE store_code REGEXP '^MD[0-9]+$'",
                Integer.class);
        return String.format("%s%05d", STORE_CODE_PREFIX, (maxSeq == null ? 0 : maxSeq) + 1);
    }

    private void requireGroupExists(Long groupId) {
        if (groupMapper.selectById(groupId) == null) {
            throw new BusinessException("所属集团不存在");
        }
    }

    private BizStore requireStore(Long id) {
        BizStore store = storeMapper.selectById(id);
        if (store == null) {
            throw new BusinessException("门店不存在");
        }
        return store;
    }

    private Map<Long, BizMerchantGroup> getGroupMap() {
        List<BizMerchantGroup> groups = groupMapper.selectList(null);
        return groups.stream().collect(Collectors.toMap(BizMerchantGroup::getId, Function.identity()));
    }
}
