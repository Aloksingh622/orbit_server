// import jwt from "jsonwebtoken";
// import  User from "../models/User";
// const redisclient = require("../config/redisdatabase");


export const protect = async (req, res, next) => {
    try {
        const {userId} = await req.auth();
        console.log(userId)
        if(!userId){
            return res.json({success: false, message: "not authenticated"  })
        }
        next()
    } catch (error) {
        res.json({success: false, message: error.message  })
    }
}



// const usermiddleware = async (req, res, next) => {
//   try {
//     const { token } = req.cookies;
//     if (!token) throw new Error("Token is not present");

//     const payload = jwt.verify(token, process.env.private_key);
//     const { _id } = payload;
//     if (!_id) throw new Error("Invalid token payload");

//     // Optional: Populate problem_solved if needed
//     const result = await User.findById(_id);
//     if (!result) throw new Error("User doesn't exist");

//     // const isBlocked = await redisclient.exists(`token:${token}`);
//     // if (isBlocked) throw new Error("Token is expired or revoked");

//     req.real_user = result;
//     next();
//   } catch (err) {
//     console.error("Middleware Error:", err.message);
//     res.status(401).json({ error: err.message });
//   }
// };

// module.exports = usermiddleware;
