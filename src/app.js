/**
* Copyright 2023 SPIE ICS AG
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), 
* to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
* and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
* INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
* IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
* WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

'use strict';

/******************************************************************************
 * Module dependencies.
 *****************************************************************************/
require('dotenv').config();

const express = require('express');
const logger = require('morgan');
const serveStatic = require('serve-static');
const path = require('path');
//const cookieParser = require('cookie-parser');
const expressSession = require('express-session');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const passport = require('passport');
const bunyan = require('bunyan');
const helmet = require('helmet')
const config = require('./config');


const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;

const log = bunyan.createLogger({
  name: 'Meraki Azure AD Integration'
});

/******************************************************************************
 * Set up passport in the app
 ******************************************************************************/

//-----------------------------------------------------------------------------
// To support persistent login sessions, Passport needs to be able to
// serialize users into and deserialize users out of the session.  Typically,
// this will be as simple as storing the user ID when serializing, and finding
// the user by ID when deserializing.
//-----------------------------------------------------------------------------
passport.serializeUser(function (user, done) {
  done(null, user.oid);
});

passport.deserializeUser(function (oid, done) {
  findByOid(oid, function (err, user) {
    done(err, user);
  });
});

// array to hold logged in users
const users = [];

let base_grant_url = null
const user_continue_url = '/'
const failure_redirect_url = '/'

const findByOid = function (oid, fn) {
  for (var i = 0, len = users.length; i < len; i++) {
    var user = users[i];
    log.info('we are using user: ', user);
    if (user.oid === oid) {
      return fn(null, user);
    }
  }
  return fn(null, null);
};

//-----------------------------------------------------------------------------
// Use the OIDCStrategy within Passport.
//
// Strategies in passport require a `verify` function, which accepts credentials
// (in this case, the `oid` claim in id_token), and invoke a callback to find
// the corresponding user object.
//
// The following are the accepted prototypes for the `verify` function
// (1) function(iss, sub, done)
// (2) function(iss, sub, profile, done)
// (3) function(iss, sub, profile, access_token, refresh_token, done)
// (4) function(iss, sub, profile, access_token, refresh_token, params, done)
// (5) function(iss, sub, profile, jwtClaims, access_token, refresh_token, params, done)
// (6) prototype (1)-(5) with an additional `req` parameter as the first parameter
//
// To do prototype (6), passReqToCallback must be set to true in the config.
//-----------------------------------------------------------------------------
passport.use(new OIDCStrategy({
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
  function (iss, sub, profile, accessToken, refreshToken, done) {
    if (!profile.oid) {
      return done(new Error("No oid found"), null);
    }
    // asynchronous verification, for effect...
    process.nextTick(function () {
      findByOid(profile.oid, function (err, user) {
        if (err) {
          return done(err);
        }
        if (!user) {
          // "Auto-registration"
          users.push(profile);
          return done(null, profile);
        }
        return done(null, user);
      });
    });
  }
));

//-----------------------------------------------------------------------------
// Config the app, include middleware
//-----------------------------------------------------------------------------
const app = express();

app.set('views', path.join(__dirname + '/views'));
app.set('view engine', 'ejs');
// set up session middleware
app.use(helmet());
app.use(logger('combined'));
app.use(methodOverride());
//app.use(cookieParser());
app.use(expressSession(
  {
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: false,
    cookie: {
      // Session expires after 1 min of inactivity.
      expires: 60000
    }
  }
));
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());

app.use(serveStatic(path.join(__dirname, process.env.PUBLIC_DIR_PATH || 'public')));

log.debug(`public path:  ${path.join(__dirname, process.env.PUBLIC_DIR_PATH || 'public')}`);

app.use(logErrors)
app.use(clientErrorHandler)
app.use(errorHandler)

app.disable('x-powered-by');

const target_mode = app.get('env') === 'development' ? 'development' : 'prod';

log.info("Azure Identity: " + config.creds.identityMetadata)
log.info("Azure Client ID: " + config.creds.clientID);
//log.debug("Azure Client Secret: " + config.creds.clientSecret);
log.info("Redirect URL: " + config.creds.redirectUrl);
log.info("Destroy URL: " + config.destroySessionUrl);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
};


function logErrors(err, req, res, next) {
  log.error(err.stack)
  next(err)
}

function errorHandler(err, req, res, next) {
  res.status(500)
  res.render('error', { error: err })
}

function clientErrorHandler(err, req, res, next) {
  //check if it is an X-Requested-With request
  if (req.xhr) {
    res.status(500).send({ error: 'Something failed!' })
  } else {
    next(err)
  }
}
//-----------------------------------------------------------------------------
// Set up the route controller
//
// 1. For 'login' route and 'returnURL' route, use `passport.authenticate`.
// This way the passport middleware can redirect the user to login page, receive
// id_token etc from returnURL.
//
// 2. For the routes you want to check if user is already logged in, use
// `ensureAuthenticated`. It checks if there is an user stored in session, if not
// it will call `passport.authenticate` to ask for user to log in.
//-----------------------------------------------------------------------------
app.get('/', function (req, res) {
  //log.debug(req)
  var url = require('url');
  var url_parts = url.parse(req.url, true);
  var query = url_parts.query;

  base_grant_url = query.base_grant_url;
  res.render('index', { user: req.user, base_grant_url, title: 'Meraki Captive Portal for Azure Active Directory' });
});

// 'GET login'
app.get('/login',
  function (req, res, next) {
    if (!base_grant_url) {
      var url = require('url');
      var url_parts = url.parse(req.url, true);
      var query = url_parts.query;
      base_grant_url = query.base_grant_url;
    }

    passport.authenticate('azuread-openidconnect',
      {
        response: res,                      // required
        resourceURL: config.resourceURL,    // optional. Provide a value if you want to specify the resource.
        customState: 'my_state',            // optional. Provide a value if you want to provide custom state value.
        failureRedirect: failure_redirect_url
      }
    )(req, res, next);
  },
  function (req, res) {
    res.redirect(user_continue_url);
  });

// 'GET returnURL'
// `passport.authenticate` will try to authenticate the content returned in
// query (such as authorization code). If authentication fails, user will be
// redirected to '/' (home page); otherwise, it passes to the next middleware.
app.get('/auth/openid/return',
  function (req, res, next) {
    passport.authenticate('azuread-openidconnect',
      {
        response: res,                      // required
        failureRedirect: failure_redirect_url
      }
    )(req, res, next);
  },
  function (req, res) {
    log.info('We received a return from AzureAD.');
    res.redirect(user_continue_url);
  });

// 'POST returnURL'
// `passport.authenticate` will try to authenticate the content returned in
// body (such as authorization code). If authentication fails, user will be
// redirected to '/' (home page); otherwise, it passes to the next middleware.
app.post('/auth/openid/return',
  function (req, res, next) {
    passport.authenticate('azuread-openidconnect',
      {
        response: res,                      // required
        failureRedirect: failure_redirect_url
      }
    )(req, res, next);
  },
  function (req, res) {
    res.redirect(base_grant_url);
  });
/*
// 'logout' route, logout from passport, and destroy the session with AAD.
app.get('/logout', function (req, res, next) {
  req.logout(function (err) {
    req.session.destroy(function (err) {
      if (err) { return next(err); }
      res.redirect(config.destroySessionUrl);
    });
  });
});

*/
const port = process.env.PORT || 3000;

//start server forever
app.listen(port, function (error) {
  if (error)
    log.error("An unhandled error occurred", error);
  else
    log.warn(`Meraki Azure AD Integration service is started on port ${port} in ${target_mode} mode!`);
});