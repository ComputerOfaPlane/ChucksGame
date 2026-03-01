const express = require("express")

const app = express()

app.get("/test", (req,res)=>{
    res.send("Hello from the backend!")
})

app.listen(5000, () => {
  console.log("Server started on port 5000");
});