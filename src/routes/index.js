/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

const express = require('express');
const router = express.Router();
const url = require('url');

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
        isDevelopment: process.env.NODE_ENV === 'development',
        ssid: process.env.SSID || 'WiFi',
    });
});

module.exports = router;
