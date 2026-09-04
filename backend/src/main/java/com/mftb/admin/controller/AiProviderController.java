package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiProviderDTO;
import com.mftb.admin.entity.AiProvider;
import com.mftb.admin.mapper.AiProviderMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 供应商管理控制器
 */
@RestController
@RequestMapping("/api/ai/providers")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心", description = "AI 智能中心相关接口")
public class AiProviderController {

    private final AiProviderMapper providerMapper;

    /**
     * 获取供应商列表
     */
    @GetMapping
    @Operation(summary = "查询供应商列表")
    public Result<List<AiProviderDTO.ProviderVO>> list(
        @RequestParam(required = false) String providerKey,
        @RequestParam(required = false) String name,
        @RequestParam(required = false) Integer status) {
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
        
        wrapper.orderByDesc(AiProvider::getSortOrder, AiProvider::getId);
        List<AiProvider> providers = providerMapper.selectList(wrapper);
        
        List<AiProviderDTO.ProviderVO> result = providers.stream()
            .map(this::convertToVO)
            .toList();
            
        return Result.success(result);
    }

    /**
     * 获取单个供应商详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "获取供应商详情")
    public Result<AiProviderDTO.ProviderVO> getById(@PathVariable Long id) {
        AiProvider provider = providerMapper.selectById(id);
        if (provider == null) {
            return Result.error("供应商不存在");
        }
        return Result.success(convertToVO(provider));
    }

    /**
     * 新增供应商
     */
    @PostMapping
    @Operation(summary = "新增供应商")
    public Result<Boolean> create(@Valid @RequestBody AiProviderDTO.ProviderSaveRequest request) {
        try {
            AiProvider provider = new AiProvider();
            BeanUtils.copyProperties(request, provider);
            
            // 默认设置为非默认供应商
            if (request.getIsDefault() == 1) {
                // 如果设为默认，先将所有其他供应商的 is_default 设为 0
                providerMapper.update(null, 
                    new LambdaUpdateWrapper<AiProvider>().set(AiProvider::getIsDefault, 0));
                provider.setIsDefault(1);
            }
            
            providerMapper.insert(provider);
            return Result.success(true);
        } catch (Exception e) {
            if (e.getMessage().contains("Duplicate entry")) {
                return Result.error("供应商标识已存在");
            }
            return Result.error("创建失败：" + e.getMessage());
        }
    }

    /**
     * 更新供应商
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新供应商")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody AiProviderDTO.ProviderSaveRequest request) {
        AiProvider existing = providerMapper.selectById(id);
        if (existing == null) {
            return Result.error("供应商不存在");
        }
        
        BeanUtils.copyProperties(request, existing);
        
        // 如果修改了 is_default，先清空其他供应商的默认设置
        if (request.getIsDefault() == 1) {
            providerMapper.update(null, 
                new LambdaUpdateWrapper<AiProvider>()
                    .ne(AiProvider::getId, id)
                    .set(AiProvider::getIsDefault, 0));
        }
        
        providerMapper.updateById(existing);
        return Result.success(true);
    }

    /**
     * 删除供应商（逻辑删除）
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除供应商")
    public Result<Boolean> delete(@PathVariable Long id) {
        AiProvider existing = providerMapper.selectById(id);
        if (existing == null) {
            return Result.error("供应商不存在");
        }
        
        // 如果是默认供应商，不能删除
        if (existing.getIsDefault() == 1) {
            return Result.error("默认供应商无法删除");
        }
        
        providerMapper.deleteById(id);
        return Result.success(true);
    }

    /**
     * 转换为 VO 对象
     */
    private AiProviderDTO.ProviderVO convertToVO(AiProvider entity) {
        AiProviderDTO.ProviderVO vo = new AiProviderDTO.ProviderVO();
        BeanUtils.copyProperties(entity, vo);
        
        // API Key 脱敏显示
        if (entity.getApiKey() != null && entity.getApiKey().length() > 4) {
            String maskedKey = entity.getApiKey().substring(0, 4) + "****" + 
                              entity.getApiKey().substring(entity.getApiKey().length() - 4);
            vo.setApiKeyMasked(maskedKey);
        } else {
            vo.setApiKeyMasked("***");
        }
        
        // 格式化时间
        vo.setCreatedAt(entity.getCreatedAt() != null ? 
            entity.getCreatedAt().toString() : null);
        vo.setUpdatedAt(entity.getUpdatedAt() != null ? 
            entity.getUpdatedAt().toString() : null);
            
        return vo;
    }
}
