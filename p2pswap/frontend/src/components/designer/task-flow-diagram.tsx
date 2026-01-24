"use client"

import { useMemo, useEffect, useRef, useState, useCallback } from "react"
import type { Task } from "@/lib/utils/task-manager"
import { formatAddress } from "@/lib/utils/format-address"
import { AddressDialog } from "@/components/ui/address-display"
import { TaskChainReviewDialog } from "@/components/task/task-chain-review-dialog"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { roundToCent, roundToDynamic, getDecimalPlaces } from "@/lib/utils/strategy-utils"

interface TaskFlowDiagramProps {
  tasks: Task[] // 任务链中的所有任务
  chainId: number
  onReviewApproved?: (chainRootTaskId: string) => void // 审核通过回调
}

interface AddressInfo {
  address: string
  addressIndex?: number | null
  feeIndex?: number | null // 手续费地址的序号（从1开始）
}

/**
 * 任务链逻辑流向图组件（使用 Mermaid）
 * 根据任务链绘制：源地址 -> Deposit Vault -> 中间地址B/C -> 隐私池 -> 最终目标地址
 * 支持点击节点框查看完整地址
 */
export function TaskFlowDiagram({ tasks, chainId, onReviewApproved }: TaskFlowDiagramProps) {
  const mermaidRef = useRef<HTMLDivElement>(null)
  const [mermaidLoaded, setMermaidLoaded] = useState(false)
  const [mermaidInstance, setMermaidInstance] = useState<any>(null)
  const isMountedRef = useRef(false)
  const [selectedAddress, setSelectedAddress] = useState<AddressInfo | null>(null)
  const addressMapRef = useRef<Map<string, AddressInfo>>(new Map())
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [isApproved, setIsApproved] = useState(false)

  // 获取根任务ID（用于审核状态管理）
  const rootTaskId = useMemo(() => {
    const rootTask = tasks.find(t => t.type === "deposit" && !t.relatedTaskId) || tasks[0]
    return rootTask?.id || ""
  }, [tasks])

  // 检查审核状态
  useEffect(() => {
    if (!rootTaskId) return
    const checkApproval = async () => {
      try {
        const { taskChainReviewsAPI } = await import('@/lib/api/client')
        const approved = await taskChainReviewsAPI.isApproved(rootTaskId)
        // 检查组件是否仍然挂载
        if (isMountedRef.current) {
          setIsApproved(approved)
        }
      } catch (error) {
        console.error('检查审核状态失败:', error)
        if (isMountedRef.current) {
          setIsApproved(false)
        }
      }
    }
    checkApproval()
  }, [rootTaskId])

  // 处理审核通过
  const handleReviewApproved = async (chainRootTaskId: string) => {
    try {
      const { taskChainReviewsAPI } = await import('@/lib/api/client')
      await taskChainReviewsAPI.approve(chainRootTaskId, chainId)
      setIsApproved(true)
      if (onReviewApproved) {
        onReviewApproved(chainRootTaskId)
      }
    } catch (error) {
      console.error('保存审核状态失败:', error)
    }
  }

  // 动态加载 Mermaid（仅在客户端）
  useEffect(() => {
    if (typeof window === 'undefined' || mermaidLoaded) return
    
    const loadMermaid = async () => {
      try {
        const mermaidModule = await import('mermaid')
        const instance = mermaidModule.default
        
        // 初始化 Mermaid
        instance.initialize({ 
          startOnLoad: false, // 手动控制渲染
          theme: 'dark',
          flowchart: {
            useMaxWidth: false, // 允许超出宽度
            htmlLabels: true,
            curve: 'basis',
            nodeSpacing: 80, // 节点间距
            rankSpacing: 100 // 层级间距
          },
          // 设置字体大小
          themeVariables: {
            fontSize: '10px',
            fontFamily: 'monospace'
          }
        })
        
        setMermaidInstance(instance)
        setMermaidLoaded(true)
      } catch (error) {
        console.error('Mermaid 加载失败:', error)
      }
    }
    
    loadMermaid()
  }, [mermaidLoaded])

  // 加载手续费接收地址
  const [feeRecipientAddresses, setFeeRecipientAddresses] = useState<string[]>([])
  useEffect(() => {
    const loadFeeRecipients = async () => {
      try {
        const { getKeyManagerClient, chainIdToKeyManagerChain } = await import('@/lib/services/keymanager-client')
        const keyManagerClient = getKeyManagerClient()
        const chain = chainIdToKeyManagerChain(chainId)
        if (!chain) {
          return
        }
        
        // 从索引19050118开始，获取10个地址
        const startIndex = 19050118
        const count = 10
        const addresses = await keyManagerClient.exportBatch(chain, startIndex, count)
        const addressList = addresses.map(addr => addr.address.trim().toLowerCase())
        // 检查组件是否仍然挂载
        if (isMountedRef.current) {
          setFeeRecipientAddresses(addressList)
        }
      } catch (error) {
        console.error('加载手续费接收地址失败:', error)
      }
    }
    loadFeeRecipients()
  }, [chainId])

  // 检查地址是否是手续费地址的辅助函数
  const isFeeRecipient = useCallback((addr: string): boolean => {
    if (!feeRecipientAddresses || feeRecipientAddresses.length === 0) return false
    return feeRecipientAddresses.includes(addr.toLowerCase().trim())
  }, [feeRecipientAddresses])

  // 分析任务链，构建 Mermaid 图表语法和地址映射
  const { mermaidCode, addressMap } = useMemo(() => {
    if (tasks.length === 0) return { mermaidCode: null, addressMap: new Map<string, AddressInfo>() }

    // 找到根任务（deposit 任务，没有 relatedTaskId）
    const rootTask = tasks.find(t => t.type === "deposit" && !t.relatedTaskId) || tasks[0]
    if (!rootTask) return { mermaidCode: null, addressMap: new Map<string, AddressInfo>() }

    // 找到所有 claim 任务（从 Deposit Vault 提取）
    const claimTasks = tasks.filter(t => t.type === "claim" && t.relatedTaskId === rootTask.id)
    
    // 找到所有 enclave_deposit 任务（存入隐私池）
    const enclaveDepositTasks = claimTasks.map(claimTask => 
      tasks.find(t => t.type === "enclave_deposit" && t.relatedTaskId === claimTask.id)
    ).filter(Boolean) as Task[]
    
    // 找到所有最终目标地址
    // 注意：同一个地址可能在多个 enclave_deposit 任务中出现（对应不同的中间地址）
    // 但在流程图中，每个中间地址的隐私池是独立的，所以同一个地址可以在多个隐私池中出现
    // 但是如果同一个地址在同一个 enclave_deposit 任务的 intendedRecipients 中出现多次，需要累加金额
    const finalTargets = enclaveDepositTasks.flatMap(depositTask => {
      // 从 intendedRecipients 获取最终目标地址
      if (depositTask.intendedRecipients && depositTask.intendedRecipients.length > 0) {
        // 按地址分组并累加金额（同一个地址在同一个任务中可能出现多次）
        const addressMap = new Map<string, { address: string; amount: number; addressIndex?: number | null }>()
        
        depositTask.intendedRecipients.forEach(recipient => {
          const addr = (recipient.address || recipient.recipient || "").toLowerCase().trim()
          if (!addr) return
          
          // 确保金额是数字类型，如果是字符串则转换
          let amount = recipient.amount || 0
          if (typeof amount === 'string') {
            amount = parseFloat(amount) || 0
          }
          // 精确到0.01 USDT
          amount = roundToCent(amount)
          
          const existing = addressMap.get(addr)
          if (existing) {
            // 累加金额
            existing.amount = roundToCent(existing.amount + amount)
            // 如果新地址有 feeIndex 但旧地址没有，更新 feeIndex
            if (recipient.feeIndex !== undefined && existing.feeIndex === undefined) {
              existing.feeIndex = recipient.feeIndex
            }
          } else {
            addressMap.set(addr, {
              address: recipient.address || recipient.recipient || "",
              amount,
              addressIndex: recipient.addressIndex,
              feeIndex: recipient.feeIndex
            })
          }
        })
        
        // 转换为数组
        return Array.from(addressMap.values()).map(item => ({
          ...item,
          fromIntermediate: depositTask.sourceAddress
        }))
      }
      // 如果没有 intendedRecipients，从 enclave_withdraw 任务中查找
      return tasks
        .filter(t => t.type === "enclave_withdraw" && t.relatedTaskId === depositTask.id)
        .map(t => {
          // 确保金额是数字类型，精确到0.01 USDT
          let amount = t.amount || 0
          if (typeof amount === 'string') {
            amount = parseFloat(amount) || 0
          }
          amount = roundToCent(amount)
          
          return {
            address: t.targetAddress,
            amount,
            fromIntermediate: depositTask.sourceAddress,
            addressIndex: undefined
          }
        })
    })

    // 构建地址映射（用于点击事件）
    const addrMap = new Map<string, AddressInfo>()
    
    // 获取地址池服务以查找地址索引
    let addressPool: any = null
    try {
      const { getAddressPoolService } = require('@/lib/services/address-pool.service')
      addressPool = getAddressPoolService(chainId)
    } catch (e) {
      // 忽略错误
    }

    // 源地址
    const sourceAddr = formatAddress(rootTask.sourceAddress)
    let sourceIndex: number | null = null
    if (addressPool) {
      const allAddresses = addressPool.getAllAddresses()
      const idx = allAddresses.findIndex((a: any) => 
        a.address.toLowerCase().trim() === rootTask.sourceAddress.toLowerCase().trim()
      )
      sourceIndex = idx >= 0 ? idx + 1 : null
    }
    addrMap.set('A', { address: rootTask.sourceAddress, addressIndex: sourceIndex })

    // 按中间地址分组并累加金额
    const intermediateAddressMap = new Map<string, { address: string; totalAmount: number; addressIndex: number | null }>()
    claimTasks.forEach((claimTask) => {
      const addr = claimTask.sourceAddress.toLowerCase().trim()
      const existing = intermediateAddressMap.get(addr)
      if (existing) {
        // 累加金额
        existing.totalAmount += claimTask.amount || 0
      } else {
        // 新地址
        let addrIndex: number | null = null
        if (addressPool) {
          const allAddresses = addressPool.getAllAddresses()
          const idx = allAddresses.findIndex((a: any) => 
            a.address.toLowerCase().trim() === addr
          )
          addrIndex = idx >= 0 ? idx + 1 : null
        }
        intermediateAddressMap.set(addr, {
          address: claimTask.sourceAddress,
          totalAmount: claimTask.amount || 0,
          addressIndex: addrIndex
        })
      }
    })

    // 转换为数组并按地址排序（保持一致性）
    const intermediateAddresses = Array.from(intermediateAddressMap.entries()).map(([_, info]) => info)
    
    // 为每个中间地址分配标签（B, C, D...）
    intermediateAddresses.forEach((info, idx) => {
      const label = String.fromCharCode(66 + idx) // B, C, D, ...
      addrMap.set(label, { address: info.address, addressIndex: info.addressIndex })
    })

    // 最终目标地址（按中间地址分组）
    // 注意：每个中间地址对应一个独立的隐私池，所以同一个最终目标地址可以在多个隐私池中出现
    const targetsByIntermediate = intermediateAddresses.map(intermediate => {
      const targets = finalTargets.filter(t => t.fromIntermediate.toLowerCase().trim() === intermediate.address.toLowerCase().trim())
      
      // 验证：该隐私池的输出总金额应该等于输入金额（使用动态小数位数）
      // 对于高风险地址，输出 = allocatableAmount + fee = totalAmount
      // 对于普通地址，输出 = totalAmount（没有手续费）
      const intermediateDecimalPlaces = getDecimalPlaces(intermediate.totalAmount || 0)
      const roundIntermediateAmount = (amt: number) => roundToDynamic(amt)
      const intermediateTolerance = Math.pow(10, -intermediateDecimalPlaces)
      
      const outputTotal = roundIntermediateAmount(targets.reduce((sum, t) => sum + (t.amount || 0), 0))
      const inputTotal = roundIntermediateAmount(intermediate.totalAmount || 0)
      
      // 如果金额不匹配，记录警告并尝试修复（使用动态容差）
      if (Math.abs(outputTotal - inputTotal) > intermediateTolerance) {
        console.warn(`[流程图] 中间地址 ${intermediate.address} 的隐私池金额不匹配: 输入 ${inputTotal.toFixed(intermediateDecimalPlaces)} USDT, 输出 ${outputTotal.toFixed(intermediateDecimalPlaces)} USDT`)
        
        // 如果输出小于输入，可能是缺少了某些目标地址，或者金额计算有误
        // 如果输出大于输入，可能是重复计算了某些地址
        // 这里我们不做自动修复，只记录警告，让用户检查数据
      }
      
      return {
        intermediate: intermediate.address,
        targets
      }
    })
    
    // 计算所有存入隐私池的总金额（用于计算合约手续费）
    // 确定动态小数位数（根据所有中间地址金额的最大值）
    const maxIntermediateAmount = Math.max(...intermediateAddresses.map(info => info.totalAmount || 0), rootTask.amount || 0)
    const contractFeeDecimalPlaces = getDecimalPlaces(maxIntermediateAmount)
    const roundContractFeeAmount = (amt: number) => roundToDynamic(amt)
    
    const totalDepositAmount = roundContractFeeAmount(intermediateAddresses.reduce((sum, info) => sum + (info.totalAmount || 0), 0))
    const contractFee = roundContractFeeAmount(totalDepositAmount * 0.01) // 合约手续费 = 所有存入隐私池金额的 1%
    
    // 构建 Mermaid 流程图（从左到右排列）
    const lines: string[] = []
    lines.push("flowchart LR")
    
    // 源地址 A
    const sourceDecimalPlaces = getDecimalPlaces(rootTask.amount || 0)
    const addrA = formatAddress(rootTask.sourceAddress)
    const amountA = (rootTask.amount || 0).toFixed(sourceDecimalPlaces) // 使用动态小数位数
    lines.push(`    A["${addrA}<br/>${amountA} USDT"]`)
    
    // Deposit Vault
    lines.push(`    Vault["Deposit Vault"]`)
    lines.push(`    A --> Vault`)
    
    // 中间地址（累加后的金额）
    intermediateAddresses.forEach((info, idx) => {
      const addr = formatAddress(info.address)
      // 确定中间地址金额的小数位数
      const intermediateDecimalPlaces = getDecimalPlaces(info.totalAmount || 0)
      const amount = (info.totalAmount || 0).toFixed(intermediateDecimalPlaces) // 使用动态小数位数
      const label = String.fromCharCode(66 + idx) // B, C, D, ...
      lines.push(`    ${label}["${addr}<br/>${amount} USDT"]`)
      lines.push(`    Vault --> ${label}`)
    })
    
    // 隐私池（每个中间地址对应一个）
    intermediateAddresses.forEach((_, idx) => {
      const label = String.fromCharCode(66 + idx) // B, C, D, ...
      const poolLabel = `Pool${label}`
      lines.push(`    ${poolLabel}["隐私池"]`)
      lines.push(`    ${label} --> ${poolLabel}`)
    })
    
    // 最终目标地址（按中间地址分组，每个中间地址的目标地址按顺序编号）
    // 同时建立地址映射和记录标签用于后续样式应用
    let finalLabelIndex = 68 // D 的 ASCII 码
    const finalTargetLabelMap = new Map<string, string>() // 记录地址到标签的映射
    
    targetsByIntermediate.forEach((group, groupIdx) => {
      const intermediateLabel = String.fromCharCode(66 + groupIdx) // B, C, D, ...
      const poolLabel = `Pool${intermediateLabel}`
      
      // 计算该隐私池的输出总金额（用于验证）
      const poolIntermediateDecimalPlaces = getDecimalPlaces(intermediateAddresses[groupIdx]?.totalAmount || 0)
      const roundPoolAmount = (amt: number) => roundToDynamic(amt)
      const poolTolerance = Math.pow(10, -poolIntermediateDecimalPlaces)
      
      const poolOutputTotal = roundPoolAmount(group.targets.reduce((sum, target) => sum + (target.amount || 0), 0))
      const intermediateInput = roundPoolAmount(intermediateAddresses[groupIdx]?.totalAmount || 0)
      
      // 验证：隐私池的输出应该等于输入（使用动态小数位数）
      // 注意：对于高风险地址，输出 = allocatableAmount + fee = totalAmount（应该等于输入）
      // 对于普通地址，输出 = totalAmount（应该等于输入）
      if (Math.abs(poolOutputTotal - intermediateInput) > poolTolerance) {
        console.warn(`[流程图] 隐私池 ${poolLabel} 金额不匹配: 输入 ${intermediateInput.toFixed(poolIntermediateDecimalPlaces)} USDT, 输出 ${poolOutputTotal.toFixed(poolIntermediateDecimalPlaces)} USDT, 差异 ${(intermediateInput - poolOutputTotal).toFixed(poolIntermediateDecimalPlaces)} USDT`)
        console.warn(`[流程图] 目标地址详情:`, group.targets.map(t => ({ address: t.address, amount: t.amount })))
      }
      
      group.targets.forEach((target) => {
        const addr = formatAddress(target.address)
        const amount = (target.amount || 0).toFixed(2) // 精确到0.01 USDT
        const finalLabel = String.fromCharCode(finalLabelIndex++) // D, E, F, G, ...
        
        // 记录地址到标签的映射（如果同一个地址在多个隐私池中出现，使用第一个标签）
        if (!finalTargetLabelMap.has(target.address.toLowerCase().trim())) {
          finalTargetLabelMap.set(target.address.toLowerCase().trim(), finalLabel)
        }
        
        // 建立地址映射
        let addrIndex: number | null = target.addressIndex || null
        if (!addrIndex && addressPool) {
          const allAddresses = addressPool.getAllAddresses()
          const idx = allAddresses.findIndex((a: any) => 
            a.address.toLowerCase().trim() === target.address.toLowerCase().trim()
          )
          addrIndex = idx >= 0 ? idx + 1 : null
        }
        // 获取手续费地址序号
        const feeIndex = (target as any).feeIndex || null
        addrMap.set(finalLabel, { address: target.address, addressIndex: addrIndex, feeIndex })
        
        // 如果是手续费地址，添加标识和序号
        let feeLabel = ''
        if (isFeeRecipient(target.address)) {
          const feeIndex = (target as any).feeIndex
          if (feeIndex !== undefined && feeIndex !== null) {
            feeLabel = `<br/>[手续费 #${feeIndex}]`
          } else {
            // 如果没有保存序号，尝试从手续费地址列表中查找
            const addrLower = target.address.toLowerCase().trim()
            const index = feeRecipientAddresses.findIndex(a => a.toLowerCase().trim() === addrLower)
            if (index >= 0) {
              feeLabel = `<br/>[手续费 #${index + 1}]`
            } else {
              feeLabel = '<br/>[手续费]'
            }
          }
        }
        lines.push(`    ${finalLabel}["${addr}${feeLabel}<br/>${amount} USDT"]`)
        lines.push(`    ${poolLabel} --> ${finalLabel}`)
      })
    })
    
    // 合约手续费节点（从所有隐私池连接到合约手续费）
    // 注意：合约手续费是系统自动扣除的，不显示具体地址
    if (contractFee > 0.01) {
      const contractFeeLabel = "ContractFee"
      lines.push(`    ${contractFeeLabel}["合约手续费<br/>${contractFee.toFixed(contractFeeDecimalPlaces)} USDT"]`)
      // 从所有隐私池连接到合约手续费
      intermediateAddresses.forEach((_, idx) => {
        const label = String.fromCharCode(66 + idx) // B, C, D, ...
        const poolLabel = `Pool${label}`
        lines.push(`    ${poolLabel} -.-> ${contractFeeLabel}`) // 使用虚线表示系统自动扣除
      })
    }
    
    // 样式（文字更小，圆角通过渲染后修改 SVG 实现）
    lines.push(`    classDef sourceAddr fill:#1a1a1a,stroke:#E5F240,stroke-width:2px,color:#E5F240`)
    lines.push(`    classDef vault fill:#E5F240,stroke:#E5F240,stroke-width:2px,color:#000`)
    lines.push(`    classDef intermediate fill:#1a1a1a,stroke:#60a5fa,stroke-width:2px,color:#60a5fa`)
    lines.push(`    classDef pool fill:#fbbf24,stroke:#fbbf24,stroke-width:2px,color:#000`)
    lines.push(`    classDef target fill:#1a1a1a,stroke:#a78bfa,stroke-width:2px,color:#a78bfa`)
    lines.push(`    classDef feeTarget fill:#1a1a1a,stroke:#fbbf24,stroke-width:2px,color:#fbbf24`) // 手续费地址样式（黄色边框）
    lines.push(`    classDef contractFee fill:#1a1a1a,stroke:#ff6b6b,stroke-width:2px,color:#ff6b6b`) // 合约手续费样式（红色边框）
    lines.push(`    class A sourceAddr`)
    lines.push(`    class Vault vault`)
    intermediateAddresses.forEach((_, idx) => {
      const label = String.fromCharCode(66 + idx) // B, C, D, ...
      lines.push(`    class ${label} intermediate`)
      lines.push(`    class Pool${label} pool`)
    })
    // 为最终目标地址应用样式（使用之前记录的标签映射）
    targetsByIntermediate.forEach((group) => {
      group.targets.forEach((target) => {
        const finalLabel = finalTargetLabelMap.get(target.address.toLowerCase().trim())
        if (finalLabel) {
          // 如果是手续费地址，使用特殊样式
          if (isFeeRecipient(target.address)) {
            lines.push(`    class ${finalLabel} feeTarget`)
          } else {
            lines.push(`    class ${finalLabel} target`)
          }
        }
      })
    })
    
    // 为合约手续费节点应用样式
    if (contractFee > 0.01) {
      lines.push(`    class ContractFee contractFee`)
    }
    
    return { 
      mermaidCode: lines.join('\n'),
      addressMap: addrMap
    }
  }, [tasks, chainId, isFeeRecipient])

  // 渲染 Mermaid 图表并添加点击事件
  useEffect(() => {
    if (!mermaidCode || !mermaidRef.current || !mermaidLoaded || !mermaidInstance) return
    
    isMountedRef.current = true
    addressMapRef.current = addressMap

    const renderMermaid = async () => {
      // 检查组件是否仍然挂载
      if (!isMountedRef.current || !mermaidRef.current || !mermaidInstance) return
      
      try {
        // 清空容器
        mermaidRef.current.innerHTML = ''
        
        // 生成新的唯一 ID
        const currentId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        // 渲染图表
        const { svg } = await mermaidInstance.render(currentId, mermaidCode)
        
        // 再次检查组件是否仍然挂载
        if (isMountedRef.current && mermaidRef.current) {
          mermaidRef.current.innerHTML = svg
          
          // 为地址节点添加点击事件和圆角样式
          const svgElement = mermaidRef.current.querySelector('svg')
          if (svgElement) {
            // 查找所有节点（g.node 元素）
            const nodeGroups = svgElement.querySelectorAll('g.node')
            nodeGroups.forEach((nodeGroup) => {
              const nodeId = nodeGroup.getAttribute('id')
              if (!nodeId) return
              
              // 提取节点标签
              let nodeLabel: string | null = null
              const labelMatch1 = nodeId.match(/(?:flowchart-|node-)([A-Z])/)
              if (labelMatch1) {
                nodeLabel = labelMatch1[1]
              } else {
                // 从文本内容中查找
                const textElement = nodeGroup.querySelector('text')
                if (textElement) {
                  const textContent = textElement.textContent || ''
                  if (textContent.includes('0x')) {
                    for (const [label, info] of addressMapRef.current.entries()) {
                      if (textContent.includes(formatAddress(info.address).substring(0, 6))) {
                        nodeLabel = label
                        break
                      }
                    }
                  }
                }
              }
              
              if (nodeLabel && addressMapRef.current.has(nodeLabel)) {
                const addressInfo = addressMapRef.current.get(nodeLabel)!
                
                // 检查地址是否在地址池中（通过 addressIndex 判断），如果是则添加圆角
                if (addressInfo.addressIndex !== null && addressInfo.addressIndex !== undefined) {
                  const rectElement = nodeGroup.querySelector('rect')
                  if (rectElement) {
                    rectElement.setAttribute('rx', '8')
                    rectElement.setAttribute('ry', '8')
                  }
                }
                
                // 为整个节点组添加点击事件和样式
                nodeGroup.style.cursor = 'pointer'
                const clickHandler = () => {
                  setSelectedAddress(addressInfo)
                }
                nodeGroup.addEventListener('click', clickHandler)
                
                // 添加 hover 效果
                nodeGroup.addEventListener('mouseenter', () => {
                  nodeGroup.style.opacity = '0.8'
                })
                nodeGroup.addEventListener('mouseleave', () => {
                  nodeGroup.style.opacity = '1'
                })
              }
            })
          }
        }
      } catch (error) {
        console.error('Mermaid 渲染失败:', error)
        if (isMountedRef.current && mermaidRef.current) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          mermaidRef.current.innerHTML = `<div class="text-red-500 p-4 text-sm">图表渲染失败: ${errorMsg}</div>`
        }
      }
    }

    renderMermaid()
    
    // 清理函数
    return () => {
      isMountedRef.current = false
    }
  }, [mermaidCode, mermaidLoaded, mermaidInstance, addressMap])

  if (!mermaidCode) {
    return (
      <div className="p-4 bg-black-2 rounded-lg border border-black-4 text-center text-gray-400 text-xs">
        无法生成流向图：任务链数据不完整
      </div>
    )
  }

  if (!mermaidLoaded) {
    return (
      <div className="p-4 bg-black-2 rounded-lg border border-black-4 text-center text-gray-400 text-xs">
        正在加载图表库...
      </div>
    )
  }

  return (
    <>
      <div className="p-4 bg-black-2 rounded-lg border border-black-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-white">任务链逻辑流向图</div>
          <div className="flex items-center gap-2">
            {isApproved && (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>已审核</span>
              </div>
            )}
            <button
              onClick={() => setReviewDialogOpen(true)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                isApproved
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-primary text-black hover:bg-primary/80"
              }`}
            >
              {isApproved ? "重新审核" : "审核"}
            </button>
          </div>
        </div>
        <div ref={mermaidRef} className="flex justify-center overflow-x-auto"></div>
        <style jsx global>{`
          .mermaid svg {
            font-size: 10px !important;
          }
          .mermaid .nodeLabel {
            font-size: 10px !important;
          }
          .mermaid .node rect,
          .mermaid .node circle,
          .mermaid .node ellipse,
          .mermaid .node polygon {
            font-size: 10px !important;
          }
        `}</style>
      </div>
      
      {/* 地址弹窗 - 使用 AddressDisplay 组件中的弹窗 */}
      {selectedAddress && (
        <AddressDialog
          isOpen={true}
          onClose={() => setSelectedAddress(null)}
          address={selectedAddress.address}
          addressIndex={selectedAddress.addressIndex}
          isFeeRecipient={isFeeRecipient(selectedAddress.address)}
          feeIndex={selectedAddress.feeIndex}
        />
      )}

      {/* 审核弹窗 */}
      {reviewDialogOpen && (
        <TaskChainReviewDialog
          isOpen={reviewDialogOpen}
          onClose={() => setReviewDialogOpen(false)}
          tasks={tasks}
          chainId={chainId}
          onApprove={handleReviewApproved}
        />
      )}
    </>
  )
}
