package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiProviderDTO;
import com.mftb.admin.entity.AiProvider;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.util.ProviderKeyCipher;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 供应商管理控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/ai/providers")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心", description = "AI 智能中心相关接口")
public class AiProviderController {

    /** 本菜单标识（sys_menu.menu_key），供应商管理页 */
    private static final String MENU = "ai-model-provider";

    private final AiProviderMapper providerMapper;
    private final ProviderKeyCipher keyCipher;

    /**
     * 获取供应商列表
     */
    @GetMapping
    @Operation(summary = "查询供应商列表")
    @RequirePermission(menu = MENU)
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
    @RequirePermission(menu = MENU)
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
    @RequirePermission(menu = MENU, action = "create")
    public Result<Boolean> create(@Valid @RequestBody AiProviderDTO.ProviderSaveRequest request) {
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
            return Result.success(true);
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && msg.contains("Duplicate entry")) {
                return Result.error("供应商标识已存在");
            }
            log.error("新增供应商失败", e);
            return Result.error("创建失败，请稍后重试");
        }
    }

    /**
     * 更新供应商
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新供应商")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody AiProviderDTO.ProviderSaveRequest request) {
        AiProvider existing = providerMapper.selectById(id);
        if (existing == null) {
            return Result.error("供应商不存在");
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
        return Result.success(true);
    }

    /**
     * 删除供应商（逻辑删除）
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除供应商")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> delete(@PathVariable Long id) {
        AiProvider existing = providerMapper.selectById(id);
        if (existing == null) {
            return Result.error("供应商不存在");
        }
        
        // 如果是默认供应商，不能删除
        if (existing.getIsDefault() != null && existing.getIsDefault() == 1) {
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
