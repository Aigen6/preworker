import React, { useEffect, useMemo, useState, forwardRef } from "react"

type SvgIconProps = {
  /** SVG 文件路径 */
  src: string
  /** 尺寸与颜色全靠这里控制（color/width/height/font-size） */
  className?: string
  /** 可选标题，提高可访问性，会注入 <title> */
  title?: string
  /** 是否把颜色统一成 currentColor，默认 true */
  monochrome?: boolean
  /** 自定义颜色，如果传入则覆盖SVG原有颜色 */
  color?: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">

const svgCache = new Map<string, string>()

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** 检测className中是否包含尺寸相关的类 */
function hasSizeClasses(className?: string): boolean {
  if (!className) return false
  
  // 检测 Tailwind 的尺寸相关类
  const sizeRegex = /\b(w-\d+|h-\d+|w-\[\d+px\]|h-\[\d+px\]|text-\w+|size-\d+)\b/
  return sizeRegex.test(className)
}

/** 处理SVG尺寸：根据是否有尺寸类决定是否响应容器尺寸 */
function normalizeSvgSize(svgText: string, shouldRespond: boolean): string {
  if (!shouldRespond) {
    // 如果不需要响应容器尺寸，保留原始的 width/height
    return svgText
  }
  
  // 移除 <svg> 标签上的 width 和 height 属性，保留 viewBox
  return svgText.replace(
    /<svg([^>]*?)>/i,
    (match, attrs) => {
      // 移除 width 和 height 属性，但保留其他属性
      const newAttrs = attrs
        .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '')
      
      // 如果没有 viewBox，尝试从原始的 width/height 创建一个
      if (!/viewBox/i.test(newAttrs)) {
        const widthMatch = attrs.match(/width\s*=\s*["']([^"']*)["']/i)
        const heightMatch = attrs.match(/height\s*=\s*["']([^"']*)["']/i)
        if (widthMatch && heightMatch) {
          const width = widthMatch[1].replace(/[^\d]/g, '') || '24'
          const height = heightMatch[1].replace(/[^\d]/g, '') || '24'
          return `<svg${newAttrs} viewBox="0 0 ${width} ${height}" width="100%" height="100%">`
        }
      }
      
      return `<svg${newAttrs} width="100%" height="100%">`
    }
  )
}

/** 处理SVG颜色：如果传入color则使用传入的颜色，否则根据monochrome决定 */
function normalizeSvgColor(svgText: string, monochrome: boolean, customColor?: string): string {
  // 如果传入了自定义颜色，使用自定义颜色
  if (customColor) {
    const replaceColor = (attr: "fill" | "stroke") =>
      new RegExp(`${attr}\\s*=\\s*"(?!none|url\\(#|currentColor)([^"]+)"`, "gi")

    let out = svgText
      .replace(replaceColor("fill"), `fill="${customColor}"`)
      .replace(replaceColor("stroke"), `stroke="${customColor}"`)

    // 根 <svg> 上也顺手处理
    out = out.replace(
      /<svg([^>]*?)>/i,
      (m, attrs) =>
        `<svg${attrs
          .replace(replaceColor("fill"), `fill="${customColor}"`)
          .replace(replaceColor("stroke"), `stroke="${customColor}"`)}>`
    )

    return out
  }

  // 如果没有传入自定义颜色，根据monochrome决定
  if (!monochrome) return svgText

  const replaceColor = (attr: "fill" | "stroke") =>
    new RegExp(`${attr}\\s*=\\s*"(?!none|url\\(#|currentColor)([^"]+)"`, "gi")

  let out = svgText
    .replace(replaceColor("fill"), 'fill="currentColor"')
    .replace(replaceColor("stroke"), 'stroke="currentColor"')

  // 根 <svg> 上也顺手处理
  out = out.replace(
    /<svg([^>]*?)>/i,
    (m, attrs) =>
      `<svg${attrs
        .replace(replaceColor("fill"), 'fill="currentColor"')
        .replace(replaceColor("stroke"), 'stroke="currentColor"')}>`
  )

  return out
}

const SvgIcon = forwardRef<HTMLSpanElement, SvgIconProps>(
  ({ src, className, title, monochrome = false, color, style, ...rest }, ref) => {
    const [svg, setSvg] = useState<string | null>(null)
    const [err, setErr] = useState<Error | null>(null)

    const shouldRespond = useMemo(() => hasSizeClasses(className), [className])
    
    const cacheKey = useMemo(
      () => `${src}|${monochrome ? "mono" : "raw"}|${color ?? ""}|${title ?? ""}|${shouldRespond ? "responsive" : "original"}`,
      [src, monochrome, color, title, shouldRespond]
    )

    useEffect(() => {
      let aborted = false

      async function load() {
        try {
          setErr(null)

          if (svgCache.has(cacheKey)) {
            setSvg(svgCache.get(cacheKey) as string)
            return
          }

          const res = await fetch(src, { credentials: "same-origin" })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)

          let text = await res.text()

          // 只接受 <svg> 开头
          if (!/^\s*<svg[\s>]/i.test(text)) {
            throw new Error("Not an SVG")
          }

          text = normalizeSvgSize(text, shouldRespond)
          text = normalizeSvgColor(text, monochrome, color)

          if (title) {
            // 如果已有 <title> 不重复插入，简单粗暴移除再加
            text = text.replace(/<title>[\s\S]*?<\/title>/i, "")
            text = text.replace(
              /<svg([^>]*)>/i,
              (m, attrs) => `<svg${attrs}><title>${escapeHtml(title)}</title>`
            )
          }

          svgCache.set(cacheKey, text)
          if (!aborted) setSvg(text)
        } catch (e) {
          if (!aborted) setErr(e as Error)
        }
      }

      load()
      return () => {
        aborted = true
      }
    }, [cacheKey, src, monochrome, title, shouldRespond])

    // 失败时给个占位，别把布局搞崩
    if (err) {
      return (
        <span
          ref={ref}
          role="img"
          aria-label={title || "icon failed"}
          className={className}
          {...rest}
          style={{
            display: "inline-block",
            width: "1em",
            height: "1em",
            background: "currentColor",
            ...style,
          }}
        />
      )
    }

    // 加载中占位，避免闪烁
    if (!svg) {
      return (
        <span
          ref={ref}
          className={className}
          aria-hidden
          {...rest}
          style={{
            display: "inline-block",
            width: "1em",
            height: "1em",
            ...style,
          }}
        />
      )
    }

    return (
      <span
        ref={ref}
        className={className}
        // 是的，dangerouslySetInnerHTML。配合受控来源和基本校验，理性使用就行。
        dangerouslySetInnerHTML={{ __html: svg }}
        {...rest}
        style={{ display: "inline-block", lineHeight: 0, ...style }}
        aria-hidden={title ? undefined : true}
      />
    )
  }
)

SvgIcon.displayName = "SvgIcon"
export default SvgIcon
