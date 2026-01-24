'use client'

function HeaderComponent() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-surface">
      <header className="flex justify-center items-center border-b-[0.79px] border-b-black w-full h-[71.27px] px-[25.53px]">
        <h1 className="text-main text-xl font-semibold">
          DinaSwap管理系统
        </h1>
      </header>
    </div>
  )
}

export const Header = HeaderComponent
