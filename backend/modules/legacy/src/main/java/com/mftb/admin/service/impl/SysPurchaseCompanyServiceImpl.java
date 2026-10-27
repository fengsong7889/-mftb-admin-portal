package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysPurchaseCompany;
import com.mftb.admin.mapper.SysPurchaseCompanyMapper;
import com.mftb.admin.service.SysPurchaseCompanyService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 购买公司字典服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysPurchaseCompanyServiceImpl implements SysPurchaseCompanyService {

    private final SysPurchaseCompanyMapper companyMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<SysPurchaseCompany> list(Integer status) {
        LambdaQueryWrapper<SysPurchaseCompany> wrapper = new LambdaQueryWrapper<>();
        if (status != null) {
            wrapper.eq(SysPurchaseCompany::getStatus, status);
        }
        wrapper.orderByAsc(SysPurchaseCompany::getSortOrder).orderByAsc(SysPurchaseCompany::getId);
        return companyMapper.selectList(wrapper);
    }

    @Override
    public List<Map<String, Object>> listOptions() {
        return list(1).stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("code", c.getCode());
            m.put("name", c.getName());
            m.put("shortName", c.getShortName());
            return m;
        }).toList();
    }

    @Override
    public String getNameById(Long id) {
        if (id == null) return "";
        SysPurchaseCompany c = companyMapper.selectById(id);
        return c == null ? "" : c.getName();
    }

    @Override
    public long create(SysPurchaseCompany company) {
        if (!StringUtils.hasText(company.getCode())) throw new BusinessException("公司編碼不能為空");
        if (!StringUtils.hasText(company.getName())) throw new BusinessException("公司名稱不能為空");
        long dup = companyMapper.selectCount(new LambdaQueryWrapper<SysPurchaseCompany>()
                .eq(SysPurchaseCompany::getCode, company.getCode().trim()));
        if (dup > 0) throw new BusinessException("公司編碼已存在：" + company.getCode());
        company.setId(null);
        if (company.getStatus() == null) company.setStatus(1);
        if (company.getSortOrder() == null) company.setSortOrder(0);
        company.setCreatedBy(operatorResolver.currentOperatorName());
        company.setUpdatedBy(operatorResolver.currentOperatorName());
        companyMapper.insert(company);
        return company.getId();
    }

    @Override
    public void update(Long id, SysPurchaseCompany company) {
        SysPurchaseCompany existing = companyMapper.selectById(id);
        if (existing == null) throw new BusinessException("公司不存在");
        if (StringUtils.hasText(company.getCode()) && !company.getCode().equals(existing.getCode())) {
            long dup = companyMapper.selectCount(new LambdaQueryWrapper<SysPurchaseCompany>()
                    .eq(SysPurchaseCompany::getCode, company.getCode().trim()).ne(SysPurchaseCompany::getId, id));
            if (dup > 0) throw new BusinessException("公司編碼已存在：" + company.getCode());
            existing.setCode(company.getCode().trim());
        }
        if (StringUtils.hasText(company.getName())) existing.setName(company.getName().trim());
        if (company.getShortName() != null) existing.setShortName(company.getShortName());
        if (company.getSortOrder() != null) existing.setSortOrder(company.getSortOrder());
        if (company.getRemark() != null) existing.setRemark(company.getRemark());
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        companyMapper.updateById(existing);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysPurchaseCompany existing = companyMapper.selectById(id);
        if (existing == null) throw new BusinessException("公司不存在");
        existing.setStatus(status);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        companyMapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        SysPurchaseCompany existing = companyMapper.selectById(id);
        if (existing == null) throw new BusinessException("公司不存在");
        companyMapper.deleteById(id);
    }
}
