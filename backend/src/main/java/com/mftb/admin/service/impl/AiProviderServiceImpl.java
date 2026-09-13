package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.dto.AiProviderDTO;
import com.mftb.admin.entity.AiProvider;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.service.AiProviderService;
import com.mftb.admin.util.ProviderKeyCipher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * AI 供应商管理服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiProviderServiceImpl implements AiProviderService {

    private final AiProviderMapper providerMapper;
    private final ProviderKeyCipher keyCipher;

    @Override
    public List<AiProviderDTO.ProviderVO> list(String providerKey, String name, Integer status) {
        LambdaQueryWrapper<AiProvider> wrapper = new LambdaQueryWrapper<>();

        if (providerKey != null && !providerKey.isEmpty()) {
            wrapper.like(AiProvider::getProviderKey, providerKey);
        }
        if (name != null && !name.isEmpty()) {
            wrapper.like(AiProvider::getName, name);
        }
        if (status != null) {
            wrapper.eq(AiProvider::getStatus, status);
        }

        // 展示所有供应商（含未配置 API Key 的种子数据），方便管理员在界面完成配置
        wrapper.orderByAsc(AiProvider::getSortOrder, AiProvider::getId);
        List<AiProvider> providers = providerMapper.selectList(wrapper);

        return providers.stream()
            .map(this::convertToVO)
            .toList();
    }

    @Override
    public AiProviderDTO.ProviderVO getById(Long id) {
        AiProvider provider = providerMapper.selectById(id);
        if (provider == null) {
            return null;
        }
        return convertToVO(provider);
    }

    @Override
    public boolean create(AiProviderDTO.ProviderSaveRequest request) {
        try {
            AiProvider provider = new AiProvider();
            BeanUtils.copyProperties(request, provider);
            // API Key 加密落库（禁止明文存储）
            provider.setApiKey(keyCipher.encrypt(request.getApiKey()));

            // 默认设置为非默认供应商
            if (request.getIsDefault() != null && request.getIsDefault() == 1) {
                // 如果设为默认，先将所有其他供应商的 is_default 设为 0
                providerMapper.update(null,
                    new LambdaUpdateWrapper<AiProvider>().set(AiProvider::getIsDefault, 0));
                provider.setIsDefault(1);
            }

            providerMapper.insert(provider);
            return true;
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && msg.contains("Duplicate entry")) {
                return false;
            }
            log.error("新增供应商失败", e);
            throw e;
        }
    }

    @Override
    public boolean update(Long id, AiProviderDTO.ProviderSaveRequest request) {
        AiProvider existing = providerMapper.selectById(id);
        if (existing == null) {
            return false;
        }

        // 保留旧密文：copyProperties 会用请求值覆盖 apiKey，随后根据是否重填决定取舍
        String oldApiKey = existing.getApiKey();
        BeanUtils.copyProperties(request, existing);

        // API Key 处理：前端未重填（空 / 含脱敏占位符 ****）则保留原密钥，否则重新加密
        String reqKey = request.getApiKey();
        if (reqKey == null || reqKey.isBlank() || reqKey.contains("****")) {
            existing.setApiKey(oldApiKey);
        } else {
            existing.setApiKey(keyCipher.encrypt(reqKey));
        }

        // 如果修改了 is_default，先清空其他供应商的默认设置
        if (request.getIsDefault() != null && request.getIsDefault() == 1) {
            providerMapper.update(null,
                new LambdaUpdateWrapper<AiProvider>()
                    .ne(AiProvider::getId, id)
                    .set(AiProvider::getIsDefault, 0));
        }

        providerMapper.updateById(existing);
        return true;
    }

    @Override
    public boolean delete(Long id) {
        AiProvider existing = providerMapper.selectById(id);
        if (existing == null) {
            return false;
        }

        // 如果是默认供应商，不能删除
        if (existing.getIsDefault() != null && existing.getIsDefault() == 1) {
            throw new BusinessException("默認供應商無法刪除");
        }

        providerMapper.deleteById(id);
        return true;
    }

    /**
     * 转换为 VO 对象
     */
    private AiProviderDTO.ProviderVO convertToVO(AiProvider entity) {
        AiProviderDTO.ProviderVO vo = new AiProviderDTO.ProviderVO();
        BeanUtils.copyProperties(entity, vo);

        // API Key 脱敏显示（先解密再脱敏，密文/历史明文均适用）
        String plainKey = keyCipher.decrypt(entity.getApiKey());
        if (plainKey != null && plainKey.length() > 8) {
            String maskedKey = plainKey.substring(0, 4) + "****" +
                              plainKey.substring(plainKey.length() - 4);
            vo.setApiKeyMasked(maskedKey);
        } else {
            vo.setApiKeyMasked(plainKey == null || plainKey.isEmpty() ? "" : "***");
        }

        // 格式化时间
        vo.setCreatedAt(entity.getCreatedAt() != null ?
            entity.getCreatedAt().toString() : null);
        vo.setUpdatedAt(entity.getUpdatedAt() != null ?
            entity.getUpdatedAt().toString() : null);

        return vo;
    }
}
