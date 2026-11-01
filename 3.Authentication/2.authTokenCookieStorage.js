const express = require("express")
const { hash, compare } = require("bcryptjs")
const { sign, verify } = require("jsonwebtoken")
const cors = require("cors")
const { randomUUID } = require("node:crypto")
const cookieParser = require("cookie-parser")

const app = express()

const PORT = 3000
const SECRET = "API_SECRET"
const roles = ["admin", "employee"]
const registeredUsers = []
let userCount = 0
const revokedTokens = new Map()

app.use(
  cors({
    origin: ["http://localhost:5500", "http://127.0.0.1:5500"],
    credentials: true
  })
)
app.use(express.json())
app.use(cookieParser())

class AppError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

function generateSequence() {
  return ++userCount
}

function authenticate(req, res, next) {
  try {
    const token = req.cookies.accessToken
    if (!token) {
      throw new AppError("Missing Authentication token", 401)
    }

    let verifiedToken
    try {
      verifiedToken = verify(token, SECRET, {
        algorithms: ["HS256"],
        issuer: "auth-session-storage",
        audience: "auth-session-storage"
      })
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        error = new AppError("Token Expired", 401)
      } else if (error.name === "JsonWebTokenError") {
        error = new AppError("Invalid Token", 401)
      } else if (error.name === "NotBeforeError") {
        error = new AppError("Token not yet active", 401)
      }
      throw error
    }

    const { jti } = verifiedToken

    if (typeof jti !== "string" || !jti) {
      throw new AppError("Invalid Token ID", 401)
    }

    if (revokedTokens.has(jti)) {
      throw new AppError("Token revoked", 401)
    }

    req.user = verifiedToken
    next()
  } catch (error) {
    next(error)
  }
}

function authorize(role) {
  return (req, _res, next) => {
    try {
      if (role !== req.user.role) {
        throw new AppError("Access denied!!", 403)
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

app.post("/register/single", async (req, res, next) => {
  try {
    const { username, password, role } = req.body

    if (!username || !password) {
      throw new AppError("Valid username and password required", 400)
    }

    if (!roles.includes(role)) {
      throw new AppError("Invalid role", 400)
    }

    const existingUser = registeredUsers.find(user => user.username === username)
    if (existingUser) {
      throw new AppError("User already exists", 409)
    }

    const hashedPassword = await hash(password, 10)
    const userId = generateSequence()
    const userCode = `CUST-${String(userId).padStart(3, "0")}`
    const newUser = {
      id: userId,
      username,
      hashedPassword,
      role,
      userCode,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    registeredUsers.push(newUser)

    res.status(201).json({ message: "User registered!!", data: { insertedId: userId } })
  } catch (error) {
    next(error)
  }
})

app.post("/register/bulk", async (req, res, next) => {
  try {
    const { users } = req.body

    if (!Array.isArray(users) || !users.length) {
      throw new AppError("Invalid input", 400)
    }

    const uploadedUsers = []
    const failedUsers = []
    const existingUsers = []
    let message

    for (const user of users) {
      const username = user.username
      const password = user.password
      const role = user.role

      if (!username || !password || !roles.includes(role)) {
        failedUsers.push({ username, role, reason: "Invalid useranme, password or role" })
        continue
      }

      const existingUser = registeredUsers.find(individual => individual.username === username)
      if (existingUser) {
        existingUsers.push({ username, role })
        continue
      }

      const hashedPassword = await hash(user.password, 10)
      const userId = generateSequence()
      const userCode = `CUST-${String(userId).padStart(3, "0")}`
      const newUser = {
        id: userId,
        username: user.username,
        hashedPassword,
        role: user.role,
        userCode,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      registeredUsers.push(newUser)
      uploadedUsers.push(userId)
    }
    if (existingUsers.length === users.length) {
      message = "All Users already registered!!"
    } else if (!uploadedUsers.length && failedUsers.length) {
      message = "User registration failed!!"
    } else if (uploadedUsers.length && (failedUsers.length || existingUsers.length)) {
      message = "Few Users registered!!"
    } else {
      message = "Users registered!!"
    }

    const statusCode = uploadedUsers.length ? 201 : 200
    res.status(statusCode).json({
      message,
      data: {
        insertedCount: uploadedUsers.length,
        insertedId: uploadedUsers,
        failedCount: failedUsers.length,
        failedRecords: failedUsers,
        existingCount: existingUsers.length,
        existingRecords: existingUsers
      }
    })
  } catch (error) {
    next(error)
  }
})

app.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      throw new AppError("Valid username and password required", 400)
    }

    const existingUser = registeredUsers.find(user => user.username === username)
    if (!existingUser || !(await compare(password, existingUser.hashedPassword))) {
      throw new AppError("Invalid credentials", 401)
    }

    const payload = { role: existingUser.role }
    const token = sign(payload, SECRET, {
      algorithm: "HS256",
      jwtid: randomUUID(),
      issuer: "auth-session-storage",
      audience: "auth-session-storage",
      subject: existingUser.userCode,
      expiresIn: "15m"
    })

    res.cookie("accessToken", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 15,
      sameSite: "lax",
      path: "/"
    })
    res.status(200).json({ message: "Login successfull!!" })
  } catch (error) {
    next(error)
  }
})

app.get("/getAllUsersList", authenticate, authorize("admin"), (_req, res, next) => {
  try {
    const usersList = registeredUsers.map(({ userCode, username, role }) => ({
      userCode,
      username,
      role
    }))

    res.status(200).json({ message: "Employees list retrieved!!", data: usersList })
  } catch (error) {
    next(error)
  }
})

app.get("/loggedUserProfileInfo", authenticate, (req, res, next) => {
  try {
    const loggedUserCode = req.user.sub
    const userDetails = registeredUsers.find(({ userCode }) => userCode === loggedUserCode)

    if (!userDetails) {
      throw new AppError("User not found", 404)
    }

    const { username, userCode, role, createdAt } = userDetails
    const formatDate = date =>
      new Date(date)
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "Asia/Kolkata"
          // timeZone: "UTC"
        })
        .replace(/\//g, "-")

    res.status(200).json({
      message: "Employees list retrieved!!",
      data: { username, userCode, role, createdAt: formatDate(createdAt) }
    })
  } catch (error) {
    next(error)
  }
})

