package com.mftb.admin.dto;

import com.mftb.admin.entity.DocLearningPath;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

/** 學習路徑列表行 VO（附條目數與本人完成數，列表直接渲染進度） */
@Data
public class DocLearningPathVO {

    private Long id;
    private String name;
    private String description;
    private Integer status;
    private Integer itemCount;
    /** 本人已讀條目數（口徑：該文檔存在本人的打開留痕） */
    private Integer myReadCount;
    private String updatedAt;

    public static DocLearningPathVO of(DocLearningPath p, int itemCount, int myReadCount) {
        DocLearningPathVO v = new DocLearningPathVO();
        v.setId(p.getId());
        v.setName(p.getName());
        v.setDescription(p.getDescription());
        v.setStatus(p.getStatus());
        v.setItemCount(itemCount);
        v.setMyReadCount(myReadCount);
        v.setUpdatedAt(DateTimeUtils.format(p.getUpdatedAt()));
        return v;
    }
}
