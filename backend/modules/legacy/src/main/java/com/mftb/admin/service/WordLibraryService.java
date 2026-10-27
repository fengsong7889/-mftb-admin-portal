package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.WordLibraryImportResult;
import com.mftb.admin.dto.WordLibraryRequest;
import com.mftb.admin.dto.WordLibraryVO;

import java.util.List;

/**
 * 推广词库管理服务
 */
public interface WordLibraryService {

    /** 分页查询词库列表 */
    PageResult<WordLibraryVO> listWords(long page, long size, String keyword, String channel,
                                        Integer status, String updatedBy, String remark,
                                        String startDate, String endDate);

    /** 新增词条 */
    WordLibraryVO createWord(WordLibraryRequest request);

    /** 编辑词条 */
    WordLibraryVO updateWord(Long id, WordLibraryRequest request);

    /** 切换状态（启用/停用） */
    void toggleStatus(Long id);

    /** 删除词条 */
    void deleteWord(Long id);

    /** 批量导入词条 */
    WordLibraryImportResult batchImport(List<WordLibraryRequest> requests);
}
