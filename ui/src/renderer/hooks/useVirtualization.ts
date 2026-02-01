import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface VirtualizationConfig {
  itemCount: number
  itemHeight: number
  overscan: number
  gridCols: number
}

interface VirtualItem {
  index: number
  style: React.CSSProperties
}

export const useVirtualization = (config: VirtualizationConfig) => {
  const { itemCount, itemHeight, overscan, gridCols } = config
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const rowCount = Math.ceil(itemCount / gridCols)
    const scrollRow = Math.floor(scrollTop / itemHeight)
    const visibleRows = Math.ceil(containerHeight / itemHeight)
    
    const startRow = Math.max(0, scrollRow - overscan)
    const endRow = Math.min(rowCount, scrollRow + visibleRows + overscan)
    
    const startIndex = startRow * gridCols
    const endIndex = Math.min(itemCount, endRow * gridCols)
    
    return { startIndex, endIndex, startRow, endRow, rowCount }
  }, [scrollTop, containerHeight, itemHeight, overscan, gridCols, itemCount])

  // Calculate total height
  const totalHeight = useMemo(() => {
    const rowCount = Math.ceil(itemCount / gridCols)
    return rowCount * itemHeight
  }, [itemCount, gridCols, itemHeight])

  // Get virtual items
  const virtualItems = useMemo(() => {
    const items: VirtualItem[] = []
    for (let i = visibleRange.startIndex; i < visibleRange.endIndex; i++) {
      const row = Math.floor(i / gridCols)
      const col = i % gridCols
      items.push({
        index: i,
        style: {
          position: 'absolute',
          top: row * itemHeight,
          left: `${(col / gridCols) * 100}%`,
          width: `${100 / gridCols}%`,
          height: itemHeight,
          padding: '0 8px', // Match gap-4 (16px total = 8px each side)
        },
      })
    }
    return items
  }, [visibleRange, gridCols, itemHeight])

  // Handle scroll
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Update container height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight)
      }
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  return {
    containerRef,
    virtualItems,
    totalHeight,
    onScroll,
    visibleRange,
  }
}

// Hook to detect grid columns based on container width
export const useGridCols = (containerRef: React.RefObject<HTMLDivElement>) => {
  const [gridCols, setGridCols] = useState(4) // Default to 4 columns

  useEffect(() => {
    const updateCols = () => {
      const width = containerRef.current?.clientWidth || 1200
      // Tailwind breakpoints: sm:640, md:768, lg:1024, xl:1280
      if (width < 640) setGridCols(1)
      else if (width < 1024) setGridCols(2)
      else if (width < 1280) setGridCols(3)
      else setGridCols(4)
    }

    updateCols()
    window.addEventListener('resize', updateCols)
    return () => window.removeEventListener('resize', updateCols)
  }, [containerRef])

  return gridCols
}
