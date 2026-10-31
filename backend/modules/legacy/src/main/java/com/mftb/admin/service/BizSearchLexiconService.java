package com.mftb.admin.service;

import com.mftb.admin.entity.BizSearchLexicon;

import java.util.List;

/** 搜索词库服务 */
public interface BizSearchLexiconService {

    List<BizSearchLexicon> list(Integer wordType, String brand, Integer status);

    long create(BizSearchLexicon entry);

    void update(Long id, BizSearchLexicon entry);

    void updateStatus(Long id, Integer status);

    void delete(Long id);
}
