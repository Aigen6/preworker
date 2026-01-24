"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/components/providers/toast-provider"
import { AddressInput } from "@/components/ui/address-input"
import { InputDialog } from "@/components/ui/input-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { getAddressPoolService, type AddressPoolAddress } from "@/lib/services/address-pool.service"

interface AddressPoolManagerProps {
  chainId: number
  onPoolUpdate?: (count: number) => void
}

export function AddressPoolManager({ chainId, onPoolUpdate }: AddressPoolManagerProps) {
  const { showError, showWarning, showSuccess } = useToast()
  const [addressPool] = useState(() => getAddressPoolService(chainId))
  const [addresses, setAddresses] = useState<AddressPoolAddress[]>([])
  const [newAddress, setNewAddress] = useState("")
  const [newAddressLabel, setNewAddressLabel] = useState("")
  const [statistics, setStatistics] = useState<any>(null)
  const [showBulkImportDialog, setShowBulkImportDialog] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // 加载地址池
  useEffect(() => {
    loadAddresses()
    updateStatistics()
  }, [chainId])

  const loadAddresses = () => {
    const all = addressPool.getAllAddresses()
    setAddresses(all)
    onPoolUpdate?.(all.length)
  }

  const updateStatistics = () => {
    const stats = addressPool.getStatistics()
    setStatistics(stats)
  }

  // 添加地址
  const handleAddAddress = () => {
    if (!newAddress.trim()) {
      showWarning("请输入地址")
      return
    }

    try {
      addressPool.addAddress(newAddress, newAddressLabel)
      setNewAddress("")
      setNewAddressLabel("")
      loadAddresses()
      updateStatistics()
      showSuccess("地址已添加到地址池")
    } catch (error: any) {
      showError(error.message)
    }
  }

  // 批量导入地址
  const handleBulkImport = () => {
    setShowBulkImportDialog(true)
  }

  const handleConfirmBulkImport = (input: string) => {
    if (!input.trim()) {
      showWarning("请输入地址列表")
      return
    }

    const lines = input.split("\n").filter((line) => line.trim())
    const addressesToImport: Array<{ address: string; label?: string }> = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.includes(",")) {
        const [address, label] = trimmed.split(",").map((s) => s.trim())
        if (address) {
          addressesToImport.push({ address, label })
        }
      } else if (trimmed) {
        addressesToImport.push({ address: trimmed })
      }
    }

    if (addressesToImport.length === 0) {
      showWarning("没有有效的地址")
      return
    }

    try {
      addressPool.addAddresses(addressesToImport)
      loadAddresses()
      updateStatistics()
      showSuccess(`成功导入 ${addressesToImport.length} 个地址`)
      setShowBulkImportDialog(false)
    } catch (error: any) {
      showError(error.message)
    }
  }

  // 删除地址
  const handleDeleteAddress = (addressId: string) => {
    addressPool.removeAddress(addressId)
    loadAddresses()
    updateStatistics()
    showSuccess("地址已删除")
  }

  // 导出地址池
  const handleExport = () => {
    const data = addressPool.export()
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `address-pool-${chainId}-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
    showSuccess("地址池已导出")
  }

  // 导入地址池
  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = event.target?.result as string
          addressPool.import(data)
          loadAddresses()
          updateStatistics()
          showSuccess("地址池已导入")
        } catch (error: any) {
          showError(error.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // 清空地址池
  const handleClear = () => {
    setShowClearConfirm(true)
  }

  const handleConfirmClear = () => {
    addressPool.clear()
    loadAddresses()
    updateStatistics()
    showSuccess("地址池已清空")
    setShowClearConfirm(false)
  }

  return (
    <div className="bg-black-2 rounded-[12px] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-main text-lg font-medium">低风险地址池管理</h2>
          <p className="text-black-9 text-sm mt-1">
            管理 500-1000 个低风险地址，用于策略生成时的正常交易
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-black-3 text-white text-sm rounded-[8px] hover:bg-black-4 border border-black-4"
          >
            导出
          </button>
          <button
            onClick={handleImport}
            className="px-4 py-2 bg-black-3 text-white text-sm rounded-[8px] hover:bg-black-4 border border-black-4"
          >
            导入
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-red-500/20 text-red-500 text-sm rounded-[8px] hover:bg-red-500/30"
          >
            清空
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      {statistics && (
        <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-black-3 rounded-[8px]">
          <div>
            <div className="text-black-9 text-xs mb-1">总地址数</div>
            <div className="text-white text-lg font-medium">{statistics.total}</div>
          </div>
          <div>
            <div className="text-black-9 text-xs mb-1">激活地址</div>
            <div className="text-white text-lg font-medium">{statistics.active}</div>
          </div>
          <div>
            <div className="text-black-9 text-xs mb-1">平均使用次数</div>
            <div className="text-white text-lg font-medium">
              {statistics.averageUsage.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-black-9 text-xs mb-1">状态</div>
            <div
              className={`text-sm font-medium ${
                statistics.active >= 500 ? "text-green-500" : "text-yellow-500"
              }`}
            >
              {statistics.active >= 500 ? "✅ 充足" : "⚠️ 不足"}
            </div>
          </div>
        </div>
      )}

      {/* 添加地址表单 */}
      <div className="mb-4 p-4 bg-black-3 rounded-[8px]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-black-9 mb-2">地址</label>
            <AddressInput
              value={newAddress}
              onChange={setNewAddress}
              chainId={chainId}
              placeholder="输入低风险地址"
            />
          </div>
          <div>
            <label className="block text-sm text-black-9 mb-2">标签（可选）</label>
            <input
              type="text"
              value={newAddressLabel}
              onChange={(e) => setNewAddressLabel(e.target.value)}
              className="w-full p-3 bg-black-2 border border-black-4 rounded-[8px] text-white text-sm focus:outline-none focus:border-primary"
              placeholder="地址标签"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleAddAddress}
              className="w-full px-4 py-3 bg-primary text-black text-sm font-medium rounded-[8px] hover:opacity-80"
            >
              添加地址
            </button>
            <button
              onClick={handleBulkImport}
              className="w-full px-4 py-3 bg-black-4 text-white text-sm rounded-[8px] hover:bg-black-3"
            >
              批量导入
            </button>
          </div>
        </div>
      </div>

      {/* 地址列表 */}
      <div className="max-h-96 overflow-y-auto">
        {addresses.length === 0 ? (
          <div className="text-center py-8 text-black-9">
            <p>地址池为空</p>
            <p className="text-xs mt-2">请添加至少 500 个地址</p>
          </div>
        ) : (
          <div className="space-y-2">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="flex items-center justify-between p-3 bg-black-3 rounded-[8px]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-medium">
                      {addr.label || "未命名地址"}
                    </span>
                    <span className="text-black-9 text-xs">
                      (使用 {addr.usageCount || 0} 次)
                    </span>
                  </div>
                  <span className="text-black-9 text-xs font-mono">
                    {addr.address.slice(0, 10)}...{addr.address.slice(-8)}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteAddress(addr.id)}
                  className="px-3 py-1 bg-red-500/20 text-red-500 text-xs rounded-[6px] hover:bg-red-500/30"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 批量导入对话框 */}
      <InputDialog
        isOpen={showBulkImportDialog}
        title="批量导入地址"
        message="请输入地址列表（每行一个，格式：地址 或 地址,标签）"
        placeholder="0x1234...5678&#10;0xabcd...efgh,标签1&#10;0x9876...5432"
        multiline={true}
        confirmText="导入"
        cancelText="取消"
        onConfirm={handleConfirmBulkImport}
        onCancel={() => setShowBulkImportDialog(false)}
      />

      {/* 清空确认对话框 */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="清空地址池"
        message="确定要清空地址池吗？此操作不可恢复！"
        confirmText="确定清空"
        cancelText="取消"
        confirmButtonClass="bg-red-500 text-white hover:bg-red-600"
        onConfirm={handleConfirmClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  )
}
