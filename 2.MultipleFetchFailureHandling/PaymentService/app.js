const express = require("express")

const PORT = 3002

const app = express()

app.use(express.json())
let attempt = 0
app.get("/", (_req, res, next) => {
  try {
    // const count =
    // console.log(count)
    if (++attempt <= 2) {
      const err = new Error("Service Unavailable")
      err.statusCode = 503
      throw err
    }
    res.status(200).json({ message: "Payment creation succesfull!!" })
  } catch (error) {
    next(error)
  }
})

app.use((err, _req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = statusCode !== 500 ? err.message : "Internal Service Error!!"

  res.status(statusCode).json({ message })
})

app.use((req, res, next) => {
  res.status(404).json({ message: `Requested resource not found:${req.path}` })
})

app.listen(PORT, () => console.log(`Payment Service started on port: ${PORT}`))
