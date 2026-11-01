const errorCodes = [429, 500, 502, 503, 504]

async function promiseRetryWithTimeout(name, shouldFail, delay, timeout, maxRetries = 1) {
  const maxAttempts = maxRetries + 1
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`${name} - Attempt ${attempt}`)
    let timeOut = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      timeOut = true
      controller.abort()
    }, timeout)

    try {
      return await new Promise((resolve, reject) => {
        const promiseTimeoutId = setTimeout(() => {
          controller.signal.removeEventListener("abort", onAbort)
          if (shouldFail) {
            console.log(`${name} failed!!`)
            const err = new Error(`${name} failed!!`)
            err.serviceName = name
            err.statusCode = 503
            reject(err)
          } else {
            console.log(`${name} successfull!!`)
            // resolve(`${name} successfull!!`)
            resolve({ name, message: `${name} successfull!!` })
          }
        }, delay)

        function onAbort() {
          console.log(`${name} aborted!!`)

          clearTimeout(promiseTimeoutId)
          const err = new Error(`${name} timed out!!`)
          err.serviceName = name
          err.statusCode = 504
          reject(err)
        }

        controller.signal.addEventListener("abort", onAbort, { once: true })
      })
    } catch (error) {
      const retry = timeOut || errorCodes.includes(error.statusCode)

      if (!retry || attempt === maxAttempts) {
        console.log(`${name} - error callback attempts - ${attempt === maxAttempts}`)
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }

    console.log(`${name} - error callback timeout - ${timeOut}`)
    const baseDelay = 100
    const maxDelay = 250
    const backOffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
    const jitterDelay = Math.floor(Math.random() * backOffDelay)
    await new Promise(resolve => {
      console.log(`${name} - Retrying after ${jitterDelay / 1000} s`)
      setTimeout(resolve, jitterDelay)
    })
  }
}

const result = await Promise.allSettled([
  promiseRetryWithTimeout("User Service", false, 1000, 3000),
  promiseRetryWithTimeout("Payment Service", true, 2000, 3000),
  promiseRetryWithTimeout("Order Service", false, 5000, 3000)
])

const successfullRecords = result
  .filter(record => record.status === "fulfilled")
  .map(({ status, value }) => ({
    status,
    serviceName: value.name,
    result: value.message
  }))

const failedRecords = result
  .filter(record => record.status === "rejected")
  .map(({ status, reason }) => ({
    status,
    serviceName: reason.serviceName,
    statusCode: reason.statusCode,
    reason: reason.message
  }))

console.log("=====Successfull Records=====")
console.log(successfullRecords)

console.log("=====Failed Records=====")
console.log(failedRecords)
