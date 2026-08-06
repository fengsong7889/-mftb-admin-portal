package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 推广词库批量导入结果
 */
@Data
public class WordLibraryImportResult {

    /** 总行数 */
    private int total;

    /** 成功行数 */
    private int success;

    /** 失败行数 */
    private int fail;

    /** 失败明细 */
    private List<FailureItem> failures = new ArrayList<>();

    public static WordLibraryImportResult empty() {
        return new WordLibraryImportResult();
    }

    public void addSuccess() {
        this.success++;
    }

    public void addFailure(int index, String word, String channel, String reason) {
        this.fail++;
        FailureItem item = new FailureItem();
        item.setIndex(index);
        item.setWord(word);
        item.setChannel(channel);
        item.setReason(reason);
        this.failures.add(item);
    }

    /**
     * 单行失败明细
     */
    @Data
    public static class FailureItem {
        /** 行号 (从 1 开始) */
        private int index;
        private String word;
        private String channel;
        private String reason;
    }
}
