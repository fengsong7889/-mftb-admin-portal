package com.mftb.admin.service.impl;

import com.huaban.analysis.jieba.JiebaSegmenter;
import com.huaban.analysis.jieba.SegToken;
import com.mftb.admin.service.SegmentationService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 基于 Jieba 的中文分词服务实现
 * <p>
 * 使用 SEARCH 模式进行细粒度分词，适合词库录入场景：
 * 输入 "红烧牛肉面" → ["红烧", "牛肉", "牛肉面", "面"]
 * </p>
 */
@Slf4j
@Service
public class SegmentationServiceImpl implements SegmentationService {

    /** 单例分词器（线程安全，内部持有词典 Trie） */
    private JiebaSegmenter segmenter;

    /** 需要过滤的停用词 / 标点 / 无意义单字 */
    private static final Set<String> STOP_WORDS = Set.of(
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
            "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
            "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "些",
            "什么", "怎么", "如何", "为什么", "吗", "呢", "吧", "啊", "哦", "嗯",
            "，", "。", "、", "；", "：", "？", "！", "…", "—", "·",
            ",", ".", ";", ":", "?", "!", "(", ")", "[", "]", "{", "}",
            " ", "\t", "\n", "\r"
    );

    @PostConstruct
    public void init() {
        log.info("初始化 Jieba 分词器...");
        this.segmenter = new JiebaSegmenter();
        log.info("Jieba 分词器初始化完成");
    }

    @PreDestroy
    public void destroy() {
        // JiebaSegmenter 无显式 close 方法，置空即可
        this.segmenter = null;
    }

    @Override
    public List<String> segment(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }

        // 使用 SEARCH 模式（细粒度，适合词库场景）
        List<SegToken> tokens = segmenter.process(text, JiebaSegmenter.SegMode.SEARCH);

        // 去重 + 过滤
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (SegToken token : tokens) {
            String word = token.word.trim();
            if (isValidWord(word)) {
                result.add(word);
            }
        }

        log.debug("分词结果: input='{}', output={}", text, result);
        return new ArrayList<>(result);
    }

    /**
     * 判断分词结果是否有效（非空、非停用词、长度 >= 2）
     */
    private boolean isValidWord(String word) {
        if (word == null || word.length() < 2) {
            return false;
        }
        if (STOP_WORDS.contains(word)) {
            return false;
        }
        // 过滤纯数字、纯标点
        if (word.matches("^[\\d\\s]+$")) {
            return false;
        }
        if (word.matches("^[^\\p{L}\\p{N}]+$")) {
            return false;
        }
        return true;
    }
}
