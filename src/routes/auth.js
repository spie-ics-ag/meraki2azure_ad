/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

var express = require('express');

const authProvider = require('../auth/authProvider');
const { redirectUri, postLogoutRedirectUri } = require('../authConfig');

const router = express.Router();

router.get(
    '/signin',
    authProvider.login({
        scopes: [],
        redirectUri,
    })
);

router.post(
    '/openid/return',
    express.urlencoded({ extended: false, limit: '10kb' }), // body size limit to prevent large payload attacks
    authProvider.handleRedirect()
);

router.get(
    '/signout',
    authProvider.logout({
        postLogoutRedirectUri,
    })
);

module.exports = router;
