/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

const express = require('express');
const router = express.Router();

router.get('/', function (req, res, _next) {
    const { base_grant_url, user_continue_url } = req.query;
    const title =
        process.env.PORTAL_TITLE ||
        'Meraki Captive Portal for Azure Active Directory';

    res.render('index', {
        title,
        isAuthenticated: req.session.isAuthenticated,
        username: req.session.account?.username,
        base_grant_url,
        user_continue_url: user_continue_url || process.env.REDIRECT_URL,
        isDevelopment: process.env.NODE_ENV === 'development',
        ssid: process.env.SSID || 'WiFi',
    });
});

module.exports = router;
