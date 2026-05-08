const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const retry = async (fn, retries = 3, backoffMs = 1000) => {
  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= retries) {
        throw error
      }
      const delay = backoffMs * Math.max(1, attempt + 1)
      await sleep(delay)
      attempt += 1
    }
  }
}

const processQueue = async (items, worker, concurrency = 5) => {
  const queue = [...items]
  const workers = []

  for (let i = 0; i < concurrency; i += 1) {
    workers.push(
      (async () => {
        while (queue.length) {
          const next = queue.shift()
          if (!next) {
            return
          }
          await worker(next)
        }
      })()
    )
  }

  await Promise.all(workers)
}

export { processQueue, retry }

