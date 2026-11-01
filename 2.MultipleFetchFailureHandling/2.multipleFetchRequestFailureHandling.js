const errorCodes = [429, 500, 502, 503, 504]
const connectionErrorCodes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]
const errorCodeMap = {
  400: "INVALID_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "RESOURCE_NOT_FOUND",
  429: "RATE_LIMIT_EXCEEDED",
  500: "INTERNAL_SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "UPSTREAM_TIMEOUT"
}

async function fetchRetryWithTimeout(url, name, timeout, maxRetries = 1) {
  const maxAttempts = maxRetries + 1
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`${name} - Attempt ${attempt}`)
    let isTimedOut = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      isTimedOut = true
      controller.abort()
    }, timeout)

    try {
      const response = await fetch(url, {
        signal: controller.signal
      })
      if (!response.ok) {
        let err

        if (errorCodes.includes(response.status)) {
          err = new Error(`${name} unavailable`)
        } else {
          err = new Error(`${name} request failed`)
        }

        err.serviceName = name
        err.statusCode = response.status
        err.errorCode = errorCodeMap[response.status] || "SERVICE_FAILED"

        throw err
      }
      const data = await response.json()
      const result = {
        serviceName: name,
        responseData: data.message
      }
      return result
    } catch (error) {
      // console.log(error)

      const networkCode = error.cause?.code
      const isConnectionError = connectionErrorCodes.includes(networkCode)
      const isTransientError = errorCodes.includes(error.statusCode)

      if (isTimedOut) {
        error = new Error(`${name} timed out!!`)
        error.serviceName = name
        error.statusCode = 504
        error.errorCode = errorCodeMap[504]
      } else if (isConnectionError) {
        error = new Error(`${name} connection failed!!`)
        error.serviceName = name
        error.statusCode = 503
        error.errorCode = "CONNECTION_FAILED"
        error.networkCode = networkCode
      } else if (error instanceof SyntaxError) {
        error = new Error(`${name} returns invalid JSON response!!`)
        error.serviceName = name
        error.statusCode = 502
        error.errorCode = "INVALID_UPSTREAM_RESPONSE"
      }

      error.serviceName ??= name
      error.statusCode ??= 500
      error.errorCode ??= "INTERNAL_SERVER_ERROR"

      const isRetryable = isTimedOut || isConnectionError || isTransientError

      if (!isRetryable || attempt === maxAttempts) {
        // console.log(`${name} - error callback attempts - ${attempt === maxAttempts}`)
        throw error
      }
    } finally {
      clearTimeout(timeoutId)
    }

    // console.log(`${name} - error callback timeout - ${isTimedOut}`)
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
  fetchRetryWithTimeout("http://localhost:3001", "User Service", 3000),
  fetchRetryWithTimeout("http://localhost:3002", "Payment Service", 3000),
  fetchRetryWithTimeout("http://localhost:3003", "Order Service", 3000)
])
// console.log(result)
const successfullRecords = result
  .filter(record => record.status === "fulfilled")
  .map(({ status, value }) => {
    console.log(value)
    return {
      status,
      serviceName: value.serviceName,
      value: value.responseData
    }
  })

const failedRecords = result
  .filter(record => record.status === "rejected")
  .map(({ status, reason }) => ({
    status,
    serviceName: reason.serviceName,
    statusCode: reason.statusCode,
    errorCode: reason.errorCode,
    ...(reason.networkCode !== undefined && { networkCode: reason.networkCode }),
    reason: reason.message
  }))

console.log("=====Successfull Records=====")
console.log(successfullRecords)

console.log("=====Failed Records=====")
console.log(failedRecords)