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

const express = require('express');
const expressSession = require('express-session');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const createError = require('http-errors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const favicon = require('serve-favicon');
const path = require('path');
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const rateLimit = require('express-rate-limit');

// initialize express
const app = express();

/**
 * Using express-session middleware for persistent user session. Be sure to
 * familiarize yourself with available options. Visit: https://www.npmjs.com/package/express-session
 */
app.use(
    expressSession({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: app.get('env') === 'production', // set this to true on production
            sameSite: false,
            maxAge: 60000, // expires after 1 min
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
console.log(
    `public path:  ${path.join(
        __dirname,
        process.env.PUBLIC_DIR_PATH || 'public'
    )}`
);
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(helmet());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('tiny'));

// Rate limiter middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP/user to 100 requests per windowMs
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    skipSuccessfulRequests: true, // Do not count successful requests
    handler: function (req, res, next) {
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
    // set locals, only providing error in development
    res.locals.message = 'Unhandled Exception';
    res.locals.error = req.app.get('env') === 'development' ? err.message : {};
    res.locals.status = err.status || 500;

    // render the error page
    res.status(res.locals.status);
    res.render('error');
});

console.log('Meraki captive portal for AZURE AD started');
module.exports = app;
