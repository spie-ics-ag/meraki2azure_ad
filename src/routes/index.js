/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

const express = require('express');
const router = express.Router();
const url = require('url');
const rateLimit = require("express-rate-limit");

// Rate limiter middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 250, // limit each IP/user to 500 requests per windowMs
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    skipSuccessfulRequests: true, // Do not count successful requests
    handler: function (req, res, next) {        
        res.locals.message = "Rate limit exceeded";
        res.locals.error = "Too many requests, please try again later.";
        res.locals.status = 429;
        // render the error page
        res.status(res.locals.status);
        res.render('error');
    },
});

router.use(limiter);

// eslint-disable-next-line no-unused-vars
router.get('/', function (req, res, _next) {
    const url_parts = url.parse(req.url, true);
    const query = url_parts.query;
    const title =
        process.env.PORTAL_TITLE ||
        'Meraki Captive Portal for Azure Active Directory';

    res.render('index', {
        title,
        isAuthenticated: req.session.isAuthenticated,
        username: req.session.account?.username,
        base_grant_url: query.base_grant_url,
        user_continue_url: query.user_continue_url || process.env.REDIRECT_URL,
        isDevelopment: process.env.NODE_ENV === 'development',
        ssid: process.env.SSID || 'WiFi',
    });
});

module.exports = router;
