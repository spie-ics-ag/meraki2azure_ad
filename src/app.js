/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
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

require('dotenv').config();

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required');
}

const express = require('express');
const expressSession = require('express-session');
const helmet = require('helmet');
const createError = require('http-errors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const favicon = require('serve-favicon');
const path = require('path');
const rateLimit = require('express-rate-limit');
const FileStore = require('session-file-store')(expressSession);
const fs = require('fs');
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');

const app = express();

app.use(helmet());
app.use(morgan('tiny'));

// Trust proxy in production (required if behind nginx/load balancer)
if (process.env.NODE_ENV === 'production') {
    // Trust first proxy to get correct protocol for secure cookies
    app.set('trust proxy', 1);
}

const SESSION_TTL = parseInt(process.env.SESSION_TTL) || 900; // 15 minutes default
const SESSION_REAP_INTERVAL = SESSION_TTL * 4; // clean up every 4x TTL (1 hour default)

const sessionDir =
    process.env.NODE_ENV === 'production'
        ? '/home/sessions'
        : path.join(__dirname, '.sessions');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

app.use(
    expressSession({
        store: new FileStore({
            path: sessionDir,
            ttl: SESSION_TTL,
            retries: 1,
            reapInterval: SESSION_REAP_INTERVAL, // clean up every 4x TTL
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: SESSION_TTL * 1000, // convert to ms for cookie
        },
    })
);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// set up middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(
    express.static(
        path.join(__dirname, process.env.PUBLIC_DIR_PATH || 'public')
    )
);
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
// Rate limiter middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP/user to 100 requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    skipSuccessfulRequests: true, // Do not count successful requests
    handler: function (req, res) {
        res.locals.message = 'Rate limit exceeded';
        res.locals.error = 'Too many requests, please try again later.';
        res.locals.status = 429;
        // render the error page
        res.status(res.locals.status);
        res.render('error');
    },
});

app.use(limiter);

// define routes
app.use('/', indexRouter);
app.use('/auth', authRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
// eslint-disable-next-line no-unused-vars
app.use(function (err, req, res, _next) {
    res.locals.message = 'Unhandled Exception';
    res.locals.error = req.app.get('env') === 'development' ? err.message : {};
    res.locals.status = err.status || 500;
    // render the error page
    res.status(res.locals.status);
    res.render('error');
});

console.log('Meraki captive portal for AZURE AD started');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`Session store path: ${sessionDir}`);
console.log(`Session TTL: ${SESSION_TTL}s`);
module.exports = app;
