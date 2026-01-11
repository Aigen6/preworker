import { useState, useCallback } from 'react'

export interface UseBottomSheetOptions {
  initialData?: any
  onDataChange?: (data: any) => void
  onReset?: () => void
}

export interface UseBottomSheetReturn {
  isOpen: boolean
  data: any
  open: (data?: any) => void
  close: () => void
  reset: () => void
  updateData: (newData: any) => void
}

export const useBottomSheet = (options: UseBottomSheetOptions = {}): UseBottomSheetReturn => {
  const { initialData = null, onDataChange, onReset } = options
  
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState(initialData)

  const open = useCallback((newData?: any) => {
    if (newData !== undefined) {
      setData(newData)
      onDataChange?.(newData)
    }
    setIsOpen(true)
  }, [onDataChange])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const reset = useCallback(() => {
    setData(null)
    onDataChange?.(null)
    onReset?.()
  }, [onDataChange, onReset])

  const updateData = useCallback((newData: any) => {
    setData(newData)
    onDataChange?.(newData)
  }, [onDataChange])

  return {
    isOpen,
    data,
    open,
    close,
    reset,
    updateData
  }
}

export default useBottomSheet
