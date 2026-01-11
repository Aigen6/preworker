"use client"

export interface AnnouncementData {
  title: string
  content: string
  timestamp: string
}

interface AnnouncementSheetProps {
  data: AnnouncementData
}

export function AnnouncementSheet({ data }: AnnouncementSheetProps) {
  return (
    <div className="w-full">
      {/* 公告卡片 */}
      <div className="px-4 pb-6">
        <div className="bg-base rounded-lg p-4 space-y-3">
          {/* 公告标题 */}
          <div className="text-sm font-bold text-main leading-tight">
            {data.title}
          </div>

          {/* 公告内容 */}
          <div className="text-sm text-main leading-relaxed whitespace-pre-wrap">
            {data.content}
          </div>

          {/* 时间戳 */}
          <div className="text-right text-sm text-main pt-2">
            {data.timestamp}
          </div>
        </div>
      </div>
    </div>
  )
}
