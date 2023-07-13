'use strict';

var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var passport = require('passport');
var util = require('util');
var bunyan = require('bunyan');
var config = require('./config');

// set up database for express session
//var MongoStore = require('connect-mongo')(session);
//var mongoose = require('mongoose');

// Start QuickStart here

var OIDCStrategy = require('passport-azure-ad').OIDCStrategy;

var log = bunyan.createLogger({
  name: 'Meraki Azure AD Integration'
});

// Set up passport in the app

passport.serializeUser(function(user, done) {
  done(null, user.oid);
});

passport.deserializeUser(function(oid, done) {
  findByOid(oid, function(err, user) {
    done(err, user);
  });
});

var users = [];

var base_grant_url = '';
var user_continue_url = '';

var findByOid = function(oid, fn) {
  for (var i = 0, len = users.length; i < len; i++) {
    var user = users[i];
    log.info('we are using user: ', user);
    if (user.oid === oid) {
      return fn(null, user);
    }
  }
  return fn(null, null);
};

passport.use(
  new OIDCStrategy(
    {
      identityMetadata: config.creds.identityMetadata,
      clientID: config.creds.clientID,
      responseType: config.creds.responseType,
      responseMode: config.creds.responseMode,
      redirectUrl: config.creds.redirectUrl,
      allowHttpForRedirectUrl: config.creds.allowHttpForRedirectUrl,
      clientSecret: config.creds.clientSecret,
      validateIssuer: config.creds.validateIssuer,
      isB2C: config.creds.isB2C,
      issuer: config.creds.issuer,
      passReqToCallback: config.creds.passReqToCallback,
      scope: config.creds.scope,
      loggingLevel: config.creds.loggingLevel,
      nonceLifetime: config.creds.nonceLifetime,
      nonceMaxAmount: config.creds.nonceMaxAmount,
      useCookieInsteadOfSession: config.creds.useCookieInsteadOfSession,
      cookieEncryptionKeys: config.creds.cookieEncryptionKeys,
      clockSkew: config.creds.clockSkew
    },
    function(iss, sub, profile, accessToken, refreshToken, done) {
      if (!profile.oid) {
        return done(new Error('No oid found'), null);
      }
      process.nextTick(function() {
        findByOid(profile.oid, function(err, user) {
          if (err) {
            return done(err);
          }
          if (!user) {
            users.push(profile);
            return done(null, profile);
          }
          return done(null, user);
        });
      });
    }
  )
);

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.logger());
app.use(methodOverride());
app.use(cookieParser());

app.use(
  session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: false
  })
);

app.use(bodyParser.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/../../public'));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

app.get('/', function(req, res) {
  var url = require('url');
  var url_parts = url.parse(req.url, true);
  var query = url_parts.query;

  base_grant_url = query.base_grant_url;
  res.render('index', { user: req.user });
});

app.get('/account', ensureAuthenticated, function(req, res) {
  res.render('account', { user: req.user });
});

app.get(
  '/login',
  function(req, res, next) {
    var url = require('url');
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;

    base_grant_url = query.base_grant_url;

    passport.authenticate('azuread-openidconnect', {
      response: res,
      resourceURL: config.resourceURL,
      customState: 'my_state',
      failureRedirect: '/'
    })(req, res, next);
  },
  function(req, res) {
    res.redirect('/');
  }
);

app.get(
  '/auth/openid/return',
  function(req, res, next) {
    passport.authenticate('azuread-openidconnect', {
      response: res,
      failureRedirect: '/'
    })(req, res, next);
  },
  function(req, res) {
    log.info('We received a return from AzureAD.');
    res.redirect('/');
  }
);

app.post(
  '/auth/openid/return',
  function(req, res, next) {
    passport.authenticate('azuread-openidconnect', {
      response: res,
      failureRedirect: '/'
    })(req, res, next);
  },
  function(req, res) {
    res.redirect(base_grant_url);
  }
);

app.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    req.logOut();
    res.redirect(config.destroySessionUrl);
  });
});

var port_number = app.listen(process.env.PORT || 3000);
app.listen(port_number);