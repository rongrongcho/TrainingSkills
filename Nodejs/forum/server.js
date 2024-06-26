const express = require("express");
const app = express();
const { MongoClient, ObjectId } = require("mongodb");
const methodOverride = require("method-override");
const bcrypt = require("bcrypt");
const MongoStore = require("connect-mongo");
// 환경 변수를 별도의 파일로 분리하기
require("dotenv").config();
app.use(methodOverride("_method"));
app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
//요청.body 쓰려면 필요한 코드 2줄
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//===passport 라이브러리 셋팅 ===

const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");

//====websoket 셋팅 ====
const { createServer } = require("http");
const { Server } = require("socket.io");
const server = createServer(app);
const io = new Server(server);

app.use(passport.initialize());
app.use(
  session({
    secret: "암호화에 쓸 비번",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 }, //세션의 유효시간 설정하기 (밀리세컨드 단위로 입력)
    store: MongoStore.create({
      mongoUrl: process.env.DB_URL, //DB 접속용 Url
      dbName: "forum", // db 이름
    }),
  })
);

app.use(passport.session());

//==========================

const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "lcrbuket",
    key: function (요청, file, cb) {
      cb(null, Date.now().toString()); //업로드시 파일명 변경가능
    },
  }),
});

//==========================

let connectDB = require("./database.js");
const { Stream } = require("stream");
let db;
let changeStream;
connectDB
  .then((client) => {
    console.log("DB연결성공");
    db = client.db("forum");
    changeStream = db
      .collection("post")
      .watch([{ $match: { operationType: "insert" } }]);
  })
  .catch((err) => {
    console.log(err);
  });

server.listen(process.env.PORT, () => {
  console.log("http://localhost:8080 에서 서버 실행중");
});

function checkLogin(요청, 응답, next) {
  if (!요청.user) {
    응답.send("로그인하세요!");
  }
  next();
}

app.get("/", checkLogin, (요청, 응답) => {
  응답.sendFile(__dirname + "/index.html");
});

app.get("/news", (요청, 응답) => {
  응답.send("오늘 비가 오네요");
});

app.get("/shop", (요청, 응답) => {
  응답.send("쇼핑몰 페이지");
});

app.get("/about", (요청, 응답) => {
  응답.sendFile(__dirname + "/about.html");
});

app.get("/list", async (요청, 응답) => {
  let result = await db.collection("post").find().toArray();
  응답.render("list.ejs", { 글목록: result });
});
app.get("/write", (요청, 응답) => {
  응답.render("write.ejs");
});
app.post("/add", upload.single("img1"), async (요청, 응답) => {
  try {
    if (요청.body.title.trim() === "" || 요청.body.content.trim() === "") {
      return 응답.send("공백 저장 불가!! 제목 혹은 내용을 입력해주세요!");
    }

    await db.collection("post").insertOne({
      title: 요청.body.title,
      content: 요청.body.content,
      img: 요청.file ? 요청.file.location : "",
      user: 요청.user._id,
      username: 요청.user.username,
    });

    응답.redirect("/list");
  } catch (에러) {
    console.error(에러);
    응답.status(500).send("서버 에러 발생");
  }
});

app.get("/detail/:id", async (요청, 응답) => {
  try {
    let result = await db
      .collection("post")
      .findOne({ _id: new ObjectId(요청.params.id) });
    console.log(요청.params);
    //나중에 인덱스 추가해주자
    let result2 = await db
      .collection("comment")
      .find({
        parentId: new ObjectId(요청.params.id),
      })
      .toArray();
    if (result == null) {
      응답.status(404).send("잘못된 url, 비정상적인 접근입니다. ");
    }
    응답.render("detail.ejs", { result: result, result2: result2 });
  } catch (e) {
    console.log(e);
    응답.status(404).send("잘못된 url, 비정상적인 접근입니다. ");
  }
});

app.get("/edit/:id", async (요청, 응답) => {
  try {
    let result = await db
      .collection("post")
      .findOne({ _id: new ObjectId(요청.params.id) });

    if (!result) {
      // 요청된 데이터가 존재하지 않는 경우
      return 응답.status(404).send("게시물을 찾을 수 없습니다.");
    }

    console.log(result);
    응답.render("edit.ejs", { result: result });
  } catch (error) {
    // 데이터베이스 쿼리나 연산에서 오류가 발생한 경우
    console.error(
      "데이터베이스에서 게시물을 검색하는 중 오류가 발생했습니다:",
      error
    );
    응답.status(500).send("서버에서 오류가 발생했습니다.");
  }
});

app.put("/edit", async (요청, 응답) => {
  try {
    const { id, title, content } = 요청.body;

    if (!title || !content) {
      // 제목 혹은 내용이 누락된 경우
      return 응답.status(400).send("제목 및 내용을 채워주세요 ");
    }

    await db
      .collection("post")
      .updateOne({ _id: new ObjectId(id) }, { $set: { title, content } });

    응답.redirect("/list");
  } catch (error) {
    // 데이터베이스  오류가 발생한 경우
    console.error(
      "데이터베이스에서 게시물을 업데이트하는 중 오류가 발생했습니다:",
      error
    );
    응답.status(500).send("서버에서 오류가 발생했습니다.");
  }
});

