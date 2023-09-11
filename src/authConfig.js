/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

require('dotenv').config({ path: '.env.dev' });

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL Node configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/configuration.md
 */
const msalConfig = {
    auth: {
        clientId: process.env.AZ_CLIENT_ID, // 'Application (client) ID' of app registration in Azure portal - this value is a GUID
        authority: process.env.CLOUD_INSTANCE || 'https://login.microsoftonline.com/' + process.env.AZ_TENANT_ID, // Full directory URL, in the form of https://login.microsoftonline.com/<tenant>
        clientSecret: process.env.AZ_CLIENT_SECRET, // Client secret generated from the app registration in Azure portal
    },
    system: {
        loggerOptions: {
            // eslint-disable-next-line no-unused-vars
            loggerCallback(_loglevel, message, _containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: 3,
        },
    },
};

const redirectUri = process.env.REDIRECT_URL + '/auth/openid/return';
const postLogoutRedirectUri = process.env.REDIRECT_URL;

module.exports = {
    msalConfig,
    redirectUri,
    postLogoutRedirectUri,
};
