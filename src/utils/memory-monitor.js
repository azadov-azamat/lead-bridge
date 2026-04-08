/**
 * Memory monitor — heap usage'ni periodic kuzatadi.
 *
 * Ikki threshold:
 *   - maxHeapUsed       : warning. Force GC chaqiriladi (agar `--expose-gc` bilan
 *                         ishga tushirilgan bo'lsa).
 *   - criticalHeapUsed  : critical. `onCriticalMemory(memInfo)` callback chaqiriladi
 *                         (odatda graceful shutdown trigger).
 *
 * Eslatma: `global.gc()` faqat Node `--expose-gc` flagi bilan ishga tushirilganda
 * mavjud bo'ladi. Aks holda no-op. Render'da `node --expose-gc bin/www` qilib
 * yoqsa bo'ladi.
 *
 * Foydalanish:
 *   const monitor = createMemoryMonitor({
 *     maxHeapUsedMb: 400,
 *     criticalHeapUsedMb: 450,
 *     checkIntervalMs: 2 * 60 * 1000,
 *     onCriticalMemory: (mem) => shutdown('critical memory'),
 *   });
 *   monitor.start();
 *   monitor.logMemoryUsage();
 */

const MB = 1024 * 1024;

function createMemoryMonitor({
  maxHeapUsedMb = 400,
  criticalHeapUsedMb = 450,
  checkIntervalMs = 2 * 60 * 1000,
  onWarning = null,
  onCriticalMemory = null,
  logger = console,
} = {}) {
  const maxHeapBytes = maxHeapUsedMb * MB;
  const criticalHeapBytes = criticalHeapUsedMb * MB;

  let timer = null;
  let lastCriticalAt = 0;
  // Critical callback ni 60s da bir martadan ko'p chaqirmaymiz
  const CRITICAL_THROTTLE_MS = 60 * 1000;

  function getMemoryInfo() {
    return process.memoryUsage();
  }

  function check() {
    const mem = getMemoryInfo();

    if (mem.heapUsed >= criticalHeapBytes) {
      const now = Date.now();
      if (now - lastCriticalAt >= CRITICAL_THROTTLE_MS) {
        lastCriticalAt = now;
        logger.error(
          `[mem] CRITICAL heap=${mb(mem.heapUsed)}MB rss=${mb(mem.rss)}MB ` +
            `(threshold ${criticalHeapUsedMb}MB)`
        );
        if (onCriticalMemory) {
          try {
            onCriticalMemory(mem);
          } catch (err) {
            logger.error('[mem] onCriticalMemory callback xato:', err);
          }
        }
      }
      return;
    }

    if (mem.heapUsed >= maxHeapBytes) {
      logger.warn(
        `[mem] WARNING heap=${mb(mem.heapUsed)}MB rss=${mb(mem.rss)}MB ` +
          `(threshold ${maxHeapUsedMb}MB) — force GC`
      );
      if (onWarning) {
        try {
          onWarning(mem);
        } catch (err) {
          logger.error('[mem] onWarning callback xato:', err);
        }
      }
      forceGarbageCollection();
    }
  }

  function forceGarbageCollection() {
    if (typeof global.gc === 'function') {
      try {
        global.gc();
      } catch (_) {}
    }
  }

  function logMemoryUsage(prefix = '[mem]') {
    const m = getMemoryInfo();
    logger.log(
      `${prefix} heap=${mb(m.heapUsed)}MB rss=${mb(m.rss)}MB external=${mb(m.external)}MB`
    );
  }

  function start() {
    if (timer) return;
    timer = setInterval(check, checkIntervalMs);
    // Don't keep event loop alive solely for monitoring
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    check,
    logMemoryUsage,
    forceGarbageCollection,
    getMemoryInfo,
  };
}

function mb(bytes) {
  return Math.round((bytes / MB) * 100) / 100;
}

module.exports = { createMemoryMonitor };
