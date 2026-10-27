package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 存量需求导入结果。
 *
 * <p><b>为什么不是纯异常返回</b>：一次导入几十上百行，用户需要逐行知道
 * 「导入了 / 跳过了（云效编号已存在）/ 失败了（哪一列不对）」；
 * 只抛一条异常会把整批问题压成一句话，用户只能反复试。
 * 因此：参数级问题（空列表、超上限、无权限）仍走业务异常；
 * 行级问题一律进 {@link #items}，接口返回 200 让前端渲染成清单。
 */
@Data
public class RdmRequirementImportVO {

    private int total;
    private int imported;
    private int skipped;
    private int failed;

    /** 逐行结果（顺序与请求一致） */
    private List<Item> items = new ArrayList<>();

    /** 单行结果 */
    @Data
    public static class Item {

        /** Excel 行号 */
        private Integer rowNo;

        /** 云效编号 */
        private String externalNo;

        /** 需求名称 */
        private String title;

        /** imported / skipped / failed */
        private String result;

        /** 失败或跳过的原因，导入成功时为空 */
        private String message;

        /** 导入成功后的正式需求编号（XQ...） */
        private String reqNo;
    }
}
