package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.HrProfileItem;
import com.mftb.admin.mapper.HrProfileItemMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.service.HrProfileService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 档案扩展实现。校验按"档案证据"口径：类型白名单、标题必填、区间不倒挂、证据地址长度；
 * 不做审批、不做生效日期推导——这些属于异动与合同，不属于档案。
 */
@Service
@RequiredArgsConstructor
public class HrProfileServiceImpl implements HrProfileService {

    private static final List<String> ITEM_TYPES =
            List.of("EDUCATION", "WORK", "QUALIFICATION", "REWARD", "PUNISH");

    private final HrProfileItemMapper itemMapper;
    private final PersonMapper personMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<HrProfileItem> listByPerson(Long personId, String itemType) {
        if (personId == null) {
            throw new BusinessException("请选择人员");
        }
        LambdaQueryWrapper<HrProfileItem> wrapper = new LambdaQueryWrapper<HrProfileItem>()
                .eq(HrProfileItem::getPersonId, personId)
                .eq(StringUtils.hasText(itemType), HrProfileItem::getItemType, itemType)
                .orderByDesc(HrProfileItem::getStartDate)
                .orderByDesc(HrProfileItem::getId);
        return itemMapper.selectList(wrapper);
    }

    @Override
    public HrProfileItem getItem(Long id) {
        HrProfileItem item = id == null ? null : itemMapper.selectById(id);
        if (item == null) {
            throw new BusinessException("档案记录不存在或已删除");
        }
        return item;
    }

    @Override
    @Transactional
    public HrProfileItem saveItem(HrProfileItem item) {
        if (item == null || item.getPersonId() == null) {
            throw new BusinessException("请选择人员");
        }
        if (personMapper.selectById(item.getPersonId()) == null) {
            throw new BusinessException("人员不存在");
        }
        String type = StringUtils.hasText(item.getItemType()) ? item.getItemType().toUpperCase() : null;
        if (type == null || !ITEM_TYPES.contains(type)) {
            throw new BusinessException("档案类型只能是 EDUCATION / WORK / QUALIFICATION / REWARD / PUNISH");
        }
        if (!StringUtils.hasText(item.getTitle())) {
            throw new BusinessException("标题不能为空");
        }
        if (item.getStartDate() != null && item.getEndDate() != null
                && item.getEndDate().isBefore(item.getStartDate())) {
            throw new BusinessException("结束日期不能早于开始日期");
        }
        if (item.getEvidenceUrl() != null && item.getEvidenceUrl().length() > 500) {
            throw new BusinessException("证据地址过长");
        }
        item.setItemType(type);
        item.setTitle(item.getTitle().trim());
        item.setVerifyStatus(Integer.valueOf(1).equals(item.getVerifyStatus()) ? 1 : 0);
        item.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (item.getId() == null) {
            itemMapper.insert(item);
        } else {
            getItem(item.getId());
            itemMapper.updateById(item);
        }
        return itemMapper.selectById(item.getId());
    }

    @Override
    @Transactional
    public void deleteItem(Long id) {
        getItem(id);
        itemMapper.deleteById(id);
    }
}
