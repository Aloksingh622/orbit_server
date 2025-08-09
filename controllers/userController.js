import imagekit from "../configs/imageKit.js"
import { inngest } from "../inngest/index.js"
import Connection from "../models/Connection.js"
import Post from "../models/Post.js"
import User from "../models/User.js"
import fs from 'fs'
import { clerkClient } from "@clerk/express";



// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';
// import redisclient from '../configs/redis.js'; // assuming you have this

// export const register = async (req, res) => {
//   try {
  

//     let { full_name, email, username, otp, password } = req.body;

//     // OTP check from Redis
//     const real_otp = await redisclient.get(`otp:${email}`);
//     if (!real_otp) {
//       return res.status(400).json({ message: "OTP is expired" });
//     }
//     if (real_otp !== otp) {
//       return res.status(400).json({ message: "Invalid OTP" });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create user in MongoDB
//     const newUser = await User.create({
//       _id: new mongoose.Types.ObjectId().toString(), // custom string ID
//       email,
//       full_name,
//       username,
//       password: hashedPassword, // ⚠ add password field to schema if needed
//       // other default fields will be filled automatically
//     });

//     // Generate JWT token
//     const token = jwt.sign(
//       { _id: newUser._id, email: email, full_name: full_name },
//       process.env.private_key,
//       { expiresIn: "1d" }
//     );

//     // Prepare response data
//     const reply = {
//       full_name: newUser.full_name,
//       email: newUser.email,
//       username: newUser.username,
//       _id: newUser._id,
//       createdAt: newUser.createdAt
//     };

//     // Set token cookie
//     res.cookie("token", token, {
//       sameSite: 'none',
//       maxAge: 24 * 60 * 60 * 1000,
//       overwrite: true,
//       httpOnly: true,
//       secure: true,
//       domain: 'thealok.shop'
//     });

//     res.status(201).json({
//       user: reply,
//       message: "User registered successfully"
//     });

//   } catch (err) {
//     res.status(400).send("Error: " + err.message);
//   }
// };


// export const login = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // 1. Validate input
//         if (!email || !password) {
//             throw new Error("Invalid credentials");
//         }

//         // 2. Find user by email
//         const real_user = await User.findOne({ email });
//         if (!real_user) {
//             throw new Error("Invalid credentials");
//         }

//         // 3. Compare password
//         const match = await bcrypt.compare(password, real_user.password);
//         if (!match) {
//             throw new Error("Invalid credentials");
//         }

//         // 4. Create JWT token
//         const token = jwt.sign(
//             { _id: real_user._id, email: real_user.email, full_name: real_user.full_name },
//             process.env.private_key,
//             { expiresIn: "1d" }
//         );

//         // 5. Set cookie
//         res.cookie("token", token, {
//             sameSite: 'none',
//             maxAge: 24 * 60 * 60 * 1000,
//             overwrite: true,
//             httpOnly: true,
//             secure: true,
//             domain: 'thealok.shop'
//         });

//         // 6. Prepare response
//         const setpassword = !!real_user.password;
//         const reply = {
//             _id: real_user._id,
//             full_name: real_user.full_name,
//             email: real_user.email,
//             username: real_user.username,
//             bio: real_user.bio,
//             profile_picture: real_user.profile_picture,
//             cover_photo: real_user.cover_photo,
//             location: real_user.location,
//             followers: real_user.followers,
//             following: real_user.following,
//             connections: real_user.connections,
//             createdAt: real_user.createdAt,
//             setpassword
//         };

//         // 7. Send response
//         res.status(200).json({
//             user: reply,
//             message: "Logged in successfully"
//         });

//     } catch (err) {
//         res.status(401).send("Error: " + err.message);
//     }
// };
// export const email_verification = async (req, res) => {
//     try {
//         const { email } = req.body;

//         // 1. Validate input
//         if (!email) {
//             return res.status(400).json({ success: false, error: "Email is required" });
//         }

//         // 2. Check if user already exists
//         const existingUser = await User.findOne({ email });
//         if (existingUser) {
//             return res.status(400).json({ success: false, error: "Email already registered" });
//         }

//         // 3. Create mail transporter
//         const transporter = nodemailer.createTransport({
//             service: "gmail",
//             auth: {
//                 user: process.env.SMTP_EMAIL,
//                 pass: process.env.SMTP_PASSWORD,
//             },
//         });

//         // 4. Generate OTP
//         const otp = otp_generator.generate(6, {
//             upperCaseAlphabets: false,
//             lowerCaseAlphabets: false,
//             specialChars: false,
//             digits: true
//         });

//         // 5. Save OTP in Redis (expires in 5 minutes)
//         await redisclient.set(`otp:${email}`, otp, { EX: 300 });

//         // 6. Send OTP Email
//         await transporter.sendMail({
//             from: `"PingUp" <${process.env.SMTP_EMAIL}>`,
//             to: email,
//             subject: "Your PingUp OTP",
//             html: `
//                 <div style="font-family:sans-serif; padding:10px; color:#333">
//                     <h2>Your OTP is: <span style="color:#3b82f6">${otp}</span></h2>
//                     <p>This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.</p>
//                     <br />
//                     <p>– Team PingUp</p>
//                 </div>
//             `,
//         });

//         return res.status(200).json({ success: true, message: "OTP sent successfully" });

//     } catch (err) {
//         console.error("Email Verification Error:", err);
//         return res.status(500).json({ success: false, error: err.message || "Something went wrong" });
//     }
// };


