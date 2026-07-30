package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.FinAccountMapper;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金账户服务实现
 */
@Service
@RequiredArgsConstructor
public class FinAccountServiceImpl implements FinAccountService {

    /** 账户状态 */
    public static final String STATUS_NORMAL = "normal";
    public static final String STATUS_FROZEN = "frozen";
    public static final String STATUS_MERGE_FROZEN = "mergeFrozen";
    public static final String STATUS_CANCELLED = "cancelled";

    private final FinAccountMapper accountMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<FinAccountVO> page(FinAccountQuery query) {
        LambdaQueryWrapper<FinAccount> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getGroupId())) {
            wrapper.like(FinAccount::getGroupCode, query.getGroupId());
        }
        if (StringUtils.hasText(query.getGroupName())) {
            wrapper.like(FinAccount::getGroupName, query.getGroupName());
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.eq(FinAccount::getBrand, query.getBrand());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(FinAccount::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(FinAccount::getUpdatedAt).orderByDesc(FinAccount::getId);

        Page<FinAccount> result = accountMapper.selectPage(new Page<>(query.getPage(), query.getSize()), wrapper);
        List<FinAccountVO> records = result.getRecords().stream().map(FinAccountVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void freeze(String groupId) {
        FinAccount account = requireAccount(groupId);
        if (STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("该账户处于合并冻结中，请先处理合并流程");
        }
        if (STATUS_CANCELLED.equals(account.getStatus())) {
            throw new BusinessException("该账户已注销，无法冻结");
        }
        account.setStatus(STATUS_FROZEN);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unfreeze(String groupId) {
        FinAccount account = requireAccount(groupId);
        if (STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("合并冻结账户需通过商户合并流程解冻");
        }
        if (STATUS_CANCELLED.equals(account.getStatus())) {
            throw new BusinessException("该账户已注销，无法解冻");
        }
        account.setStatus(STATUS_NORMAL);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FinAccount getOrCreate(String groupId, String groupName, String brand) {
        FinAccount account = findByGroupCode(groupId);
        if (account != null) {
            return account;
        }
        account = new FinAccount();
        account.setGroupCode(groupId);
        account.setGroupName(StringUtils.hasText(groupName) ? groupName : resolveGroupName(groupId));
        account.setBrand(brand);
        account.setVirtualBalance(BigDecimal.ZERO);
        account.setActualBalance(BigDecimal.ZERO);
        account.setStatus(STATUS_NORMAL);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.insert(account);
        return account;
    }

    @Override
    public FinAccount find(String groupId) {
        return findByGroupCode(groupId);
    }

    @Override
    public FinAccount requireUsable(String groupId) {
        FinAccount account = requireAccount(groupId);
        if (STATUS_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("集团 " + groupId + " 账户已冻结，无法发起资金操作");
        }
        if (STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("集团 " + groupId + " 账户处于合并冻结中，无法发起资金操作");
        }
        if (STATUS_CANCELLED.equals(account.getStatus())) {
            throw new BusinessException("集团 " + groupId + " 账户已注销，无法发起资金操作");
        }
        return account;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeBalance(String groupId, BigDecimal virtualDelta, BigDecimal actualDelta) {
        FinAccount account = requireAccount(groupId);
        if (virtualDelta != null) {
            account.setVirtualBalance(nonNull(account.getVirtualBalance()).add(virtualDelta));
        }
        if (actualDelta != null) {
            account.setActualBalance(nonNull(account.getActualBalance()).add(actualDelta));
        }
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateStatus(String groupId, String status) {
        FinAccount account = requireAccount(groupId);
        account.setStatus(status);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    /** 按集团ID查询账户 */
    private FinAccount findByGroupCode(String groupId) {
        return accountMapper.selectOne(
                new LambdaQueryWrapper<FinAccount>().eq(FinAccount::getGroupCode, groupId));
    }

    /** 按集团ID查询账户，不存在时抛异常 */
    private FinAccount requireAccount(String groupId) {
        FinAccount account = findByGroupCode(groupId);
        if (account == null) {
            throw new BusinessException("集团 " + groupId + " 尚未开通推广金账户");
        }
        return account;
    }

    /** 从集团档案补齐集团名称 */
    private String resolveGroupName(String groupId) {
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>().eq(BizMerchantGroup::getGroupCode, groupId));
        return group != null ? group.getGroupName() : groupId;
    }

    private static BigDecimal nonNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
