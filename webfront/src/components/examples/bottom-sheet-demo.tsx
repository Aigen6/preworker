'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import BottomSheet from '@/components/ui/bottom-sheet'
import { useBottomSheet } from '@/hooks/use-bottom-sheet'
import { useBottomSheetContext } from '@/components/providers/bottom-sheet-provider'

// 示例数据接口
interface UserData {
  id: string
  name: string
  email: string
  avatar?: string
  role: string
  status: 'active' | 'inactive'
}

interface ProductData {
  id: string
  name: string
  price: number
  category: string
  inStock: boolean
}

// 用户详情组件
const UserDetailSheet: React.FC<{ data: UserData }> = ({ data }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState(data)

  const handleSave = () => {
    console.log('保存用户数据:', formData)
    setIsEditing(false)
  }

  const handleReset = () => {
    setFormData(data)
    setIsEditing(false)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-blue-500 rounded-[20%] flex items-center justify-center text-white font-semibold">
          {data.name.charAt(0)}
        </div>
        <div>
          <h3 className="font-semibold text-lg">{data.name}</h3>
          <p className="text-gray-600">{data.email}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
          {isEditing ? (
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="text-gray-900">{data.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          {isEditing ? (
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="text-gray-900">{data.email}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
          <p className="text-gray-900">{data.role}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
          <Badge variant={data.status === 'active' ? 'default' : 'secondary'}>
            {data.status === 'active' ? '活跃' : '非活跃'}
          </Badge>
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        {isEditing ? (
          <>
            <Button onClick={handleSave} className="flex-1">
              保存
            </Button>
            <Button onClick={handleReset} variant="outline" className="flex-1">
              取消
            </Button>
          </>
        ) : (
          <Button onClick={() => setIsEditing(true)} className="flex-1">
            编辑
          </Button>
        )}
      </div>
    </div>
  )
}

// 产品详情组件
const ProductDetailSheet: React.FC<{ data: ProductData }> = ({ data }) => {
  const [quantity, setQuantity] = useState(1)

  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <div className="w-20 h-20 bg-gray-200 rounded-lg mx-auto mb-3 flex items-center justify-center">
          <span className="text-2xl">📦</span>
        </div>
        <h3 className="font-semibold text-lg">{data.name}</h3>
        <p className="text-gray-600">{data.category}</p>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-600">价格</span>
          <span className="font-semibold text-lg">¥{data.price}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">库存状态</span>
          <Badge variant={data.inStock ? 'default' : 'destructive'}>
            {data.inStock ? '有库存' : '缺货'}
          </Badge>
        </div>

        {data.inStock && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">数量</label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                -
              </Button>
              <span className="w-12 text-center">{quantity}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 space-y-2">
        <Button className="w-full" disabled={!data.inStock}>
          加入购物车
        </Button>
        <Button variant="outline" className="w-full">
          收藏
        </Button>
      </div>
    </div>
  )
}

// 自定义表单组件
const CustomFormSheet: React.FC<{ data: any; onDataChange: (data: any) => void }> = ({ 
  data, 
  onDataChange 
}) => {
  const [formData, setFormData] = useState(data || {
    title: '',
    description: '',
    priority: 'medium',
    tags: []
  })

  const handleSubmit = () => {
    onDataChange(formData)
    console.log('表单数据已更新:', formData)
  }

  const handleReset = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      tags: []
    })
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="输入标题"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="输入描述"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
        <select
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      </div>

      <div className="flex gap-2 pt-4">
        <Button onClick={handleSubmit} className="flex-1">
          保存
        </Button>
        <Button onClick={handleReset} variant="outline" className="flex-1">
          重置
        </Button>
      </div>
    </div>
  )
}

// 主演示组件
export const BottomSheetDemo: React.FC = () => {
  // Hook 方式使用
  const userSheet = useBottomSheet({
    onDataChange: (data) => console.log('用户数据变化:', data),
    onReset: () => console.log('用户数据已重置')
  })

  const productSheet = useBottomSheet({
    onDataChange: (data) => console.log('产品数据变化:', data)
  })

  const formSheet = useBottomSheet({
    onDataChange: (data) => console.log('表单数据变化:', data)
  })

  // Context 方式使用
  const { openBottomSheet } = useBottomSheetContext()

  // 示例数据
  const userData: UserData = {
    id: '1',
    name: '张三',
    email: 'zhangsan@example.com',
    role: '管理员',
    status: 'active'
  }

  const productData: ProductData = {
    id: '1',
    name: 'iPhone 15 Pro',
    price: 7999,
    category: '手机',
    inStock: true
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>底部弹出组件演示</CardTitle>
          <CardDescription>
            展示不同使用方式和功能的底部弹出组件
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Hook 方式演示 */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Hook 方式使用</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button 
                onClick={() => userSheet.open(userData)}
                className="w-full"
              >
                打开用户详情
              </Button>
              
              <Button 
                onClick={() => productSheet.open(productData)}
                variant="outline"
                className="w-full"
              >
                打开产品详情
              </Button>
              
              <Button 
                onClick={() => formSheet.open({})}
                variant="secondary"
                className="w-full"
              >
                打开自定义表单
              </Button>
            </div>
          </div>

          {/* Context 方式演示 */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Context 方式使用</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button 
                onClick={() => openBottomSheet({
                  title: '设置',
                  height: 'md',
                  children: (
                    <div className="p-4">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            主题模式
                          </label>
                          <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                            <option>浅色</option>
                            <option>深色</option>
                            <option>自动</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            语言
                          </label>
                          <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                            <option>中文</option>
                            <option>English</option>
                          </select>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">推送通知</span>
                          <input type="checkbox" defaultChecked />
                        </div>
                      </div>
                    </div>
                  ),
                  showResetButton: true,
                  resetButtonText: '恢复默认'
                })}
                className="w-full"
              >
                打开设置面板
              </Button>
              
              <Button 
                onClick={() => openBottomSheet({
                  title: '确认操作',
                  height: 'sm',
                  children: (
                    <div className="p-4 text-center">
                      <div className="w-16 h-16 bg-red-100 rounded-[20%] flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">⚠️</span>
                      </div>
                      <h3 className="font-semibold text-lg mb-2">确认删除</h3>
                      <p className="text-gray-600 mb-4">
                        此操作不可撤销，确定要删除这个项目吗？
                      </p>
                      <div className="flex gap-2">
                        <Button variant="destructive" className="flex-1">
                          删除
                        </Button>
                        <Button variant="outline" className="flex-1">
                          取消
                        </Button>
                      </div>
                    </div>
                  ),
                  showCloseButton: false
                })}
                variant="destructive"
                className="w-full"
              >
                打开确认对话框
              </Button>
            </div>
          </div>

          {/* 当前状态显示 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">当前状态</h4>
            <div className="space-y-1 text-sm text-gray-600">
              <p>用户数据: {userSheet.data ? JSON.stringify(userSheet.data, null, 2) : '无'}</p>
              <p>产品数据: {productSheet.data ? JSON.stringify(productSheet.data, null, 2) : '无'}</p>
              <p>表单数据: {formSheet.data ? JSON.stringify(formSheet.data, null, 2) : '无'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hook 方式的底部弹出组件 */}
      <BottomSheet
        isOpen={userSheet.isOpen}
        onClose={userSheet.close}
        onReset={userSheet.reset}
        title="用户详情"
        height="md"
        data={userSheet.data}
        onDataChange={userSheet.updateData}
        showResetButton={true}
        resetButtonText="重置数据"
      >
        {userSheet.data && <UserDetailSheet data={userSheet.data} />}
      </BottomSheet>

      <BottomSheet
        isOpen={productSheet.isOpen}
        onClose={productSheet.close}
        title="产品详情"
        height="lg"
        data={productSheet.data}
        onDataChange={productSheet.updateData}
      >
        {productSheet.data && <ProductDetailSheet data={productSheet.data} />}
      </BottomSheet>

      <BottomSheet
        isOpen={formSheet.isOpen}
        onClose={formSheet.close}
        onReset={formSheet.reset}
        title="自定义表单"
        height="md"
        data={formSheet.data}
        onDataChange={formSheet.updateData}
        showResetButton={true}
        resetButtonText="清空表单"
      >
        <CustomFormSheet 
          data={formSheet.data} 
          onDataChange={formSheet.updateData}
        />
      </BottomSheet>
    </div>
  )
}

export default BottomSheetDemo
