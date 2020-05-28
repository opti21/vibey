require("dotenv").config();

const config = require("./config/config");
const version = require("project-version");
console.log("Version: " + version);

const express = require("express");
const app = express();
const server = require("http").Server(app);
const passport = require("passport");
const twitchStrategy = require("passport-twitch.js").Strategy;
const bodyParser = require("body-parser");
const cookieSession = require("cookie-session");
const spotifyUri = require("spotify-uri");
const Spotify = require("node-spotify-api");
const spotify = new Spotify({
  id: process.env.SPOTIFY_ID,
  secret: process.env.SPOTIFY_SECRET,
});
const YouTube = require("simple-youtube-api");
const youtube = new YouTube(process.env.YT_API);
const moment = require("moment-timezone");
const io = require("socket.io")(server);
global.io = io;
const fetchJson = require("fetch-json");
const ComfyDiscord = require("comfydiscord");
const admins = config.admins;
const exec = require("child_process").exec;
const he = require("he");
const sgMail = require("@sendgrid/mail");
const fs = require("fs");
const axios = require("axios");
const qs = require("querystring");
const ComfyJS = require("comfy.js");
ComfyJS.Init(config.comfyChan);

// SendGrid Emails
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Discord Init
ComfyDiscord.Init(process.env.DISCORDTOKEN);

// Tiwtch Creds for App
const TwitchCreds = require("./models/twitchCreds");

getTwitchCreds();
async function getTwitchCreds() {
  const twitchCreds = await TwitchCreds.findOne({});
  console.log(twitchCreds);
  if (twitchCreds === null) {
    const twitchUserURL = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENTID}&client_secret=${process.env.TWITCH_SECRET}&scope=user_read&grant_type=client_credentials`;
    console.log(twitchUserURL);
    const twitchResource = {};
    const handleData = (data) => {
      console.log(data);
      const newTwitch = new TwitchCreds({
        accessToken: data.access_token,
        expireAt: moment().utc().add(data.expires_in, "seconds"),
      });
      newTwitch
        .save()
        .then(console.log("New Twitch Creds created"))
        .catch(console.error);
    };
    fetchJson.post(twitchUserURL).then(handleData).catch(console.error);
  } else {
    console.log("Twitch Creds already exist");
  }
}

//Test Message
// errTxt("REALLY BAD ERROR");

// Real time data
const rqs = io.of("/req-namescape");
const polls = io.of("/polls-namescape");
const hellos = io.of("/hellos-namescape");

rqs.on("connection", function (socket) {
  console.log("Connected to requests");
  // Trigger front end notification
  socket.emit("socketConnect", {});

  //Whenever someone disconnects this piece of code executed
  rqs.on("disconnect", function () {
    console.log("User disconnected from requests");
  });
});

app.set("trust proxy", 1);
app.set("views", "./views");
app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  cookieSession({
    name: "session",
    secret: `${process.env.SESSION_SECRET}`,
    saveUninitialized: false,
    resave: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Route Files
const indexRoute = require("./routes/index");
const authRoute = require("./routes/auth");
const reqsRoute = require("./routes/requests");
const mixRoute = require("./routes/mix");
const widgetRoute = require("./routes/widget");
const apiRoute = require("./routes/api");
const settingsRoute = require("./routes/settings");

app.use("/", indexRoute);
app.use("/auth", authRoute);
app.use("/requests", reqsRoute);
app.use("/mix", mixRoute);
app.use("/widget", widgetRoute);
app.use("/api", apiRoute);
app.use("/settings", settingsRoute);

// Databae
const mongoose = require("mongoose");

switch (process.env.NODE_ENV) {
  case "production":
    mongoose
      .connect(
        `mongodb+srv://vibey_bot:${process.env.DB_PASS}@cluster0-gtgmw.mongodb.net/vibeybot?retryWrites=true&w=majority`,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useCreateIndex: true,
        }
      )
      .catch(function (err) {
        // TODO: Throw error page if DB doesn't connect
        console.error(
          "Unable to connect to the mongodb instance. Error: ",
          err
        );
      });
    break;

  case "staging":
    mongoose
      .connect(
        `mongodb+srv://vibey_bot:${process.env.DB_PASS}@cluster0-gtgmw.mongodb.net/vibeystaging?retryWrites=true&w=majority`,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useCreateIndex: true,
        }
      )
      .catch(function (err) {
        // TODO: Throw error page if DB doesn't connect
        console.error(
          "Unable to connect to the mongodb instance. Error: ",
          err
        );
      });
    break;

  case "dev":
    mongoose
      .connect(
        `mongodb+srv://vibey_bot:${process.env.DB_PASS}@cluster0-gtgmw.mongodb.net/vibeystaging?retryWrites=true&w=majority`,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useCreateIndex: true,
        }
      )
      .catch(function (err) {
        // TODO: Throw error page if DB doesn't connect
        console.error(
          "Unable to connect to the mongodb instance. Error: ",
          err
        );
      });
    break;
}

