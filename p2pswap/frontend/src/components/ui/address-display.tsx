'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { formatAddress } from '@/lib/utils/format-address';
import { getAddressPoolService } from '@/lib/services/address-pool.service';

interface AddressDisplayProps {
  address: string;
  className?: string;
  showFullOnClick?: boolean;
  chainId?: number; // 链ID，用于查找地址池中的编号
  showIndex?: boolean; // 是否显示编号（如果地址在地址池中）
  addressIndex?: number | null; // 直接传递的地址编号（如果已知）
  feeRecipientAddresses?: string[]; // 手续费接收地址列表（可选，如果不提供则自动加载）
  showFeeLabel?: boolean; // 是否显示手续费标识（默认true）
  feeIndex?: number | null; // 手续费地址的序号（从1开始）
}

// Address Dialog Component
export function AddressDialog({
  isOpen,
  onClose,
  address,
  addressIndex,
  isFeeRecipient = false,
  feeIndex,
}: {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  addressIndex?: number | null;
  isFeeRecipient?: boolean;
  feeIndex?: number | null; // 手续费地址的序号（从1开始）
}) {
  const [copied, setCopied] = useState(false);
  const addressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">完整地址</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500">地址:</p>
              <div className="flex items-center gap-2">
                {isFeeRecipient && (
                  <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-600 rounded border border-yellow-500/30 whitespace-nowrap">
                    {feeIndex !== null && feeIndex !== undefined ? `手续费地址 #${feeIndex}` : '手续费地址'}
                  </span>
                )}
                {addressIndex !== null && addressIndex !== undefined && (
                  <span className="text-lg font-semibold text-primary flex-shrink-0">#{addressIndex}</span>
                )}
              </div>
            </div>
            <div
              ref={addressRef}
              className="text-lg font-mono font-semibold text-gray-900 break-all"
            >
              <span className="break-all">{address}</span>
            </div>
          </div>

          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-black hover:opacity-90 transition-opacity"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>复制</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddressDisplay({
  address,
  className = '',
  showFullOnClick = true,
  chainId,
  showIndex = true,
  addressIndex: propAddressIndex, // 从 props 接收的地址编号
  feeRecipientAddresses: propFeeRecipientAddresses, // 从 props 接收的手续费地址列表
  showFeeLabel = true, // 默认显示手续费标识
  feeIndex: propFeeIndex, // 从 props 接收的手续费地址序号
}: AddressDisplayProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [addressIndex, setAddressIndex] = useState<number | null>(propAddressIndex ?? null);
  const [isFeeRecipient, setIsFeeRecipient] = useState(false);
  const [feeRecipientAddresses, setFeeRecipientAddresses] = useState<string[]>(propFeeRecipientAddresses || []);
  const isMountedRef = useRef(true);

  // 组件挂载时设置 isMounted 为 true，卸载时设置为 false
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 加载手续费接收地址（如果未通过props提供）
  useEffect(() => {
    if (propFeeRecipientAddresses) {
      if (isMountedRef.current) {
        setFeeRecipientAddresses(propFeeRecipientAddresses);
      }
      return;
    }
    
    if (showFeeLabel && chainId && address) {
      const loadFeeRecipients = async () => {
        try {
          const { getKeyManagerClient, chainIdToKeyManagerChain } = await import('@/lib/services/keymanager-client');
          const keyManagerClient = getKeyManagerClient();
          const chain = chainIdToKeyManagerChain(chainId);
          if (!chain) {
            return;
          }
          
          // 从索引19050118开始，获取10个地址
          const startIndex = 19050118;
          const count = 10;
          const addresses = await keyManagerClient.exportBatch(chain, startIndex, count);
          const addressList = addresses.map(addr => addr.address.trim().toLowerCase());
          // 检查组件是否仍然挂载
          if (isMountedRef.current) {
            setFeeRecipientAddresses(addressList);
          }
        } catch (error) {
          console.error('加载手续费接收地址失败:', error);
        }
      };
      loadFeeRecipients();
    }
  }, [chainId, address, showFeeLabel, propFeeRecipientAddresses]);

  // 检查是否是手续费地址
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    if (address && feeRecipientAddresses.length > 0) {
      const normalizedAddress = address.toLowerCase().trim();
      const isFee = feeRecipientAddresses.includes(normalizedAddress);
      setIsFeeRecipient(isFee);
    } else {
      setIsFeeRecipient(false);
    }
  }, [address, feeRecipientAddresses]);

  // 如果启用了显示编号且提供了 chainId，查找地址在地址池中的编号
  // 如果已经通过 props 传递了 addressIndex，则优先使用
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    if (propAddressIndex !== null && propAddressIndex !== undefined) {
      setAddressIndex(propAddressIndex)
      return
    }
    
    if (showIndex && chainId && address) {
      const findAddressIndex = async () => {
        try {
          const addressPool = getAddressPoolService(chainId);
          // 确保地址池已加载
          await addressPool.reload();
          
          // 检查组件是否仍然挂载
          if (!isMountedRef.current) return;
          
          const allAddresses = addressPool.getAllAddresses();
          const normalizedAddress = address.toLowerCase().trim();
          const index = allAddresses.findIndex(a => 
            a.address.toLowerCase().trim() === normalizedAddress
          );
          if (isMountedRef.current) {
            if (index >= 0) {
              setAddressIndex(index + 1); // 编号从1开始
            } else {
              setAddressIndex(null);
            }
          }
        } catch (e) {
          // 忽略错误，但尝试使用已加载的地址池
          if (!isMountedRef.current) return;
          
          try {
            const addressPool = getAddressPoolService(chainId);
            const allAddresses = addressPool.getAllAddresses();
            const normalizedAddress = address.toLowerCase().trim();
            const index = allAddresses.findIndex(a => 
              a.address.toLowerCase().trim() === normalizedAddress
            );
            if (isMountedRef.current) {
              if (index >= 0) {
                setAddressIndex(index + 1);
              } else {
                setAddressIndex(null);
              }
            }
          } catch (e2) {
            if (isMountedRef.current) {
              setAddressIndex(null);
            }
          }
        }
      };
      findAddressIndex();
    } else {
      setAddressIndex(null);
    }
  }, [address, chainId, showIndex, propAddressIndex]);

  if (!address) {
    return <span className={className}>-</span>;
  }

  const formattedAddress = formatAddress(address);

  return (
    <>
      <button
        onClick={() => showFullOnClick && setIsDialogOpen(true)}
        className={`font-mono transition-colors inline-flex items-center gap-1 ${showFullOnClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${className}`}
        title={showFullOnClick ? '点击查看完整地址' : address}
        type="button"
      >
        {formattedAddress}
        {addressIndex !== null && (
          <span className="text-primary font-semibold ml-1">#{addressIndex}</span>
        )}
        {showFeeLabel && isFeeRecipient && (
          <span className="px-1.5 py-0.5 text-[10px] sm:text-xs bg-yellow-500/20 text-yellow-500 rounded border border-yellow-500/30 ml-1 whitespace-nowrap">
            手续费
          </span>
        )}
      </button>
      {showFullOnClick && (
        <AddressDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          address={address}
          addressIndex={addressIndex}
          isFeeRecipient={isFeeRecipient}
          feeIndex={propFeeIndex}
        />
      )}
    </>
  );
}