app.get("/getAllUsersRawList", (_req, res, next) => {
  try {
    res.status(200).json({ message: "Employees list retrieved!!", data: registeredUsers })
  } catch (error) {
    next(error)
  }
})

app.post("/logout", authenticate, (req, res, next) => {
  try {
    const { jti, exp } = req.user

    // if (typeof jti !== "string" || !jti || !Number.isInteger(exp)) {
    //   throw new AppError("Invalid Token claims", 401)
    // }

    revokedTokens.set(jti, exp)

    res.clearCookie("accessToken", { path: "/" })

    res.status(200).json({
      message: "Logout successful!!"
    })
  } catch (error) {
    next(error)
  }
})

app.patch("/forgetpassword/user/:userCode", async (req, res, next) => {
  try {
    const { password, retype } = req.body

    if (!password || !retype) {
      throw new AppError("Password and confirm password required", 400)
    }

    if (password !== retype) {
      throw new AppError("Password and confirm password do not match", 400)
    }

    const { userCode } = req.params
    const existingUser = registeredUsers.find(user => user.userCode === userCode)
    if (!existingUser) {
      throw new AppError("User not found", 404)
    }
    const hashedPassword = await hash(password, 10)
    existingUser.hashedPassword = hashedPassword
    existingUser.updatedAt = new Date()

    res.status(200).json({ message: "Password Updated" })
  } catch (error) {
    next(error)
  }
})

app.use((req, res, _next) =>
  res.status(404).json({ message: `Requested resource not found ${req.url}` })
)

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }

  const isOperational = err instanceof AppError

  const statusCode =
    isOperational &&
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599
      ? err.statusCode
      : 500

  const message = isOperational && statusCode !== 500 ? err.message : "Internal Server Error!!"

  if (!isOperational || statusCode === 500) {
    console.log(err)
  }
  res.status(statusCode).json({ message })
})

app.listen(PORT, () => console.log(`Application running on port ${PORT}`))
