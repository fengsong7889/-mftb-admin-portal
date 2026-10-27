package com.mftb.admin.dto;

import com.mftb.admin.constant.DocConstants;
import com.mftb.admin.entity.DocNode;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.util.Arrays;
import java.util.List;

/** 文檔索引 VO（列表/詳情共用；tags 拆數組、枚舉附 label、空間名冗餘便於前端直渲） */
@Data
public class DocNodeVO {

    private Long id;
    private Long spaceId;
    private String spaceName;
    private String category;
    private String title;
    private Integer docType;
    private String docTypeLabel;
    private Integer status;
    private String statusLabel;
    private List<String> tags;
    private String ownerName;
    private String updatedAt;
    private String tencentUrl;
    private String tencentFileId;
    private String bizType;
    private Long bizId;
    private String bizLabel;
    private String summary;

    public static DocNodeVO from(DocNode n, String spaceName) {
        DocNodeVO v = new DocNodeVO();
        v.setId(n.getId());
        v.setSpaceId(n.getSpaceId());
        v.setSpaceName(spaceName);
        v.setCategory(n.getCategory());
        v.setTitle(n.getTitle());
        v.setDocType(n.getDocType());
        v.setDocTypeLabel(DocConstants.TYPE_LABEL.get(n.getDocType()));
        v.setStatus(n.getStatus());
        v.setStatusLabel(DocConstants.STATUS_LABEL.get(n.getStatus()));
        v.setTags(n.getTags() == null || n.getTags().isBlank()
                ? List.of()
                : Arrays.stream(n.getTags().split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        v.setOwnerName(n.getOwnerName());
        v.setUpdatedAt(DateTimeUtils.format(n.getUpdatedAt()));
        v.setTencentUrl(n.getTencentUrl());
        v.setTencentFileId(n.getTencentFileId());
        v.setBizType(n.getBizType());
        v.setBizId(n.getBizId());
        if (DocConstants.BIZ_TYPE_REQ.equals(n.getBizType()) && n.getBizId() != null) {
            v.setBizLabel("REQ-" + n.getBizId());
        }
        v.setSummary(n.getSummary());
        return v;
    }
}