const db = mongoose.connection;
db.on("error", (error) => {
  console.error(error);
});
db.once("open", () => console.log("Connected to Mongoose " + Date()));

//Models
const User = require("./models/users");
const SongRequest = require("./models/songRequests");
const Poll = require("./models/polls");
const Good = require("./models/goods");
const ChatUser = require("./models/chatUser");

// Twitch auth
passport.use(
  new twitchStrategy(
    {
      clientID: process.env.TWITCH_CLIENTID,
      clientSecret: process.env.TWITCH_SECRET,
      callbackURL: `${process.env.APP_URL}/auth/twitch/callback`,
      scope: "user:read:email",
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        User.findOne({ twitch_id: profile.id })
          .exec()
          .then(function (UserSearch) {
            if (UserSearch === null) {
              var user = new User({
                twitch_id: profile.id,
                username: profile.login,
                display_name: profile.display_name,
                email: profile.email,
                profile_pic_url: profile.profile_image_url,
                provider: "twitch",
                twitch: profile,
                accessToken: accessToken,
                refreshToken: refreshToken,
                expireAt: moment().utc().add(8, "hours"),
              });
              console.log("New user created");
              user.save();
              return done(null, profile);
            } else {
              console.log("User already exists");
              console.log(UserSearch.twitch_id);
              return done(null, profile);
            }
          })
          .catch((err) => {
            console.error(err);
          });
      } catch (err) {
        console.error(err);
      }
    }
  )
);

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

/* *** DON'T PLACE ANY PAGES ***
 ***  AFTER THE 404 PAGE   *** */
//404
app.get("*", (req, res) => {
  res.render("404");
});

// Twitch Client
const tmi = require("tmi.js");
const twitchclientid = process.env.TWITCH_CLIENTID;
const twitchuser = process.env.TWITCH_USER;
const twitchpass = process.env.TWITCH_PASS;
const twitchChan = config.twitchChan;

const tmiOptions = {
  options: {
    debug: true,
    clientId: twitchclientid,
  },
  connection: {
    reconnect: true,
  },
  identity: {
    username: twitchuser,
    password: twitchpass,
  },
  channels: twitchChan,
};

const botclient = new tmi.client(tmiOptions);

// Connect the twitch chat client to the server..
botclient.connect();
global.botclient = botclient;

// Bot says hello on connect
botclient.on("connected", (address, port) => {
  // botclient.say(twitchChan[0], `Hey Chat! Send me those vibes`)
  console.log("connected to twitch chat client");
});

// Regex
const URLRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
const spRegex = /https?:\/\/(?:embed\.|open\.)(?:spotify\.com\/)(?:track\/|\?uri=spotify:track:)((\w|-){22})/;
const ytRegex = /(?:https?:\/\/)?(?:(?:(?:www\.?)?youtube\.com(?:\/(?:(?:watch\?.*?(v=[^&\s]+).*)|(?:v(\/.*))|(channel\/.+)|(?:user\/(.+))|(?:results\?(search_query=.+))))?)|(?:youtu\.be(\/.*)?))/;

function findURI(object, property, value) {
  return (
    object[property] === value ||
    Object.keys(object).some(function (k) {
      return (
        object[k] &&
        typeof object[k] === "object" &&
        findURI(object[k], property, value)
      );
    })
  );
}

