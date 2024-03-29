require('dotenv').config();
const router = require('express').Router();
const version = require('project-version');
const enviroment = process.env.NODE_ENV;
const User = require('../models/users');
const ChatUser = require('../models/chatUser');
const Queue = require('../models/queues');
const config = require('../config/config');
const admins = config.admins;
const JoinedChannel = require('../models/joinedChannels');
const SongRequest = require('../models/songRequests');
const rqs = io.of('/req-namescape');
const SeTokens = require('../models/setokens')

function loggedIn(req, res, next) {
  if (!req.user) {
    res.redirect('/login');
  } else {
    next();
  }
}

// Front page
router.get('/', (req, res) => {
  res.redirect(`/u/requests/${res.user.login}`);
});

// Login
router.get('/login', (req, res) => {
  res.render('login');
});

// Logout
router.get('/logout', async function (req, res) {
  try {
    req.session = null;
    req.user = null;
    req.logout();
    res.render('bye');
  } catch (err) {
    console.error(err);
  }
});

router.get('/:channel/dashboard', loggedIn, async (req, res) => {
  let isChannelOwner = req.user.login === req.params.channel;
  let isAdmin = admins.includes(req.user.login);
  let isMod;
  let isAllowed;
  let user = await User.findOne({twitch_id: req.user.id});
  
  let botConnected = await JoinedChannel.exists({
    channel: req.params.channel,
  });

  console.log(botConnected);

  if (isAdmin || isChannelOwner) {
    isAllowed = true;
  }
  if (isAdmin === false && isChannelOwner === false) {
  }
  res.render('dashboard', {
    isAllowed: isAllowed,
    botConnected: botConnected,
    ppConnected: user.paypal_connected,
    ppEmail: user.paypal_email,
    loggedInUser: req.user.login,
    channel: req.params.channel,
    loggedInUserPic: req.user['profile_image_url'],
    version: version,
    enviroment: enviroment,
  });
});

router.get('/stats', loggedIn, async (req, res) => {
  let isAdmin = admins.includes(req.user.login);
  let isAllowed;
  let user = await User.findOne({twitch_id: req.user.id});
  
  let botConnected = await JoinedChannel.exists({
    channel: req.params.channel,
  });

  console.log(botConnected);

  if (isAdmin || isChannelOwner) {
    isAllowed = true;
  }
  res.render('stats', {
    isAllowed: isAllowed,
    loggedInUser: req.user.login,
    channel: req.params.channel,
    loggedInUserPic: req.user['profile_image_url'],
    version: version,
    enviroment: enviroment,
  });
});

router.get('/:channel/queue', loggedIn, async (req, res) => {
  let isChannelOwner = req.user.login === req.params.channel;
  let isAdmin = admins.includes(req.user.login);
  let isMod;
  let isAllowed;
  if (isAdmin || isChannelOwner) {
    isAllowed = true;
  }
  res.render('queue', {
    isAllowed: isAllowed,
    loggedInUser: req.user.login,
    channel: req.params.channel,
    loggedInUserPic: req.user['profile_image_url'],
    version: version,
    enviroment: enviroment,
  });
});

router.get('/:channel/queue-settings', loggedIn, async (req, res) => {
  let isChannelOwner = req.user.login === req.params.channel;
  let isAdmin = admins.includes(req.user.login);
  let isMod;
  let isAllowed;
  if (isAdmin || isChannelOwner) {
    isAllowed = true;
  }
  let queue = Queue.findOne({ channel: req.params.channel }).select(
    'allowReqs -_id'
  );
  res.render('queue', {
    isAllowed: isAllowed,
    loggedInUser: req.user.login,
    channel: req.params.channel,
    queue: queue,
    loggedInUserPic: req.user['profile_image_url'],
    version: version,
    enviroment: enviroment,
  });
});

router.get('/poll', loggedIn, async (req, res) => {
  try {
    let isAdmin = admins.includes(req.user.login);
    var user = await User.findOne({ twitch_id: req.user.id });
    // console.log(user.username);
    if (user === null) {
      res.redirect('/login');
    }
    if (admins.includes(user.username)) {
      res.render('poll', {
        isAllowed: true,
        loggedInUser: req.user.login,
        loggedInUserPic: req.user['profile_image_url'],
        channel: req.user.login,
        version: version,
        feUser: user.username,
        profilePic: req.user['profile_image_url'],
        enviroment: enviroment,
      });
    } else {
      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
  }
});

// Test
router.get('/test', function (req, res) {
  console.log('REQ.SESSION:');
  console.log(req.user);
  res.send(req.user);
});

module.exports = router;