// Get User Data using userId
export const getUserData = async (req, res) => {
    try {
        const { userId } = req.auth()
        const user = await User.findById(userId)
        if(!user){
            return res.json({success: false, message: "User not found"})
        }
        res.json({success: true, user})
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

//  Update User Data
export const updateUserData = async (req, res) => {
    try {
        const { userId } = req.auth()
        let {username, bio, location, full_name } = req.body;

        const tempUser = await User.findById(userId)

        !username && (username = tempUser.username)

        if(tempUser.username !== username){
            const user = await User.findOne({username})
            if(user){
                // we will not change the username if it is already taken
                username = tempUser.username
            }
        }

        const updatedData = {
            username,
            bio,
            location,
            full_name
        }

        const profile = req.files.profile && req.files.profile[0]
        const cover = req.files.cover && req.files.cover[0]

        if(profile){
            const buffer = fs.readFileSync(profile.path)
            const response = await imagekit.upload({
                file: buffer,
                fileName: profile.originalname,
            })

            const url = imagekit.url({
                path: response.filePath,
                transformation: [
                    {quality: 'auto'},
                    { format: 'webp' },
                    { width: '512' }
                ]
            })
            updatedData.profile_picture = url;

            const blob = await fetch(url).then(res => res.blob());
            await clerkClient.users.updateUserProfileImage(userId, { file: blob });
        }

        if(cover){
            const buffer = fs.readFileSync(cover.path)
            const response = await imagekit.upload({
                file: buffer,
                fileName: profile.originalname,
            })

            const url = imagekit.url({
                path: response.filePath,
                transformation: [
                    {quality: 'auto'},
                    { format: 'webp' },
                    { width: '1280' }
                ]
            })
            updatedData.cover_photo = url;
        }

        const user = await User.findByIdAndUpdate(userId, updatedData, {new : true})

        res.json({success: true, user, message: 'Profile updated successfully'})

    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Find Users using username, email, location, name
export const discoverUsers = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { input } = req.body;

        const allUsers = await User.find(
            {
                $or: [
                    {username: new RegExp(input, 'i')},
                    {email: new RegExp(input, 'i')},
                    {full_name: new RegExp(input, 'i')},
                    {location: new RegExp(input, 'i')},
                ]
            }
        )
        const filteredUsers = allUsers.filter(user=> user._id !== userId);

        res.json({success: true, users: filteredUsers})
        
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Follow User
export const followUser = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { id } = req.body;

        const user = await User.findById(userId)

        if(user.following.includes(id)){
            return res.json({ success: false, message: 'You are already following this user'})
        }

        user.following.push(id);
        await user.save()

        const toUser = await User.findById(id)
        toUser.followers.push(userId)
        await toUser.save()

        res.json({success: true, message: 'Now you are following this user'})
        
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Unfollow User
export const unfollowUser = async (req, res) => {
    try {
        const { userId } = req.auth()
        const { id } = req.body;

        const user = await User.findById(userId)
        user.following = user.following.filter(user=> user !== id);
        await user.save()

        const toUser = await User.findById(id)
        toUser.followers = toUser.followers.filter(user=> user !== userId);
        await toUser.save()
        
        res.json({success: true, message: 'You are no longer following this user'})
        
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Send Connection Request
export const sendConnectionRequest = async (req, res) => {
    try {
        const {userId} = req.auth()
        const { id } = req.body;

        // Check if user has sent more than 20 connection requests in the last 24 hours
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const connectionRequests = await Connection.find({from_user_id: userId, created_at: { $gt: last24Hours }})
        if(connectionRequests.length >= 20){
            return res.json({success: false, message: 'You have sent more than 20 connection requests in the last 24 hours'})
        }

        // Check if users are already conected
        const connection = await Connection.findOne({
            $or: [
                {from_user_id: userId, to_user_id: id},
                {from_user_id: id, to_user_id: userId},
            ]
        })

        if(!connection){
           const newConnection = await Connection.create({
                from_user_id: userId,
                to_user_id: id
            })

            await inngest.send({
                name: 'app/connection-request',
                data: {connectionId: newConnection._id}
            })

            return res.json({success: true, message: 'Connection request sent successfully'})
        }else if(connection && connection.status === 'accepted'){
            return res.json({success: false, message: 'You are already connected with this user'})
        }

        return res.json({success: false, message: 'Connection request pending'})

    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Get User Connections
export const getUserConnections = async (req, res) => {
    try {
        const {userId} = req.auth()
        const user = await User.findById(userId).populate('connections followers following')

        const connections = user.connections
        const followers = user.followers
        const following = user.following

        const pendingConnections = (await Connection.find({to_user_id: userId, status: 'pending'}).populate('from_user_id')).map(connection=>connection.from_user_id)

        res.json({success: true, connections, followers, following, pendingConnections})

    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Accept Connection Request
export const acceptConnectionRequest = async (req, res) => {
    try {
        const {userId} = req.auth()
        const { id } = req.body;

        const connection = await Connection.findOne({from_user_id: id, to_user_id: userId})

        if(!connection){
            return res.json({ success: false, message: 'Connection not found' });
        }

        const user = await User.findById(userId);
        user.connections.push(id);
        await user.save()

        const toUser = await User.findById(id);
        toUser.connections.push(userId);
        await toUser.save()

        connection.status = 'accepted';
        await connection.save()

        res.json({ success: true, message: 'Connection accepted successfully' });

    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}


// Get User Profiles
export const getUserProfiles = async (req, res) =>{
    try {
        const { profileId } = req.body;
        const profile = await User.findById(profileId)
        if(!profile){
            return res.json({ success: false, message: "Profile not found" });
        }
        const posts = await Post.find({user: profileId}).populate('user')

        res.json({success: true, profile, posts})
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}