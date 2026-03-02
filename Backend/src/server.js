require("dotenv").config();

const app = require("./app");
const prisma = require("./config/prisma");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server started on port ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    process.exit(1);
  }
}

startServer();