app.delete("/delete", async (요청, 응답) => {
  await db.collection("post").deleteOne({
    _id: new ObjectId(요청.query.docid),
    user: new ObjectId(요청.query._id),
  });
  응답.send("삭제완료");
});

//paginatio url parameter

app.get("/list/:id", async (요청, 응답) => {
  // 각 페이지 버튼에 맞는 게시글 다섯개씩 쪼개서 가져오기
  let result = await db
    .collection("post")
    .find()
    .skip((요청.params.id - 1) * 5)
    .limit(5)
    .toArray();
  응답.render("list.ejs", { 글목록: result });
});

app.get("/list/next/:id", async (요청, 응답) => {
  //현재 보고있는 페이지의 다음 페이지 불러오기
  let result = await db
    .collection("post")
    .find({ _id: { $gt: new ObjectId(요청.params.id) } })
    .limit(5)
    .toArray();
  응답.render("list.ejs", { 글목록: result });
});

// 로그인 기능 구현 (passport 라이브러리 사용)
passport.use(
  new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db
      .collection("user")
      .findOne({ username: 입력한아이디 });
    if (!result) {
      return cb(null, false, { message: "아이디 DB에 없음" });
    } // user가 입력한 비밀번호와 DB에 저장된 비밀번호 비교 -> 해싱처리

    if (await bcrypt.compare(입력한비번, result.password)) {
      return cb(null, result);
    } else {
      return cb(null, false, { message: "비번불일치" });
    }
  })
);

//로그인시 세션 생성하기
passport.serializeUser((user, done) => {
  process.nextTick(() => {
    done(null, { id: user._id, username: user.username });
  });
});
//쿠키 분석 역할
passport.deserializeUser(async (user, done) => {
  let result = await db
    .collection("user")
    .findOne({ _id: new ObjectId(user.id) });
  delete result.password;
  process.nextTick(() => {
    return done(null, result); //요청.user에 들어감
  });
});

app.get("/login", async (요청, 응답) => {
  console.log(요청.user);
  응답.render("login.ejs");
});

app.post("/login", async (요청, 응답, next) => {
  //DB와의 비교작업이 끝나면 ()=>{} 함수 안에 있는 코드를 실행시켜줌
  passport.authenticate("local", (error, user, info) => {
    if (error) return 응답.status(500).json(error);
    if (!user) return 응답.status(401).json(info.message);
    요청.logIn(user, (err) => {
      if (err) return next(err);
      응답.redirect("/"); // 로그인 완료시 실행할 코드
    });
  })(요청, 응답, next);
});

//==회원 가입

app.get("/register", (요청, 응답) => {
  응답.render("register.ejs");
});

app.post("/register", async (요청, 응답) => {
  let 해시 = await bcrypt.hash(요청.body.password, 10);
  await db
    .collection("user")
    .insertOne({ username: 요청.body.username, password: 해시 });
  응답.redirect("/");
});

//require
require("./routes/shop.js");

app.use("/", require("./routes/shop.js"));

//검색 기능 만들기 (search index 사용하기)
app.get("/search", async (요청, 응답) => {
  let 검색조건 = [
    {
      $search: {
        index: "tilte",
        text: { query: 요청.query.val, path: "title" },
      },
    },
  ];
  let result = await db.collection("post").aggregate(검색조건).toArray();
  응답.render("search.ejs", { 글목록: result });
});

//댓글 기능 추가
app.post("/comment", async (요청, 응답) => {
  await db.collection("comment").insertOne({
    content: 요청.body.content,
    writerId: new ObjectId(요청.user._id),
    writer: 요청.user.username,
    parentId: new ObjectId(요청.body.parentId),
  });
  응답.redirect("back");
});

//채팅방 발행 기능 추가
app.get("/chat/request", async (요청, 응답) => {
  await db.collection("chatroom").insertOne({
    member: [요청.user._id, new ObjectId(요청.query.writerId)],
    date: new Date(),
  });
  응답.redirect("/chat/list");
});

//채팅방 목록 보여주기
app.get("/chat/list", async (요청, 응답) => {
  let result = await db
    .collection("chatroom")
    .find({ member: 요청.user._id })
    .toArray();
  응답.render("chatList.ejs", { result: result });
});

//채팅방 상세페이지 보여주기
app.get("/chat/detail/:id", async (요청, 응답) => {
  let result = await db.collection("chatroom").findOne({
    _id: new ObjectId(요청.params.id),
  });
  응답.render("chatDetail.ejs", { result: result });
});

//웹소켓
io.on("connection", (socket) => {
  socket.on("age", (data) => {
    console.log("유저가보낸거", data);
    io.emit("name", "lee");
  });
  socket.on("ask-join", (data) => {
    socket.join(data);
  });
  socket.on("message-send", (data) => {
    console.log(data); // test
    io.to(data.room).emit("message-broadcast", data.msg);
  });
});

//SSE

app.get("/stream/list", (요청, 응답) => {
  응답.writeHead(200, {
    //http 요청을 끊지 않고 계속 연결
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });

  //change stream
  changeStream.on("change", (result) => {
    console.log(result);
    //유저에게 보내주기
    setInterval(() => {
      응답.write("event: msg\n");
      응답.write(`data: ${JSON.stringify(result.fullDocument)}\n\n`);
    }, 1000);
  });
});