function refreshTokenThenAdd(user, uri) {
  let cb_url = process.env.SPOTIFY_CALLBACK_URL;
  console.log("REFRESH TOKEN");
  console.log(user.spotify.refresh_token);

  let body = {
    client_id: process.env.SPOTIFY_ID,
    client_secret: process.env.SPOTIFY_SECRET,
    refresh_token: user.spotify.refresh_token,
    grant_type: "refresh_token",
    redirect_uri: cb_url,
  };

  let config = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  axios
    .post("https://accounts.spotify.com/api/token/", qs.stringify(body), config)

    .then((code_res) => {
      console.log(code_res.data);
      try {
        User.findOneAndUpdate(
          { twitch_id: user.twitch_id },
          {
            spotify: {
              access_token: code_res.data.access_token,
              refresh_token: user.spotify.refres_token,
              token_type: code_res.data.token_type,
              expires_in: moment()
                .utc()
                .add(code_res.data.expires_in, "seconds"),
              scope: code_res.data.scope,
            },
          },
          { new: true }
        ).then((update_res) => {
          console.log(update_res);
          console.log("token refreshed");
          checkPlaylist(uri, user.username, update_res.spotify.access_token);
        });
      } catch (e) {
        console.error(e);
      }
    })
    .catch((e) => {
      console.error(e);
    });
}

function checkPlaylist(uri, channel, user_token) {
  axios({
    method: "get",
    url: `https://api.spotify.com/v1/playlists/${config.spotify_playlist}/tracks`,
    headers: {
      Authorization: "Bearer " + user_token,
    },
    params: {
      fields: "items(track(uri))",
    },
  }).then((res) => {
    if (!findURI(res.data.items, "uri", uri)) {
      addSongtoPlaylist(uri, channel, user_token);
    } else {
      botclient.say(config.comfyChan, "Song is already on the playlist");
      return;
    }
  })
    .catch((e) => {
      console.error(e)
    });
}

function addSongtoPlaylist(uri, channel, user_token) {
  // Add song to playlist
  axios({
    method: "post",
    url: `https://api.spotify.com/v1/playlists/${config.spotify_playlist}/tracks`,
    data: {
      uris: [uri],
    },

    headers: {
      Authorization: "Bearer " + user_token,
      Accept: "application/json",
    },
  })
    .then((res) => {
      console.log(res.data);
      botclient.say(channel, "Song added to playlist successfully");
      return;
    })
}

// ComfyJs Client to catch channel point redemptions
ComfyJS.onChat = async (user, command, message, flags, extra) => {
  // console.log(extra)
  if (extra.customRewardId === "609d1f92-0dde-4057-9902-30f5f78237e6") {
    // Check to see if URL matches for spotify
    let song = command
    console.log("I see the redemption");

    if (spRegex.test(song)) {
      var spID = spotifyUri.parse(song);
      var spURI = spotifyUri.formatURI(song);
      let user = await User.findOne({ username: extra.channel });
      let user_token = user.spotify.access_token;
      let tokenExpire = user.spotify.expires_in;

      console.log(tokenExpire);
      console.log(moment(moment().utc()).isBefore(tokenExpire));

      // Check to see if token is valid
      if (moment(moment().utc()).isBefore(tokenExpire)) {
        checkPlaylist(spURI, user.username, user_token);
      } else {
        refreshTokenThenAdd(user, spURI);
      }
    } else {
      botclient.say(config.comfyChan, "Not a valid spotify URL");
    }

    // Search for song on spotify

    // Add song on playlist
  }
};

