const express = require("express")

const PORT = 3001

const app = express()

app.use(express.json())

app.get("/", (_req, res, next) => {
  try {
    res.status(200).json({ message: "User creation succesfull!!" })
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

app.listen(PORT, () => console.log(`User Service started on port: ${PORT}`))
