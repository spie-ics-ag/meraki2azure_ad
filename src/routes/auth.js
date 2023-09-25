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

router.post('/openid/return', authProvider.handleRedirect());

router.get(
    '/signout',
    authProvider.logout({
        postLogoutRedirectUri,
    })
);

module.exports = router;
