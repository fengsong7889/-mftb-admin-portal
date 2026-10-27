package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysHrDict;
import com.mftb.admin.mapper.SysHrDictMapper;
import com.mftb.admin.service.SysHrDictService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * HR 人事通用字典服务实现
 * 沿用购买公司字典的编码非空/唯一性校验、操作人注入与逻辑删除约定。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysHrDictServiceImpl implements SysHrDictService {

    private final SysHrDictMapper dictMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<SysHrDict> list(String dictType, Integer status) {
        LambdaQueryWrapper<SysHrDict> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(dictType)) {
            wrapper.eq(SysHrDict::getDictType, dictType);
        }
        if (status != null) {
            wrapper.eq(SysHrDict::getStatus, status);
        }
        wrapper.orderByAsc(SysHrDict::getDictType)
                .orderByAsc(SysHrDict::getSortOrder)
                .orderByAsc(SysHrDict::getId);
        return dictMapper.selectList(wrapper);
    }

    @Override
    public List<Map<String, Object>> listOptions(String dictType) {
        if (!StringUtils.hasText(dictType)) {
            throw new BusinessException("字典類型不能為空");
        }
        return list(dictType, 1).stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.getId());
            m.put("code", d.getCode());
            m.put("name", d.getName());
            m.put("nameEn", d.getNameEn());
            m.put("parentCode", d.getParentCode());
            m.put("sortOrder", d.getSortOrder());
            return m;
        }).toList();
    }

    @Override
    public String getNameByCode(String dictType, String code) {
        if (!StringUtils.hasText(code)) return "";
        if (!StringUtils.hasText(dictType)) return code;
        SysHrDict d = dictMapper.selectOne(new LambdaQueryWrapper<SysHrDict>()
                .eq(SysHrDict::getDictType, dictType)
                .eq(SysHrDict::getCode, code)
                .last("LIMIT 1"));
        // 找不到时按原值返回（兼容历史以中文名存储的行）
        return d != null ? d.getName() : code;
    }

    @Override
    public Long create(SysHrDict dict) {
        if (!StringUtils.hasText(dict.getDictType())) throw new BusinessException("字典類型不能為空");
        if (!StringUtils.hasText(dict.getCode())) throw new BusinessException("字典編碼不能為空");
        if (!StringUtils.hasText(dict.getName())) throw new BusinessException("字典名稱不能為空");
        String code = dict.getCode().trim();
        long dup = dictMapper.selectCount(new LambdaQueryWrapper<SysHrDict>()
                .eq(SysHrDict::getDictType, dict.getDictType())
                .eq(SysHrDict::getCode, code));
        if (dup > 0) throw new BusinessException("字典編碼已存在：" + dict.getDictType() + "/" + code);
        dict.setId(null);
        dict.setCode(code);
        if (dict.getStatus() == null) dict.setStatus(1);
        if (dict.getSortOrder() == null) dict.setSortOrder(0);
        String operator = operatorResolver.currentOperatorName();
        dict.setCreatedBy(operator);
        dict.setUpdatedBy(operator);
        dictMapper.insert(dict);
        return dict.getId();
    }

    @Override
    public void update(Long id, SysHrDict dict) {
        SysHrDict existing = dictMapper.selectById(id);
        if (existing == null) throw new BusinessException("字典項不存在");
        // dictType / code 为身份键, 更新时不变更；仅调整名称/上级/排序/状态/备注
        if (StringUtils.hasText(dict.getName())) existing.setName(dict.getName().trim());
        if (dict.getNameEn() != null) existing.setNameEn(dict.getNameEn());
        if (dict.getParentCode() != null) existing.setParentCode(dict.getParentCode());
        if (dict.getSortOrder() != null) existing.setSortOrder(dict.getSortOrder());
        if (dict.getStatus() != null) existing.setStatus(dict.getStatus());
        if (dict.getRemark() != null) existing.setRemark(dict.getRemark());
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        dictMapper.updateById(existing);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysHrDict existing = dictMapper.selectById(id);
        if (existing == null) throw new BusinessException("字典項不存在");
        if (status == null || (status != 0 && status != 1)) {
            throw new BusinessException("狀態值非法（僅接受 0/1）");
        }
        existing.setStatus(status);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        dictMapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        SysHrDict existing = dictMapper.selectById(id);
        if (existing == null) throw new BusinessException("字典項不存在");
        dictMapper.deleteById(id);
    }
}
