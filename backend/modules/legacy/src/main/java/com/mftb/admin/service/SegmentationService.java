package com.mftb.admin.service;

import java.util.List;

/**
 * 中文分词服务
 */
public interface SegmentationService {

    /**
     * 对输入文本进行分词，返回去重后的词条列表
     *
     * @param text 待分词文本
     * @return 分词结果（已去重、去空白、过滤单字）
     */
    List<String> segment(String text);
}