// Song Requests
botclient.on("chat", async (channel, userstate, message, self) => {
  if (self) return;
  var parsedM = message.toLowerCase().trim().split(" ");
  if (parsedM[0] === "!sr" || parsedM[0] === "!songrequest") {
    if (URLRegex.test(parsedM[1])) {
      // Spotify link
      if (spRegex.test(parsedM[1])) {
        var spID = spotifyUri.parse(parsedM[1]);
        var spURI = spotifyUri.formatURI(parsedM[1]);
        spotify
          .request(`https://api.spotify.com/v1/tracks/${spID.id}`)
          .then(function (data) {
            var newSpotSR = new SongRequest({
              track: {
                name: data.name,
                artist: data.artists[0].name,
                link: parsedM[1],
                uri: spURI,
              },
              requestedBy: userstate.username,
              timeOfReq: moment.utc().format(),
              source: "spotify",
            });
            newSpotSR
              .save()
              .then((doc) => {
                if (chatRespond) {
                  botclient.say(
                    channel,
                    `@${doc.requestedBy} requested ${doc.track[0].name} by ${doc.track[0].artist}`
                  );
                }
                // Real time data push to front end
                rqs.emit("sr-event", {
                  id: `${doc.id}`,
                  reqBy: `${doc.requestedBy}`,
                  track: `${doc.track[0].name}`,
                  artist: `${doc.track[0].artist}`,
                  uri: `${doc.track[0].uri}`,
                  link: `${doc.track[0].link}`,
                  source: `${doc.source}`,
                  timeOfReq: `${doc.timeOfReq}`,
                });
              })
              .catch((err) => {
                console.error(err);
              });
          })
          .catch(function (err) {
            console.error("Error occurred: " + err);
          });
      }
      // Youtube Link
      if (ytRegex.test(parsedM[1])) {
        youtube.getVideo(parsedM[1]).then((video) => {
          var newYTSR = new SongRequest({
            track: { name: video.title, link: parsedM[1] },
            requestedBy: userstate.username,
            timeOfReq: moment.utc().format(),
            source: "youtube",
          });
          newYTSR
            .save()
            .then((doc) => {
              if (chatRespond) {
                botclient.say(
                  channel,
                  `@${doc.requestedBy} requested ${doc.track[0].name} ${doc.track[0].link}`
                );
              }
              // Real time data push to front end
              rqs.emit("sr-event", {
                id: `${doc.id}`,
                reqBy: `${doc.requestedBy}`,
                track: `${doc.track[0].name}`,
                link: `${doc.track[0].link}`,
                source: `${doc.source}`,
                timeOfReq: `${doc.timeOfReq}`,
              });
            })
            .catch((err) => {
              console.error(err);
            });
        });
      }
    }
    // Check for text content
    if (parsedM[1] === undefined) {
      botclient.say(
        channel,
        `No input received. !requests to see how to submit requests`
      );
    } else {
      // Searches Spotify & Youtube when only text is provided
      if (!ytRegex.test(parsedM[1])) {
        var request = parsedM.slice(1).join(" ");
        var ytQuery = parsedM.slice(1).join("+");
        var ytSearch = `https://www.youtube.com/results?search_query=${ytQuery}`;
        spotify.search(
          { type: "track", query: `${request}`, limit: 1 },
          function (err, data) {
            if (data === null) {
              youtube
                .search(request, 1)
                .then((results) => {
                  var newYTSR = new SongRequest({
                    track: {
                      name: results[0].title,
                      link: `https://youtu.be/${results[0].id}`,
                    },
                    requestedBy: userstate.username,
                    timeOfReq: moment.utc().format(),
                    source: "youtube",
                  });
                  newYTSR
                    .save()
                    .then((doc) => {
                      if (chatRespond) {
                        botclient.say(
                          channel,
                          `@${doc.requestedBy} requested ${doc.track[0].name} https://youtu.be/${results[0].id}`
                        );
                      }

                      // Real time data push to front end
                      rqs.emit("sr-event", {
                        id: `${doc.id}`,
                        reqBy: `${doc.requestedBy}`,
                        track: `${doc.track[0].name}`,
                        link: `${doc.track[0].link}`,
                        source: `${doc.source}`,
                        timeOfReq: `${doc.timeOfReq}`,
                      });
                    })
                    .catch((err) => {
                      console.error(err);
                    });
                })
                .catch(console.error);
            } else {
              var newSpotSR = new SongRequest({
                track: {
                  name: data.tracks.items[0].name,
                  artist: data.tracks.items[0].artists[0].name,
                  link: data.tracks.items[0].external_urls.spotify,
                  uri: data.tracks.items[0].uri,
                },
                requestedBy: userstate.username,
                timeOfReq: moment.utc().format(),
                source: "spotify",
              });
              newSpotSR.save().then((doc) => {
                if (chatRespond) {
                  botclient.say(
                    channel,
                    `@${doc.requestedBy} requested ${doc.track[0].name} by ${doc.track[0].artist} - ${doc.track[0].link}`
                  );
                }

                // Real time data push to front end
                rqs.emit("sr-event", {
                  id: `${doc.id}`,
                  reqBy: `${doc.requestedBy}`,
                  track: `${doc.track[0].name}`,
                  artist: `${doc.track[0].artist}`,
                  uri: `${doc.track[0].uri}`,
                  link: `${doc.track[0].link}`,
                  source: `${doc.source}`,
                  timeOfReq: `${doc.timeOfReq}`,
                });
              });
            }
          }
        );
      }
    }
  }

  if (parsedM[0] === "!tr") {
    var request = parsedM.slice(1).join(" ");
    var newText = new SongRequest({
      track: {
        name: request,
      },
      requestedBy: userstate.username,
      timeOfReq: moment.utc().format(),
      source: "text",
    });
    newText
      .save()
      .then((doc) => {
        botclient.say(
          channel,
          `@${doc.requestedBy} requested ${doc.track[0].name}`
        );
        // Real time data push to front end
        rqs.emit("sr-event", {
          id: `${doc.id}`,
          reqBy: `${doc.requestedBy}`,
          track: `${doc.track[0].name}`,
          source: `${doc.source}`,
          timeOfReq: `${doc.timeOfReq}`,
        });
      })
      .catch(console.error);
  }
  // Choice selection for polls
  let numRegex = /^[0-9]+$/;
  // Check to see if message is only numbers
  if (numRegex.test(message) == true) {
    var poll = await Poll.findOne({ active: true });
    if (!poll) {
      // if no poll say nothing because bot will spam
      return;
    }
    // Check if the user has already voted
    if (poll.voters.includes(userstate.username)) {
      // Check if multiple votes are allowed
      if (poll.allow_multiple_votes == true) {
        var numIndex = message.search(/\d/);
        var int = message[numIndex];
        var choice = parseInt(int, 10);
        var cIndex = choice - 1;
        var cID = poll.choices[cIndex].id;
        var currV = poll.choices[cIndex].votes;
        var i = currV + 1;
        var tUser = userstate.username;

        await Poll.findOneAndUpdate(
          { _id: poll.id, "choices.id": cID },
          { $addToSet: { voters: tUser }, $set: { "choices.$.votes": i } },
          { useFindAndModify: false, new: true },
          (err, doc) => {
            // console.log(doc.choices[cIndex].votes);
            // console.log(doc);
            polls.emit("pollUpdate", {
              doc: doc,
            });
          }
        );
      } else {
        botclient.say(channel, `@${userstate.username} you've already voted`);
        return;
      }
    } else {
      var numIndex = message.search(/\d/);
      var int = message[numIndex];
      var choice = parseInt(int, 10);
      var cIndex = choice - 1;
      var cID = poll.choices[cIndex].id;
      var currV = poll.choices[cIndex].votes;
      var i = currV + 1;
      var tUser = userstate.username;
      await Poll.findOneAndUpdate(
        { _id: poll.id, "choices.id": cID },
        { $addToSet: { voters: tUser }, $set: { "choices.$.votes": i } },
        { useFindAndModify: false, new: true },
        (err, doc) => {
          // console.log(doc.choices[cIndex].votes);
          // console.log(doc);
          polls.emit("pollUpdate", {
            doc: doc,
          });
        }
      );
    }
  }

  if (parsedM[0] === "!deleteall") {
    if (admins.includes(userstate.username)) {
      await Poll.deleteMany({}).then((err, doc) => {
        if (err) {
          console.error(err);

          return;
        }
        botclient.say(twitchChan[0], `Polls deleted!`);
      });
    }
  }

  if (parsedM[0] === "!p") {
    if (admins.includes(userstate.username)) {
      var poll = await Poll.findOne({});
      console.log(poll);
    }
  }

  if (parsedM[0] === "!goodnews" || parsedM[0] === "!goodn") {
    var tUser = userstate["user-id"];
    var twitchCreds = await TwitchCreds.findOne({});
    var goodnews = parsedM.slice(1).join(" ");
    console.log(tUser);
    console.log(twitchCreds);
    var url = `https://api.twitch.tv/helix/users?id=${tUser}`;
    var params = {};
    var options = {
      headers: {
        "Client-ID": `${process.env.TWITCH_CLIENTID}`,
        Authorization: `Bearer ${twitchCreds.accessToken}`,
      },
    };
    async function handleData(data) {
      console.log(data.data[0].profile_image_url);
      var newGood = new Good({
        user: userstate.username,
        userPic: data.data[0].profile_image_url,
        news: goodnews,
      });
      ComfyDiscord.Say(
        "good-news",
        `${userstate.username}'s good news: ${goodnews}`
      );
      newGood.save();
    }

    fetchJson.get(url, params, options).then(handleData);
  }

  if (parsedM[0] === "!science" && admins.includes(userstate.username)) {
    var handleData = (data) => {
      var diff = capitalize(data.results[0].difficulty);
      var q = data.results[0].question;
      answer = data.results[0].correct_answer;
      botclient.say(
        twitchChan[0],
        he.decode(
          `@veryhandsomebilly SCIENCE QUESTION Difficulty: ${diff} Question: ${q}`
        )
      );
      // console.log('Difficulty: ' + diff + 'Question: ' + q)
    };
    fetchJson
      .get("https://opentdb.com/api.php?amount=1&category=17")
      .then(handleData);
  }

  if (parsedM[0] === "!answer" && admins.includes(userstate.username)) {
    botclient.say(twitchChan[0], he.decode(`${answer}`));
    // console.log(answer)
  }

  // Time Command
  if (parsedM[0] === "!time") {
    var day = moment.tz(moment(), "Pacific/Auckland").format("dddd");
    var dNum = moment.tz(moment(), "Pacific/Auckland").format("Do");
    var month = moment.tz(moment(), "Pacific/Auckland").format("MMMM");
    var time = moment.tz(moment(), "Pacific/Auckland").format("hh:mmA");
    botclient.say(
      twitchChan[0],
      `In New Zealand it is currently ${day} the ${dNum} of ${month} and the time is ${time}`
    );
  }

  if (parsedM[0] === "!wolfram") {
    var query = he.encode(`${parsedM.slice(1).join(" ")}`);
    var handleData = (data) => {
      console.log(data);
      botclient.say(twitchChan[0], he.decode(`${data.bodyText}`));
    };
    fetchJson
      .get(
        `http://api.wolframalpha.com/v1/result?appid=${process.env.WOLFRAM_APPID}&i=${query}&units=metric`
      )
      .then(handleData);
  }

  if (parsedM[0] === "!wolframi") {
    var query = he.encode(`${parsedM.slice(1).join(" ")}`);
    var handleData = (data) => {
      console.log(data);
      botclient.say(twitchChan[0], he.decode(`${data.bodyText}`));
    };
    fetchJson
      .get(
        `http://api.wolframalpha.com/v1/result?appid=${process.env.WOLFRAM_APPID}&i=${query}&units=imperial`
      )
      .then(handleData);
  }

  if (parsedM[0] === "!horoscope") {
    var sign = parsedM[1];
    var handleData = (data) => {
      console.log(data);
      if (data.sunsign === "undefined") {
        botclient.say(
          twitchChan[0],
          "No sign received Example: !horoscope Libra"
        );
      } else {
        botclient.say(twitchChan[0], he.decode(`${data.horoscope}`));
      }
    };
    fetchJson
      .get(`http://horoscope-api.herokuapp.com/horoscope/today/${sign}`)
      .then(handleData);
  }

  if (parsedM[0] === "!reply" && admins.includes(userstate.username)) {
    if (chatRespond === true) {
      botclient.say(twitchChan[0], he.decode(`RESPONSES TURNED OFF`));
      chatRespond = !chatRespond;
      console.log(chatRespond);
    } else {
      botclient.say(twitchChan[0], he.decode(`RESPONSES TURNED ON`));
      console.log(chatRespond);
      chatRespond = !chatRespond;
    }
  }

  if (parsedM[0] === "!test" && admins.includes(userstate.username)) {
    botclient.say(twitchChan[0], he.decode(`THIS IS A TEST`));
  }
});
// Bot replies
var chatRespond = true;

// Answer for !science
var answer = "";

const port = process.env.PORT || 3000;
server.listen(port);

// Utils
const capitalize = (s) => {
  if (typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function makeid(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
