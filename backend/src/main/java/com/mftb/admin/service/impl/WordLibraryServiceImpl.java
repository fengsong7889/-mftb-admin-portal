package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.WordLibraryImportResult;
import com.mftb.admin.dto.WordLibraryRequest;
import com.mftb.admin.dto.WordLibraryVO;
import com.mftb.admin.entity.PromWordLibrary;
import com.mftb.admin.mapper.PromWordLibraryMapper;
import com.mftb.admin.service.WordLibraryService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 推广词库管理服务实现
 */
@Service
@RequiredArgsConstructor
public class WordLibraryServiceImpl implements WordLibraryService {

    private static final DateTimeFormatter DISPLAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<String> VALID_CHANNELS = Set.of("takeaway", "supermarket", "groupBuy");
    private static final Set<Integer> VALID_STATUS = Set.of(1, 2);

    private final PromWordLibraryMapper wordLibraryMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<WordLibraryVO> listWords(long page, long size, String keyword, String channel,
                                                Integer status, String updatedBy, String remark,
                                                String startDate, String endDate) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);

        LambdaQueryWrapper<PromWordLibrary> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            wrapper.like(PromWordLibrary::getWord, keyword);
        }
        if (StringUtils.hasText(channel) && !"all".equals(channel)) {
            wrapper.eq(PromWordLibrary::getChannel, channel);
        }
        if (status != null) {
            wrapper.eq(PromWordLibrary::getStatus, status);
        }
        if (StringUtils.hasText(updatedBy)) {
            wrapper.like(PromWordLibrary::getUpdatedBy, updatedBy);
        }
        if (StringUtils.hasText(remark)) {
            wrapper.like(PromWordLibrary::getRemark, remark);
        }
        if (StringUtils.hasText(startDate)) {
            try {
                wrapper.ge(PromWordLibrary::getUpdatedAt, LocalDate.parse(startDate).atStartOfDay());
            } catch (DateTimeParseException ignored) { }
        }
        if (StringUtils.hasText(endDate)) {
            try {
                wrapper.le(PromWordLibrary::getUpdatedAt, LocalDate.parse(endDate).atTime(LocalTime.MAX));
            } catch (DateTimeParseException ignored) { }
        }
        wrapper.orderByDesc(PromWordLibrary::getUpdatedAt);

        Page<PromWordLibrary> pageParam = new Page<>(page, size);
        Page<PromWordLibrary> result = wordLibraryMapper.selectPage(pageParam, wrapper);

        return new PageResult<>(
                result.getRecords().stream().map(this::toVO).toList(),
                result.getTotal()
        );
    }

    @Override
    @Transactional
    public WordLibraryVO createWord(WordLibraryRequest request) {
        validateChannel(request.getChannel());
        String word = request.getWord().trim();
        String channel = request.getChannel().trim();
        requireWordUnique(word, channel, null);

        PromWordLibrary entity = new PromWordLibrary();
        entity.setWord(word);
        entity.setChannel(channel);
        entity.setStatus(normalizeStatus(request.getStatus()));
        entity.setMatchCount(0);
        entity.setRemark(request.getRemark());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        wordLibraryMapper.insert(entity);
        return toVO(entity);
    }

    @Override
    @Transactional
    public WordLibraryVO updateWord(Long id, WordLibraryRequest request) {
        validateChannel(request.getChannel());
        PromWordLibrary entity = wordLibraryMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("词条不存在");
        }
        String word = request.getWord().trim();
        String channel = request.getChannel().trim();
        requireWordUnique(word, channel, id);

        entity.setWord(word);
        entity.setChannel(channel);
        if (request.getStatus() != null) {
            entity.setStatus(normalizeStatus(request.getStatus()));
        }
        entity.setRemark(request.getRemark());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        wordLibraryMapper.updateById(entity);
        return toVO(entity);
    }

    @Override
    @Transactional
    public void toggleStatus(Long id) {
        PromWordLibrary entity = wordLibraryMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("词条不存在");
        }
        entity.setStatus(entity.getStatus() == 1 ? 2 : 1);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        wordLibraryMapper.updateById(entity);
    }

    @Override
    @Transactional
    public void deleteWord(Long id) {
        PromWordLibrary entity = wordLibraryMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("词条不存在");
        }
        wordLibraryMapper.deleteById(id);
    }

    @Override
    @Transactional
    public WordLibraryImportResult batchImport(List<WordLibraryRequest> requests) {
        WordLibraryImportResult result = WordLibraryImportResult.empty();
        if (requests == null || requests.isEmpty()) {
            return result;
        }
        result.setTotal(requests.size());

        // 用于检查导入文件内部重复
        Set<String> batchKeys = new HashSet<>();
        String operator = operatorResolver.currentOperatorName();

        for (int i = 0; i < requests.size(); i++) {
            WordLibraryRequest request = requests.get(i);
            int rowNo = i + 1;

            String word = request.getWord() == null ? null : request.getWord().trim();
            String channel = request.getChannel() == null ? null : request.getChannel().trim();

            // 基础校验
            if (!StringUtils.hasText(word)) {
                result.addFailure(rowNo, word, channel, "词条不能为空");
                continue;
            }
            if (!StringUtils.hasText(channel) || !VALID_CHANNELS.contains(channel)) {
                result.addFailure(rowNo, word, channel, "所属频道只能为 takeaway/supermarket/groupBuy");
                continue;
            }
            if (request.getStatus() != null && !VALID_STATUS.contains(request.getStatus())) {
                result.addFailure(rowNo, word, channel, "状态只能为 1(启用) 或 2(停用)");
                continue;
            }

            // 导入文件内部重复校验
            String key = word + "|" + channel;
            if (!batchKeys.add(key)) {
                result.addFailure(rowNo, word, channel, "导入文件内存在重复词条");
                continue;
            }

            // 数据库唯一性校验
            Long count = wordLibraryMapper.selectCount(
                    new LambdaQueryWrapper<PromWordLibrary>()
                            .eq(PromWordLibrary::getWord, word)
                            .eq(PromWordLibrary::getChannel, channel));
            if (count != null && count > 0) {
                result.addFailure(rowNo, word, channel, "该频道下已存在相同词条");
                continue;
            }

            PromWordLibrary entity = new PromWordLibrary();
            entity.setWord(word);
            entity.setChannel(channel);
            entity.setStatus(request.getStatus() != null ? request.getStatus() : 1);
            entity.setMatchCount(0);
            entity.setRemark(request.getRemark());
            entity.setUpdatedBy(operator);
            wordLibraryMapper.insert(entity);
            result.addSuccess();
        }
        return result;
    }

    /** 校验频道值合法性 */
    private void validateChannel(String channel) {
        if (!StringUtils.hasText(channel) || !VALID_CHANNELS.contains(channel.trim())) {
            throw new BusinessException("所属频道只能为 takeaway/supermarket/groupBuy");
        }
    }

    /** 校验同一频道下词条唯一性 */
    private void requireWordUnique(String word, String channel, Long excludeId) {
        LambdaQueryWrapper<PromWordLibrary> wrapper = new LambdaQueryWrapper<PromWordLibrary>()
                .eq(PromWordLibrary::getWord, word)
                .eq(PromWordLibrary::getChannel, channel);
        if (excludeId != null) {
            wrapper.ne(PromWordLibrary::getId, excludeId);
        }
        Long count = wordLibraryMapper.selectCount(wrapper);
        if (count != null && count > 0) {
            throw new BusinessException("该频道下已存在相同词条");
        }
    }

    /** 规范化状态值 */
    private Integer normalizeStatus(Integer status) {
        return status != null && VALID_STATUS.contains(status) ? status : 1;
    }

    /** 实体 → VO */
    private WordLibraryVO toVO(PromWordLibrary entity) {
        WordLibraryVO vo = new WordLibraryVO();
        vo.setId(entity.getId());
        vo.setWord(entity.getWord());
        vo.setChannel(entity.getChannel());
        vo.setStatus(entity.getStatus());
        vo.setMatchCount(entity.getMatchCount());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdateTime(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DISPLAY_FMT) : null);
        vo.setRemark(entity.getRemark());
        return vo;
    }
}
