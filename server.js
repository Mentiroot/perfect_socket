const express = require("express");
const mongoose = require("mongoose");
const socketio = require("socket.io");
const session = require('express-session')
const id_generator = require('./id_generator');
const sharedSession = require("express-socket.io-session")
const MongoStore = require('connect-mongo');
const SocketIOFileUpload = require('socketio-file-upload')
const fs = require('fs');

const filePath = 'server.js';

const app = express();
const http = require('http');
const path = require("path");
const server = http.createServer(app)
app.use(express.static(path.join(__dirname, 'public')));

const io = socketio(server);

mongoose.connect("mongodb://localhost:27017/new_db", {
    useNewUrlParser: true,
    useUnifiedTopology: true
})

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const MemberSchema = new mongoose.Schema({
    user_id: String,
    name: String,
    password: String
});
const ProductSchema = new mongoose.Schema({
    pro_id: String,
    pro_name:String,
    pro_des:String,
    pro_price:Number,
    user_id:String,
    img:String
})

const Membermodel = mongoose.model("members", MemberSchema);
const Productmodel = mongoose.model("products", ProductSchema);

const sessionMiddleware = session({
    secret: 'Mentiroot', // เปลี่ยนเป็นคีย์ลับจริงของคุณ
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: 'mongodb://localhost:27017/new_db',
        dbName: 'session', // กำหนดชื่อของ collection ที่จะใช้เก็บ session ใน MongoDB
        ttl: 7 * 24 * 60 * 60, // กำหนด TTL (time-to-live) ในวินาทีสำหรับ session ใน MongoDB
    })
});

app.get("/",(req,res)=>{
    //res.sendFile(path.join(__dirname,"views/index.html"))
    res.sendFile(path.join(__dirname,"index.html"))
});

app.get("/login",(req,res)=>{
    // res.sendFile(path.join(__dirname,"views/login.html"))
    res.sendFile(path.join(__dirname,"login.html"))
});
app.get("/add_product",(req,res)=>{
    // res.sendFile(path.join(__dirname,"views/login.html"))
    res.sendFile(path.join(__dirname,"add_pro.html"))
});
app.use(sessionMiddleware)

io.use((socket, next) => {
    sessionMiddleware(socket.handshake,{}, next);
});

io.use(sharedSession(sessionMiddleware, {
     autoSave: true
}));



io.on("connection",(socket)=>{
    const mysession =  socket.handshake.session
    socket.on('look_pro',(data)=>{
        Productmodel.aggregate([
            {$lookup:{
                from:"members",
                localField:"user_id",
                foreignField:"user_id",
                as:"show_select_pro"
            }},{
                $match:{"pro_id":data}
            }
    ]).then((data)=>{
        if(data.length > 0){
            socket.emit('send_select_pro',data)
        }
    })
    })
    socket.on("upload", (fileData, callback) => {
    if(fileData.pro_name != "" && fileData.pro_price != ""){
        console.log(fileData)
        // แปลงข้อมูลไฟล์ให้เป็น Buffer
        const fileBuffer = Buffer.from(fileData.data);
    
        // ระบุเส้นทางเต็มของโฟลเดอร์ all_image
        const folderPath = path.join(__dirname, 'public/all_image');
    
        // ถ้าโฟลเดอร์ยังไม่มีอยู่ ให้สร้างใหม่
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath);
        }
        fileData.name = `${id_generator(10)}.jpg`
        // บันทึกไฟล์ลงในโฟลเดอร์ all_image
        fs.writeFile(path.join(folderPath, fileData.name), fileBuffer, (err) => {
          if (!err) {
            const img_pro = new Productmodel({
                pro_id: `Product_${id_generator(50)}`,
                pro_name:fileData.pro_name,
                pro_des:fileData.pro_des,
                pro_price:fileData.pro_price,
                user_id:mysession.user.user_id,
                img:fileData.name
            })
            img_pro.save().then(socket.emit("create_pro_success"))
          }
        });
    }
      });
    if(typeof mysession.user != 'undefined'){
        console.log(`New connecter
    socket id: ${socket.id};
    Username: ${mysession.user.name}
    User id: ${mysession.user.user_id}`);
    socket.join(mysession.user.user_id)
    }else{
        console.log(`Unknow user connected`);
    }
    socket.on('sendmessing',(data)=>{
        
        socket.to('Ku1Gidn544QVdnik7c2n6IIKzIP3We9IsarX3GBjY1cK0MyUmf').emit('getmessing',data)
    })
     
    socket.on('get_pro',()=>{
        Productmodel.aggregate([
            {$lookup:{
                from:"members",
                localField:"user_id",
                foreignField:"user_id",
                as:"new_user"
            }}
        ]).then((data)=>{
            console.log(data)
            socket.emit("send_pro_back",data)
        })
    })
    socket.on("login",(data)=>{
        console.log(data)
        Membermodel.aggregate([{
            $match:{
                $and:[
                    {name:data.username},
                    {password:data.password}
                ]
            }
        }]).then((db_data)=>{
            if(db_data.length > 0){
               mysession.user = db_data[0]
               mysession.save();
            socket.emit("login_back",{status:1,name:mysession.user.user_id});
            }else{
                socket.emit("login_back",{status:0,name:data.name});
            }
        });
        // mysession.user = data.username
        // mysession.save()
        // console.log(mysession)
    });

    socket.on("register",(data)=>{
        console.log(`New user register :
        User name: ${data.username}
        `);
            const Usersave = new Membermodel({
                user_id: `User_${id_generator(50)}`,
                name: data.username,
                password: data.password
            });
            Membermodel.aggregate([{
                $match:{
                    name:data.username,
                }
            }]).then((db_data)=>{
                if(db_data.length > 0){
                    socket.emit("register_back",{status:2,name:data.username})
                    console.log("Register fail alredy exist")
                }else{
                    Usersave.save().then(socket.emit("register_back",{status:1,name:data.username}))
                    console.log("Register success")
                }
            })
    });

    socket.on("check",(data)=>{
        if(typeof mysession.user != 'undefined'){
        console.log(mysession.user.user_id +" wowowowo") 
        }else{
            socket.emit("send_back")
        }
    })

    socket.on('create_pro',(data)=>{
        const create_pro = new Productmodel({
            pro_id: `Product_${id_generator(50)}`,
            pro_name:data.name,
            pro_des:data.detail,
            pro_price:data.price,
            user_id:mysession.user.user_id
        })
        if(data.name != "" && data.price != "" && data.price > 0){
            create_pro.save().then(socket.emit("create_pro_success",{name:data.name,price:data.price,detail:data.detail}))
        }
    })

    socket.on('logout',()=>{
        delete mysession.user;
        socket.emit("logout")
    })

    socket.on('disconnect',()=>{
        
    })
});

server.listen(8080, () => {
    console.log('Server is running on port 8080');
});
