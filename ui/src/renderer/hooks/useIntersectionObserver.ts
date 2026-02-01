import { useEffect, useRef, useState, useCallback } from 'react'

interface UseIntersectionObserverOptions {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
}

export const useIntersectionObserver = (
  options: UseIntersectionObserverOptions = {}
) => {
  const { threshold = 0.1, rootMargin = '100px', triggerOnce = true } = options
  const [isVisible, setIsVisible] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)
  const hasTriggeredRef = useRef(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // Skip if already triggered and triggerOnce is true
    if (triggerOnce && hasTriggeredRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            hasTriggeredRef.current = true
            
            // Unobserve after triggering if triggerOnce is true
            if (triggerOnce) {
              observer.unobserve(element)
            }
          } else if (!triggerOnce) {
            setIsVisible(false)
          }
        })
      },
      {
        threshold,
        rootMargin,
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [threshold, rootMargin, triggerOnce])

  return { ref: elementRef, isVisible }
}

// Queue for batch processing thumbnails
class ThumbnailQueue {
  private queue: Array<() => Promise<void>> = []
  private isProcessing = false
  private maxConcurrent = 3
  private activeCount = 0

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task)
    this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const task = this.queue.shift()
      if (task) {
        this.activeCount++
        // Add small delay between starts to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 50))
        
        task().finally(() => {
          this.activeCount--
          // Continue processing if there are more items
          if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 0)
          }
        })
      }
    }

    this.isProcessing = false
  }
}

export const thumbnailQueue = new ThumbnailQueue()

// Hook for lazy thumbnail loading with queue
export const useLazyThumbnail = (
  clipId: string,
  videoPath: string,
  onGenerate: (clipId: string, videoPath: string) => Promise<void>
) => {
  const { ref, isVisible } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '200px', // Start loading when within 200px of viewport
    triggerOnce: true,
  })
  
  const hasEnqueuedRef = useRef(false)

  useEffect(() => {
    if (isVisible && !hasEnqueuedRef.current) {
      hasEnqueuedRef.current = true
      
      // Add to queue with a staggered delay based on index
      thumbnailQueue.enqueue(async () => {
        await onGenerate(clipId, videoPath)
      })
    }
  }, [isVisible, clipId, videoPath, onGenerate])

  return { ref, isVisible }
}
