"use client"

import SvgIcon from "./SvgIcon"

interface PaginationProps {
  currentPage: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}

export default function Pagination({
  currentPage,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1)
    }
  }

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1)
    }
  }

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, total)

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* 第一行：显示当前范围 */}
      <div className="text-sm text-black-9 text-center md:text-left">
        显示 {startItem}-{endItem} 条，共 {total} 条
      </div>

      {/* 第二行：分页导航 */}
      <div className="flex items-center justify-center gap-2">
        {/* 上一页按钮 */}
        <button
          onClick={handlePrevious}
          disabled={currentPage === 1}
          className={`flex items-center justify-center w-8 h-8 rounded border transition-colors ${
            currentPage === 1
              ? "border-black-3 text-black-9 cursor-not-allowed opacity-50"
              : "border-primary text-primary hover:bg-primary/10 cursor-pointer"
          }`}
        >
          <SvgIcon src="/icons/arrow-left-gray-icon.svg" className="w-4 h-4" />
        </button>

        {/* 页码显示 */}
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                  pageNum === currentPage
                    ? "bg-primary text-black"
                    : "text-white hover:bg-black-3"
                }`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>

        {/* 下一页按钮 */}
        <button
          onClick={handleNext}
          disabled={currentPage === totalPages}
          className={`flex items-center justify-center w-8 h-8 rounded border transition-colors ${
            currentPage === totalPages
              ? "border-black-3 text-black-9 cursor-not-allowed opacity-50"
              : "border-primary text-primary hover:bg-primary/10 cursor-pointer"
          }`}
        >
          <SvgIcon src="/icons/arrow-right-gray-icon.svg" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}




