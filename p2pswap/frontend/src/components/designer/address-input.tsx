"use client"

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  chainId?: number
  placeholder?: string
  showValidation?: boolean
}

export function AddressInput({
  value,
  onChange,
  chainId,
  placeholder,
  showValidation = false,
}: AddressInputProps) {
  const isValid = (() => {
    if (!value) return true
    if (chainId === 195) {
      // TRON address: starts with T, 34 chars
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)
    } else {
      // EVM address: 0x + 40 hex chars
      return /^0x[a-fA-F0-9]{40}$/.test(value)
    }
  })()

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full p-3 bg-black-2 border rounded-[8px] text-white text-sm focus:outline-none ${
          showValidation && value && !isValid
            ? "border-red-500"
            : "border-black-4 focus:border-primary"
        }`}
      />
      {showValidation && value && !isValid && (
        <p className="text-xs text-red-500 mt-1">地址格式无效</p>
      )}
    </div>
  )
}
