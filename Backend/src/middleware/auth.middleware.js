const jwt = require("jsonwebtoken");

const authMiddleware = (req,res,next) => {
    try{
        const authHeader = req.headers.authorization;
        //console.log(   "Auth Header:", authHeader); // Debugging line
        if(!authHeader || !authHeader.startsWith("Bearer ")){
            return res.status(401).json({message : "No token provided"});
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.userId };
        //console.log("Decoded JWT:", decoded); // Debugging line
        next();

    } catch(err){
        return res.status(401).json({message : "Invalid Token "})
    }
};

module.exports = authMiddleware;
