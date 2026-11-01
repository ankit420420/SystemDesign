const express = require("express")

const PORT = 3003

const app = express()

app.use(express.json())

app.get("/", async (_req, res, next) => {
  try {
    await new Promise(resolve => setTimeout(resolve, 5000))
    res.status(200).json({ message: "Order creation succesfull!!" })
  } catch (error) {
    next(error)
  }
})

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500
  const message = statusCode !== 500 ? err.message : "Internal Service Error!!"

  res.status(statusCode).json({ message })
})

app.use((req, res, next) => {
  res.status(404).json({ message: `Requested resource not found:${req.path}` })
})

app.listen(PORT, () => console.log(`Order Service started on port: ${PORT}`))
