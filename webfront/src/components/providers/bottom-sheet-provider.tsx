'use client'

import React, { createContext, useContext, useRef } from 'react'
import BottomSheet, { BottomSheetProps } from '@/components/ui/bottom-sheet'

interface BottomSheetContextType {
  openBottomSheet: (props: Omit<BottomSheetProps, 'isOpen' | 'onClose'>) => void
  closeBottomSheet: () => void
  resetBottomSheet: () => void
}

const BottomSheetContext = createContext<BottomSheetContextType | null>(null)

export const useBottomSheetContext = () => {
  const context = useContext(BottomSheetContext)
  if (!context) {
    throw new Error('useBottomSheetContext must be used within a BottomSheetProvider')
  }
  return context
}

interface BottomSheetProviderProps {
  children: React.ReactNode
}

export const BottomSheetProvider: React.FC<BottomSheetProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const [sheetProps, setSheetProps] = React.useState<Omit<BottomSheetProps, 'isOpen' | 'onClose'> | null>(null)

  const openBottomSheet = (props: Omit<BottomSheetProps, 'isOpen' | 'onClose'>) => {
    setSheetProps(props)
    setIsOpen(true)
  }

  const closeBottomSheet = () => {
    setIsOpen(false)
  }

  const resetBottomSheet = () => {
    if (sheetProps?.onReset) {
      sheetProps.onReset()
    }
    if (sheetProps?.onDataChange && sheetProps?.data) {
      sheetProps.onDataChange(null)
    }
  }

  return (
    <BottomSheetContext.Provider value={{ openBottomSheet, closeBottomSheet, resetBottomSheet }}>
      {children}
      {sheetProps && (
        <BottomSheet
          {...sheetProps}
          isOpen={isOpen}
          onClose={closeBottomSheet}
        />
      )}
    </BottomSheetContext.Provider>
  )
}

export default BottomSheetProvider
