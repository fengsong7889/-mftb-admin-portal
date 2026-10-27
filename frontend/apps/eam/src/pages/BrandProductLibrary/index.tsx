import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Tabs, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { TabPane } = Tabs;

interface Brand {
  id: number;
  brandName: string;
  bizType: string;
  unit: string;
  spec: string;
  sortOrder: number;
}

const BrandProductLibrary: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form] = Form.useForm();

  // 加载品牌数据
  const loadBrands = async (bizType?: string) => {
    setLoading(true);
    try {
      const url = bizType && bizType !== 'ALL' 
        ? `/api/eam/brand/listByType?bizType=${bizType}`
        : '/api/eam/brand/list';
      const response = await fetch(url);
      const data = await response.json();
      setBrands(data);
    } catch (error) {
      message.error('加载品牌失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrands(activeTab);
  }, [activeTab]);

  // 表格列定义
  const columns: ColumnsType<Brand> = [
    {
      title: '品牌名称',
      dataIndex: 'brandName',
      key: 'brandName',
    },
    {
      title: '业务类型',
      dataIndex: 'bizType',
      key: 'bizType',
      render: (text: string) => text === 'ASSET' ? '资产' : '耗材',
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
    },
    {
      title: '规格型号',
      dataIndex: 'spec',
      key: 'spec',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <>
          <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" danger onClick={() => handleDelete(record.id)}>删除</Button>
        </>
      ),
    },
  ];

  // 编辑品牌
  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    form.setFieldsValue(brand);
    setModalVisible(true);
  };

  // 删除品牌
  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/eam/brand/delete?id=${id}`, { method: 'POST' });
      message.success('删除成功');
      loadBrands(activeTab);
    } catch (error) {
      message.error('删除失败');
    }
  };

  // 保存品牌
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const url = editingBrand ? '/api/eam/brand/update' : '/api/eam/brand/add';
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, bizType: activeTab === 'ALL' ? 'ASSET' : activeTab }),
      });
      message.success('保存成功');
      setModalVisible(false);
      form.resetFields();
      loadBrands(activeTab);
    } catch (error) {
      message.error('保存失败');
    }
  };

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="全部" key="ALL" />
        <TabPane tab="资产" key="ASSET" />
        <TabPane tab="耗材" key="CONSUMABLE" />
      </Tabs>

      <Button type="primary" onClick={() => { setEditingBrand(null); form.resetFields(); setModalVisible(true); }}>
        新增品牌
      </Button>

      <Table
        columns={columns}
        dataSource={brands}
        loading={loading}
        rowKey="id"
        style={{ marginTop: 16 }}
      />

      <Modal
        title={editingBrand ? '编辑品牌' : '新增品牌'}
        visible={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="brandName" label="品牌名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="unit" label="单位">
            <Input />
          </Form.Item>
          <Form.Item name="spec" label="规格型号">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BrandProductLibrary;
